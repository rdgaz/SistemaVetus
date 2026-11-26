using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Revisão do mentor (etapa 2 da mentoria). O mentorado envia o laudo a um mentor com mentoria aceita; enquanto a revisão
/// está pendente, o laudo não muda. O mentor revisa texto, comentários por órgão e o órgão de cada foto, e conclui
/// ("confirmado" ou "sugestões"). O mentor só enxerga o exame pela revisão: nunca os dados do responsável nem da clínica.
/// </summary>
public static class RevisaoMentorEndpoints
{
    public record EnviarReq(Guid MentorId, string? Mensagem);
    public record SalvarRevisaoReq(JsonElement? Conteudo, Dictionary<string, string>? Comentarios, Dictionary<string, string>? Rotulos, string? Parecer);
    public record ConcluirReq(JsonElement? Conteudo, Dictionary<string, string>? Comentarios, Dictionary<string, string>? Rotulos, string? Parecer, bool Confirmar);

    public static void Mapear(WebApplication app)
    {
        // ---------- lado do mentorado (dentro da clínica)
        var ex = app.MapGroup("/api/exames/{id:guid}/revisao-mentor");

        // mentores disponíveis para este exame e as revisões dele
        ex.MapGet("", async (Guid id, HttpContext http, VetusDb db) =>
        {
            var v = http.VinculoAtual();
            var e = await db.Exames.FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var mentores = await db.Mentorias.Where(m => m.MentoradoId == v.UsuarioId && m.Situacao == Mentoria.Aceita
                    && db.PerfisMentor.Any(p => p.UsuarioId == m.MentorId && p.Ativo))
                .OrderBy(m => m.Mentor.Nome).Select(m => new { id = m.MentorId, m.Mentor.Nome }).ToListAsync();
            var revisoes = await db.RevisoesMentor.Where(r => r.ExameId == id).OrderByDescending(r => r.EnviadaEm)
                .Select(r => new
                {
                    r.Id, r.Situacao, r.Resultado, r.ParaEnsino, r.LaudoVersao, r.Mensagem, r.Parecer, r.EnviadaEm, r.IniciadaEm, r.ConcluidaEm,
                    r.CanceladaEm, mentor = r.Mentor.Nome, mentorCrmv = r.Mentor.Crmv, mentorCrmvUf = r.Mentor.CrmvUf, mentorado = r.Mentorado.Nome,
                    comentarios = r.Comentarios,
                })
                .ToListAsync();
            return Results.Ok(new
            {
                mentores,
                revisoes = revisoes.Select(r => new
                {
                    r.Id, r.Situacao, r.Resultado, r.ParaEnsino, r.LaudoVersao, r.Mensagem, r.Parecer, r.EnviadaEm, r.IniciadaEm, r.ConcluidaEm,
                    r.CanceladaEm, r.mentor, mentorCrmv = r.mentorCrmv is null ? null : $"CRMV-{r.mentorCrmvUf?.ToUpperInvariant()} {r.mentorCrmv}",
                    r.mentorado, comentarios = JsonSerializer.Deserialize<Dictionary<string, string>>(r.comentarios),
                }),
            });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        ex.MapPost("", async (Guid id, EnviarReq r, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var v = http.VinculoAtual();
            var eu = (await Acesso.UsuarioAtual(http, db))!;
            var e = await db.Exames.Include(x => x.Paciente).FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status is not (StatusExame.AguardandoRevisao or StatusExame.Pronto))
                return Erros.Conflito("Só dá para enviar ao mentor um laudo em revisão ou já assinado.");
            var mentoria = await db.Mentorias.Include(m => m.Mentor)
                .FirstOrDefaultAsync(m => m.MentoradoId == eu.Id && m.MentorId == r.MentorId && m.Situacao == Mentoria.Aceita);
            var perfil = await db.PerfisMentor.FirstOrDefaultAsync(p => p.UsuarioId == r.MentorId && p.Ativo);
            if (mentoria is null || perfil is null) return Erros.Invalido("Escolha um mentor com mentoria aceita.");
            if (await db.RevisoesMentor.AnyAsync(x => x.ExameId == id && x.Situacao == RevisaoMentor.Pendente))
                return Erros.Conflito("Este laudo já está com um mentor.");
            var abertas = await db.RevisoesMentor.CountAsync(x => x.MentorId == r.MentorId && x.Situacao == RevisaoMentor.Pendente);
            if (abertas >= perfil.LimitePedidos)
                return Erros.Invalido($"{mentoria.Mentor.Nome} está com o limite de revisões em aberto. Tente mais tarde ou escolha outro mentor.");
            // versão em revisão ou, se assinado, a última assinada (revisão para ensino)
            var l = await db.Laudos.Where(x => x.ExameId == id).OrderByDescending(x => x.Versao).FirstOrDefaultAsync();
            if (l is null) return Erros.Conflito("Ainda não há laudo para revisar.");

            var rev = new RevisaoMentor
            {
                ExameId = e.Id, ClinicaId = e.ClinicaId, LaudoId = l.Id, LaudoVersao = l.Versao, MentorId = r.MentorId, MentoradoId = eu.Id,
                ParaEnsino = e.Status == StatusExame.Pronto, Mensagem = Limite(r.Mensagem, 1000), ConteudoEnviado = l.ConteudoRevisado ?? l.ConteudoIa,
            };
            db.RevisoesMentor.Add(rev);
            var texto = $"{eu.Nome} enviou um laudo para você revisar ({Descricao(e)})." + (rev.ParaEnsino ? " O laudo já está assinado: a revisão é para ensino." : "")
                + (rev.Mensagem is null ? "" : $" Mensagem: \"{rev.Mensagem}\"");
            avisos.Adicionar(r.MentorId, "revisao_pedida", "Novo laudo para revisar", texto, $"/mentoria/revisoes/{rev.Id}");
            if (perfil.NotificarEmail) avisos.EnviarEmail(mentoria.Mentor.Email, "AutoLaudoVet: novo laudo para revisar", texto, $"/mentoria/revisoes/{rev.Id}");
            await registros.Adicionar(http, "revisao_mentor_enviada", $"Laudo enviado para a revisão de {mentoria.Mentor.Nome}" + (rev.ParaEnsino ? " (para ensino)" : ""),
                e.Id, e.Paciente.Nome);
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Created($"/api/revisoes-mentor/{rev.Id}", new { rev.Id, rev.Situacao, rev.ParaEnsino });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // ---------- revisões (mentor e mentorado)
        var g = app.MapGroup("/api/revisoes-mentor").RequireAuthorization();

        // o mentorado desiste antes de o mentor começar
        g.MapPost("/{rid:guid}/cancelar", async (Guid rid, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var r = await db.RevisoesMentor.Include(x => x.Mentorado).Include(x => x.Exame).ThenInclude(e => e.Paciente)
                .FirstOrDefaultAsync(x => x.Id == rid && x.MentoradoId == eu);
            if (r is null) return Erros.NaoEncontrado("Revisão não encontrada.");
            if (r.Situacao != RevisaoMentor.Pendente) return Erros.Conflito("Esta revisão não está mais pendente.");
            if (r.IniciadaEm is not null) return Erros.Conflito("O mentor já começou a revisar: não dá mais para cancelar.");
            r.Situacao = RevisaoMentor.Cancelada; r.CanceladaEm = DateTime.UtcNow;
            avisos.Adicionar(r.MentorId, "revisao_cancelada", "Pedido de revisão cancelado", $"{r.Mentorado.Nome} cancelou o pedido de revisão ({Descricao(r.Exame)}).", "/mentoria/revisoes");
            await registros.Adicionar(http, "revisao_mentor_cancelada", "Pedido de revisão ao mentor cancelado", r.ExameId, r.Exame.Paciente.Nome,
                clinicaId: r.ClinicaId, clinicaNome: await db.Clinicas.Where(c => c.Id == r.ClinicaId).Select(c => c.Nome).FirstAsync());
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // lista do mentor ("Pedidos de revisão")
        g.MapGet("", async (string? situacao, HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var q = db.RevisoesMentor.Where(r => r.MentorId == eu && r.Situacao != RevisaoMentor.Cancelada);
            if (situacao is RevisaoMentor.Pendente or RevisaoMentor.Concluida) q = q.Where(r => r.Situacao == situacao);
            var lista = await q.OrderBy(r => r.Situacao == RevisaoMentor.Pendente ? 0 : 1).ThenByDescending(r => r.EnviadaEm).Take(300)
                .Select(r => new
                {
                    r.Id, r.Situacao, r.Resultado, r.ParaEnsino, r.Mensagem, r.EnviadaEm, r.IniciadaEm, r.ConcluidaEm,
                    mentorado = r.Mentorado.Nome, paciente = r.Exame.Paciente.Nome, especie = r.Exame.Paciente.Especie, raca = r.Exame.Paciente.Raca,
                    tipoExame = r.Exame.TipoExame, dataExame = r.Exame.Data,
                })
                .ToListAsync();
            var contagens = await db.RevisoesMentor.Where(r => r.MentorId == eu && r.Situacao != RevisaoMentor.Cancelada)
                .GroupBy(r => r.Situacao).Select(x => new { x.Key, n = x.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
            return Results.Ok(new { revisoes = lista, contagens });
        });

        // tudo o que o mentor precisa para revisar (sem dados do responsável nem da clínica)
        g.MapGet("/{rid:guid}", async (Guid rid, HttpContext http, VetusDb db, Arquivos arq, Referencias referencias) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var r = await db.RevisoesMentor.Include(x => x.Mentorado).Include(x => x.Exame).ThenInclude(e => e.Paciente)
                .FirstOrDefaultAsync(x => x.Id == rid && (x.MentorId == eu || x.MentoradoId == eu));
            if (r is null) return Erros.NaoEncontrado("Revisão não encontrada.");
            var e = r.Exame;
            var l = await db.Laudos.FirstAsync(x => x.Id == r.LaudoId);
            var pesoKg = Referencias.PesoKg(e.Peso);
            var refs = await referencias.Aplicaveis(e.Paciente.Especie, pesoKg);
            var medidasAparelho = arq.LerJson(e, "medidas.json") is { } json ? JsonSerializer.Deserialize<JsonElement>(json) : (JsonElement?)null;
            var anotacoes = await db.AnotacoesImagem.Where(a => a.ExameId == e.Id).ToListAsync();
            var medidas = DesenhoAnotacao.MesclarMedidas(medidasAparelho, anotacoes);
            return Results.Ok(new
            {
                r.Id, r.Situacao, r.Resultado, r.ParaEnsino, r.Mensagem, r.Parecer, r.EnviadaEm, r.IniciadaEm, r.ConcluidaEm, r.LaudoVersao,
                souMentor = r.MentorId == eu,
                // só o mentorado abre o exame (o mentor não tem acesso à clínica)
                exameId = r.MentoradoId == eu ? r.ExameId : (Guid?)null,
                mentorado = r.Mentorado.Nome,
                conteudoEnviado = JsonSerializer.Deserialize<JsonElement>(r.ConteudoEnviado),
                conteudoMentor = r.ConteudoMentor is null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(r.ConteudoMentor),
                comentarios = JsonSerializer.Deserialize<Dictionary<string, string>>(r.Comentarios),
                rotulos = JsonSerializer.Deserialize<Dictionary<string, string>>(r.Rotulos),
                imagensEnviadas = JsonSerializer.Deserialize<string[]>(l.ImagensEnviadas),
                exame = new
                {
                    e.TipoExame, e.Data, e.Idade, e.Peso, e.SuspeitaClinica, e.Historico, e.Jejum, e.InformacoesAdicionais, e.Equipamento,
                    paciente = new { e.Paciente.Nome, e.Paciente.Especie, e.Paciente.Raca, e.Paciente.Sexo, e.Paciente.Castrado },
                },
                orgaos = ModeloLaudo.OrgaosAbdominal(e.Paciente.Sexo),
                mascaras = ModeloLaudo.Normalidade,
                medidasComparadas = Referencias.Comparar(medidas, refs),
                fotos = arq.Listar(e, Arquivos.Jpg).Select(n => new { nome = n, url = $"/api/revisoes-mentor/{r.Id}/fotos/{Uri.EscapeDataString(n)}" }),
            });
        });

        // fotos do exame pela revisão (o mentor não tem vínculo com a clínica)
        g.MapGet("/{rid:guid}/fotos/{nome}", async (Guid rid, string nome, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var r = await db.RevisoesMentor.Include(x => x.Exame).FirstOrDefaultAsync(x => x.Id == rid && (x.MentorId == eu || x.MentoradoId == eu));
            if (r is null) return Results.NotFound();
            var f = arq.Arquivo(r.Exame, Arquivos.Jpg, nome);
            if (f is null) return Results.NotFound();
            new FileExtensionContentTypeProvider().TryGetContentType(f, out var tipo);
            http.Response.Headers.CacheControl = "private, max-age=86400";
            return Results.File(f, tipo ?? "image/jpeg");
        });

        // rascunho do mentor
        g.MapPut("/{rid:guid}", async (Guid rid, SalvarRevisaoReq q, HttpContext http, VetusDb db) =>
        {
            var (r, erro) = await DoMentorPendente(rid, http, db);
            if (erro is not null) return erro;
            if (Aplicar(r!, q.Conteudo, q.Comentarios, q.Rotulos, q.Parecer) is { } msg) return Erros.Invalido(msg);
            r!.IniciadaEm ??= DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        g.MapPost("/{rid:guid}/concluir", async (Guid rid, ConcluirReq q, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var (r, erro) = await DoMentorPendente(rid, http, db);
            if (erro is not null) return erro;
            if (q.Confirmar)
            {
                // "Confirmar sem alterações": o texto do mentor é o enviado; comentários e parecer continuam valendo
                r!.ConteudoMentor = r.ConteudoEnviado;
                if (Aplicar(r, null, q.Comentarios, q.Rotulos, q.Parecer) is { } m1) return Erros.Invalido(m1);
            }
            else if (Aplicar(r!, q.Conteudo, q.Comentarios, q.Rotulos, q.Parecer) is { } m2) return Erros.Invalido(m2);
            r!.ConteudoMentor ??= r.ConteudoEnviado;
            r.Resultado = Igual(r.ConteudoEnviado, r.ConteudoMentor) ? RevisaoMentor.Confirmado : RevisaoMentor.Sugestoes;
            r.Situacao = RevisaoMentor.Concluida;
            r.IniciadaEm ??= DateTime.UtcNow;
            r.ConcluidaEm = DateTime.UtcNow;
            r.Exame.AtualizadoEm = DateTime.UtcNow;

            var confirmado = r.Resultado == RevisaoMentor.Confirmado;
            var titulo = confirmado ? $"Laudo confirmado pelo mentor {r.Mentor.Nome}" : $"Laudo revisado pelo mentor {r.Mentor.Nome}, com sugestões";
            var texto = $"{Descricao(r.Exame)}." + (confirmado ? " O mentor não sugeriu alterações." : " Veja as sugestões e escolha o que usar.")
                + (r.Parecer is null ? "" : $" Parecer: \"{r.Parecer}\"");
            avisos.Adicionar(r.MentoradoId, confirmado ? "revisao_confirmada" : "revisao_sugestoes", titulo, texto, $"/exames/{r.ExameId}");
            await registros.Adicionar(http, "revisao_mentor_concluida", $"{r.Mentor.Nome} concluiu a revisão: {(confirmado ? "laudo confirmado" : "revisado com sugestões")}",
                r.ExameId, r.Exame.Paciente.Nome, clinicaId: r.ClinicaId,
                clinicaNome: await db.Clinicas.Where(c => c.Id == r.ClinicaId).Select(c => c.Nome).FirstAsync());
            await db.SaveChangesAsync();
            return Results.Ok(new { r.Resultado });
        });
    }

    private static async Task<(RevisaoMentor? r, IResult? erro)> DoMentorPendente(Guid rid, HttpContext http, VetusDb db)
    {
        var eu = Acesso.UsuarioId(http.User);
        var r = await db.RevisoesMentor.Include(x => x.Mentor).Include(x => x.Exame).ThenInclude(e => e.Paciente)
            .FirstOrDefaultAsync(x => x.Id == rid && x.MentorId == eu);
        if (r is null) return (null, Erros.NaoEncontrado("Revisão não encontrada."));
        if (r.Situacao != RevisaoMentor.Pendente) return (r, Erros.Conflito("Esta revisão já foi concluída ou cancelada."));
        if (!await db.PerfisMentor.AnyAsync(p => p.UsuarioId == eu && p.Ativo))
            return (r, Results.Json(new { erro = "Você não é mais mentor." }, statusCode: 403));
        return (r, null);
    }

    /// <summary>Grava no pedido o que veio da tela do mentor; devolve a mensagem de erro, se houver.</summary>
    private static string? Aplicar(RevisaoMentor r, JsonElement? conteudo, Dictionary<string, string>? comentarios,
        Dictionary<string, string>? rotulos, string? parecer)
    {
        if (conteudo is { ValueKind: JsonValueKind.Object } c)
        {
            if (!c.TryGetProperty("orgaos", out var o) || o.ValueKind != JsonValueKind.Array) return "O laudo precisa da lista de órgãos.";
            foreach (var item in o.EnumerateArray())
                if ((item.TryGetProperty("situacao", out var s) ? s.GetString() : null) is not (ModeloLaudo.Normal or ModeloLaudo.Alterado or ModeloLaudo.NaoVisualizado))
                    return "Situação de órgão inválida.";
            r.ConteudoMentor = c.GetRawText();
        }
        if (comentarios is not null)
            r.Comentarios = JsonSerializer.Serialize(comentarios.Where(x => !string.IsNullOrWhiteSpace(x.Value))
                .ToDictionary(x => x.Key, x => Limite(x.Value, 2000)!));
        if (rotulos is not null)
            r.Rotulos = JsonSerializer.Serialize(rotulos.Where(x => !string.IsNullOrWhiteSpace(x.Value)).ToDictionary(x => x.Key, x => x.Value.Trim()));
        if (parecer is not null) r.Parecer = Limite(parecer, 4000);
        return null;
    }

    /// <summary>Mesmo laudo? Compara só o que o veterinário escreve (texto, situação, listas), ignorando formatação do JSON.</summary>
    private static bool Igual(string a, string b)
    {
        static JsonNode? Essencial(string s)
        {
            var n = JsonNode.Parse(s) as JsonObject;
            if (n is null) return null;
            var o = new JsonObject();
            foreach (var k in new[] { "condicoesTecnicas", "impressaoDiagnostica", "diferenciais", "recomendacoes", "exibirDiferenciais" })
                o[k] = n[k]?.DeepClone();
            o["orgaos"] = new JsonArray((n["orgaos"] as JsonArray ?? []).Select(x => (JsonNode?)new JsonObject
            {
                ["orgao"] = x?["orgao"]?.DeepClone(), ["situacao"] = x?["situacao"]?.DeepClone(),
                ["descricao"] = (x?["descricao"]?.GetValue<string>() ?? "").Trim(),
            }).ToArray());
            return o;
        }
        return JsonNode.DeepEquals(Essencial(a), Essencial(b));
    }

    private static string Descricao(Exame e) =>
        string.Join(", ", new[] { e.Paciente.Nome, e.Paciente.Especie, TiposExame.Todos.GetValueOrDefault(e.TipoExame ?? "") }.Where(x => !string.IsNullOrWhiteSpace(x)));

    private static string? Limite(string? s, int max)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : t.Length > max ? t[..max] : t;
    }
}

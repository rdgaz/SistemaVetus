using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>Revisão, assinatura, retificação, PDF e verificação pública do laudo.</summary>
public static class LaudoEndpoints
{
    public record RevisaoReq(JsonElement Conteudo);
    public record AssinarReq(JsonElement? Conteudo);
    public record DiscordarReq(string? Motivo, string? Comentario);
    public record PadronizarReq(string? Orgao, string? Texto, string? DescricaoAtual);
    public record AceitarDitadoReq(string? TextoFinal);
    private static readonly string[] MotivosDiscordancia = ["falso_alarme", "achado_diferente", "imagens_insuficientes"];
    public record RetificarReq(string? Motivo);

    public const string LimitePublico = "publico";

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames/{id:guid}/laudo");

        // Salva a revisão (rascunho) do veterinário sobre o pré-laudo
        g.MapPut("", async (Guid id, RevisaoReq r, HttpContext http, VetusDb db) =>
        {
            var (e, l, erro) = await LaudoEmRevisao(id, http, db);
            if (erro is not null) return erro;
            if (ValidarConteudo(r.Conteudo) is { } msg) return Erros.Invalido(msg);
            l!.ConteudoRevisado = r.Conteudo.GetRawText();
            e!.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // O veterinário discorda do alerta de achado urgente da IA: o alerta sai do laudo e a discordância fica guardada
        // (com o que a IA disse e a leitura correta) para melhorar a IA.
        g.MapPost("/alerta/discordar", async (Guid id, DiscordarReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var (e, l, erro) = await LaudoEmRevisao(id, http, db);
            if (erro is not null) return erro;
            if (r.Motivo is null || !MotivosDiscordancia.Contains(r.Motivo)) return Erros.Invalido("Escolha o motivo da discordância.");
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();

            var no = System.Text.Json.Nodes.JsonNode.Parse(l!.ConteudoRevisado ?? l.ConteudoIa) as System.Text.Json.Nodes.JsonObject;
            if (no is null || no["achadoUrgente"]?.GetValue<bool>() != true) return Erros.Conflito("Este laudo não tem alerta de achado urgente.");

            var enviadas = JsonSerializer.Deserialize<List<string>>(l.ImagensEnviadas) ?? [];
            var numeros = (no["imagensUrgencia"] as System.Text.Json.Nodes.JsonArray)?.Select(x => x?.GetValue<int>() ?? 0).ToList() ?? [];
            if (numeros.Count == 0) numeros = (no["imagensSugeridas"] as System.Text.Json.Nodes.JsonArray)?.Select(x => x?.GetValue<int>() ?? 0).Take(6).ToList() ?? [];
            var fotos = numeros.Where(n => n >= 1 && n <= enviadas.Count).Select(n => enviadas[n - 1]).Distinct().ToList();

            var comentario = Texto.Opcional(r.Comentario);
            db.DiscordanciasAlerta.Add(new DiscordanciaAlerta
            {
                ClinicaId = e!.ClinicaId, ExameId = e.Id, LaudoId = l.Id, LaudoVersao = l.Versao,
                UsuarioId = u.Id, UsuarioNome = u.Nome, Motivo = r.Motivo,
                Comentario = comentario is { Length: > 2000 } ? comentario[..2000] : comentario,
                AlertaMotivo = no["motivoUrgencia"]?.GetValue<string>() ?? "",
                AlertaConfianca = no["confiancaUrgencia"]?.GetValue<string>(),
                AlertaEvidencia = no["evidenciaUrgencia"]?.GetValue<string>(),
                AlertaFotos = JsonSerializer.Serialize(fotos),
                Ia = l.Ia, Modelo = l.Modelo,
            });
            await registros.Adicionar(http, "alerta_discordado",
                $"Discordou do alerta da IA ({r.Motivo switch { "falso_alarme" => "falso alarme", "achado_diferente" => "achado diferente", _ => "imagens insuficientes" }}): {no["motivoUrgencia"]?.GetValue<string>()}",
                e!.Id, e.Paciente.Nome, new { comentario = Texto.Opcional(r.Comentario) });
            no["achadoUrgente"] = false;
            no["alertaDiscordado"] = true;
            l.ConteudoRevisado = no.ToJsonString();
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // Texto ditado pelo veterinário para um órgão: a IA o reescreve no padrão do laudo (como se ele mesmo tivesse digitado)
        g.MapPost("/padronizar", async (Guid id, PadronizarReq r, HttpContext http, VetusDb db, Padronizador pad, CancellationToken ct) =>
        {
            var (e, l, erro) = await LaudoEmRevisao(id, http, db);
            if (erro is not null) return erro;
            var relato = Texto.Opcional(r.Texto);
            if (relato is null) return Erros.Invalido("Fale ou escreva o que deseja registrar.");
            if (relato.Length > Padronizador.MaxTexto) return Erros.Invalido($"Texto grande demais (máximo {Padronizador.MaxTexto} caracteres).");
            if (Texto.Opcional(r.Orgao) is not { } orgao) return Erros.Invalido("Órgão não informado.");
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            var (ditado, msg, status) = await pad.Padronizar(e!, l!.Versao, orgao, relato, r.DescricaoAtual, u, ct);
            return msg is not null ? Results.Json(new { erro = msg }, statusCode: status) : Results.Ok(new { ditado.Id, texto = ditado.TextoPadronizado });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // o médico aceitou o texto padronizado (talvez editado): guarda o texto final junto do relato e do padronizado
        g.MapPost("/padronizar/{ditadoId:guid}/aceitar", async (Guid id, Guid ditadoId, AceitarDitadoReq r, HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var d = await db.DitadosOrgao.FirstOrDefaultAsync(x => x.Id == ditadoId && x.ExameId == id && x.ClinicaId == clinicaId);
            if (d is null) return Erros.NaoEncontrado("Ditado não encontrado.");
            var final = Texto.Opcional(r.TextoFinal);
            d.TextoFinal = final is { Length: > 4000 } ? final[..4000] : final;
            d.Aceito = true;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // Aprovar e assinar: só quem tem CRMV; depois disso o laudo não muda mais
        g.MapPost("/assinar", async (Guid id, AssinarReq? r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var (e, l, erro) = await LaudoEmRevisao(id, http, db);
            if (erro is not null) return erro;
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(u.Crmv) || string.IsNullOrWhiteSpace(u.CrmvUf))
                return Erros.Invalido("Para assinar, cadastre o seu CRMV e a UF em \"Minha conta\".");

            if (r?.Conteudo is { ValueKind: JsonValueKind.Object } c)
            {
                if (ValidarConteudo(c) is { } msg) return Erros.Invalido(msg);
                l!.ConteudoRevisado = c.GetRawText();
            }

            var falta = new List<string>();
            if (string.IsNullOrWhiteSpace(e!.Paciente.Nome)) falta.Add("nome do paciente");
            if (string.IsNullOrWhiteSpace(e.Paciente.Especie)) falta.Add("espécie");
            if (string.IsNullOrWhiteSpace(e.Paciente.Sexo)) falta.Add("sexo");
            if (string.IsNullOrWhiteSpace(e.Paciente.Tutor?.Nome)) falta.Add("responsável");
            if (!TiposExame.Valido(e.TipoExame)) falta.Add("tipo de exame");
            if (falta.Count > 0) return Erros.Invalido($"Para assinar, complete: {string.Join(", ", falta)}.");

            l!.ConteudoRevisado ??= l.ConteudoIa;
            l.AssinadoPorId = u.Id;
            l.AssinadoPorNome = u.Nome;
            l.AssinadoCrmv = $"CRMV-{u.CrmvUf!.ToUpperInvariant()} {u.Crmv}";
            l.AssinadoEm = DateTime.UtcNow;
            l.CodigoVerificacao = await NovoCodigo(db);
            e.Status = StatusExame.Pronto;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await registros.Gravar(http, "laudo_assinado", $"Laudo assinado (versão {l.Versao}, código {l.CodigoVerificacao})", e.Id, e.Paciente.Nome);
            return Results.Ok(new { e.Status, l.Versao, l.CodigoVerificacao, l.AssinadoEm });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // Retificação: o laudo assinado fica guardado como "retificado" e abre uma nova versão para revisar e assinar
        g.MapPost("/retificar", async (Guid id, RetificarReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var e = await db.Exames.FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status != StatusExame.Pronto) return Erros.Conflito("Só um laudo assinado pode ser retificado.");
            if (Texto.Opcional(r.Motivo) is not { } motivo) return Erros.Invalido("Informe o motivo da retificação.");

            var assinado = await db.Laudos.Where(x => x.ExameId == id).OrderByDescending(x => x.Versao).FirstAsync();
            assinado.Retificado = true;
            var conteudo = assinado.ConteudoRevisado ?? assinado.ConteudoIa;
            db.Laudos.Add(new Laudo
            {
                ExameId = id, Versao = assinado.Versao + 1, Ia = "retificacao", Modelo = "", Modo = "retificacao",
                ConteudoIa = conteudo, ConteudoRevisado = conteudo, ImagensEnviadas = assinado.ImagensEnviadas,
                DadosEntrada = assinado.DadosEntrada, HashesFotos = assinado.HashesFotos,
                MotivoRetificacao = motivo.Length > 1000 ? motivo[..1000] : motivo,
            });
            e.Status = StatusExame.AguardandoRevisao;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await registros.Gravar(http, "laudo_retificado", $"Laudo retificado: a versão {assinado.Versao} será substituída pela {assinado.Versao + 1}. Motivo: {motivo}",
                id, await db.Pacientes.Where(p => p.Id == e.PacienteId).Select(p => p.Nome).FirstOrDefaultAsync());
            return Results.Ok(new { e.Status, versao = assinado.Versao + 1 });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // PDF: a versão assinada (ou uma pré-visualização marcada como rascunho). Sem X-Clinica-Id: abre em nova aba.
        app.MapGet("/api/exames/{id:guid}/laudo.pdf", async (Guid id, int? versao, string? baixar, HttpContext http, VetusDb db, PdfLaudo pdf) =>
        {
            var usuarioId = Acesso.UsuarioId(http.User);
            var e = await db.Exames.Include(x => x.Clinica).Include(x => x.Paciente).ThenInclude(p => p.Tutor)
                .FirstOrDefaultAsync(x => x.Id == id && db.Vinculos.Any(v =>
                    v.ClinicaId == x.ClinicaId && v.UsuarioId == usuarioId && v.Ativo && v.Clinica.Ativa));
            if (e is null) return Results.NotFound();
            var q = db.Laudos.Where(x => x.ExameId == id);
            var l = await (versao is { } v ? q.Where(x => x.Versao == v) : q.OrderByDescending(x => x.Versao)).FirstOrDefaultAsync();
            if (l is null) return Results.NotFound();
            var bytes = await pdf.Gerar(e, l);
            var comoDownload = baixar is not (null or "" or "0" or "false");
            http.Response.Headers.ContentDisposition = PdfLaudo.CabecalhoArquivo(e.Paciente.Nome, comoDownload);
            return Results.File(bytes, "application/pdf");
        }).RequireAuthorization();

        // Verificação pública (QR code do PDF): confirma que o laudo existe, quem assinou e se ainda vale
        app.MapGet("/api/publico/verificar/{codigo}", async (string codigo, VetusDb db) =>
        {
            var c = codigo.Trim().ToUpperInvariant();
            var l = await db.Laudos.Include(x => x.Exame).ThenInclude(x => x.Paciente)
                .Include(x => x.Exame).ThenInclude(x => x.Clinica)
                .FirstOrDefaultAsync(x => x.CodigoVerificacao == c);
            if (l is null) return Results.NotFound(new { valido = false, erro = "Código não encontrado." });
            if (!l.Exame.Clinica.VerificacaoOnline) return Results.NotFound(new { valido = false, erro = "A verificação online não está disponível para este laudo." });
            var vigente = await db.Laudos.Where(x => x.ExameId == l.ExameId && x.AssinadoEm != null)
                .OrderByDescending(x => x.Versao).Select(x => x.Versao).FirstAsync();
            return Results.Ok(new
            {
                valido = true,
                codigo = c,
                l.Versao,
                l.Retificado,
                versaoVigente = vigente,
                paciente = l.Exame.Paciente.Nome,
                especie = l.Exame.Paciente.Especie,
                tipoExame = l.Exame.TipoExame is { } t && TiposExame.Todos.TryGetValue(t, out var n) ? n : l.Exame.Tipo,
                dataExame = l.Exame.Data,
                clinica = l.Exame.Clinica.Nome,
                assinadoPor = l.AssinadoPorNome,
                crmv = l.AssinadoCrmv,
                l.AssinadoEm,
            });
        }).RequireRateLimiting(LimitePublico);
    }

    /// <summary>Exame da clínica em "Aguardando revisão" e a versão atual do laudo.</summary>
    private static async Task<(Exame? e, Laudo? l, IResult? erro)> LaudoEmRevisao(Guid id, HttpContext http, VetusDb db)
    {
        var clinicaId = http.VinculoAtual().ClinicaId;
        var e = await db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor)
            .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
        if (e is null) return (null, null, Erros.NaoEncontrado("Exame não encontrado."));
        if (e.Status == StatusExame.Pronto) return (e, null, Erros.Conflito("Laudo já assinado: use a retificação."));
        if (e.Status != StatusExame.AguardandoRevisao) return (e, null, Erros.Conflito("O exame não está aguardando revisão."));
        // com o mentor, o laudo fica parado: a comparação no fim é com o que foi enviado
        if (await db.RevisoesMentor.AnyAsync(r => r.ExameId == id && r.Situacao == RevisaoMentor.Pendente && !r.ParaEnsino))
            return (e, null, Erros.Conflito("O laudo está com o mentor para revisão: aguarde a resposta ou cancele o pedido."));
        var l = await db.Laudos.Where(x => x.ExameId == id).OrderByDescending(x => x.Versao).FirstOrDefaultAsync();
        return l is null ? (e, null, Erros.Conflito("Ainda não há pré-laudo para revisar.")) : (e, l, null);
    }

    /// <summary>Confere o mínimo do conteúdo revisado.</summary>
    private static string? ValidarConteudo(JsonElement c)
    {
        if (c.ValueKind != JsonValueKind.Object) return "Conteúdo do laudo inválido.";
        if (!c.TryGetProperty("orgaos", out var o) || o.ValueKind != JsonValueKind.Array) return "O laudo precisa da lista de órgãos.";
        foreach (var item in o.EnumerateArray())
        {
            var sit = item.TryGetProperty("situacao", out var s) ? s.GetString() : null;
            if (sit is not (ModeloLaudo.Normal or ModeloLaudo.Alterado or ModeloLaudo.NaoVisualizado))
                return "Situação de órgão inválida.";
        }
        // prancha sem limite de fotos (a clínica escolhe quantas quiser); só precisa ser uma lista
        if (c.TryGetProperty("prancha", out var p) && p.ValueKind != JsonValueKind.Array)
            return "Prancha inválida.";
        return c.GetRawText().Length > 100_000 ? "Laudo grande demais." : null;
    }

    /// <summary>Código de verificação legível (sem 0/O, 1/I), único.</summary>
    private static async Task<string> NovoCodigo(VetusDb db)
    {
        const string letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        while (true)
        {
            var c = RandomNumberGenerator.GetString(letras, 10);
            if (!await db.Laudos.AnyAsync(x => x.CodigoVerificacao == c)) return c;
        }
    }
}

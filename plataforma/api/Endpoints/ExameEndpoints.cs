using System.Text.Json;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>Exames da clínica escolhida: lista por status, detalhe e arquivos (fotos e PDFs).</summary>
public static class ExameEndpoints
{
    private static readonly FileExtensionContentTypeProvider TiposArquivo = new();

    public record PacienteReq(string? Nome, string? Especie, string? Raca, string? Sexo, bool? Castrado, string? Nascimento);
    public record TutorReq(string? Nome, string? Telefone, string? Email);
    /// <summary>Campos da tela do exame. null = não altera; "" = apaga.</summary>
    public record SalvarExameReq(
        PacienteReq? Paciente, TutorReq? Tutor,
        string? Idade, string? Peso, string? TipoExame, string? SuspeitaClinica, string? Historico, bool? Jejum,
        bool LimparJejum, string? SolicitanteNome, string? SolicitanteCrmv, string? SolicitanteClinica,
        string? InformacoesAdicionais, bool? Urgente, bool? Completa);

    private static Task<Exame?> CarregarParaEditar(Guid id, HttpContext http, VetusDb db)
    {
        var clinicaId = http.VinculoAtual().ClinicaId;
        return db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor)
            .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
    }

    /// <summary>Aplica os campos enviados. Devolve uma mensagem de erro ou null.</summary>
    private static string? Aplicar(Exame e, SalvarExameReq r, VetusDb db)
    {
        // texto: null = mantém; "" = apaga; limita o tamanho
        string? T(string? novo, string? atual, int max) => novo is null ? atual : Texto.Opcional(novo) is { } s ? s[..Math.Min(s.Length, max)] : null;

        if (r.TipoExame is not null && r.TipoExame != "" && !TiposExame.Valido(r.TipoExame)) return "Tipo de exame inválido.";
        if (r.Paciente?.Sexo is { Length: > 0 } sx && sx.ToUpperInvariant() is not ("M" or "F" or "O")) return "Sexo inválido (M, F ou O).";
        if (r.Tutor?.Email is { Length: > 0 } em && !em.Contains('@')) return "E-mail do tutor inválido.";

        if (r.Paciente is { } p)
        {
            if (p.Nome is not null && Texto.Opcional(p.Nome) is null) return "O nome do paciente não pode ficar vazio.";
            e.Paciente.Nome = T(p.Nome, e.Paciente.Nome, 200)!;
            e.Paciente.Especie = T(p.Especie, e.Paciente.Especie, 100);
            e.Paciente.Raca = T(p.Raca, e.Paciente.Raca, 100);
            e.Paciente.Sexo = p.Sexo is null ? e.Paciente.Sexo : Texto.Opcional(p.Sexo)?.ToUpperInvariant();
            if (p.Castrado is not null) e.Paciente.Castrado = p.Castrado;
            e.Paciente.Nascimento = T(p.Nascimento, e.Paciente.Nascimento, 8);
        }

        if (r.Tutor is { } t)
        {
            var nome = T(t.Nome, e.Paciente.Tutor?.Nome, 200);
            if (nome is not null)
            {
                if (e.Paciente.Tutor is null)
                {
                    e.Paciente.Tutor = db.Tutores.Add(new Tutor { ClinicaId = e.ClinicaId, Nome = nome }).Entity;
                }
                e.Paciente.Tutor.Nome = nome;
                e.Paciente.Tutor.Telefone = T(t.Telefone, e.Paciente.Tutor.Telefone, 30);
                e.Paciente.Tutor.Email = T(t.Email, e.Paciente.Tutor.Email, 200);
            }
        }

        e.Idade = T(r.Idade, e.Idade, 20);
        e.Peso = T(r.Peso, e.Peso, 20);
        e.TipoExame = r.TipoExame is null ? e.TipoExame : Texto.Opcional(r.TipoExame);
        e.SuspeitaClinica = T(r.SuspeitaClinica, e.SuspeitaClinica, 1000);
        e.Historico = T(r.Historico, e.Historico, 4000);
        if (r.LimparJejum) e.Jejum = null; else if (r.Jejum is not null) e.Jejum = r.Jejum;
        e.SolicitanteNome = T(r.SolicitanteNome, e.SolicitanteNome, 200);
        e.SolicitanteCrmv = T(r.SolicitanteCrmv, e.SolicitanteCrmv, 30);
        e.SolicitanteClinica = T(r.SolicitanteClinica, e.SolicitanteClinica, 200);
        e.InformacoesAdicionais = T(r.InformacoesAdicionais, e.InformacoesAdicionais, 8000);
        if (r.Urgente is not null) e.Urgente = r.Urgente.Value;
        e.AtualizadoEm = DateTime.UtcNow;
        return null;
    }

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames");

        // Lista (mais recentes primeiro) e contagem por status
        g.MapGet("", async (StatusExame? status, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var contagens = await db.Exames.Where(e => e.ClinicaId == clinicaId)
                .GroupBy(e => e.Status).Select(g => new { status = g.Key, total = g.Count() })
                .ToDictionaryAsync(x => x.status.ToString(), x => x.total);

            var q = db.Exames.Where(e => e.ClinicaId == clinicaId);
            if (status is { } s) q = q.Where(e => e.Status == s);
            var lista = await q.OrderByDescending(e => e.Urgente).ThenByDescending(e => e.RecebidoEm).Take(200)
                .Select(e => new
                {
                    e.Id, e.Status, e.Urgente, e.Tipo, e.Data, e.TotalFotos, e.TotalPdfs, e.TotalVideos, e.RecebidoEm, e.Origem,
                    arquivos = new Exame { Pasta = e.Pasta, PastaPendrive = e.PastaPendrive, FotosPendrive = e.FotosPendrive },
                    paciente = e.Paciente.Nome, especie = e.Paciente.Especie, tutor = e.Paciente.Tutor!.Nome,
                })
                .ToListAsync();

            return Results.Ok(new
            {
                contagens,
                exames = lista.Select(e => new
                {
                    e.Id, e.Status, e.Urgente, e.Tipo, e.Data, e.TotalFotos, e.TotalPdfs, e.TotalVideos, e.RecebidoEm, e.Origem,
                    e.paciente, e.especie, e.tutor,
                    miniatura = arq.PrimeiraFoto(e.arquivos) is { } f ? $"/api/exames/{e.Id}/arquivos/jpg/{Uri.EscapeDataString(f)}" : null,
                }),
            });
        }).ExigirClinica();

        // Detalhe do exame: dados, paciente, fotos, PDFs e medidas
        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, VetusDb db, Arquivos arq, ConfiguracaoIa ia, Referencias referencias) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var e = await db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor)
                .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var l = await db.Laudos.Where(x => x.ExameId == e.Id).OrderByDescending(x => x.Versao).FirstOrDefaultAsync();
            var laudo = l is null ? null : new
            {
                l.Id, l.Versao, l.Ia, l.Modelo, l.Modo, l.GeradoEm, l.TokensEntrada, l.TokensSaida, l.DuracaoMs, l.CobradoBrl,
                l.AssinadoPorNome, l.AssinadoCrmv, l.AssinadoEm, l.CodigoVerificacao, l.Retificado, l.MotivoRetificacao,
                revisado = l.ConteudoRevisado is not null,
                conteudo = JsonSerializer.Deserialize<JsonElement>(l.ConteudoRevisado ?? l.ConteudoIa),
                imagensEnviadas = JsonSerializer.Deserialize<string[]>(l.ImagensEnviadas),
            };

            var medidas = arq.LerJson(e, "medidas.json") is { } json
                ? JsonSerializer.Deserialize<JsonElement>(json) : (JsonElement?)null;
            var url = (string sub, string nome) => $"/api/exames/{e.Id}/arquivos/{sub}/{Uri.EscapeDataString(nome)}";
            var pesoKg = Referencias.PesoKg(e.Peso);
            var refs = await referencias.Aplicaveis(e.Paciente.Especie, pesoKg);

            return Results.Ok(new
            {
                pesoKg,
                referencias = refs.Select(r => new { r.Id, r.Orgao, r.Medida, faixa = Referencias.Faixa(r), r.Observacao, r.Fonte }),
                medidasComparadas = Referencias.Comparar(medidas, refs),
                e.Id, e.Status, e.Urgente, e.Origem, e.Tipo, e.Data, e.Hora, e.EspecieAparelho, e.Idade, e.Peso,
                e.MedicoSolicitante, e.Operador, e.Equipamento, e.RecebidoEm, e.AtualizadoEm, e.EnfileiradoEm, e.Pasta, e.IdAnimal,
                e.FotosPendrive, pendrive = e.PastaPendrive is not null,
                e.TipoExame, e.SuspeitaClinica, e.Historico, e.Jejum, e.SolicitanteNome, e.SolicitanteCrmv,
                e.SolicitanteClinica, e.InformacoesAdicionais, e.ErroGeracao, laudo,
                iaAtiva = ia.Ativa,
                mascaras = ModeloLaudo.Normalidade,
                clinicaId = e.ClinicaId,
                tiposExame = TiposExame.Todos.Select(t => new { codigo = t.Key, nome = t.Value }),
                paciente = new
                {
                    e.Paciente.Id, e.Paciente.Nome, e.Paciente.Especie, e.Paciente.Raca, e.Paciente.Sexo,
                    e.Paciente.Castrado, e.Paciente.Nascimento,
                },
                tutor = e.Paciente.Tutor is null ? null : new { e.Paciente.Tutor.Id, e.Paciente.Tutor.Nome, e.Paciente.Tutor.Telefone, e.Paciente.Tutor.Email },
                fotos = arq.Listar(e, Arquivos.Jpg).Select(n => new { nome = n, url = url(Arquivos.Jpg, n) }),
                pdfs = arq.Listar(e, Arquivos.Pdf).Select(n => new { nome = n, url = url(Arquivos.Pdf, n) }),
                videos = arq.Listar(e, Arquivos.Mp4).Select(n => new { nome = n, url = url(Arquivos.Mp4, n) }),
                medidas,
            });
        }).ExigirClinica();

        // Salva os dados do exame, do paciente e do tutor (tela do exame). Qualquer perfil da clínica pode preencher.
        g.MapPut("/{id:guid}", async (Guid id, SalvarExameReq r, HttpContext http, VetusDb db) =>
        {
            var e = await CarregarParaEditar(id, http, db);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status == StatusExame.Pronto) return Erros.Conflito("Laudo já assinado: use a retificação.");
            if (Aplicar(e, r, db) is { } erro) return Erros.Invalido(erro);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica();

        // Gerar pré-laudo: (opcionalmente salva os dados e) coloca o exame na fila da IA
        g.MapPost("/{id:guid}/gerar", async (Guid id, SalvarExameReq? r, HttpContext http, VetusDb db, ServicoLaudo laudos) =>
        {
            var e = await CarregarParaEditar(id, http, db);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            switch (e.Status)
            {
                case StatusExame.Pronto: return Erros.Conflito("Laudo já assinado: use a retificação.");
                case StatusExame.Gerando: return Erros.Conflito("O pré-laudo já está sendo gerado.");
            }
            if (r is not null && Aplicar(e, r, db) is { } erro) return Erros.Invalido(erro);

            var faltando = new List<string>();
            if (string.IsNullOrWhiteSpace(e.Paciente.Especie)) faltando.Add("espécie");
            if (!TiposExame.Valido(e.TipoExame)) faltando.Add("tipo de exame");
            if (faltando.Count > 0) return Erros.Invalido($"Para gerar o pré-laudo, informe: {string.Join(" e ", faltando)}.");

            // gerar de novo: atualiza só com o que mudou (sem reenviar as fotos), salvo pedido de análise completa
            e.GerarCompleto = r?.Completa == true;
            var plano = await laudos.Planejar(e);
            if (plano.Modo == ServicoLaudo.Nada)
                return Erros.Conflito("Nada mudou desde o último pré-laudo (dados, texto livre e fotos são os mesmos). " +
                    "Altere algo, ou use \"Refazer análise completa\" para a IA olhar todas as fotos de novo.");
            if (await laudos.SaldoInsuficiente(e.ClinicaId, plano) is { } semSaldo)
                return Results.Json(new { erro = semSaldo }, statusCode: 402);

            if (e.Status != StatusExame.NaFila) e.EnfileiradoEm = DateTime.UtcNow; // já na fila: mantém o lugar
            e.Status = StatusExame.NaFila;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { e.Id, e.Status, e.EnfileiradoEm, modo = plano.Modo, mudancas = plano.Mudancas, imagensNovas = plano.Enviar.Count });
        }).ExigirClinica();

        // Foto ou PDF do exame. Sem o cabeçalho X-Clinica-Id (é usado em <img src>): confere o acesso pela clínica do exame.
        g.MapGet("/{id:guid}/arquivos/{sub}/{nome}", async (Guid id, string sub, string nome, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var usuarioId = Acesso.UsuarioId(http.User);
            var e = await db.Exames.FirstOrDefaultAsync(x => x.Id == id && db.Vinculos.Any(v =>
                v.ClinicaId == x.ClinicaId && v.UsuarioId == usuarioId && v.Ativo && v.Clinica.Ativa));
            if (e is null) return Results.NotFound();
            var f = arq.Arquivo(e, sub, nome);
            if (f is null) return Results.NotFound();
            TiposArquivo.TryGetContentType(f, out var tipo);
            http.Response.Headers.CacheControl = "private, max-age=86400";
            return Results.File(f, tipo ?? "application/octet-stream", enableRangeProcessing: true); // vídeos: avançar/voltar
        }).RequireAuthorization();
    }
}

using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// API de ingestão (contrato em docs/API-INGESTAO.md): apps de envio (Windows/Android) e o receptor DICOM da nuvem mandam os
/// exames por HTTPS com um token por dispositivo. O recebimento é o mesmo do pendrive (<see cref="RecebimentoExames"/>):
/// arquivos um por vez, retomável, e o "concluir" junta com o exame já recebido por outro caminho.
/// A clínica vem sempre do token (ou, para o receptor do sistema, do AE Title chamado), nunca do que o cliente diz.
/// </summary>
public static class IngestaoEndpoints
{
    public record ParearReq(string? Codigo, string? VersaoApp);
    public record NovoPareamentoReq(string? Nome, string? Tipo);
    public record NovoReceptorReq(string? Nome);
    public record ItemVerificar(string? IdAnimal, string? Subpasta);
    public record VerificarReq(List<ItemVerificar>? Exames);
    public record ConcluirReq(string? Nome);

    public const string LimiteIngestao = "ingestao";
    private const string Alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I/L, que se confundem
    private static readonly TimeSpan ValidadeCodigo = TimeSpan.FromMinutes(10);

    private sealed record Origem(DispositivoIngestao Dispositivo, Clinica Clinica);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/ingestao/v1");

        // ---------- pareamento: o app troca o código de 8 caracteres (gerado na tela da clínica) pelo token
        g.MapPost("/parear", async (ParearReq r, HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            if (Desligada(cfg) is { } off) return off;
            var codigo = Normalizar(r.Codigo);
            if (codigo.Length != 8) return Erros.Invalido("Informe o código de 8 caracteres mostrado na tela da clínica.");
            var hash = Seguranca.HashToken(codigo);
            var agora = DateTime.UtcNow;
            var p = await db.CodigosPareamento.FirstOrDefaultAsync(x => x.CodigoHash == hash && x.UsadoEm == null && x.ExpiraEm > agora);
            if (p is null) return Erros.NaoAutorizado("Código inválido ou vencido. Gere um novo na tela da clínica.");
            var clinica = await db.Clinicas.FirstOrDefaultAsync(c => c.Id == p.ClinicaId && c.Ativa);
            if (clinica is null) return Erros.NaoAutorizado("Clínica inativa.");

            var token = Seguranca.GerarToken();
            var d = new DispositivoIngestao
            {
                ClinicaId = clinica.Id, Nome = p.NomeDispositivo, Tipo = p.Tipo, TokenHash = Seguranca.HashToken(token),
                CriadoPorId = p.CriadoPorId, CriadoPorNome = p.CriadoPorNome, VersaoApp = Limite(r.VersaoApp, 40),
                UltimoUsoEm = agora, UltimoIp = Ip(http),
            };
            db.DispositivosIngestao.Add(d);
            p.UsadoEm = agora;
            p.DispositivoId = d.Id;
            RegistrarDispositivo(db, clinica, d, "dispositivo_pareado", $"App \"{d.Nome}\" ({d.Tipo}) pareado com a clínica");
            await db.SaveChangesAsync();
            return Results.Ok(new { token, dispositivo = new { d.Id, d.Nome, d.Tipo }, clinica = new { clinica.Id, clinica.Nome } });
        }).RequireRateLimiting(Limites.Login);

        // ---------- quem sou eu (o app usa para conferir o token e mostrar a clínica)
        g.MapGet("/eu", async (HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            var (o, erro) = await Autenticar(http, db, cfg);
            if (erro is not null) return erro;
            return Results.Ok(new
            {
                dispositivo = new { o!.Dispositivo.Id, o.Dispositivo.Nome, o.Dispositivo.Tipo },
                clinica = new { o.Clinica.Id, o.Clinica.Nome, o.Clinica.AeTitle },
            });
        }).RequireRateLimiting(LimiteIngestao);

        // ---------- o que já chegou de cada exame (para retomar)
        g.MapPost("/exames/verificar", async (VerificarReq r, HttpContext http, VetusDb db, Arquivos arq, IConfiguration cfg) =>
        {
            var (o, erro) = await Autenticar(http, db, cfg);
            if (erro is not null) return erro;
            var itens = r.Exames ?? [];
            if (itens.Count > 200) return Erros.Invalido("No máximo 200 exames por vez.");
            var resposta = new List<object>();
            foreach (var it in itens)
            {
                if (RecebimentoExames.Validar(it.IdAnimal, it.Subpasta) is { } msg) { resposta.Add(new { it.IdAnimal, it.Subpasta, erro = msg }); continue; }
                var e = await RecebimentoExames.AcharExame(db, o!.Clinica.Id, it.IdAnimal!, it.Subpasta!);
                resposta.Add(new
                {
                    it.IdAnimal, it.Subpasta,
                    recebidos = RecebimentoExames.Recebidos(arq, o.Clinica, it.IdAnimal!, it.Subpasta!).Select(x => new { nome = x.Nome, tamanho = x.Tamanho }),
                    exame = e is null ? null : new { e.Id, e.Status },
                });
            }
            return Results.Ok(resposta);
        }).RequireRateLimiting(LimiteIngestao);

        // ---------- um arquivo (corpo = o arquivo; cabeçalho X-SHA1 opcional, conferido)
        g.MapPut("/exames/{idAnimal}/{subpasta}/arquivos/{nome}", async (string idAnimal, string subpasta, string nome,
            HttpContext http, VetusDb db, Arquivos arq, IConfiguration cfg, ILoggerFactory logs) =>
        {
            var (o, erro) = await Autenticar(http, db, cfg);
            if (erro is not null) return erro;
            return await RecebimentoExames.GravarArquivo(http, arq, logs.CreateLogger("Ingestao"), o!.Clinica, idAnimal, subpasta, nome,
                http.Request.Headers["X-SHA1"].ToString());
        }).RequireRateLimiting(LimiteIngestao);

        // ---------- fecha o exame: lê o PDF, cria ou junta, fila da IA
        g.MapPost("/exames/{idAnimal}/{subpasta}/concluir", async (string idAnimal, string subpasta, ConcluirReq? r,
            HttpContext http, VetusDb db, Arquivos arq, IConfiguration cfg, ILoggerFactory logs) =>
        {
            var (o, erro) = await Autenticar(http, db, cfg);
            if (erro is not null) return erro;
            var (ok, msg) = await RecebimentoExames.Concluir(db, arq, logs.CreateLogger("Ingestao"), o!.Clinica, idAnimal, subpasta, r?.Nome, "app");
            if (ok is null) return Erros.Invalido(msg!);
            var e = ok.Exame;
            RegistrarDispositivo(db, o.Clinica, o.Dispositivo, "exame_enviado_app",
                $"{(ok.Novo ? "Exame enviado" : "Exame reenviado")} pelo {(o.Dispositivo.Tipo == DispositivoIngestao.Receptor ? "receptor DICOM" : "app")} \"{o.Dispositivo.Nome}\" ({ok.Fotos} foto(s), {ok.Pdfs} PDF, {ok.Videos} vídeo(s))",
                e.Id, e.Paciente.Nome);
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                exame = new { e.Id, e.Status, e.Origem }, novo = ok.Novo, paciente = e.Paciente.Nome,
                fotos = ok.Fotos, pdfs = ok.Pdfs, videos = ok.Videos, relatorioLido = ok.RelatorioLido, medidas = ok.Medidas,
            });
        }).RequireRateLimiting(LimiteIngestao);

        // ---------- situação do exame na nuvem (o app mostra "na fila da IA", "laudo assinado")
        g.MapGet("/exames/{idAnimal}/{subpasta}", async (string idAnimal, string subpasta, HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            var (o, erro) = await Autenticar(http, db, cfg);
            if (erro is not null) return erro;
            if (RecebimentoExames.Validar(idAnimal, subpasta) is { } msg) return Erros.Invalido(msg);
            var e = await RecebimentoExames.AcharExame(db, o!.Clinica.Id, idAnimal, subpasta);
            if (e is null) return Erros.NaoEncontrado("Exame ainda não recebido.");
            var assinado = await db.Laudos.AnyAsync(l => l.ExameId == e.Id && l.AssinadoEm != null && !l.Retificado);
            return Results.Ok(new { e.Id, e.Status, assinado });
        }).RequireRateLimiting(LimiteIngestao);

        // ---------- clínica: apps pareados, códigos de pareamento e revogação (administrador da clínica)
        var cli = app.MapGroup("/api/clinica/dispositivos");

        cli.MapGet("", async (HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var agora = DateTime.UtcNow;
            var dispositivos = await db.DispositivosIngestao.Where(d => d.ClinicaId == clinicaId).OrderByDescending(d => d.Ativo).ThenByDescending(d => d.CriadoEm)
                .Select(d => new { d.Id, d.Nome, d.Tipo, d.Ativo, d.CriadoPorNome, d.CriadoEm, d.UltimoUsoEm, d.UltimoIp, d.VersaoApp, d.RevogadoEm, d.RevogadoPor })
                .ToListAsync();
            var pendentes = await db.CodigosPareamento.Where(p => p.ClinicaId == clinicaId && p.UsadoEm == null && p.ExpiraEm > agora)
                .OrderByDescending(p => p.CriadoEm).Select(p => new { p.Id, p.NomeDispositivo, p.Tipo, p.ExpiraEm }).ToListAsync();
            return Results.Ok(new { dispositivos, pendentes });
        }).ExigirClinica(Perfil.AdministradorClinica);

        cli.MapPost("/pareamento", async (NovoPareamentoReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var nome = Limite(r.Nome, 120);
            if (nome is null) return Erros.Invalido("Dê um nome ao app (ex.: \"Notebook da Dra. Ana\").");
            var tipo = (r.Tipo ?? DispositivoIngestao.Windows).Trim().ToLowerInvariant();
            if (tipo is not (DispositivoIngestao.Windows or DispositivoIngestao.Android)) return Erros.Invalido("Tipo de app inválido (windows ou android).");
            var u = (await Acesso.UsuarioAtual(http, db))!;
            var codigo = NovoCodigo();
            var p = new CodigoPareamento
            {
                ClinicaId = http.VinculoAtual().ClinicaId, CodigoHash = Seguranca.HashToken(codigo), NomeDispositivo = nome, Tipo = tipo,
                CriadoPorId = u.Id, CriadoPorNome = u.Nome, ExpiraEm = DateTime.UtcNow.Add(ValidadeCodigo),
            };
            db.CodigosPareamento.Add(p);
            await registros.Adicionar(http, "pareamento_gerado", $"Código de pareamento gerado para o app \"{nome}\" ({tipo})");
            await db.SaveChangesAsync();
            // o código só aparece agora; guardamos o hash
            return Results.Ok(new { codigo = $"{codigo[..4]}-{codigo[4..]}", p.ExpiraEm, p.NomeDispositivo, p.Tipo });
        }).ExigirClinica(Perfil.AdministradorClinica);

        cli.MapDelete("/{id:guid}", async (Guid id, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var d = await db.DispositivosIngestao.FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
            if (d is null) return Erros.NaoEncontrado("App não encontrado.");
            if (!d.Ativo) return Results.NoContent();
            var u = (await Acesso.UsuarioAtual(http, db))!;
            d.Ativo = false; d.RevogadoEm = DateTime.UtcNow; d.RevogadoPor = u.Nome;
            await registros.Adicionar(http, "dispositivo_revogado", $"App \"{d.Nome}\" revogado: não envia mais exames");
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica(Perfil.AdministradorClinica);

        // ---------- sistema: tokens de serviço do receptor DICOM da nuvem (administrador do sistema)
        var adm = app.MapGroup("/api/admin/receptores").ExigirAdministradorSistema();

        adm.MapGet("", async (VetusDb db) => Results.Ok(await db.DispositivosIngestao
            .Where(d => d.Tipo == DispositivoIngestao.Receptor).OrderByDescending(d => d.Ativo).ThenByDescending(d => d.CriadoEm)
            .Select(d => new { d.Id, d.Nome, d.Ativo, d.CriadoPorNome, d.CriadoEm, d.UltimoUsoEm, d.UltimoIp, d.VersaoApp, d.RevogadoEm })
            .ToListAsync()));

        adm.MapPost("", async (NovoReceptorReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var nome = Limite(r.Nome, 120) ?? "Receptor DICOM";
            var u = (await Acesso.UsuarioAtual(http, db))!;
            var token = Seguranca.GerarToken();
            var d = new DispositivoIngestao { Nome = nome, Tipo = DispositivoIngestao.Receptor, TokenHash = Seguranca.HashToken(token), CriadoPorId = u.Id, CriadoPorNome = u.Nome };
            db.DispositivosIngestao.Add(d);
            await registros.Adicionar(http, "receptor_criado", $"Token de serviço criado para o receptor \"{nome}\"");
            await db.SaveChangesAsync();
            return Results.Ok(new { d.Id, d.Nome, token }); // mostrado só agora
        });

        adm.MapDelete("/{id:guid}", async (Guid id, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var d = await db.DispositivosIngestao.FirstOrDefaultAsync(x => x.Id == id && x.Tipo == DispositivoIngestao.Receptor);
            if (d is null) return Erros.NaoEncontrado("Receptor não encontrado.");
            var u = (await Acesso.UsuarioAtual(http, db))!;
            d.Ativo = false; d.RevogadoEm = DateTime.UtcNow; d.RevogadoPor = u.Nome;
            await registros.Adicionar(http, "dispositivo_revogado", $"Token do receptor \"{d.Nome}\" revogado");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    /// <summary>
    /// Token "Authorization: Bearer" → dispositivo ativo → clínica. O receptor do sistema não tem clínica: informa o AE Title
    /// chamado no cabeçalho X-AE-Chamado, e a clínica é a dona desse AE (cadastro de aparelhos e quarentena: etapa do receptor).
    /// </summary>
    private static async Task<(Origem? O, IResult? Erro)> Autenticar(HttpContext http, VetusDb db, IConfiguration cfg)
    {
        if (Desligada(cfg) is { } off) return (null, off);
        var auth = http.Request.Headers.Authorization.ToString();
        var token = auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..].Trim() : "";
        if (token.Length == 0) return (null, Erros.NaoAutorizado("Envie o token do app no cabeçalho Authorization: Bearer."));
        var hash = Seguranca.HashToken(token);
        var d = await db.DispositivosIngestao.FirstOrDefaultAsync(x => x.TokenHash == hash);
        if (d is null || !d.Ativo) return (null, Erros.NaoAutorizado("Token inválido ou revogado. Pareie o app de novo."));

        Clinica? clinica;
        if (d.ClinicaId is { } cid) clinica = await db.Clinicas.FirstOrDefaultAsync(c => c.Id == cid && c.Ativa);
        else
        {
            var ae = http.Request.Headers["X-AE-Chamado"].ToString().Trim().ToUpperInvariant();
            if (ae.Length == 0) return (null, Erros.Invalido("O receptor precisa informar o AE Title chamado (cabeçalho X-AE-Chamado)."));
            clinica = await db.Clinicas.FirstOrDefaultAsync(c => c.AeTitle == ae && c.Ativa);
            if (clinica is null) return (null, Erros.NaoEncontrado("AE Title não cadastrado ou clínica inativa."));
        }
        if (clinica is null) return (null, Results.Json(new { erro = "Clínica inativa." }, statusCode: 403));

        // último uso (no máximo uma gravação por minuto, para não escrever no banco a cada arquivo)
        var agora = DateTime.UtcNow;
        if (d.UltimoUsoEm is null || agora - d.UltimoUsoEm > TimeSpan.FromMinutes(1))
        {
            d.UltimoUsoEm = agora;
            d.UltimoIp = Ip(http);
            if (Limite(http.Request.Headers["X-Versao-App"].ToString(), 40) is { } v) d.VersaoApp = v;
            await db.SaveChangesAsync();
        }
        return (new Origem(d, clinica), null);
    }

    /// <summary>Interruptor de emergência: INGESTAO_HABILITADA=false desliga a API (responde 503).</summary>
    private static IResult? Desligada(IConfiguration cfg) =>
        cfg.GetValue("INGESTAO_HABILITADA", true) ? null : Results.Json(new { erro = "Ingestão desligada no servidor." }, statusCode: 503);

    /// <summary>Registro de atividade feito por um app (não há usuário logado: o autor é o app).</summary>
    private static void RegistrarDispositivo(VetusDb db, Clinica c, DispositivoIngestao d, string tipo, string descricao, Guid? exameId = null, string? paciente = null) =>
        db.RegistrosAtividade.Add(new RegistroAtividade
        {
            Tipo = tipo, Descricao = descricao.Length > 500 ? descricao[..500] : descricao, ClinicaId = c.Id, ClinicaNome = c.Nome,
            ExameId = exameId, Paciente = paciente, UsuarioNome = d.Nome, UsuarioEmail = "",
            Perfil = d.Tipo == DispositivoIngestao.Receptor ? "Receptor" : "App",
        });

    private static string NovoCodigo() => new(Enumerable.Range(0, 8).Select(_ => Alfabeto[RandomNumberGenerator.GetInt32(Alfabeto.Length)]).ToArray());

    private static string Normalizar(string? codigo) => new((codigo ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static string? Ip(HttpContext http) => http.Connection.RemoteIpAddress?.ToString();

    private static string? Limite(string? s, int max)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : t.Length > max ? t[..max] : t;
    }
}

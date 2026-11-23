using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Envio do laudo: preferências do usuário, SMTP próprio, link público, e-mail, histórico.</summary>
public static class EnvioEndpoints
{
    public record SmtpReq(string? Host, int? Porta, string? Seguranca, string? Usuario, string? Senha, bool LimparSenha,
        string? RemetenteNome, string? RemetenteEmail);
    public record PreferenciasReq(bool Whatsapp, bool Email, bool Link, bool Pdf, int? LinkValidadeDias, SmtpReq? Smtp);
    public record TesteReq(string? Para);
    public record EmailReq(List<string>? Para, string? Assunto, string? Mensagem, bool AnexarPdf = true);
    public record RegistrarReq(string? Meio, string? Destinatario);

    private static readonly string[] MeiosRegistraveis = ["whatsapp", "link", "pdf"];

    public static void Mapear(WebApplication app)
    {
        // ---------------------------------------------------------------- preferências do usuário
        app.MapGet("/api/auth/envio", async (HttpContext http, VetusDb db, EnvioEmail email) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            return u is null ? Results.Unauthorized() : Results.Ok(Preferencias(u, email));
        }).RequireAuthorization();

        app.MapPut("/api/auth/envio", async (PreferenciasReq r, HttpContext http, VetusDb db, EnvioEmail email) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            u.EnvioWhatsapp = r.Whatsapp;
            u.EnvioEmail = r.Email;
            u.EnvioLink = r.Link;
            u.EnvioPdf = r.Pdf;
            if (r.LinkValidadeDias is { } dias) u.LinkValidadeDias = Math.Clamp(dias, 1, 365);

            if (r.Smtp is { } s)
            {
                var host = Texto.Opcional(s.Host);
                var remetente = Texto.Opcional(s.RemetenteEmail);
                if (host is not null)
                {
                    if (s.Porta is not (> 0 and < 65536)) return Erros.Invalido("Porta do SMTP inválida (465, 587 ou 25).");
                    if (s.Seguranca is not ("ssl" or "starttls" or "nenhuma")) return Erros.Invalido("Segurança do SMTP inválida.");
                    if (remetente is null || !remetente.Contains('@')) return Erros.Invalido("Informe o e-mail do remetente.");
                }
                u.SmtpHost = host;
                u.SmtpPorta = host is null ? null : s.Porta;
                u.SmtpSeguranca = host is null ? null : s.Seguranca;
                u.SmtpUsuario = Texto.Opcional(s.Usuario);
                u.SmtpRemetenteNome = Texto.Opcional(s.RemetenteNome);
                u.SmtpRemetenteEmail = remetente;
                if (s.LimparSenha || host is null) u.SmtpSenhaProtegida = null;
                else if (!string.IsNullOrEmpty(s.Senha)) u.SmtpSenhaProtegida = email.Proteger(s.Senha);
            }
            await db.SaveChangesAsync();
            return Results.Ok(Preferencias(u, email));
        }).RequireAuthorization();

        // e-mail de teste pelo SMTP configurado
        app.MapPost("/api/auth/envio/teste", async (TesteReq r, HttpContext http, VetusDb db, EnvioEmail email, CancellationToken ct) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            if (email.Config(u) is not { } smtp) return Erros.Invalido("Configure e salve o SMTP antes de testar.");
            var para = Seguranca.NormalizarEmail(r.Para);
            if (!para.Contains('@')) return Erros.Invalido("Informe o e-mail de destino do teste.");
            try
            {
                await email.Enviar(smtp, [para], "Vetus: e-mail de teste",
                    $"Olá! Este é um e-mail de teste do Vetus.\n\nSe ele chegou, o envio de laudos pelo e-mail {smtp.RemetenteEmail} está funcionando.", null, ct);
            }
            catch (ErroEnvio x) { return Erros.Invalido(x.Message); }
            return Results.Ok(new { enviado = true });
        }).RequireAuthorization();

        // ---------------------------------------------------------------- compartilhar um exame
        var g = app.MapGroup("/api/exames/{id:guid}");

        // links ativos e histórico de envios
        g.MapGet("/compartilhamentos", async (Guid id, HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            if (await ExameDaClinica(id, http, db) is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var agora = DateTime.UtcNow;
            var links = await db.LinksPublicos.Where(l => l.ExameId == id).OrderByDescending(l => l.CriadoEm)
                .Select(l => new { l.Id, l.Token, l.CriadoEm, l.ExpiraEm, l.Revogado, l.Acessos, l.UltimoAcesso,
                    ativo = !l.Revogado && l.ExpiraEm > agora })
                .ToListAsync();
            var historico = await db.Compartilhamentos.Where(c => c.ExameId == id).OrderByDescending(c => c.Em).Take(50).ToListAsync();
            var url = UrlPublica(cfg);
            return Results.Ok(new
            {
                links = links.Select(l => new { l.Id, url = $"{url}/laudo/{l.Token}", l.CriadoEm, l.ExpiraEm, l.Revogado, l.Acessos, l.UltimoAcesso, l.ativo }),
                historico = historico.Select(c => new { c.Meio, c.Destinatario, c.UsuarioNome, c.Em, c.LaudoVersao }),
            });
        }).ExigirClinica();

        // link público (reaproveita um ativo; senão cria com a validade do usuário)
        g.MapPost("/compartilhar/link", async (Guid id, HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            var e = await ExameDaClinica(id, http, db);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (await UltimoAssinado(db, id) is null) return Erros.Conflito("O laudo ainda não foi assinado.");
            var u = (await Acesso.UsuarioAtual(http, db))!;
            var agora = DateTime.UtcNow;
            var link = await db.LinksPublicos.Where(l => l.ExameId == id && !l.Revogado && l.ExpiraEm > agora.AddDays(1))
                .OrderByDescending(l => l.ExpiraEm).FirstOrDefaultAsync();
            if (link is null)
            {
                link = new LinkPublico
                {
                    ExameId = id, CriadoPorId = u.Id, ExpiraEm = agora.AddDays(u.LinkValidadeDias),
                    Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).Replace('+', '-').Replace('/', '_'),
                };
                db.LinksPublicos.Add(link);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { link.Id, url = $"{UrlPublica(cfg)}/laudo/{link.Token}", link.ExpiraEm });
        }).ExigirClinica();

        g.MapDelete("/links/{linkId:guid}", async (Guid id, Guid linkId, HttpContext http, VetusDb db) =>
        {
            if (await ExameDaClinica(id, http, db) is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var n = await db.LinksPublicos.Where(l => l.Id == linkId && l.ExameId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.Revogado, true));
            return n == 0 ? Erros.NaoEncontrado("Link não encontrado.") : Results.NoContent();
        }).ExigirClinica();

        // envios feitos pelo navegador (WhatsApp, copiar link, baixar PDF): só registra no histórico
        g.MapPost("/compartilhar/registrar", async (Guid id, RegistrarReq r, HttpContext http, VetusDb db) =>
        {
            if (await ExameDaClinica(id, http, db) is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (!MeiosRegistraveis.Contains(r.Meio)) return Erros.Invalido("Meio inválido.");
            var laudo = await UltimoAssinado(db, id);
            if (laudo is null) return Erros.Conflito("O laudo ainda não foi assinado.");
            await Registrar(db, http, id, laudo.Versao, r.Meio!, Texto.Opcional(r.Destinatario));
            return Results.NoContent();
        }).ExigirClinica();

        // e-mail com o PDF anexado, pelo SMTP do usuário
        g.MapPost("/compartilhar/email", async (Guid id, EmailReq r, HttpContext http, VetusDb db, EnvioEmail email, PdfLaudo pdf, CancellationToken ct) =>
        {
            var u = (await Acesso.UsuarioAtual(http, db))!;
            if (!u.EnvioEmail) return Erros.Invalido("O envio por e-mail está desativado em \"Minha conta\".");
            if (email.Config(u) is not { } smtp) return Erros.Invalido("Configure o seu SMTP em \"Minha conta\" para enviar por e-mail.");
            var para = (r.Para ?? []).Select(Seguranca.NormalizarEmail).Where(p => p.Length > 0).Distinct().ToList();
            if (para.Count == 0 || para.Any(p => !p.Contains('@'))) return Erros.Invalido("Informe e-mail(s) de destino válido(s).");
            if (para.Count > 10) return Erros.Invalido("No máximo 10 destinatários.");

            var clinicaId = http.VinculoAtual().ClinicaId;
            var e = await db.Exames.Include(x => x.Clinica).Include(x => x.Paciente).ThenInclude(p => p.Tutor)
                .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId, ct);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var laudo = await UltimoAssinado(db, id);
            if (laudo is null) return Erros.Conflito("O laudo ainda não foi assinado.");

            (string, byte[])? anexo = r.AnexarPdf
                ? ($"Laudo_{e.Paciente.Nome}_{e.Data}.pdf".Replace(' ', '_'), await pdf.Gerar(e, laudo))
                : null;
            var assunto = Texto.Opcional(r.Assunto) ?? $"Laudo de ultrassonografia: {e.Paciente.Nome}";
            var mensagem = Texto.Opcional(r.Mensagem) ?? $"Segue o laudo de ultrassonografia de {e.Paciente.Nome}.";
            try { await email.Enviar(smtp, para, assunto, mensagem, anexo, ct); }
            catch (ErroEnvio x) { return Erros.Invalido(x.Message); }

            await Registrar(db, http, id, laudo.Versao, "email", string.Join(", ", para));
            return Results.Ok(new { enviado = para.Count });
        }).ExigirClinica();

        // ---------------------------------------------------------------- páginas públicas do tutor
        app.MapGet("/api/publico/laudo/{token}", async (string token, VetusDb db) =>
        {
            var (link, laudo, e) = await LinkValido(db, token);
            if (link is null || laudo is null || e is null) return Results.NotFound(new { erro = "Link inválido, expirado ou revogado." });
            link.Acessos++;
            link.UltimoAcesso = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                paciente = e.Paciente.Nome, especie = e.Paciente.Especie, tutor = e.Paciente.Tutor?.Nome,
                tipoExame = e.TipoExame is { } t && TiposExame.Todos.TryGetValue(t, out var n) ? n : e.Tipo,
                dataExame = e.Data, clinica = e.Clinica.Nome, clinicaTelefone = e.Clinica.Telefone,
                assinadoPor = laudo.AssinadoPorNome, crmv = laudo.AssinadoCrmv, laudo.AssinadoEm, laudo.Versao,
                laudo.CodigoVerificacao, emRetificacao = laudo.Retificado, link.ExpiraEm,
                pdf = $"/api/publico/laudo/{token}/pdf",
            });
        }).RequireRateLimiting(LaudoEndpoints.LimitePublico);

        app.MapGet("/api/publico/laudo/{token}/pdf", async (string token, VetusDb db, PdfLaudo pdf, HttpContext http) =>
        {
            var (link, laudo, e) = await LinkValido(db, token);
            if (link is null || laudo is null || e is null) return Results.NotFound();
            var nome = $"Laudo_{e.Paciente.Nome}_{e.Data}.pdf".Replace(' ', '_');
            http.Response.Headers.ContentDisposition = $"inline; filename=\"{Uri.EscapeDataString(nome)}\"";
            return Results.File(await pdf.Gerar(e, laudo), "application/pdf");
        }).RequireRateLimiting(LaudoEndpoints.LimitePublico);
    }

    private static object Preferencias(Usuario u, EnvioEmail email) => new
    {
        whatsapp = u.EnvioWhatsapp, email = u.EnvioEmail, link = u.EnvioLink, pdf = u.EnvioPdf, u.LinkValidadeDias,
        smtpConfigurado = email.Config(u) is not null,
        smtp = new
        {
            host = u.SmtpHost, porta = u.SmtpPorta, seguranca = u.SmtpSeguranca ?? "starttls", usuario = u.SmtpUsuario,
            senhaDefinida = u.SmtpSenhaProtegida is not null, remetenteNome = u.SmtpRemetenteNome, remetenteEmail = u.SmtpRemetenteEmail,
        },
    };

    private static Task<Exame?> ExameDaClinica(Guid id, HttpContext http, VetusDb db)
    {
        var clinicaId = http.VinculoAtual().ClinicaId;
        return db.Exames.FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
    }

    private static Task<Laudo?> UltimoAssinado(VetusDb db, Guid exameId) =>
        db.Laudos.Where(l => l.ExameId == exameId && l.AssinadoEm != null).OrderByDescending(l => l.Versao).FirstOrDefaultAsync();

    private static async Task<(LinkPublico?, Laudo?, Exame?)> LinkValido(VetusDb db, string token)
    {
        var link = await db.LinksPublicos.FirstOrDefaultAsync(l => l.Token == token && !l.Revogado && l.ExpiraEm > DateTime.UtcNow);
        if (link is null) return (null, null, null);
        var e = await db.Exames.Include(x => x.Clinica).Include(x => x.Paciente).ThenInclude(p => p.Tutor)
            .FirstOrDefaultAsync(x => x.Id == link.ExameId && x.Clinica.Ativa);
        var laudo = await UltimoAssinado(db, link.ExameId);
        return (link, laudo, e);
    }

    private static async Task Registrar(VetusDb db, HttpContext http, Guid exameId, int versao, string meio, string? destinatario)
    {
        var u = (await Acesso.UsuarioAtual(http, db))!;
        db.Compartilhamentos.Add(new Compartilhamento
        {
            ExameId = exameId, LaudoVersao = versao, Meio = meio, Destinatario = destinatario?.Length > 500 ? destinatario[..500] : destinatario,
            UsuarioId = u.Id, UsuarioNome = u.Nome,
        });
        await db.SaveChangesAsync();
    }

    private static string UrlPublica(IConfiguration cfg) => (cfg["VETUS_URL_PUBLICA"] ?? "http://localhost:5080").TrimEnd('/');
}

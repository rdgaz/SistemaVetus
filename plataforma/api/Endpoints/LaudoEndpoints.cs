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

        // Aprovar e assinar: só quem tem CRMV; depois disso o laudo não muda mais
        g.MapPost("/assinar", async (Guid id, AssinarReq? r, HttpContext http, VetusDb db) =>
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
            if (string.IsNullOrWhiteSpace(e.Paciente.Tutor?.Nome)) falta.Add("tutor");
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
            return Results.Ok(new { e.Status, l.Versao, l.CodigoVerificacao, l.AssinadoEm });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // Retificação: o laudo assinado fica guardado como "retificado" e abre uma nova versão para revisar e assinar
        g.MapPost("/retificar", async (Guid id, RetificarReq r, HttpContext http, VetusDb db) =>
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
            return Results.Ok(new { e.Status, versao = assinado.Versao + 1 });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // PDF: a versão assinada (ou uma pré-visualização marcada como rascunho). Sem X-Clinica-Id: abre em nova aba.
        app.MapGet("/api/exames/{id:guid}/laudo.pdf", async (Guid id, int? versao, HttpContext http, VetusDb db, PdfLaudo pdf) =>
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
            var nome = $"Laudo_{e.Paciente.Nome}_{e.Data}_v{l.Versao}.pdf".Replace(' ', '_');
            http.Response.Headers.ContentDisposition = $"inline; filename=\"{Uri.EscapeDataString(nome)}\"";
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
        if (c.TryGetProperty("prancha", out var p) && (p.ValueKind != JsonValueKind.Array || p.GetArrayLength() > 12))
            return "A prancha pode ter no máximo 12 fotos.";
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

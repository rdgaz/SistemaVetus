using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Logo da clínica e imagem da assinatura do veterinário (PNG ou JPG, até 500 KB).</summary>
public record UsoReq(bool Usar, string? Posicao = null);

public static class ImagemEndpoints
{
    private const int Maximo = 500 * 1024;
    private static readonly string[] Tipos = ["image/png", "image/jpeg"];

    public static void Mapear(WebApplication app)
    {
        // assinatura do próprio usuário
        app.MapGet("/api/auth/assinatura", async (HttpContext http, VetusDb db) =>
            await Servir(db, ImagemCadastro.Assinatura(Acesso.UsuarioId(http.User)!.Value))).RequireAuthorization();
        app.MapPut("/api/auth/assinatura", async (HttpContext http, VetusDb db) =>
            await Gravar(http, db, ImagemCadastro.Assinatura(Acesso.UsuarioId(http.User)!.Value))).RequireAuthorization();
        app.MapDelete("/api/auth/assinatura", async (HttpContext http, VetusDb db) =>
            await Apagar(db, ImagemCadastro.Assinatura(Acesso.UsuarioId(http.User)!.Value))).RequireAuthorization();

        // logo da clínica escolhida (administrador da clínica)
        app.MapPut("/api/clinica/logo", async (HttpContext http, VetusDb db) =>
            await Gravar(http, db, ImagemCadastro.Logo(http.VinculoAtual().ClinicaId))).ExigirClinica(Perfil.AdministradorClinica);
        app.MapDelete("/api/clinica/logo", async (HttpContext http, VetusDb db) =>
            await Apagar(db, ImagemCadastro.Logo(http.VinculoAtual().ClinicaId))).ExigirClinica(Perfil.AdministradorClinica);

        // "usar no laudo": liga/desliga a imagem sem apagá-la
        app.MapGet("/api/auth/assinatura/uso", async (HttpContext http, VetusDb db) =>
        {
            var id = Acesso.UsuarioId(http.User)!.Value;
            return Results.Ok(new
            {
                usar = await db.Usuarios.Where(u => u.Id == id).Select(u => u.UsarAssinatura).FirstOrDefaultAsync(),
                existe = await db.ImagensCadastro.AnyAsync(i => i.Chave == ImagemCadastro.Assinatura(id)),
            });
        }).RequireAuthorization();
        app.MapPut("/api/auth/assinatura/uso", async (UsoReq r, HttpContext http, VetusDb db) =>
        {
            var id = Acesso.UsuarioId(http.User)!.Value;
            await db.Usuarios.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.UsarAssinatura, r.Usar));
            return Results.NoContent();
        }).RequireAuthorization();
        app.MapGet("/api/clinica/logo/uso", async (HttpContext http, VetusDb db) =>
        {
            var id = http.VinculoAtual().ClinicaId;
            return Results.Ok(new
            {
                usar = await db.Clinicas.Where(c => c.Id == id).Select(c => c.UsarLogo).FirstOrDefaultAsync(),
                posicao = await db.Clinicas.Where(c => c.Id == id).Select(c => c.PosicaoLogo).FirstOrDefaultAsync(),
                existe = await db.ImagensCadastro.AnyAsync(i => i.Chave == ImagemCadastro.Logo(id)),
            });
        }).ExigirClinica();
        app.MapPut("/api/clinica/logo/uso", async (UsoReq r, HttpContext http, VetusDb db) =>
        {
            var id = http.VinculoAtual().ClinicaId;
            var pos = r.Posicao?.Trim().ToLowerInvariant();
            if (pos is not null && pos is not ("esquerda" or "centro" or "direita")) return Erros.Invalido("Posição do logo: esquerda, centro ou direita.");
            await db.Clinicas.Where(c => c.Id == id).ExecuteUpdateAsync(s => s.SetProperty(c => c.UsarLogo, r.Usar)
                .SetProperty(c => c.PosicaoLogo, c => pos ?? c.PosicaoLogo));
            return Results.NoContent();
        }).ExigirClinica(Perfil.AdministradorClinica);

        // logo para exibir (<img src>): qualquer usuário com acesso à clínica
        app.MapGet("/api/clinicas/{id:guid}/logo", async (Guid id, HttpContext http, VetusDb db) =>
        {
            var usuarioId = Acesso.UsuarioId(http.User);
            if (!await db.Vinculos.AnyAsync(v => v.ClinicaId == id && v.UsuarioId == usuarioId && v.Ativo)) return Results.NotFound();
            return await Servir(db, ImagemCadastro.Logo(id));
        }).RequireAuthorization();
    }

    private static async Task<IResult> Servir(VetusDb db, string chave)
    {
        var img = await db.ImagensCadastro.FindAsync(chave);
        return img is null ? Results.NotFound() : Results.File(img.Conteudo, img.Tipo);
    }

    /// <summary>Corpo da requisição = a imagem (Content-Type image/png ou image/jpeg).</summary>
    private static async Task<IResult> Gravar(HttpContext http, VetusDb db, string chave)
    {
        var tipo = (http.Request.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
        if (!Tipos.Contains(tipo)) return Erros.Invalido("Envie uma imagem PNG ou JPG.");
        using var ms = new MemoryStream();
        var buffer = new byte[16 * 1024];
        int lidos;
        while ((lidos = await http.Request.Body.ReadAsync(buffer)) > 0)
        {
            ms.Write(buffer, 0, lidos);
            if (ms.Length > Maximo) return Erros.Invalido("Imagem grande demais (máximo 500 KB).");
        }
        var bytes = ms.ToArray();
        // confere a assinatura do arquivo (não confiar só no Content-Type)
        var png = bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;
        var jpg = bytes.Length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
        if (!png && !jpg) return Erros.Invalido("O arquivo não é uma imagem PNG ou JPG válida.");

        var img = await db.ImagensCadastro.FindAsync(chave);
        if (img is null) db.ImagensCadastro.Add(img = new ImagemCadastro { Chave = chave });
        img.Tipo = png ? "image/png" : "image/jpeg";
        img.Conteudo = bytes;
        img.AtualizadoEm = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> Apagar(VetusDb db, string chave)
    {
        await db.ImagensCadastro.Where(x => x.Chave == chave).ExecuteDeleteAsync();
        return Results.NoContent();
    }
}

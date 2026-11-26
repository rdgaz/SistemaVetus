using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Login, sessão e dados do próprio usuário.</summary>
public static class AuthEndpoints
{
    public record EntrarReq(string? Email, string? Senha);
    public record MeusDadosReq(string? Nome, string? Crmv, string? CrmvUf);
    public record TrocarSenhaReq(string? SenhaAtual, string? NovaSenha);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/auth");

        g.MapPost("/entrar", async (EntrarReq r, VetusDb db, HttpContext http) =>
        {
            var email = Seguranca.NormalizarEmail(r.Email);
            var u = await db.Usuarios.FirstOrDefaultAsync(x => x.Email == email);
            if (u is null || !u.Ativo || !Seguranca.ConferirSenha(u, r.Senha ?? ""))
                return Erros.NaoAutorizado("E-mail ou senha incorretos.");
            await Acesso.Entrar(http, u);
            return Results.Ok(await MeuPerfil(db, u));
        }).RequireRateLimiting(Limites.Login);

        g.MapPost("/sair", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        g.MapGet("/eu", async (HttpContext http, VetusDb db) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            return u is null ? Results.Unauthorized() : Results.Ok(await MeuPerfil(db, u));
        }).RequireAuthorization();

        g.MapPut("/eu", async (MeusDadosReq r, HttpContext http, VetusDb db) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(r.Nome)) return Erros.Invalido("Informe o nome.");
            u.Nome = r.Nome.Trim();
            u.Crmv = Texto.Opcional(r.Crmv);
            u.CrmvUf = Texto.Opcional(r.CrmvUf)?.ToUpperInvariant();
            if (u.CrmvUf is { Length: not 2 }) return Erros.Invalido("UF do CRMV deve ter 2 letras.");
            await db.SaveChangesAsync();
            return Results.Ok(await MeuPerfil(db, u));
        }).RequireAuthorization();

        g.MapPut("/senha", async (TrocarSenhaReq r, HttpContext http, VetusDb db) =>
        {
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();
            if (!Seguranca.ConferirSenha(u, r.SenhaAtual ?? "")) return Erros.Invalido("Senha atual incorreta.");
            if (Seguranca.ValidarSenhaNova(r.NovaSenha) is { } erro) return Erros.Invalido(erro);
            if (r.NovaSenha == r.SenhaAtual) return Erros.Invalido("A nova senha deve ser diferente da atual.");
            u.SenhaHash = Seguranca.HashSenha(u, r.NovaSenha!);
            u.TrocarSenha = false;
            u.CarimboSeguranca = Guid.NewGuid(); // encerra as outras sessões
            await db.SaveChangesAsync();
            await Acesso.Entrar(http, u);        // mantém esta sessão
            return Results.NoContent();
        }).RequireAuthorization();
    }

    /// <summary>Dados do usuário e as clínicas que ele pode acessar.</summary>
    private static async Task<object> MeuPerfil(VetusDb db, Usuario u)
    {
        var clinicas = await db.Vinculos
            .Where(v => v.UsuarioId == u.Id && v.Ativo && v.Clinica.Ativa)
            .OrderBy(v => v.Clinica.Nome)
            .Select(v => new { id = v.ClinicaId, nome = v.Clinica.Nome, perfil = v.Perfil })
            .ToListAsync();
        var mentor = await db.PerfisMentor.AnyAsync(p => p.UsuarioId == u.Id && p.Ativo);
        return new { u.Id, u.Nome, u.Email, u.Crmv, u.CrmvUf, u.AdministradorSistema, u.TrocarSenha, mentor, clinicas };
    }
}

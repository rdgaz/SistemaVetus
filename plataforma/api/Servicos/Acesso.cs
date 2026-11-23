using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>Sessão (cookie) e controle de acesso por clínica.</summary>
public static class Acesso
{
    public const string CabecalhoClinica = "X-Clinica-Id";
    private const string ClaimCarimbo = "carimbo";
    private const string ItemVinculo = "vetus.vinculo";

    public static async Task Entrar(HttpContext http, Usuario u)
    {
        var identidade = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, u.Id.ToString()),
            new Claim(ClaimTypes.Name, u.Nome),
            new Claim(ClaimCarimbo, u.CarimboSeguranca.ToString()),
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identidade),
            new AuthenticationProperties { IsPersistent = true });
    }

    public static Guid? UsuarioId(ClaimsPrincipal p) =>
        Guid.TryParse(p.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>A cada requisição: a sessão só vale se o usuário continua ativo e não trocou a senha.</summary>
    public static async Task ValidarSessao(CookieValidatePrincipalContext ctx)
    {
        var id = ctx.Principal is null ? null : UsuarioId(ctx.Principal);
        var db = ctx.HttpContext.RequestServices.GetRequiredService<VetusDb>();
        var ok = id is not null
            && Guid.TryParse(ctx.Principal?.FindFirstValue(ClaimCarimbo), out var carimbo)
            && await db.Usuarios.AnyAsync(u => u.Id == id && u.Ativo && u.CarimboSeguranca == carimbo);
        if (!ok)
        {
            ctx.RejectPrincipal();
            await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    }

    /// <summary>Usuário logado (já validado pelo cookie).</summary>
    public static async Task<Usuario?> UsuarioAtual(HttpContext http, VetusDb db)
    {
        var id = UsuarioId(http.User);
        return id is null ? null : await db.Usuarios.FirstOrDefaultAsync(u => u.Id == id && u.Ativo);
    }

    /// <summary>Vínculo resolvido pelo filtro <see cref="ExigirClinica"/>.</summary>
    public static Vinculo VinculoAtual(this HttpContext http) => (Vinculo)http.Items[ItemVinculo]!;

    /// <summary>
    /// Filtro dos endpoints de clínica: exige o cabeçalho X-Clinica-Id de uma clínica ativa à qual o usuário
    /// tem vínculo ativo, com um dos perfis informados (vazio = qualquer perfil).
    /// </summary>
    public static RouteHandlerBuilder ExigirClinica(this RouteHandlerBuilder rota, params Perfil[] perfis) =>
        rota.RequireAuthorization().AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            if (!Guid.TryParse(http.Request.Headers[CabecalhoClinica], out var clinicaId))
                return Results.BadRequest(new { erro = "Escolha a clínica (cabeçalho X-Clinica-Id)." });
            var usuarioId = UsuarioId(http.User);
            var db = http.RequestServices.GetRequiredService<VetusDb>();
            var v = await db.Vinculos.Include(x => x.Clinica)
                .FirstOrDefaultAsync(x => x.UsuarioId == usuarioId && x.ClinicaId == clinicaId && x.Ativo && x.Clinica.Ativa);
            if (v is null) return Results.Json(new { erro = "Sem acesso a esta clínica." }, statusCode: 403);
            if (perfis.Length > 0 && !perfis.Contains(v.Perfil))
                return Results.Json(new { erro = "Seu perfil não permite esta ação." }, statusCode: 403);
            http.Items[ItemVinculo] = v;
            return await next(ctx);
        });

    /// <summary>Filtro dos endpoints de administração do sistema.</summary>
    public static RouteGroupBuilder ExigirAdministradorSistema(this RouteGroupBuilder grupo) =>
        grupo.RequireAuthorization().AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var id = UsuarioId(http.User);
            var db = http.RequestServices.GetRequiredService<VetusDb>();
            if (!await db.Usuarios.AnyAsync(u => u.Id == id && u.AdministradorSistema && u.Ativo))
                return Results.Json(new { erro = "Somente o administrador do sistema." }, statusCode: 403);
            return await next(ctx);
        });
}

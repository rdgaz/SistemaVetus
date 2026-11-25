using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Dados e usuários da clínica escolhida (cabeçalho X-Clinica-Id).</summary>
public static class ClinicaEndpoints
{
    public record DadosClinicaReq(string? Nome, string? Documento, string? Endereco, string? Telefone, string? Email,
        bool? GerarAutomaticamente, bool? InformacoesObrigatorias, bool? VerificacaoOnline);
    public record NovoUsuarioReq(string? Nome, string? Email, Perfil? Perfil, string? Crmv, string? CrmvUf);
    public record AlterarVinculoReq(Perfil? Perfil, bool? Ativo, bool? IdentidadePropria);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/clinica");

        g.MapGet("", (HttpContext http) =>
        {
            var v = http.VinculoAtual();
            var c = v.Clinica;
            return Results.Ok(new
            {
                c.Id, c.Nome, c.Documento, c.Endereco, c.Telefone, c.Email, c.AeTitle, c.GerarAutomaticamente, c.InformacoesObrigatorias, c.VerificacaoOnline,
                meuPerfil = v.Perfil,
            });
        }).ExigirClinica();

        g.MapPut("", async (DadosClinicaReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            if (string.IsNullOrWhiteSpace(r.Nome)) return Erros.Invalido("Informe o nome da clínica.");
            var c = http.VinculoAtual().Clinica;
            c.Nome = r.Nome.Trim();
            c.Documento = Texto.Opcional(r.Documento);
            c.Endereco = Texto.Opcional(r.Endereco);
            c.Telefone = Texto.Opcional(r.Telefone);
            c.Email = Texto.Opcional(r.Email);
            if (r.GerarAutomaticamente is { } auto) c.GerarAutomaticamente = auto;
            if (r.InformacoesObrigatorias is { } obrig) c.InformacoesObrigatorias = obrig;
            if (r.VerificacaoOnline is { } verif) c.VerificacaoOnline = verif;
            await db.SaveChangesAsync();
            await registros.Gravar(http, "clinica_alterada", "Dados e configurações da clínica alterados");
            return Results.NoContent();
        }).ExigirClinica(Perfil.AdministradorClinica);

        g.MapGet("/usuarios", async (HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            return Results.Ok(await db.Vinculos
                .Where(v => v.ClinicaId == clinicaId)
                .OrderByDescending(v => v.Ativo).ThenBy(v => v.Usuario.Nome)
                .Select(v => new
                {
                    usuarioId = v.UsuarioId, v.Usuario.Nome, v.Usuario.Email, v.Usuario.Crmv, v.Usuario.CrmvUf,
                    v.Perfil, v.IdentidadePropria, ativo = v.Ativo && v.Usuario.Ativo,
                })
                .ToListAsync());
        }).ExigirClinica(Perfil.AdministradorClinica);

        // Dá acesso a um usuário: cria a conta (com senha provisória) ou vincula uma conta existente
        g.MapPost("/usuarios", async (NovoUsuarioReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var email = Seguranca.NormalizarEmail(r.Email);
            if (!email.Contains('@')) return Erros.Invalido("Informe um e-mail válido.");
            var perfil = r.Perfil ?? Perfil.Usuario;
            var uf = Texto.Opcional(r.CrmvUf)?.ToUpperInvariant();
            if (uf is { Length: not 2 }) return Erros.Invalido("UF do CRMV deve ter 2 letras.");

            string? senhaProvisoria = null;
            var u = await db.Usuarios.FirstOrDefaultAsync(x => x.Email == email);
            if (u is null)
            {
                if (string.IsNullOrWhiteSpace(r.Nome)) return Erros.Invalido("Informe o nome.");
                senhaProvisoria = Seguranca.GerarSenhaProvisoria();
                u = new Usuario
                {
                    Nome = r.Nome.Trim(), Email = email, TrocarSenha = true,
                    Crmv = Texto.Opcional(r.Crmv), CrmvUf = uf,
                };
                u.SenhaHash = Seguranca.HashSenha(u, senhaProvisoria);
                db.Usuarios.Add(u);
            }
            else if (await db.Vinculos.AnyAsync(v => v.UsuarioId == u.Id && v.ClinicaId == clinicaId))
            {
                return Erros.Conflito("Este e-mail já tem acesso à clínica.");
            }

            db.Vinculos.Add(new Vinculo { Usuario = u, ClinicaId = clinicaId, Perfil = perfil });
            await db.SaveChangesAsync();
            await registros.Gravar(http, "usuario_criado", $"{u.Nome} ({u.Email}) adicionado à clínica como {perfil}");
            return Results.Created($"/api/clinica/usuarios/{u.Id}", new
            {
                usuarioId = u.Id, u.Nome, u.Email, perfil,
                contaNova = senhaProvisoria is not null,
                senhaProvisoria, // mostrada só agora; o usuário troca no primeiro acesso
            });
        }).ExigirClinica(Perfil.AdministradorClinica);

        g.MapPut("/usuarios/{usuarioId:guid}", async (Guid usuarioId, AlterarVinculoReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var v = await db.Vinculos.FirstOrDefaultAsync(x => x.UsuarioId == usuarioId && x.ClinicaId == clinicaId);
            if (v is null) return Erros.NaoEncontrado("Usuário não encontrado nesta clínica.");

            var novoPerfil = r.Perfil ?? v.Perfil;
            var novoAtivo = r.Ativo ?? v.Ativo;
            var deixaDeSerAdmin = v.Ativo && v.Perfil == Perfil.AdministradorClinica
                && (novoPerfil != Perfil.AdministradorClinica || !novoAtivo);
            if (deixaDeSerAdmin && !await db.Vinculos.AnyAsync(x => x.ClinicaId == clinicaId && x.Id != v.Id
                    && x.Ativo && x.Perfil == Perfil.AdministradorClinica && x.Usuario.Ativo))
                return Erros.Invalido("A clínica precisa de pelo menos um administrador ativo.");

            v.Perfil = novoPerfil;
            v.Ativo = novoAtivo;
            if (r.IdentidadePropria is { } propria) v.IdentidadePropria = propria;
            var alvo = await db.Usuarios.Where(x => x.Id == usuarioId).Select(x => new { x.Nome, x.Email }).FirstAsync();
            await registros.Adicionar(http, "usuario_alterado",
                $"{alvo.Nome} ({alvo.Email}): {(novoAtivo ? "ativo" : "desativado")}, perfil {novoPerfil}");
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica(Perfil.AdministradorClinica);
    }
}

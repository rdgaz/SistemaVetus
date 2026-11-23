using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Administração do sistema: cadastro de clínicas.</summary>
public static class AdminEndpoints
{
    public record AdministradorReq(string? Nome, string? Email);
    public record NovaClinicaReq(string? Nome, string? Documento, string? Endereco, string? Telefone, string? Email,
        AdministradorReq? Administrador);
    public record ClinicaReq(string? Nome, string? Documento, string? Endereco, string? Telefone, string? Email, bool? Ativa);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/admin").ExigirAdministradorSistema();

        g.MapGet("/clinicas", async (VetusDb db) => Results.Ok(await db.Clinicas
            .OrderBy(c => c.Numero)
            .Select(c => new
            {
                c.Id, c.Numero, c.Nome, c.Documento, c.Endereco, c.Telefone, c.Email, c.AeTitle, c.Ativa, c.CriadaEm, c.SaldoBrl,
                usuarios = c.Vinculos.Count(v => v.Ativo),
                administradores = c.Vinculos
                    .Where(v => v.Ativo && v.Perfil == Perfil.AdministradorClinica)
                    .Select(v => new { v.Usuario.Nome, v.Usuario.Email }).ToList(),
            })
            .ToListAsync()));

        // Cria a clínica, o AE Title, o token de ingestão e o administrador da clínica
        g.MapPost("/clinicas", async (NovaClinicaReq r, VetusDb db, Cobranca cobranca) =>
        {
            if (string.IsNullOrWhiteSpace(r.Nome)) return Erros.Invalido("Informe o nome da clínica.");
            var adm = r.Administrador;
            var emailAdm = Seguranca.NormalizarEmail(adm?.Email);
            if (!emailAdm.Contains('@')) return Erros.Invalido("Informe o e-mail do administrador da clínica.");

            var numero = (await db.Clinicas.MaxAsync(c => (int?)c.Numero) ?? 0) + 1;
            var token = Seguranca.GerarToken();
            var clinica = new Clinica
            {
                Numero = numero,
                Nome = r.Nome.Trim(),
                Documento = Texto.Opcional(r.Documento),
                Endereco = Texto.Opcional(r.Endereco),
                Telefone = Texto.Opcional(r.Telefone),
                Email = Texto.Opcional(r.Email),
                AeTitle = $"VETUS_C{numero:D4}",
                TokenIngestaoHash = Seguranca.HashToken(token),
            };
            db.Clinicas.Add(clinica);

            // o administrador pode já ter conta (ex.: veterinário que atende outras clínicas)
            string? senhaProvisoria = null;
            var usuario = await db.Usuarios.FirstOrDefaultAsync(u => u.Email == emailAdm);
            if (usuario is null)
            {
                if (string.IsNullOrWhiteSpace(adm!.Nome)) return Erros.Invalido("Informe o nome do administrador da clínica.");
                senhaProvisoria = Seguranca.GerarSenhaProvisoria();
                usuario = new Usuario { Nome = adm.Nome.Trim(), Email = emailAdm, TrocarSenha = true };
                usuario.SenhaHash = Seguranca.HashSenha(usuario, senhaProvisoria);
                db.Usuarios.Add(usuario);
            }
            db.Vinculos.Add(new Vinculo { Usuario = usuario, Clinica = clinica, Perfil = Perfil.AdministradorClinica });
            await db.SaveChangesAsync();

            // crédito inicial para os pré-laudos (configurável em Cobrança)
            var credito = (await cobranca.Config()).CreditoInicialClinica;
            if (credito > 0) await cobranca.Movimentar(clinica.Id, credito, "credito_inicial", "Crédito inicial");

            return Results.Created($"/api/admin/clinicas/{clinica.Id}", new
            {
                clinica.Id, clinica.Numero, clinica.Nome, clinica.AeTitle,
                tokenIngestao = token, // mostrado só agora
                administrador = new { usuario.Nome, usuario.Email, contaNova = senhaProvisoria is not null, senhaProvisoria },
            });
        });

        g.MapPut("/clinicas/{id:guid}", async (Guid id, ClinicaReq r, VetusDb db) =>
        {
            var c = await db.Clinicas.FindAsync(id);
            if (c is null) return Erros.NaoEncontrado("Clínica não encontrada.");
            if (string.IsNullOrWhiteSpace(r.Nome)) return Erros.Invalido("Informe o nome da clínica.");
            c.Nome = r.Nome.Trim();
            c.Documento = Texto.Opcional(r.Documento);
            c.Endereco = Texto.Opcional(r.Endereco);
            c.Telefone = Texto.Opcional(r.Telefone);
            c.Email = Texto.Opcional(r.Email);
            if (r.Ativa is { } ativa) c.Ativa = ativa;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Gera um novo token da API de ingestão (o anterior deixa de valer)
        g.MapPost("/clinicas/{id:guid}/token-ingestao", async (Guid id, VetusDb db) =>
        {
            var c = await db.Clinicas.FindAsync(id);
            if (c is null) return Erros.NaoEncontrado("Clínica não encontrada.");
            var token = Seguranca.GerarToken();
            c.TokenIngestaoHash = Seguranca.HashToken(token);
            await db.SaveChangesAsync();
            return Results.Ok(new { tokenIngestao = token });
        });
    }
}

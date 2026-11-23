using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// API de ingestão: servidores locais das clínicas enviam exames já processados.
/// Ainda NÃO implementada: fica desativada (INGESTAO_HABILITADA=false) e responde 503.
/// </summary>
public static class IngestaoEndpoints
{
    public static void Mapear(WebApplication app)
    {
        app.MapPost("/api/ingestao/exames", async (HttpContext http, VetusDb db, IConfiguration cfg) =>
        {
            if (!cfg.GetValue("INGESTAO_HABILITADA", false))
                return Results.Json(new { erro = "Ingestão ainda não disponível." }, statusCode: 503);

            // autenticação pelo token da clínica: "Authorization: Bearer <token>"
            var auth = http.Request.Headers.Authorization.ToString();
            var token = auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..].Trim() : "";
            var hash = Seguranca.HashToken(token);
            var clinica = token.Length == 0 ? null
                : await db.Clinicas.FirstOrDefaultAsync(c => c.TokenIngestaoHash == hash && c.Ativa);
            if (clinica is null) return Erros.NaoAutorizado("Token de ingestão inválido.");

            return Results.Json(new { erro = "Ingestão em desenvolvimento." }, statusCode: 501);
        });
    }
}

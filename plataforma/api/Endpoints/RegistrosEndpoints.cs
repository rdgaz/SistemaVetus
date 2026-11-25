using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Registro de atividades (quem fez o quê e quando): a clínica vê os seus; o administrador do sistema vê todos.</summary>
public static class RegistrosEndpoints
{
    public static void Mapear(WebApplication app)
    {
        // administrador da clínica: atividades da própria clínica
        app.MapGet("/api/clinica/registros", async (string? tipo, DateOnly? de, DateOnly? ate, HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            return Results.Ok(new { tipos = RegistroAtividades.Tipos, registros = await Filtrar(db.RegistrosAtividade.Where(x => x.ClinicaId == clinicaId), tipo, de, ate) });
        }).ExigirClinica(Perfil.AdministradorClinica);

        // administrador do sistema: atividades de todas as clínicas
        app.MapGroup("/api/admin").ExigirAdministradorSistema().MapGet("/registros", async (string? tipo, DateOnly? de, DateOnly? ate, VetusDb db) =>
            Results.Ok(new { tipos = RegistroAtividades.Tipos, registros = await Filtrar(db.RegistrosAtividade, tipo, de, ate) }));
    }

    private static Task<List<RegistroAtividade>> Filtrar(IQueryable<RegistroAtividade> q, string? tipo, DateOnly? de, DateOnly? ate)
    {
        if (!string.IsNullOrWhiteSpace(tipo)) q = q.Where(x => x.Tipo == tipo);
        if (de is { } d) { var inicio = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); q = q.Where(x => x.Em >= inicio); }
        if (ate is { } a) { var fim = a.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); q = q.Where(x => x.Em < fim); }
        return q.OrderByDescending(x => x.Em).Take(1000).ToListAsync();
    }
}

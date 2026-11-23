using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Valores de referência: cadastro (administrador do sistema).</summary>
public static class ReferenciaEndpoints
{
    public record ReferenciaReq(string? Especie, decimal? PesoMinKg, decimal? PesoMaxKg, string? Orgao, string? Medida,
        decimal? Minimo, decimal? Maximo, string? Unidade, string? Termos, string? Observacao, string? Fonte, bool Ativa = true);

    private static readonly string[] Unidades = ["mm", "cm", "razão"];

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/admin/referencias").ExigirAdministradorSistema();

        g.MapGet("", async (VetusDb db) => Results.Ok(await db.Referencias
            .OrderBy(r => r.Especie).ThenBy(r => r.Orgao).ThenBy(r => r.Medida).ThenBy(r => r.PesoMinKg)
            .ToListAsync()));

        g.MapPost("", async (ReferenciaReq r, VetusDb db) =>
        {
            var nova = new Referencia();
            if (Aplicar(nova, r) is { } erro) return Erros.Invalido(erro);
            db.Referencias.Add(nova);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/referencias/{nova.Id}", nova);
        });

        g.MapPut("/{id:guid}", async (Guid id, ReferenciaReq r, VetusDb db) =>
        {
            var atual = await db.Referencias.FindAsync(id);
            if (atual is null) return Erros.NaoEncontrado("Referência não encontrada.");
            if (Aplicar(atual, r) is { } erro) return Erros.Invalido(erro);
            await db.SaveChangesAsync();
            return Results.Ok(atual);
        });

        g.MapDelete("/{id:guid}", async (Guid id, VetusDb db) =>
            await db.Referencias.Where(x => x.Id == id).ExecuteDeleteAsync() == 0
                ? Erros.NaoEncontrado("Referência não encontrada.") : Results.NoContent());
    }

    private static string? Aplicar(Referencia x, ReferenciaReq r)
    {
        var especie = Texto.Opcional(r.Especie);
        var orgao = Texto.Opcional(r.Orgao);
        var medida = Texto.Opcional(r.Medida);
        var unidade = Texto.Opcional(r.Unidade) ?? "mm";
        if (especie is null || orgao is null || medida is null) return "Informe espécie, órgão e medida.";
        if (!Unidades.Contains(unidade)) return "Unidade deve ser mm, cm ou razão.";
        if (r.Minimo is null && r.Maximo is null) return "Informe o mínimo, o máximo ou os dois.";
        if (r.Minimo is { } a && r.Maximo is { } b && a > b) return "O mínimo é maior que o máximo.";
        if (r.PesoMinKg is { } pa && r.PesoMaxKg is { } pb && pa >= pb) return "Faixa de peso inválida.";
        if (Texto.Opcional(r.Fonte) is null) return "Informe a fonte (referência bibliográfica).";
        x.Especie = especie;
        x.Orgao = orgao;
        x.Medida = medida;
        x.Unidade = unidade;
        x.Minimo = r.Minimo;
        x.Maximo = r.Maximo;
        x.PesoMinKg = r.PesoMinKg;
        x.PesoMaxKg = r.PesoMaxKg;
        x.Termos = Texto.Opcional(r.Termos);
        x.Observacao = Texto.Opcional(r.Observacao);
        x.Fonte = r.Fonte!.Trim();
        x.Ativa = r.Ativa;
        return null;
    }
}

using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Escala calibrada por toque (pixels por cm) para sugerir medidas no editor de imagens quando a régua da foto não é
/// detectada. Vale para a clínica inteira, por aparelho e tamanho de imagem.
/// </summary>
public static class CalibracaoEndpoints
{
    public record CalibracaoReq(string? Equipamento, int Largura, int Altura, decimal PxPorCm);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/clinica/calibracao");

        g.MapGet("", async (string? equipamento, int largura, int altura, HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var eq = Chave(equipamento);
            var c = await db.CalibracoesImagem.FirstOrDefaultAsync(x => x.ClinicaId == clinicaId && x.Equipamento == eq && x.Largura == largura && x.Altura == altura);
            return Results.Ok(c is null ? new { PxPorCm = (decimal?)null, UsuarioNome = (string?)null, AtualizadoEm = (DateTime?)null }
                : new { PxPorCm = (decimal?)c.PxPorCm, UsuarioNome = (string?)c.UsuarioNome, AtualizadoEm = (DateTime?)c.AtualizadoEm });
        }).ExigirClinica();

        g.MapPut("", async (CalibracaoReq r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            if (r.Largura is < 50 or > 10000 || r.Altura is < 50 or > 10000) return Erros.Invalido("Tamanho de imagem inválido.");
            if (r.PxPorCm is < 5m or > 2000m) return Erros.Invalido("Escala inválida: marque dois pontos mais distantes na régua.");
            var v = http.VinculoAtual();
            var u = (await Acesso.UsuarioAtual(http, db))!;
            var eq = Chave(r.Equipamento);
            var c = await db.CalibracoesImagem.FirstOrDefaultAsync(x => x.ClinicaId == v.ClinicaId && x.Equipamento == eq && x.Largura == r.Largura && x.Altura == r.Altura);
            if (c is null) db.CalibracoesImagem.Add(c = new CalibracaoImagem { ClinicaId = v.ClinicaId, Equipamento = eq, Largura = r.Largura, Altura = r.Altura });
            c.PxPorCm = Math.Round(r.PxPorCm, 2);
            c.UsuarioId = u.Id; c.UsuarioNome = u.Nome; c.AtualizadoEm = DateTime.UtcNow;
            await registros.Adicionar(http, "escala_calibrada", $"Escala das fotos calibrada: {c.PxPorCm:0.##} px/cm ({(eq == "" ? "aparelho não informado" : eq)}, {r.Largura}×{r.Altura})");
            await db.SaveChangesAsync();
            return Results.Ok(new { c.PxPorCm, c.UsuarioNome, c.AtualizadoEm });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);
    }

    private static string Chave(string? equipamento)
    {
        var t = (equipamento ?? "").Trim();
        return t.Length > 120 ? t[..120] : t;
    }
}

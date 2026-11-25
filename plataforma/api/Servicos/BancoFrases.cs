using System.Text;
using System.Text.Json;

namespace Vetus.Api.Servicos;

public record EntradaFrase(string Titulo, string Descricao, List<string> Impressoes);
public record BlocoFrases(string Nome, List<EntradaFrase> Entradas);

/// <summary>
/// Banco de frases padrão dos laudos (modelo "Laudo Fácil" da clínica): para cada órgão, as frases de normalidade e de
/// cada alteração, com a impressão diagnóstica correspondente. Alimenta a IA (estilo de redação) e a escolha de
/// "frase pronta" na revisão. Os números e opções (0,0 cm; baixa/moderada/acentuada) são preenchidos pelo laudo.
/// </summary>
public class BancoFrases
{
    private readonly Lazy<List<BlocoFrases>> _blocos = new(() =>
    {
        var caminho = Path.Combine(AppContext.BaseDirectory, "Recursos", "frases.json");
        if (!File.Exists(caminho)) return [];
        using var doc = JsonDocument.Parse(File.ReadAllText(caminho));
        return doc.RootElement.GetProperty("blocos").EnumerateArray().Select(b => new BlocoFrases(
            b.GetProperty("nome").GetString()!,
            b.GetProperty("entradas").EnumerateArray().Select(e => new EntradaFrase(
                e.GetProperty("titulo").GetString()!,
                e.GetProperty("descricao").GetString()!,
                e.GetProperty("impressoes").EnumerateArray().Select(i => i.GetString()!).ToList())).ToList())).ToList();
    });

    public IReadOnlyList<BlocoFrases> Blocos => _blocos.Value;

    private static readonly string[] BlocosAbdominais =
        ["Vesícula urinária", "Rins", "Adrenais", "Baço", "Estômago", "Fígado", "Vesícula biliar", "Intestino", "Pâncreas", "Linfonodos"];

    /// <summary>Bloco do banco que corresponde a um órgão do laudo (ex.: "Rim esquerdo" -> "Rins").</summary>
    public static string? BlocoDoOrgao(string? orgao)
    {
        var o = (orgao ?? "").Trim().ToLowerInvariant();
        if (o.StartsWith("rim") || o.StartsWith("rins")) return "Rins";
        if (o.StartsWith("bexiga") || o.StartsWith("vesícula urin") || o.StartsWith("vesicula urin")) return "Vesícula urinária";
        if (o.StartsWith("vesícula bil") || o.StartsWith("vesicula bil")) return "Vesícula biliar";
        if (o.StartsWith("alças") || o.StartsWith("alcas") || o.StartsWith("intestin")) return "Intestino";
        if (o.StartsWith("próstata") || o.StartsWith("prostata")) return "Próstata";
        if (o.StartsWith("testícul") || o.StartsWith("testicul")) return "Testículos";
        if (o.StartsWith("útero") || o.StartsWith("utero")) return "Útero";
        if (o.StartsWith("ovário") || o.StartsWith("ovario")) return "Ovários";
        if (o.StartsWith("fígado") || o.StartsWith("figado")) return "Fígado";
        if (o.StartsWith("baço") || o.StartsWith("baco")) return "Baço";
        if (o.StartsWith("estômago") || o.StartsWith("estomago")) return "Estômago";
        if (o.StartsWith("pâncreas") || o.StartsWith("pancreas")) return "Pâncreas";
        if (o.StartsWith("adrenal")) return "Adrenais";
        if (o.StartsWith("linfonod")) return "Linfonodos";
        if (o.StartsWith("glândula") || o.StartsWith("glandula") || o.StartsWith("mama")) return "Glândulas mamárias";
        return null;
    }

    public BlocoFrases? Bloco(string? nome) => Blocos.FirstOrDefault(b => b.Nome == nome);

    /// <summary>Texto do banco para o prompt da IA: só os órgãos do exame (abdominal: conforme o sexo; gestacional; A-FAST).</summary>
    public string ParaIa(string? tipoExame, string? sexo)
    {
        var nomes = tipoExame switch
        {
            "gestacional" => new[] { "Gestacional" },
            "fast" => new[] { "FAST abdominal (A-FAST)" },
            "abdominal" or null => BlocosAbdominais.Concat(sexo switch
            {
                "M" => ["Próstata", "Testículos"],
                "F" => ["Útero", "Ovários"],
                _ => ["Próstata", "Testículos", "Útero", "Ovários"],
            }).ToArray(),
            _ => [],
        };
        var t = new StringBuilder();
        foreach (var b in Blocos.Where(b => nomes.Contains(b.Nome)))
        {
            t.AppendLine($"## {b.Nome}");
            foreach (var e in b.Entradas)
            {
                t.Append($"- {e.Titulo}: {e.Descricao.Replace("\n", " / ")}");
                if (e.Impressoes.Count > 0) t.Append($" => IMPRESSÃO: {string.Join(" | ", e.Impressoes)}");
                t.AppendLine();
            }
        }
        return t.ToString().TrimEnd();
    }
}

namespace Vetus.Api.Dados;

/// <summary>Tipos de exame de ultrassom (cada um terá o seu modelo de laudo e valores de referência).</summary>
public static class TiposExame
{
    public static readonly IReadOnlyDictionary<string, string> Todos = new Dictionary<string, string>
    {
        ["abdominal"] = "Ultrassonografia abdominal",
        ["gestacional"] = "Ultrassonografia gestacional",
        ["cervical"] = "Ultrassonografia cervical",
        ["ocular"] = "Ultrassonografia ocular",
        ["musculoesqueletico"] = "Ultrassonografia musculoesquelética",
        ["toracico"] = "Ultrassonografia torácica",
        ["fast"] = "A-FAST / T-FAST (emergência)",
    };

    public static bool Valido(string? codigo) => codigo is not null && Todos.ContainsKey(codigo);

    /// <summary>Tipo sugerido a partir da descrição que vem do aparelho (ex.: "ABD" -> abdominal).</summary>
    public static string? DoAparelho(string? descricao)
    {
        var d = (descricao ?? "").Trim().ToUpperInvariant();
        if (d.StartsWith("ABD")) return "abdominal";
        if (d.StartsWith("OB") || d.Contains("GEST")) return "gestacional";
        if (d.Contains("THY") || d.Contains("CERV")) return "cervical";
        if (d.Contains("EYE") || d.Contains("OCUL") || d.Contains("OFT")) return "ocular";
        if (d.Contains("MSK") || d.Contains("MUSC")) return "musculoesqueletico";
        if (d.Contains("FAST")) return "fast";
        return null;
    }
}

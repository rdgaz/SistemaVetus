using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>Uma medida do aparelho comparada com a referência (quando há uma que combine).</summary>
public record MedidaComparada(string Grupo, string Nome, decimal Valor, string Unidade,
    Guid? ReferenciaId, string? Referencia, string? FaixaTexto, string Situacao);

/// <summary>
/// Valores de referência: quais valem para o paciente (espécie e peso), comparação com as medidas
/// do aparelho e o texto que vai para a IA.
/// </summary>
public partial class Referencias(VetusDb db)
{
    public const string Dentro = "dentro", Acima = "acima", Abaixo = "abaixo", SemReferencia = "sem_referencia";

    /// <summary>"4,2 kg" → 4.2; "800 g" → 0.8; sem número → null.</summary>
    public static decimal? PesoKg(string? peso)
    {
        if (string.IsNullOrWhiteSpace(peso)) return null;
        var m = Numero().Match(peso);
        if (!m.Success || !decimal.TryParse(m.Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var v)) return null;
        var t = peso.ToLowerInvariant();
        return t.Contains("kg") || !Regex.IsMatch(t, @"\d\s*g\b") ? v : v / 1000m;
    }

    /// <summary>Referências ativas da espécie; com peso conhecido, só as da faixa de peso.</summary>
    public async Task<List<Referencia>> Aplicaveis(string? especie, decimal? pesoKg)
    {
        if (string.IsNullOrWhiteSpace(especie)) return [];
        var lista = await db.Referencias.Where(r => r.Ativa && r.Especie == especie)
            .OrderBy(r => r.Orgao).ThenBy(r => r.Medida).ThenBy(r => r.PesoMinKg).ToListAsync();
        return pesoKg is not { } p ? lista
            : lista.Where(r => (r.PesoMinKg is null || p >= r.PesoMinKg) && (r.PesoMaxKg is null || p < r.PesoMaxKg)).ToList();
    }

    public static string Faixa(Referencia r)
    {
        static string N(decimal v) => v.ToString("0.###", CultureInfo.GetCultureInfo("pt-BR"));
        var u = r.Unidade == "razão" ? "" : $" {r.Unidade}";
        var faixa = (r.Minimo, r.Maximo) switch
        {
            ({ } a, { } b) => $"{N(a)} a {N(b)}{u}",
            (null, { } b) => $"até {N(b)}{u}",
            ({ } a, null) => $"a partir de {N(a)}{u}",
            _ => "—",
        };
        var peso = (r.PesoMinKg, r.PesoMaxKg) switch
        {
            ({ } a, { } b) => $" (de {N(a)} a {N(b)} kg)",
            (null, { } b) => $" (abaixo de {N(b)} kg)",
            ({ } a, null) => $" (a partir de {N(a)} kg)",
            _ => "",
        };
        return faixa + peso;
    }

    /// <summary>Compara cada medida do aparelho (medidas.json) com a referência cujos termos combinam.</summary>
    public static List<MedidaComparada> Comparar(JsonElement? medidas, List<Referencia> refs)
    {
        var lista = new List<MedidaComparada>();
        if (medidas is not { ValueKind: JsonValueKind.Array } arr) return lista;
        foreach (var m in arr.EnumerateArray())
        {
            string Txt(string k) => m.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            if (!m.TryGetProperty("valor", out var vv) || !vv.TryGetDecimal(out var valor)) continue;
            var grupo = Txt("grupo");
            var nome = Txt("nome");
            var unidade = Txt("unidade");
            var texto = SemAcento($"{grupo} {nome}");
            var r = refs.FirstOrDefault(x => Combina(texto, x.Termos));
            if (r is null)
            {
                lista.Add(new(grupo, nome, valor, unidade, null, null, null, SemReferencia));
                continue;
            }
            var convertido = Converter(valor, unidade, r.Unidade);
            var situacao = convertido is not { } c ? SemReferencia
                : r.Minimo is { } min && c < min ? Abaixo
                : r.Maximo is { } max && c > max ? Acima
                : Dentro;
            lista.Add(new(grupo, nome, valor, unidade, r.Id, $"{r.Orgao}: {r.Medida}", Faixa(r), situacao));
        }
        return lista;
    }

    /// <summary>Bloco de texto com as referências para o prompt da IA.</summary>
    public static string TextoParaIa(string? especie, decimal? pesoKg, List<Referencia> refs)
    {
        if (refs.Count == 0) return "(nenhuma cadastrada para esta espécie)";
        var t = new StringBuilder();
        t.AppendLine($"Espécie: {especie}; peso: {(pesoKg is { } p ? $"{p:0.###} kg" : "não informado (todas as faixas de peso)")}.");
        foreach (var r in refs)
            t.AppendLine($"- {r.Orgao} — {r.Medida}: {Faixa(r)}{(string.IsNullOrWhiteSpace(r.Observacao) ? "" : $". {r.Observacao}")}");
        return t.ToString().TrimEnd();
    }

    /// <summary>"rim comp, kidney len": algum item em que TODAS as palavras aparecem no texto.</summary>
    private static bool Combina(string texto, string? termos) =>
        !string.IsNullOrWhiteSpace(termos) && termos.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(item => SemAcento(item).Split(' ', StringSplitOptions.RemoveEmptyEntries).All(texto.Contains));

    private static decimal? Converter(decimal valor, string de, string para)
    {
        de = de.Trim().ToLowerInvariant();
        para = para.Trim().ToLowerInvariant();
        if (para == "razão" || de == para || de == "") return valor;
        return (de, para) switch
        {
            ("cm", "mm") => valor * 10,
            ("mm", "cm") => valor / 10,
            ("m", "cm") => valor * 100,
            ("m", "mm") => valor * 1000,
            _ => null, // unidades incompatíveis: não compara
        };
    }

    private static string SemAcento(string s)
    {
        var n = s.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        return new string(n.Where(ch => CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark).ToArray());
    }

    [GeneratedRegex(@"\d+(?:[.,]\d+)?")]
    private static partial Regex Numero();
}

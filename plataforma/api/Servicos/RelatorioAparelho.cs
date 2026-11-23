using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace Vetus.Api.Servicos;

/// <summary>Medida impressa pelo aparelho no relatório (ex.: "HD cão 1.68cm 6w3d", "GB L: 3.70cm").</summary>
public record MedidaRelatorio(string? Grupo, string Nome, decimal? Valor, string? Unidade, string? Complemento);

/// <summary>Dados que o ultrassom imprime no PDF do exame (pasta exportada para o pendrive).</summary>
public record DadosRelatorio
{
    public string? Instituicao { get; init; }
    public string? Nome { get; init; }
    /// <summary>Animal como o aparelho abrevia (ex.: "Fel", "Cach.(5-15kg)", "Cachorro (> 15 kg)").</summary>
    public string? Animal { get; init; }
    public string? Tutor { get; init; }
    public string? IdAnimal { get; init; }
    public string? IdOutros { get; init; }
    public string? Nascimento { get; init; }   // AAAAMMDD
    public string? Idade { get; init; }        // ex.: "10 anos"
    public string? Sexo { get; init; }         // F, M ou null (Desc)
    public bool? Castrado { get; init; }
    /// <summary>Predefinição do aparelho (ex.: "Caninos (5-15kg) Abdômen", "GATO P", "Reprodução de felinos").</summary>
    public string? Predefinicao { get; init; }
    /// <summary>Aplicação, do rodapé da página (ex.: "Abdômen", "Reprodução", "Small Parts").</summary>
    public string? Aplicacao { get; init; }
    public string? Data { get; init; }         // AAAAMMDD
    public string? MedicoIndicado { get; init; }
    public string? Equipamento { get; init; }
    public string? Operador { get; init; }
    /// <summary>"Comentários clínicos" e "Coment." digitados no aparelho.</summary>
    public string? Comentarios { get; init; }
    public List<MedidaRelatorio> Medidas { get; init; } = [];
    public string Texto { get; init; } = "";
}

/// <summary>
/// Lê o PDF que o ultrassom (Mindray Vetus) grava junto com as fotos ao exportar o exame para o pendrive.
/// É uma página com rótulos fixos ("Nome:", "Animal Owner:", "ID animal:"...); alguns rótulos e valores longos
/// quebram de linha ("Animal" / "Owner:"), por isso o cabeçalho é lido como um texto só.
/// </summary>
public static partial class RelatorioAparelho
{
    public static DadosRelatorio Ler(Stream pdf)
    {
        using var ms = new MemoryStream();
        pdf.CopyTo(ms);
        using var doc = PdfDocument.Open(ms.ToArray());
        var sb = new StringBuilder();
        foreach (var p in doc.GetPages()) sb.AppendLine(ContentOrderTextExtractor.GetText(p));
        return Interpretar(sb.ToString());
    }

    private static readonly string[] Rotulos =
        ["Animal Owner:", "Animal:", "ID animal:", "ID outros:", "DOB:", "Idd:", "Sexo:", "Esterilização:", "Nome:"];

    public static DadosRelatorio Interpretar(string texto)
    {
        var linhas = texto.Replace("\r", "").Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
        int Achar(Func<string, bool> f, int de = 0) { for (var i = Math.Max(de, 0); i < linhas.Count; i++) if (f(linhas[i])) return i; return -1; }
        bool Comeca(string l, string r) => l.StartsWith(r, StringComparison.Ordinal);
        string? Depois(string rotulo) => linhas.FirstOrDefault(l => Comeca(l, rotulo)) is { } l ? Opcional(l[rotulo.Length..]) : null;

        // instituição: a linha depois de "Assinat. (selo)"
        var iAss = Achar(l => Comeca(l, "Assinat."));
        var instituicao = iAss >= 0 && iAss + 1 < linhas.Count && !Comeca(linhas[iAss + 1], "Nome:") ? linhas[iAss + 1] : null;

        // cabeçalho do paciente: de "Nome:" até "Telephone:", como um texto só
        var iNome = Achar(l => Comeca(l, "Nome:"));
        var iTel = Achar(l => Comeca(l, "Telephone:"), iNome);
        var cab = iNome < 0 ? "" : string.Join(' ', linhas[iNome..(iTel > iNome ? iTel : Math.Min(iNome + 6, linhas.Count))]);
        cab = EspacosRegex().Replace(cab, " ");
        int Posicao(string rotulo, int de) => rotulo == "Animal:"
            ? (AnimalRegex().Match(cab, de) is { Success: true } m ? m.Index : -1)
            : cab.IndexOf(rotulo, de, StringComparison.Ordinal);
        string? Campo(string rotulo)
        {
            var i = Posicao(rotulo, 0);
            if (i < 0) return null;
            var ini = i + rotulo.Length;
            var fim = cab.Length;
            foreach (var r in Rotulos)
                if (Posicao(r, ini) is var j and >= 0 && j < fim) fim = j;
            return Opcional(cab[ini..fim]);
        }

        // predefinição: entre "Endereço Web:" e "Dt exame:"
        var iWeb = Achar(l => Comeca(l, "Endereço Web:"));
        var iDt = Achar(l => Comeca(l, "Dt exame:"));
        var predef = iWeb >= 0 && iDt > iWeb + 1 ? string.Join(' ', linhas[(iWeb + 1)..iDt]) : null;

        // rodapé "Abdômen - 1/1 Page": a aplicação; antes dele (depois de "Oper:"), os comentários clínicos;
        // depois dele, as medidas até "Coment.:"
        var iRod = Achar(l => RodapeRegex().IsMatch(l));
        var aplicacao = iRod >= 0 ? RodapeRegex().Match(linhas[iRod]).Groups[1].Value : null;
        var iOper = Achar(l => Comeca(l, "Oper:"));
        var comentarios = new List<string>();
        if (iOper >= 0 && iRod > iOper)
        {
            var bloco = linhas[(iOper + 1)..iRod];
            var iCc = bloco.FindIndex(l => Comeca(l, "Comentários clínicos:"));
            if (iCc >= 0)
            {
                var c = string.Join(' ', new[] { bloco[iCc]["Comentários clínicos:".Length..].Trim() }
                    .Concat(bloco[(iCc + 1)..]).Where(x => x.Length > 0));
                if (c.Length > 0) comentarios.Add(c);
            }
        }
        var medidas = new List<MedidaRelatorio>();
        var iCom = Achar(l => Comeca(l, "Coment.:"), iRod);
        if (iRod >= 0)
        {
            string? grupo = null;
            foreach (var l in linhas[(iRod + 1)..(iCom > iRod ? iCom : linhas.Count)])
            {
                if (Comeca(l, "Medidas em") || RodapeRegex().IsMatch(l)) continue;
                var lidas = LerMedidas(l, grupo);
                if (lidas.Count == 0) grupo = l; // linha sem número: título do grupo (ex.: "Vesícula biliar")
                medidas.AddRange(lidas);
            }
        }
        if (iCom >= 0)
        {
            var c = string.Join(' ', new[] { linhas[iCom]["Coment.:".Length..].Trim() }
                .Concat(linhas[(iCom + 1)..].Where(l => !RodapeRegex().IsMatch(l))).Where(x => x.Length > 0));
            if (c.Length > 0) comentarios.Add(c);
        }

        var sexo = Campo("Sexo:")?.ToLowerInvariant();
        var est = Campo("Esterilização:")?.ToLowerInvariant();
        return new DadosRelatorio
        {
            Instituicao = instituicao,
            Nome = Campo("Nome:"),
            Animal = Campo("Animal:"),
            Tutor = Campo("Animal Owner:"),
            IdAnimal = Campo("ID animal:"),
            IdOutros = Campo("ID outros:"),
            Nascimento = DataAaaammdd(Campo("DOB:")),
            Idade = Idade(Campo("Idd:")),
            Sexo = sexo is null ? null : sexo.StartsWith("fem") ? "F" : sexo.StartsWith("mas") ? "M" : null,
            Castrado = est is null ? null : est.StartsWith("sim") ? true : est.StartsWith('n') ? false : null,
            Predefinicao = Opcional(predef),
            Aplicacao = Opcional(aplicacao),
            Data = DataAaaammdd(Depois("Dt exame:")),
            MedicoIndicado = Depois("Méd indicado:"),
            Equipamento = Depois("Equipamento usado:"),
            Operador = Depois("Oper:"),
            Comentarios = comentarios.Count > 0 ? string.Join('\n', comentarios) : null,
            Medidas = medidas,
            Texto = texto,
        };
    }

    /// <summary>"GB L: 3.70cm GB H: 2.90cm", "HD cão 1.68cm 6w3d", "TESTICULO*: 2.56cm", "HD/BD cão 6w4d".</summary>
    private static List<MedidaRelatorio> LerMedidas(string linha, string? grupo)
    {
        var lista = new List<MedidaRelatorio>();
        foreach (Match m in MedidaRegex().Matches(linha))
        {
            var valor = decimal.Parse(m.Groups["v"].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
            lista.Add(new(grupo, m.Groups["n"].Value.Trim().TrimEnd(':').Trim(), valor,
                Opcional(m.Groups["u"].Value), m.Groups["c"].Success ? m.Groups["c"].Value : null));
        }
        if (lista.Count == 0 && IdadeGestacionalRegex().Match(linha) is { Success: true } g)
            lista.Add(new(grupo, g.Groups[1].Value.Trim(), null, null, g.Groups[2].Value));
        return lista;
    }

    private static string? DataAaaammdd(string? s) =>
        s is not null && DateTime.TryParseExact(s.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyyMMdd") : null;

    /// <summary>"10Anos" -> "10 anos"; "2Dias" -> "2 dias".</summary>
    private static string? Idade(string? s) =>
        s is null ? null : IdadeRegex().Match(s) is { Success: true } m ? $"{m.Groups[1].Value} {m.Groups[2].Value.ToLowerInvariant()}" : s;

    private static string? Opcional(string? s) => string.IsNullOrWhiteSpace(s) ? null : EspacosRegex().Replace(s.Trim(), " ");

    [GeneratedRegex(@"\s+")] private static partial Regex EspacosRegex();
    // "Animal:" que não faz parte de "Animal Owner:"
    [GeneratedRegex(@"(?<!\S)Animal:")] private static partial Regex AnimalRegex();
    [GeneratedRegex(@"^(.+?) - \d+/\d+ Page$")] private static partial Regex RodapeRegex();
    [GeneratedRegex(@"(?<n>[^\d\s][^:\d]*?)\s*:?\s+(?<v>\d+(?:[.,]\d+)?)\s*(?<u>cm/s|m/s|cm2|cm²|cm3|cm³|ml|mm|cm|bpm|%|s)?(?:\s+(?<c>\d+w\d+d))?(?=\s|$)")]
    private static partial Regex MedidaRegex();
    [GeneratedRegex(@"^(.+?)\s+(\d+w\d+d)$")] private static partial Regex IdadeGestacionalRegex();
    [GeneratedRegex(@"^(\d+)\s*([A-Za-zçÇ]+)")] private static partial Regex IdadeRegex();
}

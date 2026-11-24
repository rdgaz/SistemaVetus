using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>
/// Arquivos dos exames, de duas origens:
/// - receptor DICOM (volume compartilhado, só leitura): &lt;dados&gt;/temp/&lt;AE&gt;/&lt;EXAME&gt;/{jpg,pdf,dicom-*}/ + exame.json + medidas.json
/// - envio do pendrive (gravado pela plataforma): &lt;pendrive&gt;/&lt;AE&gt;/&lt;ID animal&gt;_&lt;SUBPASTA&gt;/{jpg,pdf,mp4}/ + medidas.json
/// Um exame pode ter as duas: fotos do pendrive quando <see cref="Exame.FotosPendrive"/>; PDFs e vídeos de onde houver.
/// </summary>
public class Arquivos(IConfiguration cfg)
{
    public const string Jpg = "jpg";
    public const string Pdf = "pdf";
    public const string Mp4 = "mp4";
    public static readonly string[] Subpastas = [Jpg, Pdf, Mp4];

    private readonly string _dicom = Path.GetFullPath(Path.Combine(cfg["VETUS_DADOS_DIR"] ?? "/data", "temp"));
    private readonly string _pendrive = Path.GetFullPath(cfg["VETUS_PENDRIVE_DIR"] ?? "/pendrive");

    /// <summary>Pasta onde a plataforma grava os envios do pendrive.</summary>
    public string RaizPendrive => _pendrive;

    /// <summary>Caminho absoluto dentro de uma raiz, ou null se vazio ou se tentar sair dela (../).</summary>
    private static string? Seguro(string raiz, string? pasta, params string[] partes)
    {
        if (string.IsNullOrWhiteSpace(pasta)) return null;
        var p = Path.GetFullPath(Path.Combine([raiz, pasta, .. partes]));
        return p.StartsWith(raiz + Path.DirectorySeparatorChar, StringComparison.Ordinal) ? p : null;
    }

    public string? PastaPendrive(string pasta, params string[] partes) => Seguro(_pendrive, pasta, partes);

    /// <summary>Pasta de onde vem uma subpasta (jpg/pdf/mp4) do exame.</summary>
    private string? Diretorio(Exame e, string sub)
    {
        var dicom = Seguro(_dicom, e.Pasta, sub);
        var pendrive = Seguro(_pendrive, e.PastaPendrive, sub);
        return sub switch
        {
            Jpg => e.FotosPendrive && pendrive is not null ? pendrive : dicom,
            Mp4 => pendrive,
            _ => Tem(pendrive, sub) ? pendrive : dicom, // PDF do aparelho: o do pendrive é o mesmo relatório
        };
    }

    private static bool Tem(string? dir, string sub) =>
        dir is not null && Directory.Exists(dir) && ListarDir(dir, sub).Count > 0;

    /// <summary>Arquivos de uma subpasta do exame, em ordem de nome.</summary>
    public List<string> Listar(Exame e, string sub) => ListarDir(Diretorio(e, sub), sub);

    public static List<string> ListarDir(string? dir, string sub)
    {
        if (dir is null || !Directory.Exists(dir)) return [];
        var ext = "." + sub;
        return Directory.EnumerateFiles(dir)
            .Select(Path.GetFileName)
            .Where(n => n!.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            .Order(StringComparer.Ordinal)
            .ToList()!;
    }

    /// <summary>Primeira foto do exame (miniatura na lista).</summary>
    public string? PrimeiraFoto(Exame e) => Listar(e, Jpg).FirstOrDefault();

    /// <summary>Caminho de um arquivo público do exame (só jpg/, pdf/ e mp4/), ou null.</summary>
    public string? Arquivo(Exame e, string sub, string nome)
    {
        if (!Subpastas.Contains(sub) || nome.Contains('/') || nome.Contains('\\') || nome.Contains("..")) return null;
        var dir = Diretorio(e, sub);
        if (dir is null) return null;
        var f = Path.GetFullPath(Path.Combine(dir, nome));
        return f.StartsWith(dir + Path.DirectorySeparatorChar, StringComparison.Ordinal) && File.Exists(f) ? f : null;
    }

    /// <summary>
    /// Conteúdo de um JSON do exame (ex.: medidas.json): o do DICOM (medidas mais completas) e, se não houver
    /// ou estiver vazio, o do pendrive (medidas lidas do PDF do aparelho).
    /// </summary>
    public string? LerJson(Exame e, string nome)
    {
        string? vazio = null;
        foreach (var f in new[] { Seguro(_dicom, e.Pasta, nome), Seguro(_pendrive, e.PastaPendrive, nome) })
        {
            if (f is null || !File.Exists(f)) continue;
            var t = File.ReadAllText(f);
            if (t.Trim() is not ("[]" or "")) return t;
            vazio = t;
        }
        return vazio;
    }

    /// <summary>Descrição de cada foto (nome do arquivo -> texto), do exame.json do receptor; só as que têm descrição.</summary>
    public Dictionary<string, string> Descricoes(Exame e)
    {
        var r = new Dictionary<string, string>(StringComparer.Ordinal);
        if (LerJsonDicom(e.Pasta, "exame.json") is not { } json) return r;
        try
        {
            using var d = System.Text.Json.JsonDocument.Parse(json);
            if (!d.RootElement.TryGetProperty("arquivosPorSop", out var mapa) || mapa.ValueKind != System.Text.Json.JsonValueKind.Object) return r;
            foreach (var sop in mapa.EnumerateObject())
            {
                var desc = new[] { "descricao", "legenda" }.Select(k => sop.Value.TryGetProperty(k, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString()?.Trim() : null)
                    .FirstOrDefault(x => !string.IsNullOrEmpty(x));
                if (desc is null || !sop.Value.TryGetProperty("arquivos", out var arqs) || arqs.ValueKind != System.Text.Json.JsonValueKind.Array) continue;
                foreach (var a in arqs.EnumerateArray())
                    if (a.GetString() is { } caminho) r[Path.GetFileName(caminho)] = desc;
            }
        }
        catch (System.Text.Json.JsonException) { /* exame.json ilegível: sem descrições */ }
        return r;
    }


    /// <summary>
    /// Medições feitas em cada imagem (nome do arquivo -> texto): o medidas.json do DICOM traz, em cada medida, o objeto
    /// da imagem em que ela foi feita. Medidas lidas do PDF do pendrive não têm imagem associada e não entram aqui.
    /// </summary>
    public Dictionary<string, string> Medicoes(Exame e)
    {
        var r = new Dictionary<string, string>(StringComparer.Ordinal);
        if (LerJsonDicom(e.Pasta, "medidas.json") is not { } mjson || LerJsonDicom(e.Pasta, "exame.json") is not { } ejson) return r;
        try
        {
            using var m = System.Text.Json.JsonDocument.Parse(mjson);
            using var ex = System.Text.Json.JsonDocument.Parse(ejson);
            if (m.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array
                || !ex.RootElement.TryGetProperty("arquivosPorSop", out var mapa) || mapa.ValueKind != System.Text.Json.JsonValueKind.Object) return r;
            var porSop = new Dictionary<string, List<string>>();
            foreach (var med in m.RootElement.EnumerateArray())
            {
                if (!med.TryGetProperty("sop", out var s) || s.ValueKind != System.Text.Json.JsonValueKind.String || s.GetString() is not { Length: > 0 } sop) continue;
                string T(string k) => med.TryGetProperty(k, out var v) ? v.ToString() : "";
                var texto = $"{T("nome")} {T("valor")} {T("unidade")}".Trim();
                if (!porSop.TryGetValue(sop, out var l)) porSop[sop] = l = [];
                l.Add(texto);
            }
            foreach (var (sop, medidas) in porSop)
                if (mapa.TryGetProperty(sop, out var entrada) && entrada.TryGetProperty("arquivos", out var arqs) && arqs.ValueKind == System.Text.Json.JsonValueKind.Array)
                    foreach (var a in arqs.EnumerateArray())
                        if (a.GetString() is { } caminho) r[Path.GetFileName(caminho)] = "medidas feitas nesta imagem: " + string.Join("; ", medidas);
        }
        catch (System.Text.Json.JsonException) { /* arquivo ilegível: sem medições por imagem */ }
        return r;
    }

    /// <summary>Informação do aparelho por imagem: descrição e/ou medições (as fotos que têm alguma das duas são prioritárias).</summary>
    public Dictionary<string, string> InfoImagens(Exame e)
    {
        var info = new Dictionary<string, string>(Descricoes(e), StringComparer.Ordinal);
        foreach (var (foto, medicao) in Medicoes(e))
            info[foto] = info.TryGetValue(foto, out var d) ? $"{d}; {medicao}" : medicao;
        return info;
    }
    /// <summary>exame.json do receptor (só leitura), para completar dados de exames antigos.</summary>
    public string? LerJsonDicom(string pasta, string nome) =>
        Seguro(_dicom, pasta, nome) is { } f && File.Exists(f) ? File.ReadAllText(f) : null;
}

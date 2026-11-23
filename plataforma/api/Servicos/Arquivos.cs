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

    /// <summary>exame.json do receptor (só leitura), para completar dados de exames antigos.</summary>
    public string? LerJsonDicom(string pasta, string nome) =>
        Seguro(_dicom, pasta, nome) is { } f && File.Exists(f) ? File.ReadAllText(f) : null;
}

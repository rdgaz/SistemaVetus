namespace Vetus.Api.Servicos;

/// <summary>
/// Acesso às pastas dos exames gravadas pelo receptor DICOM (volume compartilhado, só leitura).
/// Estrutura: &lt;dados&gt;/temp/&lt;AE da clínica&gt;/&lt;EXAME&gt;/{jpg,pdf,dicom-*}/ + exame.json + medidas.json
/// </summary>
public class Arquivos(IConfiguration cfg)
{
    public const string Jpg = "jpg";
    public const string Pdf = "pdf";
    private static readonly string[] SubpastasPublicas = [Jpg, Pdf];

    private readonly string _base = Path.GetFullPath(Path.Combine(cfg["VETUS_DADOS_DIR"] ?? "/data", "temp"));

    /// <summary>Caminho absoluto de um item dentro da pasta de dados, ou null se tentar sair dela (../).</summary>
    private string? Seguro(params string[] partes)
    {
        var p = Path.GetFullPath(Path.Combine([_base, .. partes]));
        return p.StartsWith(_base + Path.DirectorySeparatorChar, StringComparison.Ordinal) ? p : null;
    }

    /// <summary>Arquivos de uma subpasta (jpg/ ou pdf/) do exame, em ordem de nome.</summary>
    public List<string> Listar(string pastaExame, string sub)
    {
        var dir = Seguro(pastaExame, sub);
        if (dir is null || !Directory.Exists(dir)) return [];
        var ext = "." + sub;
        return Directory.EnumerateFiles(dir)
            .Select(Path.GetFileName)
            .Where(n => n!.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            .Order(StringComparer.Ordinal)
            .ToList()!;
    }

    /// <summary>Primeira foto do exame (miniatura na lista).</summary>
    public string? PrimeiraFoto(string pastaExame)
    {
        var dir = Seguro(pastaExame, Jpg);
        if (dir is null || !Directory.Exists(dir)) return null;
        return Directory.EnumerateFiles(dir, "*.jpg").Select(Path.GetFileName).Order(StringComparer.Ordinal).FirstOrDefault();
    }

    /// <summary>Caminho de um arquivo público do exame (só jpg/ e pdf/), ou null.</summary>
    public string? Arquivo(string pastaExame, string sub, string nome)
    {
        if (!SubpastasPublicas.Contains(sub) || nome.Contains('/') || nome.Contains('\\')) return null;
        var f = Seguro(pastaExame, sub, nome);
        return f is not null && File.Exists(f) ? f : null;
    }

    /// <summary>Conteúdo de um JSON da pasta do exame (ex.: medidas.json), ou null.</summary>
    public string? LerJson(string pastaExame, string nome)
    {
        var f = Seguro(pastaExame, nome);
        return f is not null && File.Exists(f) ? File.ReadAllText(f) : null;
    }
}

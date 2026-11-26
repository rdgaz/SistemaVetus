using System.Globalization;
using System.Text;
using System.Text.Json;
using SkiaSharp;
using Vetus.Api.Dados;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Servicos;

/// <summary>Um item de anotação manual sobre uma imagem (coordenadas normalizadas de 0 a 1).</summary>
public record ItemAnotacao(
    string Tipo,
    double X = 0,
    double Y = 0,
    string? Texto = null,
    double X1 = 0,
    double Y1 = 0,
    double X2 = 0,
    double Y2 = 0,
    decimal? Valor = null,
    string? Rotulo = null,
    string? Orgao = null);

/// <summary>
/// Valida, converte e desenha (em memória, com SkiaSharp) as anotações manuais no padrão visual do aparelho de ultrassom:
/// textos brancos em maiúsculas, cursores amarelos (+ e ×), linha pontilhada e quadro inferior direito com borda ciano.
/// </summary>
public static class DesenhoAnotacao
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static readonly CulturaPt Cultura = new();
    private sealed class CulturaPt
    {
        public readonly CultureInfo Br = CultureInfo.GetCultureInfo("pt-BR");
    }

    public static List<ItemAnotacao> Ler(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<ItemAnotacao>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string Serializar(IEnumerable<ItemAnotacao> itens) => JsonSerializer.Serialize(itens, Json);

    /// <summary>Valida e normaliza a lista enviada pela tela. Devolve erro se houver valor inválido.</summary>
    public static (List<ItemAnotacao> Itens, string? Erro) Validar(List<ItemAnotacao>? entrada)
    {
        var bruta = entrada ?? [];
        if (bruta.Count > 25) return ([], "Máximo de 25 anotações por imagem.");
        static double Clamp(double v) => double.IsFinite(v) ? Math.Clamp(v, 0.01, 0.99) : 0.5;
        var limpos = new List<ItemAnotacao>();
        foreach (var it in bruta)
        {
            var tipo = (it.Tipo ?? "").Trim().ToLowerInvariant();
            var orgao = Vetus.Api.Servicos.Texto.Opcional(it.Orgao);
            if (orgao is { Length: > 80 }) orgao = orgao[..80];

            if (tipo == "texto")
            {
                var txt = Vetus.Api.Servicos.Texto.Opcional(it.Texto)?.ToUpperInvariant();
                if (txt is null) return ([], "Informe o texto da anotação.");
                if (txt.Length > 60) txt = txt[..60];
                limpos.Add(new ItemAnotacao("texto", X: Clamp(it.X), Y: Clamp(it.Y), Texto: txt, Orgao: orgao));
            }
            else if (tipo == "medida")
            {
                if (it.Valor is not (> 0m and <= 200m)) return ([], "Informe o valor da medida em cm (maior que zero e até 200 cm).");
                var rot = Vetus.Api.Servicos.Texto.Opcional(it.Rotulo) ?? "Dist";
                if (rot.Length > 30) rot = rot[..30];
                limpos.Add(new ItemAnotacao("medida",
                    X1: Clamp(it.X1), Y1: Clamp(it.Y1), X2: Clamp(it.X2), Y2: Clamp(it.Y2),
                    Valor: Math.Round(it.Valor.Value, 2), Rotulo: rot, Orgao: orgao));
            }
            else return ([], "Tipo de anotação inválido.");
        }
        return (limpos, null);
    }

    /// <summary>Infere o rótulo de órgão para treino a partir do órgão informado ou do texto escrito na foto.</summary>
    public static string? InferirOrgaoRotulo(IEnumerable<ItemAnotacao> itens)
    {
        var opcoes = ModeloLaudo.OpcoesRotuloImagem();
        foreach (var it in itens)
        {
            if (it.Orgao is { } org)
            {
                var exato = opcoes.FirstOrDefault(o => string.Equals(o, org, StringComparison.OrdinalIgnoreCase));
                if (exato is not null) return exato;
                if (org.StartsWith("Vesícula Bil", StringComparison.OrdinalIgnoreCase)) return "Vesícula biliar";
                if (org.StartsWith("Vesícula Urin", StringComparison.OrdinalIgnoreCase)) return "Bexiga urinária";
                if (org.StartsWith("Alças", StringComparison.OrdinalIgnoreCase)) return "Alças intestinais";
            }
            if (it.Tipo == "texto" && it.Texto is { } t)
            {
                var s = SemAcento(t);
                if (s is "VB" or "VESICULA BILIAR" || s.StartsWith("VESICULA B")) return "Vesícula biliar";
                if (s is "BEXIGA" or "VU" || s.StartsWith("VESICULA U")) return "Bexiga urinária";
                if (s is "FIGADO" || s.StartsWith("FIGAD")) return "Fígado";
                if (s is "BACO") return "Baço";
                if (s is "RIM E" or "RIM ESQ" or "RE" || s.StartsWith("RIM ESQ")) return "Rim esquerdo";
                if (s is "RIM D" or "RIM DIR" or "RD" || s.StartsWith("RIM DIR")) return "Rim direito";
                if (s is "ADRENAL E" or "ADR E" || s.StartsWith("ADRENAL ESQ")) return "Adrenal esquerda";
                if (s is "ADRENAL D" or "ADR D" || s.StartsWith("ADRENAL DIR")) return "Adrenal direita";
                if (s is "ESTOMAGO" || s.StartsWith("ESTOM")) return "Estômago";
                if (s is "PANCREAS" || s.StartsWith("PANCR")) return "Pâncreas";
                if (s is "ALCAS" or "COLON" or "DUODENO" or "JEJUNO" or "ILEO" || s.StartsWith("ALCA") || s.StartsWith("INTEST")) return "Alças intestinais";
                if (s is "PROSTATA" || s.StartsWith("PROST")) return "Próstata";
                if (s.StartsWith("TESTIC")) return "Testículos";
                if (s is "UTERO" || s.StartsWith("UTER")) return "Útero";
                if (s.StartsWith("OVARI")) return "Ovários";
                if (s.StartsWith("LINFON")) return "Linfonodos";
            }
        }
        return null;
    }

    private static string SemAcento(string s) => new string(s.Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray()).ToUpperInvariant().Trim();

    /// <summary>Junta as medidas do aparelho (medidas.json) com as medidas manuais anotadas nas imagens do exame.</summary>
    public static JsonElement? MesclarMedidas(JsonElement? aparelho, IEnumerable<AnotacaoImagem> anotacoes)
    {
        var lista = new List<object>();
        if (aparelho is { ValueKind: JsonValueKind.Array } arr)
            foreach (var el in arr.EnumerateArray()) lista.Add(el);

        foreach (var a in anotacoes)
            foreach (var m in Ler(a.Itens).Where(x => x.Tipo == "medida" && x.Valor is > 0))
            {
                lista.Add(new
                {
                    grupo = m.Orgao ?? "",
                    nome = m.Rotulo ?? "Dist",
                    valor = m.Valor!.Value,
                    unidade = "cm",
                    complemento = "(manual)",
                    origem = "manual",
                    foto = a.Foto,
                });
            }
        return lista.Count == 0 ? aparelho : JsonSerializer.SerializeToElement(lista);
    }

    /// <summary>Resumo textual das anotações de uma foto para enviar junto com a imagem no prompt da IA.</summary>
    public static string? DescricaoParaIa(string? jsonItens)
    {
        var itens = Ler(jsonItens);
        if (itens.Count == 0) return null;
        var partes = new List<string>();
        foreach (var t in itens.Where(x => x.Tipo == "texto" && !string.IsNullOrWhiteSpace(x.Texto)))
            partes.Add($"rótulo \"{t.Texto}\"");
        foreach (var m in itens.Where(x => x.Tipo == "medida" && x.Valor is > 0))
            partes.Add($"{(string.IsNullOrWhiteSpace(m.Orgao) ? "" : m.Orgao + " — ")}{m.Rotulo ?? "Dist"}: {m.Valor!.Value.ToString("0.00", Cultura.Br)} cm");
        return partes.Count == 0 ? null : "anotação manual do veterinário: " + string.Join("; ", partes);
    }

    /// <summary>Desenha as anotações em memória sobre o JPG, mantendo o arquivo original intacto.</summary>
    public static byte[] Aplicar(byte[] jpgOriginal, string? jsonItens)
    {
        var itens = Ler(jsonItens);
        if (itens.Count == 0) return jpgOriginal;

        using var bmp = SKBitmap.Decode(jpgOriginal);
        if (bmp is null) return jpgOriginal;
        // imagens muito pequenas são desenhadas numa superfície mínima de 640x480 para manter textos e cursores nítidos
        var largCanvas = Math.Max(bmp.Width, 640);
        var altCanvas = Math.Max((int)Math.Round((double)bmp.Height * largCanvas / Math.Max(1, bmp.Width)), 480);
        using var surface = SKSurface.Create(new SKImageInfo(largCanvas, altCanvas, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (surface is null) return jpgOriginal;

        var canvas = surface.Canvas;
        using var imgOrigem = SKImage.FromBitmap(bmp);
        canvas.DrawImage(imgOrigem, new SKRect(0, 0, largCanvas, altCanvas), new SKSamplingOptions(SKFilterMode.Linear));

        static float Limitar(float v, float min, float max) => Math.Clamp(v, min, Math.Max(min, max));

        var escala = Math.Max(largCanvas, altCanvas) / 960f;
        escala = Math.Clamp(escala, 0.55f, 2.5f);

        var amarelo = new SKColor(255, 230, 0);
        var ciano = new SKColor(0, 229, 255);
        var branco = SKColors.White;
        var sombra = new SKColor(0, 0, 0, 210);

        using var typeface = SKTypeface.FromFamilyName("DejaVu Sans", SKFontStyle.Bold) ?? SKTypeface.Default;
        using var fonteTexto = new SKFont(typeface, 19f * escala);
        using var fonteNum = new SKFont(typeface, 14f * escala);
        using var fonteQuadro = new SKFont(typeface, 15f * escala);

        using var pBranco = new SKPaint { Color = branco, IsAntialias = true, Style = SKPaintStyle.Fill };
        using var pAmarelo = new SKPaint { Color = amarelo, IsAntialias = true, Style = SKPaintStyle.Fill };
        using var pContornoTexto = new SKPaint
        {
            Color = sombra, IsAntialias = true, Style = SKPaintStyle.Stroke,
            StrokeWidth = Math.Max(2.5f, 3.2f * escala), StrokeJoin = SKStrokeJoin.Round,
        };
        using var pSombraLinha = new SKPaint
        {
            Color = sombra, IsAntialias = true, Style = SKPaintStyle.Stroke,
            StrokeWidth = Math.Max(2.4f, 3.2f * escala), StrokeCap = SKStrokeCap.Round,
        };
        using var pLinhaPontilhada = new SKPaint
        {
            Color = amarelo, IsAntialias = true, Style = SKPaintStyle.Stroke,
            StrokeWidth = Math.Max(1.5f, 2.0f * escala),
            PathEffect = SKPathEffect.CreateDash([4f * escala, 4f * escala], 0),
        };
        using var pCursor = new SKPaint
        {
            Color = amarelo, IsAntialias = true, Style = SKPaintStyle.Stroke,
            StrokeWidth = Math.Max(1.8f, 2.2f * escala), StrokeCap = SKStrokeCap.Round,
        };

        // 1) Medidas (cursores + e × com linha pontilhada amarela)
        var medidas = itens.Where(x => x.Tipo == "medida" && x.Valor is > 0).ToList();
        var r = 6.5f * escala;
        for (var i = 0; i < medidas.Count; i++)
        {
            var m = medidas[i];
            var x1 = (float)(m.X1 * largCanvas);
            var y1 = (float)(m.Y1 * altCanvas);
            var x2 = (float)(m.X2 * largCanvas);
            var y2 = (float)(m.Y2 * altCanvas);

            canvas.DrawLine(x1, y1, x2, y2, pLinhaPontilhada);

            // cursor 1: +
            canvas.DrawLine(x1 - r, y1, x1 + r, y1, pSombraLinha);
            canvas.DrawLine(x1, y1 - r, x1, y1 + r, pSombraLinha);
            canvas.DrawLine(x1 - r, y1, x1 + r, y1, pCursor);
            canvas.DrawLine(x1, y1 - r, x1, y1 + r, pCursor);

            // cursor 2: ×
            var rx = r * 0.78f;
            canvas.DrawLine(x2 - rx, y2 - rx, x2 + rx, y2 + rx, pSombraLinha);
            canvas.DrawLine(x2 - rx, y2 + rx, x2 + rx, y2 - rx, pSombraLinha);
            canvas.DrawLine(x2 - rx, y2 - rx, x2 + rx, y2 + rx, pCursor);
            canvas.DrawLine(x2 - rx, y2 + rx, x2 + rx, y2 - rx, pCursor);

            // número da medida junto ao 1º cursor
            var numTxt = (i + 1).ToString();
            var nx = Limitar(x1 + r + 3f * escala, 4f, largCanvas - 20f * escala);
            var ny = Limitar(y1 - 3f * escala, 16f * escala, altCanvas - 4f);
            canvas.DrawText(numTxt, nx, ny, SKTextAlign.Left, fonteNum, pContornoTexto);
            canvas.DrawText(numTxt, nx, ny, SKTextAlign.Left, fonteNum, pAmarelo);
        }

        // 2) Textos do órgão / estrutura (letras brancas maiúsculas com contorno escuro fino)
        foreach (var t in itens.Where(x => x.Tipo == "texto" && !string.IsNullOrWhiteSpace(x.Texto)))
        {
            var txt = t.Texto!;
            var larg = fonteTexto.MeasureText(txt);
            var x = Limitar((float)(t.X * largCanvas), 6f, largCanvas - larg - 6f);
            var y = Limitar((float)(t.Y * altCanvas), 22f * escala, altCanvas - 8f);
            canvas.DrawText(txt, x, y, SKTextAlign.Left, fonteTexto, pContornoTexto);
            canvas.DrawText(txt, x, y, SKTextAlign.Left, fonteTexto, pBranco);
        }

        // 3) Quadro de medidas no canto inferior direito (fundo escuro semitransparente + borda ciano, padrão Mindray)
        if (medidas.Count > 0)
        {
            var linhas = medidas.Select((m, i) =>
                ($"{i + 1}", $"{m.Rotulo ?? "Dist"}  {m.Valor!.Value.ToString("0.00", Cultura.Br)} cm")).ToList();
            var padX = 9f * escala;
            var padY = 7f * escala;
            var altLinha = 19f * escala;
            var largNum = fonteQuadro.MeasureText("9 ");
            var largMax = linhas.Max(l => largNum + fonteQuadro.MeasureText(l.Item2));
            var largQuadro = largMax + padX * 2;
            var altQuadro = linhas.Count * altLinha + padY * 1.6f;
            var margem = 12f * escala;
            var ret = new SKRect(
                Math.Max(margem, largCanvas - largQuadro - margem),
                Math.Max(margem, altCanvas - altQuadro - margem),
                largCanvas - margem,
                altCanvas - margem);

            using var pFundo = new SKPaint { Color = new SKColor(0, 10, 18, 195), IsAntialias = true, Style = SKPaintStyle.Fill };
            using var pBorda = new SKPaint { Color = ciano, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = Math.Max(1.3f, 1.7f * escala) };
            canvas.DrawRoundRect(ret, 3f * escala, 3f * escala, pFundo);
            canvas.DrawRoundRect(ret, 3f * escala, 3f * escala, pBorda);

            for (var i = 0; i < linhas.Count; i++)
            {
                var yLinha = ret.Top + padY + (i + 0.82f) * altLinha;
                canvas.DrawText(linhas[i].Item1, ret.Left + padX, yLinha, SKTextAlign.Left, fonteQuadro, pAmarelo);
                canvas.DrawText(linhas[i].Item2, ret.Left + padX + largNum + 4f * escala, yLinha, SKTextAlign.Left, fonteQuadro, pBranco);
            }
        }

        using var imgFinal = surface.Snapshot();
        using var dados = imgFinal.Encode(SKEncodedImageFormat.Jpeg, 93);
        return dados?.ToArray() ?? jpgOriginal;
    }
}

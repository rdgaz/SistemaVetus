using SkiaSharp;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// Detecta, nos pixels da foto, as anotações que o operador faz no aparelho: o rótulo do órgão e as medidas
/// ("COLON", "Dist 0.13 cm") aparecem num quadro com uma linha CIANO, uma cor que não existe no ultrassom (cinza).
/// Fotos assim têm a informação mais próxima da imagem e sempre vão para a análise da IA.
/// </summary>
public static class DetectorAnotacoes
{
    /// <summary>Quantidade mínima de pixels ciano (amostrados de 2 em 2) para considerar que há anotação.</summary>
    private const int MinimoPixels = 60;

    public static bool TemAnotacao(string caminho)
    {
        try
        {
            using var bitmap = SKBitmap.Decode(caminho);
            if (bitmap is null || bitmap.Width < 200 || bitmap.Height < 200) return false;
            var achados = 0;
            for (var y = 0; y < bitmap.Height; y += 2)
                for (var x = 0; x < bitmap.Width; x += 2)
                {
                    var p = bitmap.GetPixel(x, y);
                    // ciano vivo: vermelho baixo, verde e azul altos e parecidos
                    if (p.Red < 90 && p.Green > 150 && p.Blue > 150 && Math.Abs(p.Green - p.Blue) < 60 && ++achados >= MinimoPixels) return true;
                }
            return false;
        }
        catch (Exception)
        {
            return false; // imagem ilegível: segue sem marcar
        }
    }
}

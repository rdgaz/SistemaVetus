using System.Net.Http.Json;
using System.Text.Json;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// Pré-laudo pelo Gemini (Google), pela API REST.
/// Com GEMINI_PROJETO: Vertex AI (Google Cloud). Sem: API do Gemini (AI Studio, chaves "AIza...").
/// </summary>
public class GeradorGemini(ConfiguracaoIa cfg, IHttpClientFactory http) : IGeradorLaudo
{
    public string Nome => "gemini";
    public string Modelo => cfg.GeminiModelo;
    public bool Configurado => cfg.GeminiChave is not null;

    public async Task<RespostaIa> Gerar(EntradaLaudo entrada, CancellationToken ct)
    {
        var partes = new List<object> { new { text = entrada.Texto } };
        foreach (var img in entrada.Imagens)
        {
            partes.Add(new { text = $"Imagem {img.Numero} ({img.Nome}):" });
            partes.Add(new { inlineData = new { mimeType = "image/jpeg", data = Convert.ToBase64String(img.Bytes) } });
        }

        var corpo = new
        {
            systemInstruction = new { parts = new[] { new { text = entrada.Sistema + "\n\nFormato (JSON Schema):\n" + ModeloLaudo.Esquema.GetRawText() } } },
            contents = new[] { new { role = "user", parts = partes } },
            generationConfig = new { responseMimeType = "application/json", maxOutputTokens = 16000 },
        };

        var url = cfg.GeminiProjeto is { } projeto
            ? $"https://aiplatform.googleapis.com/v1/projects/{projeto}/locations/{cfg.GeminiLocal}/publishers/google/models/{cfg.GeminiModelo}:generateContent"
            : $"https://generativelanguage.googleapis.com/v1beta/models/{cfg.GeminiModelo}:generateContent";

        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(corpo) };
        req.Headers.Add("x-goog-api-key", cfg.GeminiChave);
        var cliente = http.CreateClient("gemini");
        using var r = await cliente.SendAsync(req, ct);
        var texto = await r.Content.ReadAsStringAsync(ct);
        if (!r.IsSuccessStatusCode)
            throw new InvalidOperationException($"Gemini respondeu {(int)r.StatusCode}: {Resumo(texto)}");

        var el = JsonSerializer.Deserialize<JsonElement>(texto);
        var candidato = el.GetProperty("candidates")[0];
        if (candidato.TryGetProperty("finishReason", out var fim) && fim.GetString() is { } motivo and not "STOP")
            throw new InvalidOperationException($"Gemini terminou com {motivo}.");
        var json = string.Concat(candidato.GetProperty("content").GetProperty("parts").EnumerateArray()
            .Where(p => p.TryGetProperty("text", out _) && !(p.TryGetProperty("thought", out var t) && t.GetBoolean()))
            .Select(p => p.GetProperty("text").GetString()));

        int Uso(string nome) => el.TryGetProperty("usageMetadata", out var u) && u.TryGetProperty(nome, out var v) ? v.GetInt32() : 0;
        return new RespostaIa(Nome, cfg.GeminiModelo, json, Uso("promptTokenCount"), Uso("candidatesTokenCount") + Uso("thoughtsTokenCount"));
    }

    private static string Resumo(string s) => s.Length > 300 ? s[..300] + "…" : s;
}

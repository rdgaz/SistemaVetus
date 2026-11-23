namespace Vetus.Api.Servicos.Ia;

/// <summary>Configuração da geração de laudos (variáveis de ambiente / .env).</summary>
public class ConfiguracaoIa(IConfiguration cfg)
{
    /// <summary>Ordem de tentativa: o primeiro é o principal, os seguintes são reserva. Ex.: "claude,gemini".</summary>
    public IReadOnlyList<string> Ordem { get; } = (cfg["IA_ORDEM"] is { Length: > 0 } o ? o : "claude,gemini")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(x => x.ToLowerInvariant()).ToList();

    /// <summary>true = não chama IA nenhuma; gera um pré-laudo de exemplo (testes e CI).</summary>
    public bool Simulada { get; } = cfg.GetValue("IA_SIMULADA", false);
    /// <summary>Quantos exames gerar ao mesmo tempo.</summary>
    public int Paralelo { get; } = Math.Clamp(cfg.GetValue("IA_PARALELO", 2), 1, 10);
    /// <summary>Máximo de fotos enviadas à IA por exame.</summary>
    public int MaxImagens { get; } = Math.Clamp(cfg.GetValue("IA_MAX_IMAGENS", 15), 1, 50);

    public string? ClaudeChave { get; } = Vazio(cfg["ANTHROPIC_API_KEY"]);
    public string ClaudeModelo { get; } = Vazio(cfg["CLAUDE_MODELO"]) ?? "claude-opus-5-5";
    /// <summary>low, medium, high, xhigh ou max.</summary>
    public string ClaudeEsforco { get; } = Vazio(cfg["CLAUDE_ESFORCO"]) ?? "high";

    public string? GeminiChave { get; } = Vazio(cfg["GEMINI_API_KEY"]);
    public string GeminiModelo { get; } = Vazio(cfg["GEMINI_MODELO"]) ?? "gemini-3.1-pro-preview";
    /// <summary>Projeto do Google Cloud (Vertex AI). Vazio = API do Gemini (AI Studio).</summary>
    public string? GeminiProjeto { get; } = Vazio(cfg["GEMINI_PROJETO"]);
    public string GeminiLocal { get; } = Vazio(cfg["GEMINI_LOCAL"]) ?? "global";

    /// <summary>Alguma IA pode ser usada?</summary>
    public bool Ativa => Simulada || ClaudeChave is not null || GeminiChave is not null;

    private static string? Vazio(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

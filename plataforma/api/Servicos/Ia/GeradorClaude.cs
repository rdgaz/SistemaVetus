using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Vetus.Api.Servicos.Ia;

/// <summary>Pré-laudo pelo Claude (API da Anthropic), com resposta em JSON estruturado.</summary>
public class GeradorClaude(ConfiguracaoIa cfg) : IGeradorLaudo
{
    public string Nome => "claude";
    public string Modelo => cfg.ClaudeModelo;
    public bool Configurado => cfg.ClaudeChave is not null;

    public async Task<RespostaIa> Gerar(EntradaLaudo entrada, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = cfg.ClaudeChave };

        var conteudo = new List<ContentBlockParam> { new TextBlockParam { Text = entrada.Texto } };
        foreach (var img in entrada.Imagens)
        {
            conteudo.Add(new TextBlockParam { Text = $"Imagem {img.Numero} ({img.Nome}):" });
            conteudo.Add(new ImageBlockParam
            {
                Source = new Base64ImageSource { Data = Convert.ToBase64String(img.Bytes), MediaType = MediaType.ImageJpeg },
            });
        }

        var resposta = await client.Messages.Create(new MessageCreateParams
        {
            Model = cfg.ClaudeModelo,
            MaxTokens = 16000,
            System = entrada.Sistema,
            Thinking = new ThinkingConfigAdaptive(),
            OutputConfig = new OutputConfig
            {
                Effort = cfg.ClaudeEsforco switch
                {
                    "low" => Effort.Low,
                    "medium" => Effort.Medium,
                    "max" => Effort.Max,
                    _ => Effort.High,
                },
                Format = new JsonOutputFormat
                {
                    Schema = ModeloLaudo.Esquema.EnumerateObject().ToDictionary(p => p.Name, p => p.Value),
                },
            },
            Messages = [new UserMessageParam { Content = conteudo }],
        }, ct);

        if (resposta.StopReason == "refusal")
            throw new InvalidOperationException($"Claude recusou a solicitação ({resposta.StopDetails?.Category}).");
        if (resposta.StopReason == "max_tokens")
            throw new InvalidOperationException("Claude atingiu o limite de tamanho da resposta.");

        var json = string.Concat(resposta.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        return new RespostaIa(Nome, cfg.ClaudeModelo, json,
            (int)resposta.Usage.InputTokens, (int)resposta.Usage.OutputTokens);
    }
}

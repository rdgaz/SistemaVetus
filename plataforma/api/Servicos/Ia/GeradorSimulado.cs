using System.Text.Json;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// IA de mentira (IA_SIMULADA=true): devolve um pré-laudo de exemplo sem chamar nenhuma API.
/// Serve para testar o fluxo (fila, status, telas) e para o GitHub Actions, sem custo.
/// </summary>
public class GeradorSimulado : IGeradorLaudo
{
    public string Nome => "simulado";
    public string Modelo => "simulado";
    public bool Configurado => true;

    public async Task<RespostaIa> Gerar(EntradaLaudo entrada, CancellationToken ct)
    {
        await Task.Delay(1500, ct);
        // o texto da entrada traz a lista de órgãos a avaliar: "- Fígado" ...
        var orgaos = entrada.Texto.Split('\n').Where(l => l.StartsWith("- ORGAO: ")).Select(l => l["- ORGAO: ".Length..].Trim()).ToList();
        var resultado = new
        {
            camposExtraidos = ModeloLaudo.CamposExtraidos.ToDictionary(c => c, _ => ""),
            condicoesTecnicas = "Exame simulado: sem análise real das imagens.",
            orgaos = orgaos.Select(o => new
            {
                orgao = o,
                situacao = ModeloLaudo.Normal,
                descricao = $"{o}: texto de exemplo gerado pela IA simulada (nenhuma imagem foi analisada).",
            }),
            impressaoDiagnostica = "Pré-laudo SIMULADO para teste do sistema. Não usar clinicamente.",
            diferenciais = Array.Empty<string>(),
            recomendacoes = new[] { "Configurar ANTHROPIC_API_KEY ou GEMINI_API_KEY para a análise real." },
            imagensSugeridas = entrada.Imagens.Take(6).Select(i => i.Numero),
            achadoUrgente = false,
            motivoUrgencia = "",
        };
        // consumo de mentira, proporcional às fotos, para testar a cobrança (o preço do "simulado" é 0 por padrão)
        return new RespostaIa(Nome, "simulado", JsonSerializer.Serialize(resultado), 2_000 + entrada.Imagens.Count * 1_000, 3_000);
    }
}

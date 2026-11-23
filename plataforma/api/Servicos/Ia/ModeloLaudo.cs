using System.Text.Json;

namespace Vetus.Api.Servicos.Ia;

public record ImagemIa(int Numero, string Nome, byte[] Bytes);

/// <summary>O que vai para a IA: instruções (sistema), dados do exame (texto) e as fotos.</summary>
public record EntradaLaudo(string Sistema, string Texto, IReadOnlyList<ImagemIa> Imagens);

/// <summary>Resposta de uma IA: o JSON do pré-laudo e o consumo.</summary>
public record RespostaIa(string Ia, string Modelo, string Json, int TokensEntrada, int TokensSaida);

public interface IGeradorLaudo
{
    string Nome { get; }
    /// <summary>Modelo usado (para a tabela de preços).</summary>
    string Modelo { get; }
    bool Configurado { get; }
    Task<RespostaIa> Gerar(EntradaLaudo entrada, CancellationToken ct);
}

/// <summary>Modelo do laudo de ultrassonografia (padrão brasileiro) e o formato da resposta da IA.</summary>
public static class ModeloLaudo
{
    public const string Normal = "normal";
    public const string Alterado = "alterado";
    public const string NaoVisualizado = "nao_visualizado";

    /// <summary>Órgãos avaliados na ultrassonografia abdominal, conforme o sexo.</summary>
    public static List<string> OrgaosAbdominal(string? sexo)
    {
        var orgaos = new List<string>
        {
            "Fígado", "Vesícula biliar", "Baço", "Rim esquerdo", "Rim direito", "Bexiga urinária",
            "Estômago", "Alças intestinais", "Pâncreas", "Adrenais", "Linfonodos",
        };
        orgaos.Add(sexo switch
        {
            "M" => "Próstata e testículos",
            "F" => "Útero e ovários",
            _ => "Órgãos reprodutivos",
        });
        orgaos.Add("Cavidade abdominal");
        return orgaos;
    }

    /// <summary>Frase de normalidade de cada órgão (botão "Normal" na revisão). Futuramente, editável por clínica.</summary>
    public static readonly IReadOnlyDictionary<string, string> Normalidade = new Dictionary<string, string>
    {
        ["Fígado"] = "Fígado com dimensões preservadas, contornos regulares e bordos finos. Parênquima com ecogenicidade e ecotextura habituais. Vasculatura hepática e vias biliares intra-hepáticas sem alterações.",
        ["Vesícula biliar"] = "Vesícula biliar com repleção adequada por conteúdo anecogênico homogêneo, paredes finas e regulares. Ductos biliares não dilatados.",
        ["Baço"] = "Baço com dimensões preservadas, contornos regulares, parênquima com ecogenicidade e ecotextura habituais.",
        ["Rim esquerdo"] = "Rim esquerdo com dimensões preservadas, contornos regulares, ecogenicidade e ecotextura habituais, relação e definição corticomedular preservadas. Pelve renal sem dilatação.",
        ["Rim direito"] = "Rim direito com dimensões preservadas, contornos regulares, ecogenicidade e ecotextura habituais, relação e definição corticomedular preservadas. Pelve renal sem dilatação.",
        ["Bexiga urinária"] = "Bexiga urinária com repleção adequada, conteúdo anecogênico homogêneo, paredes finas e regulares. Ausência de cálculos ou sedimento.",
        ["Estômago"] = "Estômago com paredes de espessura preservada e estratificação parietal mantida, conteúdo compatível com o jejum, peristaltismo presente.",
        ["Alças intestinais"] = "Alças intestinais com paredes de espessura preservada e estratificação em camadas mantida, peristaltismo presente, sem sinais de obstrução.",
        ["Pâncreas"] = "Pâncreas com dimensões, ecogenicidade e ecotextura habituais. Mesentério adjacente sem alterações.",
        ["Adrenais"] = "Adrenais com forma e dimensões preservadas para o porte, ecogenicidade habitual.",
        ["Linfonodos"] = "Linfonodos abdominais (jejunais e ilíacos mediais) sem aumento de dimensões e com aspecto ultrassonográfico habitual.",
        ["Próstata e testículos"] = "Próstata com dimensões, contornos e ecotextura habituais. Testículos com dimensões e ecotextura habituais.",
        ["Útero e ovários"] = "Útero não evidenciado / sem alterações ao exame. Ovários sem alterações ultrassonográficas evidentes.",
        ["Órgãos reprodutivos"] = "Órgãos reprodutivos sem alterações ultrassonográficas evidentes.",
        ["Cavidade abdominal"] = "Ausência de líquido livre e de gás livre na cavidade abdominal. Mesentério com ecogenicidade habitual.",
    };

    /// <summary>Observação padrão no fim do laudo.</summary>
    public const string Observacao = "O exame ultrassonográfico deve ser interpretado em conjunto com os dados clínicos e outros exames complementares.";

    public const string Sistema = """
        Você é um assistente de pré-laudo de ultrassonografia veterinária no Brasil. Você recebe as imagens de um
        exame de ultrassom de um cão ou gato, os dados do paciente, as medidas feitas no aparelho e informações
        escritas pela clínica, e escreve um PRÉ-LAUDO em português do Brasil, no padrão usado pelos
        ultrassonografistas veterinários brasileiros.

        O pré-laudo NÃO é o laudo final: um médico-veterinário vai revisar, corrigir e assinar. Por isso:
        - Descreva somente o que é possível ver nas imagens enviadas. Nunca invente achados.
        - Se um órgão não aparece em nenhuma imagem, marque "nao_visualizado" e diga o motivo provável
          (não incluído nas imagens, gases, obesidade etc.). Não descreva órgão que você não viu.
        - Use as medidas do aparelho quando existirem e cite-as com unidade. Não invente medidas.
        - Compare as medidas com os VALORES DE REFERÊNCIA fornecidos (da espécie e do peso do paciente). Quando uma
          medida estiver fora da faixa, diga isso no órgão (ex.: "espessura da parede do jejuno de 5,2 mm, acima do
          limite de referência de 4,1 mm") e considere na impressão diagnóstica. Use só as referências fornecidas;
          se não houver referência para uma medida, descreva-a sem classificar como normal ou alterada por número.
        - Na dúvida, prefira "não se descarta" e recomende correlação clínica ou outro exame.

        Escreva cada órgão com a terminologia usual: dimensões, contornos, margens, ecogenicidade, ecotextura,
        arquitetura, e os critérios do órgão (ex.: relação corticomedular nos rins; repleção, parede e conteúdo na
        bexiga; espessura e estratificação das camadas parietais e peristaltismo nas alças intestinais; espessura
        do polo caudal nas adrenais; linfonodos jejunais e ilíacos mediais). Para órgão normal, use uma frase
        objetiva de normalidade (ex.: "Rim esquerdo com dimensões preservadas, contornos regulares, ecogenicidade
        e ecotextura habituais, relação corticomedular preservada.").

        Na impressão diagnóstica, use os termos usuais: "compatível com", "sugestivo de", "não se descarta".
        Liste diagnósticos diferenciais quando couber e recomendações (correlação clínica e laboratorial,
        repetir o exame em X dias, citologia guiada etc.).

        Também organize as informações escritas pela clínica (campo "informações adicionais") nos campos
        extraídos: espécie, raça, sexo, suspeita clínica, histórico, jejum, castrado, peso, idade, solicitante.
        Raça sem definição ("vira-lata", "SRD", "sem raça") vira "SRD (vira-lata)". Deixe "" no que não
        estiver escrito. Não deduza esses campos das imagens.

        Marque "achadoUrgente" somente para achados que pedem atenção imediata (ex.: líquido livre abundante,
        suspeita de piometra, corpo estranho obstrutivo, torção, ruptura).

        Escolha em "imagensSugeridas" os números das imagens (de 4 a 8) que melhor mostram os achados para a
        prancha do laudo.

        Responda somente com o JSON no formato pedido.
        """;

    /// <summary>Campos que a IA organiza a partir do texto livre (declarado antes do Esquema, que o usa).</summary>
    public static readonly string[] CamposExtraidos =
        ["especie", "raca", "sexo", "suspeitaClinica", "historico", "jejum", "castrado", "peso", "idade", "solicitanteNome", "solicitanteCrmv"];

    /// <summary>Formato (JSON Schema) da resposta da IA.</summary>
    public static readonly JsonElement Esquema = JsonSerializer.SerializeToElement(new Dictionary<string, object>
    {
        ["type"] = "object",
        ["additionalProperties"] = false,
        ["required"] = new[] { "camposExtraidos", "condicoesTecnicas", "orgaos", "impressaoDiagnostica", "diferenciais",
            "recomendacoes", "imagensSugeridas", "achadoUrgente", "motivoUrgencia" },
        ["properties"] = new Dictionary<string, object>
        {
            ["camposExtraidos"] = new Dictionary<string, object>
            {
                ["type"] = "object",
                ["additionalProperties"] = false,
                ["required"] = CamposExtraidos,
                ["properties"] = CamposExtraidos.ToDictionary(c => c, c => (object)new Dictionary<string, object>
                {
                    ["type"] = "string",
                    ["description"] = DescricaoCampo(c),
                }),
            },
            ["condicoesTecnicas"] = new { type = "string", description = "Jejum, repleção vesical, gases, obesidade, agitação; e limitações do exame." },
            ["orgaos"] = new Dictionary<string, object>
            {
                ["type"] = "array",
                ["items"] = new Dictionary<string, object>
                {
                    ["type"] = "object",
                    ["additionalProperties"] = false,
                    ["required"] = new[] { "orgao", "situacao", "descricao" },
                    ["properties"] = new Dictionary<string, object>
                    {
                        ["orgao"] = new { type = "string" },
                        ["situacao"] = new { type = "string", @enum = new[] { Normal, Alterado, NaoVisualizado } },
                        ["descricao"] = new { type = "string" },
                    },
                },
            },
            ["impressaoDiagnostica"] = new { type = "string" },
            ["diferenciais"] = new { type = "array", items = new { type = "string" } },
            ["recomendacoes"] = new { type = "array", items = new { type = "string" } },
            ["imagensSugeridas"] = new { type = "array", items = new { type = "integer" } },
            ["achadoUrgente"] = new { type = "boolean" },
            ["motivoUrgencia"] = new { type = "string" },
        },
    });

    private static string DescricaoCampo(string c) => c switch
    {
        "jejum" or "castrado" => "\"sim\", \"nao\" ou \"\" se não informado",
        "sexo" => "\"M\" (macho), \"F\" (fêmea) ou \"\" se não informado",
        "especie" => "\"Canina\", \"Felina\" ou outra; \"\" se não informado",
        "raca" => "ex.: \"SRD (vira-lata)\", \"Shih-tzu\"; \"\" se não informado",
        "peso" => "com unidade, ex.: \"4,2 kg\"",
        _ => "\"\" se não informado",
    };

    /// <summary>Confere se o JSON da IA tem o mínimo esperado (as IAs às vezes respondem fora do formato).</summary>
    public static JsonElement Validar(string json)
    {
        var texto = json.Trim();
        // alguns modelos envolvem o JSON em ```json ... ```
        if (texto.StartsWith("```"))
        {
            texto = texto[(texto.IndexOf('\n') + 1)..];
            texto = texto[..texto.LastIndexOf("```", StringComparison.Ordinal)];
        }
        var el = JsonSerializer.Deserialize<JsonElement>(texto);
        if (el.ValueKind != JsonValueKind.Object
            || !el.TryGetProperty("orgaos", out var o) || o.ValueKind != JsonValueKind.Array || o.GetArrayLength() == 0
            || !el.TryGetProperty("impressaoDiagnostica", out _))
            throw new InvalidOperationException("Resposta da IA fora do formato esperado.");
        return el;
    }
}

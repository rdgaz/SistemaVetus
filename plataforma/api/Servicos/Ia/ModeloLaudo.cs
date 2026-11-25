using System.Text.Json;

namespace Vetus.Api.Servicos.Ia;

public record ImagemIa(int Numero, string Nome, byte[] Bytes, string? Descricao = null);

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
    /// <summary>Resposta em texto livre, sem imagens (ex.: padronizar o texto ditado pelo veterinário).</summary>
    Task<RespostaIa> Texto(string sistema, string pedido, CancellationToken ct);
}

/// <summary>Modelo do laudo de ultrassonografia (padrão brasileiro) e o formato da resposta da IA.</summary>
public static class ModeloLaudo
{
    public const string Normal = "normal";
    public const string Alterado = "alterado";
    public const string NaoVisualizado = "nao_visualizado";

    /// <summary>Texto padrão dos linfonodos quando estão normais ou não aparecem nas imagens (ortografia padrão: "à ultrassonografia").</summary>
    public const string TextoLinfonodos = "Não foi evidenciada à ultrassonografia linfonodomegalia abdominal.";

    /// <summary>Texto padrão do pâncreas quando não aparece nas imagens (sem inventar medida: ela só entra se o aparelho mediu).</summary>
    /// <summary>Texto padrão das alças intestinais (sem números: espessura e limite só entram se houver medida do aparelho e referência).</summary>
    public const string TextoAlcas = "distribuição habitual e estratificação parietal preservada. Conteúdo luminal gasoso e mucoso em intestino delgado e hiperecogênico (fecal) em cólon. Peristaltismo presente e evolutivo.";

    public static bool EhAlcas(string? orgao) =>
        orgao is not null && (orgao.Trim().StartsWith("alças", StringComparison.OrdinalIgnoreCase) || orgao.Trim().StartsWith("alcas", StringComparison.OrdinalIgnoreCase));

    public const string TextoPancreas = "Pâncreas com dimensões conservadas. Contornos regulares e ecogenicidade isoecoica em relação à gordura mesentérica adjacente, sem sinais de reatividade.";


    public static bool EhPancreas(string? orgao) =>
        orgao is not null && (orgao.Trim().StartsWith("pâncreas", StringComparison.OrdinalIgnoreCase) || orgao.Trim().StartsWith("pancreas", StringComparison.OrdinalIgnoreCase));

    /// <summary>Texto padrão de um órgão que não aparece nas imagens (em vez de "não incluído nas imagens"), ou null.</summary>
    public static string? TextoSemImagem(string? orgao) =>
        EhLinfonodos(orgao) ? TextoLinfonodos : EhPancreas(orgao) ? TextoPancreas : EhAlcas(orgao) ? TextoAlcas : null;

    public static bool EhLinfonodos(string? orgao) =>
        orgao is not null && orgao.Trim().StartsWith("linfonod", StringComparison.OrdinalIgnoreCase);

    /// <summary>Órgãos avaliados na ultrassonografia abdominal, conforme o sexo.</summary>
    public static List<string> OrgaosAbdominal(string? sexo)
    {
        // ordem e nomes do laudo do médico: Rins numa linha só (os dois rins); reprodutor antes dos linfonodos
        var orgaos = new List<string>
        {
            "Fígado", "Vesícula Biliar", "Estômago", "Alças Intestinais", "Pâncreas", "Baço", "Rins", "Adrenais", "Vesícula Urinária",
        };
        orgaos.AddRange(sexo switch
        {
            "M" => ["Próstata", "Testículos"],
            "F" => ["Útero", "Ovários"],
            _ => ["Órgãos reprodutivos"],
        });
        orgaos.Add("Linfonodos");
        return orgaos;
    }

    /// <summary>Frase de normalidade de cada órgão (botão "Normal" na revisão). Futuramente, editável por clínica.</summary>
    public static readonly IReadOnlyDictionary<string, string> Normalidade = new Dictionary<string, string>
    {
        // padrão do médico (sem repetir o nome do órgão no início: o laudo já o imprime)
        ["Fígado"] = "dimensões preservadas em relação aos limites do gradil costal, superfície regular e bordas afiladas. Ecotextura homogênea e ecogenicidade mantida. Arquitetura vascular com trajeto e calibre preservados.",
        ["Vesícula Biliar"] = "parede fina, mucosa regular e repleta por moderada quantidade de conteúdo anecogênico homogêneo. Não há sinais de dilatação em vias biliares intra e/ou extra-hepáticas.",
        ["Estômago"] = "discretamente distendido por conteúdo alimentar, estratificação parietal e espessura preservadas nas porções passíveis de avaliação. Peristaltismo presente e evolutivo.",
        ["Alças Intestinais"] = TextoAlcas,
        ["Pâncreas"] = "lobo pancreático esquerdo com dimensões preservadas, ecotextura homogênea e ecogenicidade mantida. Ducto pancreático sem evidência de dilatação.",
        ["Baço"] = "dimensões preservadas, bordas finas, superfícies parietal e visceral regulares, parênquima homogêneo e ecogenicidade mantida.",
        ["Rins"] = "simétricos, contornos regulares, definição córtico-medular preservada bilateralmente e ecogenicidade cortical mantida. Não há evidências de litíases ou pielectasia.",
        ["Adrenais"] = "formato habitual, margens regulares, contornos definidos, ecogenicidade mantida e ecotextura homogênea. Dimensões preservadas.",
        ["Vesícula Urinária"] = "em moderada distensão, parede preservada, mucosa regular e conteúdo anecogênico homogêneo. Não há sinais de litíases.",
        ["Linfonodos"] = TextoLinfonodos,
        ["Próstata"] = "contornos definidos, margens regulares, ecogenicidade mantida, ecotextura homogênea e dimensões preservadas.",
        ["Testículos"] = "simétricos, contornos regulares, linhas mediastinais bem definidas, ecogenicidade preservada e ecotextura homogênea.",
        ["Útero"] = "corpo e cornos uterinos com dimensões preservadas, hipoecogênicos e sem evidências de conteúdo luminal.",
        ["Ovários"] = "direito e esquerdo com dimensões e aspecto ultrassonográfico habituais, hipoecogênicos.",
        ["Órgãos reprodutivos"] = "Órgãos reprodutivos sem alterações ultrassonográficas evidentes.",
        // nomes usados em laudos antigos
        ["Próstata e testículos"] = "Próstata com dimensões, contornos e ecotextura habituais. Testículos com dimensões e ecotextura habituais.",
        ["Útero e ovários"] = "não caracterizados, compatível com ovariohisterectomia prévia.",
        ["Vesícula biliar"] = "parede fina, mucosa regular e repleta por moderada quantidade de conteúdo anecogênico homogêneo. Não há sinais de dilatação em vias biliares intra e/ou extra-hepáticas.",
        ["Alças intestinais"] = TextoAlcas,
        ["Bexiga urinária"] = "em moderada distensão, parede preservada, mucosa regular e conteúdo anecogênico homogêneo. Não há sinais de litíases.",
        ["Rim esquerdo"] = "contornos regulares, definição córtico-medular preservada e ecogenicidade cortical mantida. Não há evidências de litíases ou pielectasia.",
        ["Rim direito"] = "contornos regulares, definição córtico-medular preservada e ecogenicidade cortical mantida. Não há evidências de litíases ou pielectasia.",
    };

    /// <summary>
    /// Tira da descrição o nome do órgão repetido no início ("Baço: dimensões…" sob o título "Baço:"), pois o laudo já
    /// imprime o nome do órgão antes do texto. Reconhece o nome do órgão e o do grupo do banco de frases ("Rins:").
    /// </summary>
    public static string LimparPrefixoOrgao(string? orgao, string? descricao)
    {
        var d = (descricao ?? "").Trim();
        var i = d.IndexOf(':');
        if (i <= 0 || i > 40) return d;
        static string N(string s) => new string(s.Normalize(System.Text.NormalizationForm.FormD)
            .Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray())
            .ToLowerInvariant().Trim();
        var prefixo = N(d[..i]);
        var o = N(orgao ?? "");
        var bloco = N(BancoFrases.BlocoDoOrgao(orgao) ?? "");
        var igual = prefixo == o || (bloco.Length > 0 && prefixo == bloco) || (o.Length > 0 && (o.StartsWith(prefixo) || prefixo.StartsWith(o)));
        return igual ? d[(i + 1)..].TrimStart() : d;
    }

    /// <summary>Rótulos que o veterinário pode dar a uma imagem ("o que ela mostra"), para conferir a IA e formar a base de treino.</summary>
    public static List<string> OpcoesRotuloImagem()
    {
        var l = new List<string>
        {
            "Fígado", "Vesícula biliar", "Baço", "Rim esquerdo", "Rim direito", "Bexiga urinária", "Estômago", "Alças intestinais",
            "Pâncreas", "Adrenal esquerda", "Adrenal direita", "Linfonodos", "Próstata", "Testículos", "Útero", "Ovários",
            "Líquido livre / cavidade abdominal", "Outro órgão ou estrutura", "Sem órgão (tela, medida ou texto)", "Imagem de má qualidade",
        };
        return l;
    }

    /// <summary>Observação padrão no fim do laudo.</summary>
    public const string Observacao = "A ultrassonografia é um método complementar, portanto o diagnóstico deve ser estabelecido pelo médico veterinário responsável, com base na correlação com o histórico clínico e os demais exames. As imagens apresentadas no laudo são ilustrativas, sendo a interpretação realizada em tempo real, no momento do exame.";

    /// <summary>Como a IA usa o banco de frases do "Laudo Fácil" (vai antes do banco, no prompt).</summary>
    public const string InstrucaoBancoFrases = """
        BANCO DE FRASES PADRÃO DA CLÍNICA (modelo "Laudo Fácil"):
        Abaixo estão as frases de normalidade e de cada alteração, por órgão, com a impressão diagnóstica correspondente.
        - Escreva a descrição de cada órgão no ESTILO dessas frases (mesma terminologia e ordem). Escolha a frase que
          corresponde ao que você vê; se nada corresponder, escreva no mesmo estilo.
        - Troque os "0,0 cm", "x", "0," pelos números reais (medidas do aparelho). Escolha UMA das opções separadas por
          barra (ex.: baixa/moderada/acentuada; ventral/dorsal) conforme o caso. Sem medida disponível, omita o trecho
          do número em vez de escrever "0,0" ou "x". Nunca invente números nem deixe barras ou "x" no texto.
        - Em "impressaoDiagnostica", use as frases de impressão (=> IMPRESSÃO) dos achados ALTERADOS, uma frase por
          linha (separe com quebra de linha). Não repita impressão de órgão normal.
        - Fotos com "descrição do aparelho" identificam o órgão ou a região: dê preferência a elas ao avaliar cada
          órgão e ao escolher "imagensSugeridas".
        """;

    public const string Sistema = """
        Você é um assistente de pré-laudo de ultrassonografia veterinária no Brasil. Você recebe as imagens de um
        exame de ultrassom de um cão ou gato, os dados do paciente, as medidas feitas no aparelho e informações
        escritas pela clínica, e escreve um PRÉ-LAUDO em português do Brasil, no padrão usado pelos
        ultrassonografistas veterinários brasileiros.

        O pré-laudo NÃO é o laudo final: um médico-veterinário vai revisar, corrigir e assinar. Por isso:
        - Descreva somente o que é possível ver nas imagens enviadas. Nunca invente achados.
        - Se um órgão não aparece em nenhuma imagem, marque "nao_visualizado" e diga o motivo provável
          (não incluído nas imagens, gases, obesidade etc.). Não descreva órgão que você não viu.
        - Linfonodos: se estiverem normais, sem alterações, ou se não aparecerem nas imagens, use situacao "normal" e escreva
          exatamente: "Não foi evidenciada à ultrassonografia linfonodomegalia abdominal." Só descreva linfonodos se houver alteração.
        - Pâncreas: se não aparecer nas imagens, use situacao "nao_visualizado" (o sistema aplica o texto padrão). Se aparecer e estiver
          normal, use a frase "lobo pancreático esquerdo com dimensões preservadas (X cm), ecotextura homogênea e ecogenicidade mantida.
          Ducto pancreático sem evidência de dilatação (Y cm)." com as medidas lidas nas imagens; omita o trecho de qualquer medida que
          não exista. Nunca invente medida.
        - Alças Intestinais: use o padrão "distribuição habitual e estratificação parietal preservada." e, havendo medidas, a espessura
          da parede por segmento em cm (ex.: "duodeno descendente: 0,33 cm; jejuno: 0,17 cm; cólon descendente: 0,13 cm"); se a parede
          estiver espessada, "Observa-se espessamento de parede em segmento de ...". Conteúdo luminal e "Peristaltismo presente e
          evolutivo." conforme as frases padrão. Se não aparecerem nas imagens, situacao "nao_visualizado" (o sistema aplica o texto padrão).
        - Use as medidas do aparelho quando existirem e cite-as com unidade. Não invente medidas.
        - O operador escreve dentro da própria imagem o rótulo do órgão e medidas (ex.: "COLON", "Dist 0.13 cm"; quadro com linha
          ciano). Leia esse texto: use o rótulo para identificar o órgão e cite a medida com unidade, indicando que foi
          "medida lida na imagem N". Imagens assim são as mais confiáveis para identificar o órgão.
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

        PADRÃO DO MÉDICO (siga em todo exame; o laudo final dele tem esta forma):
        - Uma linha por órgão, na ordem da lista fornecida. "Rins" é UMA linha com os dois rins ("simétricos, medindo o esquerdo
          X cm e o direito Y cm de comprimento em plano longitudinal. ..."). Não separe rim esquerdo e direito.
        - A descrição começa em minúscula, SEM repetir o nome do órgão ("Estômago: discretamente distendido por ..."), no
          estilo das frases padrão. Medidas sempre em cm, com vírgula decimal e duas casas (ex.: "0,17 cm"); lesões como
          "medindo 0,55 x 0,30 cm", com localização ("na superfície visceral da região de extremidade dorsal").
        - As medidas vêm das anotações escritas na imagem (ex.: "Dist 0.13 cm") e do aparelho; cada medida na região do órgão que o
          rótulo da imagem indica ("COLON", "ESTOMAGO", "PANCREAS"...). Use todas as medidas disponíveis de cada órgão.
        - Peristaltismo: escreva "presente e evolutivo" (o médico acompanha o exame ao vivo). Nunca escreva "não avaliável por
          imagens estáticas".
        - "impressaoDiagnostica": uma frase curta por alteração, no estilo "Achados em baço compatíveis com neoplasia / hiperplasia
          nodular." / "Alterações visibilizadas em alças intestinais são indicativas de processo inflamatório (duodenite)." /
          "Imagens em rim esquerdo compatíveis com mineralização.". Sem recomendações, sem diferenciais longos, sem condições
          técnicas extensas: "condicoesTecnicas" curta.
        - Atenção a achados sutis e bilaterais (ex.: pontos ecogênicos dispersos em cortical renal = mineralização): descreva-os.
        - Seja conservador com alertas urgentes (veja as regras do alerta).

        IMAGENS POR ÓRGÃO: identifique, em cada imagem enviada, qual órgão ela mostra. Em cada item de "orgaos", informe em
        "imagens" os números (0 a 3, as mais representativas) das imagens que mostram ESSE órgão, preferindo as que têm
        descrição do aparelho. Se nenhuma imagem mostra o órgão, deixe a lista vazia. O veterinário vai conferir e corrigir
        essa associação, então não force: na dúvida, deixe de fora.

        ALERTA DE ACHADO URGENTE ("achadoUrgente"): é a conclusão mais forte do pré-laudo e só vale para achados que pedem
        atenção imediata (ex.: líquido livre abundante, piometra, corpo estranho obstrutivo, torção, ruptura). Seja
        conservador: um alerta falso faz o veterinário desconfiar do restante.
        - Só marque quando houver SINAIS ESPECÍFICOS visíveis, descritos em "evidenciaUrgencia" imagem por imagem (o que se
          vê em cada uma), e em pelo menos 2 imagens diferentes. Um sinal inespecífico sozinho (ex.: alças plissadas, alça
          dilatada, líquido em pequena quantidade) NÃO é urgente: descreva-o no órgão e cite a hipótese em
          "diferenciais", sem alerta.
        - Para corpo estranho linear, exija estrutura linear ecogênica identificada (com ou sem sombra) e alças
          plissadas/dilatadas associadas; plissamento isolado sugere outras causas (enterite, enteropatia inflamatória).
        - "confiancaUrgencia": "alta" só se os sinais específicos estão claros em 2 ou mais imagens; "media" se há indícios
          mas faltam sinais específicos; "baixa" se é uma suspeita. Sem alerta, deixe "".
        - Em "imagensUrgencia" informe os números (1 a 3) das imagens que mostram o achado, preferindo as que têm
          descrição do aparelho; sem alerta, lista vazia. Em "motivoUrgencia" escreva o achado de forma objetiva, sem
          afirmar o que as imagens não permitem confirmar.

        Escolha em "imagensSugeridas" os números das imagens (de 4 a 8, preferindo as que têm descrição do aparelho) que melhor mostram os achados para a
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
            "recomendacoes", "imagensSugeridas", "achadoUrgente", "motivoUrgencia", "imagensUrgencia", "confiancaUrgencia", "evidenciaUrgencia" },
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
                    ["required"] = new[] { "orgao", "situacao", "descricao", "imagens" },
                    ["properties"] = new Dictionary<string, object>
                    {
                        ["orgao"] = new { type = "string" },
                        ["situacao"] = new { type = "string", @enum = new[] { Normal, Alterado, NaoVisualizado } },
                        ["descricao"] = new { type = "string" },
                        ["imagens"] = new { type = "array", items = new { type = "integer" } },
                    },
                },
            },
            ["impressaoDiagnostica"] = new { type = "string" },
            ["diferenciais"] = new { type = "array", items = new { type = "string" } },
            ["recomendacoes"] = new { type = "array", items = new { type = "string" } },
            ["imagensSugeridas"] = new { type = "array", items = new { type = "integer" } },
            ["achadoUrgente"] = new { type = "boolean" },
            ["motivoUrgencia"] = new { type = "string" },
            ["imagensUrgencia"] = new { type = "array", items = new { type = "integer" } },
            ["confiancaUrgencia"] = new { type = "string", @enum = new[] { "alta", "media", "baixa", "" } },
            ["evidenciaUrgencia"] = new { type = "string" },
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
        // órgãos com texto padrão quando fora das imagens (a IA às vezes escreve "não incluído nas imagens")
        var no = System.Text.Json.Nodes.JsonNode.Parse(texto)!;
        var lista = no["orgaos"]!.AsArray();
        for (var k = lista.Count - 1; k >= 0; k--) // "Cavidade abdominal" não faz mais parte do laudo
            if (lista[k]?["orgao"]?.GetValue<string>() is { } nomeO && nomeO.Trim().StartsWith("cavidade abdominal", StringComparison.OrdinalIgnoreCase)) lista.RemoveAt(k);
        foreach (var item in no["orgaos"]!.AsArray())
        {
            if (item is not System.Text.Json.Nodes.JsonObject org) continue;
            var nomeOrgao = org["orgao"]?.GetValue<string>();
            if (org["descricao"]?.GetValue<string>() is { } descOriginal) org["descricao"] = LimparPrefixoOrgao(nomeOrgao, descOriginal);
            var padrao = TextoSemImagem(nomeOrgao);
            if (padrao is null) continue;
            var sit = org["situacao"]?.GetValue<string>();
            // linfonodos normais ou fora das imagens e pâncreas fora das imagens: texto padrão
            if (sit is NaoVisualizado || (EhLinfonodos(nomeOrgao) && sit is Normal))
            {
                org["situacao"] = Normal;
                org["descricao"] = padrao;
            }
        }
        // alerta urgente: sem pelo menos 2 imagens indicadas, a confiança não pode ser "alta"
        if (no is System.Text.Json.Nodes.JsonObject raiz && raiz["achadoUrgente"]?.GetValue<bool>() == true)
        {
            var qtd = raiz["imagensUrgencia"] is System.Text.Json.Nodes.JsonArray ia ? ia.Select(x => x?.GetValue<int>()).Distinct().Count() : 0;
            var conf = raiz["confiancaUrgencia"]?.GetValue<string>();
            if (qtd < 2 && conf is not ("media" or "baixa")) raiz["confiancaUrgencia"] = qtd == 0 ? "baixa" : "media";
            else if (conf is null or "") raiz["confiancaUrgencia"] = "media";
        }
        el = JsonSerializer.Deserialize<JsonElement>(no.ToJsonString());
        return el;
    }
}

using System.Text.Json;

namespace Vetus.Api.Servicos;

/// <summary>Um item ordenável (campo da identificação ou seção do laudo) que a clínica pode mostrar ou ocultar.</summary>
public record ItemLayout(string Id, bool Mostrar = true);

/// <summary>
/// Aparência do PDF do laudo, escolhida pela clínica: cores, fonte, cabeçalho, campos da identificação,
/// ordem e visibilidade das seções, prancha, assinatura, QR code e textos. Guardada em JSON na clínica;
/// sem configuração, vale o padrão ("Padrão AutoLaudoVet").
/// </summary>
public record LayoutLaudo
{
    // ---- cores e fonte
    public string CorPrincipal { get; init; } = "#0E4D64";
    public string CorFundoIdentificacao { get; init; } = "#F1F4F8";
    /// <summary>Tamanho base do texto, em pontos (8 a 12).</summary>
    public double TamanhoFonte { get; init; } = 9.5;
    /// <summary>Tamanho do texto da caixa de identificação, em pontos (8 a 14); 0 = igual ao texto do laudo.</summary>
    public double TamanhoFonteIdentificacao { get; init; }
    /// <summary>Cor das bordas das caixas (estilo "caixa") e do fundo das linhas.</summary>
    public string CorBorda { get; init; } = "#E5DCDC";
    /// <summary>Margem da página, em cm (0,5 a 2,5).</summary>
    public double MargemCm { get; init; } = 1.4;
    /// <summary>simples (título colorido) ou caixa (título dentro de uma caixa com borda; a identificação também ganha borda).</summary>
    public string EstiloTitulos { get; init; } = "simples";

    // ---- cabeçalho
    public bool LinhaCabecalho { get; init; } = true;
    public bool MostrarNomeClinica { get; init; } = true;
    public bool MostrarDocumento { get; init; }
    public bool MostrarEndereco { get; init; } = true;
    public bool MostrarTelefone { get; init; } = true;
    public bool MostrarEmail { get; init; } = true;
    /// <summary>Alinhamento do nome e contato quando o logo está no centro (esquerda, centro, direita).</summary>
    public string AlinhamentoTitulo { get; init; } = "centro";
    /// <summary>Altura do logo no cabeçalho, em pontos (30 a 260; 60 = padrão).</summary>
    public int AlturaLogo { get; init; } = 60;

    // ---- título do laudo
    public bool MostrarTitulo { get; init; } = true;
    /// <summary>Texto do título; {tipo} vira o tipo do exame (ex.: "LAUDO — {tipo}"). Vazio = padrão.</summary>
    public string? TextoTitulo { get; init; }

    // ---- identificação do paciente
    /// <summary>Título da caixa de identificação (ex.: "Dados"); vazio = sem título.</summary>
    public string? TituloIdentificacao { get; init; }
    public int ColunasIdentificacao { get; init; } = 3;
    public List<ItemLayout> Identificacao { get; init; } = CamposPadrao();

    // ---- corpo: seções na ordem em que aparecem
    public List<ItemLayout> Secoes { get; init; } = SecoesPadrao();

    // ---- prancha, assinatura e rodapé
    /// <summary>Título da seção de achados (ex.: "Relatório Ultrassonográfico"); vazio = "Achados".</summary>
    public string? TextoTituloAchados { get; init; }
    public bool MostrarTituloPrancha { get; init; } = true;
    /// <summary>preto (padrão) ou nenhum (foto sem moldura, na proporção do aparelho).</summary>
    public string FundoPrancha { get; init; } = "preto";
    public int ColunasPrancha { get; init; } = 2;
    /// <summary>esquerda, centro ou direita.</summary>
    public string AlinhamentoAssinatura { get; init; } = "centro";
    /// <summary>Linha extra abaixo do nome do assinante (ex.: especialidade). Opcional.</summary>
    public string? TextoAssinatura { get; init; }
    /// <summary>esquerda ou direita.</summary>
    public string PosicaoQr { get; init; } = "direita";
    /// <summary>Texto fixo no rodapé (ex.: endereço, site). Opcional.</summary>
    public string? TextoRodape { get; init; }
    public bool MostrarCreditoProduto { get; init; } = true;
    /// <summary>Texto do aviso ao final; vazio = o aviso padrão.</summary>
    public string? TextoAviso { get; init; }

    public static readonly string[] CamposConhecidos =
        ["paciente", "especie", "raca", "sexo", "idade", "peso", "responsavel", "solicitante", "clinicaSolicitante", "data", "dataHora", "suspeita", "equipamento", "idAnimal"];
    public static readonly string[] SecoesConhecidas =
        ["condicoes", "achados", "impressao", "diferenciais", "recomendacoes", "aviso", "prancha", "assinatura"];

    public static readonly Dictionary<string, string> NomesCampos = new()
    {
        ["paciente"] = "Paciente", ["especie"] = "Espécie", ["raca"] = "Raça", ["sexo"] = "Sexo", ["idade"] = "Idade",
        ["peso"] = "Peso", ["responsavel"] = "Responsável", ["solicitante"] = "Solicitante", ["data"] = "Data do exame",
        ["suspeita"] = "Suspeita clínica", ["equipamento"] = "Equipamento", ["idAnimal"] = "ID do animal (aparelho)",
        ["clinicaSolicitante"] = "Clínica do solicitante", ["dataHora"] = "Data e hora do exame",
    };
    public static readonly Dictionary<string, string> NomesSecoes = new()
    {
        ["condicoes"] = "Condições técnicas", ["achados"] = "Achados por órgão", ["impressao"] = "Impressão diagnóstica",
        ["diferenciais"] = "Diagnósticos diferenciais", ["recomendacoes"] = "Recomendações", ["aviso"] = "Aviso final",
        ["prancha"] = "Prancha de imagens", ["assinatura"] = "Assinatura",
    };

    public static List<ItemLayout> CamposPadrao() => CamposConhecidos.Select(c => new ItemLayout(c, c is not ("idAnimal" or "clinicaSolicitante" or "dataHora"))).ToList();
    public static List<ItemLayout> SecoesPadrao() => SecoesConhecidas.Select(s => new ItemLayout(s)).ToList();

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>Layout salvo na clínica (ou o padrão), já corrigido: valores válidos e todos os itens presentes.</summary>
    public static LayoutLaudo Ler(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new LayoutLaudo();
        try { return (JsonSerializer.Deserialize<LayoutLaudo>(json, Json) ?? new LayoutLaudo()).Normalizar(); }
        catch (JsonException) { return new LayoutLaudo(); }
    }

    public string Serializar() => JsonSerializer.Serialize(Normalizar(), Json);

    /// <summary>Garante valores aceitos (cor #RRGGBB, limites, itens conhecidos sem repetição e nenhum faltando).</summary>
    public LayoutLaudo Normalizar()
    {
        static string Cor(string? c, string padrao) =>
            c is { Length: 7 } && c[0] == '#' && c[1..].All(Uri.IsHexDigit) ? c.ToUpperInvariant() : padrao;
        static string Opcao(string? v, string padrao, params string[] validas) =>
            validas.Contains(v?.Trim().ToLowerInvariant()) ? v!.Trim().ToLowerInvariant() : padrao;
        static string? Tx(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];
        static List<ItemLayout> Itens(List<ItemLayout>? itens, string[] conhecidos, List<ItemLayout> padrao)
        {
            var r = new List<ItemLayout>();
            foreach (var i in itens ?? [])
                if (conhecidos.Contains(i.Id) && r.All(x => x.Id != i.Id)) r.Add(i);
            foreach (var p in padrao) if (r.All(x => x.Id != p.Id)) r.Add(p); // item novo no sistema: entra no fim
            return r;
        }

        return this with
        {
            CorPrincipal = Cor(CorPrincipal, "#0E4D64"),
            CorFundoIdentificacao = Cor(CorFundoIdentificacao, "#F1F4F8"),
            TamanhoFonte = Math.Clamp(double.IsFinite(TamanhoFonte) ? TamanhoFonte : 9.5, 8, 12),
            CorBorda = Cor(CorBorda, "#E5DCDC"),
            TamanhoFonteIdentificacao = double.IsFinite(TamanhoFonteIdentificacao) && TamanhoFonteIdentificacao >= 8 ? Math.Min(TamanhoFonteIdentificacao, 14) : 0,
            MargemCm = Math.Clamp(double.IsFinite(MargemCm) ? MargemCm : 1.4, 0.5, 2.5),
            EstiloTitulos = Opcao(EstiloTitulos, "simples", "simples", "caixa"),
            AlturaLogo = Math.Clamp(AlturaLogo, 30, 260),
            FundoPrancha = Opcao(FundoPrancha, "preto", "preto", "nenhum"),
            TituloIdentificacao = Tx(TituloIdentificacao, 60),
            TextoTituloAchados = Tx(TextoTituloAchados, 80),
            AlinhamentoTitulo = Opcao(AlinhamentoTitulo, "centro", "esquerda", "centro", "direita"),
            ColunasIdentificacao = Math.Clamp(ColunasIdentificacao, 1, 3),
            ColunasPrancha = Math.Clamp(ColunasPrancha, 1, 3),
            AlinhamentoAssinatura = Opcao(AlinhamentoAssinatura, "centro", "esquerda", "centro", "direita"),
            PosicaoQr = Opcao(PosicaoQr, "direita", "esquerda", "direita"),
            TextoTitulo = Tx(TextoTitulo, 120),
            TextoAssinatura = Tx(TextoAssinatura, 120),
            TextoRodape = Tx(TextoRodape, 200),
            TextoAviso = Tx(TextoAviso, 800),
            Identificacao = Itens(Identificacao, CamposConhecidos, CamposPadrao()),
            Secoes = Itens(Secoes, SecoesConhecidas, SecoesPadrao()),
        };
    }
}

using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// Padroniza o texto que o veterinário ditou (fala informal) para o padrão dos laudos de ultrassonografia veterinária,
/// como se ele mesmo tivesse digitado. Usa o banco de frases do órgão como exemplo de estilo. Cobra o custo (pequeno).
/// </summary>
public class Padronizador(VetusDb db, ConfiguracaoIa cfg, IEnumerable<IGeradorLaudo> geradores, BancoFrases frases, Cobranca cobranca,
    ILogger<Padronizador> log)
{
    public const int MaxTexto = 3000;

    private const string Sistema = """
        Você é o redator técnico de um médico-veterinário ultrassonografista no Brasil. Ele ditou, em linguagem informal,
        o que quer registrar no laudo de um órgão. Reescreva o relato no padrão técnico dos laudos de ultrassonografia
        veterinária brasileiros, como se o próprio médico o tivesse digitado.

        Regras:
        - Use a terminologia técnica e a ortografia padrão (ex.: "ecogenicidade", "ecotextura", "contornos regulares",
          "à ultrassonografia"). Frases objetivas, no estilo dos exemplos; sem gírias, sem "eu vi", sem primeira pessoa.
        - NÃO invente achados, medidas ou números. Use somente o que o médico disse (e, se houver, a descrição atual).
        - Mantenha TODAS as informações do relato. Se o relato corrigir algo da descrição atual, o relato prevalece; se
          acrescentar, integre ao texto atual num único parágrafo coerente.
        - Medidas: escreva o número com a unidade que o médico falou, com vírgula decimal (ex.: "0,55 cm").
        - Não escreva o nome do órgão no início (o laudo já o imprime), não use aspas, títulos, listas nem comentários.
        - Responda SOMENTE com o texto final do órgão.
        """;

    private List<IGeradorLaudo> Disponiveis() => cfg.Simulada
        ? geradores.Where(g => g.Nome == "simulado").ToList()
        : cfg.Ordem.Select(n => geradores.FirstOrDefault(g => g.Nome == n)).OfType<IGeradorLaudo>().Where(g => g.Configurado).ToList();

    public async Task<(DitadoOrgao ditado, string? erro, int status)> Padronizar(Exame e, int laudoVersao, string orgao, string relato,
        string? descricaoAtual, Usuario u, CancellationToken ct)
    {
        var ias = Disponiveis();
        if (ias.Count == 0) return (null!, "Nenhuma IA configurada.", 503);
        if (await cobranca.Saldo(e.ClinicaId) < 0.01m) return (null!, "Saldo insuficiente para padronizar o texto. Peça uma recarga de créditos.", 402);

        // exemplos de estilo: frases do banco para este órgão
        var estilo = "";
        if (frases.Bloco(BancoFrases.BlocoDoOrgao(orgao)) is { } bloco)
            estilo = "EXEMPLOS DE ESTILO (frases padrão da clínica para este órgão):\n" + string.Join('\n',
                bloco.Entradas.Where(x => x.Descricao.Length > 0).Take(8).Select(x => "- " + x.Descricao.Split('\n')[0]));

        var pedido = $"""
            Paciente: {e.Paciente.Nome} ({e.Paciente.Especie}{(string.IsNullOrWhiteSpace(e.Paciente.Raca) ? "" : ", " + e.Paciente.Raca)})
            Órgão: {orgao}

            {estilo}

            DESCRIÇÃO ATUAL DO ÓRGÃO NO LAUDO:
            {(string.IsNullOrWhiteSpace(descricaoAtual) ? "(vazia)" : descricaoAtual)}

            RELATO DO MÉDICO:
            {relato}
            """;

        var erros = new List<string>();
        foreach (var ia in ias)
        {
            try
            {
                var r = await ia.Texto(Sistema, pedido, ct);
                var texto = LimparSaida(r.Json, orgao);
                if (texto.Length == 0) throw new InvalidOperationException("resposta vazia");
                var valor = await cobranca.Calcular(r.Modelo, r.TokensEntrada, r.TokensSaida);
                var ditado = db.DitadosOrgao.Add(new DitadoOrgao
                {
                    ClinicaId = e.ClinicaId, ExameId = e.Id, LaudoVersao = laudoVersao, Orgao = orgao,
                    TextoBruto = relato, DescricaoAnterior = descricaoAtual, TextoPadronizado = texto,
                    Ia = r.Ia, Modelo = r.Modelo, UsuarioId = u.Id, UsuarioNome = u.Nome,
                }).Entity;
                await db.SaveChangesAsync(ct);
                if (valor.CobradoBrl > 0)
                    await cobranca.Movimentar(e.ClinicaId, -valor.CobradoBrl, "debito", $"Padronização de texto ditado ({orgao}) — {e.Paciente.Nome}", e.Id, u.Id, valor.CustoBrl, r.Ia);
                await cobranca.DescontarProvedor(r.Ia, valor.CustoUsd, valor.CustoBrl);
                return (ditado, null, 200);
            }
            catch (Exception x) when (x is not OperationCanceledException)
            {
                log.LogWarning("Padronização ({Orgao}): {Ia} falhou: {Erro}", orgao, ia.Nome, x.Message);
                erros.Add($"{ia.Nome}: {x.Message}");
            }
        }
        return (null!, "Não foi possível padronizar o texto agora. " + string.Join(" | ", erros), 502);
    }

    /// <summary>Tira aspas, cercas de código e o nome do órgão repetido no início.</summary>
    private static string LimparSaida(string s, string orgao)
    {
        var t = s.Trim().Trim('`').Trim().Trim('"', '“', '”').Trim();
        return ModeloLaudo.LimparPrefixoOrgao(orgao, t);
    }
}

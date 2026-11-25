using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>Valores de uma geração: custo real no provedor e quanto a clínica paga.</summary>
public record ValorGeracao(decimal CustoUsd, decimal CustoBrl, decimal CobradoBrl, bool PrecoConhecido);

/// <summary>
/// Cobrança dos pré-laudos: cada geração debita do saldo da clínica o custo real (tokens × preço do modelo × câmbio)
/// multiplicado pelo fator configurado. Erros e "nada mudou" não cobram.
/// </summary>
public class Cobranca(VetusDb db, ILogger<Cobranca> log)
{
    /// <summary>Tamanho típico de uma geração completa (para estimar antes de haver histórico).</summary>
    private const int TokensEntradaTipico = 18_000, TokensSaidaTipico = 4_000;

    public Task<ConfiguracaoCobranca> Config() => db.ConfiguracoesCobranca.SingleAsync(x => x.Id == 1);

    public async Task<ValorGeracao> Calcular(string modelo, int tokensEntrada, int tokensSaida)
    {
        var cfg = await Config();
        var preco = await db.PrecosModelos.FindAsync(modelo);
        if (preco is null)
        {
            log.LogWarning("Sem preço cadastrado para o modelo {Modelo}: geração não cobrada. Cadastre em Cobrança (sistema).", modelo);
            return new ValorGeracao(0, 0, 0, false);
        }
        var usd = (tokensEntrada * preco.EntradaUsdPorMilhao + tokensSaida * preco.SaidaUsdPorMilhao) / 1_000_000m;
        var brl = usd * cfg.CambioUsdBrl;
        var cobrado = Math.Round(brl * cfg.Fator, 2, MidpointRounding.AwayFromZero);
        if (cobrado == 0 && brl > 0) cobrado = 0.01m; // nada sai de graça por arredondamento
        return new ValorGeracao(Math.Round(usd, 6), Math.Round(brl, 6), cobrado, true);
    }

    /// <summary>
    /// Média cobrada por pré-laudo: dos últimos 20 da clínica; sem histórico, dos últimos 50 do sistema;
    /// sem nenhum, a estimativa de uma geração típica com o modelo principal.
    /// </summary>
    public async Task<decimal> MediaPorLaudo(Guid clinicaId, string? modeloPrincipal)
    {
        var daClinica = await db.MovimentosSaldo.Where(m => m.ClinicaId == clinicaId && m.Tipo == "debito")
            .OrderByDescending(m => m.Em).Take(20).Select(m => -m.Valor).ToListAsync();
        if (daClinica.Count > 0) return Math.Round(daClinica.Average(), 2);
        var geral = await db.MovimentosSaldo.Where(m => m.Tipo == "debito")
            .OrderByDescending(m => m.Em).Take(50).Select(m => -m.Valor).ToListAsync();
        if (geral.Count > 0) return Math.Round(geral.Average(), 2);
        return modeloPrincipal is null ? 0 : (await Calcular(modeloPrincipal, TokensEntradaTipico, TokensSaidaTipico)).CobradoBrl;
    }

    /// <summary>Saldo atual (lido do banco, sem cache).</summary>
    public Task<decimal> Saldo(Guid clinicaId) =>
        db.Clinicas.Where(c => c.Id == clinicaId).Select(c => c.SaldoBrl).SingleAsync();

    /// <summary>
    /// Movimenta o saldo de forma atômica no banco (duas gerações ao mesmo tempo não se atropelam)
    /// e registra no extrato. Valor negativo = débito.
    /// </summary>
    public async Task<decimal> Movimentar(Guid clinicaId, decimal valor, string tipo, string descricao, Guid? exameId = null, Guid? usuarioId = null,
        decimal custoBrl = 0, string? ia = null)
    {
        var saldo = (await db.Database.SqlQuery<decimal>(
            $"""UPDATE clinicas SET "SaldoBrl" = "SaldoBrl" + {valor} WHERE "Id" = {clinicaId} RETURNING "SaldoBrl" AS "Value" """)
            .ToListAsync()).Single();
        db.MovimentosSaldo.Add(new MovimentoSaldo
        {
            ClinicaId = clinicaId, Tipo = tipo, Valor = valor, SaldoApos = saldo,
            Descricao = descricao.Length > 300 ? descricao[..300] : descricao, ExameId = exameId, UsuarioId = usuarioId,
            CustoBrl = custoBrl, Ia = ia,
        });
        await db.SaveChangesAsync();
        return saldo;
    }

    /// <summary>Desconta do saldo que o dono do sistema tem no provedor o custo real (para avisar quando estiver acabando).</summary>
    public async Task DescontarProvedor(string ia, decimal custoUsd, decimal custoBrl)
    {
        if (custoBrl <= 0 && custoUsd <= 0) return;
        // cada provedor tem o próprio saldo: Gemini em reais, Claude em dólares; o total (em reais) acompanha
        if (ia == "claude")
            await db.Database.ExecuteSqlAsync(
                $"""UPDATE configuracao_cobranca SET "SaldoClaudeUsd" = "SaldoClaudeUsd" - {custoUsd} WHERE "Id" = 1""");
        else if (ia == "gemini")
            await db.Database.ExecuteSqlAsync(
                $"""UPDATE configuracao_cobranca SET "SaldoGeminiBrl" = "SaldoGeminiBrl" - {custoBrl} WHERE "Id" = 1""");
        await db.Database.ExecuteSqlAsync(
            $"""UPDATE configuracao_cobranca SET "SaldoProvedorBrl" = "SaldoGeminiBrl" + "SaldoClaudeUsd" * "CambioUsdBrl" WHERE "Id" = 1""");
    }
}

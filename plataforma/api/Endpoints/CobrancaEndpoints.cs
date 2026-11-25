using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>Cobrança da IA: configuração (administrador do sistema), recargas e saldo das clínicas.</summary>
public static class CobrancaEndpoints
{
    public record PrecoReq(string? Modelo, decimal EntradaUsdPorMilhao, decimal SaidaUsdPorMilhao);
    public record ConfigReq(decimal Fator, decimal CambioUsdBrl, decimal CreditoInicialClinica, decimal SaldoProvedorBrl,
        decimal AlertaSaldoProvedorBrl, List<PrecoReq>? Precos, decimal? SaldoGeminiBrl = null, decimal? SaldoClaudeUsd = null);
    public record MovimentoReq(decimal Valor, string? Descricao);

    public static void Mapear(WebApplication app)
    {
        var adm = app.MapGroup("/api/admin").ExigirAdministradorSistema();

        adm.MapGet("/cobranca", async (VetusDb db, Cobranca cobranca) =>
        {
            var cfg = await cobranca.Config();
            var precos = await db.PrecosModelos.OrderBy(p => p.Modelo).ToListAsync();
            var laudos = db.Laudos.Where(l => l.CobradoBrl > 0 || l.CustoBrl > 0);
            var inicioMes = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var mes = laudos.Where(l => l.GeradoEm >= inicioMes);
            return Results.Ok(new
            {
                cfg.Fator, cfg.CambioUsdBrl, cfg.CreditoInicialClinica, cfg.SaldoProvedorBrl, cfg.AlertaSaldoProvedorBrl, cfg.AtualizadoEm,
                cfg.SaldoGeminiBrl, cfg.SaldoClaudeUsd, cfg.SaldosConferidosEm,
                saldoProvedorBaixo = cfg.SaldoProvedorBrl < cfg.AlertaSaldoProvedorBrl,
                precos = precos.Select(p => new { p.Modelo, p.EntradaUsdPorMilhao, p.SaidaUsdPorMilhao }),
                resumo = new
                {
                    geracoes = await laudos.CountAsync(),
                    custoBrl = await laudos.SumAsync(l => l.CustoBrl),
                    cobradoBrl = await laudos.SumAsync(l => l.CobradoBrl),
                    geracoesMes = await mes.CountAsync(),
                    custoMesBrl = await mes.SumAsync(l => l.CustoBrl),
                    cobradoMesBrl = await mes.SumAsync(l => l.CobradoBrl),
                    saldoClinicasBrl = await db.Clinicas.SumAsync(c => c.SaldoBrl),
                },
            });
        });


        // Financeiro por clínica no período: quanto cada uma pagou (recargas), quanto consumiu, quanto custou de verdade e o lucro
        adm.MapGet("/financeiro", async (DateOnly? de, DateOnly? ate, VetusDb db) =>
        {
            var inicio = (de ?? DateOnly.MinValue).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var fim = (ate ?? DateOnly.FromDateTime(DateTime.UtcNow)).AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var movs = await db.MovimentosSaldo.Where(m => m.Em >= inicio && m.Em < fim)
                .Select(m => new { m.ClinicaId, m.Tipo, m.Valor, m.CustoBrl, m.Ia }).ToListAsync();
            var clinicas = await db.Clinicas.OrderBy(c => c.Numero).Select(c => new { c.Id, c.Nome, c.SaldoBrl }).ToListAsync();
            var linhas = clinicas.Select(c =>
            {
                var m = movs.Where(x => x.ClinicaId == c.Id).ToList();
                var consumo = -m.Where(x => x.Tipo == "debito").Sum(x => x.Valor);
                var custo = m.Where(x => x.Tipo == "debito").Sum(x => x.CustoBrl);
                return new
                {
                    clinicaId = c.Id, clinica = c.Nome, saldoAtual = c.SaldoBrl,
                    recebido = m.Where(x => x.Tipo == "recarga").Sum(x => x.Valor),
                    creditosGratis = m.Where(x => x.Tipo == "credito_inicial").Sum(x => x.Valor),
                    ajustes = m.Where(x => x.Tipo == "ajuste").Sum(x => x.Valor),
                    consumo, custo, lucro = consumo - custo,
                    usos = m.Count(x => x.Tipo == "debito"),
                    semCusto = m.Count(x => x.Tipo == "debito" && x.CustoBrl == 0),
                };
            }).ToList();
            return Results.Ok(new
            {
                de, ate,
                clinicas = linhas,
                total = new
                {
                    recebido = linhas.Sum(x => x.recebido), creditosGratis = linhas.Sum(x => x.creditosGratis), ajustes = linhas.Sum(x => x.ajustes),
                    consumo = linhas.Sum(x => x.consumo), custo = linhas.Sum(x => x.custo), lucro = linhas.Sum(x => x.lucro),
                    usos = linhas.Sum(x => x.usos), semCusto = linhas.Sum(x => x.semCusto), saldoClinicas = linhas.Sum(x => x.saldoAtual),
                },
                custoPorIa = movs.Where(x => x.Tipo == "debito" && x.CustoBrl > 0).GroupBy(x => x.Ia ?? "?")
                    .Select(g => new { ia = g.Key, custo = g.Sum(x => x.CustoBrl), usos = g.Count() }).OrderByDescending(x => x.custo),
            });
        });
        adm.MapPut("/cobranca", async (ConfigReq r, VetusDb db, Cobranca cobranca) =>
        {
            if (r.Fator is < 0.1m or > 1000m) return Erros.Invalido("Fator deve ficar entre 0,1 e 1000.");
            if (r.CambioUsdBrl is <= 0 or > 100) return Erros.Invalido("Câmbio inválido.");
            if (r.CreditoInicialClinica < 0 || r.AlertaSaldoProvedorBrl < 0) return Erros.Invalido("Valores não podem ser negativos.");
            var cfg = await cobranca.Config();
            cfg.Fator = r.Fator;
            cfg.CambioUsdBrl = r.CambioUsdBrl;
            cfg.CreditoInicialClinica = r.CreditoInicialClinica;
            // saldos por provedor (conferidos no site de cada um); o total em reais é a soma, com o câmbio
            if (r.SaldoGeminiBrl is { } g && r.SaldoClaudeUsd is { } cl)
            {
                if (g != cfg.SaldoGeminiBrl || cl != cfg.SaldoClaudeUsd) cfg.SaldosConferidosEm = DateTime.UtcNow;
                cfg.SaldoGeminiBrl = g;
                cfg.SaldoClaudeUsd = cl;
                cfg.SaldoProvedorBrl = g + cl * r.CambioUsdBrl;
            }
            else cfg.SaldoProvedorBrl = r.SaldoProvedorBrl;
            cfg.AlertaSaldoProvedorBrl = r.AlertaSaldoProvedorBrl;
            cfg.AtualizadoEm = DateTime.UtcNow;
            foreach (var p in r.Precos ?? [])
            {
                var modelo = Texto.Opcional(p.Modelo);
                if (modelo is null) continue;
                if (p.EntradaUsdPorMilhao < 0 || p.SaidaUsdPorMilhao < 0) return Erros.Invalido($"Preço negativo para {modelo}.");
                var atual = await db.PrecosModelos.FindAsync(modelo);
                if (atual is null) db.PrecosModelos.Add(atual = new PrecoModelo { Modelo = modelo });
                atual.EntradaUsdPorMilhao = p.EntradaUsdPorMilhao;
                atual.SaidaUsdPorMilhao = p.SaidaUsdPorMilhao;
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // recarga (valor positivo) ou ajuste (negativo) no saldo de uma clínica
        adm.MapPost("/clinicas/{id:guid}/saldo", async (Guid id, MovimentoReq r, HttpContext http, VetusDb db, Cobranca cobranca) =>
        {
            if (!await db.Clinicas.AnyAsync(c => c.Id == id)) return Erros.NaoEncontrado("Clínica não encontrada.");
            if (r.Valor == 0 || Math.Abs(r.Valor) > 1_000_000) return Erros.Invalido("Informe um valor diferente de zero.");
            var saldo = await cobranca.Movimentar(id, Math.Round(r.Valor, 2), r.Valor > 0 ? "recarga" : "ajuste",
                Texto.Opcional(r.Descricao) ?? (r.Valor > 0 ? "Recarga de créditos" : "Ajuste"), usuarioId: Acesso.UsuarioId(http.User));
            return Results.Ok(new { saldo });
        });

        adm.MapGet("/clinicas/{id:guid}/extrato", async (Guid id, VetusDb db) =>
            Results.Ok(await db.MovimentosSaldo.Where(m => m.ClinicaId == id).OrderByDescending(m => m.Em).Take(100)
                .Select(m => new { m.Tipo, m.Valor, m.SaldoApos, m.Descricao, m.Em }).ToListAsync()));

        // saldo da clínica escolhida: todos veem o saldo e a média; o extrato é para o administrador da clínica
        app.MapGet("/api/clinica/saldo", async (HttpContext http, VetusDb db, Cobranca cobranca, ServicoLaudo laudos) =>
        {
            var v = http.VinculoAtual();
            var saldo = await cobranca.Saldo(v.ClinicaId);
            var media = await cobranca.MediaPorLaudo(v.ClinicaId, laudos.Disponiveis().FirstOrDefault()?.Modelo);
            var extrato = v.Perfil == Perfil.AdministradorClinica
                ? await db.MovimentosSaldo.Where(m => m.ClinicaId == v.ClinicaId).OrderByDescending(m => m.Em).Take(50)
                    .Select(m => new { m.Tipo, m.Valor, m.SaldoApos, m.Descricao, m.Em }).ToListAsync()
                : null;
            return Results.Ok(new
            {
                saldo = Math.Round(saldo, 2),
                mediaPorLaudo = media,
                laudosEstimados = media > 0 ? (int)Math.Floor(Math.Max(saldo, 0) / media) : (int?)null,
                extrato,
            });
        }).ExigirClinica();
    }
}

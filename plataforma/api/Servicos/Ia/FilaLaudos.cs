using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// Fila de pré-laudos, em segundo plano: pega os exames "Na fila" (urgentes primeiro, depois por ordem de entrada),
/// marca como "Gerando", chama a IA e deixa em "Aguardando revisão" ou "Erro".
/// Processa até IA_PARALELO exames ao mesmo tempo.
/// </summary>
public class FilaLaudos(IServiceScopeFactory escopos, ConfiguracaoIa cfg, ILogger<FilaLaudos> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken parar)
    {
        // exames que estavam "Gerando" quando o sistema parou voltam para a fila
        using (var escopo = escopos.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<VetusDb>();
            var n = await db.Exames.Where(e => e.Status == StatusExame.Gerando)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, StatusExame.NaFila), parar);
            if (n > 0) log.LogInformation("{N} exame(s) que estavam sendo gerados voltaram para a fila", n);
        }

        if (!cfg.Ativa)
        {
            log.LogWarning("IA não configurada (ANTHROPIC_API_KEY, GEMINI_API_KEY ou IA_SIMULADA): os exames ficam na fila.");
            return;
        }
        log.LogInformation("Fila de pré-laudos ativa: {Ias}, até {N} ao mesmo tempo",
            cfg.Simulada ? "IA SIMULADA" : string.Join(" > ", cfg.Ordem), cfg.Paralelo);

        var emAndamento = new List<Task>();
        while (!parar.IsCancellationRequested)
        {
            emAndamento.RemoveAll(t => t.IsCompleted);
            try
            {
                while (emAndamento.Count < cfg.Paralelo && await Pegar(parar) is { } id)
                    emAndamento.Add(Processar(id, parar));
            }
            catch (Exception e) when (!parar.IsCancellationRequested)
            {
                log.LogError(e, "Erro ao ler a fila de pré-laudos");
            }
            await Task.Delay(TimeSpan.FromSeconds(2), parar).ContinueWith(_ => { });
        }
        await Task.WhenAll(emAndamento).ContinueWith(_ => { });
    }

    /// <summary>Pega o próximo exame da fila e o marca como "Gerando" (de forma atômica no banco).</summary>
    private async Task<Guid?> Pegar(CancellationToken ct)
    {
        using var escopo = escopos.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<VetusDb>();
        var ids = await db.Database.SqlQuery<Guid>($"""
            UPDATE exames SET "Status" = 'Gerando', "AtualizadoEm" = now()
            WHERE "Id" = (SELECT "Id" FROM exames WHERE "Status" = 'NaFila'
                          ORDER BY "Urgente" DESC, "EnfileiradoEm" NULLS LAST, "RecebidoEm"
                          LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING "Id" AS "Value"
            """).ToListAsync(ct);
        return ids.Count > 0 ? ids[0] : null;
    }

    private async Task Processar(Guid id, CancellationToken ct)
    {
        try
        {
            using var escopo = escopos.CreateScope();
            await escopo.ServiceProvider.GetRequiredService<ServicoLaudo>().Gerar(id, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // o sistema está parando: ao iniciar de novo, o exame volta para a fila
        }
        catch (Exception e)
        {
            log.LogError(e, "Falha ao gerar o pré-laudo do exame {Id}", id);
            using var escopo = escopos.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<VetusDb>();
            await db.Exames.Where(x => x.Id == id).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, StatusExame.Erro)
                .SetProperty(x => x.ErroGeracao, e.Message.Length > 1000 ? e.Message[..1000] : e.Message), CancellationToken.None);
        }
    }
}

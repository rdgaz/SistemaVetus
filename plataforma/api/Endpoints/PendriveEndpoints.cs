using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Envio manual de exames exportados do ultrassom para o pendrive.
/// O aparelho grava uma pasta por animal (&lt;NOME&gt;&lt;ID animal&gt;, ex.: JADE20261105-083824-3E0C) e, dentro dela,
/// uma subpasta por exame (&lt;TIPO&gt;&lt;AAAAMMDDHHMMSS&gt;, ex.: ABD20261105083833) com as fotos (.JPG), o relatório (.PDF)
/// e, às vezes, vídeos (.MP4). A tela manda os arquivos de cada subpasta, um por vez (dá para retomar), e conclui.
/// O recebimento em si é o mesmo da API de ingestão (<see cref="RecebimentoExames"/>).
/// </summary>
public static class PendriveEndpoints
{
    public record ItemVerificar(string? IdAnimal, string? Subpasta);
    public record VerificarReq(List<ItemVerificar>? Exames);
    public record ConcluirReq(string? Nome);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames/pendrive");

        // Antes de enviar: o que já existe de cada exame (no sistema e arquivos já recebidos, para retomar)
        g.MapPost("/verificar", async (VerificarReq r, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var v = http.VinculoAtual();
            var itens = r.Exames ?? [];
            if (itens.Count > 200) return Erros.Invalido("No máximo 200 exames por vez.");
            var resposta = new List<object>();
            foreach (var it in itens)
            {
                if (RecebimentoExames.Validar(it.IdAnimal, it.Subpasta) is { } erro) { resposta.Add(new { it.IdAnimal, it.Subpasta, erro }); continue; }
                var e = await RecebimentoExames.AcharExame(db, v.ClinicaId, it.IdAnimal!, it.Subpasta!);
                var recebidos = RecebimentoExames.Recebidos(arq, v.Clinica, it.IdAnimal!, it.Subpasta!)
                    .Select(x => new { nome = x.Nome, tamanho = x.Tamanho });
                resposta.Add(new
                {
                    it.IdAnimal, it.Subpasta, recebidos,
                    exame = e is null ? null : new { e.Id, e.Status, e.Origem, paciente = e.Paciente.Nome, pendrive = e.PastaPendrive is not null },
                });
            }
            return Results.Ok(resposta);
        }).ExigirClinica();

        // Um arquivo da subpasta (corpo = o arquivo). Reenviar o mesmo nome substitui.
        g.MapPut("/{idAnimal}/{subpasta}/arquivos/{nome}", (string idAnimal, string subpasta, string nome,
            HttpContext http, Arquivos arq, ILoggerFactory logs) =>
            RecebimentoExames.GravarArquivo(http, arq, logs.CreateLogger("Pendrive"), http.VinculoAtual().Clinica, idAnimal, subpasta, nome))
            .ExigirClinica();

        // Todos os arquivos enviados: lê o PDF e cria o exame (ou atualiza o mesmo exame)
        g.MapPost("/{idAnimal}/{subpasta}/concluir", async (string idAnimal, string subpasta, ConcluirReq r, RegistroAtividades registros,
            HttpContext http, VetusDb db, Arquivos arq, ILoggerFactory logs) =>
        {
            var (ok, erro) = await RecebimentoExames.Concluir(db, arq, logs.CreateLogger("Pendrive"), http.VinculoAtual().Clinica,
                idAnimal, subpasta, r.Nome, "pendrive");
            if (ok is null) return Erros.Invalido(erro!);
            var exame = ok.Exame;
            await registros.Gravar(http, "exame_enviado_pendrive",
                $"{(ok.Novo ? "Exame enviado" : "Exame reenviado")} pelo pendrive ({ok.Fotos} foto(s), {ok.Pdfs} PDF, {ok.Videos} vídeo(s))",
                exame.Id, exame.Paciente.Nome);
            return Results.Ok(new
            {
                exame.Id, exame.Status, exame.Origem, novo = ok.Novo, exame.FotosPendrive,
                paciente = exame.Paciente.Nome, fotos = ok.Fotos, pdfs = ok.Pdfs, videos = ok.Videos,
                relatorioLido = ok.RelatorioLido, medidas = ok.Medidas,
            });
        }).ExigirClinica();
    }
}

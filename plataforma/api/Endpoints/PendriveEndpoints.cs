using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Envio manual de exames exportados do ultrassom para o pendrive.
/// O aparelho grava uma pasta por animal (&lt;NOME&gt;&lt;ID animal&gt;, ex.: JADE20261105-083824-3E0C) e, dentro dela,
/// uma subpasta por exame (&lt;TIPO&gt;&lt;AAAAMMDDHHMMSS&gt;, ex.: ABD20261105083833) com as fotos (.JPG), o relatório (.PDF)
/// e, às vezes, vídeos (.MP4). A tela manda os arquivos de cada subpasta, um por vez (dá para retomar), e conclui:
/// a plataforma lê o PDF, cria o exame, ou junta com o mesmo exame recebido pelo DICOM.
/// </summary>
public static partial class PendriveEndpoints
{
    public record ItemVerificar(string? IdAnimal, string? Subpasta);
    public record VerificarReq(List<ItemVerificar>? Exames);
    public record ConcluirReq(string? Nome);

    private const long MaxFoto = 25L * 1024 * 1024;
    private const long MaxVideo = 500L * 1024 * 1024;

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
                if (Validar(it.IdAnimal, it.Subpasta) is { } erro) { resposta.Add(new { it.IdAnimal, it.Subpasta, erro }); continue; }
                var (data, hora) = DataHora(it.Subpasta!);
                var e = await Achar(db, v.ClinicaId, it.IdAnimal!, it.Subpasta!, data, hora);
                var dir = arq.PastaPendrive(Pasta(v.Clinica, it.IdAnimal!, it.Subpasta!));
                var recebidos = Arquivos.Subpastas.SelectMany(s => Arquivos.ListarDir(dir is null ? null : Path.Combine(dir, s), s)
                        .Select(n => new { nome = n, tamanho = new FileInfo(Path.Combine(dir!, s, n)).Length }))
                    .ToList();
                resposta.Add(new
                {
                    it.IdAnimal, it.Subpasta, recebidos,
                    exame = e is null ? null : new { e.Id, e.Status, e.Origem, paciente = e.Paciente.Nome, pendrive = e.PastaPendrive is not null },
                });
            }
            return Results.Ok(resposta);
        }).ExigirClinica();

        // Um arquivo da subpasta (corpo = o arquivo). Reenviar o mesmo nome substitui.
        g.MapPut("/{idAnimal}/{subpasta}/arquivos/{nome}", async (string idAnimal, string subpasta, string nome,
            HttpContext http, Arquivos arq, ILoggerFactory logs) =>
        {
            if (Validar(idAnimal, subpasta) is { } erro) return Erros.Invalido(erro);
            if (!NomeArquivoRegex().IsMatch(nome)) return Erros.Invalido("Arquivo não aceito (só fotos .jpg/.jpeg, o relatório .pdf e vídeos .mp4).");
            var sub = Path.GetExtension(nome).TrimStart('.').ToLowerInvariant();
            if (sub == "jpeg") { sub = Arquivos.Jpg; nome = Path.ChangeExtension(nome, ".jpg"); }
            var max = sub == Arquivos.Mp4 ? MaxVideo : MaxFoto;
            if (http.Request.ContentLength is > 0 and var n && n > max)
                return Results.Json(new { erro = $"Arquivo grande demais (máximo {max / 1024 / 1024} MB)." }, statusCode: 413);
            if (http.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limite) limite.MaxRequestBodySize = max;

            var dir = arq.PastaPendrive(Pasta(http.VinculoAtual().Clinica, idAnimal, subpasta), sub);
            if (dir is null) return Erros.Invalido("Pasta inválida.");
            Directory.CreateDirectory(dir);
            var destino = Path.Combine(dir, nome);
            var parte = destino + ".parte";
            try
            {
                await using (var f = File.Create(parte)) await http.Request.Body.CopyToAsync(f, http.RequestAborted);
                if (new FileInfo(parte).Length == 0) { File.Delete(parte); return Erros.Invalido("Arquivo vazio."); }
                File.Move(parte, destino, overwrite: true);
            }
            catch (Exception x) when (x is IOException or BadHttpRequestException or OperationCanceledException)
            {
                try { File.Delete(parte); } catch { /* já foi */ }
                logs.CreateLogger("Pendrive").LogWarning("Envio de {Nome} interrompido: {Erro}", nome, x.Message);
                return x is BadHttpRequestException { StatusCode: 413 }
                    ? Results.Json(new { erro = "Arquivo grande demais." }, statusCode: 413)
                    : Erros.Invalido("O envio do arquivo foi interrompido. Tente de novo.");
            }
            return Results.Ok(new { nome, tamanho = new FileInfo(destino).Length });
        }).ExigirClinica();

        // Todos os arquivos enviados: lê o PDF e cria o exame (ou atualiza o mesmo exame)
        g.MapPost("/{idAnimal}/{subpasta}/concluir", async (string idAnimal, string subpasta, ConcluirReq r, RegistroAtividades registros,
            HttpContext http, VetusDb db, Arquivos arq, ILoggerFactory logs) =>
        {
            if (Validar(idAnimal, subpasta) is { } erro) return Erros.Invalido(erro);
            var v = http.VinculoAtual();
            var clinica = v.Clinica;
            var pasta = Pasta(clinica, idAnimal, subpasta);
            var dir = arq.PastaPendrive(pasta);
            if (dir is null) return Erros.Invalido("Pasta inválida.");
            var fotos = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Jpg), Arquivos.Jpg);
            var pdfs = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Pdf), Arquivos.Pdf);
            var videos = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Mp4), Arquivos.Mp4);
            if (fotos.Count == 0 && pdfs.Count == 0) return Erros.Invalido("Nenhuma foto nem relatório recebido desta pasta.");

            // relatório do aparelho: dados do paciente, comentários e medidas
            DadosRelatorio? rel = null;
            if (pdfs.Count > 0)
            {
                try
                {
                    await using var f = File.OpenRead(Path.Combine(dir, Arquivos.Pdf, pdfs[0]));
                    rel = RelatorioAparelho.Ler(f);
                }
                catch (Exception x) { logs.CreateLogger("Pendrive").LogWarning("PDF {Pasta} não lido: {Erro}", pasta, x.Message); }
            }
            if (!idAnimal.EndsWith("-0000", StringComparison.Ordinal) && rel is not null && rel.IdAnimal is { } idPdf && idPdf != idAnimal)
                return Erros.Invalido($"O relatório (PDF) é de outro animal ({idPdf}), não de {idAnimal}.");
            await File.WriteAllTextAsync(Path.Combine(dir, "medidas.json"), JsonSerializer.Serialize(
                (rel?.Medidas ?? []).Select(m => new { grupo = m.Grupo ?? "", nome = m.Nome, valor = m.Valor, unidade = m.Unidade ?? "", complemento = m.Complemento, origem = "pdf" })));

            var (data, hora) = DataHora(subpasta);
            var prefixo = PrefixoRegex().Match(subpasta).Groups[1].Value;
            var exame = await Achar(db, clinica.Id, idAnimal, subpasta, data, hora);
            var novo = exame is null;
            if (exame is null)
            {
                var paciente = await InternoEndpoints.AcharOuCriarPaciente(db, clinica.Id,
                    rel?.Nome ?? Texto.Opcional(r.Nome), rel?.Animal ?? rel?.Predefinicao,
                    rel?.Tutor ?? rel?.IdOutros, null, rel?.Sexo, rel?.Castrado, rel?.Nascimento);
                exame = new Exame
                {
                    ClinicaId = clinica.Id,
                    Paciente = paciente,
                    StudyInstanceUid = $"pendrive:{idAnimal}:{subpasta}",
                    Origem = "pendrive",
                    // automático entra direto na fila; se a clínica exige "Informações adicionais", só com os comentários do PDF
                    Status = clinica.GerarAutomaticamente && (!clinica.InformacoesObrigatorias || !string.IsNullOrWhiteSpace(rel?.Comentarios)) ? StatusExame.NaFila : StatusExame.AguardandoDados,
                    FotosPendrive = true,
                    TipoExame = TipoDoPendrive(prefixo, rel),
                    SolicitanteNome = rel?.MedicoIndicado,
                };
                if (exame.Status == StatusExame.NaFila) exame.EnfileiradoEm = DateTime.UtcNow;
                db.Exames.Add(exame);
            }
            else
            {
                if (exame.Origem == "dicom") exame.Origem = "dicom+pendrive";
                // fotos do pendrive (melhor qualidade) só antes do primeiro pré-laudo: depois, o laudo cita as do DICOM
                if (!exame.FotosPendrive && exame.Status != StatusExame.Gerando && !await db.Laudos.AnyAsync(l => l.ExameId == exame.Id))
                    exame.FotosPendrive = true;
                exame.Paciente.Castrado ??= rel?.Castrado;
            }

            exame.PastaPendrive = pasta;
            exame.IdAnimal ??= rel?.IdAnimal ?? idAnimal;
            // dados do aparelho: só preenchem o que está vazio (não apagam o que a clínica corrigiu)
            exame.Tipo ??= prefixo;
            exame.Data ??= data;
            exame.Hora ??= hora;
            exame.EspecieAparelho ??= rel?.Predefinicao ?? rel?.Animal;
            exame.Idade ??= rel?.Idade;
            exame.MedicoSolicitante ??= rel?.MedicoIndicado;
            exame.Operador ??= rel?.Operador;
            exame.Equipamento ??= rel?.Equipamento;
            exame.InformacoesAdicionais ??= rel?.Comentarios;
            if (exame.FotosPendrive) exame.TotalFotos = fotos.Count;
            exame.TotalPdfs = Math.Max(exame.TotalPdfs, pdfs.Count);
            exame.TotalVideos = videos.Count;
            exame.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();

            await registros.Gravar(http, "exame_enviado_pendrive",
                $"{(novo ? "Exame enviado" : "Exame reenviado")} pelo pendrive ({fotos.Count} foto(s), {pdfs.Count} PDF, {videos.Count} vídeo(s))",
                exame.Id, exame.Paciente.Nome);
            return Results.Ok(new
            {
                exame.Id, exame.Status, exame.Origem, novo, exame.FotosPendrive,
                paciente = exame.Paciente.Nome, fotos = fotos.Count, pdfs = pdfs.Count, videos = videos.Count,
                relatorioLido = rel is not null, medidas = rel?.Medidas.Count ?? 0,
            });
        }).ExigirClinica();
    }

    /// <summary>Mesmo exame: mesmo ID do animal, data e hora (DICOM ou pendrive), ou o mesmo envio de antes.</summary>
    private static async Task<Exame?> Achar(VetusDb db, Guid clinicaId, string idAnimal, string subpasta, string data, string hora)
    {
        var uid = $"pendrive:{idAnimal}:{subpasta}";
        return await db.Exames.Include(e => e.Paciente)
            .Where(e => e.ClinicaId == clinicaId && (e.StudyInstanceUid == uid
                || (e.IdAnimal == idAnimal && e.Data == data && e.Hora != null && e.Hora.StartsWith(hora))))
            .OrderBy(e => e.RecebidoEm)
            .FirstOrDefaultAsync();
    }

    /// <summary>Tipo de laudo sugerido: ABD = abdominal; REP com medidas fetais = gestacional.</summary>
    private static string? TipoDoPendrive(string prefixo, DadosRelatorio? rel)
    {
        if (TiposExame.DoAparelho(prefixo) is { } t) return t;
        if (prefixo == "REP" && rel?.Medidas.Any(m => m.Complemento is not null) == true) return "gestacional";
        return null;
    }

    private static string? Validar(string? idAnimal, string? subpasta)
    {
        if (idAnimal is null || !IdAnimalRegex().IsMatch(idAnimal)) return "ID do animal inválido (esperado como 20261105-083824-3E0C).";
        if (subpasta is null || !PrefixoRegex().IsMatch(subpasta)) return "Subpasta do exame inválida (esperada como ABD20261105083833).";
        return null;
    }

    private static (string data, string hora) DataHora(string subpasta) => (subpasta[^14..^6], subpasta[^6..]);

    private static string Pasta(Clinica c, string idAnimal, string subpasta) => $"{c.AeTitle}/{idAnimal}_{subpasta}";

    [GeneratedRegex(@"^\d{8}-\d{6}-[0-9A-Fa-f]{4}$")] private static partial Regex IdAnimalRegex();
    [GeneratedRegex(@"^([A-Z]{2,5})\d{14}$")] private static partial Regex PrefixoRegex();
    [GeneratedRegex(@"^[\w\-#. ()]{1,120}\.(jpg|jpeg|pdf|mp4)$", RegexOptions.IgnoreCase)] private static partial Regex NomeArquivoRegex();
}

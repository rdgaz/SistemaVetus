using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Endpoints;

namespace Vetus.Api.Servicos;

/// <summary>
/// Recebimento de exames em partes, igual para o envio pelo pendrive (tela, com login) e para a API de ingestão (apps e
/// receptor, com token): cada exame é identificado pelo ID do animal e pela subpasta do aparelho (TIPO + data/hora), os
/// arquivos chegam um por vez (dá para retomar e reenviar sem duplicar) e o "concluir" lê o PDF do aparelho, cria o exame ou
/// junta com o mesmo exame recebido por outro caminho (DICOM, pendrive ou outro app).
/// </summary>
public static partial class RecebimentoExames
{
    public const long MaxFoto = 25L * 1024 * 1024;
    public const long MaxVideo = 500L * 1024 * 1024;

    public record Recebido(string Nome, long Tamanho);
    public record Concluido(Exame Exame, bool Novo, int Fotos, int Pdfs, int Videos, bool RelatorioLido, int Medidas);

    /// <summary>Confere o ID do animal e a subpasta; devolve a mensagem de erro ou null.</summary>
    public static string? Validar(string? idAnimal, string? subpasta)
    {
        if (idAnimal is null || !IdAnimalRegex().IsMatch(idAnimal)) return "ID do animal inválido (esperado como 20261105-083824-3E0C).";
        if (subpasta is null || !PrefixoRegex().IsMatch(subpasta)) return "Subpasta do exame inválida (esperada como ABD20261105083833).";
        return null;
    }

    public static bool NomeAceito(string nome) => NomeArquivoRegex().IsMatch(nome);

    public static string Pasta(Clinica c, string idAnimal, string subpasta) => $"{c.AeTitle}/{idAnimal}_{subpasta}";

    /// <summary>Arquivos já recebidos deste exame (para retomar o envio).</summary>
    public static List<Recebido> Recebidos(Arquivos arq, Clinica c, string idAnimal, string subpasta)
    {
        var dir = arq.PastaPendrive(Pasta(c, idAnimal, subpasta));
        return Arquivos.Subpastas.SelectMany(s => Arquivos.ListarDir(dir is null ? null : Path.Combine(dir, s), s)
                .Select(n => new Recebido(n, new FileInfo(Path.Combine(dir!, s, n)).Length)))
            .ToList();
    }

    public static Task<Exame?> AcharExame(VetusDb db, Guid clinicaId, string idAnimal, string subpasta)
    {
        var (data, hora) = DataHora(subpasta);
        return Achar(db, clinicaId, idAnimal, subpasta, data, hora);
    }

    /// <summary>
    /// Grava um arquivo do exame (o corpo da requisição). Reenviar o mesmo nome substitui. Grava num ".parte" e só troca no
    /// fim, para nunca deixar arquivo pela metade. Se informado, confere o SHA-1 (o app manda o que calculou).
    /// </summary>
    public static async Task<IResult> GravarArquivo(HttpContext http, Arquivos arq, ILogger log, Clinica clinica,
        string idAnimal, string subpasta, string nome, string? sha1Esperado = null)
    {
        if (Validar(idAnimal, subpasta) is { } erro) return Erros.Invalido(erro);
        if (!NomeAceito(nome)) return Erros.Invalido("Arquivo não aceito (só fotos .jpg/.jpeg, o relatório .pdf e vídeos .mp4).");
        var sub = Path.GetExtension(nome).TrimStart('.').ToLowerInvariant();
        if (sub == "jpeg") { sub = Arquivos.Jpg; nome = Path.ChangeExtension(nome, ".jpg"); }
        var max = sub == Arquivos.Mp4 ? MaxVideo : MaxFoto;
        if (http.Request.ContentLength is > 0 and var n && n > max)
            return Results.Json(new { erro = $"Arquivo grande demais (máximo {max / 1024 / 1024} MB)." }, statusCode: 413);
        if (http.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limite)
            limite.MaxRequestBodySize = max;

        var dir = arq.PastaPendrive(Pasta(clinica, idAnimal, subpasta), sub);
        if (dir is null) return Erros.Invalido("Pasta inválida.");
        Directory.CreateDirectory(dir);
        var destino = Path.Combine(dir, nome);
        var parte = destino + ".parte";
        try
        {
            await using (var f = File.Create(parte)) await http.Request.Body.CopyToAsync(f, http.RequestAborted);
            if (new FileInfo(parte).Length == 0) { File.Delete(parte); return Erros.Invalido("Arquivo vazio."); }
            if (!string.IsNullOrWhiteSpace(sha1Esperado))
            {
                string sha1;
                await using (var f = File.OpenRead(parte)) sha1 = Convert.ToHexString(await System.Security.Cryptography.SHA1.HashDataAsync(f, http.RequestAborted));
                if (!string.Equals(sha1, sha1Esperado.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    File.Delete(parte);
                    return Erros.Invalido("O arquivo chegou diferente do enviado (SHA-1 não confere). Envie de novo.");
                }
            }
            File.Move(parte, destino, overwrite: true);
        }
        catch (Exception x) when (x is IOException or BadHttpRequestException or OperationCanceledException)
        {
            try { File.Delete(parte); } catch { /* já foi */ }
            log.LogWarning("Envio de {Nome} interrompido: {Erro}", nome, x.Message);
            return x is BadHttpRequestException { StatusCode: 413 }
                ? Results.Json(new { erro = "Arquivo grande demais." }, statusCode: 413)
                : Erros.Invalido("O envio do arquivo foi interrompido. Tente de novo.");
        }
        return Results.Ok(new { nome, tamanho = new FileInfo(destino).Length });
    }

    /// <summary>
    /// Todos os arquivos enviados: lê o PDF do aparelho e cria o exame, ou junta com o mesmo exame já recebido.
    /// <paramref name="origem"/> é "pendrive" ou "app" (vale para os apps e o receptor). Devolve o erro ou o resultado.
    /// </summary>
    public static async Task<(Concluido? Ok, string? Erro)> Concluir(VetusDb db, Arquivos arq, ILogger log, Clinica clinica,
        string idAnimal, string subpasta, string? nomeInformado, string origem)
    {
        if (Validar(idAnimal, subpasta) is { } erro) return (null, erro);
        var pasta = Pasta(clinica, idAnimal, subpasta);
        var dir = arq.PastaPendrive(pasta);
        if (dir is null) return (null, "Pasta inválida.");
        var fotos = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Jpg), Arquivos.Jpg);
        var pdfs = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Pdf), Arquivos.Pdf);
        var videos = Arquivos.ListarDir(Path.Combine(dir, Arquivos.Mp4), Arquivos.Mp4);
        if (fotos.Count == 0 && pdfs.Count == 0) return (null, "Nenhuma foto nem relatório recebido desta pasta.");

        // relatório do aparelho: dados do paciente, comentários e medidas
        DadosRelatorio? rel = null;
        if (pdfs.Count > 0)
        {
            try
            {
                await using var f = File.OpenRead(Path.Combine(dir, Arquivos.Pdf, pdfs[0]));
                rel = RelatorioAparelho.Ler(f);
            }
            catch (Exception x) { log.LogWarning("PDF {Pasta} não lido: {Erro}", pasta, x.Message); }
        }
        if (!idAnimal.EndsWith("-0000", StringComparison.Ordinal) && rel is not null && rel.IdAnimal is { } idPdf && idPdf != idAnimal)
            return (null, $"O relatório (PDF) é de outro animal ({idPdf}), não de {idAnimal}.");
        await File.WriteAllTextAsync(Path.Combine(dir, "medidas.json"), JsonSerializer.Serialize(
            (rel?.Medidas ?? []).Select(m => new { grupo = m.Grupo ?? "", nome = m.Nome, valor = m.Valor, unidade = m.Unidade ?? "", complemento = m.Complemento, origem = "pdf" })));

        var (data, hora) = DataHora(subpasta);
        var prefixo = PrefixoRegex().Match(subpasta).Groups[1].Value;
        var exame = await Achar(db, clinica.Id, idAnimal, subpasta, data, hora);
        var novo = exame is null;
        if (exame is null)
        {
            var paciente = await InternoEndpoints.AcharOuCriarPaciente(db, clinica.Id,
                rel?.Nome ?? Texto.Opcional(nomeInformado), rel?.Animal ?? rel?.Predefinicao,
                rel?.Tutor ?? rel?.IdOutros, null, rel?.Sexo, rel?.Castrado, rel?.Nascimento);
            exame = new Exame
            {
                ClinicaId = clinica.Id,
                Paciente = paciente,
                StudyInstanceUid = $"pendrive:{idAnimal}:{subpasta}", // mesma chave para pendrive e apps: um reenvio junta
                Origem = origem,
                // automático entra direto na fila; se a clínica exige "Informações adicionais", só com os comentários do PDF
                Status = clinica.GerarAutomaticamente && (!clinica.InformacoesObrigatorias || !string.IsNullOrWhiteSpace(rel?.Comentarios)) ? StatusExame.NaFila : StatusExame.AguardandoDados,
                FotosPendrive = true,
                TipoExame = TipoDoAparelho(prefixo, rel),
                SolicitanteNome = rel?.MedicoIndicado,
            };
            if (exame.Status == StatusExame.NaFila) exame.EnfileiradoEm = DateTime.UtcNow;
            db.Exames.Add(exame);
        }
        else
        {
            if (exame.Origem == "dicom") exame.Origem = $"dicom+{origem}";
            // fotos enviadas (melhor qualidade) só antes do primeiro pré-laudo: depois, o laudo cita as do DICOM
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
        return (new Concluido(exame, novo, fotos.Count, pdfs.Count, videos.Count, rel is not null, rel?.Medidas.Count ?? 0), null);
    }

    /// <summary>Mesmo exame: mesmo ID do animal, data e hora (DICOM, pendrive ou app), ou o mesmo envio de antes.</summary>
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
    private static string? TipoDoAparelho(string prefixo, DadosRelatorio? rel)
    {
        if (TiposExame.DoAparelho(prefixo) is { } t) return t;
        if (prefixo == "REP" && rel?.Medidas.Any(m => m.Complemento is not null) == true) return "gestacional";
        return null;
    }

    private static (string data, string hora) DataHora(string subpasta) => (subpasta[^14..^6], subpasta[^6..]);

    [GeneratedRegex(@"^\d{8}-\d{6}-[0-9A-Fa-f]{4}$")] private static partial Regex IdAnimalRegex();
    [GeneratedRegex(@"^([A-Z]{2,5})\d{14}$")] private static partial Regex PrefixoRegex();
    [GeneratedRegex(@"^[\w\-#. ()]{1,120}\.(jpg|jpeg|pdf|mp4)$", RegexOptions.IgnoreCase)] private static partial Regex NomeArquivoRegex();
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// API interna, usada só pelo receptor DICOM (rede interna do Docker).
/// Protegida pela chave VETUS_CHAVE_INTERNA, enviada no cabeçalho X-Chave-Interna.
/// </summary>
public static class InternoEndpoints
{
    public const string CabecalhoChave = "X-Chave-Interna";

    /// <summary>Exame que o receptor terminou de processar: a pasta e o conteúdo do exame.json.</summary>
    public record ExameRecebidoReq(string? AeTitle, string? Pasta, JsonElement Exame);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/interno").AddEndpointFilter(async (ctx, next) =>
        {
            var esperada = ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>()["VETUS_CHAVE_INTERNA"];
            if (string.IsNullOrEmpty(esperada))
                return Results.Json(new { erro = "VETUS_CHAVE_INTERNA não configurada." }, statusCode: 503);
            var recebida = ctx.HttpContext.Request.Headers[CabecalhoChave].ToString();
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(recebida), Encoding.UTF8.GetBytes(esperada)))
                return Erros.NaoAutorizado("Chave interna inválida.");
            return await next(ctx);
        });

        // O receptor pergunta se um AE Title pertence a uma clínica (aceitar ou recusar o ultrassom)
        g.MapGet("/clinicas/ae/{ae}", async (string ae, VetusDb db) =>
        {
            var c = await db.Clinicas.FirstOrDefaultAsync(x => x.AeTitle == ae.Trim().ToUpper());
            return c is null ? Erros.NaoEncontrado("AE Title não cadastrado.") : Results.Ok(new { c.AeTitle, c.Nome, c.Ativa });
        });

        // O receptor avisa que um exame chegou (ou chegou de novo) e foi processado
        g.MapPost("/exames", async (ExameRecebidoReq r, VetusDb db) =>
        {
            var ae = (r.AeTitle ?? "").Trim().ToUpper();
            var clinica = await db.Clinicas.FirstOrDefaultAsync(c => c.AeTitle == ae && c.Ativa);
            if (clinica is null) return Erros.NaoEncontrado("Clínica não encontrada ou bloqueada.");
            if (string.IsNullOrWhiteSpace(r.Pasta) || r.Pasta.Contains("..")) return Erros.Invalido("Pasta inválida.");

            var d = r.Exame;
            var uid = Campo(d, "studyInstanceUID");
            if (uid is null) return Erros.Invalido("Exame sem studyInstanceUID.");

            var exame = await db.Exames.FirstOrDefaultAsync(e => e.ClinicaId == clinica.Id && e.StudyInstanceUid == uid);
            var novo = exame is null;
            if (exame is null)
            {
                var paciente = await AcharOuCriarPaciente(db, clinica.Id, d);
                exame = new Exame
                {
                    ClinicaId = clinica.Id,
                    Paciente = paciente,
                    StudyInstanceUid = uid,
                    Origem = "dicom",
                    // modo da clínica: automático entra direto na fila; manual espera os dados
                    Status = clinica.GerarAutomaticamente ? StatusExame.NaFila : StatusExame.AguardandoDados,
                    RecebidoEm = DateTime.TryParse(Campo(d, "recebidoEm"), null,
                        System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                        out var rec) ? rec : DateTime.UtcNow,
                };
                // sugestões iniciais a partir do aparelho (a clínica pode corrigir na tela do exame)
                exame.TipoExame = TiposExame.DoAparelho(Campo(d, "descricao"));
                exame.SolicitanteNome = Campo(d, "medicoSolicitante");
                if (exame.Status == StatusExame.NaFila) exame.EnfileiradoEm = DateTime.UtcNow;
                db.Exames.Add(exame);
            }

            exame.Pasta = r.Pasta.Trim();
            // dados do aparelho: num reenvio, só preenchem o que está vazio (não apagam o que a clínica corrigiu)
            exame.Tipo ??= Campo(d, "descricao");
            exame.Data ??= Campo(d, "data");
            exame.Hora ??= Campo(d, "hora");
            exame.EspecieAparelho ??= Campo(d, "especie");
            exame.Idade ??= Campo(d, "idade");
            exame.Peso ??= Campo(d, "peso");
            exame.MedicoSolicitante ??= Campo(d, "medicoSolicitante");
            exame.Operador ??= Campo(d, "operador");
            exame.Equipamento ??= Texto.Opcional(string.Join(' ', new[] { Campo(d, "fabricante"), Campo(d, "modelo") }.Where(x => x is not null)));
            if (d.TryGetProperty("totais", out var t) && t.ValueKind == JsonValueKind.Object)
            {
                exame.TotalFotos = t.TryGetProperty("fotos", out var f) && f.TryGetInt32(out var nf) ? nf : exame.TotalFotos;
                exame.TotalPdfs = t.TryGetProperty("pdfs", out var p) && p.TryGetInt32(out var np) ? np : exame.TotalPdfs;
            }
            exame.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { exame.Id, exame.Status, novo });
        });
    }

    /// <summary>Paciente da clínica com o mesmo nome, espécie e tutor; se não houver, cria (e o tutor também).</summary>
    private static async Task<Paciente> AcharOuCriarPaciente(VetusDb db, Guid clinicaId, JsonElement d)
    {
        Tutor? tutor = null;
        var nomeTutor = Campo(d, "responsavel");
        if (nomeTutor is not null)
        {
            var chave = nomeTutor.ToLower();
            tutor = await db.Tutores.FirstOrDefaultAsync(t => t.ClinicaId == clinicaId && t.Nome.ToLower() == chave)
                    ?? db.Tutores.Add(new Tutor { ClinicaId = clinicaId, Nome = nomeTutor }).Entity;
        }

        var nome = Campo(d, "paciente") ?? "Sem nome";
        var especie = NormalizarEspecie(Campo(d, "especie"));
        var chaveNome = nome.ToLower();
        var tutorId = tutor?.Id;
        var existente = await db.Pacientes.FirstOrDefaultAsync(p => p.ClinicaId == clinicaId
            && p.Nome.ToLower() == chaveNome && p.Especie == especie && p.TutorId == tutorId);
        if (existente is not null) return existente;

        var sexo = Campo(d, "sexo")?.ToUpper();
        return db.Pacientes.Add(new Paciente
        {
            ClinicaId = clinicaId,
            Tutor = tutor,
            Nome = nome,
            Especie = especie,
            Raca = Campo(d, "raca"),
            Sexo = sexo is "M" or "F" or "O" ? sexo : null,
            Nascimento = Campo(d, "nascimento"),
        }).Entity;
    }

    /// <summary>"Caninos (5-15kg)" -> "Canina"; "Felinos" -> "Felina"; outros textos ficam como vieram.</summary>
    public static string? NormalizarEspecie(string? s)
    {
        if (s is null) return null;
        var x = s.ToLowerInvariant();
        if (x.Contains("canin") || x.Contains("cão") || x.Contains("cao") || x.Contains("canine") || x.Contains("dog")) return "Canina";
        if (x.Contains("felin") || x.Contains("gato") || x.Contains("cat")) return "Felina";
        return s;
    }

    /// <summary>Texto de um campo do exame.json; vazio vira null.</summary>
    private static string? Campo(JsonElement d, string nome) =>
        d.ValueKind == JsonValueKind.Object && d.TryGetProperty(nome, out var v) && v.ValueKind == JsonValueKind.String
            ? Texto.Opcional(v.GetString())
            : null;
}

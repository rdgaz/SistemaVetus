using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>Personalização do PDF do laudo pela clínica: cores, fonte, campos, ordem das seções e textos.</summary>
public static class LayoutEndpoints
{
    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/clinica/layout");

        // layout atual (ou o padrão) e o catálogo de campos e seções
        g.MapGet("", (HttpContext http) =>
        {
            var c = http.VinculoAtual().Clinica;
            return Results.Ok(new
            {
                layout = LayoutLaudo.Ler(c.LayoutLaudo),
                padrao = new LayoutLaudo(),
                personalizado = !string.IsNullOrWhiteSpace(c.LayoutLaudo),
                campos = LayoutLaudo.NomesCampos,
                secoes = LayoutLaudo.NomesSecoes,
            });
        }).ExigirClinica();

        g.MapPut("", async (LayoutLaudo r, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var c = http.VinculoAtual().Clinica;
            c.LayoutLaudo = r.Serializar();
            await db.SaveChangesAsync();
            await registros.Gravar(http, "layout_alterado", "Aparência do laudo alterada");
            return Results.Ok(new { layout = LayoutLaudo.Ler(c.LayoutLaudo) });
        }).ExigirClinica(Perfil.AdministradorClinica);

        // volta ao padrão
        g.MapDelete("", async (HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            http.VinculoAtual().Clinica.LayoutLaudo = null;
            await db.SaveChangesAsync();
            await registros.Gravar(http, "layout_alterado", "Aparência do laudo voltou ao padrão");
            return Results.NoContent();
        }).ExigirClinica(Perfil.AdministradorClinica);

        // prévia: PDF de exemplo com o layout enviado (ainda não salvo)
        g.MapPost("/previa", async (LayoutLaudo r, HttpContext http, VetusDb db, PdfLaudo pdf) =>
        {
            var v = http.VinculoAtual();
            var u = await Acesso.UsuarioAtual(http, db);
            var conteudo = JsonSerializer.Serialize(new
            {
                condicoesTecnicas = "Exame realizado com o paciente em jejum, boa janela acústica e boa repleção vesical.",
                orgaos = new[]
                {
                    new { orgao = "Fígado", situacao = "normal", descricao = "Dimensões preservadas, contornos regulares, ecotextura homogênea e ecogenicidade habitual." },
                    new { orgao = "Vesícula Biliar", situacao = "normal", descricao = "Repleta, com paredes finas e conteúdo anecoico." },
                    new { orgao = "Baço", situacao = "alterado", descricao = "Discretamente aumentado, com ecotextura homogênea." },
                    new { orgao = "Rins", situacao = "normal", descricao = "simétricos, contornos regulares, definição córtico-medular preservada bilateralmente e ecogenicidade cortical mantida." },
                },
                impressaoDiagnostica = "Esplenomegalia discreta. Demais estruturas sem alterações ultrassonográficas significativas.",
                diferenciais = new[] { "Hiperplasia linfoide", "Congestão esplênica" },
                recomendacoes = new[] { "Correlação com histórico clínico e exames laboratoriais.", "Reavaliação ultrassonográfica em 30 dias." },
            });
            var e = new Exame
            {
                ClinicaId = v.ClinicaId, Clinica = v.Clinica, TipoExame = "abdominal", Data = DateTime.Now.ToString("yyyyMMdd"),
                Idade = "5 anos", Peso = "12 kg", SolicitanteNome = "Dr. Exemplo", SolicitanteCrmv = "CRMV-XX 0000",
                SuspeitaClinica = "Apatia e vômitos", Equipamento = "Mindray Vetus E7", IdAnimal = "20260101-100000-3E0C",
                Paciente = new Paciente { Nome = "Thor", Especie = "Canina", Raca = "SRD", Sexo = "M", Castrado = true, Tutor = new Tutor { Nome = "Maria Exemplo" } },
            };
            var l = new Laudo
            {
                Versao = 1, ConteudoIa = conteudo, AssinadoPorId = u?.Id, AssinadoPorNome = u?.Nome ?? "Veterinário(a) Exemplo",
                AssinadoCrmv = u?.Crmv is { } crmv ? $"CRMV-{u.CrmvUf} {crmv}" : "CRMV-XX 00000", AssinadoEm = DateTime.UtcNow,
                CodigoVerificacao = "EXEMPLO-0000",
            };
            http.Response.Headers.ContentDisposition = "inline; filename=\"previa-layout.pdf\"";
            return Results.File(await pdf.Gerar(e, l, r), "application/pdf");
        }).ExigirClinica(Perfil.AdministradorClinica);
    }
}

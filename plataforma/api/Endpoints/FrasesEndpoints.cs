using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>Frases prontas (banco do "Laudo Fácil") para escolher na revisão do laudo, por órgão.</summary>
public static class FrasesEndpoints
{
    public static void Mapear(WebApplication app)
    {
        app.MapGet("/api/frases", (string? orgao, BancoFrases banco) =>
        {
            var nome = BancoFrases.BlocoDoOrgao(orgao);
            var bloco = banco.Bloco(nome);
            return Results.Ok(new
            {
                bloco = nome,
                // o nome do órgão já vem impresso antes do texto: tira a repetição do início de cada frase
                entradas = bloco?.Entradas.Where(e => e.Descricao.Length > 0 || e.Impressoes.Count > 0).Select(e => new
                {
                    e.Titulo,
                    Descricao = string.Join('\n', e.Descricao.Split('\n').Select(l => ModeloLaudo.LimparPrefixoOrgao(orgao, l))),
                    e.Impressoes,
                }) ?? [],
            });
        }).ExigirClinica();

        // o que a IA está levando em conta, para o veterinário ver (correções feitas por esta clínica)
        app.MapGet("/api/clinica/aprendizados", async (HttpContext http, Aprendizados aprendizados, CancellationToken ct) =>
        {
            var texto = await aprendizados.TextoParaIa(http.VinculoAtual().ClinicaId, ct);
            return Results.Ok(new { texto, vazio = texto.Length == 0 });
        }).ExigirClinica();
    }
}

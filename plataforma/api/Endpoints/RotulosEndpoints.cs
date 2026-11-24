using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Rótulos de imagem: na revisão, o veterinário confirma ou corrige "o que esta imagem mostra". Cada rótulo guarda o que a
/// IA tinha associado à foto e a resposta do veterinário, e forma a base de treino de um futuro agente de imagens.
/// </summary>
public static class RotulosEndpoints
{
    public record RotuloReq(string? Foto, string? OrgaoIa, string? OrgaoCorreto);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames/{id:guid}/rotulos");

        // rótulos já dados neste exame e as opções de resposta
        g.MapGet("", async (Guid id, HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            if (!await db.Exames.AnyAsync(x => x.Id == id && x.ClinicaId == clinicaId)) return Erros.NaoEncontrado("Exame não encontrado.");
            return Results.Ok(new
            {
                opcoes = ModeloLaudo.OpcoesRotuloImagem(),
                rotulos = await db.RotulosImagem.Where(r => r.ExameId == id)
                    .Select(r => new { r.Foto, r.OrgaoIa, r.OrgaoCorreto, r.Tipo }).ToListAsync(),
            });
        }).ExigirClinica();

        // confirma ou corrige o que a imagem mostra (um rótulo por foto; o último vale)
        g.MapPut("", async (Guid id, RotuloReq r, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var v = http.VinculoAtual();
            var e = await db.Exames.FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (string.IsNullOrWhiteSpace(r.Foto) || arq.Arquivo(e, Arquivos.Jpg, r.Foto) is not { } caminho)
                return Erros.Invalido("Foto não encontrada neste exame.");
            // confirmar usa o próprio nome do órgão do laudo (ex.: "Bexiga urinária"); corrigir usa as opções
            if (r.OrgaoCorreto is null || !(ModeloLaudo.OpcoesRotuloImagem().Contains(r.OrgaoCorreto) || string.Equals(r.OrgaoCorreto, r.OrgaoIa, StringComparison.OrdinalIgnoreCase)))
                return Erros.Invalido("Escolha o que a imagem mostra.");
            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();

            var versao = await db.Laudos.Where(l => l.ExameId == id).MaxAsync(l => (int?)l.Versao) ?? 0;
            var orgaoIa = Texto.Opcional(r.OrgaoIa);
            // confirmação: o veterinário escolheu o mesmo órgão que a IA indicou ("Rim esquerdo" só confirma "Rim esquerdo")
            var tipo = orgaoIa is not null && string.Equals(orgaoIa, r.OrgaoCorreto, StringComparison.OrdinalIgnoreCase) ? "confirmacao" : "correcao";
            var hash = Convert.ToHexString(SHA1.HashData(await File.ReadAllBytesAsync(caminho)));

            var rotulo = await db.RotulosImagem.FirstOrDefaultAsync(x => x.ExameId == id && x.Foto == r.Foto);
            if (rotulo is null) db.RotulosImagem.Add(rotulo = new RotuloImagem { ClinicaId = e.ClinicaId, ExameId = id, Foto = r.Foto });
            rotulo.LaudoVersao = versao;
            rotulo.HashFoto = hash;
            rotulo.OrgaoIa = orgaoIa;
            rotulo.OrgaoCorreto = r.OrgaoCorreto;
            rotulo.Tipo = tipo;
            rotulo.UsuarioId = u.Id;
            rotulo.UsuarioNome = u.Nome;
            rotulo.CriadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { rotulo.Foto, rotulo.OrgaoIa, rotulo.OrgaoCorreto, rotulo.Tipo });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        // administrador do sistema: o conjunto de treino formado até agora
        app.MapGroup("/api/admin").ExigirAdministradorSistema().MapGet("/rotulos-imagens", async (VetusDb db) =>
        {
            var todos = await db.RotulosImagem.OrderByDescending(r => r.CriadoEm).Take(5000).ToListAsync();
            return Results.Ok(new
            {
                total = todos.Count,
                confirmacoes = todos.Count(r => r.Tipo == "confirmacao"),
                correcoes = todos.Count(r => r.Tipo == "correcao"),
                porOrgao = todos.GroupBy(r => r.OrgaoCorreto).Select(x => new { orgao = x.Key, total = x.Count() }).OrderByDescending(x => x.total),
                rotulos = todos,
            });
        });
    }
}

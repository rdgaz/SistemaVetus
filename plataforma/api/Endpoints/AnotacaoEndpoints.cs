using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Anotações manuais sobre as fotos do exame (texto e medida no estilo do aparelho de ultrassom).
/// Ficam em camada separada sem alterar o JPG original; entram na tela, no PDF, nas referências e na IA.
/// </summary>
public static class AnotacaoEndpoints
{
    public record SalvarAnotacaoReq(List<ItemAnotacao>? Itens);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames/{id:guid}/anotacoes");

        g.MapGet("", async (Guid id, HttpContext http, VetusDb db) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            if (!await db.Exames.AnyAsync(x => x.Id == id && x.ClinicaId == clinicaId))
                return Erros.NaoEncontrado("Exame não encontrado.");
            var lista = await db.AnotacoesImagem.Where(a => a.ExameId == id).ToListAsync();
            return Results.Ok(lista.Select(a => new
            {
                a.Foto,
                itens = DesenhoAnotacao.Ler(a.Itens),
                a.UsuarioNome,
                a.AtualizadoEm,
            }));
        }).ExigirClinica();

        g.MapPut("/{foto}", async (Guid id, string foto, SalvarAnotacaoReq r, HttpContext http, VetusDb db,
            Arquivos arq, RegistroAtividades registros) =>
        {
            var v = http.VinculoAtual();
            var e = await db.Exames.Include(x => x.Paciente).FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status == StatusExame.Pronto) return Erros.Conflito("Laudo já assinado: use a retificação para alterar anotações.");
            if (string.IsNullOrWhiteSpace(foto) || arq.Arquivo(e, Arquivos.Jpg, foto) is not { } caminho)
                return Erros.Invalido("Foto não encontrada neste exame.");

            var (itens, erro) = DesenhoAnotacao.Validar(r.Itens);
            if (erro is not null) return Erros.Invalido(erro);

            var u = await Acesso.UsuarioAtual(http, db);
            if (u is null) return Results.Unauthorized();

            var existente = await db.AnotacoesImagem.FirstOrDefaultAsync(a => a.ExameId == id && a.Foto == foto);
            if (itens.Count == 0)
            {
                if (existente is not null)
                {
                    db.AnotacoesImagem.Remove(existente);
                    await registros.Adicionar(http, "imagem_anotada", $"Anotações removidas da imagem {foto}", id, e.Paciente.Nome);
                    await db.SaveChangesAsync();
                }
                return Results.Ok(new { foto, itens = Array.Empty<ItemAnotacao>() });
            }

            var hash = Convert.ToHexString(SHA1.HashData(await File.ReadAllBytesAsync(caminho)));
            if (existente is null)
                db.AnotacoesImagem.Add(existente = new AnotacaoImagem { ClinicaId = e.ClinicaId, ExameId = id, Foto = foto });

            existente.HashFoto = hash;
            existente.Itens = DesenhoAnotacao.Serializar(itens);
            existente.UsuarioId = u.Id;
            existente.UsuarioNome = u.Nome;
            existente.AtualizadoEm = DateTime.UtcNow;

            // se a anotação identifica o órgão e a foto ainda não tem rótulo manual, já grava o rótulo de treino automaticamente
            if (DesenhoAnotacao.InferirOrgaoRotulo(itens) is { } orgaoInferido &&
                !await db.RotulosImagem.AnyAsync(x => x.ExameId == id && x.Foto == foto))
            {
                var versao = await db.Laudos.Where(l => l.ExameId == id).MaxAsync(l => (int?)l.Versao) ?? 0;
                db.RotulosImagem.Add(new RotuloImagem
                {
                    ClinicaId = e.ClinicaId, ExameId = id, LaudoVersao = versao, Foto = foto, HashFoto = hash,
                    OrgaoIa = null, OrgaoCorreto = orgaoInferido, Tipo = "confirmacao",
                    UsuarioId = u.Id, UsuarioNome = u.Nome,
                });
            }

            var qtdTextos = itens.Count(x => x.Tipo == "texto");
            var qtdMedidas = itens.Count(x => x.Tipo == "medida");
            await registros.Adicionar(http, "imagem_anotada",
                $"Imagem {foto} anotada ({qtdTextos} texto(s), {qtdMedidas} medida(s))", id, e.Paciente.Nome);
            await db.SaveChangesAsync();

            return Results.Ok(new { foto, itens, existente.UsuarioNome, existente.AtualizadoEm });
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);

        g.MapDelete("/{foto}", async (Guid id, string foto, HttpContext http, VetusDb db, RegistroAtividades registros) =>
        {
            var v = http.VinculoAtual();
            var e = await db.Exames.Include(x => x.Paciente).FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status == StatusExame.Pronto) return Erros.Conflito("Laudo já assinado: use a retificação.");

            var apagados = await db.AnotacoesImagem.Where(a => a.ExameId == id && a.Foto == foto).ExecuteDeleteAsync();
            if (apagados > 0) await registros.Gravar(http, "imagem_anotada", $"Anotações removidas da imagem {foto}", id, e.Paciente.Nome);
            return Results.NoContent();
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);
    }
}

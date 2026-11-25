using System.Text.Json;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>
/// Grava o registro de atividades: quem fez o quê e quando. Pega o usuário e a clínica da própria requisição.
/// <see cref="Adicionar"/> só acrescenta ao contexto (quem chama salva, ex.: dentro de uma transação);
/// <see cref="Gravar"/> já salva.
/// </summary>
public class RegistroAtividades(VetusDb db)
{
    /// <summary>Tipos de evento e o nome que aparece na tela.</summary>
    public static readonly IReadOnlyDictionary<string, string> Tipos = new Dictionary<string, string>
    {
        ["exame_excluido"] = "Exame excluído",
        ["exame_enviado_pendrive"] = "Exame enviado pelo pendrive",
        ["analise_solicitada"] = "Análise pedida à IA",
        ["laudo_assinado"] = "Laudo assinado",
        ["laudo_retificado"] = "Laudo retificado",
        ["alerta_discordado"] = "Discordância de alerta",
        ["usuario_criado"] = "Usuário adicionado",
        ["usuario_alterado"] = "Usuário alterado",
        ["clinica_alterada"] = "Dados da clínica alterados",
        ["layout_alterado"] = "Aparência do laudo alterada",
        ["creditos_lancados"] = "Créditos lançados",
    };

    public async Task<RegistroAtividade> Adicionar(HttpContext http, string tipo, string descricao, Guid? exameId = null,
        string? paciente = null, object? detalhes = null, Guid? clinicaId = null, string? clinicaNome = null)
    {
        var u = await Acesso.UsuarioAtual(http, db);
        var v = http.VinculoSeHouver();
        var r = new RegistroAtividade
        {
            Tipo = tipo,
            Descricao = descricao.Length > 500 ? descricao[..500] : descricao,
            ClinicaId = clinicaId ?? v?.ClinicaId,
            ClinicaNome = clinicaNome ?? v?.Clinica?.Nome,
            ExameId = exameId,
            Paciente = paciente,
            Detalhes = detalhes is null ? null : JsonSerializer.Serialize(detalhes),
            UsuarioId = u?.Id,
            UsuarioNome = u?.Nome ?? "?",
            UsuarioEmail = u?.Email ?? "",
            Perfil = v?.Perfil.ToString() ?? (u?.AdministradorSistema == true ? "Sistema" : null),
        };
        db.RegistrosAtividade.Add(r);
        return r;
    }

    public async Task Gravar(HttpContext http, string tipo, string descricao, Guid? exameId = null, string? paciente = null,
        object? detalhes = null, Guid? clinicaId = null, string? clinicaNome = null)
    {
        await Adicionar(http, tipo, descricao, exameId, paciente, detalhes, clinicaId, clinicaNome);
        await db.SaveChangesAsync();
    }
}

using System.Text;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// O que a IA já aprendeu com as correções dos veterinários, em texto para o prompt de cada pré-laudo:
/// - Global (todas as clínicas usam): órgãos que a IA confundiu nas imagens e discordâncias de alertas urgentes.
/// - Por clínica: exemplos de como o médico daquela clínica escreve (ditados aceitos).
/// </summary>
public class Aprendizados(VetusDb db)
{
    private static string Curto(string? s, int max)
    {
        var t = (s ?? "").Replace('\n', ' ').Trim();
        return t.Length <= max ? t : t[..max] + "…";
    }

    private static string MotivoLegivel(string m) => m switch
    {
        "falso_alarme" => "não havia esse achado",
        "achado_diferente" => "havia um achado, mas era outro",
        "imagens_insuficientes" => "as imagens não permitiam concluir isso",
        _ => m,
    };

    /// <summary>Texto dos aprendizados (vazio se ainda não há nenhum).</summary>
    public async Task<string> TextoParaIa(Guid clinicaId, CancellationToken ct = default)
    {
        // clínicas reais só usam aprendizados de clínicas reais; clínicas de teste usam os reais + os próprios
        // (assim dá para testar correções sem contaminar o banco global das clínicas reais)
        var ehTeste = await db.Clinicas.Where(c => c.Id == clinicaId).Select(c => c.Teste).FirstOrDefaultAsync(ct);
        var clinicasPermitidas = db.Clinicas.Where(c => !c.Teste || (ehTeste && c.Id == clinicaId)).Select(c => c.Id);

        var discordancias = await db.DiscordanciasAlerta
            .Where(d => clinicasPermitidas.Contains(d.ClinicaId))
            .OrderByDescending(d => d.ClinicaId == clinicaId).ThenByDescending(d => d.CriadaEm).Take(8).ToListAsync(ct);
        var confusoes = (await db.RotulosImagem
                .Where(r => r.Tipo == "correcao" && r.OrgaoIa != null && clinicasPermitidas.Contains(r.ClinicaId))
                .Select(r => new { r.OrgaoIa, r.OrgaoCorreto }).ToListAsync(ct))
            .GroupBy(r => (r.OrgaoIa, r.OrgaoCorreto)).Select(g => new { g.Key.OrgaoIa, g.Key.OrgaoCorreto, N = g.Count() })
            .OrderByDescending(x => x.N).Take(8).ToList();
        // estilo de escrita continua específico da clínica
        var ditados = await db.DitadosOrgao.Where(d => d.ClinicaId == clinicaId && d.Aceito && d.TextoFinal != null)
            .OrderByDescending(d => d.CriadoEm).Take(3).ToListAsync(ct);

        if (discordancias.Count == 0 && confusoes.Count == 0 && ditados.Count == 0) return "";
        var t = new StringBuilder();
        if (discordancias.Count > 0)
        {
            t.AppendLine("Alertas de achado urgente que o veterinário DESCARTOU (seja mais conservador em casos parecidos):");
            foreach (var d in discordancias)
                t.AppendLine($"- A IA alertou: \"{Curto(d.AlertaMotivo, 200)}\"" +
                    (string.IsNullOrEmpty(d.AlertaConfianca) ? "" : $" (confiança {d.AlertaConfianca})") +
                    $". O veterinário discordou: {MotivoLegivel(d.Motivo)}." +
                    (string.IsNullOrWhiteSpace(d.Comentario) ? "" : $" Leitura correta: {Curto(d.Comentario, 300)}"));
        }
        if (confusoes.Count > 0)
        {
            t.AppendLine("Órgãos que a IA confundiu nas imagens (segundo o veterinário):");
            foreach (var c in confusoes) t.AppendLine($"- Imagens que a IA associou a \"{c.OrgaoIa}\" eram \"{c.OrgaoCorreto}\" ({c.N}x).");
        }
        if (ditados.Count > 0)
        {
            t.AppendLine("Exemplos de como o médico desta clínica escreve (relato falado -> texto final):");
            foreach (var d in ditados) t.AppendLine($"- {d.Orgao}: \"{Curto(d.TextoBruto, 200)}\" -> \"{Curto(d.TextoFinal, 300)}\"");
        }
        return t.ToString().TrimEnd();
    }
}

using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>
/// Avisos para o usuário: o sino no topo da tela e, quando pedido, um e-mail pelo SMTP do sistema
/// (VETUS_SMTP_*; sem essas variáveis, só o aviso no sistema).
/// </summary>
public class Notificacoes(VetusDb db, EnvioEmail email, IConfiguration cfg, ILogger<Notificacoes> log)
{
    /// <summary>Acrescenta o aviso ao contexto (quem chama salva).</summary>
    public void Adicionar(Guid usuarioId, string tipo, string titulo, string? texto, string? link) =>
        db.Notificacoes.Add(new Notificacao
        {
            UsuarioId = usuarioId, Tipo = tipo, Titulo = Curto(titulo, 200), Texto = texto is null ? null : Curto(texto, 1000), Link = link,
        });

    /// <summary>E-mail pelo SMTP do sistema, em segundo plano: uma falha de e-mail nunca impede a ação.</summary>
    public void EnviarEmail(string para, string assunto, string texto, string? link)
    {
        var smtp = ConfigSistema();
        if (smtp is null || string.IsNullOrWhiteSpace(para)) return;
        var corpo = link is null ? texto : $"{texto}\n\nAbrir no AutoLaudoVet: {UrlPublica()}{link}";
        _ = Task.Run(async () =>
        {
            try { await email.Enviar(smtp, [para], assunto, corpo, null, CancellationToken.None); }
            catch (Exception e) { log.LogWarning(e, "Falha ao enviar e-mail de notificação para {Para}", para); }
        });
    }

    private ConfigSmtp? ConfigSistema()
    {
        var host = cfg["VETUS_SMTP_HOST"];
        var remetente = cfg["VETUS_SMTP_REMETENTE"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(remetente)) return null;
        return new ConfigSmtp(host, cfg.GetValue("VETUS_SMTP_PORTA", 587), cfg["VETUS_SMTP_SEGURANCA"] ?? "starttls",
            cfg["VETUS_SMTP_USUARIO"], cfg["VETUS_SMTP_SENHA"], "AutoLaudoVet", remetente);
    }

    private string UrlPublica() => (cfg["VETUS_URL_PUBLICA"] ?? "http://localhost:5080").TrimEnd('/');
    private static string Curto(string s, int max) => s.Length > max ? s[..max] : s;
}

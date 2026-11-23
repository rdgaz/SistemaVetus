using System.Net;
using System.Net.Sockets;
using MailKit;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.AspNetCore.DataProtection;
using MimeKit;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

public record ConfigSmtp(string Host, int Porta, string Seguranca, string? Usuario, string? Senha, string RemetenteNome, string RemetenteEmail);

/// <summary>Erro de envio com mensagem para mostrar ao usuário.</summary>
public class ErroEnvio(string mensagem) : Exception(mensagem);

/// <summary>
/// Envio de e-mail pelo SMTP do próprio usuário (o laudo sai da conta dele).
/// A senha do SMTP é guardada criptografada (ASP.NET Data Protection).
/// </summary>
public class EnvioEmail(IDataProtectionProvider dp, IConfiguration cfg)
{
    private readonly IDataProtector _protetor = dp.CreateProtector("vetus.smtp-senha");
    /// <summary>Só nos testes: permite SMTP na rede interna (ex.: o servidor de e-mail de teste).</summary>
    private readonly bool _permitirRedeInterna = cfg.GetValue("VETUS_SMTP_PERMITIR_REDE_INTERNA", false);

    public string Proteger(string senha) => _protetor.Protect(senha);

    private string? Desproteger(string? protegida)
    {
        if (protegida is null) return null;
        try { return _protetor.Unprotect(protegida); }
        catch { return null; } // chaves trocadas: a senha precisa ser informada de novo
    }

    /// <summary>Configuração SMTP do usuário, ou null se estiver incompleta.</summary>
    public ConfigSmtp? Config(Usuario u) =>
        string.IsNullOrWhiteSpace(u.SmtpHost) || u.SmtpPorta is null || string.IsNullOrWhiteSpace(u.SmtpRemetenteEmail)
            ? null
            : new ConfigSmtp(u.SmtpHost, u.SmtpPorta.Value, u.SmtpSeguranca ?? "starttls", u.SmtpUsuario,
                Desproteger(u.SmtpSenhaProtegida), u.SmtpRemetenteNome ?? u.Nome, u.SmtpRemetenteEmail);

    public async Task Enviar(ConfigSmtp c, IReadOnlyList<string> para, string assunto, string texto,
        (string Nome, byte[] Bytes)? anexo, CancellationToken ct)
    {
        await ConferirDestinoPermitido(c.Host, ct);

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(c.RemetenteNome, c.RemetenteEmail));
        foreach (var p in para) msg.To.Add(MailboxAddress.Parse(p));
        msg.Subject = assunto;
        var corpo = new BodyBuilder { TextBody = texto };
        if (anexo is { } a) corpo.Attachments.Add(a.Nome, a.Bytes, ContentType.Parse("application/pdf"));
        msg.Body = corpo.ToMessageBody();

        using var smtp = new SmtpClient { Timeout = 30_000 };
        var seguranca = c.Seguranca switch
        {
            "ssl" => SecureSocketOptions.SslOnConnect,
            "nenhuma" => SecureSocketOptions.None,
            _ => SecureSocketOptions.StartTls,
        };
        try
        {
            await smtp.ConnectAsync(c.Host, c.Porta, seguranca, ct);
            if (!string.IsNullOrEmpty(c.Usuario))
            {
                if (string.IsNullOrEmpty(c.Senha)) throw new ErroEnvio("Informe a senha do SMTP em \"Minha conta\".");
                await smtp.AuthenticateAsync(c.Usuario, c.Senha, ct);
            }
            await smtp.SendAsync(msg, ct);
            await smtp.DisconnectAsync(true, ct);
        }
        catch (AuthenticationException)
        {
            throw new ErroEnvio("O servidor de e-mail recusou o usuário ou a senha. No Gmail e no Outlook, use uma \"senha de app\", não a senha normal.");
        }
        catch (SslHandshakeException)
        {
            throw new ErroEnvio("Falha na conexão segura: confira a porta e a segurança (465 = SSL, 587 = STARTTLS).");
        }
        catch (SocketException)
        {
            throw new ErroEnvio($"Não foi possível conectar em {c.Host}:{c.Porta}. Confira o servidor e a porta.");
        }
        catch (SmtpCommandException x)
        {
            throw new ErroEnvio($"O servidor de e-mail recusou o envio: {x.Message}");
        }
        catch (ProtocolException x)
        {
            throw new ErroEnvio($"Erro de comunicação com o servidor de e-mail: {x.Message}");
        }
    }

    /// <summary>Recusa servidores SMTP na rede interna/local (evita usar o campo para acessar a infraestrutura).</summary>
    private async Task ConferirDestinoPermitido(string host, CancellationToken ct)
    {
        if (_permitirRedeInterna) return;
        IPAddress[] ips;
        try { ips = await Dns.GetHostAddressesAsync(host, ct); }
        catch (SocketException) { throw new ErroEnvio($"Servidor de e-mail \"{host}\" não encontrado."); }
        if (ips.Length == 0 || ips.Any(Interno))
            throw new ErroEnvio("Este servidor de e-mail não é permitido (endereço de rede interna).");
    }

    private static bool Interno(IPAddress ip)
    {
        if (IPAddress.IsLoopback(ip) || ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6UniqueLocal) return true;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (ip.AddressFamily != AddressFamily.InterNetwork) return false;
        var b = ip.GetAddressBytes();
        return b[0] == 10 || b[0] == 127 || b[0] == 0
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254)
            || (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
    }
}

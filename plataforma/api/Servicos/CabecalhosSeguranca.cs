namespace Vetus.Api.Servicos;

/// <summary>
/// Cabeçalhos de segurança em todas as respostas: impedem que o sistema seja aberto dentro de outro site (clickjacking),
/// que o navegador "adivinhe" o tipo de arquivo e que páginas de fora carreguem scripts. A política de conteúdo (CSP)
/// vai só nas páginas HTML, para não atrapalhar o visualizador de PDF do navegador.
/// </summary>
public static class CabecalhosSeguranca
{
    // style 'unsafe-inline': as telas usam style={{...}} do React; scripts continuam só do próprio sistema
    private const string Politica =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
        "connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'self'; " +
        "base-uri 'self'; form-action 'self'";

    public static IApplicationBuilder UseCabecalhosSeguranca(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        http.Response.OnStarting(() =>
        {
            var h = http.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "SAMEORIGIN";
            h["Referrer-Policy"] = "strict-origin-when-cross-origin";
            // microfone: ditado por voz na revisão; o resto, desligado
            h["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=(), payment=(), usb=()";
            h["Cross-Origin-Opener-Policy"] = "same-origin";
            if (http.Request.IsHttps) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            if (http.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true)
                h["Content-Security-Policy"] = Politica;
            return Task.CompletedTask;
        });
        await next();
    });
}

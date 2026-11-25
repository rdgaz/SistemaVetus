using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Endpoints;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

// "dotnet Vetus.Api.dll --saude": usado pelo healthcheck do Docker (a imagem não tem curl)
if (args.Contains("--saude"))
{
    var porta = (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "8080").Split(';')[0];
    try
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        return (await http.GetAsync($"http://localhost:{porta}/saude")).IsSuccessStatusCode ? 0 : 1;
    }
    catch { return 1; }
}

// "dotnet Vetus.Api.dll --ler-pdf <arquivo.pdf|pasta> [--texto]": mostra o que o sistema lê do PDF do aparelho
// (manutenção: conferir a leitura em PDFs reais exportados para o pendrive)
if (args.Length >= 2 && args[0] == "--ler-pdf")
{
    var arquivos = Directory.Exists(args[1])
        ? Directory.EnumerateFiles(args[1], "*.pdf", new EnumerationOptions { RecurseSubdirectories = true, MatchCasing = MatchCasing.CaseInsensitive })
        : [args[1]];
    var json = new System.Text.Json.JsonSerializerOptions
    {
        WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    foreach (var a in arquivos)
    {
        Console.WriteLine($"== {a}");
        try
        {
            using var f = File.OpenRead(a);
            var d = RelatorioAparelho.Ler(f);
            if (args.Contains("--texto")) Console.WriteLine(d.Texto);
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(d with { Texto = "" }, json));
        }
        catch (Exception e) { Console.WriteLine($"ERRO: {e.Message}"); }
    }
    return 0;
}

// "dotnet Vetus.Api.dll --detectar-anotacoes <pasta|arquivo.jpg>": mostra quais fotos têm anotação do operador escrita na imagem
// (manutenção: conferir a detecção em fotos reais)
if (args.Length >= 2 && args[0] == "--detectar-anotacoes")
{
    var fotos = Directory.Exists(args[1])
        ? Directory.EnumerateFiles(args[1], "*.jpg", new EnumerationOptions { RecurseSubdirectories = true, MatchCasing = MatchCasing.CaseInsensitive }).Order().ToList()
        : [args[1]];
    var com = 0;
    foreach (var f in fotos)
    {
        var tem = Vetus.Api.Servicos.Ia.DetectorAnotacoes.TemAnotacao(f);
        if (tem) com++;
        Console.WriteLine($"{(tem ? "ANOTADA " : "sem      ")} {Path.GetFileName(f)}");
    }
    Console.WriteLine($"{com} de {fotos.Count} com anotação");
    return 0;
}

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

var conexao = cfg.GetConnectionString("Vetus")
    ?? throw new InvalidOperationException("Defina a conexão do banco: ConnectionStrings__Vetus.");
builder.Services.AddDbContext<VetusDb>(o => o.UseNpgsql(conexao));
builder.Services.AddSingleton<Arquivos>();

// IA: geradores de pré-laudo (Claude, Gemini, simulado) e a fila em segundo plano
builder.Services.AddSingleton<ConfiguracaoIa>();
builder.Services.AddHttpClient("gemini", c => c.Timeout = TimeSpan.FromMinutes(5));
builder.Services.AddSingleton<IGeradorLaudo, GeradorClaude>();
builder.Services.AddSingleton<IGeradorLaudo, GeradorGemini>();
builder.Services.AddSingleton<IGeradorLaudo, GeradorSimulado>();
builder.Services.AddScoped<ServicoLaudo>();
builder.Services.AddHostedService<FilaLaudos>();
builder.Services.AddScoped<PdfLaudo>();
builder.Services.AddScoped<Padronizador>();
builder.Services.AddScoped<Aprendizados>();
builder.Services.AddScoped<Cobranca>();
builder.Services.AddScoped<Referencias>();
builder.Services.AddSingleton<EnvioEmail>();
builder.Services.AddSingleton<BancoFrases>();

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// chaves que protegem o cookie de login: guardadas em disco para a sessão sobreviver a reinícios
var dp = builder.Services.AddDataProtection().SetApplicationName("vetus");
if (cfg["VETUS_CHAVES_DIR"] is { Length: > 0 } dirChaves) dp.PersistKeysToFileSystem(new DirectoryInfo(dirChaves));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "vetus";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // HTTPS na nuvem; HTTP nos testes locais
        o.ExpireTimeSpan = TimeSpan.FromDays(7);
        o.SlidingExpiration = true;
        // API: responde 401/403 em vez de redirecionar para uma página de login
        o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
        o.Events.OnValidatePrincipal = Acesso.ValidarSessao;
    });
builder.Services.AddAuthorization();

// limita tentativas de login: 10 por minuto por IP
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy(Limites.Login, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    // páginas públicas (verificação do laudo): 30 por minuto por IP, para dificultar adivinhar códigos
    o.AddPolicy(LaudoEndpoints.LimitePublico, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
await Inicializacao.Executar(app);

// "dotnet Vetus.Api.dll --ver-prompt <id do exame> <arquivo.txt>": grava o prompt que a IA receberia (sem chamar a IA)
if (args.Length >= 3 && args[0] == "--ver-prompt")
{
    using var escopo = app.Services.CreateScope();
    var (sistema, texto, fotos) = await escopo.ServiceProvider.GetRequiredService<ServicoLaudo>().PreviaPrompt(Guid.Parse(args[1]));
    await File.WriteAllTextAsync(args[2],
        "==================== INSTRUÇÕES (SISTEMA) ====================\n\n" + sistema +
        "\n\n==================== DADOS DO EXAME (MENSAGEM) ====================\n\n" + texto +
        "\n\n==================== FOTOS ENVIADAS (as imagens vão junto, uma a uma) ====================\n\n" + string.Join('\n', fotos) + "\n");
    Console.WriteLine($"Prompt gravado em {args[2]} (~{(sistema.Length + texto.Length) / 4} tokens de texto, {fotos.Count} fotos).");
    return 0;
}

// "dotnet Vetus.Api.dll --redefinir-senha <email>": redefine a senha de um usuário pelo servidor
// (ex.: administrador esqueceu a senha). A senha nova é lida da entrada padrão, não da linha de comando.
if (args.Length >= 2 && args[0] == "--redefinir-senha")
{
    using var escopo = app.Services.CreateScope();
    var db = escopo.ServiceProvider.GetRequiredService<VetusDb>();
    var email = Seguranca.NormalizarEmail(args[1]);
    var u = await db.Usuarios.FirstOrDefaultAsync(x => x.Email == email);
    if (u is null) { Console.Error.WriteLine($"Usuário {email} não encontrado."); return 1; }
    // o PowerShell pode mandar um caractere invisível (BOM) no início: não faz parte da senha
    var senha = (Console.In.ReadLine() ?? "").TrimStart('﻿').TrimEnd('\r', '\n');
    if (Seguranca.ValidarSenhaNova(senha) is { } erro) { Console.Error.WriteLine(erro); return 1; }
    u.SenhaHash = Seguranca.HashSenha(u, senha);
    u.TrocarSenha = false;
    u.Ativo = true;
    u.CarimboSeguranca = Guid.NewGuid(); // encerra as sessões abertas com a senha antiga
    await db.SaveChangesAsync();
    Console.WriteLine($"Senha de {email} redefinida.");
    return 0;
}

app.UseDefaultFiles();
app.UseStaticFiles(); // telas (React compiladas em wwwroot)
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/saude", async (VetusDb db) =>
    await db.Database.CanConnectAsync() ? Results.Ok(new { ok = true }) : Results.StatusCode(503));

AuthEndpoints.Mapear(app);
AdminEndpoints.Mapear(app);
ClinicaEndpoints.Mapear(app);
IngestaoEndpoints.Mapear(app);
ExameEndpoints.Mapear(app);
LaudoEndpoints.Mapear(app);
ImagemEndpoints.Mapear(app);
EnvioEndpoints.Mapear(app);
CobrancaEndpoints.Mapear(app);
ReferenciaEndpoints.Mapear(app);
PendriveEndpoints.Mapear(app);
LayoutEndpoints.Mapear(app);
FrasesEndpoints.Mapear(app);
RotulosEndpoints.Mapear(app);
InternoEndpoints.Mapear(app);

app.MapFallback("/api/{**resto}", () => Erros.NaoEncontrado("Rota não encontrada."));
app.MapFallbackToFile("index.html"); // rotas das telas (React Router)

app.Run();
return 0;

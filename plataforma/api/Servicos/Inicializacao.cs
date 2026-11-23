using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>Ao iniciar: aplica as migrações do banco e cria o administrador do sistema, se ainda não houver.</summary>
public static class Inicializacao
{
    public static async Task Executar(WebApplication app)
    {
        var log = app.Logger;
        using var escopo = app.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<VetusDb>();

        // o banco pode demorar alguns segundos para aceitar conexões
        for (var tentativa = 1; ; tentativa++)
        {
            try
            {
                await db.Database.MigrateAsync();
                break;
            }
            catch (Exception e) when (tentativa < 15 && e is Npgsql.NpgsqlException or TimeoutException or InvalidOperationException)
            {
                log.LogWarning("Banco indisponível ({Msg}); nova tentativa em 2 s...", e.Message);
                await Task.Delay(2000);
            }
        }

        // valores de referência iniciais (só na primeira vez; depois, editáveis pelo administrador)
        if (!await db.Referencias.AnyAsync())
        {
            db.Referencias.AddRange(ReferenciasIniciais.Todas());
            await db.SaveChangesAsync();
            log.LogInformation("Valores de referência iniciais cadastrados (validar com um veterinário ultrassonografista).");
        }

        // exames recebidos antes do envio por pendrive: completa o ID do animal (do exame.json do receptor),
        // para juntar com a pasta do pendrive do mesmo exame
        var semId = await db.Exames.Where(e => e.IdAnimal == null && e.Pasta != "").ToListAsync();
        if (semId.Count > 0)
        {
            var arq = escopo.ServiceProvider.GetRequiredService<Arquivos>();
            foreach (var e in semId)
            {
                try
                {
                    if (arq.LerJsonDicom(e.Pasta, "exame.json") is not { } json) continue;
                    using var d = System.Text.Json.JsonDocument.Parse(json);
                    if (d.RootElement.TryGetProperty("exameId", out var id) && id.ValueKind == System.Text.Json.JsonValueKind.String)
                        e.IdAnimal = Texto.Opcional(id.GetString());
                }
                catch (Exception x) { log.LogWarning("exame.json de {Pasta}: {Erro}", e.Pasta, x.Message); }
            }
            await db.SaveChangesAsync();
        }

        if (await db.Usuarios.AnyAsync(u => u.AdministradorSistema)) return;

        var cfg = app.Configuration;
        var email = Seguranca.NormalizarEmail(cfg["VETUS_ADMIN_EMAIL"]);
        var senha = cfg["VETUS_ADMIN_SENHA"];
        if (!email.Contains('@') || Seguranca.ValidarSenhaNova(senha) is not null)
        {
            log.LogWarning("Nenhum administrador do sistema. Defina VETUS_ADMIN_EMAIL e VETUS_ADMIN_SENHA (mínimo {N} caracteres).",
                Seguranca.TamanhoMinimoSenha);
            return;
        }

        var admin = await db.Usuarios.FirstOrDefaultAsync(u => u.Email == email);
        if (admin is null)
        {
            admin = new Usuario { Nome = "Administrador", Email = email };
            admin.SenhaHash = Seguranca.HashSenha(admin, senha!);
            db.Usuarios.Add(admin);
        }
        admin.AdministradorSistema = true;
        await db.SaveChangesAsync();
        log.LogInformation("Administrador do sistema criado: {Email}", email);
    }
}

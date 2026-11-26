using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vetus.Api.Dados;

public class VetusDb(DbContextOptions<VetusDb> options) : DbContext(options)
{
    public DbSet<Clinica> Clinicas => Set<Clinica>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Vinculo> Vinculos => Set<Vinculo>();
    public DbSet<Tutor> Tutores => Set<Tutor>();
    public DbSet<Paciente> Pacientes => Set<Paciente>();
    public DbSet<Exame> Exames => Set<Exame>();
    public DbSet<Laudo> Laudos => Set<Laudo>();
    public DbSet<ImagemCadastro> ImagensCadastro => Set<ImagemCadastro>();
    public DbSet<LinkPublico> LinksPublicos => Set<LinkPublico>();
    public DbSet<Compartilhamento> Compartilhamentos => Set<Compartilhamento>();
    public DbSet<DiscordanciaAlerta> DiscordanciasAlerta => Set<DiscordanciaAlerta>();
    public DbSet<RotuloImagem> RotulosImagem => Set<RotuloImagem>();
    public DbSet<DitadoOrgao> DitadosOrgao => Set<DitadoOrgao>();
    public DbSet<RegistroAtividade> RegistrosAtividade => Set<RegistroAtividade>();
    public DbSet<ConfiguracaoCobranca> ConfiguracoesCobranca => Set<ConfiguracaoCobranca>();
    public DbSet<PrecoModelo> PrecosModelos => Set<PrecoModelo>();
    public DbSet<MovimentoSaldo> MovimentosSaldo => Set<MovimentoSaldo>();
    public DbSet<Referencia> Referencias => Set<Referencia>();
    public DbSet<PerfilMentor> PerfisMentor => Set<PerfilMentor>();
    public DbSet<Mentoria> Mentorias => Set<Mentoria>();
    public DbSet<Notificacao> Notificacoes => Set<Notificacao>();
    public DbSet<RevisaoMentor> RevisoesMentor => Set<RevisaoMentor>();
    public DbSet<AnotacaoImagem> AnotacoesImagem => Set<AnotacaoImagem>();
    public DbSet<CalibracaoImagem> CalibracoesImagem => Set<CalibracaoImagem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Clinica>(e =>
        {
            e.ToTable("clinicas");
            e.HasIndex(x => x.Numero).IsUnique();
            e.HasIndex(x => x.AeTitle).IsUnique();
            e.Property(x => x.Nome).HasMaxLength(200);
            e.Property(x => x.AeTitle).HasMaxLength(16); // limite do AE Title no DICOM
            e.Property(x => x.PosicaoLogo).HasMaxLength(10);
            e.Property(x => x.Documento).HasMaxLength(30);
            e.Property(x => x.Telefone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.Endereco).HasMaxLength(300);
            e.Property(x => x.SaldoBrl).HasPrecision(14, 4);
        });

        b.Entity<Usuario>(e =>
        {
            e.ToTable("usuarios");
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Nome).HasMaxLength(200);
            e.Property(x => x.Email).HasMaxLength(200);
            e.Property(x => x.Crmv).HasMaxLength(20);
            e.Property(x => x.CrmvUf).HasMaxLength(2);
            e.Property(x => x.SmtpHost).HasMaxLength(200);
            e.Property(x => x.SmtpSeguranca).HasMaxLength(10);
            e.Property(x => x.SmtpUsuario).HasMaxLength(200);
            e.Property(x => x.SmtpSenhaProtegida).HasMaxLength(2000);
            e.Property(x => x.SmtpRemetenteNome).HasMaxLength(200);
            e.Property(x => x.SmtpRemetenteEmail).HasMaxLength(200);
        });

        b.Entity<Referencia>(e =>
        {
            e.ToTable("referencias");
            e.HasIndex(x => new { x.Especie, x.Orgao });
            e.Property(x => x.Especie).HasMaxLength(50);
            e.Property(x => x.Orgao).HasMaxLength(100);
            e.Property(x => x.Medida).HasMaxLength(200);
            e.Property(x => x.Unidade).HasMaxLength(20);
            e.Property(x => x.Termos).HasMaxLength(500);
            e.Property(x => x.Observacao).HasMaxLength(500);
            e.Property(x => x.Fonte).HasMaxLength(500);
            foreach (var p in new[] { "PesoMinKg", "PesoMaxKg", "Minimo", "Maximo" }) e.Property(p).HasPrecision(10, 3);
        });

        b.Entity<ConfiguracaoCobranca>(e =>
        {
            e.ToTable("configuracao_cobranca");
            e.Property(x => x.Id).ValueGeneratedNever();
            foreach (var p in new[] { "Fator", "CambioUsdBrl", "CreditoInicialClinica", "SaldoProvedorBrl", "AlertaSaldoProvedorBrl", "SaldoGeminiBrl", "SaldoClaudeUsd" })
                e.Property(p).HasPrecision(14, 4);
            e.HasData(new ConfiguracaoCobranca { Id = 1, AtualizadoEm = new DateTime(2026, 11, 23, 0, 0, 0, DateTimeKind.Utc) });
        });

        b.Entity<PrecoModelo>(e =>
        {
            e.ToTable("precos_modelos");
            e.HasKey(x => x.Modelo);
            e.Property(x => x.Modelo).HasMaxLength(100);
            e.Property(x => x.EntradaUsdPorMilhao).HasPrecision(12, 4);
            e.Property(x => x.SaidaUsdPorMilhao).HasPrecision(12, 4);
            // preços de referência; confira e ajuste na página do administrador
            e.HasData(
                new PrecoModelo { Modelo = "claude-opus-5-5", EntradaUsdPorMilhao = 4m, SaidaUsdPorMilhao = 20m },
                new PrecoModelo { Modelo = "claude-sonnet-5-5", EntradaUsdPorMilhao = 2m, SaidaUsdPorMilhao = 10m },
                new PrecoModelo { Modelo = "claude-haiku-5-5", EntradaUsdPorMilhao = 0.10m, SaidaUsdPorMilhao = 0.50m },
                new PrecoModelo { Modelo = "gemini-3.1-pro-preview", EntradaUsdPorMilhao = 2m, SaidaUsdPorMilhao = 12m },
                new PrecoModelo { Modelo = "simulado", EntradaUsdPorMilhao = 0m, SaidaUsdPorMilhao = 0m });
        });

        b.Entity<MovimentoSaldo>(e =>
        {
            e.ToTable("movimentos_saldo");
            e.HasIndex(x => new { x.ClinicaId, x.Em });
            e.HasOne<Clinica>().WithMany().HasForeignKey(x => x.ClinicaId);
            e.Property(x => x.Tipo).HasMaxLength(20);
            e.Property(x => x.Descricao).HasMaxLength(300);
            e.Property(x => x.Valor).HasPrecision(14, 4);
            e.Property(x => x.SaldoApos).HasPrecision(14, 4);
            e.Property(x => x.CustoBrl).HasPrecision(14, 6);
            e.Property(x => x.Ia).HasMaxLength(20);
        });

        b.Entity<LinkPublico>(e =>
        {
            e.ToTable("links_publicos");
            e.HasIndex(x => x.Token).IsUnique();
            e.HasIndex(x => x.ExameId);
            e.HasOne(x => x.Exame).WithMany().HasForeignKey(x => x.ExameId);
            e.Property(x => x.Token).HasMaxLength(40);
        });

        b.Entity<RegistroAtividade>(e =>
        {
            e.ToTable("registros_atividade");
            e.HasIndex(x => new { x.ClinicaId, x.Em });
            e.HasIndex(x => new { x.Tipo, x.Em });
            e.Property(x => x.Tipo).HasMaxLength(40);
            e.Property(x => x.Descricao).HasMaxLength(500);
            e.Property(x => x.ClinicaNome).HasMaxLength(200);
            e.Property(x => x.Paciente).HasMaxLength(200);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
            e.Property(x => x.UsuarioEmail).HasMaxLength(200);
            e.Property(x => x.Perfil).HasMaxLength(30);
        });

        b.Entity<DitadoOrgao>(e =>
        {
            e.ToTable("ditados_orgao");
            e.HasIndex(x => new { x.ClinicaId, x.CriadoEm });
            e.Property(x => x.Orgao).HasMaxLength(100);
            e.Property(x => x.TextoBruto).HasMaxLength(4000);
            e.Property(x => x.TextoPadronizado).HasMaxLength(4000);
            e.Property(x => x.TextoFinal).HasMaxLength(4000);
            e.Property(x => x.Ia).HasMaxLength(20);
            e.Property(x => x.Modelo).HasMaxLength(100);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
        });

        b.Entity<PerfilMentor>(e =>
        {
            e.ToTable("perfis_mentor");
            e.HasIndex(x => x.UsuarioId).IsUnique();
            e.HasOne(x => x.Usuario).WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.Property(x => x.DefinidoPorNome).HasMaxLength(200);
            e.Property(x => x.Areas).HasMaxLength(300);
            e.Property(x => x.Curriculo).HasMaxLength(2000);
            e.Property(x => x.Instituicao).HasMaxLength(200);
        });

        b.Entity<Mentoria>(e =>
        {
            e.ToTable("mentorias");
            e.HasIndex(x => new { x.MentorId, x.Situacao });
            e.HasIndex(x => new { x.MentoradoId, x.Situacao });
            e.HasOne(x => x.Mentor).WithMany().HasForeignKey(x => x.MentorId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Mentorado).WithMany().HasForeignKey(x => x.MentoradoId).OnDelete(DeleteBehavior.Cascade);
            e.Property(x => x.Situacao).HasMaxLength(20);
            e.Property(x => x.Mensagem).HasMaxLength(1000);
            e.Property(x => x.Resposta).HasMaxLength(1000);
            e.Property(x => x.EncerradaPor).HasMaxLength(200);
        });

        b.Entity<RevisaoMentor>(e =>
        {
            e.ToTable("revisoes_mentor");
            e.HasIndex(x => new { x.MentorId, x.Situacao });
            e.HasIndex(x => new { x.ExameId, x.Situacao });
            e.HasOne(x => x.Exame).WithMany().HasForeignKey(x => x.ExameId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Mentor).WithMany().HasForeignKey(x => x.MentorId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Mentorado).WithMany().HasForeignKey(x => x.MentoradoId).OnDelete(DeleteBehavior.Cascade);
            e.Property(x => x.Situacao).HasMaxLength(20);
            e.Property(x => x.Resultado).HasMaxLength(20);
            e.Property(x => x.Mensagem).HasMaxLength(1000);
            e.Property(x => x.Parecer).HasMaxLength(4000);
        });

        b.Entity<Notificacao>(e =>
        {
            e.ToTable("notificacoes");
            e.HasIndex(x => new { x.UsuarioId, x.Lida, x.CriadaEm });
            e.Property(x => x.Tipo).HasMaxLength(40);
            e.Property(x => x.Titulo).HasMaxLength(200);
            e.Property(x => x.Texto).HasMaxLength(1000);
            e.Property(x => x.Link).HasMaxLength(300);
        });

        b.Entity<RotuloImagem>(e =>
        {
            e.ToTable("rotulos_imagem");
            e.HasIndex(x => new { x.ExameId, x.Foto }).IsUnique(); // um rótulo por foto do exame (o último vale)
            e.HasIndex(x => x.HashFoto);
            e.Property(x => x.Foto).HasMaxLength(200);
            e.Property(x => x.HashFoto).HasMaxLength(40);
            e.Property(x => x.OrgaoIa).HasMaxLength(100);
            e.Property(x => x.OrgaoCorreto).HasMaxLength(100);
            e.Property(x => x.Tipo).HasMaxLength(20);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
        });

        b.Entity<DiscordanciaAlerta>(e =>
        {
            e.ToTable("discordancias_alerta");
            e.HasIndex(x => new { x.ClinicaId, x.CriadaEm });
            e.Property(x => x.Motivo).HasMaxLength(30);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
            e.Property(x => x.Comentario).HasMaxLength(2000);
            e.Property(x => x.AlertaConfianca).HasMaxLength(10);
            e.Property(x => x.Ia).HasMaxLength(20);
            e.Property(x => x.Modelo).HasMaxLength(100);
        });

        b.Entity<Compartilhamento>(e =>
        {
            e.ToTable("compartilhamentos");
            e.HasIndex(x => x.ExameId);
            e.HasOne<Exame>().WithMany().HasForeignKey(x => x.ExameId);
            e.Property(x => x.Meio).HasMaxLength(20);
            e.Property(x => x.Destinatario).HasMaxLength(500);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
        });

        b.Entity<ImagemCadastro>(e =>
        {
            e.ToTable("imagens_cadastro");
            e.HasKey(x => x.Chave);
            e.Property(x => x.Chave).HasMaxLength(60);
            e.Property(x => x.Tipo).HasMaxLength(30);
        });

        b.Entity<Vinculo>(e =>
        {
            e.ToTable("vinculos");
            e.HasIndex(x => new { x.UsuarioId, x.ClinicaId }).IsUnique();
            e.HasOne(x => x.Usuario).WithMany(u => u.Vinculos).HasForeignKey(x => x.UsuarioId);
            e.HasOne(x => x.Clinica).WithMany(c => c.Vinculos).HasForeignKey(x => x.ClinicaId);
            e.Property(x => x.Perfil).HasConversion<string>().HasMaxLength(30);
        });

        b.Entity<Tutor>(e =>
        {
            e.ToTable("tutores");
            e.HasIndex(x => new { x.ClinicaId, x.Nome });
            e.HasOne<Clinica>().WithMany().HasForeignKey(x => x.ClinicaId);
            e.Property(x => x.Nome).HasMaxLength(200);
            e.Property(x => x.Telefone).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(200);
        });

        b.Entity<Paciente>(e =>
        {
            e.ToTable("pacientes");
            e.HasIndex(x => new { x.ClinicaId, x.Nome });
            e.HasOne<Clinica>().WithMany().HasForeignKey(x => x.ClinicaId);
            e.HasOne(x => x.Tutor).WithMany().HasForeignKey(x => x.TutorId);
            e.Property(x => x.Nome).HasMaxLength(200);
            e.Property(x => x.Especie).HasMaxLength(100);
            e.Property(x => x.Raca).HasMaxLength(100);
            e.Property(x => x.Sexo).HasMaxLength(1);
            e.Property(x => x.Nascimento).HasMaxLength(8);
        });

        b.Entity<Exame>(e =>
        {
            e.ToTable("exames");
            e.HasIndex(x => new { x.ClinicaId, x.StudyInstanceUid }).IsUnique();
            e.HasIndex(x => new { x.ClinicaId, x.Status });
            e.HasOne(x => x.Clinica).WithMany().HasForeignKey(x => x.ClinicaId);
            e.HasOne(x => x.Paciente).WithMany().HasForeignKey(x => x.PacienteId);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(30);
            e.Property(x => x.StudyInstanceUid).HasMaxLength(64);
            e.Property(x => x.Pasta).HasMaxLength(300);
            e.HasIndex(x => new { x.ClinicaId, x.IdAnimal });
            e.Property(x => x.IdAnimal).HasMaxLength(64);
            e.Property(x => x.PastaPendrive).HasMaxLength(300);
            e.Property(x => x.Tipo).HasMaxLength(100);
            e.Property(x => x.Data).HasMaxLength(8);
            e.Property(x => x.Hora).HasMaxLength(14);
            e.Property(x => x.EspecieAparelho).HasMaxLength(100);
            e.Property(x => x.Idade).HasMaxLength(20);
            e.Property(x => x.Peso).HasMaxLength(20);
            e.Property(x => x.MedicoSolicitante).HasMaxLength(200);
            e.Property(x => x.Operador).HasMaxLength(200);
            e.Property(x => x.Equipamento).HasMaxLength(200);
            e.Property(x => x.Origem).HasMaxLength(20);
            e.Property(x => x.TipoExame).HasMaxLength(40);
            e.Property(x => x.SuspeitaClinica).HasMaxLength(1000);
            e.Property(x => x.Historico).HasMaxLength(4000);
            e.Property(x => x.SolicitanteNome).HasMaxLength(200);
            e.Property(x => x.SolicitanteCrmv).HasMaxLength(30);
            e.Property(x => x.SolicitanteClinica).HasMaxLength(200);
            e.Property(x => x.InformacoesAdicionais).HasMaxLength(8000);
            e.HasIndex(x => new { x.Status, x.Urgente, x.EnfileiradoEm });
            e.Property(x => x.ErroGeracao).HasMaxLength(1000);
        });

        b.Entity<Laudo>(e =>
        {
            e.ToTable("laudos");
            e.HasIndex(x => new { x.ExameId, x.Versao }).IsUnique();
            e.HasOne(x => x.Exame).WithMany().HasForeignKey(x => x.ExameId);
            e.Property(x => x.Ia).HasMaxLength(20);
            e.Property(x => x.Modelo).HasMaxLength(100);
            e.Property(x => x.ConteudoIa).HasColumnType("jsonb");
            e.Property(x => x.ConteudoRevisado).HasColumnType("jsonb");
            e.Property(x => x.ImagensEnviadas).HasColumnType("jsonb");
            e.Property(x => x.Modo).HasMaxLength(20);
            e.Property(x => x.CustoUsd).HasPrecision(14, 6);
            e.Property(x => x.CustoBrl).HasPrecision(14, 6);
            e.Property(x => x.CobradoBrl).HasPrecision(14, 4);
            e.Property(x => x.AssinadoPorNome).HasMaxLength(200);
            e.Property(x => x.AssinadoCrmv).HasMaxLength(30);
            e.Property(x => x.CodigoVerificacao).HasMaxLength(20);
            e.HasIndex(x => x.CodigoVerificacao).IsUnique();
            e.Property(x => x.MotivoRetificacao).HasMaxLength(1000);
            e.Property(x => x.DadosEntrada).HasColumnType("jsonb");
            e.Property(x => x.HashesFotos).HasColumnType("jsonb");
        });

        b.Entity<CalibracaoImagem>(e =>
        {
            e.ToTable("calibracoes_imagem");
            e.HasIndex(x => new { x.ClinicaId, x.Equipamento, x.Largura, x.Altura }).IsUnique();
            e.Property(x => x.Equipamento).HasMaxLength(120);
            e.Property(x => x.PxPorCm).HasPrecision(8, 2);
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
        });

        b.Entity<AnotacaoImagem>(e =>
        {
            e.ToTable("anotacoes_imagem");
            e.HasIndex(x => new { x.ExameId, x.Foto }).IsUnique();
            e.HasIndex(x => x.HashFoto);
            e.HasOne<Exame>().WithMany().HasForeignKey(x => x.ExameId);
            e.Property(x => x.Foto).HasMaxLength(200);
            e.Property(x => x.HashFoto).HasMaxLength(40);
            e.Property(x => x.Itens).HasColumnType("jsonb");
            e.Property(x => x.UsuarioNome).HasMaxLength(200);
        });
    }
}

/// <summary>Usado só pelo "dotnet ef" para criar migrações (não conecta no banco).</summary>
public class VetusDbDesignFactory : IDesignTimeDbContextFactory<VetusDb>
{
    public VetusDb CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<VetusDb>().UseNpgsql("Host=localhost;Database=vetus").Options);
}

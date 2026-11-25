using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>
    /// Registro geral de atividades (quem fez o quê e quando). A exclusão de exame vira um tipo de registro: as exclusões
    /// já gravadas em exclusoes_exame passam para registros_atividade e a tabela antiga sai.
    /// </summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261125180000_RegistroAtividades")]
    public partial class RegistroAtividades : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "registros_atividade",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Tipo = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Descricao = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClinicaNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: true),
                    Paciente = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Detalhes = table.Column<string>(type: "text", nullable: true),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: true),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    UsuarioEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Perfil = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_registros_atividade", x => x.Id);
                });

            migrationBuilder.CreateIndex(name: "IX_registros_atividade_ClinicaId_Em", table: "registros_atividade", columns: new[] { "ClinicaId", "Em" });
            migrationBuilder.CreateIndex(name: "IX_registros_atividade_Tipo_Em", table: "registros_atividade", columns: new[] { "Tipo", "Em" });

            // exclusões já registradas viram registros do tipo exame_excluido
            migrationBuilder.Sql("""
                INSERT INTO registros_atividade ("Id", "Em", "Tipo", "Descricao", "ClinicaId", "ClinicaNome", "ExameId", "Paciente",
                    "Detalhes", "UsuarioId", "UsuarioNome", "UsuarioEmail", "Perfil")
                SELECT "Id", "Em", 'exame_excluido',
                    'Exame excluído (' || "VersoesLaudo" || ' versão(ões) de laudo' ||
                        CASE WHEN "Assinado" THEN ', assinado — código ' || coalesce("CodigoVerificacao", '') || ' deixou de valer' ELSE '' END || ')',
                    "ClinicaId", "ClinicaNome", "ExameId", "Paciente",
                    json_build_object('especie', "Especie", 'responsavel', "Responsavel", 'dataExame', "DataExame", 'idAnimal', "IdAnimal",
                        'origem', "Origem", 'situacao', "StatusExame", 'versoesLaudo', "VersoesLaudo", 'assinado', "Assinado",
                        'codigoVerificacao', "CodigoVerificacao", 'totalFotos', "TotalFotos")::text,
                    NULLIF("UsuarioId", '00000000-0000-0000-0000-000000000000'::uuid), "UsuarioNome", "UsuarioEmail", "Perfil"
                FROM exclusoes_exame
                """);
            migrationBuilder.DropTable(name: "exclusoes_exame");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "registros_atividade");
        }
    }
}

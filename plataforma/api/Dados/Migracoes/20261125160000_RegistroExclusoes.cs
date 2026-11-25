using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>Registro de exames excluídos: quem excluiu, quando e o que havia.</summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261125160000_RegistroExclusoes")]
    public partial class RegistroExclusoes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "exclusoes_exame",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Paciente = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Especie = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Responsavel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DataExame = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    IdAnimal = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Origem = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    StatusExame = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    VersoesLaudo = table.Column<int>(type: "integer", nullable: false),
                    Assinado = table.Column<bool>(type: "boolean", nullable: false),
                    CodigoVerificacao = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    TotalFotos = table.Column<int>(type: "integer", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    UsuarioEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Perfil = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exclusoes_exame", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_exclusoes_exame_ClinicaId_Em",
                table: "exclusoes_exame",
                columns: new[] { "ClinicaId", "Em" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "exclusoes_exame");
        }
    }
}

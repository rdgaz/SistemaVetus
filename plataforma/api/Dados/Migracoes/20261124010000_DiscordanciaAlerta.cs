using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>Discordâncias do veterinário com o alerta de achado urgente da IA.</summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261124010000_DiscordanciaAlerta")]
    public partial class DiscordanciaAlerta : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "discordancias_alerta",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoVersao = table.Column<int>(type: "integer", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Motivo = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Comentario = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    AlertaMotivo = table.Column<string>(type: "text", nullable: false),
                    AlertaConfianca = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AlertaEvidencia = table.Column<string>(type: "text", nullable: true),
                    AlertaFotos = table.Column<string>(type: "text", nullable: false),
                    Ia = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Modelo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CriadaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_discordancias_alerta", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_discordancias_alerta_ClinicaId_CriadaEm",
                table: "discordancias_alerta",
                columns: new[] { "ClinicaId", "CriadaEm" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "discordancias_alerta");
        }
    }
}

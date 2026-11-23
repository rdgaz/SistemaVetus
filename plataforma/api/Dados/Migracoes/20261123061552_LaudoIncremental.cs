using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class LaudoIncremental : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DadosEntrada",
                table: "laudos",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "HashesFotos",
                table: "laudos",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "Modo",
                table: "laudos",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "completa");

            migrationBuilder.AddColumn<bool>(
                name: "GerarCompleto",
                table: "exames",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DadosEntrada",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "HashesFotos",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "Modo",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "GerarCompleto",
                table: "exames");
        }
    }
}

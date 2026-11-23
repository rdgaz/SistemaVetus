using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Pendrive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "FotosPendrive",
                table: "exames",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "IdAnimal",
                table: "exames",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PastaPendrive",
                table: "exames",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TotalVideos",
                table: "exames",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_exames_ClinicaId_IdAnimal",
                table: "exames",
                columns: new[] { "ClinicaId", "IdAnimal" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_exames_ClinicaId_IdAnimal",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "FotosPendrive",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "IdAnimal",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "PastaPendrive",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "TotalVideos",
                table: "exames");
        }
    }
}

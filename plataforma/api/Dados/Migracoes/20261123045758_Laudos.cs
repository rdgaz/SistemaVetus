using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Laudos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ErroGeracao",
                table: "exames",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "laudos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Versao = table.Column<int>(type: "integer", nullable: false),
                    Ia = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Modelo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ConteudoIa = table.Column<string>(type: "jsonb", nullable: false),
                    ConteudoRevisado = table.Column<string>(type: "jsonb", nullable: true),
                    ImagensEnviadas = table.Column<string>(type: "jsonb", nullable: false),
                    TokensEntrada = table.Column<int>(type: "integer", nullable: false),
                    TokensSaida = table.Column<int>(type: "integer", nullable: false),
                    DuracaoMs = table.Column<int>(type: "integer", nullable: false),
                    GeradoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_laudos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_laudos_exames_ExameId",
                        column: x => x.ExameId,
                        principalTable: "exames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_laudos_ExameId_Versao",
                table: "laudos",
                columns: new[] { "ExameId", "Versao" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "laudos");

            migrationBuilder.DropColumn(
                name: "ErroGeracao",
                table: "exames");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Referencias : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "referencias",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Especie = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PesoMinKg = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    PesoMaxKg = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    Orgao = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Medida = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Minimo = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    Maximo = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    Unidade = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Termos = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Observacao = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Fonte = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Ativa = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_referencias", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_referencias_Especie_Orgao",
                table: "referencias",
                columns: new[] { "Especie", "Orgao" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "referencias");
        }
    }
}

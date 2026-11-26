using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Ingestao : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "codigos_pareamento",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    CodigoHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NomeDispositivo = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CriadoPorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CriadoPorNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiraEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UsadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DispositivoId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_codigos_pareamento", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "dispositivos_ingestao",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: true),
                    Nome = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CriadoPorId = table.Column<Guid>(type: "uuid", nullable: true),
                    CriadoPorNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UltimoUsoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UltimoIp = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    VersaoApp = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    Ativo = table.Column<bool>(type: "boolean", nullable: false),
                    RevogadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevogadoPor = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dispositivos_ingestao", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_codigos_pareamento_CodigoHash",
                table: "codigos_pareamento",
                column: "CodigoHash");

            migrationBuilder.CreateIndex(
                name: "IX_dispositivos_ingestao_ClinicaId",
                table: "dispositivos_ingestao",
                column: "ClinicaId");

            migrationBuilder.CreateIndex(
                name: "IX_dispositivos_ingestao_TokenHash",
                table: "dispositivos_ingestao",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "codigos_pareamento");

            migrationBuilder.DropTable(
                name: "dispositivos_ingestao");
        }
    }
}

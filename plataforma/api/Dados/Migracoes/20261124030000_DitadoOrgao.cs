using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>Textos ditados pelo veterinário e padronizados pela IA (pares de treino).</summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261124030000_DitadoOrgao")]
    public partial class DitadoOrgao : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ditados_orgao",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoVersao = table.Column<int>(type: "integer", nullable: false),
                    Orgao = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TextoBruto = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    DescricaoAnterior = table.Column<string>(type: "text", nullable: true),
                    TextoPadronizado = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    TextoFinal = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Aceito = table.Column<bool>(type: "boolean", nullable: false),
                    Ia = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Modelo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ditados_orgao", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ditados_orgao_ClinicaId_CriadoEm",
                table: "ditados_orgao",
                columns: new[] { "ClinicaId", "CriadoEm" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ditados_orgao");
        }
    }
}

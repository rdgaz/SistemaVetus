using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class DadosClinicos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "EnfileiradoEm",
                table: "exames",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Historico",
                table: "exames",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InformacoesAdicionais",
                table: "exames",
                type: "character varying(8000)",
                maxLength: 8000,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Jejum",
                table: "exames",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SolicitanteClinica",
                table: "exames",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SolicitanteCrmv",
                table: "exames",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SolicitanteNome",
                table: "exames",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SuspeitaClinica",
                table: "exames",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TipoExame",
                table: "exames",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_exames_Status_Urgente_EnfileiradoEm",
                table: "exames",
                columns: new[] { "Status", "Urgente", "EnfileiradoEm" });

            // exames que já existiam: tipo sugerido pelo aparelho, solicitante do aparelho e data de entrada na fila
            migrationBuilder.Sql("""
                UPDATE exames SET "TipoExame" = 'abdominal' WHERE "TipoExame" IS NULL AND upper("Tipo") LIKE 'ABD%';
                UPDATE exames SET "SolicitanteNome" = "MedicoSolicitante" WHERE "SolicitanteNome" IS NULL;
                UPDATE exames SET "EnfileiradoEm" = "RecebidoEm" WHERE "Status" = 'NaFila' AND "EnfileiradoEm" IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_exames_Status_Urgente_EnfileiradoEm",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "EnfileiradoEm",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "Historico",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "InformacoesAdicionais",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "Jejum",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "SolicitanteClinica",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "SolicitanteCrmv",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "SolicitanteNome",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "SuspeitaClinica",
                table: "exames");

            migrationBuilder.DropColumn(
                name: "TipoExame",
                table: "exames");
        }
    }
}

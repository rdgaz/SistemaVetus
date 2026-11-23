using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class AssinaturaPdf : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssinadoCrmv",
                table: "laudos",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AssinadoEm",
                table: "laudos",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssinadoPorId",
                table: "laudos",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssinadoPorNome",
                table: "laudos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CodigoVerificacao",
                table: "laudos",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MotivoRetificacao",
                table: "laudos",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Retificado",
                table: "laudos",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "imagens_cadastro",
                columns: table => new
                {
                    Chave = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Conteudo = table.Column<byte[]>(type: "bytea", nullable: false),
                    AtualizadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_imagens_cadastro", x => x.Chave);
                });

            migrationBuilder.CreateIndex(
                name: "IX_laudos_CodigoVerificacao",
                table: "laudos",
                column: "CodigoVerificacao",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "imagens_cadastro");

            migrationBuilder.DropIndex(
                name: "IX_laudos_CodigoVerificacao",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "AssinadoCrmv",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "AssinadoEm",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "AssinadoPorId",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "AssinadoPorNome",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "CodigoVerificacao",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "MotivoRetificacao",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "Retificado",
                table: "laudos");
        }
    }
}

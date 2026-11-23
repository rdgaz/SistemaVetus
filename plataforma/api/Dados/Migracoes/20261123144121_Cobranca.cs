using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Cobranca : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CobradoBrl",
                table: "laudos",
                type: "numeric(14,4)",
                precision: 14,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CustoBrl",
                table: "laudos",
                type: "numeric(14,6)",
                precision: 14,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CustoUsd",
                table: "laudos",
                type: "numeric(14,6)",
                precision: 14,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "SaldoBrl",
                table: "clinicas",
                type: "numeric(14,4)",
                precision: 14,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "configuracao_cobranca",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    Fator = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    CambioUsdBrl = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    CreditoInicialClinica = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    SaldoProvedorBrl = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    AlertaSaldoProvedorBrl = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    AtualizadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracao_cobranca", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "movimentos_saldo",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Valor = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    SaldoApos = table.Column<decimal>(type: "numeric(14,4)", precision: 14, scale: 4, nullable: false),
                    Descricao = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: true),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: true),
                    Em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_movimentos_saldo", x => x.Id);
                    table.ForeignKey(
                        name: "FK_movimentos_saldo_clinicas_ClinicaId",
                        column: x => x.ClinicaId,
                        principalTable: "clinicas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "precos_modelos",
                columns: table => new
                {
                    Modelo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    EntradaUsdPorMilhao = table.Column<decimal>(type: "numeric(12,4)", precision: 12, scale: 4, nullable: false),
                    SaidaUsdPorMilhao = table.Column<decimal>(type: "numeric(12,4)", precision: 12, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_precos_modelos", x => x.Modelo);
                });

            migrationBuilder.InsertData(
                table: "configuracao_cobranca",
                columns: new[] { "Id", "AlertaSaldoProvedorBrl", "AtualizadoEm", "CambioUsdBrl", "CreditoInicialClinica", "Fator", "SaldoProvedorBrl" },
                values: new object[] { 1, 10m, new DateTime(2026, 11, 23, 0, 0, 0, 0, DateTimeKind.Utc), 5.50m, 40m, 2m, 40m });

            migrationBuilder.InsertData(
                table: "precos_modelos",
                columns: new[] { "Modelo", "EntradaUsdPorMilhao", "SaidaUsdPorMilhao" },
                values: new object[,]
                {
                    { "claude-haiku-5-5", 0.10m, 0.50m },
                    { "claude-opus-5-5", 4m, 20m },
                    { "claude-sonnet-5-5", 2m, 10m },
                    { "gemini-3.1-pro-preview", 2m, 12m },
                    { "simulado", 0m, 0m }
                });

            migrationBuilder.CreateIndex(
                name: "IX_movimentos_saldo_ClinicaId_Em",
                table: "movimentos_saldo",
                columns: new[] { "ClinicaId", "Em" });

            // clínicas que já existiam recebem o crédito inicial (com o registro no extrato)
            migrationBuilder.Sql("""
                UPDATE clinicas SET "SaldoBrl" = 40;
                INSERT INTO movimentos_saldo ("Id", "ClinicaId", "Tipo", "Valor", "SaldoApos", "Descricao", "Em")
                SELECT gen_random_uuid(), "Id", 'credito_inicial', 40, 40, 'Crédito inicial', now() FROM clinicas;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "configuracao_cobranca");

            migrationBuilder.DropTable(
                name: "movimentos_saldo");

            migrationBuilder.DropTable(
                name: "precos_modelos");

            migrationBuilder.DropColumn(
                name: "CobradoBrl",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "CustoBrl",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "CustoUsd",
                table: "laudos");

            migrationBuilder.DropColumn(
                name: "SaldoBrl",
                table: "clinicas");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>
    /// Saldo por provedor (Gemini em reais, Claude em dólares) e o custo real de cada débito (para o financeiro por clínica).
    /// </summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261124150000_SaldosProvedores")]
    public partial class SaldosProvedores : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(name: "SaldoGeminiBrl", table: "configuracao_cobranca", type: "numeric(14,4)", precision: 14, scale: 4, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<decimal>(name: "SaldoClaudeUsd", table: "configuracao_cobranca", type: "numeric(14,4)", precision: 14, scale: 4, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<DateTime>(name: "SaldosConferidosEm", table: "configuracao_cobranca", type: "timestamp with time zone", nullable: true);
            migrationBuilder.AddColumn<decimal>(name: "CustoBrl", table: "movimentos_saldo", type: "numeric(14,6)", precision: 14, scale: 6, nullable: false, defaultValue: 0m);
            migrationBuilder.AddColumn<string>(name: "Ia", table: "movimentos_saldo", type: "character varying(20)", maxLength: 20, nullable: true);

            // débitos antigos: custo real do laudo correspondente (mesmo exame e mesmo valor cobrado), quando o laudo ainda existe
            migrationBuilder.Sql("""
                UPDATE movimentos_saldo m SET "CustoBrl" = l."CustoBrl", "Ia" = l."Ia"
                FROM laudos l
                WHERE m."Tipo" = 'debito' AND m."ExameId" = l."ExameId" AND round(-m."Valor", 2) = round(l."CobradoBrl", 2)
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "SaldoGeminiBrl", table: "configuracao_cobranca");
            migrationBuilder.DropColumn(name: "SaldoClaudeUsd", table: "configuracao_cobranca");
            migrationBuilder.DropColumn(name: "SaldosConferidosEm", table: "configuracao_cobranca");
            migrationBuilder.DropColumn(name: "CustoBrl", table: "movimentos_saldo");
            migrationBuilder.DropColumn(name: "Ia", table: "movimentos_saldo");
        }
    }
}

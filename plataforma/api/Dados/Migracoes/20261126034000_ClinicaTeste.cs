using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>
    /// Marca clínicas usadas para testes (Teste = true): continuam funcionando normalmente para validação,
    /// mas não entram no banco global de correções da IA nem nos totais financeiros reais.
    /// </summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261126034000_ClinicaTeste")]
    public partial class ClinicaTeste : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Teste",
                table: "clinicas",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Teste",
                table: "clinicas");
        }
    }
}

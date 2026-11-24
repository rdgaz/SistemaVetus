using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>Aparência do PDF do laudo, por clínica (JSON).</summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261123220000_LayoutLaudo")]
    public partial class LayoutLaudo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LayoutLaudo",
                table: "clinicas",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LayoutLaudo",
                table: "clinicas");
        }
    }
}

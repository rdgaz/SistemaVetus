using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>
    /// Camada de anotações manuais por foto do exame (textos e medidas no estilo do aparelho de ultrassom),
    /// sem alterar o arquivo JPG original.
    /// </summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261126071500_AnotacoesImagem")]
    public partial class AnotacoesImagem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "anotacoes_imagem",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Foto = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    HashFoto = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Itens = table.Column<string>(type: "jsonb", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    AtualizadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_anotacoes_imagem", x => x.Id);
                    table.ForeignKey(
                        name: "FK_anotacoes_imagem_exames_ExameId",
                        column: x => x.ExameId,
                        principalTable: "exames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_anotacoes_imagem_ExameId_Foto",
                table: "anotacoes_imagem",
                columns: new[] { "ExameId", "Foto" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_anotacoes_imagem_HashFoto",
                table: "anotacoes_imagem",
                column: "HashFoto");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "anotacoes_imagem");
        }
    }
}

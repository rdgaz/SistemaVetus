using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <summary>Rótulos de imagem dados pelo veterinário (o que cada foto mostra): base de treino.</summary>
    [DbContext(typeof(VetusDb))]
    [Migration("20261124020000_RotuloImagem")]
    public partial class RotuloImagem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rotulos_imagem",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoVersao = table.Column<int>(type: "integer", nullable: false),
                    Foto = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    HashFoto = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    OrgaoIa = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OrgaoCorreto = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rotulos_imagem", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_rotulos_imagem_ExameId_Foto",
                table: "rotulos_imagem",
                columns: new[] { "ExameId", "Foto" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_rotulos_imagem_HashFoto",
                table: "rotulos_imagem",
                column: "HashFoto");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "rotulos_imagem");
        }
    }
}

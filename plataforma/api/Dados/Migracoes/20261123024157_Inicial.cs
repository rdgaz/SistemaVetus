using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "clinicas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Numero = table.Column<int>(type: "integer", nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Documento = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Endereco = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Telefone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    AeTitle = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TokenIngestaoHash = table.Column<string>(type: "text", nullable: true),
                    GerarAutomaticamente = table.Column<bool>(type: "boolean", nullable: false),
                    Ativa = table.Column<bool>(type: "boolean", nullable: false),
                    CriadaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_clinicas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "usuarios",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SenhaHash = table.Column<string>(type: "text", nullable: false),
                    TrocarSenha = table.Column<bool>(type: "boolean", nullable: false),
                    Crmv = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CrmvUf = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    AdministradorSistema = table.Column<bool>(type: "boolean", nullable: false),
                    Ativo = table.Column<bool>(type: "boolean", nullable: false),
                    CarimboSeguranca = table.Column<Guid>(type: "uuid", nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_usuarios", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "vinculos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Perfil = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IdentidadePropria = table.Column<bool>(type: "boolean", nullable: false),
                    Ativo = table.Column<bool>(type: "boolean", nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vinculos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_vinculos_clinicas_ClinicaId",
                        column: x => x.ClinicaId,
                        principalTable: "clinicas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_vinculos_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_clinicas_AeTitle",
                table: "clinicas",
                column: "AeTitle",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_clinicas_Numero",
                table: "clinicas",
                column: "Numero",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_usuarios_Email",
                table: "usuarios",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_vinculos_ClinicaId",
                table: "vinculos",
                column: "ClinicaId");

            migrationBuilder.CreateIndex(
                name: "IX_vinculos_UsuarioId_ClinicaId",
                table: "vinculos",
                columns: new[] { "UsuarioId", "ClinicaId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vinculos");

            migrationBuilder.DropTable(
                name: "clinicas");

            migrationBuilder.DropTable(
                name: "usuarios");
        }
    }
}

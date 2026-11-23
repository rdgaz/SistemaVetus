using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class EnvioLaudo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EnvioEmail",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnvioLink",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnvioPdf",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnvioWhatsapp",
                table: "usuarios",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "LinkValidadeDias",
                table: "usuarios",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SmtpHost",
                table: "usuarios",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SmtpPorta",
                table: "usuarios",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpRemetenteEmail",
                table: "usuarios",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpRemetenteNome",
                table: "usuarios",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpSeguranca",
                table: "usuarios",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpSenhaProtegida",
                table: "usuarios",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpUsuario",
                table: "usuarios",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "compartilhamentos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoVersao = table.Column<int>(type: "integer", nullable: false),
                    Meio = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Destinatario = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compartilhamentos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compartilhamentos_exames_ExameId",
                        column: x => x.ExameId,
                        principalTable: "exames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "links_publicos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Token = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CriadoPorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiraEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Revogado = table.Column<bool>(type: "boolean", nullable: false),
                    Acessos = table.Column<int>(type: "integer", nullable: false),
                    UltimoAcesso = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_links_publicos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_links_publicos_exames_ExameId",
                        column: x => x.ExameId,
                        principalTable: "exames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_compartilhamentos_ExameId",
                table: "compartilhamentos",
                column: "ExameId");

            migrationBuilder.CreateIndex(
                name: "IX_links_publicos_ExameId",
                table: "links_publicos",
                column: "ExameId");

            migrationBuilder.CreateIndex(
                name: "IX_links_publicos_Token",
                table: "links_publicos",
                column: "Token",
                unique: true);

            // usuários que já existiam: todos os canais de envio ativos e links de 30 dias
            migrationBuilder.Sql("""
                UPDATE usuarios SET "EnvioWhatsapp" = true, "EnvioEmail" = true, "EnvioLink" = true, "EnvioPdf" = true,
                    "LinkValidadeDias" = 30;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "compartilhamentos");

            migrationBuilder.DropTable(
                name: "links_publicos");

            migrationBuilder.DropColumn(
                name: "EnvioEmail",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "EnvioLink",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "EnvioPdf",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "EnvioWhatsapp",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "LinkValidadeDias",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpHost",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpPorta",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpRemetenteEmail",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpRemetenteNome",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpSeguranca",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpSenhaProtegida",
                table: "usuarios");

            migrationBuilder.DropColumn(
                name: "SmtpUsuario",
                table: "usuarios");
        }
    }
}

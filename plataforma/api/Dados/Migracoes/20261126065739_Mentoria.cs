using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Mentoria : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mentorias",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MentorId = table.Column<Guid>(type: "uuid", nullable: false),
                    MentoradoId = table.Column<Guid>(type: "uuid", nullable: false),
                    Situacao = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Mensagem = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Resposta = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    PedidaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RespondidaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EncerradaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EncerradaPor = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mentorias", x => x.Id);
                    table.ForeignKey(
                        name: "FK_mentorias_usuarios_MentorId",
                        column: x => x.MentorId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_mentorias_usuarios_MentoradoId",
                        column: x => x.MentoradoId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notificacoes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tipo = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Texto = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Link = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Lida = table.Column<bool>(type: "boolean", nullable: false),
                    CriadaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notificacoes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "perfis_mentor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UsuarioId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ativo = table.Column<bool>(type: "boolean", nullable: false),
                    DefinidoPorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DefinidoPorNome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    DefinidoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Areas = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Curriculo = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Instituicao = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LimitePedidos = table.Column<int>(type: "integer", nullable: false),
                    AceitaNovos = table.Column<bool>(type: "boolean", nullable: false),
                    PermiteRevisadoPor = table.Column<bool>(type: "boolean", nullable: false),
                    NotificarEmail = table.Column<bool>(type: "boolean", nullable: false),
                    AtualizadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_perfis_mentor", x => x.Id);
                    table.ForeignKey(
                        name: "FK_perfis_mentor_usuarios_UsuarioId",
                        column: x => x.UsuarioId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_mentorias_MentoradoId_Situacao",
                table: "mentorias",
                columns: new[] { "MentoradoId", "Situacao" });

            migrationBuilder.CreateIndex(
                name: "IX_mentorias_MentorId_Situacao",
                table: "mentorias",
                columns: new[] { "MentorId", "Situacao" });

            migrationBuilder.CreateIndex(
                name: "IX_notificacoes_UsuarioId_Lida_CriadaEm",
                table: "notificacoes",
                columns: new[] { "UsuarioId", "Lida", "CriadaEm" });

            migrationBuilder.CreateIndex(
                name: "IX_perfis_mentor_UsuarioId",
                table: "perfis_mentor",
                column: "UsuarioId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mentorias");

            migrationBuilder.DropTable(
                name: "notificacoes");

            migrationBuilder.DropTable(
                name: "perfis_mentor");
        }
    }
}

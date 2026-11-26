using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class RevisaoMentor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "revisoes_mentor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExameId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaudoVersao = table.Column<int>(type: "integer", nullable: false),
                    MentorId = table.Column<Guid>(type: "uuid", nullable: false),
                    MentoradoId = table.Column<Guid>(type: "uuid", nullable: false),
                    Situacao = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ParaEnsino = table.Column<bool>(type: "boolean", nullable: false),
                    Mensagem = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ConteudoEnviado = table.Column<string>(type: "text", nullable: false),
                    ConteudoMentor = table.Column<string>(type: "text", nullable: true),
                    Comentarios = table.Column<string>(type: "text", nullable: false),
                    Rotulos = table.Column<string>(type: "text", nullable: false),
                    Parecer = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Resultado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    EnviadaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IniciadaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConcluidaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CanceladaEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revisoes_mentor", x => x.Id);
                    table.ForeignKey(
                        name: "FK_revisoes_mentor_exames_ExameId",
                        column: x => x.ExameId,
                        principalTable: "exames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_revisoes_mentor_usuarios_MentorId",
                        column: x => x.MentorId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_revisoes_mentor_usuarios_MentoradoId",
                        column: x => x.MentoradoId,
                        principalTable: "usuarios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_revisoes_mentor_ExameId_Situacao",
                table: "revisoes_mentor",
                columns: new[] { "ExameId", "Situacao" });

            migrationBuilder.CreateIndex(
                name: "IX_revisoes_mentor_MentoradoId",
                table: "revisoes_mentor",
                column: "MentoradoId");

            migrationBuilder.CreateIndex(
                name: "IX_revisoes_mentor_MentorId_Situacao",
                table: "revisoes_mentor",
                columns: new[] { "MentorId", "Situacao" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "revisoes_mentor");
        }
    }
}

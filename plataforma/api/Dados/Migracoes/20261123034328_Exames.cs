using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vetus.Api.Dados.Migracoes
{
    /// <inheritdoc />
    public partial class Exames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tutores",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Telefone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tutores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tutores_clinicas_ClinicaId",
                        column: x => x.ClinicaId,
                        principalTable: "clinicas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pacientes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    TutorId = table.Column<Guid>(type: "uuid", nullable: true),
                    Nome = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Especie = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Raca = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Sexo = table.Column<string>(type: "character varying(1)", maxLength: 1, nullable: true),
                    Castrado = table.Column<bool>(type: "boolean", nullable: true),
                    Nascimento = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    CriadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pacientes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_pacientes_clinicas_ClinicaId",
                        column: x => x.ClinicaId,
                        principalTable: "clinicas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_pacientes_tutores_TutorId",
                        column: x => x.TutorId,
                        principalTable: "tutores",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "exames",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicaId = table.Column<Guid>(type: "uuid", nullable: false),
                    PacienteId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudyInstanceUid = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Pasta = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Data = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    Hora = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: true),
                    EspecieAparelho = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Idade = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Peso = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    MedicoSolicitante = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Operador = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Equipamento = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Urgente = table.Column<bool>(type: "boolean", nullable: false),
                    Origem = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TotalFotos = table.Column<int>(type: "integer", nullable: false),
                    TotalPdfs = table.Column<int>(type: "integer", nullable: false),
                    RecebidoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AtualizadoEm = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exames", x => x.Id);
                    table.ForeignKey(
                        name: "FK_exames_clinicas_ClinicaId",
                        column: x => x.ClinicaId,
                        principalTable: "clinicas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exames_pacientes_PacienteId",
                        column: x => x.PacienteId,
                        principalTable: "pacientes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_exames_ClinicaId_Status",
                table: "exames",
                columns: new[] { "ClinicaId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_exames_ClinicaId_StudyInstanceUid",
                table: "exames",
                columns: new[] { "ClinicaId", "StudyInstanceUid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_exames_PacienteId",
                table: "exames",
                column: "PacienteId");

            migrationBuilder.CreateIndex(
                name: "IX_pacientes_ClinicaId_Nome",
                table: "pacientes",
                columns: new[] { "ClinicaId", "Nome" });

            migrationBuilder.CreateIndex(
                name: "IX_pacientes_TutorId",
                table: "pacientes",
                column: "TutorId");

            migrationBuilder.CreateIndex(
                name: "IX_tutores_ClinicaId_Nome",
                table: "tutores",
                columns: new[] { "ClinicaId", "Nome" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "exames");

            migrationBuilder.DropTable(
                name: "pacientes");

            migrationBuilder.DropTable(
                name: "tutores");
        }
    }
}

using System.Text.Json;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Endpoints;

/// <summary>Exames da clínica escolhida: lista por status, detalhe e arquivos (fotos e PDFs).</summary>
public static class ExameEndpoints
{
    private static readonly FileExtensionContentTypeProvider TiposArquivo = new();

    public record PacienteReq(string? Nome, string? Especie, string? Raca, string? Sexo, bool? Castrado, string? Nascimento);
    public record TutorReq(string? Nome, string? Telefone, string? Email);
    /// <summary>Campos da tela do exame. null = não altera; "" = apaga.</summary>
    public record SalvarExameReq(
        PacienteReq? Paciente, TutorReq? Tutor,
        string? Idade, string? Peso, string? TipoExame, string? SuspeitaClinica, string? Historico, bool? Jejum,
        bool LimparJejum, string? SolicitanteNome, string? SolicitanteCrmv, string? SolicitanteClinica,
        string? InformacoesAdicionais, bool? Urgente, bool? Completa);

    private static Task<Exame?> CarregarParaEditar(Guid id, HttpContext http, VetusDb db)
    {
        var clinicaId = http.VinculoAtual().ClinicaId;
        return db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor)
            .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
    }

    /// <summary>Aplica os campos enviados. Devolve uma mensagem de erro ou null.</summary>
    private static string? Aplicar(Exame e, SalvarExameReq r, VetusDb db)
    {
        // texto: null = mantém; "" = apaga; limita o tamanho
        string? T(string? novo, string? atual, int max) => novo is null ? atual : Texto.Opcional(novo) is { } s ? s[..Math.Min(s.Length, max)] : null;

        if (r.TipoExame is not null && r.TipoExame != "" && !TiposExame.Valido(r.TipoExame)) return "Tipo de exame inválido.";
        if (r.Paciente?.Sexo is { Length: > 0 } sx && sx.ToUpperInvariant() is not ("M" or "F" or "O")) return "Sexo inválido (M, F ou O).";
        if (r.Tutor?.Email is { Length: > 0 } em && !em.Contains('@')) return "E-mail do responsável inválido.";

        if (r.Paciente is { } p)
        {
            if (p.Nome is not null && Texto.Opcional(p.Nome) is null) return "O nome do paciente não pode ficar vazio.";
            e.Paciente.Nome = T(p.Nome, e.Paciente.Nome, 200)!;
            e.Paciente.Especie = T(p.Especie, e.Paciente.Especie, 100);
            e.Paciente.Raca = T(p.Raca, e.Paciente.Raca, 100);
            e.Paciente.Sexo = p.Sexo is null ? e.Paciente.Sexo : Texto.Opcional(p.Sexo)?.ToUpperInvariant();
            if (p.Castrado is not null) e.Paciente.Castrado = p.Castrado;
            e.Paciente.Nascimento = T(p.Nascimento, e.Paciente.Nascimento, 8);
        }

        if (r.Tutor is { } t)
        {
            var nome = T(t.Nome, e.Paciente.Tutor?.Nome, 200);
            if (nome is not null)
            {
                if (e.Paciente.Tutor is null)
                {
                    e.Paciente.Tutor = db.Tutores.Add(new Tutor { ClinicaId = e.ClinicaId, Nome = nome }).Entity;
                }
                e.Paciente.Tutor.Nome = nome;
                e.Paciente.Tutor.Telefone = T(t.Telefone, e.Paciente.Tutor.Telefone, 30);
                e.Paciente.Tutor.Email = T(t.Email, e.Paciente.Tutor.Email, 200);
            }
        }

        e.Idade = T(r.Idade, e.Idade, 20);
        e.Peso = T(r.Peso, e.Peso, 20);
        e.TipoExame = r.TipoExame is null ? e.TipoExame : Texto.Opcional(r.TipoExame);
        e.SuspeitaClinica = T(r.SuspeitaClinica, e.SuspeitaClinica, 1000);
        e.Historico = T(r.Historico, e.Historico, 4000);
        if (r.LimparJejum) e.Jejum = null; else if (r.Jejum is not null) e.Jejum = r.Jejum;
        e.SolicitanteNome = T(r.SolicitanteNome, e.SolicitanteNome, 200);
        e.SolicitanteCrmv = T(r.SolicitanteCrmv, e.SolicitanteCrmv, 30);
        e.SolicitanteClinica = T(r.SolicitanteClinica, e.SolicitanteClinica, 200);
        e.InformacoesAdicionais = T(r.InformacoesAdicionais, e.InformacoesAdicionais, 8000);
        if (r.Urgente is not null) e.Urgente = r.Urgente.Value;
        e.AtualizadoEm = DateTime.UtcNow;
        return null;
    }

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/exames");

        // Lista (mais recentes primeiro) e contagem por status
        g.MapGet("", async (StatusExame? status, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var contagens = await db.Exames.Where(e => e.ClinicaId == clinicaId)
                .GroupBy(e => e.Status).Select(g => new { status = g.Key, total = g.Count() })
                .ToDictionaryAsync(x => x.status.ToString(), x => x.total);

            var q = db.Exames.Where(e => e.ClinicaId == clinicaId);
            if (status is { } s) q = q.Where(e => e.Status == s);
            var lista = await q.OrderByDescending(e => e.Urgente).ThenByDescending(e => e.RecebidoEm).Take(200)
                .Select(e => new
                {
                    e.Id, e.Status, e.Urgente, e.Tipo, e.Data, e.TotalFotos, e.TotalPdfs, e.TotalVideos, e.RecebidoEm, e.Origem,
                    arquivos = new Exame { Pasta = e.Pasta, PastaPendrive = e.PastaPendrive, FotosPendrive = e.FotosPendrive },
                    paciente = e.Paciente.Nome, especie = e.Paciente.Especie, tutor = e.Paciente.Tutor!.Nome,
                })
                .ToListAsync();

            return Results.Ok(new
            {
                contagens,
                exames = lista.Select(e => new
                {
                    e.Id, e.Status, e.Urgente, e.Tipo, e.Data, e.TotalFotos, e.TotalPdfs, e.TotalVideos, e.RecebidoEm, e.Origem,
                    e.paciente, e.especie, e.tutor,
                    miniatura = arq.PrimeiraFoto(e.arquivos) is { } f ? $"/api/exames/{e.Id}/arquivos/jpg/{Uri.EscapeDataString(f)}" : null,
                }),
            });
        }).ExigirClinica();

        // Detalhe do exame: dados, paciente, fotos, PDFs e medidas
        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, VetusDb db, Arquivos arq, ConfiguracaoIa ia, Referencias referencias) =>
        {
            var clinicaId = http.VinculoAtual().ClinicaId;
            var e = await db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor)
                .FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == clinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            var l = await db.Laudos.Where(x => x.ExameId == e.Id).OrderByDescending(x => x.Versao).FirstOrDefaultAsync();
            var laudo = l is null ? null : new
            {
                l.Id, l.Versao, l.Ia, l.Modelo, l.Modo, l.GeradoEm, l.TokensEntrada, l.TokensSaida, l.DuracaoMs, l.CobradoBrl,
                l.AssinadoPorNome, l.AssinadoCrmv, l.AssinadoEm, l.CodigoVerificacao, l.Retificado, l.MotivoRetificacao,
                revisado = l.ConteudoRevisado is not null,
                conteudo = JsonSerializer.Deserialize<JsonElement>(l.ConteudoRevisado ?? l.ConteudoIa),
                imagensEnviadas = JsonSerializer.Deserialize<string[]>(l.ImagensEnviadas),
            };

            var medidasAparelho = arq.LerJson(e, "medidas.json") is { } json
                ? JsonSerializer.Deserialize<JsonElement>(json) : (JsonElement?)null;
            var anotacoesExame = await db.AnotacoesImagem.Where(a => a.ExameId == e.Id).ToListAsync();
            var medidas = DesenhoAnotacao.MesclarMedidas(medidasAparelho, anotacoesExame);
            var url = (string sub, string nome) => $"/api/exames/{e.Id}/arquivos/{sub}/{Uri.EscapeDataString(nome)}";
            var pesoKg = Referencias.PesoKg(e.Peso);
            var refs = await referencias.Aplicaveis(e.Paciente.Especie, pesoKg);

            return Results.Ok(new
            {
                pesoKg,
                referencias = refs.Select(r => new { r.Id, r.Orgao, r.Medida, faixa = Referencias.Faixa(r), r.Observacao, r.Fonte }),
                medidasComparadas = Referencias.Comparar(medidas, refs),
                anotacoes = anotacoesExame.ToDictionary(a => a.Foto, a => DesenhoAnotacao.Ler(a.Itens)),
                e.Id, e.Status, e.Urgente, e.Origem, e.Tipo, e.Data, e.Hora, e.EspecieAparelho, e.Idade, e.Peso,
                e.MedicoSolicitante, e.Operador, e.Equipamento, e.RecebidoEm, e.AtualizadoEm, e.EnfileiradoEm, e.Pasta, e.IdAnimal,
                e.FotosPendrive, pendrive = e.PastaPendrive is not null,
                e.TipoExame, e.SuspeitaClinica, e.Historico, e.Jejum, e.SolicitanteNome, e.SolicitanteCrmv,
                e.SolicitanteClinica, e.InformacoesAdicionais, e.ErroGeracao, laudo,
                // revisão do mentor pendente (o laudo fica só para leitura, a não ser que seja para ensino)
                revisaoMentor = await db.RevisoesMentor.Where(r => r.ExameId == e.Id && r.Situacao == RevisaoMentor.Pendente)
                    .Select(r => new { r.Id, mentor = r.Mentor.Nome, r.EnviadaEm, r.IniciadaEm, r.ParaEnsino }).FirstOrDefaultAsync(),
                informacoesObrigatorias = http.VinculoAtual().Clinica.InformacoesObrigatorias,
                verificacaoOnline = http.VinculoAtual().Clinica.VerificacaoOnline,
                iaAtiva = ia.Ativa,
                mascaras = ModeloLaudo.Normalidade,
                clinicaId = e.ClinicaId,
                tiposExame = TiposExame.Todos.Select(t => new { codigo = t.Key, nome = t.Value }),
                paciente = new
                {
                    e.Paciente.Id, e.Paciente.Nome, e.Paciente.Especie, e.Paciente.Raca, e.Paciente.Sexo,
                    e.Paciente.Castrado, e.Paciente.Nascimento,
                },
                tutor = e.Paciente.Tutor is null ? null : new { e.Paciente.Tutor.Id, e.Paciente.Tutor.Nome, e.Paciente.Tutor.Telefone, e.Paciente.Tutor.Email },
                fotos = arq.Listar(e, Arquivos.Jpg).Select(n => new { nome = n, url = url(Arquivos.Jpg, n) }),
                pdfs = arq.Listar(e, Arquivos.Pdf).Select(n => new { nome = n, url = url(Arquivos.Pdf, n) }),
                videos = arq.Listar(e, Arquivos.Mp4).Select(n => new { nome = n, url = url(Arquivos.Mp4, n) }),
                medidas,
            });
        }).ExigirClinica();


        // Excluir o exame por completo (para enviar de novo, por exemplo pelo pendrive): laudos, envios, rótulos, ditados e os
        // arquivos enviados pelo pendrive. Laudo já assinado: só o administrador da clínica exclui.
        g.MapDelete("/{id:guid}", async (Guid id, HttpContext http, VetusDb db, Arquivos arq, ILoggerFactory logs, RegistroAtividades registros) =>
        {
            var v = http.VinculoAtual();
            var e = await db.Exames.Include(x => x.Paciente).FirstOrDefaultAsync(x => x.Id == id && x.ClinicaId == v.ClinicaId);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status == StatusExame.Gerando) return Erros.Conflito("O pré-laudo está sendo gerado: aguarde terminar para excluir.");
            if (await db.Laudos.AnyAsync(l => l.ExameId == id && l.AssinadoEm != null) && v.Perfil != Perfil.AdministradorClinica)
                return Results.Json(new { erro = "Este exame tem laudo assinado: só o administrador da clínica pode excluí-lo." }, statusCode: 403);

            // Antes de separar a pasta do exame, preserva na pasta global "_treino" qualquer foto que já tenha sido rotulada
            // pelo veterinário (somente de clínicas reais, para não contaminar o dataset com exames de teste).
            if (!v.Clinica.Teste)
            {
                var rotulosExame = await db.RotulosImagem.Where(x => x.ExameId == id).Select(x => new { x.Foto, x.HashFoto }).ToListAsync();
                if (rotulosExame.Count > 0)
                {
                    try
                    {
                        var dirTreino = Path.Combine(arq.RaizPendrive, "_treino");
                        Directory.CreateDirectory(dirTreino);
                        foreach (var rot in rotulosExame)
                            if (!string.IsNullOrWhiteSpace(rot.HashFoto) && arq.Arquivo(e, Arquivos.Jpg, rot.Foto) is { } origemFoto)
                            {
                                var destinoTreino = Path.Combine(dirTreino, $"{rot.HashFoto}.jpg");
                                if (!File.Exists(destinoTreino)) File.Copy(origemFoto, destinoTreino);
                            }
                    }
                    catch (Exception x) { logs.CreateLogger("Exames").LogWarning(x, "Exame {Id}: não foi possível copiar fotos rotuladas para _treino", id); }
                }
            }

            // 1) Arquivos do pendrive: a pasta é separada ANTES de mexer no banco (renomear é atômico). Daqui em diante um novo
            //    envio do mesmo exame cria uma pasta nova, e nunca se mistura com restos. Se não der para separar, nada é excluído.
            var log = logs.CreateLogger("Exames");
            var pastaPendrive = e.PastaPendrive;
            var dirPendrive = pastaPendrive is null ? null : arq.PastaPendrive(pastaPendrive);
            string? separada = null;
            if (dirPendrive is not null && Directory.Exists(dirPendrive))
            {
                separada = $"{dirPendrive}.excluido-{Guid.NewGuid():N}";
                try { Directory.Move(dirPendrive, separada); }
                catch (Exception x) when (x is IOException or UnauthorizedAccessException)
                {
                    log.LogError(x, "Exame {Id}: pasta do pendrive {Pasta} não pôde ser separada; exclusão cancelada", id, pastaPendrive);
                    return Results.Json(new { erro = "Não foi possível apagar as fotos e os arquivos deste exame. Nada foi excluído: tente de novo." }, statusCode: 500);
                }
            }

            // 2) Banco, numa transação só. Se falhar, a pasta volta para o lugar e o exame continua inteiro.
            try
            {
                await using var tx = await db.Database.BeginTransactionAsync();
                // registro de atividades: quem excluiu, quando e o que havia (fica mesmo com o exame apagado)
                var laudosDoExame = await db.Laudos.Where(l => l.ExameId == id)
                    .Select(l => new { l.Versao, l.AssinadoEm, l.CodigoVerificacao }).ToListAsync();
                var ultimoAssinado = laudosDoExame.Where(l => l.AssinadoEm != null).OrderByDescending(l => l.Versao).FirstOrDefault();
                var responsavelExame = e.Paciente.TutorId is { } idTutor ? await db.Tutores.Where(t => t.Id == idTutor).Select(t => t.Nome).FirstOrDefaultAsync() : null;
                await registros.Adicionar(http, "exame_excluido",
                    $"Exame excluído ({laudosDoExame.Count} versão(ões) de laudo{(ultimoAssinado is not null ? $", assinado — código {ultimoAssinado.CodigoVerificacao} deixou de valer" : "")})",
                    id, e.Paciente.Nome, new
                    {
                        especie = e.Paciente.Especie, responsavel = responsavelExame, dataExame = e.Data, idAnimal = e.IdAnimal,
                        origem = e.Origem, situacao = e.Status.ToString(), versoesLaudo = laudosDoExame.Count,
                        assinado = ultimoAssinado is not null, codigoVerificacao = ultimoAssinado?.CodigoVerificacao, totalFotos = e.TotalFotos,
                    });
                await db.Compartilhamentos.Where(x => x.ExameId == id).ExecuteDeleteAsync();
                await db.LinksPublicos.Where(x => x.ExameId == id).ExecuteDeleteAsync();
                await db.AnotacoesImagem.Where(x => x.ExameId == id).ExecuteDeleteAsync();
                // RotulosImagem, DitadosOrgao e DiscordanciasAlerta são preservados mesmo ao excluir o exame,
                // para que o aprendizado acumulado pela IA nunca seja perdido.
                await db.Laudos.Where(x => x.ExameId == id).ExecuteDeleteAsync();
                // o extrato de créditos fica (é dinheiro), sem o vínculo com o exame e com a anotação de que o exame foi excluído
                // (o pré-laudo já foi cobrado: sem a nota, o lançamento pareceria de um exame que ainda existe)
                var quem = (await Acesso.UsuarioAtual(http, db))?.Nome;
                var nota = $" — exame excluído em {DateTime.Now:dd/MM/yyyy HH:mm}{(string.IsNullOrWhiteSpace(quem) ? "" : $" por {quem}")}";
                foreach (var mov in await db.MovimentosSaldo.Where(x => x.ExameId == id).ToListAsync())
                {
                    var basePrincipal = mov.Descricao.Length + nota.Length > 300 ? mov.Descricao[..(300 - nota.Length)] : mov.Descricao;
                    mov.Descricao = basePrincipal + nota;
                    mov.ExameId = null;
                }
                var pacienteId = e.PacienteId;
                var tutorId = e.Paciente.TutorId;
                db.Exames.Remove(e);
                await db.SaveChangesAsync();

                // paciente e responsável que ficaram sem nenhum exame
                if (!await db.Exames.AnyAsync(x => x.PacienteId == pacienteId))
                    await db.Pacientes.Where(p => p.Id == pacienteId).ExecuteDeleteAsync();
                if (tutorId is { } t && !await db.Pacientes.AnyAsync(p => p.TutorId == t))
                    await db.Tutores.Where(x => x.Id == t).ExecuteDeleteAsync();
                await tx.CommitAsync();
            }
            catch
            {
                if (separada is not null && dirPendrive is not null)
                {
                    try { Directory.Move(separada, dirPendrive); }
                    catch (Exception x) { log.LogError(x, "Exame {Id}: não consegui devolver a pasta {Pasta} ao lugar", id, separada); }
                }
                throw;
            }

            // 3) Apaga de vez a pasta separada (e restos de exclusões anteriores que não terminaram). Se alguma não puder ser
            //    apagada agora, ela já está fora do caminho do exame (não atrapalha novos envios) e é tentada de novo na próxima exclusão.
            if (dirPendrive is not null && Path.GetDirectoryName(dirPendrive) is { } pai && Directory.Exists(pai))
            {
                foreach (var resto in Directory.EnumerateDirectories(pai, "*.excluido-*"))
                {
                    try { Directory.Delete(resto, recursive: true); }
                    catch (Exception x) when (x is IOException or UnauthorizedAccessException)
                    {
                        log.LogWarning("Pasta excluída {Pasta} ainda não foi apagada do disco: {Erro}", resto, x.Message);
                    }
                }
            }
            return Results.NoContent();
        }).ExigirClinica(Perfil.Veterinario, Perfil.AdministradorClinica);
        // Salva os dados do exame, do paciente e do responsável (tela do exame). Qualquer perfil da clínica pode preencher.
        g.MapPut("/{id:guid}", async (Guid id, SalvarExameReq r, HttpContext http, VetusDb db) =>
        {
            var e = await CarregarParaEditar(id, http, db);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            if (e.Status == StatusExame.Pronto) return Erros.Conflito("Laudo já assinado: use a retificação.");
            if (await ComMentor(id, db)) return Erros.Conflito("O laudo está com o mentor para revisão: aguarde a resposta ou cancele o pedido.");
            if (Aplicar(e, r, db) is { } erro) return Erros.Invalido(erro);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).ExigirClinica();

        // Gerar pré-laudo: (opcionalmente salva os dados e) coloca o exame na fila da IA
        g.MapPost("/{id:guid}/gerar", async (Guid id, SalvarExameReq? r, HttpContext http, VetusDb db, ServicoLaudo laudos, RegistroAtividades registros) =>
        {
            var e = await CarregarParaEditar(id, http, db);
            if (e is null) return Erros.NaoEncontrado("Exame não encontrado.");
            switch (e.Status)
            {
                case StatusExame.Pronto: return Erros.Conflito("Laudo já assinado: use a retificação.");
                case StatusExame.Gerando: return Erros.Conflito("O pré-laudo já está sendo gerado.");
            }
            if (await ComMentor(id, db)) return Erros.Conflito("O laudo está com o mentor para revisão: aguarde a resposta ou cancele o pedido.");
            if (r is not null && Aplicar(e, r, db) is { } erro) return Erros.Invalido(erro);

            var faltando = new List<string>();
            if (string.IsNullOrWhiteSpace(e.Paciente.Especie)) faltando.Add("espécie");
            if (!TiposExame.Valido(e.TipoExame)) faltando.Add("tipo de exame");
            if (faltando.Count > 0) return Erros.Invalido($"Para gerar o pré-laudo, informe: {string.Join(" e ", faltando)}.");
            if (http.VinculoAtual().Clinica.InformacoesObrigatorias && string.IsNullOrWhiteSpace(e.InformacoesAdicionais))
                return Erros.Invalido("Preencha o campo \"Informações adicionais\" (obrigatório nesta clínica) para gerar o pré-laudo.");

            // gerar de novo: atualiza só com o que mudou (sem reenviar as fotos), salvo pedido de análise completa
            e.GerarCompleto = r?.Completa == true;
            var plano = await laudos.Planejar(e);
            if (plano.Modo == ServicoLaudo.Nada)
                return Erros.Conflito("Nada mudou desde o último pré-laudo (dados, texto livre e fotos são os mesmos). " +
                    "Altere algo, ou use \"Refazer análise completa\" para a IA olhar todas as fotos de novo.");
            if (await laudos.SaldoInsuficiente(e.ClinicaId, plano) is { } semSaldo)
                return Results.Json(new { erro = semSaldo }, statusCode: 402);

            if (e.Status != StatusExame.NaFila) e.EnfileiradoEm = DateTime.UtcNow; // já na fila: mantém o lugar
            e.Status = StatusExame.NaFila;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await registros.Gravar(http, "analise_solicitada",
                $"Análise pedida à IA ({plano.Modo switch { ServicoLaudo.SoDados => "só o que mudou, sem imagens", ServicoLaudo.SoImagensNovas => $"com {plano.Enviar.Count} foto(s) nova(s)", _ => "análise completa" }})",
                e.Id, e.Paciente.Nome, new { modo = plano.Modo, mudancas = plano.Mudancas });
            return Results.Ok(new { e.Id, e.Status, e.EnfileiradoEm, modo = plano.Modo, mudancas = plano.Mudancas, imagensNovas = plano.Enviar.Count });
        }).ExigirClinica();

        // Foto ou PDF do exame. Sem o cabeçalho X-Clinica-Id (é usado em <img src>): confere o acesso pela clínica do exame.
        g.MapGet("/{id:guid}/arquivos/{sub}/{nome}", async (Guid id, string sub, string nome, HttpContext http, VetusDb db, Arquivos arq) =>
        {
            var usuarioId = Acesso.UsuarioId(http.User);
            var e = await db.Exames.FirstOrDefaultAsync(x => x.Id == id && db.Vinculos.Any(v =>
                v.ClinicaId == x.ClinicaId && v.UsuarioId == usuarioId && v.Ativo && v.Clinica.Ativa));
            if (e is null) return Results.NotFound();
            var f = arq.Arquivo(e, sub, nome);
            if (f is null) return Results.NotFound();
            TiposArquivo.TryGetContentType(f, out var tipo);
            http.Response.Headers.CacheControl = "private, max-age=86400";
            return Results.File(f, tipo ?? "application/octet-stream", enableRangeProcessing: true); // vídeos: avançar/voltar
        }).RequireAuthorization();
    }

    /// <summary>Há revisão do mentor pendente (não só para ensino)? Então o laudo e os dados do exame ficam parados.</summary>
    private static Task<bool> ComMentor(Guid exameId, VetusDb db) =>
        db.RevisoesMentor.AnyAsync(r => r.ExameId == exameId && r.Situacao == RevisaoMentor.Pendente && !r.ParaEnsino);
}

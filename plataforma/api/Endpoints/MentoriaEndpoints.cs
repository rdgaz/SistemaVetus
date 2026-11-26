using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;
using Vetus.Api.Servicos;

namespace Vetus.Api.Endpoints;

/// <summary>
/// Mentoria (etapa 1): o administrador do sistema define os mentores; o mentor preenche o perfil; qualquer usuário procura
/// mentores e pede mentoria; o mentor aceita ou recusa; os dois podem encerrar. Avisos pelo sino (e e-mail ao mentor).
/// </summary>
public static class MentoriaEndpoints
{
    public record DefinirMentorReq(Guid UsuarioId);
    public record PerfilMentorReq(string? Areas, string? Curriculo, string? Instituicao, int? LimitePedidos, bool? AceitaNovos,
        bool? PermiteRevisadoPor, bool? NotificarEmail);
    public record PedirMentoriaReq(Guid MentorId, string? Mensagem);
    public record ResponderReq(string? Resposta);

    public static void Mapear(WebApplication app)
    {
        // ---------- administrador do sistema: quem é mentor
        var adm = app.MapGroup("/api/admin/mentores").ExigirAdministradorSistema();

        adm.MapGet("", async (VetusDb db) =>
        {
            var lista = await db.PerfisMentor.OrderByDescending(p => p.Ativo).ThenBy(p => p.Usuario.Nome)
                .Select(p => new
                {
                    p.UsuarioId, p.Usuario.Nome, p.Usuario.Email, p.Usuario.Crmv, p.Usuario.CrmvUf, p.Ativo, p.DefinidoPorNome, p.DefinidoEm,
                    p.Areas, p.Instituicao, p.AceitaNovos,
                    mentorados = db.Mentorias.Count(m => m.MentorId == p.UsuarioId && m.Situacao == Mentoria.Aceita),
                    pedidos = db.Mentorias.Count(m => m.MentorId == p.UsuarioId && m.Situacao == Mentoria.Pedida),
                })
                .ToListAsync();
            return Results.Ok(lista);
        });

        // veterinários que podem virar mentor (com CRMV), para a busca da tela
        adm.MapGet("/candidatos", async (string? busca, VetusDb db) =>
        {
            var b = (busca ?? "").Trim().ToLower();
            if (b.Length < 2) return Results.Ok(Array.Empty<object>());
            var lista = await db.Usuarios
                .Where(u => u.Ativo && u.Crmv != null && u.Crmv != "" && (u.Nome.ToLower().Contains(b) || u.Email.Contains(b) || u.Crmv!.Contains(b)))
                .Where(u => !db.PerfisMentor.Any(p => p.UsuarioId == u.Id && p.Ativo))
                .OrderBy(u => u.Nome).Take(20)
                .Select(u => new
                {
                    usuarioId = u.Id, u.Nome, u.Email, u.Crmv, u.CrmvUf,
                    clinicas = db.Vinculos.Where(v => v.UsuarioId == u.Id && v.Ativo).Select(v => v.Clinica.Nome).ToList(),
                })
                .ToListAsync();
            return Results.Ok(lista);
        });

        adm.MapPost("", async (DefinirMentorReq r, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var u = await db.Usuarios.FirstOrDefaultAsync(x => x.Id == r.UsuarioId && x.Ativo);
            if (u is null) return Erros.NaoEncontrado("Usuário não encontrado.");
            if (string.IsNullOrWhiteSpace(u.Crmv) || string.IsNullOrWhiteSpace(u.CrmvUf))
                return Erros.Invalido("Só veterinário com CRMV e UF cadastrados pode ser mentor.");
            var admin = (await Acesso.UsuarioAtual(http, db))!;
            var p = await db.PerfisMentor.FirstOrDefaultAsync(x => x.UsuarioId == u.Id);
            if (p is { Ativo: true }) return Erros.Conflito("Este usuário já é mentor.");
            if (p is null) db.PerfisMentor.Add(p = new PerfilMentor { UsuarioId = u.Id });
            p.Ativo = true; p.DefinidoPorId = admin.Id; p.DefinidoPorNome = admin.Nome; p.DefinidoEm = DateTime.UtcNow;
            avisos.Adicionar(u.Id, "mentor_definido", "Você agora é mentor no AutoLaudoVet",
                "Complete o seu perfil de mentor (áreas, currículo e preferências) para aparecer no diretório.", "/mentoria");
            await registros.Adicionar(http, "mentor_definido", $"{u.Nome} ({u.Email}) definido como mentor");
            await db.SaveChangesAsync();
            return Results.Ok(new { p.UsuarioId, p.Ativo });
        });

        adm.MapDelete("/{usuarioId:guid}", async (Guid usuarioId, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var p = await db.PerfisMentor.Include(x => x.Usuario).FirstOrDefaultAsync(x => x.UsuarioId == usuarioId && x.Ativo);
            if (p is null) return Erros.NaoEncontrado("Mentor não encontrado.");
            p.Ativo = false;
            // mentorias em aberto terminam junto, com aviso aos mentorados
            var abertas = await db.Mentorias.Where(m => m.MentorId == usuarioId && (m.Situacao == Mentoria.Pedida || m.Situacao == Mentoria.Aceita)).ToListAsync();
            foreach (var m in abertas)
            {
                m.Situacao = Mentoria.Encerrada; m.EncerradaEm = DateTime.UtcNow; m.EncerradaPor = "administrador do sistema";
                await CancelarRevisoes(db, m.MentorId, m.MentoradoId);
                avisos.Adicionar(m.MentoradoId, "mentoria_encerrada", $"Mentoria com {p.Usuario.Nome} encerrada",
                    "O mentor saiu da lista de mentores do AutoLaudoVet. Você pode procurar outro mentor.", "/mentoria");
            }
            await registros.Adicionar(http, "mentor_removido", $"{p.Usuario.Nome} ({p.Usuario.Email}) deixou de ser mentor ({abertas.Count} mentoria(s) encerrada(s))");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---------- perfil do próprio mentor
        var g = app.MapGroup("/api/mentoria").RequireAuthorization();

        g.MapGet("/perfil", async (HttpContext http, VetusDb db) =>
        {
            var id = Acesso.UsuarioId(http.User);
            var p = await db.PerfisMentor.FirstOrDefaultAsync(x => x.UsuarioId == id && x.Ativo);
            return p is null ? Results.Ok(new { mentor = false })
                : Results.Ok(new { mentor = true, p.Areas, p.Curriculo, p.Instituicao, p.LimitePedidos, p.AceitaNovos, p.PermiteRevisadoPor, p.NotificarEmail });
        });

        g.MapPut("/perfil", async (PerfilMentorReq r, HttpContext http, VetusDb db) =>
        {
            var id = Acesso.UsuarioId(http.User);
            var p = await db.PerfisMentor.FirstOrDefaultAsync(x => x.UsuarioId == id && x.Ativo);
            if (p is null) return Results.Json(new { erro = "Somente mentores definidos pelo administrador do sistema." }, statusCode: 403);
            p.Areas = Limite(r.Areas, 300); p.Curriculo = Limite(r.Curriculo, 2000); p.Instituicao = Limite(r.Instituicao, 200);
            if (r.LimitePedidos is { } lim) p.LimitePedidos = Math.Clamp(lim, 1, 100);
            if (r.AceitaNovos is { } an) p.AceitaNovos = an;
            if (r.PermiteRevisadoPor is { } rp) p.PermiteRevisadoPor = rp;
            if (r.NotificarEmail is { } ne) p.NotificarEmail = ne;
            p.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---------- diretório de mentores (qualquer usuário logado)
        app.MapGet("/api/mentores", async (string? busca, HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var b = (busca ?? "").Trim().ToLower();
            var q = db.PerfisMentor.Where(p => p.Ativo && p.Usuario.Ativo && p.UsuarioId != eu);
            if (b.Length > 0)
                q = q.Where(p => p.Usuario.Nome.ToLower().Contains(b) || (p.Areas != null && p.Areas.ToLower().Contains(b))
                    || (p.Instituicao != null && p.Instituicao.ToLower().Contains(b)));
            var lista = await q.OrderBy(p => p.Usuario.Nome)
                .Select(p => new
                {
                    mentorId = p.UsuarioId, p.Usuario.Nome, p.Usuario.Crmv, p.Usuario.CrmvUf, p.Areas, p.Curriculo, p.Instituicao, p.AceitaNovos,
                    mentorados = db.Mentorias.Count(m => m.MentorId == p.UsuarioId && m.Situacao == Mentoria.Aceita),
                    // situação da mentoria comigo, se houver uma em aberto
                    minha = db.Mentorias.Where(m => m.MentorId == p.UsuarioId && m.MentoradoId == eu
                            && (m.Situacao == Mentoria.Pedida || m.Situacao == Mentoria.Aceita))
                        .Select(m => new { m.Id, m.Situacao }).FirstOrDefault(),
                })
                .ToListAsync();
            return Results.Ok(lista);
        }).RequireAuthorization();

        // ---------- mentorias
        var mt = app.MapGroup("/api/mentorias").RequireAuthorization();

        mt.MapGet("", async (HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var comoMentorado = await db.Mentorias.Where(m => m.MentoradoId == eu).OrderByDescending(m => m.PedidaEm).Take(100)
                .Select(m => new
                {
                    m.Id, m.Situacao, m.Mensagem, m.Resposta, m.PedidaEm, m.RespondidaEm, m.EncerradaEm, m.EncerradaPor,
                    pessoa = new { id = m.MentorId, m.Mentor.Nome, m.Mentor.Email, m.Mentor.Crmv, m.Mentor.CrmvUf },
                })
                .ToListAsync();
            var comoMentor = await db.Mentorias.Where(m => m.MentorId == eu).OrderByDescending(m => m.PedidaEm).Take(200)
                .Select(m => new
                {
                    m.Id, m.Situacao, m.Mensagem, m.Resposta, m.PedidaEm, m.RespondidaEm, m.EncerradaEm, m.EncerradaPor,
                    pessoa = new { id = m.MentoradoId, m.Mentorado.Nome, m.Mentorado.Email, m.Mentorado.Crmv, m.Mentorado.CrmvUf },
                    clinicas = db.Vinculos.Where(v => v.UsuarioId == m.MentoradoId && v.Ativo).Select(v => v.Clinica.Nome).ToList(),
                })
                .ToListAsync();
            var souMentor = await db.PerfisMentor.AnyAsync(p => p.UsuarioId == eu && p.Ativo);
            return Results.Ok(new { souMentor, comoMentorado, comoMentor });
        });

        mt.MapPost("", async (PedirMentoriaReq r, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var eu = (await Acesso.UsuarioAtual(http, db))!;
            if (r.MentorId == eu.Id) return Erros.Invalido("Você não pode pedir mentoria a si mesmo.");
            var p = await db.PerfisMentor.Include(x => x.Usuario).FirstOrDefaultAsync(x => x.UsuarioId == r.MentorId && x.Ativo && x.Usuario.Ativo);
            if (p is null) return Erros.NaoEncontrado("Mentor não encontrado.");
            if (!p.AceitaNovos) return Erros.Invalido("Este mentor não está aceitando novos mentorados no momento.");
            if (await db.Mentorias.AnyAsync(m => m.MentorId == r.MentorId && m.MentoradoId == eu.Id && (m.Situacao == Mentoria.Pedida || m.Situacao == Mentoria.Aceita)))
                return Erros.Conflito("Você já tem um pedido ou uma mentoria em andamento com este mentor.");
            var m = new Mentoria { MentorId = r.MentorId, MentoradoId = eu.Id, Mensagem = Limite(r.Mensagem, 1000) };
            db.Mentorias.Add(m);
            var texto = $"{eu.Nome} pediu para ter você como mentor." + (m.Mensagem is null ? "" : $" Mensagem: \"{m.Mensagem}\"");
            avisos.Adicionar(p.UsuarioId, "mentoria_pedida", "Novo pedido de mentoria", texto, "/mentoria");
            if (p.NotificarEmail) avisos.EnviarEmail(p.Usuario.Email, "AutoLaudoVet: novo pedido de mentoria", texto + "\n\nAceite ou recuse na tela Mentoria.", "/mentoria");
            await registros.Adicionar(http, "mentoria_pedida", $"{eu.Nome} pediu mentoria a {p.Usuario.Nome}");
            await db.SaveChangesAsync();
            return Results.Created($"/api/mentorias/{m.Id}", new { m.Id, m.Situacao });
        });

        mt.MapPost("/{id:guid}/aceitar", (Guid id, ResponderReq? r, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
            Responder(id, true, r?.Resposta, http, db, avisos, registros));
        mt.MapPost("/{id:guid}/recusar", (Guid id, ResponderReq? r, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
            Responder(id, false, r?.Resposta, http, db, avisos, registros));

        // o mentorado desiste do pedido antes da resposta
        mt.MapPost("/{id:guid}/cancelar", async (Guid id, HttpContext http, VetusDb db, Notificacoes avisos) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var m = await db.Mentorias.Include(x => x.Mentorado).FirstOrDefaultAsync(x => x.Id == id && x.MentoradoId == eu);
            if (m is null) return Erros.NaoEncontrado("Pedido não encontrado.");
            if (m.Situacao != Mentoria.Pedida) return Erros.Conflito("Só dá para cancelar um pedido que ainda não foi respondido.");
            m.Situacao = Mentoria.Cancelada; m.EncerradaEm = DateTime.UtcNow; m.EncerradaPor = m.Mentorado.Nome;
            avisos.Adicionar(m.MentorId, "mentoria_cancelada", "Pedido de mentoria cancelado", $"{m.Mentorado.Nome} cancelou o pedido de mentoria.", "/mentoria");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // qualquer um dos dois encerra uma mentoria aceita
        mt.MapPost("/{id:guid}/encerrar", async (Guid id, HttpContext http, VetusDb db, Notificacoes avisos, RegistroAtividades registros) =>
        {
            var eu = (await Acesso.UsuarioAtual(http, db))!;
            var m = await db.Mentorias.Include(x => x.Mentor).Include(x => x.Mentorado)
                .FirstOrDefaultAsync(x => x.Id == id && (x.MentorId == eu.Id || x.MentoradoId == eu.Id));
            if (m is null) return Erros.NaoEncontrado("Mentoria não encontrada.");
            if (m.Situacao != Mentoria.Aceita) return Erros.Conflito("Só dá para encerrar uma mentoria em andamento.");
            m.Situacao = Mentoria.Encerrada; m.EncerradaEm = DateTime.UtcNow; m.EncerradaPor = eu.Nome;
            await CancelarRevisoes(db, m.MentorId, m.MentoradoId);
            var outro = m.MentorId == eu.Id ? m.MentoradoId : m.MentorId;
            avisos.Adicionar(outro, "mentoria_encerrada", "Mentoria encerrada", $"{eu.Nome} encerrou a mentoria.", "/mentoria");
            await registros.Adicionar(http, "mentoria_encerrada", $"Mentoria entre {m.Mentor.Nome} (mentor) e {m.Mentorado.Nome} encerrada por {eu.Nome}");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---------- notificações (sino)
        var nt = app.MapGroup("/api/notificacoes").RequireAuthorization();

        nt.MapGet("", async (HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            var naoLidas = await db.Notificacoes.CountAsync(n => n.UsuarioId == eu && !n.Lida);
            var itens = await db.Notificacoes.Where(n => n.UsuarioId == eu).OrderByDescending(n => n.CriadaEm).Take(30)
                .Select(n => new { n.Id, n.Tipo, n.Titulo, n.Texto, n.Link, n.Lida, n.CriadaEm }).ToListAsync();
            return Results.Ok(new { naoLidas, itens });
        });

        nt.MapPost("/{id:guid}/lida", async (Guid id, HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            await db.Notificacoes.Where(n => n.Id == id && n.UsuarioId == eu).ExecuteUpdateAsync(s => s.SetProperty(n => n.Lida, true));
            return Results.NoContent();
        });

        nt.MapPost("/lidas", async (HttpContext http, VetusDb db) =>
        {
            var eu = Acesso.UsuarioId(http.User);
            await db.Notificacoes.Where(n => n.UsuarioId == eu && !n.Lida).ExecuteUpdateAsync(s => s.SetProperty(n => n.Lida, true));
            return Results.NoContent();
        });
    }

    private static async Task<IResult> Responder(Guid id, bool aceitar, string? resposta, HttpContext http, VetusDb db,
        Notificacoes avisos, RegistroAtividades registros)
    {
        var eu = (await Acesso.UsuarioAtual(http, db))!;
        var m = await db.Mentorias.Include(x => x.Mentorado).FirstOrDefaultAsync(x => x.Id == id && x.MentorId == eu.Id);
        if (m is null) return Erros.NaoEncontrado("Pedido não encontrado.");
        if (m.Situacao != Mentoria.Pedida) return Erros.Conflito("Este pedido já foi respondido ou cancelado.");
        if (aceitar && !await db.PerfisMentor.AnyAsync(p => p.UsuarioId == eu.Id && p.Ativo))
            return Results.Json(new { erro = "Você não é mais mentor." }, statusCode: 403);
        m.Situacao = aceitar ? Mentoria.Aceita : Mentoria.Recusada;
        m.Resposta = Limite(resposta, 1000);
        m.RespondidaEm = DateTime.UtcNow;
        var titulo = aceitar ? $"{eu.Nome} aceitou ser seu mentor" : $"{eu.Nome} recusou o pedido de mentoria";
        var texto = (aceitar ? "Agora você pode enviar laudos para a revisão do mentor: na tela do exame, toque em Enviar ao mentor." : "Você pode procurar outro mentor.")
            + (m.Resposta is null ? "" : $" Mensagem: \"{m.Resposta}\"");
        avisos.Adicionar(m.MentoradoId, aceitar ? "mentoria_aceita" : "mentoria_recusada", titulo, texto, "/mentoria");
        await registros.Adicionar(http, aceitar ? "mentoria_aceita" : "mentoria_recusada", $"{eu.Nome} {(aceitar ? "aceitou" : "recusou")} a mentoria de {m.Mentorado.Nome}");
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// <summary>Fim da mentoria: revisões pendentes entre os dois são canceladas (o laudo volta a poder ser editado).</summary>
    private static async Task CancelarRevisoes(VetusDb db, Guid mentorId, Guid mentoradoId)
    {
        foreach (var r in await db.RevisoesMentor.Where(r => r.MentorId == mentorId && r.MentoradoId == mentoradoId && r.Situacao == RevisaoMentor.Pendente).ToListAsync())
        {
            r.Situacao = RevisaoMentor.Cancelada;
            r.CanceladaEm = DateTime.UtcNow;
        }
    }

    private static string? Limite(string? s, int max)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : t.Length > max ? t[..max] : t;
    }
}

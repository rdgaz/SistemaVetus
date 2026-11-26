'use strict';
/**
 * Teste da mentoria (etapa 1): o administrador do sistema define mentores, o mentor preenche o perfil, o mentorado
 * (de outra clínica) encontra e pede mentoria, aceite/recusa/cancelamento/encerramento e os avisos do sino.
 * Uso: node tests/mentoria.js   (variáveis: PLATAFORMA_URL, VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA)
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  OK  ' : ' FALHA'} ${m}`); if (!c) falhas++; };

class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; }
  async req(metodo, caminho, corpo) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, dados: tipo.includes('json') ? await r.json() : null };
  }
  /** Login. O sistema limita 10 tentativas por minuto por IP (no CI os testes rodam em sequência): se barrar (429), espera e tenta de novo. */
  async entrar(email, senha) {
    for (let i = 0; ; i++) {
      const r = await this.req('POST', '/api/auth/entrar', { email, senha });
      if (r.status !== 429 || i >= 2) return r;
      console.log('  ...limite de logins por minuto atingido; aguardando 60 s');
      await new Promise((f) => setTimeout(f, 60000));
    }
  }
}

(async () => {
  const n = Date.now();
  const adm = new Navegador();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');

  /** Cria uma clínica e devolve o administrador dela logado, com a senha trocada. */
  async function clinica(nome) {
    const email = `adm.${nome}.${n}@teste.local`;
    const c = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica ${nome} ${n}`, administrador: { nome: `Adm ${nome}`, email } });
    const nav = new Navegador();
    const prov = c.dados.administrador.senhaProvisoria;
    await nav.entrar(email, prov);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${n}` });
    nav.clinica = c.dados.id;
    return nav;
  }
  /** Cria um veterinário na clínica e devolve ele logado, com a senha trocada. */
  async function veterinario(admClinica, nome, comCrmv = true) {
    const email = `${nome}.${n}@teste.local`;
    const u = await admClinica.req('POST', '/api/clinica/usuarios', comCrmv
      ? { nome: `Dra. ${nome}`, email, perfil: 'Veterinario', crmv: '1234', crmvUf: 'sp' }
      : { nome: `${nome}`, email, perfil: 'Usuario' });
    const nav = new Navegador();
    await nav.entrar(email, u.dados.senhaProvisoria);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: u.dados.senhaProvisoria, novaSenha: `Senha-${n}` });
    nav.clinica = admClinica.clinica;
    nav.email = email;
    nav.id = (await nav.req('GET', '/api/auth/eu')).dados.id;
    return nav;
  }

  const A = await clinica('mentorA');
  const B = await clinica('mentorB');
  const mentor = await veterinario(A, 'mentora');
  const aluno = await veterinario(B, 'aluno');
  const semCrmv = await veterinario(B, 'semcrmv', false);

  // ---- administrador do sistema define o mentor
  ok((await aluno.req('GET', '/api/admin/mentores')).status === 403, 'só o administrador do sistema vê a lista de mentores');
  const cand = await adm.req('GET', `/api/admin/mentores/candidatos?busca=${encodeURIComponent(mentor.email)}`);
  ok(cand.status === 200 && cand.dados.length === 1 && cand.dados[0].usuarioId === mentor.id, 'busca de candidatos encontra o veterinário com CRMV');
  ok((await adm.req('GET', `/api/admin/mentores/candidatos?busca=${encodeURIComponent(semCrmv.email)}`)).dados.length === 0, 'usuário sem CRMV não aparece como candidato');
  ok((await adm.req('POST', '/api/admin/mentores', { usuarioId: semCrmv.id })).status === 400, 'usuário sem CRMV não vira mentor');
  ok((await adm.req('POST', '/api/admin/mentores', { usuarioId: mentor.id })).status === 200, 'administrador torna o veterinário mentor');
  ok((await adm.req('POST', '/api/admin/mentores', { usuarioId: mentor.id })).status === 409, 'tornar mentor duas vezes: 409');
  ok((await mentor.req('GET', '/api/auth/eu')).dados.mentor === true && (await aluno.req('GET', '/api/auth/eu')).dados.mentor === false, 'sessão informa quem é mentor');
  const avisoDefinido = (await mentor.req('GET', '/api/notificacoes')).dados;
  ok(avisoDefinido.naoLidas >= 1 && avisoDefinido.itens.some((x) => x.tipo === 'mentor_definido' && x.link === '/mentoria'), 'mentor recebe aviso de que virou mentor');

  // ---- perfil do mentor
  ok((await aluno.req('PUT', '/api/mentoria/perfil', { areas: 'x' })).status === 403, 'quem não é mentor não edita perfil de mentor');
  ok((await mentor.req('PUT', '/api/mentoria/perfil', { areas: 'Abdominal, Felinos', instituicao: 'Universidade Teste', curriculo: 'Professora de imagem', limitePedidos: 5, permiteRevisadoPor: true })).status === 204, 'mentor salva o perfil');
  const perfil = (await mentor.req('GET', '/api/mentoria/perfil')).dados;
  ok(perfil.mentor && perfil.areas === 'Abdominal, Felinos' && perfil.limitePedidos === 5 && perfil.permiteRevisadoPor === true && perfil.aceitaNovos === true, 'perfil do mentor volta como salvo');

  // ---- diretório e pedido (mentorado de outra clínica)
  const dir = (await aluno.req('GET', '/api/mentores?busca=felinos')).dados;
  const noDir = dir.find((x) => x.mentorId === mentor.id);
  ok(!!noDir && noDir.instituicao === 'Universidade Teste' && noDir.minha === null && !('email' in noDir), 'diretório encontra o mentor pela área (sem mostrar o e-mail)');
  ok(!(await mentor.req('GET', '/api/mentores')).dados.some((x) => x.mentorId === mentor.id), 'o mentor não aparece para si mesmo');
  ok((await mentor.req('POST', '/api/mentorias', { mentorId: mentor.id })).status === 400, 'não dá para pedir mentoria a si mesmo');
  const pedido = await aluno.req('POST', '/api/mentorias', { mentorId: mentor.id, mensagem: 'Sou iniciante em abdominal' });
  ok(pedido.status === 201 && pedido.dados.situacao === 'pedida', 'mentorado pede mentoria');
  ok((await aluno.req('POST', '/api/mentorias', { mentorId: mentor.id })).status === 409, 'pedido duplicado: 409');
  const avMentor = (await mentor.req('GET', '/api/notificacoes')).dados;
  ok(avMentor.itens.some((x) => x.tipo === 'mentoria_pedida' && x.texto.includes('Sou iniciante')), 'mentor recebe aviso do pedido com a mensagem');
  const mm = (await mentor.req('GET', '/api/mentorias')).dados;
  ok(mm.souMentor && mm.comoMentor.some((x) => x.id === pedido.dados.id && x.situacao === 'pedida' && x.clinicas.length === 1), 'pedido aparece para o mentor com a clínica do mentorado');
  ok((await aluno.req('POST', `/api/mentorias/${pedido.dados.id}/aceitar`, {})).status === 404, 'mentorado não aceita o próprio pedido');
  ok((await mentor.req('POST', `/api/mentorias/${pedido.dados.id}/aceitar`, { resposta: 'Bem-vindo!' })).status === 204, 'mentor aceita');
  ok((await mentor.req('POST', `/api/mentorias/${pedido.dados.id}/recusar`, {})).status === 409, 'pedido já respondido não muda');
  const avAluno = (await aluno.req('GET', '/api/notificacoes')).dados;
  ok(avAluno.itens.some((x) => x.tipo === 'mentoria_aceita' && x.texto.includes('Bem-vindo')), 'mentorado recebe aviso do aceite com a resposta');
  ok((await aluno.req('GET', '/api/mentores')).dados.find((x) => x.mentorId === mentor.id).minha.situacao === 'aceita', 'diretório mostra que já é o mentor');
  ok((await semCrmv.req('GET', '/api/notificacoes')).dados.itens.every((x) => x.tipo !== 'mentoria_aceita'), 'avisos são só do próprio usuário');

  // ---- encerrar, cancelar, recusar
  ok((await semCrmv.req('POST', `/api/mentorias/${pedido.dados.id}/encerrar`)).status === 404, 'outra pessoa não encerra a mentoria');
  ok((await aluno.req('POST', `/api/mentorias/${pedido.dados.id}/encerrar`)).status === 204, 'mentorado encerra a mentoria');
  ok((await mentor.req('GET', '/api/notificacoes')).dados.itens.some((x) => x.tipo === 'mentoria_encerrada'), 'mentor é avisado do encerramento');
  const p2 = await aluno.req('POST', '/api/mentorias', { mentorId: mentor.id });
  ok(p2.status === 201 && (await aluno.req('POST', `/api/mentorias/${p2.dados.id}/cancelar`)).status === 204, 'mentorado pede de novo e cancela');
  const p3 = await semCrmv.req('POST', '/api/mentorias', { mentorId: mentor.id });
  ok(p3.status === 201 && (await mentor.req('POST', `/api/mentorias/${p3.dados.id}/recusar`, { resposta: 'Agenda cheia' })).status === 204, 'mentor recusa outro pedido');
  ok((await semCrmv.req('GET', '/api/mentorias')).dados.comoMentorado[0].situacao === 'recusada', 'recusa aparece para quem pediu');

  // ---- não aceita novos
  await mentor.req('PUT', '/api/mentoria/perfil', { areas: 'Abdominal', aceitaNovos: false });
  ok((await semCrmv.req('POST', '/api/mentorias', { mentorId: mentor.id })).status === 400, 'mentor que não aceita novos recusa pedidos automaticamente');
  await mentor.req('PUT', '/api/mentoria/perfil', { areas: 'Abdominal', aceitaNovos: true });

  // ---- administrador tira o mentor: mentorias abertas terminam com aviso
  const p4 = await aluno.req('POST', '/api/mentorias', { mentorId: mentor.id });
  await mentor.req('POST', `/api/mentorias/${p4.dados.id}/aceitar`, {});
  ok((await adm.req('DELETE', `/api/admin/mentores/${mentor.id}`)).status === 204, 'administrador tira o mentor');
  const depois = (await aluno.req('GET', '/api/mentorias')).dados.comoMentorado.find((x) => x.id === p4.dados.id);
  ok(depois.situacao === 'encerrada' && depois.encerradaPor === 'administrador do sistema', 'mentoria aberta é encerrada');
  ok(!(await aluno.req('GET', '/api/mentores')).dados.some((x) => x.mentorId === mentor.id), 'ex-mentor sai do diretório');
  ok((await mentor.req('GET', '/api/mentoria/perfil')).dados.mentor === false, 'ex-mentor perde o perfil de mentor');
  ok((await adm.req('GET', `/api/admin/mentores/candidatos?busca=${encodeURIComponent(mentor.email)}`)).dados.length === 1, 'ex-mentor volta a aparecer como candidato');

  // ---- sino: marcar como lido
  const lista = (await aluno.req('GET', '/api/notificacoes')).dados;
  ok((await aluno.req('POST', `/api/notificacoes/${lista.itens[0].id}/lida`)).status === 204
    && (await aluno.req('GET', '/api/notificacoes')).dados.naoLidas === lista.naoLidas - 1, 'marca um aviso como lido');
  ok((await aluno.req('POST', '/api/notificacoes/lidas')).status === 204 && (await aluno.req('GET', '/api/notificacoes')).dados.naoLidas === 0, 'marca todos como lidos');
  ok((await mentor.req('POST', `/api/notificacoes/${lista.itens[1].id}/lida`)).status === 204, 'marcar aviso de outro usuário não dá erro (e não muda nada)');

  // ---- registros de atividade do sistema
  const regs = (await adm.req('GET', '/api/admin/registros?tipo=mentoria_pedida')).dados;
  ok(regs.registros.some((x) => x.descricao.includes('pediu mentoria')) && !!regs.tipos.mentor_definido, 'pedidos de mentoria ficam no registro de atividades');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });

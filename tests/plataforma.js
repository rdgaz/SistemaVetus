'use strict';
/**
 * Teste da plataforma (API .NET): login, clínicas, usuários, vínculos e acesso por clínica.
 *
 * Uso: node tests/plataforma.js
 * Variáveis: PLATAFORMA_URL (http://127.0.0.1:5080), VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA
 * Cria clínicas e usuários de teste com e-mails únicos (pode rodar várias vezes no mesmo banco).
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FALHA'} ${msg}`); if (!cond) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente HTTP com cookie de sessão (como um navegador). */
class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; }
  async req(metodo, caminho, corpo) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par;
    }
    const texto = await r.text();
    let dados; try { dados = texto ? JSON.parse(texto) : undefined; } catch { dados = texto; }
    return { status: r.status, dados };
  }
  /** Login. O sistema limita 10 tentativas por minuto por IP: se barrar (429), espera e tenta de novo. */
  async entrar(email, senha) {
    for (let i = 0; ; i++) {
      const r = await this.req('POST', '/api/auth/entrar', { email, senha });
      if (r.status !== 429 || i >= 2) return r;
      console.log('  ...limite de logins por minuto atingido; aguardando 60 s');
      await sleep(60000);
    }
  }
}

(async () => {
  console.log(`Plataforma ${URL_BASE}`);
  let saude = null;
  for (let i = 0; i < 60 && !saude; i++) {
    try { const r = await fetch(`${URL_BASE}/saude`); if (r.ok) saude = await r.json(); } catch { /* subindo */ }
    if (!saude) await sleep(1000);
  }
  ok(saude && saude.ok, 'plataforma no ar (/saude)');
  if (!saude) process.exit(1);

  const pagina = await fetch(`${URL_BASE}/usuarios`);
  ok(pagina.ok && (await pagina.text()).includes('<div id="root">'), 'telas servidas (rota do React)');

  const anon = new Navegador();
  ok((await anon.req('GET', '/api/auth/eu')).status === 401, 'sem login: 401');
  ok((await anon.entrar(ADMIN_EMAIL, 'senha-errada')).status === 401, 'senha errada: 401');
  ok((await anon.req('POST', '/api/ingestao/exames', {})).status === 503, 'ingestão desativada: 503');

  // administrador do sistema
  const adm = new Navegador();
  const login = await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA);
  ok(login.status === 200 && login.dados.administradorSistema, 'administrador do sistema entra');

  const n = Date.now();
  const emailA = `adm.a.${n}@teste.local`;
  const emailB = `adm.b.${n}@teste.local`;
  const criarA = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica A ${n}`, administrador: { nome: 'Ana', email: emailA } });
  ok(criarA.status === 201 && /^VETUS_C\d{4}$/.test(criarA.dados.aeTitle), `cria clínica A com AE Title (${criarA.dados.aeTitle})`);
  ok(!!criarA.dados.administrador.senhaProvisoria && criarA.dados.tokenIngestao.length === 64, 'senha provisória e token de ingestão gerados');
  const criarB = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica B ${n}`, administrador: { nome: 'Bruno', email: emailB } });
  ok(criarB.status === 201 && criarB.dados.aeTitle !== criarA.dados.aeTitle, `cria clínica B com outro AE Title (${criarB.dados.aeTitle})`);
  const idA = criarA.dados.id, idB = criarB.dados.id;

  // administrador da clínica A: primeiro acesso troca a senha
  const a = new Navegador();
  const la = await a.entrar(emailA, criarA.dados.administrador.senhaProvisoria);
  ok(la.status === 200 && la.dados.trocarSenha === true, 'primeiro acesso exige trocar a senha');
  ok((await a.req('PUT', '/api/auth/senha', { senhaAtual: criarA.dados.administrador.senhaProvisoria, novaSenha: 'curta' })).status === 400, 'senha curta recusada');
  const novaSenhaA = `SenhaA-${n}`;
  ok((await a.req('PUT', '/api/auth/senha', { senhaAtual: criarA.dados.administrador.senhaProvisoria, novaSenha: novaSenhaA })).status === 204, 'troca a senha');
  const eu = await a.req('GET', '/api/auth/eu');
  ok(eu.status === 200 && eu.dados.trocarSenha === false && eu.dados.clinicas.length === 1, 'sessão continua após trocar a senha');

  // acesso por clínica
  a.clinica = idA;
  const dadosA = await a.req('GET', '/api/clinica');
  ok(dadosA.status === 200 && dadosA.dados.meuPerfil === 'AdministradorClinica', 'vê a própria clínica');
  a.clinica = idB;
  ok((await a.req('GET', '/api/clinica')).status === 403, 'não acessa a clínica de outro');
  a.clinica = null;
  ok((await a.req('GET', '/api/clinica')).status === 400, 'sem clínica escolhida: 400');
  ok((await a.req('GET', '/api/admin/clinicas')).status === 403, 'administrador da clínica não acessa a administração do sistema');
  a.clinica = idA;

  ok((await a.req('PUT', '/api/clinica', { nome: `Clínica A ${n}`, gerarAutomaticamente: false })).status === 204, 'muda para pré-laudo manual');
  ok((await a.req('GET', '/api/clinica')).dados.gerarAutomaticamente === false, 'configuração salva');

  // usuários da clínica A
  const vet = await a.req('POST', '/api/clinica/usuarios', { nome: 'Vera', email: `vet.${n}@teste.local`, perfil: 'Veterinario', crmv: '12345', crmvUf: 'sp' });
  ok(vet.status === 201 && vet.dados.contaNova && !!vet.dados.senhaProvisoria, 'cria veterinário com senha provisória');
  ok((await a.req('POST', '/api/clinica/usuarios', { nome: 'Vera', email: `vet.${n}@teste.local` })).status === 409, 'mesmo e-mail duas vezes: 409');
  const volante = await a.req('POST', '/api/clinica/usuarios', { email: emailB, perfil: 'Veterinario' });
  ok(volante.status === 201 && volante.dados.contaNova === false && volante.dados.senhaProvisoria === null, 'vincula conta existente (volante) sem nova senha');

  const usuarios = await a.req('GET', '/api/clinica/usuarios');
  ok(usuarios.status === 200 && usuarios.dados.length === 3, `lista 3 usuários da clínica A (${usuarios.dados.length})`);
  const meuId = eu.dados.id;
  ok((await a.req('PUT', `/api/clinica/usuarios/${meuId}`, { ativo: false })).status === 400, 'não remove o único administrador');

  // veterinário não administra
  const v = new Navegador();
  await v.entrar(`vet.${n}@teste.local`, vet.dados.senhaProvisoria);
  v.clinica = idA;
  ok((await v.req('GET', '/api/clinica')).status === 200, 'veterinário vê a clínica');
  ok((await v.req('GET', '/api/clinica/usuarios')).status === 403, 'veterinário não gerencia usuários');

  // o volante enxerga as duas clínicas
  const b = new Navegador();
  const lb = await b.entrar(emailB, criarB.dados.administrador.senhaProvisoria);
  ok(lb.status === 200 && lb.dados.clinicas.length === 2, 'volante tem acesso a 2 clínicas');

  // desativar usuário derruba a sessão
  const idVet = vet.dados.usuarioId;
  ok((await a.req('PUT', `/api/clinica/usuarios/${idVet}`, { ativo: false })).status === 204, 'desativa o veterinário');
  ok((await v.req('GET', '/api/clinica')).status === 403, 'veterinário desativado perde o acesso à clínica');

  // bloquear a clínica B
  ok((await adm.req('PUT', `/api/admin/clinicas/${idB}`, { nome: `Clínica B ${n}`, ativa: false })).status === 204, 'administrador do sistema bloqueia a clínica B');
  b.clinica = idB;
  ok((await b.req('GET', '/api/clinica')).status === 403, 'clínica bloqueada: sem acesso');
  ok((await b.req('GET', '/api/auth/eu')).dados.clinicas.length === 1, 'clínica bloqueada some da lista do usuário');

  ok((await a.req('POST', '/api/auth/sair')).status === 204 && (await a.req('GET', '/api/auth/eu')).status === 401, 'sair encerra a sessão');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

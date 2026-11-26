'use strict';
/**
 * Testes de segurança do acesso ao sistema (rodar POR ÚLTIMO: o teste de força bruta esgota o limite de logins do minuto).
 * Cabeçalhos de segurança, rotas protegidas sem login, cookie de sessão, sessão antiga depois da troca de senha,
 * clínica alheia pelo cabeçalho, caminho de arquivo malicioso (../), escalada de perfil, erro sem detalhes internos
 * e bloqueio de força bruta no login.
 * Uso: node tests/seguranca.js   (variáveis: PLATAFORMA_URL, VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA)
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  OK  ' : ' FALHA'} ${m}`); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; this.setCookie = []; }
  async req(metodo, caminho, corpo, tipoBruto) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = tipoBruto || 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const body = corpo === undefined ? undefined : tipoBruto ? corpo : JSON.stringify(corpo);
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body, redirect: 'manual' });
    this.setCookie = r.headers.getSetCookie();
    for (const c of this.setCookie) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const texto = await r.text();
    let dados = null;
    try { dados = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, headers: r.headers, texto, dados };
  }
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
  const n = Date.now();
  const anon = new Navegador();

  // ---- cabeçalhos de segurança
  const pagina = await anon.req('GET', '/');
  const h = pagina.headers;
  ok(pagina.status === 200 && /default-src 'self'/.test(h.get('content-security-policy') ?? '') && /frame-ancestors 'self'/.test(h.get('content-security-policy') ?? ''),
    'página: política de conteúdo (CSP) só do próprio sistema');
  ok(h.get('x-frame-options') === 'SAMEORIGIN', 'página: não abre dentro de outro site (X-Frame-Options)');
  ok(h.get('x-content-type-options') === 'nosniff', 'página: nosniff');
  ok(!!h.get('referrer-policy') && /microphone=\(self\)/.test(h.get('permissions-policy') ?? ''), 'página: Referrer-Policy e Permissions-Policy');
  ok(!h.get('server') && !h.get('x-powered-by'), 'não anuncia o servidor web');
  const api = await anon.req('GET', '/api/auth/eu');
  ok(api.headers.get('x-content-type-options') === 'nosniff' && api.headers.get('x-frame-options') === 'SAMEORIGIN', 'API: nosniff e X-Frame-Options');

  // ---- rotas protegidas sem login
  const protegidas = ['/api/auth/eu', '/api/exames', '/api/clinica', '/api/clinica/usuarios', '/api/clinica/registros', '/api/admin/clinicas',
    '/api/admin/registros', '/api/admin/mentores', '/api/mentorias', '/api/mentores', '/api/revisoes-mentor', '/api/notificacoes', '/api/mentoria/perfil'];
  const abertas = [];
  for (const p of protegidas) if ((await anon.req('GET', p)).status !== 401) abertas.push(p);
  ok(abertas.length === 0, `sem login, nenhuma rota protegida responde (${abertas.join(', ') || 'todas 401'})`);
  ok((await anon.req('GET', '/api/rota-que-nao-existe')).status === 404, 'rota inexistente: 404 (sem cair na tela)');

  // ---- erro sem detalhes internos
  const malformado = await anon.req('POST', '/api/auth/entrar', '{"email":', 'application/json');
  ok(malformado.status === 400 && !/Exception|at Vetus\.|\.cs:line|StackTrace/i.test(malformado.texto), 'JSON quebrado: 400 sem detalhes internos');

  // ---- login, cookie e clínicas
  const adm = new Navegador();
  const login = await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA);
  const cookie = adm.setCookie.find((c) => c.startsWith('vetus=')) ?? '';
  ok(login.status === 200 && /httponly/i.test(cookie) && /samesite=lax/i.test(cookie), 'cookie de sessão HttpOnly e SameSite=Lax');
  ok(!/"(senha|senhaHash|hash|password)"/i.test(JSON.stringify(login.dados)) && !/smtpSenha/i.test(JSON.stringify(login.dados)), 'login não devolve senha nem hash');

  async function clinica(nome) {
    const email = `adm.seg${nome}.${n}@teste.local`;
    const c = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica Seg ${nome} ${n}`, administrador: { nome: `Adm ${nome}`, email } });
    const nav = new Navegador();
    const prov = c.dados.administrador.senhaProvisoria;
    await nav.entrar(email, prov);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${n}` });
    nav.clinica = c.dados.id;
    nav.email = email;
    return nav;
  }
  const A = await clinica('A');
  const B = await clinica('B');

  // ---- clínica alheia pelo cabeçalho X-Clinica-Id
  const intruso = new Navegador();
  intruso.cookie = B.cookie;
  intruso.clinica = A.clinica;
  ok((await intruso.req('GET', '/api/exames')).status === 403, 'trocar o cabeçalho para outra clínica: 403');
  ok((await intruso.req('GET', '/api/clinica/usuarios')).status === 403, 'não lista usuários de outra clínica');

  // ---- escalada de perfil
  await A.req('PUT', '/api/auth/eu', { nome: 'Adm A', administradorSistema: true });
  ok((await A.req('GET', '/api/auth/eu')).dados.administradorSistema === false, 'não vira administrador do sistema pelos próprios dados');
  ok((await A.req('GET', '/api/admin/clinicas')).status === 403, 'continua sem acesso à administração do sistema');
  const usr = await A.req('POST', '/api/clinica/usuarios', { nome: 'Recepção', email: `rec.seg.${n}@teste.local`, perfil: 'Usuario' });
  const rec = new Navegador();
  await rec.entrar(`rec.seg.${n}@teste.local`, usr.dados.senhaProvisoria);
  await rec.req('PUT', '/api/auth/senha', { senhaAtual: usr.dados.senhaProvisoria, novaSenha: `Senha-${n}` });
  rec.clinica = A.clinica;
  ok((await rec.req('POST', '/api/clinica/usuarios', { nome: 'X', email: `x.seg.${n}@teste.local`, perfil: 'AdministradorClinica' })).status === 403,
    'perfil Usuário não cria administrador');

  // ---- caminho de arquivo malicioso (../)
  const idAnimal = '20261126-090000-5E61';
  const sub = 'ABD20261126090000';
  ok((await A.req('PUT', `/api/exames/pendrive/${idAnimal}/${sub}/arquivos/FOTO.JPG`, JPG, 'image/jpeg')).status === 200, 'envia uma foto');
  const maliciosos = ['..%2F..%2F..%2Fetc%2Fpasswd', '..%5C..%5Cappsettings.json', '%2E%2E%2F%2E%2E%2Fmedidas.json'];
  const aceitos = [];
  for (const m of maliciosos) {
    const r = await A.req('PUT', `/api/exames/pendrive/${idAnimal}/${sub}/arquivos/${m}.jpg`, JPG, 'image/jpeg');
    if (r.status < 400) aceitos.push(m);
  }
  ok(aceitos.length === 0, `envio com caminho "../" recusado (${aceitos.join(', ') || 'todos recusados'})`);
  const exame = await A.req('POST', `/api/exames/pendrive/${idAnimal}/${sub}/concluir`, { nome: 'Seguro' });
  const exameId = exame.dados.id;
  const lidos = [];
  for (const caminho of [`jpg/..%2F..%2F..%2Fetc%2Fpasswd`, `jpg/..%5C..%5Cappsettings.json`, `..%2Fjpg/FOTO.JPG`, `json/medidas.json`, `jpg/%2E%2E%2Fpdf%2Fx.pdf`]) {
    const r = await A.req('GET', `/api/exames/${exameId}/arquivos/${caminho}`);
    if (r.status === 200) lidos.push(caminho);
  }
  ok(lidos.length === 0, `leitura de arquivo com "../" ou pasta não permitida bloqueada (${lidos.join(', ') || 'todas bloqueadas'})`);
  ok((await A.req('GET', `/api/exames/${exameId}/arquivos/jpg/FOTO.JPG`)).status === 200, 'a foto certa continua abrindo');
  ok((await B.req('GET', `/api/exames/${exameId}/arquivos/jpg/FOTO.JPG`)).status === 404, 'outra clínica não abre a foto pelo endereço direto');

  // ---- sessão antiga depois da troca de senha
  const outroAparelho = new Navegador();
  await outroAparelho.entrar(A.email, `Senha-${n}`);
  outroAparelho.clinica = A.clinica;
  ok((await outroAparelho.req('GET', '/api/auth/eu')).status === 200, 'sessão aberta em outro aparelho');
  ok((await A.req('PUT', '/api/auth/senha', { senhaAtual: `Senha-${n}`, novaSenha: `Senha2-${n}` })).status === 204, 'troca a senha');
  ok((await outroAparelho.req('GET', '/api/auth/eu')).status === 401, 'a sessão do outro aparelho cai depois da troca de senha');
  ok((await A.req('GET', '/api/auth/eu')).status === 200, 'a sessão de quem trocou continua');
  ok((await new Navegador().entrar(A.email, `Senha-${n}`)).status === 401, 'senha antiga não entra mais');

  // ---- força bruta (por último: esgota o limite de logins deste minuto)
  const atacante = new Navegador();
  const respostas = [];
  for (let i = 0; i < 12; i++) respostas.push((await atacante.req('POST', '/api/auth/entrar', { email: `ninguem.${n}@teste.local`, senha: `chute-${i}` })).status);
  ok(respostas.includes(429) && respostas.every((s) => s === 401 || s === 429), `força bruta no login é barrada (${respostas.join(' ')})`);
  ok((await atacante.req('POST', '/api/auth/entrar', { email: ADMIN_EMAIL, senha: ADMIN_SENHA })).status === 429, 'barrado vale até para a senha certa (no mesmo minuto)');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });

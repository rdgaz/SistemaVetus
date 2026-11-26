'use strict';
/**
 * Teste da API de ingestão (contrato docs/API-INGESTAO.md): pareamento do app, envio retomável por token, conferência do
 * SHA-1, junção com o pendrive, isolamento entre clínicas, revogação e o token de serviço do receptor DICOM (X-AE-Chamado).
 * Uso: node tests/ingestao.js   (variáveis: PLATAFORMA_URL, VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA)
 */
const crypto = require('crypto');
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  OK  ' : ' FALHA'} ${m}`); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const foto = (n) => Buffer.concat([JPG, Buffer.from([n & 255, n >> 8])]);
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

/** Navegador (cookie de sessão) ou app (token Bearer). */
class Cliente {
  constructor() { this.cookie = ''; this.clinica = null; this.token = null; this.ae = null; }
  async req(metodo, caminho, corpo, extra = {}) {
    const headers = { ...extra };
    const bruto = Buffer.isBuffer(corpo);
    if (corpo !== undefined) headers['content-type'] = bruto ? 'application/octet-stream' : 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (this.ae) headers['x-ae-chamado'] = this.ae;
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const t = await r.text();
    let dados = null;
    try { dados = JSON.parse(t); } catch { /* sem corpo JSON */ }
    return { status: r.status, dados };
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
  const adm = new Cliente();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');

  async function clinica(nome) {
    const email = `adm.ing${nome}.${n}@teste.local`;
    const c = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica Ingestão ${nome} ${n}`, administrador: { nome: `Adm ${nome}`, email } });
    const nav = new Cliente();
    const prov = c.dados.administrador.senhaProvisoria;
    await nav.entrar(email, prov);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${n}` });
    nav.clinica = c.dados.id;
    nav.ae = null;
    nav.aeTitle = (await nav.req('GET', '/api/clinica')).dados.aeTitle;
    return nav;
  }
  const A = await clinica('A');
  const B = await clinica('B');
  const vet = await A.req('POST', '/api/clinica/usuarios', { nome: 'Dra. Vet', email: `vet.ing.${n}@teste.local`, perfil: 'Veterinario', crmv: '1', crmvUf: 'sp' });
  const V = new Cliente();
  await V.entrar(`vet.ing.${n}@teste.local`, vet.dados.senhaProvisoria);
  await V.req('PUT', '/api/auth/senha', { senhaAtual: vet.dados.senhaProvisoria, novaSenha: `Senha-${n}` });
  V.clinica = A.clinica;

  // ---- sem token
  const anon = new Cliente();
  ok((await anon.req('GET', '/api/ingestao/v1/eu')).status === 401, 'sem token: 401');
  ok((await anon.req('POST', '/api/ingestao/v1/exames/verificar', { exames: [] })).status === 401, 'verificar sem token: 401');
  anon.token = 'x'.repeat(64);
  ok((await anon.req('GET', '/api/ingestao/v1/eu')).status === 401, 'token inventado: 401');

  // ---- pareamento
  ok((await V.req('POST', '/api/clinica/dispositivos/pareamento', { nome: 'X', tipo: 'windows' })).status === 403, 'veterinário não pareia apps (só o administrador)');
  ok((await A.req('POST', '/api/clinica/dispositivos/pareamento', { nome: '', tipo: 'windows' })).status === 400, 'pareamento sem nome: recusado');
  const cod = await A.req('POST', '/api/clinica/dispositivos/pareamento', { nome: 'Notebook da Dra. Ana', tipo: 'windows' });
  ok(cod.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cod.dados.codigo), 'administrador gera o código de pareamento (XXXX-XXXX)');
  ok((await A.req('GET', '/api/clinica/dispositivos')).dados.pendentes.some((p) => p.nomeDispositivo === 'Notebook da Dra. Ana'), 'código aparece como aguardando pareamento');
  const app = new Cliente();
  ok((await app.req('POST', '/api/ingestao/v1/parear', { codigo: 'AAAA-BBBB' })).status === 401, 'código errado: 401');
  const par = await app.req('POST', '/api/ingestao/v1/parear', { codigo: cod.dados.codigo.toLowerCase().replace('-', ' '), versaoApp: '1.0.0' });
  ok(par.status === 200 && par.dados.token.length === 64 && par.dados.clinica.id === A.clinica, 'app pareia com o código (maiúsculas/minúsculas e separador tanto faz)');
  ok((await new Cliente().req('POST', '/api/ingestao/v1/parear', { codigo: cod.dados.codigo })).status === 401, 'código só vale uma vez');
  app.token = par.dados.token;
  const eu = await app.req('GET', '/api/ingestao/v1/eu', undefined, { 'x-versao-app': '1.0.0' });
  ok(eu.status === 200 && eu.dados.clinica.id === A.clinica && eu.dados.dispositivo.nome === 'Notebook da Dra. Ana', 'o token identifica o app e a clínica');

  // ---- envio retomável
  const idAnimal = '20261126-160000-1A2B';
  const sub = 'ABD20261126160000';
  const base = `/api/ingestao/v1/exames/${idAnimal}/${sub}`;
  const v0 = (await app.req('POST', '/api/ingestao/v1/exames/verificar', { exames: [{ idAnimal, subpasta: sub }, { idAnimal: 'x', subpasta: 'y' }] })).dados;
  ok(v0[0].recebidos.length === 0 && v0[0].exame === null && typeof v0[1].erro === 'string', 'verificar: nada recebido; identificação inválida apontada');
  ok((await app.req('PUT', `${base}/arquivos/F1.JPG`, foto(1), { 'x-sha1': sha1(foto(99)) })).status === 400, 'SHA-1 que não confere: recusado (o arquivo não fica)');
  ok((await app.req('PUT', `${base}/arquivos/F1.JPG`, foto(1), { 'x-sha1': sha1(foto(1)) })).status === 200, 'envia a 1ª foto com SHA-1 conferido');
  ok((await app.req('PUT', `${base}/arquivos/F2.JPG`, foto(2))).status === 200, 'envia a 2ª foto (SHA-1 é opcional)');
  ok((await app.req('PUT', `${base}/arquivos/F1.JPG`, foto(1))).status === 200, 'reenviar o mesmo arquivo não dá erro (idempotente)');
  ok((await app.req('PUT', `${base}/arquivos/..%2F..%2Fx.jpg`, foto(3))).status === 400, 'nome com "../": recusado');
  ok((await app.req('PUT', `${base}/arquivos/programa.exe`, foto(3))).status === 400, 'extensão não aceita: recusada');
  const v1 = (await app.req('POST', '/api/ingestao/v1/exames/verificar', { exames: [{ idAnimal, subpasta: sub }] })).dados;
  ok(v1[0].recebidos.length === 2, 'verificar lista os 2 arquivos já recebidos (para retomar)');
  ok((await app.req('GET', base)).status === 404, 'situação antes de concluir: ainda não recebido');
  const c1 = await app.req('POST', `${base}/concluir`, { nome: 'Bolt' });
  ok(c1.status === 200 && c1.dados.novo === true && c1.dados.fotos === 2 && c1.dados.exame.origem === 'app' && c1.dados.paciente === 'Bolt', 'concluir cria o exame na clínica do token');
  const exameId = c1.dados.exame.id;
  const c2 = await app.req('POST', `${base}/concluir`, { nome: 'Bolt' });
  ok(c2.status === 200 && c2.dados.novo === false && c2.dados.exame.id === exameId, 'concluir de novo atualiza o mesmo exame (sem duplicar)');
  const sit = await app.req('GET', base);
  ok(sit.status === 200 && sit.dados.id === exameId && sit.dados.assinado === false, 'situação do exame na nuvem');

  // ---- o exame é da clínica A, e só dela
  ok((await A.req('GET', `/api/exames/${exameId}`)).status === 200, 'a clínica do app vê o exame');
  ok((await B.req('GET', `/api/exames/${exameId}`)).status === 404, 'outra clínica não vê o exame');
  const regs = (await A.req('GET', '/api/clinica/registros?tipo=exame_enviado_app')).dados.registros;
  ok(regs.some((x) => x.exameId === exameId && x.usuarioNome === 'Notebook da Dra. Ana' && x.perfil === 'App'), 'o envio fica no registro de atividades, com o nome do app');

  // ---- mesmo exame pelo pendrive: junta
  await A.req('PUT', `/api/exames/pendrive/${idAnimal}/${sub}/arquivos/F3.JPG`, foto(3), {});
  const pen = await A.req('POST', `/api/exames/pendrive/${idAnimal}/${sub}/concluir`, { nome: 'Bolt' });
  ok(pen.status === 200 && pen.dados.id === exameId && pen.dados.novo === false && pen.dados.fotos === 3, 'o mesmo exame pelo pendrive junta com o do app');

  // ---- gerenciamento e isolamento
  const listaA = (await A.req('GET', '/api/clinica/dispositivos')).dados.dispositivos;
  const dispA = listaA.find((d) => d.nome === 'Notebook da Dra. Ana');
  ok(!!dispA && dispA.versaoApp === '1.0.0' && !!dispA.ultimoUsoEm, 'a clínica vê o app, a versão e o último uso');
  ok((await B.req('GET', '/api/clinica/dispositivos')).dados.dispositivos.length === 0, 'outra clínica não vê os apps desta');
  ok((await B.req('DELETE', `/api/clinica/dispositivos/${dispA.id}`)).status === 404, 'outra clínica não revoga o app desta');
  ok((await A.req('DELETE', `/api/clinica/dispositivos/${dispA.id}`)).status === 204, 'administrador revoga o app');
  ok((await app.req('GET', '/api/ingestao/v1/eu')).status === 401, 'app revogado não envia mais (401)');

  // ---- receptor DICOM da nuvem (token de serviço do sistema + X-AE-Chamado)
  ok((await A.req('GET', '/api/admin/receptores')).status === 403, 'clínica não cria token de receptor');
  const rec = await adm.req('POST', '/api/admin/receptores', { nome: `Receptor teste ${n}` });
  ok(rec.status === 200 && rec.dados.token.length === 64, 'administrador do sistema cria o token do receptor');
  const receptor = new Cliente();
  receptor.token = rec.dados.token;
  ok((await receptor.req('GET', '/api/ingestao/v1/eu')).status === 400, 'receptor sem X-AE-Chamado: 400');
  receptor.ae = 'NAO_EXISTE_AE';
  ok((await receptor.req('GET', '/api/ingestao/v1/eu')).status === 404, 'AE Title desconhecido: 404');
  receptor.ae = B.aeTitle;
  const euRec = await receptor.req('GET', '/api/ingestao/v1/eu');
  ok(euRec.status === 200 && euRec.dados.clinica.id === B.clinica, 'receptor entrega na clínica dona do AE chamado');
  const subR = 'ABD20261126161000';
  await receptor.req('PUT', `/api/ingestao/v1/exames/${idAnimal}/${subR}/arquivos/R1.JPG`, foto(7));
  const cr = await receptor.req('POST', `/api/ingestao/v1/exames/${idAnimal}/${subR}/concluir`, { nome: 'Rex' });
  ok(cr.status === 200 && (await B.req('GET', `/api/exames/${cr.dados.exame.id}`)).status === 200 && (await A.req('GET', `/api/exames/${cr.dados.exame.id}`)).status === 404,
    'exame do receptor fica só na clínica do AE');
  const idRec = (await adm.req('GET', '/api/admin/receptores')).dados.find((r) => r.nome === `Receptor teste ${n}`).id;
  ok((await adm.req('DELETE', `/api/admin/receptores/${idRec}`)).status === 204 && (await receptor.req('GET', '/api/ingestao/v1/eu')).status === 401,
    'token do receptor revogado deixa de valer');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });

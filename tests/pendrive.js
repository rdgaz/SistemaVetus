'use strict';
/**
 * Teste do envio de exames pelo pendrive (arquivos exportados do ultrassom).
 * Gera uma pasta sintética no formato do aparelho (fotos JPG + relatório PDF), sem depender de pendrive real.
 *
 * Uso: node tests/pendrive.js
 * Variáveis: PLATAFORMA_URL (http://127.0.0.1:5080), VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FALHA'} ${msg}`); if (!cond) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; }
  async req(metodo, caminho, corpo, tipoBruto) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = tipoBruto || 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const body = corpo === undefined ? undefined : tipoBruto ? corpo : JSON.stringify(corpo);
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body });
    for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, tipo, dados };
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

async function novaClinica(adm, nome) {
  const email = `adm.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@teste.local`;
  const c = await adm.req('POST', '/api/admin/clinicas', { nome, administrador: { nome: `Adm ${nome}`, email } });
  const nav = new Navegador();
  const prov = c.dados.administrador.senhaProvisoria;
  await nav.entrar(email, prov);
  await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${Date.now()}` });
  nav.clinica = c.dados.id;
  return { id: c.dados.id, ae: c.dados.aeTitle, nav };
}

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const foto = (n) => Buffer.concat([JPG, Buffer.from([n & 255, n >> 8])]);

/** PDF de uma página com as linhas de texto, parecido com o relatório que o Mindray Vetus E7 grava. */
function pdfRelatorio(linhas) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
  let y = 800;
  const conteudo = linhas.map((l) => { y -= 14; return `BT /F1 10 Tf 1 0 0 1 40 ${y} Tm (${esc(l)}) Tj ET`; }).join('\n');
  const fluxo = Buffer.from(conteudo, 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  const partes = [Buffer.from('%PDF-1.4\n')];
  const pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => {
    pos.push(tam);
    const b = o === null
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${fluxo.length} >>\nstream\n`), fluxo, Buffer.from('\nendstream\nendobj\n')])
      : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    partes.push(b); tam += b.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`;
  partes.push(Buffer.from(xref));
  return Buffer.concat(partes);
}

const relatorio = (idAnimal, nome) => pdfRelatorio([
  'Assinat. (selo): Data marcada:', 'CLINICA TESTE', `Nome:${nome} Animal:Cach.(5-15kg) Animal`, 'Owner:MARCELA TESTE',
  `ID animal:${idAnimal}`, 'Idd:9Anos', 'Sexo:Masc Esterilização:Sim', 'Telephone:', 'Fax:', 'Endereço Web:',
  'Caninos (5-15kg)', 'Abdômen', 'Dt exame:21/11/2026', 'Equipamento usado:Mindray Vetus E7', 'Oper:',
  'Indicações clínicas e dados', 'Comentários clínicos:', 'SRD, 9 ANOS, 5KG,', 'Abdômen - 1/1 Page',
  'Medidas em 2D', 'Vesícula biliar', 'GB L: 3.70cm GB H: 2.90cm', 'Coment.:',
]);

(async () => {
  console.log(`Plataforma ${URL_BASE}`);
  const adm = new Navegador();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');
  const n = Date.now();
  const A = await novaClinica(adm, `Clínica Pendrive A ${n}`);
  const B = await novaClinica(adm, `Clínica Pendrive B ${n}`);

  const idAnimal = '20261121-103208-3E0C';
  const sub = 'ABD20261121103432';
  const base = `/api/exames/pendrive/${idAnimal}/${sub}`;
  const ARQ = (nome) => `${base}/arquivos/${encodeURIComponent(nome)}`;

  // verificação antes de enviar
  const v0 = await A.nav.req('POST', '/api/exames/pendrive/verificar', { exames: [{ idAnimal, subpasta: sub }, { idAnimal: 'x', subpasta: 'y' }] });
  ok(v0.status === 200 && v0.dados[0].exame === null && v0.dados[0].recebidos.length === 0, 'verificar: exame ainda não existe');
  ok(typeof v0.dados[1].erro === 'string', 'verificar: pasta inválida é apontada');

  // arquivos recusados
  ok((await A.nav.req('PUT', ARQ('programa.exe'), Buffer.from('x'), 'application/octet-stream')).status === 400, 'extensão não aceita: recusada');
  ok((await A.nav.req('PUT', `/api/exames/pendrive/xx/${sub}/arquivos/a.jpg`, foto(1), 'image/jpeg')).status === 400, 'ID do animal inválido: recusado');
  ok((await A.nav.req('PUT', ARQ('vazio.jpg'), Buffer.alloc(0), 'image/jpeg')).status === 400, 'arquivo vazio: recusado');
  ok((await A.nav.req('POST', `${base}/concluir`, { nome: 'X' })).status === 400, 'concluir sem arquivos: recusado');

  // envio das fotos e do relatório
  for (let i = 1; i <= 3; i++) {
    const r = await A.nav.req('PUT', ARQ(`2026112110343${i}000${i}ABD.JPG`), foto(i), 'image/jpeg');
    ok(r.status === 200, `envia foto ${i}`);
  }
  // relatório de OUTRO animal: recusado
  await A.nav.req('PUT', ARQ(`${sub}_Abdomen.PDF`), relatorio('20260101-000000-3E0C', 'OUTRO'), 'application/pdf');
  const errado = await A.nav.req('POST', `${base}/concluir`, { nome: 'X' });
  ok(errado.status === 400 && /outro animal/i.test(errado.dados.erro), 'relatório de outro animal: recusado');
  // o certo substitui
  ok((await A.nav.req('PUT', ARQ(`${sub}_Abdomen.PDF`), relatorio(idAnimal, 'TESTEPEN'), 'application/pdf')).status === 200, 'envia o relatório (substitui)');

  // retomar: o que já chegou aparece na verificação
  const v1 = await A.nav.req('POST', '/api/exames/pendrive/verificar', { exames: [{ idAnimal, subpasta: sub }] });
  ok(v1.dados[0].recebidos.length === 4, `verificar lista os 4 arquivos já recebidos (${v1.dados[0].recebidos.length})`);

  const c1 = await A.nav.req('POST', `${base}/concluir`, { nome: 'Sem uso' });
  ok(c1.status === 200 && c1.dados.novo === true && c1.dados.fotos === 3 && c1.dados.relatorioLido, 'conclui: exame criado, relatório lido');
  const exameId = c1.dados.id;

  const d = (await A.nav.req('GET', `/api/exames/${exameId}`)).dados;
  ok(d.paciente.nome === 'TESTEPEN' && d.paciente.especie === 'Canina' && d.paciente.sexo === 'M' && d.paciente.castrado === true,
    'paciente vem do PDF (nome, espécie, sexo, castrado)');
  ok(d.tutor?.nome === 'MARCELA TESTE', 'tutor vem do PDF');
  ok(d.idAnimal === idAnimal && d.origem === 'pendrive' && d.pendrive === true && d.fotosPendrive === true, 'ID do animal e origem gravados');
  ok(d.idade === '9 anos' && d.data === '20261121' && d.hora === '103432' && d.tipoExame === 'abdominal', 'idade, data, hora e tipo de exame');
  ok(d.informacoesAdicionais === 'SRD, 9 ANOS, 5KG,', 'comentários clínicos do aparelho viram "Informações adicionais"');
  ok(d.fotos.length === 3 && d.pdfs.length === 1, 'exame tem 3 fotos e o PDF');
  ok(Array.isArray(d.medidas) && d.medidas.length === 2 && d.medidas[0].nome === 'GB L' && d.medidas[0].valor === 3.7, 'medidas do PDF gravadas');
  const img = await A.nav.req('GET', d.fotos[0].url);
  ok(img.status === 200 && img.tipo.includes('image/jpeg'), 'foto do pendrive abre');
  const pdf = await A.nav.req('GET', d.pdfs[0].url);
  ok(pdf.status === 200 && pdf.tipo.includes('pdf'), 'PDF do pendrive abre');

  // reenvio: atualiza o mesmo exame, sem duplicar
  const c2 = await A.nav.req('POST', `${base}/concluir`, { nome: 'Sem uso' });
  ok(c2.status === 200 && c2.dados.novo === false && c2.dados.id === exameId, 'reenvio atualiza o mesmo exame');
  const lista = (await A.nav.req('GET', '/api/exames')).dados;
  ok(lista.exames.filter((e) => e.paciente === 'TESTEPEN').length === 1, 'sem exame duplicado na lista');
  ok(lista.exames[0].miniatura?.includes('/arquivos/jpg/'), 'miniatura na lista');

  // vídeo
  ok((await A.nav.req('PUT', ARQ('20261121103500.MP4'), Buffer.from('video-falso'), 'video/mp4')).status === 200, 'envia vídeo');
  await A.nav.req('POST', `${base}/concluir`, { nome: 'Sem uso' });
  const d2 = (await A.nav.req('GET', `/api/exames/${exameId}`)).dados;
  ok(d2.videos.length === 1 && d2.videos[0].url.includes('/arquivos/mp4/'), 'vídeo aparece no exame');
  const vid = await A.nav.req('GET', d2.videos[0].url);
  ok(vid.status === 200, 'vídeo abre');

  // exame sem relatório: usa o nome informado na tela
  const sub2 = 'ABD20261121120000', id2 = '20261121-115900-3E0C';
  await A.nav.req('PUT', `/api/exames/pendrive/${id2}/${sub2}/arquivos/a.JPG`, foto(9), 'image/jpeg');
  const c3 = await A.nav.req('POST', `/api/exames/pendrive/${id2}/${sub2}/concluir`, { nome: 'Rex' });
  ok(c3.status === 200 && c3.dados.paciente === 'Rex' && c3.dados.relatorioLido === false, 'sem PDF: usa o nome digitado');

  // isolamento entre clínicas
  ok((await B.nav.req('GET', `/api/exames/${exameId}`)).status === 404, 'outra clínica não vê o exame');
  ok((await B.nav.req('GET', d.fotos[0].url)).status === 404, 'outra clínica não abre a foto');
  ok((await B.nav.req('DELETE', `/api/exames/${exameId}`)).status === 404, 'outra clínica não exclui o exame');
  const vB = await B.nav.req('POST', '/api/exames/pendrive/verificar', { exames: [{ idAnimal, subpasta: sub }] });
  ok(vB.dados[0].exame === null && vB.dados[0].recebidos.length === 0, 'outra clínica não enxerga arquivos recebidos');
  ok((await new Navegador().req('POST', '/api/exames/pendrive/verificar', { exames: [] })).status === 401, 'sem login: 401');

  // exclusão completa do exame (banco + arquivos do pendrive)
  const usr = await A.nav.req('POST', '/api/clinica/usuarios', { nome: 'Recepção', email: `usr.${n}@teste.local`, perfil: 'Usuario' });
  const navUsr = new Navegador();
  await navUsr.entrar(`usr.${n}@teste.local`, usr.dados.senhaProvisoria);
  await navUsr.req('PUT', '/api/auth/senha', { senhaAtual: usr.dados.senhaProvisoria, novaSenha: `SenhaUsr-${n}` });
  navUsr.clinica = A.id;
  ok((await navUsr.req('DELETE', `/api/exames/${exameId}`)).status === 403, 'perfil Usuario não pode excluir exame');

  // a clínica gera o pré-laudo sozinha: com a fila cheia (outros testes antes), espera a IA terminar para poder excluir
  for (let i = 0; i < 60 && ['NaFila', 'Gerando'].includes((await A.nav.req('GET', `/api/exames/${exameId}`)).dados?.status); i++)
    await new Promise((f) => setTimeout(f, 500));
  const del = await A.nav.req('DELETE', `/api/exames/${exameId}`);
  ok(del.status === 204, `exclui o exame com sucesso (${del.status} ${JSON.stringify(del.dados).slice(0, 200)})`);
  ok((await A.nav.req('GET', `/api/exames/${exameId}`)).status === 404, 'exame excluído não existe mais');
  const vApos = await A.nav.req('POST', '/api/exames/pendrive/verificar', { exames: [{ idAnimal, subpasta: sub }] });
  ok(vApos.dados[0].exame === null && vApos.dados[0].recebidos.length === 0, 'exclusão apaga também os arquivos do pendrive (pronto para reenviar do zero)');

  // o caso que importa: depois de excluir, enviar de novo SÓ uma foto diferente não pode trazer as fotos de antes
  ok((await A.nav.req('PUT', ARQ('999999999999EDITADA.JPG'), foto(77), 'image/jpeg')).status === 200, 'reenvia só uma foto editada (nome diferente)');
  const c4 = await A.nav.req('POST', `${base}/concluir`, { nome: 'Reenvio' });
  ok(c4.status === 200 && c4.dados.novo === true && c4.dados.fotos === 1, `exame refeito tem só a foto nova, sem restos das antigas (${c4.dados.fotos} foto)`);
  const d4 = (await A.nav.req('GET', `/api/exames/${c4.dados.id}`)).dados;
  ok(d4.fotos.length === 1 && d4.fotos[0].nome === '999999999999EDITADA.JPG', 'tela do exame lista só a foto nova');
  ok((await A.nav.req('DELETE', `/api/exames/${c4.dados.id}`)).status === 204, 'exclui o exame refeito (limpeza do teste)');

  // registro de atividades: quem fez o quê e quando (exclusão é um dos tipos); a clínica vê os seus, o sistema vê todos
  const regs = await A.nav.req('GET', '/api/clinica/registros');
  const excl = regs.status === 200 && regs.dados.registros.find((x) => x.tipo === 'exame_excluido' && x.exameId === exameId);
  ok(excl && excl.paciente === 'TESTEPEN' && excl.usuarioNome.startsWith('Adm ') && excl.usuarioEmail.includes('@')
    && excl.perfil === 'AdministradorClinica' && JSON.parse(excl.detalhes).totalFotos >= 1 && !!excl.em, 'exclusão registrada com o usuário, o paciente e a data');
  ok(regs.dados.registros.some((x) => x.tipo === 'exame_excluido' && x.exameId === c4.dados.id), 'a segunda exclusão também foi registrada');
  ok(regs.dados.registros.some((x) => x.tipo === 'exame_enviado_pendrive' && x.exameId === exameId), 'envio pelo pendrive registrado');
  ok(!!regs.dados.tipos.laudo_assinado && !!regs.dados.tipos.exame_excluido, 'tipos de registro disponíveis para o filtro');
  const soExcl = (await A.nav.req('GET', '/api/clinica/registros?tipo=exame_excluido')).dados.registros;
  ok(soExcl.length >= 2 && soExcl.every((x) => x.tipo === 'exame_excluido'), 'filtro por tipo');
  ok((await A.nav.req('GET', '/api/clinica/registros?de=2000-01-01&ate=2000-01-31')).dados.registros.length === 0, 'filtro por período');
  ok((await B.nav.req('GET', '/api/clinica/registros')).dados.registros.every((x) => x.exameId !== exameId), 'outra clínica não vê os registros desta');
  ok((await adm.req('GET', '/api/admin/registros')).dados.registros.some((x) => x.exameId === exameId), 'administrador do sistema vê os registros de todas as clínicas');
  ok((await A.nav.req('GET', '/api/admin/registros')).status === 403, 'clínica não acessa os registros do sistema');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

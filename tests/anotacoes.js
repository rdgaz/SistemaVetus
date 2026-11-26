'use strict';
/**
 * Teste ponta a ponta de:
 *  1) Anotações manuais de imagens (texto + medida no estilo do ultrassom, PDF SkiaSharp, referências, IA e bloqueio pós-assinatura)
 *  2) Isolamento de clínicas de teste (Clinica.Teste: aprendizados da IA, relatórios financeiros e registros)
 *
 * Uso: node tests/anotacoes.js
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

async function novaClinica(adm, nome, teste = false) {
  const email = `adm.anot.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@teste.local`;
  const c = await adm.req('POST', '/api/admin/clinicas', { nome, teste, administrador: { nome: `Adm ${nome}`, email } });
  const nav = new Navegador();
  const prov = c.dados.administrador.senhaProvisoria;
  await nav.entrar(email, prov);
  await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${Date.now()}` });
  await nav.req('PUT', '/api/auth/eu', { nome: `Dra. ${nome}`, crmv: '54321', crmvUf: 'RS' });
  nav.clinica = c.dados.id;
  return { id: c.dados.id, ae: c.dados.aeTitle, teste: c.dados.teste, nav };
}

// JPEG válido mínimo decodificável pelo SkiaSharp
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

(async () => {
  console.log(`Plataforma ${URL_BASE}`);
  const adm = new Navegador();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');

  const ts = Date.now();
  const clinTeste = await novaClinica(adm, `Clínica Teste ${ts}`, true);
  const clinReal = await novaClinica(adm, `Clínica Real ${ts}`, false);
  ok(clinTeste.teste === true && clinReal.teste === false, 'criação de clínica respeita flag Teste');

  // 1) Criar exame pelo pendrive na clínica de teste
  const idAnimal = '20261126-040000-0000';
  const sub = 'ABD20261126040000';
  const fotoNome = 'IMG_ANOTACAO_01.JPG';
  ok((await clinTeste.nav.req('PUT', `/api/exames/pendrive/${idAnimal}/${sub}/arquivos/${fotoNome}`, JPG, 'image/jpeg')).status === 200, 'envia foto para anotar');
  const concl = await clinTeste.nav.req('POST', `/api/exames/pendrive/${idAnimal}/${sub}/concluir`, { nome: 'Bidu' });
  ok(concl.status === 200 && !!concl.dados.id, 'cria exame na clínica de teste');
  const exameId = concl.dados.id;

  await clinTeste.nav.req('PUT', `/api/exames/${exameId}`, {
    paciente: { nome: 'Bidu', especie: 'Canina', raca: 'SRD', sexo: 'M', castrado: true },
    tutor: { nome: 'João Silva' },
    peso: '10 kg',
    tipoExame: 'abdominal',
  });

  // 2) Validações e permissões de anotação
  const usr = await clinTeste.nav.req('POST', '/api/clinica/usuarios', { nome: 'Recepção', email: `rec.${ts}@teste.local`, perfil: 'Usuario' });
  const navUsr = new Navegador();
  await navUsr.entrar(`rec.${ts}@teste.local`, usr.dados.senhaProvisoria);
  await navUsr.req('PUT', '/api/auth/senha', { senhaAtual: usr.dados.senhaProvisoria, novaSenha: `SenhaRec-${ts}` });
  navUsr.clinica = clinTeste.id;

  const urlAnot = `/api/exames/${exameId}/anotacoes/${encodeURIComponent(fotoNome)}`;
  ok((await navUsr.req('PUT', urlAnot, { itens: [{ tipo: 'texto', x: 0.2, y: 0.2, texto: 'BAÇO' }] })).status === 403, 'perfil Usuario não pode anotar imagem');
  ok((await clinTeste.nav.req('PUT', urlAnot, { itens: [{ tipo: 'invalido' }] })).status === 400, 'tipo inválido recusado (400)');
  ok((await clinTeste.nav.req('PUT', urlAnot, { itens: [{ tipo: 'medida', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, valor: -1 }] })).status === 400, 'medida negativa recusada (400)');
  ok((await clinTeste.nav.req('PUT', `/api/exames/${exameId}/anotacoes/INEXISTENTE.JPG`, { itens: [] })).status === 400, 'foto inexistente recusada (400)');

  // 3) Salvar texto + medida no padrão do ultrassom
  const itensSalvar = [
    { tipo: 'texto', x: 0.12, y: 0.10, texto: 'baço', orgao: 'Baço' },
    { tipo: 'medida', x1: 0.30, y1: 0.40, x2: 0.62, y2: 0.45, valor: 0.55, rotulo: 'Nódulo', orgao: 'Baço' },
    { tipo: 'medida', x1: 0.20, y1: 0.60, x2: 0.28, y2: 0.68, valor: 0.85, rotulo: 'Espessura da parede do estômago', orgao: 'Estômago' },
  ];
  const rSalvar = await clinTeste.nav.req('PUT', urlAnot, { itens: itensSalvar });
  ok(rSalvar.status === 200 && rSalvar.dados.itens.length === 3 && rSalvar.dados.itens[0].texto === 'BAÇO',
    'salva anotações (texto normalizado em maiúsculas + 2 medidas)');

  const listaAnot = await navUsr.req('GET', `/api/exames/${exameId}/anotacoes`);
  ok(listaAnot.status === 200 && listaAnot.dados.length === 1 && listaAnot.dados[0].itens.length === 3, 'qualquer perfil da clínica lê as anotações');

  // 4) Conferir rótulo automático de treino, medidas mescladas e comparação com referências
  const rotulos = (await clinTeste.nav.req('GET', `/api/exames/${exameId}/rotulos`)).dados;
  ok(rotulos.rotulos.some((r) => r.foto === fotoNome && r.orgaoCorreto === 'Baço'), 'texto/órgão anotado gera rótulo automático para treino');

  const det = (await clinTeste.nav.req('GET', `/api/exames/${exameId}`)).dados;
  ok(det.anotacoes && Array.isArray(det.anotacoes[fotoNome]) && det.anotacoes[fotoNome].length === 3, 'detalhe do exame traz as anotações');
  ok(Array.isArray(det.medidas) && det.medidas.some((m) => m.origem === 'manual' && m.valor === 0.55), 'medida manual mesclada às medidas do exame');
  ok(Array.isArray(det.medidasComparadas) && det.medidasComparadas.some((m) => m.situacao === 'acima' && m.valor === 0.85),
    'medida manual (parede gástrica 0,85 cm) comparada com valores de referência (acima)');

  // 5) Conferir que a anotação entra no prompt da IA
  const previaPrompt = (await adm.req('GET', `/api/admin/exames/${exameId}/prompt`)).dados;
  ok(previaPrompt.texto.includes('0.55') || previaPrompt.texto.includes('0,55'), 'medida manual aparece nos dados enviados à IA');
  ok(previaPrompt.fotos.some((f) => f.includes('BAÇO') && f.includes('0,55 cm')), 'anotação da foto aparece na descrição da imagem para a IA');

  // 6) Gerar pré-laudo simulado, testar PDF com SkiaSharp e bloqueio pós-assinatura
  await clinTeste.nav.req('POST', `/api/exames/${exameId}/gerar`, { tipoExame: 'abdominal' });
  let prontoRevisao = null;
  for (let i = 0; i < 30 && !prontoRevisao; i++) {
    await sleep(500);
    const x = (await clinTeste.nav.req('GET', `/api/exames/${exameId}`)).dados;
    if (x.status === 'AguardandoRevisao' || x.status === 'Erro') prontoRevisao = x;
  }
  if (prontoRevisao && prontoRevisao.status === 'AguardandoRevisao') {
    // garante a foto na prancha e gera o PDF
    const conteudoComPrancha = { ...prontoRevisao.laudo.conteudo, prancha: [fotoNome] };
    await clinTeste.nav.req('PUT', `/api/exames/${exameId}/laudo`, { conteudo: conteudoComPrancha });

    const pdfComAnot = await clinTeste.nav.req('GET', `/api/exames/${exameId}/laudo.pdf`);
    ok(pdfComAnot.status === 200 && pdfComAnot.dados.subarray(0, 4).toString() === '%PDF', 'gera PDF da prancha com anotações desenhadas via SkiaSharp');

    // desligar mostrarAnotacoes no layout da clínica e comparar
    const layAtual = (await clinTeste.nav.req('GET', '/api/clinica/layout')).dados.layout;
    await clinTeste.nav.req('PUT', '/api/clinica/layout', { ...layAtual, mostrarAnotacoes: false });
    const pdfSemAnot = await clinTeste.nav.req('GET', `/api/exames/${exameId}/laudo.pdf`);
    ok(pdfSemAnot.status === 200 && pdfSemAnot.dados.subarray(0, 4).toString() === '%PDF' && pdfSemAnot.dados.length !== pdfComAnot.dados.length,
      'opção mostrarAnotacoes=false gera PDF com a foto limpa (sem camada desenhada)');

    // assinar bloqueia novas edições de anotação; retificar libera
    ok((await clinTeste.nav.req('POST', `/api/exames/${exameId}/laudo/assinar`, { conteudo: conteudoComPrancha })).status === 200, 'assina o laudo');
    ok((await clinTeste.nav.req('PUT', urlAnot, { itens: [] })).status === 409, 'laudo assinado bloqueia edição de anotações (409)');
    ok((await clinTeste.nav.req('DELETE', urlAnot)).status === 409, 'laudo assinado bloqueia exclusão de anotações (409)');
    ok((await clinTeste.nav.req('POST', `/api/exames/${exameId}/laudo/retificar`, { motivo: 'Ajustar medida na foto' })).status === 200, 'retifica o laudo');
    ok((await clinTeste.nav.req('DELETE', urlAnot)).status === 204, 'após retificar, exclusão de anotação volta a funcionar');
  }

  // 7) Isolamento da clínica de teste (aprendizados da IA, financeiro e registros)
  await clinTeste.nav.req('PUT', `/api/exames/${exameId}/rotulos`, { foto: fotoNome, orgaoIa: 'Fígado', orgaoCorreto: 'Vesícula biliar' });
  const aprTeste = (await clinTeste.nav.req('GET', '/api/clinica/aprendizados')).dados;
  const aprReal = (await clinReal.nav.req('GET', '/api/clinica/aprendizados')).dados;
  ok(aprTeste.texto.includes('Vesícula biliar'), 'clínica de teste enxerga suas próprias correções para validação');
  ok(!aprReal.texto.includes('Fígado" eram "Vesícula biliar') || clinReal.id === clinTeste.id,
    'clínica real NÃO recebe correções feitas em clínica de teste');

  const finReais = (await adm.req('GET', '/api/admin/financeiro?escopo=reais')).dados;
  const finTestes = (await adm.req('GET', '/api/admin/financeiro?escopo=testes')).dados;
  const finTodas = (await adm.req('GET', '/api/admin/financeiro?escopo=todas')).dados;
  ok(!finReais.clinicas.some((c) => c.clinicaId === clinTeste.id) && finReais.clinicas.some((c) => c.clinicaId === clinReal.id),
    'financeiro escopo=reais oculta clínica de teste e exibe clínica real');
  ok(finTestes.clinicas.some((c) => c.clinicaId === clinTeste.id) && !finTestes.clinicas.some((c) => c.clinicaId === clinReal.id),
    'financeiro escopo=testes exibe apenas clínicas de teste');
  ok(finTodas.clinicas.some((c) => c.clinicaId === clinTeste.id) && finTodas.clinicas.some((c) => c.clinicaId === clinReal.id),
    'financeiro escopo=todas exibe ambas');

  const regPadrao = (await adm.req('GET', '/api/admin/registros?tipo=imagem_anotada')).dados;
  const regComTestes = (await adm.req('GET', '/api/admin/registros?tipo=imagem_anotada&incluirTestes=true')).dados;
  ok(!regPadrao.registros.some((r) => r.exameId === exameId) && regComTestes.registros.some((r) => r.exameId === exameId),
    'registros do sistema ocultam clínica de teste por padrão e exibem com incluirTestes=true');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

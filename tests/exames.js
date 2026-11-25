'use strict';
/**
 * Teste do passo 2: o ultrassom envia para o AE da clínica, o receptor grava na pasta da clínica
 * e a plataforma mostra o exame só para aquela clínica.
 *
 * Uso: node tests/exames.js
 * Variáveis: PLATAFORMA_URL (http://127.0.0.1:5080), VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA,
 *            DICOM_HOST (127.0.0.1), DICOM_PORT (2345)
 */
const path = require('path');
const dimse = require(path.join(__dirname, '..', 'receptor', 'node_modules', 'dcmjs-dimse'));

dimse.log.setLevel('error');
const { Client, Dataset } = dimse;
const { CEchoRequest, CStoreRequest } = dimse.requests;

const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const HOST = process.env.DICOM_HOST || '127.0.0.1';
const PORTA = Number(process.env.DICOM_PORT || 2345);
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
    const dados = tipo.includes('json') ? await r.json() : await r.arrayBuffer();
    return { status: r.status, tipo, dados };
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

/** Cria uma clínica e devolve o administrador dela já logado (com a senha trocada). */
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

// JPEG mínimo válido (1x1)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);

/** O mesmo JPEG com bytes extras depois do fim da imagem: arquivos diferentes (impressão digital diferente). */
const variante = (n) => Buffer.concat([JPG, Buffer.from([n & 255, n >> 8])]);

/**
 * Exame com 2 imagens (+ extras) e 1 vídeo de 3 quadros (= 5 fotos + extras), todas diferentes.
 * duplicadas = fotos a mais exatamente iguais à imagem 1 (outro objeto DICOM, mesmo conteúdo).
 */
function montarExame(uid, paciente, tutor, imagensExtras = 0, duplicadas = 0, comMedidas = false) {
  const comum = {
    SpecificCharacterSet: 'ISO_IR 192', PatientID: 'T-' + uid.slice(-6), PatientName: [{ Alphabetic: paciente }],
    PatientSpeciesDescription: 'Felinos', PatientSex: 'F', ResponsiblePerson: tutor, StudyInstanceUID: uid,
    StudyDate: '20261123', StudyTime: '090000', StudyDescription: 'ABD', Modality: 'US',
    Manufacturer: 'Teste', ManufacturerModelName: 'Simulador',
  };
  const img = { Rows: 1, Columns: 1, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2', BitsAllocated: 8, BitsStored: 8, HighBit: 7, PixelRepresentation: 0, _vrMap: { PixelData: 'OB' } };
  const r = Array.from({ length: 2 + imagensExtras }, (_, k) => k + 1).map((i) => new CStoreRequest(new Dataset({
    ...comum, ...img, SOPClassUID: '1.2.840.10008.5.1.4.1.1.6.1',
    SOPInstanceUID: `${uid}.1.${i}`, SeriesInstanceUID: `${uid}.1`, InstanceNumber: String(i), PixelData: [ab(variante(i))]
  }, '1.2.840.10008.1.2.4.50')));
  for (let k = 1; k <= duplicadas; k++) {
    r.push(new CStoreRequest(new Dataset({
      ...comum, ...img, SOPClassUID: '1.2.840.10008.5.1.4.1.1.6.1',
      SOPInstanceUID: `${uid}.9.${k}`, SeriesInstanceUID: `${uid}.1`, InstanceNumber: String(20 + k), PixelData: [ab(variante(1))]
    }, '1.2.840.10008.1.2.4.50')));
  }
  r.push(new CStoreRequest(new Dataset({
    ...comum, ...img, SOPClassUID: '1.2.840.10008.5.1.4.1.1.3.1', SOPInstanceUID: `${uid}.2.1`,
    SeriesInstanceUID: `${uid}.1`, InstanceNumber: '3', NumberOfFrames: '3', PixelData: [ab(variante(100)), ab(variante(101)), ab(variante(102))]
  }, '1.2.840.10008.1.2.4.50')));
  if (comMedidas) {
    // relatório estruturado (SR) com 2 medidas: rim esquerdo 4,8 cm e parede do jejuno 2,0 mm
    const code = (v, m) => [{ CodeValue: v, CodingSchemeDesignator: '99TESTE', CodeMeaning: m }];
    const num = (nome, valor, un) => ({
      RelationshipType: 'CONTAINS', ValueType: 'NUM', ConceptNameCodeSequence: code(nome, nome),
      MeasuredValueSequence: [{ NumericValue: valor, MeasurementUnitsCodeSequence: [{ CodeValue: un, CodingSchemeDesignator: 'UCUM', CodeMeaning: un }] }]
    });
    r.push(new CStoreRequest(new Dataset({
      ...comum, SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33', SOPInstanceUID: `${uid}.6.1`,
      SeriesInstanceUID: `${uid}.6`, InstanceNumber: '1', ValueType: 'CONTAINER', ConceptNameCodeSequence: code('R', 'Relatório'),
      ContentSequence: [
        { RelationshipType: 'CONTAINS', ValueType: 'CONTAINER', ConceptNameCodeSequence: code('RE', 'Rim E'), ContentSequence: [num('Comprimento', '4.8', 'cm')] },
        { RelationshipType: 'CONTAINS', ValueType: 'CONTAINER', ConceptNameCodeSequence: code('AI', 'Alças intestinais'), ContentSequence: [num('Parede do jejuno', '2.0', 'mm')] },
      ]
    }, '1.2.840.10008.1.2.1')));
  }
  return r;
}

/** Envia as requisições ao AE informado; devolve os status (vazio se a conexão foi recusada). */
function enviar(ae, requisicoes) {
  return new Promise((resolve) => {
    const st = [];
    const c = new Client();
    for (const r of requisicoes) { r.on('response', (x) => st.push(x.getStatus())); c.addRequest(r); }
    c.on('associationRejected', () => resolve({ recusado: true, st }));
    c.on('networkError', () => resolve({ recusado: true, st }));
    c.on('closed', () => resolve({ recusado: false, st }));
    c.send(HOST, PORTA, 'MindrayVet', ae);
  });
}

async function esperarExame(nav, filtro, segundos = 40) {
  for (let i = 0; i < segundos; i++) {
    const r = await nav.req('GET', '/api/exames');
    const e = r.status === 200 ? r.dados.exames.find(filtro) : null;
    if (e) return { exame: e, lista: r.dados };
    await sleep(1000);
  }
  return { exame: null, lista: null };
}

(async () => {
  console.log(`Plataforma ${URL_BASE} | DICOM ${HOST}:${PORTA}`);
  await dimse.Transcoding.initializeAsync();

  const adm = new Navegador();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');
  // cobrança: no teste a IA simulada tem preço (US$ 2 entrada / US$ 12 saída por milhão), fator 2, câmbio 5,50
  const cfgCobranca = (await adm.req('GET', '/api/admin/cobranca')).dados;
  const precos = cfgCobranca.precos.filter((p) => p.modelo !== 'simulado').concat([{ modelo: 'simulado', entradaUsdPorMilhao: 2, saidaUsdPorMilhao: 12 }]);
  const putCobranca = await adm.req('PUT', '/api/admin/cobranca', {
    fator: 2, cambioUsdBrl: 5.5, creditoInicialClinica: 40, saldoProvedorBrl: 40, alertaSaldoProvedorBrl: 10, precos,
  });
  ok(putCobranca.status === 204, 'administrador configura a cobrança (fator, câmbio, preços)');

  const n = Date.now();
  const X = await novaClinica(adm, `Clínica X ${n}`);
  const Y = await novaClinica(adm, `Clínica Y ${n}`);
  ok(/^ALV_C\d{4}$/.test(X.ae) && X.ae !== Y.ae, `duas clínicas com AE próprio (${X.ae}, ${Y.ae})`);
  const saldoInicial = (await Y.nav.req('GET', '/api/clinica/saldo')).dados;
  ok(saldoInicial.saldo === 40 && saldoInicial.laudosEstimados > 0 && saldoInicial.extrato.length === 1,
    `clínica nova começa com R$ 40 de crédito (≈ ${saldoInicial.laudosEstimados} pré-laudos)`);

  // AE desconhecido: o receptor recusa a conexão
  const desconhecido = await enviar('ALV_C9999', [new CEchoRequest()]);
  ok(desconhecido.recusado && desconhecido.st.length === 0, 'AE que não é de nenhuma clínica: conexão recusada');

  // envio para a clínica X (modo automático, o padrão)
  const uidX = `1.2.826.0.1.3680043.8.498.${n}1`;
  const envio = await enviar(X.ae, montarExame(uidX, 'MIMI', 'Joana Teste'));
  ok(!envio.recusado && envio.st.length === 3 && envio.st.every((s) => s === 0), `C-STORE para ${X.ae} aceito (${envio.st.join(',')})`);

  const { exame, lista } = await esperarExame(X.nav, (e) => e.paciente === 'MIMI');
  ok(!!exame, 'exame aparece na lista da clínica X');
  if (!exame) { console.log('\nSem o exame, os demais testes não fazem sentido.'); process.exit(1); }
  // a fila é rápida: o exame pode já estar sendo gerado (ou pronto para revisão) quando o teste consulta
  ok(['NaFila', 'Gerando', 'AguardandoRevisao'].includes(exame.status), `modo automático: entra na fila (${exame.status})`);
  ok(exame.especie === 'Felina' && exame.tutor === 'Joana Teste', `paciente e tutor criados (${exame.especie}, ${exame.tutor})`);
  ok(exame.totalFotos === 5, `5 fotos (2 imagens + 3 quadros) (${exame.totalFotos})`);
  ok((lista.contagens.NaFila ?? 0) + (lista.contagens.Gerando ?? 0) + (lista.contagens.AguardandoRevisao ?? 0) >= 1, 'contagem por status');

  const det = await X.nav.req('GET', `/api/exames/${exame.id}`);
  ok(det.status === 200 && det.dados.fotos.length === 5 && det.dados.pasta.startsWith(`${X.ae}/`), `detalhe com 5 fotos na pasta da clínica (${det.dados.pasta})`);
  const foto = await X.nav.req('GET', det.dados.fotos[0].url);
  ok(foto.status === 200 && foto.tipo.includes('image/jpeg'), 'foto servida pela plataforma');

  // reenvio do mesmo exame: atualiza, não duplica
  await enviar(X.ae, montarExame(uidX, 'MIMI', 'Joana Teste'));
  await sleep(3000);
  const depois = await X.nav.req('GET', '/api/exames');
  ok(depois.dados.exames.filter((e) => e.paciente === 'MIMI').length === 1, 'reenvio: continua um exame só');

  // isolamento entre clínicas
  const listaY = await Y.nav.req('GET', '/api/exames');
  ok(listaY.status === 200 && !listaY.dados.exames.some((e) => e.id === exame.id), 'clínica Y não vê o exame da X');
  ok((await Y.nav.req('GET', `/api/exames/${exame.id}`)).status === 404, 'clínica Y não abre o exame da X');
  ok((await Y.nav.req('GET', det.dados.fotos[0].url)).status === 404, 'clínica Y não acessa as fotos da X');
  ok((await new Navegador().req('GET', det.dados.fotos[0].url)).status === 401, 'sem login: fotos protegidas');

  // modo manual na clínica Y
  await Y.nav.req('PUT', '/api/clinica', { nome: `Clínica Y ${n}`, gerarAutomaticamente: false });
  await enviar(Y.ae, montarExame(`1.2.826.0.1.3680043.8.498.${n}2`, 'TOBY', 'Carlos Teste', 0, 0, true));
  const { exame: exameY } = await esperarExame(Y.nav, (e) => e.paciente === 'TOBY');
  ok(exameY && exameY.status === 'AguardandoDados', `modo manual: aguardando dados (${exameY && exameY.status})`);

  // ---- passo 4: tela do exame (dados, campo livre, urgente, gerar pré-laudo)
  const idY = exameY.id;
  const detY = await Y.nav.req('GET', `/api/exames/${idY}`);
  ok(detY.dados.tipoExame === 'abdominal', `tipo de exame sugerido pelo aparelho (ABD -> ${detY.dados.tipoExame})`);
  ok((await Y.nav.req('PUT', `/api/exames/${idY}`, { tipoExame: 'inventado' })).status === 400, 'tipo de exame inválido: 400');
  ok((await Y.nav.req('PUT', `/api/exames/${idY}`, { paciente: { nome: '' } })).status === 400, 'nome do paciente vazio: 400');

  const salvar = await Y.nav.req('PUT', `/api/exames/${idY}`, {
    paciente: { nome: 'Toby', raca: 'SRD', sexo: 'm', castrado: true },
    tutor: { nome: 'Carlos Teste', telefone: '(11) 99999-0000', email: 'carlos@teste.local' },
    peso: '4,2 kg', suspeitaClinica: 'Corpo estranho', jejum: false,
    solicitanteNome: 'Dra. Ana', solicitanteCrmv: '12345-SP',
    informacoesAdicionais: 'Vômito há 3 dias, muito agitado durante o exame.',
  });
  ok(salvar.status === 204, 'salva dados do paciente, tutor e exame');
  const salvo = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados;
  ok(salvo.paciente.nome === 'Toby' && salvo.paciente.sexo === 'M' && salvo.paciente.castrado === true, 'paciente atualizado (nome, sexo, castrado)');
  ok(salvo.tutor.telefone === '(11) 99999-0000' && salvo.jejum === false && salvo.solicitanteCrmv === '12345-SP', 'tutor, jejum e solicitante salvos');
  ok(salvo.informacoesAdicionais.startsWith('Vômito'), 'campo livre (informações adicionais) salvo');
  ok(salvo.status === 'AguardandoDados', 'salvar não muda o status');

  // ---- valores de referência: gato de 4,2 kg; rim 4,8 cm (ref. 3,0 a 4,5 cm) e jejuno 2,0 mm (ref. até 2,2 mm)
  ok(salvo.pesoKg === 4.2 && salvo.referencias.some((r) => r.medida === 'Comprimento renal'), `referências do gato carregadas (peso ${salvo.pesoKg} kg, ${salvo.referencias.length} itens)`);
  const rim = salvo.medidasComparadas.find((m) => m.nome === 'Comprimento');
  const jejuno = salvo.medidasComparadas.find((m) => m.nome === 'Parede do jejuno');
  ok(rim && rim.situacao === 'acima' && /3 a 4,5 cm/.test(rim.faixaTexto), `rim de 4,8 cm: acima da referência (${rim && rim.situacao}, ${rim && rim.faixaTexto})`);
  ok(jejuno && jejuno.situacao === 'dentro', `parede do jejuno de 2,0 mm: dentro da referência (${jejuno && jejuno.situacao})`);

  const refs = await adm.req('GET', '/api/admin/referencias');
  ok(refs.status === 200 && refs.dados.length >= 20, `administrador lista as referências iniciais (${refs.dados.length})`);
  ok((await adm.req('POST', '/api/admin/referencias', { especie: 'Canina', orgao: 'Baço', medida: 'Teste', maximo: 10, unidade: 'mm' })).status === 400, 'referência sem fonte: recusada');
  const nova = await adm.req('POST', '/api/admin/referencias', { especie: 'Canina', orgao: 'Baço', medida: `Teste ${n}`, maximo: 10, unidade: 'mm', fonte: 'Teste' });
  ok(nova.status === 201, 'cria uma referência');
  ok((await adm.req('PUT', `/api/admin/referencias/${nova.dados.id}`, { ...nova.dados, maximo: 12 })).dados.maximo === 12, 'edita a referência');
  ok((await adm.req('DELETE', `/api/admin/referencias/${nova.dados.id}`)).status === 204, 'apaga a referência');
  ok((await Y.nav.req('GET', '/api/admin/referencias')).status === 403, 'clínica não edita as referências');

  ok((await Y.nav.req('POST', `/api/exames/${idY}/gerar`, { tipoExame: '' })).status === 400, 'gerar sem tipo de exame: 400');
  const gerar = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, { tipoExame: 'abdominal' });
  ok(gerar.status === 200 && gerar.dados.status === 'NaFila' && !!gerar.dados.enfileiradoEm, 'Gerar pré-laudo: entra na fila');
  // ---- passo 5: a fila gera o pré-laudo (no CI, com IA_SIMULADA=true)
  if (salvo.iaAtiva) {
    let comLaudo = null;
    for (let i = 0; i < 40 && !comLaudo; i++) {
      await sleep(1000);
      const r = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados;
      if (r.status === 'AguardandoRevisao' || r.status === 'Erro') comLaudo = r;
    }
    ok(comLaudo && comLaudo.status === 'AguardandoRevisao', `fila gera o pré-laudo: Na fila -> Gerando -> Aguardando revisão (${comLaudo && comLaudo.status})`);
    const orgaos = comLaudo && comLaudo.laudo ? comLaudo.laudo.conteudo.orgaos.map((o) => o.orgao) : [];
    ok(orgaos.includes('Fígado') && orgaos.includes('Próstata') && orgaos.includes('Testículos'), `pré-laudo com os órgãos do abdômen conforme o sexo (${orgaos.length})`);
    ok(comLaudo && comLaudo.laudo.versao === 1 && comLaudo.laudo.imagensEnviadas.length === 3, 'fotos enviadas à IA: 2 imagens + 1º quadro do vídeo');

    // cobrança: simulado = 5.000 tokens de entrada (2.000 + 3 fotos) e 3.000 de saída
    // US$ (5000×2 + 3000×12)/1e6 = 0,046 → R$ 0,253 × fator 2 = R$ 0,51
    ok(comLaudo.laudo.cobradoBrl === 0.51, `pré-laudo cobrado pelo custo real × fator (R$ ${comLaudo.laudo.cobradoBrl})`);
    const saldoDepois = (await Y.nav.req('GET', '/api/clinica/saldo')).dados;
    ok(Math.abs(saldoDepois.saldo - 39.49) < 0.001 && saldoDepois.extrato[0].tipo === 'debito' && saldoDepois.mediaPorLaudo === 0.51,
      `saldo debitado e no extrato (R$ ${saldoDepois.saldo}; média R$ ${saldoDepois.mediaPorLaudo})`);

    // gerar de novo: só com o que mudou, sem reenviar fotos já analisadas
    const esperarVersao = async (v) => {
      for (let i = 0; i < 40; i++) {
        await sleep(1000);
        const r = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados;
        if (r.laudo && r.laudo.versao === v && r.status === 'AguardandoRevisao') return r.laudo;
      }
      return null;
    };
    const nada = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, {});
    ok(nada.status === 409, 'gerar de novo sem nada mudar: recusado, sem custo (409)');

    const soDados = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, { informacoesAdicionais: 'Vômito há 3 dias. Tutor relata que ele comeu um brinquedo.' });
    ok(soDados.status === 200 && soDados.dados.modo === 'dados' && soDados.dados.imagensNovas === 0 && soDados.dados.mudancas.length === 1,
      `texto livre mudou: atualização só com os dados (${soDados.dados.modo}, ${soDados.dados.mudancas})`);
    const v2 = await esperarVersao(2);
    ok(v2 && v2.modo === 'dados' && v2.imagensEnviadas.length === 3, 'versão 2 gerada sem reenviar fotos');

    // chegou uma foto nova (reenvio do exame com 1 imagem a mais)
    await enviar(Y.ae, montarExame(`1.2.826.0.1.3680043.8.498.${n}2`, 'TOBY', 'Carlos Teste', 1));
    for (let i = 0; i < 20; i++) { await sleep(1000); if ((await Y.nav.req('GET', `/api/exames/${idY}`)).dados.fotos.length === 6) break; }
    const soFotos = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, {});
    ok(soFotos.status === 200 && soFotos.dados.modo === 'imagens' && soFotos.dados.imagensNovas === 1, `foto nova: envia só ela (${soFotos.dados.modo}, ${soFotos.dados.imagensNovas})`);
    ok(soFotos.dados.mudancas.length === 0, `reenvio pelo aparelho não apaga dados corrigidos pela clínica (${soFotos.dados.mudancas})`);
    ok((await Y.nav.req('GET', `/api/exames/${idY}`)).dados.peso === '4,2 kg', 'peso digitado pela clínica continua após o reenvio');
    const v3 = await esperarVersao(3);
    ok(v3 && v3.modo === 'imagens' && v3.imagensEnviadas.length === 4, 'versão 3: 3 fotos já analisadas + 1 nova');

    // chegou uma foto exatamente igual a uma já analisada: não vai de novo para a IA
    await enviar(Y.ae, montarExame(`1.2.826.0.1.3680043.8.498.${n}2`, 'TOBY', 'Carlos Teste', 1, 1));
    for (let i = 0; i < 20; i++) { await sleep(1000); if ((await Y.nav.req('GET', `/api/exames/${idY}`)).dados.fotos.length === 7) break; }
    const soRepetida = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, {});
    ok(soRepetida.status === 409, `foto nova idêntica a uma já analisada: descartada, nada para gerar (${soRepetida.status})`);

    // sem saldo, não gera (e não cobra); depois da recarga, volta a gerar
    const saldoAgora = (await Y.nav.req('GET', '/api/clinica/saldo')).dados.saldo;
    ok((await adm.req('POST', `/api/admin/clinicas/${Y.id}/saldo`, { valor: -saldoAgora, descricao: 'Teste: zerar' })).status === 200, 'administrador zera o saldo (ajuste)');
    const semSaldo = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, { completa: true });
    ok(semSaldo.status === 402 && /Saldo insuficiente/.test(semSaldo.dados.erro), 'sem saldo: pré-laudo recusado');
    const recarga = await adm.req('POST', `/api/admin/clinicas/${Y.id}/saldo`, { valor: 10, descricao: 'Recarga Pix' });
    ok(recarga.status === 200 && recarga.dados.saldo === 10, 'recarga de R$ 10');

    const completa = await Y.nav.req('POST', `/api/exames/${idY}/gerar`, { completa: true });
    ok(completa.status === 200 && completa.dados.modo === 'completa', 'Refazer análise completa: olha todas as fotos de novo');
    const v4 = await esperarVersao(4);
    ok(v4 && v4.modo === 'completa' && v4.imagensEnviadas.length === 4,
      `versão 4: análise completa sem a foto repetida (3 imagens + 1º quadro do vídeo = ${v4 && v4.imagensEnviadas.length})`);

    const resumo = (await adm.req('GET', '/api/admin/cobranca')).dados;
    ok(resumo.resumo.cobradoBrl > 0 && resumo.resumo.cobradoBrl > resumo.resumo.custoBrl && resumo.saldoProvedorBrl < 40,
      `resumo do administrador: cobrado R$ ${resumo.resumo.cobradoBrl.toFixed(2)} > custo R$ ${resumo.resumo.custoBrl.toFixed(2)}; saldo no provedor descontado`);
    ok((await Y.nav.req('GET', '/api/admin/cobranca')).status === 403, 'clínica não acessa a configuração de cobrança');
    const fin = (await adm.req('GET', '/api/admin/financeiro')).dados;
    const finY = fin.clinicas.find((x) => x.clinicaId === Y.id);
    ok(finY && finY.creditosGratis > 0 && finY.consumo > 0 && finY.custo > 0 && Math.abs(finY.lucro - (finY.consumo - finY.custo)) < 0.0001 && finY.usos >= 1,
      `financeiro por clínica: consumido R$ ${finY && finY.consumo.toFixed(2)}, custo R$ ${finY && finY.custo.toFixed(4)}, lucro calculado`);
    ok((await adm.req('GET', '/api/admin/financeiro?de=2000-01-01&ate=2000-01-31')).dados.total.usos === 0, 'financeiro filtra pelo período');
    ok((await Y.nav.req('GET', '/api/admin/financeiro')).status === 403, 'clínica não vê o financeiro');

    // ---- passo 6: revisão, assinatura, PDF, verificação, retificação
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    ok((await Y.nav.req('PUT', '/api/auth/assinatura', PNG, 'image/png')).status === 204, 'envia a imagem da assinatura');
    const assin = await Y.nav.req('GET', '/api/auth/assinatura');
    ok(assin.status === 200 && assin.tipo.includes('image/png'), 'assinatura salva e servida');
    ok((await Y.nav.req('PUT', '/api/auth/assinatura', Buffer.from('não é imagem'), 'image/png')).status === 400, 'arquivo que não é imagem: recusado');
    ok((await Y.nav.req('PUT', '/api/clinica/logo', PNG, 'image/png')).status === 204, 'envia o logo da clínica');

    const revisado = JSON.parse(JSON.stringify(v4.conteudo));
    revisado.orgaos[0].descricao = 'Fígado revisado pelo veterinário.';
    revisado.prancha = salvo.fotos.slice(0, 2).map((f) => f.nome);
    const p13 = JSON.parse(JSON.stringify(revisado)); p13.prancha = Array.from({ length: 13 }, (_, i) => salvo.fotos[i % salvo.fotos.length].nome);
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/laudo`, { conteudo: p13 })).status === 204, 'prancha com mais de 12 fotos é aceita');
    const p31 = JSON.parse(JSON.stringify(revisado)); p31.prancha = Array.from({ length: 40 }, (_, i) => salvo.fotos[i % salvo.fotos.length].nome);
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/laudo`, { conteudo: p31 })).status === 204, 'prancha sem limite de fotos (40 aceitas)');
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/laudo`, { conteudo: revisado })).status === 204, 'salva a revisão do laudo');
    const comRevisao = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados.laudo;
    ok(comRevisao.revisado && comRevisao.conteudo.orgaos[0].descricao.includes('revisado') && comRevisao.conteudo.prancha.length === 2, 'revisão e prancha guardadas');

    // ---- padrão do médico: ordem e nomes dos órgãos como no laudo dele (Rins numa linha só; linfonodos por último)
    const nomesOrgaos = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados.laudo.conteudo.orgaos.map((o) => o.orgao);
    ok(nomesOrgaos[0] === 'Fígado' && nomesOrgaos[1] === 'Vesícula Biliar' && nomesOrgaos.includes('Rins') && !nomesOrgaos.some((n) => /^Rim /.test(n))
      && nomesOrgaos.includes('Vesícula Urinária') && nomesOrgaos.at(-1) === 'Linfonodos' && !nomesOrgaos.includes('Cavidade abdominal'),
      `órgãos na ordem e com os nomes do laudo do médico (${nomesOrgaos.join(', ')})`);

    // ---- alerta de achado urgente: o veterinário discorda e a discordância fica registrada
    const comAlerta = JSON.parse(JSON.stringify(revisado));
    Object.assign(comAlerta, { achadoUrgente: true, motivoUrgencia: 'Suspeita de corpo estranho linear.', imagensUrgencia: [1, 2], confiancaUrgencia: 'alta', evidenciaUrgencia: 'Imagem 1: alças plissadas.' });
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/laudo`, { conteudo: comAlerta })).status === 204, 'salva um laudo com alerta urgente');
    ok((await Y.nav.req('POST', `/api/exames/${idY}/laudo/alerta/discordar`, { motivo: 'qualquer' })).status === 400, 'discordância sem motivo válido: recusada');
    ok((await X.nav.req('POST', `/api/exames/${idY}/laudo/alerta/discordar`, { motivo: 'falso_alarme' })).status === 404, 'outra clínica não registra discordância');
    const disc = await Y.nav.req('POST', `/api/exames/${idY}/laudo/alerta/discordar`, { motivo: 'falso_alarme', comentario: 'Alças plissadas por enterite, sem corpo estranho.' });
    ok(disc.status === 204, 'registra a discordância com a leitura correta');
    const semAlerta = (await Y.nav.req('GET', `/api/exames/${idY}`)).dados.laudo.conteudo;
    ok(semAlerta.achadoUrgente === false && semAlerta.alertaDiscordado === true, 'o alerta sai do laudo');
    ok((await Y.nav.req('POST', `/api/exames/${idY}/laudo/alerta/discordar`, { motivo: 'falso_alarme' })).status === 409, 'sem alerta: nada a discordar (409)');
    const lista = (await adm.req('GET', '/api/admin/discordancias')).dados;
    const reg = lista.find((d) => d.exameId === idY);
    ok(reg && reg.motivo === 'falso_alarme' && /enterite/.test(reg.comentario) && reg.alertaMotivo.includes('corpo estranho') && reg.alertaConfianca === 'alta' && JSON.parse(reg.alertaFotos).length === 2,
      'discordância guardada com o que a IA disse, a confiança, as fotos e o comentário');
    ok((await Y.nav.req('GET', '/api/admin/discordancias')).status === 403, 'só o administrador do sistema lê as discordâncias');

    // ---- rótulos de imagem: o veterinário confirma ou corrige "o que a imagem mostra"
    const foto1 = salvo.fotos[0].nome, foto2 = salvo.fotos[1].nome;
    const rot0 = (await Y.nav.req('GET', `/api/exames/${idY}/rotulos`)).dados;
    ok(rot0.opcoes.includes('Fígado') && rot0.opcoes.includes('Sem órgão (tela, medida ou texto)') && rot0.rotulos.length === 0, 'opções de rótulo e nenhum rótulo ainda');
    const conf = await Y.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: foto1, orgaoIa: 'Bexiga urinária', orgaoCorreto: 'Bexiga urinária' });
    ok(conf.status === 200 && conf.dados.tipo === 'confirmacao', 'confirma que a imagem é do órgão que a IA indicou');
    const corr = await Y.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: foto2, orgaoIa: 'Fígado', orgaoCorreto: 'Baço' });
    ok(corr.status === 200 && corr.dados.tipo === 'correcao' && corr.dados.orgaoCorreto === 'Baço', 'corrige: a imagem não é do fígado, é do baço');
    const recor = await Y.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: foto2, orgaoIa: 'Fígado', orgaoCorreto: 'Vesícula biliar' });
    ok(recor.status === 200 && (await Y.nav.req('GET', `/api/exames/${idY}/rotulos`)).dados.rotulos.length === 2, 'mudar o rótulo da mesma foto atualiza (um por foto)');
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: foto1, orgaoIa: 'Fígado', orgaoCorreto: 'Qualquer coisa' })).status === 400, 'rótulo fora das opções: recusado');
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: '../x.jpg', orgaoIa: 'Fígado', orgaoCorreto: 'Baço' })).status === 400, 'foto inexistente: recusada');
    ok((await X.nav.req('PUT', `/api/exames/${idY}/rotulos`, { foto: foto1, orgaoIa: 'Fígado', orgaoCorreto: 'Baço' })).status === 404, 'outra clínica não rotula o exame');
    const base = (await adm.req('GET', '/api/admin/rotulos-imagens')).dados;
    const meus = base.rotulos.filter((x) => x.exameId === idY);
    ok(meus.length === 2 && meus.every((x) => x.hashFoto.length === 40) && base.confirmacoes >= 1 && base.correcoes >= 1, 'conjunto de treino do administrador: rótulos com a impressão digital da foto');
    ok((await Y.nav.req('GET', '/api/admin/rotulos-imagens')).status === 403, 'só o administrador do sistema lê a base de treino');

    // ---- ditado por voz: o texto falado é padronizado e guardado (relato, padronizado e final)
    ok((await Y.nav.req('POST', `/api/exames/${idY}/laudo/padronizar`, { orgao: 'Fígado', texto: '   ' })).status === 400, 'padronizar sem texto: recusado');
    ok((await X.nav.req('POST', `/api/exames/${idY}/laudo/padronizar`, { orgao: 'Fígado', texto: 'normal' })).status === 404, 'outra clínica não padroniza');
    const pad = await Y.nav.req('POST', `/api/exames/${idY}/laudo/padronizar`, { orgao: 'Fígado', texto: 'tá com tamanho normal e bordas lisas', descricaoAtual: 'Fígado revisado.' });
    ok(pad.status === 200 && pad.dados.texto === 'Tá com tamanho normal e bordas lisas.' && !!pad.dados.id, 'padroniza o texto ditado (IA simulada)');
    ok((await Y.nav.req('POST', `/api/exames/${idY}/laudo/padronizar/${pad.dados.id}/aceitar`, { textoFinal: 'Fígado de tamanho normal e bordas lisas.' })).status === 204, 'aceita o texto padronizado (editado)');
    const dit = (await adm.req('GET', '/api/admin/ditados')).dados.find((d) => d.id === pad.dados.id);
    ok(dit && dit.aceito && dit.textoBruto.includes('tá com') && dit.textoPadronizado.endsWith('.') && dit.textoFinal.startsWith('Fígado') && dit.descricaoAnterior === 'Fígado revisado.',
      'ditado guardado: relato falado, texto padronizado e texto final');
    ok((await Y.nav.req('GET', '/api/admin/ditados')).status === 403, 'só o administrador do sistema lê os ditados');

    // ---- aprendizados da clínica: o que a IA recebe no próximo pré-laudo (discordâncias, órgãos confundidos, ditados)
    const apr = (await Y.nav.req('GET', '/api/clinica/aprendizados')).dados;
    ok(!apr.vazio && apr.texto.includes('DESCARTOU') && apr.texto.includes('corpo estranho linear') && apr.texto.includes('enterite'),
      'aprendizados: a discordância do alerta (com a leitura correta) vai para a IA');
    ok(apr.texto.includes('confundiu') && apr.texto.includes('"Fígado"') && apr.texto.includes('"Vesícula biliar"'), 'aprendizados: órgãos que a IA confundiu nas imagens');
    ok(apr.texto.includes('como o médico desta clínica escreve') && apr.texto.includes('Fígado de tamanho normal'), 'aprendizados: exemplo de como o médico escreve');
    const aprX = (await X.nav.req('GET', '/api/clinica/aprendizados')).dados;
    ok(!aprX.vazio && aprX.texto.includes('confundiu') && !aprX.texto.includes('como o médico desta clínica escreve'),
      'aprendizados de imagens valem para todas as clínicas; estilo de escrita fica só na clínica');

    // ---- o que vai para a IA: só o administrador do sistema vê (instruções, banco de frases, aprendizados, dados, fotos)
    const pr = await adm.req('GET', `/api/admin/exames/${idY}/prompt`);
    ok(pr.status === 200 && pr.dados.sistema.includes('PADRÃO DO MÉDICO') && pr.dados.sistema.includes('APRENDIZADOS DESTA CLÍNICA')
      && pr.dados.texto.includes('ÓRGÃOS A AVALIAR') && pr.dados.fotos.length > 0, 'administrador do sistema vê o prompt completo do exame');
    ok((await Y.nav.req('GET', `/api/admin/exames/${idY}/prompt`)).status === 403, 'a clínica não vê o prompt');
    ok((await adm.req('GET', '/api/admin/exames')).dados.some((x) => x.id === idY), 'lista de exames de todas as clínicas para o administrador');

    const semCrmv = await Y.nav.req('POST', `/api/exames/${idY}/laudo/assinar`, {});
    ok(semCrmv.status === 400 && /CRMV/.test(semCrmv.dados.erro), 'assinar sem CRMV: recusado');
    const eu = (await Y.nav.req('GET', '/api/auth/eu')).dados;
    await Y.nav.req('PUT', '/api/auth/eu', { nome: eu.nome, crmv: '12345', crmvUf: 'SP' });
    const assinar = await Y.nav.req('POST', `/api/exames/${idY}/laudo/assinar`, {});
    ok(assinar.status === 200 && assinar.dados.status === 'Pronto' && /^[A-Z2-9]{10}$/.test(assinar.dados.codigoVerificacao),
      `aprovar e assinar: Pronto, código ${assinar.dados.codigoVerificacao}`);
    const codigo = assinar.dados.codigoVerificacao;
    ok((await Y.nav.req('PUT', `/api/exames/${idY}`, { peso: '5 kg' })).status === 409, 'laudo assinado: dados não podem mais mudar');
    ok((await Y.nav.req('PUT', `/api/exames/${idY}/laudo`, { conteudo: revisado })).status === 409, 'laudo assinado: texto não pode mais mudar');

    const pdf = await Y.nav.req('GET', `/api/exames/${idY}/laudo.pdf`);
    ok(pdf.status === 200 && pdf.tipo.includes('application/pdf') && Buffer.from(pdf.dados).subarray(0, 4).toString() === '%PDF',
      `PDF do laudo gerado (${Math.round(Buffer.from(pdf.dados).length / 1024)} KB)`);
    if (process.env.SALVAR_PDF) require('fs').writeFileSync(process.env.SALVAR_PDF, Buffer.from(pdf.dados));
    ok((await new Navegador().req('GET', `/api/exames/${idY}/laudo.pdf`)).status === 401, 'PDF exige login');
    ok((await X.nav.req('GET', `/api/exames/${idY}/laudo.pdf`)).status === 404, 'outra clínica não abre o PDF');

    const verif = await new Navegador().req('GET', `/api/publico/verificar/${codigo}`);
    ok(verif.status === 200 && verif.dados.valido && !verif.dados.retificado && verif.dados.crmv === 'CRMV-SP 12345', 'verificação pública (sem login): autêntico');
    ok((await new Navegador().req('GET', '/api/publico/verificar/XXXXXXXXXX')).status === 404, 'código inexistente: não encontrado');

    // ---- passo 7: envio do laudo
    const pref = (await Y.nav.req('GET', '/api/auth/envio')).dados;
    ok(pref.whatsapp && pref.email && pref.link && pref.pdf && !pref.smtpConfigurado, 'canais de envio ativos por padrão; SMTP não configurado');
    const desliga = await Y.nav.req('PUT', '/api/auth/envio', { whatsapp: false, email: true, link: true, pdf: true, linkValidadeDias: 7 });
    ok(desliga.status === 200 && desliga.dados.whatsapp === false && desliga.dados.linkValidadeDias === 7, 'desativa o WhatsApp e muda a validade dos links');
    const semSmtp = await Y.nav.req('POST', `/api/exames/${idY}/compartilhar/email`, { para: ['tutor@teste.local'] });
    ok(semSmtp.status === 400 && /SMTP/.test(semSmtp.dados.erro), 'e-mail sem SMTP configurado: recusado');

    const link = await Y.nav.req('POST', `/api/exames/${idY}/compartilhar/link`, {});
    const diasLink = link.dados && (new Date(link.dados.expiraEm) - Date.now()) / 86400000;
    ok(link.status === 200 && /\/laudo\/[\w-]{20,}$/.test(link.dados.url) && diasLink > 6 && diasLink <= 7, `link público criado (vale ${diasLink && diasLink.toFixed(1)} dias)`);
    ok((await Y.nav.req('POST', `/api/exames/${idY}/compartilhar/link`, {})).dados.url === link.dados.url, 'segundo pedido reaproveita o link ativo');
    const token = link.dados.url.split('/laudo/')[1];
    const pub = await new Navegador().req('GET', `/api/publico/laudo/${token}`);
    ok(pub.status === 200 && pub.dados.paciente === 'Toby' && pub.dados.crmv === 'CRMV-SP 12345', 'página do tutor abre sem login');
    const pubPdf = await new Navegador().req('GET', `/api/publico/laudo/${token}/pdf`);
    ok(pubPdf.status === 200 && Buffer.from(pubPdf.dados).subarray(0, 4).toString() === '%PDF', 'tutor baixa o PDF pelo link');
    ok((await Y.nav.req('POST', `/api/exames/${idY}/compartilhar/registrar`, { meio: 'whatsapp', destinatario: '5511999990000' })).status === 204, 'registra o envio por WhatsApp');

    if (process.env.MAILPIT_URL) {
      const smtp = await Y.nav.req('PUT', '/api/auth/envio', {
        whatsapp: false, email: true, link: true, pdf: true, linkValidadeDias: 7,
        smtp: { host: 'mailpit', porta: 1025, seguranca: 'nenhuma', usuario: 'clinica', senha: 'senha-smtp-teste', remetenteNome: 'Clínica Y', remetenteEmail: 'clinica@teste.local' },
      });
      ok(smtp.status === 200 && smtp.dados.smtpConfigurado && smtp.dados.smtp.senhaDefinida && !JSON.stringify(smtp.dados).includes('senha-smtp-teste'),
        'SMTP próprio salvo; a senha não volta na resposta');
      ok((await Y.nav.req('POST', '/api/auth/envio/teste', { para: 'eu@teste.local' })).status === 200, 'e-mail de teste enviado pelo SMTP próprio');
      const envio = await Y.nav.req('POST', `/api/exames/${idY}/compartilhar/email`, {
        para: ['carlos@teste.local'], assunto: 'Laudo de ultrassonografia: Toby', mensagem: `Olá! Segue o laudo.\n${link.dados.url}`,
      });
      ok(envio.status === 200, `envia o laudo por e-mail (${envio.status} ${envio.dados && envio.dados.erro || ''})`);
      await sleep(1000);
      const caixa = await (await fetch(`${process.env.MAILPIT_URL}/api/v1/messages`)).json();
      const msg = caixa.messages.find((m) => m.Subject === 'Laudo de ultrassonografia: Toby');
      ok(msg && msg.From.Address === 'clinica@teste.local' && msg.To[0].Address === 'carlos@teste.local' && msg.Attachments === 1,
        'e-mail chegou: do remetente da clínica, para o tutor, com o PDF anexado');
    } else {
      console.log('  (MAILPIT_URL não definido: pulando o envio real de e-mail)');
    }

    const hist = (await Y.nav.req('GET', `/api/exames/${idY}/compartilhamentos`)).dados;
    ok(hist.historico.some((h) => h.meio === 'whatsapp') && hist.links.some((l) => l.ativo && l.acessos >= 1), 'histórico de envios e acessos ao link');
    const linkId = hist.links.find((l) => l.ativo).id;
    ok((await Y.nav.req('DELETE', `/api/exames/${idY}/links/${linkId}`)).status === 204, 'revoga o link');
    ok((await new Navegador().req('GET', `/api/publico/laudo/${token}`)).status === 404, 'link revogado não abre mais');
    ok((await X.nav.req('POST', `/api/exames/${idY}/compartilhar/link`, {})).status === 404, 'outra clínica não cria link do exame');

    ok((await Y.nav.req('POST', `/api/exames/${idY}/laudo/retificar`, { motivo: '' })).status === 400, 'retificar sem motivo: recusado');
    const ret = await Y.nav.req('POST', `/api/exames/${idY}/laudo/retificar`, { motivo: 'Correção do peso.' });
    ok(ret.status === 200 && ret.dados.status === 'AguardandoRevisao' && ret.dados.versao === 5, 'retificação abre a versão 5 para revisar');
    const verif2 = (await new Navegador().req('GET', `/api/publico/verificar/${codigo}`)).dados;
    ok(verif2.retificado === true, 'verificação do código antigo mostra "retificado"');
  } else {
    console.log('  (IA não configurada neste ambiente: pulando a geração do pré-laudo)');
  }
  ok((await Y.nav.req('PUT', `/api/exames/${idY}`, { urgente: true })).status === 204, 'marca como urgente');
  const listaY2 = (await Y.nav.req('GET', '/api/exames')).dados;
  ok(listaY2.exames[0].id === idY && listaY2.exames[0].urgente, 'urgente aparece primeiro na lista');
  ok((await X.nav.req('PUT', `/api/exames/${idY}`, { urgente: false })).status === 404, 'outra clínica não altera o exame');

  // clínica bloqueada: o receptor recusa (após o cache de 30 s do AE)
  await adm.req('PUT', `/api/admin/clinicas/${X.id}`, { nome: `Clínica X ${n}`, ativa: false });
  console.log('  ...aguardando o receptor perceber o bloqueio (até 35 s)');
  let recusado = false;
  for (let i = 0; i < 8 && !recusado; i++) {
    await sleep(5000);
    recusado = (await enviar(X.ae, [new CEchoRequest()])).recusado;
  }
  ok(recusado, 'clínica bloqueada: conexão recusada');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
  setTimeout(() => process.exit(), 200);
})().catch((e) => { console.error(e); process.exit(1); });

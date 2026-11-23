'use strict';
/**
 * Teste ponta a ponta: simula o ultrassom enviando um exame e confere o resultado pela área web.
 *
 * Envia (numa única conexão DICOM): 3 imagens JPEG, 1 vídeo com 3 quadros, 1 PDF e 1 relatório estruturado (SR).
 * Espera: 6 fotos em jpg/, 1 PDF em pdf/, medidas extraídas, login exigido na área web.
 *
 * Uso: node tests/e2e.js
 * Variáveis: DICOM_HOST (127.0.0.1), DICOM_PORT (2345), AE_TITLE (MINIPACS),
 *            WEB_URL (http://127.0.0.1:8080), ADMIN_USER, ADMIN_PASSWORD
 */
const path = require('path');
const net = require('net');
const dimse = require(path.join(__dirname, '..', 'receptor', 'node_modules', 'dcmjs-dimse'));

dimse.log.setLevel('error');
const { Client, Dataset } = dimse;
const { CEchoRequest, CStoreRequest } = dimse.requests;

const HOST = process.env.DICOM_HOST || '127.0.0.1';
const PORT = Number(process.env.DICOM_PORT || 2345);
const AE = process.env.AE_TITLE || 'MINIPACS';
const WEB = (process.env.WEB_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const AUTH = 'Basic ' + Buffer.from(`${process.env.ADMIN_USER || 'admin'}:${process.env.ADMIN_PASSWORD || 'troque-esta-senha'}`).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FALHA'} ${msg}`); if (!cond) falhas++; };

// JPEG mínimo válido (1x1)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function esperarPorta(host, port, segundos) {
  for (let i = 0; i < segundos; i++) {
    const aberto = await new Promise((r) => { const s = net.connect(port, host); s.on('connect', () => { s.end(); r(true); }); s.on('error', () => r(false)); });
    if (aberto) return true;
    await sleep(1000);
  }
  return false;
}

function enviar(requests) {
  return new Promise((resolve) => {
    const respostas = [];
    const c = new Client();
    for (const r of requests) { r.on('response', (x) => respostas.push(x.getStatus())); c.addRequest(r); }
    c.on('networkError', (e) => { console.log('erro de rede:', e.message); resolve(respostas); });
    c.on('closed', () => resolve(respostas));
    c.send(HOST, PORT, 'MindrayVet', AE);
  });
}

(async () => {
  console.log(`Receptor ${HOST}:${PORT} (${AE}) | Web ${WEB}`);
  ok(await esperarPorta(HOST, PORT, 60), 'porta DICOM aberta');
  await dimse.Transcoding.initializeAsync();

  const echo = await enviar([new CEchoRequest()]);
  ok(echo[0] === 0, 'C-ECHO (teste de conexão)');

  const uid = '1.2.826.0.1.3680043.8.498.' + Date.now();
  const comum = {
    SpecificCharacterSet: 'ISO_IR 192', PatientID: 'CI-' + Date.now(), PatientName: [{ Alphabetic: 'TESTE_CI' }],
    PatientSpeciesDescription: 'Felino', PatientSex: 'F', StudyInstanceUID: uid + '.1', StudyDate: '20261122',
    StudyTime: '101500', StudyDescription: 'ABD', Modality: 'US', Manufacturer: 'Teste', ManufacturerModelName: 'CI',
  };
  const img = { Rows: 1, Columns: 1, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2', BitsAllocated: 8, BitsStored: 8, HighBit: 7, PixelRepresentation: 0 };
  // monta o exame; imagensExtras > 0 acrescenta imagens novas (para o teste de reenvio)
  const montar = (imagensExtras = 0) => {
  const reqs = [];
  for (let i = 1; i <= 3 + imagensExtras; i++) {
    reqs.push(new CStoreRequest(new Dataset({ ...comum, ...img, SOPClassUID: '1.2.840.10008.5.1.4.1.1.6.1', SOPInstanceUID: `${uid}.3.${i}`,
      SeriesInstanceUID: uid + '.2', InstanceNumber: String(i), PixelData: [ab(JPG)], _vrMap: { PixelData: 'OB' } }, '1.2.840.10008.1.2.4.50')));
  }
  reqs.push(new CStoreRequest(new Dataset({ ...comum, ...img, SOPClassUID: '1.2.840.10008.5.1.4.1.1.3.1', SOPInstanceUID: `${uid}.4.1`,
    SeriesInstanceUID: uid + '.2', InstanceNumber: '4', NumberOfFrames: '3', PixelData: [ab(JPG), ab(JPG), ab(JPG)], _vrMap: { PixelData: 'OB' } }, '1.2.840.10008.1.2.4.50')));
  reqs.push(new CStoreRequest(new Dataset({ ...comum, SOPClassUID: '1.2.840.10008.5.1.4.1.1.104.1', SOPInstanceUID: `${uid}.5.1`,
    SeriesInstanceUID: uid + '.5', InstanceNumber: '1', DocumentTitle: 'Relatorio', MIMETypeOfEncapsulatedDocument: 'application/pdf',
    EncapsulatedDocument: ab(PDF), _vrMap: { EncapsulatedDocument: 'OB' } }, '1.2.840.10008.1.2.1')));
  const code = (v, m) => [{ CodeValue: v, CodingSchemeDesignator: '99TESTE', CodeMeaning: m }];
  reqs.push(new CStoreRequest(new Dataset({ ...comum, SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33', SOPInstanceUID: `${uid}.6.1`,
    SeriesInstanceUID: uid + '.6', InstanceNumber: '1', ValueType: 'CONTAINER', ConceptNameCodeSequence: code('R1', 'Relatório'),
    ContentSequence: [{ RelationshipType: 'CONTAINS', ValueType: 'CONTAINER', ConceptNameCodeSequence: code('K', 'Rim E'),
      ContentSequence: [{ RelationshipType: 'CONTAINS', ValueType: 'NUM', ConceptNameCodeSequence: code('L', 'Comprimento'),
        MeasuredValueSequence: [{ NumericValue: '4.25', MeasurementUnitsCodeSequence: [{ CodeValue: 'cm', CodingSchemeDesignator: 'UCUM', CodeMeaning: 'centímetro' }] }] }] }],
  }, '1.2.840.10008.1.2.1')));
  return reqs;
  };

  const st = await enviar(montar());
  ok(st.length === 6 && st.every((s) => s === 0), `C-STORE de 6 objetos (${st.join(',')})`);

  // área web: login obrigatório
  const semLogin = await fetch(`${WEB}/api/exames`);
  ok(semLogin.status === 401, 'área web exige login');
  const h = { headers: { authorization: AUTH } };

  // espera o processamento
  let exame = null;
  for (let i = 0; i < 30 && !(exame && exame.totais); i++) {
    await sleep(1000);
    const lista = await (await fetch(`${WEB}/api/exames`, h)).json();
    exame = lista.find((e) => e.studyInstanceUID === uid + '.1') || null;
  }
  ok(!!exame, `exame recebido (${exame && exame.pasta})`);
  if (!exame) process.exit(1);
  ok(exame.especie === 'Felino', 'exame.json com espécie');

  const det = await (await fetch(`${WEB}/api/exames/${encodeURIComponent(exame.pasta)}`, h)).json();
  ok(det.fotos.length === 6, `6 fotos em jpg/ (${det.fotos.length})`);
  ok(det.pdfs.length === 1, `1 PDF extraído (${det.pdfs.length})`);
  ok(['jpg', 'pdf', 'dicom-sr'].every((d) => det.formatos.includes(d)) && !det.formatos.includes('dicom-imagem'), `pastas por formato (${det.formatos.join(', ')})`);

  const foto = await fetch(`${WEB}/arquivos/${encodeURIComponent(exame.pasta)}/jpg/${encodeURIComponent(det.fotos[0])}`, h);
  ok(foto.ok && (foto.headers.get('content-type') || '').includes('image/jpeg'), 'foto acessível pela web');

  const pagina = await (await fetch(`${WEB}/exame/${encodeURIComponent(exame.pasta)}`, h)).text();
  ok(pagina.includes('Comprimento') && pagina.includes('4.25'), 'medidas do SR exibidas');

  // reenvio do MESMO exame com 1 imagem a mais: deve usar a mesma pasta, substituir e só acrescentar a nova
  const antes = det.processadoEm;
  const st2 = await enviar(montar(1));
  ok(st2.length === 7 && st2.every((s) => s === 0), `reenvio: C-STORE de 7 objetos (${st2.join(',')})`);
  let det2 = det;
  for (let i = 0; i < 30 && det2.processadoEm === antes; i++) {
    await sleep(1000);
    det2 = await (await fetch(`${WEB}/api/exames/${encodeURIComponent(exame.pasta)}`, h)).json();
  }
  const lista2 = await (await fetch(`${WEB}/api/exames`, h)).json();
  ok(lista2.filter((e) => e.studyInstanceUID === uid + '.1').length === 1 && !lista2.some((e) => e.pasta === `${exame.pasta}_2`), 'reenvio: mesma pasta, sem duplicar o exame');
  ok(det2.fotos.length === 7, `reenvio: 6 fotos substituídas + 1 nova = 7 (${det2.fotos.length})`);
  ok(det2.pdfs.length === 1, `reenvio: PDF substituído, sem cópia (${det2.pdfs.length})`);
  ok((det2.medidas || []).length === 1, `reenvio: medidas substituídas, sem repetir (${(det2.medidas || []).length})`);

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
  setTimeout(() => process.exit(), 200); // deixa as conexões fecharem antes de sair
})().catch((e) => { console.error(e); process.exit(1); });

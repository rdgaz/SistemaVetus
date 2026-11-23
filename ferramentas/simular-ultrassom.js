'use strict';
/**
 * Simulador de ultrassom: envia um exame já recebido (fotos + exame.json) de novo por DICOM,
 * como o aparelho faria. Cada foto volta para dentro de um "envelope" DICOM com o mesmo JPEG
 * (sem recompressão) e os dados do paciente do exame.json. Os quadros de vídeo voltam a ser um clipe.
 *
 * Uso:
 *   node ferramentas/simular-ultrassom.js --exame dados\temp\MEG_20260901_ABD --ae VETUS_C0001
 *
 * Opções:
 *   --exame   pasta do exame (com jpg/ ou fotosProcessadas/ e exame.json)   [obrigatório]
 *   --ae      AE Title chamado (o da clínica, ex.: VETUS_C0001)              [padrão: MINIPACS]
 *   --host    endereço do receptor                                            [padrão: 127.0.0.1]
 *   --porta   porta DICOM                                                     [padrão: 2345]
 *   --aparelho AE Title do "aparelho"                                         [padrão: MindrayVet]
 *   --limite  envia só as N primeiras imagens/vídeos (teste rápido)
 *   --novo    gera um exame NOVO (outro StudyInstanceUID) em vez de reenviar o mesmo
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dimse = require(path.join(__dirname, '..', 'receptor', 'node_modules', 'dcmjs-dimse'));

dimse.log.setLevel('error');
const { Client, Dataset } = dimse;
const { CEchoRequest, CStoreRequest } = dimse.requests;

const JPEG_BASELINE = '1.2.840.10008.1.2.4.50';
const EXPLICIT_LE = '1.2.840.10008.1.2.1';
const SOP_US = '1.2.840.10008.5.1.4.1.1.6.1';
const SOP_US_MULTIFRAME = '1.2.840.10008.5.1.4.1.1.3.1';
const SOP_PDF = '1.2.840.10008.5.1.4.1.1.104.1';

// ------------------------------------------------------------ argumentos
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const prox = process.argv[i + 1];
  if (prox === undefined || prox.startsWith('--')) args[a.slice(2)] = true;
  else { args[a.slice(2)] = prox; i++; }
}
if (!args.exame || args.exame === true) {
  console.error('Informe a pasta do exame: --exame dados\\temp\\MEG_20260901_ABD');
  process.exit(1);
}
const pasta = path.resolve(args.exame);
const AE = String(args.ae || 'MINIPACS');
const HOST = String(args.host || '127.0.0.1');
const PORTA = Number(args.porta || 2345);
const APARELHO = String(args.aparelho || 'MindrayVet');
const LIMITE = args.limite ? Number(args.limite) : Infinity;

// ------------------------------------------------------------ utilitários
/** UID DICOM determinístico (formato 2.25.<número>): o mesmo arquivo gera sempre o mesmo UID. */
const uid = (...partes) => '2.25.' + BigInt('0x' + crypto.createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 30)).toString();
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);

/** Largura, altura e componentes de cor do JPEG (lidos do cabeçalho SOF). */
function dimensoesJpeg(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7), componentes: buf[i + 9] };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('não é um JPEG válido');
}

// ------------------------------------------------------------ monta o exame
const exame = JSON.parse(fs.readFileSync(path.join(pasta, 'exame.json'), 'utf8'));
const dirFotos = ['jpg', 'fotosProcessadas'].map((d) => path.join(pasta, d)).find((d) => fs.existsSync(d));
if (!dirFotos) { console.error(`Sem fotos em ${pasta} (jpg/ ou fotosProcessadas/)`); process.exit(1); }

const studyUid = args.novo ? uid('novo', Date.now(), Math.random()) : (exame.studyInstanceUID || uid('estudo', pasta));
const serieUid = uid(studyUid, 'serie');

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const comum = { SpecificCharacterSet: 'ISO_IR 192', StudyInstanceUID: studyUid, Modality: 'US' };
const campos = {
  PatientName: exame.paciente ? [{ Alphabetic: exame.paciente }] : undefined,
  PatientID: exame.exameId, PatientSpeciesDescription: exame.especie, PatientBreedDescription: exame.raca,
  PatientSex: exame.sexo, PatientAge: exame.idade, PatientWeight: exame.peso, PatientBirthDate: exame.nascimento,
  ResponsiblePerson: exame.responsavel, AccessionNumber: exame.accessionNumber, StudyDate: exame.data,
  StudyTime: exame.hora, StudyDescription: exame.descricao, ReferringPhysicianName: exame.medicoSolicitante ? [{ Alphabetic: exame.medicoSolicitante }] : undefined,
  OperatorsName: exame.operador ? [{ Alphabetic: exame.operador }] : undefined, InstitutionName: exame.instituicao,
  Manufacturer: exame.fabricante, ManufacturerModelName: exame.modelo,
};
for (const [k, v] of Object.entries(campos)) if (v !== undefined && texto(v) !== '') comum[k] = v;

// agrupa: imagem_001.jpg = imagem; video_004_quadro001.jpg, video_004_quadro002.jpg... = um vídeo
const grupos = new Map();
for (const nome of fs.readdirSync(dirFotos).filter((n) => /\.jpe?g$/i.test(n)).sort()) {
  const q = nome.match(/^(.*)_quadro(\d+)(_[^.]*)?\.jpe?g$/i);
  const chave = q ? q[1] + (q[3] || '') : nome;
  if (!grupos.has(chave)) grupos.set(chave, []);
  grupos.get(chave).push(nome);
}

const requisicoes = [];
let numero = 0;
for (const [chave, arquivos] of [...grupos].slice(0, LIMITE)) {
  numero++;
  const quadros = arquivos.map((n) => fs.readFileSync(path.join(dirFotos, n)));
  const { altura, largura, componentes } = dimensoesJpeg(quadros[0]);
  const num = (chave.match(/_(\d{3})/) || [])[1];
  const video = quadros.length > 1;
  const el = {
    ...comum,
    SOPClassUID: video ? SOP_US_MULTIFRAME : SOP_US,
    SOPInstanceUID: uid(studyUid, chave),
    SeriesInstanceUID: serieUid,
    InstanceNumber: String(num ? Number(num) : numero),
    Rows: altura, Columns: largura,
    SamplesPerPixel: componentes === 1 ? 1 : 3,
    PhotometricInterpretation: componentes === 1 ? 'MONOCHROME2' : 'YBR_FULL_422',
    BitsAllocated: 8, BitsStored: 8, HighBit: 7, PixelRepresentation: 0,
    PixelData: quadros.map(ab),
    _vrMap: { PixelData: 'OB' },
  };
  if (componentes !== 1) el.PlanarConfiguration = 0;
  if (video) el.NumberOfFrames = String(quadros.length);
  requisicoes.push({ descricao: video ? `vídeo ${chave} (${quadros.length} quadros)` : chave, req: new CStoreRequest(new Dataset(el, JPEG_BASELINE)) });
}

// PDFs do aparelho voltam como PDF encapsulado
const dirPdf = path.join(pasta, 'pdf');
if (fs.existsSync(dirPdf) && !args.limite) {
  for (const nome of fs.readdirSync(dirPdf).filter((n) => n.endsWith('.pdf'))) {
    requisicoes.push({
      descricao: nome,
      req: new CStoreRequest(new Dataset({
        ...comum, SOPClassUID: SOP_PDF, SOPInstanceUID: uid(studyUid, 'pdf', nome), SeriesInstanceUID: uid(studyUid, 'serie-pdf'),
        InstanceNumber: '1', DocumentTitle: nome.replace(/\.pdf$/, ''), MIMETypeOfEncapsulatedDocument: 'application/pdf',
        EncapsulatedDocument: ab(fs.readFileSync(path.join(dirPdf, nome))), _vrMap: { EncapsulatedDocument: 'OB' },
      }, EXPLICIT_LE)),
    });
  }
}

// ------------------------------------------------------------ envio
function enviar(itens) {
  return new Promise((resolve) => {
    const status = [];
    const c = new Client();
    for (const { req } of itens) {
      req.on('response', (r) => {
        status.push(r.getStatus());
        if (status.length % 25 === 0) console.log(`  ${status.length}/${itens.length} enviados...`);
      });
      c.addRequest(req);
    }
    c.on('networkError', (e) => { console.error('  erro de rede:', e.message); resolve(status); });
    c.on('associationRejected', (r) => { console.error(`  conexão recusada pelo receptor (AE "${AE}" não aceito)`, r.reason ?? ''); resolve(status); });
    c.on('closed', () => resolve(status));
    c.send(HOST, PORTA, APARELHO, AE);
  });
}

(async () => {
  await dimse.Transcoding.initializeAsync();
  console.log(`Exame: ${exame.paciente || '?'} (${path.basename(pasta)})`);
  console.log(`Envio: ${APARELHO} -> ${AE} em ${HOST}:${PORTA}${args.novo ? ' | exame NOVO' : ' | mesmo exame (reenvio substitui)'}`);
  console.log(`Itens: ${requisicoes.length} (${[...grupos].slice(0, LIMITE).filter(([, a]) => a.length > 1).length} vídeo(s))`);

  const eco = await enviar([{ req: new CEchoRequest() }]);
  if (eco[0] !== 0) { console.error('Teste de conexão (C-ECHO) falhou.'); process.exitCode = 1; return; }
  console.log('Teste de conexão (C-ECHO): ok');

  const inicio = Date.now();
  const st = await enviar(requisicoes);
  const ok = st.filter((s) => s === 0).length;
  console.log(`\n${ok}/${requisicoes.length} enviado(s) com sucesso em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  if (ok !== requisicoes.length) process.exitCode = 1;
  setTimeout(() => process.exit(), 200);
})().catch((e) => { console.error(e); process.exit(1); });

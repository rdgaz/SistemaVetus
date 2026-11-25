'use strict';
/**
 * Teste do AutoLaudoVet Desktop (receptor no notebook, sem plataforma, com painel local).
 * Sobe o receptor numa pasta temporária, simula o ultrassom por DICOM e confere a pasta e o painel.
 *
 * Uso: node tests/desktop.js   (precisa de "npm ci" em receptor/)
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const dimse = require(path.join(__dirname, '..', 'receptor', 'node_modules', 'dcmjs-dimse'));

dimse.log.setLevel('error');
const { Client, Dataset } = dimse;
const { CEchoRequest, CStoreRequest } = dimse.requests;

const AE = 'ALV_C9999';
const HOST = '127.0.0.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  OK  ' : ' FALHA'} ${msg}`); if (!cond) falhas++; };

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const portaLivre = () => new Promise((r) => { const s = net.createServer(); s.listen(0, HOST, () => { const p = s.address().port; s.close(() => r(p)); }); });

async function esperarPorta(port, segundos) {
  for (let i = 0; i < segundos * 4; i++) {
    const aberto = await new Promise((r) => { const s = net.connect(port, HOST); s.on('connect', () => { s.end(); r(true); }); s.on('error', () => r(false)); });
    if (aberto) return true;
    await sleep(250);
  }
  return false;
}

function enviar(port, ae, requests) {
  return new Promise((resolve) => {
    const respostas = [];
    let rejeitado = false;
    const c = new Client();
    for (const r of requests) { r.on('response', (x) => respostas.push(x.getStatus())); c.addRequest(r); }
    c.on('associationRejected', () => { rejeitado = true; });
    c.on('networkError', () => resolve({ respostas, rejeitado }));
    c.on('closed', () => resolve({ respostas, rejeitado }));
    c.send(HOST, port, 'MindrayVet', ae);
  });
}

function montar(uid) {
  const comum = {
    SpecificCharacterSet: 'ISO_IR 192', PatientID: 'DK-' + Date.now(), PatientName: [{ Alphabetic: 'TESTE_DESKTOP' }],
    PatientSpeciesDescription: 'Canino', PatientSex: 'M', StudyInstanceUID: uid, StudyDate: '20261124',
    StudyTime: '093000', StudyDescription: 'ABD', Modality: 'US', Manufacturer: 'Teste', ManufacturerModelName: 'Desktop',
  };
  const img = { Rows: 1, Columns: 1, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2', BitsAllocated: 8, BitsStored: 8, HighBit: 7, PixelRepresentation: 0 };
  const reqs = [];
  for (let i = 1; i <= 3; i++) {
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
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alv-desktop-'));
  const examesDir = path.join(tmp, 'Exames');
  const dicom = await portaLivre();
  const painel = await portaLivre();
  const PAINEL = `http://127.0.0.1:${painel}`;
  console.log(`Receptor ${HOST}:${dicom} (${AE}) | Painel ${PAINEL} | Pasta ${examesDir}`);

  const env = {
    ...process.env, PLATAFORMA_URL: '', AE_TITLE: AE, AE_LEGADO_CLINICA: AE, DICOM_PORT: String(dicom),
    DATA_DIR: tmp, EXAMES_DIR: examesDir, PAINEL_PORTA: String(painel), IDLE_SECONDS: '2', IP_CABO: '127.0.0.1',
  };
  const receptor = spawn(process.execPath, [path.join(__dirname, '..', 'receptor', 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '';
  receptor.stdout.on('data', (d) => { saida += d; });
  receptor.stderr.on('data', (d) => { saida += d; });
  const fim = (codigo) => { receptor.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ } process.exit(codigo); };

  try {
    ok(await esperarPorta(dicom, 20), 'porta DICOM aberta');
    ok(await esperarPorta(painel, 5), 'painel aberto');
    await dimse.Transcoding.initializeAsync();

    // painel vazio
    let s = await (await fetch(`${PAINEL}/api/status`)).json();
    ok(s.receptor.ae === AE && s.exames.length === 0 && s.ultimoContato === null, 'painel: sem exames e sem contato');
    ok(s.cabo.pronto === true, `painel: "cabo" pronto quando o IP existe (${s.cabo.placa || '-'})`);

    const echo = await enviar(dicom, AE, [new CEchoRequest()]);
    ok(echo.respostas[0] === 0, 'C-ECHO (Verify do aparelho)');
    s = await (await fetch(`${PAINEL}/api/status`)).json();
    ok(s.ultimoContato && s.ultimoContato.tipo === 'teste' && s.ultimoContato.aparelho === 'MindrayVet', 'painel: último contato = teste');

    const errado = await enviar(dicom, 'ALV_C0001', [new CEchoRequest()]);
    ok(errado.rejeitado || errado.respostas.length === 0, 'AE diferente do configurado é recusado');
    s = await (await fetch(`${PAINEL}/api/status`)).json();
    ok(s.ultimoContato.tipo === 'rejeitado' && s.rejeicoes.length === 1, 'painel: mostra a recusa');

    const uid = '1.2.826.0.1.3680043.8.498.' + Date.now();
    const st = await enviar(dicom, AE, montar(uid));
    ok(st.respostas.length === 6 && st.respostas.every((x) => x === 0), `C-STORE de 6 objetos (${st.respostas.join(',')})`);

    let ex = null;
    for (let i = 0; i < 40 && !(ex && ex.processadoEm); i++) {
      await sleep(500);
      s = await (await fetch(`${PAINEL}/api/status`)).json();
      ex = s.exames[0] || null;
    }
    ok(!!ex && ex.processadoEm, `exame processado (${ex && ex.pasta})`);
    if (!ex) return fim(1);
    ok(ex.pasta.startsWith(`${AE}/`), 'pasta da clínica: Exames/<AE>/<EXAME>');
    ok(ex.paciente === 'TESTE_DESKTOP' && ex.especie === 'Canino', 'painel: paciente e espécie');
    ok(ex.fotos === 6 && ex.pdfs === 1 && ex.medidas === 1, `painel: 6 fotos, 1 PDF, 1 medida (${ex.fotos}, ${ex.pdfs}, ${ex.medidas})`);
    ok(s.ultimoContato.tipo === 'envio', 'painel: último contato = envio');

    const dir = path.join(examesDir, ...ex.pasta.split('/'));
    ok(fs.readdirSync(path.join(dir, 'jpg')).filter((n) => n.endsWith('.jpg')).length === 6, '6 fotos na pasta jpg/');
    ok(fs.readdirSync(path.join(dir, 'pdf')).length === 1, '1 PDF na pasta pdf/');
    ok(!fs.existsSync(path.join(dir, 'dicom-imagem')), 'originais .dcm das imagens apagados depois de extrair');

    const foto = await fetch(`${PAINEL}/foto?pasta=${encodeURIComponent(ex.pasta)}&arquivo=${encodeURIComponent(ex.capa)}`);
    ok(foto.ok && foto.headers.get('content-type') === 'image/jpeg', 'painel: foto acessível');
    const fora = await fetch(`${PAINEL}/foto?pasta=${encodeURIComponent('../..')}&arquivo=x.jpg`);
    ok(fora.status === 400, 'painel: pasta fora dos exames é recusada');
    const outroSite = await fetch(`${PAINEL}/api/status`, { headers: { origin: 'https://exemplo.com' } });
    ok(outroSite.status === 403, 'painel: pedido vindo de outro site é recusado');
    const pagina = await (await fetch(`${PAINEL}/`)).text();
    ok(pagina.includes('AutoLaudoVet Desktop'), 'painel: página abre');
  } catch (e) {
    console.error(e);
    falhas++;
  }
  if (falhas) console.log('\n--- log do receptor ---\n' + saida);
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  setTimeout(() => fim(falhas ? 1 : 0), 200);
})();

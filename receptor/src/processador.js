'use strict';
// Processa os arquivos recebidos de um exame: gera as fotos, extrai PDF e medidas, atualiza o exame.json.
const fs = require('fs');
const path = require('path');
const { Dataset } = require('dcmjs-dimse');
const config = require('./config');
const log = require('./log');
const { FORMATOS, FOTOS, str, lerExameJson, gravarExameJson } = require('./exames');

const JPEG_TS = ['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51'];

const toBuffer = (v) => {
  const x = Array.isArray(v) ? v[0] : v;
  if (!x) return null;
  return Buffer.isBuffer(x) ? x : Buffer.from(x instanceof ArrayBuffer ? x : x.buffer || x);
};

function nomeLivre(dir, base, ext, sufixo) {
  let nome = `${base}${ext}`;
  if (fs.existsSync(path.join(dir, nome))) nome = `${base}_${sufixo}${ext}`;
  return nome;
}

/** Imagem ou vídeo em JPEG -> .jpg em fotosProcessadas (cópia exata, sem recompressão). */
function gerarFotos(ds, el, pastaExame, formato) {
  if (!JPEG_TS.includes(ds.getTransferSyntaxUid())) return { mantido: true, motivo: `sintaxe ${ds.getTransferSyntaxUid()} não é JPEG` };
  const frames = el.PixelData || [];
  if (!frames.length) throw new Error('sem dados de imagem');
  const dir = path.join(pastaExame, FOTOS);
  fs.mkdirSync(dir, { recursive: true });
  const num = String(str(el.InstanceNumber) || '0').padStart(3, '0');
  const tail = str(el.SOPInstanceUID).split('.').pop() || Date.now();
  const prefixo = formato === FORMATOS.VIDEO ? `video_${num}` : `imagem_${num}`;
  let base = prefixo;
  if (fs.existsSync(path.join(dir, `${prefixo}.jpg`)) || fs.existsSync(path.join(dir, `${prefixo}_quadro001.jpg`))) base = `${prefixo}_${tail}`;
  frames.forEach((f, i) => {
    const nome = frames.length > 1 ? `${base}_quadro${String(i + 1).padStart(3, '0')}.jpg` : `${base}.jpg`;
    fs.writeFileSync(path.join(dir, nome), toBuffer(f));
  });
  return { fotos: frames.length };
}

/** PDF encapsulado -> pdf/<titulo>.pdf */
function extrairPdf(el, pastaExame) {
  const buf = toBuffer(el.EncapsulatedDocument);
  if (!buf || !buf.length) throw new Error('PDF vazio');
  const dir = path.join(pastaExame, FORMATOS.PDF);
  const titulo = str(el.DocumentTitle).replace(/[^\wÀ-ÿ -]/g, '_').trim() || 'relatorio';
  const nome = nomeLivre(dir, titulo, '.pdf', str(el.SOPInstanceUID).split('.').pop());
  fs.writeFileSync(path.join(dir, nome), buf);
  return { pdf: nome };
}

/** Relatório estruturado -> lista de medidas (nome, valor, unidade) em sr/medidas.json */
function extrairMedidas(el, pastaExame) {
  const medidas = [];
  const andar = (itens, contexto) => {
    for (const it of [].concat(itens || [])) {
      const nome = str(it.ConceptNameCodeSequence && [].concat(it.ConceptNameCodeSequence)[0]?.CodeMeaning);
      const mv = it.MeasuredValueSequence && [].concat(it.MeasuredValueSequence)[0];
      if (mv && mv.NumericValue !== undefined) {
        const un = mv.MeasurementUnitsCodeSequence && [].concat(mv.MeasurementUnitsCodeSequence)[0];
        medidas.push({ grupo: contexto.join(' > '), nome, valor: Number(str(mv.NumericValue)), unidade: str(un?.CodeValue) });
      }
      if (it.ContentSequence) andar(it.ContentSequence, nome ? [...contexto, nome] : contexto);
    }
  };
  andar(el.ContentSequence, []);
  const f = path.join(pastaExame, FORMATOS.SR, 'medidas.json');
  let atuais = [];
  try { atuais = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* primeiro SR */ }
  fs.writeFileSync(f, JSON.stringify(atuais.concat(medidas), null, 2));
  return { medidas: medidas.length };
}

function removerPastasVazias(pastaExame) {
  for (const sub of Object.values(FORMATOS)) {
    const d = path.join(pastaExame, sub);
    if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  }
}

function contar(dir, filtro) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(filtro).length : 0;
}

/**
 * Processa os arquivos recebidos de um exame.
 * @param {string} pasta nome da pasta do exame
 * @param {{file:string, formato:string}[]} arquivos
 */
function processarExame(pasta, arquivos) {
  const pastaExame = path.join(config.tempDir, pasta);
  const r = { imagens: 0, videos: 0, fotos: 0, pdfs: 0, medidas: 0, mantidos: 0, erros: 0 };
  log(`[PROCESSANDO] ${pasta}: ${arquivos.length} arquivo(s)`);

  for (const { file, formato } of arquivos) {
    if (!fs.existsSync(file)) continue;
    try {
      const ds = Dataset.fromFile(file);
      const el = ds.getElements();
      let res;
      if (formato === FORMATOS.IMAGEM || formato === FORMATOS.VIDEO) {
        res = gerarFotos(ds, el, pastaExame, formato);
        if (!res.mantido) { r.fotos += res.fotos; formato === FORMATOS.VIDEO ? r.videos++ : r.imagens++; }
      } else if (formato === FORMATOS.PDF) {
        res = extrairPdf(el, pastaExame);
        r.pdfs++;
      } else if (formato === FORMATOS.SR) {
        res = extrairMedidas(el, pastaExame);
        r.medidas += res.medidas;
        res.mantido = true; // o SR original fica guardado junto do medidas.json
      } else {
        res = { mantido: true, motivo: 'formato sem conversão' };
      }
      if (res.mantido) {
        r.mantidos++;
        if (res.motivo) log(`[AVISO]     ${path.basename(file)} mantido em ${formato}/ (${res.motivo})`);
      } else if (config.apagarOriginais) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      r.erros++;
      log(`[ERRO]      ${path.basename(file)}: ${e.message} (original mantido)`);
    }
  }
  removerPastasVazias(pastaExame);

  // atualiza o exame.json com o estado atual da pasta
  const dados = lerExameJson(pasta) || { pasta };
  dados.totais = {
    fotosProcessadas: contar(path.join(pastaExame, FOTOS), (n) => n.endsWith('.jpg')),
    pdfs: contar(path.join(pastaExame, FORMATOS.PDF), (n) => n.endsWith('.pdf')),
    originaisGuardados: Object.values(FORMATOS).reduce((s, sub) => s + contar(path.join(pastaExame, sub), (n) => n.endsWith('.dcm')), 0),
  };
  dados.processadoEm = new Date().toISOString();
  gravarExameJson(pasta, dados);

  if (r.imagens) log(`[PRONTO]    ${r.imagens} imagem(ns) -> ${FOTOS}/`);
  if (r.videos) log(`[PRONTO]    ${r.videos} vídeo(s) -> quadros em ${FOTOS}/`);
  if (r.pdfs) log(`[PRONTO]    ${r.pdfs} PDF(s) -> ${FORMATOS.PDF}/`);
  if (r.medidas) log(`[PRONTO]    ${r.medidas} medida(s) -> ${FORMATOS.SR}/medidas.json`);
  log(`[PRONTO]    Fotos convertidas e salvas em: ${path.join(pastaExame, FOTOS)} (${r.fotos} nova(s), ${dados.totais.fotosProcessadas} no total)` +
    (r.erros ? ` | ${r.erros} com erro` : ''));
  return r;
}

module.exports = { processarExame };

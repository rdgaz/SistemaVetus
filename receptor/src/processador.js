'use strict';
/**
 * Processa os arquivos recebidos de um exame: gera as fotos, extrai PDF e medidas, atualiza o exame.json.
 *
 * Reenvio sem duplicar: o exame.json guarda, para cada objeto DICOM (SOPInstanceUID), os arquivos que ele gerou.
 * Quando o mesmo objeto chega de novo, os mesmos arquivos são SUBSTITUÍDOS; objetos novos são ACRESCENTADOS.
 */
const fs = require('fs');
const path = require('path');
const { Dataset } = require('dcmjs-dimse');
const config = require('./config');
const log = require('./log');
const { FORMATOS, EXTRAIDOS, MEDIDAS_JSON, str, lerExameJson, gravarExameJson } = require('./exames');
const FOTOS = EXTRAIDOS.JPG;

const JPEG_TS = ['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51'];

const toBuffer = (v) => {
  const x = Array.isArray(v) ? v[0] : v;
  if (!x) return null;
  return Buffer.isBuffer(x) ? x : Buffer.from(x instanceof ArrayBuffer ? x : x.buffer || x);
};

/** Controle de quais arquivos pertencem a qual objeto DICOM. */
class Mapa {
  constructor(porSop) {
    this.porSop = porSop || {}; // sop -> { tipo, arquivos: [caminho relativo à pasta do exame] }
    this.dono = new Map();
    for (const [sop, v] of Object.entries(this.porSop)) for (const a of v.arquivos) this.dono.set(a, sop);
  }
  /** true se o arquivo existe e foi gerado por OUTRO objeto (arquivos antigos sem dono podem ser substituídos). */
  deOutro(rel, sop) {
    const d = this.dono.get(rel);
    return d !== undefined && d !== sop;
  }
  registrar(sop, tipo, arquivos, pastaExame) {
    // remove arquivos que este objeto gerou antes e não gera mais (ex.: vídeo com menos quadros)
    for (const a of (this.porSop[sop] || {}).arquivos || []) {
      if (!arquivos.includes(a)) { fs.rmSync(path.join(pastaExame, a), { force: true }); this.dono.delete(a); }
    }
    this.porSop[sop] = { tipo, arquivos };
    for (const a of arquivos) this.dono.set(a, sop);
  }
}

/** Imagem ou vídeo em JPEG -> .jpg em jpg/ (cópia exata dos bytes do JPEG, sem recompressão). */
function gerarFotos(ds, el, pastaExame, formato, mapa, r) {
  if (!JPEG_TS.includes(ds.getTransferSyntaxUid())) return { mantido: true, motivo: `sintaxe ${ds.getTransferSyntaxUid()} não é JPEG` };
  const frames = el.PixelData || [];
  if (!frames.length) throw new Error('sem dados de imagem');
  const dir = path.join(pastaExame, FOTOS);
  fs.mkdirSync(dir, { recursive: true });

  const sop = str(el.SOPInstanceUID);
  const num = String(str(el.InstanceNumber) || '0').padStart(3, '0');
  const tail = sop.split('.').pop() || String(Date.now());
  const prefixo = formato === FORMATOS.VIDEO ? `video_${num}` : `imagem_${num}`;
  const nomes = (base) => frames.map((_, i) => (frames.length > 1 ? `${base}_quadro${String(i + 1).padStart(3, '0')}.jpg` : `${base}.jpg`));

  // mesmo número de imagem já usado por outro objeto deste exame -> acrescenta o final do UID
  let arquivos = nomes(prefixo);
  if (arquivos.some((n) => mapa.deOutro(`${FOTOS}/${n}`, sop))) arquivos = nomes(`${prefixo}_${tail}`);

  // fotos de vídeo da versão anterior do sistema (imagem_NNN_quadroMMM) são substituídas pelas novas
  if (formato === FORMATOS.VIDEO) {
    const antigo = new RegExp(`^imagem_${num}_quadro\\d+\\.jpg$`);
    for (const n of fs.readdirSync(dir)) if (antigo.test(n) && !mapa.dono.has(`${FOTOS}/${n}`)) fs.rmSync(path.join(dir, n));
  }

  arquivos.forEach((nome, i) => {
    const f = path.join(dir, nome);
    if (fs.existsSync(f)) r.substituidas++; else r.novas++;
    fs.writeFileSync(f, toBuffer(frames[i]));
  });
  mapa.registrar(sop, 'foto', arquivos.map((n) => `${FOTOS}/${n}`), pastaExame);
  return { fotos: frames.length };
}

/** PDF encapsulado (dicom-pdf/) -> pdf/<titulo>.pdf (substitui o do mesmo objeto) */
function extrairPdf(el, pastaExame, mapa) {
  const buf = toBuffer(el.EncapsulatedDocument);
  if (!buf || !buf.length) throw new Error('PDF vazio');
  const sop = str(el.SOPInstanceUID);
  const titulo = str(el.DocumentTitle).replace(/[^\wÀ-ÿ -]/g, '_').trim() || 'relatorio';
  let nome = `${titulo}.pdf`;
  if (mapa.deOutro(`${EXTRAIDOS.PDF}/${nome}`, sop)) nome = `${titulo}_${sop.split('.').pop()}.pdf`;
  fs.mkdirSync(path.join(pastaExame, EXTRAIDOS.PDF), { recursive: true });
  fs.writeFileSync(path.join(pastaExame, EXTRAIDOS.PDF, nome), buf);
  mapa.registrar(sop, 'pdf', [`${EXTRAIDOS.PDF}/${nome}`], pastaExame);
  return { pdf: nome };
}

/** Relatório estruturado (dicom-sr/) -> medidas.json na pasta do exame (substitui as medidas do mesmo relatório) */
function extrairMedidas(el, pastaExame) {
  const sop = str(el.SOPInstanceUID);
  const medidas = [];
  const andar = (itens, contexto) => {
    for (const it of [].concat(itens || [])) {
      const nome = str(it.ConceptNameCodeSequence && [].concat(it.ConceptNameCodeSequence)[0]?.CodeMeaning);
      const mv = it.MeasuredValueSequence && [].concat(it.MeasuredValueSequence)[0];
      if (mv && mv.NumericValue !== undefined) {
        const un = mv.MeasurementUnitsCodeSequence && [].concat(mv.MeasurementUnitsCodeSequence)[0];
        medidas.push({ grupo: contexto.join(' > '), nome, valor: Number(str(mv.NumericValue)), unidade: str(un?.CodeValue), sop });
      }
      if (it.ContentSequence) andar(it.ContentSequence, nome ? [...contexto, nome] : contexto);
    }
  };
  andar(el.ContentSequence, []);
  const f = path.join(pastaExame, MEDIDAS_JSON);
  let atuais = [];
  try { atuais = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* primeiro SR */ }
  fs.writeFileSync(f, JSON.stringify(atuais.filter((m) => m.sop !== sop).concat(medidas), null, 2));
  return { medidas: medidas.length };
}

function removerPastasVazias(pastaExame) {
  for (const sub of Object.values(FORMATOS)) {
    const d = path.join(pastaExame, sub);
    if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  }
}

const contar = (dir, filtro) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(filtro).length : 0);

/**
 * Processa os arquivos recebidos de um exame.
 * @param {string} pasta nome da pasta do exame
 * @param {{file:string, formato:string}[]} arquivos
 */
function processarExame(pasta, arquivos) {
  const pastaExame = path.join(config.tempDir, pasta);
  const dados = lerExameJson(pasta) || { pasta };
  const mapa = new Mapa(dados.arquivosPorSop);
  const r = { imagens: 0, videos: 0, novas: 0, substituidas: 0, pdfs: 0, medidas: 0, mantidos: 0, erros: 0 };
  log(`[PROCESSANDO] ${pasta}: ${arquivos.length} arquivo(s)`);

  // o mesmo arquivo pode ter chegado duas vezes no mesmo envio: processa uma vez só
  const unicos = [...new Map(arquivos.map((a) => [a.file, a])).values()];

  for (const { file, formato } of unicos) {
    if (!fs.existsSync(file)) continue;
    try {
      const ds = Dataset.fromFile(file);
      const el = ds.getElements();
      let res;
      if (formato === FORMATOS.IMAGEM || formato === FORMATOS.VIDEO) {
        res = gerarFotos(ds, el, pastaExame, formato, mapa, r);
        if (!res.mantido) { formato === FORMATOS.VIDEO ? r.videos++ : r.imagens++; }
      } else if (formato === FORMATOS.PDF) {
        res = extrairPdf(el, pastaExame, mapa);
        r.pdfs++;
      } else if (formato === FORMATOS.SR) {
        res = extrairMedidas(el, pastaExame);
        r.medidas += res.medidas;
        res.mantido = true; // o SR original fica guardado em dicom-sr/
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

  // atualiza o exame.json com o estado atual da pasta (relê: o receptor pode tê-lo completado)
  const final = { ...(lerExameJson(pasta) || dados) };
  final.arquivosPorSop = mapa.porSop;
  final.totais = {
    fotos: contar(path.join(pastaExame, FOTOS), (n) => n.endsWith('.jpg')),
    pdfs: contar(path.join(pastaExame, EXTRAIDOS.PDF), (n) => n.endsWith('.pdf')),
    originaisGuardados: Object.values(FORMATOS).reduce((s, sub) => s + contar(path.join(pastaExame, sub), (n) => n.endsWith('.dcm')), 0),
  };
  final.processadoEm = new Date().toISOString();
  gravarExameJson(pasta, final);

  if (r.imagens) log(`[PRONTO]    ${r.imagens} imagem(ns) -> ${FOTOS}/`);
  if (r.videos) log(`[PRONTO]    ${r.videos} vídeo(s) -> quadros em ${FOTOS}/`);
  if (r.pdfs) log(`[PRONTO]    ${r.pdfs} PDF(s) -> ${EXTRAIDOS.PDF}/`);
  if (r.medidas) log(`[PRONTO]    ${r.medidas} medida(s) -> ${MEDIDAS_JSON}`);
  log(`[PRONTO]    Fotos extraídas e salvas em: ${path.join(pastaExame, FOTOS)}`);
  log(`[PRONTO]    ${r.novas} foto(s) nova(s), ${r.substituidas} substituída(s), ${final.totais.fotos} no total` +
    (r.erros ? ` | ${r.erros} com erro` : ''));
  return r;
}

module.exports = { processarExame };

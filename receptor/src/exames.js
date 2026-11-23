'use strict';
/**
 * Organização dos exames na pasta temporária:
 *
 *   <temp>/<EXAME>/
 *       exame.json            dados do exame (paciente, espécie, data, contagens...)
 *       medidas.json          medidas extraídas do relatório estruturado (SR)
 *     originais recebidos (.dcm), um subdiretório por tipo:
 *       dicom-imagem/         imagens paradas
 *       dicom-video/          clipes/vídeos (vários quadros)
 *       dicom-pdf/            PDF encapsulado
 *       dicom-sr/             relatórios estruturados (medidas)
 *       dicom-outro/          qualquer outro objeto DICOM
 *     arquivos extraídos dos .dcm, um subdiretório por formato:
 *       jpg/                  fotos (imagens e quadros dos vídeos)
 *       pdf/                  relatórios PDF
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

/** Subdiretórios dos originais recebidos (.dcm), por tipo. */
const FORMATOS = {
  IMAGEM: 'dicom-imagem',
  VIDEO: 'dicom-video',
  PDF: 'dicom-pdf',
  SR: 'dicom-sr',
  OUTRO: 'dicom-outro',
};
/** Subdiretórios dos arquivos extraídos, com o nome do formato. */
const EXTRAIDOS = {
  JPG: 'jpg',
  PDF: 'pdf',
};
const EXAME_JSON = 'exame.json';
const MEDIDAS_JSON = 'medidas.json';

const SOP_PDF = '1.2.840.10008.5.1.4.1.1.104.1';
const SOP_SR_PREFIX = '1.2.840.10008.5.1.4.1.1.88.';

/** Converte qualquer valor "naturalizado" do dcmjs em texto simples. */
function str(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join('\\');
  if (typeof v === 'object') return v.Alphabetic !== undefined ? String(v.Alphabetic).trim() : '';
  return String(v).replace(/\0/g, '').trim();
}

const seguro = (s) => str(s).replace(/[^\wÀ-ÿ -]/g, '_').replace(/\s+/g, ' ').trim();

/** Nome base da pasta do exame: PACIENTE_DATA_EXAME */
function nomeBase(el) {
  return [seguro(el.PatientName) || 'SEM_NOME', seguro(el.StudyDate), seguro(el.StudyDescription)].filter(Boolean).join('_');
}

/** Formato do objeto DICOM recebido (define a subpasta). */
function classificar(el) {
  const sop = str(el.SOPClassUID);
  if (sop === SOP_PDF) return FORMATOS.PDF;
  if (sop.startsWith(SOP_SR_PREFIX)) return FORMATOS.SR;
  if (el.PixelData !== undefined) return Number(str(el.NumberOfFrames) || 1) > 1 ? FORMATOS.VIDEO : FORMATOS.IMAGEM;
  return FORMATOS.OUTRO;
}

// StudyInstanceUID -> nome da pasta (cache; reconstruído a partir dos exame.json ao iniciar)
const pastasPorEstudo = new Map();

/** Move o conteúdo de origem para destino (criando o destino) e remove a origem se ficar vazia. */
function moverConteudo(origem, destino, filtro = () => true) {
  if (!fs.existsSync(origem)) return;
  for (const n of fs.readdirSync(origem).filter(filtro)) {
    fs.mkdirSync(destino, { recursive: true });
    fs.renameSync(path.join(origem, n), path.join(destino, n));
  }
  if (fs.readdirSync(origem).length === 0) fs.rmdirSync(origem);
}

/**
 * Converte um exame da organização antiga para a atual:
 * fotosProcessadas/ -> jpg/, pdf/*.dcm -> dicom-pdf/, sr/ -> dicom-sr/ (medidas.json vai para a raiz).
 */
function migrarPastaAntiga(nome) {
  const dir = path.join(config.tempDir, nome);
  const antigos = ['fotosProcessadas', 'sr'].some((d) => fs.existsSync(path.join(dir, d)))
    || (fs.existsSync(path.join(dir, 'pdf')) && fs.readdirSync(path.join(dir, 'pdf')).some((n) => n.endsWith('.dcm')));
  if (!antigos) return false;

  moverConteudo(path.join(dir, 'fotosProcessadas'), path.join(dir, EXTRAIDOS.JPG));
  moverConteudo(path.join(dir, 'pdf'), path.join(dir, FORMATOS.PDF), (n) => n.endsWith('.dcm'));
  const srAntigo = path.join(dir, 'sr');
  if (fs.existsSync(path.join(srAntigo, MEDIDAS_JSON))) fs.renameSync(path.join(srAntigo, MEDIDAS_JSON), path.join(dir, MEDIDAS_JSON));
  moverConteudo(srAntigo, path.join(dir, FORMATOS.SR));

  const j = lerExameJson(nome);
  if (j) {
    for (const v of Object.values(j.arquivosPorSop || {})) {
      v.arquivos = v.arquivos.map((a) => a.replace(/^fotosProcessadas\//, `${EXTRAIDOS.JPG}/`));
    }
    if (j.totais && j.totais.fotosProcessadas !== undefined) {
      j.totais = { fotos: j.totais.fotosProcessadas, pdfs: j.totais.pdfs, originaisGuardados: j.totais.originaisGuardados };
    }
    gravarExameJson(nome, j);
  }
  return true;
}

function carregarPastasExistentes() {
  if (!fs.existsSync(config.tempDir)) return;
  const registrar = (pasta, prefixo) => {
    try {
      if (migrarPastaAntiga(pasta)) console.log(`Exame ${pasta}: pastas atualizadas para a organização atual (jpg/, pdf/, dicom-*)`);
    } catch (e) {
      console.log(`Exame ${pasta}: não foi possível atualizar as pastas (${e.message})`);
    }
    const j = lerExameJson(pasta);
    if (j && j.studyInstanceUID) pastasPorEstudo.set(chave(prefixo, j.studyInstanceUID), pasta);
  };

  for (const nome of fs.readdirSync(config.tempDir)) {
    const dir = path.join(config.tempDir, nome);
    if (!fs.statSync(dir).isDirectory()) continue;
    // pasta com exame.json (ou da organização antiga) = exame sem clínica; senão = pasta de uma clínica
    const ehExame = fs.existsSync(path.join(dir, EXAME_JSON)) || fs.existsSync(path.join(dir, 'fotosProcessadas'));
    if (ehExame) { registrar(nome, ''); continue; }
    for (const sub of fs.readdirSync(dir)) {
      if (fs.statSync(path.join(dir, sub)).isDirectory()) registrar(`${nome}/${sub}`, nome);
    }
  }
}

const chave = (prefixo, uid) => `${prefixo}|${uid}`;

/**
 * Pasta do exame para este estudo, relativa à pasta temporária: "<AE da clínica>/<EXAME>"
 * (ou só "<EXAME>" quando não há clínica, no AE antigo).
 * Reenvio do mesmo exame (mesmo StudyInstanceUID) reaproveita a mesma pasta, sem duplicar.
 * Uma pasta sem StudyInstanceUID (ex.: exame importado) também é reaproveitada.
 * Só cria PACIENTE_DATA_EXAME_2 se a pasta pertencer a OUTRO exame (UID diferente).
 */
function pastaDoExame(el, prefixo = '') {
  const uid = str(el.StudyInstanceUID) || 'sem-estudo';
  const k = chave(prefixo, uid);
  if (pastasPorEstudo.has(k)) return pastasPorEstudo.get(k);
  const base = prefixo ? `${prefixo}/${nomeBase(el)}` : nomeBase(el);
  const donos = new Map([...pastasPorEstudo].map(([kk, p]) => [p, kk.slice(kk.indexOf('|') + 1)]));
  let nome = base;
  for (let i = 2; ; i++) {
    // pasta apagada do disco: está livre (esquece o dono que estava na memória)
    const existe = fs.existsSync(path.join(config.tempDir, nome));
    const dono = existe ? donos.get(nome) || (lerExameJson(nome) || {}).studyInstanceUID : null;
    if (!dono || dono === uid) break; // pasta livre, importada ou do mesmo exame
    nome = `${base}_${i}`;
  }
  for (const [kk, p] of pastasPorEstudo) if (p === nome && kk !== k) pastasPorEstudo.delete(kk);
  pastasPorEstudo.set(k, nome);
  return nome;
}

/** Dados do exame que interessam para o sistema e para a IA. */
function dadosDoExame(el, pasta) {
  return {
    pasta,
    studyInstanceUID: str(el.StudyInstanceUID),
    exameId: str(el.PatientID),
    accessionNumber: str(el.AccessionNumber),
    paciente: str(el.PatientName),
    especie: str(el.PatientSpeciesDescription),
    raca: str(el.PatientBreedDescription),
    sexo: str(el.PatientSex),
    idade: str(el.PatientAge),
    peso: str(el.PatientWeight),
    nascimento: str(el.PatientBirthDate),
    responsavel: str(el.ResponsiblePerson),
    data: str(el.StudyDate),
    hora: str(el.StudyTime),
    descricao: str(el.StudyDescription),
    medicoSolicitante: str(el.ReferringPhysicianName),
    operador: str(el.OperatorsName),
    instituicao: str(el.InstitutionName),
    modalidade: str(el.Modality),
    fabricante: str(el.Manufacturer),
    modelo: str(el.ManufacturerModelName),
  };
}

/** Cria ou completa o exame.json com os dados do DICOM (mantém totais e mapeamentos existentes). */
function atualizarDadosDoExame(pasta, el) {
  const atual = lerExameJson(pasta);
  if (atual && atual.studyInstanceUID) return; // já tem os dados deste exame
  const novos = dadosDoExame(el, pasta);
  const mesclado = { ...(atual || {}), recebidoEm: (atual && atual.recebidoEm) || new Date().toISOString() };
  for (const [k, v] of Object.entries(novos)) if (v !== '' || mesclado[k] === undefined) mesclado[k] = v;
  if (mesclado.origem) delete mesclado.origem;
  gravarExameJson(pasta, mesclado);
}

function lerExameJson(pasta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.tempDir, pasta, EXAME_JSON), 'utf8'));
  } catch {
    return null;
  }
}

function gravarExameJson(pasta, dados) {
  const f = path.join(config.tempDir, pasta, EXAME_JSON);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(dados, null, 2));
  fs.renameSync(f + '.tmp', f);
}

module.exports = {
  FORMATOS, EXTRAIDOS, EXAME_JSON, MEDIDAS_JSON, str, seguro, classificar,
  carregarPastasExistentes, pastaDoExame, dadosDoExame, atualizarDadosDoExame, lerExameJson, gravarExameJson,
};

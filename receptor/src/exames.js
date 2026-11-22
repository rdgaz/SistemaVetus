'use strict';
/**
 * Organização dos exames na pasta temporária:
 *
 *   <temp>/<EXAME>/
 *       exame.json            dados do exame (paciente, espécie, data, contagens...)
 *       dicom-imagem/         imagens paradas recebidas (.dcm)
 *       dicom-video/          clipes/vídeos recebidos (.dcm com vários quadros)
 *       pdf/                  relatórios PDF enviados pelo aparelho
 *       sr/                   relatórios estruturados (medidas) + medidas.json
 *       dicom-outro/          qualquer outro objeto DICOM
 *       fotosProcessadas/     fotos .jpg geradas a partir das imagens e vídeos
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FORMATOS = {
  IMAGEM: 'dicom-imagem',
  VIDEO: 'dicom-video',
  PDF: 'pdf',
  SR: 'sr',
  OUTRO: 'dicom-outro',
};
const FOTOS = 'fotosProcessadas';
const EXAME_JSON = 'exame.json';

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

function carregarPastasExistentes() {
  if (!fs.existsSync(config.tempDir)) return;
  for (const nome of fs.readdirSync(config.tempDir)) {
    const f = path.join(config.tempDir, nome, EXAME_JSON);
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.studyInstanceUID) pastasPorEstudo.set(j.studyInstanceUID, nome);
    } catch { /* pasta sem exame.json: ignora */ }
  }
}

/** Pasta do exame para este estudo; evita misturar dois exames diferentes com o mesmo nome. */
function pastaDoExame(el) {
  const uid = str(el.StudyInstanceUID) || 'sem-estudo';
  if (pastasPorEstudo.has(uid)) return pastasPorEstudo.get(uid);
  const base = nomeBase(el);
  const usados = new Set(pastasPorEstudo.values());
  let nome = base;
  for (let i = 2; usados.has(nome) || fs.existsSync(path.join(config.tempDir, nome)); i++) {
    nome = `${base}_${i}`;
  }
  pastasPorEstudo.set(uid, nome);
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
  FORMATOS, FOTOS, EXAME_JSON, str, seguro, classificar,
  carregarPastasExistentes, pastaDoExame, dadosDoExame, lerExameJson, gravarExameJson,
};

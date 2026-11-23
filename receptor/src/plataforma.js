'use strict';
/**
 * Conversa com a plataforma (API .NET) pela API interna:
 *  - consultarAe: o AE Title chamado pelo ultrassom é de uma clínica ativa?
 *  - registrarExame: avisa que um exame foi recebido/processado (cria ou atualiza o exame no banco).
 * Se a plataforma estiver fora do ar, o exame fica marcado como pendente no exame.json
 * e é reenviado depois (sincronizarPendentes).
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const log = require('./log');
const { lerExameJson, gravarExameJson, EXAME_JSON } = require('./exames');

const ativa = () => Boolean(config.plataformaUrl);
const AE_CLINICA = /^VETUS_C\d{4,}$/;

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(config.plataformaUrl + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-chave-interna': config.chaveInterna },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(10000),
  });
  const texto = await r.text();
  let dados; try { dados = texto ? JSON.parse(texto) : undefined; } catch { dados = undefined; }
  return { status: r.status, dados };
}

// AE -> { resultado, em } (evita perguntar à plataforma a cada conexão)
const cacheAe = new Map();
const CACHE_MS = 30 * 1000;

/**
 * Situação de um AE Title: 'ativa', 'bloqueada', 'desconhecida' ou 'indisponivel' (plataforma fora do ar).
 */
async function consultarAe(ae) {
  const c = cacheAe.get(ae);
  if (c && Date.now() - c.em < CACHE_MS) return c.resultado;
  let resultado;
  try {
    const r = await chamar('GET', `/api/interno/clinicas/ae/${encodeURIComponent(ae)}`);
    if (r.status === 200) resultado = r.dados.ativa ? 'ativa' : 'bloqueada';
    else if (r.status === 404) resultado = 'desconhecida';
    else {
      log(`[AVISO]     plataforma respondeu ${r.status} ao consultar o AE ${ae}${r.dados && r.dados.erro ? `: ${r.dados.erro}` : ''}`);
      resultado = 'indisponivel';
    }
  } catch (e) {
    log(`[AVISO]     plataforma indisponível ao consultar o AE ${ae} (${e.message})`);
    resultado = 'indisponivel';
  }
  if (resultado !== 'indisponivel') cacheAe.set(ae, { resultado, em: Date.now() });
  return resultado;
}

/** Com a plataforma fora do ar, aceita AE no formato de clínica para não perder o exame (o registro é refeito depois). */
const aceitarSemPlataforma = (ae) => AE_CLINICA.test(ae);

/** Avisa a plataforma que o exame (pasta "<AE>/<EXAME>") está pronto. Grava o resultado no exame.json. */
async function registrarExame(ae, pasta) {
  const exame = lerExameJson(pasta);
  if (!exame) return false;
  let ok = false;
  let erro = '';
  try {
    const r = await chamar('POST', '/api/interno/exames', { aeTitle: ae, pasta, exame });
    ok = r.status === 200;
    if (ok) {
      exame.plataforma = { registrado: true, exameId: r.dados.id, em: new Date().toISOString() };
      log(`[PLATAFORMA] ${pasta}: ${r.dados.novo ? 'exame registrado' : 'exame atualizado'} (${r.dados.status})`);
    } else {
      erro = (r.dados && r.dados.erro) || `HTTP ${r.status}`;
    }
  } catch (e) {
    erro = e.message;
  }
  if (!ok) {
    exame.plataforma = { registrado: false, erro, em: new Date().toISOString() };
    log(`[AVISO]     ${pasta}: não foi possível avisar a plataforma (${erro}); nova tentativa automática depois`);
  }
  // relê antes de gravar: não sobrescrever o que o processamento acabou de escrever
  gravarExameJson(pasta, { ...(lerExameJson(pasta) || exame), plataforma: exame.plataforma });
  return ok;
}

/** Reenvia à plataforma os exames de clínicas que ainda não foram registrados. */
async function sincronizarPendentes() {
  if (!ativa() || !fs.existsSync(config.tempDir)) return;
  for (const ae of fs.readdirSync(config.tempDir)) {
    const dirAe = path.join(config.tempDir, ae);
    if (!AE_CLINICA.test(ae) || !fs.statSync(dirAe).isDirectory()) continue;
    for (const nome of fs.readdirSync(dirAe)) {
      const pasta = `${ae}/${nome}`;
      if (!fs.existsSync(path.join(config.tempDir, pasta, EXAME_JSON))) continue;
      const j = lerExameJson(pasta);
      if (j && j.totais && !(j.plataforma && j.plataforma.registrado)) await registrarExame(ae, pasta);
    }
  }
}

module.exports = { ativa, consultarAe, aceitarSemPlataforma, registrarExame, sincronizarPendentes };

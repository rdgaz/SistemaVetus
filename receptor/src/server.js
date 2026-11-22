'use strict';
/**
 * Receptor DICOM do Vetus.
 * Recebe exames do ultrassom (C-ECHO e C-STORE), separa por formato numa pasta temporária
 * e, quando o exame termina de chegar, processa: fotos, PDFs e medidas.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const dimse = require('dcmjs-dimse');
const config = require('./config');
const log = require('./log');
const exames = require('./exames');
const { processarExame } = require('./processador');

dimse.log.setLevel(config.debug ? 'info' : 'error');
const { Server, Scp, Transcoding } = dimse;
const { CEchoResponse, CStoreResponse } = dimse.responses;
const { Status, PresentationContextResult, RejectResult, RejectSource, RejectReason, TransferSyntax, SopClass } = dimse.constants;

const isStorage = (uid) => uid.startsWith('1.2.840.10008.5.1.4.1.1.');
// Prefere receber em JPEG (o que o Mindray manda), para extrair as fotos sem recompressão.
const ACCEPTED_TS = [
  TransferSyntax.JpegBaseline,
  TransferSyntax.ExplicitVRLittleEndian, TransferSyntax.ImplicitVRLittleEndian,
  ...Object.values(TransferSyntax),
].filter(Boolean);

// ------------------------------------------------------------ exames em recebimento
// StudyInstanceUID -> { pasta, arquivos: [{file, formato}], timer }
const recebendo = new Map();

function registrarRecebido(uid, pasta, file, formato) {
  let s = recebendo.get(uid);
  if (!s) {
    s = { pasta, arquivos: [], timer: null };
    recebendo.set(uid, s);
    log.linha();
    log(`[RECEBENDO] Recebendo dados: ${pasta}`);
  }
  s.arquivos.push({ file, formato });
  if (s.arquivos.length % 25 === 0) log(`[RECEBENDO]   ${s.arquivos.length} arquivos recebidos...`);
  agendar(uid, config.idleSeconds * 1000);
}

function agendar(uid, ms) {
  const s = recebendo.get(uid);
  if (!s) return;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => finalizar(uid), ms);
}

function finalizar(uid) {
  const s = recebendo.get(uid);
  if (!s) return;
  recebendo.delete(uid);
  const porFormato = {};
  for (const a of s.arquivos) porFormato[a.formato] = (porFormato[a.formato] || 0) + 1;
  log(`[RECEBIDO]  ${s.pasta}: ${s.arquivos.length} arquivo(s) (${Object.entries(porFormato).map(([f, n]) => `${f}: ${n}`).join(', ')})`);
  try {
    processarExame(s.pasta, s.arquivos);
  } catch (e) {
    log(`[ERRO]      falha ao processar ${s.pasta}: ${e.message}`);
  }
  log.linha();
}

// ------------------------------------------------------------ SCP
class VetusScp extends Scp {
  associationRequested(association) {
    this.association = association;
    const calling = association.getCallingAeTitle().trim();
    const called = association.getCalledAeTitle().trim();
    if (config.allowedCallingAEs.length && !config.allowedCallingAEs.includes(calling)) {
      log(`[REJEITADO] AE "${calling}" não está em ALLOWED_AES`);
      return this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.CallingAeNotRecognized);
    }
    if (called !== config.aeTitle) {
      log(`[REJEITADO] AE chamado "${called}" diferente de "${config.aeTitle}"`);
      return this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.CalledAeNotRecognized);
    }
    for (const c of association.getPresentationContexts()) {
      const ctx = association.getPresentationContext(c.id);
      const as = ctx.getAbstractSyntaxUid();
      if (as !== SopClass.Verification && !isStorage(as)) {
        ctx.setResult(PresentationContextResult.RejectAbstractSyntaxNotSupported);
        continue;
      }
      const proposed = ctx.getTransferSyntaxUids();
      const ts = ACCEPTED_TS.find((t) => proposed.includes(t));
      if (ts) ctx.setResult(PresentationContextResult.Accept, ts);
      else ctx.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported);
    }
    log(`[CONEXÃO]  ${calling} -> ${called} (${this.socket ? this.socket.remoteAddress : '?'})`);
    this.sendAssociationAccept();
  }

  associationReleaseRequested() {
    this.sendAssociationReleaseResponse();
    // o aparelho terminou o envio: processa já, sem esperar o tempo de inatividade
    for (const uid of this.estudos || []) agendar(uid, 500);
  }

  cEchoRequest(request, callback) {
    log(`[ECHO]      teste de conexão de ${this.association.getCallingAeTitle().trim()}`);
    const res = CEchoResponse.fromRequest(request);
    res.setStatus(Status.Success);
    callback(res);
  }

  cStoreRequest(request, callback) {
    const res = CStoreResponse.fromRequest(request);
    try {
      const ds = request.getDataset();
      const el = ds.getElements();
      const uid = exames.str(el.StudyInstanceUID) || 'sem-estudo';
      const pasta = exames.pastaDoExame(el);
      const formato = exames.classificar(el);
      const dir = path.join(config.tempDir, pasta, formato);
      fs.mkdirSync(dir, { recursive: true });

      // primeiro arquivo do exame: cria o exame.json com os dados do paciente
      if (!exames.lerExameJson(pasta)) {
        exames.gravarExameJson(pasta, { ...exames.dadosDoExame(el, pasta), recebidoEm: new Date().toISOString() });
      }

      const sop = exames.str(el.SOPInstanceUID) || request.getAffectedSopInstanceUid() || String(Date.now());
      const file = path.join(dir, sop.replace(/[^\w.-]/g, '_') + '.dcm');
      ds.toFile(file);
      if (config.debug) log(`[C-STORE]   ${pasta} | ${formato} | ${sop}`);

      (this.estudos || (this.estudos = new Set())).add(uid);
      registrarRecebido(uid, pasta, file, formato);
      res.setStatus(Status.Success);
    } catch (e) {
      log('[ERRO]      ao receber arquivo:', e.message);
      res.setStatus(Status.ProcessingFailure);
      res.setErrorComment(String(e.message).slice(0, 64));
    }
    callback(res);
  }
}

// ------------------------------------------------------------ início
(async () => {
  try { await Transcoding.initializeAsync(); } catch { log('[AVISO] codecs de imagem indisponíveis'); }
  fs.mkdirSync(config.tempDir, { recursive: true });
  exames.carregarPastasExistentes();

  const server = new Server(VetusScp);
  server.on('networkError', (e) => log('[ERRO] rede:', e.message || e));
  server.listen(config.port);

  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  log('==============================================');
  log(' Vetus - receptor DICOM ativo');
  log(` AE Title  : ${config.aeTitle}`);
  log(` Porta     : ${config.port}`);
  log(` IP(s)     : ${ips.join(', ') || '127.0.0.1'}`);
  log(` Pasta temp: ${config.tempDir}`);
  log(` Originais : ${config.apagarOriginais ? 'apagados após processar' : 'guardados'}`);
  log('==============================================');

  const parar = () => {
    log('Encerrando: processando exames pendentes...');
    for (const uid of [...recebendo.keys()]) finalizar(uid);
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
})();

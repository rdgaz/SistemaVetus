'use strict';
/**
 * Receptor DICOM do AutoLaudoVet.
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
const plataforma = require('./plataforma');
const { processarExame } = require('./processador');
const painel = require('./painel');

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
// "<AE da clínica>|<StudyInstanceUID>" -> { ae, pasta, arquivos: [{file, formato}], timer }
const recebendo = new Map();

// para o painel local: último contato do aparelho e os últimos exames processados
const estado = { inicio: new Date().toISOString(), ultimoContato: null, rejeicoes: [] };
function contato(tipo, calling, called, ip, extra = {}) {
  estado.ultimoContato = { tipo, em: new Date().toISOString(), aparelho: calling, ae: called, ip: ip || '', ...extra };
}

function registrarRecebido(uid, ae, pasta, file, formato) {
  let s = recebendo.get(uid);
  if (!s) {
    s = { ae, pasta, arquivos: [], timer: null };
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
  let processado = false;
  try {
    processarExame(s.pasta, s.arquivos);
    processado = true;
  } catch (e) {
    log(`[ERRO]      falha ao processar ${s.pasta}: ${e.message}`);
  }
  // exame de uma clínica: avisa a plataforma (que cria/atualiza o exame no banco)
  const aviso = processado && s.ae && plataforma.ativa() ? plataforma.registrarExame(s.ae, s.pasta) : Promise.resolve();
  aviso.catch((e) => log(`[ERRO]      ${s.pasta}: ${e.message}`)).finally(() => log.linha());
}

// ------------------------------------------------------------ SCP
/**
 * Clínica do exame pelo AE Title chamado pelo ultrassom.
 * Retorna { aceito, ae } — ae = pasta da clínica ('' = sem clínica, AE antigo) — ou { aceito: false, motivo }.
 */
async function clinicaDoAe(called) {
  const ae = called.toUpperCase();
  if (ae === config.aeTitle.toUpperCase()) return { aceito: true, ae: config.aeLegadoClinica };
  if (!plataforma.ativa()) return { aceito: false, motivo: `AE chamado "${called}" diferente de "${config.aeTitle}"` };
  const situacao = await plataforma.consultarAe(ae);
  if (situacao === 'ativa') return { aceito: true, ae };
  if (situacao === 'indisponivel' && plataforma.aceitarSemPlataforma(ae)) {
    log(`[AVISO]     aceitando "${ae}" sem confirmar com a plataforma (fora do ar); o exame será registrado depois`);
    return { aceito: true, ae };
  }
  return { aceito: false, motivo: situacao === 'bloqueada' ? `clínica "${ae}" está bloqueada` : `AE "${called}" não pertence a nenhuma clínica` };
}

class VetusScp extends Scp {
  async associationRequested(association) {
    this.association = association;
    const calling = association.getCallingAeTitle().trim();
    const called = association.getCalledAeTitle().trim();
    const ip = this.socket ? String(this.socket.remoteAddress || '').replace(/^::ffff:/, '') : '';
    const rejeitar = (motivo) => {
      contato('rejeitado', calling, called, ip, { motivo });
      estado.rejeicoes = [{ em: new Date().toISOString(), aparelho: calling, ae: called, ip, motivo }, ...estado.rejeicoes].slice(0, 10);
    };
    if (config.allowedCallingAEs.length && !config.allowedCallingAEs.includes(calling)) {
      rejeitar(`AE do aparelho "${calling}" não autorizado`);
      log(`[REJEITADO] AE "${calling}" não está em ALLOWED_AES`);
      return this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.CallingAeNotRecognized);
    }
    let clinica;
    try {
      clinica = await clinicaDoAe(called);
    } catch (e) {
      clinica = { aceito: false, motivo: e.message };
    }
    if (!clinica.aceito) {
      log(`[REJEITADO] ${clinica.motivo}`);
      rejeitar(clinica.motivo);
      return this.sendAssociationReject(RejectResult.Permanent, RejectSource.ServiceUser, RejectReason.CalledAeNotRecognized);
    }
    this.aeClinica = clinica.ae;
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
    log(`[CONEXÃO]  ${calling} -> ${called}${this.aeClinica && this.aeClinica !== called ? ` (clínica ${this.aeClinica})` : ''} (${this.socket ? this.socket.remoteAddress : '?'})`);
    contato('conexao', calling, called, ip);
    this.sendAssociationAccept();
  }

  associationReleaseRequested() {
    this.sendAssociationReleaseResponse();
    // o aparelho terminou o envio: processa já, sem esperar o tempo de inatividade
    for (const uid of this.estudos || []) agendar(uid, 500);
  }

  // o aparelho interrompeu a conexão (A-ABORT): os arquivos já recebidos serão processados normalmente
  abort() {
    log(`[AVISO]     conexão interrompida pelo aparelho`);
  }

  cEchoRequest(request, callback) {
    log(`[ECHO]      teste de conexão de ${this.association.getCallingAeTitle().trim()}`);
    if (estado.ultimoContato) estado.ultimoContato = { ...estado.ultimoContato, tipo: 'teste', em: new Date().toISOString() };
    const res = CEchoResponse.fromRequest(request);
    res.setStatus(Status.Success);
    callback(res);
  }

  cStoreRequest(request, callback) {
    const res = CStoreResponse.fromRequest(request);
    try {
      const ds = request.getDataset();
      const el = ds.getElements();
      const uid = `${this.aeClinica}|${exames.str(el.StudyInstanceUID) || 'sem-estudo'}`;
      const pasta = exames.pastaDoExame(el, this.aeClinica);
      const formato = exames.classificar(el);
      const dir = path.join(config.tempDir, pasta, formato);
      fs.mkdirSync(dir, { recursive: true });

      // cria ou completa o exame.json com os dados do paciente
      exames.atualizarDadosDoExame(pasta, el);

      const sop = exames.str(el.SOPInstanceUID) || request.getAffectedSopInstanceUid() || String(Date.now());
      const file = path.join(dir, sop.replace(/[^\w.-]/g, '_') + '.dcm');
      ds.toFile(file);
      if (config.debug) log(`[C-STORE]   ${pasta} | ${formato} | ${sop}`);

      (this.estudos || (this.estudos = new Set())).add(uid);
      registrarRecebido(uid, this.aeClinica, pasta, file, formato);
      if (estado.ultimoContato) estado.ultimoContato = { ...estado.ultimoContato, tipo: 'envio', em: new Date().toISOString() };
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
  server.on('networkError', (e) => {
    log('[ERRO] rede:', e.message || e);
    // porta DICOM ocupada por outro programa: o painel avisa (o aparelho não vai conseguir enviar)
    if (e && e.code === 'EADDRINUSE') estado.erroDicom = `A porta ${config.port} já está em uso por outro programa`;
  });
  server.listen(config.port);

  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  log('==============================================');
  log(' AutoLaudoVet - receptor DICOM ativo');
  log(` AE Title  : ${config.aeTitle}`);
  log(` Porta     : ${config.port}`);
  log(` IP(s)     : ${ips.join(', ') || '127.0.0.1'}`);
  log(` Pasta temp: ${config.tempDir}`);
  log(` Originais : ${config.apagarOriginais ? 'apagados após processar' : 'guardados'}`);
  if (plataforma.ativa()) {
    log(` Plataforma: ${config.plataformaUrl} (aceita o AE de cada clínica: ALV_C0002..., VETUS_C0001...)`);
    log(` AE ${config.aeTitle} : ${config.aeLegadoClinica ? `exames vão para a clínica ${config.aeLegadoClinica}` : 'exames ficam sem clínica'}`);
    if (!config.chaveInterna) log('[AVISO]     VETUS_CHAVE_INTERNA vazia: a plataforma vai recusar os avisos de exame');
  }
  if (config.painelPorta) {
    painel.iniciar({ estado, recebendo: () => [...recebendo.values()].map((s) => ({ pasta: s.pasta, arquivos: s.arquivos.length })) });
    log(` Painel    : http://127.0.0.1:${config.painelPorta}`);
  }
  log('==============================================');

  // exames de clínicas que ainda não foram avisados à plataforma (ela estava fora do ar)
  const sincronizar = () => plataforma.sincronizarPendentes().catch((e) => log('[ERRO] sincronização:', e.message));
  setTimeout(sincronizar, 10 * 1000);
  setInterval(sincronizar, 5 * 60 * 1000);

  const parar = () => {
    log('Encerrando: processando exames pendentes...');
    for (const uid of [...recebendo.keys()]) finalizar(uid);
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
})();

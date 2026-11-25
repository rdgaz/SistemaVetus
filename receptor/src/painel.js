'use strict';
/**
 * Painel local de status (usado no notebook do cliente, ligado ao aparelho por cabo de rede).
 * Só escuta em 127.0.0.1 e só responde a quem chama pelo próprio endereço (bloqueia outros sites).
 *
 *   GET  /                      página do painel
 *   GET  /api/status            cabo, último contato do aparelho, recebendo agora, exames recebidos
 *   GET  /foto?pasta=&arquivo=  uma foto de um exame (miniatura)
 *   POST /abrir?pasta=          abre a pasta do exame no Explorer (Windows)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const config = require('./config');
const log = require('./log');
const { EXAME_JSON, MEDIDAS_JSON, EXTRAIDOS, lerExameJson } = require('./exames');

const MAX_EXAMES = 100;

/** Placa de rede com o IP do cabo (null = cabo não configurado ou desligado). */
function cabo() {
  for (const [nome, ends] of Object.entries(os.networkInterfaces())) {
    const e = (ends || []).find((x) => x.family === 'IPv4' && x.address === config.ipCabo);
    if (e) return { placa: nome, ip: e.address };
  }
  return null;
}

/** Caminho absoluto de uma pasta de exame, ou null se sair da pasta de exames. */
function dirDoExame(pasta) {
  if (typeof pasta !== 'string' || !pasta || pasta.includes('\0')) return null;
  const raiz = path.resolve(config.tempDir);
  const dir = path.resolve(raiz, pasta);
  if (!dir.startsWith(raiz + path.sep)) return null;
  if (!fs.existsSync(path.join(dir, EXAME_JSON))) return null;
  return dir;
}

const relativo = (dir) => path.relative(config.tempDir, dir).split(path.sep).join('/');

function contarMedidas(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MEDIDAS_JSON), 'utf8')).length || 0; } catch { return 0; }
}

function listarFotos(dir) {
  const d = path.join(dir, EXTRAIDOS.JPG);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.endsWith('.jpg')).sort() : [];
}

/** Exames na pasta (sem clínica: <EXAME>/; com clínica: <AE>/<EXAME>/), mais recentes primeiro. */
function listarExames() {
  const raiz = config.tempDir;
  if (!fs.existsSync(raiz)) return [];
  const dirs = [];
  for (const n of fs.readdirSync(raiz)) {
    const d = path.join(raiz, n);
    if (!fs.statSync(d).isDirectory()) continue;
    if (fs.existsSync(path.join(d, EXAME_JSON))) { dirs.push(d); continue; }
    for (const s of fs.readdirSync(d)) {
      const ds = path.join(d, s);
      if (fs.statSync(ds).isDirectory() && fs.existsSync(path.join(ds, EXAME_JSON))) dirs.push(ds);
    }
  }
  return dirs.map((dir) => {
    const pasta = relativo(dir);
    const j = lerExameJson(pasta) || {};
    const fotos = listarFotos(dir);
    return {
      pasta,
      paciente: j.paciente || '',
      especie: j.especie || '',
      responsavel: j.responsavel || '',
      data: j.data || '',
      hora: j.hora || '',
      descricao: j.descricao || '',
      recebidoEm: j.recebidoEm || '',
      processadoEm: j.processadoEm || '',
      fotos: fotos.length,
      pdfs: (j.totais && j.totais.pdfs) || 0,
      medidas: contarMedidas(dir),
      capa: fotos[0] || '',
    };
  }).sort((a, b) => String(b.recebidoEm).localeCompare(String(a.recebidoEm))).slice(0, MAX_EXAMES);
}

function json(res, status, dados) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
}

/** Aceita só pedidos feitos ao próprio painel (evita que um site aberto no navegador use o painel). */
function origemLocal(req) {
  const hostOk = [`127.0.0.1:${config.painelPorta}`, `localhost:${config.painelPorta}`].includes(String(req.headers.host || '').toLowerCase());
  const origem = req.headers.origin;
  const origemOk = !origem || [`http://127.0.0.1:${config.painelPorta}`, `http://localhost:${config.painelPorta}`].includes(origem.toLowerCase());
  return hostOk && origemOk;
}

function iniciar({ estado, recebendo }) {
  const server = http.createServer((req, res) => {
    try {
      if (!origemLocal(req)) return json(res, 403, { erro: 'Acesso permitido só pelo próprio computador.' });
      const url = new URL(req.url, `http://127.0.0.1:${config.painelPorta}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(PAGINA);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return json(res, 200, {
          receptor: { ativo: true, desde: estado.inicio, ae: config.aeTitle, porta: config.port, pasta: config.tempDir, erro: estado.erroDicom || null },
          cabo: { esperado: config.ipCabo, ...(cabo() ? { pronto: true, ...cabo() } : { pronto: false }) },
          ultimoContato: estado.ultimoContato,
          rejeicoes: estado.rejeicoes,
          recebendo: recebendo(),
          exames: listarExames(),
        });
      }
      if (req.method === 'GET' && url.pathname === '/foto') {
        const dir = dirDoExame(url.searchParams.get('pasta'));
        const arq = url.searchParams.get('arquivo') || '';
        if (!dir || !/^[\w.-]+\.jpg$/.test(arq)) return json(res, 400, { erro: 'Foto inválida.' });
        const f = path.join(dir, EXTRAIDOS.JPG, arq);
        if (!fs.existsSync(f)) return json(res, 404, { erro: 'Foto não encontrada.' });
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'POST' && url.pathname === '/abrir') {
        const p = url.searchParams.get('pasta');
        const dir = p === '' ? config.tempDir : dirDoExame(p);
        if (!dir) return json(res, 400, { erro: 'Pasta inválida.' });
        if (process.platform !== 'win32') return json(res, 501, { erro: 'Só no Windows.' });
        spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
        return json(res, 200, { ok: true });
      }
      json(res, 404, { erro: 'Não encontrado.' });
    } catch (e) {
      log('[ERRO]      painel:', e.message);
      json(res, 500, { erro: 'Erro no painel.' });
    }
  });
  server.on('error', (e) => log(`[ERRO]      painel na porta ${config.painelPorta}: ${e.message}`));
  server.listen(config.painelPorta, '127.0.0.1');
  return server;
}

const PAGINA = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoLaudoVet Desktop</title>
<style>
  :root { --azul:#0E4D64; --verde:#0F766E; --cinza:#64748b; --borda:#e2e8f0; --ok:#15803d; --aviso:#b45309; --erro:#b91c1c; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color:#0f172a; background:#f8fafc; }
  header { background:var(--azul); color:#fff; padding:14px 24px; display:flex; align-items:baseline; gap:12px; }
  header b { font-size:20px; } header b span { color:#5EEAD4; } header small { opacity:.8; }
  main { max-width:1040px; margin:0 auto; padding:20px 24px 40px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px; margin-bottom:22px; }
  .card { background:#fff; border:1px solid var(--borda); border-radius:10px; padding:14px 16px; }
  .card h3 { margin:0 0 6px; font-size:13px; font-weight:600; color:var(--cinza); text-transform:uppercase; letter-spacing:.04em; }
  .sit { font-weight:600; display:flex; align-items:center; gap:8px; }
  .sit::before { content:""; width:10px; height:10px; border-radius:50%; background:currentColor; flex:none; }
  .ok { color:var(--ok); } .aviso { color:var(--aviso); } .erro { color:var(--erro); }
  .det { color:var(--cinza); font-size:13px; margin-top:4px; }
  h2 { font-size:17px; margin:0 0 10px; display:flex; justify-content:space-between; align-items:center; }
  button { font:inherit; font-size:13px; border:1px solid var(--borda); background:#fff; border-radius:7px; padding:5px 10px; cursor:pointer; }
  button:hover { border-color:var(--verde); color:var(--verde); }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--borda); border-radius:10px; overflow:hidden; }
  th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--borda); vertical-align:middle; }
  th { font-size:12px; color:var(--cinza); font-weight:600; background:#f1f5f9; }
  td.num { font-variant-numeric:tabular-nums; }
  img.capa { width:64px; height:48px; object-fit:cover; border-radius:5px; background:#0f172a; display:block; }
  .vazio { padding:28px; text-align:center; color:var(--cinza); background:#fff; border:1px dashed var(--borda); border-radius:10px; }
</style></head>
<body>
<header><b>AutoLaudo<span>Vet</span></b><small>Desktop · exames do ultrassom pelo cabo de rede</small></header>
<main>
  <div class="cards">
    <div class="card"><h3>Cabo de rede</h3><div id="cabo" class="sit">…</div><div id="caboDet" class="det"></div></div>
    <div class="card"><h3>Aparelho</h3><div id="aparelho" class="sit">…</div><div id="aparelhoDet" class="det"></div></div>
    <div class="card"><h3>Recebendo agora</h3><div id="receb" class="sit">…</div><div id="recebDet" class="det"></div></div>
  </div>
  <h2>Exames recebidos <button onclick="abrir('')">Abrir pasta dos exames</button></h2>
  <div id="exames"></div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quando = (iso) => { if (!iso) return ''; const d = new Date(iso); const s = (Date.now() - d) / 1000;
  if (s < 60) return 'agora há pouco'; if (s < 3600) return 'há ' + Math.round(s / 60) + ' min';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
const dataExame = (d, h) => d && d.length === 8 ? d.slice(6) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4) + (h && h.length >= 4 ? ' ' + h.slice(0, 2) + ':' + h.slice(2, 4) : '') : '';
function sit(id, classe, texto, det) { const e = $(id); e.className = 'sit ' + classe; e.textContent = texto; $(id + 'Det').innerHTML = det || ''; }
async function abrir(pasta) { await fetch('/abrir?pasta=' + encodeURIComponent(pasta), { method: 'POST' }); }
async function atualizar() {
  let s;
  try { s = await (await fetch('/api/status')).json(); }
  catch { sit('cabo', 'erro', 'Receptor parado', 'Abra o "AutoLaudoVet Desktop" de novo.'); return; }
  if (s.cabo.pronto) sit('cabo', 'ok', 'Pronto', 'IP ' + esc(s.cabo.ip) + ' na placa "' + esc(s.cabo.placa) + '"');
  else sit('cabo', 'aviso', 'Cabo desligado ou não configurado', 'Ligue o cabo no aparelho. Esperado o IP ' + esc(s.cabo.esperado) + ' na placa de rede com fio.');
  const c = s.ultimoContato;
  if (s.receptor.erro) sit('aparelho', 'erro', 'Não consegue receber', esc(s.receptor.erro) + '. Feche o outro programa que usa a porta ' + s.receptor.porta + ' (ex.: outro receptor DICOM ou o Docker) e abra o AutoLaudoVet Desktop de novo.');
  else if (!c) sit('aparelho', 'aviso', 'Sem contato ainda', 'No aparelho: servidor ' + esc(s.cabo.esperado) + ', porta ' + s.receptor.porta + ', AE ' + esc(s.receptor.ae) + '. Use "Verificar".');
  else if (c.tipo === 'rejeitado') sit('aparelho', 'erro', 'Conexão recusada ' + quando(c.em), esc(c.motivo) + '. Confira o AE no aparelho: ' + esc(s.receptor.ae) + '.');
  else sit('aparelho', 'ok', (c.tipo === 'teste' ? 'Teste OK ' : c.tipo === 'envio' ? 'Enviou exame ' : 'Conectado ') + quando(c.em), esc(c.aparelho) + (c.ip ? ' · ' + esc(c.ip) : ''));
  const r = s.recebendo;
  if (r.length) sit('receb', 'ok', r.reduce((t, x) => t + x.arquivos, 0) + ' arquivo(s)', r.map((x) => esc(x.pasta)).join('<br>'));
  else sit('receb', '', 'Nada', 'Aguardando o aparelho enviar.');
  const ex = s.exames;
  $('exames').innerHTML = !ex.length ? '<div class="vazio">Nenhum exame recebido ainda.</div>'
    : '<table><thead><tr><th></th><th>Paciente</th><th>Exame</th><th>Recebido</th><th>Fotos</th><th>PDF</th><th>Medidas</th><th></th></tr></thead><tbody>'
      + ex.map((e) => '<tr><td>' + (e.capa ? '<img class="capa" loading="lazy" src="/foto?pasta=' + encodeURIComponent(e.pasta) + '&arquivo=' + encodeURIComponent(e.capa) + '">' : '') + '</td>'
        + '<td><b>' + esc(e.paciente || 'Sem nome') + '</b><div class="det">' + esc([e.especie, e.responsavel].filter(Boolean).join(' · ')) + '</div></td>'
        + '<td>' + esc(e.descricao) + '<div class="det">' + dataExame(e.data, e.hora) + '</div></td>'
        + '<td>' + quando(e.recebidoEm) + '</td><td class="num">' + e.fotos + '</td><td class="num">' + e.pdfs + '</td><td class="num">' + e.medidas + '</td>'
        + '<td><button data-pasta="' + esc(e.pasta) + '" onclick="abrir(this.dataset.pasta)">Abrir</button></td></tr>').join('')
      + '</tbody></table>';
}
atualizar(); setInterval(atualizar, 3000);
</script>
</body></html>`;

module.exports = { iniciar, listarExames, dirDoExame };

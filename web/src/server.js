'use strict';
/**
 * Área administrativa do Vetus (primeira versão).
 * Lista os exames recebidos e mostra fotos, PDFs e medidas.
 * Protegida por usuário e senha (ADMIN_USER / ADMIN_PASSWORD).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'dados'));
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const PORT = Number(process.env.WEB_PORT_INTERNO || process.env.PORT || 3000);
const USER = process.env.ADMIN_USER || '';
const PASS = process.env.ADMIN_PASSWORD || '';

if (!USER || !PASS) {
  console.error('Defina ADMIN_USER e ADMIN_PASSWORD (arquivo .env) antes de iniciar a área web.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// Saúde do serviço (sem login), usada pelo Docker e pelo GitHub Actions
app.get('/saude', (req, res) => res.json({ ok: true }));

// Login simples (HTTP Basic). Use HTTPS na VPS.
const igual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
app.use((req, res, next) => {
  const [tipo, valor] = String(req.headers.authorization || '').split(' ');
  if (tipo === 'Basic' && valor) {
    const [u, ...p] = Buffer.from(valor, 'base64').toString('utf8').split(':');
    if (igual(u, USER) && igual(p.join(':'), PASS)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Vetus", charset="UTF-8"').status(401).send('Login necessário');
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (d) => (/^\d{8}$/.test(d || '') ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : esc(d));

function listarExames() {
  if (!fs.existsSync(TEMP_DIR)) return [];
  return fs.readdirSync(TEMP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      let j = {};
      try { j = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, d.name, 'exame.json'), 'utf8')); } catch { /* sem dados */ }
      return { pasta: d.name, ...j };
    })
    .sort((a, b) => String(b.recebidoEm || '').localeCompare(String(a.recebidoEm || '')));
}

/** Resolve uma pasta de exame com segurança (impede ../). */
function pastaSegura(nome) {
  const p = path.resolve(TEMP_DIR, nome);
  if (!p.startsWith(TEMP_DIR + path.sep) || !fs.existsSync(p)) return null;
  return p;
}

const pagina = (titulo, corpo) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)} · Vetus</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;background:#f5f6f8;color:#1d2330}
 header{background:#1f3b57;color:#fff;padding:12px 20px} header a{color:#fff;text-decoration:none;font-weight:600}
 main{padding:20px;max-width:1200px;margin:auto}
 table{width:100%;border-collapse:collapse;background:#fff} th,td{padding:8px 10px;border-bottom:1px solid #e3e6eb;text-align:left}
 th{background:#eef1f5;font-size:13px} tr:hover td{background:#f9fafc}
 .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
 .grade a{display:block;background:#000} .grade img{width:100%;display:block}
 .dados{background:#fff;padding:12px 16px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 16px}
 .dados b{color:#5a6475;font-weight:500;font-size:13px;display:block}
 .vazio{color:#7a8392}
</style></head><body><header><a href="/">Vetus</a> · Exames</header><main>${corpo}</main></body></html>`;

app.get('/', (req, res) => {
  const lista = listarExames();
  const linhas = lista.map((e) => `<tr>
    <td><a href="/exame/${encodeURIComponent(e.pasta)}">${esc(e.paciente || e.pasta)}</a></td>
    <td>${esc(e.especie)}</td><td>${dataBR(e.data)}</td><td>${esc(e.descricao)}</td>
    <td>${e.totais ? e.totais.fotosProcessadas : '<span class="vazio">processando…</span>'}</td>
    <td>${e.totais && e.totais.pdfs ? e.totais.pdfs : ''}</td></tr>`).join('');
  res.send(pagina('Exames', lista.length
    ? `<table><tr><th>Paciente</th><th>Espécie</th><th>Data</th><th>Exame</th><th>Fotos</th><th>PDFs</th></tr>${linhas}</table>`
    : '<p class="vazio">Nenhum exame recebido ainda.</p>'));
});

app.get('/exame/:pasta', (req, res) => {
  const dir = pastaSegura(req.params.pasta);
  if (!dir) return res.status(404).send(pagina('Não encontrado', '<p>Exame não encontrado.</p>'));
  let j = {};
  try { j = JSON.parse(fs.readFileSync(path.join(dir, 'exame.json'), 'utf8')); } catch { /* sem dados */ }
  const base = `/arquivos/${encodeURIComponent(req.params.pasta)}`;
  const ls = (sub, ext) => (fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((n) => n.endsWith(ext)).sort() : []);
  const fotos = ls('fotosProcessadas', '.jpg');
  const pdfs = ls('pdf', '.pdf');
  let medidas = [];
  try { medidas = JSON.parse(fs.readFileSync(path.join(dir, 'sr', 'medidas.json'), 'utf8')); } catch { /* sem SR */ }

  const campos = [['Paciente', j.paciente], ['Espécie', j.especie], ['Raça', j.raca], ['Sexo', j.sexo], ['Idade', j.idade],
    ['Peso', j.peso], ['Responsável', j.responsavel], ['Data', dataBR(j.data)], ['Exame', j.descricao],
    ['Veterinário', j.medicoSolicitante || j.operador], ['Aparelho', [j.fabricante, j.modelo].filter(Boolean).join(' ')], ['ID do exame', j.exameId]]
    .filter(([, v]) => v).map(([k, v]) => `<div><b>${k}</b>${k === 'Data' ? v : esc(v)}</div>`).join('');

  res.send(pagina(j.paciente || req.params.pasta, `
    <h2>${esc(j.paciente || req.params.pasta)} <small class="vazio">${esc(req.params.pasta)}</small></h2>
    <div class="dados">${campos || '<span class="vazio">Sem dados do exame.</span>'}</div>
    ${pdfs.length ? `<h3>Relatórios (PDF)</h3><ul>${pdfs.map((p) => `<li><a href="${base}/pdf/${encodeURIComponent(p)}" target="_blank">${esc(p)}</a></li>`).join('')}</ul>` : ''}
    ${medidas.length ? `<h3>Medidas</h3><table><tr><th>Grupo</th><th>Medida</th><th>Valor</th></tr>${medidas.map((m) => `<tr><td>${esc(m.grupo)}</td><td>${esc(m.nome)}</td><td>${esc(m.valor)} ${esc(m.unidade)}</td></tr>`).join('')}</table>` : ''}
    <h3>Fotos (${fotos.length})</h3>
    ${fotos.length ? `<div class="grade">${fotos.map((f) => `<a href="${base}/fotosProcessadas/${encodeURIComponent(f)}" target="_blank"><img loading="lazy" src="${base}/fotosProcessadas/${encodeURIComponent(f)}" alt="${esc(f)}"></a>`).join('')}</div>` : '<p class="vazio">Nenhuma foto.</p>'}`));
});

// API (JSON): lista de exames e detalhes, base para as próximas telas (laudo com IA etc.)
app.get('/api/exames', (req, res) => res.json(listarExames()));
app.get('/api/exames/:pasta', (req, res) => {
  const dir = pastaSegura(req.params.pasta);
  if (!dir) return res.sendStatus(404);
  let j = {};
  try { j = JSON.parse(fs.readFileSync(path.join(dir, 'exame.json'), 'utf8')); } catch { /* sem dados */ }
  const ls = (sub) => (fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).sort() : []);
  res.json({ ...j, pasta: req.params.pasta, fotos: ls('fotosProcessadas'), pdfs: ls('pdf'), formatos: fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()) });
});

// Arquivos do exame: só fotos e PDFs
app.get('/arquivos/:pasta/:sub/:arquivo', (req, res) => {
  const { pasta, sub, arquivo } = req.params;
  if (!['fotosProcessadas', 'pdf'].includes(sub)) return res.sendStatus(404);
  const dir = pastaSegura(pasta);
  if (!dir) return res.sendStatus(404);
  const f = path.resolve(dir, sub, arquivo);
  if (!f.startsWith(path.join(dir, sub) + path.sep) || !fs.existsSync(f)) return res.sendStatus(404);
  res.sendFile(f);
});

app.listen(PORT, () => console.log(`Vetus web: http://localhost:${PORT} (dados em ${TEMP_DIR})`));

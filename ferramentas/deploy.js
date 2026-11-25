'use strict';
/**
 * Deploy local no Docker com controle de versão: sobe a versão do AutoLaudoVet (plataforma/front/package.json),
 * registra em docs/VERSOES.md e reconstrói os containers. A versão aparece no rodapé e na Ajuda.
 *
 * Uso: node ferramentas/deploy.js [--minor | --major] [--nota "o que mudou"] [--sem-docker]
 *   (sem opção: sobe o último número, ex.: 0.10.0 -> 0.10.1)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.resolve(__dirname, '..');
const front = path.join(raiz, 'plataforma', 'front');
const args = process.argv.slice(2);
const nota = args.includes('--nota') ? args[args.indexOf('--nota') + 1] : '';

const pkgPath = path.join(front, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [maior, menor, patch] = pkg.version.split('.').map(Number);
const nova = args.includes('--major') ? `${maior + 1}.0.0` : args.includes('--minor') ? `${maior}.${menor + 1}.0` : `${maior}.${menor}.${patch + 1}`;

// package.json e package-lock.json
pkg.version = nova;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const lockPath = path.join(front, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = nova;
  if (lock.packages && lock.packages['']) lock.packages[''].version = nova;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

// registro das versões
const log = path.join(raiz, 'docs', 'VERSOES.md');
if (!fs.existsSync(log)) fs.writeFileSync(log, '# Versões do AutoLaudoVet\n\nUma linha por deploy (a versão aparece no rodapé e na Ajuda).\n\n');
const dia = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
fs.appendFileSync(log, `- **${nova}** — ${dia}${nota ? ` — ${nota}` : ''}\n`);
console.log(`Versão ${pkg.version.replace(/.*/, nova)} registrada em docs/VERSOES.md`);

if (args.includes('--sem-docker')) process.exit(0);
const r = spawnSync('docker', ['compose', 'up', '-d', '--build'], { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);

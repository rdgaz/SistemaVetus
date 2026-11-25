'use strict';
/**
 * Monta o pacote do AutoLaudoVet Desktop (recebe os exames do ultrassom no notebook pelo cabo de rede):
 *
 *   dist/autolaudovet.desktop/
 *     node/node.exe          o Node de quem empacota (Windows x64, >= 20)
 *     receptor/src, receptor/node_modules, receptor/package.json
 *     config.bat, iniciar.bat, iniciar-oculto.vbs, configurar-cabo.ps1, desfazer-cabo.ps1, LEIA-ME.md
 *   dist/autolaudovet.desktop.zip
 *
 * Uso: node ferramentas/empacotar-desktop.js   (rode "npm ci" em receptor/ antes)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const origem = path.join(raiz, 'autolaudovet.desktop');
const dist = path.join(raiz, 'dist');
const destino = path.join(dist, 'autolaudovet.desktop');
const zip = path.join(dist, 'autolaudovet.desktop.zip');

const falhar = (msg) => { console.error(`ERRO: ${msg}`); process.exit(1); };
if (process.platform !== 'win32') falhar('rode no Windows (o pacote leva o node.exe de quem empacota).');
if (Number(process.versions.node.split('.')[0]) < 20) falhar(`Node ${process.versions.node}: precisa ser 20 ou mais novo.`);
if (process.arch !== 'x64') console.warn(`AVISO: Node ${process.arch}; o pacote só roda em notebooks ${process.arch}.`);
if (!fs.existsSync(path.join(raiz, 'receptor', 'node_modules', 'dcmjs-dimse'))) falhar('rode "npm ci" na pasta receptor/ primeiro.');

// recomeça do zero (só dentro de dist/)
if (fs.existsSync(destino)) fs.rmSync(destino, { recursive: true, force: true });
if (fs.existsSync(zip)) fs.rmSync(zip, { force: true });
fs.mkdirSync(destino, { recursive: true });

const copiar = (de, para) => fs.cpSync(de, para, { recursive: true });
for (const n of fs.readdirSync(origem)) copiar(path.join(origem, n), path.join(destino, n));
fs.mkdirSync(path.join(destino, 'node'));
fs.copyFileSync(process.execPath, path.join(destino, 'node', 'node.exe'));
copiar(path.join(raiz, 'receptor', 'src'), path.join(destino, 'receptor', 'src'));
copiar(path.join(raiz, 'receptor', 'node_modules'), path.join(destino, 'receptor', 'node_modules'));
copiar(path.join(raiz, 'receptor', 'package.json'), path.join(destino, 'receptor', 'package.json'));

// versão do produto (a mesma do AutoLaudoVet)
const versao = JSON.parse(fs.readFileSync(path.join(raiz, 'plataforma', 'front', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(destino, 'VERSAO.txt'), `AutoLaudoVet Desktop ${versao}\nNode ${process.versions.node}\nEmpacotado em ${new Date().toISOString()}\n`);

execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${destino.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
console.log(`Pronto: ${destino}`);
console.log(`        ${zip} (${mb(zip)} MB)`);
console.log(`Versão: ${versao}, Node ${process.versions.node}`);

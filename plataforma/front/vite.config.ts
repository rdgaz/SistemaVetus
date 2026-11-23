import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// versão mostrada no rodapé e na Ajuda: número do package.json, data do build e commit (quando houver git)
const versao = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
let commit = process.env.APP_COMMIT ?? '';
if (!commit) {
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    commit = ''; // build no Docker: sem git (passe APP_COMMIT se quiser)
  }
}

// Em desenvolvimento (npm run dev), as chamadas /api vão para a API .NET em http://localhost:5080
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSAO__: JSON.stringify(versao),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_EM__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5080',
      '/saude': 'http://localhost:5080',
    },
  },
});

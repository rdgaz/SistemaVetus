import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Em desenvolvimento (npm run dev), as chamadas /api vão para a API .NET em http://localhost:5080
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:5080',
      '/saude': 'http://localhost:5080',
    },
  },
});

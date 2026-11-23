'use strict';
// Configuração por variáveis de ambiente (prontas para Docker), com padrões para rodar localmente.
const path = require('path');

const env = (name, def) => (process.env[name] !== undefined && process.env[name] !== '' ? process.env[name] : def);
const bool = (v) => ['1', 'true', 'sim', 'yes'].includes(String(v).toLowerCase());

const DATA_DIR = path.resolve(env('DATA_DIR', path.join(__dirname, '..', '..', 'dados')));

module.exports = {
  // AE "antigo" do servidor (sem clínica). Com a plataforma, cada clínica tem o seu (VETUS_C0001...).
  aeTitle: env('AE_TITLE', 'MINIPACS'),
  // Exames enviados ao AE antigo vão para esta clínica (ex.: VETUS_C0001). Vazio = ficam sem clínica, como antes.
  aeLegadoClinica: env('AE_LEGADO_CLINICA', '').trim().toUpperCase(),
  // Plataforma (API .NET): valida o AE de cada clínica e recebe o aviso de exame pronto. Vazio = sem plataforma.
  plataformaUrl: env('PLATAFORMA_URL', '').replace(/\/$/, ''),
  chaveInterna: env('VETUS_CHAVE_INTERNA', ''),
  port: Number(env('DICOM_PORT', 2345)),
  // vazio = aceita qualquer equipamento; ex.: "MindrayVet,OutroAparelho"
  allowedCallingAEs: env('ALLOWED_AES', '').split(',').map((s) => s.trim()).filter(Boolean),
  dataDir: DATA_DIR,
  // pasta temporária de processamento: <DATA_DIR>/temp/<AE da clínica>/<EXAME>/<formato>/
  // (exames sem clínica, do AE antigo: <DATA_DIR>/temp/<EXAME>/<formato>/)
  tempDir: path.join(DATA_DIR, 'temp'),
  // apaga o .dcm original depois que ele foi convertido/extraído com sucesso
  apagarOriginais: bool(env('APAGAR_ORIGINAIS', 'true')),
  // segundos sem receber imagens de um exame para considerá-lo completo
  idleSeconds: Number(env('IDLE_SECONDS', 5)),
  debug: bool(env('DEBUG', 'false')),
};

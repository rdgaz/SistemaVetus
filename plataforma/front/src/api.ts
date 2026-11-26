// Chamadas à API .NET. O login usa cookie; a clínica escolhida vai no cabeçalho X-Clinica-Id.

export type Perfil = 'Usuario' | 'Veterinario' | 'AdministradorClinica';

export const nomePerfil: Record<Perfil, string> = {
  // "Usuário" confundia com qualquer pessoa do sistema; quem não laudar é recepção/auxiliar
  Usuario: 'Recepção',
  Veterinario: 'Veterinário',
  AdministradorClinica: 'Administrador da clínica',
};

export class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

const CHAVE_CLINICA = 'vetus.clinica';
let clinicaId: string | null = localStorage.getItem(CHAVE_CLINICA);

export function clinicaGuardada() {
  return clinicaId;
}

export function definirClinica(id: string | null) {
  clinicaId = id;
  if (id) localStorage.setItem(CHAVE_CLINICA, id);
  else localStorage.removeItem(CHAVE_CLINICA);
}

/** Envia uma imagem (PNG/JPG) como corpo da requisição (logo, assinatura). */
export async function enviarImagem(url: string, arquivo: File) {
  const headers: Record<string, string> = { 'Content-Type': arquivo.type || 'application/octet-stream' };
  if (clinicaId) headers['X-Clinica-Id'] = clinicaId;
  const r = await fetch(url, { method: 'PUT', headers, body: arquivo, credentials: 'same-origin' });
  if (!r.ok) {
    const dados = await r.json().catch(() => undefined);
    throw new ErroApi(r.status, dados?.erro ?? `Erro ${r.status} ao enviar a imagem.`);
  }
}

export async function api<T = void>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (clinicaId) headers['X-Clinica-Id'] = clinicaId;

  let r: Response;
  try {
    r = await fetch(url, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor.');
  }

  const texto = await r.text();
  let dados: unknown;
  try {
    dados = texto ? JSON.parse(texto) : undefined;
  } catch {
    dados = undefined;
  }

  if (!r.ok) {
    const msg = (dados as { erro?: string } | undefined)?.erro;
    if (msg) throw new ErroApi(r.status, msg);
    if (r.status === 401) throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
    if (r.status === 429) throw new ErroApi(429, 'Muitas tentativas. Aguarde um minuto.');
    throw new ErroApi(r.status, `Erro ${r.status} no servidor.`);
  }
  return dados as T;
}

/** Envia um arquivo como corpo da requisição (pendrive: foto, PDF ou vídeo). */
export async function enviarArquivo(url: string, arquivo: File) {
  const headers: Record<string, string> = { 'Content-Type': arquivo.type || 'application/octet-stream' };
  if (clinicaId) headers['X-Clinica-Id'] = clinicaId;
  let r: Response;
  try {
    r = await fetch(url, { method: 'PUT', headers, body: arquivo, credentials: 'same-origin' });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor.');
  }
  if (!r.ok) {
    const dados = await r.json().catch(() => undefined);
    throw new ErroApi(r.status, dados?.erro ?? `Erro ${r.status} ao enviar ${arquivo.name}.`);
  }
}

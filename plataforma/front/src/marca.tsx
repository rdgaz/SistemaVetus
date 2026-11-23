// Identidade do produto: nome, logos, versão e a Moderno Tech (empresa que faz o AutoLaudoVet).
import { Link } from 'react-router';

export const PRODUTO = {
  nome: 'AutoLaudoVet',
  slogan: 'Pré-laudos de ultrassom veterinário com IA',
};

export const MODERNO_TECH = {
  nome: 'Moderno Tech',
  site: 'https://modernotech.dev/',
  logo: '/moderno-tech/logo.png',
  whatsapp: '555399038737',
};

/** Link do WhatsApp de suporte, com a mensagem já escrita. */
export function linkSuporte(assunto?: string) {
  const texto = `Olá! Vim pelo ${PRODUTO.nome} (versão ${VERSAO.versao}) e preciso de ajuda${assunto ? `: ${assunto}` : '.'}`;
  return `https://wa.me/${MODERNO_TECH.whatsapp}?text=${encodeURIComponent(texto)}`;
}

/** Versão gravada na hora do build (vite.config.ts). */
export const VERSAO = {
  versao: __APP_VERSAO__,
  commit: __APP_COMMIT__,
  buildEm: __APP_BUILD_EM__,
};

/** "v0.9.0 · build 23/11/2026 14:05 (5ca7628)" */
export function textoVersao() {
  const data = VERSAO.buildEm
    ? new Date(VERSAO.buildEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : '';
  return [`v${VERSAO.versao}`, data && `build ${data}`, VERSAO.commit && `(${VERSAO.commit})`].filter(Boolean).join(' · ');
}

/** Logo horizontal (fundo claro) ou branco (fundo escuro). */
export function Logo({ branco = false, className = '' }: { branco?: boolean; className?: string }) {
  return <img src={branco ? '/marca/logo-branco.svg' : '/marca/logo.svg'} alt={PRODUTO.nome} className={className} />;
}

/** Botão verde do WhatsApp de suporte da Moderno Tech. */
export function BotaoSuporte({ compacto = false, assunto }: { compacto?: boolean; assunto?: string }) {
  return (
    <a href={linkSuporte(assunto)} target="_blank" rel="noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg bg-green-600 font-medium text-white hover:bg-green-700 ${compacto ? 'px-3 py-1.5 text-sm' : 'min-h-11 px-4'}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      Falar com o suporte
    </a>
  );
}

/** Rodapé "Um produto Moderno Tech", com a versão e (para as clínicas) o link da Ajuda. */
export function Rodape({ comAjuda = false }: { comAjuda?: boolean }) {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-slate-600">
        <a href={MODERNO_TECH.site} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-slate-900">
          <img src={MODERNO_TECH.logo} alt="" width={28} height={28} className="rounded-md" />
          <span>Um produto <b className="text-slate-800">{MODERNO_TECH.nome}</b> · modernotech.dev</span>
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400" title="Versão do sistema">{PRODUTO.nome} {textoVersao()}</span>
          {comAjuda && <Link to="/ajuda" className="font-medium text-[#0E4D64] underline">Ajuda e manual</Link>}
        </div>
      </div>
    </footer>
  );
}

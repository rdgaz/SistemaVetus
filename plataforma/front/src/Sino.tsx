import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from './api';

type Item = { id: string; tipo: string; titulo: string; texto: string | null; link: string | null; lida: boolean; criadaEm: string };
type Resposta = { naoLidas: number; itens: Item[] };

const quando = (s: string) => {
  const min = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(s).toLocaleDateString('pt-BR');
};

/** Sino no topo: avisos do usuário (mentoria e, depois, revisões). Atualiza a cada minuto e ao voltar para a aba. */
export function Sino() {
  const [r, setR] = useState<Resposta | null>(null);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ir = useNavigate();

  const carregar = useCallback(() => api<Resposta>('GET', '/api/notificacoes').then(setR).catch(() => undefined), []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    const visivel = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', visivel);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', visivel); };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const abrir = async (n: Item) => {
    setAberto(false);
    if (!n.lida) await api('POST', `/api/notificacoes/${n.id}/lida`).catch(() => undefined);
    await carregar();
    if (n.link) ir(n.link);
  };
  const marcarTodas = async () => { await api('POST', '/api/notificacoes/lidas').catch(() => undefined); await carregar(); };

  const n = r?.naoLidas ?? 0;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        aria-label={n ? `Avisos: ${n} não lido(s)` : 'Avisos'}
        className="relative flex size-10 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {n > 9 ? '9+' : n}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[92vw] rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="font-semibold">Avisos</span>
            {n > 0 && <button type="button" onClick={marcarTodas} className="text-xs font-medium text-[#0E4D64] hover:underline">Marcar todos como lidos</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {(r?.itens.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-slate-500">Nenhum aviso.</p>}
            {r?.itens.map((x) => (
              <button key={x.id} type="button" onClick={() => abrir(x)}
                className={`block w-full border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${x.lida ? '' : 'bg-sky-50/60'}`}>
                <div className="flex items-start gap-2">
                  {!x.lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#0E4D64]" aria-label="não lido" />}
                  <div className="min-w-0">
                    <div className={`text-sm ${x.lida ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{x.titulo}</div>
                    {x.texto && <div className="line-clamp-2 text-xs text-slate-600">{x.texto}</div>}
                    <div className="mt-0.5 text-[11px] text-slate-400">{quando(x.criadaEm)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

type Prompt = { sistema: string; texto: string; fotos: string[]; tokensTexto: number };

/** Mostra o prompt que a IA recebe numa análise completa do exame (instruções, dados e lista de fotos), sem chamar a IA. */
export function VerPrompt({ url, aoFechar }: { url: string; aoFechar: () => void }) {
  const [p, setP] = useState<Prompt | null>(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    api<Prompt>('GET', url).then(setP).catch((e) => setErro(e.message));
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar.current(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [url]);

  const completo = p
    ? `==== INSTRUÇÕES (SISTEMA) ====\n\n${p.sistema}\n\n==== DADOS DO EXAME ====\n\n${p.texto}\n\n==== FOTOS ENVIADAS ====\n\n${p.fotos.join('\n')}`
    : '';
  const copiar = async () => { await navigator.clipboard.writeText(completo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); };
  const bloco = (titulo: string, texto: string, nota?: string) => (
    <section className="mb-4">
      <h4 className="mb-1 text-sm font-semibold text-slate-700">{titulo}</h4>
      {nota && <p className="mb-1 text-xs text-slate-500">{nota}</p>}
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">{texto}</pre>
    </section>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div role="dialog" aria-modal="true" aria-label="O que vai para a IA" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-lg font-semibold text-slate-800">O que vai para a IA</h3>
          {p && <button type="button" onClick={copiar} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{copiado ? '✓ Copiado' : 'Copiar tudo'}</button>}
          <button type="button" onClick={aoFechar} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Fechar ✕</button>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          É o que a IA receberia numa análise completa deste exame agora (sem chamar a IA e sem custo): as instruções, os
          aprendizados desta clínica, os dados do exame e a lista das fotos. As fotos em si vão junto, uma a uma.
          {p && <> Texto: cerca de {p.tokensTexto.toLocaleString('pt-BR')} tokens, mais {p.fotos.length} foto(s).</>}
        </p>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        {!p && !erro && <p className="text-slate-500">Montando o prompt…</p>}
        {p && (
          <>
            {bloco('1. Instruções (iguais para todos os exames, mais o banco de frases e os aprendizados da clínica)', p.sistema)}
            {bloco('2. Dados do exame', p.texto)}
            {bloco(`3. Fotos enviadas (${p.fotos.length})`, p.fotos.join('\n'), 'Com a descrição, a medição ou a anotação do operador que a IA recebe de cada uma.')}
          </>
        )}
      </div>
    </div>
  );
}

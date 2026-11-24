// Componentes visuais simples, pensados para celular e computador (alvos de toque grandes).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Botao({
  variante = 'primario',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'perigo' }) {
  const cores = {
    primario: 'bg-[#0E4D64] text-white hover:bg-[#0B3D50] disabled:bg-slate-400',
    secundario: 'bg-white text-[#0E4D64] border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    perigo: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
  }[variante];
  return (
    <button
      {...p}
      className={`min-h-11 rounded-lg px-4 font-medium transition-colors disabled:cursor-not-allowed ${cores} ${className}`}
    />
  );
}

export function Campo({
  rotulo,
  dica,
  ...p
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      <input
        {...p}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-[#0E4D64] focus:ring-2 focus:ring-[#0E4D64]/20 disabled:bg-slate-100"
      />
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Selecao({
  rotulo,
  children,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string; children: ReactNode }) {
  const select = (
    <select
      {...p}
      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-[#0E4D64]"
    >
      {children}
    </select>
  );
  if (!rotulo) return select;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      {select}
    </label>
  );
}

export function Cartao({ titulo, acoes, children }: { titulo?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {(titulo || acoes) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  const cores = {
    erro: 'border-red-200 bg-red-50 text-red-800',
    ok: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tipo];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cores}`}>{children}</div>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 text-2xl font-semibold text-slate-800">{children}</h1>;
}

/** Valor que só é mostrado uma vez (senha provisória, token): com botão de copiar. */
export function Segredo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="text-sm font-medium text-amber-900">{rotulo}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-white px-2 py-1 font-mono text-sm">{valor}</code>
        <button
          type="button"
          className="text-sm font-medium text-[#0E4D64] underline"
          onClick={() => navigator.clipboard?.writeText(valor)}
        >
          Copiar
        </button>
      </div>
      <div className="mt-1 text-xs text-amber-800">Anote agora: este valor não será mostrado de novo.</div>
    </div>
  );
}

/** Alerta fixo nas telas de pré-laudo e revisão: o texto é sugestão da IA e precisa ser conferido pelo veterinário. */
export function AvisoIa() {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <span aria-hidden className="text-lg leading-none">⚠</span>
      <div>
        <b>Estas informações são sugestões geradas por inteligência artificial.</b> Confira todos os dados —
        achados, medidas, impressão diagnóstica e recomendações — com as imagens e com o exame antes de aprovar e assinar.
        A responsabilidade pelo laudo é do médico-veterinário.
      </div>
    </div>
  );
}

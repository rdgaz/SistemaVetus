import { useEffect, useState } from 'react';
import { api } from '../api';
import { reais } from '../dinheiro';
import { Aviso, Cartao } from '../ui';

type Linha = {
  clinicaId: string; clinica: string; teste?: boolean; saldoAtual: number; recebido: number; creditosGratis: number; ajustes: number;
  consumo: number; custo: number; lucro: number; usos: number; semCusto: number;
};
type Escopo = 'reais' | 'testes' | 'todas';
type Relatorio = {
  escopo?: Escopo;
  clinicas: Linha[];
  total: Omit<Linha, 'clinicaId' | 'clinica' | 'teste' | 'saldoAtual'> & { saldoClinicas: number };
  custoPorIa: { ia: string; custo: number; usos: number }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nomeIa: Record<string, string> = { gemini: 'Google (Gemini)', claude: 'Anthropic (Claude)', simulado: 'Simulado' };

function periodo(p: string): { de?: string; ate?: string } {
  const hoje = new Date();
  if (p === 'mes') return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) };
  if (p === 'anterior') return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
  if (p === '30') return { de: iso(new Date(hoje.getTime() - 29 * 86400000)), ate: iso(hoje) };
  return {};
}

/**
 * Financeiro (administrador do sistema): por clínica, quanto ela pagou (recargas), quanto consumiu de créditos, quanto isso
 * custou de verdade nos provedores e o lucro, no período escolhido.
 */
export function Financeiro() {
  const [p, setP] = useState('mes');
  const [escopo, setEscopo] = useState<Escopo>('reais');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [r, setR] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const f = p === 'personalizado' ? { de: de || undefined, ate: ate || undefined } : periodo(p);
    const params = { ...f, escopo };
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    api<Relatorio>('GET', `/api/admin/financeiro${q ? `?${q}` : ''}`).then((x) => { setR(x); setErro(''); }).catch((e) => setErro(e.message));
  }, [p, de, ate, escopo]);

  const opcoes: [string, string][] = [['mes', 'Este mês'], ['anterior', 'Mês passado'], ['30', 'Últimos 30 dias'], ['tudo', 'Tudo'], ['personalizado', 'Escolher datas']];
  const escopos: [Escopo, string][] = [['reais', 'Clínicas reais'], ['testes', 'Somente testes'], ['todas', 'Todas']];
  const td = 'px-2 py-1.5 text-right tabular-nums';

  return (
    <Cartao titulo="Financeiro por clínica">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {opcoes.map(([v, t]) => (
            <button key={v} type="button" onClick={() => setP(v)}
              className={`min-h-9 rounded-full border px-3 text-sm font-medium ${p === v ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{t}</button>
          ))}
          {p === 'personalizado' && (
            <span className="flex items-center gap-1 text-sm">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="min-h-9 rounded border border-slate-300 px-2" />
              até
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="min-h-9 rounded border border-slate-300 px-2" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {escopos.map(([v, t]) => (
            <button key={v} type="button" onClick={() => setEscopo(v)}
              className={`min-h-8 rounded-full px-3 text-xs font-semibold ${escopo === v ? (v === 'testes' ? 'bg-violet-700 text-white' : 'bg-[#0E4D64] text-white') : 'text-slate-600 hover:text-slate-900'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {r && (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            {[
              ['Recebido das clínicas', r.total.recebido, 'recargas pagas'],
              ['Consumido pelas clínicas', r.total.consumo, `${r.total.usos} uso(s) de IA`],
              ['Seu custo real', r.total.custo, 'pago aos provedores'],
              ['Lucro', r.total.lucro, 'consumido − custo'],
            ].map(([t, v, n]) => (
              <div key={t as string} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{t}</div>
                <div className={`text-lg font-semibold ${t === 'Lucro' && (v as number) < 0 ? 'text-red-700' : ''}`}>{reais(v as number)}</div>
                <div className="text-xs text-slate-500">{n}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-2 py-1.5 text-left">Clínica</th><th className={td}>Recebido</th><th className={td}>Créditos grátis</th>
                <th className={td}>Consumido</th><th className={td}>Seu custo</th><th className={td}>Lucro</th><th className={td}>Usos</th><th className={td}>Saldo atual</th>
              </tr></thead>
              <tbody>
                {r.clinicas.map((c) => (
                  <tr key={c.clinicaId} className="border-b border-slate-100">
                    <td className="px-2 py-1.5">
                      {c.clinica}
                      {c.teste && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">TESTE</span>}
                    </td>
                    <td className={td}>{reais(c.recebido)}</td>
                    <td className={td}>{reais(c.creditosGratis)}</td>
                    <td className={td}>{reais(c.consumo)}</td>
                    <td className={td}>{reais(c.custo)}{c.semCusto > 0 && <span title={`${c.semCusto} uso(s) antigo(s) sem custo registrado`} className="text-amber-600"> *</span>}</td>
                    <td className={`${td} ${c.lucro < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{reais(c.lucro)}</td>
                    <td className={td}>{c.usos}</td>
                    <td className={td}>{reais(c.saldoAtual)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1.5">Total</td>
                  <td className={td}>{reais(r.total.recebido)}</td><td className={td}>{reais(r.total.creditosGratis)}</td>
                  <td className={td}>{reais(r.total.consumo)}</td><td className={td}>{reais(r.total.custo)}</td>
                  <td className={td}>{reais(r.total.lucro)}</td><td className={td}>{r.total.usos}</td><td className={td}>{reais(r.total.saldoClinicas)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {r.custoPorIa.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">
              Seu custo por provedor no período: {r.custoPorIa.map((x) => `${nomeIa[x.ia] ?? x.ia}: ${reais(x.custo)} (${x.usos} uso(s))`).join(' · ')}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            "Recebido" são as recargas lançadas para a clínica; "Créditos grátis", o crédito inicial; "Consumido", o que a clínica gastou
            dos créditos (pré-laudos e padronizações de texto); "Seu custo", o que isso custou nos provedores.
            {r.total.semCusto > 0 && ' * Usos antigos, de antes deste controle, sem custo registrado.'} O saldo atual não depende do período.
          </p>
        </>
      )}
    </Cartao>
  );
}

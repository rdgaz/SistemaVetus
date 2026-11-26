import { useEffect, useState } from 'react';
import { api } from '../api';
import { nomeMovimento, reais } from '../dinheiro';
import { useSessao } from '../sessao';

type Movimento = { tipo: string; valor: number; saldoApos: number; descricao: string; em: string };
type Saldo = { saldo: number; mediaPorLaudo: number; laudosEstimados: number | null; extrato: Movimento[] | null };

/** Saldo de créditos de IA da clínica e quantos pré-laudos ele rende (média dos últimos). */
export function SaldoClinica({ comExtrato = false }: { comExtrato?: boolean }) {
  const { clinica } = useSessao();
  const [s, setS] = useState<Saldo | null>(null);

  useEffect(() => {
    if (!clinica) return;
    api<Saldo>('GET', '/api/clinica/saldo').then(setS).catch(() => setS(null));
  }, [clinica]);
  if (!s) return null;

  const baixo = s.laudosEstimados !== null && s.laudosEstimados < 5;
  return (
    <div className={`rounded-xl border p-4 ${baixo ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm text-slate-500">Saldo para pré-laudos com IA</span>
        <span className={`text-2xl font-semibold ${s.saldo <= 0 ? 'text-red-700' : 'text-slate-800'}`}>{reais(s.saldo)}</span>
        {s.laudosEstimados !== null && (
          <span className="text-sm text-slate-600">
            ≈ <b>{s.laudosEstimados}</b> pré-laudo(s) · média de {reais(s.mediaPorLaudo)} por pré-laudo
          </span>
        )}
      </div>
      {baixo && <p className="mt-1 text-sm text-amber-900">Saldo baixo: peça uma recarga de créditos.</p>}

      {comExtrato && s.extrato && s.extrato.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-[#0E4D64]">Extrato</summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {s.extrato.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1 pr-2 text-slate-500">{new Date(m.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="py-1 pr-2">{nomeMovimento[m.tipo] ?? m.tipo}<span className="block text-xs text-slate-500">{m.descricao}</span></td>
                  <td className={`py-1 pr-2 text-right ${m.valor < 0 ? 'text-red-700' : 'text-green-700'}`}>{reais(m.valor)}</td>
                  <td className="py-1 text-right text-slate-500">{reais(m.saldoApos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

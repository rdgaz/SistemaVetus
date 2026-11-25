import { useEffect, useState } from 'react';
import { api } from '../api';
import { Aviso, Cartao, Titulo } from '../ui';
import { VerPrompt } from './VerPrompt';

type ExameAdmin = { id: string; clinica: string; paciente: string; especie: string | null; status: string; data: string | null; totalFotos: number };

const dataBr = (d: string | null) => (d && d.length === 8 ? `${d.slice(6)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : '—');

/** Administração do sistema: exames de todas as clínicas e o que vai para a IA em cada um (prompt). */
export function AdminIa() {
  const [exames, setExames] = useState<ExameAdmin[] | null>(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    api<ExameAdmin[]>('GET', '/api/admin/exames').then(setExames).catch((e) => setErro(e.message));
  }, []);

  const lista = (exames ?? []).filter((e) => !filtro || `${e.clinica} ${e.paciente}`.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <Titulo>IA (sistema)</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Veja exatamente o que vai para a IA em cada exame: as instruções do produto, o banco de frases, os aprendizados da
        clínica, os dados do exame e a lista de fotos. Só o administrador do sistema vê esta tela.
      </p>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao titulo="Exames recentes (todas as clínicas)">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por clínica ou paciente"
          className="mb-3 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
        {!exames && !erro && <p className="text-slate-500">Carregando…</p>}
        {exames && lista.length === 0 && <p className="text-slate-500">Nenhum exame.</p>}
        <div className="divide-y divide-slate-100">
          {lista.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{e.paciente} <span className="text-sm font-normal text-slate-500">· {e.especie ?? '—'}</span></div>
                <div className="text-xs text-slate-500">{e.clinica} · {dataBr(e.data)} · {e.totalFotos} foto(s) · {e.status}</div>
              </div>
              <button type="button" onClick={() => setAberto(e.id)}
                className="min-h-10 rounded-lg border border-[#0E4D64]/40 px-3 text-sm font-medium text-[#0E4D64] hover:bg-slate-50">
                Ver o que vai para a IA
              </button>
            </div>
          ))}
        </div>
      </Cartao>
      {aberto && <VerPrompt url={`/api/admin/exames/${aberto}/prompt`} aoFechar={() => setAberto(null)} />}
    </>
  );
}

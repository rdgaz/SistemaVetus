import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Aviso, Cartao, Titulo } from '../ui';

type Item = {
  id: string; situacao: 'pendente' | 'concluida'; resultado: 'confirmado' | 'sugestoes' | null; paraEnsino: boolean; mensagem: string | null;
  enviadaEm: string; iniciadaEm: string | null; concluidaEm: string | null; mentorado: string; paciente: string; especie: string | null;
  raca: string | null; tipoExame: string | null; dataExame: string | null;
};
type Resposta = { revisoes: Item[]; contagens: Record<string, number> };

const espera = (s: string) => {
  const h = Math.round((Date.now() - new Date(s).getTime()) / 3600000);
  return h < 1 ? 'há menos de 1 h' : h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
};

/** "Pedidos de revisão": laudos que os mentorados enviaram ao mentor (pendentes primeiro). */
export function PedidosRevisao() {
  const [aba, setAba] = useState<'pendente' | 'concluida' | ''>('pendente');
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setR(null);
    api<Resposta>('GET', `/api/revisoes-mentor${aba ? `?situacao=${aba}` : ''}`).then(setR).catch((e) => setErro(e.message));
  }, [aba]);

  const n = (s: string) => r?.contagens[s] ?? 0;
  const abas: [typeof aba, string][] = [['pendente', `Pendentes (${n('pendente')})`], ['concluida', `Revisados (${n('concluida')})`], ['', 'Todos']];

  return (
    <>
      <div className="mb-2 text-sm"><Link to="/mentoria" className="text-[#0E4D64] underline">← Mentoria</Link></div>
      <Titulo>Pedidos de revisão</Titulo>
      <p className="mb-4 text-sm text-slate-600">Laudos que os seus mentorados enviaram para você revisar.</p>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {abas.map(([v, t]) => (
            <button key={v} type="button" onClick={() => setAba(v)}
              className={`min-h-9 rounded-full border px-3 text-sm font-medium ${aba === v ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{t}</button>
          ))}
        </div>
        {!r && !erro && <p className="text-slate-500">Carregando…</p>}
        {r?.revisoes.length === 0 && <p className="text-slate-500">{aba === 'pendente' ? 'Nenhum laudo esperando a sua revisão.' : 'Nenhuma revisão.'}</p>}
        <div className="divide-y divide-slate-100">
          {r?.revisoes.map((x) => (
            <Link key={x.id} to={`/mentoria/revisoes/${x.id}`} className="block py-3 hover:bg-slate-50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">{x.paciente}</span>
                <span className="text-sm text-slate-600">{[x.especie, x.raca, x.tipoExame].filter(Boolean).join(' · ')}</span>
                {x.paraEnsino && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">Para ensino</span>}
                {x.situacao === 'pendente'
                  ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{x.iniciadaEm ? 'Em andamento' : 'Aguardando você'}</span>
                  : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${x.resultado === 'confirmado' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {x.resultado === 'confirmado' ? 'Confirmado' : 'Com sugestões'}
                    </span>}
              </div>
              <div className="text-xs text-slate-500">
                de <b>{x.mentorado}</b> · enviado {x.situacao === 'pendente' ? espera(x.enviadaEm) : `em ${new Date(x.enviadaEm).toLocaleDateString('pt-BR')}`}
                {x.concluidaEm && ` · revisado em ${new Date(x.concluidaEm).toLocaleDateString('pt-BR')}`}
              </div>
              {x.mensagem && <div className="mt-0.5 truncate text-sm text-slate-700">“{x.mensagem}”</div>}
            </Link>
          ))}
        </div>
      </Cartao>
    </>
  );
}

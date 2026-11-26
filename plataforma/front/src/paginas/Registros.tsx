import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Aviso, Cartao, Titulo } from '../ui';
import { AbasClinica } from './DadosClinica';

type Registro = {
  id: string; em: string; tipo: string; descricao: string; clinicaNome: string | null; exameId: string | null;
  paciente: string | null; detalhes: string | null; usuarioNome: string; usuarioEmail: string; perfil: string | null;
};
type Resposta = { tipos: Record<string, string>; registros: Registro[] };

const nomePerfil: Record<string, string> = { AdministradorClinica: 'administrador', Veterinario: 'veterinário', Usuario: 'recepção', Sistema: 'administrador do sistema' };
const corTipo: Record<string, string> = {
  exame_excluido: 'bg-red-100 text-red-800', laudo_assinado: 'bg-emerald-100 text-emerald-800', laudo_retificado: 'bg-amber-100 text-amber-900',
  analise_solicitada: 'bg-sky-100 text-sky-900', alerta_discordado: 'bg-amber-100 text-amber-900',
};

/**
 * Registro de atividades: quem fez o quê e quando (exame excluído, laudo assinado, análise pedida à IA...). O administrador da
 * clínica vê os da clínica; o administrador do sistema (sistema=true) vê os de todas as clínicas.
 */
export function Registros({ sistema = false }: { sistema?: boolean }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  // tipos que aparecem nos registros (lidos sem filtro): o filtro só mostra o que existe
  const [tiposUsados, setTiposUsados] = useState<Set<string> | null>(null);
  const [incluirTestes, setIncluirTestes] = useState(false);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (tipo) params.tipo = tipo;
    if (de) params.de = de;
    if (ate) params.ate = ate;
    if (sistema && incluirTestes) params.incluirTestes = 'true';
    const q = new URLSearchParams(params).toString();
    api<Resposta>('GET', `${sistema ? '/api/admin/registros' : '/api/clinica/registros'}${q ? `?${q}` : ''}`)
      .then((x) => { setR(x); setErro(''); if (!tipo) setTiposUsados(new Set(x.registros.map((g) => g.tipo))); }).catch((e) => setErro(e.message));
  }, [sistema, tipo, de, ate, incluirTestes]);

  const visiveis = (r?.registros ?? []).filter((x) =>
    !busca || `${x.descricao} ${x.paciente ?? ''} ${x.usuarioNome} ${x.clinicaNome ?? ''}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      {sistema ? <Titulo>Registros (sistema)</Titulo> : <AbasClinica />}
      <p className="mb-4 text-sm text-slate-600">Quem fez o quê e quando: exames excluídos, laudos assinados e retificados, análises pedidas à IA, usuários e configurações.</p>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[['', 'Todos'], ...Object.entries(r?.tipos ?? {}).filter(([v]) => v === tipo || !tiposUsados || tiposUsados.has(v))].map(([v, t]) => (
            <button key={v} type="button" onClick={() => setTipo(v)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${tipo === v ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{t}</button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por paciente, usuário ou texto"
            className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3" />
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2" aria-label="De" />
          <span>até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="min-h-10 rounded-lg border border-slate-300 px-2" aria-label="Até" />
          {sistema && (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700">
              <input type="checkbox" className="size-4" checked={incluirTestes} onChange={(e) => setIncluirTestes(e.target.checked)} />
              Incluir testes
            </label>
          )}
        </div>
        {!r && !erro && <p className="text-slate-500">Carregando…</p>}
        {r && visiveis.length === 0 && <p className="text-slate-500">Nenhum registro.</p>}
        <div className="divide-y divide-slate-100">
          {visiveis.map((x) => (
            <div key={x.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${corTipo[x.tipo] ?? 'bg-slate-100 text-slate-700'}`}>{r?.tipos[x.tipo] ?? x.tipo}</span>
                <span className="text-xs text-slate-500">{new Date(x.em).toLocaleString('pt-BR')}</span>
                {sistema && x.clinicaNome && <span className="text-xs text-slate-500">· {x.clinicaNome}</span>}
              </div>
              <div className="mt-1 text-sm text-slate-800">
                {x.paciente && (x.exameId && x.tipo !== 'exame_excluido' && !sistema
                  ? <Link to={`/exames/${x.exameId}`} className="font-semibold text-[#0E4D64] underline">{x.paciente}</Link>
                  : <b>{x.paciente}</b>)}
                {x.paciente && ' — '}{x.descricao}
              </div>
              <div className="text-xs text-slate-500">
                por <b>{x.usuarioNome}</b> ({x.usuarioEmail}{x.perfil ? `, ${nomePerfil[x.perfil] ?? x.perfil}` : ''})
              </div>
            </div>
          ))}
        </div>
        {r && r.registros.length >= 1000 && <p className="mt-2 text-xs text-slate-500">Mostrando os 1.000 mais recentes: use as datas para ver os anteriores.</p>}
      </Cartao>
    </>
  );
}

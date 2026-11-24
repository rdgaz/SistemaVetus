import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import { dataBR, nomeStatus, ordemStatus, SeloStatus, type StatusExame } from '../exames';
import { useSessao } from '../sessao';
import { Aviso, Botao, Cartao, Titulo } from '../ui';
import { SaldoClinica } from './SaldoClinica';

type ItemExame = {
  id: string;
  status: StatusExame;
  urgente: boolean;
  tipo: string | null;
  data: string | null;
  totalFotos: number;
  recebidoEm: string;
  paciente: string;
  especie: string | null;
  tutor: string | null;
  miniatura: string | null;
};

type Lista = { contagens: Partial<Record<StatusExame, number>>; exames: ItemExame[] };
type DadosClinica = { nome: string; aeTitle: string; gerarAutomaticamente: boolean };

/** Lista de exames da clínica, com abas por status. */
export function Exames() {
  const { usuario, clinica } = useSessao();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusExame | null) ?? null;
  const [lista, setLista] = useState<Lista | null>(null);
  const [clinicaDados, setClinicaDados] = useState<DadosClinica | null>(null);
  const [erro, setErro] = useState('');

  const carregar = () => {
    if (!clinica) return;
    api<Lista>('GET', `/api/exames${status ? `?status=${status}` : ''}`)
      .then((l) => { setLista(l); setErro(''); })
      .catch((e) => setErro(e.message));
  };

  useEffect(() => {
    setLista(null);
    carregar();
    if (clinica) api<DadosClinica>('GET', '/api/clinica').then(setClinicaDados).catch(() => undefined);
    const t = setInterval(carregar, 15000); // novos exames aparecem sozinhos
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinica, status]);

  if (!clinica)
    return (
      <>
        <Titulo>Exames</Titulo>
        <Aviso tipo="info">
          Você ainda não tem acesso a nenhuma clínica.
          {usuario?.administradorSistema && (
            <> Cadastre uma em <Link className="font-medium underline" to="/admin/clinicas">Clínicas (sistema)</Link>.</>
          )}
        </Aviso>
      </>
    );

  const total = Object.values(lista?.contagens ?? {}).reduce((s, n) => s + (n ?? 0), 0);
  const abas: { valor: StatusExame | null; texto: string; n: number }[] = [
    { valor: null, texto: 'Todos', n: total },
    ...ordemStatus
      .filter((s) => s !== 'Erro' || (lista?.contagens.Erro ?? 0) > 0)
      .map((s) => ({ valor: s, texto: nomeStatus[s], n: lista?.contagens[s] ?? 0 })),
  ];

  return (
    <>
      <Titulo>Exames</Titulo>
      <div className="mb-4"><SaldoClinica /></div>
      <div className="mb-4"><Link to="/exames/pendrive" className="text-sm font-medium text-[#0E4D64] underline">Enviar exame do pendrive</Link></div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {abas.map((a) => (
          <button
            key={a.texto}
            onClick={() => setParams(a.valor ? { status: a.valor } : {})}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium ${
              status === a.valor ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {a.texto} <span className="opacity-70">{a.n}</span>
          </button>
        ))}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!lista && !erro && <p className="text-slate-500">Carregando…</p>}

      {lista && lista.exames.length > 0 && (
        <div className="space-y-2">
          {lista.exames.map((e) => (
            <Link key={e.id} to={`/exames/${e.id}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-[#0E4D64]/40">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-black sm:size-20">
                {e.miniatura && <img src={e.miniatura} alt="" loading="lazy" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.paciente}</span>
                  {e.urgente && <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">Urgente</span>}
                </div>
                <div className="truncate text-sm text-slate-500">
                  {[e.especie, e.tutor && `Responsável: ${e.tutor}`].filter(Boolean).join(' · ')}
                </div>
                <div className="text-sm text-slate-500">
                  {[e.tipo, dataBR(e.data), `${e.totalFotos} foto(s)`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <SeloStatus status={e.status} />
            </Link>
          ))}
        </div>
      )}

      {lista && lista.exames.length === 0 && (
        <div className="space-y-4">
          <Cartao>
            <p className="text-slate-600">
              {status ? `Nenhum exame em "${nomeStatus[status]}".` : 'Nenhum exame recebido ainda.'}
            </p>
            {status && <Botao variante="secundario" className="mt-3" onClick={() => setParams({})}>Ver todos</Botao>}
          </Cartao>
          {!status && clinicaDados && <ConfigurarUltrassom dados={clinicaDados} />}
        </div>
      )}
    </>
  );
}

function ConfigurarUltrassom({ dados }: { dados: DadosClinica }) {
  return (
    <Cartao titulo="Configurar o ultrassom">
      <p className="mb-3 text-sm text-slate-600">
        No ultrassom (DICOM → Storage), use estes dados para enviar os exames da <b>{dados.nome}</b>:
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Endereço</dt>
        <dd>IP do servidor AutoLaudoVet</dd>
        <dt className="text-slate-500">Porta</dt>
        <dd>2345</dd>
        <dt className="text-slate-500">Título AE</dt>
        <dd className="font-mono font-semibold">{dados.aeTitle}</dd>
      </dl>
      <p className="mt-3 text-sm text-slate-500">
        Pré-laudo: {dados.gerarAutomaticamente ? 'gerado automaticamente ao receber' : 'gerado manualmente'}.
      </p>
    </Cartao>
  );
}

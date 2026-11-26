import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Aviso, Botao, Cartao, Titulo } from '../ui';

type MentorAdm = {
  usuarioId: string; nome: string; email: string; crmv: string | null; crmvUf: string | null; ativo: boolean;
  definidoPorNome: string; definidoEm: string; areas: string | null; instituicao: string | null; aceitaNovos: boolean;
  mentorados: number; pedidos: number;
};
type Candidato = { usuarioId: string; nome: string; email: string; crmv: string | null; crmvUf: string | null; clinicas: string[] };

const crmv = (p: { crmv: string | null; crmvUf: string | null }) => (p.crmv ? `CRMV-${(p.crmvUf ?? '').toUpperCase()} ${p.crmv}` : '');

/** Administrador do sistema: define quem é mentor (só veterinários com CRMV) e tira da lista. */
export function AdminMentores() {
  const [lista, setLista] = useState<MentorAdm[] | null>(null);
  const [busca, setBusca] = useState('');
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(() => api<MentorAdm[]>('GET', '/api/admin/mentores').then(setLista).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (busca.trim().length < 2) { setCandidatos([]); return; }
      api<Candidato[]>('GET', `/api/admin/mentores/candidatos?busca=${encodeURIComponent(busca.trim())}`).then(setCandidatos).catch(() => setCandidatos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const definir = async (c: Candidato) => {
    setErro(''); setOk('');
    try { await api('POST', '/api/admin/mentores', { usuarioId: c.usuarioId }); setOk(`${c.nome} agora é mentor.`); setBusca(''); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  };
  const remover = async (m: MentorAdm) => {
    const aviso = m.mentorados + m.pedidos > 0 ? `\n\n${m.mentorados} mentoria(s) e ${m.pedidos} pedido(s) em aberto serão encerrados, com aviso aos mentorados.` : '';
    if (!confirm(`Tirar ${m.nome} da lista de mentores?${aviso}`)) return;
    setErro(''); setOk('');
    try { await api('DELETE', `/api/admin/mentores/${m.usuarioId}`); setOk(`${m.nome} deixou de ser mentor.`); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  };

  const ativos = (lista ?? []).filter((m) => m.ativo);
  const antigos = (lista ?? []).filter((m) => !m.ativo);

  return (
    <>
      <Titulo>Mentores (sistema)</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Defina quais veterinários são mentores. Eles aparecem no diretório da tela Mentoria para todas as clínicas e podem
        aceitar mentorados.
      </p>
      {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mb-3"><Aviso tipo="ok">{ok}</Aviso></div>}

      <div className="space-y-4">
        <Cartao titulo="Adicionar mentor">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar veterinário por nome, e-mail ou CRMV"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-[#0E4D64]" />
          <p className="mt-1 text-xs text-slate-500">Só aparecem usuários com CRMV cadastrado em Minha conta.</p>
          {busca.trim().length >= 2 && candidatos.length === 0 && <p className="mt-2 text-sm text-slate-500">Nenhum veterinário encontrado.</p>}
          <div className="mt-2 divide-y divide-slate-100">
            {candidatos.map((c) => (
              <div key={c.usuarioId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium text-slate-800">{c.nome}</div>
                  <div className="text-xs text-slate-500">{[c.email, crmv(c), c.clinicas.join(', ')].filter(Boolean).join(' · ')}</div>
                </div>
                <Botao onClick={() => definir(c)}>Tornar mentor</Botao>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo={`Mentores (${ativos.length})`}>
          {lista && ativos.length === 0 && <p className="text-sm text-slate-500">Nenhum mentor definido.</p>}
          <div className="divide-y divide-slate-100">
            {ativos.map((m) => (
              <div key={m.usuarioId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{m.nome}</div>
                  <div className="text-xs text-slate-500">{[m.email, crmv(m), m.instituicao, m.areas].filter(Boolean).join(' · ')}</div>
                  <div className="text-xs text-slate-500">
                    {m.mentorados} mentorado(s) · {m.pedidos} pedido(s) aguardando{!m.aceitaNovos && ' · não aceita novos'} · definido por {m.definidoPorNome} em {new Date(m.definidoEm).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <Botao variante="perigo" onClick={() => remover(m)}>Tirar de mentor</Botao>
              </div>
            ))}
          </div>
          {antigos.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">Já foram mentores: {antigos.map((m) => m.nome).join(', ')} (para voltar, busque e torne mentor de novo).</p>
          )}
        </Cartao>
      </div>
    </>
  );
}

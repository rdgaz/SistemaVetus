import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Titulo } from '../ui';

type Pessoa = { id: string; nome: string; email: string; crmv: string | null; crmvUf: string | null };
type ItemMentoria = {
  id: string; situacao: 'pedida' | 'aceita' | 'recusada' | 'cancelada' | 'encerrada'; mensagem: string | null; resposta: string | null;
  pedidaEm: string; respondidaEm: string | null; encerradaEm: string | null; encerradaPor: string | null; pessoa: Pessoa; clinicas?: string[];
};
type Mentorias = { souMentor: boolean; comoMentorado: ItemMentoria[]; comoMentor: ItemMentoria[] };
type Mentor = {
  mentorId: string; nome: string; crmv: string | null; crmvUf: string | null; areas: string | null; curriculo: string | null;
  instituicao: string | null; aceitaNovos: boolean; mentorados: number; minha: { id: string; situacao: string } | null;
};
type PerfilMentor = {
  mentor: boolean; areas?: string | null; curriculo?: string | null; instituicao?: string | null; limitePedidos?: number;
  aceitaNovos?: boolean; permiteRevisadoPor?: boolean; notificarEmail?: boolean;
};

const nomeSituacao: Record<ItemMentoria['situacao'], string> = {
  pedida: 'Aguardando resposta', aceita: 'Em andamento', recusada: 'Recusada', cancelada: 'Cancelada', encerrada: 'Encerrada',
};
const corSituacao: Record<ItemMentoria['situacao'], string> = {
  pedida: 'bg-amber-100 text-amber-900', aceita: 'bg-emerald-100 text-emerald-800', recusada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600', encerrada: 'bg-slate-100 text-slate-600',
};
const crmv = (p: { crmv: string | null; crmvUf: string | null }) => (p.crmv ? `CRMV-${(p.crmvUf ?? '').toUpperCase()} ${p.crmv}` : '');
const data = (s: string) => new Date(s).toLocaleDateString('pt-BR');
const area = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-[#0E4D64]';

/**
 * Mentoria: o veterinário procura um mentor (definido pelo administrador do sistema) e pede mentoria; o mentor aceita ou
 * recusa e preenche o próprio perfil. Na próxima etapa, o mentorado envia laudos para a revisão do mentor.
 */
export function Mentoria() {
  const { usuario } = useSessao();
  const [m, setM] = useState<Mentorias | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(() => api<Mentorias>('GET', '/api/mentorias').then(setM).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const acao = async (url: string, corpo?: unknown, msg?: string) => {
    setErro(''); setOk('');
    try { await api('POST', url, corpo); if (msg) setOk(msg); await carregar(); } catch (e) { setErro((e as Error).message); }
  };

  const souMentor = m?.souMentor ?? usuario?.mentor;
  const pedidosRecebidos = (m?.comoMentor ?? []).filter((x) => x.situacao === 'pedida');
  const meusMentorados = (m?.comoMentor ?? []).filter((x) => x.situacao === 'aceita');

  return (
    <>
      <Titulo>Mentoria</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Tenha a orientação de um veterinário experiente: escolha um mentor e peça mentoria. Depois do aceite, envie laudos para a
        revisão dele pela tela do exame ("Enviar ao mentor"), antes de assinar ou, para ensino, depois.
      </p>
      {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mb-3"><Aviso tipo="ok">{ok}</Aviso></div>}

      <div className="space-y-4">
        {souMentor && (
          <>
            <Link to="/mentoria/revisoes" className="flex min-h-12 items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 font-semibold text-violet-950 hover:bg-violet-100">
              <span>🎓 Pedidos de revisão de laudos</span><span aria-hidden="true">›</span>
            </Link>

            <Cartao titulo={`Pedidos de mentoria${pedidosRecebidos.length ? ` (${pedidosRecebidos.length})` : ''}`}>
              {pedidosRecebidos.length === 0 && <p className="text-sm text-slate-500">Nenhum pedido aguardando resposta.</p>}
              <div className="divide-y divide-slate-100">
                {pedidosRecebidos.map((x) => <PedidoRecebido key={x.id} item={x} aoResponder={acao} />)}
              </div>
            </Cartao>

            <Cartao titulo="Meus mentorados">
              {meusMentorados.length === 0 && <p className="text-sm text-slate-500">Você ainda não tem mentorados.</p>}
              <div className="divide-y divide-slate-100">
                {meusMentorados.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="font-semibold text-slate-800">{x.pessoa.nome}</div>
                      <div className="text-xs text-slate-500">
                        {[crmv(x.pessoa), x.clinicas?.join(', '), `desde ${data(x.respondidaEm ?? x.pedidaEm)}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <Botao variante="perigo" onClick={() => confirm(`Encerrar a mentoria com ${x.pessoa.nome}?`) && acao(`/api/mentorias/${x.id}/encerrar`, undefined, 'Mentoria encerrada.')}>
                      Encerrar
                    </Botao>
                  </div>
                ))}
              </div>
            </Cartao>

            <PerfilDoMentor />
          </>
        )}

        <Cartao titulo="Minhas mentorias">
          {m && m.comoMentorado.length === 0 && <p className="text-sm text-slate-500">Você ainda não pediu mentoria. Escolha um mentor abaixo.</p>}
          <div className="divide-y divide-slate-100">
            {m?.comoMentorado.map((x) => (
              <div key={x.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{x.pessoa.nome}</span>
                  <span className="text-xs text-slate-500">{crmv(x.pessoa)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${corSituacao[x.situacao]}`}>{nomeSituacao[x.situacao]}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Pedido em {data(x.pedidaEm)}
                  {x.respondidaEm && ` · respondido em ${data(x.respondidaEm)}`}
                  {x.encerradaEm && ` · encerrada em ${data(x.encerradaEm)}${x.encerradaPor ? ` por ${x.encerradaPor}` : ''}`}
                </div>
                {x.resposta && <p className="mt-1 text-sm text-slate-700">Resposta do mentor: “{x.resposta}”</p>}
                <div className="mt-2 flex gap-2">
                  {x.situacao === 'pedida' && <Botao variante="secundario" onClick={() => acao(`/api/mentorias/${x.id}/cancelar`, undefined, 'Pedido cancelado.')}>Cancelar pedido</Botao>}
                  {x.situacao === 'aceita' && (
                    <Botao variante="perigo" onClick={() => confirm(`Encerrar a mentoria com ${x.pessoa.nome}?`) && acao(`/api/mentorias/${x.id}/encerrar`, undefined, 'Mentoria encerrada.')}>
                      Encerrar mentoria
                    </Botao>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Cartao>

        <Diretorio aoPedir={async (mentorId, mensagem) => acao('/api/mentorias', { mentorId, mensagem }, 'Pedido enviado. Você será avisado quando o mentor responder.')} versao={m} />
      </div>
    </>
  );
}

function PedidoRecebido({ item, aoResponder }: { item: ItemMentoria; aoResponder: (url: string, corpo?: unknown, msg?: string) => Promise<void> }) {
  const [resposta, setResposta] = useState('');
  return (
    <div className="py-3">
      <div className="font-semibold text-slate-800">{item.pessoa.nome}</div>
      <div className="text-xs text-slate-500">
        {[crmv(item.pessoa) || 'sem CRMV cadastrado', item.pessoa.email, item.clinicas?.join(', '), `pedido em ${data(item.pedidaEm)}`].filter(Boolean).join(' · ')}
      </div>
      {item.mensagem && <p className="mt-1 text-sm text-slate-700">“{item.mensagem}”</p>}
      <textarea rows={2} maxLength={1000} value={resposta} onChange={(e) => setResposta(e.target.value)}
        placeholder="Mensagem para o mentorado (opcional)" className={`${area} mt-2 text-sm`} />
      <div className="mt-2 flex gap-2">
        <Botao onClick={() => aoResponder(`/api/mentorias/${item.id}/aceitar`, { resposta }, `Você agora é mentor de ${item.pessoa.nome}.`)}>Aceitar</Botao>
        <Botao variante="perigo" onClick={() => aoResponder(`/api/mentorias/${item.id}/recusar`, { resposta }, 'Pedido recusado.')}>Recusar</Botao>
      </div>
    </div>
  );
}

function Diretorio({ aoPedir, versao }: { aoPedir: (mentorId: string, mensagem: string) => Promise<void>; versao: unknown }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Mentor[] | null>(null);
  const [pedindo, setPedindo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api<Mentor[]>('GET', `/api/mentores${busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : ''}`).then(setLista).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca, versao]);

  return (
    <Cartao titulo="Encontrar um mentor">
      <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, área ou instituição"
        className="mb-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-[#0E4D64]" />
      {lista === null && <p className="text-sm text-slate-500">Carregando…</p>}
      {lista?.length === 0 && <p className="text-sm text-slate-500">Nenhum mentor encontrado.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {lista?.map((x) => (
          <div key={x.mentorId} className="rounded-xl border border-slate-200 p-3">
            <div className="font-semibold text-slate-800">{x.nome}</div>
            <div className="text-xs text-slate-500">{[crmv(x), x.instituicao].filter(Boolean).join(' · ')}</div>
            {x.areas && (
              <div className="mt-2 flex flex-wrap gap-1">
                {x.areas.split(',').map((a) => a.trim()).filter(Boolean).map((a) => (
                  <span key={a} className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900">{a}</span>
                ))}
              </div>
            )}
            {x.curriculo && <p className="mt-2 line-clamp-4 text-sm text-slate-700">{x.curriculo}</p>}
            <div className="mt-1 text-xs text-slate-500">{x.mentorados} mentorado(s)</div>
            <div className="mt-3">
              {x.minha ? (
                <span className="text-sm font-medium text-emerald-800">{x.minha.situacao === 'aceita' ? '✓ É o seu mentor' : 'Pedido enviado, aguardando resposta'}</span>
              ) : !x.aceitaNovos ? (
                <span className="text-sm text-slate-500">Não está aceitando novos mentorados no momento.</span>
              ) : pedindo === x.mentorId ? (
                <div className="space-y-2">
                  <textarea rows={3} maxLength={1000} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Conte um pouco sobre você e o que espera da mentoria (opcional)" className={`${area} text-sm`} />
                  <div className="flex gap-2">
                    <Botao onClick={async () => { await aoPedir(x.mentorId, mensagem); setPedindo(null); setMensagem(''); }}>Enviar pedido</Botao>
                    <Botao variante="secundario" onClick={() => setPedindo(null)}>Cancelar</Botao>
                  </div>
                </div>
              ) : (
                <Botao variante="secundario" onClick={() => { setPedindo(x.mentorId); setMensagem(''); }}>Pedir mentoria</Botao>
              )}
            </div>
          </div>
        ))}
      </div>
    </Cartao>
  );
}

/** Perfil que o mentor preenche: aparece no diretório. */
function PerfilDoMentor() {
  const [p, setP] = useState<PerfilMentor | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api<PerfilMentor>('GET', '/api/mentoria/perfil').then(setP).catch((e) => setErro(e.message)); }, []);
  if (!p?.mentor) return erro ? <Aviso>{erro}</Aviso> : null;

  const mudar = (x: Partial<PerfilMentor>) => { setP({ ...p, ...x }); setOk(false); };
  const salvar = async () => {
    setSalvando(true); setErro('');
    try { await api('PUT', '/api/mentoria/perfil', p); setOk(true); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  };
  const chave = (rotulo: string, dica: string, valor: boolean | undefined, aoMudar: (v: boolean) => void) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-1 size-5" checked={!!valor} onChange={(e) => aoMudar(e.target.checked)} />
      <span><span className="font-medium">{rotulo}</span><span className="block text-sm text-slate-500">{dica}</span></span>
    </label>
  );

  return (
    <Cartao titulo="Meu perfil de mentor">
      <p className="mb-3 text-sm text-slate-600">É o que os veterinários veem ao procurar um mentor.</p>
      <div className="space-y-3">
        <Campo rotulo="Áreas de atuação" dica="Separe por vírgula. Ex.: Abdominal, Felinos, Reprodução" maxLength={300}
          value={p.areas ?? ''} onChange={(e) => mudar({ areas: e.target.value })} />
        <Campo rotulo="Instituição" maxLength={200} value={p.instituicao ?? ''} onChange={(e) => mudar({ instituicao: e.target.value })} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Mini currículo</span>
          <textarea rows={4} maxLength={2000} className={area} value={p.curriculo ?? ''} onChange={(e) => mudar({ curriculo: e.target.value })}
            placeholder="Formação, experiência em ultrassonografia, onde ensina" />
        </label>
        <Campo rotulo="Limite de revisões em aberto" type="number" min={1} max={100} value={p.limitePedidos ?? 10}
          onChange={(e) => mudar({ limitePedidos: Number(e.target.value) })} dica="Quantos laudos você aceita revisar ao mesmo tempo." />
        {chave('Aceitar novos mentorados', 'Desligado: você continua com os atuais, mas não recebe novos pedidos.', p.aceitaNovos, (v) => mudar({ aceitaNovos: v }))}
        {chave('Permitir "Revisado por" no laudo', 'O mentorado poderá mostrar no PDF que o laudo foi revisado por você (com o seu CRMV).', p.permiteRevisadoPor, (v) => mudar({ permiteRevisadoPor: v }))}
        {chave('Receber avisos por e-mail', 'Além do aviso no sino do sistema.', p.notificarEmail, (v) => mudar({ notificarEmail: v }))}
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">Perfil salvo.</Aviso>}
        <Botao disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar perfil'}</Botao>
      </div>
    </Cartao>
  );
}

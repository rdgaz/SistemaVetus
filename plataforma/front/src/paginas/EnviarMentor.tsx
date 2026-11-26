import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { Aviso, Botao, Selecao } from '../ui';

type Revisao = {
  id: string; situacao: 'pendente' | 'concluida' | 'cancelada'; resultado: 'confirmado' | 'sugestoes' | null; paraEnsino: boolean; laudoVersao: number;
  mensagem: string | null; parecer: string | null; enviadaEm: string; iniciadaEm: string | null; concluidaEm: string | null; canceladaEm: string | null;
  mentor: string; mentorCrmv: string | null; mentorado: string; comentarios: Record<string, string>;
};
type Resposta = { mentores: { id: string; nome: string }[]; revisoes: Revisao[] };

const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Revisão do mentor na tela do exame: enviar o laudo ao mentor (com mentoria aceita), acompanhar o pedido pendente
 * (e cancelar antes de o mentor começar) e ver o resultado das revisões concluídas.
 */
export function EnviarMentor({ exameId, podeEnviar, assinado, aoMudar }: {
  exameId: string; podeEnviar: boolean; assinado: boolean; aoMudar: () => void;
}) {
  const [r, setR] = useState<Resposta | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [mentorId, setMentorId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => api<Resposta>('GET', `/api/exames/${exameId}/revisao-mentor`).then((x) => {
    setR(x); setMentorId((m) => m || x.mentores[0]?.id || '');
  }).catch(() => setR({ mentores: [], revisoes: [] })), [exameId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!r) return null;
  const pendente = r.revisoes.find((x) => x.situacao === 'pendente');
  const concluidas = r.revisoes.filter((x) => x.situacao === 'concluida');
  if (!pendente && concluidas.length === 0 && (!podeEnviar || r.mentores.length === 0)) return null;

  const enviar = async () => {
    if (!assinado || confirm('O laudo já está assinado: a revisão será só para ensino e o laudo assinado não muda. Enviar?')) {
      setOcupado(true); setErro('');
      try {
        await api('POST', `/api/exames/${exameId}/revisao-mentor`, { mentorId, mensagem });
        setAbrindo(false); setMensagem(''); await carregar(); aoMudar();
      } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
    }
  };
  const cancelar = async (id: string) => {
    const comecou = !!r?.revisoes.find((x) => x.id === id)?.iniciadaEm;
    if (!confirm(comecou
      ? 'O mentor já começou a revisar. Cancelar mesmo assim? O que ele fez será descartado, ele será avisado e o laudo volta a poder ser editado.'
      : 'Cancelar o pedido de revisão? O laudo volta a poder ser editado.')) return;
    setOcupado(true); setErro('');
    try { await api('POST', `/api/revisoes-mentor/${id}/cancelar`); await carregar(); aoMudar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="space-y-2">
      {erro && <Aviso>{erro}</Aviso>}

      {pendente && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-sm text-violet-950">
          <div className="font-semibold">
            🎓 {pendente.paraEnsino ? 'Laudo com o mentor (para ensino)' : 'Laudo em revisão do mentor'}: {pendente.mentor}
          </div>
          <div className="mt-0.5 text-xs">
            Enviado em {dataHora(pendente.enviadaEm)}{pendente.iniciadaEm ? ' · o mentor já começou a revisar' : ' · aguardando o mentor'}.
            {!pendente.paraEnsino && ' Enquanto isso, o laudo não pode ser editado nem assinado.'}
          </div>
          <button type="button" disabled={ocupado} onClick={() => cancelar(pendente.id)} className="mt-2 text-xs font-semibold text-violet-900 underline">
            Cancelar o pedido
          </button>
        </div>
      )}

      {concluidas.map((x) => (
        <div key={x.id} className={`rounded-xl border px-3.5 py-3 text-sm ${x.resultado === 'confirmado' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <b>{x.resultado === 'confirmado' ? '✓ Laudo confirmado pelo mentor' : '✎ Revisado pelo mentor, com sugestões'}</b>
            {x.paraEnsino && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">para ensino</span>}
          </div>
          <div className="mt-0.5 text-xs">{x.mentor}{x.mentorCrmv ? ` (${x.mentorCrmv})` : ''} · {x.concluidaEm && dataHora(x.concluidaEm)} · versão {x.laudoVersao} do laudo</div>
          {x.parecer && <p className="mt-2 whitespace-pre-line">“{x.parecer}”</p>}
          {Object.keys(x.comentarios ?? {}).length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {Object.entries(x.comentarios).map(([o, t]) => <li key={o}><b>{o}:</b> {t}</li>)}
            </ul>
          )}
          <Link to={`/mentoria/revisoes/${x.id}`} className="mt-2 inline-block text-xs font-semibold underline">
            Ver a revisão completa {x.resultado === 'sugestoes' && '(o que o mentor mudou)'}
          </Link>
        </div>
      ))}

      {podeEnviar && !pendente && r.mentores.length > 0 && (
        !abrindo ? (
          <button type="button" onClick={() => setAbrindo(true)} className="text-sm font-medium text-[#0E4D64] underline">
            🎓 {assinado ? 'Enviar ao mentor (para ensino)' : 'Enviar ao mentor para revisão'}
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-sm font-semibold text-slate-800">Enviar ao mentor</div>
            <p className="text-xs text-slate-500">
              {assinado ? 'O laudo já está assinado: o mentor revisa para ensino e o laudo assinado não muda.'
                : 'O mentor recebe o laudo como está agora. Até ele responder, o laudo fica parado (sem editar nem assinar).'}
            </p>
            {r.mentores.length > 1 && (
              <Selecao rotulo="Mentor" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
                {r.mentores.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Selecao>
            )}
            {r.mentores.length === 1 && <p className="text-sm">Mentor: <b>{r.mentores[0].nome}</b></p>}
            <textarea rows={2} maxLength={1000} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
              placeholder='Mensagem para o mentor (opcional). Ex.: "Fiquei em dúvida no baço."'
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0E4D64]" />
            <div className="flex gap-2">
              <Botao disabled={ocupado || !mentorId} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar'}</Botao>
              <Botao variante="secundario" onClick={() => setAbrindo(false)}>Cancelar</Botao>
            </div>
          </div>
        )
      )}
    </div>
  );
}

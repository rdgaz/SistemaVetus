import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { Aviso, Botao, Cartao, Titulo } from '../ui';
import { corSituacao, nomeSituacao, type ConteudoLaudo, type Orgao, type SituacaoOrgao } from './Revisao';

type Medida = { grupo: string; nome: string; valor: number; unidade: string; situacao?: string; faixaTexto?: string };
type Dados = {
  id: string; situacao: 'pendente' | 'concluida' | 'cancelada'; resultado: 'confirmado' | 'sugestoes' | null; paraEnsino: boolean;
  mensagem: string | null; parecer: string | null; enviadaEm: string; iniciadaEm: string | null; concluidaEm: string | null; laudoVersao: number;
  souMentor: boolean; mentorado: string; exameId: string | null;
  conteudoEnviado: ConteudoLaudo; conteudoMentor: ConteudoLaudo | null;
  comentarios: Record<string, string>; rotulos: Record<string, string>; imagensEnviadas: string[];
  exame: {
    tipoExame: string | null; data: string | null; idade: string | null; peso: string | null; suspeitaClinica: string | null; historico: string | null;
    jejum: string | null; informacoesAdicionais: string | null; equipamento: string | null;
    paciente: { nome: string; especie: string | null; raca: string | null; sexo: string | null; castrado: boolean | null };
  };
  orgaos: string[]; mascaras: Record<string, string>; medidasComparadas: Medida[]; fotos: { nome: string; url: string }[];
};

const area = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0E4D64] disabled:bg-slate-50';
const linhas = (l: string[] | undefined) => (l ?? []).join('\n');
const lista = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const INDEFINIDO = 'Indefinido / outro';

/**
 * Revisão do mentor: o mentor confere o laudo do mentorado (texto, situação de cada órgão, órgão de cada foto), comenta e
 * conclui. O mentorado também abre esta tela, só para leitura, para ver o que o mentor fez.
 */
export function RevisaoMentor() {
  const { id } = useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [c, setC] = useState<ConteudoLaudo | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [parecer, setParecer] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [foto, setFoto] = useState<number | null>(null);
  const [mudou, setMudou] = useState(false);

  const carregar = useCallback(() => api<Dados>('GET', `/api/revisoes-mentor/${id}`).then((x) => {
    setD(x); setC(x.conteudoMentor ?? x.conteudoEnviado); setComentarios(x.comentarios ?? {}); setRotulos(x.rotulos ?? {}); setParecer(x.parecer ?? ''); setMudou(false);
  }).catch((e) => setErro(e.message)), [id]);
  useEffect(() => { carregar(); }, [carregar]);

  // órgão que a IA (ou o mentorado) associou a cada foto
  const orgaoDaFoto = useMemo(() => {
    const m: Record<string, string> = {};
    d?.conteudoEnviado.orgaos.forEach((o) => (o.imagens ?? []).forEach((n) => { const nome = d.imagensEnviadas[n - 1]; if (nome && !m[nome]) m[nome] = o.orgao; }));
    return m;
  }, [d]);

  useEffect(() => {
    if (!mudou) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [mudou]);

  if (erro && !d) return <Aviso>{erro}</Aviso>;
  if (!d || !c) return <p className="text-slate-500">Carregando…</p>;

  const editavel = d.souMentor && d.situacao === 'pendente';
  const enviado = d.conteudoEnviado;
  const mudar = (x: Partial<ConteudoLaudo>) => { setC({ ...c, ...x }); setMudou(true); };
  const mudarOrgao = (i: number, x: Partial<Orgao>) => mudar({ orgaos: c.orgaos.map((o, j) => (j === i ? { ...o, ...x } : o)) });
  const corpo = () => ({ conteudo: c, comentarios, rotulos, parecer });

  const salvar = async () => {
    setOcupado(true); setErro(''); setOk('');
    try { await api('PUT', `/api/revisoes-mentor/${d.id}`, corpo()); setOk('Rascunho salvo.'); setMudou(false); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };
  const concluir = async (confirmar: boolean) => {
    const msg = confirmar
      ? 'Confirmar o laudo sem alterações no texto? Seus comentários, o parecer e os órgãos das fotos também vão para o mentorado.'
      : 'Concluir a revisão e enviar ao mentorado? Depois disso, ela não pode mais ser alterada.';
    if (!confirm(msg)) return;
    setOcupado(true); setErro('');
    try {
      const r = await api<{ resultado: string }>('POST', `/api/revisoes-mentor/${d.id}/concluir`, { ...corpo(), confirmar });
      setMudou(false);
      setOk(r.resultado === 'confirmado' ? 'Revisão concluída: laudo confirmado.' : 'Revisão concluída: as sugestões foram enviadas ao mentorado.');
      await carregar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  const p = d.exame.paciente;
  const fora = d.medidasComparadas.filter((m) => m.situacao === 'acima' || m.situacao === 'abaixo');
  const opcoes = [...d.orgaos, INDEFINIDO];

  /** Texto enviado pelo mentorado, mostrado quando o mentor mudou o campo. */
  const Antes = ({ antes, agora }: { antes: string; agora: string }) =>
    igual(antes.trim(), agora.trim()) ? null : (
      <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500"><b>Enviado pelo mentorado:</b> {antes || '(vazio)'}</p>
    );

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to={d.souMentor ? '/mentoria/revisoes' : `/exames/${d.exameId}`} className="text-[#0E4D64] underline">
          ← {d.souMentor ? 'Pedidos de revisão' : 'Voltar ao exame'}
        </Link>
      </div>
      <Titulo>Revisão do laudo — {p.nome}</Titulo>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">{[p.especie, p.raca, d.exame.tipoExame].filter(Boolean).join(' · ')}</span>
        <span className="text-slate-500">· de {d.mentorado}, enviado em {dataHora(d.enviadaEm)}</span>
        {d.paraEnsino && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">Para ensino (laudo já assinado)</span>}
        {d.situacao === 'concluida' && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.resultado === 'confirmado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            {d.resultado === 'confirmado' ? 'Laudo confirmado pelo mentor' : 'Revisado pelo mentor, com sugestões'}
          </span>
        )}
        {d.situacao === 'cancelada' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Cancelada</span>}
      </div>
      {d.mensagem && <div className="mb-3"><Aviso tipo="info">Mensagem do mentorado: “{d.mensagem}”</Aviso></div>}
      {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
      {ok && <div className="mb-3"><Aviso tipo="ok">{ok}</Aviso></div>}

      <div className="space-y-4">
        <Cartao titulo="Paciente e exame">
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {([
              ['Espécie / raça', [p.especie, p.raca].filter(Boolean).join(' / ')],
              ['Sexo', [p.sexo === 'M' ? 'Macho' : p.sexo === 'F' ? 'Fêmea' : p.sexo, p.castrado ? 'castrado(a)' : null].filter(Boolean).join(', ')],
              ['Idade', d.exame.idade], ['Peso', d.exame.peso], ['Jejum', d.exame.jejum], ['Equipamento', d.exame.equipamento],
              ['Suspeita clínica', d.exame.suspeitaClinica], ['Histórico', d.exame.historico], ['Informações adicionais', d.exame.informacoesAdicionais],
            ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="inline font-medium text-slate-600">{k}: </dt><dd className="inline text-slate-800">{v}</dd></div>
            ))}
          </dl>
          {fora.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <b className="mr-1">Medidas fora da referência:</b>
              {fora.map((m, i) => <span key={i} className="mr-3 inline-block">{m.situacao === 'acima' ? '▲' : '▼'} {m.grupo ? `${m.grupo} > ` : ''}{m.nome}: {m.valor} {m.unidade} (ref. {m.faixaTexto})</span>)}
            </div>
          )}
        </Cartao>

        <Cartao titulo={`Fotos (${d.fotos.length})`}>
          <p className="mb-2 text-xs text-slate-500">
            {editavel ? 'Confira o órgão de cada foto: o que você definir ensina a IA (com mais peso que uma revisão comum).' : 'Órgão de cada foto segundo o mentor.'}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {d.fotos.map((f, i) => {
              const sugerido = orgaoDaFoto[f.nome] ?? '';
              const valor = rotulos[f.nome] ?? sugerido;
              const corrigido = !!rotulos[f.nome] && rotulos[f.nome] !== sugerido;
              return (
                <div key={f.nome} className={`rounded-lg border p-1.5 ${corrigido ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => setFoto(i)} className="block w-full" aria-label={`Ampliar ${f.nome}`}>
                    <img src={f.url} alt={f.nome} loading="lazy" className="aspect-[4/3] w-full rounded object-cover" />
                  </button>
                  <select value={valor} disabled={!editavel} aria-label={`Órgão da foto ${f.nome}`}
                    onChange={(e) => { setRotulos({ ...rotulos, [f.nome]: e.target.value }); setMudou(true); }}
                    className="mt-1 min-h-9 w-full rounded border border-slate-300 bg-white px-1 text-xs disabled:bg-slate-50">
                    <option value="">— sem órgão —</option>
                    {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {corrigido && <div className="mt-0.5 text-[11px] text-amber-900">Era: {sugerido || 'sem órgão'}</div>}
                </div>
              );
            })}
          </div>
          {editavel && d.fotos.some((f) => orgaoDaFoto[f.nome] && !rotulos[f.nome]) && (
            <Botao variante="secundario" className="mt-2" onClick={() => {
              const r = { ...rotulos };
              d.fotos.forEach((f) => { if (!r[f.nome] && orgaoDaFoto[f.nome]) r[f.nome] = orgaoDaFoto[f.nome]; });
              setRotulos(r); setMudou(true);
            }}>Confirmar os órgãos sugeridos</Botao>
          )}
        </Cartao>

        <Cartao titulo="Laudo">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Condições técnicas</span>
              <textarea rows={2} className={area} disabled={!editavel} value={c.condicoesTecnicas ?? ''} onChange={(e) => mudar({ condicoesTecnicas: e.target.value })} />
              <Antes antes={enviado.condicoesTecnicas ?? ''} agora={c.condicoesTecnicas ?? ''} />
            </label>

            {c.orgaos.map((o, i) => {
              const antes = enviado.orgaos.find((x) => x.orgao === o.orgao);
              const mudouOrgao = !antes || antes.situacao !== o.situacao || antes.descricao.trim() !== o.descricao.trim();
              return (
                <div key={o.orgao} className={`rounded-xl border p-3 ${mudouOrgao ? 'border-amber-300' : 'border-slate-200'}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{o.orgao}</span>
                    {mudouOrgao && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">alterado pelo mentor</span>}
                    <div className="ml-auto flex flex-wrap gap-1">
                      {(['normal', 'alterado', 'nao_visualizado'] as SituacaoOrgao[]).map((s) => (
                        <button key={s} type="button" disabled={!editavel}
                          onClick={() => mudarOrgao(i, s === 'normal' && d.mascaras[o.orgao] && o.situacao !== 'normal' ? { situacao: s, descricao: d.mascaras[o.orgao] } : { situacao: s })}
                          className={`min-h-9 rounded-full border px-3 text-xs font-medium ${o.situacao === s ? corSituacao[s] + ' ring-2 ring-offset-1 ring-[#0E4D64]/40' : 'border-slate-300 bg-white text-slate-600'} disabled:cursor-default`}>
                          {nomeSituacao[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea rows={3} className={area} disabled={!editavel} value={o.descricao} onChange={(e) => mudarOrgao(i, { descricao: e.target.value })} />
                  {antes && (antes.situacao !== o.situacao || antes.descricao.trim() !== o.descricao.trim()) && (
                    <p className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
                      <b>Enviado pelo mentorado ({nomeSituacao[antes.situacao]}):</b> {antes.descricao || '(vazio)'}
                    </p>
                  )}
                  {(editavel || comentarios[o.orgao]) && (
                    <textarea rows={2} disabled={!editavel} value={comentarios[o.orgao] ?? ''} placeholder="Comentário para o mentorado sobre este órgão (opcional)"
                      onChange={(e) => { setComentarios({ ...comentarios, [o.orgao]: e.target.value }); setMudou(true); }}
                      className="mt-2 w-full rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:text-slate-700" />
                  )}
                </div>
              );
            })}

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Impressão diagnóstica</span>
              <textarea rows={3} className={area} disabled={!editavel} value={c.impressaoDiagnostica ?? ''} onChange={(e) => mudar({ impressaoDiagnostica: e.target.value })} />
              <Antes antes={enviado.impressaoDiagnostica ?? ''} agora={c.impressaoDiagnostica ?? ''} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Diagnósticos diferenciais (um por linha)</span>
              <textarea rows={3} className={area} disabled={!editavel} defaultValue={linhas(c.diferenciais)} key={`dif-${d.situacao}`}
                onChange={(e) => mudar({ diferenciais: lista(e.target.value) })} />
              <Antes antes={linhas(enviado.diferenciais)} agora={linhas(c.diferenciais)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Recomendações (uma por linha)</span>
              <textarea rows={3} className={area} disabled={!editavel} defaultValue={linhas(c.recomendacoes)} key={`rec-${d.situacao}`}
                onChange={(e) => mudar({ recomendacoes: lista(e.target.value) })} />
              <Antes antes={linhas(enviado.recomendacoes)} agora={linhas(c.recomendacoes)} />
            </label>
          </div>
        </Cartao>

        <Cartao titulo="Parecer do mentor">
          {editavel || parecer ? (
            <textarea rows={4} maxLength={4000} className={area} disabled={!editavel} value={parecer}
              onChange={(e) => { setParecer(e.target.value); setMudou(true); }}
              placeholder="Orientação geral para o mentorado: o que está bom, o que revisar, o que estudar." />
          ) : <p className="text-sm text-slate-500">Sem parecer.</p>}
        </Cartao>

        {editavel && (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <Botao variante="secundario" disabled={ocupado} onClick={salvar}>Salvar rascunho</Botao>
            <Botao variante="secundario" disabled={ocupado} onClick={() => concluir(true)}>Confirmar sem alterações</Botao>
            <Botao disabled={ocupado} onClick={() => concluir(false)} className="ml-auto">Concluir revisão</Botao>
          </div>
        )}
      </div>

      {foto !== null && d.fotos[foto] && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex flex-col bg-black/90" onClick={() => setFoto(null)}>
          <div className="flex items-center justify-between px-3 py-2 text-sm text-white">
            <span>{d.fotos[foto].nome} ({foto + 1}/{d.fotos.length})</span>
            <button type="button" className="min-h-10 rounded-lg border border-white/40 px-3">Fechar ✕</button>
          </div>
          <div className="flex flex-1 items-center justify-center gap-2 p-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Anterior" className="min-h-12 min-w-10 text-3xl text-white" onClick={() => setFoto((foto + d.fotos.length - 1) % d.fotos.length)}>‹</button>
            <img src={d.fotos[foto].url} alt={d.fotos[foto].nome} className="max-h-[85vh] max-w-full object-contain" />
            <button type="button" aria-label="Próxima" className="min-h-12 min-w-10 text-3xl text-white" onClick={() => setFoto((foto + 1) % d.fotos.length)}>›</button>
          </div>
        </div>
      )}
    </>
  );
}

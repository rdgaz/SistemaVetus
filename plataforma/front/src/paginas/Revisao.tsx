import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, AvisoIa, Botao, Cartao } from '../ui';
import { DocumentoEditavel, type DadosDocumento } from './DocumentoEditavel';

export type SituacaoOrgao = 'normal' | 'alterado' | 'nao_visualizado';
/** imagens: números (posição + 1 em imagensEnviadas) das fotos que a IA associou ao órgão */
export type Orgao = { orgao: string; situacao: SituacaoOrgao; descricao: string; imagens?: number[] };
export type ConteudoLaudo = {
  condicoesTecnicas: string;
  orgaos: Orgao[];
  impressaoDiagnostica: string;
  diferenciais: string[];
  recomendacoes: string[];
  imagensSugeridas: number[];
  achadoUrgente: boolean;
  /** números (posição + 1 em imagensEnviadas) das imagens que mostram o achado urgente */
  imagensUrgencia?: number[];
  /** alta, media ou baixa; evidência: o que a IA viu em cada imagem */
  confiancaUrgencia?: string;
  evidenciaUrgencia?: string;
  /** o veterinário discordou do alerta (ele sai do laudo) */
  alertaDiscordado?: boolean;
  motivoUrgencia: string;
  camposExtraidos?: Record<string, string>;
  /** fotos escolhidas para a prancha (nomes de arquivo) */
  prancha?: string[];
  /** mostrar "Diagnósticos diferenciais" no laudo (PDF); ausente = sim */
  exibirDiferenciais?: boolean;
};
export type Foto = { nome: string; url: string };

export const nomeSituacao: Record<SituacaoOrgao, string> = { normal: 'Normal', alterado: 'Alterado', nao_visualizado: 'Não visibilizado' };
export const corSituacao: Record<SituacaoOrgao, string> = {
  normal: 'bg-green-100 text-green-900 border-green-300',
  alterado: 'bg-amber-100 text-amber-900 border-amber-300',
  nao_visualizado: 'bg-slate-200 text-slate-700 border-slate-300',
};
/** Botão selecionado: cor cheia + texto branco (bem visível também no modo escuro do celular). */
const corBotaoSelecionado: Record<SituacaoOrgao, string> = {
  normal: 'border-green-700 bg-green-600 text-white',
  alterado: 'border-amber-700 bg-amber-500 text-white',
  nao_visualizado: 'border-slate-700 bg-slate-600 text-white',
};

/** Prancha inicial: a escolhida na revisão ou as fotos sugeridas pela IA. */
export function pranchaInicial(c: ConteudoLaudo, imagensEnviadas: string[]) {
  if (c.prancha) return c.prancha;
  // sugestão: a primeira imagem que a IA associou a cada órgão (até 8); laudos sem isso usam as imagens sugeridas por ela
  const porOrgao: string[] = [];
  for (const o of c.orgaos ?? []) {
    const nome = (o.imagens ?? []).map((n) => imagensEnviadas[n - 1]).find((x): x is string => !!x);
    if (nome && !porOrgao.includes(nome)) porOrgao.push(nome);
  }
  const sugeridas = (c.imagensSugeridas ?? []).map((n) => imagensEnviadas[n - 1]).filter((x): x is string => !!x);
  return (porOrgao.length > 0 ? porOrgao : sugeridas).slice(0, 8);
}

const area = 'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-[15px] outline-none focus:border-[#0E4D64] focus:ring-2 focus:ring-[#0E4D64]/20';

/**
 * Revisão do pré-laudo pelo veterinário: cada órgão editável (com "Normal"), conclusão, prancha;
 * salvar, pré-visualizar o PDF e aprovar/assinar.
 */
export function Revisao({ exameId, conteudoInicial, imagensEnviadas, fotos, mascaras, aoMudar, aoAbrirFoto, aoAbrirGaleria, dados }: {
  exameId: string;
  conteudoInicial: ConteudoLaudo;
  imagensEnviadas: string[];
  fotos: Foto[];
  mascaras: Record<string, string>;
  aoMudar: () => Promise<void>;
  aoAbrirFoto: (nome: string) => void;
  aoAbrirGaleria: (lista: Foto[], indice: number) => void;
  dados: DadosDocumento;
}) {
  const { usuario, clinica } = useSessao();
  const inicial = useMemo(() => ({
    ...conteudoInicial,
    // "Cavidade abdominal" saiu do laudo (laudos antigos ainda podem trazê-la)
    orgaos: conteudoInicial.orgaos.filter((o) => !o.orgao.trim().toLowerCase().startsWith("cavidade abdominal")),
    prancha: pranchaInicial(conteudoInicial, imagensEnviadas),
  }), [conteudoInicial, imagensEnviadas]);
  const [c, setC] = useState<ConteudoLaudo>(inicial);
  const [escolhendo, setEscolhendo] = useState(false);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [documento, setDocumento] = useState(false);
  // rótulos de imagem (o que cada foto mostra, segundo o veterinário)
  const [rotulos, setRotulos] = useState<Record<string, RotuloFoto>>({});
  const [opcoesRotulo, setOpcoesRotulo] = useState<string[]>([]);
  useEffect(() => {
    api<{ opcoes: string[]; rotulos: RotuloFoto[] }>('GET', `/api/exames/${exameId}/rotulos`)
      .then((r) => { setOpcoesRotulo(r.opcoes); setRotulos(Object.fromEntries(r.rotulos.map((x) => [x.foto, x]))); })
      .catch(() => undefined);
  }, [exameId]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => setC(inicial), [inicial]);
  const alterado = JSON.stringify(c) !== JSON.stringify(inicial);
  useEffect(() => {
    if (!alterado) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [alterado]);

  const perfilAssina = clinica?.perfil === 'Veterinario' || clinica?.perfil === 'AdministradorClinica';
  const temCrmv = !!(usuario?.crmv && usuario?.crmvUf);
  const prancha = c.prancha ?? [];

  const mudarOrgao = (i: number, m: Partial<Orgao>) =>
    setC({ ...c, orgaos: c.orgaos.map((o, k) => (k === i ? { ...o, ...m } : o)) });
  const aplicarNormal = (i: number) => {
    const frase = mascaras[c.orgaos[i].orgao];
    mudarOrgao(i, { situacao: 'normal', ...(frase ? { descricao: frase } : {}) });
  };
  const alternarFoto = (nome: string) => {
    if (prancha.includes(nome)) setC({ ...c, prancha: prancha.filter((x) => x !== nome) });
    else setC({ ...c, prancha: [...prancha, nome] }); // sem limite de fotos
  };

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setErro('');
    setAviso('');
    setOcupado(true);
    try {
      await acao();
      setAviso(ok);
      await aoMudar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const salvar = () => executar(() => api('PUT', `/api/exames/${exameId}/laudo`, { conteudo: c }), 'Revisão salva.');
  const previa = async () => {
    if (alterado) await api('PUT', `/api/exames/${exameId}/laudo`, { conteudo: c }).catch(() => undefined);
    window.open(`/api/exames/${exameId}/laudo.pdf`, '_blank');
  };
  const assinar = () => {
    if (!confirm('Você conferiu todas as informações com as imagens e com o exame? O texto é uma sugestão de inteligência artificial e a responsabilidade pelo laudo é sua.\n\nAprovar e assinar? Depois de assinado ele não pode mais ser editado (só retificado).')) return;
    return executar(() => api('POST', `/api/exames/${exameId}/laudo/assinar`, { conteudo: c }), 'Laudo assinado.');
  };

  const linhas = (lista: string[]) => (lista ?? []).join('\n');
  const deLinhas = (texto: string) => texto.split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <Cartao titulo="Revisão do laudo">
      {documento && (
        <DocumentoEditavel c={c} setC={setC} dados={dados} fotos={fotos} imagensEnviadas={imagensEnviadas} prancha={prancha}
          alternarFoto={alternarFoto} aoSalvar={salvar} aoPrevia={previa} aoFechar={() => setDocumento(false)}
          ocupado={ocupado} alterado={alterado} />
      )}
      {detalhe !== null && c.orgaos[detalhe] && (
        <DetalhesOrgao orgao={c.orgaos[detalhe]} exameId={exameId} imagensEnviadas={imagensEnviadas} fotos={fotos} rotulos={rotulos} opcoes={opcoesRotulo}
          aoRotular={(r) => setRotulos((atual) => ({ ...atual, [r.foto]: r }))} aoAbrirGaleria={aoAbrirGaleria}
          aoMudarDescricao={(texto) => mudarOrgao(detalhe, { descricao: texto })} aoFechar={() => setDetalhe(null)} />
      )}
      <div className="space-y-4">
        <AvisoIa />
        {erro && <Aviso>{erro}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
        <AlertaUrgente conteudo={c} imagensEnviadas={imagensEnviadas} fotos={fotos} aoAbrirGaleria={aoAbrirGaleria} exameId={exameId} aoMudar={aoMudar} />

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Condições técnicas</span>
          <textarea rows={2} className={area} value={c.condicoesTecnicas}
            onChange={(e) => setC({ ...c, condicoesTecnicas: e.target.value })} />
        </label>

        <div className="space-y-3">
          <span className="block text-sm font-semibold text-slate-700">Achados por órgão</span>
          {c.orgaos.map((o, i) => (
            <div key={o.orgao} className={`rounded-lg border p-3 transition-colors ${o.situacao === 'alterado' ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="mr-auto font-medium">{o.orgao}</span>
                <button type="button" onClick={() => setDetalhe(i)} className="min-h-9 rounded-full border border-[#0E4D64]/40 bg-white px-3 text-xs font-semibold text-[#0E4D64] hover:bg-slate-50" title="Descrição, imagens do órgão e ditado por voz">Mais detalhes</button>
                <FrasesProntas orgao={o.orgao} aoEscolher={(f) => {
                  const normal = /^(normai?s?|ov[aá]rios normais|apenas um ov[aá]rio|castrad|padr[aã]o castrad|n[aã]o caracterizad|pelve renal normal)/i.test(f.titulo);
                  mudarOrgao(i, { situacao: normal ? 'normal' : 'alterado', descricao: f.descricao });
                  const novas = f.impressoes.filter((x) => !c.impressaoDiagnostica.includes(x));
                  if (novas.length) setC((atual) => ({ ...atual, impressaoDiagnostica: [atual.impressaoDiagnostica, ...novas].filter(Boolean).join('\n') }));
                }} />
                {(['normal', 'alterado', 'nao_visualizado'] as SituacaoOrgao[]).map((s) => (
                  <button key={s} type="button" onClick={() => (s === 'normal' ? aplicarNormal(i) : mudarOrgao(i, { situacao: s }))}
                    aria-pressed={o.situacao === s}
                    className={`min-h-9 rounded-full border-2 px-3 text-xs font-semibold ${o.situacao === s ? corBotaoSelecionado[s] : 'border-slate-200 bg-white text-slate-500'}`}
                    title={s === 'normal' ? 'Marca normal e aplica a frase padrão de normalidade' : undefined}>
                    {o.situacao === s && '✓ '}{nomeSituacao[s]}
                  </button>
                ))}
              </div>
              <ImagensDoOrgao orgao={o} exameId={exameId} imagensEnviadas={imagensEnviadas} fotos={fotos} rotulos={rotulos} opcoes={opcoesRotulo}
                aoRotular={(r) => setRotulos((atual) => ({ ...atual, [r.foto]: r }))} aoAbrirGaleria={aoAbrirGaleria} />
              <textarea rows={o.situacao === 'alterado' ? 3 : 2} className={area} value={o.descricao} onChange={(e) => mudarOrgao(i, { descricao: e.target.value })} />
            </div>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Impressão diagnóstica</span>
          <textarea rows={3} className={area} value={c.impressaoDiagnostica}
            onChange={(e) => setC({ ...c, impressaoDiagnostica: e.target.value })} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
              <span>Diagnósticos diferenciais <span className="font-normal text-slate-500">(um por linha)</span></span>
              <span className="flex shrink-0 items-center gap-2 font-normal">
                <span className="text-xs text-slate-600">{c.exibirDiferenciais === false ? 'Oculto no laudo' : 'Exibir no laudo'}</span>
                <button type="button" role="switch" aria-checked={c.exibirDiferenciais !== false} aria-label="Exibir diagnósticos diferenciais no laudo"
                  onClick={() => setC({ ...c, exibirDiferenciais: c.exibirDiferenciais === false })}
                  className={`relative h-7 w-12 rounded-full transition-colors ${c.exibirDiferenciais === false ? 'bg-slate-400' : 'bg-[#0E4D64]'}`}>
                  <span className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${c.exibirDiferenciais === false ? 'left-0.5' : 'left-[22px]'}`} />
                </button>
              </span>
            </span>
            <textarea rows={3} className={`${area} ${c.exibirDiferenciais === false ? "opacity-60" : ""}`} value={linhas(c.diferenciais)} onChange={(e) => setC({ ...c, diferenciais: deLinhas(e.target.value) })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Recomendações <span className="font-normal text-slate-500">(uma por linha)</span></span>
            <textarea rows={3} className={area} value={linhas(c.recomendacoes)} onChange={(e) => setC({ ...c, recomendacoes: deLinhas(e.target.value) })} />
          </label>
        </div>

        {/* prancha */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Prancha do laudo ({prancha.length} foto(s))</span>
            <button type="button" className="text-sm font-medium text-[#0E4D64] underline" onClick={() => setEscolhendo(!escolhendo)}>
              {escolhendo ? 'Concluir escolha' : 'Escolher fotos'}
            </button>
          </div>
          {escolhendo ? (
            <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
              {fotos.map((f) => {
                const marcada = prancha.includes(f.nome);
                return (
                  <button key={f.nome} type="button" onClick={() => alternarFoto(f.nome)}
                    className={`relative overflow-hidden rounded-lg bg-black ring-offset-2 ${marcada ? 'ring-4 ring-[#0E4D64]' : ''}`}>
                    <img src={f.url} alt={f.nome} loading="lazy" className="aspect-[4/3] w-full object-contain" />
                    <span className={`absolute right-1 top-1 rounded-full px-1.5 text-xs font-bold ${marcada ? 'bg-[#0E4D64] text-white' : 'bg-white/80 text-slate-700'}`}>
                      {marcada ? `✓ ${prancha.indexOf(f.nome) + 1}` : '+'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : prancha.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma foto na prancha.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {prancha.map((nome) => {
                const f = fotos.find((x) => x.nome === nome);
                return f && (
                  <button key={nome} type="button" onClick={() => aoAbrirFoto(nome)} className="overflow-hidden rounded-lg bg-black">
                    <img src={f.url} alt={nome} loading="lazy" className="aspect-[4/3] w-full object-contain" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ações: barra fixa inferior para salvar, ver prévia ou assinar de qualquer ponto da revisão */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          {alterado && <span className="mr-auto text-sm font-medium text-amber-800">● Revisão não salva</span>}
          <Botao variante="secundario" disabled={!alterado || ocupado} onClick={salvar}>Salvar revisão</Botao>
          <Botao variante="secundario" disabled={ocupado} onClick={() => setDocumento(true)}>Editar como documento</Botao>
          <Botao variante="secundario" disabled={ocupado} onClick={previa}>Prévia do PDF</Botao>
          <Botao disabled={ocupado || !perfilAssina || !temCrmv} onClick={assinar}>Aprovar e assinar</Botao>
        </div>
        {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}
        {!perfilAssina && <p className="text-right text-xs text-slate-500">Somente veterinário pode assinar.</p>}
        {perfilAssina && !temCrmv && (
          <p className="text-right text-xs text-amber-800">Para assinar, cadastre o seu CRMV e a UF em "Minha conta" (e, se quiser, a imagem da assinatura).</p>
        )}
      </div>
    </Cartao>
  );
}

type FraseBanco = { titulo: string; descricao: string; impressoes: string[] };

/** Escolha de uma frase pronta (banco "Laudo Fácil") para o órgão: preenche a descrição e a impressão diagnóstica. */
function FrasesProntas({ orgao, aoEscolher }: { orgao: string; aoEscolher: (f: FraseBanco) => void }) {
  const [lista, setLista] = useState<FraseBanco[] | null>(null);
  const carregar = () => {
    if (lista) return;
    api<{ entradas: FraseBanco[] }>('GET', `/api/frases?orgao=${encodeURIComponent(orgao)}`)
      .then((r) => setLista(r.entradas)).catch(() => setLista([]));
  };
  return (
    <select aria-label={`Frase pronta para ${orgao}`} defaultValue="" onFocus={carregar} onMouseDown={carregar}
      onChange={(e) => {
        const f = lista?.[Number(e.target.value)];
        if (f) aoEscolher(f);
        e.target.value = '';
      }}
      className="min-h-9 max-w-52 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700">
      <option value="">Frase pronta…</option>
      {lista === null && <option disabled>Carregando…</option>}
      {lista?.length === 0 && <option disabled>Nenhuma para este órgão</option>}
      {lista?.map((f, i) => <option key={i} value={i}>{f.titulo}</option>)}
    </select>
  );
}

/**
 * Imagens do alerta de achado urgente: a IA indica quais mostram o achado ("imagensUrgencia"); em pré-laudos antigos,
 * que não trazem isso, usa as imagens que ela destacou como principais ("imagensSugeridas"). O botão abre a galeria só com elas.
 */
export function FotosDoAlerta({ conteudo, imagensEnviadas, fotos, aoAbrirGaleria }: {
  conteudo: ConteudoLaudo;
  imagensEnviadas: string[];
  fotos: Foto[];
  aoAbrirGaleria: (lista: Foto[], indice: number) => void;
}) {
  const indicadas = (conteudo.imagensUrgencia ?? []).length > 0;
  const numeros = indicadas ? conteudo.imagensUrgencia! : (conteudo.imagensSugeridas ?? []).slice(0, 6);
  const itens = [...new Set(numeros)]
    .map((n) => ({ n, foto: fotos.find((f) => f.nome === imagensEnviadas[n - 1]) }))
    .filter((x): x is { n: number; foto: Foto } => !!x.foto);
  if (itens.length === 0) return null;
  const lista = itens.map((x) => x.foto);
  return (
    <div className="mt-2 space-y-2">
      <button type="button" onClick={() => aoAbrirGaleria(lista, 0)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-100">
        🖼 Ver as {itens.length} imagem(ns) {indicadas ? 'em que a IA identificou este achado' : 'principais indicadas pela IA'}
      </button>
      <div className="flex flex-wrap gap-2">
        {itens.map(({ n, foto }, i) => (
          <button key={foto.nome} type="button" onClick={() => aoAbrirGaleria(lista, i)}
            className="overflow-hidden rounded-lg border border-red-300 bg-black text-left" title="Ampliar">
            <img src={foto.url} alt={`Imagem ${n}`} className="h-24 w-auto sm:h-28" loading="lazy" />
            <span className="block bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">Imagem {n}</span>
          </button>
        ))}
      </div>
      {!indicadas && <p className="text-xs text-red-900/80">Este pré-laudo não indicou as imagens exatas do alerta; refazer a análise completa as indica.</p>}
    </div>
  );
}

/**
 * Alerta de achado urgente da IA. Vermelho com confiança alta (ou não informada, em pré-laudos antigos); amarelo, como
 * "possível achado", com confiança média ou baixa. Na revisão, o veterinário pode discordar (fica registrado).
 */
export function AlertaUrgente({ conteudo, imagensEnviadas, fotos, aoAbrirGaleria, exameId, aoMudar }: {
  conteudo: ConteudoLaudo;
  imagensEnviadas: string[];
  fotos: Foto[];
  aoAbrirGaleria: (lista: Foto[], indice: number) => void;
  /** com exameId e aoMudar, mostra o botão "Discordo deste alerta" */
  exameId?: string;
  aoMudar?: () => Promise<void>;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState('falso_alarme');
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  if (!conteudo.achadoUrgente) return null;

  const fraco = conteudo.confiancaUrgencia === 'media' || conteudo.confiancaUrgencia === 'baixa';
  const caixa = fraco ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-red-200 bg-red-50 text-red-800';
  const enviar = async () => {
    if (!exameId || !aoMudar) return;
    setOcupado(true); setErro('');
    try {
      await api('POST', `/api/exames/${exameId}/laudo/alerta/discordar`, { motivo, comentario });
      await aoMudar();
    } catch (x) { setErro((x as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${caixa}`}>
      <b>{fraco ? '⚠ Possível achado — confiança da IA ' + (conteudo.confiancaUrgencia === 'baixa' ? 'baixa' : 'média') + ', confira nas imagens:' : '⚠ Achado que pede atenção imediata:'}</b>{' '}
      {conteudo.motivoUrgencia}
      {conteudo.evidenciaUrgencia && <p className="mt-1 text-xs opacity-90"><b>O que a IA viu:</b> {conteudo.evidenciaUrgencia}</p>}
      <FotosDoAlerta conteudo={conteudo} imagensEnviadas={imagensEnviadas} fotos={fotos} aoAbrirGaleria={aoAbrirGaleria} />
      {exameId && aoMudar && (
        <div className="mt-3 border-t border-black/10 pt-2">
          {!abrindo ? (
            <button type="button" onClick={() => setAbrindo(true)}
              className="min-h-10 rounded-lg border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100">
              Discordo deste alerta
            </button>
          ) : (
            <div className="space-y-2 text-slate-800">
              <p className="text-xs">O alerta sai do laudo e a sua discordância fica registrada para melhorar a IA.</p>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2">
                <option value="falso_alarme">Falso alarme: não há esse achado</option>
                <option value="achado_diferente">Há um achado, mas é outro</option>
                <option value="imagens_insuficientes">As imagens não permitem concluir isso</option>
              </select>
              <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={2000}
                placeholder="Qual é a leitura correta? (ajuda a melhorar a IA)"
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
              {erro && <p className="text-xs text-red-700">{erro}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={ocupado} onClick={enviar} className="min-h-10 rounded-lg bg-[#0E4D64] px-4 text-sm font-semibold text-white disabled:bg-slate-400">Registrar discordância</button>
                <button type="button" onClick={() => setAbrindo(false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RotuloFoto = { foto: string; orgaoIa: string | null; orgaoCorreto: string; tipo: string };

/**
 * Fotos que a IA usou para o órgão. O veterinário confirma (✓) ou diz que não é este órgão (✗) e o que a imagem mostra:
 * cada resposta vira um rótulo guardado como base de treino de um futuro agente de imagens.
 */
export function ImagensDoOrgao({ orgao, exameId, imagensEnviadas, fotos, rotulos, opcoes, aoRotular, aoAbrirGaleria }: {
  orgao: Orgao;
  exameId: string;
  imagensEnviadas: string[];
  fotos: Foto[];
  rotulos: Record<string, RotuloFoto>;
  opcoes: string[];
  aoRotular: (r: RotuloFoto) => void;
  aoAbrirGaleria: (lista: Foto[], indice: number) => void;
}) {
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const itens = [...new Set(orgao.imagens ?? [])].slice(0, 4)
    .map((n) => ({ n, foto: fotos.find((f) => f.nome === imagensEnviadas[n - 1]) }))
    .filter((x): x is { n: number; foto: Foto } => !!x.foto);
  if (itens.length === 0) return null;
  const lista = itens.map((x) => x.foto);

  const gravar = async (foto: string, orgaoCorreto: string) => {
    setErro('');
    try {
      const r = await api<RotuloFoto>('PUT', `/api/exames/${exameId}/rotulos`, { foto, orgaoIa: orgao.orgao, orgaoCorreto });
      aoRotular(r);
      setCorrigindo(null);
    } catch (x) { setErro((x as Error).message); }
  };

  return (
    <div className="mb-2">
      <p className="mb-1 text-xs text-slate-500">Imagens que a IA usou para {orgao.orgao}: confirme (✓) ou indique o que cada uma mostra (✗).</p>
      <div className="flex flex-wrap gap-2">
        {itens.map(({ n, foto }, i) => {
          const r = rotulos[foto.nome];
          const corrigida = r?.tipo === 'correcao';
          return (
            <div key={foto.nome} className={`w-36 overflow-hidden rounded-lg border-2 bg-white ${corrigida ? 'border-amber-400' : r ? 'border-emerald-500' : 'border-slate-200'}`}>
              <button type="button" onClick={() => aoAbrirGaleria(lista, i)} className="block w-full bg-black" title="Ampliar">
                <img src={foto.url} alt={`Imagem ${n}`} loading="lazy" className="h-24 w-full object-contain" />
              </button>
              <div className="flex items-center gap-1 px-1 py-1 text-xs">
                <span className="mr-auto text-slate-500">Imagem {n}</span>
                <button type="button" aria-label="Confirmar: é este órgão" title="É este órgão" onClick={() => gravar(foto.nome, orgao.orgao)}
                  className={`size-8 rounded font-bold ${r && !corrigida ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-emerald-700 hover:bg-emerald-50'}`}>✓</button>
                <button type="button" aria-label="Não é este órgão" title="Não é este órgão" onClick={() => setCorrigindo(foto.nome)}
                  className={`size-8 rounded font-bold ${corrigida ? 'bg-amber-500 text-white' : 'border border-slate-300 text-red-700 hover:bg-red-50'}`}>✗</button>
              </div>
              {r && <div className={`px-1 pb-1 text-[11px] ${corrigida ? 'text-amber-800' : 'text-emerald-700'}`}>{corrigida ? `Mostra: ${r.orgaoCorreto}` : '✓ confirmada'}</div>}
            </div>
          );
        })}
      </div>
      {corrigindo && (
        <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
          <p>A que se refere esta imagem? Toque na resposta (ela ajuda a treinar a IA):</p>
          <div className="flex flex-wrap gap-1.5">
            {opcoes.filter((o) => o !== orgao.orgao).map((o) => (
              <button key={o} type="button" onClick={() => gravar(corrigindo, o)}
                className="min-h-9 rounded-full border border-amber-400 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-amber-100">{o}</button>
            ))}
          </div>
          {erro && <p className="text-xs text-red-700">{erro}</p>}
          <button type="button" onClick={() => setCorrigindo(null)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs">Cancelar</button>
        </div>
      )}
    </div>
  );
}

type EventoFala = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Reconhecimento = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: EventoFala) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
const ReconhecimentoFala: (new () => Reconhecimento) | undefined =
  (window as unknown as { SpeechRecognition?: new () => Reconhecimento }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Reconhecimento }).webkitSpeechRecognition;

/**
 * "Mais detalhes" do órgão: descrição, imagens que a IA usou (confirmar/corrigir com um toque) e ditado por voz.
 * O que o médico fala é reescrito pela IA no padrão do laudo; relato, texto padronizado e texto final ficam guardados.
 */
function DetalhesOrgao({ orgao, exameId, imagensEnviadas, fotos, rotulos, opcoes, aoRotular, aoAbrirGaleria, aoMudarDescricao, aoFechar }: {
  orgao: Orgao;
  exameId: string;
  imagensEnviadas: string[];
  fotos: Foto[];
  rotulos: Record<string, RotuloFoto>;
  opcoes: string[];
  aoRotular: (r: RotuloFoto) => void;
  aoAbrirGaleria: (lista: Foto[], indice: number) => void;
  aoMudarDescricao: (texto: string) => void;
  aoFechar: () => void;
}) {
  const [relato, setRelato] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [padronizado, setPadronizado] = useState('');
  const [ditadoId, setDitadoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [todas, setTodas] = useState(false);
  const rec = useRef<Reconhecimento | null>(null);

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); rec.current?.stop(); };
  }, [aoFechar]);

  const falar = () => {
    if (!ReconhecimentoFala) { setErro('Este navegador não tem reconhecimento de voz. Use o Chrome ou o Edge, ou o microfone 🎤 do teclado do celular.'); return; }
    if (ouvindo) { rec.current?.stop(); return; }
    setErro('');
    const r = new ReconhecimentoFala();
    r.lang = 'pt-BR';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let novo = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) novo += e.results[i][0].transcript;
      if (novo) setRelato((atual) => (atual ? atual.trimEnd() + ' ' : '') + novo.trim());
    };
    r.onerror = (e) => { setErro(e.error === 'not-allowed' ? 'Permita o uso do microfone no navegador.' : `Erro no microfone (${e.error}).`); setOuvindo(false); };
    r.onend = () => setOuvindo(false);
    rec.current = r;
    r.start();
    setOuvindo(true);
  };

  const padronizar = async () => {
    rec.current?.stop();
    setOcupado(true); setErro('');
    try {
      const r = await api<{ id: string; texto: string }>('POST', `/api/exames/${exameId}/laudo/padronizar`,
        { orgao: orgao.orgao, texto: relato, descricaoAtual: orgao.descricao });
      setPadronizado(r.texto); setDitadoId(r.id);
    } catch (x) { setErro((x as Error).message); } finally { setOcupado(false); }
  };

  const usar = async () => {
    aoMudarDescricao(padronizado);
    if (ditadoId) await api('POST', `/api/exames/${exameId}/laudo/padronizar/${ditadoId}/aceitar`, { textoFinal: padronizado }).catch(() => undefined);
    setRelato(''); setPadronizado(''); setDitadoId(null);
  };

  const marcarComoEste = async (foto: string) => {
    setErro('');
    try { aoRotular(await api<RotuloFoto>('PUT', `/api/exames/${exameId}/rotulos`, { foto, orgaoIa: null, orgaoCorreto: orgao.orgao })); }
    catch (x) { setErro((x as Error).message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div role="dialog" aria-modal="true" aria-label={`Detalhes: ${orgao.orgao}`}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-800">{orgao.orgao} — detalhes</h3>
          <button type="button" onClick={aoFechar} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Fechar ✕</button>
        </div>
        {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}

        <section className="mb-4">
          <h4 className="mb-1 text-sm font-semibold text-slate-700">Descrição no laudo</h4>
          <textarea rows={4} className={area} value={orgao.descricao} onChange={(e) => aoMudarDescricao(e.target.value)} />
        </section>

        <section className="mb-4 rounded-xl border border-slate-200 p-3">
          <h4 className="mb-1 text-sm font-semibold text-slate-700">🎤 Falar o que quer registrar</h4>
          <p className="mb-2 text-xs text-slate-500">
            Fale do seu jeito. A IA reescreve no padrão do laudo, como se você tivesse digitado, sem inventar nada além do que você disse.
            Cada padronização consome uma pequena parte do saldo. O áudio não é guardado, só o texto.
          </p>
          <button type="button" onClick={falar}
            className={`mb-2 min-h-11 rounded-lg px-4 font-semibold ${ouvindo ? 'bg-red-600 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}>
            {ouvindo ? '■ Parar de ouvir' : '🎤 Falar'}
          </button>
          {ouvindo && <span className="ml-2 text-sm text-red-700">ouvindo…</span>}
          <textarea rows={3} className={area} value={relato} onChange={(e) => setRelato(e.target.value)} maxLength={3000}
            placeholder="O que você falou aparece aqui (dá para editar ou digitar)." />
          <button type="button" disabled={!relato.trim() || ocupado} onClick={padronizar}
            className="mt-2 min-h-11 rounded-lg bg-[#0E4D64] px-4 font-semibold text-white disabled:bg-slate-400">
            {ocupado ? 'Padronizando…' : 'Padronizar texto'}
          </button>
          {padronizado && (
            <div className="mt-3 space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
              <p className="text-xs font-semibold text-emerald-900">Texto no padrão do laudo (confira e edite se precisar):</p>
              <textarea rows={4} className={area} value={padronizado} onChange={(e) => setPadronizado(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={usar} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Usar no laudo</button>
                <button type="button" onClick={() => { setPadronizado(''); setDitadoId(null); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">Descartar</button>
              </div>
            </div>
          )}
        </section>

        <section className="mb-2">
          <h4 className="mb-1 text-sm font-semibold text-slate-700">Imagens deste órgão</h4>
          <ImagensDoOrgao orgao={orgao} exameId={exameId} imagensEnviadas={imagensEnviadas} fotos={fotos} rotulos={rotulos}
            opcoes={opcoes} aoRotular={aoRotular} aoAbrirGaleria={aoAbrirGaleria} />
          {(orgao.imagens ?? []).length === 0 && <p className="mb-2 text-sm text-slate-500">A IA não associou imagens a este órgão.</p>}
          <button type="button" onClick={() => setTodas(!todas)} className="text-sm font-medium text-[#0E4D64] underline">
            {todas ? 'Esconder as outras imagens' : 'Ver as outras imagens do exame (marcar as que mostram este órgão)'}
          </button>
          {todas && (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {imagensEnviadas.map((nome) => fotos.find((f) => f.nome === nome)).filter((f): f is Foto => !!f).map((f) => {
                const r = rotulos[f.nome];
                return (
                  <div key={f.nome} className={`overflow-hidden rounded-lg border-2 bg-white ${r ? 'border-emerald-500' : 'border-slate-200'}`}>
                    <button type="button" className="block w-full bg-black" onClick={() => aoAbrirGaleria([f], 0)}>
                      <img src={f.url} alt={f.nome} loading="lazy" className="h-20 w-full object-contain" />
                    </button>
                    <button type="button" onClick={() => marcarComoEste(f.nome)} className="w-full px-1 py-1 text-[11px] font-medium text-[#0E4D64] hover:bg-slate-50">
                      {r ? `Mostra: ${r.orgaoCorreto}` : `É ${orgao.orgao}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Cartao } from '../ui';

export type SituacaoOrgao = 'normal' | 'alterado' | 'nao_visualizado';
export type Orgao = { orgao: string; situacao: SituacaoOrgao; descricao: string };
export type ConteudoLaudo = {
  condicoesTecnicas: string;
  orgaos: Orgao[];
  impressaoDiagnostica: string;
  diferenciais: string[];
  recomendacoes: string[];
  imagensSugeridas: number[];
  achadoUrgente: boolean;
  motivoUrgencia: string;
  camposExtraidos?: Record<string, string>;
  /** fotos escolhidas para a prancha (nomes de arquivo) */
  prancha?: string[];
};
type Foto = { nome: string; url: string };

export const nomeSituacao: Record<SituacaoOrgao, string> = { normal: 'Normal', alterado: 'Alterado', nao_visualizado: 'Não visualizado' };
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
  return c.prancha ?? (c.imagensSugeridas ?? []).map((n) => imagensEnviadas[n - 1]).filter((x): x is string => !!x);
}

const MAX_PRANCHA = 12;
const area = 'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-[15px] outline-none focus:border-[#1f3b57] focus:ring-2 focus:ring-[#1f3b57]/20';

/**
 * Revisão do pré-laudo pelo veterinário: cada órgão editável (com "Normal"), conclusão, prancha;
 * salvar, pré-visualizar o PDF e aprovar/assinar.
 */
export function Revisao({ exameId, conteudoInicial, imagensEnviadas, fotos, mascaras, aoMudar, aoAbrirFoto }: {
  exameId: string;
  conteudoInicial: ConteudoLaudo;
  imagensEnviadas: string[];
  fotos: Foto[];
  mascaras: Record<string, string>;
  aoMudar: () => Promise<void>;
  aoAbrirFoto: (nome: string) => void;
}) {
  const { usuario, clinica } = useSessao();
  const inicial = useMemo(() => ({ ...conteudoInicial, prancha: pranchaInicial(conteudoInicial, imagensEnviadas) }), [conteudoInicial, imagensEnviadas]);
  const [c, setC] = useState<ConteudoLaudo>(inicial);
  const [escolhendo, setEscolhendo] = useState(false);
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
    else if (prancha.length < MAX_PRANCHA) setC({ ...c, prancha: [...prancha, nome] });
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
    if (!confirm('Aprovar e assinar o laudo? Depois de assinado ele não pode mais ser editado (só retificado).')) return;
    return executar(() => api('POST', `/api/exames/${exameId}/laudo/assinar`, { conteudo: c }), 'Laudo assinado.');
  };

  const linhas = (lista: string[]) => (lista ?? []).join('\n');
  const deLinhas = (texto: string) => texto.split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <Cartao titulo="Revisão do laudo">
      <div className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
        {c.achadoUrgente && <Aviso><b>⚠ Achado que pede atenção imediata:</b> {c.motivoUrgencia}</Aviso>}

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Condições técnicas</span>
          <textarea rows={2} className={area} value={c.condicoesTecnicas}
            onChange={(e) => setC({ ...c, condicoesTecnicas: e.target.value })} />
        </label>

        <div className="space-y-3">
          <span className="block text-sm font-semibold text-slate-700">Achados por órgão</span>
          {c.orgaos.map((o, i) => (
            <div key={o.orgao} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="mr-auto font-medium">{o.orgao}</span>
                {(['normal', 'alterado', 'nao_visualizado'] as SituacaoOrgao[]).map((s) => (
                  <button key={s} type="button" onClick={() => (s === 'normal' ? aplicarNormal(i) : mudarOrgao(i, { situacao: s }))}
                    aria-pressed={o.situacao === s}
                    className={`min-h-9 rounded-full border-2 px-3 text-xs font-semibold ${o.situacao === s ? corBotaoSelecionado[s] : 'border-slate-200 bg-white text-slate-500'}`}
                    title={s === 'normal' ? 'Marca normal e aplica a frase padrão de normalidade' : undefined}>
                    {o.situacao === s && '✓ '}{nomeSituacao[s]}
                  </button>
                ))}
              </div>
              <textarea rows={3} className={area} value={o.descricao} onChange={(e) => mudarOrgao(i, { descricao: e.target.value })} />
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
            <span className="mb-1 block text-sm font-semibold text-slate-700">Diagnósticos diferenciais <span className="font-normal text-slate-500">(um por linha)</span></span>
            <textarea rows={3} className={area} value={linhas(c.diferenciais)} onChange={(e) => setC({ ...c, diferenciais: deLinhas(e.target.value) })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Recomendações <span className="font-normal text-slate-500">(uma por linha)</span></span>
            <textarea rows={3} className={area} value={linhas(c.recomendacoes)} onChange={(e) => setC({ ...c, recomendacoes: deLinhas(e.target.value) })} />
          </label>
        </div>

        {/* prancha */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Prancha do laudo ({prancha.length} de até {MAX_PRANCHA} fotos)</span>
            <button type="button" className="text-sm font-medium text-[#1f3b57] underline" onClick={() => setEscolhendo(!escolhendo)}>
              {escolhendo ? 'Concluir escolha' : 'Escolher fotos'}
            </button>
          </div>
          {escolhendo ? (
            <div className="grid max-h-[28rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
              {fotos.map((f) => {
                const marcada = prancha.includes(f.nome);
                return (
                  <button key={f.nome} type="button" onClick={() => alternarFoto(f.nome)}
                    className={`relative overflow-hidden rounded-lg bg-black ring-offset-2 ${marcada ? 'ring-4 ring-[#1f3b57]' : ''}`}>
                    <img src={f.url} alt={f.nome} loading="lazy" className="aspect-[4/3] w-full object-contain" />
                    <span className={`absolute right-1 top-1 rounded-full px-1.5 text-xs font-bold ${marcada ? 'bg-[#1f3b57] text-white' : 'bg-white/80 text-slate-700'}`}>
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

        {/* ações */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {alterado && <span className="mr-auto text-sm font-medium text-amber-800">● Revisão não salva</span>}
          <Botao variante="secundario" disabled={!alterado || ocupado} onClick={salvar}>Salvar revisão</Botao>
          <Botao variante="secundario" disabled={ocupado} onClick={previa}>Prévia do PDF</Botao>
          <Botao disabled={ocupado || !perfilAssina || !temCrmv} onClick={assinar}>Aprovar e assinar</Botao>
        </div>
        {!perfilAssina && <p className="text-right text-xs text-slate-500">Somente veterinário pode assinar.</p>}
        {perfilAssina && !temCrmv && (
          <p className="text-right text-xs text-amber-800">Para assinar, cadastre o seu CRMV e a UF em "Minha conta" (e, se quiser, a imagem da assinatura).</p>
        )}
      </div>
    </Cartao>
  );
}

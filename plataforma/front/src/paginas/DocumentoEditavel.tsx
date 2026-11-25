import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { ConteudoLaudo, Foto } from './Revisao';

/** Dados do exame para montar a caixa de identificação (os mesmos do PDF). */
export type DadosDocumento = {
  clinicaId: string;
  paciente: { nome: string; especie: string | null; raca: string | null; sexo: string | null; castrado: boolean | null };
  tutor: string | null;
  idade: string | null;
  peso: string | null;
  data: string | null;
  hora: string | null;
  solicitanteNome: string | null;
  solicitanteCrmv: string | null;
  solicitanteClinica: string | null;
  suspeitaClinica: string | null;
  equipamento: string | null;
  idAnimal: string | null;
};

type Item = { id: string; mostrar: boolean };
type Layout = {
  corPrincipal: string; corFundoTitulos: string; justificarTexto: boolean; corFundoIdentificacao: string; corBorda: string; tamanhoFonte: number; tamanhoFonteIdentificacao: number;
  margemCm: number; estiloTitulos: string; linhaCabecalho: boolean; mostrarNomeClinica: boolean; mostrarDocumento: boolean;
  mostrarEndereco: boolean; mostrarTelefone: boolean; mostrarEmail: boolean; alinhamentoTitulo: string; alturaLogo: number;
  mostrarTitulo: boolean; textoTitulo: string | null; tituloIdentificacao: string | null; colunasIdentificacao: number;
  identificacao: Item[]; secoes: Item[]; textoTituloAchados: string | null; mostrarTituloPrancha: boolean; fundoPrancha: string;
  colunasPrancha: number; alinhamentoAssinatura: string; textoAssinatura: string | null; textoAviso: string | null;
};
type DadosClinica = { nome: string; documento: string | null; endereco: string | null; telefone: string | null; email: string | null };

const NOMES_CAMPOS: Record<string, string> = {
  paciente: 'Paciente', especie: 'Espécie', raca: 'Raça', sexo: 'Sexo', idade: 'Idade', peso: 'Peso', responsavel: 'Responsável',
  solicitante: 'Solicitante', clinicaSolicitante: 'Clínica', data: 'Data do exame', dataHora: 'Data', suspeita: 'Suspeita clínica',
  equipamento: 'Equipamento', idAnimal: 'ID do animal',
};
const OPCIONAIS = new Set(['suspeita', 'equipamento', 'idAnimal', 'clinicaSolicitante']);
const AVISO_PADRAO =
  'A ultrassonografia é um método complementar, portanto o diagnóstico deve ser estabelecido pelo médico veterinário responsável, com base na correlação com o histórico clínico e os demais exames. As imagens apresentadas no laudo são ilustrativas, sendo a interpretação realizada em tempo real, no momento do exame.';

const dataBr = (d: string | null) => (d && d.length === 8 ? `${d.slice(6)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : d ?? '');
const pt = (n: number) => `${(n * 4) / 3}px`; // pontos -> pixels da tela

function valorCampo(id: string, d: DadosDocumento): string | null {
  const p = d.paciente;
  switch (id) {
    case 'paciente': return p.nome;
    case 'especie': return p.especie;
    case 'raca': return p.raca;
    case 'sexo': {
      const nome = ({ M: 'Macho', F: 'Fêmea', O: 'Outro' } as Record<string, string>)[p.sexo ?? ''];
      return nome ?? null; // só o sexo, sem "(castrado/castrada)"
    }
    case 'idade': return d.idade;
    case 'peso': return d.peso;
    case 'responsavel': return d.tutor;
    case 'solicitante': return [d.solicitanteNome, d.solicitanteCrmv].filter(Boolean).join(' ');
    case 'clinicaSolicitante': return d.solicitanteClinica;
    case 'data': return dataBr(d.data);
    case 'dataHora': return dataBr(d.data) + (d.hora && d.hora.length >= 4 ? `\nHora: ${d.hora.slice(0, 2)}:${d.hora.slice(2, 4)}` : '');
    case 'suspeita': return d.suspeitaClinica;
    case 'equipamento': return d.equipamento;
    case 'idAnimal': return d.idAnimal;
    default: return null;
  }
}

/** Trecho de texto editável direto na página (como num documento); grava ao sair do campo. */
function Editavel({ valor, aoMudar, bloco = false, vazio = 'clique para escrever' }: { valor: string; aoMudar: (v: string) => void; bloco?: boolean; vazio?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== valor) ref.current.innerText = valor;
  }, [valor]);
  const props = {
    ref: ref as never,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: true,
    lang: 'pt-BR',
    'data-vazio': vazio,
    onBlur: (e: { currentTarget: HTMLElement }) => aoMudar(e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()),
    onPaste: (e: React.ClipboardEvent) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }, // cola só texto
    className: 'rounded-sm outline-none transition-colors hover:bg-amber-100/70 focus:bg-amber-100 focus:ring-2 focus:ring-[#0E4D64]/40 empty:before:text-slate-400 empty:before:content-[attr(data-vazio)]',
    style: { whiteSpace: 'pre-wrap' as const },
  };
  return bloco ? <div {...props} /> : <span {...props} />;
}

/**
 * Edição "como documento": o laudo aparece como uma página (com o layout, as cores e a ordem de seções da clínica) e o
 * veterinário clica no texto e edita como num editor comum; também escolhe as fotos da prancha. O PDF continua sendo
 * gerado pelo sistema a partir deste conteúdo (a paginação final pode diferir um pouco).
 */
export function DocumentoEditavel({ c, setC, dados, fotos, imagensEnviadas, prancha, alternarFoto, aoSalvar, aoPrevia, aoFechar, ocupado, alterado }: {
  c: ConteudoLaudo;
  setC: (c: ConteudoLaudo) => void;
  dados: DadosDocumento;
  fotos: Foto[];
  imagensEnviadas: string[];
  prancha: string[];
  alternarFoto: (nome: string) => void;
  aoSalvar: () => void;
  aoPrevia: () => void;
  aoFechar: () => void;
  ocupado: boolean;
  alterado: boolean;
}) {
  const [lay, setLay] = useState<Layout | null>(null);
  const [clinica, setClinica] = useState<DadosClinica | null>(null);
  const [logo, setLogo] = useState<{ usar: boolean; posicao: string } | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);

  useEffect(() => {
    api<{ layout: Layout }>('GET', '/api/clinica/layout').then((r) => setLay(r.layout)).catch(() => undefined);
    api<DadosClinica>('GET', '/api/clinica').then(setClinica).catch(() => undefined);
    api<{ usar: boolean; posicao?: string; existe?: boolean }>('GET', '/api/clinica/logo/uso')
      .then((r) => setLogo({ usar: r.usar && r.existe !== false, posicao: r.posicao ?? 'centro' })).catch(() => setLogo({ usar: false, posicao: 'centro' }));
  }, []);
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !(document.activeElement as HTMLElement | null)?.isContentEditable) aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  if (!lay || !clinica || !logo) return <Moldura aoFechar={aoFechar}><p className="p-8 text-slate-500">Carregando o documento…</p></Moldura>;

  const cor = lay.corPrincipal;
  const caixa = lay.estiloTitulos === 'caixa';
  const faixa = lay.estiloTitulos === 'faixa';
  const justif = lay.justificarTexto ? 'text-justify' : '';
  const fotoPrancha = prancha.map((n) => fotos.find((f) => f.nome === n)).filter((f): f is Foto => !!f);
  const Titulo = ({ texto }: { texto: string }) => faixa
    ? <div className="mt-3 px-2 py-1.5 font-bold" style={{ background: lay.corFundoTitulos, color: '#1B1B1B', fontSize: pt(11) }}>{texto}</div>
    : caixa
    ? <div className="mt-3 border px-2 py-2 font-bold" style={{ borderColor: lay.corBorda, color: cor, fontSize: pt(12) }}>{texto}</div>
    : <div className="mt-3 font-bold" style={{ color: cor, fontSize: pt(11) }}>{texto}</div>;

  const contato = [lay.mostrarDocumento && clinica.documento, lay.mostrarEndereco && clinica.endereco, lay.mostrarTelefone && clinica.telefone, lay.mostrarEmail && clinica.email].filter(Boolean).join(' · ');
  const alinhar = (a: string) => (a === 'direita' ? 'text-right' : a === 'esquerda' ? 'text-left' : 'text-center');
  const dadosTexto = (a: string) => (
    <div className={alinhar(a)}>
      {lay.mostrarNomeClinica && <div className="font-bold" style={{ color: cor, fontSize: pt(14) }}>{clinica.nome}</div>}
      {contato && <div className="text-slate-500" style={{ fontSize: pt(8) }}>{contato}</div>}
    </div>
  );
  const logoUrl = `/api/clinicas/${dados.clinicaId}/logo`;
  const logoImg = <img src={logoUrl} alt="Logo" style={{ height: lay.alturaLogo * 4 / 3, maxWidth: '100%' }} className="object-contain" />;

  const campos = lay.identificacao.filter((i) => i.mostrar)
    .map((i) => ({ id: i.id, rotulo: NOMES_CAMPOS[i.id] ?? i.id, valor: valorCampo(i.id, dados) }))
    .filter((x) => !OPCIONAIS.has(x.id) || x.valor);

  const lista = (titulo: string, itens: string[] | undefined, aoMudar: (l: string[]) => void) => (
    <div>
      <Titulo texto={titulo} />
      <Editavel bloco valor={(itens ?? []).map((x) => `• ${x}`).join('\n')} vazio="clique para escrever (um item por linha)"
        aoMudar={(v) => aoMudar(v.split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean))} />
    </div>
  );

  const secao = (s: Item): ReactNode => {
    switch (s.id) {
      case 'condicoes':
        return <div key={s.id}><Titulo texto="Condições técnicas" /><Editavel bloco valor={c.condicoesTecnicas} aoMudar={(v) => setC({ ...c, condicoesTecnicas: v })} /></div>;
      case 'achados':
        return (
          <div key={s.id}>
            <Titulo texto={lay.textoTituloAchados ?? (faixa ? 'Relatório Ultrassonográfico' : 'Achados')} />
            <div className="mt-2 flex flex-col" style={{ gap: pt(8) }}>
              {c.orgaos.filter((o) => !o.orgao.toLowerCase().startsWith('cavidade abdominal')).map((o) => {
                const i = c.orgaos.indexOf(o);
                return (
                  <div key={o.orgao} className={justif}>
                    <b>{o.orgao}: </b>
                    <Editavel valor={o.descricao} vazio="descreva o órgão"
                      aoMudar={(v) => setC({ ...c, orgaos: c.orgaos.map((x, k) => (k === i ? { ...x, descricao: v } : x)) })} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      case 'impressao':
        return <div key={s.id}><Titulo texto="Impressão diagnóstica" /><Editavel bloco valor={c.impressaoDiagnostica} vazio="escreva a impressão diagnóstica (uma frase por linha)" aoMudar={(v) => setC({ ...c, impressaoDiagnostica: v })} /></div>;
      case 'diferenciais':
        return c.exibirDiferenciais === false ? null : <div key={s.id}>{lista('Diagnósticos diferenciais', c.diferenciais, (l) => setC({ ...c, diferenciais: l }))}</div>;
      case 'recomendacoes':
        return <div key={s.id}>{lista('Recomendações', c.recomendacoes, (l) => setC({ ...c, recomendacoes: l }))}</div>;
      case 'aviso':
        return <div key={s.id} className="mt-4 border-t-2 border-slate-200 pt-3 text-slate-700" style={{ fontSize: pt(9) }}>{lay.textoAviso ?? AVISO_PADRAO}</div>;
      case 'assinatura':
        return (
          <div key={s.id} className={`mt-6 flex ${lay.alinhamentoAssinatura === 'direita' ? 'justify-end' : lay.alinhamentoAssinatura === 'esquerda' ? 'justify-start' : 'justify-center'}`}>
            <div className="w-64 border-t border-slate-500 pt-1 text-center text-slate-500">
              <div className="font-semibold">Assinatura</div>
              <div style={{ fontSize: pt(8.5) }}>nome e CRMV do veterinário — aparecem ao assinar</div>
              {lay.textoAssinatura && <div style={{ fontSize: pt(8.5) }}>{lay.textoAssinatura}</div>}
            </div>
          </div>
        );
      case 'prancha':
        return (
          <div key={s.id}>
            {lay.mostrarTituloPrancha && <Titulo texto="Prancha de imagens" />}
            <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
              <button type="button" onClick={() => setEscolhendo(!escolhendo)} className="min-h-9 rounded-lg border border-[#0E4D64]/40 bg-white px-3 text-sm font-semibold text-[#0E4D64] hover:bg-slate-50">
                {escolhendo ? 'Concluir escolha das fotos' : `Escolher fotos da prancha (${prancha.length} escolhida(s))`}
              </button>
            </div>
            {escolhendo && (
              <div className="mt-2 grid grid-cols-4 gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2 sm:grid-cols-6">
                {imagensEnviadas.map((n) => fotos.find((f) => f.nome === n)).filter((f): f is Foto => !!f).map((f) => {
                  const marcada = prancha.includes(f.nome);
                  return (
                    <button key={f.nome} type="button" onClick={() => alternarFoto(f.nome)} aria-pressed={marcada}
                      className={`relative overflow-hidden rounded-md border-2 bg-black ${marcada ? 'border-[#0E4D64]' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <img src={f.url} alt={f.nome} loading="lazy" className="h-16 w-full object-contain" />
                      <span className={`absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${marcada ? 'bg-[#0E4D64] text-white' : 'bg-white/80 text-slate-700'}`}>
                        {marcada ? prancha.indexOf(f.nome) + 1 : '+'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${lay.colunasPrancha}, minmax(0, 1fr))` }}>
              {fotoPrancha.map((f) => (
                <div key={f.nome} className={`group relative ${lay.fundoPrancha === 'preto' ? 'bg-black' : ''}`}>
                  <img src={f.url} alt={f.nome} className="w-full object-contain" style={{ aspectRatio: lay.fundoPrancha === 'preto' ? '16 / 9' : undefined }} />
                  <button type="button" onClick={() => alternarFoto(f.nome)} aria-label="Tirar da prancha"
                    className="absolute right-1 top-1 hidden size-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow group-hover:flex">×</button>
                </div>
              ))}
              {fotoPrancha.length === 0 && <p className="col-span-full text-sm text-slate-500">Nenhuma foto na prancha. Use "Escolher fotos da prancha".</p>}
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <Moldura aoFechar={aoFechar} barra={
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-slate-600">Clique em qualquer texto da página para editar, como num documento.
          {alterado && <b className="ml-2 text-amber-800">● Alterações não salvas</b>}</span>
        <button type="button" disabled={ocupado || !alterado} onClick={aoSalvar} className="min-h-10 rounded-lg bg-[#0E4D64] px-4 text-sm font-semibold text-white disabled:bg-slate-400">Salvar revisão</button>
        <button type="button" disabled={ocupado} onClick={aoPrevia} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium">Prévia do PDF</button>
        <button type="button" onClick={aoFechar} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">Fechar ✕</button>
      </div>
    }>
      <div className="mx-auto bg-white shadow-lg" style={{ maxWidth: 794, padding: `${lay.margemCm * 37.8}px`, fontSize: pt(lay.tamanhoFonte), lineHeight: 1.3 }}>
        {/* cabeçalho (só na primeira página do PDF) */}
        <div className="pb-2" style={lay.linhaCabecalho ? { borderBottom: `2px solid ${cor}` } : undefined}>
          {logo.usar && logo.posicao === 'centro' && <div className="flex justify-center">{logoImg}</div>}
          {logo.usar && logo.posicao !== 'centro' ? (
            <div className="flex items-center gap-3">
              {logo.posicao === 'esquerda' && logoImg}
              <div className="flex-1">{dadosTexto('esquerda')}</div>
              {logo.posicao === 'direita' && logoImg}
            </div>
          ) : dadosTexto(lay.alinhamentoTitulo)}
        </div>

        {lay.mostrarTitulo && <div className="mt-3 text-center font-bold" style={{ color: cor, fontSize: pt(12) }}>{(lay.textoTitulo ?? 'LAUDO — {tipo}').replace('{tipo}', 'ULTRASSONOGRAFIA')}</div>}

        {campos.length > 0 && (
          <div className="mt-3" style={caixa ? { border: `1px solid ${lay.corBorda}` } : undefined}>
            {(lay.tituloIdentificacao || faixa) && <div className="px-2 font-bold" style={faixa
              ? { background: lay.corFundoTitulos, color: '#1B1B1B', fontSize: pt(11), paddingTop: 6, paddingBottom: 6 }
              : caixa ? { borderBottom: `1px solid ${lay.corBorda}`, color: cor, fontSize: pt(12), paddingTop: 8, paddingBottom: 8 } : { color: cor, fontSize: pt(11) }}>{lay.tituloIdentificacao ?? 'Dados'}</div>}
            <div className="grid gap-x-3 gap-y-0.5 p-2" style={{ background: lay.corFundoIdentificacao, gridTemplateColumns: `repeat(${lay.colunasIdentificacao}, minmax(0, 1fr))`, fontSize: lay.tamanhoFonteIdentificacao > 0 ? pt(lay.tamanhoFonteIdentificacao) : undefined }}>
              {campos.map((x) => (
                <div key={x.id} style={{ whiteSpace: 'pre-line' }}><b>{x.rotulo}: </b>{x.valor || (caixa || faixa ? '' : '—')}</div>
              ))}
            </div>
          </div>
        )}

        {lay.secoes.filter((s) => s.mostrar).map(secao)}
      </div>
    </Moldura>
  );
}

function Moldura({ children, barra, aoFechar }: { children: ReactNode; barra?: ReactNode; aoFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-200" role="dialog" aria-modal="true" aria-label="Editar o laudo como documento">
      <div className="border-b border-slate-300 bg-white px-3 py-2 shadow-sm">
        {barra ?? <button type="button" onClick={aoFechar} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Fechar ✕</button>}
      </div>
      <div className="flex-1 overflow-y-auto p-2 sm:p-6">{children}</div>
    </div>
  );
}

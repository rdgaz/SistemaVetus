import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from '../api';
import { Aviso, Botao } from '../ui';

export type ItemAnotacao = {
  tipo: 'texto' | 'medida';
  x?: number;
  y?: number;
  texto?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  valor?: number;
  rotulo?: string;
  orgao?: string;
};

export type MapaAnotacoes = Record<string, ItemAnotacao[]>;

const SUGESTOES_TEXTO = [
  'FÍGADO', 'VB', 'BAÇO', 'RIM E', 'RIM D', 'BEXIGA', 'ESTÔMAGO', 'ALÇAS', 'DUODENO', 'CÓLON',
  'PÂNCREAS', 'ADRENAL E', 'ADRENAL D', 'PRÓSTATA', 'TESTÍCULO', 'ÚTERO', 'OVÁRIO', 'LINFONODO', 'CISTO', 'NÓDULO', 'CÁLCULO',
];

const SUGESTOES_ROTULO = ['Dist', 'Comp.', 'Espessura', 'Diâm.', 'Parede', 'Altura'];

export function formatarCm(v?: number): string {
  if (v === undefined || !Number.isFinite(v)) return '0,00';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function resumoAnotacao(itens?: ItemAnotacao[]): string {
  if (!itens || itens.length === 0) return '';
  const partes: string[] = [];
  for (const it of itens) {
    if (it.tipo === 'texto' && it.texto) partes.push(it.texto);
    else if (it.tipo === 'medida' && it.valor) partes.push(`${it.rotulo || 'Dist'} ${formatarCm(it.valor)} cm`);
  }
  return partes.join(' · ');
}

/** Selo compacto para miniaturas que possuem anotação manual. */
export function SeloAnotacao({ itens }: { itens?: ItemAnotacao[] }) {
  if (!itens || itens.length === 0) return null;
  return (
    <span
      title={`Anotação manual: ${resumoAnotacao(itens)}`}
      className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-[#001824]/90 px-1.5 py-0.5 text-[10px] font-bold text-[#FFE600] ring-1 ring-[#00E5FF]"
    >
      ✎ {itens.length}
    </span>
  );
}

/**
 * Camada visual (SVG + elementos posicionados em %) no estilo do aparelho de ultrassom (Mindray):
 * textos brancos em maiúsculas, cursores amarelos (+ e ×), linha pontilhada e quadro com borda ciano.
 */
export function CamadaAnotacao({
  itens,
  indiceSelecionado,
  aoSelecionar,
  aoIniciarArraste,
}: {
  itens?: ItemAnotacao[];
  indiceSelecionado?: number | null;
  aoSelecionar?: (i: number) => void;
  aoIniciarArraste?: (i: number, alvo: 'texto' | 'p1' | 'p2', ev: ReactPointerEvent) => void;
}) {
  if (!itens || itens.length === 0) return null;
  const interativo = !!aoSelecionar || !!aoIniciarArraste;
  const medidas = itens
    .map((it, idx) => ({ it, idx }))
    .filter((x) => x.it.tipo === 'medida' && (x.it.valor ?? 0) > 0);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {/* Linhas pontilhadas amarelas das medidas */}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {medidas.map(({ it, idx }) => {
          const x1 = (it.x1 ?? 0.3) * 1000;
          const y1 = (it.y1 ?? 0.5) * 1000;
          const x2 = (it.x2 ?? 0.6) * 1000;
          const y2 = (it.y2 ?? 0.5) * 1000;
          const sel = indiceSelecionado === idx;
          return (
            <g key={idx}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.75)" strokeWidth={sel ? 5 : 3.5} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFE600" strokeWidth={sel ? 3 : 2.2} strokeDasharray="7 7" />
            </g>
          );
        })}
      </svg>

      {/* Cursores + e × de cada medida */}
      {medidas.map(({ it, idx }, ordem) => {
        const sel = indiceSelecionado === idx;
        return (
          <div key={`m-${idx}`}>
            <span
              onPointerDown={aoIniciarArraste ? (ev) => aoIniciarArraste(idx, 'p1', ev) : undefined}
              onClick={aoSelecionar ? (ev) => { ev.stopPropagation(); aoSelecionar(idx); } : undefined}
              style={{ left: `${(it.x1 ?? 0.3) * 100}%`, top: `${(it.y1 ?? 0.5) * 100}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold leading-none text-[#FFE600] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                interativo ? 'pointer-events-auto cursor-move p-1.5' : ''
              } ${sel ? 'ring-2 ring-[#00E5FF] rounded-full bg-black/30' : ''}`}
            >
              +<sup className="ml-0.5 text-[11px] font-extrabold">{ordem + 1}</sup>
            </span>
            <span
              onPointerDown={aoIniciarArraste ? (ev) => aoIniciarArraste(idx, 'p2', ev) : undefined}
              onClick={aoSelecionar ? (ev) => { ev.stopPropagation(); aoSelecionar(idx); } : undefined}
              style={{ left: `${(it.x2 ?? 0.6) * 100}%`, top: `${(it.y2 ?? 0.5) * 100}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold leading-none text-[#FFE600] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                interativo ? 'pointer-events-auto cursor-move p-1.5' : ''
              } ${sel ? 'ring-2 ring-[#00E5FF] rounded-full bg-black/30' : ''}`}
            >
              ×
            </span>
          </div>
        );
      })}

      {/* Textos brancos em maiúsculas (padrão ultrassom) */}
      {itens.map((it, idx) => {
        if (it.tipo !== 'texto' || !it.texto) return null;
        const sel = indiceSelecionado === idx;
        return (
          <span
            key={`t-${idx}`}
            onPointerDown={aoIniciarArraste ? (ev) => aoIniciarArraste(idx, 'texto', ev) : undefined}
            onClick={aoSelecionar ? (ev) => { ev.stopPropagation(); aoSelecionar(idx); } : undefined}
            style={{
              left: `${(it.x ?? 0.1) * 100}%`,
              top: `${(it.y ?? 0.1) * 100}%`,
              textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 3px rgba(0,0,0,0.9)',
            }}
            className={`absolute -translate-y-1/2 whitespace-nowrap font-sans text-sm font-bold uppercase tracking-wide text-white sm:text-base ${
              interativo ? 'pointer-events-auto cursor-move rounded px-1 py-0.5' : ''
            } ${sel ? 'ring-2 ring-[#00E5FF] bg-black/40' : ''}`}
          >
            {it.texto}
          </span>
        );
      })}

      {/* Quadro inferior direito com borda ciano (padrão Mindray) */}
      {medidas.length > 0 && (
        <div className="absolute bottom-2.5 right-2.5 rounded border border-[#00E5FF] bg-[#000A12]/80 px-2.5 py-1.5 font-sans text-xs font-semibold text-white shadow sm:text-[13px]">
          {medidas.map(({ it, idx }, ordem) => (
            <div
              key={`q-${idx}`}
              onClick={aoSelecionar ? (ev) => { ev.stopPropagation(); aoSelecionar(idx); } : undefined}
              className={`flex items-center gap-2 whitespace-nowrap ${interativo ? 'pointer-events-auto cursor-pointer hover:text-[#00E5FF]' : ''} ${
                indiceSelecionado === idx ? 'underline decoration-[#00E5FF]' : ''
              }`}
            >
              <span className="font-bold text-[#FFE600]">{ordem + 1}</span>
              <span>{it.rotulo || 'Dist'}</span>
              <span className="ml-auto pl-1 tabular-nums">{formatarCm(it.valor)} cm</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function textoCurtoOrgao(orgao?: string): string {
  if (!orgao) return '';
  const o = orgao.trim();
  if (/^ves[ií]cula biliar/i.test(o)) return 'VB';
  if (/^ves[ií]cula urin|^bexiga/i.test(o)) return 'BEXIGA';
  if (/^al[cç]as/i.test(o)) return 'ALÇAS';
  return o.toUpperCase();
}

/**
 * Modal de anotação manual em tela cheia: o médico toca na imagem para posicionar texto (ex.: BAÇO, RIM E)
 * ou marca 2 pontos da medida e digita o valor em cm.
 */
export function EditorAnotacao({
  exameId,
  foto,
  itensIniciais,
  orgaoSugerido,
  orgaosDisponiveis = [],
  aoSalvar,
  aoFechar,
}: {
  exameId: string;
  foto: { nome: string; url: string };
  itensIniciais: ItemAnotacao[];
  orgaoSugerido?: string;
  orgaosDisponiveis?: string[];
  aoSalvar: (foto: string, itens: ItemAnotacao[], inserirNoOrgao?: { orgao: string; trecho: string }) => void;
  aoFechar: () => void;
}) {
  const [itens, setItens] = useState<ItemAnotacao[]>(itensIniciais);
  const [historico, setHistorico] = useState<ItemAnotacao[][]>([]);
  const [modo, setModo] = useState<'medida' | 'texto'>('medida');
  const [textoNovo, setTextoNovo] = useState(() => textoCurtoOrgao(orgaoSugerido));
  const [orgaoMedida, setOrgaoMedida] = useState(orgaoSugerido ?? orgaosDisponiveis[0] ?? '');
  const [ponto1, setPonto1] = useState<{ x: number; y: number } | null>(null);
  const [pendente, setPendente] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [valorStr, setValorStr] = useState('');
  const [rotuloStr, setRotuloStr] = useState('Dist');
  const [inserirTexto, setInserirTexto] = useState(!!orgaoSugerido);
  const [trechoParaInserir, setTrechoParaInserir] = useState<{ orgao: string; trecho: string } | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState<{ idx: number; alvo: 'texto' | 'p1' | 'p2' } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);
  const inputValorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendente) setTimeout(() => inputValorRef.current?.focus(), 40);
  }, [pendente]);

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (pendente) setPendente(null);
        else if (ponto1) setPonto1(null);
        else aoFechar();
      }
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pendente, ponto1, aoFechar]);

  const empilhar = (novos: ItemAnotacao[]) => {
    setHistorico((h) => [...h.slice(-15), itens]);
    setItens(novos);
  };

  const coordRelativa = (clientX: number, clientY: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = Math.min(0.98, Math.max(0.02, (clientX - rect.left) / rect.width));
    const y = Math.min(0.98, Math.max(0.02, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const clicarImagem = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (arrastando || pendente) return;
    const pos = coordRelativa(ev.clientX, ev.clientY);
    if (!pos) return;
    setErro('');

    if (modo === 'texto') {
      const txt = textoNovo.trim().toUpperCase();
      if (!txt) {
        setErro('Digite ou escolha acima o texto que deseja colocar na imagem (ex.: BAÇO, RIM E).');
        return;
      }
      empilhar([...itens, { tipo: 'texto', x: pos.x, y: pos.y, texto: txt, orgao: orgaoMedida || orgaoSugerido || undefined }]);
      setSelecionado(itens.length);
      return;
    }

    // modo === 'medida'
    if (!ponto1) {
      setPonto1(pos);
    } else {
      setPendente({ x1: ponto1.x, y1: ponto1.y, x2: pos.x, y2: pos.y });
      setPonto1(null);
      setValorStr('');
    }
  };

  const confirmarMedida = () => {
    if (!pendente) return;
    const num = Number(valorStr.trim().replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0 || num > 200) {
      setErro('Informe o valor da medida em cm (ex.: 0,55).');
      return;
    }
    const valor = Math.round(num * 100) / 100;
    const rot = rotuloStr.trim() || 'Dist';
    const org = orgaoMedida.trim() || undefined;
    empilhar([...itens, {
      tipo: 'medida', x1: pendente.x1, y1: pendente.y1, x2: pendente.x2, y2: pendente.y2,
      valor, rotulo: rot, orgao: org,
    }]);
    if (inserirTexto && org) {
      const formatado = `${formatarCm(valor)} cm`;
      const prefixo = rot.toLowerCase() !== 'dist' ? `${rot.toLowerCase()}: ${formatado}` : `medindo ${formatado}`;
      setTrechoParaInserir((atual) => ({
        orgao: org,
        trecho: atual && atual.orgao === org ? `${atual.trecho}; ${prefixo}` : prefixo,
      }));
    }
    setSelecionado(itens.length);
    setPendente(null);
    setErro('');
  };

  const iniciarArraste = (idx: number, alvo: 'texto' | 'p1' | 'p2', ev: ReactPointerEvent) => {
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    setHistorico((h) => [...h.slice(-15), itens]);
    setSelecionado(idx);
    setArrastando({ idx, alvo });
  };

  const moverArraste = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!arrastando) return;
    const pos = coordRelativa(ev.clientX, ev.clientY);
    if (!pos) return;
    setItens((atual) =>
      atual.map((it, k) => {
        if (k !== arrastando.idx) return it;
        if (arrastando.alvo === 'texto') return { ...it, x: pos.x, y: pos.y };
        if (arrastando.alvo === 'p1') return { ...it, x1: pos.x, y1: pos.y };
        return { ...it, x2: pos.x, y2: pos.y };
      }));
  };

  const encerrarArraste = () => {
    if (arrastando) setArrastando(null);
  };

  const removerItem = (idx: number) => {
    empilhar(itens.filter((_, k) => k !== idx));
    if (selecionado === idx) setSelecionado(null);
  };

  const desfazer = () => {
    if (ponto1) { setPonto1(null); return; }
    if (pendente) { setPendente(null); return; }
    if (historico.length === 0) return;
    const anterior = historico[historico.length - 1];
    setHistorico((h) => h.slice(0, -1));
    setItens(anterior);
    setSelecionado(null);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const r = await api<{ foto: string; itens: ItemAnotacao[] }>(
        'PUT',
        `/api/exames/${exameId}/anotacoes/${encodeURIComponent(foto.nome)}`,
        { itens });
      aoSalvar(foto.nome, r.itens, trechoParaInserir ?? undefined);
      aoFechar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white" onPointerUp={encerrarArraste}>
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2">
        <span className="mr-1 truncate text-sm font-semibold text-white/90">✎ Anotar: {foto.nome}</span>
        <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
          <button
            type="button"
            onClick={() => { setModo('medida'); setPendente(null); }}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition ${
              modo === 'medida' ? 'bg-[#FFE600] text-slate-950' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            📏 Medida (2 pontos)
          </button>
          <button
            type="button"
            onClick={() => { setModo('texto'); setPonto1(null); setPendente(null); }}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition ${
              modo === 'texto' ? 'bg-[#00E5FF] text-slate-950' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            𝐓 Texto
          </button>
        </div>

        <button
          type="button"
          disabled={historico.length === 0 && !ponto1 && !pendente}
          onClick={desfazer}
          className="min-h-9 rounded-lg border border-white/20 px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-35"
        >
          ↶ Desfazer
        </button>
        <button
          type="button"
          disabled={itens.length === 0}
          onClick={() => { empilhar([]); setSelecionado(null); setTrechoParaInserir(null); }}
          className="min-h-9 rounded-lg border border-white/20 px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-35"
        >
          🗑 Limpar
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Botao disabled={salvando} onClick={salvar} className="!min-h-9 !bg-emerald-600 hover:!bg-emerald-700 !px-4 !text-xs">
            {salvando ? 'Salvando…' : '✓ Salvar na imagem'}
          </Botao>
          <button type="button" onClick={aoFechar} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs hover:bg-white/10">
            Cancelar
          </button>
        </div>
      </div>

      {/* Sub-barra contextual da ferramenta */}
      <div className="border-b border-white/10 bg-slate-900/70 px-3 py-2 text-xs">
        {modo === 'texto' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-white/70">Texto (toque na foto para posicionar):</span>
            <input
              value={textoNovo}
              onChange={(e) => setTextoNovo(e.target.value.toUpperCase())}
              maxLength={60}
              placeholder="Ex.: BAÇO, RIM E, CISTO…"
              className="min-h-8 w-44 rounded border border-white/25 bg-slate-950 px-2.5 font-sans text-xs font-bold uppercase text-white outline-none focus:border-[#00E5FF]"
            />
            <div className="flex flex-1 gap-1 overflow-x-auto pb-0.5">
              {SUGESTOES_TEXTO.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTextoNovo(s)}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    textoNovo === s ? 'border-[#00E5FF] bg-[#00E5FF]/20 text-[#00E5FF]' : 'border-white/15 text-white/75 hover:bg-white/10'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-white/80">
            <span>
              {ponto1
                ? '🟡 Agora toque no 2º ponto da estrutura para fechar a medida.'
                : 'Toque no 1º ponto e depois no 2º ponto da estrutura que deseja medir (arraste qualquer item já criado para mover).'}
            </span>
            {orgaosDisponiveis.length > 0 && (
              <label className="ml-auto flex items-center gap-1.5">
                <span className="text-white/60">Órgão:</span>
                <select
                  value={orgaoMedida}
                  onChange={(e) => setOrgaoMedida(e.target.value)}
                  className="min-h-8 rounded border border-white/25 bg-slate-950 px-2 text-xs text-white"
                >
                  <option value="">(sem órgão)</option>
                  {orgaosDisponiveis.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {erro && <div className="px-3 pt-2"><Aviso>{erro}</Aviso></div>}

      {/* Área central da imagem com coordenadas exatas 0..1 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
        <div
          ref={areaRef}
          onPointerDown={clicarImagem}
          onPointerMove={moverArraste}
          className="relative inline-flex max-h-full max-w-full cursor-crosshair touch-none items-center justify-center"
        >
          <img
            src={foto.url}
            alt={foto.nome}
            draggable={false}
            className="block max-h-[calc(100dvh-13.5rem)] max-w-full select-none object-contain"
          />
          <CamadaAnotacao
            itens={itens}
            indiceSelecionado={selecionado}
            aoSelecionar={setSelecionado}
            aoIniciarArraste={iniciarArraste}
          />
          {/* Prévia do 1º ponto ou da linha enquanto digita o valor */}
          {ponto1 && (
            <span
              style={{ left: `${ponto1.x * 100}%`, top: `${ponto1.y * 100}%` }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-lg font-bold text-[#FFE600] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
            >
              +
            </span>
          )}
          {pendente && (
            <div className="pointer-events-none absolute inset-0">
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 size-full">
                <line
                  x1={pendente.x1 * 1000} y1={pendente.y1 * 1000}
                  x2={pendente.x2 * 1000} y2={pendente.y2 * 1000}
                  stroke="#FFE600" strokeWidth={2.5} strokeDasharray="7 7"
                />
              </svg>
              <span style={{ left: `${pendente.x1 * 100}%`, top: `${pendente.y1 * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold text-[#FFE600]">+</span>
              <span style={{ left: `${pendente.x2 * 100}%`, top: `${pendente.y2 * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-base font-bold text-[#FFE600]">×</span>
            </div>
          )}
        </div>

        {/* Caixa para informar o valor em cm logo após marcar os 2 pontos */}
        {pendente && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md rounded-xl border border-[#00E5FF] bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur"
          >
            <div className="mb-2 text-sm font-semibold text-[#FFE600]">Informe o valor da medida (em cm)</div>
            <div className="grid grid-cols-[1fr_7.5rem] gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-white/70">Valor (cm) *</span>
                <input
                  ref={inputValorRef}
                  type="text"
                  inputMode="decimal"
                  value={valorStr}
                  onChange={(e) => setValorStr(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarMedida(); } }}
                  placeholder="ex.: 0,55"
                  className="min-h-10 w-full rounded-lg border border-white/30 bg-slate-950 px-3 text-base font-semibold text-white outline-none focus:border-[#FFE600]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-white/70">Rótulo</span>
                <input
                  value={rotuloStr}
                  onChange={(e) => setRotuloStr(e.target.value)}
                  maxLength={25}
                  className="min-h-10 w-full rounded-lg border border-white/30 bg-slate-950 px-2.5 text-sm text-white outline-none focus:border-[#00E5FF]"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGESTOES_ROTULO.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRotuloStr(r)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    rotuloStr === r ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/15 text-white/70'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {orgaoMedida && (
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-white/85">
                <input type="checkbox" className="size-4" checked={inserirTexto} onChange={(e) => setInserirTexto(e.target.checked)} />
                <span>Inserir esta medida na descrição de <b>{orgaoMedida}</b> ao salvar</span>
              </label>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirmarMedida}
                className="min-h-10 flex-1 rounded-lg bg-[#FFE600] px-4 text-sm font-bold text-slate-950 hover:bg-yellow-300"
              >
                Adicionar medida
              </button>
              <button
                type="button"
                onClick={() => setPendente(null)}
                className="min-h-10 rounded-lg border border-white/25 px-3 text-xs text-white/85 hover:bg-white/10"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé com lista rápida dos itens adicionados para editar/remover */}
      <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-t border-white/10 bg-slate-900 px-3 py-1.5 text-xs">
        <span className="shrink-0 text-white/50">Itens ({itens.length}):</span>
        {itens.length === 0 && <span className="text-white/40">nenhuma anotação nesta imagem.</span>}
        {itens.map((it, idx) => (
          <span
            key={idx}
            onClick={() => setSelecionado(idx)}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              selecionado === idx ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-white' : 'border-white/20 bg-white/5 text-white/85'
            }`}
          >
            <span>
              {it.tipo === 'texto'
                ? `𝐓 ${it.texto}`
                : `📏 ${it.rotulo || 'Dist'} ${formatarCm(it.valor)} cm${it.orgao ? ` (${it.orgao})` : ''}`}
            </span>
            <button
              type="button"
              aria-label="Remover item"
              onClick={(e) => { e.stopPropagation(); removerItem(idx); }}
              className="ml-0.5 rounded-full px-1 text-red-300 hover:bg-red-500/30 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

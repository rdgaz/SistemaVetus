import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, clinicaGuardada } from '../api';
import { Aviso, Botao, Cartao, Titulo } from '../ui';

type Item = { id: string; mostrar: boolean };
type Layout = {
  corPrincipal: string;
  corFundoIdentificacao: string;
  corFundoTitulos?: string;
  tamanhoFonte: number;
  tamanhoFonteIdentificacao: number;
  corBorda: string;
  margemCm: number;
  estiloTitulos: string;
  alturaLogo: number;
  tituloIdentificacao: string | null;
  textoTituloAchados: string | null;
  mostrarTituloPrancha: boolean;
  fundoPrancha: string;
  linhaCabecalho: boolean;
  mostrarNomeClinica: boolean;
  mostrarDocumento: boolean;
  mostrarEndereco: boolean;
  mostrarTelefone: boolean;
  mostrarEmail: boolean;
  alinhamentoTitulo: string;
  mostrarTitulo: boolean;
  textoTitulo: string | null;
  colunasIdentificacao: number;
  identificacao: Item[];
  secoes: Item[];
  colunasPrancha: number;
  alinhamentoAssinatura: string;
  textoAssinatura: string | null;
  posicaoQr: string;
  textoRodape: string | null;
  mostrarCreditoProduto: boolean;
  textoAviso: string | null;
};
type Resposta = { layout: Layout; padrao: Layout; personalizado: boolean; campos: Record<string, string>; secoes: Record<string, string> };

const input = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-[#0E4D64] focus:ring-2 focus:ring-[#0E4D64]/20';

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>{children}</label>;
}

function Opcoes({ valor, opcoes, aoMudar }: { valor: string | number; opcoes: [string | number, string][]; aoMudar: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {opcoes.map(([v, nome]) => (
        <button key={v} type="button" onClick={() => aoMudar(String(v))}
          className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-medium ${String(valor) === String(v) ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          {nome}
        </button>
      ))}
    </div>
  );
}

function Interruptor({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3">
      <input type="checkbox" className="size-5" checked={valor} onChange={(e) => aoMudar(e.target.checked)} />
      <span>{rotulo}</span>
    </label>
  );
}

/** Lista que a clínica reordena (▲▼) e mostra/oculta. */
function ListaOrdenavel({ itens, nomes, aoMudar }: { itens: Item[]; nomes: Record<string, string>; aoMudar: (i: Item[]) => void }) {
  const mover = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    const nova = [...itens];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    aoMudar(nova);
  };
  return (
    <ul className="space-y-1">
      {itens.map((it, i) => (
        <li key={it.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2">
          <input type="checkbox" className="size-5" checked={it.mostrar} aria-label={`Mostrar ${nomes[it.id]}`}
            onChange={(e) => aoMudar(itens.map((x) => (x.id === it.id ? { ...x, mostrar: e.target.checked } : x)))} />
          <span className={`flex-1 py-2 ${it.mostrar ? '' : 'text-slate-400 line-through'}`}>{nomes[it.id]}</span>
          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="size-9 rounded text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-30">▲</button>
          <button type="button" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)} className="size-9 rounded text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-30">▼</button>
        </li>
      ))}
    </ul>
  );
}

/** Aparência do PDF do laudo: cores, fonte, campos, ordem das seções, prancha, assinatura e textos. */
export function LayoutLaudo() {
  const [r, setR] = useState<Resposta | null>(null);
  const [l, setL] = useState<Layout | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<Resposta>('GET', '/api/clinica/layout').then((x) => { setR(x); setL(x.layout); }).catch((e) => setErro(e.message));
  }, []);

  if (!r || !l) return <><Titulo>Aparência do laudo</Titulo>{erro ? <Aviso>{erro}</Aviso> : <p className="text-slate-500">Carregando…</p>}</>;

  const mudar = (p: Partial<Layout>) => { setL({ ...l, ...p }); setOk(''); };
  const texto = (k: keyof Layout) => (e: { target: { value: string } }) => mudar({ [k]: e.target.value || null } as Partial<Layout>);

  const previa = async () => {
    setErro('');
    setOcupado(true);
    // abre a janela já no clique (evita bloqueio de pop-up) e preenche quando o PDF chegar
    const janela = window.open('', '_blank');
    try {
      const resp = await fetch('/api/clinica/layout/previa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Clinica-Id': clinicaGuardada() ?? '' },
        body: JSON.stringify(l),
        credentials: 'same-origin',
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => undefined))?.erro ?? `Erro ${resp.status} ao gerar a prévia.`);
      const url = URL.createObjectURL(await resp.blob());
      if (janela) janela.location.href = url; else window.location.href = url;
    } catch (x) {
      janela?.close();
      setErro((x as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    setErro(''); setOk(''); setOcupado(true);
    try {
      const x = await api<{ layout: Layout }>('PUT', '/api/clinica/layout', l);
      setL(x.layout); setR({ ...r, layout: x.layout, personalizado: true });
      setOk('Aparência salva. Vale para todos os laudos da clínica (PDF, e-mail e link).');
    } catch (x) { setErro((x as Error).message); } finally { setOcupado(false); }
  };

  const restaurar = async () => {
    if (!confirm('Voltar ao layout padrão do AutoLaudoVet? As suas personalizações serão perdidas.')) return;
    setErro(''); setOk(''); setOcupado(true);
    try {
      await api('DELETE', '/api/clinica/layout');
      setL(r.padrao); setR({ ...r, layout: r.padrao, personalizado: false });
      setOk('Layout padrão restaurado.');
    } catch (x) { setErro((x as Error).message); } finally { setOcupado(false); }
  };

  return (
    <>
      <Titulo>Aparência do laudo</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Personalize o PDF dos laudos da clínica. Use <b>Ver prévia</b> para conferir com um laudo de exemplo antes de salvar.
        O logo e a assinatura são configurados em <Link className="underline" to="/clinica">Clínica</Link> e em <Link className="underline" to="/conta">Minha conta</Link>.
      </p>
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="space-y-4">
        <Cartao titulo="Cores e texto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Linha rotulo="Cor principal (títulos e linhas)">
              <div className="flex items-center gap-2">
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-slate-300" value={l.corPrincipal} onChange={(e) => mudar({ corPrincipal: e.target.value })} />
                <input className={input} value={l.corPrincipal} maxLength={7} onChange={(e) => mudar({ corPrincipal: e.target.value })} />
              </div>
            </Linha>
            <Linha rotulo="Cor do fundo da identificação">
              <div className="flex items-center gap-2">
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-slate-300" value={l.corFundoIdentificacao} onChange={(e) => mudar({ corFundoIdentificacao: e.target.value })} />
                <input className={input} value={l.corFundoIdentificacao} maxLength={7} onChange={(e) => mudar({ corFundoIdentificacao: e.target.value })} />
              </div>
            </Linha>
            <Linha rotulo={`Tamanho do texto: ${l.tamanhoFonte} pt`}>
              <input type="range" min={8} max={12} step={0.5} className="w-full" value={l.tamanhoFonte} onChange={(e) => mudar({ tamanhoFonte: Number(e.target.value) })} />
            </Linha>
            <Linha rotulo={l.tamanhoFonteIdentificacao > 0 ? `Texto da identificação: ${l.tamanhoFonteIdentificacao} pt` : 'Texto da identificação: igual ao do laudo'}>
              <input type="range" min={7.5} max={14} step={0.5} className="w-full" value={l.tamanhoFonteIdentificacao || 7.5}
                onChange={(e) => mudar({ tamanhoFonteIdentificacao: Number(e.target.value) < 8 ? 0 : Number(e.target.value) })} />
            </Linha>
            <Linha rotulo="Cor das bordas das caixas">
              <div className="flex items-center gap-2">
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-slate-300" value={l.corBorda} onChange={(e) => mudar({ corBorda: e.target.value })} />
                <input className={input} value={l.corBorda} maxLength={7} onChange={(e) => mudar({ corBorda: e.target.value })} />
              </div>
            </Linha>
            <Linha rotulo="Cor do fundo dos títulos (faixas)">
              <div className="flex items-center gap-2">
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-slate-300" value={l.corFundoTitulos || '#E4DBDB'} onChange={(e) => mudar({ corFundoTitulos: e.target.value })} />
                <input className={input} value={l.corFundoTitulos || '#E4DBDB'} maxLength={7} onChange={(e) => mudar({ corFundoTitulos: e.target.value })} />
              </div>
            </Linha>
            <Linha rotulo="Estilo dos títulos">
              <Opcoes valor={l.estiloTitulos} opcoes={[['simples', 'Texto colorido'], ['faixa', 'Faixa com fundo'], ['caixa', 'Caixa com borda']]} aoMudar={(v) => mudar({ estiloTitulos: v })} />
            </Linha>
            <Linha rotulo={`Margem da página: ${l.margemCm.toLocaleString('pt-BR')} cm`}>
              <input type="range" min={0.5} max={2.5} step={0.1} className="w-full" value={l.margemCm} onChange={(e) => mudar({ margemCm: Number(e.target.value) })} />
            </Linha>
          </div>
        </Cartao>

        <Cartao titulo="Cabeçalho">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Interruptor rotulo="Nome da clínica" valor={l.mostrarNomeClinica} aoMudar={(v) => mudar({ mostrarNomeClinica: v })} />
            <Interruptor rotulo="CNPJ/documento" valor={l.mostrarDocumento} aoMudar={(v) => mudar({ mostrarDocumento: v })} />
            <Interruptor rotulo="Endereço" valor={l.mostrarEndereco} aoMudar={(v) => mudar({ mostrarEndereco: v })} />
            <Interruptor rotulo="Telefone" valor={l.mostrarTelefone} aoMudar={(v) => mudar({ mostrarTelefone: v })} />
            <Interruptor rotulo="E-mail" valor={l.mostrarEmail} aoMudar={(v) => mudar({ mostrarEmail: v })} />
            <Interruptor rotulo="Linha colorida abaixo do cabeçalho" valor={l.linhaCabecalho} aoMudar={(v) => mudar({ linhaCabecalho: v })} />
          </div>
          <div className="mt-3">
            <Linha rotulo="Alinhamento do nome e contato (com o logo no centro)">
              <Opcoes valor={l.alinhamentoTitulo} opcoes={[['esquerda', 'Esquerda'], ['centro', 'Centro'], ['direita', 'Direita']]} aoMudar={(v) => mudar({ alinhamentoTitulo: v })} />
            </Linha>
          </div>
          <div className="mt-3">
            <Linha rotulo={`Tamanho do logo: ${l.alturaLogo} pt (60 = padrão; ~240 = logo grande, como em alguns modelos)`}>
              <input type="range" min={30} max={260} step={10} className="w-full" value={l.alturaLogo} onChange={(e) => mudar({ alturaLogo: Number(e.target.value) })} />
            </Linha>
          </div>
          <p className="mt-2 text-xs text-slate-500">A posição do logo (esquerda, centro ou direita) fica em <Link className="underline" to="/clinica">Clínica</Link>.</p>
        </Cartao>

        <Cartao titulo="Título do laudo">
          <Interruptor rotulo="Mostrar o título" valor={l.mostrarTitulo} aoMudar={(v) => mudar({ mostrarTitulo: v })} />
          {l.mostrarTitulo && (
            <Linha rotulo='Texto do título ({tipo} vira o tipo do exame; vazio = "LAUDO — {tipo}")'>
              <input className={input} maxLength={120} value={l.textoTitulo ?? ''} placeholder="LAUDO — {tipo}" onChange={texto('textoTitulo')} />
            </Linha>
          )}
        </Cartao>

        <Cartao titulo="Identificação do paciente">
          <div className="mb-3">
            <Linha rotulo='Título da caixa (ex.: "Dados"; vazio = sem título)'>
              <input className={input} maxLength={60} value={l.tituloIdentificacao ?? ''} onChange={texto('tituloIdentificacao')} />
            </Linha>
          </div>
          <div className="mb-3">
            <Linha rotulo="Colunas">
              <Opcoes valor={l.colunasIdentificacao} opcoes={[[1, '1'], [2, '2'], [3, '3']]} aoMudar={(v) => mudar({ colunasIdentificacao: Number(v) })} />
            </Linha>
          </div>
          <p className="mb-2 text-xs text-slate-500">Marque o que aparece e use ▲▼ para mudar a ordem. Suspeita, equipamento e ID só saem quando houver valor.</p>
          <ListaOrdenavel itens={l.identificacao} nomes={r.campos} aoMudar={(identificacao) => mudar({ identificacao })} />
        </Cartao>

        <Cartao titulo="Seções do laudo (ordem e visibilidade)">
          <ListaOrdenavel itens={l.secoes} nomes={r.secoes} aoMudar={(secoes) => mudar({ secoes })} />
          <p className="mt-2 text-xs text-slate-500">Dica: para a prancha de imagens aparecer antes dos achados, suba-a na lista.</p>
          <div className="mt-3">
            <Linha rotulo='Título dos achados (ex.: "Relatório Ultrassonográfico"; vazio = "Achados")'>
              <input className={input} maxLength={80} value={l.textoTituloAchados ?? ''} onChange={texto('textoTituloAchados')} />
            </Linha>
          </div>
        </Cartao>

        <Cartao titulo="Prancha, assinatura e rodapé">
          <div className="grid gap-4 sm:grid-cols-2">
            <Linha rotulo="Fundo das fotos da prancha">
              <Opcoes valor={l.fundoPrancha} opcoes={[['preto', 'Preto (moldura)'], ['nenhum', 'Sem moldura']]} aoMudar={(v) => mudar({ fundoPrancha: v })} />
            </Linha>
            <Interruptor rotulo={'Mostrar o título "Prancha de imagens"'} valor={l.mostrarTituloPrancha} aoMudar={(v) => mudar({ mostrarTituloPrancha: v })} />
            <Linha rotulo="Fotos por linha na prancha">
              <Opcoes valor={l.colunasPrancha} opcoes={[[1, '1'], [2, '2'], [3, '3']]} aoMudar={(v) => mudar({ colunasPrancha: Number(v) })} />
            </Linha>
            <Linha rotulo="Posição da assinatura">
              <Opcoes valor={l.alinhamentoAssinatura} opcoes={[['esquerda', 'Esquerda'], ['centro', 'Centro'], ['direita', 'Direita']]} aoMudar={(v) => mudar({ alinhamentoAssinatura: v })} />
            </Linha>
            <Linha rotulo="Posição do QR code (se a verificação online estiver ligada)">
              <Opcoes valor={l.posicaoQr} opcoes={[['esquerda', 'Esquerda'], ['direita', 'Direita']]} aoMudar={(v) => mudar({ posicaoQr: v })} />
            </Linha>
            <Linha rotulo="Linha extra na assinatura (ex.: especialidade)">
              <input className={input} maxLength={120} value={l.textoAssinatura ?? ''} onChange={texto('textoAssinatura')} />
            </Linha>
          </div>
          <div className="mt-3 space-y-3">
            <Linha rotulo="Texto fixo no rodapé (ex.: endereço ou site)">
              <input className={input} maxLength={200} value={l.textoRodape ?? ''} onChange={texto('textoRodape')} />
            </Linha>
            <Interruptor rotulo={'Mostrar "Emitido com AutoLaudoVet" no rodapé'} valor={l.mostrarCreditoProduto} aoMudar={(v) => mudar({ mostrarCreditoProduto: v })} />
            <Linha rotulo="Aviso ao final do laudo (vazio = aviso padrão)">
              <textarea rows={4} maxLength={800} className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-[#0E4D64]"
                value={l.textoAviso ?? ''} placeholder="A ultrassonografia é um método complementar…" onChange={texto('textoAviso')} />
            </Linha>
          </div>
        </Cartao>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <Botao disabled={ocupado} onClick={salvar}>Salvar</Botao>
          <Botao variante="secundario" disabled={ocupado} onClick={previa}>Ver prévia (PDF)</Botao>
          {r.personalizado && <Botao variante="perigo" disabled={ocupado} onClick={restaurar} className="ml-auto">Voltar ao padrão</Botao>}
        </div>
      </div>
    </>
  );
}

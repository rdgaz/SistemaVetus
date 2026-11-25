import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ErroApi, enviarArquivo } from '../api';
import { Aviso, Botao, Cartao, Titulo } from '../ui';

/** Uma subpasta de exame do pendrive (ex.: JADE20261105-083824-3E0C/ABD20261105083833). */
type Item = {
  chave: string;
  idAnimal: string;
  subpasta: string;
  nome: string; // nome do animal (da pasta); editável quando falta
  data: string; // AAAAMMDD
  hora: string;
  fotos: File[];
  pdfs: File[];
  videos: File[];
  existe: { id: string; paciente: string; origem: string } | null;
  jaRecebidos: Set<string>;
  situacao: 'pronto' | 'enviando' | 'ok' | 'erro';
  progresso: number;
  mensagem?: string;
  exameId?: string;
  marcado: boolean;
};

const RE_PASTA_ANIMAL = /^(.*?)(\d{8}-\d{6}-[0-9A-Fa-f]{4})$/;
const RE_SUBPASTA = /^([A-Z]{2,5})(\d{14})$/;

const tipoNome: Record<string, string> = { ABD: 'Abdômen', REP: 'Reprodução', SMP: 'Partes pequenas' };
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

/** Detecta se o navegador está em um celular ou tablet (onde o seletor de pastas webkitdirectory não se aplica). */
const ehCelular = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

/** Normaliza o nome do arquivo para caracteres seguros aceitos pela API e converte .jpeg para .jpg. */
function nomeArquivoSeguro(nome: string, indice: number): string {
  const ponto = nome.lastIndexOf('.');
  const baseBruta = (ponto > 0 ? nome.slice(0, ponto) : nome)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-#. ()]/g, '_')
    .trim();
  const base = (baseBruta || `ARQ_${indice + 1}`).slice(0, 100);
  const extBruta = (ponto > 0 ? nome.slice(ponto + 1) : 'jpg').toLowerCase();
  const ext = extBruta === 'jpeg' ? 'jpg' : extBruta;
  return `${base}.${ext}`;
}

/** Gera data (AAAAMMDD) e hora (HHMMSS) atuais para exames enviados a partir de arquivos soltos. */
function agoraPartes() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const hora = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return { data, hora };
}

/** Agrupa os arquivos escolhidos (pasta do ultrassom, pasta comum ou arquivos soltos) em exames. */
function agrupar(arquivos: File[]): Item[] {
  const mapa = new Map<string, Item>();
  const avulsos: File[] = [];
  let nomePastaAvulsa = '';

  for (const f of arquivos) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const partes = (rel || f.name).split('/');
    // procura "<ANIMAL><ID>/<SUBPASTA>/<arquivo>" em qualquer nível (ex.: pasta exportada pelo ultrassom)
    const i = partes.findIndex((p, k) => k < partes.length - 2 && RE_PASTA_ANIMAL.test(p) && RE_SUBPASTA.test(partes[k + 1]));
    if (i >= 0) {
      const m = RE_PASTA_ANIMAL.exec(partes[i])!;
      const s = RE_SUBPASTA.exec(partes[i + 1])!;
      const chave = `${m[2]}/${partes[i + 1]}`;
      let it = mapa.get(chave);
      if (!it) {
        it = {
          chave, idAnimal: m[2], subpasta: partes[i + 1], nome: m[1].replace(/_/g, ' ').trim(),
          data: s[2].slice(0, 8), hora: s[2].slice(8), fotos: [], pdfs: [], videos: [],
          existe: null, jaRecebidos: new Set(), situacao: 'pronto', progresso: 0, marcado: true,
        };
        mapa.set(chave, it);
      }
      const n = f.name.toLowerCase();
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) it.fotos.push(f);
      else if (n.endsWith('.pdf')) it.pdfs.push(f);
      else if (n.endsWith('.mp4')) it.videos.push(f);
    } else {
      const n = f.name.toLowerCase();
      if (n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.pdf') || n.endsWith('.mp4')) {
        avulsos.push(f);
        if (!nomePastaAvulsa && partes.length >= 2) nomePastaAvulsa = partes[partes.length - 2].replace(/_/g, ' ').trim();
      }
    }
  }

  // se escolheu arquivos soltos (no celular ou no PC) ou uma pasta comum sem o padrão do aparelho, cria um exame com eles
  if (avulsos.length > 0) {
    const { data, hora } = agoraPartes();
    const idAnimal = `${data}-${hora}-0000`;
    const subpasta = `ABD${data}${hora}`;
    const chave = `${idAnimal}/${subpasta}`;
    const it: Item = {
      chave, idAnimal, subpasta, nome: nomePastaAvulsa,
      data, hora, fotos: [], pdfs: [], videos: [],
      existe: null, jaRecebidos: new Set(), situacao: 'pronto', progresso: 0, marcado: true,
    };
    for (const f of avulsos) {
      const n = f.name.toLowerCase();
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) it.fotos.push(f);
      else if (n.endsWith('.pdf')) it.pdfs.push(f);
      else if (n.endsWith('.mp4')) it.videos.push(f);
    }
    if (it.fotos.length + it.pdfs.length > 0) mapa.set(chave, it);
  }

  const lista = [...mapa.values()];
  for (const it of lista) for (const l of [it.fotos, it.pdfs, it.videos]) l.sort((a, b) => a.name.localeCompare(b.name));
  return lista.filter((it) => it.fotos.length + it.pdfs.length > 0)
    .sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
}

const dataHora = (it: Item) =>
  `${it.data.slice(6)}/${it.data.slice(4, 6)}/${it.data.slice(0, 4)} ${it.hora.slice(0, 2)}:${it.hora.slice(2, 4)}`;

/** Envio manual de exames exportados do ultrassom para o pendrive. */
export function EnvioPendrive() {
  const [itens, setItens] = useState<Item[]>([]);
  const [comVideos, setComVideos] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const pasta = useRef<HTMLInputElement>(null);
  const arquivos = useRef<HTMLInputElement>(null);

  const atualizar = (chave: string, p: Partial<Item>) =>
    setItens((l) => l.map((x) => (x.chave === chave ? { ...x, ...p } : x)));

  async function escolher(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setErro('');
    setLendo(true);
    try {
      const novos = agrupar([...lista]);
      if (novos.length === 0) {
        setErro('Nenhum arquivo compatível encontrado. Selecione fotos (.jpg / .jpeg) ou o relatório (.pdf) do exame.');
        return;
      }
      const r = await api<{ idAnimal: string; subpasta: string; erro?: string;
        recebidos?: { nome: string; tamanho: number }[]; exame?: { id: string; paciente: string; origem: string } | null }[]>(
        'POST', '/api/exames/pendrive/verificar', { exames: novos.map((n) => ({ idAnimal: n.idAnimal, subpasta: n.subpasta })) });
      for (const n of novos) {
        const v = r.find((x) => x.idAnimal === n.idAnimal && x.subpasta === n.subpasta);
        n.existe = v?.exame ?? null;
        n.jaRecebidos = new Set((v?.recebidos ?? []).map((x) => `${x.nome}:${x.tamanho}`));
        if (n.existe) n.marcado = false; // já está no sistema: só envia se a pessoa marcar
      }
      setItens(novos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao ler a pasta.');
    } finally {
      setLendo(false);
    }
  }

  async function enviar() {
    setErro('');
    const selecionados = itens.filter((x) => x.marcado && x.situacao !== 'ok');
    const semNome = selecionados.find((x) => x.pdfs.length === 0 && !x.nome.trim());
    if (semNome) {
      setErro('Informe o nome do animal nos exames que não possuem relatório PDF.');
      return;
    }
    setEnviando(true);
    for (const it of selecionados) {
      const todos = [...it.pdfs, ...it.fotos, ...(comVideos ? it.videos : [])];
      const total = todos.reduce((s, f) => s + f.size, 0) || 1;
      let enviado = 0;
      atualizar(it.chave, { situacao: 'enviando', progresso: 0, mensagem: undefined });
      try {
        for (let idx = 0; idx < todos.length; idx++) {
          const f = todos[idx];
          const nomeEnvio = nomeArquivoSeguro(f.name, idx);
          // retomar: pula o que já chegou inteiro
          if (!it.jaRecebidos.has(`${nomeEnvio}:${f.size}`)) {
            await enviarArquivo(`/api/exames/pendrive/${it.idAnimal}/${it.subpasta}/arquivos/${encodeURIComponent(nomeEnvio)}`, f);
          }
          enviado += f.size;
          atualizar(it.chave, { progresso: Math.round((enviado / total) * 100) });
        }
        const r = await api<{ id: string; novo: boolean }>(
          'POST', `/api/exames/pendrive/${it.idAnimal}/${it.subpasta}/concluir`, { nome: it.nome });
        atualizar(it.chave, { situacao: 'ok', progresso: 100, exameId: r.id,
          mensagem: r.novo ? 'Exame criado.' : 'Juntado ao exame que já estava no sistema.' });
      } catch (e) {
        atualizar(it.chave, { situacao: 'erro', mensagem: e instanceof ErroApi ? e.message : 'Falha no envio. Tente de novo (continua de onde parou).' });
      }
    }
    setEnviando(false);
  }

  const marcados = itens.filter((x) => x.marcado && x.situacao !== 'ok');
  const bytes = marcados.reduce((s, x) =>
    s + [...x.pdfs, ...x.fotos, ...(comVideos ? x.videos : [])].reduce((a, f) => a + f.size, 0), 0);

  return (
    <>
      <Titulo>Enviar exame</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        {ehCelular
          ? 'Selecione as fotos do ultrassom (e o relatório em PDF, se tiver) direto do seu celular para criar o exame.'
          : 'Envie a pasta do exame salva no computador ou pendrive, ou escolha arquivos soltos (.jpg, .pdf, .mp4). Se houver o relatório (PDF) do aparelho, o sistema preenche paciente, responsável, idade, medidas e comentários automaticamente.'}
      </p>

      <Cartao titulo={ehCelular ? '1. Escolha as fotos e arquivos' : '1. Escolha a pasta ou arquivos'}>
        <div className="flex flex-wrap items-center gap-3">
          {ehCelular ? (
            <Botao onClick={() => arquivos.current?.click()} disabled={enviando || lendo}>
              Escolher fotos e arquivos
            </Botao>
          ) : (
            <>
              <Botao onClick={() => pasta.current?.click()} disabled={enviando || lendo}>
                Escolher pasta (computador / pendrive)
              </Botao>
              <Botao variante="secundario" onClick={() => arquivos.current?.click()} disabled={enviando || lendo}>
                Escolher arquivos soltos
              </Botao>
            </>
          )}
          <input ref={pasta} type="file" className="hidden" multiple
            // @ts-expect-error atributo não padronizado, aceito por Chrome, Edge, Safari e Firefox
            webkitdirectory="" onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
          <input ref={arquivos} type="file" className="hidden" multiple accept=".jpg,.jpeg,.pdf,.mp4"
            onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {ehCelular
            ? 'Você pode selecionar várias fotos (.jpg / .jpeg), o relatório (.pdf) e vídeos (.mp4) de uma só vez.'
            : 'Você pode escolher a pasta de um animal, uma unidade inteira com vários exames ou selecionar fotos e PDF soltos.'}
        </p>
        {lendo && <p className="mt-2 text-sm text-slate-500">Lendo…</p>}
      </Cartao>

      {erro && <Aviso>{erro}</Aviso>}

      {itens.length > 0 && (
        <Cartao titulo={`2. Confira (${itens.length} exame${itens.length > 1 ? 's' : ''})`}>
          <div className="space-y-2">
            {itens.map((it) => (
              <div key={it.chave} className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 size-5" checked={it.marcado} disabled={enviando || it.situacao === 'ok'}
                    onChange={(e) => atualizar(it.chave, { marcado: e.target.checked })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <input className="min-h-9 w-44 rounded border border-slate-300 px-2 font-semibold"
                        value={it.nome} placeholder="Nome do animal" disabled={enviando}
                        onChange={(e) => atualizar(it.chave, { nome: e.target.value })} />
                      <span className="text-sm text-slate-500">
                        {tipoNome[RE_SUBPASTA.exec(it.subpasta)![1]] ?? RE_SUBPASTA.exec(it.subpasta)![1]} · {dataHora(it)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {it.fotos.length} foto(s) ({mb(it.fotos.reduce((s, f) => s + f.size, 0))})
                      {it.pdfs.length > 0 ? ' · relatório PDF' : ' · sem relatório PDF (o nome acima vale)'}
                      {it.videos.length > 0 && ` · ${it.videos.length} vídeo(s) (${mb(it.videos.reduce((s, f) => s + f.size, 0))})`}
                    </div>
                    {it.existe && it.situacao !== 'ok' && (
                      <div className="mt-1 text-sm text-amber-700">
                        Já está no sistema ({it.existe.paciente}). Marque para enviar de novo: atualiza o mesmo exame, sem duplicar.
                      </div>
                    )}
                    {it.situacao === 'enviando' && (
                      <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200">
                        <div className="h-full bg-[#0E4D64]" style={{ width: `${it.progresso}%` }} />
                      </div>
                    )}
                    {it.situacao === 'ok' && (
                      <div className="mt-1 text-sm text-emerald-700">
                        ✓ {it.mensagem} <Link className="underline" to={`/exames/${it.exameId}`}>Abrir exame</Link>
                      </div>
                    )}
                    {it.situacao === 'erro' && <div className="mt-1 text-sm text-red-700">{it.mensagem}</div>}
                  </div>
                </label>
              </div>
            ))}
          </div>

          {itens.some((x) => x.videos.length > 0) && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={comVideos} disabled={enviando}
                onChange={(e) => setComVideos(e.target.checked)} />
              Enviar também os vídeos (ficam guardados no exame; não vão para a IA)
            </label>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Botao onClick={() => void enviar()} disabled={enviando || marcados.length === 0}>
              {enviando ? 'Enviando…' : `Enviar ${marcados.length} exame(s) · ${mb(bytes)}`}
            </Botao>
            <Link to="/" className="text-sm text-[#0E4D64] underline">Voltar aos exames</Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Se a conexão cair, envie de novo: o que já chegou não é reenviado. Mantenha esta tela aberta durante o envio.
          </p>
        </Cartao>
      )}
    </>
  );
}

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

/** Agrupa os arquivos escolhidos (pasta inteira ou várias) em exames. */
function agrupar(arquivos: File[]): Item[] {
  const mapa = new Map<string, Item>();
  for (const f of arquivos) {
    const partes = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split('/');
    // procura "<ANIMAL><ID>/<SUBPASTA>/<arquivo>" em qualquer nível (a pessoa pode escolher o pendrive inteiro)
    let i = partes.findIndex((p, k) => k < partes.length - 2 && RE_PASTA_ANIMAL.test(p) && RE_SUBPASTA.test(partes[k + 1]));
    if (i < 0) continue;
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
    if (n.endsWith('.jpg')) it.fotos.push(f);
    else if (n.endsWith('.pdf')) it.pdfs.push(f);
    else if (n.endsWith('.mp4')) it.videos.push(f);
    i = -1;
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
        setErro('Não encontrei exames nesta seleção. Escolha a pasta do animal (ex.: JADE20261105-083824-3E0C) ou o pendrive inteiro.');
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
    setEnviando(true);
    for (const it of itens.filter((x) => x.marcado && x.situacao !== 'ok')) {
      const todos = [...it.pdfs, ...it.fotos, ...(comVideos ? it.videos : [])];
      const total = todos.reduce((s, f) => s + f.size, 0) || 1;
      let enviado = 0;
      atualizar(it.chave, { situacao: 'enviando', progresso: 0, mensagem: undefined });
      try {
        for (const f of todos) {
          // retomar: pula o que já chegou inteiro
          if (!it.jaRecebidos.has(`${f.name}:${f.size}`)) {
            await enviarArquivo(`/api/exames/pendrive/${it.idAnimal}/${it.subpasta}/arquivos/${encodeURIComponent(f.name)}`, f);
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
      <Titulo>Enviar exame do pendrive</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Copie a pasta do exame do ultrassom para o pendrive e escolha-a aqui. O sistema lê o relatório (PDF) do aparelho
        e preenche paciente, tutor, idade, medidas e comentários. Se o mesmo exame já chegou pelo DICOM, as fotos de melhor
        qualidade do pendrive passam a ser usadas, desde que ainda não exista pré-laudo.
      </p>

      <Cartao titulo="1. Escolha a pasta">
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => pasta.current?.click()} disabled={enviando || lendo}>Escolher pasta do pendrive</Botao>
          <Botao variante="secundario" onClick={() => arquivos.current?.click()} disabled={enviando || lendo}>
            Escolher arquivos (celular)
          </Botao>
          <input ref={pasta} type="file" className="hidden" multiple
            // @ts-expect-error atributo não padronizado, aceito por Chrome, Edge, Safari e Firefox
            webkitdirectory="" onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
          <input ref={arquivos} type="file" className="hidden" multiple accept=".jpg,.jpeg,.pdf,.mp4"
            onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Pode ser a pasta de um animal (ex.: JADE20261105-083824-3E0C) ou o pendrive inteiro, com vários exames.
          No celular, a escolha de pasta nem sempre existe: use o computador.
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

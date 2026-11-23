import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Aviso, Botao, Campo, Cartao, Selecao, Titulo } from '../ui';

type Referencia = {
  id: string;
  especie: string;
  pesoMinKg: number | null;
  pesoMaxKg: number | null;
  orgao: string;
  medida: string;
  minimo: number | null;
  maximo: number | null;
  unidade: string;
  termos: string | null;
  observacao: string | null;
  fonte: string;
  ativa: boolean;
};

const vazia: Omit<Referencia, 'id'> = {
  especie: 'Canina', pesoMinKg: null, pesoMaxKg: null, orgao: '', medida: '', minimo: null, maximo: null,
  unidade: 'mm', termos: '', observacao: '', fonte: '', ativa: true,
};

const faixa = (r: Referencia) => {
  const u = r.unidade === 'razão' ? '' : ` ${r.unidade}`;
  const v = (n: number) => String(n).replace('.', ',');
  if (r.minimo != null && r.maximo != null) return `${v(r.minimo)} a ${v(r.maximo)}${u}`;
  if (r.maximo != null) return `até ${v(r.maximo)}${u}`;
  return r.minimo != null ? `a partir de ${v(r.minimo)}${u}` : '—';
};
const peso = (r: Referencia) =>
  r.pesoMinKg == null && r.pesoMaxKg == null ? 'qualquer peso'
    : `${r.pesoMinKg ?? 0} a ${r.pesoMaxKg != null ? `${r.pesoMaxKg} kg` : '…'}`;

/** Administração do sistema: valores de referência por espécie e porte. */
export function AdminReferencias() {
  const [lista, setLista] = useState<Referencia[]>([]);
  const [editando, setEditando] = useState<(Omit<Referencia, 'id'> & { id?: string }) | null>(null);
  const [especie, setEspecie] = useState('Canina');
  const [erro, setErro] = useState('');

  const carregar = () => api<Referencia[]>('GET', '/api/admin/referencias').then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setErro('');
    try {
      if (editando.id) await api('PUT', `/api/admin/referencias/${editando.id}`, editando);
      else await api('POST', '/api/admin/referencias', editando);
      setEditando(null);
      carregar();
    } catch (x) {
      setErro((x as Error).message);
    }
  };
  const apagar = async (r: Referencia) => {
    if (!confirm(`Apagar "${r.medida}" (${r.especie})? Para só deixar de usar, desmarque "Ativa".`)) return;
    await api('DELETE', `/api/admin/referencias/${r.id}`).catch((x) => setErro(x.message));
    carregar();
  };

  const num = (k: keyof Referencia) => (ev: { target: { value: string } }) =>
    setEditando({ ...editando!, [k]: ev.target.value === '' ? null : Number(ev.target.value.replace(',', '.')) });
  const txt = (k: keyof Referencia) => (ev: { target: { value: string } }) => setEditando({ ...editando!, [k]: ev.target.value });
  const especies = [...new Set(['Canina', 'Felina', ...lista.map((r) => r.especie)])];

  return (
    <>
      <Titulo>Valores de referência</Titulo>
      <div className="space-y-4">
        <Aviso tipo="info">
          Usados na revisão (medidas do aparelho × faixa normal) e enviados à IA. Os valores iniciais vêm da literatura
          e devem ser <b>validados por um veterinário ultrassonografista</b>. "Termos" são as palavras que reconhecem a
          medida do aparelho (ex.: <code>rim comp</code> combina com "Rim E &gt; Comprimento").
        </Aviso>
        {erro && <Aviso>{erro}</Aviso>}

        {editando ? (
          <Cartao titulo={editando.id ? 'Editar referência' : 'Nova referência'}>
            <form onSubmit={salvar} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Espécie" list="especies-ref" value={editando.especie} onChange={txt('especie')} />
                <datalist id="especies-ref"><option value="Canina" /><option value="Felina" /></datalist>
                <Campo rotulo="Órgão (como no laudo)" value={editando.orgao} onChange={txt('orgao')} />
                <div className="sm:col-span-2"><Campo rotulo="Medida" value={editando.medida} onChange={txt('medida')} /></div>
                <Campo rotulo="Mínimo" type="number" step="any" value={editando.minimo ?? ''} onChange={num('minimo')} />
                <Campo rotulo="Máximo" type="number" step="any" value={editando.maximo ?? ''} onChange={num('maximo')} />
                <Selecao rotulo="Unidade" value={editando.unidade} onChange={txt('unidade')}>
                  <option value="mm">mm</option><option value="cm">cm</option><option value="razão">razão</option>
                </Selecao>
                <label className="flex min-h-11 items-end gap-2 pb-2">
                  <input type="checkbox" className="size-5" checked={editando.ativa}
                    onChange={(ev) => setEditando({ ...editando, ativa: ev.target.checked })} /> Ativa
                </label>
                <Campo rotulo="Peso a partir de (kg)" type="number" step="any" value={editando.pesoMinKg ?? ''} onChange={num('pesoMinKg')} dica="Vazio = qualquer" />
                <Campo rotulo="Peso abaixo de (kg)" type="number" step="any" value={editando.pesoMaxKg ?? ''} onChange={num('pesoMaxKg')} dica="Vazio = qualquer" />
                <div className="sm:col-span-2"><Campo rotulo="Termos (para reconhecer a medida do aparelho)" value={editando.termos ?? ''} onChange={txt('termos')} /></div>
                <div className="sm:col-span-2 lg:col-span-4"><Campo rotulo="Observação" value={editando.observacao ?? ''} onChange={txt('observacao')} /></div>
                <div className="sm:col-span-2 lg:col-span-4"><Campo rotulo="Fonte (referência bibliográfica)" value={editando.fonte} onChange={txt('fonte')} /></div>
              </div>
              <div className="flex gap-2">
                <Botao type="submit">Salvar</Botao>
                <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>Cancelar</Botao>
              </div>
            </form>
          </Cartao>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Botao onClick={() => setEditando({ ...vazia, especie })}>+ Nova referência</Botao>
            {especies.map((e) => (
              <button key={e} onClick={() => setEspecie(e)}
                className={`min-h-10 rounded-full border px-4 text-sm font-medium ${especie === e ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white'}`}>
                {e} ({lista.filter((r) => r.especie === e).length})
              </button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-slate-500">
              <th className="p-2">Órgão</th><th className="p-2">Medida</th><th className="p-2">Faixa</th><th className="p-2">Peso</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {lista.filter((r) => r.especie === especie).map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 ${r.ativa ? '' : 'opacity-50'}`} title={r.fonte}>
                  <td className="p-2">{r.orgao}</td>
                  <td className="p-2">{r.medida}{!r.ativa && ' (inativa)'}</td>
                  <td className="p-2 font-medium">{faixa(r)}</td>
                  <td className="p-2 text-slate-500">{peso(r)}</td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <button className="mr-3 text-[#0E4D64] underline" onClick={() => setEditando(r)}>editar</button>
                    <button className="text-red-700 underline" onClick={() => apagar(r)}>apagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Aviso, Botao, Campo, Cartao, Selecao } from '../ui';
import { AbasClinica } from './DadosClinica';

type Dispositivo = {
  id: string; nome: string; tipo: string; ativo: boolean; criadoPorNome: string; criadoEm: string; ultimoUsoEm: string | null;
  ultimoIp: string | null; versaoApp: string | null; revogadoEm: string | null; revogadoPor: string | null;
};
type Pendente = { id: string; nomeDispositivo: string; tipo: string; expiraEm: string };
type Lista = { dispositivos: Dispositivo[]; pendentes: Pendente[] };
type Codigo = { codigo: string; expiraEm: string; nomeDispositivo: string; tipo: string };

const nomeTipo: Record<string, string> = { windows: 'Windows', android: 'Android', receptor: 'Receptor DICOM' };
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

/**
 * Aparelhos e apps da clínica: os apps de envio (Windows e Android) que mandam exames pela API de ingestão. O administrador
 * gera um código de pareamento (8 caracteres, vale 10 minutos), digita no app e pode revogar o app quando quiser.
 */
export function Aparelhos() {
  const [l, setL] = useState<Lista | null>(null);
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('windows');
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => api<Lista>('GET', '/api/clinica/dispositivos').then(setL).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const gerar = async () => {
    setErro(''); setOcupado(true);
    try { setCodigo(await api<Codigo>('POST', '/api/clinica/dispositivos/pareamento', { nome, tipo })); setNome(''); await carregar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };
  const revogar = async (d: Dispositivo) => {
    if (!confirm(`Revogar o app "${d.nome}"? Ele para de enviar exames na hora. Para usar de novo, será preciso parear outra vez.`)) return;
    setErro('');
    try { await api('DELETE', `/api/clinica/dispositivos/${d.id}`); await carregar(); } catch (e) { setErro((e as Error).message); }
  };

  const ativos = (l?.dispositivos ?? []).filter((d) => d.ativo);
  const revogados = (l?.dispositivos ?? []).filter((d) => !d.ativo);

  return (
    <>
      <AbasClinica />
      <p className="mb-4 text-sm text-slate-600">
        Apps de envio instalados no computador ou no celular da clínica: recebem o exame do ultrassom e mandam para o sistema pela
        internet, com segurança. Cada app tem a sua chave, que você pode revogar a qualquer momento.
      </p>
      {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}

      <div className="space-y-4">
        <Cartao titulo="Parear um app novo">
          {codigo ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600">Digite este código no app <b>{codigo.nomeDispositivo}</b> ({nomeTipo[codigo.tipo] ?? codigo.tipo}):</p>
              <div className="font-mono text-4xl font-bold tracking-[0.3em] text-[#0E4D64]">{codigo.codigo}</div>
              <p className="text-xs text-slate-500">Vale até {quando(codigo.expiraEm)} e só pode ser usado uma vez. Ele não aparece de novo.</p>
              <Botao variante="secundario" onClick={() => { setCodigo(null); carregar(); }}>Pronto</Botao>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <Campo rotulo="Nome do app" placeholder="Notebook da Dra. Ana" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
              <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="windows">Windows</option>
                <option value="android">Android</option>
              </Selecao>
              <Botao disabled={ocupado || !nome.trim()} onClick={gerar}>{ocupado ? 'Gerando…' : 'Gerar código'}</Botao>
            </div>
          )}
          {(l?.pendentes.length ?? 0) > 0 && !codigo && (
            <p className="mt-3 text-xs text-slate-500">
              Aguardando pareamento: {l!.pendentes.map((p) => `${p.nomeDispositivo} (até ${new Date(p.expiraEm).toLocaleTimeString('pt-BR', { timeStyle: 'short' })})`).join(', ')}
            </p>
          )}
        </Cartao>

        <Cartao titulo={`Apps ativos (${ativos.length})`}>
          {l && ativos.length === 0 && <p className="text-sm text-slate-500">Nenhum app pareado.</p>}
          <div className="divide-y divide-slate-100">
            {ativos.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{d.nome} <span className="font-normal text-slate-500">· {nomeTipo[d.tipo] ?? d.tipo}</span></div>
                  <div className="text-xs text-slate-500">
                    Último envio: {quando(d.ultimoUsoEm)}{d.versaoApp ? ` · versão ${d.versaoApp}` : ''} · pareado por {d.criadoPorNome} em {quando(d.criadoEm)}
                  </div>
                </div>
                <Botao variante="perigo" onClick={() => revogar(d)}>Revogar</Botao>
              </div>
            ))}
          </div>
          {revogados.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">Revogados: {revogados.map((d) => `${d.nome} (${quando(d.revogadoEm)}${d.revogadoPor ? `, por ${d.revogadoPor}` : ''})`).join(', ')}</p>
          )}
        </Cartao>
      </div>
    </>
  );
}

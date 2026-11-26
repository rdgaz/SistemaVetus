import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Aviso, Botao, Campo, Cartao, Segredo, Titulo } from '../ui';

type Receptor = {
  id: string; nome: string; ativo: boolean; criadoPorNome: string; criadoEm: string; ultimoUsoEm: string | null;
  ultimoIp: string | null; versaoApp: string | null; revogadoEm: string | null;
};
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

/**
 * Receptores (administrador do sistema): tokens de serviço do receptor DICOM da nuvem. O receptor envia os exames pela API de
 * ingestão com este token e informa o AE Title chamado; a clínica é a dona desse AE.
 */
export function AdminReceptores() {
  const [lista, setLista] = useState<Receptor[] | null>(null);
  const [nome, setNome] = useState('Receptor DICOM nuvem');
  const [novo, setNovo] = useState<{ nome: string; token: string } | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => api<Receptor[]>('GET', '/api/admin/receptores').then(setLista).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    setErro('');
    try { const r = await api<{ nome: string; token: string }>('POST', '/api/admin/receptores', { nome }); setNovo(r); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  };
  const revogar = async (r: Receptor) => {
    if (!confirm(`Revogar o token de "${r.nome}"? O receptor para de entregar exames até receber um token novo.`)) return;
    try { await api('DELETE', `/api/admin/receptores/${r.id}`); await carregar(); } catch (e) { setErro((e as Error).message); }
  };

  return (
    <>
      <Titulo>Receptores (sistema)</Titulo>
      <p className="mb-4 text-sm text-slate-600">
        Tokens de serviço do receptor DICOM da nuvem. Cada receptor usa um token para entregar os exames pela API de ingestão.
      </p>
      {erro && <div className="mb-3"><Aviso>{erro}</Aviso></div>}
      <div className="space-y-4">
        <Cartao titulo="Novo token de receptor">
          {novo ? (
            <div className="space-y-2">
              <Segredo rotulo={`Token de "${novo.nome}" (copie agora: ele não aparece de novo)`} valor={novo.token} />
              <p className="text-xs text-slate-500">Coloque no .env do receptor (VETUS_TOKEN_INGESTAO). Nunca no Git.</p>
              <Botao variante="secundario" onClick={() => setNovo(null)}>Pronto</Botao>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1"><Campo rotulo="Nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} /></div>
              <Botao onClick={criar}>Gerar token</Botao>
            </div>
          )}
        </Cartao>
        <Cartao titulo="Receptores">
          {lista?.length === 0 && <p className="text-sm text-slate-500">Nenhum token de receptor.</p>}
          <div className="divide-y divide-slate-100">
            {lista?.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="font-semibold text-slate-800">{r.nome} {!r.ativo && <span className="text-xs font-normal text-red-700">(revogado {quando(r.revogadoEm)})</span>}</div>
                  <div className="text-xs text-slate-500">Último uso: {quando(r.ultimoUsoEm)}{r.ultimoIp ? ` · ${r.ultimoIp}` : ''}{r.versaoApp ? ` · versão ${r.versaoApp}` : ''} · criado por {r.criadoPorNome}</div>
                </div>
                {r.ativo && <Botao variante="perigo" onClick={() => revogar(r)}>Revogar</Botao>}
              </div>
            ))}
          </div>
        </Cartao>
      </div>
    </>
  );
}

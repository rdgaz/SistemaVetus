import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { dataBR } from '../exames';
import { Logo } from '../marca';

type Resultado = {
  valido: boolean;
  codigo: string;
  versao: number;
  retificado: boolean;
  versaoVigente: number;
  paciente: string;
  especie: string | null;
  tipoExame: string | null;
  dataExame: string | null;
  clinica: string;
  assinadoPor: string;
  crmv: string;
  assinadoEm: string;
};

/** Página pública (sem login), aberta pelo QR code do PDF: confirma a autenticidade do laudo. */
export function Verificar() {
  const { codigo } = useParams();
  const [r, setR] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<Resultado>('GET', `/api/publico/verificar/${encodeURIComponent(codigo ?? '')}`)
      .then(setR)
      .catch((e) => setErro(e.status === 404 ? 'Código não encontrado. Confira se foi digitado corretamente.' : e.message));
  }, [codigo]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-md">
        <div className="mb-4 text-center">
          <div className="flex justify-center"><Logo className="h-12 w-auto" /></div>
          <div className="mt-1 text-sm text-slate-500">Verificação de laudo</div>
        </div>
        {!r && !erro && <p className="text-center text-slate-500">Verificando…</p>}
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-800">✗ {erro}</div>}
        {r && (
          <div className="space-y-4">
            {r.retificado ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-amber-900">
                <div className="text-lg font-semibold">⚠ Laudo retificado</div>
                <div className="text-sm">Este laudo (versão {r.versao}) foi substituído. A versão vigente é a {r.versaoVigente}; solicite-a à clínica.</div>
              </div>
            ) : (
              <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-center text-green-900">
                <div className="text-lg font-semibold">✓ Laudo autêntico</div>
                <div className="text-sm">Emitido e assinado pelo sistema AutoLaudoVet.</div>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Código</dt><dd className="font-mono font-semibold">{r.codigo}</dd>
              <dt className="text-slate-500">Paciente</dt><dd>{r.paciente}{r.especie && ` (${r.especie})`}</dd>
              <dt className="text-slate-500">Exame</dt><dd>{r.tipoExame}</dd>
              <dt className="text-slate-500">Data do exame</dt><dd>{dataBR(r.dataExame)}</dd>
              <dt className="text-slate-500">Clínica</dt><dd>{r.clinica}</dd>
              <dt className="text-slate-500">Assinado por</dt><dd>{r.assinadoPor} · {r.crmv}</dd>
              <dt className="text-slate-500">Assinado em</dt><dd>{new Date(r.assinadoEm).toLocaleString('pt-BR')}</dd>
              <dt className="text-slate-500">Versão</dt><dd>{r.versao}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

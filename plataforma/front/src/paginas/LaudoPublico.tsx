import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { dataBR } from '../exames';

type Laudo = {
  paciente: string;
  especie: string | null;
  tutor: string | null;
  tipoExame: string | null;
  dataExame: string | null;
  clinica: string;
  clinicaTelefone: string | null;
  assinadoPor: string;
  crmv: string;
  assinadoEm: string;
  codigoVerificacao: string;
  emRetificacao: boolean;
  expiraEm: string;
  pdf: string;
};

/** Página do tutor (link público, sem login): dados do exame e o PDF do laudo. */
export function LaudoPublico() {
  const { token } = useParams();
  const [l, setL] = useState<Laudo | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<Laudo>('GET', `/api/publico/laudo/${encodeURIComponent(token ?? '')}`)
      .then(setL)
      .catch((e) => setErro(e.status === 404 ? 'Este link não é válido, expirou ou foi cancelado. Peça um novo link à clínica.' : e.message));
  }, [token]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f5f6f8] p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-md">
        {!l && !erro && <p className="text-center text-slate-500">Carregando…</p>}
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-800">{erro}</div>}
        {l && (
          <>
            <div className="text-center">
              <div className="text-xl font-bold text-[#0E4D64]">{l.clinica}</div>
              <div className="text-sm text-slate-500">Laudo de ultrassonografia</div>
            </div>
            {l.emRetificacao && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Este laudo está sendo corrigido pela clínica. Em breve a nova versão estará disponível neste mesmo link.
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Paciente</dt><dd className="font-medium">{l.paciente}{l.especie && ` (${l.especie})`}</dd>
              {l.tutor && <><dt className="text-slate-500">Tutor</dt><dd>{l.tutor}</dd></>}
              <dt className="text-slate-500">Exame</dt><dd>{l.tipoExame}</dd>
              <dt className="text-slate-500">Data</dt><dd>{dataBR(l.dataExame)}</dd>
              <dt className="text-slate-500">Veterinário</dt><dd>{l.assinadoPor} · {l.crmv}</dd>
            </dl>
            <a href={l.pdf} target="_blank" rel="noreferrer"
              className="flex min-h-12 w-full items-center justify-center rounded-lg bg-[#0E4D64] text-lg font-medium text-white hover:bg-[#0B3D50]">
              Abrir o laudo (PDF)
            </a>
            <p className="text-center text-xs text-slate-500">
              Código de verificação: <span className="font-mono">{l.codigoVerificacao}</span> · link válido até{' '}
              {new Date(l.expiraEm).toLocaleDateString('pt-BR')}
              {l.clinicaTelefone && <><br />Dúvidas: {l.clinicaTelefone}</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

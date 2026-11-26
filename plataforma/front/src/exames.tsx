// Tipos e textos dos exames, usados pelas telas de lista e detalhe.

export type StatusExame = 'AguardandoDados' | 'NaFila' | 'Gerando' | 'AguardandoRevisao' | 'Pronto' | 'Erro';

export const nomeStatus: Record<StatusExame, string> = {
  AguardandoDados: 'Aguardando dados',
  NaFila: 'Na fila',
  Gerando: 'Gerando',
  AguardandoRevisao: 'Aguardando revisão',
  // "Pronto" parecia "pronto para revisar": o laudo já está assinado
  Pronto: 'Assinado',
  Erro: 'Erro',
};

export const corStatus: Record<StatusExame, string> = {
  AguardandoDados: 'bg-amber-100 text-amber-900',
  NaFila: 'bg-slate-200 text-slate-800',
  Gerando: 'bg-sky-100 text-sky-900',
  AguardandoRevisao: 'bg-violet-100 text-violet-900',
  Pronto: 'bg-green-100 text-green-900',
  Erro: 'bg-red-100 text-red-900',
};

export const ordemStatus: StatusExame[] = ['AguardandoDados', 'NaFila', 'Gerando', 'AguardandoRevisao', 'Pronto', 'Erro'];

export const nomeSexo: Record<string, string> = { M: 'Macho', F: 'Fêmea', O: 'Outro' };

/** "20261106" -> "06/11/2026" */
export function dataBR(d: string | null | undefined) {
  return d && /^\d{8}$/.test(d) ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : (d ?? '');
}

export function SeloStatus({ status }: { status: StatusExame }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${corStatus[status]}`}>
      {nomeStatus[status]}
    </span>
  );
}

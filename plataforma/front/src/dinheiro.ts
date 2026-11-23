/** R$ 1.234,56 */
export const reais = (v: number | null | undefined, casas = 2) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });

export const nomeMovimento: Record<string, string> = {
  credito_inicial: 'Crédito inicial',
  recarga: 'Recarga',
  debito: 'Pré-laudo',
  ajuste: 'Ajuste',
};

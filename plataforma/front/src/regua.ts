/**
 * Escala da foto do ultrassom (quantos pixels valem 1 cm), sem IA: acha a régua de profundidade que o aparelho desenha na
 * lateral direita (traços a cada 1 cm, pontinhos no meio). Mesmo algoritmo validado em ferramentas/teste-regua.py
 * (35 de 35 fotos do Mindray Vetus E7). Devolve null quando não há régua confiável: aí não se sugere nada.
 */
export type Escala = { pxPorCm: number; origem: 'regua' | 'medidas' | 'calibracao'; detalhe: string };

const CLARO = 170;

export function medirRegua(img: HTMLImageElement): { pxPorCm: number; tracos: number } | null {
  const larg = img.naturalWidth;
  const alt = img.naturalHeight;
  if (!larg || !alt) return null;
  const canvas = document.createElement('canvas');
  canvas.width = larg;
  canvas.height = alt;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const inicio = Math.floor(larg * 0.9); // a régua fica nos últimos 10% da largura
  let dados: Uint8ClampedArray;
  try {
    dados = ctx.getImageData(0, 0, larg, alt).data;
  } catch {
    return null; // imagem de outra origem: o navegador não deixa ler os pixels
  }
  const lum = (x: number, y: number) => {
    const i = (y * larg + x) * 4;
    return (dados[i] * 299 + dados[i + 1] * 587 + dados[i + 2] * 114) / 1000;
  };

  let melhor: { media: number; n: number; variacao: number } | null = null;
  for (let x = inicio; x < larg; x++) {
    // grupos de linhas claras nesta coluna (cada traço ou pontinho vira um grupo)
    const grupos: number[] = [];
    for (let y = 0; y < alt; y++) {
      if (lum(x, y) < CLARO) continue;
      const ini = y;
      while (y < alt && lum(x, y) >= CLARO) y++;
      if (y - ini <= 6) grupos.push((ini + y - 1) / 2); // traço fino (não é texto alto nem a imagem)
    }
    if (grupos.length < 4) continue;
    // traço "longo" (1 cm) = corrida horizontal clara de 7 a 30 px nessa linha
    const longos = grupos.filter((gy) => {
      const yy = Math.round(gy);
      let esq = x;
      while (esq > inicio && lum(esq - 1, yy) >= CLARO) esq--;
      let dir = x;
      while (dir < larg - 1 && lum(dir + 1, yy) >= CLARO) dir++;
      const comp = dir - esq + 1;
      return comp >= 7 && comp <= 30;
    });
    if (longos.length < 3) continue;
    const difs = longos.slice(1).map((v, i) => v - longos[i]);
    const med = mediana(difs);
    if (med < 15) continue;
    const normais = difs.filter((d) => Math.abs(d - med) <= med * 0.08); // tolera um traço faltando
    if (normais.length < 2) continue;
    const media = normais.reduce((s, v) => s + v, 0) / normais.length;
    const desvio = Math.sqrt(normais.reduce((s, v) => s + (v - media) ** 2, 0) / normais.length);
    const variacao = desvio / media;
    if (variacao > 0.03) continue;
    if (!melhor || longos.length > melhor.n || (longos.length === melhor.n && variacao < melhor.variacao)) melhor = { media, n: longos.length, variacao };
  }
  return melhor ? { pxPorCm: Math.round(melhor.media * 10) / 10, tracos: melhor.n } : null;
}

/** Escala aprendida com as medidas já digitadas nesta foto (pixels ÷ cm de cada uma; mediana). */
export function escalaPelasMedidas(medidas: { x1?: number; y1?: number; x2?: number; y2?: number; valor?: number }[], larg: number, alt: number): number | null {
  const razoes = medidas
    .filter((m) => (m.valor ?? 0) > 0)
    .map((m) => distanciaPx(m, larg, alt) / (m.valor as number))
    .filter((r) => Number.isFinite(r) && r > 5);
  return razoes.length ? mediana(razoes) : null;
}

export function distanciaPx(m: { x1?: number; y1?: number; x2?: number; y2?: number }, larg: number, alt: number): number {
  const dx = ((m.x2 ?? 0) - (m.x1 ?? 0)) * larg;
  const dy = ((m.y2 ?? 0) - (m.y1 ?? 0)) * alt;
  return Math.hypot(dx, dy);
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

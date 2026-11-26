"""
Teste de viabilidade (etapa 0 do docs/PLANO-MEDIDAS-ANOTACAO.md): acha a régua de profundidade nas fotos do ultrassom e
calcula quantos pixels valem 1 cm, sem IA. Lê as fotos só para medir; não copia nem guarda nada, e imprime só números.

Régua do Mindray Vetus E7: na lateral direita, traços curtos com os números 0, 1, 2... (1 cm) e pontinhos no meio (0,5 cm).

Uso (dentro de um container com acesso à pasta do pendrive, só leitura):
  python teste-regua.py /pendrive/<pasta do exame>/jpg [mais pastas...]
"""
import statistics
import sys
from pathlib import Path

from PIL import Image


def achar_regua(img: Image.Image):
    """Devolve (pixels_por_cm, n_tracos, variacao) ou None se não achar uma régua confiável."""
    cinza = img.convert("L")
    larg, alt = cinza.size
    px = cinza.load()
    inicio = int(larg * 0.90)  # régua fica nos últimos 10% da largura
    claro = 170

    melhor = None
    for x in range(inicio, larg):
        # grupos de linhas claras nesta coluna (cada traço/pontinho vira um grupo)
        grupos, y = [], 0
        while y < alt:
            if px[x, y] >= claro:
                ini = y
                while y < alt and px[x, y] >= claro:
                    y += 1
                if y - ini <= 6:  # traço fino (não é texto alto nem a imagem)
                    grupos.append((ini + y - 1) / 2)
            y += 1
        if len(grupos) < 4:
            continue
        # traço "longo" (1 cm) = corrida horizontal clara de pelo menos 7 px nessa linha
        longos = []
        for gy in grupos:
            yy = int(round(gy))
            esq = x
            while esq > inicio and px[esq - 1, yy] >= claro:
                esq -= 1
            dirx = x
            while dirx < larg - 1 and px[dirx + 1, yy] >= claro:
                dirx += 1
            if 7 <= dirx - esq + 1 <= 30:
                longos.append(gy)
        if len(longos) < 3:
            continue
        difs = [b - a for a, b in zip(longos, longos[1:])]
        med = statistics.median(difs)
        if med < 15:
            continue
        # tolera um traço faltando (dif ~ 2x) e mede a regularidade
        normal = [d for d in difs if abs(d - med) <= med * 0.08]
        if len(normal) < 2:
            continue
        variacao = statistics.pstdev(normal) / statistics.mean(normal)
        cand = (statistics.mean(normal), len(longos), variacao, x)
        if variacao <= 0.03 and (melhor is None or cand[1] > melhor[1] or (cand[1] == melhor[1] and cand[2] < melhor[2])):
            melhor = cand
    if melhor is None:
        return None
    return round(melhor[0], 1), melhor[1], round(melhor[2], 4)


def main():
    total = achou = 0
    por_tamanho = {}
    for pasta in sys.argv[1:]:
        fotos = sorted(p for p in Path(pasta).iterdir() if p.suffix.lower() in (".jpg", ".jpeg"))[:5]
        for f in fotos:
            total += 1
            with Image.open(f) as img:
                r = achar_regua(img)
                tam = f"{img.size[0]}x{img.size[1]}"
            if r:
                achou += 1
                por_tamanho.setdefault(tam, []).append(r[0])
            # só números: sem nome do arquivo nem do paciente
            print(f"foto {total:02d} {tam:>10}  " + (f"OK  {r[0]:6.1f} px/cm  {r[1]:2d} traços  variação {r[2]*100:.2f}%" if r else "não achou"))
    print(f"\nRégua achada em {achou} de {total} fotos ({100 * achou / max(total, 1):.0f}%).")
    for tam, vals in por_tamanho.items():
        print(f"  {tam}: {len(vals)} foto(s), px/cm de {min(vals)} a {max(vals)}")


if __name__ == "__main__":
    main()

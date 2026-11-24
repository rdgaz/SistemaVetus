import { useEffect, useState } from 'react';
import { api, enviarImagem } from '../api';
import { Aviso, Botao, Cartao } from '../ui';

/** Cartão para enviar/trocar/remover uma imagem de cadastro (logo da clínica, assinatura). */
export function EnvioImagem({ titulo, explicacao, urlVer, urlEnviar, alt, urlUso, comPosicao }: {
  titulo: string;
  explicacao: string;
  urlVer: string;
  urlEnviar: string;
  alt: string;
  /** endpoint de "usar no laudo" (GET/PUT { usar, posicao }) */
  urlUso: string;
  /** só o logo: esquerda, centro ou direita */
  comPosicao?: boolean;
}) {
  const [versao, setVersao] = useState(Date.now());
  const [existe, setExiste] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [usar, setUsar] = useState(true);
  const [posicao, setPosicao] = useState('centro');
  useEffect(() => {
    api<{ usar: boolean; posicao?: string }>('GET', urlUso)
      .then((u) => { setUsar(u.usar); if (u.posicao) setPosicao(u.posicao); }).catch(() => undefined);
  }, [urlUso]);
  const salvarUso = async (novoUsar: boolean, novaPosicao: string) => {
    const antes = { usar, posicao };
    setUsar(novoUsar); setPosicao(novaPosicao); setErro('');
    try { await api('PUT', urlUso, { usar: novoUsar, posicao: comPosicao ? novaPosicao : undefined }); }
    catch (x) { setUsar(antes.usar); setPosicao(antes.posicao); setErro((x as Error).message); }
  };

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro('');
    setOk('');
    try {
      await enviarImagem(urlEnviar, arquivo);
      setExiste(true);
      setVersao(Date.now());
      setOk('Imagem salva.');
    } catch (x) {
      setErro((x as Error).message);
    }
  };
  const remover = async () => {
    if (!confirm('Remover a imagem?')) return;
    await api('DELETE', urlEnviar).catch((x) => setErro(x.message));
    setExiste(false);
    setVersao(Date.now());
  };

  return (
    <Cartao titulo={titulo}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{explicacao}</p>
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          {existe ? (
            <img src={`${urlVer}?v=${versao}`} alt={alt} className="max-h-28 max-w-full object-contain"
              onError={() => setExiste(false)} />
          ) : (
            <span className="text-sm text-slate-500">Nenhuma imagem.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-[#0E4D64] px-4 font-medium text-white hover:bg-[#0B3D50]">
            {existe ? 'Trocar imagem' : 'Enviar imagem'}
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {existe && <Botao variante="perigo" onClick={remover}>Remover</Botao>}
        </div>
        {existe && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
              <span className="font-medium">Usar no laudo (PDF)</span>
              <button type="button" role="switch" aria-checked={usar} aria-label={`Usar ${alt.toLowerCase()} no laudo`}
                onClick={() => void salvarUso(!usar, posicao)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${usar ? 'bg-[#0E4D64]' : 'bg-slate-400'}`}>
                <span className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${usar ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>
            {comPosicao && (
              <div className={usar ? '' : 'opacity-50'}>
                <span className="mb-1 block text-sm text-slate-600">Posição no cabeçalho</span>
                <div className="flex gap-2">
                  {(['esquerda', 'centro', 'direita'] as const).map((p) => (
                    <button key={p} type="button" disabled={!usar} onClick={() => void salvarUso(usar, p)}
                      className={`min-h-10 flex-1 rounded-lg border px-3 text-sm font-medium capitalize ${posicao === p ? 'border-[#0E4D64] bg-[#0E4D64] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!usar && <p className="text-xs text-slate-500">A imagem fica guardada, mas não sai no laudo.</p>}
          </div>
        )}
        <p className="text-xs text-slate-500">PNG ou JPG, até 500 KB. Fundo branco ou transparente fica melhor no PDF.</p>
      </div>
    </Cartao>
  );
}

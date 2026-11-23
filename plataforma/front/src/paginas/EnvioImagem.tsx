import { useState } from 'react';
import { api, enviarImagem } from '../api';
import { Aviso, Botao, Cartao } from '../ui';

/** Cartão para enviar/trocar/remover uma imagem de cadastro (logo da clínica, assinatura). */
export function EnvioImagem({ titulo, explicacao, urlVer, urlEnviar, alt }: {
  titulo: string;
  explicacao: string;
  urlVer: string;
  urlEnviar: string;
  alt: string;
}) {
  const [versao, setVersao] = useState(Date.now());
  const [existe, setExiste] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

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
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-[#1f3b57] px-4 font-medium text-white hover:bg-[#2a4e72]">
            {existe ? 'Trocar imagem' : 'Enviar imagem'}
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {existe && <Botao variante="perigo" onClick={remover}>Remover</Botao>}
        </div>
        <p className="text-xs text-slate-500">PNG ou JPG, até 500 KB. Fundo branco ou transparente fica melhor no PDF.</p>
      </div>
    </Cartao>
  );
}

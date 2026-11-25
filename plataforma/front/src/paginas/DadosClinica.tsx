import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Aviso, Botao, Campo, Cartao, Titulo } from '../ui';
import { EnvioImagem } from './EnvioImagem';
import { SaldoClinica } from './SaldoClinica';

type Dados = {
  id: string;
  nome: string;
  documento: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  aeTitle: string;
  gerarAutomaticamente: boolean;
  informacoesObrigatorias: boolean;
  verificacaoOnline: boolean;
};

export function DadosClinica() {
  const { clinica, recarregar } = useSessao();
  const [d, setD] = useState<Dados | null>(null);
  const [inicial, setInicial] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api<Dados>('GET', '/api/clinica')
      .then((x) => { setD(x); setInicial(JSON.stringify(x)); })
      .catch((e) => setErro(e.message));
  }, [clinica]);

  if (!d) return erro ? <Aviso>{erro}</Aviso> : null;
  const alterado = JSON.stringify(d) !== inicial;
  const mudar = (k: keyof Dados) => (e: { target: { value: string } }) => { setD({ ...d, [k]: e.target.value }); setOk(false); };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk(false);
    setSalvando(true);
    try {
      await api('PUT', '/api/clinica', d);
      setInicial(JSON.stringify(d));
      setOk(true);
      await recarregar(); // o nome aparece no cabeçalho
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Titulo>Clínica</Titulo>
        <Link to="/clinica/layout" className="inline-flex min-h-10 items-center rounded-lg bg-[#0E4D64] px-4 text-sm font-medium text-white hover:bg-[#0B3D50]">
          Personalizar aparência do laudo (PDF) →
        </Link>
      </div>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">Dados salvos.</Aviso>}

        <SaldoClinica comExtrato />

        <Cartao titulo="Dados cadastrais (cabeçalho do laudo)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da clínica" required value={d.nome} onChange={mudar('nome')} />
            <Campo rotulo="CNPJ / CPF" value={d.documento ?? ''} onChange={mudar('documento')} />
            <Campo rotulo="Telefone" type="tel" value={d.telefone ?? ''} onChange={mudar('telefone')} />
            <Campo rotulo="E-mail" type="email" value={d.email ?? ''} onChange={mudar('email')} />
            <div className="sm:col-span-2">
              <Campo rotulo="Endereço" value={d.endereco ?? ''} onChange={mudar('endereco')} />
            </div>
          </div>
        </Cartao>

        <Cartao titulo="Funcionamento e Pré-laudo">
          <div className="space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 size-5" checked={d.gerarAutomaticamente}
                onChange={(e) => { setD({ ...d, gerarAutomaticamente: e.target.checked }); setOk(false); }} />
              <span>
                <span className="font-medium">Gerar o pré-laudo automaticamente ao receber o exame</span>
                <span className="block text-sm text-slate-500">
                  Desligado: o exame espera em "Aguardando dados" até alguém pedir a geração.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 size-5" checked={d.informacoesObrigatorias}
                onChange={(e) => { setD({ ...d, informacoesObrigatorias: e.target.checked }); setOk(false); }} />
              <span>
                <span className="font-medium">"Informações adicionais" obrigatórias</span>
                <span className="block text-sm text-slate-500">
                  Ligado: só dá para gerar o pré-laudo com o campo preenchido (exames do pendrive com comentários no PDF já entram na fila).
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-slate-100 pt-3">
              <input type="checkbox" className="mt-1 size-5" checked={d.verificacaoOnline}
                onChange={(e) => { setD({ ...d, verificacaoOnline: e.target.checked }); setOk(false); }} />
              <span>
                <span className="font-medium">Mostrar QR code e código de verificação online no laudo</span>
                <span className="block text-sm text-slate-500">
                  Ligado: o PDF traz o QR code e o código para conferir autenticidade no site.
                </span>
              </span>
            </label>
            <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">
              Título AE do ultrassom (DICOM): <span className="font-mono font-semibold text-slate-800">{d.aeTitle}</span>
            </div>
          </div>
        </Cartao>

        <EnvioImagem titulo="Logo (cabeçalho do laudo)" alt="Logo da clínica"
          urlVer={`/api/clinicas/${d.id}/logo`} urlEnviar="/api/clinica/logo" urlUso="/api/clinica/logo/uso" comPosicao
          explicacao="Aparece no cabeçalho do PDF de todos os laudos da clínica: centralizado por padrão, ou à esquerda/direita." />

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <Botao type="submit" disabled={!alterado || salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Botao>
          <Link to="/clinica/layout" className="text-sm font-medium text-[#0E4D64] underline">Personalizar cores, fontes e seções do PDF</Link>
          {alterado && <span className="text-sm font-medium text-amber-800">● Alterações não salvas</span>}
        </div>
      </form>
    </>
  );
}

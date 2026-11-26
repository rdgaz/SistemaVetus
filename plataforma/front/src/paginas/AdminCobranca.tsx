import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { reais } from '../dinheiro';
import { Aviso, Botao, Campo, Cartao, Titulo } from '../ui';
import { Financeiro } from './Financeiro';

type Preco = { modelo: string; entradaUsdPorMilhao: number; saidaUsdPorMilhao: number };
type Config = {
  fator: number;
  cambioUsdBrl: number;
  creditoInicialClinica: number;
  saldoProvedorBrl: number;
  saldoGeminiBrl: number;
  saldoClaudeUsd: number;
  saldosConferidosEm: string | null;
  alertaSaldoProvedorBrl: number;
  saldoProvedorBaixo: boolean;
  precos: Preco[];
  resumo: {
    geracoes: number; custoBrl: number; cobradoBrl: number;
    geracoesMes: number; custoMesBrl: number; cobradoMesBrl: number; saldoClinicasBrl: number;
    geracoesTestes?: number; custoTestesBrl?: number; custoTestesMesBrl?: number;
  };
};

/** Administração do sistema: fator de cobrança, câmbio, preços dos modelos e o saldo no provedor de IA. */
export function AdminCobranca() {
  const [c, setC] = useState<Config | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = () => api<Config>('GET', '/api/admin/cobranca').then(setC).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  if (!c) return erro ? <Aviso>{erro}</Aviso> : null;

  const num = (k: keyof Config) => (e: { target: { value: string } }) => setC({ ...c, [k]: Number(e.target.value.replace(',', '.')) });
  const mudarPreco = (i: number, m: Partial<Preco>) => setC({ ...c, precos: c.precos.map((p, k) => (k === i ? { ...p, ...m } : p)) });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setOk('');
    try {
      await api('PUT', '/api/admin/cobranca', c);
      await carregar();
      setOk('Configuração salva. Vale para os próximos pré-laudos.');
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  // exemplo: um pré-laudo típico (18 mil tokens de entrada, 4 mil de saída) com o primeiro modelo da lista
  const exemplo = c.precos.find((p) => p.entradaUsdPorMilhao > 0);
  const custoExemplo = exemplo ? (18000 * exemplo.entradaUsdPorMilhao + 4000 * exemplo.saidaUsdPorMilhao) / 1e6 * c.cambioUsdBrl : 0;
  const r = c.resumo;

  return (
    <>
      <Titulo>Cobrança da IA</Titulo>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {c.saldoProvedorBaixo && <Aviso>⚠ O seu saldo no provedor de IA está baixo ({reais(c.saldoProvedorBrl)}). Recarregue no provedor e atualize o valor abaixo.</Aviso>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Pré-laudos gerados', String(r.geracoes), `${r.geracoesMes} neste mês (clínicas reais)`],
            ['Custo real (provedor)', reais(r.custoBrl), `${reais(r.custoMesBrl)} neste mês`],
            ['Cobrado das clínicas', reais(r.cobradoBrl), `${reais(r.cobradoMesBrl)} neste mês`],
            ['Margem', reais(r.cobradoBrl - r.custoBrl), `saldo das clínicas reais: ${reais(r.saldoClinicasBrl)}`],
          ].map(([t, v, s]) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">{t}</div>
              <div className="text-2xl font-semibold text-slate-800">{v}</div>
              <div className="text-xs text-slate-500">{s}</div>
            </div>
          ))}
        </div>
        {(r.geracoesTestes ?? 0) > 0 && (
          <p className="text-xs text-violet-800">
            <b>Custo interno em clínicas de teste:</b> {reais(r.custoTestesBrl ?? 0)} ({reais(r.custoTestesMesBrl ?? 0)} neste mês · {r.geracoesTestes} geração(ões)) — descontado do saldo dos provedores, mas fora do faturamento das clínicas reais.
          </p>
        )}

        <Financeiro />

        <Cartao titulo="Regra de cobrança">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Fator (custo real × fator)" type="number" step="0.1" min="0.1" value={c.fator} onChange={num('fator')}
              dica="2 = 100% de margem sobre o custo." />
            <Campo rotulo="Câmbio US$ → R$" type="number" step="0.01" value={c.cambioUsdBrl} onChange={num('cambioUsdBrl')} />
            <Campo rotulo="Crédito inicial de clínica nova (R$)" type="number" step="0.01" min="0" value={c.creditoInicialClinica} onChange={num('creditoInicialClinica')} />
          </div>
          {exemplo && (
            <p className="mt-3 text-sm text-slate-600">
              Exemplo com <b>{exemplo.modelo}</b>: um pré-laudo típico custa ~{reais(custoExemplo)} no provedor e a clínica paga
              ~<b>{reais(custoExemplo * c.fator)}</b>.
            </p>
          )}
        </Cartao>

        <Cartao titulo="Seus créditos nos provedores de IA">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Google AI / Gemini (R$)" type="number" step="0.01" value={c.saldoGeminiBrl} onChange={num('saldoGeminiBrl')}
              dica="Custo de cada geração do Gemini é descontado daqui." />
            <Campo rotulo="Anthropic / Claude (US$)" type="number" step="0.01" value={c.saldoClaudeUsd} onChange={num('saldoClaudeUsd')}
              dica="Em dólares: o custo de cada geração do Claude é descontado daqui." />
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="text-slate-500">Total estimado em reais</div>
              <div className="text-xl font-semibold">{reais(c.saldoGeminiBrl + c.saldoClaudeUsd * c.cambioUsdBrl)}</div>
              <div className="text-xs text-slate-500">Claude convertido pelo câmbio de {reais(c.cambioUsdBrl)} por dólar.</div>
            </div>
            <Campo rotulo="Avisar abaixo de (R$, total)" type="number" step="0.01" min="0" value={c.alertaSaldoProvedorBrl} onChange={num('alertaSaldoProvedorBrl')} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Os provedores não informam o saldo ao sistema: confira no site de cada um (Google AI Studio / Cloud Billing e Claude
            Platform → Billing) e atualize aqui ao recarregar. Entre uma conferência e outra, o sistema desconta o custo real de cada
            pré-laudo e de cada padronização de texto.
            {c.saldosConferidosEm && <> Última conferência: {new Date(c.saldosConferidosEm).toLocaleString('pt-BR')}.</>}
          </p>
        </Cartao>

        <Cartao titulo="Preços dos modelos (US$ por milhão de tokens)"
          acoes={<Botao type="button" variante="secundario" onClick={() => setC({ ...c, precos: [...c.precos, { modelo: '', entradaUsdPorMilhao: 0, saidaUsdPorMilhao: 0 }] })}>+ Modelo</Botao>}>
          <p className="mb-3 text-sm text-slate-500">Os provedores mudam os preços: confira na página de preços da Anthropic e do Google. O nome precisa ser igual ao do .env (CLAUDE_MODELO / GEMINI_MODELO).</p>
          <div className="space-y-2">
            {c.precos.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_6rem] gap-2">
                <input aria-label="Modelo" value={p.modelo} onChange={(e) => mudarPreco(i, { modelo: e.target.value })}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 font-mono text-sm" />
                <input aria-label="Entrada" type="number" step="0.01" value={p.entradaUsdPorMilhao}
                  onChange={(e) => mudarPreco(i, { entradaUsdPorMilhao: Number(e.target.value) })} className="min-h-11 rounded-lg border border-slate-300 px-2" />
                <input aria-label="Saída" type="number" step="0.01" value={p.saidaUsdPorMilhao}
                  onChange={(e) => mudarPreco(i, { saidaUsdPorMilhao: Number(e.target.value) })} className="min-h-11 rounded-lg border border-slate-300 px-2" />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 text-xs text-slate-500"><span>modelo</span><span>entrada</span><span>saída</span></div>
          </div>
        </Cartao>

        <Botao type="submit">Salvar</Botao>
      </form>
    </>
  );
}

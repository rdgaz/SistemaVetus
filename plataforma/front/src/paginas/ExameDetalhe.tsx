import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { dataBR, nomeSexo, SeloStatus, type StatusExame } from '../exames';
import { useSessao } from '../sessao';
import { Aviso, AvisoIa, Botao, Campo, Cartao, Selecao } from '../ui';
import { AlertaUrgente, corSituacao, nomeSituacao, pranchaInicial, Revisao, type ConteudoLaudo, type ControleRevisao } from './Revisao';
import { CamadaAnotacao, EditorAnotacao, SeloAnotacao, type ItemAnotacao, type MapaAnotacoes } from './EditorAnotacao';
import { Compartilhar } from './Compartilhar';
import { EnviarMentor } from './EnviarMentor';
import { reais } from '../dinheiro';

type Arquivo = { nome: string; url: string };
type Medida = { grupo: string; nome: string; valor: number; unidade: string };

type Detalhe = {
  id: string;
  status: StatusExame;
  urgente: boolean;
  tipo: string | null;
  data: string | null;
  hora: string | null;
  clinicaId: string;
  idAnimal: string | null;
  especieAparelho: string | null;
  idade: string | null;
  peso: string | null;
  operador: string | null;
  equipamento: string | null;
  enfileiradoEm: string | null;
  tipoExame: string | null;
  suspeitaClinica: string | null;
  historico: string | null;
  jejum: boolean | null;
  solicitanteNome: string | null;
  solicitanteCrmv: string | null;
  solicitanteClinica: string | null;
  informacoesAdicionais: string | null;
  informacoesObrigatorias: boolean;
  verificacaoOnline: boolean;
  tiposExame: { codigo: string; nome: string }[];
  paciente: { nome: string; especie: string | null; raca: string | null; sexo: string | null; castrado: boolean | null };
  tutor: { nome: string; telefone: string | null; email: string | null } | null;
  fotos: Arquivo[];
  pdfs: Arquivo[];
  videos: Arquivo[];
  medidas: Medida[] | null;
  pesoKg: number | null;
  referencias: { id: string; orgao: string; medida: string; faixa: string; observacao: string | null; fonte: string }[];
  medidasComparadas: {
    grupo: string; nome: string; valor: number; unidade: string;
    referencia: string | null; faixaTexto: string | null; situacao: 'dentro' | 'acima' | 'abaixo' | 'sem_referencia';
  }[];
  anotacoes?: MapaAnotacoes;
  erroGeracao: string | null;
  iaAtiva: boolean;
  laudo: Laudo | null;
  /** revisão do mentor pendente: o laudo fica parado (a não ser que seja só para ensino) */
  revisaoMentor: { id: string; mentor: string; enviadaEm: string; iniciadaEm: string | null; paraEnsino: boolean } | null;
  mascaras: Record<string, string>;
};

type Laudo = {
  versao: number;
  cobradoBrl: number;
  modo: 'completa' | 'dados' | 'imagens' | 'retificacao';
  assinadoPorNome: string | null;
  assinadoCrmv: string | null;
  assinadoEm: string | null;
  codigoVerificacao: string | null;
  retificado: boolean;
  motivoRetificacao: string | null;
  revisado: boolean;
  ia: string;
  modelo: string;
  geradoEm: string;
  duracaoMs: number;
  conteudo: ConteudoLaudo;
  imagensEnviadas: string[];
};

/** Valores do formulário (tudo texto; '' = vazio). */
type Form = {
  nome: string; especie: string; raca: string; sexo: string; castrado: string;
  tutorNome: string; tutorTelefone: string; tutorEmail: string;
  idade: string; peso: string; tipoExame: string; suspeitaClinica: string; historico: string; jejum: string;
  solicitanteNome: string; solicitanteCrmv: string; solicitanteClinica: string; informacoesAdicionais: string;
};

const simNao = (b: boolean | null) => (b === null ? '' : b ? 'sim' : 'nao');

function paraForm(d: Detalhe): Form {
  return {
    nome: d.paciente.nome, especie: d.paciente.especie ?? '', raca: d.paciente.raca ?? '', sexo: d.paciente.sexo ?? '',
    castrado: simNao(d.paciente.castrado),
    tutorNome: d.tutor?.nome ?? '', tutorTelefone: d.tutor?.telefone ?? '', tutorEmail: d.tutor?.email ?? '',
    idade: d.idade ?? '', peso: d.peso ?? '', tipoExame: d.tipoExame ?? '', suspeitaClinica: d.suspeitaClinica ?? '',
    historico: d.historico ?? '', jejum: simNao(d.jejum), solicitanteNome: d.solicitanteNome ?? '',
    solicitanteCrmv: d.solicitanteCrmv ?? '', solicitanteClinica: d.solicitanteClinica ?? '',
    informacoesAdicionais: d.informacoesAdicionais ?? '',
  };
}

function paraApi(f: Form) {
  return {
    paciente: {
      nome: f.nome, especie: f.especie, raca: f.raca, sexo: f.sexo,
      castrado: f.castrado === '' ? null : f.castrado === 'sim',
    },
    tutor: { nome: f.tutorNome, telefone: f.tutorTelefone, email: f.tutorEmail },
    idade: f.idade, peso: f.peso, tipoExame: f.tipoExame, suspeitaClinica: f.suspeitaClinica, historico: f.historico,
    jejum: f.jejum === '' ? null : f.jejum === 'sim', limparJejum: f.jejum === '',
    solicitanteNome: f.solicitanteNome, solicitanteCrmv: f.solicitanteCrmv, solicitanteClinica: f.solicitanteClinica,
    informacoesAdicionais: f.informacoesAdicionais,
  };
}

/** Tela do exame: dados do paciente, informações para a IA e "Gerar pré-laudo". */
export function ExameDetalhe() {
  const { id } = useParams();
  const { clinica } = useSessao();
  const [d, setD] = useState<Detalhe | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  // revisão em andamento: a barra de baixo salva e assina por ela
  const [revisaoCtl, setRevisaoCtl] = useState<ControleRevisao | null>(null);
  const [pedindoAnalise, setPedindoAnalise] = useState(false);
  // custo médio da clínica, mostrado nas opções de nova análise
  const [custos, setCustos] = useState<{ mediaPorLaudo: number; mediaAtualizacao: number | null } | null>(null);
  useEffect(() => {
    if (pedindoAnalise && !custos) api<{ mediaPorLaudo: number; mediaAtualizacao: number | null }>('GET', '/api/clinica/saldo').then(setCustos).catch(() => undefined);
  }, [pedindoAnalise, custos]);
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  // galeria só com as imagens do alerta de achado urgente
  const [galeria, setGaleria] = useState<{ fotos: Arquivo[]; indice: number } | null>(null);
  const [anotando, setAnotando] = useState<{ foto: Arquivo; orgao?: string } | null>(null);
  const navegar = useNavigate();
  const [excluindo, setExcluindo] = useState(false);
  const excluir = async () => {
    if (!d || excluindo) return;
    if (!confirm(`Excluir o exame de ${d.paciente.nome} por completo?\n\nApaga pré-laudos, laudos e os arquivos enviados pelo pendrive. Não tem volta.`)) return;
    setErro('');
    setExcluindo(true);
    try {
      await api('DELETE', `/api/exames/${d.id}`);
      navegar('/', { replace: true });
    } catch (x) {
      setErro((x as Error).message);
      setExcluindo(false);
    }
  };
  const [grade, setGrade] = useState(false);

  const carregar = async () => {
    const det = await api<Detalhe>('GET', `/api/exames/${id}`);
    setD(det);
    setF(paraForm(det));
    // sem os dados mínimos para gerar, já abre o formulário
    if (!det.paciente.especie || !det.tipoExame) setEditando(true);
  };

  useEffect(() => {
    carregar().catch((x) => setErro(x.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, clinica]);

  // enquanto a IA trabalha, atualiza sozinho (sem perder o que está sendo digitado)
  const aguardandoIa = d?.status === 'NaFila' || d?.status === 'Gerando';
  useEffect(() => {
    if (!aguardandoIa) return;
    const t = setInterval(async () => {
      try {
        const det = await api<Detalhe>('GET', `/api/exames/${id}`);
        if (det.status !== 'NaFila' && det.status !== 'Gerando') {
          setD(det);
          setF(paraForm(det));
        } else {
          setD((atual) => (atual ? { ...atual, status: det.status } : det));
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 4000);
    return () => clearInterval(t);
  }, [aguardandoIa, id]);

  const inicial = useMemo(() => (d ? JSON.stringify(paraForm(d)) : ''), [d]);
  const alterado = !!f && !!d && JSON.stringify(f) !== inicial;

  // fechar a aba ou recarregar com alterações não salvas: o navegador pede confirmação
  useEffect(() => {
    if (!alterado) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [alterado]);

  if (!d || !f) return erro ? <Aviso>{erro}</Aviso> : <p className="text-slate-500">Carregando…</p>;
  const sairSemSalvar = (ev: { preventDefault: () => void }) => {
    if (alterado && !confirm('Há alterações não salvas. Sair mesmo assim?')) ev.preventDefault();
  };
  // fotos que a IA analisou no pré-laudo atual (ícone ✦ nas miniaturas)
  const analisadas = new Set<string>(d.laudo?.imagensEnviadas ?? []);
  const comMentor = !!d.revisaoMentor && !d.revisaoMentor.paraEnsino;
  const somenteLeitura = d.status === 'Pronto' || d.status === 'Gerando' || comMentor;
  const mudar = (k: keyof Form) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });

  const faltaParaGerar = [!f.especie && 'espécie', !f.tipoExame && 'tipo de exame',
    d.informacoesObrigatorias && !f.informacoesAdicionais.trim() && '"Informações adicionais"'].filter(Boolean) as string[];
  const recomendados = [
    !f.sexo && 'sexo', !f.castrado && 'castrado', !f.idade && 'idade', !f.peso && 'peso', !f.raca && 'raça',
    !f.tutorNome && 'responsável', !f.suspeitaClinica && 'suspeita clínica', !f.solicitanteNome && 'solicitante',
    !f.jejum && 'jejum',
  ].filter(Boolean) as string[];

  const executar = async (acao: () => Promise<unknown>, mensagem: string) => {
    setErro('');
    setAviso('');
    setSalvando(true);
    try {
      const r = await acao();
      await carregar();
      setAviso(typeof r === 'string' ? r : mensagem);
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const salvar = () => executar(() => api('PUT', `/api/exames/${d.id}`, paraApi(f)), 'Dados salvos.');
  const gerar = (completa = false) => {
    if (completa && !confirm('Refazer a análise completa? A IA vai olhar todas as fotos de novo (custo de um pré-laudo novo).')) return;
    return executar(async () => {
      const r = await api<{ modo: string; mudancas: string[]; imagensNovas: number }>(
        'POST', `/api/exames/${d.id}/gerar`, { ...paraApi(f), completa });
      if (r.modo === 'dados') return `Atualizando o pré-laudo só com o que mudou (${r.mudancas.length} item(ns)), sem reenviar as fotos.`;
      if (r.modo === 'imagens') return `Atualizando o pré-laudo com ${r.imagensNovas} foto(s) nova(s); as já analisadas não são reenviadas.`;
      return 'Exame colocado na fila: a IA vai analisar as fotos.';
    }, '');
  };
  const alternarUrgente = () =>
    executar(() => api('PUT', `/api/exames/${d.id}`, { urgente: !d.urgente }), d.urgente ? 'Urgência removida.' : 'Marcado como urgente: passa na frente na fila.');

  const textoGerar = d.laudo ? 'Atualizar pré-laudo' : d.status === 'Erro' ? 'Gerar de novo' : 'Gerar pré-laudo';
  // em revisão: um "Salvar" para tudo (dados do exame + texto do laudo) e "Aprovar e assinar" na barra
  const emRevisao = d.status === 'AguardandoRevisao' && !!d.laudo && !!revisaoCtl && !comMentor;
  const algoAlterado = alterado || !!revisaoCtl?.alterado;
  const salvarTudo = () => executar(async () => {
    if (alterado) await api('PUT', `/api/exames/${d.id}`, paraApi(f));
    if (revisaoCtl?.alterado) await revisaoCtl.salvar();
  }, 'Alterações salvas.');
  const assinarTudo = async () => {
    if (!revisaoCtl) return;
    if (alterado) {
      try { await api('PUT', `/api/exames/${d.id}`, paraApi(f)); } catch (x) { setErro((x as Error).message); return; }
    }
    await revisaoCtl.assinar(); // pergunta se conferiu, salva o texto pendente e assina
  };
  const novaAnalise = async (completa: boolean) => {
    if (revisaoCtl?.alterado) {
      try { await revisaoCtl.salvar(); } catch (x) { setErro((x as Error).message); return; }
    }
    setPedindoAnalise(false);
    await gerar(completa);
  };
  const podeGerar = d.status !== 'NaFila' && !somenteLeitura;
  const perfilExclui = clinica?.perfil === 'Veterinario' || clinica?.perfil === 'AdministradorClinica';
  const podeAnotar = !somenteLeitura && perfilExclui;
  const anotacoes = d.anotacoes ?? {};
  const abrirEditorAnotacao = (nomeFoto: string, orgao?: string) => {
    const arqFoto = d.fotos.find((x) => x.nome === nomeFoto);
    if (arqFoto) setAnotando({ foto: arqFoto, orgao });
  };
  const aoSalvarAnotacao = async (nomeFoto: string, itens: ItemAnotacao[], inserirNoOrgao?: { orgao: string; trecho: string }) => {
    setD((atual) => (atual ? { ...atual, anotacoes: { ...(atual.anotacoes ?? {}), [nomeFoto]: itens } } : atual));
    if (inserirNoOrgao && revisaoCtl) revisaoCtl.inserirTrechoOrgao(inserirNoOrgao.orgao, inserirNoOrgao.trecho);
    // órgão escolhido no editor diferente do órgão em que a foto está no laudo: pergunta se move (decisão do usuário: perguntar sempre)
    const escolhido = [...itens].reverse().find((it) => it.tipo !== 'quadro' && it.orgao)?.orgao;
    if (escolhido && revisaoCtl && revisaoCtl.orgaosNomes.includes(escolhido)) {
      const atuais = revisaoCtl.orgaosDaFoto(nomeFoto);
      if (!atuais.includes(escolhido)) {
        const onde = atuais.length ? `está em ${atuais.join(', ')}` : 'não está em nenhum órgão';
        if (confirm(`No laudo, esta foto ${onde}. Mover esta foto para ${escolhido}?`)) {
          if (revisaoCtl.moverFotoParaOrgao(nomeFoto, escolhido)) setAviso(`Foto movida para ${escolhido}. Toque em Salvar para guardar no laudo.`);
          else setAviso('Esta foto não foi analisada pela IA, então não aparece nas miniaturas dos órgãos; o órgão ficou só na anotação.');
        }
      }
    }
    // atualiza medidasComparadas em segundo plano sem apagar textos em edição na Revisao
    try {
      const novo = await api<Detalhe>('GET', `/api/exames/${d.id}`);
      setD((atual) => (atual ? { ...atual, anotacoes: novo.anotacoes, medidas: novo.medidas, medidasComparadas: novo.medidasComparadas } : novo));
    } catch { /* mantém a atualização local */ }
  };
  const podeExcluir = d.status !== 'Gerando' && (clinica?.perfil === 'AdministradorClinica' || (clinica?.perfil === 'Veterinario' && !d.laudo?.assinadoEm));

  return (
    <div className="space-y-4 pb-28 md:pb-0">
      {/* cabeçalho */}
      <div>
        <Link to="/" onClick={sairSemSalvar} className="text-sm text-[#0E4D64] underline">← Exames</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-2xl font-semibold text-slate-800">{d.paciente.nome}</h1>
          <SeloStatus status={d.status} />
          {d.status !== 'Pronto' && (
            <button onClick={alternarUrgente} disabled={salvando || excluindo}
              className={`rounded-full border px-3 py-0.5 text-xs font-bold ${d.urgente ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 text-slate-600'}`}>
              {d.urgente ? 'Urgente ✓' : 'Marcar urgente'}
            </button>
          )}
          {!somenteLeitura && (
            <button type="button" onClick={() => { setEditando(true); setTimeout(() => document.getElementById('dados-exame')?.scrollIntoView({ behavior: 'smooth' }), 50); }}
              className="rounded-full border border-slate-300 bg-white px-3 py-0.5 text-xs font-semibold text-[#0E4D64] hover:bg-slate-50">
              ✎ Editar dados
            </button>
          )}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          {[d.paciente.especie, d.tutor?.nome && `Responsável: ${d.tutor.nome}`, dataBR(d.data), `${d.fotos.length} foto(s)`].filter(Boolean).join(' · ')}
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {d.status === 'NaFila' && (
        <Aviso tipo="info">
          Na fila do pré-laudo{d.enfileiradoEm && ` desde ${new Date(d.enfileiradoEm).toLocaleString('pt-BR')}`}.{' '}
          {d.iaAtiva
            ? 'A IA vai começar em instantes; esta tela se atualiza sozinha.'
            : 'A IA não está configurada no servidor (chave do Claude ou do Gemini no .env); o exame fica aguardando.'}
        </Aviso>
      )}
      {d.status === 'Gerando' && (
        <Aviso tipo="info">⏳ A IA está analisando as imagens e escrevendo o pré-laudo. Leva de segundos a alguns minutos.</Aviso>
      )}
      {d.status === 'Erro' && (
        <Aviso>
          <b>Não foi possível gerar o pré-laudo.</b> {d.erroGeracao}
          <br />Confira os dados e toque em "Gerar de novo".
        </Aviso>
      )}

      {d.laudo && d.status === 'Pronto' && (
        <LaudoAssinado exameId={d.id} laudo={d.laudo} verificacao={d.verificacaoOnline} aoMudar={() => carregar()}
          compartilhar={<Compartilhar exameId={d.id} paciente={d.paciente.nome} tutor={d.tutor?.nome ?? null}
            telefone={d.tutor?.telefone ?? null} emailTutor={d.tutor?.email ?? null} clinica={clinica?.nome ?? ''} />} />
      )}
      {d.laudo && d.laudo.motivoRetificacao && d.status !== 'Pronto' && (
        <Aviso tipo="info">Retificação do laudo assinado. Motivo: {d.laudo.motivoRetificacao}</Aviso>
      )}
      {d.laudo && d.status === 'AguardandoRevisao' && d.medidasComparadas.some((m) => m.situacao === 'acima' || m.situacao === 'abaixo') && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950">
          <b className="mr-1.5">Medidas do aparelho fora da referência:</b>
          {d.medidasComparadas.filter((m) => m.situacao === 'acima' || m.situacao === 'abaixo').map((m, i) => (
            <span key={i} className="mr-3 inline-block">
              {m. situacao === 'acima' ? '▲' : '▼'} <b>{m.grupo ? `${m.grupo} > ` : ''}{m.nome}:</b> {m.valor} {m.unidade} (ref. {m.faixaTexto})
            </span>
          ))}
        </div>
      )}
      {d.laudo && (d.status === 'AguardandoRevisao' || d.status === 'Pronto') && perfilExclui && (
        <EnviarMentor exameId={d.id} assinado={d.status === 'Pronto'} podeEnviar={!d.laudo.retificado} aoMudar={() => carregar()} />
      )}
      {d.laudo && (d.status === 'AguardandoRevisao' && !comMentor ? (
        <Revisao exameId={d.id} conteudoInicial={d.laudo.conteudo} imagensEnviadas={d.laudo.imagensEnviadas}
          fotos={d.fotos} mascaras={d.mascaras} anotacoes={anotacoes} aoMudar={() => carregar()} registrar={setRevisaoCtl}
          aoAbrirFoto={(nome) => setFotoAberta(d.fotos.findIndex((x) => x.nome === nome))}
          aoAbrirGaleria={(lista, indice) => setGaleria({ fotos: lista, indice })}
          aoAnotarFoto={podeAnotar ? abrirEditorAnotacao : undefined}
          dados={{ clinicaId: d.clinicaId, paciente: d.paciente, tutor: d.tutor?.nome ?? null, idade: d.idade, peso: d.peso, data: d.data, hora: d.hora,
            solicitanteNome: d.solicitanteNome, solicitanteCrmv: d.solicitanteCrmv, solicitanteClinica: d.solicitanteClinica,
            suspeitaClinica: d.suspeitaClinica, equipamento: d.equipamento, idAnimal: d.idAnimal }} />
      ) : (
        <PreLaudo laudo={d.laudo} fotos={d.fotos} anotacoes={anotacoes} aoAbrirFoto={(nome) => setFotoAberta(d.fotos.findIndex((x) => x.nome === nome))}
          aoAbrirGaleria={(lista, indice) => setGaleria({ fotos: lista, indice })} />
      ))}

      {/* fotos */}
      <Cartao titulo={`Fotos (${d.fotos.length})`}
        acoes={d.fotos.length > 4 && (
          <button className="text-sm font-medium text-[#0E4D64] underline" onClick={() => setGrade(!grade)}>
            {grade ? 'Ver em faixa' : 'Ver todas'}
          </button>
        )}>
        {analisadas.size > 0 && d.fotos.length > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            <span className="mr-1 inline-flex size-4 items-center justify-center rounded-full bg-[#0E4D64] text-[10px] text-white">✦</span>
            analisada pela IA ({d.fotos.filter((f) => analisadas.has(f.nome)).length} de {d.fotos.length})
          </p>
        )}
        {d.fotos.length === 0 ? <p className="text-slate-500">Nenhuma foto.</p> : grade ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {d.fotos.map((foto, i) => <Miniatura key={foto.nome} foto={foto} analisada={analisadas.has(foto.nome)} anotada={anotacoes[foto.nome]} onClick={() => setFotoAberta(i)} />)}
          </div>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {d.fotos.map((foto, i) => (
              <div key={foto.nome} className="w-32 shrink-0 sm:w-40"><Miniatura foto={foto} analisada={analisadas.has(foto.nome)} anotada={anotacoes[foto.nome]} onClick={() => setFotoAberta(i)} /></div>
            ))}
          </div>
        )}
      </Cartao>

      {/* dados do paciente e do exame */}
      <div id="dados-exame" />
      <Cartao titulo="Dados do paciente e do exame"
        acoes={!somenteLeitura && (
          <button className="text-sm font-medium text-[#0E4D64] underline" onClick={() => setEditando(!editando)}>
            {editando ? 'Fechar' : '✎ Editar'}
          </button>
        )}>
        {faltaParaGerar.length > 0 && !somenteLeitura && (
          <div className="mb-3"><Aviso>Para gerar o pré-laudo, informe: <b>{faltaParaGerar.join(' e ')}</b>.</Aviso></div>
        )}
        {editando && !somenteLeitura ? (
          <FormularioDados f={f} d={d} mudar={mudar} />
        ) : (
          <Resumo f={f} d={d} />
        )}
        {recomendados.length > 0 && !somenteLeitura && (
          <p className="mt-3 text-sm text-amber-800">
            ⚠ Falta (recomendado): {recomendados.join(', ')}.{' '}
            {f.informacoesAdicionais.trim()
              ? 'O que estiver escrito em "Informações adicionais" é organizado pela IA nesses campos quando o pré-laudo for gerado.'
              : 'Preencha em ✎ Editar, ou escreva no campo "Informações adicionais" que a IA organiza ao gerar o pré-laudo.'}
          </p>
        )}
      </Cartao>

      {/* campo livre para a IA */}
      <Cartao titulo={d.informacoesObrigatorias ? "Informações adicionais (obrigatório)" : "Informações adicionais"}>
        <textarea
          value={f.informacoesAdicionais}
          onChange={mudar('informacoesAdicionais')}
          disabled={somenteLeitura}
          rows={5}
          maxLength={8000}
          placeholder="Escreva ou dite o que souber: suspeita, histórico, o que o responsável relatou, se estava em jejum, observações do exame…"
          className="w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-[#0E4D64] focus:ring-2 focus:ring-[#0E4D64]/20 disabled:bg-slate-100"
        />
        <p className="mt-1 text-xs text-slate-500">
          {d.informacoesObrigatorias ? "Obrigatório nesta clínica para gerar o pré-laudo. " : "Opcional. "}A IA organiza essas informações nos campos e as considera na análise das imagens.
          No celular, use o microfone 🎤 do teclado para ditar.
        </p>
      </Cartao>

      {d.videos.length > 0 && (
        <Cartao titulo={`Vídeos do aparelho (${d.videos.length})`}>
          <div className="space-y-3">
            {d.videos.map((v) => (
              <div key={v.nome}>
                <video controls preload="none" className="w-full max-w-xl rounded-lg bg-black" src={v.url} />
                <div className="text-xs text-slate-500">{v.nome}</div>
              </div>
            ))}
          </div>
        </Cartao>
      )}

      {d.pdfs.length > 0 && (
        <Cartao titulo="Relatórios do aparelho (PDF)">
          <ul className="space-y-1">
            {d.pdfs.map((p) => (
              <li key={p.nome}><a className="text-[#0E4D64] underline" href={p.url} target="_blank" rel="noreferrer">{p.nome}</a></li>
            ))}
          </ul>
        </Cartao>
      )}

      {d.medidasComparadas.length > 0 && (
        <Cartao titulo="Medidas do aparelho × referência">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500">
                <th className="py-1 pr-3">Medida</th><th className="py-1 pr-3">Valor</th><th className="py-1 pr-3">Referência</th><th className="py-1">Situação</th>
              </tr></thead>
              <tbody>
                {d.medidasComparadas.map((m, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${m.situacao === 'acima' || m.situacao === 'abaixo' ? 'bg-amber-50' : ''}`}>
                    <td className="py-1 pr-3">{m.grupo}{m.grupo && ' > '}{m.nome}</td>
                    <td className="py-1 pr-3 font-medium">{m.valor} {m.unidade}</td>
                    <td className="py-1 pr-3 text-slate-600">{m.faixaTexto ?? '—'}</td>
                    <td className="py-1"><SeloReferencia situacao={m.situacao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {d.referencias.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-slate-800">
            Valores de referência ({d.paciente.especie}{d.pesoKg ? `, ${String(d.pesoKg).replace('.', ',')} kg` : ', peso não informado'})
          </summary>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {d.referencias.map((r) => (
                <tr key={r.id} className="border-t border-slate-100" title={r.fonte}>
                  <td className="py-1 pr-3 text-slate-500">{r.orgao}</td>
                  <td className="py-1 pr-3">{r.medida}{r.observacao && <span className="block text-xs text-slate-500">{r.observacao}</span>}</td>
                  <td className="py-1 font-medium">{r.faixa}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Passe o mouse sobre uma linha para ver a fonte. Valores iniciais: confirme com a literatura adotada pela clínica.</p>
        </details>
      )}

      {/* ações: barra fixa embaixo no celular */}
      {!somenteLeitura && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
          {(emRevisao ? algoAlterado : alterado) && (
            <p className="mx-auto mb-2 max-w-6xl text-center text-sm font-medium text-amber-800 md:text-right">
              ● Alterações não salvas
            </p>
          )}
          {emRevisao ? (
            <>
              <div className="mx-auto flex max-w-6xl gap-2 md:justify-end">
                <Botao variante="secundario" className="flex-1 md:flex-none" disabled={!algoAlterado || salvando || revisaoCtl.ocupado} onClick={salvarTudo}>
                  Salvar
                </Botao>
                <Botao className="flex-[2] md:flex-none" disabled={salvando || revisaoCtl.ocupado || !revisaoCtl.podeAssinar} onClick={assinarTudo}>
                  {salvando || revisaoCtl.ocupado ? 'Aguarde…' : 'Aprovar e assinar'}
                </Botao>
              </div>
              {revisaoCtl.motivoNaoAssina && (
                <p className="mx-auto mt-1 max-w-6xl text-center text-xs text-amber-800 md:text-right">{revisaoCtl.motivoNaoAssina}</p>
              )}
              <p className="mx-auto mt-2 max-w-6xl text-center text-xs md:text-right">
                <button type="button" className="font-medium text-[#0E4D64] underline" disabled={salvando} onClick={() => setPedindoAnalise(!pedindoAnalise)}>
                  Pedir nova análise à IA (usa o saldo)
                </button>
              </p>
              {pedindoAnalise && (
                <div className="mx-auto mt-2 grid max-w-6xl gap-2 sm:grid-cols-2">
                  <button type="button" disabled={salvando || faltaParaGerar.length > 0} onClick={() => novaAnalise(false)}
                    className="rounded-lg border border-slate-300 bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-50">
                    <span className="block text-sm font-semibold text-slate-800">Atualizar com o que mudou</span>
                    <span className="block text-xs text-slate-500">A IA ajusta o texto com os dados que mudaram, sem olhar as fotos de novo (só as fotos novas, se houver). Mantém as suas edições.</span>
                    <span className="mt-1 block text-xs font-semibold text-emerald-800">Mais barato{custos?.mediaAtualizacao ? ` · ≈ ${reais(custos.mediaAtualizacao)}` : ''}</span>
                  </button>
                  <button type="button" disabled={salvando || faltaParaGerar.length > 0} onClick={() => novaAnalise(true)}
                    className="rounded-lg border border-slate-300 bg-white p-3 text-left hover:bg-slate-50 disabled:opacity-50">
                    <span className="block text-sm font-semibold text-slate-800">Refazer análise completa</span>
                    <span className="block text-xs text-slate-500">A IA olha todas as fotos de novo e escreve o pré-laudo outra vez.</span>
                    <span className="mt-1 block text-xs font-semibold text-amber-800">Custo de um pré-laudo{custos?.mediaPorLaudo ? ` · ≈ ${reais(custos.mediaPorLaudo)}` : ''}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
          <>
          <div className="mx-auto flex max-w-6xl gap-2 md:justify-end">
            <Botao variante="secundario" className="flex-1 md:flex-none" disabled={!alterado || salvando} onClick={salvar}>
              Salvar
            </Botao>
            <Botao className="flex-[2] md:flex-none" disabled={!podeGerar || salvando || faltaParaGerar.length > 0} onClick={() => gerar()}
              title={faltaParaGerar.length ? `Informe: ${faltaParaGerar.join(' e ')}` : undefined}>
              {d.status === 'NaFila' ? 'Na fila…' : salvando ? 'Aguarde…' : textoGerar}
            </Botao>
          </div>
          {d.laudo && podeGerar && (
            <p className="mx-auto mt-2 max-w-6xl text-center text-xs text-slate-500 md:text-right">
              "Atualizar" usa o pré-laudo atual e só o que mudou (sem reenviar fotos já analisadas).{' '}
              <button className="font-medium text-[#0E4D64] underline" disabled={salvando} onClick={() => gerar(true)}>
                Refazer análise completa
              </button>
            </p>
          )}
          </>
          )}
        </div>
      )}

      {/* excluir o exame por completo: fica apenas no final da página do exame */}
      {perfilExclui && d.status !== 'Gerando' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white p-4">
          <div className="min-w-0 flex-1 text-xs text-slate-600">
            <span className="font-semibold text-red-700">Excluir este exame: </span>
            apaga o exame, laudos e arquivos enviados (os aprendizados da IA são preservados).
            {d.laudo?.assinadoEm && !podeExcluir && ' Este exame possui laudo assinado (só o administrador da clínica pode excluí-lo).'}
          </div>
          {podeExcluir && (
            <Botao variante="perigo" disabled={excluindo || salvando} onClick={excluir}>
              {excluindo ? 'Excluindo…' : 'Excluir exame'}
            </Botao>
          )}
        </div>
      )}

      {galeria && (
        <Visualizador fotos={galeria.fotos} indice={galeria.indice} anotacoes={anotacoes}
          aoAnotar={podeAnotar ? (nome) => abrirEditorAnotacao(nome) : undefined}
          aoMudar={(i) => setGaleria({ ...galeria, indice: i })} aoFechar={() => setGaleria(null)} />
      )}
      {fotoAberta !== null && d.fotos[fotoAberta] && (
        <Visualizador fotos={d.fotos} indice={fotoAberta} anotacoes={anotacoes}
          aoAnotar={podeAnotar ? (nome) => abrirEditorAnotacao(nome) : undefined}
          aoMudar={setFotoAberta} aoFechar={() => setFotoAberta(null)} />
      )}
      {anotando && (
        <EditorAnotacao
          exameId={d.id}
          foto={anotando.foto}
          itensIniciais={anotacoes[anotando.foto.nome] ?? []}
          orgaoSugerido={anotando.orgao}
          orgaosDisponiveis={revisaoCtl?.orgaosNomes ?? d.laudo?.conteudo.orgaos.map((o) => o.orgao) ?? []}
          equipamento={d.equipamento}
          aoSalvar={aoSalvarAnotacao}
          aoFechar={() => setAnotando(null)}
        />
      )}
    </div>
  );
}

const nomeIa: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', simulado: 'IA simulada', retificacao: 'retificação' };

/** Laudo assinado: quem assinou, código de verificação, PDF e retificação. */
function LaudoAssinado({ exameId, laudo, verificacao, aoMudar, compartilhar }: {
  exameId: string; laudo: Laudo; verificacao: boolean; aoMudar: () => Promise<void>; compartilhar: ReactNode;
}) {
  const { clinica } = useSessao();
  const [erro, setErro] = useState('');
  const podeRetificar = clinica?.perfil === 'Veterinario' || clinica?.perfil === 'AdministradorClinica';
  const retificar = async () => {
    const motivo = prompt('Motivo da retificação (fica registrado no laudo):');
    if (!motivo?.trim()) return;
    setErro('');
    try {
      await api('POST', `/api/exames/${exameId}/laudo/retificar`, { motivo });
      await aoMudar();
    } catch (x) {
      setErro((x as Error).message);
    }
  };
  return (
    <Cartao titulo="Laudo assinado">
      <div className="space-y-3">
        {erro && <Aviso>{erro}</Aviso>}
        <p className="text-sm">
          Assinado por <b>{laudo.assinadoPorNome}</b> ({laudo.assinadoCrmv}) em{' '}
          {laudo.assinadoEm && new Date(laudo.assinadoEm).toLocaleString('pt-BR')} · versão {laudo.versao}
        </p>
        {verificacao && <p className="text-sm">
          Código de verificação: <span className="font-mono font-semibold">{laudo.codigoVerificacao}</span>{' '}
          <a className="text-[#0E4D64] underline" href={`/verificar/${laudo.codigoVerificacao}`} target="_blank" rel="noreferrer">verificar</a>
        </p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <a href={`/api/exames/${exameId}/laudo.pdf`} target="_blank" rel="noreferrer"
            title="Abre o PDF do laudo assinado em uma nova aba para visualizar ou imprimir"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0E4D64] px-6 text-base font-semibold text-white shadow-sm transition hover:bg-[#0B3D50]">
            <span>📄</span>
            <span>Visualizar Laudo em PDF</span>
          </a>
          {podeRetificar && (
            <Botao variante="secundario" onClick={retificar} title="Cria uma nova versão do laudo para corrigir alguma informação">
              Retificar
            </Botao>
          )}
        </div>
        {compartilhar}
      </div>
    </Cartao>
  );
}

/** Pré-laudo / laudo em modo leitura. */
function PreLaudo({ laudo, fotos, anotacoes, aoAbrirFoto, aoAbrirGaleria }: { laudo: Laudo; fotos: Arquivo[]; anotacoes?: MapaAnotacoes; aoAbrirFoto: (nome: string) => void; aoAbrirGaleria: (lista: Arquivo[], indice: number) => void }) {
  const c = laudo.conteudo;
  const prancha = pranchaInicial(c, laudo.imagensEnviadas)
    .map((nome) => fotos.find((f) => f.nome === nome))
    .filter((f): f is Arquivo => !!f);

  return (
    <Cartao titulo="Pré-laudo">
      <div className="space-y-4">
        <AvisoIa />
        <p className="text-xs text-slate-500">
          Gerado por {nomeIa[laudo.ia] ?? laudo.ia} ({laudo.modelo}) em {new Date(laudo.geradoEm).toLocaleString('pt-BR')}
          {laudo.duracaoMs > 0 && ` · ${(laudo.duracaoMs / 1000).toFixed(0)} s`} · versão {laudo.versao}
          {laudo.modo === 'dados' && ' · atualização sem reenviar as fotos'}
          {laudo.modo === 'imagens' && ' · atualização com as fotos novas'}
          {laudo.cobradoBrl > 0 && ` · cobrado ${reais(laudo.cobradoBrl)}`}.
          Rascunho: precisa da revisão e assinatura do veterinário.
        </p>

        <AlertaUrgente conteudo={c} imagensEnviadas={laudo.imagensEnviadas} fotos={fotos} aoAbrirGaleria={aoAbrirGaleria} />

        {c.condicoesTecnicas && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Condições técnicas</h3>
            <p className="text-sm">{c.condicoesTecnicas}</p>
          </div>
        )}

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {c.orgaos.map((o) => (
            <div key={o.orgao} className="p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.orgao}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corSituacao[o.situacao] ?? ''}`}>
                  {nomeSituacao[o.situacao] ?? o.situacao}
                </span>
              </div>
              <p className="text-sm text-slate-700">{o.descricao}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700">Impressão diagnóstica</h3>
          <p className="text-sm">{c.impressaoDiagnostica}</p>
        </div>
        {c.diferenciais?.length > 0 && c.exibirDiferenciais !== false && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Diagnósticos diferenciais</h3>
            <ul className="list-disc pl-5 text-sm">{c.diferenciais.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        {c.recomendacoes?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Recomendações</h3>
            <ul className="list-disc pl-5 text-sm">{c.recomendacoes.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        {prancha.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Prancha sugerida ({prancha.length} fotos)</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {prancha.map((f) => <Miniatura key={f.nome} foto={f} anotada={anotacoes?.[f.nome]} onClick={() => aoAbrirFoto(f.nome)} />)}
            </div>
          </div>
        )}
      </div>
    </Cartao>
  );
}

function SeloReferencia({ situacao }: { situacao: 'dentro' | 'acima' | 'abaixo' | 'sem_referencia' }) {
  const s = {
    dentro: ['bg-green-100 text-green-900', 'Dentro'],
    acima: ['bg-amber-500 text-white', '▲ Acima'],
    abaixo: ['bg-amber-500 text-white', '▼ Abaixo'],
    sem_referencia: ['bg-slate-100 text-slate-500', 'Sem referência'],
  }[situacao];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s[0]}`}>{s[1]}</span>;
}

function Miniatura({ foto, onClick, analisada, anotada }: { foto: Arquivo; onClick: () => void; analisada?: boolean; anotada?: ItemAnotacao[] }) {
  return (
    <button onClick={onClick} className="relative block w-full overflow-hidden rounded-lg bg-black">
      <img src={foto.url} alt={foto.nome} loading="lazy" className="aspect-[4/3] w-full object-contain" />
      <SeloAnotacao itens={anotada} />
      {analisada && (
        <span title="Imagem analisada pela IA" aria-label="Imagem analisada pela IA"
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-[#0E4D64] text-xs text-white shadow ring-2 ring-white">
          ✦
        </span>
      )}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function FormularioDados({ f, d, mudar }: {
  f: Form; d: Detalhe; mudar: (k: keyof Form) => (ev: { target: { value: string } }) => void;
}) {
  const areaTexto = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white p-3 text-base outline-none focus:border-[#0E4D64]';
  return (
    <div className="space-y-5">
      <Grupo titulo="Paciente">
        <Campo rotulo="Nome *" value={f.nome} onChange={mudar('nome')} />
        <div>
          <Campo rotulo="Espécie *" list="especies" value={f.especie} onChange={mudar('especie')}
            dica={d.especieAparelho && d.especieAparelho !== f.especie ? `No aparelho: ${d.especieAparelho}` : undefined} />
          <datalist id="especies"><option value="Canina" /><option value="Felina" /></datalist>
        </div>
        <Campo rotulo="Raça" value={f.raca} onChange={mudar('raca')} />
        <Selecao rotulo="Sexo" value={f.sexo} onChange={mudar('sexo')}>
          <option value="">Não informado</option><option value="M">Macho</option><option value="F">Fêmea</option><option value="O">Outro</option>
        </Selecao>
        <Selecao rotulo="Castrado" value={f.castrado} onChange={mudar('castrado')}>
          <option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option>
        </Selecao>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Idade" value={f.idade} onChange={mudar('idade')} placeholder="ex.: 9 anos" />
          <Campo rotulo="Peso" value={f.peso} onChange={mudar('peso')} placeholder="ex.: 12,5 kg" />
        </div>
      </Grupo>

      <Grupo titulo="Responsável">
        <Campo rotulo="Nome" value={f.tutorNome} onChange={mudar('tutorNome')} />
        <Campo rotulo="Telefone (WhatsApp)" type="tel" value={f.tutorTelefone} onChange={mudar('tutorTelefone')} />
        <Campo rotulo="E-mail" type="email" value={f.tutorEmail} onChange={mudar('tutorEmail')} />
      </Grupo>

      <Grupo titulo="Exame">
        <Selecao rotulo="Tipo de exame *" value={f.tipoExame} onChange={mudar('tipoExame')}>
          <option value="">Escolha…</option>
          {d.tiposExame.map((t) => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
        </Selecao>
        <Selecao rotulo="Jejum" value={f.jejum} onChange={mudar('jejum')}>
          <option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option>
        </Selecao>
        <Campo rotulo="Suspeita clínica" value={f.suspeitaClinica} onChange={mudar('suspeitaClinica')} />
        <Campo rotulo="Solicitante" value={f.solicitanteNome} onChange={mudar('solicitanteNome')} />
        <Campo rotulo="CRMV do solicitante" value={f.solicitanteCrmv} onChange={mudar('solicitanteCrmv')} placeholder="ex.: 12345-SP" />
        <Campo rotulo="Clínica solicitante" value={f.solicitanteClinica} onChange={mudar('solicitanteClinica')} />
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-sm font-medium text-slate-700">Histórico</span>
          <textarea rows={3} className={areaTexto} value={f.historico} onChange={mudar('historico')} />
        </label>
      </Grupo>
      <p className="text-xs text-slate-500">* Necessário para gerar o pré-laudo. O resto é recomendado e pode ser completado depois.</p>
    </div>
  );
}

function Resumo({ f, d }: { f: Form; d: Detalhe }) {
  const tipo = d.tiposExame.find((t) => t.codigo === f.tipoExame)?.nome;
  const itens: [string, string][] = [
    ['Espécie', f.especie], ['Raça', f.raca], ['Sexo', f.sexo ? nomeSexo[f.sexo] ?? f.sexo : ''],
    ['Castrado', f.castrado === 'sim' ? 'Sim' : f.castrado === 'nao' ? 'Não' : ''], ['Idade', f.idade], ['Peso', f.peso],
    ['Responsável', [f.tutorNome, f.tutorTelefone].filter(Boolean).join(' · ')], ['Exame', tipo ?? ''],
    ['Suspeita clínica', f.suspeitaClinica], ['Jejum', f.jejum === 'sim' ? 'Sim' : f.jejum === 'nao' ? 'Não' : ''],
    ['Solicitante', [f.solicitanteNome, f.solicitanteCrmv].filter(Boolean).join(' · ')],
    ['Equipamento', d.equipamento ?? ''], ['Operador', d.operador ?? ''],
  ];
  const preenchidos = itens.filter(([, v]) => v);
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {preenchidos.map(([k, v]) => (
          <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
      {f.historico && <p className="mt-3 text-sm"><span className="text-slate-500">Histórico: </span>{f.historico}</p>}
    </>
  );
}

/** Foto em tela cheia, com anterior/próxima, camada de anotações e botão para anotar. */
function Visualizador({ fotos, indice, anotacoes, aoAnotar, aoMudar, aoFechar }: {
  fotos: Arquivo[];
  indice: number;
  anotacoes?: MapaAnotacoes;
  aoAnotar?: (nomeFoto: string) => void;
  aoMudar: (i: number) => void;
  aoFechar: () => void;
}) {
  const [verAnotacoes, setVerAnotacoes] = useState(true);
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') aoFechar();
      if (ev.key === 'ArrowRight') aoMudar(Math.min(fotos.length - 1, indice + 1));
      if (ev.key === 'ArrowLeft') aoMudar(Math.max(0, indice - 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [indice, fotos.length, aoMudar, aoFechar]);

  const atual = fotos[indice];
  const itensFoto = anotacoes?.[atual.nome] ?? [];
  const botao = 'min-h-12 min-w-12 rounded-full bg-white/15 text-2xl text-white disabled:opacity-30';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={aoFechar}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm text-white/80" onClick={(ev) => ev.stopPropagation()}>
        <span className="truncate">{indice + 1} / {fotos.length} · {atual.nome}</span>
        <div className="flex items-center gap-2">
          {itensFoto.length > 0 && (
            <button
              type="button"
              onClick={() => setVerAnotacoes((v) => !v)}
              className="min-h-10 rounded-full border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20"
            >
              {verAnotacoes ? '👁 Ocultar anotações' : '👁 Mostrar anotações'}
            </button>
          )}
          {aoAnotar && (
            <button
              type="button"
              onClick={() => aoAnotar(atual.nome)}
              className="min-h-10 rounded-full bg-[#FFE600] px-4 text-xs font-bold text-slate-950 shadow hover:bg-yellow-300"
              title="Adicionar texto ou medida nesta imagem no padrão do ultrassom"
            >
              ✎ Anotar
            </button>
          )}
          <button className={botao} onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2" onClick={(ev) => ev.stopPropagation()}>
        <div className="relative inline-flex max-h-full max-w-full items-center justify-center">
          <img src={atual.url} alt={atual.nome} className="block max-h-[calc(100dvh-10rem)] max-w-full object-contain" />
          {verAnotacoes && <CamadaAnotacao itens={itensFoto} />}
        </div>
      </div>
      <div className="flex justify-center gap-6 p-4" onClick={(ev) => ev.stopPropagation()}>
        <button className={botao} disabled={indice === 0} onClick={() => aoMudar(indice - 1)} aria-label="Anterior">‹</button>
        <button className={botao} disabled={indice === fotos.length - 1} onClick={() => aoMudar(indice + 1)} aria-label="Próxima">›</button>
      </div>
    </div>
  );
}

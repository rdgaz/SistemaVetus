'use strict';
/**
 * Teste da revisão do mentor (mentoria, etapa 2): enviar o laudo ao mentor, laudo parado enquanto pendente, o mentor vê
 * o exame sem os dados do responsável, revisa (rascunho, concluir com sugestões ou confirmar), cancelamento, revisão
 * para ensino (laudo assinado) e fim da mentoria cancelando a revisão pendente.
 * Uso: node tests/revisao-mentor.js   (variáveis: PLATAFORMA_URL, VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA; IA simulada)
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  OK  ' : ' FALHA'} ${m}`); if (!c) falhas++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const foto = (n) => Buffer.concat([JPG, Buffer.from([n & 255, n >> 8])]);

class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; }
  async req(metodo, caminho, corpo, tipoBruto) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = tipoBruto || 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const body = corpo === undefined ? undefined : tipoBruto ? corpo : JSON.stringify(corpo);
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body });
    for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const tipo = r.headers.get('content-type') || '';
    const texto = tipo.includes('json') ? await r.text() : null;
    return { status: r.status, dados: texto ? JSON.parse(texto) : null, texto };
  }
  /** Login. O sistema limita 10 tentativas por minuto por IP: se barrar (429), espera e tenta de novo. */
  async entrar(email, senha) {
    for (let i = 0; ; i++) {
      const r = await this.req('POST', '/api/auth/entrar', { email, senha });
      if (r.status !== 429 || i >= 2) return r;
      console.log('  ...limite de logins por minuto atingido; aguardando 60 s');
      await sleep(60000);
    }
  }
}

(async () => {
  const n = Date.now();
  const adm = new Navegador();
  ok((await adm.entrar(ADMIN_EMAIL, ADMIN_SENHA)).status === 200, 'administrador do sistema entra');

  async function clinica(nome) {
    const email = `adm.${nome}.${n}@teste.local`;
    const c = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica ${nome} ${n}`, administrador: { nome: `Adm ${nome}`, email } });
    const nav = new Navegador();
    const prov = c.dados.administrador.senhaProvisoria;
    await nav.entrar(email, prov);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${n}` });
    nav.clinica = c.dados.id;
    return nav;
  }
  async function veterinario(admClinica, nome) {
    const email = `${nome}.${n}@teste.local`;
    const u = await admClinica.req('POST', '/api/clinica/usuarios', { nome: `Dra. ${nome}`, email, perfil: 'Veterinario', crmv: '777', crmvUf: 'rs' });
    const nav = new Navegador();
    await nav.entrar(email, u.dados.senhaProvisoria);
    await nav.req('PUT', '/api/auth/senha', { senhaAtual: u.dados.senhaProvisoria, novaSenha: `Senha-${n}` });
    nav.clinica = admClinica.clinica;
    nav.id = (await nav.req('GET', '/api/auth/eu')).dados.id;
    return nav;
  }

  const A = await clinica('revA');
  const B = await clinica('revB');
  const mentor = await veterinario(A, 'mentorrev');
  const aluno = await veterinario(B, 'alunorev');
  const colega = await veterinario(B, 'colegarev'); // mesma clínica, sem mentoria
  await adm.req('POST', '/api/admin/mentores', { usuarioId: mentor.id });
  const pedido = await aluno.req('POST', '/api/mentorias', { mentorId: mentor.id });
  await mentor.req('POST', `/api/mentorias/${pedido.dados.id}/aceitar`, {});

  // exame com pré-laudo (IA simulada)
  const idAnimal = '20261126-050000-ABCD';
  const sub = 'ABD20261126050000';
  for (let i = 1; i <= 2; i++) await aluno.req('PUT', `/api/exames/pendrive/${idAnimal}/${sub}/arquivos/FOTO_${i}.JPG`, foto(i), 'image/jpeg');
  const concl = await aluno.req('POST', `/api/exames/pendrive/${idAnimal}/${sub}/concluir`, { nome: 'Thor' });
  const exameId = concl.dados.id;
  await aluno.req('PUT', `/api/exames/${exameId}`, {
    paciente: { nome: 'Thor', especie: 'Canina', raca: 'Labrador', sexo: 'M', castrado: true }, tutor: { nome: 'Maria Responsável', telefone: '51999990000' },
    peso: '30 kg', tipoExame: 'abdominal',
  });
  await aluno.req('POST', `/api/exames/${exameId}/gerar`, { tipoExame: 'abdominal' });
  let det = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    det = (await aluno.req('GET', `/api/exames/${exameId}`)).dados;
    if (det.status === 'AguardandoRevisao' || det.status === 'Erro') break;
  }
  ok(det.status === 'AguardandoRevisao', `pré-laudo gerado (${det.status})`);
  const conteudo = det.laudo.conteudo;

  // ---- enviar
  const base = `/api/exames/${exameId}/revisao-mentor`;
  const disp = (await aluno.req('GET', base)).dados;
  ok(disp.mentores.length === 1 && disp.mentores[0].id === mentor.id && disp.revisoes.length === 0, 'mentorado vê o mentor disponível para o exame');
  ok((await colega.req('GET', base)).dados.mentores.length === 0, 'quem não tem mentoria não tem mentor para enviar');
  ok((await colega.req('POST', base, { mentorId: mentor.id })).status === 400, 'sem mentoria aceita não envia');
  const env = await aluno.req('POST', base, { mentorId: mentor.id, mensagem: 'Dúvida no baço' });
  ok(env.status === 201 && env.dados.paraEnsino === false, 'mentorado envia o laudo ao mentor');
  const rid = env.dados.id;
  ok((await aluno.req('POST', base, { mentorId: mentor.id })).status === 409, 'não envia duas vezes o mesmo laudo');
  ok((await aluno.req('GET', `/api/exames/${exameId}`)).dados.revisaoMentor?.id === rid, 'exame mostra a revisão pendente');

  // ---- laudo parado enquanto está com o mentor
  ok((await aluno.req('PUT', `/api/exames/${exameId}/laudo`, { conteudo })).status === 409, 'pendente: não salva o laudo');
  ok((await aluno.req('POST', `/api/exames/${exameId}/laudo/assinar`, { conteudo })).status === 409, 'pendente: não assina');
  ok((await aluno.req('PUT', `/api/exames/${exameId}`, { peso: '31 kg' })).status === 409, 'pendente: não altera os dados do exame');
  ok((await aluno.req('POST', `/api/exames/${exameId}/gerar`, {})).status === 409, 'pendente: não pede nova análise à IA');

  // ---- o mentor
  const av = (await mentor.req('GET', '/api/notificacoes')).dados.itens.find((x) => x.tipo === 'revisao_pedida');
  ok(!!av && av.link === `/mentoria/revisoes/${rid}` && av.texto.includes('Dúvida no baço'), 'mentor recebe o aviso com o link e a mensagem');
  const pend = (await mentor.req('GET', '/api/revisoes-mentor?situacao=pendente')).dados;
  ok(pend.revisoes.some((x) => x.id === rid && x.paciente === 'Thor') && pend.contagens.pendente >= 1, 'pedido aparece em "Pendentes" do mentor');
  const rv = await mentor.req('GET', `/api/revisoes-mentor/${rid}`);
  ok(rv.status === 200 && rv.dados.souMentor && rv.dados.exame.paciente.nome === 'Thor' && rv.dados.exameId === null, 'mentor abre a revisão');
  ok(!rv.texto.includes('Maria Responsável') && !rv.texto.includes('51999990000'), 'mentor não vê os dados do responsável');
  ok(rv.dados.fotos.length === 2 && (await mentor.req('GET', rv.dados.fotos[0].url)).status === 200, 'mentor vê as fotos pela revisão');
  ok((await mentor.req('GET', `/api/exames/${exameId}`)).status !== 200, 'mentor não acessa o exame direto (sem vínculo com a clínica)');
  ok((await colega.req('GET', `/api/revisoes-mentor/${rid}`)).status === 404 && (await colega.req('GET', rv.dados.fotos[0].url)).status === 404,
    'outra pessoa não vê a revisão nem as fotos');
  ok((await aluno.req('PUT', `/api/revisoes-mentor/${rid}`, { parecer: 'x' })).status === 404, 'mentorado não edita a revisão do mentor');

  const sugestao = JSON.parse(JSON.stringify(conteudo));
  sugestao.orgaos[0].situacao = 'alterado';
  sugestao.orgaos[0].descricao = 'Dimensões aumentadas, contornos regulares, ecogenicidade aumentada.';
  ok((await mentor.req('PUT', `/api/revisoes-mentor/${rid}`, { conteudo: sugestao, parecer: 'Rascunho' })).status === 204, 'mentor salva o rascunho');
  ok((await aluno.req('POST', `/api/revisoes-mentor/${rid}/cancelar`)).status === 409, 'depois que o mentor começou, o mentorado não cancela');
  const concluir = await mentor.req('POST', `/api/revisoes-mentor/${rid}/concluir`, {
    conteudo: sugestao, comentarios: { [sugestao.orgaos[0].orgao]: 'Repare na ecogenicidade comparada ao baço.' },
    rotulos: { 'FOTO_1.JPG': 'Fígado', 'FOTO_2.JPG': 'Baço' }, parecer: 'Bom laudo; atenção ao fígado.', confirmar: false,
  });
  ok(concluir.status === 200 && concluir.dados.resultado === 'sugestoes', 'mentor conclui com sugestões');
  ok((await mentor.req('PUT', `/api/revisoes-mentor/${rid}`, { parecer: 'y' })).status === 409, 'revisão concluída não muda');

  // ---- volta ao mentorado
  const avAluno = (await aluno.req('GET', '/api/notificacoes')).dados.itens.find((x) => x.tipo === 'revisao_sugestoes');
  ok(!!avAluno && avAluno.link === `/exames/${exameId}` && avAluno.texto.includes('atenção ao fígado'), 'mentorado recebe o aviso "com sugestões"');
  const lista = (await aluno.req('GET', base)).dados.revisoes;
  ok(lista[0].situacao === 'concluida' && lista[0].resultado === 'sugestoes' && lista[0].parecer.includes('fígado')
    && Object.values(lista[0].comentarios)[0].includes('ecogenicidade'), 'exame mostra o resultado, o parecer e os comentários');
  const vista = (await aluno.req('GET', `/api/revisoes-mentor/${rid}`)).dados;
  ok(!vista.souMentor && vista.exameId === exameId && vista.conteudoMentor.orgaos[0].situacao === 'alterado' && vista.rotulos['FOTO_2.JPG'] === 'Baço',
    'mentorado abre a revisão completa (o que o mentor mudou)');
  ok((await aluno.req('GET', `/api/exames/${exameId}`)).dados.revisaoMentor === null, 'depois da revisão, o exame não está mais com o mentor');
  ok((await aluno.req('PUT', `/api/exames/${exameId}/laudo`, { conteudo })).status === 204, 'mentorado volta a editar o laudo');

  // ---- confirmar sem alterações
  const env2 = await aluno.req('POST', base, { mentorId: mentor.id });
  const conf = await mentor.req('POST', `/api/revisoes-mentor/${env2.dados.id}/concluir`, { parecer: 'Perfeito.', confirmar: true });
  ok(conf.status === 200 && conf.dados.resultado === 'confirmado', 'mentor confirma sem alterações');
  ok((await aluno.req('GET', '/api/notificacoes')).dados.itens.some((x) => x.tipo === 'revisao_confirmada'), 'mentorado recebe "laudo confirmado"');

  // ---- cancelar antes de o mentor começar
  const env3 = await aluno.req('POST', base, { mentorId: mentor.id });
  ok((await aluno.req('POST', `/api/revisoes-mentor/${env3.dados.id}/cancelar`)).status === 204, 'mentorado cancela antes de o mentor começar');
  ok((await mentor.req('GET', '/api/revisoes-mentor')).dados.revisoes.every((x) => x.id !== env3.dados.id), 'revisão cancelada some da lista do mentor');
  ok((await aluno.req('PUT', `/api/exames/${exameId}/laudo`, { conteudo })).status === 204, 'laudo volta a ser editável depois de cancelar');

  // ---- laudo assinado: revisão para ensino (não trava nada)
  ok((await aluno.req('POST', `/api/exames/${exameId}/laudo/assinar`, { conteudo })).status === 200, 'mentorado assina o laudo');
  const ens = await aluno.req('POST', base, { mentorId: mentor.id, mensagem: 'Para estudo' });
  ok(ens.status === 201 && ens.dados.paraEnsino === true, 'laudo assinado vai ao mentor para ensino');
  ok((await aluno.req('GET', `/api/exames/${exameId}`)).dados.status === 'Pronto', 'laudo assinado continua assinado');

  // ---- fim da mentoria cancela a revisão pendente
  const mentoriaId = (await aluno.req('GET', '/api/mentorias')).dados.comoMentorado.find((x) => x.situacao === 'aceita').id;
  ok((await aluno.req('POST', `/api/mentorias/${mentoriaId}/encerrar`)).status === 204, 'mentorado encerra a mentoria');
  ok((await aluno.req('GET', base)).dados.revisoes.find((x) => x.id === ens.dados.id).situacao === 'cancelada', 'revisão pendente é cancelada com o fim da mentoria');
  ok((await aluno.req('GET', base)).dados.mentores.length === 0, 'sem mentoria, não há mais mentor para enviar');

  // ---- registro de atividades da clínica
  const regs = (await B.req('GET', '/api/clinica/registros')).dados.registros;
  ok(regs.some((x) => x.tipo === 'revisao_mentor_enviada' && x.exameId === exameId) && regs.some((x) => x.tipo === 'revisao_mentor_concluida'),
    'envio e conclusão ficam nos registros da clínica');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });

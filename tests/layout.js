'use strict';
/**
 * Teste da personalização do laudo (layout do PDF por clínica).
 * Uso: node tests/layout.js   (variáveis: PLATAFORMA_URL, VETUS_ADMIN_EMAIL, VETUS_ADMIN_SENHA)
 * Se definir LAYOUT_PDF_SAIDA=arquivo.pdf, grava a prévia gerada.
 */
const URL_BASE = (process.env.PLATAFORMA_URL || 'http://127.0.0.1:5080').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.VETUS_ADMIN_EMAIL || 'admin@vetus.local';
const ADMIN_SENHA = process.env.VETUS_ADMIN_SENHA || '';
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '  OK  ' : ' FALHA'} ${m}`); if (!c) falhas++; };

class Navegador {
  constructor() { this.cookie = ''; this.clinica = null; }
  async req(metodo, caminho, corpo) {
    const headers = {};
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.clinica) headers['x-clinica-id'] = this.clinica;
    const r = await fetch(URL_BASE + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); if (par.startsWith('vetus=')) this.cookie = par.endsWith('=') ? '' : par; }
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, tipo, dados: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  }
}

(async () => {
  const adm = new Navegador();
  ok((await adm.req('POST', '/api/auth/entrar', { email: ADMIN_EMAIL, senha: ADMIN_SENHA })).status === 200, 'administrador do sistema entra');
  const n = Date.now();
  const email = `adm.layout.${n}@teste.local`;
  const c = await adm.req('POST', '/api/admin/clinicas', { nome: `Clínica Layout ${n}`, administrador: { nome: 'Ana', email } });
  const nav = new Navegador();
  const prov = c.dados.administrador.senhaProvisoria;
  await nav.req('POST', '/api/auth/entrar', { email, senha: prov });
  await nav.req('PUT', '/api/auth/senha', { senhaAtual: prov, novaSenha: `Senha-${n}` });
  nav.clinica = c.dados.id;

  const g0 = (await nav.req('GET', '/api/clinica/layout')).dados;
  ok(g0.personalizado === false && g0.layout.corPrincipal === '#0E4D64' && g0.layout.secoes.length === 8, 'layout padrão da clínica nova');

  const previaPadrao = await nav.req('POST', '/api/clinica/layout/previa', g0.layout);
  ok(previaPadrao.status === 200 && previaPadrao.dados.subarray(0, 4).toString() === '%PDF', 'prévia do layout padrão gera PDF');

  // layout no estilo "modelo com caixas": logo grande, sem cabeçalho de texto, dados em caixa, prancha sem moldura
  const modelo = {
    corPrincipal: '#000000', corFundoIdentificacao: '#FFFFFF', corBorda: '#E5DCDC', tamanhoFonte: 10, margemCm: 0.7, estiloTitulos: 'caixa',
    linhaCabecalho: false, mostrarNomeClinica: false, mostrarEndereco: false, mostrarTelefone: false, mostrarEmail: false, alturaLogo: 240,
    mostrarTitulo: false, tituloIdentificacao: 'Dados', colunasIdentificacao: 3, textoTituloAchados: 'Relatório Ultrassonográfico',
    colunasPrancha: 2, fundoPrancha: 'nenhum', mostrarTituloPrancha: false,
    identificacao: [{ id: 'paciente', mostrar: true }, { id: 'dataHora', mostrar: true }, { id: 'clinicaSolicitante', mostrar: true }, { id: 'sexo', mostrar: false }],
    secoes: [{ id: 'achados', mostrar: true }, { id: 'impressao', mostrar: true }, { id: 'diferenciais', mostrar: false }],
  };
  ok((await nav.req('PUT', '/api/clinica/layout', modelo)).status === 200, 'salva o layout personalizado');
  const g1 = (await nav.req('GET', '/api/clinica/layout')).dados;
  ok(g1.personalizado && g1.layout.estiloTitulos === 'caixa' && g1.layout.alturaLogo === 240 && g1.layout.colunasPrancha === 2, 'layout salvo volta igual');
  ok(g1.layout.secoes.length === 8 && g1.layout.secoes[0].id === 'achados' && g1.layout.secoes.find((s) => s.id === 'diferenciais').mostrar === false,
    'seções: ordem escolhida, ocultas respeitadas e as que faltavam voltam ao fim');
  ok(g1.layout.identificacao.length === 14 && g1.layout.identificacao[0].id === 'paciente', 'campos da identificação completados');

  const previa = await nav.req('POST', '/api/clinica/layout/previa', g1.layout);
  ok(previa.status === 200 && previa.dados.subarray(0, 4).toString() === '%PDF', 'prévia do layout personalizado gera PDF');
  if (process.env.LAYOUT_PDF_SAIDA) require('fs').writeFileSync(process.env.LAYOUT_PDF_SAIDA, previa.dados);

  // valores inválidos são corrigidos
  await nav.req('PUT', '/api/clinica/layout', { corPrincipal: 'vermelho', tamanhoFonte: 99, colunasPrancha: 9, alinhamentoAssinatura: 'cima', margemCm: -3, alturaLogo: 5 });
  const g2 = (await nav.req('GET', '/api/clinica/layout')).dados.layout;
  ok(g2.corPrincipal === '#0E4D64' && g2.tamanhoFonte === 12 && g2.colunasPrancha === 3 && g2.alinhamentoAssinatura === 'centro' && g2.margemCm === 0.5 && g2.alturaLogo === 30,
    'valores inválidos corrigidos (cor, fonte, colunas, alinhamento, margem, logo)');

  // banco de frases (Laudo Fácil) para a revisão
  const fr = await nav.req('GET', '/api/frases?orgao=' + encodeURIComponent('Rim esquerdo'));
  ok(fr.status === 200 && fr.dados.bloco === 'Rins' && fr.dados.entradas.length >= 10 && fr.dados.entradas.some((e) => /^Normal/.test(e.titulo)),
    'frases prontas: Rim esquerdo usa o bloco "Rins" do banco');
  const fp = (await nav.req('GET', '/api/frases?orgao=' + encodeURIComponent('Pâncreas'))).dados;
  ok(fp.entradas.some((e) => e.impressoes.length > 0), 'frases prontas trazem a impressão diagnóstica');
  ok((await nav.req('GET', '/api/frases?orgao=Cavidade%20abdominal')).dados.entradas.length === 0, 'órgão sem frases: lista vazia');

  // só o administrador da clínica altera
  const vet = await nav.req('POST', '/api/clinica/usuarios', { nome: 'Vera', email: `vet.layout.${n}@teste.local`, perfil: 'Veterinario', crmv: '1', crmvUf: 'sp' });
  const v = new Navegador();
  await v.req('POST', '/api/auth/entrar', { email: `vet.layout.${n}@teste.local`, senha: vet.dados.senhaProvisoria });
  v.clinica = c.dados.id;
  ok((await v.req('PUT', '/api/clinica/layout', modelo)).status === 403, 'veterinário não altera o layout');
  ok((await v.req('GET', '/api/clinica/layout')).status === 200, 'veterinário pode ver o layout');

  ok((await nav.req('DELETE', '/api/clinica/layout')).status === 204 && (await nav.req('GET', '/api/clinica/layout')).dados.personalizado === false, 'voltar ao padrão');

  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

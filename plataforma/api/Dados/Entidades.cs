namespace Vetus.Api.Dados;

/// <summary>Perfil do usuário dentro de uma clínica (um usuário pode ter perfis diferentes em clínicas diferentes).</summary>
public enum Perfil
{
    Usuario = 0,
    Veterinario = 1,
    AdministradorClinica = 2,
}

public class Clinica
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Número sequencial da clínica; gera o AE Title (ALV_C0002; as primeiras clínicas usam VETUS_C0001).</summary>
    public int Numero { get; set; }
    public string Nome { get; set; } = "";
    public string? Documento { get; set; }
    public string? Endereco { get; set; }
    public string? Telefone { get; set; }
    public string? Email { get; set; }
    /// <summary>AE Title que a clínica configura no ultrassom para enviar ao servidor.</summary>
    public string AeTitle { get; set; } = "";
    /// <summary>Hash SHA-256 do token da API de ingestão (o token só é mostrado ao ser gerado).</summary>
    public string? TokenIngestaoHash { get; set; }
    /// <summary>Crédito em reais para pré-laudos com IA (cada geração debita custo real × fator).</summary>
    public decimal SaldoBrl { get; set; }
    /// <summary>Gera o pré-laudo automaticamente ao receber o exame.</summary>
    public bool GerarAutomaticamente { get; set; } = true;
    /// <summary>Imprime o logo no cabeçalho do laudo (a imagem fica guardada mesmo desligado).</summary>
    /// <summary>true = o campo "Informações adicionais" do exame é obrigatório para gerar o pré-laudo.</summary>
    public bool InformacoesObrigatorias { get; set; }
    /// <summary>true = o laudo mostra o código de verificação e o QR code, e a página de verificação online funciona.</summary>
    public bool VerificacaoOnline { get; set; } = true;
    /// <summary>Aparência do PDF do laudo (JSON de LayoutLaudo); vazio = padrão.</summary>
    public string? LayoutLaudo { get; set; }
    public bool UsarLogo { get; set; } = true;
    /// <summary>Onde o logo fica no cabeçalho do laudo: centro (padrão), esquerda ou direita.</summary>
    public string PosicaoLogo { get; set; } = "centro";
    public bool Ativa { get; set; } = true;
    public DateTime CriadaEm { get; set; } = DateTime.UtcNow;

    public List<Vinculo> Vinculos { get; set; } = [];
}

public class Usuario
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Nome { get; set; } = "";
    /// <summary>E-mail em minúsculas; é o login.</summary>
    public string Email { get; set; } = "";
    public string SenhaHash { get; set; } = "";
    /// <summary>Obriga a trocar a senha no próximo acesso (senha provisória).</summary>
    public bool TrocarSenha { get; set; }
    public string? Crmv { get; set; }
    public string? CrmvUf { get; set; }
    /// <summary>Imprime a imagem da assinatura nos laudos que assinar (a imagem fica guardada mesmo desligado).</summary>
    public bool UsarAssinatura { get; set; } = true;
    public bool AdministradorSistema { get; set; }
    public bool Ativo { get; set; } = true;

    // ---- envio de laudos: canais que aparecem no "Compartilhar" deste usuário
    public bool EnvioWhatsapp { get; set; } = true;
    public bool EnvioEmail { get; set; } = true;
    public bool EnvioLink { get; set; } = true;
    public bool EnvioPdf { get; set; } = true;
    /// <summary>Validade (dias) dos links públicos criados por este usuário.</summary>
    public int LinkValidadeDias { get; set; } = 30;

    // ---- SMTP próprio (o e-mail sai da conta do usuário)
    public string? SmtpHost { get; set; }
    public int? SmtpPorta { get; set; }
    /// <summary>ssl (porta 465), starttls (587) ou nenhuma.</summary>
    public string? SmtpSeguranca { get; set; }
    public string? SmtpUsuario { get; set; }
    /// <summary>Senha criptografada (ASP.NET Data Protection); nunca devolvida pela API.</summary>
    public string? SmtpSenhaProtegida { get; set; }
    public string? SmtpRemetenteNome { get; set; }
    public string? SmtpRemetenteEmail { get; set; }
    /// <summary>Muda quando a senha muda ou o usuário é desativado: derruba as sessões antigas.</summary>
    public Guid CarimboSeguranca { get; set; } = Guid.NewGuid();
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;

    public List<Vinculo> Vinculos { get; set; } = [];
}

/// <summary>Situação do exame no fluxo de laudo.</summary>
public enum StatusExame
{
    AguardandoDados = 0,   // modo manual: espera alguém pedir a geração
    NaFila = 1,
    Gerando = 2,
    AguardandoRevisao = 3,
    Pronto = 4,
    Erro = 5,
}

public class Tutor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public string Nome { get; set; } = "";
    public string? Telefone { get; set; }
    public string? Email { get; set; }
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

public class Paciente
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public Guid? TutorId { get; set; }
    public Tutor? Tutor { get; set; }
    public string Nome { get; set; } = "";
    /// <summary>Espécie normalizada (Canina, Felina...) quando reconhecida; senão o texto do aparelho.</summary>
    public string? Especie { get; set; }
    public string? Raca { get; set; }
    /// <summary>M, F ou O (como no DICOM).</summary>
    public string? Sexo { get; set; }
    public bool? Castrado { get; set; }
    public string? Nascimento { get; set; }
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

public class Exame
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public Clinica Clinica { get; set; } = null!;
    public Guid PacienteId { get; set; }
    public Paciente Paciente { get; set; } = null!;
    /// <summary>Identificador do exame no DICOM; um reenvio com o mesmo UID atualiza o mesmo exame.</summary>
    public string StudyInstanceUid { get; set; } = "";
    /// <summary>Pasta do exame, relativa à pasta de dados (ex.: VETUS_C0001/MAYA_20261106_ABD). Vazia se veio só pelo pendrive.</summary>
    public string Pasta { get; set; } = "";
    /// <summary>ID do animal no aparelho (ex.: 20261121-103208-3E0C): junta o exame do DICOM com o do pendrive.</summary>
    public string? IdAnimal { get; set; }
    /// <summary>Pasta dos arquivos do pendrive, relativa à pasta de envios (ex.: VETUS_C0001/20261121-103208-3E0C_ABD20261121103432).</summary>
    public string? PastaPendrive { get; set; }
    /// <summary>
    /// Usa as fotos do pendrive (melhor qualidade) no lugar das do DICOM. Só quando o pendrive chega antes do
    /// primeiro pré-laudo: depois disso as fotos citadas no laudo continuam as mesmas.
    /// </summary>
    public bool FotosPendrive { get; set; }
    /// <summary>Tipo/descrição do exame como veio do aparelho (ex.: ABD).</summary>
    public string? Tipo { get; set; }
    /// <summary>Data e hora do exame (AAAAMMDD / HHMMSS, como no DICOM).</summary>
    public string? Data { get; set; }
    public string? Hora { get; set; }
    /// <summary>Espécie/preset como veio do aparelho (ex.: "Caninos (5-15kg)").</summary>
    public string? EspecieAparelho { get; set; }
    public string? Idade { get; set; }
    public string? Peso { get; set; }
    public string? MedicoSolicitante { get; set; }
    public string? Operador { get; set; }
    public string? Equipamento { get; set; }
    // ---- dados clínicos (preenchidos na tela do exame, à mão ou extraídos pela IA do campo livre)
    /// <summary>Tipo de exame confirmado (ex.: abdominal); define o modelo de laudo e as referências.</summary>
    public string? TipoExame { get; set; }
    public string? SuspeitaClinica { get; set; }
    public string? Historico { get; set; }
    public bool? Jejum { get; set; }
    public string? SolicitanteNome { get; set; }
    public string? SolicitanteCrmv { get; set; }
    public string? SolicitanteClinica { get; set; }
    /// <summary>Campo livre "Informações adicionais": texto ou ditado que a IA organiza e usa na análise.</summary>
    public string? InformacoesAdicionais { get; set; }

    public StatusExame Status { get; set; }
    /// <summary>Quando entrou na fila (a fila anda por ordem de entrada; urgentes primeiro).</summary>
    public DateTime? EnfileiradoEm { get; set; }
    public bool Urgente { get; set; }
    /// <summary>dicom, pendrive, dicom+pendrive ou ingestao.</summary>
    public string Origem { get; set; } = "dicom";
    /// <summary>Pedido de análise completa (todas as fotos de novo) na próxima geração.</summary>
    public bool GerarCompleto { get; set; }
    /// <summary>Motivo da última falha na geração do pré-laudo (status Erro).</summary>
    public string? ErroGeracao { get; set; }
    public int TotalFotos { get; set; }
    public int TotalPdfs { get; set; }
    public int TotalVideos { get; set; }
    public DateTime RecebidoEm { get; set; } = DateTime.UtcNow;
    public DateTime AtualizadoEm { get; set; } = DateTime.UtcNow;
}

/// <summary>Uma versão do laudo de um exame: o pré-laudo da IA e, depois, o texto revisado e assinado.</summary>
public class Laudo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExameId { get; set; }
    public Exame Exame { get; set; } = null!;
    public int Versao { get; set; }
    /// <summary>IA que gerou: claude, gemini ou simulado.</summary>
    public string Ia { get; set; } = "";
    public string Modelo { get; set; } = "";
    /// <summary>Pré-laudo da IA (JSON por seção).</summary>
    public string ConteudoIa { get; set; } = "";
    /// <summary>Texto revisado pelo veterinário (JSON por seção); null até a revisão.</summary>
    public string? ConteudoRevisado { get; set; }
    /// <summary>
    /// Fotos que a análise considera (JSON: lista de nomes; a posição + 1 é o número da imagem para a IA).
    /// Numa atualização, herda as da versão anterior e acrescenta só as novas.
    /// </summary>
    public string ImagensEnviadas { get; set; } = "[]";
    /// <summary>completa (todas as fotos), dados (sem fotos: só o que mudou) ou imagens (só as fotos novas).</summary>
    public string Modo { get; set; } = "completa";
    /// <summary>Dados do exame usados nesta geração (JSON), para saber o que mudou na próxima.</summary>
    public string DadosEntrada { get; set; } = "{}";
    /// <summary>Impressão digital (SHA-1) de todas as fotos do exame nesta geração (JSON: nome -> hash).</summary>
    public string HashesFotos { get; set; } = "{}";
    public int TokensEntrada { get; set; }
    public int TokensSaida { get; set; }
    public int DuracaoMs { get; set; }
    public DateTime GeradoEm { get; set; } = DateTime.UtcNow;
    /// <summary>Custo real desta geração no provedor (US$ e R$ pelo câmbio configurado).</summary>
    public decimal CustoUsd { get; set; }
    public decimal CustoBrl { get; set; }
    /// <summary>Valor debitado do saldo da clínica (custo real × fator).</summary>
    public decimal CobradoBrl { get; set; }

    // ---- assinatura (depois de assinado, o laudo não muda mais)
    public Guid? AssinadoPorId { get; set; }
    public string? AssinadoPorNome { get; set; }
    /// <summary>CRMV/UF de quem assinou, no momento da assinatura.</summary>
    public string? AssinadoCrmv { get; set; }
    public DateTime? AssinadoEm { get; set; }
    /// <summary>Código impresso no PDF e no QR code; abre a página pública de verificação.</summary>
    public string? CodigoVerificacao { get; set; }

    // ---- retificação
    /// <summary>Esta versão assinada foi substituída por uma retificação.</summary>
    public bool Retificado { get; set; }
    /// <summary>Motivo, quando esta versão é uma retificação de uma versão assinada.</summary>
    public string? MotivoRetificacao { get; set; }
}

/// <summary>
/// Valor de referência ultrassonográfico por espécie (e, quando importa, faixa de peso).
/// Usado na revisão (medidas do aparelho × faixa normal) e enviado à IA.
/// </summary>
public class Referencia
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Canina ou Felina (igual à espécie normalizada do paciente).</summary>
    public string Especie { get; set; } = "";
    /// <summary>Faixa de peso em kg em que vale (null = qualquer peso).</summary>
    public decimal? PesoMinKg { get; set; }
    public decimal? PesoMaxKg { get; set; }
    /// <summary>Órgão, com o mesmo nome do laudo (ex.: "Alças intestinais").</summary>
    public string Orgao { get; set; } = "";
    /// <summary>O que se mede (ex.: "Espessura da parede do duodeno").</summary>
    public string Medida { get; set; } = "";
    public decimal? Minimo { get; set; }
    public decimal? Maximo { get; set; }
    /// <summary>mm, cm ou "razão".</summary>
    public string Unidade { get; set; } = "mm";
    /// <summary>
    /// Palavras para reconhecer a medida do aparelho, separadas por vírgula; cada item pode ter várias palavras
    /// que precisam aparecer juntas (ex.: "rim comprimento, kidney length").
    /// </summary>
    public string? Termos { get; set; }
    public string? Observacao { get; set; }
    /// <summary>Referência bibliográfica.</summary>
    public string Fonte { get; set; } = "";
    public bool Ativa { get; set; } = true;
}

/// <summary>Configuração da cobrança da IA (uma linha só, editada na página do administrador).</summary>
public class ConfiguracaoCobranca
{
    public int Id { get; set; } = 1;
    /// <summary>Multiplicador sobre o custo real (2 = 100% de margem).</summary>
    public decimal Fator { get; set; } = 2m;
    /// <summary>Câmbio usado para converter o custo em dólar para reais.</summary>
    public decimal CambioUsdBrl { get; set; } = 5.50m;
    /// <summary>Crédito dado a cada clínica nova.</summary>
    public decimal CreditoInicialClinica { get; set; } = 40m;
    /// <summary>Saldo que o dono do sistema tem no provedor de IA (descontado pelo custo real de cada geração).</summary>
    public decimal SaldoProvedorBrl { get; set; } = 40m;
    /// <summary>Avisar quando o saldo do provedor ficar abaixo disto.</summary>
    public decimal AlertaSaldoProvedorBrl { get; set; } = 10m;
    /// <summary>Saldo pré-pago no Google AI (Gemini), em reais: o custo de cada geração do Gemini é descontado daqui.</summary>
    public decimal SaldoGeminiBrl { get; set; }
    /// <summary>Saldo pré-pago na Anthropic (Claude), em dólares: o custo de cada geração do Claude é descontado daqui.</summary>
    public decimal SaldoClaudeUsd { get; set; }
    /// <summary>Quando os saldos foram conferidos no site dos provedores pela última vez.</summary>
    public DateTime? SaldosConferidosEm { get; set; }
    public DateTime AtualizadoEm { get; set; } = DateTime.UtcNow;
}

/// <summary>Preço de um modelo de IA (US$ por milhão de tokens), editável: os provedores mudam os preços.</summary>
public class PrecoModelo
{
    public string Modelo { get; set; } = "";
    public decimal EntradaUsdPorMilhao { get; set; }
    public decimal SaidaUsdPorMilhao { get; set; }
}

/// <summary>Extrato do saldo da clínica: recargas, débitos de pré-laudos, ajustes.</summary>
public class MovimentoSaldo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    /// <summary>credito_inicial, recarga, debito, ajuste.</summary>
    public string Tipo { get; set; } = "";
    /// <summary>Positivo = entrada; negativo = saída.</summary>
    public decimal Valor { get; set; }
    public decimal SaldoApos { get; set; }
    public string Descricao { get; set; } = "";
    public Guid? ExameId { get; set; }
    public Guid? UsuarioId { get; set; }
    public DateTime Em { get; set; } = DateTime.UtcNow;
    /// <summary>Nos débitos: o custo real (quanto o dono do sistema pagou ao provedor), para calcular o lucro.</summary>
    public decimal CustoBrl { get; set; }
    /// <summary>Nos débitos: a IA usada (gemini, claude...).</summary>
    public string? Ia { get; set; }
}

/// <summary>Link público do laudo (para o responsável): abre a última versão assinada do exame, sem login.</summary>
public class LinkPublico
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExameId { get; set; }
    public Exame Exame { get; set; } = null!;
    /// <summary>Parte aleatória da URL (/laudo/&lt;token&gt;).</summary>
    public string Token { get; set; } = "";
    public Guid CriadoPorId { get; set; }
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
    public DateTime ExpiraEm { get; set; }
    public bool Revogado { get; set; }
    public int Acessos { get; set; }
    public DateTime? UltimoAcesso { get; set; }
}

/// <summary>Registro de cada envio/compartilhamento do laudo.</summary>
public class Compartilhamento
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExameId { get; set; }
    public int LaudoVersao { get; set; }
    /// <summary>whatsapp, email, link ou pdf.</summary>
    public string Meio { get; set; } = "";
    public string? Destinatario { get; set; }
    public Guid UsuarioId { get; set; }
    public string UsuarioNome { get; set; } = "";
    public DateTime Em { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Imagens de cadastro (logo da clínica, assinatura do veterinário), numa tabela à parte para não
/// serem carregadas junto com a clínica/usuário em toda requisição.
/// Chave: "logo:{clinicaId}" ou "assinatura:{usuarioId}".
/// </summary>
public class ImagemCadastro
{
    public string Chave { get; set; } = "";
    public string Tipo { get; set; } = "image/png";
    public byte[] Conteudo { get; set; } = [];
    public DateTime AtualizadoEm { get; set; } = DateTime.UtcNow;

    public static string Logo(Guid clinicaId) => $"logo:{clinicaId}";
    public static string Assinatura(Guid usuarioId) => $"assinatura:{usuarioId}";
}

/// <summary>Acesso de um usuário a uma clínica, com o perfil naquela clínica.</summary>
public class Vinculo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UsuarioId { get; set; }
    public Usuario Usuario { get; set; } = null!;
    public Guid ClinicaId { get; set; }
    public Clinica Clinica { get; set; } = null!;
    public Perfil Perfil { get; set; }
    /// <summary>true = o laudo sai com a identidade (logo/cabeçalho) do próprio profissional, não da clínica.</summary>
    public bool IdentidadePropria { get; set; }
    public bool Ativo { get; set; } = true;
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Discordância do veterinário com o alerta de achado urgente da IA. Cada registro guarda o que a IA disse e a leitura
/// correta, e alimenta a melhoria da IA (casos de correção, conjunto de referência, exemplos do que não é urgente).
/// </summary>
public class DiscordanciaAlerta
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public Guid ExameId { get; set; }
    public Guid LaudoId { get; set; }
    public int LaudoVersao { get; set; }
    public Guid UsuarioId { get; set; }
    public string UsuarioNome { get; set; } = "";
    /// <summary>falso_alarme, achado_diferente ou imagens_insuficientes.</summary>
    public string Motivo { get; set; } = "";
    /// <summary>A leitura correta, nas palavras do veterinário.</summary>
    public string? Comentario { get; set; }
    // o que a IA tinha dito (cópia, para não depender do laudo)
    public string AlertaMotivo { get; set; } = "";
    public string? AlertaConfianca { get; set; }
    public string? AlertaEvidencia { get; set; }
    /// <summary>Nomes das fotos que a IA indicou para o alerta (JSON), ou as principais quando ela não indicou.</summary>
    public string AlertaFotos { get; set; } = "[]";
    public string Ia { get; set; } = "";
    public string Modelo { get; set; } = "";
    public DateTime CriadaEm { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// O que uma imagem mostra, segundo o veterinário: confirma ou corrige o órgão que a IA associou à foto.
/// É a base de treino de um futuro reconhecedor de órgãos e do agente de análise de imagens.
/// </summary>
public class RotuloImagem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public Guid ExameId { get; set; }
    public int LaudoVersao { get; set; }
    /// <summary>Nome do arquivo da foto no exame.</summary>
    public string Foto { get; set; } = "";
    /// <summary>Impressão digital (SHA-1) da foto: identifica a mesma imagem em qualquer exame, mesmo se o arquivo mudar de pasta.</summary>
    public string HashFoto { get; set; } = "";
    /// <summary>Órgão que a IA associou à imagem (null se ela não associou a nenhum).</summary>
    public string? OrgaoIa { get; set; }
    /// <summary>O que a imagem mostra, segundo o veterinário.</summary>
    public string OrgaoCorreto { get; set; } = "";
    /// <summary>confirmacao (o veterinário confirmou) ou correcao (ele mudou).</summary>
    public string Tipo { get; set; } = "";
    public Guid UsuarioId { get; set; }
    public string UsuarioNome { get; set; } = "";
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Texto ditado pelo veterinário para um órgão, já padronizado pela IA. Guarda o relato falado (informal), a descrição que
/// existia, o texto padronizado e o texto final aceito: pares de treino para um agente que escreve como o médico.
/// (O áudio em si não é guardado; só o texto.)
/// </summary>
public class DitadoOrgao
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicaId { get; set; }
    public Guid ExameId { get; set; }
    public int LaudoVersao { get; set; }
    public string Orgao { get; set; } = "";
    /// <summary>O que o médico falou (transcrição), com a fala informal.</summary>
    public string TextoBruto { get; set; } = "";
    /// <summary>A descrição do órgão antes do ditado.</summary>
    public string? DescricaoAnterior { get; set; }
    /// <summary>O texto que a IA devolveu no padrão do laudo.</summary>
    public string TextoPadronizado { get; set; } = "";
    /// <summary>O texto que o médico deixou no laudo (pode ter editado o padronizado); null se não aceitou.</summary>
    public string? TextoFinal { get; set; }
    public bool Aceito { get; set; }
    public string Ia { get; set; } = "";
    public string Modelo { get; set; } = "";
    public Guid UsuarioId { get; set; }
    public string UsuarioNome { get; set; } = "";
    public DateTime CriadoEm { get; set; } = DateTime.UtcNow;
}

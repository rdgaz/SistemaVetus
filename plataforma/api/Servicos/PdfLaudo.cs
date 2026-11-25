using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Vetus.Api.Dados;
using Vetus.Api.Servicos.Ia;

namespace Vetus.Api.Servicos;

/// <summary>
/// PDF do laudo (QuestPDF): cabeçalho da clínica, identificação, achados por órgão, impressão diagnóstica,
/// prancha de fotos, assinatura e código de verificação com QR code.
/// Versão não assinada sai com a marca "RASCUNHO".
/// </summary>
public class PdfLaudo(VetusDb db, Arquivos arq, IConfiguration cfg)
{
    private readonly string _urlPublica = (cfg["VETUS_URL_PUBLICA"] ?? "http://localhost:5080").TrimEnd('/');

    static PdfLaudo()
    {
        // licença gratuita da QuestPDF para empresas com faturamento anual abaixo de US$ 1 milhão
        QuestPDF.Settings.License = LicenseType.Community;
    }

    /// <summary>Nome padrão do arquivo PDF do laudo (ex.: "laudo_ultrassonografico_Matilda.pdf").</summary>
    public static string NomeArquivo(string? paciente)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var c in (paciente ?? "").Trim().Normalize(System.Text.NormalizationForm.FormD))
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.NonSpacingMark) continue;
            if (char.IsLetterOrDigit(c) || c == '-') sb.Append(c);
            else if (char.IsWhiteSpace(c) || c == '_') { if (sb.Length > 0 && sb[^1] != '_') sb.Append('_'); }
        }
        var limpo = sb.ToString().Trim('_');
        if (string.IsNullOrEmpty(limpo)) limpo = "Exame";
        return $"laudo_ultrassonografico_{limpo}.pdf";
    }

    /// <summary>Cabeçalho Content-Disposition simples e seguro (ASCII com underlines).</summary>
    public static string CabecalhoArquivo(string? paciente, bool baixar = false) =>
        $"{(baixar ? "attachment" : "inline")}; filename=\"{NomeArquivo(paciente)}\"";

    /// <summary>
    /// Gera o PDF. A aparência vem do layout da clínica; <paramref name="layout"/> permite simular outro (prévia da tela
    /// de personalização). Logo, assinatura e verificação online seguem as opções da clínica.
    /// </summary>
    public async Task<byte[]> Gerar(Exame e, Laudo l, LayoutLaudo? layout = null)
    {
        var c = JsonSerializer.Deserialize<JsonElement>(l.ConteudoRevisado ?? l.ConteudoIa);
        var cfgClinica = await db.Clinicas.Where(x => x.Id == e.ClinicaId)
            .Select(x => new { x.UsarLogo, x.PosicaoLogo, x.VerificacaoOnline, x.LayoutLaudo }).FirstAsync();
        var lay = layout?.Normalizar() ?? LayoutLaudo.Ler(cfgClinica.LayoutLaudo);
        var cor = lay.CorPrincipal;
        var posicaoLogo = cfgClinica.PosicaoLogo;
        // logo e assinatura: só saem se a imagem existe E o cliente marcou "usar no laudo"
        var logo = cfgClinica.UsarLogo ? (await db.ImagensCadastro.FindAsync(ImagemCadastro.Logo(e.ClinicaId)))?.Conteudo : null;
        var usarAssinatura = l.AssinadoPorId is { } uid0 && await db.Usuarios.Where(x => x.Id == uid0).Select(x => x.UsarAssinatura).FirstOrDefaultAsync();
        var assinatura = usarAssinatura && l.AssinadoPorId is { } uid ? (await db.ImagensCadastro.FindAsync(ImagemCadastro.Assinatura(uid)))?.Conteudo : null;
        var prancha = FotosDaPrancha(e, l, c);
        var assinado = l.AssinadoEm is not null;
        // código, link e QR de verificação só saem se a clínica ativou a verificação online
        var urlVerificacao = cfgClinica.VerificacaoOnline && l.CodigoVerificacao is { } cod ? $"{_urlPublica}/verificar/{cod}" : null;
        var qr = urlVerificacao is null ? null : new PngByteQRCode(new QRCodeGenerator().CreateQrCode(urlVerificacao, QRCodeGenerator.ECCLevel.M)).GetGraphic(8);
        var tipo = e.TipoExame is { } t && TiposExame.Todos.TryGetValue(t, out var n) ? n : "Ultrassonografia";
        var cinza = Colors.Grey.Darken1;

        return Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin((float)lay.MargemCm, Unit.Centimetre);
            page.DefaultTextStyle(x => x.FontSize((float)lay.TamanhoFonte).LineHeight(1.25f));

            if (!assinado || l.Retificado)
                page.Foreground().AlignCenter().AlignMiddle().Rotate(-35)
                    .Text(assinado ? "RETIFICADO" : "RASCUNHO").FontSize(80).Bold().FontColor("#00000018");

            // ---- cabeçalho
            // o cabeçalho (logo, nome e contato) aparece só na primeira página: fica no começo do conteúdo e não se repete
            void Cabecalho(IContainer h)
            {
            var cab0 = h.PaddingBottom(8);
            if (lay.LinhaCabecalho) cab0 = cab0.BorderBottom(1.5f).BorderColor(cor).PaddingBottom(6);
            cab0.Column(cab =>
            {
                var contato = string.Join(" · ", new[]
                {
                    lay.MostrarDocumento ? e.Clinica.Documento : null,
                    lay.MostrarEndereco ? e.Clinica.Endereco : null,
                    lay.MostrarTelefone ? e.Clinica.Telefone : null,
                    lay.MostrarEmail ? e.Clinica.Email : null,
                }.Where(s => !string.IsNullOrWhiteSpace(s)));
                void Dados(IContainer ct, string alinhamento) => ct.Column(col =>
                {
                    void Linha(string texto, float tam, bool negrito, string corTexto)
                    {
                        var tx = col.Item().Text(texto).FontSize(tam).FontColor(corTexto);
                        if (negrito) tx.Bold();
                        if (alinhamento == "centro") tx.AlignCenter(); else if (alinhamento == "direita") tx.AlignRight();
                    }
                    if (lay.MostrarNomeClinica) Linha(e.Clinica.Nome, 14, true, cor);
                    if (contato.Length > 0) Linha(contato, 8, false, cinza);
                });
                var temDados = lay.MostrarNomeClinica || contato.Length > 0;
                if (logo is null) { if (temDados) cab.Item().Element(ct => Dados(ct, lay.AlinhamentoTitulo)); }
                else if (posicaoLogo == "centro")
                {
                    // padrão: logo centralizado, com o nome e o contato da clínica logo abaixo
                    cab.Item().AlignCenter().Height(lay.AlturaLogo).Image(logo).FitArea();
                    if (temDados) cab.Item().PaddingTop(4).Element(ct => Dados(ct, lay.AlinhamentoTitulo));
                }
                else cab.Item().Row(row =>
                {
                    if (posicaoLogo == "esquerda") row.ConstantItem(lay.AlturaLogo * 70f / 60).Height(lay.AlturaLogo * 50f / 60).AlignMiddle().Image(logo).FitArea();
                    row.RelativeItem().PaddingHorizontal(10).AlignMiddle().Element(ct => Dados(ct, "esquerda"));
                    if (posicaoLogo == "direita") row.ConstantItem(lay.AlturaLogo * 70f / 60).Height(lay.AlturaLogo * 50f / 60).AlignMiddle().Image(logo).FitArea();
                });
            });
            }

            // ---- conteúdo: título, identificação e as seções na ordem escolhida pela clínica
            page.Content().PaddingVertical(6).Column(col =>
            {
                col.Spacing(8);
                col.Item().Element(Cabecalho);
                if (lay.MostrarTitulo)
                    col.Item().AlignCenter().Text((lay.TextoTitulo ?? "LAUDO — {tipo}").Replace("{tipo}", tipo.ToUpperInvariant()))
                        .FontSize(12).Bold().FontColor(cor);

                var p = e.Paciente;
                var campos = lay.Identificacao.Where(i => i.Mostrar)
                    .Select(i => (rotulo: LayoutLaudo.NomesCampos[i.Id], valor: ValorCampo(i.Id, e, p), opcional: i.Id is "suspeita" or "equipamento" or "idAnimal" or "clinicaSolicitante"))
                    .Where(x => !x.opcional || x.valor is not null).ToList();
                if (campos.Count > 0)
                    col.Item().Element(caixa =>
                    {
                        var moldura = lay.EstiloTitulos == "caixa" ? caixa.Border(0.75f).BorderColor(lay.CorBorda) : caixa;
                        moldura.Column(ic =>
                        {
                            var tituloId = lay.TituloIdentificacao ?? (lay.EstiloTitulos == "faixa" ? "Dados" : null);
                            if (tituloId is not null)
                            {
                                if (lay.EstiloTitulos == "caixa")
                                    ic.Item().BorderBottom(0.75f).BorderColor(lay.CorBorda).PaddingVertical(8).PaddingHorizontal(6).Text(tituloId).FontSize(12).Bold().FontColor(cor);
                                else if (lay.EstiloTitulos == "faixa")
                                    ic.Item().Background(lay.CorFundoTitulos).PaddingVertical(4).PaddingHorizontal(8).Text(tituloId).FontSize(11).Bold().FontColor("#1B1B1B");
                                else
                                    ic.Item().PaddingBottom(2).Text(tituloId).FontSize(11).Bold().FontColor(cor);
                            }
                            var fundoId = lay.EstiloTitulos == "faixa" && lay.CorFundoIdentificacao == "#F1F4F8" ? "#00000000" : lay.CorFundoIdentificacao;
                            ic.Item().Background(fundoId).Padding(lay.EstiloTitulos == "faixa" ? 4 : 8).Table(tab =>
                            {
                                tab.ColumnsDefinition(cd => { for (var i = 0; i < lay.ColunasIdentificacao; i++) cd.RelativeColumn(); });
                                foreach (var (rotulo, valor, _) in campos)
                                    tab.Cell().PaddingVertical(1).Text(txt =>
                                    {
                                        if (lay.TamanhoFonteIdentificacao > 0) txt.DefaultTextStyle(x => x.FontSize((float)lay.TamanhoFonteIdentificacao));
                                        txt.Span($"{(rotulo == "Data e hora do exame" ? "Data" : rotulo)}: ").SemiBold();
                                        // estilo caixa (modelo do médico) e faixa: campo sem valor fica em branco; no simples, um traço
                                        txt.Span(string.IsNullOrWhiteSpace(valor) ? (lay.EstiloTitulos is "caixa" or "faixa" ? "" : "—") : valor);
                                    });
                            });
                        });
                    });

                foreach (var secao in lay.Secoes.Where(s => s.Mostrar))
                    switch (secao.Id)
                    {
                        case "condicoes":
                            if (Texto(c, "condicoesTecnicas") is { } cond)
                            {
                                col.Item().ShowEntire().Column(sec =>
                                {
                                    sec.Spacing(4);
                                    TituloSecao(sec, lay, "Condições técnicas");
                                    var tc = sec.Item().Text(cond);
                                    if (lay.JustificarTexto) tc.Justify();
                                });
                            }
                            break;
                        case "achados":
                            TituloSecao(col, lay, lay.TextoTituloAchados ?? (lay.EstiloTitulos == "faixa" ? "Relatório Ultrassonográfico" : "Achados"));
                            if (c.TryGetProperty("orgaos", out var orgaos))
                                foreach (var o in orgaos.EnumerateArray().Where(x => !(Texto(x, "orgao") ?? "").StartsWith("Cavidade abdominal", StringComparison.OrdinalIgnoreCase)))
                                {
                                    var situacao = o.TryGetProperty("situacao", out var s) ? s.GetString() : "";
                                    var descricao = ModeloLaudo.TextoSemImagem(Texto(o, "orgao")) is { } padraoOrgao && situacao is ModeloLaudo.NaoVisualizado
                                        ? padraoOrgao // linfonodos e pâncreas fora das imagens: texto padrão do laudo
                                        : Texto(o, "descricao") ?? (situacao == ModeloLaudo.NaoVisualizado ? "Não visibilizado." : "");
                                    descricao = ModeloLaudo.LimparPrefixoOrgao(Texto(o, "orgao"), descricao); // sem "Baço: Baço: …"
                                    col.Item().Text(txt =>
                                    {
                                        if (lay.JustificarTexto) txt.Justify();
                                        txt.Span($"{Texto(o, "orgao")}: ").Bold();
                                        txt.Span(descricao);
                                    });
                                }
                            break;
                        case "impressao":
                            if (Texto(c, "impressaoDiagnostica") is { } imp)
                            {
                                col.Item().ShowEntire().Column(sec =>
                                {
                                    sec.Spacing(4);
                                    TituloSecao(sec, lay, "Impressão diagnóstica", 11, 4);
                                    var ti = sec.Item().Text(imp);
                                    if (lay.JustificarTexto) ti.Justify();
                                });
                            }
                            break;
                        case "diferenciais":
                            // o veterinário também pode ocultar os diferenciais na revisão (exibirDiferenciais = false)
                            if (!(c.TryGetProperty("exibirDiferenciais", out var exibe) && exibe.ValueKind == JsonValueKind.False))
                                Lista(col, lay, "Diagnósticos diferenciais", c, "diferenciais");
                            break;
                        case "recomendacoes":
                            Lista(col, lay, "Recomendações", c, "recomendacoes");
                            break;
                        case "aviso":
                            // aviso padrão (ou o da clínica), separado por uma linha; o bloco não se divide entre páginas
                            col.Item().PaddingTop(8).ShowEntire().Column(av =>
                            {
                                av.Item().BorderTop(2).BorderColor(Colors.Grey.Lighten2);
                                av.Item().PaddingTop(8).Text(lay.TextoAviso ?? ModeloLaudo.Observacao).FontSize(9).FontColor(Colors.Grey.Darken3);
                            });
                            if (lay.MostrarRetificacao && l.MotivoRetificacao is { } motivo)
                                col.Item().Text($"Retificação do laudo anterior. Motivo: {motivo}").FontSize(8.5f).FontColor(Colors.Red.Darken2);
                            break;
                        case "assinatura":
                            // ShowEntire: o bloco da assinatura nunca se divide entre duas páginas
                            var linhaAss = col.Item().PaddingTop(14).ShowEntire();
                            var alvo = lay.AlinhamentoAssinatura switch { "esquerda" => linhaAss.AlignLeft(), "direita" => linhaAss.AlignRight(), _ => linhaAss.AlignCenter() };
                            alvo.Width(260).Column(a =>
                            {
                                if (assinatura is not null) a.Item().Height(55).AlignCenter().Image(assinatura).FitArea();
                                else a.Item().Height(30);
                                a.Item().BorderTop(0.8f).BorderColor(cinza).PaddingTop(3).AlignCenter()
                                    .Text(assinado ? l.AssinadoPorNome! : "Assinatura pendente").Bold();
                                if (assinado)
                                {
                                    a.Item().AlignCenter().Text(l.AssinadoCrmv!).FontSize(8.5f);
                                    if (lay.TextoAssinatura is { } extra) a.Item().AlignCenter().Text(extra).FontSize(8.5f);
                                    a.Item().AlignCenter().Text($"Assinado em {l.AssinadoEm!.Value.ToLocalTime():dd/MM/yyyy HH:mm}").FontSize(8).FontColor(cinza);
                                }
                            });
                            break;
                        case "prancha":
                            if (prancha.Count > 0)
                            {
                                // título junto com a primeira linha de fotos (não fica sozinho no fim da página)
                                if (lay.MostrarTituloPrancha) col.Item().PaddingTop(12).ShowEntire().Element(tc => { var cc = tc; cc.Text("Prancha de imagens").FontSize(11).Bold().FontColor(cor); });
                                var sem = lay.FundoPrancha == "nenhum";
                                // sem moldura: a altura segue a proporção das imagens do aparelho (cerca de 16:9)
                                var largura = (595f - 2 * (float)lay.MargemCm * 28.35f) / lay.ColunasPrancha;
                                var altura = sem ? largura * 0.574f : lay.ColunasPrancha switch { 1 => 300, 3 => 115, _ => 170 };
                                col.Item().Table(tab =>
                                {
                                    tab.ColumnsDefinition(cd => { for (var i = 0; i < lay.ColunasPrancha; i++) cd.RelativeColumn(); });
                                    foreach (var foto in prancha)
                                        tab.Cell().Padding(2.5f).Element(cel => (sem ? cel : cel.Background(Colors.Black)).Height(altura).AlignCenter().AlignMiddle().Image(foto).FitArea());
                                });
                            }
                            break;
                    }
            });

            // ---- rodapé
            page.Footer().BorderTop(0.5f).BorderColor(Colors.Grey.Lighten1).PaddingTop(4).Row(row =>
            {
                if (qr is not null && lay.PosicaoQr == "esquerda") row.ConstantItem(52).Height(52).Image(qr).FitArea();
                row.RelativeItem().PaddingHorizontal(qr is not null ? 8 : 0).AlignMiddle().Column(f =>
                {
                    if (urlVerificacao is not null && l.CodigoVerificacao is { } cod2)
                    {
                        f.Item().Text(txt =>
                        {
                            txt.Span("Código de verificação: ").FontSize(8);
                            txt.Span(cod2).FontSize(8).Bold();
                        });
                        f.Item().Text($"Confira a autenticidade em {urlVerificacao}").FontSize(7).FontColor(cinza);
                    }
                    else if (l.CodigoVerificacao is null) f.Item().Text("Laudo não assinado (pré-visualização).").FontSize(8).FontColor(cinza);
                    if (lay.TextoRodape is { } rod) f.Item().Text(rod).FontSize(7.5f).FontColor(cinza);
                    f.Item().Text(txt =>
                    {
                        var prefixo = lay.MostrarCreditoProduto ? "Emitido com AutoLaudoVet · " : "";
                        txt.Span($"{prefixo}versão {l.Versao} do laudo · página ").FontSize(7).FontColor(cinza);
                        txt.CurrentPageNumber().FontSize(7).FontColor(cinza);
                        txt.Span(" de ").FontSize(7).FontColor(cinza);
                        txt.TotalPages().FontSize(7).FontColor(cinza);
                    });
                });
                if (qr is not null && lay.PosicaoQr != "esquerda") row.ConstantItem(52).Height(52).Image(qr).FitArea();
            });
        }))
        .WithMetadata(new DocumentMetadata { Title = Path.GetFileNameWithoutExtension(NomeArquivo(e.Paciente.Nome)) })
        .GeneratePdf();
    }

    /// <summary>Título de seção: texto colorido, faixa com fundo ou, no estilo "caixa", dentro de uma caixa com borda.</summary>
    private static void TituloSecao(ColumnDescriptor col, LayoutLaudo lay, string texto, float tamanho = 11, float espaco = 0)
    {
        var item = col.Item().PaddingTop(espaco);
        if (lay.EstiloTitulos == "caixa")
            item.Border(0.75f).BorderColor(lay.CorBorda).PaddingVertical(8).PaddingHorizontal(6).Text(texto).FontSize(Math.Max(tamanho, 12)).Bold().FontColor(lay.CorPrincipal);
        else if (lay.EstiloTitulos == "faixa")
            item.Background(lay.CorFundoTitulos).PaddingVertical(4).PaddingHorizontal(8).Text(texto).FontSize(Math.Max(tamanho, 11)).Bold().FontColor("#1B1B1B");
        else
            item.Text(texto).FontSize(tamanho).Bold().FontColor(lay.CorPrincipal);
    }

    private static string? ValorCampo(string id, Exame e, Paciente p) => id switch
    {
        "paciente" => p.Nome,
        "especie" => p.Especie,
        "raca" => p.Raca,
        // só o sexo, sem "(castrado/castrada)": a castração é um dado do cadastro, não aparece no laudo
        "sexo" => p.Sexo switch { "M" => "Macho", "F" => "Fêmea", "O" => "Outro", _ => null },
        "idade" => e.Idade,
        "peso" => e.Peso,
        "responsavel" => p.Tutor?.Nome,
        "solicitante" => string.Join(" ", new[] { e.SolicitanteNome, e.SolicitanteCrmv }.Where(s => !string.IsNullOrWhiteSpace(s))),
        "data" => DataBr(e.Data),
        // data e hora, uma embaixo da outra (o rótulo "Data:" vale para as duas linhas)
        "dataHora" => DataBr(e.Data) + (e.Hora is { Length: >= 4 } h ? $"\nHora: {h[..2]}:{h[2..4]}" : ""),
        "clinicaSolicitante" => e.SolicitanteClinica,
        // opcionais: só aparecem quando há valor
        "suspeita" => string.IsNullOrWhiteSpace(e.SuspeitaClinica) ? null : e.SuspeitaClinica,
        "equipamento" => string.IsNullOrWhiteSpace(e.Equipamento) ? null : e.Equipamento,
        "idAnimal" => string.IsNullOrWhiteSpace(e.IdAnimal) ? null : e.IdAnimal,
        _ => null,
    };

    /// <summary>Fotos escolhidas para a prancha (revisão) ou, se não houver escolha, as sugeridas pela IA.</summary>
    /// <summary>Sugestão inicial de fotos na prancha (uma por órgão); a clínica pode pôr quantas quiser.</summary>
    public const int SugestaoPrancha = 8;

    /// <summary>
    /// Fotos da prancha: as escolhidas na revisão; se não houve escolha, a sugestão: a primeira imagem que a IA associou a cada
    /// órgão (até 8) ou, em laudos sem essa informação, as imagens sugeridas por ela.
    /// </summary>
    private List<byte[]> FotosDaPrancha(Exame e, Laudo l, JsonElement c)
    {
        var enviadas = JsonSerializer.Deserialize<List<string>>(l.ImagensEnviadas) ?? [];
        string? Nome(int numero) => numero >= 1 && numero <= enviadas.Count ? enviadas[numero - 1] : null;
        var nomes = new List<string>();
        if (c.TryGetProperty("prancha", out var p) && p.ValueKind == JsonValueKind.Array)
            nomes = p.EnumerateArray().Select(x => x.GetString()).OfType<string>().ToList();
        else
        {
            if (c.TryGetProperty("orgaos", out var orgaos) && orgaos.ValueKind == JsonValueKind.Array)
                foreach (var o in orgaos.EnumerateArray())
                    if (o.TryGetProperty("imagens", out var im) && im.ValueKind == JsonValueKind.Array
                        && im.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => Nome(x.GetInt32())).OfType<string>().FirstOrDefault() is { } primeira
                        && !nomes.Contains(primeira))
                        nomes.Add(primeira);
            if (nomes.Count == 0 && c.TryGetProperty("imagensSugeridas", out var s) && s.ValueKind == JsonValueKind.Array)
                nomes = s.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => Nome(x.GetInt32())).OfType<string>().ToList();
            nomes = nomes.Take(SugestaoPrancha).ToList();
        }
        return nomes
            .Select(nm => arq.Arquivo(e, Arquivos.Jpg, nm)).OfType<string>()
            .Select(File.ReadAllBytes).ToList();
    }

    private static void Secao(ColumnDescriptor col, string titulo, string texto, string cor)
    {
        col.Item().Text(titulo).FontSize(11).Bold().FontColor(cor);
        col.Item().Text(texto);
    }

    private static void Lista(ColumnDescriptor col, LayoutLaudo lay, string titulo, JsonElement c, string campo)
    {
        if (!c.TryGetProperty(campo, out var a) || a.ValueKind != JsonValueKind.Array || a.GetArrayLength() == 0) return;
        TituloSecao(col, lay, titulo, 10.5f);
        foreach (var item in a.EnumerateArray())
            if (item.GetString() is { Length: > 0 } s) col.Item().PaddingLeft(8).Text($"• {s}");
    }

    private static string? Texto(JsonElement el, string campo) =>
        el.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;

    private static string? DataBr(string? d) => d is { Length: 8 } ? $"{d[6..8]}/{d[4..6]}/{d[..4]}" : d;
}

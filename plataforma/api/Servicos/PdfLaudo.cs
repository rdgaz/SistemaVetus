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
    private static readonly string Azul = "#1f3b57";
    private readonly string _urlPublica = (cfg["VETUS_URL_PUBLICA"] ?? "http://localhost:5080").TrimEnd('/');

    static PdfLaudo()
    {
        // licença gratuita da QuestPDF para empresas com faturamento anual abaixo de US$ 1 milhão
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public async Task<byte[]> Gerar(Exame e, Laudo l)
    {
        var c = JsonSerializer.Deserialize<JsonElement>(l.ConteudoRevisado ?? l.ConteudoIa);
        var logo = (await db.ImagensCadastro.FindAsync(ImagemCadastro.Logo(e.ClinicaId)))?.Conteudo;
        var assinatura = l.AssinadoPorId is { } uid ? (await db.ImagensCadastro.FindAsync(ImagemCadastro.Assinatura(uid)))?.Conteudo : null;
        var prancha = FotosDaPrancha(e, l, c);
        var assinado = l.AssinadoEm is not null;
        var urlVerificacao = l.CodigoVerificacao is { } cod ? $"{_urlPublica}/verificar/{cod}" : null;
        var qr = urlVerificacao is null ? null : new PngByteQRCode(new QRCodeGenerator().CreateQrCode(urlVerificacao, QRCodeGenerator.ECCLevel.M)).GetGraphic(8);
        var tipo = e.TipoExame is { } t && TiposExame.Todos.TryGetValue(t, out var n) ? n : "Ultrassonografia";

        return Document.Create(doc => doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(1.4f, Unit.Centimetre);
            page.DefaultTextStyle(x => x.FontSize(9.5f).LineHeight(1.25f));

            if (!assinado || l.Retificado)
                page.Foreground().AlignCenter().AlignMiddle().Rotate(-35)
                    .Text(assinado ? "RETIFICADO" : "RASCUNHO").FontSize(80).Bold().FontColor("#00000018");

            // ---- cabeçalho
            page.Header().PaddingBottom(8).BorderBottom(1.5f).BorderColor(Azul).PaddingBottom(6).Row(row =>
            {
                if (logo is not null) row.ConstantItem(70).Height(50).AlignMiddle().Image(logo).FitArea();
                row.RelativeItem().PaddingLeft(logo is null ? 0 : 10).AlignMiddle().Column(col =>
                {
                    col.Item().Text(e.Clinica.Nome).FontSize(14).Bold().FontColor(Azul);
                    var contato = string.Join(" · ", new[] { e.Clinica.Endereco, e.Clinica.Telefone, e.Clinica.Email }.Where(s => !string.IsNullOrWhiteSpace(s)));
                    if (contato.Length > 0) col.Item().Text(contato).FontSize(8).FontColor(Colors.Grey.Darken1);
                });
            });

            // ---- conteúdo
            page.Content().PaddingVertical(6).Column(col =>
            {
                col.Spacing(8);
                col.Item().AlignCenter().Text($"LAUDO — {tipo.ToUpperInvariant()}").FontSize(12).Bold().FontColor(Azul);

                col.Item().Background("#f1f4f8").Padding(8).Table(tab =>
                {
                    tab.ColumnsDefinition(cd => { cd.RelativeColumn(); cd.RelativeColumn(); cd.RelativeColumn(); });
                    void Campo(string k, string? v) => tab.Cell().PaddingVertical(1).Text(txt =>
                    {
                        txt.Span($"{k}: ").SemiBold();
                        txt.Span(string.IsNullOrWhiteSpace(v) ? "—" : v);
                    });
                    var p = e.Paciente;
                    Campo("Paciente", p.Nome);
                    Campo("Espécie", p.Especie);
                    Campo("Raça", p.Raca);
                    Campo("Sexo", p.Sexo switch { "M" => "Macho", "F" => "Fêmea", "O" => "Outro", _ => null }
                        + (p.Castrado == true ? " (castrado)" : ""));
                    Campo("Idade", e.Idade);
                    Campo("Peso", e.Peso);
                    Campo("Tutor", p.Tutor?.Nome);
                    Campo("Solicitante", string.Join(" ", new[] { e.SolicitanteNome, e.SolicitanteCrmv }.Where(s => !string.IsNullOrWhiteSpace(s))));
                    Campo("Data do exame", DataBr(e.Data));
                    if (!string.IsNullOrWhiteSpace(e.SuspeitaClinica)) Campo("Suspeita clínica", e.SuspeitaClinica);
                    if (!string.IsNullOrWhiteSpace(e.Equipamento)) Campo("Equipamento", e.Equipamento);
                });

                if (Texto(c, "condicoesTecnicas") is { } cond) Secao(col, "Condições técnicas", cond);

                col.Item().Text("Achados").FontSize(11).Bold().FontColor(Azul);
                if (c.TryGetProperty("orgaos", out var orgaos))
                    foreach (var o in orgaos.EnumerateArray())
                    {
                        var situacao = o.TryGetProperty("situacao", out var s) ? s.GetString() : "";
                        var descricao = Texto(o, "descricao") ?? (situacao == ModeloLaudo.NaoVisualizado ? "Não visualizado." : "");
                        col.Item().Text(txt =>
                        {
                            txt.Span($"{Texto(o, "orgao")}: ").Bold();
                            txt.Span(descricao);
                        });
                    }

                if (Texto(c, "impressaoDiagnostica") is { } imp)
                {
                    col.Item().PaddingTop(4).Text("Impressão diagnóstica").FontSize(11).Bold().FontColor(Azul);
                    col.Item().Text(imp);
                }
                Lista(col, "Diagnósticos diferenciais", c, "diferenciais");
                Lista(col, "Recomendações", c, "recomendacoes");
                col.Item().PaddingTop(2).Text(ModeloLaudo.Observacao).Italic().FontSize(8.5f).FontColor(Colors.Grey.Darken2);
                if (l.MotivoRetificacao is { } motivo)
                    col.Item().Text($"Retificação do laudo anterior. Motivo: {motivo}").FontSize(8.5f).FontColor(Colors.Red.Darken2);

                // ---- assinatura
                // ShowEntire: o bloco da assinatura nunca se divide entre duas páginas
                col.Item().PaddingTop(14).ShowEntire().AlignCenter().Width(260).Column(a =>
                {
                    if (assinatura is not null) a.Item().Height(55).AlignCenter().Image(assinatura).FitArea();
                    else a.Item().Height(30);
                    a.Item().BorderTop(0.8f).BorderColor(Colors.Grey.Darken1).PaddingTop(3).AlignCenter()
                        .Text(assinado ? l.AssinadoPorNome! : "Assinatura pendente").Bold();
                    if (assinado)
                    {
                        a.Item().AlignCenter().Text(l.AssinadoCrmv!).FontSize(8.5f);
                        a.Item().AlignCenter().Text($"Assinado em {l.AssinadoEm!.Value.ToLocalTime():dd/MM/yyyy HH:mm}").FontSize(8).FontColor(Colors.Grey.Darken1);
                    }
                });

                // ---- prancha de fotos
                if (prancha.Count > 0)
                {
                    // título junto com a primeira linha de fotos (não fica sozinho no fim da página)
                    col.Item().PaddingTop(12).ShowEntire().Text("Prancha de imagens").FontSize(11).Bold().FontColor(Azul);
                    col.Item().Table(tab =>
                    {
                        tab.ColumnsDefinition(cd => { cd.RelativeColumn(); cd.RelativeColumn(); });
                        foreach (var foto in prancha)
                            tab.Cell().Padding(3).Background(Colors.Black).Height(170).AlignCenter().AlignMiddle().Image(foto).FitArea();
                    });
                }
            });

            // ---- rodapé
            page.Footer().BorderTop(0.5f).BorderColor(Colors.Grey.Lighten1).PaddingTop(4).Row(row =>
            {
                row.RelativeItem().AlignMiddle().Column(f =>
                {
                    if (l.CodigoVerificacao is { } cod)
                    {
                        f.Item().Text(txt =>
                        {
                            txt.Span("Código de verificação: ").FontSize(8);
                            txt.Span(cod).FontSize(8).Bold();
                        });
                        f.Item().Text($"Confira a autenticidade em {urlVerificacao}").FontSize(7).FontColor(Colors.Grey.Darken1);
                    }
                    else f.Item().Text("Laudo não assinado (pré-visualização).").FontSize(8).FontColor(Colors.Grey.Darken1);
                    f.Item().Text(txt =>
                    {
                        txt.Span($"Versão {l.Versao} · página ").FontSize(7).FontColor(Colors.Grey.Darken1);
                        txt.CurrentPageNumber().FontSize(7).FontColor(Colors.Grey.Darken1);
                        txt.Span(" de ").FontSize(7).FontColor(Colors.Grey.Darken1);
                        txt.TotalPages().FontSize(7).FontColor(Colors.Grey.Darken1);
                    });
                });
                if (qr is not null) row.ConstantItem(52).Height(52).Image(qr).FitArea();
            });
        })).GeneratePdf();
    }

    /// <summary>Fotos escolhidas para a prancha (revisão) ou, se não houver escolha, as sugeridas pela IA.</summary>
    private List<byte[]> FotosDaPrancha(Exame e, Laudo l, JsonElement c)
    {
        var nomes = new List<string>();
        if (c.TryGetProperty("prancha", out var p) && p.ValueKind == JsonValueKind.Array)
            nomes = p.EnumerateArray().Select(x => x.GetString()).OfType<string>().ToList();
        else if (c.TryGetProperty("imagensSugeridas", out var s) && s.ValueKind == JsonValueKind.Array)
        {
            var enviadas = JsonSerializer.Deserialize<List<string>>(l.ImagensEnviadas) ?? [];
            nomes = s.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number)
                .Select(x => x.GetInt32() - 1).Where(i => i >= 0 && i < enviadas.Count).Select(i => enviadas[i]).ToList();
        }
        return nomes.Take(12)
            .Select(nm => arq.Arquivo(e.Pasta, Arquivos.Jpg, nm)).OfType<string>()
            .Select(File.ReadAllBytes).ToList();
    }

    private static void Secao(ColumnDescriptor col, string titulo, string texto)
    {
        col.Item().Text(titulo).FontSize(11).Bold().FontColor(Azul);
        col.Item().Text(texto);
    }

    private static void Lista(ColumnDescriptor col, string titulo, JsonElement c, string campo)
    {
        if (!c.TryGetProperty(campo, out var a) || a.ValueKind != JsonValueKind.Array || a.GetArrayLength() == 0) return;
        col.Item().Text(titulo).FontSize(10.5f).Bold().FontColor(Azul);
        foreach (var item in a.EnumerateArray())
            if (item.GetString() is { Length: > 0 } s) col.Item().PaddingLeft(8).Text($"• {s}");
    }

    private static string? Texto(JsonElement el, string campo) =>
        el.TryGetProperty(campo, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;

    private static string? DataBr(string? d) => d is { Length: 8 } ? $"{d[6..8]}/{d[4..6]}/{d[..4]}" : d;
}

using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos.Ia;

/// <summary>
/// Como a próxima geração será feita:
///  completa = todas as fotos (primeira vez ou pedido do veterinário);
///  dados    = sem fotos: o pré-laudo anterior + só o que mudou nos dados;
///  imagens  = o pré-laudo anterior + só as fotos novas (e o que mudou nos dados);
///  nada     = nada mudou desde o último pré-laudo.
/// </summary>
public record PlanoLaudo(
    string Modo,
    Laudo? Anterior,
    List<string> Consideradas,
    List<(int Numero, string Nome)> Enviar,
    List<string> Mudancas,
    Dictionary<string, string> Dados,
    Dictionary<string, string> Hashes,
    int Repetidas = 0);

/// <summary>Gera o pré-laudo de um exame: planeja, monta a entrada, tenta as IAs na ordem configurada e grava o resultado.</summary>
public class ServicoLaudo(VetusDb db, Arquivos arq, ConfiguracaoIa cfg, IEnumerable<IGeradorLaudo> geradores, Cobranca cobranca, ILogger<ServicoLaudo> log)
{
    /// <summary>
    /// Confere o saldo da clínica antes de gerar: análise completa exige saldo de pelo menos um pré-laudo médio;
    /// atualizações (mais baratas) exigem só saldo positivo. Devolve a mensagem de erro, ou null.
    /// </summary>
    public async Task<string?> SaldoInsuficiente(Guid clinicaId, PlanoLaudo plano)
    {
        var saldo = await cobranca.Saldo(clinicaId);
        var media = await cobranca.MediaPorLaudo(clinicaId, Disponiveis().FirstOrDefault()?.Modelo);
        var minimo = plano.Modo == Completa ? Math.Max(media, 0.01m) : 0.01m;
        return saldo >= minimo ? null
            : $"Saldo insuficiente para o pré-laudo (saldo R$ {saldo:N2}; cada pré-laudo custa em média R$ {media:N2}). Peça uma recarga de créditos.";
    }

    public const string Completa = "completa";
    public const string SoDados = "dados";
    public const string SoImagensNovas = "imagens";
    public const string Nada = "nada";

    /// <summary>IAs que serão tentadas, na ordem (a primeira é a principal).</summary>
    public List<IGeradorLaudo> Disponiveis() => cfg.Simulada
        ? geradores.Where(g => g.Nome == "simulado").ToList()
        : cfg.Ordem.Select(n => geradores.FirstOrDefault(g => g.Nome == n)).OfType<IGeradorLaudo>().Where(g => g.Configurado).ToList();

    // ------------------------------------------------------------ planejamento

    public async Task<PlanoLaudo> Planejar(Exame e, CancellationToken ct = default)
    {
        var dados = DadosAtuais(e);
        var hashes = HashesDasFotos(e.Pasta);
        var anterior = await db.Laudos.Where(l => l.ExameId == e.Id).OrderByDescending(l => l.Versao).FirstOrDefaultAsync(ct);

        // primeira vez, pedido de análise completa, a anterior não analisou imagens de verdade (simulada),
        // ou é um laudo de antes deste controle (sem a impressão digital das fotos)
        if (anterior is null || e.GerarCompleto || anterior.Ia == "simulado" && !cfg.Simulada || anterior.HashesFotos is "{}" or "")
        {
            // fotos exatamente iguais (mesma impressão digital) vão uma vez só; depois, a amostra até o limite
            var candidatas = Candidatas(hashes.Keys);
            var unicas = SemRepetidas(candidatas, hashes, []);
            var escolhidas = Amostra(unicas).ToList();
            return new PlanoLaudo(Completa, anterior, escolhidas, escolhidas.Select((n, i) => (i + 1, n)).ToList(), [], dados, hashes,
                candidatas.Count - unicas.Count);
        }

        var dadosAntes = JsonSerializer.Deserialize<Dictionary<string, string>>(anterior.DadosEntrada) ?? [];
        var hashesAntes = JsonSerializer.Deserialize<Dictionary<string, string>>(anterior.HashesFotos) ?? [];
        var consideradas = JsonSerializer.Deserialize<List<string>>(anterior.ImagensEnviadas) ?? [];

        // o que mudou nos dados (inclui o campo livre e as medidas)
        var mudancas = dados.Keys.Union(dadosAntes.Keys)
            .Select(k => (k, antes: dadosAntes.GetValueOrDefault(k, ""), agora: dados.GetValueOrDefault(k, "")))
            .Where(x => x.antes != x.agora)
            .Select(x => string.IsNullOrEmpty(x.antes) ? $"{x.k}: (antes vazio) → {x.agora}"
                : string.IsNullOrEmpty(x.agora) ? $"{x.k}: {x.antes} → (apagado)"
                : $"{x.k}: {x.antes} → {x.agora}")
            .ToList();

        // fotos novas ou substituídas (conteúdo diferente com o mesmo nome), sem as idênticas a uma já analisada
        // ou a outra nova
        var novasCandidatas = Candidatas(hashes.Where(h => !hashesAntes.TryGetValue(h.Key, out var antes) || antes != h.Value).Select(h => h.Key));
        var jaAnalisadas = consideradas.Where(hashesAntes.ContainsKey).Select(n => hashesAntes[n]).ToHashSet();
        var novasUnicas = SemRepetidas(novasCandidatas, hashes, jaAnalisadas);
        var repetidas = novasCandidatas.Count - novasUnicas.Count;
        var novas = novasUnicas.Take(cfg.MaxImagens).ToList();

        if (novas.Count == 0)
            return new PlanoLaudo(mudancas.Count > 0 ? SoDados : Nada, anterior, consideradas, [], mudancas, dados, hashes, repetidas);

        var enviar = new List<(int, string)>();
        foreach (var n in novas)
        {
            var i = consideradas.IndexOf(n);
            if (i < 0) { consideradas.Add(n); i = consideradas.Count - 1; }
            enviar.Add((i + 1, n));
        }
        return new PlanoLaudo(SoImagensNovas, anterior, consideradas, enviar, mudancas, dados, hashes, repetidas);
    }

    /// <summary>
    /// Tira as fotos exatamente iguais (mesma impressão digital SHA-1): fica a primeira pela ordem do nome.
    /// <paramref name="vistas"/> = impressões digitais já usadas (ex.: fotos analisadas na versão anterior).
    /// </summary>
    private static List<string> SemRepetidas(List<string> nomes, Dictionary<string, string> hashes, HashSet<string> vistas)
    {
        var unicas = new List<string>();
        foreach (var n in nomes)
            if (!hashes.TryGetValue(n, out var h) || h == "" || vistas.Add(h)) unicas.Add(n);
        return unicas;
    }

    /// <summary>Fotos que interessam à IA: as imagens paradas e o 1º quadro de cada vídeo.</summary>
    private static List<string> Candidatas(IEnumerable<string> nomes)
    {
        var lista = nomes.ToList();
        var paradas = lista.Where(n => !n.Contains("_quadro"));
        var videos = lista.Where(n => n.Contains("_quadro"))
            .GroupBy(n => n[..n.IndexOf("_quadro", StringComparison.Ordinal)])
            .Select(g => g.Order(StringComparer.Ordinal).First());
        return paradas.Concat(videos).Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Acima do limite, uma amostra espalhada por todo o exame.</summary>
    private IEnumerable<string> Amostra(List<string> candidatas)
    {
        if (candidatas.Count <= cfg.MaxImagens) return candidatas;
        var passo = (double)candidatas.Count / cfg.MaxImagens;
        return Enumerable.Range(0, cfg.MaxImagens).Select(i => candidatas[(int)(i * passo)]);
    }

    private Dictionary<string, string> HashesDasFotos(string pasta) =>
        arq.Listar(pasta, Arquivos.Jpg).ToDictionary(n => n, n =>
            arq.Arquivo(pasta, Arquivos.Jpg, n) is { } f ? Convert.ToHexString(SHA1.HashData(File.ReadAllBytes(f))) : "");

    /// <summary>Dados do exame que entram na análise (rótulo -> valor), na ordem em que aparecem para a IA.</summary>
    private Dictionary<string, string> DadosAtuais(Exame e)
    {
        static string SimNao(bool? b) => b is null ? "" : b.Value ? "sim" : "não";
        var p = e.Paciente;
        return new Dictionary<string, string>
        {
            ["Tipo de exame"] = e.TipoExame is { } t && TiposExame.Todos.TryGetValue(t, out var nome) ? nome : e.Tipo ?? "",
            ["Paciente"] = p.Nome,
            ["Espécie"] = p.Especie ?? "",
            ["Preset do aparelho"] = e.EspecieAparelho ?? "",
            ["Raça"] = p.Raca ?? "",
            ["Sexo"] = p.Sexo switch { "M" => "macho", "F" => "fêmea", "O" => "outro", _ => "" },
            ["Castrado"] = SimNao(p.Castrado),
            ["Idade"] = e.Idade ?? "",
            ["Peso"] = e.Peso ?? "",
            ["Data do exame"] = e.Data ?? "",
            ["Jejum"] = SimNao(e.Jejum),
            ["Suspeita clínica"] = e.SuspeitaClinica ?? "",
            ["Histórico"] = e.Historico ?? "",
            ["Solicitante"] = $"{e.SolicitanteNome} {e.SolicitanteCrmv}".Trim(),
            ["Informações adicionais"] = e.InformacoesAdicionais ?? "",
            ["Medidas do aparelho"] = string.Join('\n', MedidasTexto(e.Pasta)),
        };
    }

    private List<string> MedidasTexto(string pasta)
    {
        if (arq.LerJson(pasta, "medidas.json") is not { } json) return [];
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json).EnumerateArray().Select(m =>
                $"- {Txt(m, "grupo")} > {Txt(m, "nome")}: {(m.TryGetProperty("valor", out var v) ? v.ToString() : "")} {Txt(m, "unidade")}").ToList();
        }
        catch (JsonException) { return []; }
        static string Txt(JsonElement m, string k) => m.TryGetProperty(k, out var v) ? v.ToString() : "";
    }

    // ------------------------------------------------------------ geração

    public async Task Gerar(Guid exameId, CancellationToken ct)
    {
        var e = await db.Exames.Include(x => x.Paciente).ThenInclude(p => p.Tutor).FirstAsync(x => x.Id == exameId, ct);
        var plano = await Planejar(e, ct);
        if (plano.Modo == Nada)
        {
            // nada mudou: mantém o pré-laudo atual, sem chamar a IA (sem custo)
            e.Status = StatusExame.AguardandoRevisao;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            log.LogInformation("Pré-laudo {Paciente}: nada mudou desde a versão {V}; mantido sem chamar a IA", e.Paciente.Nome, plano.Anterior!.Versao);
            return;
        }

        if (await SaldoInsuficiente(e.ClinicaId, plano) is { } semSaldo)
        {
            e.Status = StatusExame.Erro;
            e.ErroGeracao = semSaldo;
            e.AtualizadoEm = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            log.LogWarning("Pré-laudo {Paciente}: {Erro}", e.Paciente.Nome, semSaldo);
            return;
        }

        var entrada = MontarEntrada(e, plano);
        var erros = new List<string>();
        foreach (var ia in Disponiveis())
        {
            var relogio = Stopwatch.StartNew();
            try
            {
                log.LogInformation("Pré-laudo {Paciente} ({Exame}): {Ia}, modo {Modo}, {N} imagem(ns) enviada(s), {R} repetida(s) descartada(s), {M} mudança(s)",
                    e.Paciente.Nome, e.Id, ia.Nome, plano.Modo, entrada.Imagens.Count, plano.Repetidas, plano.Mudancas.Count);
                var r = await ia.Gerar(entrada, ct);
                var conteudo = ModeloLaudo.Validar(r.Json);
                await Gravar(e, plano, r, conteudo, (int)relogio.ElapsedMilliseconds, ct);
                log.LogInformation("Pré-laudo {Paciente}: pronto por {Ia} em {S:0.0} s ({Ent} + {Sai} tokens)",
                    e.Paciente.Nome, r.Ia, relogio.Elapsed.TotalSeconds, r.TokensEntrada, r.TokensSaida);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception x)
            {
                log.LogWarning("Pré-laudo {Paciente}: {Ia} falhou: {Erro}", e.Paciente.Nome, ia.Nome, x.Message);
                erros.Add($"{ia.Nome}: {x.Message}");
            }
        }

        var msg = erros.Count == 0 ? "Nenhuma IA configurada." : string.Join(" | ", erros);
        e.Status = StatusExame.Erro;
        e.ErroGeracao = msg.Length > 1000 ? msg[..1000] : msg;
        e.AtualizadoEm = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private EntradaLaudo MontarEntrada(Exame e, PlanoLaudo plano)
    {
        var imagens = plano.Enviar
            .Select(x => arq.Arquivo(e.Pasta, Arquivos.Jpg, x.Nome) is { } f ? new ImagemIa(x.Numero, x.Nome, File.ReadAllBytes(f)) : null)
            .OfType<ImagemIa>().ToList();

        var t = new StringBuilder();
        if (plano.Modo != Completa)
        {
            var anterior = plano.Anterior!;
            t.AppendLine("ATUALIZAÇÃO DE UM PRÉ-LAUDO JÁ FEITO.");
            t.AppendLine($"As {JsonSerializer.Deserialize<List<string>>(anterior.ImagensEnviadas)!.Count} imagens do exame já foram analisadas na versão anterior (abaixo).");
            t.AppendLine(plano.Modo == SoDados
                ? "Elas NÃO são enviadas de novo: mantenha os achados de imagem da versão anterior."
                : $"Só as imagens NOVAS ou substituídas são enviadas agora (números {string.Join(", ", plano.Enviar.Select(x => x.Numero))}). Para as demais, mantenha os achados da versão anterior.");
            t.AppendLine("Considere apenas o que mudou (lista abaixo) e as imagens novas, e ajuste só o que for afetado: achados das imagens novas,");
            t.AppendLine("impressão diagnóstica, diferenciais, recomendações, condições técnicas e campos extraídos. Não reescreva descrições que não mudam.");
            t.AppendLine($"Mantenha a mesma lista de órgãos. Os números em \"imagensSugeridas\" seguem a numeração completa (1 a {plano.Consideradas.Count}).");
            t.AppendLine();
            t.AppendLine("PRÉ-LAUDO ANTERIOR (JSON):");
            t.AppendLine(anterior.ConteudoRevisado ?? anterior.ConteudoIa);
            t.AppendLine();
            t.AppendLine("O QUE MUDOU DESDE A VERSÃO ANTERIOR:");
            t.AppendLine(plano.Mudancas.Count == 0 ? "(nenhum dado mudou; só há imagens novas)" : string.Join('\n', plano.Mudancas.Select(m => "- " + m)));
            t.AppendLine();
        }

        t.AppendLine("DADOS ATUAIS DO EXAME:");
        foreach (var (k, v) in plano.Dados.Where(kv => kv.Key is not ("Informações adicionais" or "Medidas do aparelho")))
            t.AppendLine($"{k}: {(v == "" ? "não informado" : v)}");
        t.AppendLine();
        t.AppendLine("INFORMAÇÕES ADICIONAIS (escritas pela clínica):");
        t.AppendLine(plano.Dados["Informações adicionais"] is { Length: > 0 } info ? info : "(nenhuma)");
        t.AppendLine();
        t.AppendLine("MEDIDAS FEITAS NO APARELHO:");
        t.AppendLine(plano.Dados["Medidas do aparelho"] is { Length: > 0 } med ? med : "(nenhuma)");
        t.AppendLine();
        t.AppendLine("ÓRGÃOS A AVALIAR (um item em \"orgaos\" para cada um, nesta ordem):");
        foreach (var o in ModeloLaudo.OrgaosAbdominal(e.Paciente.Sexo)) t.AppendLine($"- ORGAO: {o}");
        t.AppendLine();
        t.AppendLine(imagens.Count > 0
            ? $"IMAGENS: {imagens.Count} imagem(ns) a seguir, numeradas (o exame tem {plano.Hashes.Count} fotos no total)."
            : "IMAGENS: nenhuma enviada nesta atualização.");
        return new EntradaLaudo(ModeloLaudo.Sistema, t.ToString(), imagens);
    }

    private async Task Gravar(Exame e, PlanoLaudo plano, RespostaIa r, JsonElement conteudo, int ms, CancellationToken ct)
    {
        var versao = (plano.Anterior?.Versao ?? 0) + 1;
        var valor = await cobranca.Calcular(r.Modelo, r.TokensEntrada, r.TokensSaida);
        var laudo = db.Laudos.Add(new Laudo
        {
            ExameId = e.Id, Versao = versao, Ia = r.Ia, Modelo = r.Modelo, ConteudoIa = conteudo.GetRawText(),
            Modo = plano.Modo,
            ImagensEnviadas = JsonSerializer.Serialize(plano.Consideradas),
            HashesFotos = JsonSerializer.Serialize(plano.Hashes),
            TokensEntrada = r.TokensEntrada, TokensSaida = r.TokensSaida, DuracaoMs = ms,
            CustoUsd = valor.CustoUsd, CustoBrl = valor.CustoBrl, CobradoBrl = valor.CobradoBrl,
        }).Entity;

        // campos que a IA organizou a partir do texto livre: só preenche o que está vazio
        // (o que foi digitado no formulário nunca é sobrescrito)
        if (conteudo.TryGetProperty("camposExtraidos", out var c))
        {
            string? Campo(string k) => c.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? Texto.Opcional(v.GetString()) : null;
            bool? SimNao(string k) => Campo(k)?.ToLowerInvariant() switch { "sim" => true, "nao" or "não" => false, _ => null };
            e.Paciente.Especie ??= Campo("especie");
            e.Paciente.Raca ??= Campo("raca");
            e.Paciente.Sexo ??= Campo("sexo")?.ToUpperInvariant() is "M" or "F" ? Campo("sexo")!.ToUpperInvariant() : null;
            e.SuspeitaClinica ??= Campo("suspeitaClinica");
            e.Historico ??= Campo("historico");
            e.Jejum ??= SimNao("jejum");
            e.Paciente.Castrado ??= SimNao("castrado");
            e.Peso ??= Campo("peso");
            e.Idade ??= Campo("idade");
            e.SolicitanteNome ??= Campo("solicitanteNome");
            e.SolicitanteCrmv ??= Campo("solicitanteCrmv");
        }

        // dados já com o que a IA preencheu: na próxima geração, só conta como mudança o que a clínica alterar depois
        laudo.DadosEntrada = JsonSerializer.Serialize(DadosAtuais(e));

        e.Status = StatusExame.AguardandoRevisao;
        e.GerarCompleto = false;
        e.ErroGeracao = null;
        e.AtualizadoEm = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        // cobrança: debita da clínica o custo real × fator e desconta o custo real do saldo no provedor
        if (valor.CobradoBrl > 0)
        {
            var modo = plano.Modo switch { SoDados => "atualização sem fotos", SoImagensNovas => "atualização com fotos novas", _ => "análise completa" };
            await cobranca.Movimentar(e.ClinicaId, -valor.CobradoBrl, "debito", $"Pré-laudo {e.Paciente.Nome} (versão {versao}, {modo})", e.Id);
        }
        await cobranca.DescontarProvedor(valor.CustoBrl);
    }
}

namespace Vetus.Api.Dados;

/// <summary>
/// Valores de referência iniciais (cão e gato, ultrassonografia abdominal), da literatura clássica.
/// PONTO DE PARTIDA: devem ser validados por um médico-veterinário ultrassonografista e podem ser
/// editados na tela "Referências (sistema)". Só são inseridos quando a tabela está vazia.
/// </summary>
public static class ReferenciasIniciais
{
    private const string NylandMattoon = "Nyland TG, Mattoon JS. Small Animal Diagnostic Ultrasound, 3ª ed. Elsevier, 2015.";
    private const string Penninck = "Penninck D, d'Anjou MA. Atlas of Small Animal Ultrasonography, 2ª ed. Wiley-Blackwell, 2015.";
    private const string Goggin = "Goggin JM et al. Ultrasonographic measurement of gastrointestinal wall thickness in healthy cats. JAAHA, 2000.";
    private const string Gladwin = "Gladwin NE et al. Ultrasonographic evaluation of the thickness of the wall layers in the intestinal tract of dogs. Am J Vet Res, 2014.";
    private const string Mareschal = "Mareschal A et al. Ultrasonographic measurement of kidney-to-aorta ratio in dogs. Vet Radiol Ultrasound, 2007.";

    private static Referencia R(string especie, string orgao, string medida, decimal? min, decimal? max, string unidade,
        string termos, string fonte, decimal? pesoMin = null, decimal? pesoMax = null, string? obs = null) => new()
    {
        Especie = especie, Orgao = orgao, Medida = medida, Minimo = min, Maximo = max, Unidade = unidade,
        Termos = termos, Fonte = fonte, PesoMinKg = pesoMin, PesoMaxKg = pesoMax, Observacao = obs,
    };

    public static IEnumerable<Referencia> Todas() =>
    [
        // ---------------------------------------------------------------- gatos
        R("Felina", "Rins", "Comprimento renal", 3.0m, 4.5m, "cm", "rim comp, renal comp, kidney len, rim long", NylandMattoon),
        R("Felina", "Estômago", "Espessura da parede gástrica", null, 3.6m, "mm", "estomago parede, gastric wall, stomach wall", Goggin,
            obs: "Medir entre as pregas."),
        R("Felina", "Alças intestinais", "Espessura da parede do duodeno", null, 2.4m, "mm", "duodeno, duoden", Goggin),
        R("Felina", "Alças intestinais", "Espessura da parede do jejuno", null, 2.2m, "mm", "jejuno, jejun", Goggin),
        R("Felina", "Alças intestinais", "Espessura da parede do íleo", null, 2.8m, "mm", "ileo, ileum", Goggin,
            obs: "Sem contar as pregas da mucosa."),
        R("Felina", "Alças intestinais", "Espessura da parede do cólon", null, 1.7m, "mm", "colon", Goggin),
        R("Felina", "Adrenais", "Espessura da adrenal", null, 4.8m, "mm", "adrenal", Penninck),
        R("Felina", "Pâncreas", "Espessura do pâncreas", null, 9.0m, "mm", "pancreas esp, pancreas thick, pancreas", Penninck),
        R("Felina", "Pâncreas", "Diâmetro do ducto pancreático", null, 1.3m, "mm", "ducto pancre, pancreatic duct", Penninck,
            obs: "Pode chegar a 2,5 mm em gatos idosos sem doença."),
        R("Felina", "Vesícula biliar", "Espessura da parede da vesícula", null, 1.0m, "mm", "vesicula parede, gallbladder wall", Penninck),
        R("Felina", "Vesícula biliar", "Diâmetro do ducto colédoco", null, 4.0m, "mm", "coledoco, common bile duct, cbd", Penninck),
        R("Felina", "Baço", "Espessura do baço", null, 10m, "mm", "baco, spleen", Penninck),
        R("Felina", "Linfonodos", "Espessura do linfonodo jejunal", null, 5.0m, "mm", "linfonodo jejun, jejunal lymph", Penninck),
        R("Felina", "Bexiga urinária", "Espessura da parede vesical", null, 1.7m, "mm", "bexiga parede, bladder wall", Penninck,
            obs: "Com a bexiga moderadamente distendida; a parede fica mais espessa com a bexiga vazia."),

        // ---------------------------------------------------------------- cães
        R("Canina", "Rins", "Razão rim/aorta", 5.5m, 9.1m, "razão", "rim/aorta, rim aorta, kidney/aorta, k/ao", Mareschal,
            obs: "Comprimento renal dividido pelo diâmetro da aorta."),
        R("Canina", "Estômago", "Espessura da parede gástrica", 3.0m, 5.0m, "mm", "estomago parede, gastric wall, stomach wall", Penninck,
            obs: "Medir entre as pregas."),
        R("Canina", "Alças intestinais", "Espessura da parede do duodeno", null, 5.1m, "mm", "duodeno, duoden", Gladwin, pesoMax: 20m),
        R("Canina", "Alças intestinais", "Espessura da parede do duodeno", null, 5.3m, "mm", "duodeno, duoden", Gladwin, pesoMin: 20m, pesoMax: 30m),
        R("Canina", "Alças intestinais", "Espessura da parede do duodeno", null, 6.0m, "mm", "duodeno, duoden", Gladwin, pesoMin: 30m),
        R("Canina", "Alças intestinais", "Espessura da parede do jejuno", null, 4.1m, "mm", "jejuno, jejun", Gladwin, pesoMax: 20m),
        R("Canina", "Alças intestinais", "Espessura da parede do jejuno", null, 4.4m, "mm", "jejuno, jejun", Gladwin, pesoMin: 20m, pesoMax: 30m),
        R("Canina", "Alças intestinais", "Espessura da parede do jejuno", null, 4.7m, "mm", "jejuno, jejun", Gladwin, pesoMin: 30m),
        R("Canina", "Alças intestinais", "Espessura da parede do cólon", null, 1.5m, "mm", "colon", Penninck),
        R("Canina", "Adrenais", "Espessura do polo caudal da adrenal", null, 7.4m, "mm", "adrenal", Penninck,
            obs: "O limite varia com o porte: confirme a faixa por peso na literatura adotada pela clínica."),
        R("Canina", "Vesícula biliar", "Espessura da parede da vesícula", null, 1.0m, "mm", "vesicula parede, gallbladder wall", Penninck),
        R("Canina", "Vesícula biliar", "Diâmetro do ducto colédoco", null, 3.0m, "mm", "coledoco, common bile duct, cbd", Penninck),
        R("Canina", "Bexiga urinária", "Espessura da parede vesical", 1.0m, 2.3m, "mm", "bexiga parede, bladder wall", Penninck,
            obs: "Varia com a distensão da bexiga."),
    ];
}

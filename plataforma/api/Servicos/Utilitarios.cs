namespace Vetus.Api.Servicos;

/// <summary>Respostas de erro padronizadas: sempre { "erro": "mensagem" }.</summary>
public static class Erros
{
    public static IResult Invalido(string msg) => Results.BadRequest(new { erro = msg });
    public static IResult NaoAutorizado(string msg) => Results.Json(new { erro = msg }, statusCode: 401);
    public static IResult NaoEncontrado(string msg) => Results.NotFound(new { erro = msg });
    public static IResult Conflito(string msg) => Results.Conflict(new { erro = msg });
}

public static class Texto
{
    /// <summary>Texto aparado; vazio vira null.</summary>
    public static string? Opcional(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

public static class Limites
{
    public const string Login = "login";
}

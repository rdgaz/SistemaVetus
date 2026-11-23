using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Vetus.Api.Dados;

namespace Vetus.Api.Servicos;

/// <summary>Senhas (hash PBKDF2 do ASP.NET Core Identity) e tokens aleatórios.</summary>
public static class Seguranca
{
    public const int TamanhoMinimoSenha = 8;
    private static readonly PasswordHasher<Usuario> Hasher = new();

    public static string HashSenha(Usuario u, string senha) => Hasher.HashPassword(u, senha);

    public static bool ConferirSenha(Usuario u, string senha) =>
        !string.IsNullOrEmpty(u.SenhaHash) &&
        Hasher.VerifyHashedPassword(u, u.SenhaHash, senha) != PasswordVerificationResult.Failed;

    /// <summary>Senha provisória legível (sem caracteres confundíveis como 0/O, 1/l).</summary>
    public static string GerarSenhaProvisoria()
    {
        const string letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return RandomNumberGenerator.GetString(letras, 10);
    }

    public static string GerarToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

    public static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static string? ValidarSenhaNova(string? senha) =>
        string.IsNullOrWhiteSpace(senha) || senha.Length < TamanhoMinimoSenha
            ? $"A senha precisa ter pelo menos {TamanhoMinimoSenha} caracteres."
            : null;

    public static string NormalizarEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();
}

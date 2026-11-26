# Plataforma Vetus: API .NET + telas React numa única imagem
# 1) compila as telas (React)
FROM node:22-slim AS front
WORKDIR /front
COPY front/package.json front/package-lock.json ./
RUN npm ci
COPY front/ ./
RUN npm run build

# 2) compila a API (.NET)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY api/Vetus.Api.csproj ./
RUN dotnet restore
COPY api/ ./
RUN dotnet publish -c Release -o /out --no-restore

# 3) imagem final: só o runtime + a API + as telas em wwwroot
FROM mcr.microsoft.com/dotnet/aspnet:11.0
WORKDIR /app
COPY --from=api /out ./
COPY --from=front /front/dist ./wwwroot
# libgssapi: o driver do PostgreSQL procura essa biblioteca ao conectar (sem ela, gera erro no log)
# /keys: chaves do cookie de login (volume); /pendrive: exames enviados do pendrive (volume). Graváveis pelo usuário "app"
# libfontconfig1 + fonts-dejavu: o gerador de PDF (QuestPDF/SkiaSharp) precisa de fontes no Linux
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 libfontconfig1 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /keys /pendrive && chown app /keys /pendrive
ENV ASPNETCORE_HTTP_PORTS=8080 \
    VETUS_CHAVES_DIR=/keys \
    VETUS_PENDRIVE_DIR=/pendrive
EXPOSE 8080
USER app
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["dotnet", "Vetus.Api.dll", "--saude"]
ENTRYPOINT ["dotnet", "Vetus.Api.dll"]

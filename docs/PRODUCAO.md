# Produção na VPS

Como o AutoLaudoVet roda em produção. Arquivos em [`producao/`](../producao/).

## Onde

- VPS Hostinger `srv2204829` (KVM 2, Ubuntu 24.04 com Docker), firewall da Hostinger liberando só 22, 80, 443, 2345,
  2762 e ICMP.
- Portal: **https://app.autolaudovet.tech**. Receptor DICOM: **dicom.autolaudovet.tech** (2762 com TLS, 2345 sem TLS).
- Pasta no servidor: `/opt/vetus/producao` (`docker-compose.yml`, `Caddyfile`, `.env`, `.env.receptor`, `backup.sh`).

## Containers

| Container | Imagem | Exposto |
|---|---|---|
| `vetus-caddy` | `caddy:2-alpine` | 80, 443 |
| `vetus-plataforma` | `ghcr.io/rdgaz/vetus-plataforma` | não (só via Caddy) |
| `vetus-postgres` | `postgres:17-alpine` | não |
| `vetus-receptor-nuvem` | `ghcr.io/rdgaz/vetus-receptor-dicom-claud` | 2345, 2762 |

## Regras

1. **A VPS não constrói nada.** As imagens são publicadas pelo GitHub Actions (Run workflow → "publicar"), depois de
   lint, segredos, CodeQL e todos os testes. Na VPS: `docker compose pull && docker compose up -d`.
2. **Segredos só no servidor** (`.env` e `.env.receptor`, permissão 600), gerados lá. Os exemplos estão em `producao/`.
3. **A API confia no proxy só pelo IP fixo do Caddy** (`VETUS_PROXY_IP=172.30.0.10`), para ter o IP real no limite de
   logins e o cookie com `Secure`. Sem a variável (local, CI), os cabeçalhos `X-Forwarded-*` são ignorados.
4. **Backup diário do banco e semanal dos arquivos** (`backup.sh`, cron), em `/opt/vetus/backups`. Ainda no mesmo
   servidor: a cópia para fora (Backblaze) é a etapa 6 do [PLANO-INGESTAO](PLANO-INGESTAO.md).
5. **Uma produção só.** Depois da migração (26/11/2026), o Docker do computador do responsável deixa de ser produção:
   serve para desenvolvimento e testes, sem dados reais novos.

## Publicar uma versão

1. Commit e push no `main` (com a versão subida por `node ferramentas/deploy.js --sem-docker --nota "..."`).
2. GitHub → Actions → **Validar containers** → Run workflow → marcar **publicar**.
3. Na VPS: `cd /opt/vetus/producao && docker compose pull plataforma && docker compose up -d plataforma`.
4. Voltar uma versão: `VERSAO_PLATAFORMA=<versão>` no `.env` e `docker compose up -d plataforma`.

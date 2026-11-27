#!/bin/sh
# Backup da produção (VPS). Roda pelo cron do usuário vetus (ver docs/PRODUCAO.md):
#   - banco: todo dia, pg_dump compactado (formato custom), guarda 14 dias
#   - arquivos (exames, pendrive, chaves): todo domingo, tar.gz, guarda 4 semanas
# Os backups ficam em /opt/vetus/backups (fora dos volumes do Docker). Ainda estão no MESMO servidor: a cópia para
# fora (Backblaze) é a etapa 6 do PLANO-INGESTAO; até lá, baixe de vez em quando para o seu computador.
set -eu
DESTINO=/opt/vetus/backups
DIA=$(date +%Y-%m-%d)
mkdir -p "$DESTINO/banco" "$DESTINO/arquivos"
umask 077   # backups têm dados de pacientes: só o dono lê

# banco (consistente com o sistema no ar)
docker exec vetus-postgres pg_dump -U vetus -d vetus -Fc > "$DESTINO/banco/vetus-$DIA.dump.tmp"
mv "$DESTINO/banco/vetus-$DIA.dump.tmp" "$DESTINO/banco/vetus-$DIA.dump"
find "$DESTINO/banco" -name 'vetus-*.dump' -mtime +14 -delete

# arquivos: só aos domingos (ou com "--arquivos")
if [ "$(date +%u)" = 7 ] || [ "${1:-}" = "--arquivos" ]; then
  docker run --rm \
    -v vetus-dados:/v/dados:ro -v vetus-pendrive:/v/pendrive:ro -v vetus-chaves:/v/chaves:ro \
    -v "$DESTINO/arquivos":/saida alpine \
    tar -czf "/saida/arquivos-$DIA.tar.gz" -C /v .
  find "$DESTINO/arquivos" -name 'arquivos-*.tar.gz' -mtime +28 -delete
fi

logger -t vetus-backup "backup concluído ($DIA)"

#!/usr/bin/env bash
# Nightly PostgreSQL backup for POD (installed as /etc/cron.d/pod-backup by deploy.sh).
# Keeps 14 days of compressed dumps in /home/ubuntu/backups/pod.
# Restore: gunzip -c FILE | docker exec -i pod-postgres psql -U pod -d pod
set -euo pipefail

DEST=/home/ubuntu/backups/pod
KEEP_DAYS=14
mkdir -p "$DEST"
chmod 700 "$DEST"

file="$DEST/pod-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec pod-postgres pg_dump -U pod -d pod --no-owner --clean --if-exists | gzip -9 > "$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"
find "$DEST" -name 'pod-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $file ($(du -h "$file" | cut -f1))"

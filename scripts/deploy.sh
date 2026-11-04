#!/usr/bin/env bash
# Deploy the committed HEAD of POD to the shared Contabo VPS.
# Usage (Git Bash):  bash scripts/deploy.sh
# Steps: upload → API typecheck+tests (Docker) → build → migrate+start → smoke test.
# Only committed code is deployed (git archive), never local .env files.
set -euo pipefail

SERVER="${POD_SERVER:-root@144.91.74.148}"
REMOTE_DIR="/home/ubuntu/docker/websites/pod"
DOMAIN="pod.supersoftltd.com"
COMPOSE="docker compose --env-file $REMOTE_DIR/.env -f $REMOTE_DIR/app/infrastructure/production/docker-compose.yml"

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes — commit first (only HEAD is deployed)." >&2
  exit 1
fi
REV="$(git rev-parse --short HEAD)"
echo "==> Deploying $REV to $SERVER"

# 1. Upload source into a staging dir
git archive --format=tar HEAD | ssh "$SERVER" "
  set -e
  rm -rf $REMOTE_DIR/app.new && mkdir -p $REMOTE_DIR/app.new
  tar -x -C $REMOTE_DIR/app.new
  echo $REV > $REMOTE_DIR/app.new/REVISION
"

# 2. Secrets (first deploy only) and API tests — abort before touching live containers on failure
ssh "$SERVER" "
  set -e
  if [ ! -f $REMOTE_DIR/.env ]; then
    umask 077
    printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \"\$(openssl rand -hex 24)\" \"\$(openssl rand -hex 24)\" > $REMOTE_DIR/.env
    echo '    created $REMOTE_DIR/.env with generated secrets'
  fi
  # file-URL signing key: generated once, never printed
  if ! grep -q '^FILES_SIGNING_KEY=' $REMOTE_DIR/.env; then
    printf 'FILES_SIGNING_KEY=%s\n' \"\$(openssl rand -base64 32)\" >> $REMOTE_DIR/.env
  fi
  if ! grep -q '^PRINTIFY_WEBHOOK_SECRET=' $REMOTE_DIR/.env; then
    printf 'PRINTIFY_WEBHOOK_SECRET=%s\n' \"\$(openssl rand -hex 32)\" >> $REMOTE_DIR/.env
  fi
  echo '==> API typecheck + tests'
  docker build --target test -q -t pod-api-test $REMOTE_DIR/app.new/apps/api >/dev/null
  docker image rm pod-api-test >/dev/null
  echo '    passed'
"

# 3. Swap source, build images, migrate + (re)start
ssh "$SERVER" "
  set -e
  rm -rf $REMOTE_DIR/app.prev
  [ -d $REMOTE_DIR/app ] && mv $REMOTE_DIR/app $REMOTE_DIR/app.prev
  mv $REMOTE_DIR/app.new $REMOTE_DIR/app
  # persistent files (uploads, print files) owned by the API user (uid 1001), private
  mkdir -p $REMOTE_DIR/data/files
  chown -R 1001:1001 $REMOTE_DIR/data
  chmod 700 $REMOTE_DIR/data
  $COMPOSE build
  $COMPOSE up -d --remove-orphans
  docker image prune -f >/dev/null
  docker builder prune -f --keep-storage 4gb >/dev/null 2>&1 || true

  # nightly DB backup at 03:50 server time
  install -m 755 $REMOTE_DIR/app/infrastructure/production/backup.sh /usr/local/bin/pod-backup
  echo '50 3 * * * root /usr/local/bin/pod-backup >> /var/log/pod-backup.log 2>&1' > /etc/cron.d/pod-backup
  chmod 644 /etc/cron.d/pod-backup

  # keep the Nginx site config in sync (only once the domain is enabled; reload only if valid)
  SITE=/home/ubuntu/docker/proxy/data/nginx/custom/sites/pod.conf
  NEW=$REMOTE_DIR/app/infrastructure/production/nginx/pod.conf
  if [ -f \$SITE ] && ! cmp -s \$NEW \$SITE; then
    cp \$SITE /root/pod.conf.bak
    cp \$NEW \$SITE
    if docker exec npm nginx -t >/dev/null 2>&1; then
      docker exec npm nginx -s reload && echo '    nginx site config updated'
    else
      cp /root/pod.conf.bak \$SITE
      echo '    nginx config test failed; kept the previous config' >&2
    fi
  fi
"

# 4. Smoke test from inside the proxy network
ssh "$SERVER" "
  for i in \$(seq 1 40); do
    docker exec npm sh -c 'curl -fs -o /dev/null http://pod-web:3000/ && curl -fs -o /dev/null http://pod-api:4000/api/v1/health/ready' && break
    sleep 3
  done
  docker exec npm sh -c 'curl -s -o /dev/null -w \"web   -> HTTP %{http_code}\n\" http://pod-web:3000/; curl -s -w \"\nready -> %{http_code}\n\" http://pod-api:4000/api/v1/health/ready'
  docker ps --filter name=pod-worker --format 'worker -> {{.Status}}'
"
echo "==> Done: https://$DOMAIN (revision $REV)"

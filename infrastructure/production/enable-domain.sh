#!/usr/bin/env bash
# Run ON THE VPS once, after DNS for the domain points to this server:
#   bash /home/ubuntu/docker/websites/pod/app/infrastructure/production/enable-domain.sh
# Issues a Let's Encrypt certificate (host certbot, webroot) and installs the nginx site
# into Nginx Proxy Manager's custom config. Safe to re-run.
set -euo pipefail

DOMAIN="${1:-pod.supersoftltd.com}"
SERVER_IP="144.91.74.148"
PROXY=/home/ubuntu/docker/proxy
SITES=$PROXY/data/nginx/custom/sites
ACME=$SITES/00-acme.conf
HERE="$(cd "$(dirname "$0")" && pwd)"

resolved="$(dig +short A "$DOMAIN" @1.1.1.1 | tail -1)"
if [ "$resolved" != "$SERVER_IP" ]; then
  echo "DNS for $DOMAIN resolves to '${resolved:-nothing}', expected $SERVER_IP. Add the A record first." >&2
  exit 1
fi

reload_proxy() { docker exec npm nginx -t && docker exec npm nginx -s reload; }

# 1. Port 80: serve ACME challenges for this domain (backup first)
if ! grep -q "$DOMAIN" "$ACME"; then
  cp "$ACME" "/root/00-acme.conf.bak-$(date +%Y%m%d%H%M%S)"
  sed -i "s/server_name supersoftltd.com /server_name supersoftltd.com $DOMAIN /" "$ACME"
  reload_proxy
fi

# 2. Certificate
certbot certonly --webroot -w "$PROXY/acme" -d "$DOMAIN" \
  --non-interactive --agree-tos --keep-until-expiring -m shamol3388@gmail.com

# 3. HTTPS site
cp "$HERE/nginx/pod.conf" "$SITES/pod.conf"
if ! reload_proxy; then
  rm -f "$SITES/pod.conf"
  docker exec npm nginx -s reload || true
  echo "nginx config test failed — site removed, proxy unchanged." >&2
  exit 1
fi

curl -s -o /dev/null -w "https://$DOMAIN -> HTTP %{http_code}\n" "https://$DOMAIN/"

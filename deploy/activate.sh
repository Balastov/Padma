#!/usr/bin/env bash
# Run on the Padma server as root after uploading a complete release.
set -Eeuo pipefail
release=${1:?Usage: activate.sh /var/www/padma/releases/RELEASE}
[[ "$release" =~ ^/var/www/padma/releases/[A-Za-z0-9._-]+$ ]]
test -f "$release/dist/index.html"
test -f "$release/server/index.mjs"
test -f /var/lib/padma/padma.sqlite
test -x /opt/padma/node/bin/node
# Production Node deps (web-push). Prefer modules packed into the release;
# otherwise install from package.json so older autodeploy scripts still work.
if ! test -d "$release/node_modules/web-push"; then
  /opt/padma/node/bin/npm install --omit=dev --no-audit --no-fund --prefix "$release"
  chown -R padma:padma "$release/node_modules"
fi
test -d "$release/node_modules/web-push"
previous=$(readlink /var/www/padma/current)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/var/backups/padma/$stamp
install -d -m 700 "$backup"
cp /etc/nginx/sites-available/padma "$backup/nginx.conf"
had_service=false
if systemctl is-active --quiet padma.service; then
  had_service=true
  cp /etc/systemd/system/padma.service "$backup/padma.service"
fi
rollback() {
  trap - ERR
  ln -sfn "$previous" /var/www/padma/current.rollback
  mv -Tf /var/www/padma/current.rollback /var/www/padma/current
  cp "$backup/nginx.conf" /etc/nginx/sites-available/padma
  if "$had_service"; then
    cp "$backup/padma.service" /etc/systemd/system/padma.service
    systemctl daemon-reload
    systemctl restart padma
  else
    systemctl stop padma || true
  fi
  nginx -t && systemctl reload nginx
  echo 'Padma activation failed; previous release restored.' >&2
  exit 1
}
trap rollback ERR
# Keep the old static Nginx workers functional during the first configuration reload.
for asset in "$release"/dist/*; do
  name=$(basename "$asset")
  if ! test -e "$release/$name"; then ln -s "dist/$name" "$release/$name"; fi
done
install -d -m 750 /etc/padma
if ! test -f /etc/padma/padma.env; then
  install -m 600 "$release/deploy/padma.env.example" /etc/padma/padma.env
fi
# Consistent SQLite snapshot before activation. Data is never replaced during updates.
runuser -u padma -- env PADMA_DB=/var/lib/padma/padma.sqlite PADMA_BACKUP_DIR=/var/lib/padma/backups /opt/padma/node/bin/node "$release/scripts/backup.mjs"
install -m 644 "$release/deploy/padma.service" /etc/systemd/system/padma.service
install -m 644 "$release/deploy/padma-backup.service" /etc/systemd/system/padma-backup.service
install -m 644 "$release/deploy/padma-backup.timer" /etc/systemd/system/padma-backup.timer
ln -sfn "$release" /var/www/padma/current.next
mv -Tf /var/www/padma/current.next /var/www/padma/current
systemctl daemon-reload
systemctl enable padma.service
systemctl restart padma.service
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:3001/api/health >/dev/null
install -m 644 "$release/deploy/padma.nginx" /etc/nginx/sites-available/padma
nginx -t
systemctl reload nginx
https_ready=false
for attempt in {1..20}; do
  if response=$(curl -fsS --max-time 5 --resolve www.padma.ru:443:127.0.0.1 https://www.padma.ru/api/health) && [[ "$response" == '{"ok":true}' ]]; then
    https_ready=true
    break
  fi
  sleep 1
done
"$https_ready"
systemctl enable --now padma-backup.timer
echo "Padma active: $release (previous: $previous)"

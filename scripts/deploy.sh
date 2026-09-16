#!/usr/bin/env bash
# Explicit manual deployment; this is not run by a git push.
set -euo pipefail
cd "$(dirname "$0")/.."
if test -n "$(git status --porcelain)"; then
  echo 'Commit the working tree before deploying.' >&2
  exit 1
fi
npm run lint
npm test
npm run build
revision=$(git rev-parse --short HEAD)
release="$(date -u +%Y%m%dT%H%M%SZ)-$revision"
archive=$(mktemp /tmp/padma-release.XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
COPYFILE_DISABLE=1 tar -czf "$archive" dist server scripts/backup.mjs deploy package.json src/api.ts src/calendarLayout.ts
ssh_args=(-o BatchMode=yes -i "${PADMA_SSH_KEY:-$HOME/.ssh/id_ed25519}")
remote="${PADMA_SSH_TARGET:-user1@176.108.246.144}"
scp "${ssh_args[@]}" "$archive" "$remote:/tmp/padma-$release.tar.gz"
ssh "${ssh_args[@]}" "$remote" "set -eu; sudo install -d /var/www/padma/releases/$release; sudo tar --no-same-owner -xzf /tmp/padma-$release.tar.gz -C /var/www/padma/releases/$release; rm /tmp/padma-$release.tar.gz; cd /var/www/padma/releases/$release; sudo /opt/padma/node/bin/node --test server/*.test.mjs; sudo bash deploy/activate.sh /var/www/padma/releases/$release"
curl --fail --show-error --max-time 20 https://www.padma.ru/api/health

#!/usr/bin/env bash
set -Eeuo pipefail
export PATH=/opt/padma/node/bin:/usr/sbin:/usr/bin:/sbin:/bin
export GIT_TERMINAL_PROMPT=0
state=/var/lib/padma-autodeploy
cache=/var/cache/padma-autodeploy
repo=https://github.com/Balastov/Padma.git
exec 9>/run/lock/padma-autodeploy.lock
flock -n 9 || exit 0
as_builder() { runuser -u padma-build -- env PATH="$PATH" GIT_TERMINAL_PROMPT=0 "$@"; }
if ! test -d "$cache/repo.git"; then
  as_builder git clone --bare "$repo" "$cache/repo.git"
fi
as_builder git --git-dir="$cache/repo.git" fetch --no-tags origin +refs/heads/main:refs/heads/main
revision=$(as_builder git --git-dir="$cache/repo.git" rev-parse refs/heads/main)
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
if test -f "$state/deployed" && [[ $(cat "$state/deployed") == "$revision" ]]; then
  echo "Already deployed: $revision"
  exit 0
fi
if test -f "$state/failed" && [[ $(cat "$state/failed") == "$revision" ]]; then
  echo "Revision $revision previously failed; inspect journal, then use PADMA_RETRY=1 to retry." >&2
  [[ ${PADMA_RETRY:-0} == 1 ]] || exit 1
fi
work=$(mktemp -d "$cache/build.XXXXXXXX")
chown padma-build:padma-build "$work"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
failed() { printf '%s\n' "$revision" > "$state/failed"; echo "Deployment failed: $revision" >&2; }
trap failed ERR
as_builder git --git-dir="$cache/repo.git" --work-tree="$work" checkout -f "$revision" -- .
as_builder bash -c 'set -e; cd "$1"; npm ci --no-audit --no-fund; npm run lint; npm test; npm run build' _ "$work"
# Do not activate an obsolete build if main advanced while checks were running.
latest=$(as_builder git ls-remote "$repo" refs/heads/main | cut -f1)
if [[ "$latest" != "$revision" ]]; then
  echo 'main changed during build; a later timer run will build the new version.'
  exit 0
fi
release="/var/www/padma/releases/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}"
install -d -m 755 "$release"
tar -C "$work" -cf - dist server scripts/backup.mjs deploy package.json src/api.ts src/calendarLayout.ts | tar --no-same-owner -xf - -C "$release"
printf '%s\n' "$revision" > "$release/REVISION"
bash "$release/deploy/activate.sh" "$release"
printf '%s\n' "$revision" > "$state/deployed.next"
mv "$state/deployed.next" "$state/deployed"
rm -f "$state/failed"
echo "Deployment successful: $revision"

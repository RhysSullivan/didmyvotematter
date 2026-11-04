#!/usr/bin/env bash
# Pulls the latest results and redeploys didmyvotematter.com when they've
# changed. Run by the decided-by-refresh systemd timer (see deploy/).
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --quiet --ff-only
bun install --frozen-lockfile --silent
bun run --silent data

# fetchedAt changes on every run; everything else changes only with the results.
hash=$(jq -c 'del(.fetchedAt)' public/races.json | sha256sum | cut -d' ' -f1)
stamp=data/raw/deployed.sha256
if [[ -f "$stamp" && "$(cat "$stamp")" == "$hash" ]]; then
  echo "results unchanged; not deploying"
  exit 0
fi

agent-vault run --env 'CLOUDFLARE_API_TOKEN=op://Agents/Cloudflare API Token/credential' -- bun run deploy
echo "$hash" > "$stamp"
echo "deployed results updated $(jq -r .resultsUpdatedAt public/races.json)"

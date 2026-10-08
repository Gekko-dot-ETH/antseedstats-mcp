#!/usr/bin/env bash
# Deploys the hosted MCP to the AntSeedStats production box (same box as antseedstats.com).
#
#   bash scripts/deploy.sh
#
# Build and tests run HERE; prod receives dist/, bin/, package files and the pm2 config by rsync, installs
# production dependencies, and reloads the ONE pm2 app `antseed-mcp` by name. SSH over Tailscale only.
# nginx maps https://antseedstats.com/mcp to 127.0.0.1:3200 (configured once, by hand, with Gekko's OK).
set -euo pipefail

SERVER="root@100.81.214.95"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
APP_USER="antseedstats"
REMOTE_PATH="/home/antseedstats/projects/antseedstats-mcp"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -o ConnectTimeout=20 -i "$SSH_KEY" "$SERVER")

say(){ printf '\n\033[1;32m=== %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

say "[1/5] Build and test locally"
cd "$REPO_DIR"
VERSION=$(node -p "require('./package.json').version")
npm run build
npm test

say "[2/5] Pre-flight on prod"
PROD_NODE=$("${SSH[@]}" "runuser -u $APP_USER -- node --version") || die "cannot reach prod over Tailscale"
LOCAL_NODE=$(node --version)
[[ "${PROD_NODE%%.*}" == "${LOCAL_NODE%%.*}" ]] || die "node major mismatch: dev $LOCAL_NODE vs prod $PROD_NODE"
echo "  node dev $LOCAL_NODE / prod $PROD_NODE; deploying $VERSION"
"${SSH[@]}" "install -d -o $APP_USER -g $APP_USER $REMOTE_PATH"

say "[3/5] rsync artifact"
rsync -az --delete -e "ssh -i $SSH_KEY" \
  --rsync-path="rsync" \
  dist bin package.json package-lock.json ecosystem.config.cjs README.md LICENSE CHANGELOG.md \
  "$SERVER:$REMOTE_PATH/"
"${SSH[@]}" "chown -R $APP_USER:$APP_USER $REMOTE_PATH"

say "[4/5] Install production deps, reload antseed-mcp (by name)"
# set -o pipefail travels INSIDE the remote command: without it a failed npm ci would exit 0 through tail and
# pm2 would reload onto a half-installed node_modules.
"${SSH[@]}" "set -o pipefail; cd $REMOTE_PATH && runuser -u $APP_USER -- npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2 \
  && runuser -u $APP_USER -- pm2 startOrReload ecosystem.config.cjs --only antseed-mcp --update-env \
  && runuser -u $APP_USER -- pm2 save >/dev/null" || die "remote install/reload failed; prod process left as it was"

say "[5/5] Health"
sleep 2
HEALTH=$("${SSH[@]}" "curl -s -m 10 http://127.0.0.1:3200/health") || die "health request failed"
echo "  $HEALTH"
echo "$HEALTH" | grep -q '"status":"ok"' || die "MCP up but API not reachable from it (api_ok false?)"
echo "  listening: $("${SSH[@]}" "ss -ltn | grep ':3200 ' | awk '{print \$4}'")"
echo
echo "Deployed @antseedstats/mcp-server $VERSION. Public check:"
echo "  curl -s -X POST https://antseedstats.com/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | head -c 300"

#!/usr/bin/env bash

set -euo pipefail

REMOTE_HOST="${1:-mirror}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-~/PlantCareTrackerV2}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Déploiement vers ${REMOTE_HOST}:${REMOTE_APP_DIR}"

echo "==> Copie du projet"
rsync -av --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "apps/api/node_modules" \
  --exclude "apps/web/node_modules" \
  --exclude "packages/shared/node_modules" \
  --exclude "apps/api/dist" \
  --exclude "apps/web/dist" \
  --exclude "apps/web/android/.gradle" \
  --exclude "apps/web/android/app/build" \
  "${ROOT_DIR}/" \
  "${REMOTE_HOST}:${REMOTE_APP_DIR}/"

echo "==> Copie de la base SQLite"
rsync -av \
  "${ROOT_DIR}/apps/api/prisma/dev.db" \
  "${REMOTE_HOST}:${REMOTE_APP_DIR}/apps/api/prisma/dev.db"

echo "==> Copie des photos"
rsync -av --delete \
  "${ROOT_DIR}/apps/api/uploads/" \
  "${REMOTE_HOST}:${REMOTE_APP_DIR}/apps/api/uploads/"

echo "==> Installation et build sur le Pi"
ssh "${REMOTE_HOST}" "
  set -euo pipefail
  cd ${REMOTE_APP_DIR}
  if ! command -v node >/dev/null 2>&1; then
    echo 'Erreur: Node.js n est pas installe sur le Pi.'
    echo 'Installe Node.js 20+ puis relance le script.'
    exit 1
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    if command -v corepack >/dev/null 2>&1; then
      if ! corepack enable; then
        echo 'corepack enable a echoue, tentative via npm.'
      fi
      if ! corepack prepare pnpm@latest --activate; then
        echo 'Activation via corepack echouee, tentative via npm.'
        npm install -g pnpm
      fi
    fi
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo 'Erreur: pnpm est introuvable meme apres tentative d installation.'
    echo 'Installe pnpm sur le Pi puis relance le script.'
    exit 1
  fi
  pnpm install
  pnpm --filter api db:generate
  pnpm --filter api db:migrate:prod
  pnpm --filter @plantcare/shared build
  pnpm --filter api build
  pnpm --filter web build
"

cat <<EOF

Déploiement terminé.

Étapes suivantes sur le Pi :
1. Vérifier apps/api/.env et y mettre la bonne OPENAI_API_KEY.
2. Lancer un test manuel :
   ssh ${REMOTE_HOST}
   cd ${REMOTE_APP_DIR}/apps/api
   node dist/server.js

3. Installer le service systemd si tout fonctionne :
   sudo cp ${REMOTE_APP_DIR}/deploy/plantcare.service /etc/systemd/system/plantcare.service
   sudo nano /etc/systemd/system/plantcare.service
   sudo systemctl daemon-reload
   sudo systemctl enable plantcare
   sudo systemctl start plantcare
   sudo systemctl status plantcare

EOF

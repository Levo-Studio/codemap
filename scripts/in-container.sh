#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Runs a command inside the Playwright container that CI uses for the visual
# tests, so renders on any machine match the ones in docs/design-screenshots/.
# node_modules live in named volumes: the host's are built for the host's
# platform and cannot run in the Linux container.
#
#   scripts/in-container.sh pnpm test:visual

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
image=mcr.microsoft.com/playwright:v1.63.0-noble

# The pnpm store gets a volume too; otherwise pnpm puts it inside the
# checkout, next to the project it installs.
volumes=(-v "$root":/work -v codemap-node-modules:/work/node_modules -v codemap-pnpm-store:/pnpm-store)
for package in "$root"/packages/*/; do
  name=$(basename "$package")
  volumes+=(-v "codemap-node-modules-$name:/work/packages/$name/node_modules")
done
if [ -n "${CODEMAP_SUPPORT_JS:-}" ]; then
  volumes+=(-v "$CODEMAP_SUPPORT_JS":/support/support.js:ro)
fi

docker run --rm --ipc=host "${volumes[@]}" -e npm_config_store_dir=/pnpm-store -w /work "$image" \
  bash -c 'corepack enable >/dev/null && pnpm install --frozen-lockfile >/dev/null && "$@"' -- "$@"

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
image=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27

key=$(printf '%s' "$root" | shasum | cut -c1-12)
volumes=(-v "$root":/work -v "codemap-$key-node-modules":/work/node_modules -v "codemap-$key-pnpm-store":/pnpm-store)
for package in "$root"/packages/*/; do
  name=$(basename "$package")
  volumes+=(-v "codemap-$key-node-modules-$name:/work/packages/$name/node_modules")
done
if [ -n "${CODEMAP_SUPPORT_JS:-}" ]; then
  volumes+=(-v "$CODEMAP_SUPPORT_JS":/support/support.js:ro)
fi

docker run --rm --ipc=host "${volumes[@]}" -e npm_config_store_dir=/pnpm-store -w /work "$image" \
  bash -c 'corepack enable >/dev/null && pnpm install --frozen-lockfile >/dev/null && "$@"' -- "$@"

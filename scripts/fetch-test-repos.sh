#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Clones the open-source projects Codemap is tried on into .cache/test-repos/,
# each at a fixed commit so a map of it stays comparable. They are never
# committed here; .cache/ is ignored.
#
#   scripts/fetch-test-repos.sh

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
target="$root/.cache/test-repos"
mkdir -p "$target"

# name, repository, commit
repos=(
  "taxonomy https://github.com/shadcn-ui/taxonomy.git 298a8857c7128a0d121e7f699dfd729f23b3966d"
)

for entry in "${repos[@]}"; do
  read -r name url commit <<<"$entry"
  dir="$target/$name"
  if [ ! -d "$dir/.git" ]; then
    git clone --quiet --filter=blob:none --no-checkout "$url" "$dir"
  fi
  git -C "$dir" fetch --quiet origin "$commit"
  git -C "$dir" checkout --quiet --detach "$commit"
  echo "$name at $commit"
done

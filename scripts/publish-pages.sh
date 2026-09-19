#!/usr/bin/env bash
set -euo pipefail

source_dir=$(pwd)
pages_dir=$(mktemp -d)
trap 'rm -rf "$pages_dir"' EXIT

# Preserve deployment history; a concurrent update fails instead of overwriting it.
git clone --quiet --single-branch --branch gh-pages \
  "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "$pages_dir"
rsync -a --delete --exclude '.git' --exclude '.github' --exclude 'screenshots' \
  "$source_dir/" "$pages_dir/"
git -C "$pages_dir" config user.name "github-actions[bot]"
git -C "$pages_dir" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$pages_dir" add -A
if git -C "$pages_dir" diff --cached --quiet; then exit 0; fi
git -C "$pages_dir" commit -m "deploy: publish NPICK"
git -C "$pages_dir" push origin gh-pages

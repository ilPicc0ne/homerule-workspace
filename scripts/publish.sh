#!/usr/bin/env bash
# Build the public copy of HomeRule: only the paths in .publish-paths, with their history.
set -euo pipefail
SRC="$(git rev-parse --show-toplevel)"
OUT="${TMPDIR:-/tmp}/homerule-public"
rm -rf "$OUT"
git clone --quiet --no-local "$SRC" "$OUT"
cd "$OUT"
git filter-repo --quiet --force --paths-from-file "$SRC/.publish-paths"
echo "== Files that would be public =="; git ls-files
echo "== Commits =="; git log --oneline | head -50
echo "== Planning-only words (should be empty) =="
git grep -n -i -E "wispr|official use only|villain|notes/meetings|funnel/notes" $(git rev-list --all) -- . 2>/dev/null | head -20 || true
if [[ "${1:-}" == "--push" ]]; then
  gh repo view ilPicc0ne/homerule >/dev/null 2>&1 || gh repo create ilPicc0ne/homerule --private
  git remote add origin https://github.com/ilPicc0ne/homerule.git
  git push --quiet -u origin HEAD:main
  echo "Pushed to ilPicc0ne/homerule (private). Flip to public by hand after the checks in PUBLISH.md."
fi

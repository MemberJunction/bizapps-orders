#!/bin/bash
# Detects case-sensitivity mismatches between pnpm-lock.yaml and git
# macOS is case-insensitive; Linux CI (GitHub Actions) is case-sensitive

set -uo pipefail

LOCKFILE=pnpm-lock.yaml

echo "Validating $LOCKFILE for case-sensitivity issues..."

if [ ! -f "$LOCKFILE" ]; then
  echo "::error::$LOCKFILE not found"
  exit 1
fi

MISMATCHES=()

# Workspace paths are keys of the top-level `importers:` map, one indent level in.
# Extract that block without a YAML parser: everything between `importers:` and the
# next column-0 key, keeping only 2-space-indented keys under packages/ or apps/.
PATHS=$(sed -n '/^importers:/,/^[a-zA-Z]/p' "$LOCKFILE" \
        | grep -E "^  (packages|apps)/[^:]+:" \
        | sed -E 's/^  //; s/:[[:space:]]*$//')

for path in $PATHS; do
  if ! git ls-files --error-unmatch "$path/package.json" > /dev/null 2>&1; then
    actual=$(git ls-files "$path*/package.json" 2>/dev/null | grep -i "^$path/package.json$" | head -1)
    if [ -n "$actual" ]; then
      actual_dir=$(dirname "$actual")
      MISMATCHES+=("lockfile: $path -> git: $actual_dir")
    fi
  fi
done

if [ ${#MISMATCHES[@]} -gt 0 ]; then
  echo ""
  echo "::error::Found ${#MISMATCHES[@]} case mismatch(es) in $LOCKFILE"
  echo ""
  for m in "${MISMATCHES[@]}"; do echo "  $m"; done
  echo ""
  echo "This happens when macOS (case-insensitive) generates a lockfile with"
  echo "different casing than what git stores. This causes"
  echo "pnpm install --frozen-lockfile to fail on Linux (case-sensitive) in CI."
  echo ""
  echo "To fix:"
  echo "  1. Check actual casing: git ls-files packages/ | grep -i <package>"
  echo "  2. Rename via temp: mv packages/Path packages/temp && mv packages/temp packages/path"
  echo "  3. Regenerate lockfile: rm $LOCKFILE && pnpm install"
  exit 1
fi

echo "No case-sensitivity issues found in $LOCKFILE"

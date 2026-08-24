#!/bin/bash
# Validates that every publishable @mj-biz-apps package restricts what it ships.
#
# WHY THIS GATE EXISTS. npm includes EVERYTHING not excluded when a package declares neither a
# `files` field nor an `.npmignore`. Contracts declared neither, and `pnpm publish -r --dry-run`
# packed 71 `src/`, `*.test.*` and `tsconfig` entries — the full TypeScript source, shipped to
# consumers alongside `dist`. Nothing fails: the publish succeeds and no consumer complains about
# receiving source it will never compile, so the only way to notice is to look. Hence a gate.
#
# It is also the family convention rather than a preference — bizapps-accounting (5/5),
# bizapps-common (5/5) and bizapps-tasks (6/6) all carry both fields on every package.
#
# Private packages are exempt and need neither field: `pnpm publish -r` and `changeset publish`
# both skip them (@changesets/cli: `packages.filter(pkg => !pkg.packageJson.private)`), so a
# private package's `files` has no bearing on what ships. Same predicate and rationale as
# validate-npm-packages.sh / validate-package-repository.sh, so all three gates agree on what
# "a package we publish" means. Skips are logged rather than silent so an accidental
# `"private": true` stays visible in CI output, and a jq failure yields an empty string — which is
# not "true", so the package still gets checked (the conservative direction).

set -uo pipefail

ERRORS=0
CHECKED=0
PRIVATE_SKIPPED=0

echo "Checking files + publishConfig in all publishable @mj-biz-apps packages..."

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")

  if [[ "$name" != @mj-biz-apps/orders-* ]]; then
    continue
  fi

  if [[ "$(jq -r '.private // false' "$pkg_json" 2>/dev/null)" == "true" ]]; then
    echo "   skipped: $name - private, never published"
    PRIVATE_SKIPPED=$((PRIVATE_SKIPPED + 1))
    continue
  fi

  CHECKED=$((CHECKED + 1))

  # `files` must exist and be non-empty. Its CONTENT is deliberately not prescribed — a package
  # may legitimately ship more than dist (an Angular package shipping styles, say) — the gate only
  # insists the package has decided, rather than defaulting to "everything".
  if [[ "$(jq -r '(.files // []) | length' "$pkg_json" 2>/dev/null)" == "0" ]]; then
    echo "::error file=$pkg_json::$name has no \"files\" field — npm would ship src/, tests and tsconfigs"
    ERRORS=$((ERRORS + 1))
  fi

  # Scoped packages default to RESTRICTED on npm, so a missing publishConfig.access turns the
  # first publish into a 402 that reads like a billing problem rather than a config one.
  if [[ "$(jq -r '.publishConfig.access // ""' "$pkg_json" 2>/dev/null)" != "public" ]]; then
    echo "::error file=$pkg_json::$name has no \"publishConfig\": { \"access\": \"public\" } — a scoped package defaults to restricted"
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $PRIVATE_SKIPPED -gt 0 ]]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi

if [[ $ERRORS -gt 0 ]]; then
  echo ""
  echo "::error::Found $ERRORS packaging problem(s) across the publishable packages"
  echo ""
  echo "Every publishable package needs:"
  echo '  "files": ["/dist"],'
  echo '  "publishConfig": { "access": "public" }'
  echo ""
  echo "Verify locally from a STANDALONE clone (not an mjdev instance, which links MJ from source"
  echo "and hides the packaging state):"
  echo "  pnpm publish -r --dry-run --no-git-checks"
  exit 1
fi

echo "All $CHECKED publishable @mj-biz-apps packages restrict what they ship"

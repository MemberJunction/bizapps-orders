#!/bin/bash
# Validates repository.url in all @mj-biz-apps packages
# Required for npm provenance verification (OIDC trusted publishing)

EXPECTED_URL="https://github.com/MemberJunction/bizapps-orders"
ERRORS=0
PRIVATE_SKIPPED=0

echo "Checking repository.url in all @mj-biz-apps packages..."

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")

  # Only check @mj-biz-apps scoped packages
  if [[ "$name" != @mj-biz-apps/* ]]; then
    continue
  fi

  # Skip packages marked private. repository.url exists for npm sigstore provenance, which
  # only applies to published packages -- npm refuses to attest a private one, and changesets
  # never publishes one (@changesets/cli: `packages.filter(pkg => !pkg.packageJson.private)`).
  # Same predicate and rationale as validate-npm-packages.sh, so both publish gates agree on
  # what "a package we publish" means. Logged rather than silent so an accidental
  # `"private": true` is still visible in CI output. A jq failure yields an empty string,
  # which is not "true", so the package still gets checked -- the conservative direction.
  if [[ "$(jq -r '.private // false' "$pkg_json" 2>/dev/null)" == "true" ]]; then
    echo "   skipped: $name - private, never published (repository.url not required)"
    PRIVATE_SKIPPED=$((PRIVATE_SKIPPED + 1))
    continue
  fi

  repo_url=$(jq -r '.repository.url // ""' "$pkg_json")

  if [ -z "$repo_url" ]; then
    echo "::error file=$pkg_json::Missing repository.url in $pkg_json"
    ERRORS=$((ERRORS + 1))
  elif [ "$repo_url" != "$EXPECTED_URL" ]; then
    echo "::error file=$pkg_json::Invalid repository.url in $pkg_json: expected '$EXPECTED_URL', got '$repo_url'"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "::error::Found $ERRORS package(s) with missing or invalid repository.url"
  echo ""
  echo "All @mj-biz-apps packages must have:"
  echo '  "repository": {'
  echo '    "type": "git",'
  echo "    \"url\": \"$EXPECTED_URL\""
  echo '  }'
  exit 1
fi

echo "All @mj-biz-apps packages have valid repository.url"
if [[ $PRIVATE_SKIPPED -gt 0 ]]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi

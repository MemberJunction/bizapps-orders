#!/bin/bash
# Validates repository.url in every publishable workspace package.
# Every package.json under packages/ is checked -- no scope or name filter, so a copied script checks
# whatever packages its repo has. `private: true` is the only exclusion.
# Required for npm provenance verification (OIDC trusted publishing)

# Derive the expected URL from the ROOT package.json so this script survives
# the template rename — keep repository.url correct there and everywhere else.
EXPECTED_URL=$(jq -r '.repository.url // ""' package.json)
if [ -z "$EXPECTED_URL" ]; then
  echo "::error::Root package.json has no repository.url — set it first"
  exit 1
fi
ERRORS=0
CHECKED=0
PRIVATE_SKIPPED=0

echo "Checking repository.url in all publishable packages..."

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")
  [ -n "$name" ] || continue   # a nameless package.json cannot be published

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

  CHECKED=$((CHECKED + 1))
  repo_url=$(jq -r '.repository.url // ""' "$pkg_json")

  if [ -z "$repo_url" ]; then
    echo "::error file=$pkg_json::Missing repository.url in $pkg_json"
    ERRORS=$((ERRORS + 1))
  elif [ "$repo_url" != "$EXPECTED_URL" ]; then
    echo "::error file=$pkg_json::Invalid repository.url in $pkg_json: expected '$EXPECTED_URL', got '$repo_url'"
    ERRORS=$((ERRORS + 1))
  fi
done

# Zero packages found means this looked in the wrong place, not that everything passed.
if [ $((CHECKED + PRIVATE_SKIPPED)) -eq 0 ]; then
  echo "::error::No package.json found under packages/ -- nothing was validated"
  exit 1
fi

if [[ $PRIVATE_SKIPPED -gt 0 ]]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "::error::Found $ERRORS package(s) with missing or invalid repository.url"
  echo ""
  echo "Every publishable package must have:"
  echo '  "repository": {'
  echo '    "type": "git",'
  echo "    \"url\": \"$EXPECTED_URL\""
  echo '  }'
  exit 1
fi

echo "All publishable packages have valid repository.url"

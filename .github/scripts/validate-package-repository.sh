#!/bin/bash
# Validates repository.url in all @mj-biz-apps packages
# Required for npm provenance verification (OIDC trusted publishing)

EXPECTED_URL="https://github.com/MemberJunction/bizapps-orders"
ERRORS=0

echo "Checking repository.url in all @mj-biz-apps packages..."

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")

  # Only check @mj-biz-apps scoped packages
  if [[ "$name" != @mj-biz-apps/* ]]; then
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

#!/bin/bash
# Validates that all @mj-biz-apps packages exist on npm before publishing

echo "Checking for new packages that need npm placeholders..."

MISSING=()
CHECKED=0
PRIVATE_SKIPPED=0
MAX_RETRIES=3
RETRY_DELAY=2

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")

  # Only check @mj-biz-apps scoped packages
  if [[ "$name" != @mj-biz-apps/orders-* ]]; then
    continue
  fi


  # Skip packages marked private. This gate exists to predict whether `changeset publish`
  # will succeed, and changesets never publishes a private package
  # (@changesets/cli: `packages.filter(pkg => !pkg.packageJson.private)`), so requiring an npm
  # entry for one asks a question that has no bearing on the outcome it gates.
  # Logged rather than silent so an accidental `"private": true` is still visible in CI output.
  # A jq failure yields an empty string here, which falls through to the normal npm check --
  # the conservative direction.
  if [[ "$(jq -r '.private // false' "$pkg_json" 2>/dev/null)" == "true" ]]; then
    echo "   skipped: $name - private, never published"
    PRIVATE_SKIPPED=$((PRIVATE_SKIPPED + 1))
    continue
  fi

  CHECKED=$((CHECKED + 1))

  # Check if package exists on npm with retry logic
  EXISTS=false
  for attempt in $(seq 1 $MAX_RETRIES); do
    if timeout 10 npm view "$name" version > /dev/null 2>&1; then
      EXISTS=true
      break
    fi
    exit_code=$?
    if [ $exit_code -eq 1 ]; then
      # Package not found (E404) — no point retrying
      break
    fi
    # Network error or timeout — retry
    sleep $RETRY_DELAY
  done

  if [ "$EXISTS" = false ]; then
    MISSING+=("$name")
  fi

  # Progress indicator
  if [ $((CHECKED % 10)) -eq 0 ]; then
    echo "  Checked $CHECKED @mj-biz-apps packages..."
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "::error::Found ${#MISSING[@]} package(s) without npm placeholders:"
  for pkg in "${MISSING[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  echo "For each missing package, publish a 0.0.0 placeholder manually before"
  echo "the automated workflow can take over."
  exit 1
fi

echo "All $CHECKED publishable @mj-biz-apps packages exist on npm"
if [ $PRIVATE_SKIPPED -gt 0 ]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi

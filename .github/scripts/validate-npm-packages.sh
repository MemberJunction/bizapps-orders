#!/bin/bash
# Validates that every publishable workspace package exists on npm before publishing.
# Every package.json under packages/ is checked -- no scope or name filter, so a copied script checks
# whatever packages its repo has. `private: true` is the only exclusion.

echo "Checking for new packages that need npm placeholders..."

MISSING=()
CHECKED=0
PRIVATE_SKIPPED=0
MAX_RETRIES=3
RETRY_DELAY=2

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/dist/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")
  [ -n "$name" ] || continue   # a nameless package.json cannot be published

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

  # Check if package exists on npm with retry logic.
  # npm view returns exit 1 for BOTH "not found" (E404) and transient errors
  # (rate-limiting from rapid calls, network blips), so a single exit-1 is not
  # conclusive. Retry on the first failure and only treat as missing if it
  # consistently fails — this distinguishes a real 404 from a flaky lookup.
  EXISTS=false
  for attempt in $(seq 1 $MAX_RETRIES); do
    # Use timeout if available (Linux/GitHub Actions), otherwise run without
    # timeout (macOS, where `timeout` is not installed by default).
    if command -v timeout > /dev/null 2>&1; then
      timeout 10 npm view "$name" version > /dev/null 2>&1
    else
      npm view "$name" version > /dev/null 2>&1
    fi
    if [ $? -eq 0 ]; then
      EXISTS=true
      break
    fi
    # Ambiguous failure — wait and retry rather than assuming 404
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      sleep $RETRY_DELAY
    fi
  done

  if [ "$EXISTS" = false ]; then
    MISSING+=("$name")
  fi

  # Progress indicator
  if [ $((CHECKED % 10)) -eq 0 ]; then
    echo "  Checked $CHECKED packages..."
  fi
done

# Zero packages found means this looked in the wrong place, not that everything passed.
if [ $((CHECKED + PRIVATE_SKIPPED)) -eq 0 ]; then
  echo "::error::No package.json found under packages/ -- nothing was validated"
  exit 1
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "::error::Found ${#MISSING[@]} package(s) without npm placeholders:"
  for pkg in "${MISSING[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  echo "Why this fails the publish: this repo publishes over npm OIDC trusted publishing"
  echo "(publish.yml has id-token: write, and there is no NPM_TOKEN secret). npm only lets you"
  echo "attach a trusted publisher to a package that already exists, so a brand-new package"
  echo "cannot be published by CI at all -- it fails with an auth error partway through the"
  echo "release, possibly after other packages have shipped. This check stops the run first."
  echo ""
  echo "Required actions (once per missing package, by an owner of the package's npm scope):"
  echo ""
  echo "  1. Create the package with a placeholder version:"
  echo "       npx setup-npm-trusted-publish <package-name>"
  echo "  2. Attach this repo as its trusted publisher (repository MemberJunction/<this repo>,"
  echo "     workflow publish.yml) at:"
  echo "       https://www.npmjs.com/package/<package-name>/access"
  echo "  3. Re-run this workflow. From then on CI publishes the package like any other."
  echo ""
  echo "Full walkthrough: PUBLISH_SETUP.md (\"npm authentication\" and \"First publish\")."
  exit 1
fi

echo "All $CHECKED publishable packages exist on npm"
if [ $PRIVATE_SKIPPED -gt 0 ]; then
  echo "   ($PRIVATE_SKIPPED private package(s) skipped - never published)"
fi

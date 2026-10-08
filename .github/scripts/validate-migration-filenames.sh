#!/bin/bash
# Validates migration file naming conventions
# Expected format: V[YYYYMMDDHHMM]__v[VERSION].x_[DESCRIPTION].sql

MIGRATION_DIR="${1:-migrations}"
ERRORS=()
WARNINGS=()
COUNT=0

echo "::notice::Validating migration file naming conventions..."

for file in $(find "$MIGRATION_DIR" -name "V*.sql" -type f 2>/dev/null); do
  COUNT=$((COUNT + 1))
  basename=$(basename "$file")

  # Check format: V followed by 12-digit timestamp
  if ! echo "$basename" | grep -qE '^V[0-9]{12}__'; then
    ERRORS+=("$basename: Does not match pattern V[YYYYMMDDHHMM]__")
    continue
  fi

  # Extract and validate timestamp components
  timestamp=$(echo "$basename" | grep -oE '^V[0-9]{12}' | sed 's/^V//')
  hours=${timestamp:8:2}
  minutes=${timestamp:10:2}

  if [ "$hours" -gt 23 ]; then
    ERRORS+=("$basename: Invalid hours ($hours > 23)")
  fi
  if [ "$minutes" -gt 59 ]; then
    ERRORS+=("$basename: Invalid minutes ($minutes > 59)")
  fi

  # Warn if date is in the future
  file_date=${timestamp:0:8}
  today=$(date +"%Y%m%d")
  if [ "$file_date" -gt "$today" ]; then
    WARNINGS+=("$basename: Date is in the future ($file_date)")
  fi
done

# Report results
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "::warning::Found migration files with future dates:"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "::error::Found migration files with invalid naming:"
  for e in "${ERRORS[@]}"; do echo "  - $e"; done
  exit 1
fi

echo "::notice::All $COUNT migration filenames are valid!"

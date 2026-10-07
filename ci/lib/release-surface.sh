#!/usr/bin/env bash
#
# Shared by the DOOR check (a PR into `next`) and the GATE check (the release PR into `main`).
# They ask different questions — the door asks "does this PR carry a big-enough changeset",
# the gate asks "is the resolved version big enough for everything since the last tag" — but
# the answer to "what changed that a consumer can observe" must be identical, or a PR can pass
# the door and fail the gate for the same files.
#
# Source it; it defines functions and runs nothing.

# metadata/ is serialized by the sync tool, which rewrites a `sync` bookkeeping block on every
# run. Comparing raw bytes therefore fires on commits that changed nothing a consumer sees, so
# both sides compare the JSON with that block stripped and the keys sorted.
normalize_metadata_json() {
  jq -S 'def strip:
           if   type == "object" then with_entries(select(.key != "sync")) | map_values(strip)
           elif type == "array"  then map(strip)
           else . end;
         strip'
}

substantive_metadata_changes() {
  local base="$1" head="$2" file base_json head_json changed=""
  local in_base in_head

  # `while read`, not `for $(...)`: a metadata path containing a space would otherwise be split
  # into fragments and silently mis-handled.
  while IFS= read -r file; do
    [ -n "$file" ] || continue

    in_base=false; in_head=false
    git cat-file -e "$base:$file" 2>/dev/null && in_base=true
    git cat-file -e "$head:$file" 2>/dev/null && in_head=true

    if [ "$in_base" = false ] && [ "$in_head" = true ]; then
      echo "  ADDED    $file — a new metadata file is a substantive change" >&2
      changed="${changed}${file}"$'\n'; continue
    fi
    if [ "$in_base" = true ] && [ "$in_head" = false ]; then
      echo "  DELETED  $file — a removed metadata file is a substantive change" >&2
      changed="${changed}${file}"$'\n'; continue
    fi
    if [ "$in_base" = false ] && [ "$in_head" = false ]; then
      echo "  MISSING  $file — git reported it as changed but it exists at neither ref; counting it" >&2
      changed="${changed}${file}"$'\n'; continue
    fi

    case "$file" in
      *.json) ;;
      *) echo "  NOT JSON $file — cannot strip sync bookkeeping from a non-JSON file; counting it" >&2
         changed="${changed}${file}"$'\n'; continue ;;
    esac

    if ! base_json=$(git show "$base:$file" 2>/dev/null | normalize_metadata_json 2>&1); then
      echo "  UNREADABLE $file at $base — not valid JSON, so a cosmetic-vs-real comparison is" >&2
      echo "             impossible; counting it as changed. jq said: ${base_json%%$'\n'*}" >&2
      changed="${changed}${file}"$'\n'; continue
    fi
    if ! head_json=$(git show "$head:$file" 2>/dev/null | normalize_metadata_json 2>&1); then
      echo "  UNREADABLE $file at $head — not valid JSON, so a cosmetic-vs-real comparison is" >&2
      echo "             impossible; counting it as changed. jq said: ${head_json%%$'\n'*}" >&2
      changed="${changed}${file}"$'\n'; continue
    fi

    if [ "$base_json" != "$head_json" ]; then
      changed="${changed}${file}"$'\n'
    fi
  done <<EOF
$(git diff --name-only "$base" "$head" -- metadata/ || true)
EOF

  printf '%s' "$changed"
}

# Migrations are compared as paths — any add, edit or delete to a migration is observable.
changed_migrations() {
  local base="$1" head="$2"
  git --no-pager diff --name-only "$base" "$head" -- migrations/ migrations-pg/ || true
}

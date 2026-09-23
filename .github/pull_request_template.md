<!--
Keep this short. Reviewers read the diff; this is for what the diff cannot say.
-->

## What this changes

<!-- One or two sentences. What is different afterwards, for whom. -->

## Why

<!-- The problem, not the solution. Link the issue if there is one. -->

## How it was verified

<!-- What you actually ran, and against what. "Tests pass" on its own is not a verification. -->

---

### Migrations

Delete this section if the PR adds no migration.

- [ ] Every migration file is **new**. None already on `next` is edited, renamed or deleted.
- [ ] Timestamps sort above the highest on `next`.
- [ ] The CodeGen output is folded under its own migration's banner.
- [ ] A changeset carries at least a minor bump.

**A merged migration is locked.** Every database that ran it recorded its checksum, so a later change
makes those databases refuse to migrate while the ones that never ran it get different SQL. Renaming
counts: the runner keys on the version in the filename, so a renamed migration is one nobody has run.
Fix it forward in a new file.

If a change to a merged migration is genuinely unavoidable, say so here, explain why nothing else
works, and get a second reviewer. Do not merge past a red `changes_and_migrations` — that has
happened, and it is how two people end up with different schemas from the same commit.

### Reviewer notes

<!--
Anything you want looked at hardest, and anything you are unsure about. A PR that says "I am not
certain about X" gets a better review than one that does not.
-->

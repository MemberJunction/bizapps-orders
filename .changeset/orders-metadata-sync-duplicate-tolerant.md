---
"@mj-biz-apps/orders": minor
---

Stop the Metadata_Sync seed from writing host-owned user rows, and guard the rest by natural key.

The generated seed contained two `spCreateUserApplication` calls for specific developer accounts.
`UserApplication` is not declared as metadata by this app — there is no `metadata/user-applications`
directory and `metadata/applications/.mj-sync.json` declares no related entity for it. It was
captured incidentally by the SQL log that generated the file, because the shared user views in
`metadata/user-views/` hardcode an owning `UserID`. MJ creates `UserApplication` itself when a user
is granted an application, so seeding it forced one deployment's user nav onto every other host and
collided with the row the host had already made under its own ID. Those two statements are removed.

The remaining creates are guarded on `[ID]` **or** the table's natural key, generated from the live
unique-constraint definitions (including the filter predicate for the six filtered indexes). A host
that acquired a row under a different ID is now skipped rather than colliding. No error is
swallowed: a genuine failure still aborts the migration.

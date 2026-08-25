---
'@mj-biz-apps/orders-core-entities-server': patch
---

Restore local definitions of the identity-claim driver contracts so the repo builds against
published MemberJunction again.

`orders-core-entities-server` imported `BaseIdentityClaimDriver`, `ClaimContext`,
`ClaimRedeemContext` and `ClaimResult` from `@memberjunction/core-entities`, and
`EscapeSQLString` from `@memberjunction/global`. None of those five symbols exist in any
published MJ package — verified against `6.1.0-edge.3`, the newest published edge and the version
the lockfile pins, whose tarballs contain no occurrence of any of them (`@memberjunction/global`
ships `Escape` and `EscapeHTML`). The imports resolved only for developers dev-linked to an MJ
working tree, so CI failed with ten TS2305 errors, the package did not compile, and three test
suites could not load at all — `EntitlementGrantClaimDriver`, `GuestOrderClaimDriver`, and
`registry-parity`, the last of which imports the package by name and takes its 76 checks down with
it. `Class extends value undefined` was the `@RegisterClass`/`extends` on an undefined import.

The contracts now live in `identityClaimContracts.ts` and `EscapeSQLString` in `sql-guards.ts`,
both marked as fallbacks with the deletion steps in their headers. Keeping the contracts in one
module rather than inline per driver means the eventual swap back is a specifier change at four
import sites, and any drift between this shape and the published one surfaces as a compile error
at exactly those sites.

`CLAUDE.md`'s SQL-safety rule mandated the `@memberjunction/global` import that caused half of
this, so it now points at `sql-guards.ts` and says why.

No behaviour change: 1235 unit tests pass, up from 989 running with 3 suites dead.

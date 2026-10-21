---
'@mj-biz-apps/orders-entities': minor
---

The 5.37 Metadata_Sync ships the one setting metadata/ added since 5.36: `ConcessionSelfApprovalEscalation` (#913). A host that upgrades by migration gets the same row as one that ran `mj sync push`, created empty, so a holder of a ConcessionLimit rule's role still approves their own concession until the setting is filled in. It has a Postgres counterpart.

# Style-kit provenance pin

> Synced against MJ worktree commit `2d61aab0b7` (branch mjdev/accounting-engine-dev, 2026-07-15).
> Freshness check (run from the instance MJ worktree root at the START of every mockup session):
> ```sh
> git log 2d61aab0b7.. -- packages/Angular/Generic/shared/src/lib/_tokens.scss \
>   packages/Angular/Generic/ui-components/ packages/Angular/Generic/shared/
> ```
> No output → kit + `_shell/` are current, proceed. Output → diff those commits, fold visual-affecting
> changes into `mj-mock.css` (+ `mockups/_shell/` if chrome shapes moved), then update this pin.

Watched paths (the sources the kit mimics):
- `packages/Angular/Generic/shared/src/lib/_tokens.scss` — tokens copied verbatim (subset).
- `packages/Angular/Generic/ui-components/` — mjButton/dialog shapes the `.mjm-btn`/`.mjm-dialog` classes mimic.
- `packages/Angular/Generic/shared/` — page-layout trio chrome the `.mjm-page*` classes mimic.

Rules (convention: `~/MJDev/shared-plans/ui-design-system.md` §3.1):
- The kit + `mockups/_shell/` are the ONLY maintained mockup assets.
- `.mjm-*` classes are mockup-only mimics — production uses real MJ components (mjButton, mj-dialog,
  mj-page-layout, AG Grid); every UI action plan carries that instruction.
- Dialog buttons: confirm LEFT, cancel RIGHT (MJ convention) — the kit's `.mjm-dialog footer` assumes it.

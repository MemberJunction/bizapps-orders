---
"@mj-biz-apps/orders-ng": minor
---

Render the approved UI, on MJ's design system instead of beside it

The design Amith approved was written but never rendered: the stylesheet was never attached to a
component, so the app shipped carrying the mockup's class names and none of its styles.

Attaching it was the small half. The larger half was deleting what MJ already owns — banners are now
`mj-alert` (43 of them), tabs are `mj-tab-nav`, inputs are MJ's own `mj-input` — so what remains in
the kit is genuinely app-specific rather than a parallel copy of the design system. Every hardcoded
hex became an `--mj-*` token, and the type scale bottoms out at `--mj-text-xs` (12px); smaller was
rejected on accessibility grounds.

Fixes the layout faults that came with never having rendered: sub-pages could not scroll, the page
header reserved 29px for an always-empty toolbar, action bars floated mid-page instead of seating at
the bottom, and non-interactive cards lifted on hover. Save errors were an undismissable wall of
serialized JSON and now read as a sentence.

Adds a unit test that fails the build when an `mjo-` class is used in a `.ts` or `.html` without
being defined in the kit — it immediately caught a live `mj-search` typo that had been invisible.

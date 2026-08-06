---
"@mj-biz-apps/orders-ng": patch
---

Hand several hand-rolled controls back to MJ, and get under the accessibility floor fixed

A UI review pass, all of it the same shape: the app had reimplemented something MJ already
ships, slightly worse.

- **Six native `<select>` elements become `mj-dropdown`** — they were rendering the operating
  system's own list, a different control per platform, ignoring the design tokens entirely.
- **`.mj-table` handed back to MJ.** The kit restated `width` and `border-collapse`
  identically to MJ's and replaced its tokenised type with a hardcoded `13px`. Only what MJ
  does not do is kept: the sticky header, tabular numerics, the sort affordance and the row
  states.
- **Eight permanent `mj-alert`s become quiet notes.** An alert is for something that
  HAPPENED; these explained how a screen works, permanently, in a full-width coloured card
  above the work. Conditional alerts were judged individually and left alone.
- **The confirm banner became one line**, with each outstanding item a button that jumps to
  the tab that owns it — it had been a card restating what the tab dots already said.

Sizes below the 12px accessibility floor are fixed where touched: the table header was
10.5px, its secondary text 11.5px, the sort caret 9px. All now `--mj-text-xs`.

Also: pickers open on focus and close on click-away or Escape, the party search is debounced
(it fired a server round-trip per keystroke), the workspace card sits inset on a toned page,
and the payments dashboard no longer leaves a card-shaped hole where a duplicated CSS rule
had collapsed a three-card row into two columns.

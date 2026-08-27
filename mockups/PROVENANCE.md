# Mockup provenance

What these mockups are derived from, so a reviewer can check freshness rather than trust it.

## Design tokens

`assets/tokens.css` is a **synced subset** of MJ's real token file, not a hand-picked palette:

| | |
|---|---|
| Source | `MJ/packages/Angular/Generic/shared/src/lib/_tokens.scss` |
| Synced | 2026-07-29 |
| Scope | brand / neutral / status ramps, semantic surface-text-border roles, type, space, radius, shadow, z — plus the full `[data-theme="dark"]` override block |

Freshness check before any future mockup session:

```bash
diff <(grep -E '^\s*--mj-' ~/Dropbox/develop/M5/MJ/packages/Angular/Generic/shared/src/lib/_tokens.scss) \
     <(grep -E '^\s*--mj-' assets/tokens.css)
```

**No screen file declares a literal color.** If a screen needs a value that isn't a token, that is a
signal the token set is missing something — raise it rather than hardcoding.

## Chrome

`assets/app.css` class names mirror the MJ components they become, so the Angular translation is
mechanical rather than interpretive:

| Mockup class | Real component |
|---|---|
| `.mj-page-layout` / `.mj-page-header` / `.mj-page-body` | the shared chrome trio in `@memberjunction/ng-ui-components` |
| `.mj-page-header-interior` | `<mj-page-header-interior>` (rail sub-pages) |
| `[slot="meta"]` / `[slot="actions"]` / `[slot="toolbar"]` | the header's three real projection slots |
| `.mj-panel` | `<mj-collapsible-panel>` |
| `.mj-modal` / `.mj-slide-in` | `<mj-form-dialog>` / `<mj-form-slide-in>` |
| `.mj-btn` / `.mj-input` / `.mj-chip` / `.mj-stat` | `mjButton` / `<mj-form-field>` / chips / `<mj-stat-badge>` |

## Colour that encodes something

Two rules, applied deliberately:

1. **Where colour carries no information, only one hue is used.** Tender mix and status mix are
   direct-labelled proportion bars in the brand hue. Colouring four labelled categories four
   different ways would be decoration pretending to be an encoding.
2. **Where colour does carry information, the palette was validated by script, not by eye.**

### Aging severity ramp

The only place colour encodes a value. Validated with the `dataviz` skill's checker against both
surfaces:

```
node scripts/validate_palette.js "#64748b,#f59e0b,#ef4444,#991b1b" --mode light
node scripts/validate_palette.js "#64748b,#f59e0b,#ef4444,#991b1b" --mode dark
```

| Check | Result |
|---|---|
| CVD separation | **PASS** — worst adjacent ΔE 13.9 (deutan), 16.6 (tritan) |
| Normal-vision floor | **PASS** — worst adjacent ΔE 19.8 |
| Lightness band | PASS light · marginal dark on the amber and deepest-red steps |
| Chroma floor | FAIL on the neutral step — **intentional**: "not late" is not a severity, so it is achromatic on purpose |
| Contrast vs surface | WARN on the amber step — discharged by the mandatory visible amount on every segment plus a legend |

**What this replaced:** the first attempt used `warning-700` next to `error-600`, which measured
**ΔE 2.8 (deutan) and 9.9 (normal vision)** — the 31–60 and 61+ buckets were effectively the same
colour for everyone, not just colourblind readers. That is exactly the failure eyeballing does not
catch, and it is why the ramp is pinned here.

## Data

`assets/data.js` reproduces the eight scenarios committed by `test-harnesses/seed-review-data.mjs`
(documented in `docs/reviewing-the-data.md`) — real engine output, inlined as plain objects so the
mockups open from `file://` with no server.

The arithmetic ties out on every order:

```
TotalGross = SUM(LineTotalNet) + SUM(ChargeAmount) + SUM(LineTax)
```

Two orders are additions rather than seed data, and are marked as such: **ORD-1016** (the editor's
working draft, escalated out of fast entry) and the list filler that gives the worklists and
origin filters something to bite on.

## What is deliberately fake

- **Every server call is stubbed.** Where one belongs, a `STUBBED CALL` note names it —
  `Orders.PreviewOrder`, `Orders.PreviewConfirm`, `Orders.ConfirmOrder`, `Orders.SaveOrder`,
  `Orders.GetOverdueWorklist`. None of these exist yet; see `plans/archive/orders-ux.md` §11.
- **Fast entry computes in the browser.** Deliberate, so the live decomposition is demonstrably
  honest rather than hardcoded — but in the build it is one `Orders.PreviewOrder` call, never client
  arithmetic beside the engine's.
- **Font Awesome loads from a CDN**, as MJ does. Icons are never the only carrier of meaning, so the
  screens stay legible offline.

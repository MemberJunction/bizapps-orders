/**
 * @fileoverview The chip family — small labels that carry state or provenance.
 *
 * Grouped in one file because they share a vocabulary and are meaningless apart:
 * every one of them answers "what kind of thing is this, and where did it come
 * from". Splitting them across five files would spread one decision over five
 * places without making any of them clearer.
 *
 * @module @mj-biz-apps/orders-ng
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/* ────────────────────────────────────────────────────────────────────────────
 * Consequence chip
 * ──────────────────────────────────────────────────────────────────────────── */

/** What kind of consequence a line carries. Drives the icon and its tint. */
export type MJOConsequenceKind =
    /** Extends or creates a subscription. */
    | 'subscription'
    /** Recognition anchored to an event's own dates. */
    | 'event'
    /** Revenue defers over a service period. */
    | 'deferred'
    /** Must ship — holds the order at Posted. */
    | 'fulfillment'
    /** Untaxable, with the reason. */
    | 'untaxable'
    /** Which company's ledger this line lands in. */
    | 'company'
    /** A promotion came off this line. */
    | 'promotion'
    /** Anything else — neutral. */
    | 'note';

const CONSEQUENCE_ICONS: Record<MJOConsequenceKind, string> = {
    subscription: 'fa-solid fa-rotate',
    event: 'fa-solid fa-calendar-day',
    deferred: 'fa-solid fa-hourglass-half',
    fulfillment: 'fa-solid fa-dolly',
    untaxable: 'fa-solid fa-ban',
    company: 'fa-solid fa-building',
    promotion: 'fa-solid fa-percent',
    note: 'fa-solid fa-circle-info',
};

/**
 * `mjo-consequence-chip` — a fact the engine derived about a line.
 *
 * Not an input, and deliberately not styled like one. These say what WILL happen
 * as a result of the line as entered — "extends Jane Chen's membership through
 * 2028", "recognizes on the event date", "ships, so this holds at Posted". The
 * point of order entry in this app is that consequences are visible while the
 * order is being typed rather than discovered at confirm.
 *
 * ## Example
 *
 * ```html
 * <mjo-consequence-chip Kind="subscription">
 *   Extends <b>SUB-2038</b> — coverage to Jul 31, 2028
 * </mjo-consequence-chip>
 * ```
 */
@Component({
    selector: 'mjo-consequence-chip',
    standalone: true,
    imports: [CommonModule],
    template: `
        <span
            class="mj-consequence"
            [class.is-sub]="Kind === 'subscription'"
            [class.is-event]="Kind === 'event'"
            [class.is-defer]="Kind === 'deferred'"
            [title]="Tooltip ?? ''">
            <i [class]="icon" aria-hidden="true"></i>
            <ng-content></ng-content>
        </span>
    `,
    styles: [`
        :host { display: inline-flex; }
        .mj-consequence {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: var(--mj-radius-sm);
            padding: 3px 8px;
            line-height: 1.2;
        }
        .mj-consequence i {
            font-size: 10px;
            color: var(--mj-text-muted);
        }
        .mj-consequence.is-sub i { color: var(--mj-status-info); }
        .mj-consequence.is-event i { color: var(--mj-status-info); }
        .mj-consequence.is-defer i { color: var(--mj-status-warning); }
    `],
})
export class MJOConsequenceChipComponent {
    /** Which consequence this is. Drives icon and tint. */
    @Input() Kind: MJOConsequenceKind = 'note';

    /** Optional longer explanation on hover. */
    @Input() Tooltip: string | null = null;

    protected get icon(): string {
        return CONSEQUENCE_ICONS[this.Kind] ?? CONSEQUENCE_ICONS.note;
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Price-source badge
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `mjo-price-source-badge` — where a unit price came from.
 *
 * Direct entry WINS over every resolved price, so the badge distinguishes the two
 * loudly: a resolved price names the rule that produced it, an overridden one says
 * so in warning colour. Without that, a price someone typed and a price the engine
 * chose look identical — and they behave completely differently.
 *
 * ## Example
 *
 * ```html
 * <mjo-price-source-badge Source="Standard · tier 10+" />
 * <mjo-price-source-badge [Overridden]="true" />
 * ```
 */
@Component({
    selector: 'mjo-price-source-badge',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (Overridden) {
            <span class="mjo-price-badge mjo-price-badge--override" title="Typed directly — this wins over any resolved price.">
                <i class="fa-solid fa-pen" aria-hidden="true"></i> overridden
            </span>
        } @else if (Source) {
            <span class="mjo-price-badge" [title]="'Resolved from ' + Source">
                <i class="fa-solid fa-tag" aria-hidden="true"></i> {{ Source }}
            </span>
        } @else if (Settled) {
            <!--
              PRICING FINISHED AND FOUND NOTHING. This is a different fact from "still working",
              and it used to be indistinguishable: both showed "resolving…", so a product with no
              price rule spun for ever, the line stayed at zero, and the order totalled $0.00 with
              nothing on screen saying why. A spinner that never stops reads as a slow system, not
              as a thing the user has to go and fix.
            -->
            <span
                class="mjo-price-badge mjo-price-badge--missing"
                role="status"
                title="No active price rule covers this product on this order's date, and no unit price was typed. Type a unit price on the line, or add a price rule for the product in the catalog.">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> no price rule
            </span>
        } @else {
            <span class="mjo-price-badge mjo-price-badge--muted">
                <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> resolving…
            </span>
        }
    `,
    styles: [
        `
            .mjo-price-badge {
                display: block;
                font-size: 10.5px;
                color: var(--mj-text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mjo-price-badge--override {
                color: var(--mj-status-warning-text);
            }
            .mjo-price-badge--muted {
                opacity: 0.7;
            }
            /* An unpriced line is a problem the user must act on, so it is styled as one rather
               than as another muted hint. */
            .mjo-price-badge--missing {
                color: var(--mj-status-warning-text);
                font-weight: 600;
            }
        `,
    ],
})
export class MJOPriceSourceBadgeComponent {
    /** The rule that resolved the price, e.g. `'Standard · tier 10+'`. */
    @Input() Source: string | null = null;

    /** The user typed the price. Wins outright, and says so. */
    @Input() Overridden = false;

    /**
     * True once pricing has RETURNED — i.e. the caller has a preview result and is not mid-flight.
     *
     * Without it this component cannot tell "not computed yet" from "computed, and there is no
     * rule", because both leave `Source` empty. Defaults to false so an un-updated caller keeps the
     * old spinner rather than accusing a perfectly good product of having no price.
     */
    @Input() Settled = false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stated value
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `mjo-stated-value` — a fact that came from somewhere else, with its source.
 *
 * The alternative to rendering an inherited value as an editable input. An event
 * product's service period, a company inferred from an employment affiliation, a
 * taxability resolved from a product type: these are ANSWERS the system already
 * has. Showing them as inputs invites someone to override behaviour the type is
 * already getting right, and hides the fact that anything decided it at all.
 *
 * ## Example
 *
 * ```html
 * <mjo-stated-value Label="Service period" From="event dates (Sidecar Summit 2026)">
 *   Oct 14 – Oct 16, 2026
 * </mjo-stated-value>
 * ```
 */
@Component({
    selector: 'mjo-stated-value',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mj-stated">
            @if (Label) {
                <span class="muted small mjo-stated__label">{{ Label }}</span>
            }
            <span class="value mjo-stated__value"><ng-content></ng-content></span>
            @if (From) {
                <span class="from">{{ From }}</span>
            }
        </div>
    `,
    styles: [
        `
            .mjo-stated__label {
                width: 130px;
                flex: none;
            }
            .mjo-stated__value {
                flex: 1;
                min-width: 0;
            }
            @media (max-width: 560px) {
                :host ::ng-deep .mj-stated {
                    flex-wrap: wrap;
                }
                .mjo-stated__label {
                    width: 100%;
                }
            }
        `,
    ],
})
export class MJOStatedValueComponent {
    /** What this value is. */
    @Input() Label: string | null = null;

    /** Where it came from — the whole reason this component exists. */
    @Input() From: string | null = null;
}

/** Every chip component, for a consumer's `imports` array. */
export const MJO_CHIP_COMPONENTS = [
    MJOConsequenceChipComponent,
    MJOPriceSourceBadgeComponent,
    MJOStatedValueComponent,
] as const;

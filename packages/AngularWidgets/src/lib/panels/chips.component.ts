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

const CONSEQUENCE_CLASSES: Partial<Record<MJOConsequenceKind, string>> = {
    subscription: 'is-sub',
    event: 'is-event',
    deferred: 'is-defer',
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
        <span class="mj-consequence" [class]="toneClass" [title]="Tooltip ?? ''">
            <i [class]="icon" aria-hidden="true"></i>
            <ng-content></ng-content>
        </span>
    `,
})
export class MJOConsequenceChipComponent {
    /** Which consequence this is. Drives icon and tint. */
    @Input() Kind: MJOConsequenceKind = 'note';

    /** Optional longer explanation on hover. */
    @Input() Tooltip: string | null = null;

    protected get icon(): string {
        return CONSEQUENCE_ICONS[this.Kind] ?? CONSEQUENCE_ICONS.note;
    }

    protected get toneClass(): string {
        return CONSEQUENCE_CLASSES[this.Kind] ?? '';
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Origin chip
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where an order came from. */
export type MJOOriginChannel = 'Staff' | 'LXP' | 'Renewal' | 'Migration' | string;

/**
 * `mjo-origin-chip` — how an order got here.
 *
 * Origin is a first-class, filterable attribute rather than something to infer.
 * A self-serve purchase and a staff-entered order are chased, supported and
 * reported on differently, and inferring "LXP" from a null sales rep is guesswork
 * that breaks the first time someone enters an order without picking a rep.
 *
 * ## Example
 *
 * ```html
 * <mjo-origin-chip Channel="LXP" ExternalID="LH4I-88213" />
 * ```
 */
@Component({
    selector: 'mjo-origin-chip',
    standalone: true,
    imports: [CommonModule],
    template: `
        <span class="mj-chip" [class]="chipClass" [title]="title">
            <i [class]="icon" aria-hidden="true"></i>
            {{ label }}
        </span>
    `,
})
export class MJOOriginChipComponent {
    /** The channel. Anything unrecognised renders neutrally rather than breaking. */
    @Input() Channel: MJOOriginChannel | null = 'Staff';

    /** The originating system's own reference, shown on hover. */
    @Input() ExternalID: string | null = null;

    protected get label(): string {
        return this.Channel ?? 'Staff';
    }

    protected get title(): string {
        return this.ExternalID ? `${this.label} · ${this.ExternalID}` : this.label;
    }

    protected get icon(): string {
        switch (this.Channel) {
            case 'LXP':
                return 'fa-solid fa-graduation-cap';
            case 'Renewal':
                return 'fa-solid fa-rotate';
            case 'Migration':
                return 'fa-solid fa-right-left';
            default:
                return 'fa-solid fa-user';
        }
    }

    protected get chipClass(): string {
        switch (this.Channel) {
            case 'LXP':
                return 'mj-chip--violet';
            case 'Renewal':
                return 'mj-chip--info';
            default:
                return 'mj-chip--outline';
        }
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
        `,
    ],
})
export class MJOPriceSourceBadgeComponent {
    /** The rule that resolved the price, e.g. `'Standard · tier 10+'`. */
    @Input() Source: string | null = null;

    /** The user typed the price. Wins outright, and says so. */
    @Input() Overridden = false;
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
    MJOOriginChipComponent,
    MJOPriceSourceBadgeComponent,
    MJOStatedValueComponent,
] as const;

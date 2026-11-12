/**
 * @fileoverview The information architecture, as data.
 *
 * Five sections organised by JOB rather than by entity, each a top tab in the
 * Orders Application (`metadata/applications/.orders-application.json`) and each
 * owning a left rail over its own sub-pages. MJ's rule: top nav across sections,
 * left nav within one.
 *
 * Declaring the rails here rather than inside each component keeps the whole IA
 * readable in one file, lets a badge count be injected from one place, and makes
 * the nav testable without instantiating Angular.
 *
 * @module @mj-biz-apps/orders-ng
 */

import type { MJLeftNavSection } from '@memberjunction/ng-ui-components';

/**
 * A sub-page within a section. `Id` is what the left nav emits on click and what
 * the section stores as its active page, so it doubles as the URL-ish state key.
 */
export interface OrdersSubPage {
    /** Stable key. Persisted as user state, so renaming one resets people's place. */
    Id: string;
    Label: string;
    /** Font Awesome class, matching the icon the mockups established for this page. */
    Icon: string;
    /** Optional muted second line in the rail. */
    Description?: string;
    /** Rail group header. Items sharing a group render under one heading. */
    Group?: string;
}

/** Counts the rails surface as badges. Supplied by the section from live data. */
export interface OrdersNavBadges {
    /** Physical lines waiting to ship. */
    FulfillmentPending?: number;
    /** Orders past due. */
    Overdue?: number;
    /** Customers holding spendable credit. */
    CreditsHeld?: number;
    /** Payments awaiting capture. */
    PaymentsPending?: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The five rails
 * ──────────────────────────────────────────────────────────────────────────── */

/** Orders — take an order, then work the ones you have. */
export const ORDERS_SUB_PAGES: OrdersSubPage[] = [
    { Id: 'dashboard', Label: 'Dashboard', Icon: 'fa-solid fa-gauge-high' },
    { Id: 'list', Label: 'All orders', Icon: 'fa-solid fa-table-list' },
    { Id: 'fulfillment', Label: 'Fulfillment queue', Icon: 'fa-solid fa-dolly', Group: 'Work' },
    { Id: 'returns', Label: 'Returns', Icon: 'fa-solid fa-rotate-left', Group: 'Work' },
];

/** Payments — take the cash, and say what it settles. */
export const PAYMENTS_SUB_PAGES: OrdersSubPage[] = [
    { Id: 'dashboard', Label: 'Dashboard', Icon: 'fa-solid fa-gauge-high', Description: 'Cash received and reconciliation' },
    { Id: 'list', Label: 'All payments', Icon: 'fa-solid fa-table-list' },
    { Id: 'refund', Label: 'Refunds', Icon: 'fa-solid fa-arrow-rotate-left', Group: 'Work' },
    { Id: 'credit', Label: 'Account credits', Icon: 'fa-solid fa-piggy-bank', Group: 'Work' },
];

/**
 * Receivables — its own section rather than a "Reports" folder, because A/R,
 * aging and collections are operational work with worklists and actions. Filing
 * them under Reports would tell the accounting team their work is read-only.
 */
export const RECEIVABLES_SUB_PAGES: OrdersSubPage[] = [
    { Id: 'aging', Label: 'Customer A/R', Icon: 'fa-solid fa-user-tag', Description: 'Balances by customer' },
    { Id: 'overdue', Label: 'Overdue worklist', Icon: 'fa-solid fa-hourglass-half' },
    { Id: 'billing', Label: 'Billing worklist', Icon: 'fa-solid fa-file-invoice-dollar', Description: 'Installments due, not yet invoiced' },
    { Id: 'invoicing-queue', Label: 'Invoicing queue', Icon: 'fa-solid fa-paper-plane', Description: 'Waiting to send, and payments needing a person' },
    { Id: 'progress', Label: 'Progress attestation', Icon: 'fa-solid fa-diagram-project', Description: 'Percent complete on project lines' },
];

/**
 * Subscriptions — its own top tab, because two teams come to it with different
 * jobs and neither of them is "receivables". Accounting asks what will renew,
 * when, and at what price; the product teams ask what is ending and who to talk
 * to. Both start from the same list of what ends inside a window, which is the
 * Renewals page; the full register of subscriptions sits beside it.
 *
 * It used to live on the Receivables rail. It moved out once renewals became a
 * worklist with an action (tick rows, place their renewal orders) rather than a
 * read-only view of terms.
 */
export const SUBSCRIPTIONS_SUB_PAGES: OrdersSubPage[] = [
    { Id: 'renewals', Label: 'Renewals', Icon: 'fa-solid fa-rotate', Description: 'What ends soon, what renews, at what price' },
    { Id: 'list', Label: 'All subscriptions', Icon: 'fa-solid fa-table-list', Description: 'Terms, history and recognition' },
];

/** Catalog — where the behaviour every order inherits is configured. */
export const CATALOG_SUB_PAGES: OrdersSubPage[] = [
    { Id: 'products', Label: 'Products & categories', Icon: 'fa-solid fa-boxes-stacked' },
    { Id: 'pricing', Label: 'Pricing', Icon: 'fa-solid fa-tags' },
    { Id: 'promotions', Label: 'Promotions', Icon: 'fa-solid fa-percent' },
    { Id: 'charges', Label: 'Charges & tax', Icon: 'fa-solid fa-receipt' },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Rendering
 * ──────────────────────────────────────────────────────────────────────────── */

/** Which badge, if any, belongs on a given sub-page. */
function badgeFor(pageId: string, badges: OrdersNavBadges): number | undefined {
    switch (pageId) {
        case 'fulfillment':
            return badges.FulfillmentPending;
        case 'overdue':
            return badges.Overdue;
        case 'credit':
            return badges.CreditsHeld;
        default:
            return undefined;
    }
}

/**
 * Turn a page list into the `MJLeftNavSection[]` `<mj-left-nav>` consumes,
 * grouping by the pages' `Group` and dropping zero badges.
 *
 * A zero badge is omitted rather than rendered as "0": a badge means "there is
 * something here", and a grey zero is noise that trains people to ignore the
 * badge that matters.
 *
 * @param pages The section's sub-pages, in rail order.
 * @param badges Live counts. Omit for a rail with no counts.
 *
 * @example
 * ```typescript
 * this.NavSections = BuildLeftNavSections(ORDERS_SUB_PAGES, { Overdue: 4, FulfillmentPending: 3 });
 * ```
 */
export function BuildLeftNavSections(pages: OrdersSubPage[], badges: OrdersNavBadges = {}): MJLeftNavSection[] {
    const sections: MJLeftNavSection[] = [];
    // Insertion order matters: the ungrouped items lead, then each group in the
    // order it first appears, which is the order the author wrote them in.
    const byGroup = new Map<string, OrdersSubPage[]>();
    for (const page of pages) {
        const key = page.Group ?? '';
        const list = byGroup.get(key);
        if (list) list.push(page);
        else byGroup.set(key, [page]);
    }

    for (const [group, groupPages] of byGroup) {
        sections.push({
            label: group || undefined,
            items: groupPages.map((page) => {
                const badge = badgeFor(page.Id, badges);
                return {
                    id: page.Id,
                    label: page.Label,
                    icon: page.Icon,
                    description: page.Description,
                    ...(badge ? { badge } : {}),
                };
            }),
        });
    }
    return sections;
}

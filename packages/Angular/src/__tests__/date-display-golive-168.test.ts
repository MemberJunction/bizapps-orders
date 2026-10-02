/**
 * @fileoverview golive #168 — every screen that shows or compares a day, through the REAL methods.
 *
 * Two kinds of column carry a day, and they are read differently:
 *
 * - a `date` column (OrderDate, DueDate, a price list's EffectiveFrom) arrives as midnight UTC on its
 *   day and names THAT day everywhere — `FormatDate`, `DaysSince`, `ToISODate`;
 * - a `datetimeoffset` (an event's EventStartsAt, a promotion's EffectiveFrom, an event's OccurredAt)
 *   is an instant, shown as the BUSINESS day it fell on — `FormatInstantDate`.
 *
 * They cannot be told apart by value — 7:00 PM Central is exactly midnight UTC — so each call site
 * names which one it holds, and these tests pin that it named the right one.
 *
 * The clock is frozen at 8:00 PM Central on Oct 1 (already Oct 2 in UTC), with the business zone set
 * to Central, and the browser zone varied west and east of it.
 */
import '@angular/compiler';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';

import {
    FormatCoverageWindow,
    FormatInstantWindow,
    FormatShortDate,
    FormatShortInstantDate,
} from '../lib/form-panels/document-form.helpers';
import { BizAppsProductFormComponent } from '../lib/custom/Product/product-form.component';
import { BizAppsPromotionFormComponent } from '../lib/custom/Promotion/promotion-form.component';
import { PromotionHeaderPanel } from '../lib/form-panels/promotion-header.panel';
import { MJOOrdersDashboardPageComponent } from '../lib/pages/orders/orders-dashboard.page';
import { MJOPricingPageComponent } from '../lib/pages/catalog/pricing.page';
import { MJOCustomerARPageComponent } from '../lib/pages/receivables/customer-ar.page';
import { MJOChargesTaxPageComponent } from '../lib/pages/catalog/products.page';
import { MJOSubscriptionsPageComponent } from '../lib/pages/receivables/subscriptions.page';
import { PartyOrdersOverviewComponent } from '../lib/panels/party-orders-overview.component';
import { BizAppsProductGLLinksComponent } from '../lib/custom/Product/widgets/product-gl-links.component';

const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
const original = { rows: engine._configurations, loaded: engine._loaded, tz: process.env.TZ };

/** A SQL `date` column as the driver materialises it: midnight UTC on that calendar day. */
const driverDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** 7:00 PM Central Daylight Time on Oct 1 — midnight UTC on Oct 2. */
const SEVEN_PM_CENTRAL = new Date('2026-10-02T00:00:00.000Z');
/** 8:00 PM Central Daylight Time on Oct 1 — the frozen "now". */
const EIGHT_PM_CENTRAL = new Date('2026-10-02T01:00:00.000Z');

/** Runs a getter off a prototype against a plain object, so no Angular construction is needed. */
function getter<T>(ctor: { prototype: object }, name: string, self: object): T {
    const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, name);
    if (!descriptor?.get) throw new Error(`${name} is not a getter`);
    return descriptor.get.call(self) as T;
}

/** Calls a (possibly protected or private) method off a prototype against a plain object. */
function method<T>(ctor: { prototype: object }, name: string, self: object, ...args: unknown[]): T {
    const fn = (ctor.prototype as Record<string, unknown>)[name];
    if (typeof fn !== 'function') throw new Error(`${name} is not a method`);
    return (fn as (...a: unknown[]) => T).apply(self, args);
}

beforeAll(() => {
    engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
    engine._loaded = true;
});
afterAll(() => {
    engine._configurations = original.rows;
    engine._loaded = original.loaded;
    if (original.tz === undefined) delete process.env.TZ;
    else process.env.TZ = original.tz;
});

describe.each(['America/Chicago', 'Asia/Kolkata', 'Pacific/Auckland'])('golive #168 call sites, browser in %s, business zone Central', (tz) => {
    beforeEach(() => {
        process.env.TZ = tz;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(EIGHT_PM_CENTRAL);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('timestamps show the business day they fell on', () => {
        it('the product form\'s event summary (EventStartsAt, datetimeoffset)', () => {
            const summary = getter<string>(BizAppsProductFormComponent, 'EventScheduleSummary', {
                HasEventExtension: true,
                EventProductChild: { VenueName: 'Hall', EventStartsAt: SEVEN_PM_CENTRAL },
            });
            expect(summary).toBe('Hall · Oct 1, 2026');
        });

        it('the promotion form\'s schedule (Promotion.EffectiveFrom / EffectiveTo, datetimeoffset)', () => {
            const window = getter<string>(BizAppsPromotionFormComponent, 'FormattedScheduleWindow', {
                record: { EffectiveFrom: SEVEN_PM_CENTRAL, EffectiveTo: new Date('2026-11-01T04:59:00.000Z') },
            });
            expect(window).toBe('Oct 1, 2026 – Oct 31, 2026');
        });

        it('the promotion header\'s schedule', () => {
            const schedule = getter<string>(PromotionHeaderPanel, 'Schedule', {
                Record: { EffectiveFrom: SEVEN_PM_CENTRAL, EffectiveTo: null },
            });
            expect(schedule).toBe('Oct 1, 2026 – Open-ended');
        });

        it('the short-date helpers split the same way', () => {
            expect(FormatShortInstantDate(SEVEN_PM_CENTRAL)).toBe('Oct 1, 2026');
            expect(FormatShortInstantDate('2026-10-02T00:00:00Z')).toBe('Oct 1, 2026');
            expect(FormatInstantWindow(SEVEN_PM_CENTRAL, null)).toBe('Oct 1, 2026 – Open-ended');
            expect(FormatShortInstantDate(null)).toBe('');
        });

        it('a subscription event\'s OccurredAt on the subscriptions page', () => {
            expect(method<string>(MJOSubscriptionsPageComponent, 'instantOf', {}, SEVEN_PM_CENTRAL)).toBe('Oct 1, 2026');
        });
    });

    describe('date columns show their own day', () => {
        it('the coverage-window helpers', () => {
            expect(FormatShortDate(driverDate('2026-10-01'))).toBe('Oct 1, 2026');
            expect(FormatCoverageWindow(driverDate('2026-10-01'), driverDate('2027-09-30'))).toBe('Oct 1, 2026 – Sep 30, 2027');
        });

        it('a price list\'s window on the pricing page — not "— → —" from String(Date)', () => {
            const window = method<string>(MJOPricingPageComponent, 'windowOf', {}, {
                EffectiveFrom: driverDate('2026-10-01'),
                EffectiveTo: driverDate('2026-12-31'),
            });
            expect(window).toBe('Oct 1 → Dec 31');
        });

        it('a payment date on customer AR', () => {
            expect(method<string>(MJOCustomerARPageComponent, 'dateOf', {}, driverDate('2026-10-01'))).toBe('Oct 1');
        });

        it('a certificate expiry on the charges & tax page', () => {
            expect(method<string>(MJOChargesTaxPageComponent, 'dateOf', {}, driverDate('2026-10-01'))).toBe('Oct 1');
        });

        it('a term date on the subscriptions page', () => {
            expect(method<string>(MJOSubscriptionsPageComponent, 'dateOf', {}, driverDate('2026-10-01'))).toBe('Oct 1, 2026');
        });
    });

    it('the dashboard names the WORST overdue order and its real age — not "0 days past due"', () => {
        const recent = { OrderNumber: 'SO-1', DueDate: driverDate('2026-09-01'), Balance: 50, BillToOrganization: 'Acme' };
        const oldest = { OrderNumber: 'SO-2', DueDate: driverDate('2026-08-01'), Balance: 100, BillToOrganization: 'Acme' };
        const items = getter<Array<{ Headline: string }>>(MJOOrdersDashboardPageComponent, 'WorthALook', {
            overdue: [recent, oldest],
            credits: [],
            customerOf: () => 'Acme',
        });
        expect(items[0]?.Headline).toBe('SO-2 is 61 days past due.');
    });

    it('the party overview files an Oct 1 order under October, in a window ending at the business month', () => {
        vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
        const self: { Orders: unknown[]; SpendMonths: Array<{ MonthShort: string; Amount: number }> } = {
            Orders: [{ OrderDate: driverDate('2026-10-01'), TotalGross: 500 }, { OrderDate: '2026-09-30', TotalGross: 200 }],
            SpendMonths: [],
        };
        method(PartyOrdersOverviewComponent, 'ProcessSpendTrajectory', self, []);
        expect(self.SpendMonths.map((m) => `${m.MonthShort}:${m.Amount}`).join(' ')).toBe('May:0 Jun:0 Jul:0 Aug:0 Sep:200 Oct:500');
    });

    it('the party overview window does not run ahead of the business month on its last evening', () => {
        // 10 PM Central on Oct 31 is Nov 1 in UTC, Pune and Auckland.
        vi.setSystemTime(new Date('2026-11-01T03:00:00.000Z'));
        const self: { Orders: unknown[]; SpendMonths: Array<{ MonthShort: string; Amount: number }> } = {
            Orders: [{ OrderDate: driverDate('2026-10-31'), TotalGross: 700 }],
            SpendMonths: [],
        };
        method(PartyOrdersOverviewComponent, 'ProcessSpendTrajectory', self, []);
        expect(self.SpendMonths.map((m) => m.MonthShort)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
        expect(self.SpendMonths.at(-1)?.Amount).toBe(700);
    });

    it('a new GL link defaults to TODAY on the business calendar, not the UTC day', () => {
        const panel = new BizAppsProductGLLinksComponent({ detectChanges: () => undefined } as never);
        panel.OpenDraft();
        expect(panel.Draft?.StartedAt).toBe('2026-10-01');
    });

    it('revenue recognition releases a month once the BUSINESS calendar reaches it', () => {
        // 8 PM Central on Sep 30: October has begun in UTC, Pune and Auckland, not in the books.
        vi.setSystemTime(new Date('2026-10-01T01:00:00.000Z'));
        const periods = getter<Array<{ Label: string; Released: boolean }>>(MJOSubscriptionsPageComponent, 'Recognition', {
            Selected: { AmountPerTerm: 1200, StartDate: driverDate('2026-01-01') },
        });
        expect(periods.filter((p) => p.Released).map((p) => p.Label).slice(-1)).toEqual(['Sep 26']);
        expect(periods.find((p) => p.Label === 'Oct 26')?.Released).toBe(false);
        expect(periods[0]?.Label).toBe('Jan 26');
    });
});

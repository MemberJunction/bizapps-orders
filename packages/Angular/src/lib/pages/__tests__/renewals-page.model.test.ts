/**
 * The Renewals page's decisions, tested as the plain functions they are.
 */
import { describe, expect, it } from 'vitest';
import type { RenewalCandidate, RenewalWorklistRow } from '@mj-biz-apps/orders-entities';
import {
    CanPlaceRenewal,
    CompareRows,
    EndsNote,
    MatchesPreset,
    MatchesSearch,
    NeedsAttention,
    ProjectionLines,
    RenewalPriceDisplay,
    RenewalPriceNote,
    RenewalStateLabel,
    SummarizePlacement,
    SharedOrderWarnings,
    AppliedFacets,
    BuildRenewalsExport,
    FacetOptions,
    MatchesFacets,
    PriceChangePercent,
    RemoveFacet,
    NO_FACETS,
    SettingsUpdateText,
    SharedIncrease,
    SubscriptionIncreaseNote,
    OneDayTerm,
    TermWarning,
    PruneProducts,
    CurrentProductsNote,
    ProductChangeText,
    ReadPageState,
    WritePageState,
    PruneCompanies,
    ExclusionNote,
} from '../subscriptions/renewals-page.model';

function row(overrides: Partial<RenewalWorklistRow> = {}): RenewalWorklistRow {
    return {
        SubscriptionID: 'sub-1',
        SubscriptionNumber: 'SUB-000001',
        Status: 'Active',
        AutoRenew: true,
        ProviderBilled: false,
        ContactName: 'Ada Lovelace',
        AccountName: 'Analytical Engines Ltd',
        CompanyID: 'co-1',
        CompanyName: 'Blue Cypress',
        ProductID: 'p-1',
        ProductName: 'Sidecar Annual',
        SubscriptionTypeName: 'Sidecar Annual',
        StartDate: '2025-04-01',
        TermNumber: 2,
        TermStartDate: '2026-04-01',
        TermEndDate: '2027-03-31',
        DaysUntilEnd: 142,
        LeadDays: 90,
        State: 'Scheduled',
        AutoRenewOn: '2026-12-31',
        CurrentOrderID: 'o-1',
        CurrentOrderNumber: 'ORD-0100',
        CurrentUnitPrice: 1100,
        CurrentQuantity: 1,
        CurrentLineTotal: 1100,
        RenewalBooked: false,
        ProjectedUnitPrice: 1155,
        ProjectedQuantity: 1,
        ProjectedLineTotal: 1155,
        ProjectedBasePrice: 1100,
        ProjectedBasePriceSource: 'PriorPrice',
        ProjectedIncreasePercent: 5,
        ProjectedIncreaseSource: 'Subscription',
        ProjectedProductName: 'Sidecar Annual',
        ProjectedTermStart: '2027-04-01',
        ProjectedTermEnd: '2028-03-31',
        ...overrides,
    };
}

describe('presets', () => {
    it('sorts each state into the preset a person would look for it under', () => {
        expect(MatchesPreset(row({ State: 'Scheduled' }), 'auto')).toBe(true);
        expect(MatchesPreset(row({ State: 'DueNow' }), 'auto')).toBe(true);
        expect(MatchesPreset(row({ State: 'WillEnd' }), 'manual')).toBe(true);
        expect(MatchesPreset(row({ State: 'Lapsed' }), 'manual')).toBe(true);
        expect(MatchesPreset(row({ State: 'Renewed' }), 'placed')).toBe(true);
        expect(MatchesPreset(row({ State: 'RenewalPending' }), 'placed')).toBe(true);
        expect(MatchesPreset(row({ State: 'ProviderBilled' }), 'auto')).toBe(false);
        expect(MatchesPreset(row({ State: 'ProviderBilled' }), 'all')).toBe(true);
    });

    it('flags for attention what the pass will not fix by itself', () => {
        expect(NeedsAttention(row())).toBe(false);
        expect(NeedsAttention(row({ ProjectionProblem: 'the successor product has no price' }))).toBe(true);
        expect(NeedsAttention(row({ State: 'Lapsed' }))).toBe(true);
        expect(NeedsAttention(row({ State: 'RenewalPending', DaysUntilEnd: -3 }))).toBe(true);
        expect(NeedsAttention(row({ State: 'RenewalPending', DaysUntilEnd: 3 }))).toBe(false);
    });
});

describe('CanPlaceRenewal', () => {
    it('allows the states a person may renew, and refuses rows that already have an order or a gateway', () => {
        expect(CanPlaceRenewal(row({ State: 'Scheduled' }))).toBe(true);
        expect(CanPlaceRenewal(row({ State: 'WillEnd', AutoRenew: false }))).toBe(true);
        expect(CanPlaceRenewal(row({ State: 'Lapsed' }))).toBe(true);
        expect(CanPlaceRenewal(row({ State: 'Renewed', RenewalOrderID: 'o-2' }))).toBe(false);
        expect(CanPlaceRenewal(row({ State: 'RenewalPending', RenewalOrderID: 'o-2' }))).toBe(false);
        expect(CanPlaceRenewal(row({ State: 'ProviderBilled', ProviderBilled: true }))).toBe(false);
        expect(CanPlaceRenewal(row({ State: 'Inactive', Status: 'Canceled' }))).toBe(false);
    });
});

describe('search', () => {
    it('matches the customer, the account, the product, the subscription and either order number, ignoring case', () => {
        expect(MatchesSearch(row(), 'lovelace')).toBe(true);
        expect(MatchesSearch(row(), 'ANALYTICAL')).toBe(true);
        expect(MatchesSearch(row(), 'sidecar')).toBe(true);
        expect(MatchesSearch(row(), 'sub-000001')).toBe(true);
        expect(MatchesSearch(row(), 'ord-0100')).toBe(true);
        expect(MatchesSearch(row({ RenewalOrderNumber: 'ORD-0200' }), '0200')).toBe(true);
        expect(MatchesSearch(row(), 'babbage')).toBe(false);
        expect(MatchesSearch(row(), '   ')).toBe(true);
    });
});

describe('what the columns say', () => {
    it('reads the renewal price from the order when one exists, else the projection, else a dash', () => {
        expect(RenewalPriceDisplay(row({ RenewalOrderID: 'o-2', RenewalUnitPrice: 1200 }))).toBe('$1,200.00');
        expect(RenewalPriceDisplay(row())).toBe('$1,155.00');
        expect(RenewalPriceDisplay(row({ ProjectedUnitPrice: null }))).toBe('—');
    });

    it('says where a projected price came from, in a few words', () => {
        expect(RenewalPriceNote(row())).toBe('projected · +5% (subscription)');
        expect(RenewalPriceNote(row({ ProjectedIncreasePercent: 0, ProjectedBasePriceSource: 'SuccessorList' }))).toBe('projected · successor list');
        expect(RenewalPriceNote(row({ ProjectedIncreasePercent: 0, ProjectedBasePriceSource: 'PriorList' }))).toBe('projected · discount lapses');
        expect(RenewalPriceNote(row({ ProjectedIncreasePercent: 0, ProjectedQuantity: 10 }))).toBe('projected · no increase · × 10');
        expect(RenewalPriceNote(row({ ProjectedUnitPrice: null, ProjectionProblem: 'no price' }))).toBe('could not be priced');
        expect(RenewalPriceNote(row({ RenewalOrderID: 'o-2', RenewalQuantity: 3 }))).toBe('× 3');
    });

    it('under a placed renewal, says how far the order price actually moved from the current term', () => {
        expect(RenewalPriceNote(row({ RenewalOrderID: 'o-2', RenewalUnitPrice: 1155 }))).toBe('+5% vs current');
        expect(RenewalPriceNote(row({ RenewalOrderID: 'o-2', RenewalUnitPrice: 1067 }))).toBe('−3% vs current');
        expect(RenewalPriceNote(row({ RenewalOrderID: 'o-2', RenewalUnitPrice: 1100, RenewalQuantity: 2 }))).toBe('same price · × 2');
        // A free current term has no base to move from: no percentage is invented.
        expect(RenewalPriceNote(row({ RenewalOrderID: 'o-2', CurrentUnitPrice: 0, RenewalUnitPrice: 500 }))).toBeNull();
        expect(PriceChangePercent(1100, 1155)).toBe(5);
        expect(PriceChangePercent(1200, 1234.56)).toBe(2.88);
        expect(PriceChangePercent(null, 1)).toBeNull();
    });

    it('writes the projection as three short lines a person can check', () => {
        expect(ProjectionLines(row())).toEqual([
            { Label: 'Base', Text: '$1,100.00 · current price' },
            { Label: 'Increase', Text: '+5% · set on the subscription' },
            { Label: 'New term', Text: '04/01/2027 – 03/31/2028' },
        ]);
        expect(ProjectionLines(row({ ProjectedIncreasePercent: 0, ProjectedIncreaseSource: 'None', ProjectedBasePriceSource: 'SuccessorList', ProjectedProductName: 'Sidecar Plus' }))?.slice(0, 2)).toEqual([
            { Label: 'Base', Text: '$1,100.00 · list price of Sidecar Plus' },
            { Label: 'Increase', Text: 'none set' },
        ]);
        expect(ProjectionLines(row({ ProjectedUnitPrice: null, ProjectionProblem: 'no list price' }))).toEqual([{ Label: 'Cannot price', Text: 'no list price' }]);
        expect(ProjectionLines(row({ ProjectedUnitPrice: null }))).toBeNull();
    });

    it('describes the end date relative to today', () => {
        expect(EndsNote(32)).toBe('in 32d');
        expect(EndsNote(0)).toBe('ends today');
        expect(EndsNote(-3)).toBe('ended 3d ago');
    });

    it('labels every state', () => {
        expect(RenewalStateLabel('Scheduled')).toBe('Auto-renews');
        expect(RenewalStateLabel('WillEnd')).toBe('Will end');
        expect(RenewalStateLabel('ProviderBilled')).toBe('Gateway billed');
    });
});

describe('SummarizePlacement', () => {
    const candidate = (overrides: Partial<RenewalCandidate>): RenewalCandidate => ({
        SubscriptionID: 'x',
        SubscriptionNumber: 'SUB-1',
        ProductID: 'p',
        CurrentTermEnd: '2027-03-31',
        LeadDays: 90,
        UnitPrice: 100,
        Quantity: 1,
        DiscountPct: 0,
        ...overrides,
    });

    it('splits the preview into what will be placed and what is skipped, and words it for the placement chosen', () => {
        const candidates = [
            candidate({ SubscriptionNumber: 'SUB-1', UnitPrice: 1000, Quantity: 2 }),
            candidate({ SubscriptionNumber: 'SUB-2', UnitPrice: 500, DiscountPct: 0.1 }),
            candidate({ SubscriptionNumber: 'SUB-3', SkippedReason: 'a renewal order already exists for this term' }),
        ];
        const drafts = SummarizePlacement(candidates);
        expect(drafts.Placeable.map((c) => c.SubscriptionNumber)).toEqual(['SUB-1', 'SUB-2']);
        expect(drafts.Orders).toBe(2);
        expect(drafts.Skipped.map((c) => c.SubscriptionNumber)).toEqual(['SUB-3']);
        expect(drafts.Total).toBe(2450);
        expect(drafts.Message).toBe('2 renewal orders will be created as drafts, $2,450.00 before tax.');
        expect(drafts.Detail).toBe('1 will be skipped: SUB-3 (a renewal order already exists for this term).');
        expect(SummarizePlacement(candidates, 'Confirmed').Message).toBe('2 renewal orders will be created as confirmed, $2,450.00 before tax.');
    });

    it('counts one order for subscriptions the pass combines, and says so', () => {
        const combined = SummarizePlacement([
            candidate({ SubscriptionNumber: 'SUB-1', OrderGroup: 1, UnitPrice: 1000 }),
            candidate({ SubscriptionNumber: 'SUB-2', OrderGroup: 1, UnitPrice: 500 }),
            candidate({ SubscriptionNumber: 'SUB-3', OrderGroup: 2, UnitPrice: 250 }),
        ]);
        expect(combined.Orders).toBe(2);
        expect(combined.Message).toBe('3 subscriptions will renew on 2 renewal orders, created as drafts, $1,750.00 before tax.');
        expect(SummarizePlacement([candidate({ OrderGroup: 1 })]).Message).toBe('1 renewal order will be created as a draft, $100.00 before tax.');
    });

    it('says plainly when nothing can be placed', () => {
        const summary = SummarizePlacement([candidate({ SkippedReason: 'the subscription is Canceled, not Active or Trialing, so nothing renews it' })]);
        expect(summary.Placeable).toHaveLength(0);
        expect(summary.Message).toBe('Nothing can be placed for the rows you ticked.');
        expect(summary.Detail).toMatch(/^1 will be skipped/);
    });
});

describe('SharedOrderWarnings', () => {
    const a = row({ SubscriptionID: 'a', ProductName: 'Sidecar', CurrentOrderID: 'o1', CurrentOrderNumber: 'ORD-1' });
    const b = row({ SubscriptionID: 'b', ProductName: 'Betty', CurrentOrderID: 'o1', CurrentOrderNumber: 'ORD-1' });
    const c = row({ SubscriptionID: 'c', ProductName: 'Analytics', CurrentOrderID: 'o1', CurrentOrderNumber: 'ORD-1' });
    const d = row({ SubscriptionID: 'd', ProductName: 'Sidecar', CurrentOrderID: 'o2', CurrentOrderNumber: 'ORD-2' });

    it('warns when a sibling from the same original order is ending in the window but was not selected', () => {
        expect(SharedOrderWarnings([a], [a, b, c, d])).toEqual([
            'Other subscriptions from the same original order are ending in this window and are not selected: ORD-1 (Betty, Analytics). Renewed later, they would go on a separate order.',
        ]);
        // A sibling that already has its renewal order is not a missed one.
        expect(SharedOrderWarnings([a], [a, row({ ...b, RenewalOrderID: 'r' })])).toEqual([]);
    });

    it('says nothing when the chosen rows cover their orders', () => {
        expect(SharedOrderWarnings([a, b, c], [a, b, c, d])).toEqual([]);
        expect(SharedOrderWarnings([a, d], [a, d])).toEqual([]);
    });
});

describe('CompareRows', () => {
    it('sorts every column: text case-insensitively, auto-renew on first, states by who must act first', () => {
        const a = row({ SubscriptionNumber: 'A', CompanyName: 'zeta', AutoRenew: false, State: 'Renewed', CurrentOrderNumber: 'ORD-2', Status: 'Trialing' });
        const b = row({ SubscriptionNumber: 'B', CompanyName: 'Alpha', AutoRenew: true, State: 'WillEnd', CurrentOrderNumber: 'ORD-1', Status: 'Active' });
        const by = (key: Parameters<typeof CompareRows>[2]) => [a, b].sort((x, y) => CompareRows(x, y, key)).map((r) => r.SubscriptionNumber);
        expect(by('CompanyName')).toEqual(['B', 'A']);
        expect(by('AutoRenew')).toEqual(['B', 'A']);
        expect(by('State')).toEqual(['B', 'A']);
        expect(by('CurrentOrderNumber')).toEqual(['B', 'A']);
        expect(by('Status')).toEqual(['B', 'A']);
        expect(by('RenewalOrderNumber')).toEqual(['A', 'B']); // both empty: the subscription number breaks the tie
    });

    it('sorts by the renewal price whichever column holds it, with the subscription number as the tiebreak', () => {
        const a = row({ SubscriptionNumber: 'SUB-A', RenewalOrderID: 'o', RenewalUnitPrice: 900, ProjectedUnitPrice: 5000 });
        const b = row({ SubscriptionNumber: 'SUB-B', ProjectedUnitPrice: 1000 });
        const c = row({ SubscriptionNumber: 'SUB-C', ProjectedUnitPrice: 1000 });
        expect([c, b, a].sort((x, y) => CompareRows(x, y, 'RenewalPrice')).map((r) => r.SubscriptionNumber)).toEqual(['SUB-A', 'SUB-B', 'SUB-C']);
    });

    it('sorts customers by name, falling back to the account', () => {
        const a = row({ SubscriptionNumber: 'SUB-A', ContactName: null, AccountName: 'Zeta Org' });
        const b = row({ SubscriptionNumber: 'SUB-B', ContactName: 'Alan Turing' });
        expect([a, b].sort((x, y) => CompareRows(x, y, 'ContactName')).map((r) => r.SubscriptionNumber)).toEqual(['SUB-B', 'SUB-A']);
    });
});

describe('Company and Product facets', () => {
    const rows = [
        row({ SubscriptionID: 's1', CompanyID: 'bc', CompanyName: 'Blue Cypress', ProductID: 'p1', ProductName: 'Sidecar' }),
        row({ SubscriptionID: 's2', CompanyID: 'bc', CompanyName: 'Blue Cypress', ProductID: 'p2', ProductName: 'Betty' }),
        row({ SubscriptionID: 's3', CompanyID: 'sp', CompanyName: 'SoundPost', ProductID: 'p1', ProductName: 'Sidecar' }),
        row({ SubscriptionID: 's4', CompanyID: 'ci', CompanyName: 'cimatri', ProductID: 'p3', ProductName: 'Analytics' }),
    ];

    it('offers only what is in the window, by name, with how many rows carry each', () => {
        expect(FacetOptions(rows, 'Company')).toEqual([
            { Value: 'bc', Text: 'Blue Cypress', Count: 2 },
            { Value: 'ci', Text: 'cimatri', Count: 1 },
            { Value: 'sp', Text: 'SoundPost', Count: 1 },
        ]);
        expect(FacetOptions(rows, 'Product').map((o) => o.Text)).toEqual(['Analytics', 'Betty', 'Sidecar']);
    });

    it('counts over the rows the other facet leaves, keeping a choice at 0 rather than dropping it', () => {
        const forSoundPost = rows.filter((r) => MatchesFacets(r, { Companies: ['sp'], Products: [] }));
        expect(FacetOptions(rows, 'Product', forSoundPost)).toEqual([
            { Value: 'p3', Text: 'Analytics', Count: 0 },
            { Value: 'p2', Text: 'Betty', Count: 0 },
            { Value: 'p1', Text: 'Sidecar', Count: 1 },
        ]);
    });

    it('an empty facet keeps everything; a set one keeps only its IDs; both must hold', () => {
        expect(rows.filter((r) => MatchesFacets(r, NO_FACETS))).toHaveLength(4);
        expect(rows.filter((r) => MatchesFacets(r, { Companies: ['bc'], Products: [] })).map((r) => r.SubscriptionID)).toEqual(['s1', 's2']);
        expect(rows.filter((r) => MatchesFacets(r, { Companies: ['bc', 'sp'], Products: ['p1'] })).map((r) => r.SubscriptionID)).toEqual(['s1', 's3']);
    });

    it('drops a product tick the chosen company does not offer, and keeps the object when nothing changes', () => {
        const offered = FacetOptions(rows.filter((r) => r.CompanyID === 'sp'), 'Product');
        expect(offered.map((o) => o.Value)).toEqual(['p1']);
        expect(PruneProducts({ Companies: ['sp'], Products: ['p1', 'p2'] }, offered)).toEqual({ Companies: ['sp'], Products: ['p1'] });
        const same = { Companies: ['sp'], Products: ['p1'] };
        expect(PruneProducts(same, offered)).toBe(same);
    });

    it('names each applied choice as a chip, and removing a chip removes that one choice', () => {
        const companies = FacetOptions(rows, 'Company');
        const products = FacetOptions(rows, 'Product');
        const facets = { Companies: ['sp'], Products: ['p1', 'p2'] };
        expect(AppliedFacets(facets, companies, products)).toEqual([
            { key: 'Company:sp', label: 'Company', value: 'SoundPost' },
            { key: 'Product:p1', label: 'Product', value: 'Sidecar' },
            { key: 'Product:p2', label: 'Product', value: 'Betty' },
        ]);
        expect(RemoveFacet(facets, 'Product:p1')).toEqual({ Companies: ['sp'], Products: ['p2'] });
        expect(RemoveFacet(facets, 'Company:sp')).toEqual({ Companies: [], Products: ['p1', 'p2'] });
        expect(RemoveFacet(facets, 'Nonsense')).toBe(facets);
    });
});

describe('BuildRenewalsExport', () => {
    it('writes one row per subscription with the grid and side-panel facts in plain words', () => {
        const out = BuildRenewalsExport([row()]);
        expect(out.Columns.map((c) => c.name)).toContain('IncreasePercent');
        expect(out.Columns.find((c) => c.name === 'RenewalPrice')).toMatchObject({ dataType: 'number', numberFormat: '#,##0.00' });
        expect(out.Columns.find((c) => c.name === 'TermEnd')?.dataType).toBe('dateonly');
        expect(out.Rows[0]).toMatchObject({
            Subscription: 'SUB-000001',
            Customer: 'Ada Lovelace',
            Company: 'Blue Cypress',
            AutoRenew: 'Yes',
            RenewalState: 'Auto-renews',
            AutoRenewsOn: '2026-12-31',
            TermEnd: '2027-03-31',
            CurrentPrice: 1100,
            RenewalOrder: null,
            RenewalPrice: 1155,
            RenewalPriceBasis: 'Current undiscounted price',
            IncreasePercent: 5,
            IncreaseSource: 'Subscription',
            RenewalTermStart: '2027-04-01',
        });
        // Every column named has a key on the row, so the sheet has no silent blanks.
        for (const c of out.Columns) expect(Object.keys(out.Rows[0])).toContain(c.name);
    });

    it('for a placed renewal, exports the order price and the increase actually taken', () => {
        const placed = row({ RenewalOrderID: 'o-2', RenewalOrderNumber: 'ORD-0200', RenewalOrderStatus: 'Confirmed', RenewalUnitPrice: 1210, RenewalLineTotal: 1210, RenewalBooked: true, RenewalTermStart: '2027-04-01', RenewalTermEnd: '2028-03-31', State: 'Renewed' });
        expect(BuildRenewalsExport([placed]).Rows[0]).toMatchObject({
            RenewalOrder: 'ORD-0200',
            RenewalState: 'Renewed',
            RenewalPrice: 1210,
            RenewalPriceBasis: 'Placed order',
            IncreasePercent: 10,
            IncreaseSource: 'Actual, vs current price',
        });
    });

    it('an unpriced row exports no increase rather than a zero', () => {
        const problem = row({ ProjectedUnitPrice: null, ProjectedIncreasePercent: null, ProjectionProblem: 'no list price' });
        expect(BuildRenewalsExport([problem]).Rows[0]).toMatchObject({ RenewalPrice: null, IncreasePercent: null, RenewalPriceBasis: null, ProjectionProblem: 'no list price' });
    });
});

describe("the subscription's own increase", () => {
    it('reads the subscription rate first, then what a projection says it inherits, then that nothing is set', () => {
        expect(SubscriptionIncreaseNote(row({ SubscriptionIncreasePercent: 4.5 }))).toBe('4.5% · set on this subscription');
        expect(SubscriptionIncreaseNote(row({ SubscriptionIncreasePercent: null, ProjectedIncreasePercent: 3, ProjectedIncreaseSource: 'Product' }))).toBe('Not set · inherits 3% from the product');
        expect(SubscriptionIncreaseNote(row({ SubscriptionIncreasePercent: null, ProjectedIncreasePercent: 0, ProjectedIncreaseSource: 'None' }))).toBe('Not set · inherits from the product, its category or the company (none set)');
    });

    it('prefills the dialog with the one rate every chosen row holds, and leaves it empty when they differ', () => {
        expect(SharedIncrease([row({ SubscriptionIncreasePercent: 5 }), row({ SubscriptionIncreasePercent: 5 })])).toBe(5);
        expect(SharedIncrease([row({ SubscriptionIncreasePercent: null }), row({ SubscriptionIncreasePercent: null })])).toBeNull();
        expect(SharedIncrease([row({ SubscriptionIncreasePercent: 5 }), row({ SubscriptionIncreasePercent: null })])).toBeUndefined();
        expect(SharedIncrease([])).toBeUndefined();
    });

    it('reports the update in one sentence, naming what failed', () => {
        const ok = SettingsUpdateText({ Success: true, Message: 'Renewal increase 5%: 2 subscriptions updated.', Updated: 2, Unchanged: 0, Failed: 0, Changes: [] });
        expect(ok.Tone).toBe('success');
        expect(ok.Text).toBe('Renewal increase 5%: 2 subscriptions updated. No order was changed; the next renewal each one places follows the new settings.');
        const partial = SettingsUpdateText({
            Success: true,
            Message: 'Auto-renew off: 1 subscription updated, 1 failed.',
            Updated: 1,
            Unchanged: 0,
            Failed: 1,
            Changes: [{ SubscriptionID: 's', SubscriptionNumber: 'SUB-3', Previous: { AutoRenew: true, IncreasePercent: 0 }, Current: { AutoRenew: true, IncreasePercent: 0 }, Changed: false, Error: 'the gateway bills it' }],
        });
        expect(partial.Tone).toBe('warning');
        expect(partial.Text).toMatch(/SUB-3: the gateway bills it/);
    });
});

describe('an increase that is set but not applied', () => {
    const notApplied = row({ ProjectedUnitPrice: 1100, ProjectedLineTotal: 1100, ProjectedIncreasePercent: 0, ProjectedIncreaseSource: 'None', ProjectedIncreaseSetPercent: 2, ProjectedIncreaseSetSource: 'Subscription', ProjectedIncreaseApplied: false });

    it('says so under the price instead of pretending no increase exists', () => {
        expect(RenewalPriceNote(notApplied)).toBe('projected · 2% set, not applied: no anniversary this term');
        expect(RenewalPriceNote(row({ ProjectedIncreaseSetPercent: 5, ProjectedIncreaseSetSource: 'Subscription', ProjectedIncreaseApplied: true }))).toBe('projected · +5% (subscription)');
    });

    it('explains it on the Increase line', () => {
        expect(ProjectionLines(notApplied)?.[1]).toEqual({ Label: 'Increase', Text: '2% set on the subscription · not applied: no anniversary this term' });
    });

    it('the export says whether the increase applied', () => {
        expect(BuildRenewalsExport([notApplied]).Rows[0]).toMatchObject({ IncreasePercent: 0, IncreaseSource: 'Subscription', IncreaseApplied: 'No: no anniversary this term' });
        expect(BuildRenewalsExport([row()]).Rows[0]).toMatchObject({ IncreaseApplied: 'Yes' });
    });
});

describe('a one-day expiring term', () => {
    it('is flagged for attention and warned about under Ends', () => {
        const oneDay = row({ TermStartDate: '2026-11-24', TermEndDate: '2026-11-24' });
        expect(OneDayTerm(oneDay)).toBe(true);
        expect(TermWarning(oneDay)).toBe('one-day term: check the data');
        expect(NeedsAttention(oneDay)).toBe(true);
        expect(OneDayTerm(row())).toBe(false);
        expect(TermWarning(row())).toBeNull();
    });
});

describe('changing the product', () => {
    it('names what the chosen rows are on now, most common first', () => {
        expect(CurrentProductsNote([row({ ProductName: 'Betty (converted pricing)' }), row({ ProductName: 'rasa.io Newsletter' }), row({ ProductName: 'Betty (converted pricing)' })])).toBe(
            'Betty (converted pricing) ×2, rasa.io Newsletter ×1',
        );
        expect(CurrentProductsNote([row({ ProductName: 'Sidecar' })])).toBe('Sidecar');
    });

    it('reports the change, its warnings and its failures in one notice', () => {
        const text = ProductChangeText({
            Success: true,
            Message: 'Product set to Betty Knowledge Assistant: 2 subscriptions updated, 1 failed.',
            Updated: 2,
            Unchanged: 0,
            Failed: 1,
            Changes: [
                { SubscriptionID: 'a', SubscriptionNumber: 'SUB-1', PreviousProductID: 'x', PreviousProductName: 'old', CurrentProductID: 'y', CurrentProductName: 'new', TypeMoved: false, Changed: true },
                { SubscriptionID: 'b', SubscriptionNumber: 'SUB-2', PreviousProductID: 'x', PreviousProductName: 'old', CurrentProductID: 'y', CurrentProductName: 'new', TypeMoved: true, Changed: true, Warning: 'the product is sold by another company; the subscription keeps its own' },
                { SubscriptionID: 'c', SubscriptionNumber: 'SUB-3', PreviousProductID: 'x', PreviousProductName: 'old', CurrentProductID: 'x', CurrentProductName: 'old', TypeMoved: false, Changed: false, Error: 'the gateway bills this subscription' },
            ],
        });
        expect(text.Tone).toBe('warning');
        expect(text.Text).toBe(
            'Product set to Betty Knowledge Assistant: 2 subscriptions updated, 1 failed. SUB-3: the gateway bills this subscription. SUB-2: the product is sold by another company; the subscription keeps its own. Booked orders and deals are unchanged; the next renewal uses the new product at the current price plus increase.',
        );
    });
});

describe('remembering the filters', () => {
    function storage(initial: Record<string, string> = {}) {
        const map = new Map(Object.entries(initial));
        return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
    }

    it('round-trips the window, facets and preset', () => {
        const st = storage();
        WritePageState(st, { WindowDays: 180, Companies: ['co-1'], Products: ['p-1', 'p-2'], Preset: 'manual' });
        expect(ReadPageState(st)).toEqual({ WindowDays: 180, Companies: ['co-1'], Products: ['p-1', 'p-2'], Preset: 'manual' });
    });

    it('falls back field by field on anything malformed, and to nothing when storage is missing or unreadable', () => {
        expect(ReadPageState(storage({ 'mjOrders.renewals.filters': '{"WindowDays": 7, "Companies": "x", "Products": [1, "ok"], "Preset": "nope"}' }))).toEqual({
            WindowDays: 90,
            Companies: [],
            Products: ['ok'],
            Preset: 'all',
        });
        expect(ReadPageState(storage({ 'mjOrders.renewals.filters': '{not json' }))).toBeNull();
        expect(ReadPageState(storage())).toBeNull();
        expect(ReadPageState(null)).toBeNull();
        expect(() => WritePageState({ setItem: () => { throw new Error('quota'); } }, { WindowDays: 90, Companies: [], Products: [], Preset: 'all' })).not.toThrow();
    });

    it('drops a remembered company that is no longer in the window', () => {
        const offered = [{ Value: 'co-1', Text: 'A', Count: 1 }];
        expect(PruneCompanies({ Companies: ['co-1', 'gone'], Products: [] }, offered)).toEqual({ Companies: ['co-1'], Products: [] });
        const same = { Companies: ['co-1'], Products: [] };
        expect(PruneCompanies(same, offered)).toBe(same);
    });
});

describe('ExclusionNote', () => {
    it('says how many ticked rows the dialog leaves out and why, most common reason first', () => {
        expect(
            ExclusionNote([
                row({ State: 'Renewed', RenewalOrderID: 'r1' }),
                row({ State: 'Renewed', RenewalOrderID: 'r2' }),
                row({ State: 'ProviderBilled', ProviderBilled: true }),
                row({ State: 'Inactive', Status: 'Canceled' }),
            ]),
        ).toBe('4 · already renewed (2), billed by a payment gateway (1), not renewable (canceled) (1)');
        expect(ExclusionNote([row({ State: 'RenewalPending', RenewalOrderID: 'd' })])).toBe('1 · a renewal draft already exists (1)');
        expect(ExclusionNote([])).toBeNull();
    });
});

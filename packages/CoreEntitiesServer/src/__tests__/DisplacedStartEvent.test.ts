/**
 * The record a confirm leaves when an extension displaces a line's stated start — golive #299.
 *
 * Before this the displaced date reached only the server log, so the order screen could not say
 * why a line's dates changed. These pin what is recorded, and that the order screen's reader
 * accepts exactly what the server writes.
 */
import { describe, expect, it } from 'vitest';
import { ParseDisplacedTermStart } from '@mj-biz-apps/orders-entities';
import { SubscriptionBehavior, type SubscriptionTypeRules } from '../SubscriptionBehavior.js';
import { DisplacedStartEventData } from '../displaced-start-event.js';

const rules: SubscriptionTypeRules = {
    ID: 'st-1',
    Code: 'Test',
    SubscriberScope: 'Either',
    BenefitModel: 'Holder',
    StartMode: 'Immediate',
    DefaultTermMonths: 12,
    BillingCadence: 'Annual',
    RecognitionCadence: 'Monthly',
    TrialDays: 0,
    ConcurrencyMode: 'ExtendExisting',
    ReactivationMode: 'AlwaysCreateNew',
    AutoRenewDefault: true,
    RenewalLeadDays: 30,
    CancellationMode: 'EndOfTerm',
    CancellationRefundMode: 'NoRefund',
    GracePeriodDays: 0,
};

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const LINE = 'line-1';

/** The reported case: the customer holds the product through 9/30/2027 and a new line states 10/1/2026. */
function decideSameProduct(requested: Date | null) {
    return new SubscriptionBehavior().Decide({
        Rules: rules,
        PurchaseDate: utc('2026-09-29'),
        Amount: 1000,
        Subscriber: { OrganizationID: 'org-1' },
        Existing: { ID: 'sub-1', Status: 'Active', LatestTermEnd: utc('2027-09-30'), LatestTermNumber: 1 },
        RequestedStartDate: requested,
    });
}

describe('DisplacedStartEventData', () => {
    it('records the stated start and the settled term when an extension displaces the start', () => {
        const requested = utc('2026-10-01');
        const decision = decideSameProduct(requested);
        expect(decision.Action).toBe('ExtendExisting');

        expect(DisplacedStartEventData(LINE, decision, requested)).toEqual({
            StartOverrideIgnored: true,
            OrderLineID: LINE,
            RequestedStartDate: '2026-10-01',
            TermStartDate: '2027-10-01',
            TermEndDate: '2028-09-30',
        });
    });

    it('records nothing when the stated start is the continuation date', () => {
        const requested = utc('2027-10-01');
        expect(DisplacedStartEventData(LINE, decideSameProduct(requested), requested)).toBeUndefined();
    });

    it('records nothing when the line stated no start', () => {
        expect(DisplacedStartEventData(LINE, decideSameProduct(null), null)).toBeUndefined();
    });

    it('records nothing for a new subscription, which keeps its stated dates', () => {
        const requested = utc('2026-10-01');
        const decision = new SubscriptionBehavior().Decide({
            Rules: rules,
            PurchaseDate: utc('2026-09-29'),
            Amount: 1000,
            Subscriber: { OrganizationID: 'org-1' },
            Existing: null,
            RequestedStartDate: requested,
        });
        expect(decision.Action).toBe('CreateNew');
        expect(DisplacedStartEventData(LINE, decision, requested)).toBeUndefined();
    });

    it('is read back by the order screen as written', () => {
        const requested = utc('2026-10-01');
        const data = DisplacedStartEventData(LINE, decideSameProduct(requested), requested);
        const eventData = JSON.stringify({ TermNumber: 2, Action: 'ExtendExisting', ...data });

        expect(ParseDisplacedTermStart(eventData, [{ ID: LINE, LineNumber: 1 }])).toMatchObject({
            LineNumber: 1,
            StatedStart: '2026-10-01',
            SettledStart: '2027-10-01',
            SettledEnd: '2028-09-30',
        });
    });
});

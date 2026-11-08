import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    calls: [] as { input: Record<string, unknown>; options: Record<string, unknown> }[],
    output: { Success: true } as Record<string, unknown>,
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        OrdersCancelSubscriptionOperation: class {
            Execute(input: Record<string, unknown>, options: Record<string, unknown>) {
                mocks.calls.push({ input, options });
                return Promise.resolve({ Success: true, Output: mocks.output });
            }
        },
    };
});

import type { IMetadataProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { MJOSubscriptionCancelComponent } from '../subscription-cancel.component';

const SUB = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';
const PREVIEW = {
    Success: true,
    Decision: { EffectiveDate: '2026-12-31T00:00:00.000Z', AccessThroughDate: '2027-01-30T00:00:00.000Z', RefundAmount: 0 },
};

/** A component with its inputs set, without standing up Angular DI. */
function componentFor(record: Partial<mjBizAppsOrdersSubscriptionEntity>, canUpdate = true): MJOSubscriptionCancelComponent {
    const c = Object.create(MJOSubscriptionCancelComponent.prototype) as MJOSubscriptionCancelComponent;
    Object.assign(c, {
        cdr: { detectChanges: vi.fn() },
        Canceled: { emit: vi.fn() },
        Open: false,
        Busy: false,
        Error: null,
        Timing: 'Type',
        Reason: '',
        Preview: null,
        EditMode: false,
    });
    c.Record = {
        ID: SUB,
        IsSaved: true,
        Status: 'Active',
        EntityInfo: { GetUserPermisions: () => ({ CanUpdate: canUpdate }) },
        ...record,
    } as unknown as mjBizAppsOrdersSubscriptionEntity;
    c.Provider = { CurrentUser: { ID: 'user-1' } } as unknown as IMetadataProvider;
    return c;
}

describe('Cancel subscription', () => {
    beforeEach(() => {
        mocks.calls.length = 0;
        mocks.output = PREVIEW;
    });

    it('is offered on a live subscription to a viewer who may update subscriptions', () => {
        expect(componentFor({}).CanCancel).toBe(true);
        expect(componentFor({ Status: 'Trialing' }).CanCancel).toBe(true);
        expect(componentFor({ Status: 'Paused' }).CanCancel).toBe(true);
    });

    it('is not offered on a canceled subscription, an unsaved one, or to a viewer who may not update', () => {
        expect(componentFor({ Status: 'Canceled' }).CanCancel).toBe(false);
        expect(componentFor({ IsSaved: false }).CanCancel).toBe(false);
        expect(componentFor({}, false).CanCancel).toBe(false);
    });

    it('does not open or confirm while the form is in edit mode (#749)', async () => {
        const c = componentFor({});
        c.EditMode = true;
        c.Start();
        expect(c.Open).toBe(false);

        // Edit mode entered with the panel already open and previewed: Confirm still waits.
        c.EditMode = false;
        c.Start();
        await c.RunPreview();
        c.EditMode = true;
        await c.Confirm();
        expect(mocks.calls).toHaveLength(1);
        expect(c.Canceled.emit).not.toHaveBeenCalled();
    });

    it('defaults to the type\'s own rule, sending no timing, and previews without writing', async () => {
        const c = componentFor({});
        c.Start();
        await c.RunPreview();

        expect(c.Timing).toBe('Type');
        expect(mocks.calls).toHaveLength(1);
        expect(mocks.calls[0].input).toEqual({ SubscriptionID: SUB, Timing: undefined, Reason: undefined, Preview: true });
        expect(mocks.calls[0].options.provider).toBe(c.Provider);
        expect(c.Preview).toBe(PREVIEW);
    });

    it('confirms with the same choice, emits, and closes', async () => {
        const c = componentFor({});
        c.Start();
        c.Timing = 'Immediate';
        c.Reason = '  Moved to another plan ';
        await c.RunPreview();
        await c.Confirm();

        expect(mocks.calls[1].input).toEqual({ SubscriptionID: SUB, Timing: 'Immediate', Reason: 'Moved to another plan', Preview: false });
        expect(c.Canceled.emit).toHaveBeenCalledOnce();
        expect(c.Open).toBe(false);
        expect(c.Timing).toBe('Type');
        expect(c.Reason).toBe('');
    });

    it('sends end of term when the person overrides the type with it', async () => {
        const c = componentFor({});
        c.Start();
        c.Timing = 'EndOfTerm';
        await c.RunPreview();

        expect(mocks.calls[0].input).toEqual({ SubscriptionID: SUB, Timing: 'EndOfTerm', Reason: undefined, Preview: true });
    });

    it('drops the preview when the choice changes, so a stale preview cannot be confirmed', async () => {
        const c = componentFor({});
        c.Start();
        await c.RunPreview();
        c.Timing = 'Immediate';
        c.Changed();
        expect(c.Preview).toBeNull();
        await c.Confirm();

        expect(mocks.calls).toHaveLength(1);
    });

    it('shows the operation\'s refusal and stays open', async () => {
        mocks.output = { Success: false, Message: 'Subscription is already canceled.' };
        const c = componentFor({});
        c.Start();
        await c.RunPreview();

        expect(c.Error).toBe('Subscription is already canceled.');
        expect(c.Preview).toBeNull();
        expect(c.Open).toBe(true);
    });
    describe('when a payment gateway bills the subscription (E2b)', () => {
        const GATEWAY_REFUSAL =
            'The payment gateway did not confirm the cancel of sub_x: card_declined. Nothing was changed in Orders. Try again.';

        it('names the gateway subscription id, and none for a subscription the gateway does not bill', () => {
            expect(componentFor({ ProviderSubscriptionID: 'sub_1Abc' } as Partial<mjBizAppsOrdersSubscriptionEntity>).GatewaySubscriptionID).toBe('sub_1Abc');
            expect(componentFor({}).GatewaySubscriptionID).toBeNull();
            expect(componentFor({ ProviderSubscriptionID: null } as unknown as Partial<mjBizAppsOrdersSubscriptionEntity>).GatewaySubscriptionID).toBeNull();
        });

        // What the server sends for a Chicago business on a term covered through 2026-12-31: the gateway's
        // own bound is 00:00 the day AFTER coverage in Chicago (06:00Z on 1 Jan), and the decision's
        // EffectiveDate is the coverage end itself.
        const CHICAGO_BILLING_ENDS_AT = '2027-01-01T06:00:00.000Z';
        const CHICAGO_COVERAGE_ENDS = '2026-12-31';

        it('describes an immediate gateway cancel as stopping billing today, whatever dates it is given', () => {
            const c = componentFor({});
            expect(c.GatewayLine({ ProviderSubscriptionID: 'sub_x', When: 'Now' })).toBe('Stops billing today');
            expect(c.GatewayLine({ ProviderSubscriptionID: 'sub_x', When: 'Now', BillingEndsAt: CHICAGO_BILLING_ENDS_AT }, CHICAGO_COVERAGE_ENDS))
                .toBe('Stops billing today');
        });

        it('names the coverage end for an end-of-coverage gateway cancel, not the gateway\'s next-day bound', () => {
            const c = componentFor({});
            const line = c.GatewayLine(
                { ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: CHICAGO_BILLING_ENDS_AT },
                CHICAGO_COVERAGE_ENDS,
            );
            expect(line).toBe("Won't renew; nothing charged after coverage ends 2026-12-31");
            // Before: the line read the gateway's bound and said 2027-01-01, a day later than "Coverage ends".
            expect(line).not.toContain('2027-01-01');
        });

        it('falls back to words, never a dash, when there is no coverage end to name', () => {
            const c = componentFor({});
            expect(c.GatewayLine({ ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: CHICAGO_BILLING_ENDS_AT }))
                .toBe("Won't renew; nothing charged after coverage ends");
            expect(c.GatewayLine({ ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage' }, null))
                .toBe("Won't renew; nothing charged after coverage ends");
        });

        it('shows a gateway refusal on confirm, does not emit, and stays open with nothing reset', async () => {
            const c = componentFor({ ProviderSubscriptionID: 'sub_x' } as Partial<mjBizAppsOrdersSubscriptionEntity>);
            mocks.output = { ...PREVIEW, Gateway: { ProviderSubscriptionID: 'sub_x', When: 'Now' } };
            c.Start();
            c.Timing = 'Immediate';
            c.Reason = 'Moved';
            await c.RunPreview();
            mocks.output = { Success: false, Message: GATEWAY_REFUSAL };
            await c.Confirm();

            expect(mocks.calls).toHaveLength(2);
            expect(mocks.calls[1].input).toMatchObject({ Preview: false, Timing: 'Immediate' });
            expect(c.Error).toBe(GATEWAY_REFUSAL);
            expect(c.Canceled.emit).not.toHaveBeenCalled();
            expect(c.Open).toBe(true);
            expect(c.Busy).toBe(false);
            expect(c.Timing).toBe('Immediate');
            expect(c.Reason).toBe('Moved');
        });

        it('still emits Canceled and closes when the gateway confirms', async () => {
            const c = componentFor({ ProviderSubscriptionID: 'sub_x' } as Partial<mjBizAppsOrdersSubscriptionEntity>);
            const preview = { ...PREVIEW, Gateway: { ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: '2026-12-31T00:00:00.000Z' } };
            const done = { ...preview, Gateway: { ...preview.Gateway, Outcome: 'EndsAtPeriodEnd' } };
            mocks.output = preview;
            c.Start();
            await c.RunPreview();
            expect(c.Preview).toBe(preview);
            mocks.output = done;
            await c.Confirm();

            expect(c.Canceled.emit).toHaveBeenCalledOnce();
            expect(c.Canceled.emit).toHaveBeenCalledWith(done);
            expect(c.Error).toBeNull();
            expect(c.Open).toBe(false);
        });
    });
});

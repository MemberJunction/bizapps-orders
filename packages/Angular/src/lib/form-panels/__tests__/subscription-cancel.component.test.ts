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
    });

    it('is not offered on a canceled subscription, an unsaved one, or to a viewer who may not update', () => {
        expect(componentFor({ Status: 'Canceled' }).CanCancel).toBe(false);
        expect(componentFor({ IsSaved: false }).CanCancel).toBe(false);
        expect(componentFor({}, false).CanCancel).toBe(false);
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
        await c.Confirm();

        expect(c.Preview).toBeNull();
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
});

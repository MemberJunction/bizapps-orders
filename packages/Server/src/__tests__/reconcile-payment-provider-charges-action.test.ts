/**
 * The `Orders.ReconcilePaymentProviderCharges` Action is an adapter (#477): it validates its
 * parameters, routes to the operation of the same name, and fails the run when a provider could not
 * be read. Preview defaults to true and is read strictly, because the scheduled job ships in preview.
 */
import { describe, expect, it } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { OrdersReconcilePaymentProviderChargesOutput } from '@mj-biz-apps/orders-entities';

import { ReconcilePaymentProviderChargesAction } from '../custom/reconcile-payment-provider-charges.action.js';

interface CallableAction {
    InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message?: string }>;
}

function run(params: ActionParam[], output?: Partial<OrdersReconcilePaymentProviderChargesOutput>) {
    const routed: Array<{ key: string; input: unknown }> = [];
    const full: OrdersReconcilePaymentProviderChargesOutput = {
        Success: true,
        Preview: true,
        FromDate: '2026-10-02',
        ToDate: '2026-10-08',
        Providers: [],
        Mismatches: [],
        Raised: 0,
        AlreadyRaised: 0,
        Errors: [],
        Message: '0 mismatch(es)',
        ...output,
    };
    const provider = {
        RouteOperation: (key: string, input: unknown) => {
            routed.push({ key, input });
            return Promise.resolve({ Success: true, Output: full });
        },
    };
    const action = new ReconcilePaymentProviderChargesAction() as unknown as CallableAction;
    const runParams = { ContextUser: { ID: 'job-user' }, Provider: provider, Params: params } as unknown as RunActionParams;
    return action.InternalRunAction(runParams).then((res) => ({ res, routed }));
}

const p = (Name: string, Value: unknown) => ({ Name, Value, Type: 'Input' }) as ActionParam;

describe('Orders.ReconcilePaymentProviderCharges action', () => {
    it('routes in preview by default', async () => {
        const { res, routed } = await run([]);
        expect(routed).toEqual([{ key: 'Orders.ReconcilePaymentProviderCharges', input: { Preview: true } }]);
        expect(res).toMatchObject({ Success: true, ResultCode: 'COMPLETED' });
    });

    it('reads Preview "false" as false, the way a scheduler stores it', async () => {
        const { routed } = await run([p('Preview', 'false'), p('FromDate', '2026-10-01')]);
        expect(routed[0].input).toEqual({ Preview: false, FromDate: '2026-10-01' });
    });

    it('refuses an unreadable Preview rather than defaulting it', async () => {
        const { res, routed } = await run([p('Preview', 'maybe')]);
        expect(res).toMatchObject({ Success: false, ResultCode: 'INVALID_PREVIEW' });
        expect(routed).toHaveLength(0);
    });

    it('fails the run when a provider could not be read', async () => {
        const { res } = await run([], { Success: false, Errors: [{ Code: 'PROVIDER_FAILED', Message: 'key cannot read charges' }] });
        expect(res).toMatchObject({ Success: false, ResultCode: 'OPERATION_REPORTED_FAILURE' });
        expect(res.Message).toContain('key cannot read charges');
    });
});

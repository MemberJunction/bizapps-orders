/**
 * `Orders.DetectUnattestedProgress` Action (golive #279, type 2) — a failed raise is a failed run.
 *
 * The operation reports a raise accounting refused inside its output rather than throwing. The
 * Action is what the scheduler records, so it must turn that into `Success: false`: a green run
 * that put nothing on the review list would read exactly like a month with nothing to review.
 *
 * The provider is a stub whose `RouteOperation` answers for the operation key, so the Action's
 * routing is exercised without a server.
 */
import { describe, expect, it } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { RemoteOpResult } from '@memberjunction/core';
import type { OrdersDetectUnattestedProgressOutput } from '@mj-biz-apps/orders-entities';

import { DetectUnattestedProgressAction } from '../custom/detect-unattested-progress.action.js';

interface CallableAction {
    InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Params?: ActionParam[] }>;
}

function run(output: OrdersDetectUnattestedProgressOutput, asOf?: string) {
    const routed: Array<{ key: string; input: unknown }> = [];
    const provider = {
        RouteOperation: (key: string, input: unknown): Promise<RemoteOpResult<OrdersDetectUnattestedProgressOutput>> => {
            routed.push({ key, input });
            return Promise.resolve({ Success: true, ResultCode: 'SUCCESS', Output: output });
        },
    };
    const action = new DetectUnattestedProgressAction() as unknown as CallableAction;
    const params = {
        ContextUser: { ID: 'job-user' },
        Provider: provider,
        Params: asOf ? [{ Name: 'AsOfDate', Value: asOf, Type: 'Input' }] : [],
    } as unknown as RunActionParams;
    return { routed, result: action.InternalRunAction(params) };
}

const LINE = {
    OrderLineID: 'A',
    OrderNumber: 'ORD-A',
    LineNumber: 1,
    CompanyID: 'C',
    DaysWithoutAttestation: 58,
    DedupeKey: 'A|2026-09',
};

describe('Orders.DetectUnattestedProgress Action', () => {
    it('routes to the operation with the as-of day and reports the counts', async () => {
        const { routed, result } = run(
            { Success: true, AsOfDate: '2026-09-28', TypeInactive: false, Lines: [{ ...LINE, Created: true }], Raised: 1, AlreadyRaised: 0 },
            '2026-09-28',
        );
        const res = await result;
        expect(routed).toEqual([{ key: 'Orders.DetectUnattestedProgress', input: { AsOfDate: '2026-09-28' } }]);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('COMPLETED');
        const out = Object.fromEntries((res.Params ?? []).map((p) => [p.Name, p.Value]));
        expect(out).toMatchObject({ LineCount: 1, Raised: 1, AlreadyRaised: 0 });
    });

    it('a raise the operation reports as failed makes the run fail, with the reason', async () => {
        const { result } = run({
            Success: false,
            AsOfDate: '2026-09-28',
            TypeInactive: false,
            Lines: [LINE],
            Raised: 0,
            AlreadyRaised: 0,
            Message: 'Raising the unattested-progress exceptions failed. UNKNOWN_TYPE: no such type',
        });
        const res = await result;
        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('RAISE_FAILED');
        expect(res.Message).toContain('UNKNOWN_TYPE');
    });

    it('refuses a day that does not exist before routing anything', async () => {
        const { routed, result } = run(
            { Success: true, AsOfDate: '', TypeInactive: false, Lines: [], Raised: 0, AlreadyRaised: 0 },
            '2026-02-30',
        );
        const res = await result;
        expect(res.ResultCode).toBe('INVALID_AS_OF_DATE');
        expect(routed).toHaveLength(0);
    });
});

/**
 * The `Orders.DetectOverlappingSubscriptions` Action is an adapter: it validates its one parameter,
 * routes to the operation of the same name through the provider, and turns the operation's result
 * into the Action result the scheduler records. A pair the operation could not raise must fail the
 * run, so the scheduled job is not green on a night accounting refused everything.
 *
 * The provider is a stand-in with only `RouteOperation`, which is all the generated operation base
 * calls; the operation itself is covered in CoreEntitiesServer.
 */
import { describe, expect, it } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { OrdersDetectOverlappingSubscriptionsOutput } from '@mj-biz-apps/orders-entities';

import { DetectOverlappingSubscriptionsAction } from '../custom/detect-overlapping-subscriptions.action.js';

interface CallableAction {
    InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Params?: ActionParam[] }>;
}

interface Routed {
    key: string;
    input: unknown;
}

function run(params: ActionParam[], result: { Success: boolean; Output?: OrdersDetectOverlappingSubscriptionsOutput; ResultCode?: string; ErrorMessage?: string }) {
    const routed: Routed[] = [];
    const provider = {
        RouteOperation: (key: string, input: unknown) => {
            routed.push({ key, input });
            return Promise.resolve(result);
        },
    };
    const action = new DetectOverlappingSubscriptionsAction() as unknown as CallableAction;
    const runParams = { ContextUser: { ID: 'job-user' }, Provider: provider, Params: params } as unknown as RunActionParams;
    return action.InternalRunAction(runParams).then((res) => ({ res, routed, params: runParams.Params ?? [] }));
}

const output = (overrides: Partial<OrdersDetectOverlappingSubscriptionsOutput> = {}): OrdersDetectOverlappingSubscriptionsOutput => ({
    Success: true,
    Message: '2 overlapping pair(s) as of 2026-09-28: 2 exception(s) raised, 0 already raised, 0 skipped.',
    TypeActive: true,
    ExceptionDate: '2026-09-28',
    PairsFound: 2,
    PairsConsidered: 2,
    Created: 2,
    AlreadyRaised: 0,
    Skipped: 0,
    Errors: [],
    ...overrides,
});

const outputValue = (params: ActionParam[], name: string) => params.find((p) => p.Name === name)?.Value;

describe('Orders.DetectOverlappingSubscriptions action', () => {
    it('routes to the operation of the same name and reports its counts', async () => {
        const { res, routed, params } = await run([], { Success: true, Output: output() });

        expect(routed).toEqual([{ key: 'Orders.DetectOverlappingSubscriptions', input: {} }]);
        expect(res).toMatchObject({ Success: true, ResultCode: 'COMPLETED' });
        expect(outputValue(params, 'Created')).toBe(2);
        expect(outputValue(params, 'PairsFound')).toBe(2);
        expect(outputValue(params, 'ExceptionDate')).toBe('2026-09-28');
    });

    it('passes AsOfDate through', async () => {
        const { routed } = await run([{ Name: 'AsOfDate', Value: '2026-09-30', Type: 'Input' } as ActionParam], { Success: true, Output: output() });

        expect(routed[0].input).toEqual({ AsOfDate: '2026-09-30' });
    });

    it('treats a blank AsOfDate as absent, the way a scheduler writes an unset param', async () => {
        const { routed } = await run([{ Name: 'AsOfDate', Value: '', Type: 'Input' } as ActionParam], { Success: true, Output: output() });

        expect(routed[0].input).toEqual({});
    });

    it.each(['2026-02-30', 'not-a-date'])('refuses AsOfDate %s before routing anything', async (asOf) => {
        const { res, routed } = await run([{ Name: 'AsOfDate', Value: asOf, Type: 'Input' } as ActionParam], { Success: true, Output: output() });

        expect(res).toMatchObject({ Success: false, ResultCode: 'INVALID_AS_OF_DATE' });
        expect(routed).toHaveLength(0);
    });

    it('fails the run when a pair could not be raised, and names it', async () => {
        const errors = [{ DedupeKey: 'e1|l1', Code: 'UNKNOWN_ENTITY', Message: 'no such entity' }];
        const { res, params } = await run([], {
            Success: true,
            Output: output({ Success: false, Created: 1, Errors: errors, Message: '2 overlapping pair(s): 1 raised, 1 error(s) — see Errors.' }),
        });

        expect(res).toMatchObject({ Success: false, ResultCode: 'PARTIAL' });
        expect(res.Message).toContain('e1|l1');
        expect(outputValue(params, 'Errors')).toEqual(errors);
    });

    it('fails the run when the operation itself did not execute', async () => {
        const { res } = await run([], { Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: "The 'Accounting.RaiseFinanceExceptions' operation is not registered." });

        expect(res).toMatchObject({ Success: false, ResultCode: 'EXECUTION_ERROR' });
        expect(res.Message).toContain('not registered');
    });

    it('succeeds, saying so, when the exception type is inactive', async () => {
        const { res, params } = await run([], {
            Success: true,
            Output: output({ TypeActive: false, PairsFound: 0, PairsConsidered: 0, Created: 0, Message: 'inactive; nothing was checked.' }),
        });

        expect(res).toMatchObject({ Success: true, ResultCode: 'TYPE_INACTIVE' });
        expect(outputValue(params, 'TypeActive')).toBe(false);
    });
});

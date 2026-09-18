import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `GetOverdueWorklistOperation`'s default `AsOfDate` — the one production line B3 touches.
 *
 * Before this task the default was `new Date().toISOString().slice(0, 10)`, the UTC calendar day.
 * `bt.Today` in the view and `BusinessTimeZoneEngine.Instance.Today()` here are supposed to be the
 * SAME day; a worklist run with no explicit `AsOfDate` disagreeing with the view's own `IsOverdue`
 * column would put a different set of orders on the collections list depending on which surface a
 * user looked at — the exact multiple-surfaces-disagreeing failure `overdue.ts`'s header describes.
 *
 * `RunView` is mocked because this operation's only untested-elsewhere behaviour is which day it
 * asks the database to compare against; the mock captures the `ExtraFilter` `OverdueFilter` builds
 * from that day and returns no rows, so the rest of `InternalExecute` (aging buckets, credits) never
 * has anything to do.
 */

const mocks = vi.hoisted(() => ({
    lastRunViewParams: undefined as { ExtraFilter?: string } | undefined,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return {
                    RunView: vi.fn().mockImplementation((params: { ExtraFilter?: string }) => {
                        mocks.lastRunViewParams = params;
                        return Promise.resolve({ Success: true, Results: [] });
                    }),
                };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import type { OrdersGetOverdueWorklistInput, OrdersGetOverdueWorklistOutput } from '@mj-biz-apps/orders-entities';

import { GetOverdueWorklistOperation } from '../GetOverdueWorklistOperation.js';

/** `InternalExecute` is `protected` at compile time only; this is the typed shape to call it through. */
interface CallableOperation {
    InternalExecute(
        input: OrdersGetOverdueWorklistInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersGetOverdueWorklistOutput>;
}

function runWorklist(input: OrdersGetOverdueWorklistInput = {}): Promise<OrdersGetOverdueWorklistOutput> {
    const op = new GetOverdueWorklistOperation() as unknown as CallableOperation;
    return op.InternalExecute(input, {} as unknown as IMetadataProvider, {} as unknown as UserInfo);
}

// Pin the MACHINE zone to one that disagrees with the business zone at the chosen instant — see
// date-cell.test.ts for why this is required for the discrimination to be reliable. It is not
// strictly load-bearing for THIS test (the old code read `new Date().toISOString()`, which is
// always UTC regardless of `process.env.TZ`), but it is kept as defence-in-depth against a future
// change that reads local machine parts instead, exactly the class of bug bc-aidp-next-golive#168
// was filed over — stated explicitly rather than left implicit.
async function AT<T>(tz: string, fn: () => Promise<T>): Promise<T> {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
        return await fn();
    } finally {
        if (original === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = original;
        }
    }
}

describe('GetOverdueWorklistOperation defaults AsOfDate to the business day', () => {
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };

    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
        mocks.lastRunViewParams = undefined;
        vi.useRealTimers();
    });

    it('asks for orders overdue as of the CENTRAL day, not the UTC day, at 9 PM on the 27th', async () => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        engine._loaded = true;

        vi.useFakeTimers();
        // 02:00 UTC on the 28th = 21:00 CDT on the 27th: UTC has already ticked over, Chicago has not.
        vi.setSystemTime(new Date('2026-08-28T02:00:00.000Z'));

        await AT('Asia/Kolkata', async () => {
            const result = await runWorklist();
            expect(result.Success).toBe(true);
            expect(mocks.lastRunViewParams?.ExtraFilter).toContain("DueDate < '2026-08-27'");
            // The old default, so a regression back to `new Date().toISOString()` is caught directly.
            expect(mocks.lastRunViewParams?.ExtraFilter).not.toContain("DueDate < '2026-08-28'");
        });
    });

    it('still honours an explicit AsOfDate rather than overriding it with today', async () => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        engine._loaded = true;

        const result = await runWorklist({ AsOfDate: '2020-01-01' });
        expect(result.Success).toBe(true);
        expect(mocks.lastRunViewParams?.ExtraFilter).toContain("DueDate < '2020-01-01'");
    });
});

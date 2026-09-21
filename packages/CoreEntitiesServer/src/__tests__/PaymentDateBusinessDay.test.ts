/**
 * `PaymentHeader.PaymentDate` is a calendar day, not an instant (#209).
 *
 * The column is `DATE NOT NULL`, and three places wrote `new Date()` into it. An instant
 * serialises in UTC, so a payment taken at 9 PM Eastern was dated tomorrow — the reversal fell in
 * a different period from the capture it reverses, and a credit applied in the evening settled an
 * order on a day that had not happened yet. Same defect shape as the order-date case
 * (bc-aidp-next-golive#168, #208), and the same fix: `TodayAsDateValue()`, the business calendar
 * day pinned to UTC midnight.
 *
 * ## What discriminates old from new here
 *
 * `BUG_INSTANT` is 02:00 UTC on the 28th — 9 PM EDT on the 27th. At that instant UTC has already
 * turned over and the business zone has not, so `new Date()` read back the way a `DATE` column is
 * read (UTC parts) names the 28th while the business day is the 27th. Every assertion below is
 * that one-day difference, which is why each of these tests fails if its production line is
 * reverted rather than merely exercising it.
 *
 * The machine zone is pinned to Kolkata (UTC+5:30, also already on the 28th) as defence in depth,
 * matching this repo's convention: neither `new Date()` nor `TodayAsDateValue()` reads
 * `process.env.TZ` today, and the pin exists to catch a future change that starts reading local
 * machine parts — the original shape of bc-aidp-next-golive#168.
 *
 * ## Why the engine is pinned rather than loaded
 *
 * `BusinessTimeZoneEngine.Instance` is pinned by writing `_configurations`/`_loaded` directly, the
 * same reflection `CheckoutSessionService.test.ts` and `GetOverdueWorklistOperation.test.ts` use.
 * A pinned `_loaded` also makes the real `Config(false, ...)` a no-op, so the production warm-up
 * call does not need a provider that can answer a metadata read. Whether that warm-up call HAPPENS
 * is proven separately, by spying on `Config` itself: a spy that is never invoked is exactly what a
 * reverted `await BusinessTimeZoneEngine.Instance.Config(...)` line produces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mocks = vi.hoisted(() => ({
    /** Rows `RunView` should answer with, keyed by a fragment of the entity name. */
    runViewRows: new Map<string, unknown[]>(),
}));

// Only `RunView` is swapped — the operation constructs it with `new RunView(provider)`, and this
// repo's fake providers do not implement the real view pipeline. Everything else in core stays
// real, including `BaseRemotableOperation` (which `ApplyAccountCreditOperation` extends) and
// `BaseEngine` (which backs the `BusinessTimeZoneEngine` singleton these tests pin).
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn().mockImplementation((params: { EntityName: string; ExtraFilter?: string }) => {
                for (const [fragment, rows] of mocks.runViewRows) {
                    if (!params.EntityName.includes(fragment)) continue;
                    // Honour an `ID='…'` filter: `loadOrder` is called once per order, and a mock
                    // that returned the same first row both times would read the source order as
                    // the target too — which the operation correctly refuses, for the wrong reason.
                    const wanted = /ID='([^']+)'/.exec(params.ExtraFilter ?? '')?.[1];
                    const results = wanted
                        ? rows.filter((r) => (r as { ID?: string }).ID?.toLowerCase() === wanted.toLowerCase())
                        : rows;
                    return Promise.resolve({ Success: true, Results: results });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });
        },
    };
});

// `...actual` keeps the REAL `TodayAsDateValue`/`ToISODate` — they are the subject of these tests.
// Only the orders engine is stubbed: `accountCreditTypeID()` warms it and asks it for the
// AccountCredit tender, and answering `undefined` sends it down its own RunView fallback, which the
// mock above serves.
vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        OrdersEngine: { Instance: { PaymentTypeByCode: () => undefined } },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { ToISODate } from '@mj-biz-apps/orders-entities';

import { CreateReversingPayment, type ReversiblePayment } from '../PaymentReversalFactory.js';
import { ApplyAccountCreditOperation, type ApplyAccountCreditInput, type ApplyAccountCreditOutput } from '../ApplyAccountCreditOperation.js';

/** 02:00 UTC on the 28th = 21:00 EDT on the 27th. The bug report's own scenario. */
const BUG_INSTANT = '2026-08-28T01:00:00.000Z';
/** The business day at `BUG_INSTANT`. */
const BUSINESS_DAY = '2026-08-27';
/** What `new Date()` at `BUG_INSTANT` names once a `DATE` column reads it back from UTC parts. */
const UTC_DAY = '2026-08-28';

const engine = BusinessTimeZoneEngine.Instance as unknown as {
    _configurations: InstanceConfigurationRow[];
    _loaded: boolean;
};
const savedEngine = { rows: engine._configurations, loaded: engine._loaded };

/** A recording stand-in for a `BaseEntity`: every assignment is readable afterwards. */
function entityMock(id: string): Record<string, unknown> {
    return {
        ID: id,
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        Lines: { Add: vi.fn() },
        LatestResult: { CompleteMessage: '' },
    };
}

describe('PaymentDate is the business calendar day, not the clock instant (#209)', () => {
    let originalTZ: string | undefined;

    beforeEach(() => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/New_York","sql":"Eastern Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        engine._loaded = true;

        originalTZ = process.env.TZ;
        process.env.TZ = 'Asia/Kolkata';
        vi.useFakeTimers();
        vi.setSystemTime(new Date(BUG_INSTANT));
    });

    afterEach(() => {
        vi.useRealTimers();
        if (originalTZ === undefined) delete process.env.TZ;
        else process.env.TZ = originalTZ;
        engine._configurations = savedEngine.rows;
        engine._loaded = savedEngine.loaded;
        mocks.runViewRows.clear();
        vi.restoreAllMocks();
    });

    describe('a reversal (PaymentReversalFactory)', () => {
        const original: ReversiblePayment = {
            ID: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
            PaymentNumber: 'PAY-000004',
            ReceivingCompanyID: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
            BillToOrganizationID: null,
            BillToPersonID: null,
            PaymentTypeID: '3f2504e0-4f89-41d3-9a0c-0305e82c3303',
            // Null so `CopyPaymentDetail` — which is not what this test is about — stays out of it.
            PaymentDetailID: null,
        };

        /** A provider that hands back one recording header and can answer the sequence query. */
        function providerFor(header: Record<string, unknown>): IMetadataProvider {
            return {
                GetEntityObject: vi.fn().mockResolvedValue(header),
                ExecuteSQL: vi.fn().mockResolvedValue([{ Seq: 9 }]),
            } as unknown as IMetadataProvider;
        }

        it('stamps the business day, not the day the instant would serialise as', async () => {
            const header = entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3304');
            const user = { ID: 'user-1' } as unknown as UserInfo;

            await CreateReversingPayment(providerFor(header), user, original, { Amount: 25, Reason: null }, []);

            expect(ToISODate(header.PaymentDate)).toBe(BUSINESS_DAY);
            // The regression, named: `new Date()` at BUG_INSTANT round-trips as the 28th.
            expect(ToISODate(header.PaymentDate)).not.toBe(UTC_DAY);
        });

        it('warms the time-zone engine with the caller and provider before deriving the day', async () => {
            const header = entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3304');
            const user = { ID: 'user-1' } as unknown as UserInfo;
            const provider = providerFor(header);
            const configSpy = vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);

            await CreateReversingPayment(provider, user, original, { Amount: 25, Reason: null }, []);

            // Reverting the `Config()` line leaves this spy uncalled, which is an honest failure:
            // on a cold engine the day would come from whatever state it happened to be in.
            expect(configSpy).toHaveBeenCalledWith(false, user, provider);
        });
    });

    describe('an applied account credit (ApplyAccountCreditOperation)', () => {
        const SOURCE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3311';
        const TARGET_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3312';
        const COMPANY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3313';
        const TYPE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3314';

        /** `InternalExecute` is `protected` at compile time only. */
        interface CallableOperation {
            InternalExecute(
                input: ApplyAccountCreditInput,
                provider: IMetadataProvider,
                user: UserInfo,
            ): Promise<ApplyAccountCreditOutput>;
        }

        function run(sequence: string[] = []): {
            payment: Record<string, unknown>;
            provider: IMetadataProvider;
            user: UserInfo;
            result: Promise<ApplyAccountCreditOutput>;
        } {
            // The source order carries a credit (negative balance); the target owes money.
            mocks.runViewRows.set('Order Headers', [
                { ID: SOURCE_ID, OrderNumber: 'ORD-1', Status: 'Confirmed', Balance: -40, TotalGross: 100, CompanyID: COMPANY_ID },
                { ID: TARGET_ID, OrderNumber: 'ORD-2', Status: 'Confirmed', Balance: 40, TotalGross: 40, CompanyID: COMPANY_ID },
            ]);
            mocks.runViewRows.set('Payment Types', [{ ID: TYPE_ID }]);

            const payment = entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3315');
            const provider = {
                GetEntityObject: vi.fn().mockImplementation((entityName: string) => {
                    if (entityName.includes('Payment Headers')) return Promise.resolve(payment);
                    return Promise.resolve(entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3316'));
                }),
                ExecuteSQL: vi.fn().mockResolvedValue([{ Seq: 11 }]),
                BeginTransaction: vi.fn().mockImplementation(() => {
                    sequence.push('begin');
                    return Promise.resolve();
                }),
                CommitTransaction: vi.fn().mockResolvedValue(undefined),
                RollbackTransaction: vi.fn().mockResolvedValue(undefined),
            } as unknown as IMetadataProvider;
            const user = { ID: 'user-1' } as unknown as UserInfo;

            const op = new ApplyAccountCreditOperation() as unknown as CallableOperation;
            return {
                payment,
                provider,
                user,
                result: op.InternalExecute(
                    { SourceOrderHeaderID: SOURCE_ID, TargetOrderHeaderID: TARGET_ID },
                    provider,
                    user,
                ),
            };
        }

        it('stamps the business day, not the day the instant would serialise as', async () => {
            const { payment, result } = run();
            // The operation must have got far enough to write a payment at all — an early refusal
            // (no credit, nothing owing, tender missing) would leave `PaymentDate` unset and the
            // assertion below would pass for the wrong reason.
            await expect(result).resolves.toMatchObject({ Success: true });

            expect(ToISODate(payment.PaymentDate)).toBe(BUSINESS_DAY);
            expect(ToISODate(payment.PaymentDate)).not.toBe(UTC_DAY);
        });

        it('warms the engine before opening the write transaction, so a metadata read never rides inside it', async () => {
            const sequence: string[] = [];
            const configSpy = vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockImplementation(() => {
                sequence.push('config');
                return Promise.resolve(undefined);
            });
            const { provider, user, result } = run(sequence);
            await expect(result).resolves.toMatchObject({ Success: true });

            expect(configSpy).toHaveBeenCalledWith(false, user, provider);
            // Order, not just occurrence: `Config()` reads instance configuration through this same
            // provider, and inside the credit's transaction that read would be enlisted in it.
            expect(sequence).toEqual(['config', 'begin']);
        });
    });

    /**
     * The third site, `OrderEntityServer.createInitialPayment`, is a private method on the order
     * entity-server class and its clock stamp is the fallback behind `this.OrderDate ??`. Since
     * #208 defaults `OrderDate` at `NewRecord()`, that fallback is very likely unreachable.
     *
     * WHAT THIS DOES NOT COVER, stated plainly: this is a source check, not a driven one.
     * `OrderEntityServer` extends `OrderHeaderEntity`, whose constructor wants a full `EntityInfo`
     * and whose field initializers eagerly build companions — the same obstacle
     * `order-header-default-date.test.ts` documents in the Entities package, and the reason it made
     * the same call there. Paired with the value proof below (and `date-cell.test.ts`'s own), the
     * two together say which expression stamps the day and what that expression computes.
     */
    describe('the initial-payment fallback (OrderEntityServer)', () => {
        const source = (file: string): string =>
            readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');

        it('no longer stamps PaymentDate from the clock in any of the three sites', () => {
            // Per-file rather than package-wide on purpose: `CapturePaymentOperation`'s
            // `: new Date()` fallback and the read-path fallbacks in `PaymentHeaderEntityServer` /
            // `PaymentLineEntityServer` are the same shape but out of this change's scope, and are
            // reported on #209. A package-wide guard would fail on them and say nothing true.
            for (const file of ['OrderEntityServer.ts', 'PaymentReversalFactory.ts', 'ApplyAccountCreditOperation.ts']) {
                expect(source(file), file).not.toMatch(/PaymentDate\s*=\s*(this\.OrderDate\s*\?\?\s*)?new Date\(\)/);
            }
        });

        it('derives the fallback from TodayAsDateValue', () => {
            expect(source('OrderEntityServer.ts')).toMatch(/payment\.PaymentDate = TodayAsDateValue\(\)/);
        });

        it('and TodayAsDateValue answers the business day at the bug instant', async () => {
            const { TodayAsDateValue } = await import('@mj-biz-apps/orders-entities');
            expect(ToISODate(TodayAsDateValue())).toBe(BUSINESS_DAY);
            expect(ToISODate(new Date())).toBe(UTC_DAY);
        });
    });
});

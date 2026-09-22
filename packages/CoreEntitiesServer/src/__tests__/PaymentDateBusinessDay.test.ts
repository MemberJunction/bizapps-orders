/**
 * The SITES that stamp a `date` column, and that each of them goes through the one rule (#209).
 *
 * `PaymentHeader.PaymentDate` is `DATE NOT NULL` — a calendar day — and six places wrote an instant
 * into it or into something derived from it. An instant serialises in UTC, so a payment taken at
 * 9 PM Eastern was dated tomorrow: a reversal fell in a different period from the capture it
 * reverses, a credit settled an order on a day that had not started, and the journal entries
 * followed the wrong day with them.
 *
 * ## The division of labour between this file and `calendar-day.test.ts`
 *
 * The RULE — keep the day a value states, fall back to the business day, warm the engine only when
 * that fallback is taken — is `CalendarDayOrToday`, and it is proven directly in
 * `calendar-day.test.ts`. This file proves the SITES: that the real production code reaches that
 * rule and stamps what it returns. Three sites are driven through their actual code here; the rest
 * are entity-server internals that cannot be constructed in a unit test (see below), and are held
 * by source guards, including a package-wide one that fails if any new site is added.
 *
 * ## What discriminates old from new
 *
 * `BUG_INSTANT` is 01:00 UTC on the 28th, which is 21:00 EDT on the 27th — UTC has already turned
 * over and the business zone has not. Every assertion below is that one-day difference, which is
 * why each test fails when its production line is reverted rather than merely exercising it.
 *
 * The machine zone is pinned to Kolkata (+5:30, whose calendar day at that instant is also the
 * 28th) as defence in depth, matching this repo's convention: nothing in the chain reads
 * `process.env.TZ` today, and the pin exists to catch a future change that starts reading local
 * machine parts — the original shape of bc-aidp-next-golive#168.
 *
 * ## Why the engine is pinned rather than loaded
 *
 * `BusinessTimeZoneEngine.Instance` is pinned by writing `_configurations`/`_loaded` directly, the
 * same reflection `CheckoutSessionService.test.ts` and `GetOverdueWorklistOperation.test.ts` use. A
 * pinned `_loaded` also makes the real `Config(false, …)` a no-op, so the warm-up needs no provider
 * that can answer a metadata read. Whether that warm-up HAPPENS is proven by spying on `Config`
 * itself: a spy that is never invoked is exactly what a reverted warm-up produces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mocks = vi.hoisted(() => ({
    /** Rows `RunView` should answer with, keyed by a fragment of the entity name. */
    runViewRows: new Map<string, unknown[]>(),
}));

// Only `RunView` is swapped — the operations construct it with `new RunView(provider)`, and this
// repo's fake providers do not implement the real view pipeline. Everything else in core stays
// real, including `BaseRemotableOperation` (which both operations extend) and `BaseEngine` (which
// backs the `BusinessTimeZoneEngine` singleton these tests pin).
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

// `...actual` keeps the REAL `AsDateValue`/`TodayAsDateValue`/`ToISODate` — they are the subject of
// these tests. Only the orders engine is stubbed: `accountCreditTypeID()` warms it and asks it for
// the AccountCredit tender, and answering `undefined` sends it down its own RunView fallback, which
// the mock above serves.
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
import { ToISODate, type OrdersCapturePaymentInput } from '@mj-biz-apps/orders-entities';

import { CreateReversingPayment, type ReversiblePayment } from '../PaymentReversalFactory.js';
import {
    ApplyAccountCreditOperation,
    type ApplyAccountCreditInput,
    type ApplyAccountCreditOutput,
} from '../ApplyAccountCreditOperation.js';
import { CapturePaymentOperation } from '../CapturePaymentOperation.js';

/** 01:00 UTC on the 28th = 21:00 EDT on the 27th. The bug report's own scenario. */
const BUG_INSTANT = '2026-08-28T01:00:00.000Z';
/** The business day at `BUG_INSTANT`. */
const BUSINESS_DAY = '2026-08-27';
/** What `new Date()` at `BUG_INSTANT` names once a `DATE` column reads it back from UTC parts. */
const UTC_DAY = '2026-08-28';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const source = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

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
        function providerFor(header: Record<string, unknown>, calls: string[] = []): IMetadataProvider {
            return {
                GetEntityObject: vi.fn().mockResolvedValue(header),
                ExecuteSQL: vi.fn().mockImplementation((sql: string) => {
                    if (sql.includes('PaymentSequence')) calls.push('sequence');
                    return Promise.resolve([{ Seq: 9 }]);
                }),
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

        it('warms the engine before taking the PaymentSequence lock, not after it', async () => {
            const header = entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3304');
            const user = { ID: 'user-1' } as unknown as UserInfo;
            const calls: string[] = [];
            const provider = providerFor(header, calls);
            const configSpy = vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockImplementation(() => {
                calls.push('config');
                return Promise.resolve(undefined);
            });

            await CreateReversingPayment(provider, user, original, { Amount: 25, Reason: null }, []);

            expect(configSpy).toHaveBeenCalledWith(false, user, provider);
            // `NextPaymentNumber` holds UPDLOCK/HOLDLOCK on the single global PaymentSequence row.
            // A cold-engine metadata read after that point serialises every other payment-number
            // mint behind it, so the order here is the assertion, not just the occurrence.
            expect(calls).toEqual(['config', 'sequence']);
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
     * The ordinary capture door — five modules route into it, and any caller omitting `PaymentDate`
     * took the clock fallback. This is the site whose disagreement with the reversal path mattered
     * most: a capture dated the 28th and its reversal dated the 27th can straddle a month boundary
     * and land in two accounting periods.
     */
    describe('a capture (CapturePaymentOperation)', () => {
        interface CallableCapture {
            writePayment(
                input: OrdersCapturePaymentInput,
                ctx: { receivingCompanyID: string; paymentTypeID: string; amount: number; idempotencyKey: string | null },
                provider: IMetadataProvider,
                user: UserInfo,
            ): Promise<string>;
        }

        const CTX = {
            receivingCompanyID: '3f2504e0-4f89-41d3-9a0c-0305e82c3321',
            paymentTypeID: '3f2504e0-4f89-41d3-9a0c-0305e82c3322',
            amount: 50,
            idempotencyKey: null,
        };

        async function capture(input: OrdersCapturePaymentInput): Promise<Record<string, unknown>> {
            const header = entityMock('3f2504e0-4f89-41d3-9a0c-0305e82c3323');
            const provider = {
                GetEntityObject: vi.fn().mockResolvedValue(header),
                ExecuteSQL: vi.fn().mockResolvedValue([{ Seq: 13 }]),
            } as unknown as IMetadataProvider;
            const op = new CapturePaymentOperation() as unknown as CallableCapture;
            await op.writePayment(input, CTX, provider, { ID: 'user-1' } as unknown as UserInfo);
            return header;
        }

        it('stamps the business day when the caller named none', async () => {
            const header = await capture({} as OrdersCapturePaymentInput);
            expect(ToISODate(header.PaymentDate)).toBe(BUSINESS_DAY);
            expect(ToISODate(header.PaymentDate)).not.toBe(UTC_DAY);
        });

        it('keeps the day the caller DID name, rather than replacing it with today', async () => {
            const header = await capture({ PaymentDate: '2026-03-15' } as unknown as OrdersCapturePaymentInput);
            expect(ToISODate(header.PaymentDate)).toBe('2026-03-15');
        });

        it('reduces a caller-supplied instant to its day, which a date column cannot do for itself', async () => {
            // `new Date(input.PaymentDate)` kept the time; the column then truncates it in UTC, so
            // a 9 PM Eastern instant was filed on the following day.
            const header = await capture({ PaymentDate: '2026-03-16T01:30:00.000Z' } as unknown as OrdersCapturePaymentInput);
            const stamped = header.PaymentDate as Date;
            expect(ToISODate(stamped)).toBe('2026-03-16');
            expect(stamped.getUTCHours()).toBe(0);
        });
    });

    /**
     * The sites that cannot be driven, and why.
     *
     * `OrderEntityServer`, `PaymentHeaderEntityServer` and `PaymentLineEntityServer` stamp their
     * dates inside private methods on entity-server classes. `BaseEntity`'s constructor takes a
     * full `EntityInfo` — a real `Fields` array, primary keys — which `NewRecord()` reads before
     * any of this code runs, and the subclasses build companions in their field initializers. A
     * faithful stand-in for that is a redesign, which is the same call
     * `order-header-default-date.test.ts` made in #208 and documented there.
     *
     * So these are held two ways instead: the RULE they call is proven in `calendar-day.test.ts`
     * (including that a stated day survives — the regression a careless fix would introduce), and
     * the guards below prove each site calls it. Deleting a call, or writing a new site that
     * reaches for the clock again, fails here.
     */
    describe('the sites that are held by source rather than driven', () => {
        it.each([
            ['OrderEntityServer.ts', /payment\.PaymentDate = await CalendarDayOrToday\(this\.OrderDate, provider, user\)/, 'the initial payment on order confirm'],
            ['OrderEntityServer.ts', /OrderDate: await CalendarDayOrToday\(this\.OrderDate, provider, user\)/, "the entitlement grant's validity start"],
            ['PaymentHeaderEntityServer.ts', /PaymentDate: await CalendarDayOrToday\(this\.PaymentDate, provider, user\)/, 'the allocation and fee journal entries'],
            ['PaymentLineEntityServer.ts', /CalendarDayOrToday\(\s*row\.PaymentDate,/, "the allocation entry's effective date"],
            ['OrderJournalEntryFactory.ts', /isoDate\(await CalendarDayOrToday\(order\.OrderDate,/, "the order entry's effective date"],
        ])('%s derives %s through CalendarDayOrToday', (file, pattern) => {
            expect(source(file)).toMatch(pattern);
        });

        it('PaymentHeaderEntityServer routes BOTH of its journal-entry dates through it', () => {
            // Two call sites, one regex — a count, because fixing one and not the other is exactly
            // how this defect survived the first pass.
            const matches = source('PaymentHeaderEntityServer.ts').match(
                /PaymentDate: await CalendarDayOrToday\(this\.PaymentDate, provider, user\)/g,
            );
            expect(matches).toHaveLength(2);
        });
    });

    /**
     * The guard the partial fix could not have: with every site converted, NO production file in
     * this package may stamp a date column from the clock. A new one added tomorrow fails here
     * rather than in an accounting period three weeks later.
     */
    describe('no server path stamps a date column from the clock', () => {
        const production = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

        it('finds the production files at all', () => {
            // Guards the guard: an empty list makes the check below vacuous.
            expect(production.length).toBeGreaterThan(20);
        });

        it.each(production)('%s', (file) => {
            const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
            // `PaymentDate`/`OrderDate` are the two `date` columns this package assigns. The
            // pattern deliberately allows `new Date(x)` — parsing a day already in hand is fine —
            // and catches only the zero-argument form, which is an instant with no day in it.
            const offenders = [...text.matchAll(/^.*\b(?:PaymentDate|OrderDate)\b\s*[:=][^;\n]*new Date\(\s*\).*$/gm)]
                .map((m) => m[0].trim())
                .filter((line) => !line.startsWith('*') && !line.startsWith('//'));
            expect(offenders, `${file} stamps a date column from the clock`).toEqual([]);
        });

        it('covers the Angular payment form too, which stamps the same column', () => {
            const form = readFileSync(
                new URL('../../../Angular/src/lib/custom/PaymentHeader/payment-header-form.component.ts', import.meta.url),
                'utf8',
            );
            expect(form).not.toMatch(/PaymentDate\s*=\s*[^;\n]*new Date\(\s*\)/);
            expect(form).toMatch(/PaymentDate = AsDateValue\(val\) \?\? TodayAsDateValue\(\)/);
        });
    });
});

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
        OrdersEngine: { Instance: { PaymentTypeByCode: () => undefined, ProductByID: () => undefined } },
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
import { PreviewPriceOperation } from '../PreviewPriceOperation.js';
import { SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';

/** 01:00 UTC on the 28th = 21:00 EDT on the 27th. The bug report's own scenario. */
const BUG_INSTANT = '2026-08-28T01:00:00.000Z';
/** The business day at `BUG_INSTANT`. */
const BUSINESS_DAY = '2026-08-27';
/** What `new Date()` at `BUG_INSTANT` names once a `DATE` column reads it back from UTC parts. */
const UTC_DAY = '2026-08-28';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const source = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

/**
 * Every production root this guard covers.
 *
 * It used to be this package's `src` alone, which was the scope of the sites being fixed and not
 * the scope of the defect: `OrderPricingService` judges price applicability against `date` columns
 * from the Entities package, the order-lines editor does the same in the browser, and the
 * integration harness stamps `OrderDate`/`PaymentDate` on the fixtures every DB-backed assertion
 * is measured against — a harness carrying the defect under test dates its own rows tomorrow for
 * the whole American evening. A guard whose scope stops at one package reads as complete while
 * the same shape sits one directory over, which is how this set stayed partial twice.
 *
 * `generated/` is excluded: CodeGen owns those files and a fix there belongs upstream, not in a
 * test that would fail on the next regeneration. `__tests__` is excluded because a test that
 * DESCRIBES the defect must be allowed to spell it.
 */
const SCANNED_ROOTS: ReadonlyArray<readonly [string, string]> = [
    ['core-entities-server', SRC],
    ['entities', fileURLToPath(new URL('../../../Entities/src/', import.meta.url))],
    ['orders-ng', fileURLToPath(new URL('../../../Angular/src/lib/', import.meta.url))],
    ['integration-tests', fileURLToPath(new URL('../../../IntegrationTests/src/', import.meta.url))],
    ['orders-server', fileURLToPath(new URL('../../../Server/src/', import.meta.url))],
];

/** `[package, path-for-the-message, absolute-path]` for every scanned file. */
const SCANNED_FILES: Array<[string, string, string]> = SCANNED_ROOTS.flatMap(([pkg, root]) => {
    const out: Array<[string, string, string]> = [];
    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (entry.name === '__tests__' || entry.name === 'generated' || entry.name === 'node_modules') continue;
                walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`);
            } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
                out.push([pkg, `${prefix}${entry.name}`, `${dir}${entry.name}`]);
            }
        }
    };
    walk(root.endsWith('/') ? root : `${root}/`, '');
    return out;
});

/** The text of one scanned file, addressed the way the scan names it. */
const scannedSource = (pkg: string, relative: string): string => {
    const hit = SCANNED_FILES.find(([p, rel]) => p === pkg && rel === relative);
    if (!hit) throw new Error(`${pkg}/${relative} is not in the scan — renamed, moved, or the root is wrong.`);
    return readFileSync(hit[2], 'utf8');
};

/**
 * Every column the migrations declare `DATE` — read rather than remembered — minus the ones whose
 * NAME is not enough to know the type.
 *
 * Two corrections to the first version of this list, both found by re-reading it adversarially:
 *
 * - It only matched a column at the start of a line, which is the baseline's `CREATE TABLE` shape.
 *   Under this repo's incremental-migration rule a column arrives as `ALTER TABLE … ADD [Col] DATE`
 *   instead, mid-line, and would have been missed — so the claim that a new column is covered
 *   without anyone coming here was false. Both idioms are read now.
 * - A name can carry two types: `ExpiresAt` is `DATE` on StoredValueAccount and `DATETIMEOFFSET`
 *   on CheckoutSession. Guarding it by name alone would fail a CORRECT `session.ExpiresAt =
 *   new Date()`, and a guard that fails correct code is a guard someone deletes. Ambiguous names
 *   are dropped, and `AMBIGUOUS_COLUMNS` records which — a source guard reads names, not types,
 *   and that limit should be visible rather than discovered.
 */
const { DATE_COLUMNS, AMBIGUOUS_COLUMNS } = ((): { DATE_COLUMNS: string[]; AMBIGUOUS_COLUMNS: string[] } => {
    const dir = fileURLToPath(new URL('../../../../migrations/', import.meta.url));
    const asDate = new Set<string>();
    const asOther = new Set<string>();
    // A column declaration in either idiom: at the start of a line (`CREATE TABLE`) or after
    // `ADD` (`ALTER TABLE`). `\bDATE\b` excludes DATETIME/DATETIME2/DATETIMEOFFSET on its own —
    // a word boundary cannot fall between `DATE` and `TIME`.
    const decl = /(?:^\s*|\bADD\s+)\[?([A-Za-z0-9_]+)\]?\s+(DATE|DATETIME2?|DATETIMEOFFSET|SMALLDATETIME)\b/gim;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
        for (const m of readFileSync(`${dir}${file}`, 'utf8').matchAll(decl)) {
            (m[2].toUpperCase() === 'DATE' ? asDate : asOther).add(m[1]);
        }
    }
    return {
        DATE_COLUMNS: [...asDate].filter((n) => !asOther.has(n)).sort(),
        AMBIGUOUS_COLUMNS: [...asDate].filter((n) => asOther.has(n)).sort(),
    };
})();

/**
 * "A day in hand, else the clock" — in BOTH spellings.
 *
 * The first version banned only the ternary and left `X ?? new Date()` alone, though
 * `calendar-day.ts`'s own header names that form as one of the ways this defect was written and
 * `OrderEntityServer` had been fixed from exactly it. The inner `new Date(…)` also tolerates one
 * level of nesting now: `x ? new Date(String(x)) : new Date()` slipped through a `[^)]*` body.
 *
 * Built fresh per call — a `/g` regex carries `lastIndex`, and sharing one instance across files
 * makes the guard's answer depend on the order the files were scanned in.
 */
const clockFallback = (): RegExp =>
    /^.*(?:\?\s*new Date\((?:[^()]|\([^()]*\))*\)\s*:\s*new Date\(\s*\)|\?\?\s*new Date\(\s*\)).*$/gm;

/** Matching lines that are actually code — comment bodies naming the defect are not the defect. */
const codeLines = (text: string, pattern: RegExp): string[] =>
    [...text.matchAll(pattern)].map((m) => m[0].trim()).filter((l) => !l.startsWith('*') && !l.startsWith('//'));

/**
 * Sites deliberately left on the old shape, named one by one.
 *
 * EMPTY, and that is the point: every `asOf` that was on this list has been converted, so the shape
 * net below now holds without exception across all five scanned packages. The mechanism stays
 * because the next deferral should have to be written down here rather than argued in a PR comment
 * — a deferral the guard cannot see is indistinguishable from an oversight, which is exactly how
 * two sites were missed — and the staleness check makes an entry that is no longer real fail.
 */
const DEFERRED_ASOF: ReadonlyArray<readonly [string, string]> = [];

/**
 * Exact line, not a prefix. `startsWith` exempted anything that merely BEGAN like a deferred site,
 * so a later `const asOf = this.OrderDateOverride ? …` would have been waved through silently while
 * the staleness check still passed. Matching the whole line costs a deliberate edit here whenever
 * one of these is touched, which is the point: the list should be annoying to leave stale.
 */
const deferred = (file: string, line: string): boolean =>
    DEFERRED_ASOF.some(([f, exact]) => f === file && line === exact);

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

        it('refuses a day that does not exist rather than absorbing it into today', async () => {
            // `CalendarDayOrToday` normalises and cannot refuse — an unreadable value simply becomes
            // today. For caller input that is the wrong answer: the payment would be dated today
            // instead of the day the caller meant, reconcile against the wrong bank day, and say
            // nothing. So the operation validates at its boundary, before anything is written.
            const op = new CapturePaymentOperation() as unknown as {
                InternalExecute(
                    input: OrdersCapturePaymentInput,
                    provider: IMetadataProvider,
                    user: UserInfo,
                ): Promise<{ Blockers?: Array<{ Code?: string; Message?: string }> }>;
            };
            const out = await op.InternalExecute(
                {
                    ReceivingCompanyID: CTX.receivingCompanyID,
                    // Well-formed and not a real day: `Date.parse` rolls it to 2 March.
                    PaymentDate: '2026-02-30',
                    Allocations: [{ OrderHeaderID: '3f2504e0-4f89-41d3-9a0c-0305e82c3324', Amount: 10 }],
                } as unknown as OrdersCapturePaymentInput,
                {} as unknown as IMetadataProvider,
                { ID: 'user-1' } as unknown as UserInfo,
            );
            // Refused before it touched the provider — the empty provider above would have thrown.
            expect(out.Blockers?.some((b) => b.Code === 'BadPaymentDate')).toBe(true);
            expect(out.Blockers?.[0]?.Message).toMatch(/not a real calendar day/);
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
     * The two as-of operations, converted out of the deferred list.
     *
     * Both judge "which rules were in force" against `EffectiveFrom`/`EffectiveTo` and the renewal
     * due dates — `date` columns — so their as-of value is a calendar day, and an instant answered
     * the UTC day: an evening preview quoted tomorrow's prices, and an evening renewal pass would
     * spawn tomorrow's renewals a day early.
     *
     * Each also refuses an impossible day at its boundary rather than absorbing it.
     * `CalendarDayOrToday` cannot refuse — it normalises, and today is a plausible wrong answer no
     * caller can detect. Both refusals are driven here with an empty provider, which proves they
     * happen before any database work: anything further in would throw on the missing provider.
     */
    describe('the as-of operations (PreviewPrice, SpawnRenewals)', () => {
        const PRODUCT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3331';

        it('PreviewPrice refuses a day that does not exist', async () => {
            const op = new PreviewPriceOperation() as unknown as {
                InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }>;
            };
            const out = await op.InternalExecute(
                { ProductID: PRODUCT_ID, AsOf: '2026-02-30' },
                {} as unknown as IMetadataProvider,
                { ID: 'user-1' } as unknown as UserInfo,
            );
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/not a real calendar day/);
        });

        it('PreviewPrice accepts a real Date, which its input type promises and has no text to check', async () => {
            // `String(new Date(...))` is the long human form — `Wed Sep 30 2026 20:00:00 GMT-0400`
            // — which matches no ISO pattern. Validating it would refuse the very type `AsOf`
            // advertises. No caller in this repo passes one today; the exported interface does.
            const op = new PreviewPriceOperation() as unknown as {
                InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }>;
            };
            const out = await op
                .InternalExecute(
                    { ProductID: PRODUCT_ID, AsOf: new Date('2026-03-15T00:00:00.000Z') },
                    {} as unknown as IMetadataProvider,
                    { ID: 'user-1' } as unknown as UserInfo,
                )
                .catch((e: unknown) => ({ Success: false, Message: String(e) }));
            // It gets past the date guard and stops later, on a fixture that knows no products.
            // That is the proof: the refusal it used to give named `AsOf`, and this one does not.
            expect(out.Message ?? '').not.toMatch(/AsOf/);
            expect(out.Message ?? '').toMatch(/was not found/);
        });

        it('SpawnRenewals accepts a real Date too, rather than placing no orders at all', async () => {
            const op = new SpawnRenewalsOperation() as unknown as {
                InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }>;
            };
            const out = await op
                .InternalExecute(
                    { AsOfDate: new Date('2026-03-15T00:00:00.000Z') },
                    {} as unknown as IMetadataProvider,
                    { ID: 'user-1' } as unknown as UserInfo,
                )
                .catch((e: unknown) => ({ Success: false, Message: String(e) }));
            // Same proof, and the stakes are higher here: the refusal it used to give returned
            // `Placed: 0`, so a renewal pass handed a `Date` placed no orders and reported success
            // at zero.
            expect(out.Message ?? '').not.toMatch(/AsOfDate/);
        });

        it('SpawnRenewals refuses a day that does not exist', async () => {
            const op = new SpawnRenewalsOperation() as unknown as {
                InternalExecute(i: unknown, p: IMetadataProvider, u: UserInfo): Promise<{ Success: boolean; Message?: string }>;
            };
            const out = await op.InternalExecute(
                { AsOfDate: '2026-02-30' },
                {} as unknown as IMetadataProvider,
                { ID: 'user-1' } as unknown as UserInfo,
            );
            expect(out.Success).toBe(false);
            expect(out.Message).toMatch(/not a real calendar day/);
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
            // Both nets in the package-wide guard below are NEGATIVE — they catch a column name
            // stamped from the clock, and the ternary fallback. Neither can see
            // `const requestDate = new Date();`: no column name at the assignment, no ternary.
            // These two sites launder the day through exactly such a binding, so each is pinned
            // positively to the expression it must use.
            ['CancelSubscriptionOperation.ts', /const requestDate = await CalendarDayOrToday\(requestedDay, provider, user\)/, "the cancellation's request day"],
            ['OrderEntityServer.ts', /const purchaseDay = await CalendarDayOrToday\(\s*this\.OrderDate,/, "the booking day behind every subscription term"],
            // Declaring the day is half of it. The first version of these two guards asserted only
            // that the `const` existed, which a revert that leaves the binding in place and stamps
            // the clock at the USE satisfies completely. Bind the consumer as well.
            ['CancelSubscriptionOperation.ts', /RequestDate: requestDate,/, "the request day reaching the decision"],
            ['OrderEntityServer.ts', /PurchaseDate: purchaseDay,/, 'the booking day reaching the rules'],
            // The remote boundary: a caller-supplied day is text until something says otherwise.
            // `AsDateValue` answers `null` for `2026-02-30` rather than throwing, and a normaliser
            // that answers `null` cannot report the typo — so the operation refuses it by name.
            ['CancelSubscriptionOperation.ts', /RequireDate\(input\.RequestDate, 'RequestDate'\)/, 'the request day validated at the boundary'],
            // Both checkout sites warm through the ORDER's provider, not the global one. Only the
            // fallback path consumes those arguments, and the line above these sets `OrderDate`,
            // so no driven test can observe them without defeating that line — but a widget
            // checkout may run against a provider that is not `Metadata.Provider`, and warming the
            // wrong instance is the kind of wrong that answers plausibly.
            ['CheckoutSessionService.ts', /CalendarDayOrToday\(\s*order\.OrderDate,\s*\(order\.ProviderToUse \?\? md\)/, "the pricing as-of day, through the order's own provider"],
        ])('%s derives %s through CalendarDayOrToday', (file, pattern) => {
            expect(source(file)).toMatch(pattern);
        });

        it('CheckoutSessionService routes BOTH of its pricing as-of days through it', () => {
            const matches = source('CheckoutSessionService.ts').match(
                /CalendarDayOrToday\(\s*order\.OrderDate,\s*\(order\.ProviderToUse \?\? md\)/g,
            );
            expect(matches).toHaveLength(2);
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
     * this package may stamp a calendar day from the clock. A new one added tomorrow fails here
     * rather than in an accounting period three weeks later.
     *
     * ## Two nets, because the first one has a hole
     *
     * Keying on the COLUMN name catches `x.PaymentDate = new Date()`, and it is kept — widened
     * from the two names this issue happened to start with to every `date` column the migrations
     * declare, so a column added next month is covered without anyone remembering to come here.
     *
     * That net cannot see a clock that reaches a date column through a differently-named binding,
     * and twice it did not: `const requestDate = … : new Date()` in `CancelSubscriptionOperation`,
     * feeding `OrderDate`, `ServicePeriodStart` and `CancellationEffectiveDate` two hundred lines
     * downstream, and `PurchaseDate:` sourced from `this.OrderDate` in this very file's sibling
     * method. Both sat in files the first version of this guard already scanned, and both passed
     * it — which is the argument for the second net rather than a wider column list.
     *
     * So the second net keys on the SHAPE: `X ? new Date(X) : new Date()`, "a day in hand, else
     * the clock". That idiom is the entire reason `CalendarDayOrToday` exists, and it is wrong for
     * a calendar day wherever it appears, whatever the binding is called.
     */
    describe('no code in this app stamps a calendar day from the clock', () => {
        it('finds the production files at all, in every package it claims to cover', () => {
            // Guards the guard twice over. The per-root count catches a root that resolves to
            // nothing; the NAMED list catches a root deleted outright, which the count check
            // cannot — it iterates the same list it is meant to be checking, so removing an entry
            // makes it pass. That hole was found by mutating this file rather than by reading it.
            expect(SCANNED_ROOTS.map(([pkg]) => pkg)).toEqual([
                'core-entities-server',
                'entities',
                'orders-ng',
                'integration-tests',
                'orders-server',
            ]);
            expect(SCANNED_FILES.length).toBeGreaterThan(80);
            for (const [pkg] of SCANNED_ROOTS) {
                expect(SCANNED_FILES.filter(([p]) => p === pkg).length, `${pkg} contributed no files`)
                    .toBeGreaterThan(3);
            }
        });

        it('reads the date columns from the migrations rather than from memory', () => {
            // Guards the guard again: a broken path would yield an empty list and guard nothing,
            // silently. The two names this issue began with must be among what it finds.
            expect(DATE_COLUMNS).toEqual(expect.arrayContaining(['OrderDate', 'PaymentDate']));
            expect(DATE_COLUMNS.length).toBeGreaterThan(10);
        });

        it('drops columns whose name does not determine their type, and says which', () => {
            // `ExpiresAt` is DATE on StoredValueAccount and DATETIMEOFFSET on CheckoutSession.
            // Guarding it by name would fail a correct `session.ExpiresAt = new Date()`.
            expect(AMBIGUOUS_COLUMNS).toContain('ExpiresAt');
            expect(DATE_COLUMNS).not.toContain('ExpiresAt');
        });

        it.each(SCANNED_FILES)('%s/%s stamps no date column from the clock', (_pkg, file, path) => {
            // Deliberately allows `new Date(x)` — parsing a day already in hand is fine — and
            // catches only the zero-argument form, which is an instant with no day in it.
            const pattern = new RegExp(
                String.raw`^.*\b(?:${DATE_COLUMNS.join('|')})\b\s*[:=][^;\n]*new Date\(\s*\).*$`,
                'gm',
            );
            const offenders = codeLines(readFileSync(path, 'utf8'), pattern);
            expect(offenders, `${file} stamps a date column from the clock`).toEqual([]);
        });

        it.each(SCANNED_FILES)('%s/%s falls back to no clock for a day it already asked for', (_pkg, file, path) => {
            const offenders = codeLines(readFileSync(path, 'utf8'), clockFallback()).filter(
                (line) => !deferred(file, line),
            );
            expect(offenders, `${file}: use CalendarDayOrToday, not a clock fallback`).toEqual([]);
        });

        it('nothing is deferred: the shape net holds without exception', () => {
            // Stated as an assertion rather than left implicit, so re-adding a deferral is a
            // deliberate edit to this line with a reason beside it.
            expect(DEFERRED_ASOF).toEqual([]);
        });

        it('every deferred asOf site still exists, so fixing one forces it off the list', () => {
            // A stale allowlist is a guard with a hole in it that nobody can see. When the follow-up
            // against #209 converts one of these, this fails until the entry is removed.
            for (const [file, exact] of DEFERRED_ASOF) {
                const shapes = codeLines(source(file), clockFallback());
                expect(shapes, `${file}: '${exact}' is no longer there`).toContain(exact);
            }
        });

        it('pins the three invoice day sites positively, which neither net can reach', () => {
            // `options?.AsOf ? String(options.AsOf).slice(0, 10) : new Date().toISOString().slice(0, 10)`
            // is the defect in a spelling both nets miss: the branches are not `new Date(x)` and
            // `new Date()`, and no date-column name appears on the line. Reverting it passed the
            // whole suite until these three assertions existed — found by mutating, not by reading.
            //
            // The general form of that idiom, `new Date().toISOString().slice(0, 10)` used as
            // "today", is a THIRD net this guard does not yet have, because ~20 sites across the
            // Angular pages still use it. That net belongs to the follow-up that converts them.
            expect(scannedSource('core-entities-server', 'InvoiceDisplay.ts')).toMatch(
                /const generatedOn = options\?\.GeneratedOn \?\? Today\(\);/,
            );
            expect(scannedSource('core-entities-server', 'InvoiceBuilder.ts')).toMatch(
                /const asOf = ToISODate\(await CalendarDayOrToday\(options\?\.AsOf, provider, user\)\)/,
            );
            expect(scannedSource('orders-server', 'services/invoice-renderer.ts')).toMatch(
                /const generatedOn = ToISODate\(await CalendarDayOrToday\(asOf, provider, user\)\)/,
            );
        });

        it('pins the Angular payment form positively, since both nets are negative', () => {
            // The form is inside the scan now, so the negative halves are covered above. What a
            // negative net cannot say is which expression SHOULD be there — and a setter that
            // dropped the fallback entirely would satisfy both nets while leaving the field null.
            const form = readFileSync(
                new URL('../../../Angular/src/lib/custom/PaymentHeader/payment-header-form.component.ts', import.meta.url),
                'utf8',
            );
            expect(form).toMatch(/PaymentDate = AsDateValue\(val\) \?\? TodayAsDateValue\(\)/);
        });
    });
});

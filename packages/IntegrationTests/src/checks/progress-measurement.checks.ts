/**
 * progress-measurement — percentage-of-completion by attested catch-up (AIDP-26 · golive #241 · plan Part F, D90).
 *
 * WHY IT EXISTS
 * The three shipped rev-rec types compute their whole schedule at booking. A project's revenue is
 * not knowable then: it follows how much of the work is done. `Orders.RecordProgress` takes a dated,
 * signed observation of cumulative percent complete and posts the difference from what is already
 * recognised, so revenue moves forwards AND backwards through one subtraction and ties exactly at
 * 100%. Every failure mode here is a quiet one — an entry that balances but is wrong — so the checks
 * hold the arithmetic to the cent.
 *
 * WHAT IT PROVES
 *   PM1  40% → 70% → 55% → 100% posts four entries summing exactly to the line, the third NEGATIVE,
 *        the fourth landing the odd cent; RecognizedToDateAfter agrees with the ledger at every step
 *   PM2  a POC line books Dr AR / Cr Deferred Revenue and stages NO recognition entries
 *   PM3  Preview: true writes nothing — observation rows and journal entries both unchanged
 *   PM4  a posted observation refuses modification (the trigger is the floor; DELETE shares its branch)
 *   PM5  an unchanged percent is a success that writes no entry
 *   PM6  a non-POC line, and an observation dated on or before the last one, are refused
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: RecordProgressOperation · OrderJournalEntryFactory.BuildProgressDraft · RevenueRecognition.ComputeCatchUp
 *   DB:   V202609202000__v5.13.0__OrderLineProgressMeasurement.sql
 */
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';

const SALES = '40100';
const DEFERRED = '21301';
const AR = '11201';

interface RecordOutput {
    Success: boolean;
    Message?: string;
    Preview: boolean;
    RecognizedToDateBefore?: number;
    RecognizedToDateAfter?: number;
    RecognitionAmount?: number;
    OrderLineProgressMeasurementID?: string | null;
    JournalEntryID?: string | null;
}
interface RecordInput {
    OrderLineID: string;
    MeasurementDate: string;
    PercentComplete: number;
    Preview?: boolean;
}

function operation<I, O>(key: string) {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<I, O>>(BaseRemotableOperation, key);
    Assert(op != null, `'${key}' is not registered`);
    return op!;
}

async function record(ctx: IntegrationCheckContext, input: RecordInput): Promise<RecordOutput> {
    const result = await operation<RecordInput, RecordOutput>('Orders.RecordProgress').Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `RecordProgress did not execute: ${result.ErrorMessage ?? 'unknown'}`);
    return result.Output!;
}

/** A booked $1,000.01 project line — the odd cent is the point. Returns the line id. */
async function bookedProjectLine(ctx: IntegrationCheckContext, productID = Fx().Products.PocA, unitPrice = 1000.01) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [{ ProductID: productID, Quantity: 1, UnitPrice: unitPrice, ServicePeriodStart: '2026-07-01', ServicePeriodEnd: '2026-12-31' }],
    } as Parameters<typeof ConfirmOrder>[1]);
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    return { orderID: result.Order.ID as string, lineID: result.Lines[0].ID as string };
}

/** Every recognition entry on the line as a SIGNED amount: + when Sales is credited, − when debited. */
async function recognitionEntries(ctx: IntegrationCheckContext, lineID: string) {
    return TxQuery<{ ID: string; EffectiveDate: string; Signed: number }>(
        ctx,
        `SELECT je.ID, CONVERT(varchar(10), je.EffectiveDate, 23) AS EffectiveDate,
                (SELECT SUM(ISNULL(jel.CreditAmount, 0)) - SUM(ISNULL(jel.DebitAmount, 0))
                   FROM ${ACCT_SCHEMA}.JournalEntryLine jel JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                  WHERE jel.JournalEntryID = je.ID AND gl.Code = '${SALES}') AS Signed
           FROM ${ACCT_SCHEMA}.vwJournalEntries je
          WHERE je.LinkedRecordID = '${lineID}'
            AND (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition'
          ORDER BY je.EffectiveDate`,
    );
}

const observations = (ctx: IntegrationCheckContext, lineID: string) =>
    TxQuery<{ ID: string; MeasurementDate: string; PercentComplete: number; RecognizedToDateBefore: number; RecognizedToDateAfter: number; RecognitionAmount: number; JournalEntryID: string | null; Status: string }>(
        ctx,
        `SELECT ID, CONVERT(varchar(10), MeasurementDate, 23) AS MeasurementDate, PercentComplete, RecognizedToDateBefore, RecognizedToDateAfter, RecognitionAmount, JournalEntryID, Status
           FROM ${ORDERS_SCHEMA}.OrderLineProgressMeasurement WHERE OrderLineID = '${lineID}' ORDER BY MeasurementDate`,
    );

const cents = (n: number) => Math.round(n * 100) / 100;

export const ProgressMeasurementChecks: NamedCheck[] = [
    {
        Id: 'progress-measurement.PM1',
        Name: 'PM1: 40% → 70% → 55% → 100% posts four entries summing to the line, the third NEGATIVE, the last landing the cent',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const steps: Array<[string, number]> = [['2026-07-31', 0.4], ['2026-08-31', 0.7], ['2026-09-30', 0.55], ['2026-10-31', 1]];
                for (const [date, pct] of steps) {
                    const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: date, PercentComplete: pct });
                    Assert(out.Success, `${date} @ ${pct}: ${out.Message}`);
                    Assert(!!out.JournalEntryID, `${date}: an entry was written`);
                    // Belt and braces: the materialised After agrees with the ledger after every step.
                    const ledger = cents((await recognitionEntries(ctx, lineID)).reduce((s, e) => s + Number(e.Signed), 0));
                    AssertEqual(ledger, out.RecognizedToDateAfter, `${date}: RecognizedToDateAfter agrees with the sum of posted recognition`);
                }
                const entries = await recognitionEntries(ctx, lineID);
                AssertEqual(entries.length, 4, 'four entries, one per observation');
                const amounts = entries.map((e) => cents(Number(e.Signed)));
                AssertEqual(JSON.stringify(amounts), JSON.stringify([400, 300.01, -150, 450]), 'the deltas, in order');
                Assert(amounts[2] < 0, 'the backward slide is a NEGATIVE delta — a mirrored entry, not a reversal path');
                AssertEqual(cents(amounts.reduce((s, a) => s + a, 0)), 1000.01, 'and they sum EXACTLY to the line, odd cent included');
                const rows = await observations(ctx, lineID);
                AssertEqual(JSON.stringify(rows.map((r) => Number(r.RecognitionAmount))), JSON.stringify(amounts), 'each observation carries the delta it posted');
                AssertEqual(rows.every((r) => r.Status === 'Posted' && r.JournalEntryID != null), true, 'every observation is Posted and points at its entry');
            }),
    },
    {
        Id: 'progress-measurement.PM2',
        Name: 'PM2: a POC line books Dr AR / Cr Deferred Revenue and stages NO recognition entries',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                AssertEqual((await recognitionEntries(ctx, lineID)).length, 0, 'nothing is staged at booking — the schedule is not knowable yet');
                const booking = await TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
                       FROM ${ORDERS_SCHEMA}.OrderLine ol
                       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ol.JournalEntryID
                       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                      WHERE ol.ID = '${lineID}'`,
                );
                AssertEqual(Number(booking.find((l) => l.Code === AR)?.DebitAmount), 1000.01, 'AR debited for the line');
                AssertEqual(Number(booking.find((l) => l.Code === DEFERRED)?.CreditAmount), 1000.01, 'the credit parks in Deferred Revenue');
                AssertEqual(booking.some((l) => l.Code === SALES), false, 'and nothing touches Sales until progress is attested');
            }),
    },
    {
        Id: 'progress-measurement.PM3',
        Name: 'PM3: Preview: true writes nothing — observation rows and journal entries both unchanged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const jeCount = () => TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ACCT_SCHEMA}.JournalEntry`);
                const before = await jeCount();
                const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4, Preview: true });
                Assert(out.Success, out.Message ?? '');
                AssertEqual(out.Preview, true, 'the output says it was a preview');
                AssertEqual(out.RecognitionAmount, 400, 'and shows what WOULD post');
                AssertEqual(out.JournalEntryID ?? null, null, 'no entry id');
                AssertEqual(out.OrderLineProgressMeasurementID ?? null, null, 'no observation id');
                AssertEqual((await observations(ctx, lineID)).length, 0, 'no observation row');
                AssertEqual((await jeCount()).N, before.N, 'no journal entry anywhere');
            }),
    },
    {
        Id: 'progress-measurement.PM4',
        Name: 'PM4: a posted observation refuses modification',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 });
                Assert(out.Success, out.Message ?? '');
                // Raw SQL on purpose: the trigger is the floor that holds even when the entity layer is
                // bypassed. ONE attempt per check — the trigger enforces itself with ROLLBACK TRANSACTION,
                // which aborts the check's ambient transaction along with it (the PS6 precedent). DELETE
                // goes through the identical branch of the same trigger.
                let refused = false;
                try {
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderLineProgressMeasurement SET PercentComplete = 0.9 WHERE ID = '${out.OrderLineProgressMeasurementID}'`);
                } catch (e) {
                    refused = /immutable/i.test(String(e));
                }
                Assert(refused, 'restating a posted percent must be refused by the DB, and the refusal must say why');
            }),
    },
    {
        Id: 'progress-measurement.PM5',
        Name: 'PM5: an unchanged percent is a success that writes no entry',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                Assert((await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 })).Success, 'first observation');
                const again = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-08-31', PercentComplete: 0.4 });
                Assert(again.Success, `a zero delta is not a failure: ${again.Message}`);
                AssertEqual(again.RecognitionAmount, 0, 'delta zero');
                AssertEqual(again.JournalEntryID ?? null, null, 'no entry written');
                Assert(!!again.OrderLineProgressMeasurementID, 'but the observation itself is recorded — the signer said "still 40%"');
                AssertEqual((await recognitionEntries(ctx, lineID)).length, 1, 'still one entry on the line');
                const rows = await observations(ctx, lineID);
                AssertEqual(rows.length, 2, 'two observations');
                AssertEqual(rows[1].JournalEntryID, null, 'the second points at no entry');
            }),
    },
    {
        Id: 'progress-measurement.PM6',
        Name: 'PM6: a non-POC line, and an observation dated on or before the last one, are refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const straight = await bookedProjectLine(ctx, f.Products.DeferredA, 1200);
                const refused = await record(ctx, { OrderLineID: straight.lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.5 });
                AssertEqual(refused.Success, false, 'a straight-line deferred line takes no observation');
                Assert((refused.Message ?? '').includes('at booking'), `and says why: ${refused.Message}`);
                AssertEqual((await observations(ctx, straight.lineID)).length, 0, 'nothing written');

                const { lineID } = await bookedProjectLine(ctx);
                Assert((await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-08-31', PercentComplete: 0.5 })).Success, 'August posts');
                const backdated = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.6 });
                AssertEqual(backdated.Success, false, 'July cannot be restated after August has posted');
                Assert((backdated.Message ?? '').includes('Corrections happen forward'), `and says why: ${backdated.Message}`);
                AssertEqual((await recognitionEntries(ctx, lineID)).length, 1, 'only the August entry exists');
            }),
    },
];

for (const check of ProgressMeasurementChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('progress-measurement', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});

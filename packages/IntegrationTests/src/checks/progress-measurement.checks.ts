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
 *   PM7  Andrew's Scenario 4 end to end on a SCHEDULED project — nine steps, each entry's contra
 *        legs and the line's running totals exactly as his table states them, closing at zero
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: RecordProgressOperation · OrderJournalEntryFactory.BuildProgressDraft · RevenueRecognition.ComputeCatchUp
 *   DB:   V202609221900__v5.13.0__OrderLineProgressMeasurement.sql
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
import { issue, scheduledOrder, type Instalment } from './payment-schedule.checks.js';

const SALES = '40100';
const DEFERRED = '21301';
const AR = '11201';
/** The contract asset: revenue earned ahead of billing (D92 rule 2). */
const UNBILLED = '11300';

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


/* ────────────────────────────────────────────────────────────────────────────
 * Andrew's Scenario 4 (#227): a $100,000 project on four quarterly instalments of $25,000 in
 * advance, attested monthly, including a backward slide at month 7.
 *
 * It lives here rather than in `payment-schedule` because what it exercises is RULE 2 CHOOSING ITS
 * CONTRA ACCOUNT — the same table `ContractBalance.test.ts` proves arithmetically, driven end to end
 * through real confirms, real invoices and real attestations, so the two cannot agree on paper while
 * disagreeing in the ledger.
 *
 * AMOUNTS ARE DEBIT-POSITIVE, which is why his credits appear as negatives: one convention for every
 * account makes a step's four assertions readable side by side. `Deferred` and `Unbilled` are the
 * legs the two rules produce; `Billed` and `Recognized` are the line's running totals AFTER the
 * step, exactly as his table states them.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Four quarters in advance. Instalment 1 falls on the order date, so confirm issues it (D92). */
const QUARTERLY: Instalment[] = [
    { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 25_000 },
    { InstallmentNumber: 2, DueDate: '2026-10-01', Amount: 25_000 },
    { InstallmentNumber: 3, DueDate: '2027-01-01', Amount: 25_000 },
    { InstallmentNumber: 4, DueDate: '2027-04-01', Amount: 25_000 },
];

interface ScenarioStep {
    Kind: 'invoice' | 'attest';
    Label: string;
    /** `invoice` only — which instalment to issue. */
    Instalment?: number;
    /** `attest` only. */
    Date?: string;
    Percent?: number;
    AR?: number;
    Sales?: number;
    Deferred: number;
    Unbilled: number;
    Billed: number;
    Recognized: number;
}

const SCENARIO_4: ScenarioStep[] = [
    { Kind: 'invoice', Label: 'Order confirmed — instalment 1 issued', Instalment: 1, AR: 25_000, Deferred: -25_000, Unbilled: 0, Billed: 25_000, Recognized: 0 },
    { Kind: 'attest', Label: 'Month 1, attested 40%', Date: '2026-07-31', Percent: 0.4, Sales: -40_000, Deferred: 25_000, Unbilled: 15_000, Billed: 25_000, Recognized: 40_000 },
    { Kind: 'invoice', Label: 'Quarter 2 invoice', Instalment: 2, AR: 25_000, Deferred: -10_000, Unbilled: -15_000, Billed: 50_000, Recognized: 40_000 },
    { Kind: 'attest', Label: 'Month 5, attested 45%', Date: '2026-11-30', Percent: 0.45, Sales: -5_000, Deferred: 5_000, Unbilled: 0, Billed: 50_000, Recognized: 45_000 },
    { Kind: 'invoice', Label: 'Quarter 3 invoice', Instalment: 3, AR: 25_000, Deferred: -25_000, Unbilled: 0, Billed: 75_000, Recognized: 45_000 },
    { Kind: 'attest', Label: 'Month 7, attested 40%', Date: '2027-01-31', Percent: 0.4, Sales: 5_000, Deferred: -5_000, Unbilled: 0, Billed: 75_000, Recognized: 40_000 },
    { Kind: 'attest', Label: 'Month 9, attested 90%', Date: '2027-03-31', Percent: 0.9, Sales: -50_000, Deferred: 35_000, Unbilled: 15_000, Billed: 75_000, Recognized: 90_000 },
    { Kind: 'invoice', Label: 'Quarter 4 invoice', Instalment: 4, AR: 25_000, Deferred: -10_000, Unbilled: -15_000, Billed: 100_000, Recognized: 90_000 },
    { Kind: 'attest', Label: 'Month 12, attested 100%', Date: '2027-06-30', Percent: 1, Sales: -10_000, Deferred: 10_000, Unbilled: 0, Billed: 100_000, Recognized: 100_000 },
];

/** Attest one step and return the entry it posted. */
async function attestStep(ctx: IntegrationCheckContext, lineID: string, step: ScenarioStep): Promise<string> {
    const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: step.Date!, PercentComplete: step.Percent! });
    Assert(out.Success, `${step.Label}: ${out.Message}`);
    Assert(!!out.JournalEntryID, `${step.Label}: an entry was written`);
    return out.JournalEntryID!;
}

/** Issue one instalment and return its entry — or, for instalment 1, the one confirm already posted. */
async function invoiceStep(ctx: IntegrationCheckContext, scheduleID: string): Promise<string> {
    const before = await TxOne<{ JournalEntryID: string | null; Status: string }>(
        ctx,
        `SELECT JournalEntryID, Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE ID = '${scheduleID}'`,
    );
    // Instalment 1 is already Invoiced: confirm issues everything due on or before the order date,
    // through this same path. Issuing it again would be refused, quite correctly (PS-E).
    if (before.Status !== 'Scheduled') {
        Assert(!!before.JournalEntryID, 'an instalment issued at confirm carries its billing entry');
        return before.JournalEntryID!;
    }
    await issue(ctx, scheduleID);
    const after = await TxOne<{ JournalEntryID: string | null }>(
        ctx,
        `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE ID = '${scheduleID}'`,
    );
    Assert(!!after.JournalEntryID, 'invoicing an instalment writes its billing entry');
    return after.JournalEntryID!;
}

/** One entry's movement per account, DEBITS LESS CREDITS, so every step reads in one convention. */
const entryLegs = (ctx: IntegrationCheckContext, journalEntryID: string) =>
    TxQuery<{ Code: string; Net: number }>(
        ctx,
        `SELECT gl.Code, SUM(ISNULL(jel.DebitAmount, 0)) - SUM(ISNULL(jel.CreditAmount, 0)) AS Net
           FROM ${ACCT_SCHEMA}.JournalEntryLine jel
           JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
          WHERE jel.JournalEntryID = '${journalEntryID}'
          GROUP BY gl.Code`,
    );

const netOn = (legs: Array<{ Code: string; Net: number }>, code: string): number =>
    cents(legs.filter((l) => l.Code === code).reduce((sum, l) => sum + Number(l.Net), 0));

const lineTotals = (ctx: IntegrationCheckContext, lineID: string) =>
    TxOne<{ BilledToDate: number; RecognizedToDate: number }>(
        ctx,
        `SELECT BilledToDate, RecognizedToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${lineID}'`,
    );

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
    {
        Id: 'progress-measurement.PM7',
        Name: "PM7: Andrew's Scenario 4 end to end — nine steps on a scheduled project, every contra leg where his table says",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { orderID, ids, saved, message } = await scheduledOrder(ctx, QUARTERLY, {
                    gross: 100_000,
                    productID: Fx().Products.PocA,
                });
                Assert(saved, `the scheduled project must confirm: ${message}`);
                const lineID = (await TxQuery<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`))[0].ID;

                for (const step of SCENARIO_4) {
                    const journalEntryID =
                        step.Kind === 'attest'
                            ? await attestStep(ctx, lineID, step)
                            : await invoiceStep(ctx, ids[step.Instalment! - 1]);

                    const legs = await entryLegs(ctx, journalEntryID);
                    AssertEqual(netOn(legs, AR), step.AR ?? 0, `${step.Label}: Accounts Receivable`);
                    AssertEqual(netOn(legs, SALES), step.Sales ?? 0, `${step.Label}: Sales`);
                    AssertEqual(netOn(legs, DEFERRED), step.Deferred, `${step.Label}: Deferred Revenue`);
                    AssertEqual(netOn(legs, UNBILLED), step.Unbilled, `${step.Label}: Unbilled Receivable`);
                    AssertEqual(cents(legs.reduce((sum, l) => sum + Number(l.Net), 0)), 0, `${step.Label}: the entry balances`);

                    const totals = await lineTotals(ctx, lineID);
                    AssertEqual(cents(Number(totals.BilledToDate)), step.Billed, `${step.Label}: BilledToDate after`);
                    AssertEqual(cents(Number(totals.RecognizedToDate)), step.Recognized, `${step.Label}: RecognizedToDate after`);
                }

                // WHERE THE CONTRACT ENDS UP is the point of the whole table: billed in full, earned
                // in full, and neither contra account holding anything. A model that merely balanced
                // every entry could still strand a balance here.
                const final = await lineTotals(ctx, lineID);
                AssertEqual(cents(Number(final.BilledToDate)), 100_000, 'billed in full');
                AssertEqual(cents(Number(final.RecognizedToDate)), 100_000, 'earned in full');
                AssertEqual(
                    cents(Number(final.BilledToDate) - Number(final.RecognizedToDate)),
                    0,
                    'so the line holds nothing in Deferred Revenue and nothing in Unbilled Receivable',
                );
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

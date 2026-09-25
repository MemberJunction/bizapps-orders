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
 *   PM8  the same nine steps with tax on the order, which is what makes the BASIS observable: both
 *        running totals move by net while AR moves by net + tax and the tax account by the tax
 *   PM9  a POC project billed by INSTALMENT appears on the attestation screen — it books no entry
 *        of its own at confirm, so a worklist keyed on one hid the case the screen exists for
 *   PM10 a REVERSAL line stores its recognition NEGATIVE, so an origin and its reversal net to zero
 *   PM11 a DISCOUNTED project credits Sales the gross share and debits Sales Discounts its share on
 *        every attestation, closing at exactly the discount once the line reaches 100%
 *   PM12 attesting into a month accounting has already posted WARNS and never blocks
 *   PM13 a Posted observation can only be written by the operation — hand-insert and Draft→Posted
 *        are both refused, by the entity guard and by the trigger respectively
 *   PM14 and the operation itself still posts, so the guard admits exactly one writer
 *   PM15 a user whose ONLY role is Engagement Lead attests: the observation and its entry land
 *   PM16 a UI-only user is refused before anything is written — observation and ledger counts unchanged
 *   PM17 an Account Director (OverrideAny, no Attest) is refused too, so the two grants are separable
 *
 * Every attestation here is made as an Engagement Lead-only user, never the System owner, so each
 * check also proves the role is enough on its own.
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: RecordProgressOperation · OrderJournalEntryFactory.BuildProgressDraft · RevenueRecognition.ComputeCatchUp
 *   DB:   V202609252200__v5.13.0__OrderLineProgressMeasurement.sql
 */
import { BaseRemotableOperation, UserInfo, UserRoleInfo } from '@memberjunction/core';
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
    createViaEntity,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import { ConfirmOrder } from '../order-builder.js';
import { ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY } from '../entity-names.js';
import { issue, scheduledOrder, type Instalment } from './payment-schedule.checks.js';

const SALES = '40100';
const DEFERRED = '21301';
const AR = '11201';
/** The contract asset: revenue earned ahead of billing (D92 rule 2). */
const UNBILLED = '11300';
/** Contra-revenue. Under #225 the discount is booked once, at recognition — never on the invoice. */
const DISCOUNTS = '41000';
/** Sales tax payable — the account that separates the net basis from the AR debit. */
const TAX = '21500';

interface RecordOutput {
    Success: boolean;
    Message?: string;
    ClosedPeriodWarning?: string | null;
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

/**
 * The context user with every role replaced by the one named — the same person, holding only that
 * role, so `AttestedByUserID` still points at a real user row. The role comes from synced metadata:
 * a missing one means `mj sync push` has not run against this database.
 */
function withOnlyRole(ctx: IntegrationCheckContext, roleName: string): UserInfo {
    const role = ctx.Provider.Roles.find((r) => r.Name === roleName);
    Assert(role != null, `role '${roleName}' is not in metadata — run mj sync push for this app`);
    const userRole = new UserRoleInfo({ UserID: ctx.User.ID, RoleID: role!.ID, Role: role!.Name });
    return new UserInfo(ctx.Provider, { ...ctx.User, UserRoles: [userRole] });
}

async function record(ctx: IntegrationCheckContext, input: RecordInput, user = withOnlyRole(ctx, 'Engagement Lead')): Promise<RecordOutput> {
    const result = await operation<RecordInput, RecordOutput>('Orders.RecordProgress').Execute(input, { provider: ctx.Provider, user });
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

/**
 * Four quarters in advance. Instalment 1 falls on the order date, so confirm issues it (D92).
 *
 * The amounts are the CHARGED gross, because that is what the schedule ties to — so a 10% tax turns
 * Andrew's 25,000 instalments into 27,500 while his table's numbers stay the net ones.
 */
const quarterly = (taxRate: number): Instalment[] =>
    [1, 2, 3, 4].map((n) => ({
        InstallmentNumber: n,
        DueDate: ['2026-07-01', '2026-10-01', '2027-01-01', '2027-04-01'][n - 1],
        Amount: cents(25_000 * (1 + taxRate)),
    }));

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


/**
 * Drive Andrew's nine steps against a real scheduled project and assert every leg of every entry.
 *
 * WHY IT RUNS TWICE, ONCE WITH TAX. Untaxed, the line's net, its gross and its instalment amount are
 * all 100,000, so the check cannot tell which of those `BilledToDate` is measured on — it passes on
 * either basis, which makes it decorative about the one thing D92 most needs pinned. `BilledToDate`
 * had two writers on different bases and nothing compared them, and that is exactly how the defect
 * this pair now guards survived review. With a charge on the order the three quantities separate:
 * AR moves by net + tax, the tax account by tax, and BOTH running totals by net alone.
 *
 * The untaxed walk is kept because it is the one a reviewer can read line by line against Andrew's
 * comment; the taxed one is the one that would fail if a writer ever changed basis.
 */
async function walkScenario4(ctx: IntegrationCheckContext, taxRate: number): Promise<void> {
    const { orderID, ids, saved, message } = await scheduledOrder(ctx, quarterly(taxRate), {
        gross: 100_000,
        productID: Fx().Products.PocA,
        ...(taxRate ? { charges: [{ Code: 'SalesTax', Rate: taxRate }] } : {}),
    });
    Assert(saved, `the scheduled project must confirm: ${message}`);
    const lineID = (await TxQuery<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`))[0].ID;

    for (const step of SCENARIO_4) {
        const journalEntryID =
            step.Kind === 'attest' ? await attestStep(ctx, lineID, step) : await invoiceStep(ctx, ids[step.Instalment! - 1]);
        const legs = await entryLegs(ctx, journalEntryID);
        const where = `${step.Label}${taxRate ? ' (taxed)' : ''}`;

        // AR carries the tax; the contra legs and Sales never do — revenue is earned on net.
        const netAR = step.AR ?? 0;
        AssertEqual(netOn(legs, AR), cents(netAR * (1 + taxRate)), `${where}: Accounts Receivable moves by net + tax`);
        AssertEqual(netOn(legs, TAX), cents(-netAR * taxRate), `${where}: the tax account moves by the tax alone`);
        AssertEqual(netOn(legs, SALES), step.Sales ?? 0, `${where}: Sales`);
        AssertEqual(netOn(legs, DEFERRED), step.Deferred, `${where}: Deferred Revenue`);
        AssertEqual(netOn(legs, UNBILLED), step.Unbilled, `${where}: Unbilled Receivable`);
        AssertEqual(cents(legs.reduce((sum, l) => sum + Number(l.Net), 0)), 0, `${where}: the entry balances`);

        // AND THE TOTALS DO NOT MOVE WITH IT. This is the assertion the untaxed walk cannot make.
        const totals = await lineTotals(ctx, lineID);
        AssertEqual(cents(Number(totals.BilledToDate)), step.Billed, `${where}: BilledToDate moves by NET`);
        AssertEqual(cents(Number(totals.RecognizedToDate)), step.Recognized, `${where}: RecognizedToDate moves by NET`);
    }

    // WHERE THE CONTRACT ENDS UP is the point of the whole table: billed in full, earned in full, and
    // neither contra account holding anything. A model that merely balanced every entry could still
    // strand a balance here.
    const final = await lineTotals(ctx, lineID);
    AssertEqual(cents(Number(final.BilledToDate)), 100_000, 'billed in full, on the net basis whatever the tax');
    AssertEqual(cents(Number(final.RecognizedToDate)), 100_000, 'earned in full');
    AssertEqual(
        cents(Number(final.BilledToDate) - Number(final.RecognizedToDate)),
        0,
        'so the line holds nothing in Deferred Revenue and nothing in Unbilled Receivable',
    );
}


interface WorklistRow {
    OrderLineID: string;
    OrderNumber: string;
    LineNumber: number;
    RecognizedToDate: number;
    LastPercentComplete: number;
}

/** The attestation screen's list, read the way the screen reads it. */
async function worklist(ctx: IntegrationCheckContext): Promise<WorklistRow[]> {
    const result = await operation<{ MaxCount?: number }, { Success: boolean; Message?: string; Rows: WorklistRow[] }>(
        'Orders.GetProgressWorklist',
    ).Execute({ MaxCount: 500 }, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `GetProgressWorklist did not execute: ${result.ErrorMessage ?? 'unknown'}`);
    Assert(result.Output!.Success, `GetProgressWorklist reported failure: ${result.Output!.Message}`);
    return result.Output!.Rows;
}

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
        Fn: async (ctx) => InRolledBackTransaction(ctx, () => walkScenario4(ctx, 0)),
    },
    {
        Id: 'progress-measurement.PM8',
        Name: 'PM8: the same nine steps with tax on the order — both running totals move by NET while AR moves by net + tax',
        RequiresMutation: true,
        Fn: async (ctx) => InRolledBackTransaction(ctx, () => walkScenario4(ctx, 0.1)),
    },
    {
        Id: 'progress-measurement.PM9',
        Name: 'PM9: a POC project billed by instalment APPEARS on the attestation screen — the case the screen exists for',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // A scheduled POC line books no value entry at confirm (D92), so it carries no
                // JournalEntryID. The worklist used to require one, which hid exactly this line —
                // and hid it by absence, which is the kind of wrong that reports nothing at all.
                const { orderID, saved, message } = await scheduledOrder(ctx, quarterly(0), {
                    gross: 100_000,
                    productID: Fx().Products.PocA,
                });
                Assert(saved, `the scheduled project must confirm: ${message}`);
                const lineID = (await TxQuery<{ ID: string; JournalEntryID: string | null }>(ctx, `SELECT ID, JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`))[0];
                AssertEqual(lineID.JournalEntryID, null, 'the premise: a scheduled POC line has no booking entry of its own');

                const rows = await worklist(ctx);
                const mine = rows.find((r) => r.OrderLineID.toLowerCase() === lineID.ID.toLowerCase());
                Assert(mine != null, `the scheduled project must be listed: ${JSON.stringify(rows.map((r) => r.OrderNumber))}`);
                AssertEqual(mine!.RecognizedToDate, 0, 'nothing attested yet');

                // And the number the screen shows comes off the LINE, so it cannot drift from what
                // the operation reads when the attestation is posted.
                await record(ctx, { OrderLineID: lineID.ID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 });
                const after = (await worklist(ctx)).find((r) => r.OrderLineID.toLowerCase() === lineID.ID.toLowerCase());
                AssertEqual(after!.RecognizedToDate, 40_000, 'the screen reads recognised-to-date from the order line');
                AssertEqual(
                    after!.RecognizedToDate,
                    cents(Number((await TxOne<{ RecognizedToDate: number }>(ctx, `SELECT RecognizedToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${lineID.ID}'`)).RecognizedToDate)),
                    'and it is the same number, not a second running total that agrees by luck',
                );
            }),
    },
    {
        Id: 'progress-measurement.PM10',
        Name: 'PM10: a REVERSAL line stores RecognizedToDate negative, so an origin and its reversal net to zero',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const origin = await bookedProjectLine(ctx);
                await record(ctx, { OrderLineID: origin.lineID, MeasurementDate: '2026-07-31', PercentComplete: 1 });
                const originTotal = cents(Number((await TxOne<{ R: number }>(ctx, `SELECT RecognizedToDate AS R FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${origin.lineID}'`)).R));
                AssertEqual(originTotal, 1000.01, 'the origin recognised its whole value');

                const ret = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderType: 'Return',
                    BillToOrganizationID: f.Customers.OrganizationID,
                    OrderDate: new Date('2026-08-01T00:00:00Z'),
                    Lines: [
                        {
                            ProductID: f.Products.PocA,
                            Quantity: -1,
                            UnitPrice: 1000.01,
                            ReversesOrderLineID: origin.lineID,
                            ServicePeriodStart: '2026-07-01',
                            ServicePeriodEnd: '2026-12-31',
                        },
                    ],
                } as Parameters<typeof ConfirmOrder>[1]);
                Assert(ret.Saved, `the return must confirm: ${ret.Message}`);
                const reversalLineID = ret.Lines[0].ID as string;

                // Attesting the reversal FORWARD unwinds the sale: the entry mirrors, and the stored
                // total has to go the other way with it. Adding the delta unsigned made a reversal
                // line's recognition climb — an entry that unwound revenue beside a total that said
                // more had been earned, each correct on its own and contradicting each other.
                const out = await record(ctx, { OrderLineID: reversalLineID, MeasurementDate: '2026-08-31', PercentComplete: 1 });
                Assert(out.Success, `attesting the reversal: ${out.Message}`);

                const stored = cents(Number((await TxOne<{ R: number }>(ctx, `SELECT RecognizedToDate AS R FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${reversalLineID}'`)).R));
                AssertEqual(stored, -1000.01, 'the reversal line stores its recognition NEGATIVE');
                AssertEqual(cents(originTotal + stored), 0, 'so the origin and its reversal net to nothing');

                // The entry itself was already right; this is the half that was not.
                const entries = await recognitionEntries(ctx, reversalLineID);
                AssertEqual(entries.length, 1, 'one catch-up entry on the reversal line');
                AssertEqual(cents(Number(entries[0].Signed)), -1000.01, 'and it takes revenue back OUT of Sales');
            }),
    },
    {
        Id: 'progress-measurement.PM11',
        Name: 'PM11: a DISCOUNTED project credits Sales the gross share and debits the discount its share, every attestation',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Sold for 1,000.00 at 10% off: earns 900.00, and the 100.00 difference is
                // contra-revenue that #225 books ONCE, at recognition. So every catch-up has to
                // carry its slice of it — otherwise the discount sits in Deferred Revenue after the
                // project reaches 100%, and every entry still balances on the way there.
                const f = Fx();
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    BillToOrganizationID: f.Customers.OrganizationID,
                    OrderDate: new Date('2026-07-01T00:00:00Z'),
                    Lines: [{ ProductID: f.Products.PocA, Quantity: 1, UnitPrice: 1000, DiscountPct: 0.1, ServicePeriodStart: '2026-07-01', ServicePeriodEnd: '2026-12-31' }],
                } as Parameters<typeof ConfirmOrder>[1]);
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const lineID = result.Lines[0].ID as string;

                // A third of the way: Sales takes the GROSS third, the discount its third, and the
                // contra legs only the net third — the percent applies to what the line EARNS.
                const first = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 1 / 3 });
                Assert(first.Success, `first attestation: ${first.Message}`);
                const legs1 = await entryLegs(ctx, first.JournalEntryID!);
                AssertEqual(netOn(legs1, SALES), -333.33, 'Sales is credited the gross share');
                AssertEqual(netOn(legs1, DISCOUNTS), 33.33, 'and Sales Discounts is debited its share of the same third');
                AssertEqual(netOn(legs1, DEFERRED), 300, 'while the contra leg moves by the NET third — what the line earns');
                AssertEqual(cents(legs1.reduce((sum, l) => sum + Number(l.Net), 0)), 0, 'the entry balances');

                await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-08-31', PercentComplete: 1 });

                // AT 100% THE SLICES HAVE TO CLOSE EXACTLY, which is why the discount share is taken
                // as the difference between two rounded running totals rather than as a proportion
                // of each delta: a third of 100.00 does not divide, and a per-delta rounding would
                // strand the cent with nothing left to correct it.
                const all = await TxQuery<{ Code: string; Net: number }>(
                    ctx,
                    `SELECT gl.Code, SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
                       FROM ${ACCT_SCHEMA}.vwJournalEntries je
                       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                      WHERE je.LinkedRecordID = '${lineID}'
                        AND (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition'
                      GROUP BY gl.Code`,
                );
                AssertEqual(netOn(all, SALES), -1000, 'gross revenue over the project is what it was sold for');
                AssertEqual(netOn(all, DISCOUNTS), 100, 'the discount is booked exactly once, in full, to the cent');
                AssertEqual(netOn(all, DEFERRED), 900, 'and Deferred Revenue is relieved of exactly what the line earns');
                AssertEqual(
                    cents(Number((await TxOne<{ R: number }>(ctx, `SELECT RecognizedToDate AS R FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${lineID}'`)).R)),
                    900,
                    'the running total tracks NET, not gross — it is what has been earned',
                );
            }),
    },
    {
        Id: 'progress-measurement.PM12',
        Name: 'PM12: attesting into a month accounting has already POSTED warns, and never blocks',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const companyID = (await TxOne<{ CompanyID: string }>(ctx, `SELECT CompanyID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${lineID}'`)).CompanyID;

                // An OPEN month first, so the warning cannot be something this check always sees.
                const open = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.2, Preview: true });
                Assert(open.Success, open.Message ?? '');
                AssertEqual(open.ClosedPeriodWarning ?? null, null, 'no batch has been posted for July, so nothing to warn about');

                // Close August the way accounting closes it: a batch in Posted status, dated in the
                // month, for this company. Pending and Approved are periods being worked, not closed,
                // which is why the operation looks for Posted specifically.
                await TxQuery(
                    ctx,
                    `INSERT INTO ${ACCT_SCHEMA}.JournalEntryBatch (JournalEntryBatchNumber, CompanyID, PostingDate, TargetSystem, BatchedByUserID, Status, PostedAt)
                     VALUES ('PM12-AUG', '${companyID}', '2026-08-31', 'BusinessCentral', '${ctx.User.ID}', 'Posted', SYSDATETIMEOFFSET())`,
                );

                const closed = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-08-31', PercentComplete: 0.4, Preview: true });
                Assert(closed.Success, `a closed period must not fail the preview: ${closed.Message}`);
                Assert(
                    /PM12-AUG/.test(String(closed.ClosedPeriodWarning ?? '')),
                    `the warning must name the batch: ${JSON.stringify(closed.ClosedPeriodWarning)}`,
                );
                Assert(/2026-08-31/.test(String(closed.ClosedPeriodWarning ?? '')), 'and the date that landed in it');

                // AND IT POSTS ANYWAY. Jeremy's whole point: the batch build is the control, the
                // warning is so nobody walks into it by accident. A guard that blocked here would
                // gate revenue recognition on a state the attester cannot see or change.
                const posted = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-08-31', PercentComplete: 0.4 });
                Assert(posted.Success, `a closed period must not block the post: ${posted.Message}`);
                Assert(!!posted.JournalEntryID, 'the entry is written');
                Assert(
                    /PM12-AUG/.test(String(posted.ClosedPeriodWarning ?? '')),
                    'and the live output carries the same warning, so the screen can show it after the fact',
                );
            }),
    },
    {
        Id: 'progress-measurement.PM13',
        Name: 'PM13: nothing but the operation can post an observation — hand-inserted Posted, and Draft→Posted, are both refused',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);

                // A Posted row carries a recognition amount and a journal entry id, and what makes
                // those true is that the entry was written in the same transaction. Hand-writing one
                // asserts revenue the ledger never saw — and the subledger and the ledger are read by
                // different reports, so neither would contradict the other.
                let refusedInsert = '';
                try {
                    await createViaEntity(ctx, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY, {
                        OrderLineID: lineID,
                        MeasurementDate: new Date('2026-09-30T00:00:00Z'),
                        PercentComplete: 0.9,
                        MethodCode: 'ManualAttestation',
                        AttestedByUserID: ctx.User.ID,
                        RecognitionAmount: 900,
                        Status: 'Posted',
                    });
                } catch (e) {
                    refusedInsert = String(e);
                }
                Assert(/only be posted by Orders.RecordProgress/i.test(refusedInsert), `hand-inserting a Posted row must be refused: ${refusedInsert || 'it was allowed'}`);

                // A Draft row is fine — it claims nothing.
                const draftID = await createViaEntity(ctx, ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY, {
                    OrderLineID: lineID,
                    MeasurementDate: new Date('2026-09-30T00:00:00Z'),
                    PercentComplete: 0.9,
                    MethodCode: 'ManualAttestation',
                    AttestedByUserID: ctx.User.ID,
                    Status: 'Draft',
                });
                Assert(!!draftID, 'a Draft observation is allowed');

                // Promoting it is refused in the DATABASE, not just the entity layer: no legitimate
                // path performs that update, so the trigger can refuse it outright without needing to
                // know its caller — and a bypassed class cannot reach past it.
                let refusedPromote = '';
                try {
                    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderLineProgressMeasurement SET Status = 'Posted' WHERE ID = '${draftID}'`);
                } catch (e) {
                    refusedPromote = String(e);
                }
                Assert(/Draft to Posted/i.test(refusedPromote), `promoting Draft to Posted must be refused by the DB: ${refusedPromote || 'it was allowed'}`);
            }),
    },
    {
        Id: 'progress-measurement.PM14',
        Name: 'PM14: and the operation itself still posts — the guard admits exactly one writer',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // The other half of PM13, kept separate because its transaction survives: a guard
                // that refused everything would pass PM13 on its own and break the feature.
                const { lineID } = await bookedProjectLine(ctx);
                const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 });
                Assert(out.Success, `the operation must still be able to post: ${out.Message}`);
                const rows = await observations(ctx, lineID);
                AssertEqual(rows.length, 1, 'one observation');
                AssertEqual(rows[0].Status, 'Posted', 'written Posted, by the one writer allowed to');
                Assert(!!rows[0].JournalEntryID, 'with the entry it was written beside');
            }),
    },
    {
        Id: 'progress-measurement.PM15',
        Name: 'PM15: a user whose only role is Engagement Lead can attest — the observation and its entry land',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const lead = withOnlyRole(ctx, 'Engagement Lead');
                AssertEqual(lead.UserRoles.length, 1, 'the attester holds exactly one role');
                const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 }, lead);
                Assert(out.Success, `an Engagement Lead must be able to attest: ${out.Message}`);
                const rows = await observations(ctx, lineID);
                AssertEqual(rows.length, 1, 'the observation row landed');
                AssertEqual(rows[0].JournalEntryID, out.JournalEntryID, 'carrying the entry it posted');
                const entries = await recognitionEntries(ctx, lineID);
                AssertEqual(entries.length, 1, 'and the recognition entry is in the ledger');
                AssertEqual(cents(Number(entries[0].Signed)), 400, 'for 40% of the line');
            }),
    },
    ...(['UI', 'Account Director'] as const).map((roleName, i) => ({
        Id: `progress-measurement.PM${16 + i}`,
        Name:
            roleName === 'UI'
                ? 'PM16: a UI-only user is refused before anything is written'
                : 'PM17: an Account Director (OverrideAny, no Attest) cannot attest — the two grants are separable',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) =>
            InRolledBackTransaction(ctx, async () => {
                const { lineID } = await bookedProjectLine(ctx);
                const counts = () =>
                    TxOne<{ Obs: number; JE: number; JEL: number }>(
                        ctx,
                        `SELECT (SELECT COUNT(*) FROM ${ORDERS_SCHEMA}.OrderLineProgressMeasurement) AS Obs,
                                (SELECT COUNT(*) FROM ${ACCT_SCHEMA}.JournalEntry) AS JE,
                                (SELECT COUNT(*) FROM ${ACCT_SCHEMA}.JournalEntryLine) AS JEL`,
                    );
                const before = await counts();
                const out = await record(ctx, { OrderLineID: lineID, MeasurementDate: '2026-07-31', PercentComplete: 0.4 }, withOnlyRole(ctx, roleName));
                Assert(!out.Success, `a ${roleName} user must not be able to attest`);
                Assert(/MJ\.BizApps\.Orders\.Progress\.Attest/.test(out.Message ?? ''), `the refusal names the authorization: ${out.Message}`);
                const after = await counts();
                AssertEqual(after.Obs, before.Obs, 'no observation row was written');
                AssertEqual(after.JE, before.JE, 'no journal entry was written');
                AssertEqual(after.JEL, before.JEL, 'no journal entry line was written');
            }),
    })),
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

/**
 * schedule-replace — `Orders.ReplacePaymentSchedule` sets an order's schedule from a list (golive #290).
 *
 * Sales calls it when a deal closes Won and whenever a won deal's schedule changes, so the deal's
 * instalments become the order's. These checks drive the real operation against real orders.
 *
 * WHAT IT PROVES
 *   RP1  four rows on an order not yet confirmed become four Scheduled rows numbered by due date, under
 *        the order's company; the same list again writes nothing
 *   RP2  a list that does not tie to the order's lines is refused and nothing is written
 *   RP3  a row with no amount is refused by name
 *   RP4  on a confirmed order, the instalment invoiced at confirm is kept with its number and the rest
 *        are re-dated and re-amounted in place
 *   RP5  a list that changes the invoiced instalment is refused, naming it, and nothing is written
 *   RP6  a confirmed order billed in full without a schedule cannot be given one
 *   RP7  a preview reports the schedule and writes nothing
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: ReplacePaymentScheduleOperation · PaymentScheduleReplacement · ScheduleShortfalls
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
import type { OrdersReplacePaymentScheduleInput, OrdersReplacePaymentScheduleOutput } from '@mj-biz-apps/orders-entities';
import { CreateOrdersFixture, CreateProductPrice, Fx, InRolledBackTransaction, TeardownOrdersFixture } from '../fixture.js';
import { BuildOrder } from '../order-builder.js';
import { schedule, scheduledOrder } from './payment-schedule.checks.js';

const FOUR = [
    { DueDate: '2026-07-01', Amount: 2500 },
    { DueDate: '2026-10-01', Amount: 2500 },
    { DueDate: '2027-01-01', Amount: 2500 },
    { DueDate: '2027-04-01', Amount: 2500.03 },
];

async function replace(ctx: IntegrationCheckContext, input: OrdersReplacePaymentScheduleInput): Promise<OrdersReplacePaymentScheduleOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<OrdersReplacePaymentScheduleInput, OrdersReplacePaymentScheduleOutput>>(
        BaseRemotableOperation,
        'Orders.ReplacePaymentSchedule',
    );
    Assert(op != null, "'Orders.ReplacePaymentSchedule' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `ReplacePaymentSchedule did not execute: ${result.ErrorMessage ?? 'unknown'}`);
    return result.Output!;
}

/** A saved, unconfirmed order for one product at `gross`. */
async function draftOrder(ctx: IntegrationCheckContext, gross: number): Promise<string> {
    const f = Fx();
    await CreateProductPrice(ctx, f.Products.WidgetA, gross);
    const draft = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: f.Customers.OrganizationID,
        OrderDate: new Date('2026-07-01T00:00:00Z'),
        Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: gross }],
    });
    Assert(await draft.Order.Save(), `draft must save: ${draft.Order.LatestResult?.CompleteMessage ?? ''}`);
    return draft.Order.ID as string;
}

const shape = (rows: Awaited<ReturnType<typeof schedule>>) =>
    rows.map((r) => `${r.InstallmentNumber}:${r.DueDate}:${Number(r.Amount).toFixed(2)}:${r.Status}`).join(' | ');

export const ScheduleReplaceChecks: NamedCheck[] = [
    {
        Id: 'schedule-replace.RP1',
        Name: 'RP1: four rows become four Scheduled rows by due date, and the same list again writes nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const orderID = await draftOrder(ctx, 10000.03);
                const out = await replace(ctx, { OrderHeaderID: orderID, Rows: [...FOUR].reverse() });
                Assert(out.Success, `replace: ${out.Message}`);
                AssertEqual(out.Written, 4, 'four rows written');
                const rows = await schedule(ctx, orderID);
                AssertEqual(
                    shape(rows),
                    '1:2026-07-01:2500.00:Scheduled | 2:2026-10-01:2500.00:Scheduled | 3:2027-01-01:2500.00:Scheduled | 4:2027-04-01:2500.03:Scheduled',
                    'numbered by due date, whatever order they were sent in',
                );
                Assert(rows.every((r) => r.CompanyID.toLowerCase() === Fx().CoA.ID.toLowerCase()), "every row is the order company's");

                const again = await replace(ctx, { OrderHeaderID: orderID, Rows: FOUR });
                Assert(again.Success && !again.Changed, `the same list again changes nothing: ${again.Message}`);
                AssertEqual(shape(await schedule(ctx, orderID)), shape(rows), 'schedule unchanged');
            }),
    },
    {
        Id: 'schedule-replace.RP2',
        Name: 'RP2: a list that does not tie is refused and nothing is written',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const orderID = await draftOrder(ctx, 10000.03);
                const out = await replace(ctx, { OrderHeaderID: orderID, Rows: FOUR.slice(0, 3).concat({ DueDate: '2027-04-01', Amount: 2500.02 }) });
                Assert(!out.Success, 'refused');
                AssertEqual(out.Code, 'TIE_FAILED', 'refused for the tie');
                Assert(String(out.Message).includes('0.01 unscheduled'), `the refusal says by how much: ${out.Message}`);
                AssertEqual((await schedule(ctx, orderID)).length, 0, 'nothing written');
            }),
    },
    {
        Id: 'schedule-replace.RP3',
        Name: 'RP3: a row with no amount is refused by name',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const orderID = await draftOrder(ctx, 10000.03);
                const out = await replace(ctx, {
                    OrderHeaderID: orderID,
                    Rows: [FOUR[0], { DueDate: '2026-10-01', Amount: Number.NaN }],
                });
                AssertEqual(out.Code, 'INVALID_ROW', `refused: ${out.Message}`);
                Assert(String(out.Message).includes('Row 2'), `names the row: ${out.Message}`);
            }),
    },
    {
        Id: 'schedule-replace.RP4',
        Name: 'RP4: on a confirmed order the invoiced instalment is kept and the rest change in place',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await scheduledOrder(
                    ctx,
                    [
                        { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 2500 },
                        { InstallmentNumber: 2, DueDate: '2026-10-01', Amount: 7500.03 },
                    ],
                    { gross: 10000.03 },
                );
                Assert(built.saved, `confirm: ${built.message}`);
                const before = await schedule(ctx, built.orderID);
                AssertEqual(before[0].Status, 'Invoiced', 'confirm issued the instalment due on the order date');

                const out = await replace(ctx, { OrderHeaderID: built.orderID, Rows: FOUR });
                Assert(out.Success, `replace: ${out.Message}`);
                AssertEqual(out.Kept, 1, 'one instalment kept');
                const after = await schedule(ctx, built.orderID);
                AssertEqual(
                    shape(after),
                    '1:2026-07-01:2500.00:Invoiced | 2:2026-10-01:2500.00:Scheduled | 3:2027-01-01:2500.00:Scheduled | 4:2027-04-01:2500.03:Scheduled',
                    'the invoiced row stays first and the rest follow by date',
                );
                AssertEqual(after[0].DocumentNumber, before[0].DocumentNumber, 'the invoiced number is unchanged');
                AssertEqual(after[1].ID, before[1].ID, 'the Scheduled row was changed in place, not replaced');
            }),
    },
    {
        Id: 'schedule-replace.RP5',
        Name: 'RP5: a list that changes the invoiced instalment is refused, naming it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await scheduledOrder(
                    ctx,
                    [
                        { InstallmentNumber: 1, DueDate: '2026-07-01', Amount: 2500 },
                        { InstallmentNumber: 2, DueDate: '2026-10-01', Amount: 7500.03 },
                    ],
                    { gross: 10000.03 },
                );
                Assert(built.saved, `confirm: ${built.message}`);
                const before = shape(await schedule(ctx, built.orderID));
                const out = await replace(ctx, {
                    OrderHeaderID: built.orderID,
                    Rows: [
                        { DueDate: '2026-07-01', Amount: 3000 },
                        { DueDate: '2026-10-01', Amount: 7000.03 },
                    ],
                });
                AssertEqual(out.Code, 'INVOICED_ROW_CHANGED', `refused: ${out.Message}`);
                Assert(String(out.Message).includes('Instalment 1'), `names the instalment: ${out.Message}`);
                AssertEqual(shape(await schedule(ctx, built.orderID)), before, 'nothing written');
            }),
    },
    {
        Id: 'schedule-replace.RP6',
        Name: 'RP6: a confirmed order billed in full without a schedule cannot be given one',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await scheduledOrder(ctx, [], { gross: 10000.03 });
                Assert(built.saved, `confirm: ${built.message}`);
                const out = await replace(ctx, { OrderHeaderID: built.orderID, Rows: FOUR });
                AssertEqual(out.Code, 'BILLED_WITHOUT_SCHEDULE', `refused: ${out.Message}`);
                AssertEqual((await schedule(ctx, built.orderID)).length, 0, 'nothing written');
            }),
    },
    {
        Id: 'schedule-replace.RP7',
        Name: 'RP7: a preview reports the schedule and writes nothing',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const orderID = await draftOrder(ctx, 10000.03);
                const out = await replace(ctx, { OrderHeaderID: orderID, Rows: FOUR, Preview: true });
                Assert(out.Success && out.WasPreview, `preview: ${out.Message}`);
                AssertEqual(out.Rows.length, 4, 'four rows reported');
                Assert(out.Rows.every((r) => r.OrderHeaderPaymentScheduleID === null), 'none of them exists yet');
                AssertEqual((await schedule(ctx, orderID)).length, 0, 'nothing written');
            }),
    },
];

for (const check of ScheduleReplaceChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('schedule-replace', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});

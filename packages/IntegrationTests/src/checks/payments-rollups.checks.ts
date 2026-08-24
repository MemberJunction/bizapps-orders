/**
 * payments-rollups.checks.ts — the `payments-rollups` bundle (RU1–RU9).
 *
 * The money-in half of the app: what an order is worth, what has been paid against it, and the
 * guarantees around the payment instrument. Rollups are DB TRIGGERS rather than application code
 * precisely so they hold no matter who writes the row — which means only a live database can prove
 * them. Graduated from `test-harnesses/booking-live.mjs` tests 3 and 5.
 *
 * WHAT IT PROVES
 *   RU1  OrderHeader totals roll up from its lines
 *   RU2  an unpaid order reads Balance = TotalGross, PaymentStatus = 'Unpaid'
 *   RU3  a partial payment rolls into AmountPaid / Balance / 'PartiallyPaid'
 *   RU4  full payment closes it out to Balance 0 / 'Paid'
 *   RU5  a captured PaymentDetail's instrument fields are IMMUTABLE
 *   RU6  OrderNumber is auto-assigned as ORD-{6 digits} and is unique
 *   RU7  the D42 initial-payment intent becomes a real, fully applied payment at confirm
 *   RU8  …with an auto-assigned PAY-{6 digits} number
 *   RU9  …and the payment gets its OWN COPY of the instrument, never the order's row (D39)
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { randomUUID } from 'node:crypto';
import { DerivePaymentStatus } from '@mj-biz-apps/orders-entities';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    CreateOrdersFixture,
    createViaEntity,
    upsertViaEntity,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    OutsideTransaction,
    SameID,
    TeardownOrdersFixture,
    TxOne,
    TxQuery,
} from '../fixture.js';
import {
    PAYMENT_DETAIL_ENTITY,
    PAYMENT_HEADER_ENTITY,
    PAYMENT_LINE_ENTITY,
} from '../entity-names.js';
import { ConfirmOrder } from '../order-builder.js';
import { CreatePayment } from '../payment-builder.js';

interface RollupRow {
    OrderNumber: string;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    PaymentStatus: string;
}

const rollups = async (ctx: IntegrationCheckContext, orderID: string): Promise<RollupRow> => {
    const row = await TxOne<{ OrderNumber: string; TotalGross: number; AmountPaid: number; Balance: number }>(
        ctx,
        `SELECT OrderNumber, TotalGross, AmountPaid, Balance
         FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
    );
    return {
        ...row,
        PaymentStatus: DerivePaymentStatus(row.TotalGross, row.AmountPaid, row.Balance),
    };
};

/** A $250 two-line order: 2 × $100 + 1 × $50. */
async function confirm250(ctx: IntegrationCheckContext) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        Lines: [
            { ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 100 },
            { ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 50 },
        ],
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);
    return result;
}

/** Post a payment of `amount` against an order and apply all of it. */
async function payOrder(ctx: IntegrationCheckContext, orderID: string, amount: number) {
    const f = Fx();
    const cash = f.PaymentTypeIDs.get('Cash');
    Assert(cash != null, "PaymentType 'Cash' missing — push the orders app metadata");

    // ONE save, through the payment builder (D68). Creating the header and its allocation as two
    // separate saves cannot work: a Captured payment's Amount must equal the sum of its lines, so the
    // header save is refused for having 0 allocations totalling 0 against an Amount of 100. That
    // invariant is the point of the design, and the raw-SQL version simply wrote around it.
    const { Payment, Saved, Message } = await CreatePayment(ctx.User, {
        PaymentNumber: `IT-${randomUUID().slice(0, 8).toUpperCase()}`,
        ReceivingCompanyID: f.CoA.ID,
        PaymentTypeID: cash!,
        Amount: amount,
        Allocations: [{ OrderHeaderID: orderID, Amount: amount }],
    });
    Assert(Saved, `payOrder failed: ${Message}`);
    return Payment.ID as string;
}

export const PaymentsRollupsChecks: NamedCheck[] = [
    {
        Id: 'payments-rollups.RU1',
        Name: 'RU1: order totals roll up from the lines',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirm250(ctx);
                const row = await rollups(ctx, Order.ID as string);
                AssertEqual(Number(row.TotalGross), 250, 'TotalGross');
            }),
    },
    {
        Id: 'payments-rollups.RU2',
        Name: "RU2: an unpaid order reads Balance = TotalGross and 'Unpaid'",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirm250(ctx);
                const row = await rollups(ctx, Order.ID as string);
                AssertEqual(Number(row.AmountPaid), 0, 'AmountPaid with no payments');
                AssertEqual(Number(row.Balance), 250, 'Balance');
                AssertEqual(row.PaymentStatus, 'Unpaid', 'PaymentStatus');
            }),
    },
    {
        Id: 'payments-rollups.RU3',
        Name: 'RU3: a partial payment rolls into AmountPaid, Balance and PartiallyPaid',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirm250(ctx);
                await payOrder(ctx, Order.ID as string, 100);

                const row = await rollups(ctx, Order.ID as string);
                AssertEqual(Number(row.AmountPaid), 100, 'AmountPaid');
                AssertEqual(Number(row.Balance), 150, 'Balance recalculated');
                AssertEqual(row.PaymentStatus, 'PartiallyPaid', 'PaymentStatus');
            }),
    },
    {
        Id: 'payments-rollups.RU4',
        Name: "RU4: paying the remainder closes the order to Balance 0 and 'Paid'",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { Order } = await confirm250(ctx);
                await payOrder(ctx, Order.ID as string, 100);
                await payOrder(ctx, Order.ID as string, 150);

                const row = await rollups(ctx, Order.ID as string);
                AssertEqual(Number(row.AmountPaid), 250, 'AmountPaid after both payments');
                AssertEqual(Number(row.Balance), 0, 'Balance');
                AssertEqual(row.PaymentStatus, 'Paid', 'PaymentStatus');
            }),
    },
    {
        Id: 'payments-rollups.RU5',
        Name: 'RU5: a captured payment instrument is immutable',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const f = Fx();
            const detailID = randomUUID();
            const check = f.PaymentTypeIDs.get('Check');
            Assert(check != null, "PaymentType 'Check' missing — push the orders app metadata");

            // NOT rolled back: the immutability trigger raises a severity-16 error, which dooms the
            // enclosing transaction outright — savepoints included. That is precisely the guarantee
            // under test, and it makes rollback-based isolation impossible here, so this check owns
            // its cleanup. The row is a leaf; nothing references it.
            await OutsideTransaction(
                async () => {
                    await upsertViaEntity(ctx, PAYMENT_DETAIL_ENTITY, detailID, {
                        CompanyID: f.CoA.ID,
                        PaymentTypeID: check,
                        ReferenceNumber: 'CHK-1000',
                        InstrumentDate: '2026-07-25',
                    });

                    let message = '';
                    try {
                        await TxQuery(
                            ctx,
                            `UPDATE ${ORDERS_SCHEMA}.PaymentDetail SET ReferenceNumber='CHK-TAMPERED' WHERE ID='${detailID}'`,
                        );
                    } catch (e) {
                        message = String((e as Error).message);
                    }
                    Assert(
                        message !== '',
                        'rewriting a captured instrument reference must be REFUSED by the database — it succeeded',
                    );
                    Assert(
                        /immutable|cannot be (changed|modified)|captured/i.test(message),
                        `the refusal should name the immutability rule, got: ${message}`,
                    );

                    const after = await TxOne<{ ReferenceNumber: string }>(
                        ctx,
                        `SELECT ReferenceNumber FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE ID='${detailID}'`,
                    );
                    AssertEqual(after.ReferenceNumber, 'CHK-1000', 'the instrument is unchanged on disk');
                },
                () => TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE ID='${detailID}'`).then(() => undefined),
            );
        },
    },
    {
        Id: 'payments-rollups.RU6',
        Name: 'RU6: OrderNumber is auto-assigned and unique per order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const first = await confirm250(ctx);
                const second = await confirm250(ctx);

                const a = await rollups(ctx, first.Order.ID as string);
                const b = await rollups(ctx, second.Order.ID as string);
                for (const row of [a, b]) {
                    Assert(
                        /^ORD-\d{6}$/.test(row.OrderNumber ?? ''),
                        `OrderNumber must be ORD-{6 digits}, got '${row.OrderNumber}'`,
                    );
                }
                Assert(a.OrderNumber !== b.OrderNumber, `two orders got the same number: ${a.OrderNumber}`);
            }),
    },
    {
        Id: 'payments-rollups.RU7',
        Name: 'RU7: the initial-payment intent becomes a real, fully applied payment at confirm',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const check = f.PaymentTypeIDs.get('Check')!;
                const intentDetailID = randomUUID();
                await upsertViaEntity(ctx, PAYMENT_DETAIL_ENTITY, intentDetailID, {
                    CompanyID: f.CoA.ID,
                    PaymentTypeID: check,
                    ReferenceNumber: 'CHK-9911',
                    InstrumentDate: '2026-07-25',
                });

                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 400 }],
                    InitialPaymentTypeID: check,
                    InitialPaymentAmount: 400,
                    InitialPaymentDetailID: intentDetailID,
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const payments = await TxQuery<{ Applied: number }>(
                    ctx,
                    `SELECT pl.Amount AS Applied
                     FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                     JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                     WHERE pl.OrderHeaderID = '${result.Order.ID}'`,
                );
                AssertEqual(payments.length, 1, 'auto-generated payments');
                AssertEqual(Number(payments[0].Applied), 400, 'amount applied to the order');

                const row = await rollups(ctx, result.Order.ID as string);
                AssertEqual(Number(row.Balance), 0, 'the order is settled by its own initial payment');
                AssertEqual(row.PaymentStatus, 'Paid', 'PaymentStatus');
            }),
    },
    {
        Id: 'payments-rollups.RU8',
        Name: 'RU8: the auto-generated payment gets an auto-assigned PaymentNumber',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const check = f.PaymentTypeIDs.get('Check')!;
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 400 }],
                    InitialPaymentTypeID: check,
                    InitialPaymentAmount: 400,
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const payment = await TxOne<{ PaymentNumber: string }>(
                    ctx,
                    `SELECT ph.PaymentNumber
                     FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                     JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                     WHERE pl.OrderHeaderID = '${result.Order.ID}'`,
                );
                Assert(
                    /^PAY-\d{6}$/.test(payment.PaymentNumber ?? ''),
                    `PaymentNumber must be PAY-{6 digits}, got '${payment.PaymentNumber}'`,
                );
            }),
    },
    {
        Id: 'payments-rollups.RU9',
        Name: 'RU9: the payment gets its own copy of the instrument, not the order’s row',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const check = f.PaymentTypeIDs.get('Check')!;
                const intentDetailID = randomUUID();
                await upsertViaEntity(ctx, PAYMENT_DETAIL_ENTITY, intentDetailID, {
                    CompanyID: f.CoA.ID,
                    PaymentTypeID: check,
                    ReferenceNumber: 'CHK-9911',
                    InstrumentDate: '2026-07-25',
                });

                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1, UnitPrice: 400 }],
                    InitialPaymentTypeID: check,
                    InitialPaymentAmount: 400,
                    InitialPaymentDetailID: intentDetailID,
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);

                const payment = await TxOne<{ PaymentDetailID: string }>(
                    ctx,
                    `SELECT ph.PaymentDetailID
                     FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                     JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                     WHERE pl.OrderHeaderID = '${result.Order.ID}'`,
                );
                Assert(payment.PaymentDetailID != null, 'the payment has no instrument at all');
                // Sharing the row would let the order's intent and the settled payment drift as one
                // record — and RU5's immutability guard would then lock the ORDER's editable intent.
                Assert(
                    !SameID(payment.PaymentDetailID, intentDetailID),
                    `the payment must NOT share the order's intent row (both are ${intentDetailID})`,
                );

                const copy = await TxOne<{ ReferenceNumber: string }>(
                    ctx,
                    `SELECT ReferenceNumber FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE ID = '${payment.PaymentDetailID}'`,
                );
                AssertEqual(copy.ReferenceNumber, 'CHK-9911', 'the copy carries the same instrument data');
            }),
    },
];

for (const check of PaymentsRollupsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('payments-rollups', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});

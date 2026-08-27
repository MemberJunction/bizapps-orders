/**
 * embedded-payment-detail — owner-held Payment Details on the three D39 hosts.
 *
 * WHY THIS BUNDLE EXISTS
 * PaymentDetail is the first honest Embedded Record in this app: a 1:1 peer with its
 * own PK, joined by an FK on the owner. Three hosts, copy-on-use, never shared:
 *
 *   Customer Payment Method.PaymentDetailID   required
 *   Payment Header.PaymentDetailID            optional
 *   Order Header.InitialPaymentDetailID       optional
 *
 * Confirm COPIES the order's snapshot onto the payment (D39). These checks prove
 * the embed save invert (peer first, stamp owner FK), Load, dirty rollup, Clear+delete,
 * uniqueness, and that confirm still copies rather than shares.
 *
 * Instrument fields are immutable after insert (`trg_PaymentDetail_Immutable`).
 * Dirty rollup therefore edits Notes, which the trigger leaves writable.
 */
import { UUIDsEqual } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import type { CustomerPaymentMethodEntity, PaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsOrdersPaymentDetailEntity } from '@mj-biz-apps/orders-entities';
import {
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    SameID,
    TxMaybeOne,
    TxOne,
    TeardownOrdersFixture,
} from '../fixture.js';
import {
    CUSTOMER_PAYMENT_METHOD_ENTITY,
    ORDER_HEADER_ENTITY,
    PAYMENT_DETAIL_ENTITY,
    PAYMENT_HEADER_ENTITY,
} from '../entity-names.js';
import { BuildOrder } from '../order-builder.js';

function cashType(): string {
    const id = Fx().PaymentTypeIDs.get('Cash');
    Assert(id != null, "PaymentType 'Cash' missing — push the orders app metadata");
    return id!;
}

function fillDetail(
    detail: mjBizAppsOrdersPaymentDetailEntity,
    extra: { Last4?: string; Brand?: string; Notes?: string } = {},
): void {
    detail.CompanyID = Fx().CoA.ID;
    detail.PaymentTypeID = cashType();
    if (extra.Last4) detail.Last4 = extra.Last4;
    if (extra.Brand) detail.Brand = extra.Brand;
    if (extra.Notes) detail.Notes = extra.Notes;
}

async function newMethod(ctx: IntegrationCheckContext): Promise<CustomerPaymentMethodEntity> {
    const method = await ctx.Provider.GetEntityObject<CustomerPaymentMethodEntity>(
        CUSTOMER_PAYMENT_METHOD_ENTITY,
        ctx.User,
    );
    method.NewRecord();
    method.OwnerOrganizationID = Fx().Customers.OrganizationID;
    method.Nickname = `embed-${Date.now().toString(36)}`;
    return method;
}

async function newPendingPayment(ctx: IntegrationCheckContext): Promise<PaymentHeaderEntity> {
    const payment = await ctx.Provider.GetEntityObject<PaymentHeaderEntity>(
        PAYMENT_HEADER_ENTITY,
        ctx.User,
    );
    payment.NewRecord();
    payment.PaymentNumber = `PD-${Date.now().toString(36)}`;
    payment.ReceivingCompanyID = Fx().CoA.ID;
    payment.PaymentTypeID = cashType();
    payment.Amount = 10;
    payment.Status = 'Pending';
    payment.PaymentDate = new Date();
    return payment;
}

async function detailRow(ctx: IntegrationCheckContext, id: string) {
    return TxMaybeOne<{ ID: string; Last4: string | null; Notes: string | null }>(
        ctx,
        `SELECT ID, Last4, Notes FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE ID = '${id}'`,
    );
}

export const EmbeddedPaymentDetailChecks: NamedCheck[] = [
    {
        Id: 'embedded-payment-detail.PD1',
        Name: 'PD1: a required wallet embed is provisioned by NewRecord — no Ensure needed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const method = await newMethod(ctx);
                Assert(method.PaymentDetailID_Object != null, 'PD1: required embed must exist after NewRecord');
                Assert(!method.PaymentDetailID_Object.IsSaved, 'PD1: provisioned peer is still new');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD2',
        Name: 'PD2: wallet Save persists the detail first and stamps PaymentDetailID',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const method = await newMethod(ctx);
                fillDetail(method.PaymentDetailID_Object, { Last4: '4242', Brand: 'Visa' });
                Assert(await method.Save(), `PD2: save failed — ${method.LatestResult?.CompleteMessage}`);
                Assert(!!method.PaymentDetailID, 'PD2: FK should be stamped');
                Assert(
                    UUIDsEqual(method.PaymentDetailID, method.PaymentDetailID_Object.ID),
                    'PD2: FK should equal the peer PK',
                );
                const row = await detailRow(ctx, method.PaymentDetailID);
                Assert(row != null, 'PD2: detail row must exist');
                AssertEqual(row!.Last4?.trim(), '4242', 'PD2: Last4 persisted');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD3',
        Name: 'PD3: Load of a wallet hydrates PaymentDetailID_Object',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const method = await newMethod(ctx);
                fillDetail(method.PaymentDetailID_Object, { Last4: '1111', Brand: 'MC' });
                Assert(await method.Save(), `PD3: save failed — ${method.LatestResult?.CompleteMessage}`);

                const reloaded = await ctx.Provider.GetEntityObject<CustomerPaymentMethodEntity>(
                    CUSTOMER_PAYMENT_METHOD_ENTITY,
                    ctx.User,
                );
                Assert(await reloaded.Load(method.ID), 'PD3: reload failed');
                Assert(reloaded.PaymentDetailID_Object != null, 'PD3: Load must hydrate the peer');
                AssertEqual(reloaded.PaymentDetailID_Object.Last4?.trim(), '1111', 'PD3: loaded Last4');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD4',
        Name: 'PD4: a clean wallet with dirty detail Notes still saves (dirty rollup)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const method = await newMethod(ctx);
                fillDetail(method.PaymentDetailID_Object, { Last4: '2222', Notes: 'first' });
                Assert(await method.Save(), `PD4: initial save failed — ${method.LatestResult?.CompleteMessage}`);

                method.PaymentDetailID_Object.Notes = 'edited';
                Assert(method.Dirty, 'PD4: a dirty peer must roll up into the owner');
                Assert(await method.Save(), `PD4: rollup save failed — ${method.LatestResult?.CompleteMessage}`);

                const row = await detailRow(ctx, method.PaymentDetailID);
                AssertEqual(row?.Notes, 'edited', 'PD4: Notes must persist');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD5',
        Name: 'PD5: a nullable payment-header embed is null after NewRecord until Ensure',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const payment = await newPendingPayment(ctx);
                Assert(payment.PaymentDetailID_Object === null, 'PD5: optional embed must be null after NewRecord');
                Assert(await payment.Save(), `PD5: header-only save failed — ${payment.LatestResult?.CompleteMessage}`);
                Assert(payment.PaymentDetailID == null, 'PD5: save must not invent a detail');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD6',
        Name: 'PD6: payment-header Ensure + Save persists the detail and stamps the FK',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const payment = await newPendingPayment(ctx);
                const detail = payment.PaymentDetailID_EnsureObject();
                fillDetail(detail, { Last4: '3333', Brand: 'Amex' });
                Assert(payment.PaymentDetailID_EnsureObject() === detail, 'PD6: Ensure is idempotent');
                Assert(await payment.Save(), `PD6: save failed — ${payment.LatestResult?.CompleteMessage}`);
                Assert(!!payment.PaymentDetailID, 'PD6: FK should be stamped');
                Assert(UUIDsEqual(payment.PaymentDetailID!, detail.ID), 'PD6: FK should equal the peer PK');
                const row = await detailRow(ctx, payment.PaymentDetailID!);
                AssertEqual(row?.Last4?.trim(), '3333', 'PD6: Last4 persisted');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD7',
        Name: 'PD7: Load of a payment header hydrates PaymentDetailID_Object',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const payment = await newPendingPayment(ctx);
                fillDetail(payment.PaymentDetailID_EnsureObject(), { Last4: '4444' });
                Assert(await payment.Save(), `PD7: save failed — ${payment.LatestResult?.CompleteMessage}`);

                const reloaded = await ctx.Provider.GetEntityObject<PaymentHeaderEntity>(
                    PAYMENT_HEADER_ENTITY,
                    ctx.User,
                );
                Assert(await reloaded.Load(payment.ID), 'PD7: reload failed');
                Assert(reloaded.PaymentDetailID_Object != null, 'PD7: Load must hydrate the peer');
                AssertEqual(reloaded.PaymentDetailID_Object.Last4?.trim(), '4444', 'PD7: loaded Last4');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD8',
        Name: 'PD8: Clear + delete nulls the payment FK and removes the detail row',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const payment = await newPendingPayment(ctx);
                fillDetail(payment.PaymentDetailID_EnsureObject(), { Last4: '5555' });
                Assert(await payment.Save(), `PD8: save failed — ${payment.LatestResult?.CompleteMessage}`);
                const detailId = payment.PaymentDetailID!;

                payment.ClearPaymentDetail();
                Assert(payment.PaymentDetailID_Object === null, 'PD8: Clear must unexpose the peer');
                Assert(await payment.Save(), `PD8: clear save failed — ${payment.LatestResult?.CompleteMessage}`);
                Assert(payment.PaymentDetailID == null, 'PD8: FK must be nulled');
                Assert((await detailRow(ctx, detailId)) == null, 'PD8: OnClear delete must remove the row');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD9',
        Name: 'PD9: order InitialPaymentDetail Ensure + Save stamps InitialPaymentDetailID',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await BuildOrder(ctx.User, {
                    CompanyID: Fx().CoA.ID,
                    Lines: [{ ProductID: Fx().Products['WidgetA'], Quantity: 1, UnitPrice: 25 }],
                });
                const order = built.Order;
                Assert(order.InitialPaymentDetailID_Object === null, 'PD9: optional embed starts null');
                fillDetail(order.InitialPaymentDetailID_EnsureObject(), { Last4: '6666' });
                Assert(await order.Save(), `PD9: save failed — ${order.LatestResult?.CompleteMessage}`);
                Assert(!!order.InitialPaymentDetailID, 'PD9: FK should be stamped');
                const row = await detailRow(ctx, order.InitialPaymentDetailID!);
                AssertEqual(row?.Last4?.trim(), '6666', 'PD9: Last4 persisted');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD10',
        Name: 'PD10: Load of an order hydrates InitialPaymentDetailID_Object',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await BuildOrder(ctx.User, {
                    CompanyID: Fx().CoA.ID,
                    Lines: [{ ProductID: Fx().Products['WidgetA'], Quantity: 1, UnitPrice: 25 }],
                });
                const order = built.Order;
                fillDetail(order.InitialPaymentDetailID_EnsureObject(), { Last4: '7777' });
                Assert(await order.Save(), `PD10: save failed — ${order.LatestResult?.CompleteMessage}`);

                const reloaded = await ctx.Provider.GetEntityObject<typeof order>(
                    ORDER_HEADER_ENTITY,
                    ctx.User,
                );
                Assert(await reloaded.Load(order.ID), 'PD10: reload failed');
                Assert(reloaded.InitialPaymentDetailID_Object != null, 'PD10: Load must hydrate the peer');
                AssertEqual(reloaded.InitialPaymentDetailID_Object.Last4?.trim(), '7777', 'PD10: loaded Last4');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD11',
        Name: 'PD11: Clear + delete on the order nulls InitialPaymentDetailID and removes the row',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const built = await BuildOrder(ctx.User, {
                    CompanyID: Fx().CoA.ID,
                    Lines: [{ ProductID: Fx().Products['WidgetA'], Quantity: 1, UnitPrice: 25 }],
                });
                const order = built.Order;
                fillDetail(order.InitialPaymentDetailID_EnsureObject(), { Last4: '8888' });
                Assert(await order.Save(), `PD11: save failed — ${order.LatestResult?.CompleteMessage}`);
                const detailId = order.InitialPaymentDetailID!;

                order.ClearInitialPaymentDetail();
                Assert(await order.Save(), `PD11: clear save failed — ${order.LatestResult?.CompleteMessage}`);
                Assert(order.InitialPaymentDetailID == null, 'PD11: FK must be nulled');
                Assert((await detailRow(ctx, detailId)) == null, 'PD11: OnClear delete must remove the row');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD12',
        Name: 'PD12: two wallets cannot share one PaymentDetail (unique 1:1)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const a = await newMethod(ctx);
                fillDetail(a.PaymentDetailID_Object, { Last4: '9999' });
                Assert(await a.Save(), `PD12: first save failed — ${a.LatestResult?.CompleteMessage}`);

                const b = await newMethod(ctx);
                fillDetail(b.PaymentDetailID_Object, { Last4: '0000' });
                Assert(await b.Save(), `PD12: second save failed — ${b.LatestResult?.CompleteMessage}`);

                b.PaymentDetailID = a.PaymentDetailID;
                const saved = await b.Save();
                Assert(!saved, 'PD12: sharing a detail must fail the unique index');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD13',
        Name: 'PD13: confirm copies the order snapshot onto the payment — the two rows are never shared',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const built = await BuildOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    InitialPaymentTypeID: cashType(),
                    InitialPaymentAmount: 40,
                    Lines: [{ ProductID: f.Products['WidgetA'], Quantity: 1, UnitPrice: 40 }],
                });
                const order = built.Order;
                fillDetail(order.InitialPaymentDetailID_EnsureObject(), { Last4: '1212', Brand: 'Visa' });
                order.Status = 'Confirmed';
                Assert(await order.Save(), `PD13: confirm failed — ${order.LatestResult?.CompleteMessage}`);

                const payment = await TxOne<{ PaymentDetailID: string }>(
                    ctx,
                    `SELECT ph.PaymentDetailID
                       FROM ${ORDERS_SCHEMA}.PaymentHeader ph
                       JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                      WHERE pl.OrderHeaderID = '${order.ID}'`,
                );
                Assert(!!order.InitialPaymentDetailID, 'PD13: order still holds its intent snapshot');
                Assert(!!payment.PaymentDetailID, 'PD13: payment has its own snapshot');
                Assert(
                    !SameID(order.InitialPaymentDetailID, payment.PaymentDetailID),
                    'PD13: D39 copy-on-use — confirm must not share the row',
                );
                const intent = await detailRow(ctx, order.InitialPaymentDetailID!);
                const captured = await detailRow(ctx, payment.PaymentDetailID);
                AssertEqual(intent?.Last4?.trim(), '1212', 'PD13: order snapshot Last4');
                AssertEqual(captured?.Last4?.trim(), '1212', 'PD13: payment snapshot Last4 copied');
            }),
    },
    {
        Id: 'embedded-payment-detail.PD14',
        Name: 'PD14: wallet save without filling required detail fields fails validation',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const method = await newMethod(ctx);
                const saved = await method.Save();
                Assert(!saved, 'PD14: an empty required detail must fail validation');
            }),
    },
];

for (const check of EmbeddedPaymentDetailChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('embedded-payment-detail', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});

/**
 * subscription-renewal.checks.ts — the `subscription-renewal` bundle (SR1–SR50).
 *
 * `Orders.SpawnRenewals` closes the subscription lifecycle: `AutoRenew` and `RenewalLeadDays` were
 * columns with no consumer, so a subscription reached the end of its term and simply stopped.
 *
 * The behaviour under test is a SCHEDULED JOB, which raises stakes ordinary code does not have —
 * it runs unattended, repeatedly, against live customers. So most of these checks are about what it
 * must NOT do: not renew a cancelled subscription, not renew one the customer opted out of, not
 * renew twice, not renew early.
 *
 * WHAT IT PROVES
 *   SR1   a subscription expiring inside its lead window gets a confirmed renewal order
 *   SR2   the renewal appends a CONTIGUOUS term N+1 to the SAME subscription
 *   SR3   the renewal order books, and the new term recognizes over its own window
 *   SR4   a subscription not yet inside its lead window is left alone
 *   SR5   AutoRenew = false is never renewed
 *   SR6   a canceled subscription is never renewed
 *   SR7   running the job twice does not renew twice (idempotency)
 *   SR8   a RejectDuplicate type still renews itself
 *   SR9   Subscription.RenewalLeadDays overrides the type's default
 *   SR10  Preview reports what is due without placing anything
 *   SR11  the renewal LINE links back via RenewsSubscriptionID and logs a lifecycle event
 *   SR12  the Action the scheduler dispatches reaches the operation and places the renewal
 *   SR13  Preview arrives from a scheduler as the STRING "true" and still writes nothing
 *   SR14  the schedule points at this Action, and ships disabled and set to preview
 *   SR15  the renewal carries one Invoiced schedule row per company, due on the invoice day plus the
 *         customer's terms capped at the term start, and AR is dated the business day it was
 *         invoiced, never on the new term's first day (#305)
 *   SR16  a renewal of a product recognised at sale books Dr Unbilled / Cr Sales, then the invoice
 *         moves it to AR (Dr AR / Cr Unbilled)
 *   SR17  the same renewal with no Unbilled Receivable account linked is skipped with the reason,
 *         and nothing is booked
 *   SR18  a subscription renews again at the end of the term its first renewal booked
 *   SR19  a renewal drafted by hand for this cycle holds the job off
 *   SR20  a voided renewal order does not hold the job off
 *   SR21  cancelling a NoRefund subscription after the renewal is booked and invoiced cancels the
 *         renewal and keeps its money: no reversal order, and the invoiced amount stays on AR (#560)
 *
 *   What a renewal is priced at (golive #304):
 *   SR22  a first-term discount lapses: the renewal is at the undiscounted price with no discount
 *   SR23  CarryDiscountOnRenewal keeps the discount
 *   SR24  the increase comes from the subscription, else the product, else the nearest category up
 *         the chain, else the company, and a preview reports it without placing anything
 *   SR25  a live renewal applies the increase and shows base, increase and price on the order notes
 *         and the renewal event
 *   SR26  a price typed below list lapses back to the prior list price
 *   SR27  a product with an Active successor renews as the successor at its list price, and the
 *         subscription moves onto the successor
 *   SR28  a successor that is not Active is not renewed onto
 *   SR29  a renewal priced below today's list books without a concession hold
 *   SR30  a monthly term that crosses no anniversary renews with no increase
 *
 *   SR31  a prorated 10-seat first term renews at 10 seats, not the line's prorated quantity (#589)
 *   Promotions that carry into renewals (#289):
 *   SR32  a promotion with AppliesToRenewals set discounts the renewal, at the renewal price the pass
 *         wrote and without a concession hold; the preview, notes and event report it
 *   SR33  a promotion without the flag does not carry: the renewal is at full price
 *   SR34  a flagged promotion that is paused, or past its EffectiveTo, is reported unusable with the
 *         reason, and the renewal is placed at full price
 *   Charging the renewal card (#289), through the Stripe stub and Stripe's own test card names:
 *   SR35  a subscription with a renewal card renews with its one schedule row due on the term start,
 *         and booking the renewal calls no gateway
 *   SR36  the card is charged on the term start and captured against the renewal order, dated the
 *         gateway's business day, with a PaymentSucceeded event naming the payment; nothing the day before
 *   SR37  running the pass twice in a day charges once, for a paid order and for a declined one
 *   SR38  a declined card is retried on days 3, 7 and 11, each its own Failed intent and PaymentFailed
 *         event naming the attempt and the next day, and is not tried on any other day or after day 11
 *   SR39  an authentication demand on the off-session charge is recorded as a failed attempt
 *   SR40  a subscription without a renewal card keeps the invoice-day due date and is never charged
 *   SR41  the Action the scheduler dispatches previews from the STRING "true", then charges on "false"
 *   SR42  the charge schedule points at its Action, and ships disabled and set to preview
 *   SR43  a later settled-payment webhook for the charged intent books nothing more
 *   SR44  one order's fault does not stop the pass: the next order is still charged
 *
 *   The update-card link (#289):
 *   SR45  an order's first failed charge sends the link through the charge Action; its second does not
 *   SR46  the link opens a session on the renewal order that pays it: no new order, the balance
 *         cleared through the ordinary capture, and the session confirmed on the renewal order
 *   SR47  the link is refused once the renewal is paid, and a tampered link is refused outright
 *   SR48  a pay-renewal session cannot be drafted, so the renewal is never re-priced
 *
 *   Edge cases of the charge pass (#683):
 *   SR49  money the gateway took but no payment booked is booked after the last retry day, with
 *         automatic renewal off, and the card is not charged again
 *   SR50  the update-card link goes out only once the failed charge is recorded, so a rerun the same
 *         day never sends it twice
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 */
import { BaseAction } from '@memberjunction/actions';
import type { RunActionParams } from '@memberjunction/actions-base';
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { AccountingEngineBase } from '@mj-biz-apps/accounting-engine-base';
import { OrdersEngine, Today, type CustomerPaymentMethodEntity } from '@mj-biz-apps/orders-entities';
import {
    ACCT_SCHEMA,
    CreateOrdersFixture,
    CreateProductPrice,
    CreatePromotion,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    SameID,
    TeardownOrdersFixture,
    TxMaybeOne,
    createViaEntity,
    TxOne,
    TxQuery,
    upsertViaEntity,
} from '../fixture.js';
import {
    CHECKOUT_WIDGET_DISTRIBUTION_ENTITY,
    CHECKOUT_WIDGET_ENTITY,
    CUSTOMER_PAYMENT_METHOD_ENTITY,
    GL_ACCOUNT_LINK_ENTITY,
    ORDER_COMPANY_POLICY_ENTITY,
    PAYMENT_INTENT_ENTITY,
    PAYMENT_PROVIDER_ENTITY,
    PAYMENT_PROVIDER_TYPE_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PROMOTION_ENTITY,
    SUBSCRIPTION_ENTITY,
} from '../entity-names.js';
import { BuildOrder, ConfirmOrder } from '../order-builder.js';
import {
    ChargeRenewals,
    CheckoutSessionService,
    ConfigureRenewalPaymentLinks,
    OrdersSettings,
    SignRenewalPaymentToken,
    type ChargeRenewalsOutput,
} from '@mj-biz-apps/orders-core-entities-server';

/** Chart of accounts the fixture books against (same codes as payment-schedule.checks.ts). */
const AR_CODE = '11201';
const DEFERRED_CODE = '21301';
const SALES_CODE = '40100';
const UNBILLED_CODE = '11300';

/** Bought Jan 1 so an annual term ends Dec 31 — every date below reads off that. */
const JAN_1 = new Date('2026-01-01T00:00:00Z');

interface RenewalOutput {
    Success: boolean;
    Message?: string;
    Candidates: Array<{
        SubscriptionID: string;
        SubscriptionNumber: string;
        CurrentTermEnd: string;
        LeadDays: number;
        OrderID?: string;
        OrderNumber?: string;
        SkippedReason?: string;
        RenewalProductID?: string;
        BasePrice?: number;
        BasePriceSource?: string;
        IncreasePercent?: number;
        IncreaseSource?: string;
        UnitPrice?: number;
        DiscountPct?: number;
        RenewalPromotionCodes?: string[];
        UnusableRenewalPromotionCodes?: Array<{ Code: string; Reason: string }>;
    }>;
    Placed: number;
    Skipped: number;
}

async function spawnRenewals(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<RenewalOutput> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, RenewalOutput>
    >(BaseRemotableOperation, 'Orders.SpawnRenewals');
    Assert(op != null, "'Orders.SpawnRenewals' is not registered");

    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(
        result.Success,
        `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`,
    );
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output as RenewalOutput;
}

/** Buy a subscription on Jan 1 and return its ID and first term. */
async function buySubscription(
    ctx: IntegrationCheckContext,
    productKey: string,
    price: number,
    discountPct?: number,
    promotionCodes?: string[],
    organizationID?: string,
    billToPersonID?: string,
) {
    const f = Fx();
    const result = await ConfirmOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: JAN_1,
        BillToOrganizationID: organizationID ?? f.Customers.OrganizationID,
        BillToPersonID: billToPersonID,
        Lines: [{ ProductID: f.Products[productKey], Quantity: 1, UnitPrice: price, DiscountPct: discountPct }],
        PromotionCodes: promotionCodes,
    });
    Assert(result.Saved, `confirm failed: ${result.Message}`);

    const term = await TxOne<{ ID: string; SubscriptionID: string; EndDate: string; TermNumber: number }>(
        ctx,
        `SELECT st.ID, st.SubscriptionID, st.EndDate, st.TermNumber
         FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
         JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
         WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
    );
    return { OrderID: result.Order.ID as string, SubscriptionID: term.SubscriptionID, Term: term };
}

/** All terms on a subscription, oldest first. */
const termsOf = (ctx: IntegrationCheckContext, subscriptionID: string) =>
    TxQuery<{ ID: string; TermNumber: number; StartDate: string; EndDate: string; Amount: number }>(
        ctx,
        `SELECT ID, TermNumber, StartDate, EndDate, Amount FROM ${ORDERS_SCHEMA}.SubscriptionTerm
         WHERE SubscriptionID = '${subscriptionID}' ORDER BY TermNumber`,
    );

const isoDate = (v: string | Date) => new Date(v).toISOString().slice(0, 10);

/** The one line of a renewal order. */
const renewalLine = (ctx: IntegrationCheckContext, orderID: string) =>
    TxOne<{ ProductID: string; UnitPrice: number; DiscountPct: number }>(
        ctx,
        `SELECT ProductID, UnitPrice, DiscountPct FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
    );

/** A date `days` before the given one — used to sit just inside or outside a lead window. */
function daysBefore(date: string, days: number): string {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

/** A renewal of this subscription saved as a Draft, dated the day after the term ends. */
async function draftRenewal(ctx: IntegrationCheckContext, subscriptionID: string, termEnd: string) {
    const f = Fx();
    const built = await BuildOrder(ctx.User, {
        CompanyID: f.CoA.ID,
        OrderDate: new Date(daysBefore(termEnd, -1)),
        BillToOrganizationID: f.Customers.OrganizationID,
        Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1, UnitPrice: 1200, RenewsSubscriptionID: subscriptionID }],
    });
    Assert(await built.Order.Save(), `saving the draft renewal failed: ${built.Order.LatestResult?.CompleteMessage}`);
    return built.Order;
}

/** `Orders.CancelSubscription`, resolved through the ClassFactory as any caller does. */
async function cancelSubscription(
    ctx: IntegrationCheckContext,
    input: Record<string, unknown>,
): Promise<{ Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }> {
    const op = MJGlobal.Instance.ClassFactory.CreateInstance<
        BaseRemotableOperation<Record<string, unknown>, { Success: boolean; Message?: string; TotalRefundAmount?: number; ReversalOrderID?: string }>
    >(BaseRemotableOperation, 'Orders.CancelSubscription');
    Assert(op != null, "'Orders.CancelSubscription' is not registered");
    const result = await op!.Execute(input, { provider: ctx.Provider, user: ctx.User });
    Assert(result.Success, `the operation did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown'}`);
    Assert(result.Output != null, 'the operation returned no payload');
    return result.Output!;
}

/** The key both the Action metadata and the `@RegisterClass` decorator name. */
const ACTION_DRIVER_CLASS = 'Orders.SpawnRenewals';

/**
 * Run the renewal Action the way the scheduler runs it — resolved from the ClassFactory under the
 * key the metadata names, with every parameter a STRING, because that is what a `ScheduledJob`
 * Configuration stores. Importing the class instead would prove the code works and prove nothing
 * about whether the scheduler can find it or survive its own encoding.
 */
async function spawnRenewalsViaAction(
    ctx: IntegrationCheckContext,
    inputs: Record<string, string>,
): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Placed: number; Skipped: number; Candidates: RenewalOutput['Candidates'] }> {
    // TryCreateInstance, not CreateInstance. `CreateInstance` does not return null for an
    // unregistered key — it hands back `new BaseAction()`, because `abstract` is erased at runtime
    // and BaseAction carries no @RequiresSubclass marker. A `!= null` assert can therefore never
    // fire, and a missing Load anchor would surface as a TypeError from `.Run()` about
    // InternalRunAction rather than as the one sentence that names the cause.
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, ACTION_DRIVER_CLASS);
    Assert(
        resolved.Resolved && resolved.Instance != null,
        `'${ACTION_DRIVER_CLASS}' is not registered — the Load anchor is missing from the server bootstrap${resolved.Reason ? `: ${resolved.Reason}` : ''}`,
    );
    const action = resolved.Instance!;

    const params = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
        Filters: [],
    } as unknown as RunActionParams;

    const result = await action.Run(params);
    const output = <T,>(name: string): T | undefined =>
        params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;

    return {
        Success: result.Success,
        ResultCode: result.ResultCode,
        Message: result.Message,
        Placed: Number(output<number>('Placed') ?? 0),
        Skipped: Number(output<number>('Skipped') ?? 0),
        Candidates: output<RenewalOutput['Candidates']>('Candidates') ?? [],
    };
}

export const SubscriptionRenewalChecks: NamedCheck[] = [
    {
        Id: 'subscription-renewal.SR1',
        Name: 'SR1: a subscription inside its lead window gets a renewal order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: 90 lead days. Term runs 2026-01-01 → 2026-12-31.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                AssertEqual(out.Candidates.length, 1, 'candidates');
                AssertEqual(Number(out.Candidates[0].LeadDays), 90, "lead days from the type's default");
                Assert(
                    /^ORD-\d{6}$/.test(out.Candidates[0].OrderNumber ?? ''),
                    `the renewal gets a real order number, got '${out.Candidates[0].OrderNumber}'`,
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR2',
        Name: 'SR2: the renewal appends a contiguous term to the same subscription',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the subscription now has two terms');
                AssertEqual(Number(terms[1].TermNumber), 2, 'the new term number');

                // Contiguous: coverage must not gap, or the customer is uninsured for a day.
                AssertEqual(
                    isoDate(terms[1].StartDate),
                    isoDate(daysBefore(terms[0].EndDate, -1)),
                    'term 2 starts the day after term 1 ends',
                );
                AssertEqual(isoDate(terms[1].EndDate), '2027-12-31', 'a full further year');
                AssertEqual(Number(terms[1].Amount), 1200, 'renewed at the price last paid');
            }),
    },
    {
        Id: 'subscription-renewal.SR3',
        Name: 'SR3: the renewal books and recognizes over the new term',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalOrderID = out.Candidates[0].OrderID!;

                // Billed by its one-row schedule (#305, D92): the value entry is the instalment's
                // invoice, raised inside the confirm, not a booking entry on the line.
                const billing = await TxOne<{ EntryType: string; D: number }>(
                    ctx,
                    `SELECT (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) AS EntryType,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.vwJournalEntries je ON je.ID = ps.JournalEntryID
                     WHERE ps.OrderHeaderID = '${renewalOrderID}'`,
                );
                AssertEqual(billing.EntryType, 'InstalmentInvoice', 'the renewal is billed by its instalment invoice');
                AssertEqual(Number(billing.D), 1200, 'billed amount');

                // Recognition anchors to the NEW term and is dated into its window (D14/D46) —
                // invoicing ahead of the period must not recognize ahead of it.
                const terms = await termsOf(ctx, SubscriptionID);
                const releases = await TxQuery<{ EffectiveDate: string; D: number }>(
                    ctx,
                    `SELECT je.EffectiveDate,
                            (SELECT SUM(DebitAmount) FROM ${ACCT_SCHEMA}.JournalEntryLine WHERE JournalEntryID = je.ID) AS D
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     WHERE (SELECT Code FROM ${ACCT_SCHEMA}.JournalEntryType WHERE ID = je.EntryTypeID) = 'RevenueRecognition' AND je.LinkedRecordID = '${terms[1].ID}'`,
                );
                AssertEqual(releases.length, 12, 'monthly releases over the renewed year');
                AssertEqual(
                    Math.round(releases.reduce((t, r) => t + Number(r.D), 0) * 100) / 100,
                    1200,
                    'releases sum to the renewed term',
                );
                Assert(
                    releases.every((r) => isoDate(r.EffectiveDate) >= isoDate(terms[1].StartDate)),
                    'no release may fall before the term it earns',
                );
            }),
    },
    {
        Id: 'subscription-renewal.SR4',
        Name: 'SR4: a subscription outside its lead window is left alone',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // 150 days out, with a 90-day lead — renewing here would invoice two months early.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 150) });
                AssertEqual(out.Placed, 0, `nothing should be placed yet: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not even a candidate');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'still one term');
            }),
    },
    {
        Id: 'subscription-renewal.SR5',
        Name: 'SR5: a subscription with AutoRenew off is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET AutoRenew = 0 WHERE ID = '${SubscriptionID}'`,
                );

                // AutoRenew is the consent switch: without it the system has no standing authority
                // to bill again, so the term simply ends.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `opted out, so nothing may be placed: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR6',
        Name: 'SR6: a canceled subscription is never renewed',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET Status = 'Canceled' WHERE ID = '${SubscriptionID}'`,
                );

                // Resurrecting a cancelled subscription by an unattended job is the single worst
                // thing this operation could do.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a canceled subscription must not renew: ${out.Message}`);
                AssertEqual(out.Candidates.length, 0, 'not a candidate at all');
            }),
    },
    {
        Id: 'subscription-renewal.SR7',
        Name: 'SR7: running the job twice does not renew twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(first.Placed, 1, `first pass places one: ${first.Message}`);

                // A scheduled job runs every day. Double-billing a customer because yesterday's pass
                // already renewed them is the failure this guards.
                const second = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(second.Placed, 0, `second pass must place nothing: ${second.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'still exactly two terms');

                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 1, 'exactly one renewal line exists');
            }),
    },
    {
        Id: 'subscription-renewal.SR8',
        Name: 'SR8: a RejectDuplicate type still renews itself',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // SubFiscal is ConcurrencyMode=RejectDuplicate. That rule answers "may this
                // subscriber hold a SECOND concurrent subscription?" — a renewal is not a second
                // one, it is this one continuing. Without the IsRenewal bypass the type would
                // refuse to renew itself, every cycle, silently.
                // SubFiscal's engine price, so the stated 900 is not a concession the confirm gate holds.
                await CreateProductPrice(ctx, Fx().Products.SubFiscal, 900);
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubFiscal', 900);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a RejectDuplicate type must still renew: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the renewal extended rather than being refused');

                const subs = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE ID = '${SubscriptionID}'`,
                );
                AssertEqual(subs.length, 1, 'and did not create a second subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR9',
        Name: "SR9: the subscription's own lead days override the type's default",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The type says 90; this subscription says 150 — the NULL-means-inherit rule the
                // schema documents, exercised in its non-NULL direction. 120 days out is OUTSIDE
                // the type's window and INSIDE the override's, so only the override can explain a
                // renewal here.
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.Subscription SET RenewalLeadDays = 150 WHERE ID = '${SubscriptionID}'`,
                );

                const asOf = daysBefore(Term.EndDate, 120);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `120 days out is inside a 150-day window: ${out.Message}`);
                AssertEqual(Number(out.Candidates[0].LeadDays), 150, 'the override was applied, not the default');
            }),
    },
    {
        Id: 'subscription-renewal.SR10',
        Name: 'SR10: Preview reports what is due without placing anything',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const out = await spawnRenewals(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: true,
                });
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');
                Assert(out.Candidates[0].OrderID == null, 'no order id on a preview');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');
                const orders = await TxQuery(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(orders.length, 0, 'no order was placed');
            }),
    },
    {
        Id: 'subscription-renewal.SR11',
        Name: 'SR11: the renewal order links back to the subscription and logs an event',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);

                // A system-placed order must be traceable to what caused it — otherwise an
                // unexplained invoice appears on the customer's account with no origin.
                // The marker lives on the LINE now (D61) — renewal is a per-line act, so one order
                // could renew several subscriptions and a header-level pointer could not say so.
                const order = await TxOne<{ RenewsSubscriptionID: string; OrderType: string; Notes: string }>(
                    ctx,
                    `SELECT ol.RenewsSubscriptionID, o.OrderType, o.Notes
                     FROM ${ORDERS_SCHEMA}.OrderHeader o
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.OrderHeaderID = o.ID
                     WHERE o.ID = '${out.Candidates[0].OrderID}'`,
                );
                Assert(SameID(order.RenewsSubscriptionID, SubscriptionID), 'the line names the subscription it renews');
                AssertEqual(order.OrderType, 'Sale', 'a renewal is an ordinary sale');
                Assert(/renewal/i.test(order.Notes ?? ''), `the note explains its origin: ${order.Notes}`);

                const event = await TxOne<{ EventType: string; EventData: string; RelatedOrderHeaderID: string }>(
                    ctx,
                    `SELECT EventType, EventData, RelatedOrderHeaderID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                Assert(
                    SameID(event.RelatedOrderHeaderID, out.Candidates[0].OrderID),
                    'the event links to the order it spawned',
                );
                const data = JSON.parse(event.EventData) as Record<string, unknown>;
                AssertEqual(Number(data.LeadDays), 90, `the event records the lead time applied: ${event.EventData}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR12',
        Name: 'SR12: the Action the scheduler dispatches places the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // SR1 already proves the operation renews. What is unproven until here is the only
                // thing the schedule actually depends on: that the Action reaches it. The operation
                // has been correct and uncalled since it was written — a shim that silently does
                // nothing would reproduce exactly the symptom this bundle exists to prevent.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.Placed, 1, `expected one renewal through the action: ${out.Message}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'and the term it bought is on the subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR13',
        Name: 'SR13: Preview survives the scheduler storing it as the string "true"',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                // A ScheduledJob stores every parameter as text, so a job configured for preview
                // hands the action the STRING "true" — and "false" is a truthy string. Read as a
                // plain boolean, a job set to preview bills real customers, and it does it on the
                // one run nobody expected to write anything.
                const out = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'true',
                });
                Assert(out.Success, `the action did not run: ${out.ResultCode} ${out.Message}`);
                AssertEqual(out.ResultCode, 'PREVIEWED', 'and it reports the run as a preview');
                AssertEqual(out.Placed, 0, 'a preview places nothing');
                AssertEqual(out.Candidates.length, 1, 'but still reports what is due');

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 1, 'no term was created');

                // The other half of the trap: "false" must not read as truthy either.
                const live = await spawnRenewalsViaAction(ctx, {
                    SubscriptionID,
                    AsOfDate: daysBefore(Term.EndDate, 10),
                    Preview: 'false',
                });
                AssertEqual(live.Placed, 1, `"false" means place them: ${live.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR14',
        Name: 'SR14: the schedule points at the action, and ships disabled and set to preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Spawn Renewals'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(action!.Status, 'Active', 'and it is active');
                AssertEqual(action!.DriverClass, ACTION_DRIVER_CLASS, 'pointing at the registered key');

                const job = await TxMaybeOne<{ Configuration: string; Status: string; CronExpression: string }>(
                    ctx,
                    `SELECT Configuration, Status, CronExpression FROM __mj.ScheduledJob WHERE Name = N'Orders — Spawn Renewals (daily)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');

                // The failure this catches is the expensive one: a job whose Configuration names an
                // ActionID that no longer exists runs every night, fails every night, and renews
                // nobody — which looks exactly like the subscriptions not being due yet.
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(
                    config.ActionID != null && SameID(config.ActionID, action!.ID),
                    `the job's Configuration names this action: ${job!.Configuration}`,
                );

                // Shipping it live would start billing customers on whatever day this metadata
                // reached a host, with nobody having read the list first. Going live is a decision,
                // not a deployment.
                AssertEqual(job!.Status, 'Disabled', 'and it ships disabled');

                const previewParam = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`,
                );
                Assert(previewParam != null, 'the Preview parameter is declared');
                const configured = config.Params?.find((p) => SameID(p.ActionParamID, previewParam!.ID));
                AssertEqual(String(configured?.Value), 'true', `and the job is configured for preview: ${job!.Configuration}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR15',
        Name: 'SR15: the renewal is invoiced on the pass day through a one-row schedule, and AR is not dated on the term start',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Net 30 for the seller, and a pass 60 days out, so invoice day + 30 lands before
                // the term start and the cap does not decide the date (#305 review item 1).
                await setCompanyDefaultTerms(ctx, 'Net30');
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 60);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;
                const header = await TxOne<{ OrderDate: string; DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), OrderDate, 23) AS OrderDate, CONVERT(varchar(10), DueDate, 23) AS DueDate
                     FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(header.DueDate, daysBefore(header.OrderDate, -30), 'precondition: the order resolved Net 30');

                const companies = await TxQuery<{ CompanyID: string }>(
                    ctx,
                    `SELECT DISTINCT CompanyID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
                );
                const rows = await TxQuery<{ CompanyID: string; InstallmentNumber: number; DueDate: string; Amount: number; Status: string; DocumentNumber: string | null; InvoicedAt: string | null }>(
                    ctx,
                    `SELECT CompanyID, InstallmentNumber, CONVERT(varchar(10), DueDate, 23) AS DueDate, Amount, Status,
                            DocumentNumber, CONVERT(varchar(40), InvoicedAt, 127) AS InvoicedAt
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(rows.length, companies.length, 'exactly one schedule row per company on the renewal');
                const row = rows[0];
                Assert(SameID(row.CompanyID, companies[0].CompanyID), 'the row bills the line company');
                AssertEqual(Number(row.InstallmentNumber), 1, 'a single instalment');
                AssertEqual(Number(row.Amount), 1200, 'for the whole renewal');
                AssertEqual(row.DueDate, daysBefore(asOf, -30), 'due on the invoice day plus the customer terms');
                AssertEqual(row.Status, 'Invoiced', 'issued inside the confirm');
                Assert(!!row.DocumentNumber, 'with an invoice number');
                Assert(row.InvoicedAt != null, 'and an invoice timestamp');

                // Every AR line the order raised, from confirm (line entries) and from the instalment.
                const ar = await TxQuery<{ EffectiveDate: string; DebitAmount: number; CreditAmount: number }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), je.EffectiveDate, 23) AS EffectiveDate, jel.DebitAmount, jel.CreditAmount
                     FROM ${ACCT_SCHEMA}.vwJournalEntries je
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE gl.Code = '${AR_CODE}'
                       AND (je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')
                         OR je.ID IN (SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'))`,
                );
                // The BUSINESS day the instalment was issued (#209), which is what the entry is
                // dated by — not the UTC day of the InvoicedAt instant.
                const invoiceDay = Today();
                const orderDay = isoDate(daysBefore(Term.EndDate, -1));
                AssertEqual(
                    Math.round(ar.reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100) / 100,
                    1200,
                    `the renewal is a receivable of its whole value: ${JSON.stringify(ar)}`,
                );
                Assert(ar.every((l) => l.EffectiveDate === invoiceDay), `all AR is dated the invoice day ${invoiceDay}: ${JSON.stringify(ar)}`);
                Assert(invoiceDay !== orderDay, `the check needs the invoice day and the order date apart (${invoiceDay})`);
                Assert(!ar.some((l) => l.EffectiveDate === orderDay), `no AR on the order date ${orderDay}`);

                // D92 rule 1: nothing is recognised yet, so the invoice credits Deferred for all of it.
                const deferred = await TxOne<{ C: number }>(
                    ctx,
                    `SELECT SUM(ISNULL(jel.CreditAmount, 0) - ISNULL(jel.DebitAmount, 0)) AS C
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = ps.JournalEntryID
                     JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
                     WHERE ps.OrderHeaderID = '${orderID}' AND gl.Code = '${DEFERRED_CODE}'`,
                );
                AssertEqual(Number(deferred.C), 1200, 'the invoice credits Deferred Revenue for the whole renewal');

                // THE CAP. A second subscription renewed 10 days out: invoice day + 30 would be past
                // the term start, so the row is due on the order date instead — and still issued.
                // A different product: a second SubRolling for the same buyer stacks onto the first.
                const second = await buySubscription(ctx, 'SubCalendar', 1200);
                const lateAsOf = daysBefore(second.Term.EndDate, 10);
                const late = await spawnRenewals(ctx, { SubscriptionID: second.SubscriptionID, AsOfDate: lateAsOf });
                AssertEqual(late.Placed, 1, `expected the second renewal: ${late.Message} ${late.Candidates[0]?.SkippedReason ?? ''}`);
                const capped = await TxOne<{ DueDate: string; Status: string; OrderDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), ps.DueDate, 23) AS DueDate, ps.Status, CONVERT(varchar(10), oh.OrderDate, 23) AS OrderDate
                     FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule ps
                     JOIN ${ORDERS_SCHEMA}.OrderHeader oh ON oh.ID = ps.OrderHeaderID
                     WHERE ps.OrderHeaderID = '${late.Candidates[0].OrderID}'`,
                );
                AssertEqual(capped.DueDate, capped.OrderDate, 'capped at the order date');
                Assert(daysBefore(lateAsOf, -30) > capped.OrderDate, 'the check needs invoice day + 30 past the term start');
                AssertEqual(capped.Status, 'Invoiced', 'and confirm still issued it');
            }),
    },
    {
        Id: 'subscription-renewal.SR16',
        Name: 'SR16: a renewal of a product recognised at sale books to Unbilled, then the invoice moves it to AR',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                    spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                );
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;

                const booking = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(booking, UNBILLED_CODE), 1200, `confirm debits Unbilled 1,200: ${JSON.stringify(booking)}`);
                AssertEqual(netOn(booking, SALES_CODE), -1200, 'and credits Sales 1,200');
                AssertEqual(netOn(booking, AR_CODE), 0, 'with no AR at confirm');

                const invoice = await ledgerOf(ctx, `SELECT JournalEntryID FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`);
                AssertEqual(netOn(invoice, AR_CODE), 1200, `the invoice debits AR 1,200: ${JSON.stringify(invoice)}`);
                AssertEqual(netOn(invoice, UNBILLED_CODE), -1200, 'and credits Unbilled 1,200');
                AssertEqual(netOn(invoice, DEFERRED_CODE), 0, 'with nothing deferred');
            }),
    },
    {
        Id: 'subscription-renewal.SR17',
        Name: 'SR17: with no Unbilled Receivable linked, that renewal is skipped with the reason and nothing is booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await withUnbilledUnlinked(ctx, () =>
                    withUpFrontRecognition(ctx, Fx().Products.SubRolling, () =>
                        spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) }),
                    ),
                );
                AssertEqual(out.Placed, 0, `nothing is placed: ${out.Message}`);
                AssertEqual(out.Skipped, 1, 'the subscription is reported as skipped');
                const reason = out.Candidates[0].SkippedReason ?? '';
                Assert(reason.includes('Unbilled Receivable'), `the reason names the missing account: ${reason}`);
                Assert(reason.includes(out.Candidates[0].SubscriptionNumber), `and the subscription: ${reason}`);

                const renewalLines = await TxOne<{ N: number }>(
                    ctx,
                    `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`,
                );
                AssertEqual(Number(renewalLines.N), 0, 'no renewal order survives');
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'and no new term');
            }),
    },
    {
        Id: 'subscription-renewal.SR18',
        Name: 'SR18: a subscription renews again at the end of the term its first renewal booked',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);

                const first = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(first.Placed, 1, `first cycle places one: ${first.Message}`);
                const second = (await termsOf(ctx, SubscriptionID))[1];
                Assert(second != null, 'the first renewal booked term 2');

                // The first renewal's line still names the subscription. It must not read as this
                // cycle's renewal, or every subscription stops after renewing once.
                const next = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(next.Placed, 1, `second cycle places one: ${next.Message} ${next.Candidates[0]?.SkippedReason ?? ''}`);

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 3, 'three terms');
                AssertEqual(terms[2].TermNumber, 3, 'the new term is term 3');
                AssertEqual(
                    isoDate(terms[2].StartDate),
                    isoDate(daysBefore(second.EndDate, -1)),
                    'term 3 starts the day after term 2 ends',
                );

                const again = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(second.EndDate, 10) });
                AssertEqual(again.Placed, 0, `re-running the second cycle places nothing: ${again.Message}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR19',
        Name: 'SR19: a renewal drafted by hand for this cycle holds the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);

                // A person is already renewing this cycle. A second, automatic order would bill
                // the customer twice once theirs is confirmed.
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 0, `a drafted renewal must hold the job off: ${out.Message}`);
                Assert(
                    /already exists/.test(out.Candidates[0]?.SkippedReason ?? ''),
                    `and says why: ${out.Candidates[0]?.SkippedReason}`,
                );
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 1, 'no term was added');
                Assert(draft.ID != null, 'the draft is still there');
            }),
    },
    {
        Id: 'subscription-renewal.SR20',
        Name: 'SR20: a voided renewal order does not hold the job off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const draft = await draftRenewal(ctx, SubscriptionID, Term.EndDate);
                draft.Status = 'Voided';
                Assert(await draft.Save(), `voiding the draft failed: ${draft.LatestResult?.CompleteMessage}`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `a voided renewal renews nothing, so the job places one: ${out.Message}`);
                AssertEqual((await termsOf(ctx, SubscriptionID)).length, 2, 'term 2 was added');
            }),
    },
    {
        Id: 'subscription-renewal.SR21',
        Name: 'SR21: a NoRefund cancel after the renewal is invoiced keeps the renewal\'s money',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // AnnualRolling: EndOfTerm, NoRefund. Term 1 rides out; term 2 never starts.
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 30) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const renewalID = out.Candidates[0].OrderID!;
                const renewalLine = await TxOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${renewalID}'`,
                );
                const invoiced = await TxOne<{ Status: string }>(
                    ctx,
                    `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${renewalID}'`,
                );
                AssertEqual(invoiced.Status, 'Invoiced', 'precondition: the renewal is billed by its one-row schedule');

                const cancelled = await cancelSubscription(ctx, { SubscriptionID, RequestDate: daysBefore(Term.EndDate, 21) });
                Assert(cancelled.Success, `the cancel must succeed: ${cancelled.Message}`);
                AssertEqual(cancelled.TotalRefundAmount, 0, 'a NoRefund type keeps the invoiced renewal');
                AssertEqual(cancelled.ReversalOrderID ?? null, null, 'nothing is reversed, so no reversal order is booked');

                const terms = await TxQuery<{ TermNumber: number; Status: string }>(
                    ctx,
                    `SELECT TermNumber, Status FROM ${ORDERS_SCHEMA}.SubscriptionTerm
                     WHERE SubscriptionID = '${SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(terms.map((t) => t.Status).join(','), 'Completed,Canceled', 'term 1 rides out, term 2 is canceled');

                const reversals = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ReversesOrderLineID = '${renewalLine.ID}'`,
                );
                AssertEqual(reversals.length, 0, 'nothing reverses the renewal line');
                const billed = await TxOne<{ BilledToDate: number }>(
                    ctx,
                    `SELECT BilledToDate FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${renewalLine.ID}'`,
                );
                AssertEqual(Number(billed.BilledToDate), 1200, 'the invoiced renewal stays billed, so it stays on AR');
            }),
    },
    // ─── What a renewal is priced at (golive #304) ──────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR22',
        Name: 'SR22: a first-term discount lapses at renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, 0.2);
                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(c.BasePriceSource, 'PriorPrice', 'the base is the prior unit price');

                const line = await renewalLine(ctx, c.OrderID!);
                AssertEqual(Number(line.UnitPrice), 1200, 'the undiscounted price');
                AssertEqual(Number(line.DiscountPct), 0, 'the discount lapsed');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1200, 'term 2 at full price');
            }),
    },
    {
        Id: 'subscription-renewal.SR23',
        Name: 'SR23: CarryDiscountOnRenewal keeps the discount',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, 0.2);
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { CarryDiscountOnRenewal: true });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const line = await renewalLine(ctx, out.Candidates[0].OrderID!);
                AssertEqual(Number(line.DiscountPct), 0.2, 'the discount continues');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 960, '1200 less 20%');
            }),
    },
    {
        Id: 'subscription-renewal.SR24',
        Name: 'SR24: the increase is the most specific level set, and a preview reports it',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);
                const preview = async () => (await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];

                let c = await preview();
                AssertEqual(c.IncreaseSource, 'None', 'nothing set: no increase');
                AssertEqual(Number(c.UnitPrice), 1200, 'no increase: the prior price');

                await upsertViaEntity(ctx, ORDER_COMPANY_POLICY_ENTITY, f.CoA.ID, { RenewalIncreasePercent: 3 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Company', 'the company default');
                AssertEqual(Number(c.UnitPrice), 1236, '1200 + 3%');

                // The product's category is Individual, under Memberships: set only the parent.
                const categories = await TxOne<{ CategoryID: string; ParentID: string }>(
                    ctx,
                    `SELECT c.ID AS CategoryID, c.ParentProductCategoryID AS ParentID
                     FROM ${ORDERS_SCHEMA}.Product p JOIN ${ORDERS_SCHEMA}.ProductCategory c ON c.ID = p.ProductCategoryID
                     WHERE p.ID = '${f.Products.SubRolling}'`,
                );
                Assert(categories.ParentID != null, 'precondition: the product category has a parent');
                await upsertViaEntity(ctx, PRODUCT_CATEGORY_ENTITY, categories.ParentID, { RenewalIncreasePercent: 4 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Category', 'the nearest category that sets one, up the chain');
                AssertEqual(Number(c.IncreasePercent), 4, 'the parent category');

                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { RenewalIncreasePercent: 5 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Product', 'the product over its category');
                AssertEqual(Number(c.UnitPrice), 1260, '1200 + 5%');

                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { RenewalIncreasePercent: 0 });
                c = await preview();
                AssertEqual(c.IncreaseSource, 'Subscription', 'the subscription over everything, 0 included');
                AssertEqual(Number(c.UnitPrice), 1200, 'a 0 on the subscription opts out of the defaults');

                const placed = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE RenewsSubscriptionID = '${SubscriptionID}'`);
                AssertEqual(placed.length, 0, 'a preview places nothing');
            }),
    },
    {
        Id: 'subscription-renewal.SR25',
        Name: 'SR25: a live renewal applies the increase and shows how the price was reached',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { RenewalIncreasePercent: 5 });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const orderID = out.Candidates[0].OrderID!;

                AssertEqual(Number((await renewalLine(ctx, orderID)).UnitPrice), 1260, '1200 + 5%');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1260, 'term 2 at the increased price');

                const notes = (await TxOne<{ Notes: string }>(ctx, `SELECT Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`)).Notes;
                Assert(/Unit price 1260\.00: prior price 1200\.00 \+ 5% annual increase \(product\)/.test(notes), `the notes show the price, got: ${notes}`);

                const event = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                const data = JSON.parse(event.EventData);
                AssertEqual(Number(data.BasePrice), 1200, 'event: base');
                AssertEqual(Number(data.IncreasePercent), 5, 'event: increase');
                AssertEqual(data.IncreaseSource, 'Product', 'event: where the increase came from');
                AssertEqual(Number(data.UnitPrice), 1260, 'event: price');
            }),
    },
    {
        Id: 'subscription-renewal.SR26',
        Name: 'SR26: a price typed below list lapses back to the prior list price',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.SubRolling, 1000);
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1000);

                // The line as a conversion from the previous system writes it: confirmed, typed below
                // list, with no concession on record. A booked line cannot be edited through the
                // application, so the row is written directly with the immutability trigger off.
                await TxQuery(ctx, `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);
                await TxQuery(
                    ctx,
                    `UPDATE ${ORDERS_SCHEMA}.OrderLine SET UnitPrice = 800, PriceOverridden = 1, PriceOverrideReason = 'converted'
                     WHERE OrderHeaderID = '${OrderID}'`,
                );
                await TxQuery(ctx, `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                AssertEqual(out.Candidates[0].BasePriceSource, 'PriorList', 'the typed price lapsed');
                AssertEqual(Number((await renewalLine(ctx, out.Candidates[0].OrderID!)).UnitPrice), 1000, 'back to list');
            }),
    },
    {
        Id: 'subscription-renewal.SR27',
        Name: 'SR27: a product with an Active successor renews as the successor',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                await CreateProductPrice(ctx, f.Products.SubCalendar, 1500);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubCalendar, { RenewalIncreasePercent: 5 });
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { SuccessorProductID: f.Products.SubCalendar });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message}`);
                const c = out.Candidates[0];
                Assert(SameID(c.RenewalProductID, f.Products.SubCalendar), 'the candidate names the successor');
                AssertEqual(c.BasePriceSource, 'SuccessorList', "the successor's list price");

                const line = await renewalLine(ctx, c.OrderID!);
                Assert(SameID(line.ProductID, f.Products.SubCalendar), 'the renewal line is the successor');
                AssertEqual(Number(line.UnitPrice), 1575, "the successor's 1500 list + its 5%");

                const sub = await TxOne<{ ProductID: string; SubscriptionTypeID: string; ProductTypeID: string }>(
                    ctx,
                    `SELECT s.ProductID, s.SubscriptionTypeID, p.SubscriptionTypeID AS ProductTypeID
                     FROM ${ORDERS_SCHEMA}.Subscription s JOIN ${ORDERS_SCHEMA}.Product p ON p.ID = '${f.Products.SubCalendar}'
                     WHERE s.ID = '${SubscriptionID}'`,
                );
                Assert(SameID(sub.ProductID, f.Products.SubCalendar), 'the subscription moved onto the successor');
                Assert(SameID(sub.SubscriptionTypeID, sub.ProductTypeID), "and onto the successor's subscription type");

                const terms = await termsOf(ctx, SubscriptionID);
                AssertEqual(terms.length, 2, 'the same subscription continues');
                AssertEqual(isoDate(terms[1].StartDate), '2027-01-01', 'contiguous with term 1');
            }),
    },
    {
        Id: 'subscription-renewal.SR28',
        Name: 'SR28: a successor that is not Active is not renewed onto',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubCalendar, { Status: 'Draft' });
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubRolling, { SuccessorProductID: f.Products.SubCalendar });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10), Preview: true });
                const c = out.Candidates[0];
                Assert(SameID(c.RenewalProductID, f.Products.SubRolling), 'renews on its own product');
                AssertEqual(c.BasePriceSource, 'PriorPrice', 'at the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR29',
        Name: "SR29: a renewal priced below today's list books without a concession hold",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                // The list rises past what the customer pays. The renewal keeps their price, which is
                // finance's rule, not a concession anyone typed.
                await CreateProductPrice(ctx, f.Products.SubRolling, 2000);

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `the renewal books: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const order = await TxOne<{ Status: string }>(ctx, `SELECT Status FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${out.Candidates[0].OrderID}'`);
                AssertEqual(order.Status, 'Confirmed', 'confirmed, not held');
                AssertEqual(Number((await renewalLine(ctx, out.Candidates[0].OrderID!)).UnitPrice), 1200, 'at the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR30',
        Name: 'SR30: a monthly term that crosses no anniversary renews with no increase',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubMonthly', 24);
                await upsertViaEntity(ctx, PRODUCT_ENTITY, f.Products.SubMonthly, { RenewalIncreasePercent: 5 });

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: isoDate(Term.EndDate), Preview: true });
                AssertEqual(out.Candidates.length, 1, `the monthly term is due: ${out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(Number(c.IncreasePercent), 0, 'February is not an anniversary');
                AssertEqual(Number(c.UnitPrice), 24, 'the prior price');
            }),
    },
    {
        Id: 'subscription-renewal.SR31',
        Name: 'SR31: a prorated 10-seat first term renews at 10 seats, not the prorated line quantity',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                // Mid-year on a Jan-1-anchored type, so the first term is prorated and the line's
                // stored quantity is 10 × ~0.5. The renewal used to take its quantity from there.
                const result = await ConfirmOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    OrderDate: new Date('2026-07-01T00:00:00Z'),
                    BillToOrganizationID: f.Customers.OrganizationID,
                    Lines: [{ ProductID: f.Products.SubCalendar, Quantity: 10, UnitPrice: 1200 }],
                });
                Assert(result.Saved, `confirm failed: ${result.Message}`);
                const term = await TxOne<{ SubscriptionID: string; EndDate: string; Quantity: number; IsProrated: boolean }>(
                    ctx,
                    `SELECT st.SubscriptionID, st.EndDate, st.Quantity, st.IsProrated
                     FROM ${ORDERS_SCHEMA}.SubscriptionTerm st
                     JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = st.OrderLineID
                     WHERE ol.OrderHeaderID = '${result.Order.ID}'`,
                );
                Assert(term.IsProrated, 'precondition: the first term is prorated');
                AssertEqual(Number(term.Quantity), 10, 'the first term records 10 seats');

                const out = await spawnRenewals(ctx, { SubscriptionID: term.SubscriptionID, AsOfDate: daysBefore(term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Message} ${out.Candidates[0]?.SkippedReason ?? ''}`);
                const line = await TxOne<{ Quantity: number }>(
                    ctx,
                    `SELECT Quantity FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${out.Candidates[0].OrderID}'`,
                );
                AssertEqual(Number(line.Quantity), 10, 'the renewal line buys 10 seats');
                const [, renewed] = await TxQuery<{ Quantity: number }>(
                    ctx,
                    `SELECT Quantity FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID = '${term.SubscriptionID}' ORDER BY TermNumber`,
                );
                AssertEqual(Number(renewed.Quantity), 10, 'term 2 records 10 seats');
            }),
    },
    // ─── Promotions that carry into renewals (#289) ─────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR32',
        Name: 'SR32: a promotion flagged AppliesToRenewals discounts the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const code = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, undefined, [code]);
                AssertEqual(await lineDiscount(ctx, OrderID), 240, 'precondition: 20% off at purchase');
                const asOf = daysBefore(Term.EndDate, 10);

                const preview = (await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];
                AssertEqual(JSON.stringify(preview.RenewalPromotionCodes), JSON.stringify([code]), 'the preview reports it carries');
                AssertEqual(preview.UnusableRenewalPromotionCodes?.length ?? 0, 0, 'the preview reports nothing unusable');

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(JSON.stringify(c.RenewalPromotionCodes), JSON.stringify([code]), 'the candidate reports it carried');
                AssertEqual(Number(c.UnitPrice), 1200, 'the renewal price is unchanged; the promotion is a discount on it');

                const orderID = c.OrderID!;
                const order = await TxOne<{ Status: string; Notes: string }>(
                    ctx,
                    `SELECT Status, Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
                );
                AssertEqual(order.Status, 'Confirmed', 'confirmed, not held for a concession');
                Assert(order.Notes.includes(`Promotion ${code} carried into this renewal.`), `the notes name it, got: ${order.Notes}`);

                const line = await renewalLine(ctx, orderID);
                AssertEqual(Number(line.UnitPrice), 1200, 'the line keeps the price the pass wrote');
                AssertEqual(await lineDiscount(ctx, orderID), 240, '20% of 1200 off the renewal');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 960, 'term 2 at the discounted price');

                const adjustments = await TxQuery<{ Code: string }>(
                    ctx,
                    `SELECT pc.Code FROM ${ORDERS_SCHEMA}.OrderAdjustment oa
                     JOIN ${ORDERS_SCHEMA}.PromotionCode pc ON pc.ID = oa.PromotionCodeID
                     WHERE oa.OrderHeaderID = '${orderID}'`,
                );
                AssertEqual(adjustments.length, 1, 'one adjustment, the confirm replacing the draft row rather than adding one');
                AssertEqual(adjustments[0].Code, code, 'recorded against the code');

                const event = await TxOne<{ EventData: string }>(
                    ctx,
                    `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                     WHERE SubscriptionID = '${SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                );
                const data = JSON.parse(event.EventData);
                AssertEqual(JSON.stringify(data.RenewalPromotionCodes), JSON.stringify([code]), 'event: the code carried');
            }),
    },
    {
        Id: 'subscription-renewal.SR33',
        Name: 'SR33: a promotion without AppliesToRenewals does not carry into the renewal',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const code = await renewalPromotion(ctx, { AppliesToRenewals: false });
                const { OrderID, SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200, undefined, [code]);
                AssertEqual(await lineDiscount(ctx, OrderID), 240, 'precondition: 20% off at purchase');

                const out = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
                AssertEqual(out.Placed, 1, `expected one renewal: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                const c = out.Candidates[0];
                AssertEqual(c.RenewalPromotionCodes, undefined, 'no code presented');
                AssertEqual(c.UnusableRenewalPromotionCodes, undefined, 'nothing to report');

                AssertEqual(await lineDiscount(ctx, c.OrderID!), 0, 'no discount on the renewal');
                AssertEqual(Number((await termsOf(ctx, SubscriptionID))[1].Amount), 1200, 'term 2 at full price');
                const adjustments = await TxQuery(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID = '${c.OrderID}'`);
                AssertEqual(adjustments.length, 0, 'no adjustment on the renewal');
            }),
    },
    {
        Id: 'subscription-renewal.SR34',
        Name: 'SR34: a flagged promotion that is paused or out of its dates is reported, and the renewal is at full price',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const paused = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const expired = await renewalPromotion(ctx, { AppliesToRenewals: true });
                const a = await buySubscription(ctx, 'SubRolling', 1200, undefined, [paused]);
                // Another holder: a second SubRolling purchase by the same one would extend a's subscription,
                // leaving a nothing to renew on the date this check asks about.
                const b = await buySubscription(ctx, 'SubRolling', 1200, undefined, [expired], Fx().Customers.SecondOrganizationID);
                AssertEqual(await lineDiscount(ctx, a.OrderID), 240, 'precondition: the paused one applied at purchase');
                AssertEqual(await lineDiscount(ctx, b.OrderID), 240, 'precondition: the expired one applied at purchase');

                // After the purchase: one promotion is paused, the other's window closes mid-term.
                await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, paused), { Status: 'Paused' });
                await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, expired), {
                    EffectiveTo: new Date('2026-06-30T00:00:00Z'),
                });

                for (const [sub, code] of [
                    [a, paused],
                    [b, expired],
                ] as const) {
                    const asOf = daysBefore(sub.Term.EndDate, 10);
                    const preview = (await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: asOf, Preview: true })).Candidates[0];
                    AssertEqual(preview.RenewalPromotionCodes?.length ?? 0, 0, `${code}: the preview says it does not carry`);
                    AssertEqual(preview.UnusableRenewalPromotionCodes?.[0]?.Code, code, `${code}: the preview reports it unusable`);

                    const out = await spawnRenewals(ctx, { SubscriptionID: sub.SubscriptionID, AsOfDate: asOf });
                    AssertEqual(out.Placed, 1, `${code}: the renewal is still placed: ${out.Candidates[0]?.SkippedReason ?? out.Message}`);
                    const c = out.Candidates[0];
                    AssertEqual(c.RenewalPromotionCodes?.length ?? 0, 0, `${code}: nothing carried`);
                    const unusable = c.UnusableRenewalPromotionCodes ?? [];
                    AssertEqual(unusable.length, 1, `${code}: one code reported`);
                    AssertEqual(unusable[0].Code, code, `${code}: the code is named`);
                    AssertEqual(unusable[0].Reason, 'the promotion is not currently running', `${code}: with the engine's reason`);

                    AssertEqual(await lineDiscount(ctx, c.OrderID!), 0, `${code}: no discount`);
                    AssertEqual(Number((await termsOf(ctx, sub.SubscriptionID))[1].Amount), 1200, `${code}: term 2 at full price`);

                    const notes = (await TxOne<{ Notes: string }>(ctx, `SELECT Notes FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${c.OrderID}'`)).Notes;
                    Assert(notes.includes(`Promotion ${code} not applied: the promotion is not currently running.`), `${code}: the notes say why, got: ${notes}`);
                    const event = await TxOne<{ EventData: string }>(
                        ctx,
                        `SELECT EventData FROM ${ORDERS_SCHEMA}.SubscriptionEvent
                         WHERE SubscriptionID = '${sub.SubscriptionID}' AND EventType = 'RenewalOrderSpawned'`,
                    );
                    AssertEqual(JSON.parse(event.EventData).UnusableRenewalPromotionCodes?.[0]?.Code, code, `${code}: the event logs it`);
                }
            }),
    },
    // ─── Charging the renewal card (#289) ──────────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR35',
        Name: 'SR35: a renewal-card subscription renews due on the term start, and booking calls no gateway',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                const rows = await TxQuery<{ DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${OrderID}'`,
                );
                AssertEqual(rows.length, 1, 'one schedule row');
                AssertEqual(rows[0].DueDate, TermStart, 'due on the term start, the day the card is first charged');
                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 0, 'placing the renewal opened no intent');
                Assert(SubscriptionID.length > 0, 'precondition: a subscription');
            }),
    },
    {
        Id: 'subscription-renewal.SR36',
        Name: 'SR36: the renewal card is charged on the term start and captured against the order on the gateway day',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');

                const early = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, 1) });
                AssertEqual(early.Charged, 0, `nothing is charged before the term start: ${early.Message}`);
                AssertEqual((await intentsOf(ctx, OrderID)).length, 0, 'and no intent was opened');

                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                AssertEqual(out.Charged, 1, `one renewal paid: ${out.Message} ${JSON.stringify(out.Attempts)}`);
                const attempt = out.Attempts.find((a) => SameID(a.OrderID, OrderID));
                AssertEqual(attempt?.Outcome, 'Charged', 'the renewal order was charged');
                AssertEqual(attempt?.Attempt, 1, 'as attempt 1');

                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 1, 'one intent');
                AssertEqual(intents[0].Status, 'Succeeded', 'that the gateway took');
                const payments = await paymentsFor(ctx, OrderID);
                AssertEqual(payments.length, 1, 'one payment');
                AssertEqual(payments[0].Status, 'Captured', 'captured');
                AssertEqual(Number(payments[0].Amount), 1200, 'for the renewal');
                Assert(SameID(payments[0].PaymentIntentID, intents[0].ID), 'linked to the intent');
                // The stub took the money now, so the gateway's business day is today, not the run's
                // as-of day: the payment is dated when the money moved.
                AssertEqual(payments[0].PaymentDate, Today(), 'dated the gateway business day, not the as-of day');
                Assert(payments[0].PaymentDate !== TermStart, 'the check needs the two days apart');

                const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${OrderID}'`);
                AssertEqual(Number(order.Balance), 0, 'the renewal order is paid');

                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events.length, 1, 'one charge event');
                AssertEqual(events[0].EventType, 'PaymentSucceeded', 'a success');
                Assert(SameID(events[0].RelatedPaymentID, payments[0].ID), 'naming the payment');
                const data = JSON.parse(events[0].EventData) as { Attempt: number; AttemptDay: string };
                AssertEqual(data.Attempt, 1, 'attempt 1');
                AssertEqual(data.AttemptDay, TermStart, 'attempted on the term start');
            }),
    },
    {
        Id: 'subscription-renewal.SR37',
        Name: 'SR37: running the charge pass twice in a day charges once',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const paid = await renewWithCard(ctx, 'pm_card_visa');
                await chargeRenewals(ctx, { SubscriptionID: paid.SubscriptionID, AsOfDate: paid.TermStart });
                const again = await chargeRenewals(ctx, { SubscriptionID: paid.SubscriptionID, AsOfDate: paid.TermStart });
                AssertEqual(again.Charged, 0, `the second pass charges nothing: ${again.Message}`);
                AssertEqual((await intentsOf(ctx, paid.OrderID)).length, 1, 'still one intent');
                AssertEqual((await paymentsFor(ctx, paid.OrderID)).length, 1, 'still one payment');

                const declined = await renewWithCard(ctx, 'pm_card_chargeDeclined', { organizationID: Fx().Customers.SecondOrganizationID });
                const first = await chargeRenewals(ctx, { SubscriptionID: declined.SubscriptionID, AsOfDate: declined.TermStart });
                AssertEqual(first.Failed, 1, `the first pass is declined: ${first.Message}`);
                const second = await chargeRenewals(ctx, { SubscriptionID: declined.SubscriptionID, AsOfDate: declined.TermStart });
                AssertEqual(second.Failed, 0, 'the second pass does not try again');
                const skip = second.Attempts.find((a) => SameID(a.OrderID, declined.OrderID));
                AssertEqual(skip?.Outcome, 'Skipped', 'it is skipped');
                Assert(/already attempted/.test(skip?.Reason ?? ''), `because the day was attempted: ${skip?.Reason}`);
                AssertEqual((await intentsOf(ctx, declined.OrderID)).length, 1, 'one intent for the day');
                AssertEqual((await chargeEventsOf(ctx, declined.OrderID)).length, 1, 'one failure event for the day');
            }),
    },
    {
        Id: 'subscription-renewal.SR38',
        Name: 'SR38: a declined renewal card is retried on days 3, 7 and 11 and then stops',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                const attempted: number[] = [];
                for (let offset = 0; offset <= 15; offset++) {
                    const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, -offset) });
                    AssertEqual(out.Charged, 0, `day ${offset}: nothing is paid`);
                    if (out.Failed > 0) attempted.push(offset);
                }
                AssertEqual(attempted.join(','), '0,3,7,11', 'tried on the due day and days 3, 7 and 11 only');

                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 4, 'each attempt its own intent');
                Assert(intents.every((i) => i.Status === 'Failed'), `all Failed: ${JSON.stringify(intents)}`);
                AssertEqual(new Set(intents.map((i) => i.ProviderIntentID)).size, 4, 'with four gateway ids');

                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events.length, 4, 'one PaymentFailed per attempt');
                const data = events.map((e) => ({ type: e.EventType, ...(JSON.parse(e.EventData) as { Attempt: number; NextAttemptDay: string | null; Reason: string; FailureCode: string }) }));
                Assert(data.every((d) => d.type === 'PaymentFailed'), 'all failures');
                AssertEqual(data.map((d) => d.Attempt).join(','), '1,2,3,4', 'numbered 1 to 4');
                AssertEqual(
                    data.map((d) => d.NextAttemptDay ?? 'none').join(','),
                    [3, 7, 11].map((n) => daysBefore(TermStart, -n)).join(',') + ',none',
                    'each naming the next attempt day, and the last naming none',
                );
                Assert(data.every((d) => d.FailureCode === 'card_declined' && !!d.Reason), 'with the gateway reason');
                AssertEqual((await paymentsFor(ctx, OrderID)).length, 0, 'and no payment');
            }),
    },
    {
        Id: 'subscription-renewal.SR39',
        Name: 'SR39: an authentication demand on the off-session charge is a failed attempt',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_authenticationRequired');
                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                AssertEqual(out.Failed, 1, `the attempt failed: ${out.Message}`);
                AssertEqual(out.Attempts.find((a) => SameID(a.OrderID, OrderID))?.Outcome, 'AuthenticationRequired', 'as an authentication demand');
                const intents = await intentsOf(ctx, OrderID);
                AssertEqual(intents.length, 1, 'one intent');
                AssertEqual(intents[0].Status, 'Failed', 'recorded Failed');
                const events = await chargeEventsOf(ctx, OrderID);
                AssertEqual(events[0].EventType, 'PaymentFailed', 'a PaymentFailed event');
                const data = JSON.parse(events[0].EventData) as { AuthenticationRequired: boolean; NextAttemptDay: string };
                AssertEqual(data.AuthenticationRequired, true, 'marked as needing authentication');
                AssertEqual(data.NextAttemptDay, daysBefore(TermStart, -3), 'with the next attempt day');
            }),
    },
    {
        Id: 'subscription-renewal.SR40',
        Name: 'SR40: a subscription without a renewal card keeps the invoice-day due date and is never charged',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, Term } = await buySubscription(ctx, 'SubRolling', 1200);
                const asOf = daysBefore(Term.EndDate, 10);
                const placed = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: asOf });
                AssertEqual(placed.Placed, 1, `renewed: ${placed.Message}`);
                const orderID = placed.Candidates[0].OrderID!;
                const row = await TxOne<{ DueDate: string }>(
                    ctx,
                    `SELECT CONVERT(varchar(10), DueDate, 23) AS DueDate FROM ${ORDERS_SCHEMA}.OrderHeaderPaymentSchedule WHERE OrderHeaderID = '${orderID}'`,
                );
                Assert(row.DueDate < daysBefore(Term.EndDate, -1), `due before the term start, on the invoice-day rule: ${row.DueDate}`);

                const out = await chargeRenewals(ctx, { SubscriptionID, AsOfDate: row.DueDate });
                AssertEqual(out.Considered, 0, `an invoice-only renewal is not a candidate: ${out.Message}`);
                AssertEqual((await intentsOf(ctx, orderID)).length, 0, 'and no intent is opened');
            }),
    },
    {
        Id: 'subscription-renewal.SR41',
        Name: 'SR41: the charge Action previews from the string "true" and charges on "false"',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                const preview = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'true' });
                Assert(preview.Success, `the preview ran: ${preview.Message}`);
                AssertEqual(preview.ResultCode, 'PREVIEWED', 'reported as a preview');
                AssertEqual(preview.Attempts.find((a) => SameID(a.OrderID, OrderID))?.Outcome, 'WouldCharge', 'listing the order it would charge');
                AssertEqual((await intentsOf(ctx, OrderID)).length, 0, 'and charging nothing');

                const live = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'false' });
                AssertEqual(live.Charged, 1, `"false" charges: ${live.Message}`);
                AssertEqual((await paymentsFor(ctx, OrderID)).length, 1, 'one payment');
            }),
    },
    {
        Id: 'subscription-renewal.SR42',
        Name: 'SR42: the charge schedule points at its Action, and ships disabled and set to preview',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const action = await TxMaybeOne<{ ID: string; DriverClass: string; Status: string }>(
                    ctx,
                    `SELECT ID, DriverClass, Status FROM __mj.Action WHERE Name = 'Charge Renewals'`,
                );
                Assert(action != null, 'the action row exists — push the app metadata if not');
                AssertEqual(action!.Status, 'Active', 'and it is active');
                AssertEqual(action!.DriverClass, CHARGE_ACTION_DRIVER_CLASS, 'pointing at the registered key');

                const job = await TxMaybeOne<{ Configuration: string; Status: string }>(
                    ctx,
                    `SELECT Configuration, Status FROM __mj.ScheduledJob WHERE Name = N'Orders — Charge Renewals (daily)'`,
                );
                Assert(job != null, 'the scheduled job row exists — push the app metadata if not');
                const config = JSON.parse(job!.Configuration ?? '{}') as { ActionID?: string; Params?: Array<{ ActionParamID: string; Value: string }> };
                Assert(config.ActionID != null && SameID(config.ActionID, action!.ID), `the job names this action: ${job!.Configuration}`);
                // Shipping it live would start charging cards on whatever day this metadata reached a host.
                AssertEqual(job!.Status, 'Disabled', 'and it ships disabled');
                const previewParam = await TxMaybeOne<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM __mj.ActionParam WHERE ActionID = '${action!.ID}' AND Name = 'Preview'`,
                );
                Assert(previewParam != null, 'the Preview parameter is declared');
                const configured = config.Params?.find((p) => SameID(p.ActionParamID, previewParam!.ID));
                AssertEqual(String(configured?.Value), 'true', `and the job is configured for preview: ${job!.Configuration}`);
            }),
    },
    {
        Id: 'subscription-renewal.SR43',
        Name: 'SR43: a later settled-payment webhook for the charged intent books nothing more',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_visa');
                await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                const [intent] = await intentsOf(ctx, OrderID);
                Assert(intent != null, 'precondition: the charge opened an intent');

                // A card driver does not settle late, so `payment_intent.succeeded` stamps the intent
                // and then asks the checkout to book its payment. This is that second step, which is
                // the only one that could book money: it must find no checkout behind the intent.
                const booked = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded(intent.ID, ctx.User);
                AssertEqual(booked.Attempted, false, 'the webhook path does not try to book the renewal charge');
                await chargeRenewals(ctx, { SubscriptionID, AsOfDate: TermStart });
                const payments = await TxQuery<{ ID: string }>(
                    ctx,
                    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE PaymentIntentID = '${intent.ID}'`,
                );
                AssertEqual(payments.length, 1, 'one payment for the intent');
            }),
    },
    {
        Id: 'subscription-renewal.SR44',
        Name: "SR44: one renewal order's fault does not stop the charge pass",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const broken = await renewWithCard(ctx, 'pm_card_visa', { inactiveProvider: true });
                const healthy = await renewWithCard(ctx, 'pm_card_visa', { organizationID: Fx().Customers.SecondOrganizationID });
                const out = await chargeRenewals(ctx, { AsOfDate: healthy.TermStart });
                const failed = out.Attempts.find((a) => SameID(a.OrderID, broken.OrderID));
                const charged = out.Attempts.find((a) => SameID(a.OrderID, healthy.OrderID));
                AssertEqual(failed?.Outcome, 'Error', `the order on an inactive provider fails: ${JSON.stringify(failed)}`);
                Assert(out.Failures.some((f) => SameID(f.OrderID, broken.OrderID)), 'and is reported');
                AssertEqual(charged?.Outcome, 'Charged', `the next order is still charged: ${JSON.stringify(charged)}`);
                AssertEqual(out.Success, false, 'the pass reports the failure');
                AssertEqual((await chargeEventsOf(ctx, broken.OrderID)).length, 0, 'a fault is not logged as a declined card');
            }),
    },

    // ─── The update-card link (#289) ──────────────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR45',
        Name: "SR45: an order's first failed charge sends the update-card link, and its second does not",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    // A bill-to person with an e-mail address: the link goes to them.
                    const { SubscriptionID, OrderID, TermStart } = await renewWithCard(ctx, 'pm_card_chargeDeclined', {
                        billToPersonID: Fx().Customers.PersonID,
                    });
                    const first = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: TermStart, Preview: 'false' });
                    AssertEqual(first.Failed, 1, `the first charge failed: ${first.Message}`);
                    const a1 = first.Attempts.find((a) => SameID(a.OrderID, OrderID));
                    AssertEqual(a1?.FirstFailure, true, 'it is the first failure');
                    Assert(typeof a1?.PaymentLinkSent === 'boolean', `a send was attempted: ${JSON.stringify(a1)}`);
                    // The suite's database has no mail provider, so the send itself may fail; everything
                    // before it — the secret, the link address, the recipient and both templates — must not.
                    Assert(
                        a1?.PaymentLinkSent === true || !/secret|RenewalPaymentLinkBaseUrl|templates are not installed|no bill-to person|did not render/.test(a1?.PaymentLinkReason ?? ''),
                        `the link was built and rendered: ${a1?.PaymentLinkReason}`,
                    );

                    const second = await chargeRenewalsViaAction(ctx, { SubscriptionID, AsOfDate: daysBefore(TermStart, -3), Preview: 'false' });
                    AssertEqual(second.Failed, 1, 'the retry failed too');
                    const a2 = second.Attempts.find((a) => SameID(a.OrderID, OrderID));
                    Assert(!a2?.FirstFailure, 'the retry is not a first failure');
                    AssertEqual(a2?.PaymentLinkSent, undefined, 'and sends no second link');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR46',
        Name: 'SR46: the update-card link pays the open renewal order, with no new order',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const orders = async () => Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.OrderHeader`)).N);
                    const before = await orders();

                    const key = `it-renew-${r.OrderID.slice(0, 8)}`;
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    AssertEqual(init.RenewalPayment?.Amount, 1200, 'for the open balance');
                    const sessionID = init.SessionID!;

                    const intent = await CheckoutSessionService.OpenPaymentIntentForSession(sessionID, key, ctx.User);
                    Assert(intent.Success, `an intent opens: ${intent.ErrorMessage}`);
                    AssertEqual(intent.Amount, 1200, 'for the balance');
                    await settleSessionIntent(ctx, sessionID);

                    const done = await CheckoutSessionService.CompleteCheckout(sessionID, key, ctx.User);
                    Assert(done.Success, `the payment completes: ${done.ErrorMessage}`);
                    Assert(SameID(done.OrderID, r.OrderID), 'on the renewal order');
                    AssertEqual(await orders(), before, 'and no order was created');

                    const order = await TxOne<{ Balance: number }>(ctx, `SELECT Balance FROM ${ORDERS_SCHEMA}.vwOrderHeaders WHERE ID = '${r.OrderID}'`);
                    AssertEqual(Number(order.Balance), 0, 'the renewal is paid');
                    const payments = await paymentsFor(ctx, r.OrderID);
                    AssertEqual(payments.length, 1, 'by one payment');
                    AssertEqual(payments[0].Status, 'Captured', 'captured through the ordinary path');
                    const session = await TxOne<{ Status: string; DraftOrderID: string }>(ctx, `SELECT Status, DraftOrderID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
                    AssertEqual(session.Status, 'Confirmed', 'the session is confirmed');
                    Assert(SameID(session.DraftOrderID, r.OrderID), 'on the renewal order');

                    const later = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -3) });
                    AssertEqual(later.Considered, 0, 'the paid renewal is no longer charged');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR47',
        Name: 'SR47: the update-card link is refused once the renewal is paid, and when tampered with',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_visa');
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const token = await linkToken(r.OrderID, r.SubscriptionID);

                    const [payload, signature] = token.split('.');
                    const tampered = `${payload}.${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
                    const forged = await CheckoutSessionService.InitializeRenewalPaymentSession(tampered, 'it-renew-forged', ctx.User);
                    AssertEqual(forged.Success, false, 'a tampered link opens nothing');
                    AssertEqual(forged.ErrorMessage, 'This payment link is not valid.', 'and says only that it is not valid');

                    await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart });
                    const paid = await CheckoutSessionService.InitializeRenewalPaymentSession(token, 'it-renew-paid', ctx.User);
                    AssertEqual(paid.Success, false, 'a paid renewal opens nothing');
                    AssertEqual(paid.ErrorMessage, 'This renewal is already paid.', 'and says so');
                }),
            ),
    },
    {
        Id: 'subscription-renewal.SR48',
        Name: 'SR48: a pay-renewal session cannot be drafted, so the renewal is never re-priced',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () =>
                withRenewalLinks(async () => {
                    const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                    await soldThroughCheckout(ctx, r.SourceOrderID, r.ProviderID);
                    const key = 'it-renew-draft';
                    const init = await CheckoutSessionService.InitializeRenewalPaymentSession(await linkToken(r.OrderID, r.SubscriptionID), key, ctx.User);
                    Assert(init.Success, `the link opens a session: ${init.ErrorMessage}`);
                    const draft = await CheckoutSessionService.UpdateDraft(
                        init.SessionID!,
                        key,
                        'buyer@example.com',
                        [{ ProductID: Fx().Products.SubRolling, Quantity: 3 }],
                        { Country: 'US', StateProvince: 'IL', PostalCode: '60601' },
                        ctx.User,
                    );
                    AssertEqual(draft.Success, false, 'the draft is refused');
                    const line = await renewalLine(ctx, r.OrderID);
                    AssertEqual(Number(line.UnitPrice), 1200, 'and the renewal keeps its price');
                }),
            ),
    },

    // ─── Edge cases of the charge pass (#683) ─────────────────────────────────────────────────
    {
        Id: 'subscription-renewal.SR49',
        Name: 'SR49: money taken but not booked is booked after the last retry day, with automatic renewal off',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const r = await renewWithCard(ctx, 'pm_card_visa');
                // The gateway took the money and the capture never booked it.
                await createViaEntity(ctx, PAYMENT_INTENT_ENTITY, {
                    PaymentProviderID: r.ProviderID,
                    ProviderIntentID: `pi_it_unbooked_${r.OrderID.slice(0, 8)}`,
                    Status: 'Succeeded',
                    Amount: 1200,
                    OrderHeaderID: r.OrderID,
                });
                await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, r.SubscriptionID, { AutoRenew: false });

                const out = await chargeRenewals(ctx, { SubscriptionID: r.SubscriptionID, AsOfDate: daysBefore(r.TermStart, -20) });
                const attempt = out.Attempts.find((a) => SameID(a.OrderID, r.OrderID));
                AssertEqual(attempt?.Outcome, 'Captured', `day 20, automatic renewal off: the money is booked: ${JSON.stringify(attempt)}`);
                AssertEqual((await intentsOf(ctx, r.OrderID)).length, 1, 'and the card is not charged again');
                const payments = await paymentsFor(ctx, r.OrderID);
                AssertEqual(payments.length, 1, 'one payment');
                AssertEqual(Number(payments[0].Amount), 1200, 'for the renewal');
            }),
    },
    {
        Id: 'subscription-renewal.SR50',
        Name: 'SR50: the update-card link waits until the failed charge is recorded, so a rerun never sends it twice',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const r = await renewWithCard(ctx, 'pm_card_chargeDeclined');
                const sent: string[] = [];
                const hooks = {
                    OnFirstFailure: async (a: { OrderID: string }) => {
                        sent.push(a.OrderID);
                        return { Sent: true };
                    },
                };
                // The failure event cannot be saved. Rolled back with the check.
                await TxQuery(
                    ctx,
                    `ALTER TABLE ${ORDERS_SCHEMA}.SubscriptionEvent WITH NOCHECK ADD CONSTRAINT CK_IT_SR50_NoPaymentFailed CHECK (EventType <> 'PaymentFailed')`,
                );
                const first = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                const a1 = first.Attempts.find((a) => SameID(a.OrderID, r.OrderID));
                AssertEqual(a1?.Outcome, 'Declined', `the card was declined: ${JSON.stringify(a1)}`);
                AssertEqual(sent.length, 0, 'no link while the failure is unrecorded');
                AssertEqual(a1?.PaymentLinkSent, false, 'reported as not sent');
                Assert(first.Failures.some((f) => SameID(f.OrderID, r.OrderID)), 'and the run reports the order');

                await TxQuery(ctx, `ALTER TABLE ${ORDERS_SCHEMA}.SubscriptionEvent DROP CONSTRAINT CK_IT_SR50_NoPaymentFailed`);
                const rerun = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                AssertEqual(rerun.Attempts.find((a) => SameID(a.OrderID, r.OrderID))?.Outcome, 'Declined', 'the rerun records the decline');
                AssertEqual(sent.length, 1, 'and sends the link once');

                const third = await ChargeRenewals({ SubscriptionID: r.SubscriptionID, AsOfDate: r.TermStart }, ctx.Provider, ctx.User, hooks);
                AssertEqual(third.Attempts.find((a) => SameID(a.OrderID, r.OrderID))?.Outcome, 'Skipped', 'a third run that day skips the order');
                AssertEqual(sent.length, 1, 'and sends nothing');
            }),
    },

];

/** A 20%-off promotion and its code, with `AppliesToRenewals` as given; returns the code. */
async function renewalPromotion(ctx: IntegrationCheckContext, opts: { AppliesToRenewals: boolean }): Promise<string> {
    const code = await CreatePromotion(ctx, { Value: 0.2 });
    await upsertViaEntity(ctx, PROMOTION_ENTITY, await promotionIDFor(ctx, code), { AppliesToRenewals: opts.AppliesToRenewals });
    return code;
}

/** The promotion a code belongs to. */
async function promotionIDFor(ctx: IntegrationCheckContext, code: string): Promise<string> {
    const row = await TxOne<{ PromotionID: string }>(
        ctx,
        `SELECT PromotionID FROM ${ORDERS_SCHEMA}.PromotionCode WHERE Code = '${code.replace(/[^A-Za-z0-9-]/g, '')}'`,
    );
    return row.PromotionID;
}

/** The total discount amount stamped on an order's lines. */
async function lineDiscount(ctx: IntegrationCheckContext, orderID: string): Promise<number> {
    const row = await TxOne<{ Discount: number }>(
        ctx,
        `SELECT ISNULL(SUM(DiscountAmount), 0) AS Discount FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}'`,
    );
    return Number(row.Discount);
}

/** Give the fixture's selling company a default terms row by code (rolled back with the check). */
async function setCompanyDefaultTerms(ctx: IntegrationCheckContext, code: string): Promise<void> {
    const companyID = Fx().CoA.ID;
    await TxQuery(
        ctx,
        `DECLARE @t UNIQUEIDENTIFIER = (SELECT ID FROM ${ORDERS_SCHEMA}.PaymentTermsType WHERE Code = '${code}');
         IF EXISTS (SELECT 1 FROM ${ORDERS_SCHEMA}.OrderCompanyPolicy WHERE ID = '${companyID}')
           UPDATE ${ORDERS_SCHEMA}.OrderCompanyPolicy SET DefaultPaymentTermsTypeID = @t WHERE ID = '${companyID}';
         ELSE
           INSERT INTO ${ORDERS_SCHEMA}.OrderCompanyPolicy (ID, DefaultPaymentTermsTypeID) VALUES ('${companyID}', @t);`,
    );
}

/**
 * Run `body` with a product recognised at sale. Through the object model with the catalog engine
 * reloaded, because booking reads products from `OrdersEngine`'s cache; put back the same way
 * before the transaction rolls back, or the cache would carry it into the next check.
 */
async function withUpFrontRecognition<T>(ctx: IntegrationCheckContext, productID: string, body: () => Promise<T>): Promise<T> {
    const was = await TxOne<{ RevenueRecognitionTypeID: string | null }>(
        ctx,
        `SELECT RevenueRecognitionTypeID FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${productID}'`,
    );
    const upFront = Fx().RevRecTypeIDs.get('UpFront');
    Assert(upFront != null, "RevRec type 'UpFront' missing from the fixture");
    await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: upFront });
    await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        await upsertViaEntity(ctx, PRODUCT_ENTITY, productID, { RevenueRecognitionTypeID: was.RevenueRecognitionTypeID });
        await OrdersEngine.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** Run `body` with the selling company's Unbilled Receivable link disabled, restored the same way. */
async function withUnbilledUnlinked<T>(ctx: IntegrationCheckContext, body: () => Promise<T>): Promise<T> {
    const links = await TxQuery<{ ID: string }>(
        ctx,
        `SELECT l.ID FROM ${ACCT_SCHEMA}.GLAccountLink l
         JOIN ${ACCT_SCHEMA}.GLAccountRole r ON r.ID = l.GLAccountRoleID
         JOIN ${ACCT_SCHEMA}.GLAccount a ON a.ID = l.GLAccountID
         WHERE r.Name = 'Unbilled Receivable' AND a.CompanyID = '${Fx().CoA.ID}' AND l.Status = 'Active'`,
    );
    Assert(links.length > 0, 'precondition: the fixture links an Unbilled Receivable account');
    for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Disabled' });
    await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    try {
        return await body();
    } finally {
        for (const l of links) await upsertViaEntity(ctx, GL_ACCOUNT_LINK_ENTITY, l.ID, { Status: 'Active' });
        await AccountingEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
    }
}

/** The GL lines of every journal entry `entryIDsSql` selects. */
const ledgerOf = (ctx: IntegrationCheckContext, entryIDsSql: string) =>
    TxQuery<{ Code: string; DebitAmount: number; CreditAmount: number }>(
        ctx,
        `SELECT gl.Code, jel.DebitAmount, jel.CreditAmount
         FROM ${ACCT_SCHEMA}.JournalEntryLine jel
         JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
         WHERE jel.JournalEntryID IN (${entryIDsSql})`,
    );

/** Debits less credits on one account. */
const netOn = (lines: Array<{ Code: string; DebitAmount: number; CreditAmount: number }>, code: string): number =>
    Math.round(
        lines.filter((l) => l.Code === code).reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0) * 100,
    ) / 100;


// ─── Renewal-card charging helpers (#289) ─────────────────────────────────────────────────────

/** The key both the charge Action metadata and its `@RegisterClass` decorator name. */
const CHARGE_ACTION_DRIVER_CLASS = 'Orders.ChargeRenewals';

/** A Stripe account in stub mode (`IsLiveMode = 0`), created with its type if the metadata has not seeded it. */
async function stubStripeProvider(ctx: IntegrationCheckContext, active = true): Promise<string> {
    const existingType = await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = 'Stripe'`);
    const typeID =
        existingType?.ID ??
        (await createViaEntity(ctx, PAYMENT_PROVIDER_TYPE_ENTITY, {
            Code: 'Stripe',
            Name: 'IT Stripe',
            DriverClass: 'StripePaymentProvider',
            SupportsTokenization: 1,
            SupportsRefund: 1,
            SupportsWebhooks: 1,
            Sequence: 90,
            IsActive: 1,
        }));
    return createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
        PaymentProviderTypeID: typeID,
        CompanyID: Fx().CoA.ID,
        Name: `IT Stripe renewal${active ? '' : ' (inactive)'}`,
        CredentialsRef: null,
        IsLiveMode: 0,
        IsActive: active ? 1 : 0,
    });
}

/**
 * Buy an annual subscription, give it a renewal card (a wallet entry the customer organization owns,
 * as checkout writes one) and spawn its renewal. `instrumentRef` is one of Stripe's test card names,
 * which the stub answers the way test mode does.
 */
async function renewWithCard(
    ctx: IntegrationCheckContext,
    instrumentRef: string,
    opts: { inactiveProvider?: boolean; organizationID?: string; billToPersonID?: string } = {},
): Promise<{ SubscriptionID: string; OrderID: string; TermStart: string; SourceOrderID: string; ProviderID: string }> {
    const f = Fx();
    // A second subscription in one check needs a second holder: AnnualRolling is ExtendExisting, so the
    // same holder buying again extends the first subscription instead of starting another.
    const holder = opts.organizationID ?? f.Customers.OrganizationID;
    const { SubscriptionID, Term, OrderID: SourceOrderID } = await buySubscription(ctx, 'SubRolling', 1200, undefined, undefined, holder, opts.billToPersonID);
    const providerID = await stubStripeProvider(ctx, !opts.inactiveProvider);
    const tenderID = f.PaymentTypeIDs.get('CreditCard');
    Assert(tenderID != null, 'precondition: a CreditCard payment type');
    // The card is the wallet's embedded Payment Detail, written through the wallet as checkout writes it
    // (D38/D39): a new wallet holds a new, empty detail, and the wallet's save persists it first.
    const wallet = await ctx.Provider.GetEntityObject<CustomerPaymentMethodEntity>(CUSTOMER_PAYMENT_METHOD_ENTITY, ctx.User);
    wallet.NewRecord();
    wallet.OwnerOrganizationID = holder;
    wallet.IsDefault = true;
    wallet.IsActive = true;
    const detail = wallet.PaymentDetailID_Object;
    detail.CompanyID = f.CoA.ID;
    detail.PaymentTypeID = tenderID!;
    detail.PaymentProviderID = providerID;
    detail.ProviderCustomerRef = 'cus_it_renewal';
    detail.ProviderInstrumentRef = instrumentRef;
    detail.Brand = 'visa';
    detail.Last4 = '4242';
    Assert(await wallet.Save(), `the renewal card is filed: ${wallet.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    const walletID = wallet.ID;
    await upsertViaEntity(ctx, SUBSCRIPTION_ENTITY, SubscriptionID, { DefaultCustomerPaymentMethodID: walletID });

    const placed = await spawnRenewals(ctx, { SubscriptionID, AsOfDate: daysBefore(Term.EndDate, 10) });
    AssertEqual(placed.Placed, 1, `the renewal is placed: ${placed.Message}`);
    return { SubscriptionID, OrderID: placed.Candidates[0].OrderID!, TermStart: isoDate(daysBefore(Term.EndDate, -1)), SourceOrderID, ProviderID: providerID };
}

/** `ChargeRenewals` as the Action calls it. */
async function chargeRenewals(ctx: IntegrationCheckContext, input: { SubscriptionID?: string; AsOfDate: string; Preview?: boolean }): Promise<ChargeRenewalsOutput> {
    return ChargeRenewals(input, ctx.Provider, ctx.User);
}

/** The charge Action, resolved and run the way the scheduler does: every parameter a string. */
async function chargeRenewalsViaAction(
    ctx: IntegrationCheckContext,
    inputs: Record<string, string>,
): Promise<{ Success: boolean; ResultCode?: string; Message?: string; Charged: number; Failed: number; Attempts: ChargeRenewalsOutput['Attempts'] }> {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAction>(BaseAction, CHARGE_ACTION_DRIVER_CLASS);
    Assert(resolved.Resolved && resolved.Instance != null, `'${CHARGE_ACTION_DRIVER_CLASS}' is not registered — the Load anchor is missing`);
    const params = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' as const })),
        Filters: [],
    } as unknown as RunActionParams;
    const result = await resolved.Instance!.Run(params);
    const output = <T,>(name: string): T | undefined =>
        params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value as T | undefined;
    return {
        Success: result.Success,
        ResultCode: result.ResultCode,
        Message: result.Message,
        Charged: Number(output<number>('Charged') ?? 0),
        Failed: Number(output<number>('Failed') ?? 0),
        Attempts: output<ChargeRenewalsOutput['Attempts']>('Attempts') ?? [],
    };
}

/** The intents opened against an order, oldest first. */
const intentsOf = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; Status: string; ProviderIntentID: string }>(
        ctx,
        `SELECT ID, Status, ProviderIntentID FROM ${ORDERS_SCHEMA}.PaymentIntent WHERE OrderHeaderID = '${orderID}' ORDER BY __mj_CreatedAt`,
    );

/** The payments allocated to an order. */
const paymentsFor = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ ID: string; Status: string; Amount: number; PaymentIntentID: string; PaymentDate: string }>(
        ctx,
        `SELECT DISTINCT ph.ID, ph.Status, ph.Amount, ph.PaymentIntentID, CONVERT(varchar(10), ph.PaymentDate, 23) AS PaymentDate
         FROM ${ORDERS_SCHEMA}.PaymentHeader ph
         JOIN ${ORDERS_SCHEMA}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
         WHERE pl.OrderHeaderID = '${orderID}'`,
    );

/** The charge pass's PaymentSucceeded / PaymentFailed events on an order, oldest first. */
const chargeEventsOf = (ctx: IntegrationCheckContext, orderID: string) =>
    TxQuery<{ EventType: string; EventData: string; RelatedPaymentID: string | null }>(
        ctx,
        `SELECT EventType, EventData, RelatedPaymentID FROM ${ORDERS_SCHEMA}.SubscriptionEvent
         WHERE RelatedOrderHeaderID = '${orderID}' AND EventType IN ('PaymentSucceeded','PaymentFailed')
         ORDER BY __mj_CreatedAt, ID`,
    );


// ─── Update-card link helpers (#289) ──────────────────────────────────────────────────────────

/** A secret for the checks only: links are signed and checked with it while a check runs. */
const TEST_LINK_SECRET = 'integration-check-renewal-link-secret-0123456789';

/** Run `body` with renewal links switched on (a secret and a link address), and off again after. */
async function withRenewalLinks<T>(body: () => Promise<T>): Promise<T> {
    ConfigureRenewalPaymentLinks({ Secret: TEST_LINK_SECRET });
    OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', 'https://checkout.example.test/checkout');
    try {
        return await body();
    } finally {
        ConfigureRenewalPaymentLinks({ Secret: null });
        OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', undefined);
    }
}

/**
 * The checkout that sold the subscription: an active widget on the renewal card's provider, with a
 * distribution, named as the source of the subscription's first order. The update-card page is shown
 * in it.
 */
async function soldThroughCheckout(ctx: IntegrationCheckContext, sourceOrderID: string, providerID: string): Promise<string> {
    const f = Fx();
    const widgetID = await createViaEntity(ctx, CHECKOUT_WIDGET_ENTITY, {
        Name: `${f.Run} renewal checkout`,
        CompanyID: f.CoA.ID,
        Status: 'Active',
        Configuration: JSON.stringify({ paymentProviderId: providerID, currency: 'USD' }),
    });
    await createViaEntity(ctx, CHECKOUT_WIDGET_DISTRIBUTION_ENTITY, {
        CheckoutWidgetID: widgetID,
        Slug: `${f.Run.toLowerCase()}-renew-${widgetID.slice(0, 8).toLowerCase()}`,
        Status: 'Active',
    });
    await TxQuery(ctx, `UPDATE ${ORDERS_SCHEMA}.OrderHeader SET SourceCheckoutWidgetID = '${widgetID}' WHERE ID = '${sourceOrderID}'`);
    return widgetID;
}

/** A link token for a renewal, valid for a day. */
const linkToken = (orderID: string, subscriptionID: string) =>
    SignRenewalPaymentToken({ OrderID: orderID, SubscriptionID: subscriptionID, ExpiresAt: new Date(Date.now() + 86_400_000) }, TEST_LINK_SECRET);

/** Mark the session's intent paid, as the gateway's webhook would once the buyer confirms. */
async function settleSessionIntent(ctx: IntegrationCheckContext, sessionID: string): Promise<void> {
    const row = await TxOne<{ PaymentIntentID: string }>(ctx, `SELECT PaymentIntentID FROM ${ORDERS_SCHEMA}.CheckoutSession WHERE ID = '${sessionID}'`);
    Assert(!!row.PaymentIntentID, 'precondition: the session has an intent');
    await upsertViaEntity(ctx, PAYMENT_INTENT_ENTITY, row.PaymentIntentID, { Status: 'Succeeded' });
}

for (const check of SubscriptionRenewalChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('subscription-renewal', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});

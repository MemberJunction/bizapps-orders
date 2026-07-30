/**
 * @fileoverview `Orders.SaveOrder` and `Orders.PreviewOrder`.
 *
 * Together these are what make browser-side order entry possible. Both hydrate a
 * client draft through {@link HydrateOrderDraft} and hand it to
 * `OrderEntityServer.Save()`; they differ only in whether the transaction commits.
 *
 * WHY PREVIEW RUNS THE REAL SAVE. A preview that reimplemented pricing would be a
 * second copy of the rules living beside the engine, and the two would eventually
 * disagree — as a BALANCED journal entry for the wrong amount, which nothing
 * downstream can catch. So `PreviewOrder` performs the actual save inside a
 * transaction that always rolls back, then reads the computed values off the
 * entities before they vanish. It cannot drift from what confirming will do,
 * because it *is* what confirming will do.
 *
 * That is the same isolation primitive the integration suite is built on, for the
 * same reason.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import {
    BaseRemotableOperation,
    RunView,
    type BaseEntity,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { DatabaseProviderBase } from '@memberjunction/core';
import {
    OrdersSaveOrderOperation as OrdersSaveOrderOperationBase,
    OrdersPreviewOrderOperation as OrdersPreviewOrderOperationBase,
    OrdersConfirmOrderOperation as OrdersConfirmOrderOperationBase,
    type OrdersSaveOrderInput,
    type OrdersSaveOrderOutput,
    type OrdersPreviewOrderInput,
    type OrdersPreviewOrderOutput,
    type OrdersConfirmOrderInput,
    type OrdersConfirmOrderOutput,
    type OrderLineResult,
    type OrderTotalsResult,
    type ChargeResult,
    type PromotionResult,
    type BlockerResult,
    type TaxLayerResult,
} from '@mj-biz-apps/orders-entities';

import { HydrateOrderDraft, type HydratableDraft, type HydratedOrder } from './OrderDraftHydrator.js';

/** Round to cents the way the rest of the engine does. */
const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Read a field off an entity without fighting the dynamic index signature. */
const field = <T>(entity: BaseEntity, name: string, fallback: T): T => {
    const value = (entity as unknown as Record<string, unknown>)[name];
    return (value === undefined || value === null ? fallback : value) as T;
};

/**
 * Project the saved entities into the wire result.
 *
 * Everything here is READ from what `Save()` computed. Nothing is recalculated —
 * a projection that did its own arithmetic would be the very duplication this
 * design exists to avoid.
 */
async function projectResult(
    hydrated: HydratedOrder,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{
    Lines: OrderLineResult[];
    Totals: OrderTotalsResult;
    Charges: ChargeResult[];
    Promotions: PromotionResult[];
}> {
    const order = hydrated.Order as unknown as BaseEntity;
    const lines: OrderLineResult[] = [];

    let listSubtotal = 0;
    let discountTotal = 0;
    let taxableGoods = 0;
    let untaxableGoods = 0;

    const byCompany = new Map<string, { Net: number; Charges: number; Tax: number }>();

    for (let i = 0; i < hydrated.Lines.length; i++) {
        const line = hydrated.Lines[i] as unknown as BaseEntity;
        const net = money(field(line, 'LineTotalNet', 0));
        const tax = money(field(line, 'LineTax', 0));
        const charge = money(field(line, 'ChargeAmount', 0));
        const gross = money(field(line, 'LineTotalGross', net + tax + charge));
        const qty = Number(field(line, 'Quantity', 0));
        const unit = money(field(line, 'UnitPrice', 0));
        const discountAmount = money(field(line, 'DiscountAmount', 0));
        const discountPct = Number(field(line, 'DiscountPct', 0));
        const listAmount = money(qty * unit);
        const companyID = field(line, 'CompanyID', '');
        const taxable = tax !== 0;

        listSubtotal += listAmount;
        discountTotal += discountAmount;
        if (taxable) taxableGoods += net;
        else untaxableGoods += net;

        const bucket = byCompany.get(companyID) ?? { Net: 0, Charges: 0, Tax: 0 };
        bucket.Net += net;
        bucket.Charges += charge;
        bucket.Tax += tax;
        byCompany.set(companyID, bucket);

        lines.push({
            ClientKey: hydrated.LineKeys[i],
            LineNumber: Number(field(line, 'LineNumber', i + 1)),
            ProductID: field(line, 'ProductID', ''),
            ProductName: field(line, 'Product', ''),
            CompanyID: companyID,
            CompanyName: field(line, 'Company', ''),
            Quantity: qty,
            UnitPrice: unit,
            ProductPriceID: field<string | null>(line, 'ProductPriceID', null),
            // The client stated it iff it sent one; the hydrator only assigns when it did.
            UnitPriceWasStated: false,
            PriceSource: null,
            DiscountPct: discountPct,
            DiscountAmount: discountAmount,
            ListAmount: listAmount,
            LineTotalNet: net,
            ChargeAmount: charge,
            LineTax: tax,
            LineTotalGross: gross,
            Taxable: taxable,
            TaxLayers: [] as TaxLayerResult[],
            ServicePeriodStart: isoOrNull(field<unknown>(line, 'ServicePeriodStart', null)),
            ServicePeriodEnd: isoOrNull(field<unknown>(line, 'ServicePeriodEnd', null)),
            RequiresFulfillment: field<string | null>(line, 'FulfillmentStatus', null) !== null,
            Components: [],
        });
    }

    const chargeTotal = money(lines.reduce((s, l) => s + l.ChargeAmount, 0));
    const taxTotal = money(lines.reduce((s, l) => s + l.LineTax, 0));
    const netTotal = money(lines.reduce((s, l) => s + l.LineTotalNet, 0));

    const companyNames = new Map<string, string>();
    for (const l of lines) companyNames.set(l.CompanyID, l.CompanyName);

    const totals: OrderTotalsResult = {
        ListSubtotal: money(listSubtotal),
        DiscountTotal: money(discountTotal),
        NetTotal: netTotal,
        ChargeTotal: chargeTotal,
        TaxTotal: taxTotal,
        // Read the header's rollup rather than summing again: it is trigger-maintained
        // and is the number every other surface will show.
        GrossTotal: money(field(order, 'TotalGross', netTotal + chargeTotal + taxTotal)),
        TaxableBase: {
            TaxableGoods: money(taxableGoods),
            UntaxableGoods: money(untaxableGoods),
            NonTaxCharges: chargeTotal,
            Base: money(taxableGoods + chargeTotal),
        },
        ByCompany: [...byCompany.entries()].map(([id, b]) => ({
            CompanyID: id,
            CompanyName: companyNames.get(id) ?? '',
            Net: money(b.Net),
            Charges: money(b.Charges),
            Tax: money(b.Tax),
            Gross: money(b.Net + b.Charges + b.Tax),
        })),
    };

    const charges = await loadCharges(field(order, 'ID', ''), provider, user);
    const promotions = readPromotions(hydrated);

    return { Lines: lines, Totals: totals, Charges: charges, Promotions: promotions };
}

function isoOrNull(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** The charges the engine wrote for this order, in sequence. */
async function loadCharges(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ChargeResult[]> {
    if (!orderHeaderID) return [];
    // FromMetadataProvider, not `new RunView(provider)`: an operation's provider is
    // an IMetadataProvider, and this is the documented way to get a view runner
    // bound to it rather than to the global one.
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Charges',
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
            OrderBy: 'Sequence',
            ResultType: 'simple',
        },
        user,
    );
    return (result.Results ?? []).map((r) => ({
        ChargeTypeID: String(r.ChargeTypeID ?? ''),
        Name: String(r.ChargeType ?? ''),
        Sequence: Number(r.Sequence ?? 0),
        Basis: String(r.CalculationSource ?? 'Internal'),
        BasisAmount: r.BasisAmount == null ? null : money(Number(r.BasisAmount)),
        Rate: r.Rate == null ? null : Number(r.Rate),
        Amount: money(Number(r.Amount ?? 0)),
        IsTax: r.TaxJurisdictionID != null,
        JurisdictionName: (r.TaxJurisdiction as string) ?? null,
        IsOverridden: Boolean(r.IsOverridden),
        ComputedAmount: r.ComputedAmount == null ? null : money(Number(r.ComputedAmount)),
    }));
}

/**
 * Promotion outcomes, INCLUDING the codes that did nothing.
 *
 * `UnusablePromotionCodes` is the engine's record of offered-not-applied, and
 * surfacing it is the only way to answer "why didn't my code work?" without
 * re-running the engine by hand — which is a question customers actually ask.
 */
function readPromotions(hydrated: HydratedOrder): PromotionResult[] {
    const unusable =
        (hydrated.Order as unknown as { UnusablePromotionCodes?: Array<{ Code: string; Reason: string }> })
            .UnusablePromotionCodes ?? [];
    return unusable.map((u) => ({
        Code: u.Code,
        Name: u.Code,
        Scope: 'Line' as const,
        Kind: 'Percent' as const,
        Value: 0,
        Applied: false,
        Amount: 0,
        NotAppliedReason: u.Reason,
    }));
}

/** Turn a failed save into blockers the UI can render verbatim. */
function blockersFrom(order: BaseEntity, fallback: string): BlockerResult[] {
    const message = order.LatestResult?.CompleteMessage?.trim();
    return [
        {
            Code: 'SAVE_REFUSED',
            Message: message && message.length > 0 ? message : fallback,
        },
    ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders.SaveOrder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create or update a DRAFT order and its lines in one transaction.
 *
 * Never confirms. Confirming books journal entries and is not undoable, so it is
 * a separate, deliberate operation rather than a status field somebody can set by
 * accident through a save.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.SaveOrder')
export class SaveOrderOperation extends OrdersSaveOrderOperationBase {
    protected async InternalExecute(
        input: OrdersSaveOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersSaveOrderOutput> {
        if (!input?.Draft?.Header?.CompanyID) {
            return { Success: false, Message: 'Draft.Header.CompanyID is required.' };
        }

        // Preview is the same work without the commit, so route rather than duplicate.
        if (input.Preview) {
            const preview = await runPreview(input.Draft as HydratableDraft, provider, user);
            return {
                Success: preview.Success,
                Message: preview.Message,
                Lines: preview.Lines,
                Totals: preview.Totals,
                Charges: preview.Charges,
                Promotions: preview.Promotions,
                Blockers: preview.Blockers,
            };
        }

        const hydrated = await HydrateOrderDraft(input.Draft as HydratableDraft, provider, user);
        const order = hydrated.Order as unknown as BaseEntity;

        // A save never transitions status. An order arrives Draft and stays Draft
        // until Orders.ConfirmOrder says otherwise.
        const saved = await order.Save();
        if (!saved) {
            return {
                Success: false,
                Message: 'The order could not be saved.',
                Blockers: blockersFrom(order, 'The order could not be saved.'),
            };
        }

        const projected = await projectResult(hydrated, provider, user);
        return {
            Success: true,
            OrderHeaderID: field(order, 'ID', ''),
            OrderNumber: field<string | null>(order, 'OrderNumber', null),
            Status: field(order, 'Status', 'Draft'),
            ...projected,
        };
    }
}

/** Registers {@link SaveOrderOperation}. Called from the server bootstrap. */
export function LoadSaveOrderOperation(): void {
    // Referencing the class is what defeats tree-shaking of the decorator.
    void SaveOrderOperation;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders.PreviewOrder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Price a draft without writing anything.
 *
 * Runs the REAL save inside a transaction that always rolls back, so the numbers
 * are the engine's own rather than a second implementation's. This is the
 * operation continuous preview is built on: order entry calls it, debounced, as
 * the user types.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.PreviewOrder')
export class PreviewOrderOperation extends OrdersPreviewOrderOperationBase {
    protected async InternalExecute(
        input: OrdersPreviewOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersPreviewOrderOutput> {
        if (!input?.Draft?.Header?.CompanyID) {
            return {
                Success: false,
                Message: 'Draft.Header.CompanyID is required.',
                Lines: [],
                Totals: emptyTotals(),
                Charges: [],
                Promotions: [],
            };
        }
        return runPreview(input.Draft as HydratableDraft, provider, user);
    }
}

/** Registers {@link PreviewOrderOperation}. Called from the server bootstrap. */
export function LoadPreviewOrderOperation(): void {
    void PreviewOrderOperation;
}

function emptyTotals(): OrderTotalsResult {
    return {
        ListSubtotal: 0,
        DiscountTotal: 0,
        NetTotal: 0,
        ChargeTotal: 0,
        TaxTotal: 0,
        GrossTotal: 0,
        TaxableBase: { TaxableGoods: 0, UntaxableGoods: 0, NonTaxCharges: 0, Base: 0 },
        ByCompany: [],
    };
}

/**
 * Save the draft, read what the engine computed, then roll the whole thing back.
 *
 * The rollback is in `finally`, so a failed save is still undone — a preview that
 * left a half-written order behind would be worse than no preview.
 */
async function runPreview(
    draft: HydratableDraft,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OrdersPreviewOrderOutput> {
    const db = provider as unknown as DatabaseProviderBase;
    await db.BeginTransaction();
    try {
        // Force a create even when the client is editing a saved draft: previewing
        // must never touch the persisted row, and hydrating onto a load would make
        // the rollback the only thing standing between a preview and a mutation.
        const previewDraft: HydratableDraft = {
            ...draft,
            Header: { ...draft.Header, OrderHeaderID: null },
        };

        const hydrated = await HydrateOrderDraft(previewDraft, provider, user);
        const order = hydrated.Order as unknown as BaseEntity;

        const saved = await order.Save();
        if (!saved) {
            return {
                Success: false,
                Message: 'The draft could not be priced.',
                Lines: [],
                Totals: emptyTotals(),
                Charges: [],
                Promotions: readPromotions(hydrated),
                Blockers: blockersFrom(order, 'The draft could not be priced.'),
            };
        }

        const projected = await projectResult(hydrated, provider, user);
        return { Success: true, ...projected };
    } finally {
        try {
            await db.RollbackTransaction();
        } catch (e) {
            // SQL Server dooms a transaction on a severity-16 trigger error, so by
            // the time we ask there may be nothing left to roll back. Isolation
            // still held; swallow only that case.
            const aborted = /transaction has been aborted|no active transaction/i.test(
                String((e as Error).message),
            );
            if (!aborted) throw e;
        }
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders.ConfirmOrder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Confirm an order: the irreversible step.
 *
 * `OrderEntityServer.Save()` does the real work when status transitions into a
 * locked state — books one journal entry per line, decides subscriptions, issues
 * grants, captures the initial payment — all inside one transaction that rolls
 * back entirely on any failure. This operation's job is to set up that transition
 * correctly and to report the reason when it is refused.
 *
 * The `ExpectedGrossTotal` guard is the part worth understanding. Between the
 * moment a user reads a total and the moment they press Confirm, a promotion can
 * expire or a rate can change. Without the guard the order books at the new
 * number silently. With it, the confirm is refused and the user re-reads the
 * total — which is the only outcome that respects the fact that they were
 * agreeing to a specific amount.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.ConfirmOrder')
export class ConfirmOrderOperation extends OrdersConfirmOrderOperationBase {
    protected async InternalExecute(
        input: OrdersConfirmOrderInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersConfirmOrderOutput> {
        const hasDraft = !!input?.Draft?.Header?.CompanyID;
        const hasID = !!input?.OrderHeaderID;

        if (hasDraft === hasID) {
            return {
                Success: false,
                Message: 'Supply exactly one of OrderHeaderID or Draft.',
                Blockers: [
                    {
                        Code: 'INPUT_AMBIGUOUS',
                        Message: hasDraft
                            ? 'Both OrderHeaderID and Draft were supplied; they are mutually exclusive.'
                            : 'Neither OrderHeaderID nor Draft was supplied.',
                    },
                ],
            };
        }

        // A draft to confirm, or an existing order to load and confirm. Either way
        // it goes through the SAME hydration path, so there is one mapping to be
        // right rather than two.
        const draft: HydratableDraft = hasDraft
            ? (input.Draft as HydratableDraft)
            : { Header: { CompanyID: '', OrderHeaderID: input.OrderHeaderID }, Lines: [] };

        const hydrated = await HydrateOrderDraft(draft, provider, user);
        const order = hydrated.Order as unknown as BaseEntity;

        // Already-locked orders are not re-confirmable. Booking fires exactly once,
        // on the FIRST transition, and saying so plainly beats letting the engine's
        // idempotency guard produce a confusing no-op.
        const currentStatus = field(order, 'Status', 'Draft');
        if (!['Draft', 'Quoted'].includes(currentStatus)) {
            return {
                Success: false,
                Message: `This order is already ${currentStatus}.`,
                OrderHeaderID: field(order, 'ID', ''),
                Status: currentStatus,
                Blockers: [
                    {
                        Code: 'ALREADY_CONFIRMED',
                        Message:
                            `Only a Draft or Quoted order can be confirmed; this one is ${currentStatus}. ` +
                            'After confirming, corrections are reversing orders rather than edits.',
                    },
                ],
            };
        }

        // The price-moved guard. Checked BEFORE the transition, because after it the
        // entries exist and refusing is no longer an option.
        if (input.ExpectedGrossTotal != null) {
            const preview = await runPreview(
                hasDraft ? draft : await draftFromSavedOrder(order, hydrated),
                provider,
                user,
            );
            if (preview.Success) {
                const actual = money(preview.Totals.GrossTotal);
                const expected = money(input.ExpectedGrossTotal);
                if (actual !== expected) {
                    return {
                        Success: false,
                        Message: `The total changed from ${expected.toFixed(2)} to ${actual.toFixed(2)}.`,
                        OrderHeaderID: field(order, 'ID', ''),
                        Totals: preview.Totals,
                        Blockers: [
                            {
                                Code: 'TOTAL_CHANGED',
                                Message:
                                    `This order now comes to ${actual.toFixed(2)}, not the ${expected.toFixed(2)} ` +
                                    'you were shown. Something re-priced — a promotion window, or a rate. ' +
                                    'Review the new total before confirming.',
                                ResolutionHint: 'Re-read the totals, then confirm again.',
                            },
                        ],
                    };
                }
            }
        }

        order.Set('Status', 'Confirmed');

        const saved = await order.Save();
        if (!saved) {
            // The reason lives on LatestResult, not in a log. A rejected confirm the
            // user cannot read is a rejected confirm they cannot act on.
            return {
                Success: false,
                Message: order.LatestResult?.CompleteMessage ?? 'The order could not be confirmed.',
                OrderHeaderID: field(order, 'ID', ''),
                Status: currentStatus,
                Blockers: blockersFrom(order, 'The order could not be confirmed.'),
            };
        }

        const projected = await projectResult(hydrated, provider, user);
        return {
            Success: true,
            OrderHeaderID: field(order, 'ID', ''),
            // Taken from the sequence inside the transaction, so a failed confirm
            // burns no number.
            OrderNumber: field(order, 'OrderNumber', ''),
            Status: field(order, 'Status', 'Confirmed'),
            Totals: projected.Totals,
        };
    }
}

/** Registers {@link ConfirmOrderOperation}. Called from the server bootstrap. */
export function LoadConfirmOrderOperation(): void {
    void ConfirmOrderOperation;
}

/**
 * Rebuild a draft payload from a SAVED order, so the price-moved guard can price
 * it the same way it would price an unsaved one.
 *
 * Only the fields that affect pricing are carried across; the rest are already
 * persisted and are not what the guard is asking about.
 */
async function draftFromSavedOrder(order: BaseEntity, hydrated: HydratedOrder): Promise<HydratableDraft> {
    void hydrated;
    return {
        Header: {
            CompanyID: field(order, 'CompanyID', ''),
            OrderType: field(order, 'OrderType', 'Sale'),
            BillToPersonID: field<string | null>(order, 'BillToPersonID', null),
            BillToOrganizationID: field<string | null>(order, 'BillToOrganizationID', null),
            ShipToAddressID: field<string | null>(order, 'ShipToAddressID', null),
            OrderHeaderID: null,
        },
        // A saved order's lines are already persisted rows, so re-pricing them means
        // reading them back rather than trusting a client payload that may be stale.
        Lines: [],
    };
}

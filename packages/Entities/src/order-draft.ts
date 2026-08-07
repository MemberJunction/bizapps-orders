/**
 * @fileoverview `OrderDraft` — the client-side model of an order being composed.
 *
 * WHY THIS EXISTS. An order's lines, charges and promotion codes are transient
 * collections on the SERVER entity (`OrderEntityServer` reads a `Lines` array of
 * unsaved line entities during `Save()`), so they cannot cross the entity-save
 * boundary as scalar fields. A browser therefore cannot compose an order through
 * `BaseEntity` at all. `OrderDraft` is the answer to the other half of that
 * problem: something for the UI to hold and mutate that knows how to become the
 * payload `Orders.SaveOrder` / `Orders.ConfirmOrder` / `Orders.PreviewOrder`
 * accept, which the server then rehydrates into real entities.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not price anything. Not the subtotal,
 * not a discount, not a tax layer. Every derived number comes from
 * `Orders.PreviewOrder` and is stored via {@link OrderDraft.ApplyPreview}. A
 * second implementation of the pricing rules living next to the engine is the
 * thing that eventually disagrees with it, and the disagreement surfaces as a
 * balanced journal entry for the wrong amount — which nothing downstream can
 * catch.
 *
 * FRAMEWORK-FREE ON PURPOSE. No Angular, no DOM, no MJ provider. Both order-entry
 * lanes bind to the same instance, so "open in the full editor" is the same object
 * rather than a copy that can drift; and the whole model is unit-testable in the
 * repo's existing `vitest` run with no test harness at all.
 *
 * @module @mj-biz-apps/orders-entities
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Wire shapes
 *
 * These mirror the `Orders.*` operation contracts declared in
 * `metadata/remote-operations/types/`. They are re-declared here rather than
 * imported because the generated bases only exist after CodeGen has run, and the
 * Entities package must build before that. The shapes are structural, so passing
 * `ToInput()` into a generated operation type-checks at the CALL SITE — which is
 * exactly where a drift between the two should be caught.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A dimension tag on a line, propagated into that line's journal-entry lines. */
export interface OrderDraftDimension {
    DimensionID: string;
    DimensionValueID: string;
}

/** A line as the client states it. Everything the engine derives is absent. */
export interface OrderDraftLinePayload {
    ClientKey?: string;
    ProductID: string;
    Quantity: number;
    UnitPrice?: number;
    DiscountPct?: number;
    ServicePeriodStart?: string | null;
    ServicePeriodEnd?: string | null;
    ShipToAddressID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToPersonID?: string | null;
    RenewsSubscriptionID?: string | null;
    ReversesOrderLineID?: string | null;
    Description?: string | null;
    Dimensions?: OrderDraftDimension[];
}

/** A charge being asserted or overridden rather than computed. Rare. */
export interface OrderDraftChargePayload {
    ChargeTypeID: string;
    Amount: number;
    OverrideReason?: string | null;
}

/** A manual discount, checked against the acting user's sales authority. */
export interface OrderDraftManualDiscountPayload {
    LineClientKey?: string;
    Percent?: number;
    Amount?: number;
    Reason: string;
}

/** The header fields a caller states. Rollups are absent — triggers own them. */
export interface OrderDraftHeaderPayload {
    OrderHeaderID?: string | null;
    OrderType?: 'Sale' | 'Return' | 'Cancellation' | 'Amendment' | 'AccountCredit';
    OrderDate?: string;
    CompanyID: string;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    BillToAddressID?: string | null;
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToAddressID?: string | null;
    SalesRepUserID?: string | null;
    PaymentTermsTypeID?: string | null;
    DueDate?: string | null;
    ExternalDocumentNumber?: string | null;
    Description?: string | null;
    Notes?: string | null;
    RequestedDeliveryDate?: string | null;
    ReversesOrderHeaderID?: string | null;
    ReversalReason?: string | null;
    OriginChannel?: string | null;
    OriginExternalID?: string | null;
    InitialPaymentTypeID?: string | null;
    /**
     * The instrument's own reference — a check number, a wire confirmation, a transfer id.
     *
     * Lives here rather than on the order because the ORDER has no column for it: a reference
     * belongs to the instrument, so on confirm this becomes a `PaymentDetail.ReferenceNumber` and
     * the order points at that row. Required for any `PaymentType` with `RequiresReference` — Check,
     * Wire and Internal Transfer today — and refused server-side when missing, because a captured
     * check with no number cannot be reconciled against a bank statement.
     */
    InitialPaymentReference?: string | null;
    /**
     * Whether the chosen tender's `PaymentType.RequiresReference` is set.
     *
     * STATED BY THE CALLER rather than looked up, because this model is framework-free and does no
     * data access — the UI already holds the tender list and knows the answer. Carrying it as a
     * plain boolean is what lets {@link OrderDraft.Validate} enforce the rule for BOTH entry lanes
     * and the workspace's confirm gate, instead of each screen re-implementing it and one of them
     * forgetting.
     */
    InitialPaymentRequiresReference?: boolean;
    InitialPaymentAmount?: number;
    SourceCustomerPaymentMethodID?: string | null;
}

/** The whole draft as one payload — what the operations accept. */
export interface OrderDraftPayload {
    Header: OrderDraftHeaderPayload;
    Lines: OrderDraftLinePayload[];
    PromotionCodes?: string[];
    ManualDiscounts?: OrderDraftManualDiscountPayload[];
    Charges?: OrderDraftChargePayload[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Validation
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where a validation problem lives, so a tab can show a red dot for it. */
export type OrderDraftSection = 'header' | 'lines' | 'parties' | 'charges' | 'payment';

/** One thing wrong with the draft, in the words a user should read. */
export interface OrderDraftValidationIssue {
    /** Stable code for tests and telemetry. */
    Code: string;
    Section: OrderDraftSection;
    Message: string;
    /** Present when the issue belongs to one line. */
    ClientKey?: string;
    /**
     * `error` blocks saving; `warning` does not. A warning is for something the
     * engine will resolve or refuse on its own — the client should not pre-empt a
     * server rule it can only approximate.
     */
    Severity: 'error' | 'warning';
}

export interface OrderDraftValidationResult {
    IsValid: boolean;
    Issues: OrderDraftValidationIssue[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Preview results the draft carries but never computes
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The structural minimum of `OrdersPreviewOrderOutput` that the draft itself
 * needs — enough to answer "is my stored decomposition still current" and "what
 * is the total I could confirm against". The UI reads the full result; the draft
 * deliberately knows less.
 *
 * NO INDEX SIGNATURE. An earlier version declared `[key: string]: unknown` to be
 * permissive, which had the opposite effect: TypeScript then required the SOURCE
 * to carry one too, so the concrete generated output type would not assign. Extra
 * properties on a non-literal are already allowed; the minimal shape is the
 * permissive one.
 */
export interface OrderDraftPreview {
    Lines?: ReadonlyArray<{ ClientKey?: string; LineNumber: number }>;
    Totals?: { GrossTotal: number; NetTotal: number };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The draft
 * ──────────────────────────────────────────────────────────────────────────── */

/** A line held by the draft. Carries a stable client key the server echoes back. */
export class OrderDraftLine implements OrderDraftLinePayload {
    /**
     * Stable identity for this row, generated client-side and never persisted.
     * It is how a preview result is matched back to the row that produced it —
     * line NUMBERS renumber when a row is removed, so they cannot do this job.
     */
    public readonly ClientKey: string;
    public ProductID: string;
    public Quantity: number;
    public UnitPrice?: number;
    public DiscountPct?: number;
    public ServicePeriodStart?: string | null;
    public ServicePeriodEnd?: string | null;
    public ShipToAddressID?: string | null;
    public ShipToOrganizationID?: string | null;
    public ShipToPersonID?: string | null;
    public RenewsSubscriptionID?: string | null;
    public ReversesOrderLineID?: string | null;
    public Description?: string | null;
    public Dimensions?: OrderDraftDimension[];

    constructor(init: OrderDraftLinePayload & { ClientKey: string }) {
        this.ClientKey = init.ClientKey;
        this.ProductID = init.ProductID;
        this.Quantity = init.Quantity;
        this.UnitPrice = init.UnitPrice;
        this.DiscountPct = init.DiscountPct;
        this.ServicePeriodStart = init.ServicePeriodStart;
        this.ServicePeriodEnd = init.ServicePeriodEnd;
        this.ShipToAddressID = init.ShipToAddressID;
        this.ShipToOrganizationID = init.ShipToOrganizationID;
        this.ShipToPersonID = init.ShipToPersonID;
        this.RenewsSubscriptionID = init.RenewsSubscriptionID;
        this.ReversesOrderLineID = init.ReversesOrderLineID;
        this.Description = init.Description;
        this.Dimensions = init.Dimensions;
    }

    /**
     * True when the caller stated a price, meaning direct entry WINS over every
     * resolved price. `undefined` means "resolve one"; `0` is a deliberate free
     * line and is therefore a stated price, not an absent one.
     */
    public get UnitPriceWasStated(): boolean {
        return this.UnitPrice !== undefined && this.UnitPrice !== null;
    }

    /** A negative quantity means this line reverses something. */
    public get IsReversal(): boolean {
        return this.Quantity < 0 || !!this.ReversesOrderLineID;
    }
}

/**
 * Options for a new draft. Only the owning company is required — everything else
 * is either stated later or resolved by the engine.
 */
export interface OrderDraftInit {
    CompanyID: string;
    OrderType?: OrderDraftHeaderPayload['OrderType'];
    OrderDate?: string;
    SalesRepUserID?: string | null;
    /** Set when editing an existing draft rather than composing a new one. */
    OrderHeaderID?: string | null;
    /** Where this order came from, so a self-serve purchase is never inferred. */
    OriginChannel?: string | null;
    OriginExternalID?: string | null;
}

/**
 * A mutable, framework-free order under composition.
 *
 * @example Compose and confirm
 * ```typescript
 * const draft = new OrderDraft({ CompanyID: companyID, SalesRepUserID: user.ID });
 * draft.SetBillTo({ PersonID: jane.ID, OrganizationID: meridian.ID, AddressID: addr.ID });
 * draft.AddLine({ ProductID: membership.ID, Quantity: 1 });
 * draft.AddPromotionCode('SPRING10');
 *
 * // Every derived number comes from the engine, never from here.
 * const preview = await new OrdersPreviewOrderOperation().Execute({ Draft: draft.ToInput() });
 * if (preview.Success) draft.ApplyPreview(preview.Output!);
 *
 * const confirmed = await new OrdersConfirmOrderOperation().Execute({
 *   Draft: draft.ToInput(),
 *   ExpectedGrossTotal: draft.Preview?.Totals?.GrossTotal,   // refuse a price that moved
 * });
 * ```
 *
 * @example Subscribe to changes from a view
 * ```typescript
 * const stop = draft.Subscribe(() => this.schedulePreview());
 * // ... later
 * stop();
 * ```
 */
export class OrderDraft {
    private _header: OrderDraftHeaderPayload;
    private _lines: OrderDraftLine[] = [];
    private _promotionCodes: string[] = [];
    private _manualDiscounts: OrderDraftManualDiscountPayload[] = [];
    private _charges: OrderDraftChargePayload[] = [];
    private _preview: OrderDraftPreview | null = null;
    /** The version the stored preview was computed against. */
    private _previewVersion = -1;
    private _version = 0;
    private _keySeq = 0;
    private _subscribers: Array<(draft: OrderDraft) => void> = [];

    /**
     * Header fields currently holding a DEFAULT rather than something the user stated.
     *
     * A default the user cannot see is a decision made on their behalf in secret. The order date is
     * the case that made this matter: it was left undefined here and quietly filled in with "now" by
     * the server at confirm, so the field rendered empty and the user had no way to know what date
     * their order would carry until after it was booked. Showing the value is half the fix — the
     * other half is saying it is a default, so the difference between "today, because nobody chose"
     * and "today, because I chose today" stays visible.
     *
     * Cleared per-field on `SetHeader`, because the moment a user states a value it stops being a
     * default even if they typed the same thing.
     */
    private _defaulted = new Set<keyof OrderDraftHeaderPayload>();

    constructor(init: OrderDraftInit) {
        this._header = {
            OrderHeaderID: init.OrderHeaderID ?? null,
            CompanyID: init.CompanyID,
            OrderType: init.OrderType ?? 'Sale',
            // TODAY, STATED HERE rather than left for the server. `OrderEntityServer` already
            // defaults a missing date to `new Date()` at save, so this changes no outcome — it makes
            // the outcome VISIBLE while the order is still being taken, which is the only time the
            // user can disagree with it.
            OrderDate: init.OrderDate ?? OrderDraft.Today(),
            SalesRepUserID: init.SalesRepUserID ?? null,
            OriginChannel: init.OriginChannel ?? null,
            OriginExternalID: init.OriginExternalID ?? null,
        };
        if (!init.OrderDate) this._defaulted.add('OrderDate');
        if (!init.OrderType) this._defaulted.add('OrderType');
    }

    /**
     * Today as `yyyy-MM-dd` in the USER'S timezone, which is what `<input type="date">` reads and
     * what an order taker means by "today".
     *
     * `toISOString().slice(0,10)` is the obvious version and is wrong: it converts to UTC first, so
     * anyone west of Greenwich taking an evening order gets TOMORROW's date — a date that lands in
     * the wrong accounting period at every month end.
     */
    public static Today(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    /**
     * True when this header field currently holds a default nobody has confirmed.
     *
     * The UI uses it to render the value in a muted style, so a defaulted date reads differently
     * from one the user typed.
     */
    public IsDefaulted(field: keyof OrderDraftHeaderPayload): boolean {
        return this._defaulted.has(field);
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    /** The header, as a frozen snapshot. Mutate through the `Set*` methods. */
    public get Header(): Readonly<OrderDraftHeaderPayload> {
        return this._header;
    }

    /** The lines, in order. The array is a copy; the line objects are live. */
    public get Lines(): OrderDraftLine[] {
        return [...this._lines];
    }

    public get LineCount(): number {
        return this._lines.length;
    }

    public get PromotionCodes(): string[] {
        return [...this._promotionCodes];
    }

    public get ManualDiscounts(): OrderDraftManualDiscountPayload[] {
        return [...this._manualDiscounts];
    }

    public get Charges(): OrderDraftChargePayload[] {
        return [...this._charges];
    }

    /**
     * Increments on every mutation. A view can compare it to decide whether to
     * re-render, and it is what tells the draft its stored preview went stale.
     */
    public get Version(): number {
        return this._version;
    }

    /** The last decomposition the engine returned, or null if none yet. */
    public get Preview(): OrderDraftPreview | null {
        return this._preview;
    }

    /**
     * True when the draft has changed since the stored preview was computed — so
     * the UI can mark the totals as recomputing instead of showing stale money
     * as though it were current.
     */
    public get IsPreviewStale(): boolean {
        return this._preview === null || this._previewVersion !== this._version;
    }

    /** True when this draft has never been saved. */
    public get IsNew(): boolean {
        return !this._header.OrderHeaderID;
    }

    // ── Header ───────────────────────────────────────────────────────────────

    /** Merge header fields. Unspecified keys are left alone. */
    public SetHeader(patch: Partial<Omit<OrderDraftHeaderPayload, 'CompanyID'>> & { CompanyID?: string }): this {
        this._header = { ...this._header, ...patch };
        // Stating a value ends its default status, even when the user types exactly what was already
        // there — "today, because I chose today" is a different fact from "today, because nobody
        // chose", and only the user can turn the first into the second.
        for (const key of Object.keys(patch) as Array<keyof OrderDraftHeaderPayload>) {
            this._defaulted.delete(key);
        }
        return this.touch();
    }

    /**
     * Who pays. Bill-to is header-only — one order, one payer, one bill — which is
     * why there is no line-level counterpart to this.
     */
    public SetBillTo(party: { PersonID?: string | null; OrganizationID?: string | null; AddressID?: string | null }): this {
        return this.SetHeader({
            BillToPersonID: party.PersonID ?? null,
            BillToOrganizationID: party.OrganizationID ?? null,
            BillToAddressID: party.AddressID ?? null,
        });
    }

    /**
     * Who receives, as the default every line inherits. Each side falls back
     * INDEPENDENTLY, so a line naming only a person keeps the header's organization.
     */
    public SetShipTo(party: { PersonID?: string | null; OrganizationID?: string | null; AddressID?: string | null }): this {
        return this.SetHeader({
            ShipToPersonID: party.PersonID ?? null,
            ShipToOrganizationID: party.OrganizationID ?? null,
            ShipToAddressID: party.AddressID ?? null,
        });
    }

    /**
     * Record the intent to take a payment when this order confirms. It is INTENT,
     * not a payment: confirming turns it into a real payment, and from then on the
     * payment record is the truth and these fields are never updated again.
     */
    public SetInitialPayment(intent: {
        PaymentTypeID?: string | null;
        Amount?: number;
        SourceCustomerPaymentMethodID?: string | null;
        /** Check number / wire confirmation / transfer id, for tenders that require one. */
        Reference?: string | null;
        /** True when the chosen tender cannot be captured without a reference. */
        RequiresReference?: boolean;
    }): this {
        // ONLY WHAT THE CALLER STATED. This used to write all five fields on every call, defaulting
        // the unmentioned ones to null/0 — so any caller patching one part silently erased the rest.
        // It produced the same bug three times: `SetTender`, `SetInitialAmount` and `PayInFull` each
        // restated a partial intent and wiped a typed check number. Fixing the callers one at a time
        // was fixing the symptom; the shape of this method was the cause.
        //
        // Clearing is explicit and has its own method — {@link ClearInitialPayment} — so nothing is
        // lost by leaving unmentioned fields alone. A caller that genuinely means "no reference"
        // passes `Reference: null`.
        const patch: Partial<OrderDraftHeaderPayload> = {};
        if (intent.PaymentTypeID !== undefined) patch.InitialPaymentTypeID = intent.PaymentTypeID;
        if (intent.Amount !== undefined) patch.InitialPaymentAmount = intent.Amount;
        if (intent.SourceCustomerPaymentMethodID !== undefined) {
            patch.SourceCustomerPaymentMethodID = intent.SourceCustomerPaymentMethodID;
        }
        if (intent.Reference !== undefined) patch.InitialPaymentReference = intent.Reference?.trim() || null;
        if (intent.RequiresReference !== undefined) patch.InitialPaymentRequiresReference = intent.RequiresReference;
        return this.SetHeader(patch);
    }

    /** Clear any initial-payment intent — the customer will be invoiced on terms. */
    public ClearInitialPayment(): this {
        return this.SetHeader({
            InitialPaymentTypeID: null,
            InitialPaymentAmount: 0,
            SourceCustomerPaymentMethodID: null,
            InitialPaymentReference: null,
            InitialPaymentRequiresReference: false,
        });
    }

    // ── Lines ────────────────────────────────────────────────────────────────

    /**
     * Append a line and return it, so the caller can keep the reference (and its
     * `ClientKey`) without searching for it afterwards.
     */
    public AddLine(line: Omit<OrderDraftLinePayload, 'ClientKey'>): OrderDraftLine {
        const created = new OrderDraftLine({ ...line, ClientKey: this.nextKey() });
        this._lines.push(created);
        this.touch();
        return created;
    }

    /** Look a line up by its client key. */
    public GetLine(clientKey: string): OrderDraftLine | undefined {
        return this._lines.find((l) => l.ClientKey === clientKey);
    }

    /** Merge fields into one line. No-op when the key is unknown. */
    public UpdateLine(clientKey: string, patch: Partial<Omit<OrderDraftLinePayload, 'ClientKey'>>): this {
        const line = this.GetLine(clientKey);
        if (!line) return this;
        Object.assign(line, patch);
        return this.touch();
    }

    /** Remove a line. No-op when the key is unknown. */
    public RemoveLine(clientKey: string): this {
        const before = this._lines.length;
        this._lines = this._lines.filter((l) => l.ClientKey !== clientKey);
        return this._lines.length === before ? this : this.touch();
    }

    /**
     * Move a line to a new position, clamped to the array. Line numbers are
     * assigned from array order at `ToInput()` time, so reordering here is what
     * reorders them on the saved order.
     */
    public MoveLine(clientKey: string, toIndex: number): this {
        const from = this._lines.findIndex((l) => l.ClientKey === clientKey);
        if (from < 0) return this;
        const target = Math.max(0, Math.min(toIndex, this._lines.length - 1));
        if (target === from) return this;
        const [line] = this._lines.splice(from, 1);
        this._lines.splice(target, 0, line);
        return this.touch();
    }

    /** Remove every line. */
    public ClearLines(): this {
        if (!this._lines.length) return this;
        this._lines = [];
        return this.touch();
    }

    // ── Promotions, discounts, charges ───────────────────────────────────────

    /**
     * Add a promotion code to attempt. Upper-cased and de-duplicated, because a
     * code is a case-insensitive string and offering the same one twice is not a
     * second discount.
     */
    public AddPromotionCode(code: string): this {
        const normalized = (code ?? '').trim().toUpperCase();
        if (!normalized || this._promotionCodes.includes(normalized)) return this;
        this._promotionCodes.push(normalized);
        return this.touch();
    }

    public RemovePromotionCode(code: string): this {
        const normalized = (code ?? '').trim().toUpperCase();
        const before = this._promotionCodes.length;
        this._promotionCodes = this._promotionCodes.filter((c) => c !== normalized);
        return this._promotionCodes.length === before ? this : this.touch();
    }

    public SetPromotionCodes(codes: string[]): this {
        this._promotionCodes = [];
        for (const c of codes ?? []) {
            const normalized = (c ?? '').trim().toUpperCase();
            if (normalized && !this._promotionCodes.includes(normalized)) this._promotionCodes.push(normalized);
        }
        return this.touch();
    }

    /** A manual discount always carries a reason — it is an exception, and exceptions are explained. */
    public AddManualDiscount(discount: OrderDraftManualDiscountPayload): this {
        this._manualDiscounts.push({ ...discount });
        return this.touch();
    }

    public ClearManualDiscounts(): this {
        if (!this._manualDiscounts.length) return this;
        this._manualDiscounts = [];
        return this.touch();
    }

    /**
     * Assert or override a charge. Ordinary charges are computed by the engine, so
     * this is only for the override case — and an override without a reason is
     * indistinguishable from a bug, which is why the reason rides along.
     */
    public SetCharge(charge: OrderDraftChargePayload): this {
        const idx = this._charges.findIndex((c) => c.ChargeTypeID === charge.ChargeTypeID);
        if (idx >= 0) this._charges[idx] = { ...charge };
        else this._charges.push({ ...charge });
        return this.touch();
    }

    public RemoveCharge(chargeTypeID: string): this {
        const before = this._charges.length;
        this._charges = this._charges.filter((c) => c.ChargeTypeID !== chargeTypeID);
        return this._charges.length === before ? this : this.touch();
    }

    // ── The wire payload ─────────────────────────────────────────────────────

    /**
     * The payload the `Orders.*` operations accept.
     *
     * Two things matter here and are easy to get wrong:
     *
     * 1. **An unset `UnitPrice` is OMITTED, not sent as 0.** The engine treats a
     *    stated price as direct entry that wins outright, and `0` is a legitimate
     *    free line. Sending 0 for "I didn't type one" would suppress price
     *    resolution and book a free order.
     * 2. **Line numbers come from array order**, assigned here rather than stored,
     *    so removing the second of three lines leaves 1-2-3 instead of 1-3.
     */
    public ToInput(): OrderDraftPayload {
        const payload: OrderDraftPayload = {
            Header: { ...this._header },
            Lines: this._lines.map((line) => {
                const out: OrderDraftLinePayload = {
                    ClientKey: line.ClientKey,
                    ProductID: line.ProductID,
                    Quantity: line.Quantity,
                };
                if (line.UnitPriceWasStated) out.UnitPrice = line.UnitPrice;
                if (line.DiscountPct != null) out.DiscountPct = line.DiscountPct;
                if (line.ServicePeriodStart != null) out.ServicePeriodStart = line.ServicePeriodStart;
                if (line.ServicePeriodEnd != null) out.ServicePeriodEnd = line.ServicePeriodEnd;
                if (line.ShipToAddressID != null) out.ShipToAddressID = line.ShipToAddressID;
                if (line.ShipToOrganizationID != null) out.ShipToOrganizationID = line.ShipToOrganizationID;
                if (line.ShipToPersonID != null) out.ShipToPersonID = line.ShipToPersonID;
                if (line.RenewsSubscriptionID != null) out.RenewsSubscriptionID = line.RenewsSubscriptionID;
                if (line.ReversesOrderLineID != null) out.ReversesOrderLineID = line.ReversesOrderLineID;
                if (line.Description != null) out.Description = line.Description;
                if (line.Dimensions?.length) out.Dimensions = line.Dimensions.map((d) => ({ ...d }));
                return out;
            }),
        };
        if (this._promotionCodes.length) payload.PromotionCodes = [...this._promotionCodes];
        if (this._manualDiscounts.length) payload.ManualDiscounts = this._manualDiscounts.map((d) => ({ ...d }));
        if (this._charges.length) payload.Charges = this._charges.map((c) => ({ ...c }));
        return payload;
    }

    /**
     * Store a decomposition the engine returned, and remember which version of the
     * draft it belongs to so {@link IsPreviewStale} can tell the truth.
     */
    public ApplyPreview(preview: OrderDraftPreview): this {
        this._preview = preview;
        this._previewVersion = this._version;
        return this;
    }

    /** Forget the stored decomposition — e.g. after a failed preview call. */
    public ClearPreview(): this {
        this._preview = null;
        this._previewVersion = -1;
        return this;
    }

    /**
     * The gross the user is currently looking at, or `undefined` when there is no
     * current preview. Pass it as `ExpectedGrossTotal` on confirm so a price that
     * moved underneath them stops the confirm instead of silently booking a
     * different amount.
     */
    public get ConfirmableGrossTotal(): number | undefined {
        if (this.IsPreviewStale) return undefined;
        return this._preview?.Totals?.GrossTotal;
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /**
     * Check the invariants the CLIENT can know about. Deliberately narrow: it
     * checks shape, not policy. Whether a price resolves, whether an account
     * exists, whether a discount exceeds the rep's authority — those are server
     * questions, and approximating them here would produce a UI that disagrees
     * with the engine about whether something is allowed.
     */
    public Validate(): OrderDraftValidationResult {
        const issues: OrderDraftValidationIssue[] = [];

        if (!this._header.CompanyID) {
            issues.push({
                Code: 'HEADER_COMPANY_REQUIRED',
                Section: 'header',
                Severity: 'error',
                Message: 'An owning company is required — it anchors the order document and who can see it.',
            });
        }

        // A tender that cannot be reconciled without a number must have one BEFORE the confirm is
        // attempted. The server refuses it too — this exists so the user is stopped at the field
        // they can fix rather than at a rejection after the fact.
        if (
            this._header.InitialPaymentTypeID &&
            this._header.InitialPaymentRequiresReference &&
            !this._header.InitialPaymentReference?.trim()
        ) {
            issues.push({
                Code: 'PAYMENT_REFERENCE_REQUIRED',
                Section: 'payment',
                Severity: 'error',
                Message:
                    'This tender needs a reference number — a check number, wire confirmation or ' +
                    'transfer id. Without one the payment cannot be matched to the bank statement.',
            });
        }

        if (!this._header.BillToPersonID && !this._header.BillToOrganizationID) {
            issues.push({
                Code: 'BILL_TO_REQUIRED',
                Section: 'parties',
                Severity: 'error',
                Message: 'Say who is paying — a person, an organization, or both.',
            });
        }

        if (!this._lines.length) {
            issues.push({
                Code: 'LINES_REQUIRED',
                Section: 'lines',
                Severity: 'error',
                Message: 'An order needs at least one line.',
            });
        }

        for (const line of this._lines) {
            if (!line.ProductID) {
                issues.push({
                    Code: 'LINE_PRODUCT_REQUIRED',
                    Section: 'lines',
                    Severity: 'error',
                    ClientKey: line.ClientKey,
                    Message: 'Pick a product for this line.',
                });
            }
            if (!Number.isFinite(line.Quantity) || line.Quantity === 0) {
                issues.push({
                    Code: 'LINE_QUANTITY_NONZERO',
                    Section: 'lines',
                    Severity: 'error',
                    ClientKey: line.ClientKey,
                    Message: 'Quantity cannot be zero. Remove the line instead.',
                });
            }
            if (line.UnitPriceWasStated && (line.UnitPrice as number) < 0) {
                issues.push({
                    Code: 'LINE_PRICE_NEGATIVE',
                    Section: 'lines',
                    Severity: 'error',
                    ClientKey: line.ClientKey,
                    Message: 'A unit price cannot be negative. A return is a negative QUANTITY at a positive price.',
                });
            }
            if (line.DiscountPct != null && (line.DiscountPct < 0 || line.DiscountPct > 1)) {
                issues.push({
                    Code: 'LINE_DISCOUNT_RANGE',
                    Section: 'lines',
                    Severity: 'error',
                    ClientKey: line.ClientKey,
                    Message: 'Discount must be between 0 and 100%.',
                });
            }
            if (
                line.ServicePeriodStart &&
                line.ServicePeriodEnd &&
                line.ServicePeriodEnd < line.ServicePeriodStart
            ) {
                issues.push({
                    Code: 'LINE_SERVICE_PERIOD_ORDER',
                    Section: 'lines',
                    Severity: 'error',
                    ClientKey: line.ClientKey,
                    Message: 'The service period ends before it starts.',
                });
            }
        }

        // A reversal order whose lines are all positive is almost certainly a
        // mistake, but the engine is the authority on reversal shape — so warn.
        if (this._header.OrderType === 'Return' && this._lines.length && !this._lines.some((l) => l.IsReversal)) {
            issues.push({
                Code: 'RETURN_WITHOUT_REVERSAL_LINE',
                Section: 'lines',
                Severity: 'warning',
                Message: 'This is a Return but no line reverses anything — check the quantities.',
            });
        }

        for (const discount of this._manualDiscounts) {
            if (!discount.Reason?.trim()) {
                issues.push({
                    Code: 'MANUAL_DISCOUNT_REASON_REQUIRED',
                    Section: 'lines',
                    Severity: 'error',
                    Message: 'A manual discount needs a reason — it is an exception, and exceptions are explained.',
                });
            }
        }

        for (const charge of this._charges) {
            if (!charge.OverrideReason?.trim()) {
                issues.push({
                    Code: 'CHARGE_OVERRIDE_REASON_REQUIRED',
                    Section: 'charges',
                    Severity: 'error',
                    Message: `Overriding the ${charge.ChargeTypeID} charge needs a reason — a silent override is indistinguishable from a bug.`,
                });
            }
        }

        return { IsValid: !issues.some((i) => i.Severity === 'error'), Issues: issues };
    }

    /** Sections carrying at least one error — what drives a red dot on a tab. */
    public get SectionsWithErrors(): OrderDraftSection[] {
        const sections = new Set<OrderDraftSection>();
        for (const issue of this.Validate().Issues) {
            if (issue.Severity === 'error') sections.add(issue.Section);
        }
        return [...sections];
    }

    // ── Change notification ──────────────────────────────────────────────────

    /**
     * Observe mutations. Returns an unsubscribe function.
     *
     * A plain callback list rather than an RxJS subject, so this package stays
     * dependency-free and equally usable from a non-Angular host.
     */
    public Subscribe(handler: (draft: OrderDraft) => void): () => void {
        this._subscribers.push(handler);
        return () => {
            this._subscribers = this._subscribers.filter((h) => h !== handler);
        };
    }

    // ── Copying ──────────────────────────────────────────────────────────────

    /**
     * A deep copy that keeps the same client keys, so a stored preview still
     * matches. Subscribers are NOT copied — a clone is not the original's view.
     */
    public Clone(): OrderDraft {
        const copy = new OrderDraft({ CompanyID: this._header.CompanyID });
        copy._header = { ...this._header };
        copy._lines = this._lines.map((l) => new OrderDraftLine({ ...l, ClientKey: l.ClientKey }));
        copy._promotionCodes = [...this._promotionCodes];
        copy._manualDiscounts = this._manualDiscounts.map((d) => ({ ...d }));
        copy._charges = this._charges.map((c) => ({ ...c }));
        copy._preview = this._preview;
        copy._previewVersion = this._previewVersion;
        copy._version = this._version;
        copy._keySeq = this._keySeq;
        // A clone inherits which fields are still defaults. Without this the copy's constructor
        // would have marked its own — and then `_header` was overwritten wholesale above, so the
        // flags would describe values the copy no longer holds.
        copy._defaulted = new Set(this._defaulted);
        return copy;
    }

    /**
     * Rebuild a draft from a payload — for restoring a persisted draft, or for
     * handing one lane's draft to the other.
     */
    public static FromInput(payload: OrderDraftPayload): OrderDraft {
        const draft = new OrderDraft({ CompanyID: payload.Header.CompanyID });
        draft._header = { ...payload.Header };
        // Nothing in a payload is a default: every value in it was either stated by a user or
        // already persisted. The constructor above flagged its own placeholders, and the line before
        // replaced the header they described — so leaving them set would mute real values in the UI.
        draft._defaulted.clear();
        for (const line of payload.Lines ?? []) {
            // Reuse the incoming key when there is one, so a preview keyed against
            // it still lines up after a round trip.
            const key = line.ClientKey ?? draft.nextKey();
            draft._lines.push(new OrderDraftLine({ ...line, ClientKey: key }));
            draft.bumpKeySeqPast(key);
        }
        draft._promotionCodes = [...(payload.PromotionCodes ?? [])];
        draft._manualDiscounts = (payload.ManualDiscounts ?? []).map((d) => ({ ...d }));
        draft._charges = (payload.Charges ?? []).map((c) => ({ ...c }));
        draft._version = 0;
        return draft;
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private touch(): this {
        this._version++;
        for (const handler of [...this._subscribers]) {
            handler(this);
        }
        return this;
    }

    private nextKey(): string {
        return `L${++this._keySeq}`;
    }

    /**
     * Keep the generator ahead of any key that arrived from outside, so a
     * restored draft cannot mint a key that collides with one it already holds.
     */
    private bumpKeySeqPast(key: string): void {
        const match = /^L(\d+)$/.exec(key);
        if (match) {
            const n = Number(match[1]);
            if (n > this._keySeq) this._keySeq = n;
        }
    }
}

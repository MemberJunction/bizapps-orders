/**
 * ============================================================================
 * WHY THE SHARED SHAPES LIVE IN THIS FILE
 * ============================================================================
 * CodeGen emits each operation's `InputTypeDefinition` / `OutputTypeDefinition`
 * **verbatim** into one `remote_operations.ts`, de-duplicating by exact text and
 * resolving NO imports. So a definition file cannot `import` a sibling — every
 * name it uses must be declared in some definition that also gets emitted.
 *
 * Rather than repeat the order shapes across ten files (byte-identical or the
 * de-dupe fails), the family's shared shapes are declared once, here, in the
 * definition of the operation that is their natural home: `SaveOrder` takes the
 * whole draft, so `OrderDraftInput` and everything under it IS its input.
 * TypeScript hoists interfaces, so the other operations reference these names
 * freely regardless of emission order.
 *
 * NO `import` statements in this file. Ever. They would be emitted verbatim and
 * break the generated module.
 * ============================================================================
 */

/** A line as the client states it. Everything the engine derives is absent by design. */
export interface OrderLineInput {
    /** Client-side identity, so a preview result can be matched back to its row. Not persisted. */
    ClientKey?: string;
    ProductID: string;
    Quantity: number;
    /**
     * Direct entry, and it WINS over every resolved price. Omit it — do not send 0 — to let the
     * pricing pipeline resolve one; zero is a deliberate free line, not "unset".
     */
    UnitPrice?: number;
    DiscountPct?: number;
    /** Explicit service period. Omit it and an event product stamps its own dates. */
    ServicePeriodStart?: string | null;
    ServicePeriodEnd?: string | null;
    /** Ship-to trio. Each side falls back to the header independently. */
    ShipToAddressID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToPersonID?: string | null;
    /** Naming a renewal target IS the statement of who the subscriber is. */
    RenewsSubscriptionID?: string | null;
    /** Set on a return line; the origin is then the sole authority on price, cap and product. */
    ReversesOrderLineID?: string | null;
    Description?: string | null;
    /** Accounting dimension tags, propagated into this line's journal-entry lines. */
    Dimensions?: Array<{ DimensionID: string; DimensionValueID: string }>;
}

/** A charge the caller is asserting or overriding rather than letting the engine compute. Rare. */
export interface OrderChargeInput {
    ChargeTypeID: string;
    Amount: number;
    /** Required when overriding a computed charge — who and when are stamped server-side. */
    OverrideReason?: string | null;
}

/** A manual discount, checked against the acting user's sales authority. */
export interface ManualDiscountInput {
    LineClientKey?: string;
    /** One of these, not both. */
    Percent?: number;
    Amount?: number;
    Reason: string;
}

/** The header fields a caller states. Rollups are absent — triggers own them. */
export interface OrderHeaderInput {
    /** Omit to create; supply to update an existing DRAFT. */
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
    /** Set on a reversing order. */
    ReversesOrderHeaderID?: string | null;
    ReversalReason?: string | null;
    /** Where this order came from, so an LXP purchase is never inferred from a null sales rep. */
    OriginChannel?: string | null;
    OriginExternalID?: string | null;
    /** Initial-payment INTENT. Becomes a real payment only when the order confirms. */
    InitialPaymentTypeID?: string | null;
    InitialPaymentAmount?: number;
    /** Wallet entry to copy an instrument snapshot from. Copied, never shared. */
    SourceCustomerPaymentMethodID?: string | null;
}

/** The whole draft as one payload — what `OrderDraft.ToInput()` produces. */
export interface OrderDraftInput {
    Header: OrderHeaderInput;
    Lines: OrderLineInput[];
    /** Codes to attempt. Losers come back as offered-not-applied rather than silently vanishing. */
    PromotionCodes?: string[];
    ManualDiscounts?: ManualDiscountInput[];
    /** Only for asserting or overriding a charge; ordinary charges are computed. */
    Charges?: OrderChargeInput[];
}

/** One step of an explanation. Every derived number carries its provenance. */
export interface AmountComponent {
    ComponentType: string;
    Label: string;
    Amount: number;
    RunningTotal?: number;
    /** Free-form provenance — the rule, list, band or jurisdiction that produced it. */
    Source?: string | null;
}

/** A tax layer, kept separate from charges so the shared base is visible. */
export interface TaxLayerResult {
    ChargeTypeID: string;
    Name: string;
    JurisdictionName?: string | null;
    Rate: number;
    /** Every layer on one order shares this. Layers never compound. */
    BaseAmount: number;
    Amount: number;
}

/** Why a line taxed at zero. Four very different situations that all print as $0.00. */
export type TaxZeroReason = 'Untaxable' | 'NoNexus' | 'Exempt' | 'NoJurisdiction';

/** A priced line, as the engine sees it. */
export interface OrderLineResult {
    ClientKey?: string;
    LineNumber: number;
    ProductID: string;
    ProductName: string;
    /** The product's owning company — this is what anchors the line's ledger. */
    CompanyID: string;
    CompanyName: string;
    Quantity: number;
    UnitPrice: number;
    /** Which price rule won, and how it was reached. */
    PriceSource?: string | null;
    ProductPriceID?: string | null;
    UnitPriceWasStated: boolean;
    DiscountPct: number;
    DiscountAmount: number;
    ListAmount: number;
    LineTotalNet: number;
    ChargeAmount: number;
    LineTax: number;
    LineTotalGross: number;
    Taxable: boolean;
    TaxZeroReason?: TaxZeroReason | null;
    TaxLayers: TaxLayerResult[];
    ServicePeriodStart?: string | null;
    ServicePeriodEnd?: string | null;
    /** Set when the period came from somewhere other than the caller. */
    ServicePeriodSource?: string | null;
    RevenueRecognitionType?: string | null;
    RequiresFulfillment: boolean;
    Components: AmountComponent[];
}

/** A promotion outcome — including the ones that did NOT apply. */
export interface PromotionResult {
    Code: string;
    PromotionID?: string | null;
    Name: string;
    Scope: 'Line' | 'Order';
    Kind: 'Percent' | 'Fixed';
    Value: number;
    Applied: boolean;
    Amount: number;
    /** Present when Applied is false — the only way to answer "why didn't my code work". */
    NotAppliedReason?: string | null;
    /** Order-scoped promotions must reach the lines; this is where each share went. */
    Allocations?: Array<{ ClientKey?: string; LineNumber: number; Amount: number }>;
}

/** A computed charge. */
export interface ChargeResult {
    ChargeTypeID: string;
    Name: string;
    Sequence: number;
    Basis: string;
    BasisAmount?: number | null;
    Rate?: number | null;
    Amount: number;
    IsTax: boolean;
    JurisdictionName?: string | null;
    IsOverridden: boolean;
    ComputedAmount?: number | null;
}

/** How the taxable base was assembled — the proof that layers do not compound. */
export interface TaxableBaseResult {
    TaxableGoods: number;
    UntaxableGoods: number;
    NonTaxCharges: number;
    Base: number;
}

/** The full decomposition. This is what the order-entry rail renders. */
export interface OrderTotalsResult {
    ListSubtotal: number;
    DiscountTotal: number;
    NetTotal: number;
    ChargeTotal: number;
    TaxTotal: number;
    GrossTotal: number;
    TaxableBase: TaxableBaseResult;
    /** Per-company subtotals — one journal entry per line, grouped for display. */
    ByCompany: Array<{
        CompanyID: string;
        CompanyName: string;
        Net: number;
        Charges: number;
        Tax: number;
        Gross: number;
    }>;
}

/** A journal entry the order will (or did) produce. Read-only everywhere in Orders. */
export interface JournalEntryPreview {
    CompanyID: string;
    CompanyName: string;
    /** Which order line caused it. One entry per line, always. */
    LineNumber?: number | null;
    /** Set once the entry exists; null while previewing. */
    JournalEntryID?: string | null;
    EntryType: string;
    Balanced: boolean;
    Lines: Array<{ Side: 'Dr' | 'Cr'; AccountRole: string; AccountName: string; Amount: number }>;
}

/** What confirming will do to a subscription. */
export interface SubscriptionDecisionPreview {
    Action: 'Create' | 'Extend' | 'Renew' | 'None';
    SubscriptionID?: string | null;
    SubscriptionNumber?: string | null;
    HolderName?: string | null;
    BeneficiaryName?: string | null;
    BenefitModel?: string | null;
    CoverageThrough?: string | null;
    /** Set when a partial first period scaled the line's quantity. */
    ProrationFactor?: number | null;
    ProratedLineNumber?: number | null;
    Notes?: string | null;
}

/** A grant that will be issued, with the policy that decided its shape. */
export interface EntitlementGrantPreview {
    ProductEntitlementID: string;
    EntitlementName: string;
    BeneficiaryName?: string | null;
    /** Resolved down the same chain taxability uses: product → category → ancestors → type. */
    GrantTiming?: string | null;
    QuantityMode?: string | null;
    ValidityMode?: string | null;
    Quantity?: number | null;
    ValidFrom?: string | null;
    ValidTo?: string | null;
    Notes?: string | null;
}

/** A sales rule that will escalate rather than refuse. */
export interface ApprovalRequirementPreview {
    SalesRuleID: string;
    RuleName: string;
    Reason: string;
    ApproverRoleName?: string | null;
}

/** Something that makes the operation impossible, in the words of the rule that failed. */
export interface BlockerResult {
    Code: string;
    Message: string;
    /** Where to go to fix it, when there is somewhere. */
    ResolutionHint?: string | null;
    LineNumber?: number | null;
}

/**
 * Input for `Orders.SaveOrder`.
 *
 * Creates or updates a DRAFT order and its lines in ONE transaction. It never
 * confirms — `Orders.ConfirmOrder` is the separate, deliberate step, because
 * confirming books journal entries and is not undoable.
 */
export interface OrdersSaveOrderInput {
    Draft: OrderDraftInput;
    /**
     * Return the priced result without writing. Equivalent to `Orders.PreviewOrder`,
     * offered here so a caller holding a draft has one entry point.
     */
    Preview?: boolean;
}

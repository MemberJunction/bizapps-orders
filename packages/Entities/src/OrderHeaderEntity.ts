/**
 * @fileoverview `OrderHeaderEntity` — the order rules that hold on BOTH tiers.
 *
 * WHY THIS LAYER EXISTS
 *
 * Every order rule used to live in `OrderEntityServer`, in a server-only package. That meant the
 * browser could compose an order that the server would refuse, and only find out after a round
 * trip — and it meant a rule enforced "in the order screen" was enforced nowhere at all the moment
 * anything else saved an order. This codebase has found that shape three times.
 *
 * So the rules split by what they NEED, not by where they were written:
 *
 *   · Here — anything decidable from the record and its lines alone. No database, no engine, no
 *     provider. Runs in the browser before a round trip and again on the server, because the server
 *     subclass extends this one and `super.Validate()` still fires.
 *   · `OrderEntityServer` — anything that must read or write the database: pricing, promotions,
 *     charges and tax, journal entries, subscriptions, sequence numbers.
 *
 * `ClassFactory` priority auto-increments by load order, so the server subclass — registered later
 * because it is loaded later — wins server-side with no configuration, while the browser resolves
 * to this one and keeps the `Lines` collection the generated class declares.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not override `Save()`. A shared class that persisted would have to work on a provider
 * that cannot open a transaction, which is exactly the split that made composite saves server-only
 * before MJ 6.1. Persistence stays with the server subclass; the browser ships the whole graph in
 * one `MJ.SaveEntityGraph` call and the server runs the same executor.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { BaseEntity, EmbeddedRecord, ValidationErrorInfo, ValidationErrorType, ValidationResult, RunView, type FieldValueCollection, type IRunViewProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { mjBizAppsCommonAddressEntity } from '@mj-biz-apps/common-entities';
import { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersPaymentDetailEntity } from './generated/entity_subclasses';
import { CanOfferConfirm, CanTransition, IsBooked, type TransitionVerdict } from './OrderStatusBehavior';
import { ResolveActiveEmployerOrganization } from './PartyAffiliationBehavior';
import { PromotionCodesCompanion } from './PromotionCodesCompanion';
import { InitialPaymentIntentCompanion } from './InitialPaymentIntentCompanion';
import { KeptPartyOrganizationsCompanion } from './KeptPartyOrganizationsCompanion';
import { IsSavePopulatedFieldError } from './save-populated-fields';
import { ParseDisplacedTermStart, type DisplacedTermStart } from './displaced-term-start';

const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';

/** What {@link OrderHeaderEntity.Confirm} reports beyond success. */
export interface OrderConfirmOutcome {
    /** Subscription lines whose stated start the confirm replaced. Empty when none moved. */
    DisplacedTermStarts: DisplacedTermStart[];
}
import { OrdersEngine } from './pricing/OrdersEngine';
import { anyFieldIsDirty } from './field-dirty';
import { AsDateValue, TodayAsDateValue } from './date-cell';
import { ParseAddressSnapshot, type OrderAddressSnapshot } from './order-address-snapshot';
import {
    BookedMoneyEditMessage,
    ORDER_HEADER_MONEY_FIELDS,
    ORDER_HEADER_SET_ONCE_FIELDS,
    ORDER_LINE_MONEY_FIELDS,
} from './booked-money';

/** The order editor's sections, in the order the screen shows them. */
/**
 * An organization {@link OrderHeaderEntity.ClearPersonParty} cleared because it was the cleared
 * person's employer, with no record that a default put it there (#356). The form offers to undo it.
 */
export interface PartyOrganizationClear {
    Field: 'BillToOrganizationID' | 'ShipToOrganizationID';
    OrganizationID: string;
    /** The cleared person whose employer it is. */
    FromPersonID: string;
}

/**
 * The sentence the order form shows after {@link OrderHeaderEntity.ClearPersonParty} clears
 * organizations by the employer rule, e.g. "Removed Example Co as the bill-to and ship-to
 * organization: it is the previous person's employer."
 *
 * @param names - Each field's organization name as it read before the clear; null when unknown.
 */
export function DescribeClearedEmployers(
    cleared: readonly PartyOrganizationClear[],
    names: Readonly<Record<PartyOrganizationClear['Field'], string | null | undefined>>,
): string {
    const roles = cleared.map((c) => (c.Field === 'BillToOrganizationID' ? 'bill-to' : 'ship-to'));
    const name = cleared.map((c) => names[c.Field]).find((n) => !!n) ?? 'the organization';
    const sameOrg = cleared.every((c) => c.OrganizationID.toLowerCase() === cleared[0].OrganizationID.toLowerCase());
    const subject = sameOrg ? name : 'the organizations';
    return `Removed ${subject} as the ${roles.join(' and ')} organization${sameOrg ? '' : 's'}: ` +
        `${sameOrg ? 'it is' : 'they are'} the previous person's employer.`;
}

export type OrderEditorSection = 'header' | 'parties' | 'lines' | 'charges' | 'payment';

/** Statuses that mean the order has been booked to the ledger (plan D8). */
const BOOKED_STATUSES = new Set(['Confirmed']);

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Headers')
export class OrderHeaderEntity extends mjBizAppsOrdersOrderHeaderEntity {
    /**
     * True when any of the named fields has unsaved changes. See {@link anyFieldIsDirty}.
     */
    public FieldIsDirty(...fieldNames: string[]): boolean {
        return anyFieldIsDirty(this, fieldNames);
    }

    /**
     * Promotion codes the customer presented, riding with the order across the wire.
     *
     * Registered HERE rather than on the server subclass so a browser has it: the whole point is
     * that a code typed on screen reaches the engine. See `PromotionCodesCompanion` for why this is
     * a companion and not a related-record collection — in short, a code has no child row, and only
     * the engine can turn one into an `OrderAdjustment`.
     */
    public readonly PromotionCodes = this.RegisterCompanion(new PromotionCodesCompanion(this));

    /**
     * Check / wire / transfer number typed at entry. Not a column — it rides as a companion
     * and `OrderEntityServer.createInitialPayment` turns it into a `PaymentDetail`.
     */
    public readonly InitialPaymentIntent = this.RegisterCompanion(new InitialPaymentIntentCompanion(this));

    /**
     * Party organizations to keep through this save's replacement of that side's person. See
     * {@link KeepPartyOrganization}.
     */
    public readonly KeptPartyOrganizations = this.RegisterCompanion(new KeptPartyOrganizationsCompanion(this));

    public ClearInitialPaymentDetail(): void {
        this.InitialPaymentIntent.Reference = null;
        this.GetCompanion<EmbeddedRecord>('InitialPaymentDetailID_Object')?.Clear();
    }

    public ClearBillToAddress(): void {
        this.GetCompanion<EmbeddedRecord>('BillToAddressID_Object')?.Clear();
    }

    public ClearShipToAddress(): void {
        this.GetCompanion<EmbeddedRecord>('ShipToAddressID_Object')?.Clear();
    }

    /** The bill-to address this order was confirmed with, or null before it is confirmed. */
    public get BillToAddressAsSold(): OrderAddressSnapshot | null {
        return ParseAddressSnapshot(this.BillToAddressSnapshot);
    }

    /** The ship-to address this order was confirmed with, or null before it is confirmed. */
    public get ShipToAddressAsSold(): OrderAddressSnapshot | null {
        return ParseAddressSnapshot(this.ShipToAddressSnapshot);
    }

    public get InitialPaymentReference(): string | null {
        return (
            this.InitialPaymentDetailID_Object?.ReferenceNumber ??
            this.InitialPaymentIntent.Reference ??
            null
        );
    }

    public set InitialPaymentReference(value: string | null) {
        const trimmed = (value ?? '').trim();
        const ref = trimmed.length ? trimmed : null;
        this.InitialPaymentIntent.Reference = ref;
        if (ref) {
            const detail = this.InitialPaymentDetailID_EnsureObject();
            detail.ReferenceNumber = ref;
            if (this.CompanyID && !detail.CompanyID) {
                detail.CompanyID = this.CompanyID;
            }
            if (this.InitialPaymentTypeID && !detail.PaymentTypeID) {
                detail.PaymentTypeID = this.InitialPaymentTypeID;
            }
        } else if (this.InitialPaymentDetailID_Object) {
            this.InitialPaymentDetailID_Object.ReferenceNumber = null;
            if (this.isInitialPaymentDetailEmpty(this.InitialPaymentDetailID_Object)) {
                this.ClearInitialPaymentDetail();
            }
        }
    }

    private isInitialPaymentDetailEmpty(detail: mjBizAppsOrdersPaymentDetailEntity): boolean {
        return (
            !detail.ReferenceNumber &&
            !detail.Last4 &&
            !detail.BankName &&
            !detail.RoutingLast4 &&
            !detail.AccountLast4 &&
            !detail.ProviderCustomerRef &&
            !detail.ProviderInstrumentRef &&
            !detail.HolderName
        );
    }

    /**
     * True while THIS save is the booking save, and it stays true across `ConfirmedAt` being set.
     *
     * `willBookOnThisSave()` answers "would a save starting now book?", which is the right question
     * everywhere except inside the booking save itself. The server subclass stamps `ConfirmedAt`
     * before it calls `super.Save()`, and `ConfirmedAt` is exactly what makes `willBookOnThisSave()`
     * return false — so validation running inside that `super.Save()` was asking a question whose
     * answer had already been flipped by its own caller, three lines earlier. Every rule gated on it
     * was therefore skipped on the one save it existed to guard.
     *
     * That is why a confirm with zero lines (ORD-000030) and a confirm with no payer (ORD-000028,
     * which posted Dr A/R 99 / Cr Sales 99) both went through. Two separate defects had to coincide
     * — this one and a skipped `ValidateAsync` — and fixing either alone changes nothing, which is
     * why the block looked correct for as long as it did.
     *
     * `protected` because the server subclass sets it around its booking walk.
     */
    protected bookingInFlight = false;

    /** True when this save is the first transition into a booked status (plan D8). */
    protected willBookOnThisSave(): boolean {
        if (this.bookingInFlight) return true;
        if (!BOOKED_STATUSES.has(this.Status)) return false;
        if (this.ConfirmedAt) return false; // already booked — never re-book
        return true;
    }

    /**
     * Whether the status change on this save is a legal move.
     *
     * The PERSISTED status is the `from`: `OldValue` is what is on disk, so re-saving an unchanged
     * row is a no-op transition and a genuine move is measured against what was really there rather
     * than against whatever this object was last set to.
     *
     * `CK_OrderHeader_Status` enforces the legal SET of statuses and nothing enforced the legal
     * MOVES, which is how `Voided → Confirmed` used to save: a voided order came back to life
     * keeping the journal entries its reversal had already unwound.
     */
    /**
     * The lifecycle verdict on this save's status change, with no side effects.
     *
     * Separate from `Validate()` because the server subclass has to ask this question EARLY —
     * before it prices lines, mints an order number or posts anything — while the rest of
     * `Validate()` cannot be asked that early: it includes the generated NOT NULL field checks, and
     * `OrderNumber`, `Company` and each line's `UnitPrice` are all populated by the save itself.
     * Running the whole of `Validate()` up front therefore fails on fields the save was about to
     * fill in.
     */
    protected statusTransitionVerdict(): TransitionVerdict {
        const from = this.IsSaved ? (this.GetFieldByName('Status')?.OldValue as string | undefined) : null;
        return CanTransition(from ?? null, this.Status);
    }

    /** The refusal message for an illegal move, shared by `Validate()` and the server's early gate. */
    protected statusTransitionRefusal(verdict: TransitionVerdict): string {
        return `${verdict.Reason} (order ${this.OrderNumber ?? 'not yet numbered'}).`;
    }

    /**
     * Rules decidable without touching the database.
     *
     * `super.Validate()` fans out to every declared related-record collection, so each line's own
     * `Validate()` runs here too and its failures arrive attributed by position (`Lines[3].Quantity`).
     * That replaces a hand-written loop that only existed on the server.
     */
    public override NewRecord(newValues?: FieldValueCollection): boolean {
        const created = super.NewRecord(newValues);
        if (created) {
            if (this.OrderDate == null) {
                this.OrderDate = TodayAsDateValue();
            }
            if (!this.Status) {
                this.Status = 'Draft';
            }
        }
        return created;
    }

    public override Validate(): ValidationResult {
        if (this.InitialPaymentDetailID_Object) {
            if (this.isInitialPaymentDetailEmpty(this.InitialPaymentDetailID_Object)) {
                this.ClearInitialPaymentDetail();
            } else {
                if (this.CompanyID && !this.InitialPaymentDetailID_Object.CompanyID) {
                    this.InitialPaymentDetailID_Object.CompanyID = this.CompanyID;
                }
                if (this.InitialPaymentTypeID && !this.InitialPaymentDetailID_Object.PaymentTypeID) {
                    this.InitialPaymentDetailID_Object.PaymentTypeID = this.InitialPaymentTypeID;
                }
            }
        }

        const result = super.Validate();
        this.dropSavePopulatedFieldErrors(result);
        this.refuseBookedMoneyEdits(result);
        this.refuseBookedAddressEdits(result);
        this.refuseBookedPaymentTermsEdit(result);

        const verdict = this.statusTransitionVerdict();
        if (!verdict.Allowed) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'Status',
                    this.statusTransitionRefusal(verdict),
                    this.Status,
                    ValidationErrorType.Failure,
                ),
            );
        }

        if (this.willBookOnThisSave()) {
            // A CONFIRMED ORDER MUST NAME SOMEONE TO BILL. A confirmed order IS the receivable in
            // this app — there is no separate invoice record — so a booked order with neither a
            // bill-to person nor a bill-to organization is a receivable owed by nobody. It debits
            // Accounts Receivable, appears in the balance, and can never be aged, chased or
            // collected, because every collections surface groups by the payer key that is null on
            // it. Draft and Quoted are deliberately exempt: you take an order before you know who is
            // paying, and forcing the payer up front would break order entry.
            if (!this.BillToPersonID && !this.BillToOrganizationID) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'BillToOrganizationID',
                        `Order ${this.OrderNumber ?? ''} cannot be confirmed without a customer — set a ` +
                            `bill-to person or a bill-to organization. A confirmed order is the receivable, ` +
                            `so one with no payer could never be collected.`,
                        this.BillToOrganizationID,
                        ValidationErrorType.Failure,
                    ),
                );
            }

            // AND IT MUST HAVE SOMETHING TO BOOK — but only where that can be known for CERTAIN
            // without the database.
            //
            // An empty collection means "no lines" only when there cannot be any on disk: a record
            // that was never saved, or one whose collection was actually loaded. On a saved order
            // with an unloaded collection, empty means "unknown" — and treating it as zero would
            // refuse a perfectly good confirm of an order whose lines are sitting in the table.
            // `OrderEntityServer.ValidateAsync` settles that case against the database.
            //
            // Note `IsLoaded` alone is not the test: `Add()` does not mark a collection loaded, so
            // a new order composed in the browser has lines and `IsLoaded === false`.
            if (this.Lines.Count === 0 && (!this.IsSaved || this.Lines.IsLoaded)) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Status',
                        `Order ${this.OrderNumber ?? ''} cannot be confirmed with no lines — there would ` +
                            `be nothing to book.`,
                        this.Status,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        }

        return result;
    }

    /**
     * `super.Validate()` includes generated NOT NULL checks for fields this save
     * is about to fill in (`OrderNumber`, each new line's `UnitPrice` / `CompanyID`
     * / `LineNumber`). Fast Entry and the editor gate confirm on `Validate()`, so
     * those checks disabled the button on every complete unsaved order.
     *
     * Same reason `OrderEntityServer.Save()` refuses to run the full `Validate()`
     * before it mints the number. After the first save the values exist, so an
     * empty one is a real error and is kept.
     */
    private dropSavePopulatedFieldErrors(result: ValidationResult): void {
        const kept = result.Errors.filter(
            (error) =>
                !IsSavePopulatedFieldError(
                    error.Source ?? '',
                    this.IsSaved,
                    (index) => this.Lines.Items[index]?.IsSaved === true,
                ),
        );
        if (kept.length === result.Errors.length) return;
        result.Errors = kept;
        result.Success = kept.every((error) => error.Type !== ValidationErrorType.Failure);
    }

    /** Whether this order is booked to the ledger right now. */
    public get IsBookedOrder(): boolean {
        return IsBooked(this.Status);
    }

    /**
     * True when money composition is frozen: the order was already booked
     * *before* this save. The booking save itself (Draft/Quoted → Confirmed)
     * must still write the figures it just computed. A brand-new unsaved row
     * is never locked, including back-office create-as-Confirmed.
     */
    public get MoneyLocked(): boolean {
        if (!this.IsSaved || this.bookingInFlight) return false;
        const from = this.GetFieldByName('Status')?.OldValue as string | undefined;
        return IsBooked(from ?? '');
    }

    /**
     * Refuse adds / removes / reprices / tender restatements after booking.
     * The booking save itself still has to write the figures it just computed.
     */
    private refuseBookedMoneyEdits(result: ValidationResult): void {
        if (!this.MoneyLocked) return;

        const dirtyLineMoney: string[] = [];
        let newLineCount = 0;
        for (const line of this.Lines.Items) {
            if (!line.IsSaved) {
                newLineCount += 1;
                continue;
            }
            // `Lines.Items` is typed as the GENERATED line class, not the OrderLineEntity
            // subclass that carries FieldIsDirty, so go through the helper directly.
            for (const name of ORDER_LINE_MONEY_FIELDS) {
                if (anyFieldIsDirty(line, [name])) {
                    dirtyLineMoney.push(name);
                }
            }
        }

        const dirtyHeaderMoney: string[] = [];
        for (const name of ORDER_HEADER_MONEY_FIELDS) {
            if (this.FieldIsDirty(name)) {
                dirtyHeaderMoney.push(name);
            }
        }
        for (const name of ORDER_HEADER_SET_ONCE_FIELDS) {
            const field = this.GetFieldByName(name);
            if (field?.Dirty && field.OldValue != null) {
                dirtyHeaderMoney.push(name);
            }
        }

        const message = BookedMoneyEditMessage({
            NewLineCount: newLineCount,
            RemovedLineCount: this.Lines.Removed.length,
            DirtyLineMoneyFields: dirtyLineMoney,
            ChargesChanged: this.Charges.IsLoaded && this.Charges.Dirty,
            AdjustmentsChanged: this.Adjustments.IsLoaded && this.Adjustments.Dirty,
            DirtyHeaderMoneyFields: dirtyHeaderMoney,
        });
        if (!message) return;

        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'Status',
                message,
                this.Status,
                ValidationErrorType.Failure,
            ),
        );
    }

    /**
     * True only for the server's own write of an approved `Terms` concession. The server subclass overrides
     * it; here, where any caller could set a flag, nothing is sanctioned.
     */
    protected PaymentTermsChangeSanctioned(): boolean {
        return false;
    }

    /**
     * Refuse a change to a confirmed order's payment terms (#309).
     *
     * Terms are a commercial concession: they move when the cash arrives without changing the price. On a
     * confirmed order they change only through an approved `Terms` concession, which the server applies.
     * `trg_OrderHeader_ImmutableAfterConfirm` (51018) holds the same rule at the database. `DueDate`
     * stays correctable, and MJ record-change tracking records every change to it.
     */
    private refuseBookedPaymentTermsEdit(result: ValidationResult): void {
        if (!this.MoneyLocked || !this.FieldIsDirty('PaymentTermsTypeID') || this.PaymentTermsChangeSanctioned()) return;
        const order = `Order ${this.OrderNumber ?? ''}`.trim();
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'PaymentTermsTypeID',
                `${order} is confirmed, so its payment terms cannot be edited directly. ` +
                    `Amend them with Orders.AmendArrangement; the change takes effect when its Terms concession is approved.`,
                this.PaymentTermsTypeID,
                ValidationErrorType.Failure,
            ),
        );
    }

    /**
     * Set by the server subclass while it writes the address snapshots itself, so the rule below can
     * tell its own write from a caller's. Cleared once the save returns.
     */
    protected addressSnapshotsStamped = false;

    /**
     * Refuse a change to where a confirmed order was sold (golive #263).
     *
     * A confirmed order keeps the addresses it was sold to for the life of the order: the state a
     * sale counts in is decided by where the customer was on the date of sale. An address that is
     * set cannot be replaced or cleared. An empty one may be filled, as an empty bill-to party may
     * be filled after confirm, and the server snapshots it on that save.
     * `trg_OrderHeader_ImmutableAfterConfirm` (51015) and
     * `trg_OrderLine_ImmutableAfterConfirm` (51016) hold the same rule at the database; this
     * says so before the round trip, against the field that was changed.
     *
     * The snapshots are the server's to write, from the Address rows, so a change to one from
     * anywhere else is refused on any order.
     */
    private refuseBookedAddressEdits(result: ValidationResult): void {
        const refuse = (source: string, message: string): void => {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo(source, message, null, ValidationErrorType.Failure));
        };
        const wasSet = (entity: BaseEntity, name: string): boolean => entity.GetFieldByName(name)?.OldValue != null;

        if (!this.addressSnapshotsStamped) {
            for (const name of ['BillToAddressSnapshot', 'ShipToAddressSnapshot'] as const) {
                if (this.FieldIsDirty(name)) {
                    refuse(name, `${name} is written by the server from the Address row and cannot be set directly.`);
                }
            }
            this.Lines.Items.forEach((line, index) => {
                if (anyFieldIsDirty(line, ['ShipToAddressSnapshot'])) {
                    refuse(
                        `Lines[${index}].ShipToAddressSnapshot`,
                        'ShipToAddressSnapshot is written by the server from the Address row and cannot be set directly.',
                    );
                }
            });
        }

        if (!this.MoneyLocked) return;
        const order = `Order ${this.OrderNumber ?? ''}`.trim();
        for (const name of ['BillToAddressID', 'ShipToAddressID'] as const) {
            if (this.FieldIsDirty(name) && wasSet(this, name)) {
                refuse(
                    name,
                    `${order} is confirmed, so its ${name === 'BillToAddressID' ? 'bill-to' : 'ship-to'} address ` +
                        `cannot be replaced or cleared: the order keeps the address it was sold to. Use a reversal order.`,
                );
            }
        }
        this.Lines.Items.forEach((line, index) => {
            if (line.IsSaved && anyFieldIsDirty(line, ['ShipToAddressID']) && wasSet(line, 'ShipToAddressID')) {
                refuse(
                    `Lines[${index}].ShipToAddressID`,
                    `${order} is confirmed, so line ${line.LineNumber ?? index + 1}'s ship-to address cannot be ` +
                        `replaced or cleared: the line keeps the address it was sold to. Use a reversal order.`,
                );
            }
        });
    }

    /**
     * Which editing SECTION each validation failure belongs to.
     *
     * The order editor shows errors against the section that owns the field — an unreachable payer
     * lights up "parties", a bad quantity lights up "lines" — so the user is stopped at the field
     * they can fix rather than at a rejection after the fact.
     *
     * This lives on the shared subclass because it is metadata-only: it reads the `Source` a
     * `ValidationErrorInfo` already carries and maps it to a section. No database, no provider, so
     * the browser gets it for free and the server does not need it at all.
     *
     * It replaces `OrderDraft.SectionsWithErrors`, which computed the same thing from a parallel
     * model of the order that had to be kept in step with the entity by hand.
     */
    public static SectionForField(source: string | null | undefined): OrderEditorSection {
        const field = (source ?? '').trim();
        if (!field) return 'header';
        // Companion failures arrive positionally attributed — `Lines[3].Quantity`.
        if (/^Lines\[/i.test(field)) return 'lines';
        switch (field) {
            case 'BillToPersonID':
            case 'BillToOrganizationID':
            case 'BillToAddressID':
            case 'ShipToPersonID':
            case 'ShipToOrganizationID':
            case 'ShipToAddressID':
                return 'parties';
            case 'InitialPaymentTypeID':
            case 'InitialPaymentAmount':
            case 'InitialPaymentReference':
            case 'InitialPaymentDetailID':
                return 'payment';
            default:
                return 'header';
        }
    }

    /**
     * The sections currently holding at least one error, for the editor's section chrome.
     *
     * Runs the real `Validate()` — the same rules the server enforces — so a section cannot light up
     * for a reason the save would not also refuse, and cannot stay quiet for one it would.
     */
    public SectionsWithErrors(): OrderEditorSection[] {
        const result = this.Validate();
        if (result.Success) return [];
        const sections = new Set<OrderEditorSection>();
        for (const e of result.Errors) {
            sections.add(OrderHeaderEntity.SectionForField(e.Source));
        }
        return [...sections];
    }

    /**
     * Save, or throw with the reason the engine gave.
     *
     * WHY THIS IS ON THE ENTITY. It was a method on an Angular service, which
     * `docs/ui-architecture.md` names as the wrong place: "if a method on it loads, saves, validates
     * or maps entity data, it is in the wrong place." The reason it existed at all is the boolean
     * return — `Save()` answers true/false and leaves the reason on `LatestResult`, so every caller
     * wrote the same three lines to turn that into something a person could read. Writing them once
     * is right; writing them in a service is not.
     *
     * A non-Angular host gets this too, which is the test the guidelines actually apply.
     *
     * @throws The engine's own message — never a generic one. "Order ORD-000123 cannot be confirmed
     *         without a customer" is actionable; "the order could not be saved" is not.
     */
    public async SaveOrThrow(): Promise<void> {
        if (!(await this.Save())) {
            throw new Error(this.LatestResult?.CompleteMessage?.trim() || 'The order could not be saved.');
        }
    }

    /**
     * Whether the Confirm verb should be offered, and why not if it shouldn't.
     *
     * Status-only half is {@link CanOfferConfirm}. This adds the two facts the
     * screen already knows: a payer, and at least one line. The UI stays dumb —
     * it asks this, then calls {@link Confirm}.
     */
    public ConfirmEligibility(): TransitionVerdict {
        const from = this.IsSaved
            ? ((this.GetFieldByName('Status')?.OldValue as string | undefined) ?? this.Status)
            : this.Status || 'Draft';
        const status = CanOfferConfirm(from);
        if (!status.Allowed) return status;
        if (!this.BillToPersonID && !this.BillToOrganizationID) {
            return { Allowed: false, Reason: 'Need a bill-to party.' };
        }
        if (this.Lines.Count === 0 && (!this.IsSaved || this.Lines.IsLoaded)) {
            return { Allowed: false, Reason: 'Need a line.' };
        }
        const undated = this.LinesMissingServicePeriod();
        if (undated.length > 0) {
            const numbers = undated.map((l) => l.LineNumber).filter((n) => n != null);
            const which = numbers.length > 0 ? `Line ${numbers.join(', ')}` : 'A line';
            return {
                Allowed: false,
                Reason: `${which} needs a service period (start and end date) before this can be confirmed.`,
            };
        }
        return { Allowed: true };
    }

    /**
     * Lines whose recognition type needs a service period (`RequiresServicePeriod`), that nothing
     * will date, and that do not have both dates.
     *
     * Event lines are left out because the save stamps them from the event, and subscription lines
     * because it stamps them from the term. What remains has no source but the person entering the
     * order. The browser asks this before offering Confirm, so the user is told before the server's
     * recognition driver refuses the booking.
     *
     * Reads `OrdersEngine`; the caller loads it. With the cache empty nothing counts, which leaves
     * the decision to the server.
     */
    public LinesMissingServicePeriod(): OrderHeaderEntity['Lines']['Items'] {
        const engine = OrdersEngine.Instance;
        return this.Lines.Items.filter(
            (line) =>
                !(line.ServicePeriodStart && line.ServicePeriodEnd) &&
                engine.ServicePeriodSource(line.ProductID) === 'Line',
        );
    }

    /**
     * Confirm — the irreversible step.
     *
     * Setting the status and saving IS the confirm: the server subclass sees the transition into a
     * booked state and books — journal entries, subscriptions, entitlements, the initial payment —
     * in one transaction, or refuses with a reason and writes nothing.
     *
     * There is no dry run in front of it. Every rule is enforced by the engine itself, and a browser
     * has already run the tier-independent ones through `Validate()`, so the user is told about a
     * missing payer without a round trip.
     *
     * The confirm can move a subscription line's dates: a line for a product the subscriber already
     * holds extends that subscription, and the new term starts the day after current coverage ends,
     * whatever start the line stated. The confirm writes the settled term onto lines it loads
     * itself, so the lines held here still carry the stated dates; they are reloaded to show what
     * was stored, and the lines whose stated start moved are returned for the caller to show.
     */
    public async Confirm(): Promise<OrderConfirmOutcome> {
        if (this.IsSaved && !this.Lines.IsLoaded) {
            await this.Lines.Load();
        }
        await this.SaveStatus('Confirmed', 'The order could not be confirmed.');

        if (!this.IsSaved) return { DisplacedTermStarts: [] };
        await this.Lines.Load(true);
        return { DisplacedTermStarts: await this.LoadDisplacedTermStarts() };
    }

    /**
     * Subscription lines of this order whose stated start the confirm replaced, read from the
     * `Extended` events the confirm recorded. Empty for an order that is not booked.
     *
     * Read from the events rather than worked out on the client so every path that confirms an
     * order (the form, fast entry, a deal close, an API call) leaves the same record, and a screen
     * opened later shows the same notice. Lines are named from `Lines` when it is loaded.
     */
    public async LoadDisplacedTermStarts(): Promise<DisplacedTermStart[]> {
        if (!this.IsSaved || !this.IsBookedOrder) return [];
        const provider = this.ProviderToUse as unknown as IRunViewProvider;
        if (!provider) return [];

        const result = await new RunView(provider).RunView<{ EventData: string | null }>(
            {
                EntityName: SUBSCRIPTION_EVENT_ENTITY,
                ExtraFilter: `RelatedOrderHeaderID='${this.ID}' AND EventType='Extended'`,
                Fields: ['EventData'],
                OrderBy: 'OccurredAt',
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        if (!result?.Success) {
            throw new Error(`Could not read this order's subscription events: ${result?.ErrorMessage ?? 'unknown error'}`);
        }
        const lines = this.Lines.IsLoaded ? this.Lines.Items : [];
        return (result.Results ?? [])
            .map((row) => ParseDisplacedTermStart(row.EventData, lines))
            .filter((d): d is DisplacedTermStart => d !== null);
    }

    /**
     * Move to `status` by saving, and put the previous status back if the save is refused.
     *
     * Without the restore a refused transition stays on the object as an unsaved edit: the screen
     * reads the new status, `IsBookedOrder` hides the verbs that depend on it, and every later save
     * re-sends the same transition and is refused the same way, whatever else changed.
     *
     * Throws with the server's reason.
     */
    public async SaveStatus(status: OrderHeaderEntity['Status'], fallbackMessage: string): Promise<void> {
        const previous = this.Status;
        this.Status = status;
        if (!(await this.Save())) {
            this.Status = previous;
            throw new Error(this.LatestResult?.CompleteMessage?.trim() || fallbackMessage);
        }
    }

    /**
     * Load this order and its lines together — the state an editor needs.
     *
     * Two calls and no mapping layer: the object bound to the screen is the object that will be
     * saved. `Lines` is `Load: 'explicit'`, so it has to be asked for; asking here means no caller
     * can forget and then wonder why an order with lines renders as empty.
     *
     * @returns False when the order does not exist, leaving this entity unloaded.
     */
    public async LoadWithLines(orderHeaderID: string): Promise<boolean> {
        if (!(await this.Load(orderHeaderID))) return false;
        await this.Lines.Load();
        return true;
    }


    /**
     * Party fields {@link ApplyPersonPartyDefaults} filled in during this edit, keyed by field
     * name, with the person each fill came from. It is what lets {@link ClearPersonParty} take
     * a copy away with the person it was copied from without touching a value the user chose.
     * In memory only: an order loaded later has no record of what was filled in.
     */
    private readonly partyFills = new Map<string, { Value: string; FromPersonID: string }>();

    /**
     * Party fields {@link ClearPersonParty} emptied because they were copies of the person being
     * cleared, or that person's employer. They count as filled-in, not as emptied by the user, so
     * a replacement person can bring their own copy and employer. A person field leaves the set
     * when the user changes it directly.
     */
    private readonly partyCopiesCleared = new Set<string>();

    /**
     * Person-level party defaults after the user sets a bill-to / ship-to person on the form.
     *
     * 1. Copy the person to the other side when that side's person is null.
     * 2. For each side that has a person and no org, stamp the longest-lasting
     *    active Employee relationship's organization.
     *
     * Does not overwrite an org the user already chose, and does not refill a party field the
     * user emptied in this save. Skips booked/voided orders. The server save runs
     * {@link ApplySavePartyDefaults} instead.
     */
    public async ApplyPersonPartyDefaults(changed: 'BillTo' | 'ShipTo'): Promise<void> {
        if (this.Status === 'Voided' || this.IsBookedOrder) return;

        this.copyPersonAcross(changed, changed === 'BillTo' ? 'ShipTo' : 'BillTo');

        await this.AutoPopulateEmployerOrganization('BillTo');
        await this.AutoPopulateEmployerOrganization('ShipTo');
    }

    /**
     * Party defaults the server save applies, for writers that do not go through the form —
     * checkout, renewals, a guest claim, an API call.
     *
     * Works only from what changed in this save, so a party field emptied by an earlier save is
     * never refilled by a later one:
     *
     * 1. Copy the bill-to person into an empty ship-to when the bill-to person changed in this
     *    save. Never the other way: an empty ship-to already means "same as bill to", while
     *    filling an empty bill-to would change who pays.
     * 2. On a side whose person this save replaces with another, clear the organization when it
     *    is the previous person's employer, by the rule {@link ClearPersonParty} applies on the
     *    form (#542). Not when this save also sets that organization, and not when the writer
     *    kept it ({@link KeepPartyOrganization}).
     * 3. Stamp the employer organization only on a side whose person changed in this save.
     *
     * Skips booked/voided orders.
     */
    public async ApplySavePartyDefaults(): Promise<void> {
        if (this.Status === 'Voided' || this.IsBookedOrder) return;

        if (this.isChangedThisSave('BillToPersonID')) this.copyPersonAcross('BillTo', 'ShipTo');

        for (const side of ['BillTo', 'ShipTo'] as const) await this.clearReplacedPersonsEmployer(side);

        for (const side of ['BillTo', 'ShipTo'] as const) {
            if (this.isChangedThisSave(`${side}PersonID`)) await this.AutoPopulateEmployerOrganization(side);
        }
    }

    /**
     * Keep `field`'s organization through this save's replacement of that side's person, so the
     * server save does not clear it as the previous person's employer. For writers that replace a
     * person and mean the organization to stay; an organization set in the same save needs no call.
     */
    public KeepPartyOrganization(field: PartyOrganizationClear['Field']): void {
        const previous = this.GetFieldByName(field === 'BillToOrganizationID' ? 'BillToPersonID' : 'ShipToPersonID')?.OldValue as string | null;
        if (previous) this.KeptPartyOrganizations.Keep(field, previous);
    }

    /**
     * When this save replaces `side`'s person with another, clear that side's organization if it is
     * the previous person's employer, so the stamp that follows brings the new person's. Leaves an
     * organization this save sets, one the writer kept, and a side whose person is only cleared:
     * an order may bill an organization with no person.
     */
    private async clearReplacedPersonsEmployer(side: 'BillTo' | 'ShipTo'): Promise<void> {
        const person = this.GetFieldByName(`${side}PersonID`);
        const previous = person?.OldValue as string | null | undefined;
        if (!person?.Dirty || !person.Value || !previous || UUIDsEqual(person.Value as string, previous)) return;

        const orgField = `${side}OrganizationID` as PartyOrganizationClear['Field'];
        const org = this.GetFieldByName(orgField);
        if (!org || org.Dirty || !org.Value) return;
        if (this.KeptPartyOrganizations.IsKept(orgField, previous)) return;

        const employer = await this.employerOf(previous);
        if (!employer || !UUIDsEqual(org.Value as string, employer)) return;
        this.clearPartyField(orgField);
        // A copy taken away, not the writer's empty: the new person's employer may fill it.
        this.partyCopiesCleared.add(orgField);
    }

    /** Copy `from`'s person into `to` when `to` has none and the user did not empty it in this save. */
    private copyPersonAcross(from: 'BillTo' | 'ShipTo', to: 'BillTo' | 'ShipTo'): void {
        const personID = this.Get(`${from}PersonID`) as string | null;
        const toField = `${to}PersonID`;
        if (!personID || this.Get(toField) || this.wasClearedThisSave(toField)) return;
        this.Set(toField, personID);
        this.partyFills.set(toField, { Value: personID, FromPersonID: personID });
        this.partyCopiesCleared.delete(toField);
    }

    /**
     * Undo the party defaults a person brought with them, after that person is cleared from
     * one side or replaced on it.
     *
     * - The other side's person clears when it was copied from `clearedPersonID` in this edit.
     *   Clearing the bill-to also clears a ship-to that still holds the same person, since the
     *   ship-to follows the bill-to even on an order loaded later.
     * - An organization clears when it was stamped from `clearedPersonID`'s employer in this
     *   edit and that side no longer holds the person.
     * - On an order loaded later nothing records which organization was stamped, so an
     *   organization also clears when it is `clearedPersonID`'s employer, by the same rule that
     *   stamps it (#356), on the cleared side and on a side whose person was cleared with it.
     *   That rule cannot tell a stamped employer from one the user chose to keep, so these
     *   clears are returned for the form to offer an undo.
     *
     * Other values the user set are not touched. Skips booked/voided orders.
     *
     * @returns The organizations cleared by the employer rule alone, for {@link RestorePartyOrganizations}.
     */
    public async ClearPersonParty(side: 'BillTo' | 'ShipTo', clearedPersonID: string | null): Promise<PartyOrganizationClear[]> {
        // The user changed this side directly, so an empty value here is now theirs.
        this.partyCopiesCleared.delete(`${side}PersonID`);
        if (!clearedPersonID || this.Status === 'Voided' || this.IsBookedOrder) return [];

        const other = side === 'BillTo' ? 'ShipTo' : 'BillTo';
        const otherPersonField = `${other}PersonID`;
        // When the cleared person was itself the copy, the other side holds the original.
        const clearedFill = this.partyFills.get(`${side}PersonID`);
        const clearedWasCopy = !!clearedFill && UUIDsEqual(clearedFill.Value, clearedPersonID);
        this.partyFills.delete(`${side}PersonID`);
        const otherIsCopy = !clearedWasCopy && (this.wasFilledFrom(otherPersonField, clearedPersonID)
            || (side === 'BillTo' && UUIDsEqual(this.Get(otherPersonField) as string | null, clearedPersonID)));
        if (otherIsCopy) {
            this.clearPartyField(otherPersonField);
            this.partyCopiesCleared.add(otherPersonField);
        }

        const cleared: PartyOrganizationClear[] = [];
        let employer: string | null | undefined;
        for (const s of ['BillTo', 'ShipTo'] as const) {
            const orgField = `${s}OrganizationID` as PartyOrganizationClear['Field'];
            const personNow = this.Get(`${s}PersonID`) as string | null;
            if (UUIDsEqual(personNow, clearedPersonID)) continue;
            if (this.wasFilledFrom(orgField, clearedPersonID)) {
                this.clearPartyField(orgField);
                this.partyCopiesCleared.add(orgField);
                continue;
            }
            // A side now held by someone else keeps its organization: it may be theirs.
            const org = this.Get(orgField) as string | null;
            if (!org || (s !== side && personNow)) continue;
            if (employer === undefined) employer = await this.employerOf(clearedPersonID);
            if (employer && UUIDsEqual(org, employer)) {
                this.clearPartyField(orgField);
                this.partyCopiesCleared.add(orgField);
                cleared.push({ Field: orgField, OrganizationID: org, FromPersonID: clearedPersonID });
            }
        }
        return cleared;
    }

    /**
     * Put back organizations {@link ClearPersonParty} cleared by the employer rule, replacing any
     * employer a new person brought since. They then count as the user's, and the server save
     * keeps them through the replacement ({@link KeptPartyOrganizations}).
     */
    public RestorePartyOrganizations(cleared: readonly PartyOrganizationClear[]): void {
        for (const c of cleared) {
            this.Set(c.Field, c.OrganizationID);
            this.partyFills.delete(c.Field);
            this.partyCopiesCleared.delete(c.Field);
            this.KeptPartyOrganizations.Keep(c.Field, c.FromPersonID);
        }
    }

    /** `personID`'s employer by the rule {@link AutoPopulateEmployerOrganization} stamps with, or null. */
    private async employerOf(personID: string): Promise<string | null> {
        const provider = this.ProviderToUse as unknown as IRunViewProvider;
        if (!provider) return null;
        const asOf = AsDateValue(this.OrderDate) ?? TodayAsDateValue();
        return ResolveActiveEmployerOrganization(provider, personID, asOf, this.ContextCurrentUser);
    }

    /** True when `field` still holds the value {@link ApplyPersonPartyDefaults} filled in from `personID`. */
    private wasFilledFrom(field: string, personID: string): boolean {
        const fill = this.partyFills.get(field);
        return !!fill && UUIDsEqual(fill.FromPersonID, personID) && UUIDsEqual(this.Get(field) as string | null, fill.Value);
    }

    /** Empty a party foreign key and forget that it was filled in. */
    private clearPartyField(idField: string): void {
        this.Set(idField, null);
        this.partyFills.delete(idField);
    }

    /**
     * True when `field` had a value on disk and this save empties it — the user cleared it. A
     * copy {@link ClearPersonParty} took away does not count.
     */
    private wasClearedThisSave(field: string): boolean {
        if (this.partyCopiesCleared.has(field)) return false;
        const f = this.GetFieldByName(field);
        return !!f && f.Dirty && f.Value == null && f.OldValue != null;
    }

    /** True when this save sets `field` to a value it did not have on disk. */
    private isChangedThisSave(field: string): boolean {
        const f = this.GetFieldByName(field);
        return !!f && f.Dirty && f.Value != null;
    }

    /**
     * Stamp BillToOrganizationID or ShipToOrganizationID from the person's longest
     * active Employee relationship when that side's org is still empty.
     */
    public async AutoPopulateEmployerOrganization(
        partyRole: 'ShipTo' | 'BillTo' = 'ShipTo',
        personID?: string | null,
    ): Promise<string | null> {
        const targetPersonID = personID ?? (partyRole === 'ShipTo' ? this.ShipToPersonID : this.BillToPersonID);
        if (!targetPersonID) return null;

        const currentOrgID = partyRole === 'ShipTo' ? this.ShipToOrganizationID : this.BillToOrganizationID;
        if (currentOrgID) return currentOrgID;
        if (this.wasClearedThisSave(`${partyRole}OrganizationID`)) return null;

        const provider = this.ProviderToUse as unknown as IRunViewProvider;
        if (!provider) return null;

        // Affiliation is a point-in-time question answered against `StartDate`/`EndDate`, both
        // `date` columns, so this is a calendar day (#209). `new Date()` is an instant that reads
        // back as the UTC day, which for an evening order is tomorrow.
        const asOf = AsDateValue(this.OrderDate) ?? TodayAsDateValue();
        const orgId = await ResolveActiveEmployerOrganization(provider, targetPersonID, asOf, this.ContextCurrentUser);
        if (!orgId) return null;

        const orgField = `${partyRole}OrganizationID`;
        if (!this.Get(orgField)) {
            this.Set(orgField, orgId);
            this.partyFills.set(orgField, { Value: orgId, FromPersonID: targetPersonID });
        }
        return orgId;
    }
}

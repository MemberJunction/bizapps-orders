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
import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult, type FieldValueCollection } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderEntity } from './generated/entity_subclasses';
import { CanTransition, IsBooked, type TransitionVerdict } from './OrderStatusBehavior';
import { PromotionCodesCompanion } from './PromotionCodesCompanion';
import { InitialPaymentIntentCompanion } from './InitialPaymentIntentCompanion';
import { IsSavePopulatedFieldError } from './save-populated-fields';

/** The order editor's sections, in the order the screen shows them. */
export type OrderEditorSection = 'header' | 'parties' | 'lines' | 'charges' | 'payment';

/** Statuses that mean the order has been booked to the ledger (plan D8). */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Headers')
export class OrderHeaderEntity extends mjBizAppsOrdersOrderHeaderEntity {
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

    public get InitialPaymentReference(): string | null {
        return this.InitialPaymentIntent.Reference;
    }

    public set InitialPaymentReference(value: string | null) {
        this.InitialPaymentIntent.Reference = value;
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
        return (
            `${verdict.Reason} (order ${this.OrderNumber ?? 'not yet numbered'}). Voiding is how a ` +
            `booked order is undone; a reversal is its own record rather than an edit of the ` +
            `original (D53).`
        );
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
                this.OrderDate = new Date();
            }
            if (!this.Status) {
                this.Status = 'Draft';
            }
        }
        return created;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.dropSavePopulatedFieldErrors(result);

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
     * Confirm — the irreversible step.
     *
     * Setting the status and saving IS the confirm: the server subclass sees the transition into a
     * booked state and books — journal entries, subscriptions, entitlements, the initial payment —
     * in one transaction, or refuses with a reason and writes nothing.
     *
     * There is no dry run in front of it. Every rule is enforced by the engine itself, and a browser
     * has already run the tier-independent ones through `Validate()`, so the user is told about a
     * missing payer without a round trip.
     */
    public async Confirm(): Promise<void> {
        await this.EnsureLinesLoaded();
        this.Status = 'Confirmed';
        if (!(await this.Save())) {
            throw new Error(this.LatestResult?.CompleteMessage?.trim() || 'The order could not be confirmed.');
        }
    }

    /**
     * Populate `Lines` from the database when this header is saved and the collection is empty.
     *
     * WHY THIS IS HERE, NOT ON THE FORM. Changing Status to Confirmed and pressing Save is a
     * legal confirm — Fast Entry's `Confirm()` is the same two statements. After a draft save the
     * GraphQL form reloads the HEADER only, so `Lines` is an unloaded explicit collection: empty
     * in memory, full on disk. Booking that walks `this.Lines.Items` then sees no memberships,
     * creates no terms, and EvenOverTime refuses for want of a service period.
     *
     * A read, not a write — safe on both tiers. The server Save path calls this before the
     * transactional booking walk so every caller (form, Confirm(), API, fixture) gets the same
     * answer. Does nothing when the header is new or the collection is already loaded.
     */
    public async EnsureLinesLoaded(): Promise<void> {
        if (!this.IsSaved || this.Lines.IsLoaded) return;
        await this.Lines.Load();
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

}

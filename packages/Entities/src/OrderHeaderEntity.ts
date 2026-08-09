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
import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderEntity } from './generated/entity_subclasses';
import { CanTransition, IsBooked, type TransitionVerdict } from './OrderStatusBehavior';

/** Statuses that mean the order has been booked to the ledger (plan D8). */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Headers')
export class OrderHeaderEntity extends mjBizAppsOrdersOrderHeaderEntity {
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
    public override Validate(): ValidationResult {
        const result = super.Validate();

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

    /** Whether this order is booked to the ledger right now. */
    public get IsBookedOrder(): boolean {
        return IsBooked(this.Status);
    }
}

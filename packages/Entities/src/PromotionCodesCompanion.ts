/**
 * @fileoverview `PromotionCodesCompanion` — the codes a customer presented, riding with the order.
 *
 * ## Why this is a companion and not a related-record collection
 *
 * Charges and manual discounts became collections because they have child ROWS with an
 * `OrderHeaderID` — a client can stage one and the engine completes it. A promotion code has no such
 * row. `PromotionCode` is catalog metadata (which codes exist); the RESULT of applying one is an
 * `OrderAdjustment` with `PromotionCodeID` set, and only the engine can produce that.
 *
 * At compose time the browser holds a **string**. It does not know the code's id, whether this
 * customer qualifies, what the promotion is worth against these lines, whether it stacks with
 * another, or whether the promotion has hit its redemption cap — that last one depending on orders
 * other people placed a second ago. Forcing it into a collection would mean inventing a table to
 * hold a request, which is the mirror problem wearing a different hat.
 *
 * So it is what MJ's companion abstraction is actually for: state that belongs to the record, is not
 * one of its fields, and has to cross the wire.
 *
 * ## What this fixes
 *
 * `OrderEntityServer._promotionCodes` was a transient array only the server could populate. While
 * `OrderDraft` existed its hydrator carried the codes across; when the draft was deleted nothing
 * replaced that path, so a code typed on screen was priced into the PREVIEW — `Orders.PriceOrder`
 * receives them directly — and then silently dropped at confirm. The customer saw a discount and was
 * billed full price, with every total on the order agreeing with every other total.
 *
 * ## Contributes nothing to the save plan, deliberately
 *
 * A code is an input. It produces no row of its own, so there is nothing for it to write; the
 * adjustment rows the engine derives from it are written by the promotion engine, inside the booking
 * transaction, where the decision is actually made.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { EntityCompanion, type EntityCompanionDeserializeMode } from '@memberjunction/core';

/** The wire shape: just the codes, in the order the customer gave them. */
export type PromotionCodesWire = string[];

export class PromotionCodesCompanion extends EntityCompanion<PromotionCodesWire> {
    /**
     * The wire key. **Published contract** — renaming it silently drops codes from in-flight
     * payloads written by the other side of a rolling deploy, and a dropped code is a discount the
     * customer was promised and did not get.
     */
    public readonly Name = 'PromotionCodes';

    private codes: string[] = [];

    /** The codes presented, de-duplicated and trimmed. */
    public get Codes(): string[] {
        return [...this.codes];
    }

    public set Codes(value: string[]) {
        this.codes = normalize(value);
    }

    /** Present a code. Adding one twice is not two discounts, so it is not two entries. */
    public Add(code: string): void {
        this.codes = normalize([...this.codes, code]);
    }

    /** Withdraw a code the customer removed before saving. */
    public Remove(code: string): void {
        const key = code.trim().toLowerCase();
        this.codes = this.codes.filter((c) => c.toLowerCase() !== key);
    }

    public Clear(): void {
        this.codes = [];
    }

    /**
     * `null` when there are no codes, so an ordinary save does not pay to ship an empty array.
     */
    public async Serialize(): Promise<PromotionCodesWire | null> {
        return this.codes.length ? [...this.codes] : null;
    }

    /**
     * Restores the codes from the other tier.
     *
     * `mode` is ignored on purpose. A code list is a REQUEST in both directions: there is no
     * server-authoritative version of "what the customer typed" to overwrite the client's copy with,
     * and the engine's verdict on each code travels back separately as `UnusablePromotionCodes` —
     * which says WHY a code did nothing, and is the thing worth showing.
     */
    public async Deserialize(data: PromotionCodesWire, _mode: EntityCompanionDeserializeMode): Promise<void> {
        this.codes = normalize(Array.isArray(data) ? data : []);
    }

    /**
     * Dirty when any code is present.
     *
     * Load-bearing rather than tidy: an order whose ONLY change is a promotion code must still save.
     * Reporting clean here would return early from `Save()` and drop the code — the same silent loss
     * this companion exists to end, reintroduced one level down.
     */
    public override get Dirty(): boolean {
        return this.codes.length > 0;
    }
}

/** Trimmed, non-empty, case-insensitively de-duplicated, first occurrence wins. */
function normalize(values: string[] | null | undefined): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values ?? []) {
        const code = String(raw ?? '').trim();
        if (!code) continue;
        const key = code.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(code);
    }
    return out;
}

/**
 * The check / wire / transfer number typed at order entry.
 *
 * There is no `InitialPaymentReference` column — the number lives on `PaymentDetail.ReferenceNumber`
 * once confirm creates that row. Until then the browser holds a string that has to reach the
 * server, which is what a companion is for (same reason as promotion codes).
 *
 * Leaving it as page state is how Fast Entry confirmed a Check with "abc" on screen and the
 * server refused: `createInitialPayment` only looks at `InitialPaymentDetailID`, and nothing had
 * created that row.
 */
import { EntityCompanion, type EntityCompanionDeserializeMode } from '@memberjunction/core';

export type InitialPaymentIntentWire = { Reference: string };

export class InitialPaymentIntentCompanion extends EntityCompanion<InitialPaymentIntentWire> {
    public readonly Name = 'InitialPaymentIntent';

    private reference: string | null = null;

    public get Reference(): string | null {
        return this.reference;
    }

    public set Reference(value: string | null) {
        const trimmed = (value ?? '').trim();
        this.reference = trimmed.length ? trimmed : null;
    }

    public async Serialize(): Promise<InitialPaymentIntentWire | null> {
        return this.reference ? { Reference: this.reference } : null;
    }

    public async Deserialize(
        data: InitialPaymentIntentWire,
        _mode: EntityCompanionDeserializeMode,
    ): Promise<void> {
        this.Reference = data?.Reference ?? null;
    }

    /**
     * Dirty when a reference is present so a confirm whose only extra fact is the check
     * number still ships the companion. A clean companion would drop it on Save().
     */
    public override get Dirty(): boolean {
        return this.reference != null;
    }
}

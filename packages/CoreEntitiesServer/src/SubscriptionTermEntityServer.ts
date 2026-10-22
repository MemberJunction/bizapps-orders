/**
 * SubscriptionTerm server subclass — the one write allowed to change a booked term's dates (golive #221).
 *
 * The shared entity refuses any change to a saved term's StartDate, EndDate or Amount, on every tier. An
 * approved Duration concession is the sanctioned way to extend a term, and `TermExtension` applies it through
 * this class. The sanction is a module-private set rather than a property, so nothing outside this server can
 * grant it: a client that set a flag on its own object would still be refused here.
 *
 * CONNECTS TO:
 *   CALLER: ./TermExtension.ts (SanctionTermAmendment)
 *   BASE:   @mj-biz-apps/orders-entities SubscriptionTermEntity
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { SubscriptionTermEntity } from '@mj-biz-apps/orders-entities';

const SANCTIONED = new WeakSet<object>();

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Terms')
export class SubscriptionTermEntityServer extends SubscriptionTermEntity {
    protected override BookedTermEditSanctioned(): boolean {
        return SANCTIONED.has(this);
    }
}

/**
 * Let this term's next save change its booked dates. Call it where the term is loaded for the amendment, and
 * only there. Refuses an object the server subclass did not produce, which would mean the sanction does nothing.
 */
export function SanctionTermAmendment(term: BaseEntity): void {
    if (!(term instanceof SubscriptionTermEntityServer)) {
        throw new Error(
            "The subscription term was not loaded through the orders server's entity subclass, so its booked dates cannot be amended.",
        );
    }
    SANCTIONED.add(term);
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSubscriptionTermEntityServer(): void {
    // intentionally empty
}

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { ApprovalInboxComponent, ResolveCurrentPersonID } from '@mj-biz-apps/tasks-ng';

/**
 * The name of the order-review task type. Sales' `ORDER_REVIEW` (raised when a deal closes Won) and
 * Orders' `ORDERS_ORDER_REVIEW` (raised when an order hits a review trigger) both declare it, but the
 * tasks app keeps task type names unique, so a host holds whichever of the two was installed first.
 * Filtering by name lists that one row. Renaming either type so both can exist would drop the renamed
 * one from this card.
 */
export const ORDER_REVIEW_TASK_TYPE_NAME = 'Order Review';

/** The card's heading. */
export const ORDER_REVIEW_CARD_TITLE = 'Orders awaiting review';

/**
 * `mjo-order-review-queue` — the Orders home's "orders awaiting review" card
 * (bc-aidp-next-golive#442).
 *
 * Embeds the Tasks approval inbox, filtered to Order Review tasks, for the signed-in user's Person.
 * The inbox lists the open reviews assigned to that person or to a role they hold (a pipeline's
 * Close Won Assignee Role, such as Finance), links each row to its order, and records the decision
 * in place.
 *
 * Shows nothing for a user with no active Person: such a user has no assigned reviews, and the
 * home page is shared by everyone who uses Orders.
 */
@Component({
    selector: 'mjo-order-review-queue',
    standalone: true,
    imports: [ApprovalInboxComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (PersonID) {
            <!-- The type name and title are bound before the person: setting the person starts the
                 inbox's first read, which must already carry the type filter. -->
            <bizapps-approval-inbox
                [ApprovalTypeName]="TypeName"
                [Title]="Title"
                [ApproverPersonID]="PersonID">
            </bizapps-approval-inbox>
        }
    `,
    styles: [`:host { display: block; }`],
})
export class MJOOrderReviewQueueComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** The signed-in user's Person, once resolved; null when they have none. */
    public PersonID: string | null = null;
    public readonly TypeName = ORDER_REVIEW_TASK_TYPE_NAME;
    public readonly Title = ORDER_REVIEW_CARD_TITLE;

    async ngOnInit(): Promise<void> {
        try {
            this.PersonID = await ResolveCurrentPersonID();
            this.cdr.detectChanges();
        } catch (err) {
            LogError(`Orders home: could not find the signed-in user's Person for the review queue: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

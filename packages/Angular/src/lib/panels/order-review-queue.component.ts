import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { ApprovalInboxComponent } from '@mj-biz-apps/tasks-ng';
import { ResolveSignedInPersonID } from '../data/current-person';

/**
 * The task type both order reviews carry: sales' `ORDER_REVIEW` (raised when a deal closes Won) and
 * Orders' own `ORDERS_ORDER_REVIEW` (raised when an order hits a review trigger). The inbox filters
 * by type name, so one name lists both.
 */
export const ORDER_REVIEW_TASK_TYPE_NAME = 'Order Review';

/**
 * `mjo-order-review-queue` — the Orders home's "orders awaiting review" card
 * (bc-aidp-next-golive#442).
 *
 * Embeds the Tasks approval inbox, filtered to Order Review tasks, for the signed-in user's Person.
 * The inbox lists the open reviews assigned to that person (and, from tasks-ng with role assignment,
 * to a role they hold, with a link to each order) and records the decision in place.
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
            <bizapps-approval-inbox
                [ApproverPersonID]="PersonID"
                [ApprovalTypeName]="TypeName">
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

    async ngOnInit(): Promise<void> {
        try {
            this.PersonID = await ResolveSignedInPersonID();
            this.cdr.detectChanges();
        } catch (err) {
            LogError(`Orders home: could not find the signed-in user's Person for the review queue: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

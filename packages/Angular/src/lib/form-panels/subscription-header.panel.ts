import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { BizAppsRelatedLink } from '@mj-biz-apps/common-ng';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { FormatCoverageWindow, SubscriptionStatusChipClass } from './document-form.helpers';

/**
 * `OrderLineID` is spliced into a SQL filter below, and `sql-guards.ts`'s `RequireUUID` is a server
 * import an Angular package cannot take. A `uniqueidentifier` read back off a loaded record is not
 * an injection vector; this is here so the filter is composed from something that has been checked
 * to be one, rather than from whatever the field happened to hold.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Subscription identity strip. Generated field panels stay under Details.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Subscriptions:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Subscriptions',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-subscription-header-panel',
    templateUrl: './subscription-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class SubscriptionHeaderPanel extends BaseFormPanel<mjBizAppsOrdersSubscriptionEntity> {
    /**
     * Memoised because `bizapps-related-chips` re-resolves on a new array identity, and a getter
     * bound in a template is read on every change-detection pass. Keyed on the only input, so a
     * form container reused for the next subscription rebuilds the descriptor.
     */
    private relatedLinksFor: string | null = null;
    private relatedLinks: BizAppsRelatedLink[] = [];

    public get Title(): string {
        return this.Record.SubscriptionNumber || 'New subscription';
    }

    public get StatusClass(): string {
        return SubscriptionStatusChipClass(this.Record.Status);
    }

    public get AutoRenewClass(): string {
        return this.Record.AutoRenew ? 'mjo-doc-chip mjo-doc-chip--on' : 'mjo-doc-chip mjo-doc-chip--off';
    }

    public get Coverage(): string {
        return FormatCoverageWindow(this.Record.StartDate, this.Record.EndDate);
    }

    public get Holder(): string {
        return this.Record.HolderOrganization || '—';
    }

    public get Beneficiary(): string {
        return this.Record.BeneficiaryPerson || '—';
    }

    /**
     * The order this subscription was booked from, as a related-records chip.
     *
     * A subscription stores only `OrderLineID` — there is no denormalised `OrderID` — so the chip is
     * described by a FILTER rather than an id. That is the reverse-link case `bizapps-related-chips`
     * documents: the caller names the record it wants and the component owns resolving it, reading
     * the order's NUMBER rather than a GUID, and drawing nothing when the order cannot be opened.
     *
     * The line link in the Subscription Overview panel stays where it is. It answers a different
     * question — which line of the order bought this — and the header chip is the way up to the
     * order itself, which previously took two hops.
     */
    public get RelatedLinks(): BizAppsRelatedLink[] {
        const lineID = this.Record?.OrderLineID ?? null;
        if (this.relatedLinksFor === lineID) {
            return this.relatedLinks;
        }
        this.relatedLinksFor = lineID;
        this.relatedLinks = lineID && UUID_SHAPE.test(lineID)
            ? [
                {
                    Key: 'order',
                    EntityName: MJO_ENTITIES.OrderHeader,
                    Filter: `ID IN (SELECT OrderHeaderID FROM [__mj_BizAppsOrders].[vwOrderLines] WHERE ID = '${lineID}')`,
                    Label: 'Order',
                    Icon: 'fa-solid fa-file-invoice',
                },
            ]
            : [];
        return this.relatedLinks;
    }
}

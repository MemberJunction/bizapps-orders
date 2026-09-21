import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersEventOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersEventOrderLineFormComponent } from '../../generated/Entities/mjBizAppsOrdersEventOrderLine/mjbizappsorderseventorderline.form.component';

/**
 * Custom Event Order Line form component with Progressive Disclosure.
 *
 * Designed for both embedded order entry line cards and full record viewing.
 * Keeps the primary attendee, status, and ticket tier immediately visible,
 * hiding granular badging, logistics, dietary, and internal notes behind an
 * expandable details disclosure so the user isn't clobbered by default.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Event Order Lines', 10)
@Component({
    standalone: false,
    selector: 'bizapps-event-order-line-form',
    templateUrl: './event-order-line-form.component.html',
    styleUrls: ['./event-order-line-form.component.css'],
})
export class BizAppsEventOrderLineFormComponent extends mjBizAppsOrdersEventOrderLineFormComponent {
    public declare record: mjBizAppsOrdersEventOrderLineEntity;

    /** Tracks whether the progressive disclosure details drawer is expanded. */
    public DetailsExpanded = false;

    public ToggleDetails(): void {
        this.DetailsExpanded = !this.DetailsExpanded;
    }

    /** Helper checking if any details fields are populated. */
    public get HasPopulatedDetails(): boolean {
        if (!this.record) return false;
        return !!(
            this.record.BadgeName ||
            this.record.BadgeCompany ||
            this.record.BadgeTitle ||
            this.record.BadgePrintedAt ||
            this.record.TableAssignment ||
            this.record.CheckInAt ||
            this.record.SpecialRequests ||
            this.record.DietaryPreferences ||
            this.record.Allergies ||
            this.record.Comments ||
            this.record.CheckInNotes
        );
    }
}

/** Tree-shaking prevention anchor function */
export function LoadEventOrderLineFormComponent(): void {
    // Anchors BizAppsEventOrderLineFormComponent in bundlers
}

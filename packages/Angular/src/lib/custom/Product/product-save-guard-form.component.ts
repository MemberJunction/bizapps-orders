import { Component, inject } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersProductFormComponent } from '../../generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component';

/** The product type extension entity that makes a product an event product. */
export const EVENT_PRODUCT_EXTENSION_ENTITY = 'MJ_BizApps_Orders: Event Products';

/** Wording is from golive #211. */
export const EVENT_REV_REC_CONFIRM_MESSAGE =
    'This event product will recognize revenue at booking, not at the event date.';

export type EventRevRecConfirmInput = {
    hasEventExtension: boolean;
    /** Product.RevenueRecognitionTypeID — wins when set. */
    revRecTypeID: string | null | undefined;
    /** ProductType.DefaultRevenueRecognitionTypeID — used when the product sets none. */
    productTypeDefaultRevRecID: string | null | undefined;
    /** `undefined` for an id the caller cannot resolve. */
    isDeferredByID: (id: string) => boolean | null | undefined;
};

/**
 * True when saving this product should ask first: an event product whose EFFECTIVE revenue
 * recognition type is not deferred, i.e. revenue books at sale rather than at the event.
 *
 * The effective type is the one `OrderJournalEntryFactory` books on — the product's own id when
 * set, otherwise its product type's default. An event product that inherits a non-deferred
 * default is the case a naive check misses.
 *
 * No effective type, or one that cannot be resolved, returns false: booking already fails loudly
 * on a missing type and a second warning would be noise.
 */
export function ShouldConfirmEventRevRec(input: EventRevRecConfirmInput): boolean {
    if (!input.hasEventExtension) return false;

    const effectiveID = input.revRecTypeID?.trim() || input.productTypeDefaultRevRecID?.trim() || null;
    if (!effectiveID) return false;

    return input.isDeferredByID(effectiveID) === false;
}

/**
 * The Product form Explorer mounts, plus one save-time confirmation (golive #211).
 *
 * It reuses the GENERATED template verbatim, so the UI is unchanged and keeps tracking CodeGen;
 * the only behavioural delta is `SaveRecord`. Priority 2 puts it ahead of the generated form's own
 * registration — `BizAppsProductFormComponent` in this same folder is NOT registered and is not the
 * form that renders.
 */
@RegisterClass(BaseFormComponent, 'MJ_BizApps_Orders: Products', 2)
@Component({
    standalone: false,
    selector: 'bizapps-product-save-guard-form',
    templateUrl: '../../generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component.html',
})
export class BizAppsProductSaveGuardFormComponent extends mjBizAppsOrdersProductFormComponent {
    /** MJ's house confirmation dialog — native `window.confirm` is banned in this codebase. */
    protected ConfirmService = inject(MJConfirmService);

    /**
     * Confirms first when this is an event product booking revenue up front. Declining writes
     * nothing and leaves the form dirty and in edit mode; confirming saves exactly as before.
     */
    public override async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
        if (await this.NeedsEventRevRecConfirmation()) {
            const proceed = await this.ConfirmService.Confirm({
                title: 'Recognize revenue at booking?',
                message: EVENT_REV_REC_CONFIRM_MESSAGE,
                detail: 'Event products normally defer revenue until the event date.',
                type: 'warning',
                confirmText: 'Save anyway',
                cancelText: 'Cancel',
            });
            if (!proceed) return false;
        }
        return super.SaveRecord(StopEditModeAfterSave);
    }

    /**
     * Reads OrdersEngine (network on first call in a session) and resolves both lookups from the
     * LIVE record — the form's cached type records are stale after an in-session type change.
     *
     * Fails open: an engine that will not load leaves today's behaviour (save, no prompt) rather
     * than blocking a save on an unrelated error.
     */
    protected async NeedsEventRevRecConfirmation(): Promise<boolean> {
        const record = this.record;
        if (!record) return false;

        try {
            const engine = OrdersEngine.Instance;
            await engine.EnsureLoaded();
            const productType = engine.ProductTypeByID(record.ProductTypeID);

            return ShouldConfirmEventRevRec({
                hasEventExtension:
                    productType?.ProductExtensionEntity === EVENT_PRODUCT_EXTENSION_ENTITY ||
                    record.ISAChild?.EntityInfo?.Name === EVENT_PRODUCT_EXTENSION_ENTITY,
                revRecTypeID: record.RevenueRecognitionTypeID,
                productTypeDefaultRevRecID: productType?.DefaultRevenueRecognitionTypeID,
                isDeferredByID: (id) => engine.RevenueRecognitionTypeByID(id)?.IsDeferred,
            });
        } catch (e) {
            LogError(`Event rev-rec save confirmation skipped — OrdersEngine unavailable: ${e}`);
            return false;
        }
    }
}

/** Tree-shaking prevention anchor function */
export function LoadProductSaveGuardFormComponent(): void {
    // Anchors BizAppsProductSaveGuardFormComponent in bundlers
}

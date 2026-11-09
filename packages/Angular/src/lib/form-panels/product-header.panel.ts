import { ChangeDetectorRef, Component, DoCheck, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    OrdersExplainProductGLAccountsOperation,
    OrdersPreviewPriceOperation,
    type mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';
import { LoadProductListPriceLabel } from '../panels/catalog-list-price';
import { ProductLookupNamesTracker, REV_REC_FROM_TYPE_LABEL, type ProductLookupNames } from '../panels/product-lookup-names';
import { ProductAvatarIcon, ProductStatusChipClass } from './document-form.helpers';
import { ACTIVATION_GL_ROLES, EvaluateProductReadiness, type ProductReadiness } from './product-readiness';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'header',
        replacesSectionKey: 'productIdentification',
    },
})
@Component({
    standalone: false,
    selector: 'mjo-product-header-panel',
    templateUrl: './product-header.panel.html',
    styleUrls: ['./document-hero.css'],
})
export class ProductHeaderPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> implements OnInit, DoCheck {
    public ListPriceLabel = '—';
    private listPriceFor: string | null = null;
    private cdr = inject(ChangeDetectorRef, { optional: true });
    /** Resolved by id — the record's virtual name fields are unreliable (Pin 28). Follows edits. */
    private lookups = new ProductLookupNamesTracker(() => this.cdr?.markForCheck());

    public get Title(): string {
        return this.Record.Name || 'New product';
    }

    public async ngOnInit(): Promise<void> {
        await this.lookups.Refresh(this.Record);
    }

    public get Lookups(): ProductLookupNames {
        return this.lookups.For(this.Record);
    }

    public get TypeName(): string {
        return this.Lookups.Type;
    }

    public get AvatarIcon(): string {
        return ProductAvatarIcon(this.TypeName);
    }

    public get StatusClass(): string {
        return ProductStatusChipClass(this.Record.Status);
    }

    public get Price(): string {
        const id = this.Record?.ID ?? null;
        if (id && id !== this.listPriceFor) {
            this.listPriceFor = id;
            void this.refreshListPrice(id);
        }
        return this.ListPriceLabel;
    }

    private async refreshListPrice(productId: string): Promise<void> {
        this.ListPriceLabel = await LoadProductListPriceLabel(productId);
        this.cdr?.markForCheck();
    }

    /** The same name the Accounting section shows: the product's own type, else its type's default. */
    public get RevRec(): string {
        return this.Lookups.RevRec;
    }

    /** Says where `RevRec` comes from when the product does not set it itself. */
    public get RevRecSource(): string | null {
        return this.Lookups.RevRecFromType ? REV_REC_FROM_TYPE_LABEL : null;
    }

    // ── Draft → Active (golive#433) ───────────────────────────────────────────────────────────
    //
    // A Draft product is hidden from the deal and order pickers, and nothing on the form said so.
    // The banner says it and offers Activate. Activate checks readiness first and warns rather than
    // blocks (g433.1 A): finance may activate a product it will finish later.

    /** Set while the readiness check or the save runs. */
    public Activating = false;
    /** The gaps found, shown with Activate anyway / Cancel; null when no warning is open. */
    public Readiness: ProductReadiness | null = null;
    /** The save's refusal, verbatim. */
    public ActivateError: string | null = null;

    /** Draft is the database default, so an empty status reads as Draft too. */
    public get IsDraft(): boolean {
        return (this.Record?.Status ?? 'Draft') === 'Draft';
    }

    /**
     * Activate saves the record, so it is offered only outside edit mode: a save from here would
     * also write whatever else the user had changed and not yet saved.
     */
    public get CanActivate(): boolean {
        return this.mayActivate && !this.Activating;
    }

    /** `CanActivate` without the in-flight guard, for the save that runs while `Activating` is set. */
    private get mayActivate(): boolean {
        return this.IsDraft && !this.EditMode && !!this.Record?.IsSaved;
    }

    /**
     * Entering edit mode closes an open readiness warning: "Activate anyway" saves the record, which
     * would write the edits too. The form has no edit-mode event, so this checks on each pass.
     */
    public ngDoCheck(): void {
        if (this.Readiness && this.EditMode) this.Readiness = null;
    }

    public async Activate(): Promise<void> {
        if (!this.CanActivate) return;
        this.Activating = true;
        this.ActivateError = null;
        this.Readiness = null;
        this.cdr?.markForCheck();
        try {
            const readiness = await this.checkReadiness();
            if (!readiness.Ready) {
                this.Readiness = readiness;
                return;
            }
            await this.saveActive();
        } finally {
            this.Activating = false;
            this.cdr?.markForCheck();
        }
    }

    /** The user read the gaps and activates anyway. */
    public async ActivateAnyway(): Promise<void> {
        this.Readiness = null;
        if (!this.CanActivate) return;
        this.Activating = true;
        this.cdr?.markForCheck();
        try {
            await this.saveActive();
        } finally {
            this.Activating = false;
            this.cdr?.markForCheck();
        }
    }

    public CancelActivate(): void {
        this.Readiness = null;
        this.cdr?.markForCheck();
    }

    private async checkReadiness(): Promise<ProductReadiness> {
        const productID = this.Record.ID;
        const [price, gl] = await Promise.all([
            new OrdersPreviewPriceOperation()
                // A Draft product may not be sold, so pricing refuses it unless told to ignore that.
                .Execute({ ProductID: productID, IgnoreSellability: true })
                .then((r) =>
                    r.Success && r.Output
                        ? { PriceInForce: r.Output.Success, PriceMessage: r.Output.Success ? null : r.Output.Message }
                        : { PriceInForce: null, PriceMessage: r.ErrorMessage },
                )
                .catch((e: unknown) => ({ PriceInForce: null, PriceMessage: e instanceof Error ? e.message : String(e) })),
            new OrdersExplainProductGLAccountsOperation()
                .Execute({ ProductID: productID, Roles: [...ACTIVATION_GL_ROLES] })
                .then((r) =>
                    r.Success && r.Output?.Success
                        ? { Roles: r.Output.Roles, GLError: null }
                        : { Roles: null, GLError: r.Output?.Message ?? r.ErrorMessage },
                )
                .catch((e: unknown) => ({ Roles: null, GLError: e instanceof Error ? e.message : String(e) })),
        ]);
        return EvaluateProductReadiness({ ...price, ...gl });
    }

    /** Refuses once the user has entered edit mode, including while the readiness check ran. */
    private async saveActive(): Promise<void> {
        if (!this.mayActivate) return;
        const previous = this.Record.Status;
        this.Record.Status = 'Active';
        if (!(await this.Record.Save())) {
            this.Record.Status = previous;
            this.ActivateError = this.Record.LatestResult?.CompleteMessage || 'The product could not be activated.';
        }
    }
}

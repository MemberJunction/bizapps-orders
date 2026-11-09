import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import {
    OrdersExplainProductGLAccountsOperation,
    type ExplainedGLRole,
    type mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';

const COMPANY_ENTITY = 'MJ: Companies';

/** A company the picker offers. */
export interface CompanyOption {
    ID: string;
    Name: string;
}

/** The roles that resolve nowhere — or whose winner booking would refuse — by name, in list order. */
export function UnresolvedRoleNames(roles: readonly ExplainedGLRole[]): string[] {
    return roles.filter((r) => !r.ResolvedGLAccountID).map((r) => r.Role);
}

/**
 * The GL account each role books to for this product, and where in the walk it comes from
 * (golive#439).
 *
 * The direct-links panel above shows only links set on the product itself, so a product that books
 * through its category, product type or company looked unlinked. This block asks the server, through
 * `Orders.ExplainProductGLAccounts`, which runs the walk confirm books through; it never resolves
 * anything itself, so it cannot disagree with booking. Each role renders with accounting's
 * `mj-gl-resolution-preview`.
 *
 * The company defaults to the product's own (g439.2 A); the picker answers the same question for a
 * product another company sells.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-effective-gl-accounts',
    templateUrl: './product-effective-gl-accounts.component.html',
    styleUrls: ['./product-effective-gl-accounts.component.css'],
})
export class BizAppsProductEffectiveGLAccountsComponent implements OnInit, OnDestroy {
    @Input() public Product!: mjBizAppsOrdersProductEntity;

    public Roles: ExplainedGLRole[] = [];
    public Companies: CompanyOption[] = [];
    /** The company explained for; the product's own until the user picks another. */
    public CompanyID = '';
    public AsOf = '';
    public Loading = false;
    public LoadError: string | null = null;

    private destroyed = false;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    public async ngOnInit(): Promise<void> {
        this.CompanyID = this.Product?.CompanyID ?? '';
        await Promise.all([this.loadCompanies(), this.Refresh()]);
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
    }

    private tick(): void {
        if (!this.destroyed) this.cdr.detectChanges();
    }

    /** Roles with no account booking would use. */
    public get Unresolved(): string[] {
        return UnresolvedRoleNames(this.Roles);
    }

    /** An unsaved product has no links to walk from. */
    public get CanExplain(): boolean {
        return !!this.Product?.ID && this.Product.IsSaved;
    }

    public async OnCompanyChange(companyID: string): Promise<void> {
        this.CompanyID = companyID;
        await this.Refresh();
    }

    /** Re-asks the server. The direct-links panel calls this after it writes a link. */
    public async Refresh(): Promise<void> {
        if (!this.CanExplain) {
            this.Roles = [];
            return;
        }
        this.Loading = true;
        this.LoadError = null;
        this.tick();
        try {
            const result = await new OrdersExplainProductGLAccountsOperation().Execute({
                ProductID: this.Product.ID,
                CompanyID: this.CompanyID || null,
            });
            if (!result.Success || !result.Output?.Success) {
                this.Roles = [];
                this.LoadError = result.Output?.Message ?? result.ErrorMessage ?? 'The effective accounts could not be read.';
                return;
            }
            this.Roles = result.Output.Roles;
            this.CompanyID = result.Output.CompanyID;
            this.AsOf = result.Output.AsOf;
        } catch (err) {
            this.Roles = [];
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.tick();
        }
    }

    private async loadCompanies(): Promise<void> {
        // Orders may run without the Companies entity visible to this user; the picker then holds only the product's own.
        if (!new Metadata().EntityByName(COMPANY_ENTITY)) return;
        const result = await new RunView().RunView<{ ID: string; Name: string }>({
            EntityName: COMPANY_ENTITY,
            Fields: ['ID', 'Name'],
            OrderBy: 'Name',
            ResultType: 'simple',
        });
        this.Companies = result.Success ? (result.Results ?? []).map((c) => ({ ID: String(c.ID), Name: c.Name })) : [];
        this.tick();
    }

    /** Whether `id` is the product's own company, for the picker's label. */
    public IsOwnCompany(id: string): boolean {
        return String(id).toLowerCase() === String(this.Product?.CompanyID ?? '').toLowerCase();
    }

    /** The option value matching `CompanyID` regardless of case, so the select never renders blank. */
    public get SelectedCompany(): string {
        const match = this.Companies.find((c) => c.ID.toLowerCase() === this.CompanyID.toLowerCase());
        return match?.ID ?? this.CompanyID;
    }
}

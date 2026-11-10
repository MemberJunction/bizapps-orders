import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersExplainProductGLAccountsOperation,
    type ExplainedGLRole,
    type mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';

/** The roles that resolve nowhere — or whose winner booking would refuse — by name, in list order. */
export function UnresolvedRoleNames(roles: readonly ExplainedGLRole[]): string[] {
    return roles.filter((r) => !r.ResolvedGLAccountID).map((r) => r.Role);
}

/**
 * The roles confirm cannot post without. `OrderJournalEntryFactory` resolves Accounts Receivable and
 * Sales on every line, Deferred Revenue only when the product's revenue recognition type is deferred,
 * Sales Discounts only when a line carries a discount and nets it into revenue when none is assigned,
 * and nothing books Sales Returns and Allowances today. So a product with the first two (three when
 * deferred) assigned confirms; the rest are optional and must not be reported as blocking.
 */
export function RequiredGLRoleNames(isDeferred: boolean): string[] {
    return isDeferred ? ['Accounts Receivable', 'Sales', 'Deferred Revenue'] : ['Accounts Receivable', 'Sales'];
}

/** The required roles with no account, in list order: the ones the warning names. */
export function MissingRequiredRoleNames(roles: readonly ExplainedGLRole[], isDeferred: boolean): string[] {
    const required = new Set(RequiredGLRoleNames(isDeferred).map((r) => r.toLowerCase()));
    return UnresolvedRoleNames(roles).filter((r) => required.has(r.toLowerCase()));
}

/** Why an optional role is optional, for the row that has no account. */
export function OptionalRoleNote(role: string): string {
    switch (role.toLowerCase()) {
        case 'deferred revenue':
            return 'Optional: used only for deferred revenue recognition';
        case 'sales discounts':
            return 'Optional: discounts net into Sales when none is assigned';
        case 'sales returns and allowances':
            return 'Optional: not used by posting today';
        default:
            return 'Optional';
    }
}

/**
 * Where a role's account comes from, in the words of the table's "Assigned on" column: "This product",
 * "Category: Services", "Product type: Membership", "Company default: Betty Bot". The walk's own
 * `Scope` already reads that way for the middle levels; the product level names the product the
 * reader is looking at, and the company level names the product's company. Exported for the unit test.
 */
export function RoleSourceText(role: ExplainedGLRole, companyName: string): string {
    const won = role.Steps.find((s) => s.Won);
    if (!won) return '—';
    if (won.Level === 'Product') return 'This product';
    if (won.Level === 'Company' || won.Level === 'LegalEntity') {
        return companyName.trim() ? `Company default: ${companyName.trim()}` : 'Company default';
    }
    return won.Scope;
}

/** The chip shown instead of an account when a role has none, by the walk's failure code. */
export function RoleFailureText(role: ExplainedGLRole): string {
    return role.Failure === 'CrossCompany' ? 'Assigned to another company' : 'Not assigned';
}

/**
 * The GL account each role books to for this product, and where in the walk it comes from
 * (golive#439).
 *
 * The assignments card below shows only links set on the product itself, so a product that books
 * through its category, product type or company looked unassigned. This block asks the server, through
 * `Orders.ExplainProductGLAccounts`, which runs the walk confirm books through; it never resolves
 * anything itself, so it cannot disagree with booking.
 *
 * Always for the product's own company: that is the Company field on this tab, and a cross-company
 * sale is the order's question, answered by the order's readiness check. A company picker used to sit
 * here and read as a second, conflicting company control.
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
    public AsOf = '';
    public Loading = false;
    public LoadError: string | null = null;
    /** Whether the product's revenue recognition type defers revenue, which makes Deferred Revenue required. */
    public IsDeferred = false;

    private destroyed = false;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    public async ngOnInit(): Promise<void> {
        await Promise.all([this.loadRevRec(), this.Refresh()]);
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
    }

    private tick(): void {
        if (!this.destroyed) this.cdr.detectChanges();
    }

    private async loadRevRec(): Promise<void> {
        const id = this.Product?.RevenueRecognitionTypeID;
        if (!id) return;
        try {
            const md = new Metadata();
            await LoadOrdersEngine(Metadata.Provider, md.CurrentUser);
            this.IsDeferred = OrdersEngine.Instance.RevenueRecognitionTypeByID(id)?.IsDeferred === true;
        } catch {
            this.IsDeferred = false;
        }
        this.tick();
    }

    /** Roles with no account booking would use. */
    public get Unresolved(): string[] {
        return UnresolvedRoleNames(this.Roles);
    }

    /** The required roles with no account: what the warning names, and what blocks confirm. */
    public get MissingRequired(): string[] {
        return MissingRequiredRoleNames(this.Roles, this.IsDeferred);
    }

    public IsRequired(role: ExplainedGLRole): boolean {
        return RequiredGLRoleNames(this.IsDeferred).some((r) => r.toLowerCase() === role.Role.toLowerCase());
    }

    public OptionalNote(role: ExplainedGLRole): string {
        return OptionalRoleNote(role.Role);
    }

    public SourceText(role: ExplainedGLRole): string {
        return RoleSourceText(role, this.Product?.Company ?? '');
    }

    public FailureText(role: ExplainedGLRole): string {
        return RoleFailureText(role);
    }

    /** An unsaved product has no links to walk from. */
    public get CanExplain(): boolean {
        return !!this.Product?.ID && this.Product.IsSaved;
    }

    /** Re-asks the server. The assignments card calls this after it writes a link. */
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
                CompanyID: this.Product.CompanyID || null,
            });
            if (!result.Success || !result.Output?.Success) {
                this.Roles = [];
                this.LoadError = result.Output?.Message ?? result.ErrorMessage ?? 'The accounts could not be read.';
                return;
            }
            this.Roles = result.Output.Roles;
            this.AsOf = result.Output.AsOf;
        } catch (err) {
            this.Roles = [];
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.tick();
        }
    }
}

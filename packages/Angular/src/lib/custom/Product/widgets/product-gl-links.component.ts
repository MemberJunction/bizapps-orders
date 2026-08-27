import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { AccountingEngineBase, pickActiveLinkIndex, type LinkCandidate } from '@mj-biz-apps/accounting-engine-base';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';

/** Accounting's polymorphic link entity. A SOFT reference — no FK crosses the schema boundary. */
const LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';

/** This app's Products entity, which is what a link's `(EntityID, RecordID)` pair points AT here. */
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

/**
 * The only fields the in-force resolver reads.
 *
 * Structural on purpose: the links arrive either as accounting's generated entity objects (from the
 * engine cache) or as plain view rows (from the fallback read), and those are different types that
 * happen to carry the same five fields. Naming the fields rather than either concrete type is what
 * lets one resolver serve both without a cast at each call site.
 */
export interface GLLinkLike {
    ID: unknown;
    GLAccountID: unknown;
    GLAccountRoleID: unknown;
    Status: unknown;
    StartedAt: unknown;
    EndedAt: unknown;
}

/** One link, flattened for display. Nothing here is computed — every field is read off the row. */
export interface ProductGLLinkRow {
    ID: string;
    RoleName: string;
    AccountCode: string;
    AccountName: string;
    Status: string;
    StartedAt: string | null;
    EndedAt: string | null;
    /** True when this is the link that would actually be used today for its role. */
    Active: boolean;
}

/**
 * The GL accounts a product books to — read from the product's own form (bizapps-orders#113).
 *
 * ── WHY THIS LIVES IN ORDERS AND NOT IN ACCOUNTING ──
 *
 * `GLAccountLink` is accounting's entity, so the instinct is to put its UI there. Accounting's own
 * links screen explains why that cannot work for products, in its `LinkRow` comment:
 *
 *   > These links are POLYMORPHIC — `(EntityID, RecordID)` can point at anything, including orders'
 *   > Products and Product Categories. Accounting must not depend on orders, so those stay unnamed
 *   > here BY DESIGN.
 *
 * So on accounting's screen a product-linked row shows a bare UUID and says so honestly. Andrew's
 * report (#113) is that same boundary seen from the other side: he could not find a product's accounts,
 * and creating a link by hand meant copying the Product's ID into a text box.
 *
 * Rendering it HERE inverts the dependency the right way round. Orders already depends on accounting
 * — `AccountingBridge` calls the engine on both booking paths — and orders is the app that knows what
 * a Product is. The polymorphic pair stops being something a human types: `EntityID` is this app's
 * Products entity and `RecordID` is the record already on screen.
 *
 * ── WHY THE ENGINE AND NOT A QUERY ──
 *
 * `AccountingEngineBase` caches roles, accounts and links client-side and is the same primitive the
 * booking pipeline resolves through (`ResolveLinkedAccount`). Reading from it means this panel cannot
 * disagree with what an order will actually book — a re-implemented query could, and the first time it
 * did, the screen would be lying about money.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──
 *
 * No fallback chain. A product with no direct link still books, through category and company defaults,
 * and `GlResolutionPreviewComponent` in accounting-ng already renders that chain. Showing a resolved
 * account here without saying it came from a category would read as "this product is linked" when it is
 * not, which is the same confusion #112 caused one screen over.
 */
@Component({
    standalone: false,
    selector: 'bizapps-product-gl-links',
    templateUrl: './product-gl-links.component.html',
    styleUrls: ['./product-gl-links.component.css'],
})
export class BizAppsProductGLLinksComponent implements OnInit {
    @Input() public Product!: mjBizAppsOrdersProductEntity;
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public Rows: ProductGLLinkRow[] = [];
    public Loading = true;
    /** Set when the links cannot be read at all. Shown instead of an empty list, which would lie. */
    public LoadError: string | null = null;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    public async ngOnInit(): Promise<void> {
        await this.Refresh();
    }

    public async Refresh(): Promise<void> {
        this.Loading = true;
        this.LoadError = null;
        this.cdr.detectChanges();
        try {
            this.Rows = await this.load();
        } catch (err) {
            this.Rows = [];
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * What the status chip says.
     *
     * The three states are NOT the two the `Status` column has. A link can be stored `Active` and still
     * not be the one that books — superseded by a later link on the same role — and rendering the raw
     * column would put the word "Active" on both rows. Saying SUPERSEDED is the whole reason this panel
     * resolves through accounting's picker rather than reading a flag.
     */
    public StatusLabel(row: ProductGLLinkRow): string {
        if (row.Active) {
            return 'In force';
        }
        return row.Status === 'Active' ? 'Superseded' : row.Status;
    }

    /** Opens accounting's Account Links screen, which is where a link is created or retired. */
    public OpenLink(row: ProductGLLinkRow): void {
        this.Navigate.emit({
            Kind: 'record',
            EntityName: LINK_ENTITY,
            PrimaryKey: CompositeKey.FromID(row.ID),
        });
    }

    private async load(): Promise<ProductGLLinkRow[]> {
        const productID = this.Product?.ID;
        if (!productID) {
            return [];
        }

        const md = new Metadata();

        /**
         * ORDERS MAY BE INSTALLED WITHOUT ACCOUNTING, and that is a supported state rather than an
         * error. Asking `RunView` for an unregistered entity does not return `Success: false` — it logs
         * `Entity ... not found in metadata`, and a console error is treated as a broken screen by the
         * Playwright keystone. So the entity is checked in metadata FIRST and its absence simply means
         * no panel, the same guard sales' product picker uses for this app.
         */
        const linkEntity = md.Entities.find((e) => e.Name === LINK_ENTITY);
        if (!linkEntity) {
            return [];
        }

        const productEntity = md.Entities.find((e) => e.Name === PRODUCT_ENTITY);
        if (!productEntity) {
            throw new Error(`${PRODUCT_ENTITY} is not registered in metadata, so its links cannot be identified.`);
        }

        // `new Metadata().CurrentUser` is how this repo reaches the user client-side; `ProviderToUse`
        // is a component-level property and does not exist on Metadata.
        await AccountingEngineBase.Instance.Config(false, md.CurrentUser);
        const engine = AccountingEngineBase.Instance;

        /**
         * READ THROUGH THE ENGINE, fall back to a view only if the cache has nothing. The engine is the
         * booking pipeline's own source; the view is here so a stale or unconfigured cache shows the
         * truth rather than an empty list that reads as "no accounts assigned".
         */
        const cached = engine.GLAccountLinks.filter(
            (l) =>
                String(l.EntityID).toLowerCase() === String(productEntity.ID).toLowerCase()
                && String(l.RecordID).toLowerCase() === String(productID).toLowerCase(),
        );

        const rows = cached.length ? cached : await this.readDirect(productEntity.ID, productID);

        const inForce = this.inForceIDs(rows);

        return rows
            .map((l) => {
                const account = engine.GLAccountByID(String(l.GLAccountID));
                const role = engine.GLAccountRoles.find(
                    (r) => String(r.ID).toLowerCase() === String(l.GLAccountRoleID).toLowerCase(),
                );
                return {
                    ID: String(l.ID),
                    RoleName: role?.Name ?? '(unknown role)',
                    AccountCode: account?.Code ?? '(unknown)',
                    AccountName: account?.Name ?? '',
                    Status: String(l.Status ?? ''),
                    StartedAt: (l.StartedAt as unknown as string) ?? null,
                    EndedAt: (l.EndedAt as unknown as string) ?? null,
                    Active: inForce.has(String(l.ID).toLowerCase()),
                };
            })
            .sort((a, b) => a.RoleName.localeCompare(b.RoleName) || a.AccountCode.localeCompare(b.AccountCode));
    }

    /** The view read, used only when the engine cache holds nothing for this product. */
    private async readDirect(entityID: string, recordID: string): Promise<GLLinkLike[]> {
        const rv = new RunView();
        const res = await rv.RunView<Record<string, unknown>>({
            EntityName: LINK_ENTITY,
            ExtraFilter:
                `EntityID = '${entityID.replace(/'/g, "''")}' `
                + `AND RecordID = '${recordID.replace(/'/g, "''")}'`,
            ResultType: 'simple',
            Fields: ['ID', 'GLAccountID', 'GLAccountRoleID', 'Status', 'StartedAt', 'EndedAt'],
        });
        if (!res?.Success) {
            throw new Error(res?.ErrorMessage ?? 'the GL account links could not be read');
        }
        // The one honest cast in this file: a view row arrives untyped, and this is the boundary where
        // it becomes the shape the panel reads. Every field is then narrowed with String()/?? below.
        return (res.Results ?? []) as unknown as GLLinkLike[];
    }

    /**
     * The ids of the links actually IN FORCE today — one per role at most, decided by accounting.
     *
     * ── WHY THIS IS NOT A WINDOW TEST ──
     *
     * The obvious implementation, and the one this replaced, asks of each link "is it Active and does
     * today fall inside its window?" and marks every link that passes. That is wrong whenever a role
     * has more than one qualifying link — a mapping being superseded while the old row is still open,
     * which is exactly what an accountant does when they re-point a product mid-year. Both rows pass
     * the window test, so the panel would show TWO active accounts for one role while an order books
     * through exactly one of them. A screen that disagrees with the booking about where money lands is
     * worse than no screen.
     *
     * `pickActiveLinkIndex` is accounting's own picker — the pure function behind
     * `ResolveLinkedAccount`, exported by that package for precisely this kind of reuse. It applies the
     * window AND the tie-break this panel has no business restating: latest `StartedAt` wins, and a
     * null `StartedAt` loses to any dated one. Calling it means "active" here can only ever mean what
     * the booking pipeline means.
     *
     * Grouped by ROLE because that is the unit the picker resolves: a product legitimately has a
     * revenue link and a deferred-revenue link at once, and they do not compete.
     */
    private inForceIDs(rows: ReadonlyArray<GLLinkLike>): Set<string> {
        const byRole = new Map<string, GLLinkLike[]>();
        for (const link of rows) {
            const role = String(link.GLAccountRoleID ?? '').toLowerCase();
            const group = byRole.get(role);
            if (group) {
                group.push(link);
            } else {
                byRole.set(role, [link]);
            }
        }

        // One instant for every role, so a slow load cannot resolve two roles against two "nows".
        const asOf = new Date();
        const winners = new Set<string>();
        for (const group of byRole.values()) {
            const index = pickActiveLinkIndex(
                // The cast is the boundary between a database string and accounting's closed vocabulary
                // (`Active | Disabled | Pending`). It is safe in the only direction that matters: a value
                // outside that set simply is not `'Active'`, so the picker skips it rather than
                // mis-classifying it as in force.
                group.map((l): LinkCandidate => ({
                    Status: String(l.Status ?? '') as LinkCandidate['Status'],
                    StartedAt: (l.StartedAt as Date | null) ?? null,
                    EndedAt: (l.EndedAt as Date | null) ?? null,
                })),
                asOf,
            );
            if (index >= 0) {
                winners.add(String(group[index].ID).toLowerCase());
            }
        }
        return winners;
    }
}

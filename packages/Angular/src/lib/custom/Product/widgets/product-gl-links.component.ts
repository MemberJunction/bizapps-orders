import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CompositeKey, Metadata, RunView, type BaseEntity } from '@memberjunction/core';
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

    // ── Writing: the half accounting has no UI for at all ─────────────────────────────────────────

    /** Roles and accounts to choose from, filled by {@link Refresh} off the same engine the reader uses. */
    public Roles: Array<{ ID: string; Name: string }> = [];
    public Accounts: Array<{ ID: string; Label: string }> = [];

    /** The add form. Null when closed — opening it is a deliberate act, not the default state. */
    public Draft: { RoleID: string; AccountID: string; StartedAt: string } | null = null;

    /** Set when a write is refused. The SERVER's message, verbatim — see {@link AddLink}. */
    public WriteError: string | null = null;
    public Saving = false;

    /** A product must exist before anything can point at it: `RecordID` is its primary key. */
    public get CanWrite(): boolean {
        return !!this.Product?.ID && this.Product.IsSaved;
    }

    public OpenDraft(): void {
        this.WriteError = null;
        this.Draft = { RoleID: '', AccountID: '', StartedAt: this.today() };
    }

    public CancelDraft(): void {
        this.Draft = null;
        this.WriteError = null;
    }

    /**
     * Creates the link.
     *
     * The polymorphic pair is NOT typed by a human, and that is the entire point of doing this here:
     * `EntityID` is orders' Products entity and `RecordID` is the record already on screen. On
     * accounting's own screen a person would have to paste the product's UUID into a text box, which is
     * what #113 is reporting.
     *
     * ── THE REFUSAL IS SURFACED, NOT RE-IMPLEMENTED ──
     *
     * `GLAccountLinkEntityServer` refuses two ACTIVE links for the same (record, role) whose accounts
     * share a company AND share a `StartedAt`, because the tie-break is a strict `>` and resolution
     * would otherwise pick arbitrarily between two accounts that both balance. This does not restate
     * that rule client-side: a copy would drift from it, and the copy would be the one that silently
     * disagreed. It saves, and shows the server's own message when the server says no — which is also
     * how the human learns that superseding means a LATER start date rather than a duplicate.
     */
    public async AddLink(): Promise<void> {
        const draft = this.Draft;
        if (!draft || !draft.RoleID || !draft.AccountID || !this.Product?.ID) {
            return;
        }
        this.Saving = true;
        this.WriteError = null;
        this.cdr.detectChanges();
        try {
            const md = new Metadata();
            const productEntity = md.Entities.find((e) => e.Name === PRODUCT_ENTITY);
            if (!productEntity) {
                throw new Error(`${PRODUCT_ENTITY} is not registered in metadata.`);
            }
            const link = await md.GetEntityObject<BaseEntity>(LINK_ENTITY);
            link.NewRecord();
            link.Set('GLAccountRoleID', draft.RoleID);
            link.Set('GLAccountID', draft.AccountID);
            link.Set('EntityID', productEntity.ID);
            link.Set('RecordID', this.Product.ID);
            link.Set('Status', 'Active');
            link.Set('StartedAt', draft.StartedAt ? new Date(`${draft.StartedAt}T00:00:00.000Z`) : null);

            if (!(await link.Save())) {
                this.WriteError = this.readableError(link) ?? 'the link could not be saved';
                return;
            }
            this.Draft = null;
            await this.Refresh();
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Whether a link can have explained any money yet.
     *
     * `pickActiveLinkIndex` treats a window as applying when `StartedAt <= now <= EndedAt`, so a link
     * that starts TODAY OR LATER has not yet been the answer to any resolution. That is the boundary
     * between the two destructive-looking actions below, and it is deliberately conservative: dated in
     * the past means assume it booked something.
     */
    public HasApplied(row: ProductGLLinkRow): boolean {
        if (!row.StartedAt) {
            return true;   // a null start means "always has" — the widest possible claim
        }
        /**
         * PARSED, NOT STRING-SLICED. `StartedAt` reaches this row as a `Date` from the engine cache and
         * as an ISO string from the view fallback, and the first version sliced `String(value)` — which
         * for a Date yields "Wed Jan 01", compares greater than "2026-08-28", and reported a link from
         * 2020 as never having applied. It offered Remove on a link that had been booking for six
         * years. The unit test missed it by passing a string, which is the shape the bug did not have.
         */
        const started = new Date(row.StartedAt as unknown as string | Date);
        if (Number.isNaN(started.getTime())) {
            return true;   // unreadable date — assume it applied rather than offer to delete it
        }
        return started.getTime() < new Date(`${this.today()}T00:00:00.000Z`).getTime();
    }

    /**
     * Ends a link's window, which is how accounting retires a mapping that has been in force.
     *
     * ── WHY THIS IS NOT A DELETE ──
     *
     * A GL link explains where money went. Deleting one that has already booked would remove the
     * explanation for journal entries that still exist, and nothing else records which mapping was in
     * force at the time. Ending the window keeps the history and stops the link applying.
     *
     * ── AND WHAT "TODAY" ACTUALLY MEANS HERE ──
     *
     * `EndedAt` is stored at MIDNIGHT UTC, and `pickActiveLinkIndex` excludes a link once `now > ended`.
     * Midnight has already passed by the time anyone clicks, so retiring stops the link IMMEDIATELY
     * rather than at the end of the day. Verified in the browser: a link dated 2020-01-01 retired on
     * 2026-08-28 rendered as Superseded on the spot, not as still in force.
     *
     * This comment previously claimed the opposite — "applies for the whole of today and stops
     * tomorrow" — and the button's tooltip said so too. The behaviour is the defensible one; the
     * description was wrong, and it is the description that changed.
     */
    public async RetireLink(row: ProductGLLinkRow): Promise<void> {
        this.Saving = true;
        this.WriteError = null;
        this.cdr.detectChanges();
        try {
            const md = new Metadata();
            const link = await md.GetEntityObject<BaseEntity>(LINK_ENTITY);
            if (!(await link.InnerLoad(CompositeKey.FromID(row.ID)))) {
                throw new Error(`link ${row.ID} could not be re-read`);
            }
            link.Set('EndedAt', new Date(`${this.today()}T00:00:00.000Z`));
            if (!(await link.Save())) {
                this.WriteError = this.readableError(link) ?? 'the link could not be retired';
                return;
            }
            await this.Refresh();
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Deletes a link that cannot have explained anything yet.
     *
     * ── WHY THIS EXISTS DESPITE THE ARGUMENT AGAINST DELETING ──
     *
     * Retiring is right for a mapping that has been in force. It is USELESS for one created by
     * mistake a minute ago: the server refuses `EndedAt` on or before `StartedAt` ("The end date must
     * be after the start date"), so a link mistyped today could be neither retired nor removed. That
     * was a real hole — found by clicking Retire on a link the same test had just created.
     *
     * The boundary is {@link HasApplied}: a link starting today or later has never been the answer to
     * a resolution, so deleting it destroys no explanation of anything. One that started earlier keeps
     * the retire path and cannot be deleted from here at all.
     */
    public async RemoveLink(row: ProductGLLinkRow): Promise<void> {
        if (this.HasApplied(row)) {
            return;   // the template does not offer this, and neither does the method
        }
        this.Saving = true;
        this.WriteError = null;
        this.cdr.detectChanges();
        try {
            const md = new Metadata();
            const link = await md.GetEntityObject<BaseEntity>(LINK_ENTITY);
            if (!(await link.InnerLoad(CompositeKey.FromID(row.ID)))) {
                throw new Error(`link ${row.ID} could not be re-read`);
            }
            if (!(await link.Delete())) {
                this.WriteError = this.readableError(link) ?? 'the link could not be removed';
                return;
            }
            await this.Refresh();
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * The sentence a human should read out of a refused save.
     *
     * `CompleteMessage` can be a JSON blob of validation results — the retire failure arrived as
     * `{"Source":"EndedAt","Message":"The end date must be after the start date.",...}`, and showing
     * that verbatim buries the one sentence that matters inside punctuation. This pulls the `Message`
     * out when it is there and falls back to the raw text when it is not, so nothing is ever swallowed.
     */
    private readableError(entity: BaseEntity): string | null {
        const raw = entity.LatestResult?.CompleteMessage;
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw) as { Message?: string } | Array<{ Message?: string }>;
            const messages = (Array.isArray(parsed) ? parsed : [parsed])
                .map((p) => p?.Message)
                .filter((m): m is string => !!m);
            if (messages.length) {
                return messages.join(' ');
            }
        } catch {
            /* not JSON — the raw text is already the message */
        }
        return raw;
    }

    /** Today in UTC as `yyyy-MM-dd` — the same zone the window is stored and rendered in. */
    private today(): string {
        const n = new Date();
        return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
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
         * The pickers come from the SAME engine cache the reader uses, so a role or account offered here
         * is one resolution can actually see. Accounts carry their code, name and company in the label
         * because a link may legitimately point at another company's account — the server derives the
         * link's company from the account and `ResolveLinkedAccount(..., forCompanyID)` disambiguates —
         * and choosing between "4000 Sales" twice with no way to tell them apart is how the wrong one
         * gets picked.
         */
        this.Roles = engine.GLAccountRoles
            .map((r) => ({ ID: String(r.ID), Name: String(r.Name ?? '(unnamed role)') }))
            .sort((a, b) => a.Name.localeCompare(b.Name));
        this.Accounts = engine.GLAccounts
            .map((a) => {
                const company = (a as unknown as { Company?: string }).Company;
                return {
                    ID: String(a.ID),
                    Label: `${a.Code ?? '(no code)'} ${a.Name ?? ''}${company ? ` — ${company}` : ''}`.trim(),
                };
            })
            .sort((a, b) => a.Label.localeCompare(b.Label));

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

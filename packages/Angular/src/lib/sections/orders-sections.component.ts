/**
 * @fileoverview The four Explorer tabs.
 *
 * Each class is registered with `@RegisterClass(BaseResourceComponent, '<DriverClass>')`
 * under the name the Application's `DefaultNavItems` reference
 * (`metadata/applications/.orders-application.json`), which is what makes these
 * plug into MJ Explorer with no host-side wiring: Explorer reads the nav metadata,
 * asks the class factory for the driver class, and mounts it as a tab.
 *
 * Each section is deliberately thin. It owns three things — its rail, which
 * sub-page is showing, and remembering that across sessions — and delegates the
 * frame to {@link MJOSectionShellComponent} and the content to the sub-page
 * components. Anything more here would be logic that belongs to a page.
 *
 * SUB-PAGE HOSTING. Pages are created once and CACHED, so switching rails and
 * coming back does not discard a half-entered order. That is not an optimisation;
 * an order taker who loses their work to a mis-click stops trusting the tool.
 *
 * @module @mj-biz-apps/orders-ng
 */

import {
    ChangeDetectorRef,
    Component,
    Directive,
    OnInit,
    Type,
    ViewChild,
    ViewContainerRef,
    inject,
    type ComponentRef,
    type EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import type { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import type { ResourceData } from '@memberjunction/core-entities';

import { MJOSectionShellComponent } from './section-shell.component';
import { MJOConfirmPreflightComponent, type MJOPreflight } from '../panels/confirm-preflight.component';
import { MJOOrderEntryService } from '../services/order-entry.service';
import { MJOOrdersDataService } from '../services/orders-data.service';
import type { OrderDraft } from '@mj-biz-apps/orders-entities';
import { MJOFastEntryPageComponent } from '../pages/orders/fast-entry.page';
import { MJOOrderWorkspacePageComponent } from '../pages/orders/order-workspace.page';
import { MJOOrdersListPageComponent } from '../pages/orders/orders-list.page';
import { MJOOrdersDashboardPageComponent } from '../pages/orders/orders-dashboard.page';
import { MJOFulfillmentPageComponent } from '../pages/orders/fulfillment.page';
import { MJOPaymentEntryPageComponent } from '../pages/payments/payment-entry.page';
import { MJOPaymentsListPageComponent } from '../pages/payments/payments-list.page';
import { MJORefundPageComponent } from '../pages/payments/refund.page';
import { MJOAccountCreditPageComponent } from '../pages/payments/account-credit.page';
import { MJOPaymentsDashboardPageComponent } from '../pages/payments/payments-dashboard.page';
import { MJOOverduePageComponent } from '../pages/receivables/overdue.page';
import { MJOCustomerARPageComponent } from '../pages/receivables/customer-ar.page';
import { MJOSubscriptionsPageComponent } from '../pages/receivables/subscriptions.page';
import { MJOProductsPageComponent, MJOChargesTaxPageComponent } from '../pages/catalog/products.page';
import { MJOPricingPageComponent, MJOPromotionsPageComponent } from '../pages/catalog/pricing.page';
import { MJOReturnPageComponent } from '../pages/orders/return.page';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
    BuildLeftNavSections,
    CATALOG_SUB_PAGES,
    ORDERS_SUB_PAGES,
    PAYMENTS_SUB_PAGES,
    RECEIVABLES_SUB_PAGES,
    type OrdersNavBadges,
    type OrdersSubPage,
} from './section-nav.model';

/**
 * Shared behaviour for the four sections: rail construction, active-page state,
 * per-user persistence of where someone was, and cached sub-page mounting.
 *
 * A `@Directive` rather than a plain class so Angular's compiler accepts the
 * `@ViewChild` declared here and inherited by each concrete section — the
 * documented way to share member decorators across component subclasses.
 */
@Directive()
export abstract class MJOSectionBaseComponent extends BaseResourceComponent implements OnInit {
    /** Where a sub-page is created. Declared once, inherited by all four sections. */
    @ViewChild('pageHost', { read: ViewContainerRef, static: false })
    protected pageHost?: ViewContainerRef;

    private readonly cdr = inject(ChangeDetectorRef);

    /** The rail, rebuilt whenever a badge count changes. */
    public NavSections: MJLeftNavSection[] = [];

    /** Which sub-page is showing. */
    public ActivePageId: string | null = null;

    public IsLoading = false;
    public LoadError: string | null = null;

    /** Live counts the rail badges. Sections refresh these; zero badges do not render. */
    protected badges: OrdersNavBadges = {};

    protected readonly mounted = new Map<string, ComponentRef<unknown>>();

    /** The section's pages, in rail order. */
    protected abstract get subPages(): OrdersSubPage[];

    /** Key under which this section remembers the user's last page. */
    protected abstract get preferenceKey(): string;

    /**
     * Component type for a page id, or `null` while a page is still to be built.
     * Returning null renders the "not built yet" notice rather than throwing —
     * a rail item that cannot open is a bug, but a blank tab is a worse one.
     */
    protected abstract resolvePage(pageId: string): Type<unknown> | null;

    public override ngOnInit(): void {
        super.ngOnInit();
        this.NavSections = BuildLeftNavSections(this.subPages, this.badges);
        this.ActivePageId = this.restorePageId();
        // The host view has to exist before a page can be created into it, AND the
        // page must be created outside the change-detection pass that is running now.
        //
        // WHY NOT queueMicrotask. Microtasks drain before the CD cycle finishes, so
        // the page was constructed inside this turn. Its `ngOnInit` is async, so the
        // fetch resolved between Angular's check pass and its dev-mode verify pass —
        // NG0100, which ABORTS the rest of that update. Nothing schedules another
        // tick afterwards, so the DOM stayed frozen on the pre-fetch render: the
        // Orders dashboard sat at "0 open orders / $0.00" against a database holding
        // 73 orders, and looked like a quiet day rather than a bug.
        //
        // A macrotask lands after the cycle completes, so the child's fetch resolves
        // in its own tick and simply re-renders.
        setTimeout(async () => {
            await this.showPage(this.ActivePageId!);
            this.LoadedAt = new Date();
            // Mounting the page and stamping the timestamp both change what the
            // header and the rail render. Writing the DOM here keeps that inside
            // one pass — without it the nav's active index is read as -1 before
            // the mount and 2 after, which is NG0100 and freezes the section the
            // same way it froze the pages.
            this.cdr.detectChanges();
        });
    }

    /** Rail click handler. */
    public async OnPageSelected(pageId: string): Promise<void> {
        this.ActivePageId = pageId;
        this.persistPageId(pageId);
        await this.showPage(pageId);
        this.cdr.detectChanges();
    }

    /** Rebuild the rail after badge counts change. */
    protected refreshBadges(badges: OrdersNavBadges): void {
        this.badges = { ...this.badges, ...badges };
        this.NavSections = BuildLeftNavSections(this.subPages, this.badges);
    }

    /**
     * Mount a page, reusing the instance if it has been shown before.
     *
     * Cached views are detached rather than destroyed, which is what preserves a
     * part-typed order across a trip to another rail item.
     */
    protected async showPage(pageId: string): Promise<void> {
        const host = this.pageHost;
        if (!host) return;

        host.detach();

        const cached = this.mounted.get(pageId);
        if (cached) {
            host.insert(cached.hostView);

            // A CACHED PAGE STILL HAS TO BE TOLD WHICH RECORD TO OPEN. Clicking a row in All
            // orders sets PendingRecordID and navigates here; the fresh-mount path below hands
            // that to the page, but this path returned without doing so — so opening an order
            // worked exactly once, before the editor had ever been visited, and silently did
            // nothing every time after. From the user's side the row simply stopped responding.
            if (this.PendingRecordID) {
                const instance = cached.instance as Record<string, unknown>;
                if ('OrderID' in instance) cached.setInput('OrderID', this.PendingRecordID);
                else if ('RecordID' in instance) cached.setInput('RecordID', this.PendingRecordID);
                this.PendingRecordID = null;
                // The page is detached-and-reinserted rather than constructed, so nothing has
                // scheduled a check for it — without this the input lands and nothing repaints.
                cached.changeDetectorRef.detectChanges();
            }
            return;
        }

        const type = this.resolvePage(pageId);
        if (!type) {
            // Say so, rather than showing an empty pane. A blank content area reads
            // as a broken app; a sentence reads as work in progress, which is what
            // it is while the sub-pages land one at a time.
            const label = this.subPages.find((p) => p.Id === pageId)?.Label ?? pageId;
            this.LoadError = `${label} is not built yet — see /mockups for the approved design.`;
            return;
        }

        try {
            // Load the shared inputs BEFORE constructing the page. A component
            // created imperatively runs `ngOnInit` on its first change detection,
            // and fast entry builds its OrderDraft there from `CompanyID` — so an
            // input that arrives afterwards is an input that arrives too late. The
            // draft was being built with an empty company, which made every
            // preview fail validation and left the line "resolving…" forever.
            const inputs = await this.sharedInputs();

            // A page opened FOR A RECORD needs that record, not a blank one.
            // Opening an order used to set PendingRecordID and navigate, and the
            // editor — which only accepts a Draft — was handed an empty one, so
            // the screen came up blank and the click looked broken.
            if (this.PendingRecordID && (pageId === 'editor' || pageId === 'document')) {
                const draft = await this.entry.LoadDraft(this.PendingRecordID, this.data);
                if (draft) inputs['Draft'] = draft;
                inputs['OrderID'] = this.PendingRecordID;
                this.PendingRecordID = null;
            }

            const ref = host.createComponent(type);
            const instance = ref.instance as Record<string, unknown>;
            for (const [name, value] of Object.entries(inputs)) {
                // `setInput` rather than assignment: it marks the view dirty and
                // runs ngOnChanges, which direct assignment on an imperatively
                // created component does not.
                if (name in instance) ref.setInput(name, value);
            }

            this.wirePage(ref);
            this.mounted.set(pageId, ref);
            this.LoadError = null;
        } catch (e) {
            // A page that fails to construct must not take the section down with
            // it — the rail has to stay usable so the user can go somewhere else.
            this.LoadError = `That page could not be opened: ${e instanceof Error ? e.message : String(e)}`;
            // …and the banner has to actually appear. This assignment lands after an await on an
            // imperatively-created, zoneless component, so without a tick the user gets a blank
            // pane and no explanation — the failure state was itself invisible.
            this.cdr.detectChanges();
        }
    }

    /**
     * Connect a freshly created page to the section.
     *
     * A page created through `ViewContainerRef.createComponent` has NO template
     * binding its outputs — there is no host markup for Angular to wire. Every
     * `@Output()` on every page therefore emitted into nothing: the confirm button
     * fired `ConfirmRequested` at no listener, dashboard tiles fired
     * `NavigateRequested` at no listener, and list rows fired `OrderOpened` at no
     * listener. The pages looked complete and were inert.
     *
     * Subscribed by NAME and only when present, because the four sections host
     * different pages and a missing output is normal rather than an error.
     */
    private wirePage(ref: ComponentRef<unknown>): void {
        const instance = ref.instance as Record<string, unknown>;

        const subscriptions: Array<{ unsubscribe(): void }> = [];

        const on = <T>(name: string, handler: (value: T) => void): void => {
            const output = instance[name] as EventEmitter<T> | undefined;
            if (!output?.subscribe) return;
            subscriptions.push(output.subscribe(handler));
        };

        // Navigation within the rail.
        on<string>('NavigateRequested', (pageId) => this.OnPageSelected(pageId));

        // Opening a record routes to the page that shows it. Each carries its id,
        // which the destination reads on activation.
        on<{ ID?: string } | string>('OrderOpened', (row) => this.openRecord('editor', row));
        on<{ ID?: string } | string>('PaymentOpened', (row) => this.openRecord('entry', row));
        on<{ ID?: string } | string>('ProductOpened', (row) => this.openRecord('products', row));

        // The irreversible step, gated behind the pre-flight.
        on<OrderDraft>('ConfirmRequested', (draft) => void this.OpenPreflight(draft));

        // The order workspace confirms in place — it owns the draft, so it does not hand one back
        // for the section's pre-flight. What the section still needs is to know an order now
        // EXISTS: any list or dashboard it has already mounted was read before the confirm and is
        // now stale. Dropping the cached pages makes the next visit re-read rather than show a
        // list the just-confirmed order is missing from.
        on<string>('OrderConfirmed', () => this.dropStalePages());
        // ESCALATION CARRIES THE DRAFT. This used to ignore the emitted payload and merely
        // navigate, so "open in full editor" landed on an empty workspace and the half-typed order
        // was silently gone — the button looked like it did nothing. Fast entry and the editor were
        // designed to share one draft instance; this is the handoff that makes that true.
        on<OrderDraft>('EscalateRequested', (draft) => {
            void this.OnPageSelected('editor').then(() => {
                const page = this.mounted.get('editor')?.instance as { AdoptDraft?: (d: OrderDraft) => void } | undefined;
                page?.AdoptDraft?.(draft);
            });
        });

        // Pages are cached rather than destroyed on rail changes, so these live as
        // long as the section does — but a destroyed section must not leave them
        // holding a reference to it.
        ref.onDestroy(() => subscriptions.forEach((sub) => sub.unsubscribe()));
    }

    /**
     * Give a page the data its inputs expect.
     *
     * Set by NAME and only when the property exists, because the four sections
     * host different pages and an absent input is normal rather than an error —
     * the same shape as the output wiring above.
     *
     * The catalog is loaded ONCE per section and shared. Every page that needs it
     * needs the same list, and re-reading it per page would be a round trip to
     * produce an answer already in memory.
     */
    private async sharedInputs(): Promise<Record<string, unknown>> {  // eslint-disable-line
        const [Catalog, CompanyID, Tenders] = await Promise.all([
            this.catalogOptions(),
            this.defaultCompanyID(),
            this.tenderOptions(),
        ]);
        return { Catalog, CompanyID, Tenders };
    }

    private catalogCache: Array<Record<string, unknown>> | null = null;

    /** The product picker's options, shaped as it expects them. */
    private async catalogOptions(): Promise<Array<Record<string, unknown>>> {
        if (!this.catalogCache) {
            // The list price shown in the picker comes from the PRICE RULES, not
            // from the product: StandaloneSellingPrice is null for anything priced
            // by a rule, and rendering that as $0.00 tells an order taker the item
            // is free. The rule is the indicative figure; the engine still resolves
            // the real one on the line.
            const [products, prices] = await Promise.all([
                this.data.GetProducts({ MaxRows: 500 }),
                this.data.GetProductPrices(),
            ]);
            const byProduct = new Map<string, number>();
            for (const price of prices) {
                const id = String(price['ProductID'] ?? '');
                if (id && !byProduct.has(id)) byProduct.set(id, Number(price['Amount'] ?? 0));
            }
            this.catalogCache = products.map((product) => ({
                ID: String(product['ID']),
                Name: String(product['Name'] ?? ''),
                SKU: String(product['SKU'] ?? ''),
                TypeName: String(product['ProductType'] ?? ''),
                CompanyName: String(product['Company'] ?? ''),
                ListPrice:
                    Number(product['StandaloneSellingPrice'] ?? 0) ||
                    byProduct.get(String(product['ID'])) ||
                    0,
                Taxable: !!product['IsTaxable'],
            }));
        }
        return this.catalogCache;
    }

    private companyCache: string | null = null;

    /**
     * The company a new order belongs to.
     *
     * Taken from the catalog rather than asked for: a company with no products
     * cannot be sold from, so the first product's company is a better default than
     * an empty picker. A multi-company user changes it on the order.
     */
    private async defaultCompanyID(): Promise<string> {
        if (this.companyCache) return this.companyCache;
        const products = await this.data.GetProducts({ MaxRows: 1 });
        this.companyCache = String(products[0]?.['CompanyID'] ?? '');
        return this.companyCache;
    }

    private tenderCache: Array<Record<string, unknown>> | null = null;

    /** Tenders a payment can be taken on. */
    private async tenderOptions(): Promise<Array<Record<string, unknown>>> {
        if (!this.tenderCache) {
            const types = await this.data.GetPaymentTypes();
            this.tenderCache = types.map((type) => ({
                ID: String(type['ID']),
                Code: String(type['Code'] ?? ''),
                Name: String(type['Name'] ?? ''),
                RequiresReference: !!type['RequiresReference'],
                RequiresInstrument: !!type['RequiresInstrument'],
            }));
        }
        return this.tenderCache;
    }

    /** Remember which record a destination page should open, then go there. */
    protected openRecord(pageId: string, row: { ID?: string } | string): void {
        this.PendingRecordID = typeof row === 'string' ? row : (row?.ID ?? null);
        this.OnPageSelected(pageId);
    }

    /** Set when a page was opened for a specific record. */
    public PendingRecordID: string | null = null;

    /* ── Header ─────────────────────────────────────────────────────────── */

    /**
     * The action the primary button performs, or null for a section that has no
     * single obvious thing to start.
     *
     * Deliberately per-section rather than a global "New order". On Receivables
     * and Catalog there is no one thing a person arrives wanting to create, and a
     * primary button that guesses is worse than none — it makes the wrong action
     * the most prominent one on the page.
     */
    protected get primaryAction(): { Label: string; Icon: string; PageId: string } | null {
        return null;
    }

    /** When the visible data was last read. Shown so a stale screen can be spotted. */
    public LoadedAt: Date | null = null;

    /** The 'as of' chip. Time only — the date is today by construction. */
    public get LoadedAtDisplay(): string {
        if (!this.LoadedAt) return '';
        return this.LoadedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    /**
     * Re-read the active page.
     *
     * Destroys the cached instance rather than asking it to reload, because a page
     * has no reload contract — some load in `ngOnInit`, some on a preset change,
     * and inventing an interface every page must implement to support one button
     * is more surface than the button is worth. Recreating runs whatever the page
     * already does on mount.
     */
    public RefreshActivePage(): void {
        const pageId = this.ActivePageId;
        if (!pageId) return;
        const cached = this.mounted.get(pageId);
        if (cached) {
            this.mounted.delete(pageId);
            cached.destroy();
        }
        void this.showPage(pageId);
        this.LoadedAt = new Date();
    }

    /** Start the section's primary action. */
    public StartPrimary(): void {
        const action = this.primaryAction;
        if (!action) return;
        this.OnPageSelected(action.PageId);

        // STARTING SOMETHING NEW MEANS A BLANK SURFACE. Pages are cached and re-inserted rather
        // than rebuilt (that is what preserves a part-typed order across a trip to another rail
        // item), so navigating alone hands back whatever was on screen last time. A page that can
        // be started fresh says so by exposing `Reset()`; one that must NOT be blanked simply does
        // not, which is why this asks rather than destroying the cached view.
        const page = this.mounted.get(action.PageId)?.instance as { Reset?: () => unknown } | undefined;
        if (typeof page?.Reset === 'function') void page.Reset();
    }

    /* ── Confirm pre-flight ─────────────────────────────────────────────── */

    private readonly entry = inject(MJOOrderEntryService);
    private readonly data = inject(MJOOrdersDataService);

    /** The pre-flight being shown, or null when the overlay is closed. */
    public Preflight: MJOPreflight | null = null;
    public PreflightBusy = false;
    public PreflightError: string | null = null;
    private preflightDraft: OrderDraft | null = null;

    /**
     * Run `Orders.PreviewConfirm` and show what confirming would do.
     *
     * The preview executes the REAL confirm inside a rolled-back transaction, so
     * the journal entries on screen are the ones the commit will write.
     */
    public async OpenPreflight(draft: OrderDraft): Promise<void> {
        this.preflightDraft = draft;
        this.PreflightBusy = true;
        this.PreflightError = null;
        this.Preflight = null;
        try {
            const output = await this.entry.PreviewConfirm(draft);
            if (!output) {
                this.PreflightError = 'The pre-flight could not be run, so nothing was confirmed.';
                return;
            }
            this.Preflight = {
                CanConfirm: output.CanConfirm,
                GrossTotal: output.Totals?.GrossTotal ?? null,
                JournalEntries: output.JournalEntries ?? [],
                EntryCount: output.EntryCount ?? 0,
                CompanyCount: output.CompanyCount ?? 0,
                AllBalanced: output.AllBalanced ?? false,
                SubscriptionDecisions: output.SubscriptionDecisions ?? [],
                EntitlementGrants: output.EntitlementGrants ?? [],
                Approvals: output.Approvals ?? [],
                FulfillmentHolds: output.FulfillmentHolds ?? [],
                Blockers: output.Blockers ?? [],
            };
        } catch (e) {
            this.PreflightError = e instanceof Error ? e.message : String(e);
        } finally {
            this.PreflightBusy = false;
            // MUST tick. Everything above lands after an `await`, and this component is created
            // imperatively (no host template, zoneless), so assigning `Preflight` repaints
            // nothing on its own. Without this the dialog sits on "Working out what this will
            // do…" for ever — the pre-flight HAS run and its answer is in memory, but the commit
            // button never appears, so an order can be built and priced and never confirmed.
            this.cdr.detectChanges();
        }
    }

    /** Commit. Only reachable when the pre-flight said it could be. */
    public async ConfirmFromPreflight(): Promise<void> {
        if (!this.preflightDraft) return;
        this.PreflightBusy = true;
        try {
            const output = await this.entry.Confirm(this.preflightDraft);
            if (!output?.Success) {
                this.PreflightError = output?.Message ?? 'The order was not confirmed.';
                return;
            }
            this.ClosePreflight();
            // THE LIST IS CACHED, AND WAS READ BEFORE THIS ORDER EXISTED. `showPage` re-inserts a
            // cached view with the data it originally loaded, so confirming from fast entry landed
            // the user on All orders with their brand-new order missing from it. The order really
            // was booked; the screen was showing a snapshot from before it. Indistinguishable, from
            // the user's side, from the confirm having done nothing at all — which is how it was
            // reported, and how they were led to press confirm again.
            //
            // The workspace path already did this through its `OrderConfirmed` output. The section's
            // own confirm — the one fast entry uses — did not.
            this.dropStalePages();
            await this.OnPageSelected('list');
        } catch (e) {
            // `Confirm` THROWS on a refusal now — it used to return the failed output, and the
            // check above read it. Both shapes have to be handled: without this catch the rejection
            // escapes the handler, `PreflightError` is never set, and the pre-flight sits there
            // doing nothing. Which is precisely the silent confirm that the throw was added to
            // eliminate, reintroduced one layer up.
            this.PreflightError = e instanceof Error ? e.message : String(e);
        } finally {
            this.PreflightBusy = false;
            // Same reason as OpenPreflight: post-`await` state on an imperatively-created,
            // zoneless component. Without this the order really IS confirmed and booked, but the
            // dialog stays open showing a spinner — which reads as "it failed" and invites the
            // user to confirm a second time.
            this.cdr.detectChanges();
        }
    }

    /**
     * Throw away cached pages so the next visit re-reads.
     *
     * The ACTIVE page is kept: it is on screen, the user is looking at it, and destroying it under
     * them would blank the view mid-interaction. Everything else is a snapshot of the world before
     * whatever just changed.
     */
    private dropStalePages(): void {
        for (const [pageId, ref] of this.mounted) {
            if (pageId === this.ActivePageId) continue;
            ref.destroy();
            this.mounted.delete(pageId);
        }
    }

    public ClosePreflight(): void {
        this.Preflight = null;
        this.PreflightError = null;
        this.preflightDraft = null;
    }

    /** First page in the rail — the fallback when nothing is remembered. */
    protected get defaultPageId(): string {
        return this.subPages[0]?.Id ?? '';
    }

    /**
     * Restore the last page this user was on.
     *
     * Guarded, and falls back to the default rather than throwing: an unknown id
     * means the rail was renamed since the preference was written, and stranding
     * someone on a blank tab because of a rename is the wrong trade.
     */
    protected restorePageId(): string {
        try {
            const saved = globalThis.localStorage?.getItem(this.preferenceKey);
            if (saved && this.subPages.some((p) => p.Id === saved)) return saved;
        } catch {
            /* storage unavailable — the default is a fine answer */
        }
        return this.defaultPageId;
    }

    protected persistPageId(pageId: string): void {
        try {
            globalThis.localStorage?.setItem(this.preferenceKey, pageId);
        } catch {
            /* preferences simply do not persist */
        }
    }

    public override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return this.sectionTitle;
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return this.sectionIcon;
    }

    protected abstract get sectionTitle(): string;
    protected abstract get sectionIcon(): string;

    public override ngOnDestroy(): void {
        for (const ref of this.mounted.values()) {
            ref.destroy();
        }
        this.mounted.clear();
        super.ngOnDestroy?.();
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Orders
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The Orders tab — take an order, then work the ones you have.
 *
 * Default tab of the application, because taking an order is the job most people
 * open this app to do.
 */
@RegisterClass(BaseResourceComponent, 'OrdersSectionResource')
@Component({
    selector: 'mjo-orders-section',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOSectionShellComponent, MJOConfirmPreflightComponent, MJAlertComponent],
    template: `
        <mjo-section-shell
            Title="Orders"
            Icon="fa-solid fa-file-invoice-dollar"
            Subtitle="Take an order, then work the ones you have"
            [NavSections]="NavSections"
            [ActivePageId]="ActivePageId"
            [Loading]="IsLoading"
            [Error]="LoadError"
            (PageSelected)="OnPageSelected($event)">

            <div meta>
                @if (LoadedAtDisplay) {
                    <span class="mj-chip mj-chip--outline" title="When this screen last read the database">
                        as of {{ LoadedAtDisplay }}
                    </span>
                }
            </div>

            <div actions>
                <button
                    type="button"
                    mjButton variant="outline"
                    (click)="RefreshActivePage()"
                    aria-label="Refresh this page">
                    <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
                </button>
                @if (primaryAction; as action) {
                    <button type="button" mjButton variant="primary" (click)="StartPrimary()">
                        <i [class]="action.Icon" aria-hidden="true"></i> {{ action.Label }}
                    </button>
                }
            </div>
            <ng-container #pageHost />
        </mjo-section-shell>

        <!--
          The pre-flight lives at the SECTION, not on a page: both fast entry and
          the full editor confirm, and the overlay must survive the rail switch
          between them. It renders only while a confirm is in flight.
        -->
        @if (Preflight || PreflightBusy || PreflightError) {
            <mjo-confirm-preflight
                [Preflight]="Preflight"
                [Busy]="PreflightBusy"
                (Confirmed)="ConfirmFromPreflight()"
                (Cancelled)="ClosePreflight()" />
        }
        @if (PreflightError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-section__preflight-error" role="alert">
<strong>Nothing was confirmed.</strong> {{ PreflightError }}
            </mj-alert>
        }
    `,
    styles: [
        `
            .mjo-section__preflight-error {
                position: fixed; left: 50%; bottom: var(--mj-space-6);
                transform: translateX(-50%); z-index: 60; max-width: 560px;
            }
        `,
    ],
})
export class OrdersSectionResource extends MJOSectionBaseComponent {
    /** Taking an order is what someone arrives at this section to do. */
    protected override get primaryAction() {
        return { Label: 'New order', Icon: 'fa-solid fa-plus', PageId: 'fast-entry' };
    }

    protected get subPages(): OrdersSubPage[] {
        return ORDERS_SUB_PAGES;
    }
    protected get preferenceKey(): string {
        return 'mjOrders.section.orders.page';
    }
    protected get sectionTitle(): string {
        return 'Orders';
    }
    protected get sectionIcon(): string {
        return 'fa-solid fa-file-invoice-dollar';
    }

    /**
     * Fast entry and the editor are live; the rest still render the "not built
     * yet" notice rather than a blank pane.
     */
    protected resolvePage(pageId: string): Type<unknown> | null {
        switch (pageId) {
            case 'fast-entry':
                return MJOFastEntryPageComponent;
            case 'editor':
                // The WORKSPACE, not the bare editor: the editor is presentational and needs a
                // Draft, and opening it with no record handed it none — which is what made the
                // full order screen render a form with every field blank. The workspace owns the
                // drafts and binds the editor properly.
                return MJOOrderWorkspacePageComponent;
            case 'list':
                return MJOOrdersListPageComponent;
            case 'dashboard':
                return MJOOrdersDashboardPageComponent;
            case 'fulfillment':
                return MJOFulfillmentPageComponent;
            case 'returns':
                return MJOReturnPageComponent;
            default:
                return null;
        }
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Payments
 * ──────────────────────────────────────────────────────────────────────────── */

/** The Payments tab — take the cash, and say what it settles. */
@RegisterClass(BaseResourceComponent, 'PaymentsSectionResource')
@Component({
    selector: 'mjo-payments-section',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOSectionShellComponent],
    template: `
        <mjo-section-shell
            Title="Payments"
            Icon="fa-solid fa-money-check-dollar"
            Subtitle="Record the cash, then say what it settles"
            [NavSections]="NavSections"
            [ActivePageId]="ActivePageId"
            [Loading]="IsLoading"
            [Error]="LoadError"
            (PageSelected)="OnPageSelected($event)">

            <div meta>
                @if (LoadedAtDisplay) {
                    <span class="mj-chip mj-chip--outline" title="When this screen last read the database">
                        as of {{ LoadedAtDisplay }}
                    </span>
                }
            </div>

            <div actions>
                <button
                    type="button"
                    mjButton variant="outline"
                    (click)="RefreshActivePage()"
                    aria-label="Refresh this page">
                    <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
                </button>
                @if (primaryAction; as action) {
                    <button type="button" mjButton variant="primary" (click)="StartPrimary()">
                        <i [class]="action.Icon" aria-hidden="true"></i> {{ action.Label }}
                    </button>
                }
            </div>
            <ng-container #pageHost />
        </mjo-section-shell>
    `,
})
export class PaymentsSectionResource extends MJOSectionBaseComponent {
    protected override get primaryAction() {
        return { Label: 'Take a payment', Icon: 'fa-solid fa-plus', PageId: 'entry' };
    }

    protected get subPages(): OrdersSubPage[] {
        return PAYMENTS_SUB_PAGES;
    }
    protected get preferenceKey(): string {
        return 'mjOrders.section.payments.page';
    }
    protected get sectionTitle(): string {
        return 'Payments';
    }
    protected get sectionIcon(): string {
        return 'fa-solid fa-money-check-dollar';
    }
    protected resolvePage(pageId: string): Type<unknown> | null {
        switch (pageId) {
            case 'entry':
                return MJOPaymentEntryPageComponent;
            case 'list':
                return MJOPaymentsListPageComponent;
            case 'dashboard':
                return MJOPaymentsDashboardPageComponent;
            case 'refund':
                return MJORefundPageComponent;
            case 'credit':
                return MJOAccountCreditPageComponent;
            default:
                return null;
        }
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Receivables
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The Receivables tab — A/R, collections and subscriptions.
 *
 * Its own section rather than a "Reports" folder: aging and renewals are
 * operational work with worklists and actions, and filing them under Reports
 * would tell the accounting team their work is read-only.
 */
@RegisterClass(BaseResourceComponent, 'ReceivablesSectionResource')
@Component({
    selector: 'mjo-receivables-section',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOSectionShellComponent],
    template: `
        <mjo-section-shell
            Title="Receivables"
            Icon="fa-solid fa-chart-column"
            Subtitle="Where each relationship stands before you pick up the phone"
            [NavSections]="NavSections"
            [ActivePageId]="ActivePageId"
            [Loading]="IsLoading"
            [Error]="LoadError"
            (PageSelected)="OnPageSelected($event)">

            <div meta>
                @if (LoadedAtDisplay) {
                    <span class="mj-chip mj-chip--outline" title="When this screen last read the database">
                        as of {{ LoadedAtDisplay }}
                    </span>
                }
            </div>

            <div actions>
                <button
                    type="button"
                    mjButton variant="outline"
                    (click)="RefreshActivePage()"
                    aria-label="Refresh this page">
                    <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
                </button>
                @if (primaryAction; as action) {
                    <button type="button" mjButton variant="primary" (click)="StartPrimary()">
                        <i [class]="action.Icon" aria-hidden="true"></i> {{ action.Label }}
                    </button>
                }
            </div>
            <ng-container #pageHost />
        </mjo-section-shell>
    `,
})
export class ReceivablesSectionResource extends MJOSectionBaseComponent {
    protected get subPages(): OrdersSubPage[] {
        return RECEIVABLES_SUB_PAGES;
    }
    protected get preferenceKey(): string {
        return 'mjOrders.section.receivables.page';
    }
    protected get sectionTitle(): string {
        return 'Receivables';
    }
    protected get sectionIcon(): string {
        return 'fa-solid fa-chart-column';
    }
    protected resolvePage(pageId: string): Type<unknown> | null {
        switch (pageId) {
            case 'overdue':
                return MJOOverduePageComponent;
            case 'aging':
                return MJOCustomerARPageComponent;
            case 'subscriptions':
                return MJOSubscriptionsPageComponent;
            default:
                return null;
        }
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Catalog
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The Catalog tab — where the behaviour every order inherits is configured.
 *
 * Product type decides revenue recognition, taxability, fulfillment and
 * recurrence, so this is the section that makes the order screens correct by
 * default instead of asking the user to restate it per line.
 */
@RegisterClass(BaseResourceComponent, 'CatalogSectionResource')
@Component({
    selector: 'mjo-catalog-section',
    standalone: true,
    imports: [MJButtonDirective, CommonModule, MJOSectionShellComponent],
    template: `
        <mjo-section-shell
            Title="Catalog"
            Icon="fa-solid fa-box-open"
            Subtitle="Products, prices, promotions and the charges every order inherits"
            [NavSections]="NavSections"
            [ActivePageId]="ActivePageId"
            [Loading]="IsLoading"
            [Error]="LoadError"
            (PageSelected)="OnPageSelected($event)">

            <div meta>
                @if (LoadedAtDisplay) {
                    <span class="mj-chip mj-chip--outline" title="When this screen last read the database">
                        as of {{ LoadedAtDisplay }}
                    </span>
                }
            </div>

            <div actions>
                <button
                    type="button"
                    mjButton variant="outline"
                    (click)="RefreshActivePage()"
                    aria-label="Refresh this page">
                    <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
                </button>
                @if (primaryAction; as action) {
                    <button type="button" mjButton variant="primary" (click)="StartPrimary()">
                        <i [class]="action.Icon" aria-hidden="true"></i> {{ action.Label }}
                    </button>
                }
            </div>
            <ng-container #pageHost />
        </mjo-section-shell>
    `,
})
export class CatalogSectionResource extends MJOSectionBaseComponent {
    protected get subPages(): OrdersSubPage[] {
        return CATALOG_SUB_PAGES;
    }
    protected get preferenceKey(): string {
        return 'mjOrders.section.catalog.page';
    }
    protected get sectionTitle(): string {
        return 'Catalog';
    }
    protected get sectionIcon(): string {
        return 'fa-solid fa-box-open';
    }
    protected resolvePage(pageId: string): Type<unknown> | null {
        switch (pageId) {
            case 'products':
                return MJOProductsPageComponent;
            case 'charges':
                return MJOChargesTaxPageComponent;
            case 'pricing':
                return MJOPricingPageComponent;
            case 'promotions':
                return MJOPromotionsPageComponent;
            default:
                return null;
        }
    }
}

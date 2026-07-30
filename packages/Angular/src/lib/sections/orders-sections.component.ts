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
    Component,
    Directive,
    OnInit,
    Type,
    ViewChild,
    ViewContainerRef,
    type ComponentRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import type { MJLeftNavSection } from '@memberjunction/ng-ui-components';
import type { ResourceData } from '@memberjunction/core-entities';

import { MJOSectionShellComponent } from './section-shell.component';
import { MJOFastEntryPageComponent } from '../pages/orders/fast-entry.page';
import { MJOOrderEditorPageComponent } from '../pages/orders/order-editor.page';
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

    /** The rail, rebuilt whenever a badge count changes. */
    public NavSections: MJLeftNavSection[] = [];

    /** Which sub-page is showing. */
    public ActivePageId: string | null = null;

    public IsLoading = false;
    public LoadError: string | null = null;

    /** Live counts the rail badges. Sections refresh these; zero badges do not render. */
    protected badges: OrdersNavBadges = {};

    private readonly mounted = new Map<string, ComponentRef<unknown>>();

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
        // The host view has to exist before a page can be created into it.
        queueMicrotask(() => this.showPage(this.ActivePageId!));
    }

    /** Rail click handler. */
    public OnPageSelected(pageId: string): void {
        this.ActivePageId = pageId;
        this.persistPageId(pageId);
        this.showPage(pageId);
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
    protected showPage(pageId: string): void {
        const host = this.pageHost;
        if (!host) return;

        host.detach();

        const cached = this.mounted.get(pageId);
        if (cached) {
            host.insert(cached.hostView);
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
            const ref = host.createComponent(type);
            this.mounted.set(pageId, ref);
            this.LoadError = null;
        } catch (e) {
            // A page that fails to construct must not take the section down with
            // it — the rail has to stay usable so the user can go somewhere else.
            this.LoadError = `That page could not be opened: ${e instanceof Error ? e.message : String(e)}`;
        }
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
    imports: [CommonModule, MJOSectionShellComponent],
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
            <ng-container #pageHost />
        </mjo-section-shell>
    `,
})
export class OrdersSectionResource extends MJOSectionBaseComponent {
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
                return MJOOrderEditorPageComponent;
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
    imports: [CommonModule, MJOSectionShellComponent],
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
            <ng-container #pageHost />
        </mjo-section-shell>
    `,
})
export class PaymentsSectionResource extends MJOSectionBaseComponent {
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
    protected resolvePage(_pageId: string): Type<unknown> | null {
        return null;
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
    imports: [CommonModule, MJOSectionShellComponent],
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
    protected resolvePage(_pageId: string): Type<unknown> | null {
        return null;
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
    imports: [CommonModule, MJOSectionShellComponent],
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
    protected resolvePage(_pageId: string): Type<unknown> | null {
        return null;
    }
}

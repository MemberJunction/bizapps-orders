/**
 * The order workspace — several orders in progress at once, one tab each.
 *
 * WHY THIS EXISTS. The full order editor was reachable only one order at a time, and only for an
 * order that already existed: opening it without a record handed `MJOOrderEditorPageComponent` an
 * undefined `Draft`, so every field rendered its `— none —` fallback and the screen looked like a
 * form that had lost its data. There was no way to start a NEW order there at all — fast entry was
 * the only entry point, which is fine for a two-line counter sale and hopeless for anything with a
 * ship-to, a service period or a promotion.
 *
 * WHAT IT DOES. It owns a `WorkspaceTabStore<OrderDraft>` and renders the SAME editor for whichever
 * tab is active. A tab is one in-progress order; "New order" mints a real `OrderDraft` rather than
 * navigating somewhere. Because this is an ordinary template binding (`[Draft]="ActiveDraft"`), the
 * editor's inputs and outputs are wired by Angular — the section's imperative
 * `createComponent` + `setInput` path is bypassed entirely for the editor.
 *
 * WHY THE WORKSPACE CARD AND NOT A ROUTE PER ORDER. Taking orders is a repetitive, interrupt-driven
 * job: a customer calls mid-order, a second walks up, the first needs a line changed. Tabs model
 * that; navigation loses the half-finished draft. Accounting reached the same conclusion for
 * journal entries and built `mj-workspace-card`, so orders uses it rather than inventing a second
 * one — see `../../transfer-pending/README.md` for why there are two copies today and why that is
 * the argument for promoting it.
 *
 * STATE IS SESSION-SCOPED, deliberately. A tab lives until it is closed or the session ends; the
 * framework does not persist drafts to the database. "Keep as draft" is what makes an order durable
 * — it saves through `OrdersSaveOrderOperation` and leaves the tab open, marked clean.
 *
 * CONNECTS TO:
 *   EDITOR:    ./order-editor.page.ts        — the per-order surface, unchanged in shape
 *   FRAMEWORK: ../../transfer-pending/workspace-tabs/ — parked, owed to ng-ui-components
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderDraft } from '@mj-biz-apps/orders-entities';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';

import { WorkspaceCardComponent } from '../../transfer-pending/workspace-tabs/workspace-card.component';
import { WorkspaceTabStore } from '../../transfer-pending/workspace-tabs/workspace-tab-store';
import type { TabReorder } from '../../transfer-pending/workspace-tabs/workspace-tab-strip.component';
import { MJOOrderEditorPageComponent } from './order-editor.page';
import type { MJOOrderStage } from '../../panels/status-stepper.component';
import { MJOOrderEntryService } from '../../services/order-entry.service';
import { MJOOrdersDataService } from '../../services/orders-data.service';
import type { MJOProductOption } from './fast-entry.page';
import type { MJOTenderOption } from '../payments/payment-entry.page';
import { ReadableSaveError } from '../../services/save-error';

/** What a tab's caption says before the customer is known. */
const UNTITLED = 'New order';

@Component({
    selector: 'mjo-order-workspace-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, WorkspaceCardComponent, MJOOrderEditorPageComponent, MJAlertComponent],
    template: `
        @if (Error) {
            <mj-alert Variant="error" [Dismissible]="true" (Dismissed)="Error = null">{{ Error }}</mj-alert>
        }

        <mj-workspace-card
            class="mjo-orderws"
            AriaLabel="Orders in progress"
            NewTabLabel="New order"
            [Tabs]="Tabs"
            [ActiveId]="ActiveId"
            [ShowFooter]="!!ActiveDraft"
            ConfirmLabel="Confirm order"
            ConfirmIcon="fa-solid fa-circle-check"
            [ConfirmDisabled]="!CanConfirm"
            [ConfirmTitle]="ConfirmTitle"
            [ConfirmBusy]="Busy"
            ConfirmBusyLabel="Confirming…"
            DraftLabel="Keep as draft"
            [DraftDisabled]="!ActiveDraft || Busy"
            (TabSelected)="OnTabSelected($event)"
            (TabClosed)="OnTabClosed($event)"
            (NewTabRequested)="NewOrder()"
            (TabReordered)="OnTabReordered($event)"
            (Confirm)="OnConfirm()"
            (SaveDraft)="OnKeepAsDraft()"
            (Discard)="OnDiscard()">

            @if (ActiveDraft; as draft) {
                <mjo-order-editor-page
                    [Draft]="draft"
                    [Catalog]="Catalog"
                    [Tenders]="Tenders"
                    [Status]="ActiveStatus"
                    [OrderNumber]="ActiveOrderNumber"
                    [ShowActions]="false"
                    (Saved)="OnEditorSaved($event)" />
            } @else {
                <!-- Not an error state: a workspace with no tabs is the normal starting point. -->
                <div class="mjo-orderws__empty">
                    <i class="fa-solid fa-cart-plus" aria-hidden="true"></i>
                    <p>No order open.</p>
                    <button type="button" class="mj-btn mj-btn--primary" (click)="NewOrder()">
                        <i class="fa-solid fa-plus" aria-hidden="true"></i> New order
                    </button>
                </div>
            }
        </mj-workspace-card>
    `,
    styles: [
        `
            /* Container units, never viewport — the card is a pane, not the screen.
               (transfer-pending/README.md → DESIGN RULE, Marcelo 2026-07-21.) */

            /* THE PAGE SUPPLIES ITS OWN GUTTER. The section shell wraps pages in
               <mj-page-body-interior [Padding]="false"> and says so in its comment: padding is off
               "because each page supplies its own". This page supplied none, so the card — which
               draws its own border and 12px radius and is designed as one object AGAINST a page —
               sat flush against the viewport edge with its border pressed flat and nothing to
               separate the working surface from the page.

               The inset belongs HERE, not on the card: the card is a byte-identical parked copy of
               accounting's, and a component should not reserve space around itself anyway. */
            :host {
                display: flex;
                flex-direction: column;
                block-size: 100%;
                min-block-size: 0;
                padding: var(--mj-space-4);
                background: var(--mj-bg-page);
            }
            .mjo-orderws {
                flex: 1 1 auto;
                min-block-size: 0;
            }
            /* Inside the card, so it conforms to the card's surface — not the page tone above. */
            .mjo-orderws__empty {
                background: var(--mj-bg-surface);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: var(--mj-space-3);
                min-block-size: 40cqh;
                color: var(--mj-text-secondary);
            }
            .mjo-orderws__empty i {
                font-size: var(--mj-text-2xl);
                color: var(--mj-text-tertiary);
            }
        `,
    ],
})
export class MJOOrderWorkspacePageComponent implements OnDestroy {
    private readonly entry = inject(MJOOrderEntryService);
    private readonly data = inject(MJOOrdersDataService);
    private readonly cdr = inject(ChangeDetectorRef);

    /** The company a new draft is raised against — supplied by the section. */
    @Input() CompanyID = '';

    /** Product options, passed straight through to the editor. */
    @Input() Catalog: MJOProductOption[] = [];

    /** Tenders the instance accepts, likewise passed through. */
    @Input() Tenders: MJOTenderOption[] = [];

    /**
     * Set by the section when the user opened a specific order. Handled as an input rather than a
     * method call because the section creates this page imperatively and can only hand it inputs.
     */
    @Input() set OrderID(id: string | null) {
        if (id) void this.OpenExisting(id);
    }

    /** Raised when an order is confirmed, so the section can refresh lists that now include it. */
    @Output() OrderConfirmed = new EventEmitter<string>();

    private readonly tabs = new WorkspaceTabStore<OrderDraft>();
    /** Per-tab metadata the framework deliberately knows nothing about. */
    private readonly meta = new Map<string, { OrderNumber: string | null; Stage: MJOOrderStage }>();
    private readonly unsubscribes = new Map<string, () => void>();

    public Error: string | null = null;
    public Busy = false;

    public get Tabs() {
        return this.tabs.Tabs;
    }
    public get ActiveId() {
        return this.tabs.ActiveId;
    }
    public get ActiveDraft(): OrderDraft | null {
        return this.tabs.ActiveTab?.State ?? null;
    }
    public get ActiveOrderNumber(): string | null {
        return this.ActiveId ? (this.meta.get(this.ActiveId)?.OrderNumber ?? null) : null;
    }
    public get ActiveStatus(): MJOOrderStage {
        return this.ActiveId ? (this.meta.get(this.ActiveId)?.Stage ?? 'Draft') : 'Draft';
    }

    /**
     * Confirm is gated on the DRAFT'S OWN validation, not on a hand-rolled field check here.
     * `OrderDraft.Validate()` is the same rule set the server enforces; duplicating it in the UI is
     * how the two drift apart and how a button ends up enabled for an order the server will refuse.
     */
    public get CanConfirm(): boolean {
        const d = this.ActiveDraft;
        return !!d && !this.Busy && d.LineCount > 0 && d.Validate().IsValid;
    }

    public get ConfirmTitle(): string | null {
        const d = this.ActiveDraft;
        if (!d) return null;
        if (d.LineCount === 0) return 'Add at least one line first';
        const result = d.Validate();
        if (!result.IsValid) return result.Issues.map((i) => i.Message).join(' · ');
        return null;
    }

    public ngOnDestroy(): void {
        for (const stop of this.unsubscribes.values()) stop();
        this.unsubscribes.clear();
    }

    // ── tabs ────────────────────────────────────────────────────────────────────────────────

    /** Mint a real draft. This is the thing the editor never had. */
    public NewOrder(): void {
        if (!this.CompanyID) {
            this.Error = 'No company is configured for this instance, so an order cannot be raised.';
            return;
        }
        const draft = new OrderDraft({ CompanyID: this.CompanyID });
        this.OpenTab(draft, { Label: UNTITLED, OrderNumber: null, Stage: 'Draft' });
    }

    /** Open an order that already exists, or focus its tab if it is already open. */
    public async OpenExisting(orderHeaderID: string): Promise<void> {
        // Re-opening the same order must not create a second tab — two tabs editing one order is
        // two drafts racing to save over each other.
        for (const tab of this.tabs.Tabs) {
            if (tab.State.Header.OrderHeaderID === orderHeaderID) {
                this.tabs.Activate(tab.Id);
                this.cdr.detectChanges();
                return;
            }
        }
        try {
            const draft = await this.entry.LoadDraft(orderHeaderID, this.data);
            if (!draft) {
                this.Error = 'That order could not be loaded.';
                this.cdr.detectChanges();
                return;
            }
            this.OpenTab(draft, { Label: UNTITLED, OrderNumber: null, Stage: 'Draft' });
        } catch (e) {
            this.Error = ReadableSaveError(e);
            this.cdr.detectChanges();
        }
    }

    private OpenTab(draft: OrderDraft, init: { Label: string; OrderNumber: string | null; Stage: MJOOrderStage }): void {
        const id = `ord-${Date.now().toString(36)}-${this.tabs.Count}`;
        this.meta.set(id, { OrderNumber: init.OrderNumber, Stage: init.Stage });
        this.tabs.Open({ Id: id, Label: init.Label, Icon: 'fa-solid fa-file-invoice', Status: 'draft', State: draft, Dirty: false });

        // The draft is the source of truth for the tab's caption and dirty flag. Subscribing keeps
        // both honest without the editor having to report anything upward — it already mutates the
        // draft it was handed, and that is the only channel needed.
        this.unsubscribes.set(
            id,
            draft.Subscribe(() => {
                this.tabs.UpdateState(id, draft);
                this.cdr.detectChanges();
            }),
        );
        this.cdr.detectChanges();
    }

    public OnTabSelected(id: string): void {
        this.tabs.Activate(id);
        this.cdr.detectChanges();
    }

    public OnTabClosed(id: string): void {
        this.unsubscribes.get(id)?.();
        this.unsubscribes.delete(id);
        this.meta.delete(id);
        this.tabs.Close(id);
        this.cdr.detectChanges();
    }

    public OnTabReordered(move: TabReorder): void {
        this.tabs.Reorder(move.previousIndex, move.currentIndex);
        this.cdr.detectChanges();
    }

    // ── footer actions ──────────────────────────────────────────────────────────────────────

    /** Persist without confirming. The order becomes durable; the tab stays open. */
    public async OnKeepAsDraft(): Promise<void> {
        const id = this.ActiveId;
        const draft = this.ActiveDraft;
        if (!id || !draft || this.Busy) return;
        this.Busy = true;
        this.Error = null;
        this.cdr.detectChanges();
        try {
            const saved = await this.entry.Save(draft);
            if (saved?.OrderNumber) {
                this.meta.set(id, { OrderNumber: saved.OrderNumber, Stage: this.meta.get(id)?.Stage ?? 'Draft' });
                this.tabs.Tabs.find((t) => t.Id === id)!.Label = saved.OrderNumber;
            }
            this.tabs.MarkClean(id);
        } catch (e) {
            this.Error = ReadableSaveError(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public async OnConfirm(): Promise<void> {
        const id = this.ActiveId;
        const draft = this.ActiveDraft;
        if (!id || !draft || this.Busy) return;
        this.Busy = true;
        this.Error = null;
        this.cdr.detectChanges();
        try {
            const result = await this.entry.Confirm(draft);
            if (!result) {
                this.Error = 'The order was not confirmed. Nothing has been booked.';
                return;
            }
            // A confirmed order is kept OPEN and read-only rather than closed: the person who just
            // took it usually needs to read the number back to the customer.
            this.meta.set(id, { OrderNumber: result.OrderNumber ?? null, Stage: 'Confirmed' });
            const tab = this.tabs.Tabs.find((t) => t.Id === id);
            if (tab && result.OrderNumber) tab.Label = result.OrderNumber;
            this.tabs.SetStatus(id, 'complete');
            this.tabs.MarkClean(id);
            if (result.OrderHeaderID) this.OrderConfirmed.emit(result.OrderHeaderID);
        } catch (e) {
            this.Error = ReadableSaveError(e);
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /** Throw the tab away. The card asks for confirmation when the tab is dirty. */
    public OnDiscard(): void {
        if (this.ActiveId) this.OnTabClosed(this.ActiveId);
    }

    public OnEditorSaved(draft: OrderDraft): void {
        if (this.ActiveId) this.tabs.UpdateState(this.ActiveId, draft);
        this.cdr.detectChanges();
    }
}

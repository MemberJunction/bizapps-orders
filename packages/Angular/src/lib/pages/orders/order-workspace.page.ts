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
 * WHAT IT DOES. It owns a `WorkspaceTabStore<OrderHeaderEntity>` and renders the SAME editor for whichever
 * tab is active. A tab is one in-progress order; "New order" mints a real `OrderHeaderEntity` rather than
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
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { Metadata } from '@memberjunction/core';

import { MJAlertComponent } from '@memberjunction/ng-ui-components';

import { WorkspaceCardComponent } from '../../transfer-pending/workspace-tabs/workspace-card.component';
import { WorkspaceTabStore } from '../../transfer-pending/workspace-tabs/workspace-tab-store';
import type { TabReorder } from '../../transfer-pending/workspace-tabs/workspace-tab-strip.component';
import { MJOOrderEditorPageComponent } from './order-editor.page';
import type { MJOOrderStage } from '../../panels/status-stepper.component';
import { MJOPricingScheduler } from '../../services/pricing-scheduler.service';
import { type MJOCompanyOption } from '../../data/orders-queries';
import type { MJOProductOption } from './fast-entry.page';
import type { MJOTenderOption } from '../payments/payment-entry.page';
import { ReadableSaveError } from '../../services/save-error';
import { MJO_ENTITIES } from '../../data/entity-names';

/**
 * An order and its lines, loaded together.
 *
 * A free function rather than a service method: it constructs an entity and asks it to load itself,
 * which is `docs/ui-architecture.md`'s definition of work that does not belong behind an injectable.
 */
async function loadOrder(orderHeaderID: string): Promise<OrderHeaderEntity | null> {
    const md = new Metadata();
    const order = await md.GetEntityObject<OrderHeaderEntity>(MJO_ENTITIES.OrderHeader);
    return (await order.LoadWithLines(orderHeaderID)) ? order : null;
}


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
                    [Order]="draft"
                    [Catalog]="Catalog"
                    [Tenders]="Tenders"
                    [Companies]="Companies"
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
    private readonly entry = inject(MJOPricingScheduler);
    private readonly cdr = inject(ChangeDetectorRef);

    /** The company a new draft is raised against — supplied by the section. */
    @Input() CompanyID = '';

    /** Product options, passed straight through to the editor. */
    @Input() Catalog: MJOProductOption[] = [];

    /** Tenders the instance accepts, likewise passed through. */
    @Input() Tenders: MJOTenderOption[] = [];

    /**
     * Companies an order can be sold as, passed through to the editor's identity strip.
     *
     * The section supplies this to whatever page it mounts, and for 'editor' the page it mounts is
     * THIS workspace — not the editor. Without the pass-through the editor's list stayed empty, so
     * "Selling as" rendered a dash and the picker never appeared however many companies existed.
     */
    @Input() Companies: MJOCompanyOption[] = [];

    /**
     * Set by the section when the user opened a specific order. Handled as an input rather than a
     * method call because the section creates this page imperatively and can only hand it inputs.
     */
    @Input() set OrderID(id: string | null) {
        if (id) void this.OpenExisting(id);
    }

    /** Raised when an order is confirmed, so the section can refresh lists that now include it. */
    @Output() OrderConfirmed = new EventEmitter<string>();

    private readonly tabs = new WorkspaceTabStore<OrderHeaderEntity>();
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
    public get ActiveDraft(): OrderHeaderEntity | null {
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
     * `OrderHeaderEntity.Validate()` is the same rule set the server enforces; duplicating it in the UI is
     * how the two drift apart and how a button ends up enabled for an order the server will refuse.
     */
    public get CanConfirm(): boolean {
        const d = this.ActiveDraft;
        return !!d && !this.Busy && d.Lines.Count > 0 && d.Validate().Success;
    }

    public get ConfirmTitle(): string | null {
        const d = this.ActiveDraft;
        if (!d) return null;
        if (d.Lines.Count === 0) return 'Add at least one line first';
        const result = d.Validate();
        if (!result.Success) return result.Errors.map((e) => e.Message).join(' · ');
        return null;
    }

    /**
     * Map the stored status onto the stepper's stage.
     *
     * Anything unrecognised falls back to `Draft` — but only for a MISSING status. A status we do
     * not recognise is safer treated as read-only than as editable, because the failure modes are
     * not symmetric: wrongly read-only is an inconvenience, wrongly editable invites someone to
     * change a booked order.
     */
    private StageOf(status: string | undefined | null): MJOOrderStage {
        if (!status) return 'Draft';
        const known: MJOOrderStage[] = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled'];
        return known.find((s) => s.toLowerCase() === status.toLowerCase()) ?? 'Confirmed';
    }

    public ngOnDestroy(): void {
        for (const stop of this.unsubscribes.values()) stop();
        this.unsubscribes.clear();
    }

    // ── tabs ────────────────────────────────────────────────────────────────────────────────

    /** Mint a real draft. This is the thing the editor never had. */
    public async NewOrder(): Promise<void> {
        if (!this.CompanyID) {
            this.Error = 'No company is configured for this instance, so an order cannot be raised.';
            this.cdr.detectChanges();
            return;
        }
        const md = new Metadata();
        const draft = await md.GetEntityObject<OrderHeaderEntity>(MJO_ENTITIES.OrderHeader);
        draft.NewRecord();
        draft.CompanyID = this.CompanyID;
        this.OpenTab(draft, { Label: UNTITLED, OrderNumber: null, Stage: 'Draft' });
    }

    /**
     * Take over a draft someone else was already building — fast entry escalating to the full
     * editor.
     *
     * The SAME OrderHeaderEntity instance is adopted, not a copy. That is what makes escalation lossless:
     * fast entry hands over the object it has been mutating, so every line, party and promotion
     * code typed so far is simply already there. Copying would work today and drift the moment the
     * draft grows a field the copier forgets.
     *
     * If this exact draft is already open in a tab, focus it rather than opening a second — two
     * tabs editing one draft would be two views racing to save the same order.
     */
    public AdoptDraft(draft: OrderHeaderEntity): void {
        const existing = this.tabs.Tabs.find((t) => t.State === draft);
        if (existing) {
            this.tabs.Activate(existing.Id);
            this.cdr.detectChanges();
            return;
        }
        this.OpenTab(draft, { Label: UNTITLED, OrderNumber: null, Stage: 'Draft' });
    }

    /** Open an order that already exists, or focus its tab if it is already open. */
    public async OpenExisting(orderHeaderID: string): Promise<void> {
        // Re-opening the same order must not create a second tab — two tabs editing one order is
        // two drafts racing to save over each other.
        for (const tab of this.tabs.Tabs) {
            if (tab.State.ID === orderHeaderID) {
                this.tabs.Activate(tab.Id);
                this.cdr.detectChanges();
                return;
            }
        }
        try {
            // ONE read now, not two.
            //
            // This used to load a draft AND separately query the order row, because `OrderDraft`
            // modelled only what could be EDITED — no order number, no status. Opening an existing
            // order with the draft alone labelled the tab "New order", showed "New draft" where the
            // number belongs, and left `Stage: 'Draft'`, which is what `IsEditable` keys off: a
            // CONFIRMED order came up fully editable.
            //
            // The entity carries OrderNumber and Status because the table does, so that whole class
            // of bug is gone rather than guarded against.
            const draft = await loadOrder(orderHeaderID);
            if (!draft) {
                this.Error = 'That order could not be loaded.';
                this.cdr.detectChanges();
                return;
            }
            this.OpenTab(draft, {
                Label: draft.OrderNumber ?? UNTITLED,
                OrderNumber: draft.OrderNumber ?? null,
                Stage: this.StageOf(draft.Status),
            });
        } catch (e) {
            this.Error = ReadableSaveError(e);
            this.cdr.detectChanges();
        }
    }

    private OpenTab(draft: OrderHeaderEntity, init: { Label: string; OrderNumber: string | null; Stage: MJOOrderStage }): void {
        const id = `ord-${Date.now().toString(36)}-${this.tabs.Count}`;
        this.meta.set(id, { OrderNumber: init.OrderNumber, Stage: init.Stage });
        this.tabs.Open({
            Id: id,
            Label: init.Label,
            Icon: 'fa-solid fa-file-invoice',
            // An order that is already past Draft opens as a COMPLETE tab — read-only, and marked
            // as such in the strip — rather than as a draft the user might expect to edit.
            Status: init.Stage === 'Draft' || init.Stage === 'Quoted' ? 'draft' : 'complete',
            State: draft,
            Dirty: false,
        });

        // The draft is the source of truth for the tab's caption and dirty flag. Subscribing keeps
        // both honest without the editor having to report anything upward — it already mutates the
        // draft it was handed, and that is the only channel needed.
        // NO SUBSCRIBE. The tab holds the entity itself, so there is nothing to copy into the tab
        // state when it changes — `UpdateState` existed to keep a snapshot in step with the draft.
        // The editor mutates the very object this store holds, and the tab's dirty flag comes from
        // the entity's own `Dirty`, which rolls up its lines.
        this.tabs.UpdateState(id, draft);
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
            await draft.SaveOrThrow();
            // The order number is assigned by the save and lands on the entity itself, so it is read
            // back from the object rather than from an operation's output envelope.
            if (draft.OrderNumber) {
                this.meta.set(id, { OrderNumber: draft.OrderNumber, Stage: this.meta.get(id)?.Stage ?? 'Draft' });
                this.tabs.Tabs.find((t) => t.Id === id)!.Label = draft.OrderNumber;
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
            // Throws with the engine's reason if the confirm is refused — nothing is booked and the
            // catch below shows why. There is no success-shaped failure to mistake for a success.
            await draft.Confirm();

            // A confirmed order is kept OPEN and read-only rather than closed: the person who just
            // took it usually needs to read the number back to the customer.
            //
            // Everything below is read from the ENTITY, which the save updated in place — no output
            // envelope to unpack, and no chance of the screen and the record disagreeing.
            this.meta.set(id, { OrderNumber: draft.OrderNumber ?? null, Stage: 'Confirmed' });
            const tab = this.tabs.Tabs.find((t) => t.Id === id);
            if (tab && draft.OrderNumber) tab.Label = draft.OrderNumber;
            this.tabs.SetStatus(id, 'complete');
            this.tabs.MarkClean(id);
            if (draft.ID) this.OrderConfirmed.emit(draft.ID);
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

    public OnEditorSaved(draft: OrderHeaderEntity): void {
        if (this.ActiveId) this.tabs.UpdateState(this.ActiveId, draft);
        this.cdr.detectChanges();
    }
}

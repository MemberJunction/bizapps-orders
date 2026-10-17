import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersAdoptExternalInvoiceOperation,
    OrdersCancelExternalInvoiceOperation,
    OrdersIssueExternalInvoiceOperation,
    type mjBizAppsOrdersOrderHeaderEntity,
} from '@mj-biz-apps/orders-entities';
import { FormatInstantDate, FormatMoney } from '../panels/money-format';
import {
    BilledOnScheduleFromRows,
    CanCancel,
    CanResolveInFlight,
    CanSend,
    SendApplies,
    SendDisabledReason,
    SendIsReissue,
    StateChipClass,
    StateLabel,
    type ExternalInvoiceLike,
} from '../panels/external-invoice-view';

/** One `ExternalInvoice` row as this panel needs it. Read by name; the panel never writes one. */
interface ExternalInvoiceRow {
    ID: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
    DocumentNumber: string;
    Amount: number;
    Status: 'Sending' | 'Sent' | 'Canceled' | 'Failed';
    ExternalInvoiceRef: string | null;
    ExternalStatus: string | null;
    SentAt: string | null;
    CanceledAt: string | null;
    LastError: string | null;
}

const EXTERNAL_INVOICE_ENTITY = 'MJ_BizApps_Orders: External Invoices';
const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const PAYMENT_PROVIDER_TYPE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Types';
const ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY = 'MJ_BizApps_Orders: Order Header Payment Schedules';

/** Provider type codes that invoice through an external rail. Mirrors `INVOICE_RAIL_TYPE_CODES`. */
const RAIL_TYPE_CODES = ['BillCom'];

/** The form toolbar key of the Send button this panel registers. */
const SEND_TOOLBAR_KEY = 'send-external-invoice';

/** The panel's `SectionKey`; Send opens it so the result and the new row are in view. */
const SECTION_KEY = 'externalInvoices';

/**
 * `mjo-external-invoices-panel` — the rail's side of one order, on the order.
 *
 * WHY THIS EXISTS. Everything the rail does runs on a schedule: a confirmed order joins a queue and a
 * job sends it within the half hour. That is the right default and it is invisible, so when somebody
 * asks "did this customer get their invoice?" there was nowhere to look. This panel is that place, and
 * it carries the two acts a person is allowed to take.
 *
 * IT NAMES THE PROVIDER FROM DATA, NEVER IN THE COPY. The rail is a seam with one implementation
 * today; a second is a row and a class. A button reading "Send to Bill.com" would be a second place to
 * edit on that day, and simply wrong on an order whose companies sit on different rails.
 *
 * SEND LIVES IN THE FORM TOOLBAR, NOT IN THE PANEL. Once an order is confirmed, sending it is the next
 * thing a person does with it, and the panel sits collapsed at the foot of the form. The panel
 * registers the button next to Confirm order, so it sits where the eye already goes; the panel keeps
 * the rows, the warning that blocks a send, and the acts on one selected invoice. The button shows on
 * every order the rail applies to and is greyed out, with the reason as its tooltip, until the order
 * is confirmed and saved.
 *
 * IT HIDES ITSELF when no company on the order has an active rail, so the overwhelming majority of
 * orders — the ones invoiced natively — look exactly as they did before this feature existed.
 *
 * @module @mj-biz-apps/orders-ng
 */
@Component({
    standalone: false,
    selector: 'mjo-external-invoices-panel',
    template: `
        @if (Visible) {
            <mj-collapsible-panel
                [SectionKey]="SectionKey"
                SectionName="External invoicing"
                Icon="fa-solid fa-paper-plane"
                [Form]="FormComponent"
                [FormContext]="FormContext"
                [BadgeCount]="Rows.length"
                [DefaultExpanded]="false">
                @if (LoadError) {
                    <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-xi__note">
                        <strong>The external invoices did not load.</strong>
                        {{ LoadError }}
                    </mj-alert>
                }
                @if (Notice) {
                    <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-xi__note">{{ Notice.Text }}</mj-alert>
                }

                @if (!Rows.length && !LoadError) {
                    <p class="mjo-xi__empty">
                        Nothing has been sent to {{ ProviderName }} for this order yet.
                        @if (Sendable) { It is queued, and the scheduled send picks it up. }
                    </p>
                }

                @if (Rows.length) {
                    <table class="mjo-xi__table">
                        <thead>
                            <tr>
                                <th scope="col">Document</th>
                                <th scope="col">Amount</th>
                                <th scope="col">State</th>
                                <th scope="col">Reference</th>
                                <th scope="col">Sent</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (row of Rows; track row.ID) {
                                <tr [class.is-selected]="Selected?.ID === row.ID" (click)="Select(row)">
                                    <td class="mono">{{ row.DocumentNumber }}</td>
                                    <td class="num">{{ money(row.Amount) }}</td>
                                    <td>
                                        <span class="mj-chip" [class]="ChipClass(row)">{{ StateLabel(row) }}</span>
                                    </td>
                                    <td class="mono muted">{{ row.ExternalInvoiceRef ?? '—' }}</td>
                                    <td class="muted">{{ row.SentAt ? date(row.SentAt) : '—' }}</td>
                                </tr>
                                @if (row.LastError) {
                                    <tr class="mjo-xi__errrow">
                                        <td colspan="5" class="small">{{ row.LastError }}</td>
                                    </tr>
                                }
                            }
                        </tbody>
                    </table>
                }

                @if (Resolvable) {
                    <div class="mjo-xi__inflight">
                        <p class="small">
                            <strong>{{ Selected!.DocumentNumber }} was never confirmed.</strong>
                            {{ ProviderName }} may or may not hold this invoice — open it and look. If the invoice is there,
                            record its reference below. If it is not, re-issue: the claim is superseded and a fresh invoice is sent.
                        </p>
                        <div class="row mjo-xi__inflight-row">
                            <input
                                type="text"
                                class="mjo-xi__ref"
                                [value]="AdoptRef"
                                [disabled]="Busy"
                                (input)="AdoptRef = $any($event.target).value"
                                [attr.aria-label]="'The invoice reference in ' + ProviderName"
                                [placeholder]="ProviderName + ' invoice reference'" />
                            <button type="button" mjButton variant="primary" [disabled]="Busy || !AdoptRef.trim()" (click)="Adopt()">
                                <i class="fa-solid fa-link" aria-hidden="true"></i> Record this reference
                            </button>
                            <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Reissue()">
                                <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Nothing there — re-issue
                            </button>
                        </div>
                    </div>
                }

                @if (Sendable && SendBlocked) {
                    <mj-alert Variant="warning" Icon="fa-solid fa-envelope-circle-check" class="mjo-xi__note">
                        <strong>Not ready to send.</strong>
                        {{ SendBlocked }}
                    </mj-alert>
                }

                <div class="row mjo-xi__actions">
                    @if (Cancellable) {
                        <button type="button" mjButton variant="outline" [disabled]="Busy" (click)="Cancel()">
                            <i class="fa-solid fa-ban" aria-hidden="true"></i> Cancel in {{ ProviderName }}
                        </button>
                    }
                    @if (Selected) {
                        <span class="small muted">{{ Selected.DocumentNumber }} · {{ StateLabel(Selected) }}</span>
                    }
                </div>
            </mj-collapsible-panel>
        }
    `,
    styles: [
        `
            .mjo-xi__note { margin-bottom: var(--mj-space-3); display: block; }
            .mjo-xi__empty { color: var(--mj-text-muted); margin: 0 0 var(--mj-space-3); }
            .mjo-xi__table { width: 100%; border-collapse: collapse; margin-bottom: var(--mj-space-3); }
            .mjo-xi__table th { text-align: left; font-weight: 600; font-size: 0.82rem; color: var(--mj-text-muted); padding: var(--mj-space-2); border-bottom: 1px solid var(--mj-border-default); }
            .mjo-xi__table td { padding: var(--mj-space-2); border-bottom: 1px solid var(--mj-border-subtle); cursor: pointer; }
            .mjo-xi__table tr.is-selected td { background: var(--mj-bg-surface-active); }
            .mjo-xi__errrow td { color: var(--mj-status-error); cursor: default; padding-top: 0; }
            .mjo-xi__table .num { text-align: right; font-variant-numeric: tabular-nums; }
            .mjo-xi__actions { align-items: center; gap: var(--mj-space-3); }
            .mjo-xi__inflight { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); padding: var(--mj-space-3); margin-bottom: var(--mj-space-3); }
            .mjo-xi__inflight p { margin: 0 0 var(--mj-space-2); }
            .mjo-xi__inflight-row { align-items: center; gap: var(--mj-space-2); flex-wrap: wrap; }
            .mjo-xi__ref { flex: 1 1 18rem; min-width: 12rem; padding: var(--mj-space-2); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-sm); font-family: var(--mj-font-family-mono); }
        `,
    ],
})
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:OrderHeaders:externalInvoices',
    metadata: {
        entity: 'MJ_BizApps_Orders: Order Headers',
        slot: 'after-related' as const,
        sortKey: 300,
        contributionKey: 'externalInvoices',
        inclusion: 'Primary' as const,
    },
})
export class ExternalInvoicesPanel extends BaseFormPanel<mjBizAppsOrdersOrderHeaderEntity> implements OnInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    public readonly SectionKey = SECTION_KEY;
    public Visible = false;
    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Busy = false;
    public Rows: ExternalInvoiceRow[] = [];
    public Selected: ExternalInvoiceRow | null = null;
    /** What a person typed into the in-flight resolution box. Never sent anywhere but the adopt call. */
    public AdoptRef = '';
    /** Read from the provider row, so a second rail needs no change here. */
    public ProviderName = 'the invoicing rail';
    /** True when the order bills in instalments; the whole-order Send does not apply to it. */
    public BilledOnSchedule = false;
    /**
     * Why Send would be refused before anything reached the rail — today, a bill-to party the rail
     * cannot take as a customer (no billing email). Read from the operation's own preview on load, so
     * the rule lives on the server and the panel only repeats its answer. Null when nothing blocks.
     */
    public SendBlocked: string | null = null;

    private sendRegistered = false;
    private recordEvents: { unsubscribe(): void } | null = null;

    public readonly money = (n: number): string => FormatMoney(n);
    /** `SentAt` is a `datetimeoffset`: shown as the business day it happened on. */
    public readonly date = (iso: string): string => FormatInstantDate(iso, { Short: true });

    public async ngOnInit(): Promise<void> {
        // A save changes what Send is decided from: the status, the bill-to party the preview reads,
        // and, on a new order, whether there is a saved order to look at yet. Reloading here lets a
        // person fix the data, save, and find Send enabled without reopening the form.
        this.recordEvents =
            this.Record?.RegisterEventHandler((event) => {
                if (event.type === 'save') void this.reload();
            }) ?? null;
        await this.reload();
    }

    public ngOnDestroy(): void {
        this.recordEvents?.unsubscribe();
        this.recordEvents = null;
        if (this.sendRegistered) this.UnregisterToolbarItem(SEND_TOOLBAR_KEY);
    }

    /** The toolbar's Refresh, or an operation that changed the order on the server (Confirm order). */
    public override OnRecordRefreshed(): void {
        void this.reload();
    }

    private async reload(): Promise<void> {
        await this.load();
        this.registerSendButton();
        this.cdr.detectChanges();
    }

    /**
     * Send, in the form toolbar. Registered after a load finds a rail, because the label carries the
     * provider's name, which is read from data. Order 5.5 puts it straight after Confirm order (5) and
     * before Void (6): before the order is confirmed both show, Send greyed out beside Confirm, and
     * once it is booked Confirm hides and Send takes its place.
     *
     * Shown in edit mode too, greyed out: the send uses the saved order, and a button that vanishes
     * while editing reads as a step that went away.
     */
    private registerSendButton(): void {
        if (!this.Visible || this.sendRegistered) return;
        this.sendRegistered = true;
        this.RegisterToolbarItem({
            Key: SEND_TOOLBAR_KEY,
            Text: `Send to ${this.ProviderName}`,
            Icon: 'fa-solid fa-paper-plane',
            Variant: 'primary',
            Mode: 'both',
            Order: 5.5,
            Visible: () => this.SendShown,
            Disabled: (_record, editMode) => this.sendDisabledReason(editMode),
            IsLoading: () => this.Busy,
            OnClick: async () => this.Send(),
        });
    }

    /** The Send button's tooltip when greyed out, or `false` when it can be clicked. */
    private sendDisabledReason(editMode = this.EditMode): string | false {
        return SendDisabledReason({
            OrderStatus: this.Record?.Status,
            EditMode: editMode,
            Dirty: !!this.Record?.Dirty,
            Busy: this.Busy,
            Blocked: this.SendBlocked,
        });
    }

    /* ── What a person may do ───────────────────────────────────────────── */

    /**
     * Whether the toolbar shows Send at all; {@link sendDisabledReason} decides whether it is enabled.
     * A voided order is never invoiced, so it gets no button rather than one that waits forever.
     */
    public get SendShown(): boolean {
        return this.Record?.Status !== 'Voided' && SendApplies(this.Rows, this.Visible, this.BilledOnSchedule);
    }

    public get Sendable(): boolean {
        return CanSend(this.Record?.Status, this.Rows, this.Visible, this.BilledOnSchedule);
    }

    /** Only a live invoice can be withdrawn, and only the selected one. */
    public get Cancellable(): boolean {
        return CanCancel(this.Selected, this.Visible);
    }

    /** A send that was never confirmed, which only a person with the rail open can resolve. */
    public get Resolvable(): boolean {
        return CanResolveInFlight(this.Selected, this.Visible);
    }

    /** Selecting a different row drops a half-typed reference: it was meant for the row it was typed against. */
    public Select(row: ExternalInvoiceRow): void {
        if (this.Selected?.ID !== row.ID) this.AdoptRef = '';
        this.Selected = row;
    }

    public StateLabel(row: ExternalInvoiceLike): string {
        return StateLabel(row);
    }

    public ChipClass(row: ExternalInvoiceLike): string {
        return StateChipClass(row);
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public async Send(): Promise<void> {
        if (this.sendDisabledReason()) return;
        // A Failed row the rail never created an invoice for is not "on the rail before": warning about
        // billing twice there sends a person to look for an invoice that does not exist.
        const reissue = SendIsReissue(this.Rows);
        const proceed = await this.confirm.Confirm({
            title: `Send ${this.Record.OrderNumber} to ${this.ProviderName}?`,
            message: `The customer receives an invoice for ${FormatMoney(Number(this.Record.TotalGross ?? 0))}.`,
            detail: reissue
                ? 'This unit has been on the rail before. Check there first: re-issuing when an invoice already exists bills the customer twice.'
                : 'The scheduled send would do this within the half hour anyway; this sends it now.',
            type: 'warning',
            confirmText: 'Send it',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersIssueExternalInvoiceOperation().Execute({
                OrderHeaderID: this.Record.ID,
                // Only a unit the rail has held an invoice for is re-sent deliberately.
                AllowReissue: reissue,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = { Tone: 'error', Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be sent.' };
                // The failed attempt is a new row; show it, with the rail's error under it.
                await this.load();
                return;
            }
            this.Notice = { Tone: 'success', Text: out.Message ?? `Sent as ${out.ExternalInvoiceRef}.` };
            await this.load();
        } finally {
            this.Busy = false;
            // Send is clicked from the toolbar, so the outcome would otherwise land in a collapsed panel.
            this.FormComponent?.SetSectionExpanded(SECTION_KEY, true);
            this.cdr.detectChanges();
        }
    }

    /**
     * The rail HAS the invoice: record its reference against the claimed row.
     *
     * No confirmation dialog, because this is the conservative answer — it posts nothing and sends
     * nothing. The operation reads the invoice back and refuses a total that does not tie, which is
     * the check that matters and is not one a dialog could make.
     */
    public async Adopt(): Promise<void> {
        const row = this.Selected;
        const ref = this.AdoptRef.trim();
        if (!row || !ref || this.Busy) return;

        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersAdoptExternalInvoiceOperation().Execute({ ExternalInvoiceID: row.ID, ExternalInvoiceRef: ref });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = { Tone: 'error', Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The reference could not be recorded.' };
                return;
            }
            this.Notice = { Tone: 'success', Text: out.Message ?? `${row.DocumentNumber} now carries ${ref}.` };
            this.AdoptRef = '';
            await this.load();
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * The rail has NOTHING: supersede the claim and send again.
     *
     * This is the expensive answer if the person is wrong — it is what puts a second invoice in a
     * customer's inbox — so it asks, and says plainly what it is relying on.
     */
    public async Reissue(): Promise<void> {
        const row = this.Selected;
        if (!row || this.Busy) return;
        const proceed = await this.confirm.Confirm({
            title: `Re-issue ${row.DocumentNumber}?`,
            message: `This relies on ${this.ProviderName} holding no invoice for this unit.`,
            detail: 'The unconfirmed send is marked Failed and a fresh invoice is created. If the rail does hold one, the customer receives a second invoice — record its reference instead.',
            type: 'warning',
            confirmText: 'Nothing is there — re-issue',
            cancelText: 'Let me check again',
        });
        if (!proceed) return;

        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            // THE SELECTED ROW'S UNIT, NOT THE ORDER'S. A re-issue that names only the order resolves to
            // the whole-order unit, which is a different billing unit from the one whose claim is stuck:
            // on a scheduled order it is refused with "name the instalment", and the stuck row is never
            // superseded. The copy above names this document, so the call has to mean it.
            const result = await new OrdersIssueExternalInvoiceOperation().Execute({
                OrderHeaderID: this.Record.ID,
                CompanyID: row.CompanyID,
                OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID,
                AllowReissue: true,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = { Tone: 'error', Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be re-issued.' };
                return;
            }
            this.Notice = { Tone: 'success', Text: out.Message ?? `Sent as ${out.ExternalInvoiceRef}.` };
            this.Selected = null;
            await this.load();
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    public async Cancel(): Promise<void> {
        const row = this.Selected;
        if (!row || this.Busy) return;
        // `MJConfirmService` asks yes/no; it has no free-text prompt, and `window.prompt` is banned
        // here for the same reason `window.confirm` is. The reason recorded therefore says where the
        // cancel came from — a person wanting to say more edits the row, which is the honest split.
        const proceed = await this.confirm.Confirm({
            title: `Cancel ${row.DocumentNumber} in ${this.ProviderName}?`,
            message: `The invoice for ${FormatMoney(row.Amount)} is withdrawn there, and the unit can be invoiced again.`,
            detail: 'Nothing is posted to the ledger by a cancellation. An invoice with money against it cannot be cancelled — that is a refund.',
            type: 'warning',
            confirmText: 'Cancel the invoice',
            cancelText: 'Leave it',
        });
        if (!proceed) return;

        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersCancelExternalInvoiceOperation().Execute({
                ExternalInvoiceID: row.ID,
                Reason: `Cancelled from the order form for ${this.Record.OrderNumber}.`,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = { Tone: 'error', Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be cancelled.' };
                return;
            }
            this.Notice = { Tone: 'success', Text: out.Message ?? 'The invoice was cancelled.' };
            this.Selected = null;
            await this.load();
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        if (!this.Record?.IsSaved) return;
        const rv = new RunView();
        try {
            const rail = await this.loadRail();
            this.Visible = rail.Present;
            if (rail.Name) this.ProviderName = rail.Name;
            if (!this.Visible) return;

            const result = await rv.RunView<ExternalInvoiceRow>({
                EntityName: EXTERNAL_INVOICE_ENTITY,
                ExtraFilter: `OrderHeaderID = '${this.Record.ID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
            });
            if (!result.Success) {
                this.LoadError = result.ErrorMessage ?? 'The external invoices could not be read.';
                return;
            }
            this.LoadError = null;
            this.Rows = result.Results ?? [];
            if (this.Selected) this.Selected = this.Rows.find((r) => r.ID === this.Selected!.ID) ?? null;
            this.BilledOnSchedule = BilledOnScheduleFromRows(this.Rows) || (await this.hasPaymentSchedule());
            this.SendBlocked = this.Sendable ? await this.previewBlock() : null;
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        }
        // Write the DOM where the assignment happens. The shell creates forms imperatively and the
        // app is zoneless, so an assignment across a check boundary aborts the update and freezes the
        // panel — showing an empty list, which reads as "nothing was sent" rather than as a fault.
        this.cdr.detectChanges();
    }

    /**
     * What the operation's preview says would stop a send before the rail is called.
     *
     * Only the refusals a person fixes on the bill-to party are surfaced: those are the ones the rail
     * would otherwise reject after the click, leaving a Failed row behind. Anything else the preview
     * reports (or a preview that cannot run) leaves Send enabled, and the send itself says why.
     */
    private async previewBlock(): Promise<string | null> {
        try {
            const result = await new OrdersIssueExternalInvoiceOperation().Execute({
                OrderHeaderID: this.Record.ID,
                Preview: true,
                AllowReissue: SendIsReissue(this.Rows),
            });
            const out = result.Output;
            return result.Success && out?.ResultCode === 'NO_CUSTOMER_EMAIL' ? (out.Message ?? 'The bill-to party has no billing email.') : null;
        } catch {
            return null;
        }
    }

    /**
     * Whether this order bills in instalments.
     *
     * Wrapped because the schedule table arrived in PR #220 and a host that has not taken it yet would
     * answer with an error rather than a row; not knowing is the same as "not scheduled" here, and the
     * server refuses a whole-order send on a scheduled order anyway.
     */
    private async hasPaymentSchedule(): Promise<boolean> {
        try {
            const rv = new RunView();
            const r = await rv.RunView<{ ID: string }>({
                EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
                ExtraFilter: `OrderHeaderID = '${this.Record.ID}' AND Status <> 'Canceled'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            });
            return !!r.Success && !!r.Results?.length;
        } catch {
            return false;
        }
    }

    /**
     * Whether any company on this order invoices through a rail, and what that provider is called.
     *
     * Deliberately cheap: two small reads of seeded metadata rather than the worklist operation,
     * because this runs on every order form including the great majority with no rail at all.
     */
    private async loadRail(): Promise<{ Present: boolean; Name: string | null }> {
        const rv = new RunView();
        const codes = RAIL_TYPE_CODES.map((c) => `'${c}'`).join(',');
        const types = await rv.RunView<{ ID: string }>({
            EntityName: PAYMENT_PROVIDER_TYPE_ENTITY,
            ExtraFilter: `Code IN (${codes})`,
            Fields: ['ID'],
            ResultType: 'simple',
        });
        const typeIDs = (types.Results ?? []).map((t) => `'${t.ID}'`);
        if (!typeIDs.length) return { Present: false, Name: null };

        const providers = await rv.RunView<{ Name: string }>({
            EntityName: PAYMENT_PROVIDER_ENTITY,
            ExtraFilter: `CompanyID = '${this.Record.CompanyID}' AND IsActive = 1 AND PaymentProviderTypeID IN (${typeIDs.join(',')})`,
            Fields: ['Name'],
            ResultType: 'simple',
        });
        const first = providers.Results?.[0];
        return { Present: !!first, Name: first?.Name ?? null };
    }
}

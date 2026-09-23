import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import {
    OrdersCancelExternalInvoiceOperation,
    OrdersIssueExternalInvoiceOperation,
    type mjBizAppsOrdersOrderHeaderEntity,
} from '@mj-biz-apps/orders-entities';
import { FormatDate, FormatMoney } from '../panels/money-format';
import { CanCancel, CanSend, StateChipClass, StateLabel, type ExternalInvoiceLike } from '../panels/external-invoice-view';

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

/** Provider type codes that invoice through an external rail. Mirrors `INVOICE_RAIL_TYPE_CODES`. */
const RAIL_TYPE_CODES = ['BillCom'];

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
                SectionKey="externalInvoices"
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
                                <tr [class.is-selected]="Selected?.ID === row.ID" (click)="Selected = row">
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

                <div class="row mjo-xi__actions">
                    @if (Sendable) {
                        <button type="button" mjButton variant="primary" [disabled]="Busy" (click)="Send()">
                            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                            {{ Busy ? 'Working…' : 'Send to ' + ProviderName }}
                        </button>
                    }
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
            .mjo-xi__empty { color: var(--mj-color-text-muted); margin: 0 0 var(--mj-space-3); }
            .mjo-xi__table { width: 100%; border-collapse: collapse; margin-bottom: var(--mj-space-3); }
            .mjo-xi__table th { text-align: left; font-weight: 600; font-size: 0.82rem; color: var(--mj-color-text-muted); padding: var(--mj-space-2); border-bottom: 1px solid var(--mj-color-border); }
            .mjo-xi__table td { padding: var(--mj-space-2); border-bottom: 1px solid var(--mj-color-border-subtle, var(--mj-color-border)); cursor: pointer; }
            .mjo-xi__table tr.is-selected td { background: var(--mj-color-surface-selected, rgba(0, 0, 0, 0.04)); }
            .mjo-xi__errrow td { color: var(--mj-color-danger, #b42318); cursor: default; padding-top: 0; }
            .mjo-xi__table .num { text-align: right; font-variant-numeric: tabular-nums; }
            .mjo-xi__actions { align-items: center; gap: var(--mj-space-3); }
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
export class ExternalInvoicesPanel extends BaseFormPanel<mjBizAppsOrdersOrderHeaderEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    public Visible = false;
    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Busy = false;
    public Rows: ExternalInvoiceRow[] = [];
    public Selected: ExternalInvoiceRow | null = null;
    /** Read from the provider row, so a second rail needs no change here. */
    public ProviderName = 'the invoicing rail';

    public readonly money = (n: number): string => FormatMoney(n);
    public readonly date = (iso: string): string => FormatDate(iso, { Short: true });

    public async ngOnInit(): Promise<void> {
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── What a person may do ───────────────────────────────────────────── */

    public get Sendable(): boolean {
        return CanSend(this.Record?.Status, this.Rows, this.Visible);
    }

    /** Only a live invoice can be withdrawn, and only the selected one. */
    public get Cancellable(): boolean {
        return CanCancel(this.Selected, this.Visible);
    }

    public StateLabel(row: ExternalInvoiceLike): string {
        return StateLabel(row);
    }

    public ChipClass(row: ExternalInvoiceLike): string {
        return StateChipClass(row);
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public async Send(): Promise<void> {
        if (this.Busy) return;
        const failed = this.Rows.find((r) => r.Status === 'Failed' || r.Status === 'Canceled');
        const proceed = await this.confirm.Confirm({
            title: `Send ${this.Record.OrderNumber} to ${this.ProviderName}?`,
            message: `The customer receives an invoice for ${FormatMoney(Number(this.Record.TotalGross ?? 0))}.`,
            detail: failed
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
                // A previously failed or cancelled unit is only re-sent deliberately.
                AllowReissue: !!failed,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                this.Notice = { Tone: 'error', Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be sent.' };
                return;
            }
            this.Notice = { Tone: 'success', Text: out.Message ?? `Sent as ${out.ExternalInvoiceRef}.` };
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
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        }
        // Write the DOM where the assignment happens. The shell creates forms imperatively and the
        // app is zoneless, so an assignment across a check boundary aborts the update and freezes the
        // panel — showing an empty list, which reads as "nothing was sent" rather than as a fault.
        this.cdr.detectChanges();
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

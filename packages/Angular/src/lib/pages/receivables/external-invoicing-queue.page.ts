import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Metadata, RunView } from '@memberjunction/core';
import { MJAlertComponent, MJButtonDirective, MJConfirmService, MJDialogActionsComponent, MJDialogComponent } from '@memberjunction/ng-ui-components';
import {
    LoadOrdersEngine,
    OrdersEngine,
    OrdersGetExternalInvoicingWorklistOperation,
    OrdersIssueExternalInvoiceOperation,
    OrdersPollExternalPaymentsOperation,
    OrdersSendExternalInvoicesOperation,
    ClassifyPollJobGroups,
    LoadPollJobs,
    PlanSetAside,
    RequireUUID,
    SetAsideExternalPayments,
    Today,
    ToISODate,
    type ExternalInvoicingWorklistRow,
    type PollJobState,
    type SetAsidePlan,
} from '@mj-biz-apps/orders-entities';
import { MJOSidePanelComponent } from '../../panels/side-panel.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOWorklistTableComponent, type MJOColumn } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import { DispositionChipClass, DispositionLabel } from '../../panels/external-invoice-view';
import { MJOWorklistBarComponent, type MJOWorklistExport } from '../../panels/worklist-bar.component';
import { InvoicedDay } from './customer-ar-page.model';
import {
    BuildWorklistExport,
    AddressKey,
    AdoptCompanyChoice,
    AdoptWindow,
    COMPANY_ADDRESS_KEY,
    CUSTOM_WINDOW,
    CompaniesToAddress,
    ExportFileName,
    FilterByCompanies,
    InDayRange,
    IsOpenRange,
    MatchesText,
    NextSort,
    ReadWorklistState,
    ReconcileCompanies,
    ResolveWindow,
    RestoreSort,
    RestoreWindow,
    SameChoice,
    SameWindow,
    ShownSummary,
    SortRows,
    WindowToAddress,
    WriteSharedCompanies,
    WriteWorklistState,
    type DayWindow,
    type DayWindowOption,
    type WorklistCompanyOption,
    type WorklistExportField,
    type WorklistSort,
} from './worklist-view.model';

/** Which due dates the Invoices to send tab lists. An invoice with no due date only shows under "Any due date". */
export const QUEUE_WINDOWS: ReadonlyArray<DayWindowOption> = [
    { Key: 'all', Label: 'Any due date', FromOffset: null, ToOffset: null },
    { Key: 'pastdue', Label: 'Past due', FromOffset: null, ToOffset: -1 },
    { Key: '30', Label: 'Next 30 days', FromOffset: 0, ToOffset: 30 },
    { Key: CUSTOM_WINDOW, Label: 'Custom dates…', FromOffset: null, ToOffset: null },
];

const DEFAULT_WINDOW: DayWindow = { Key: 'all', From: null, To: null };
const QUEUE_STATE_KEY = 'mjOrders.invoicingQueue.view';
/** The tab-address keys for this page's due-date filter and its open tab. */
const DUE_ADDRESS_KEY = 'queueDue';
const TAB_ADDRESS_KEY = 'queueTab';

type QueueTab = 'invoices' | 'payments';
type QueuePreset = 'all' | 'unsent' | 'failed';
const PRESET_LABELS: Record<QueuePreset, string> = { all: 'All', unsent: 'Not yet sent', failed: 'Failed' };

/** An `ExternalPayment` row that needs a person, as this page reads it. */
interface PaymentExceptionRow {
    ID: string;
    ExternalPaymentRef: string;
    /** The customer as the payment provider names them. Our customer is found from it through `ExternalCustomer`. */
    ExternalCustomerRef?: string | null;
    PaymentProviderID?: string | null;
    /** The provider's name, from the view. */
    PaymentProvider?: string | null;
    Amount: number;
    PaymentDate: string | null;
    ExternalStatus: string | null;
    Disposition: 'Held' | 'Unmatched' | 'Refused' | 'Reapplied' | 'ReversalNeeded';
    DispositionReason: string | null;
    PaymentHeaderID: string | null;
    FirstSeenAt?: string | null;
    LastSeenAt: string | null;
}

const EXTERNAL_PAYMENT_ENTITY = 'MJ_BizApps_Orders: External Payments';
const EXTERNAL_CUSTOMER_ENTITY = 'MJ_BizApps_Orders: External Customers';

/**
 * How many invoices one "Send all waiting" sends. The operation's own default, passed explicitly so
 * the number the dialog states is the number the run is held to.
 */
const SWEEP_MAX = 25;
/** How many payments the set-aside dialog names before it says "and N more". */
const SET_ASIDE_LISTED = 12;

/** Dispositions that mean money is waiting on a person. `Captured` and `Ignored` are finished. */
const EXCEPTION_DISPOSITIONS = ['Held', 'Unmatched', 'Refused', 'Reapplied', 'ReversalNeeded'];

/** How an invoice's send state reads on screen. */
function stateLabel(state: ExternalInvoicingWorklistRow['State']): string {
    return state === 'InFlight' ? 'Sending' : state === 'Unsent' ? 'Not sent' : state;
}

/**
 * `mjo-external-invoicing-queue-page` — the two queues the scheduled jobs leave behind.
 *
 * WHAT THIS SCREEN IS FOR. Both halves of the rail run unattended: one job sends invoices, another
 * records payments. When they succeed nobody needs to know. When they cannot, the work stops somewhere
 * a log file would be the only witness — an order whose send was refused, a payment against an invoice
 * we never issued. This is where that lands, and it is also the only way to run either job by hand,
 * which matters because both ship switched off and somebody has to prove them first.
 *
 * TWO TABS, BECAUSE THEY ARE TWO JOBS. Invoices out and payments in fail for unrelated reasons and are
 * fixed by different people. Merging them into one list would bury both.
 *
 * A ROW OPENS BESIDE ITS LIST, with the whole of what the columns cut short (a failed send's error,
 * what happened to a payment) and the act on that one row. The tiles are the quick filters.
 *
 * SETTING PAYMENTS ASIDE ASKS IN A DIALOG. Its reason and its "dated before" guard belong to that act,
 * so they are asked for when it is taken, with the plan (what will be set aside, what is left out and
 * why) shown before anything is written.
 *
 * NAMED FROM DATA. Nothing here says Bill.com: the rail is a seam, and a company on a different
 * provider must read correctly on the same screen.
 *
 * ## Example
 *
 * ```html
 * <mjo-external-invoicing-queue-page (OrderOpened)="open($event)" (AddressChanged)="write($event)" />
 * ```
 *
 * @module @mj-biz-apps/orders-ng
 */
@Component({
    selector: 'mjo-external-invoicing-queue-page',
    standalone: true,
    imports: [
        CommonModule,
        MJButtonDirective,
        MJAlertComponent,
        MJDialogComponent,
        MJDialogActionsComponent,
        MJOSidePanelComponent,
        MJOStatTileComponent,
        MJOWorklistBarComponent,
        MJOWorklistTableComponent,
    ],
    template: `
        <!-- The filter row sits at the top, as on every Receivables page. It belongs to the open tab: each tab has its own search and export. -->
        @if (Tab === 'invoices') {
            <mjo-worklist-bar
                [Companies]="Companies"
                [CompanyPicks]="CompanyPicks"
                [Search]="Search"
                SearchPlaceholder="Search customer, document or order number"
                [ActiveFilter]="Preset === 'all' ? null : PresetLabel"
                [Summary]="InvoiceSummary"
                [Loading]="Loading"
                [BuildExport]="BuildInvoiceExport"
                [CanExport]="Rows.length > 0"
                (CompanyPicksChange)="OnCompanies($event)"
                (SearchChange)="OnSearch($event)"
                (ActiveFilterCleared)="OnPreset('all')"
                (RefreshRequested)="Refresh()">
                <label class="mjo-xq__window">
                    <span class="small muted">Due</span>
                    <select class="mjo-xq__select" [value]="Window.Key" (change)="OnWindow($any($event.target).value)" aria-label="Which due dates to list">
                        @for (option of Windows; track option.Key) {
                            <option [value]="option.Key" [selected]="option.Key === Window.Key">{{ option.Label }}</option>
                        }
                    </select>
                </label>
                @if (IsCustomWindow) {
                    <label class="mjo-xq__window">
                        <span class="small muted">From</span>
                        <input class="mjo-xq__select" type="date" [value]="Window.From ?? ''" (change)="OnCustomDay('From', $any($event.target).value)" aria-label="Earliest due date">
                    </label>
                    <label class="mjo-xq__window">
                        <span class="small muted">To</span>
                        <input class="mjo-xq__select" type="date" [value]="Window.To ?? ''" (change)="OnCustomDay('To', $any($event.target).value)" aria-label="Latest due date">
                    </label>
                }
            </mjo-worklist-bar>
        } @else {
            <mjo-worklist-bar
                [Companies]="PaymentCompanies"
                [CompanyPicks]="PaymentCompanyPicks"
                (CompanyPicksChange)="OnCompanies($event)"
                [Search]="PaymentSearch"
                SearchPlaceholder="Search payment reference, customer or what happened"
                [Summary]="PaymentSummary"
                [Loading]="Loading"
                [BuildExport]="BuildPaymentExport"
                [CanExport]="ShownExceptions.length > 0"
                (SearchChange)="OnPaymentSearch($event)"
                (RefreshRequested)="Refresh()" />
        }

        <!-- The tiles count the chosen companies' invoices, and every payment exception. Each is also a way in: the first two filter Invoices to send, the third opens Payment exceptions. -->
        <div class="mj-stat-grid mjo-xq__tiles">
            <mjo-stat-tile
                class="mjo-xq__tile"
                [class.is-on]="Tab === 'invoices' && Preset === 'unsent'"
                [Pressed]="Tab === 'invoices' && Preset === 'unsent'"
                Hint="Show invoices not yet sent"
                Label="Waiting to send"
                Icon="fa-solid fa-paper-plane"
                [Tone]="UnsentCount ? 'alert' : 'default'"
                [Value]="String(UnsentCount)"
                [Detail]="UnsentDetail"
                (Clicked)="OnTile('unsent')" />

            <mjo-stat-tile
                class="mjo-xq__tile"
                [class.is-on]="Tab === 'invoices' && Preset === 'failed'"
                [Pressed]="Tab === 'invoices' && Preset === 'failed'"
                Hint="Show invoices whose send failed"
                Label="Sends that failed"
                Icon="fa-solid fa-triangle-exclamation"
                [Tone]="FailedCount ? 'alert' : 'default'"
                [Value]="String(FailedCount)"
                [Detail]="FailedCount ? 'Review each before resending' : 'No failed sends'"
                (Clicked)="OnTile('failed')" />

            <mjo-stat-tile
                class="mjo-xq__tile"
                [class.is-on]="Tab === 'payments'"
                [Pressed]="Tab === 'payments'"
                Hint="Open Payment exceptions"
                Label="Payments needing attention"
                Icon="fa-solid fa-hand-holding-dollar"
                [Tone]="Exceptions.length ? 'alert' : 'default'"
                [Value]="String(Exceptions.length)"
                [Detail]="ExceptionDetail"
                (Clicked)="OnTab('payments')" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-xq__note">
                <strong>The queue did not load.</strong>
                {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-xq__note">{{ Notice.Text }}</mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-xq__note">
                <strong>List truncated.</strong>
                Not every waiting invoice is shown.
            </mj-alert>
        }

        <div class="mjo-xq__tabs" role="tablist">
            <button type="button" role="tab" [attr.aria-selected]="Tab === 'invoices'" [class.is-active]="Tab === 'invoices'" (click)="OnTab('invoices')">
                Invoices to send
                <span class="mjo-xq__count">{{ InScope.length }}</span>
            </button>
            <button type="button" role="tab" [attr.aria-selected]="Tab === 'payments'" [class.is-active]="Tab === 'payments'" (click)="OnTab('payments')">
                Payment exceptions
                <span class="mjo-xq__count">{{ Exceptions.length }}</span>
            </button>
        </div>

        @if (Tab === 'invoices') {
            <div class="mjo-split">
                <div class="mjo-split__main">
                    <div class="row mjo-xq__actions">
                        <button type="button" mjButton variant="primary" [disabled]="Busy || !InScope.length" (click)="RunSweep()" title="Send the invoices that are waiting, for the companies chosen">
                            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> {{ Busy ? 'Working…' : 'Send all waiting' }}
                        </button>
                        <span class="small muted">Select an invoice to see its detail or send it on its own.</span>
                    </div>

                    <mjo-worklist-table
                        [Columns]="InvoiceColumns"
                        [Rows]="Rows"
                        [Searchable]="false"
                        [Loading]="Loading"
                        [Totals]="InvoiceTotals"
                        MaxHeight="calc(100vh - 380px)"
                        [SortKey]="InvoiceSort.Key"
                        [SortDescending]="InvoiceSort.Descending"
                        RowKey="DocumentNumber"
                        [SelectedKey]="SelectedInvoice?.DocumentNumber ?? null"
                        [EmptyTitle]="AllRows.length ? 'Nothing matches' : 'Nothing waiting'"
                        [EmptyHint]="AllRows.length ? 'No waiting invoice matches these filters. Clear one to see more.' : 'Every invoice has been sent.'"
                        EmptyIcon="fa-solid fa-paper-plane"
                        (SortChanged)="OnInvoiceSort($event)"
                        (LinkClicked)="OpenOrder($event.Row)"
                        (RowClicked)="OnInvoiceRow($event)" />
                </div>

                @if (SelectedInvoice; as row) {
                    <div class="mjo-split__side">
                        <mjo-side-panel
                            Icon="fa-solid fa-paper-plane"
                            [Title]="row.DocumentNumber"
                            [Chip]="stateLabel(row.State)"
                            [ChipClass]="stateChip(row)"
                            (Closed)="SelectedInvoice = null">
                            <div class="mjo-side-panel__amount">{{ money(row.Amount) }}</div>
                            <dl class="mjo-side-panel__facts">
                                <dt>Customer</dt>
                                <dd>{{ row.CustomerName }}</dd>
                                <dt>Order</dt>
                                <dd>
                                    <button type="button" class="mjo-side-panel__link" (click)="OpenOrder(row)" title="Open the order">{{ row.OrderNumber }}</button>
                                    · {{ row.InstallmentNumber ? 'installment ' + row.InstallmentNumber : 'whole order' }}
                                </dd>
                                <dt>Billed by</dt>
                                <dd>{{ row.CompanyName || '—' }}</dd>
                                <dt>Due</dt>
                                <dd>{{ date(row.DueDate) }}</dd>
                                @if (row.SinceAt) {
                                    <dt>{{ row.State === 'Unsent' ? 'Waiting since' : 'Last attempt' }}</dt>
                                    <dd>{{ instant(row.SinceAt) }}</dd>
                                }
                                @if (row.LastError) {
                                    <dt>Last error</dt>
                                    <dd>{{ row.LastError }}</dd>
                                }
                            </dl>
                            <div class="mjo-side-panel__actions">
                                <button type="button" mjButton variant="primary" [disabled]="Busy" (click)="SendSelected()">
                                    <i class="fa-solid fa-paper-plane" aria-hidden="true"></i> {{ row.State === 'Unsent' ? 'Send this invoice' : 'Send again' }}
                                </button>
                                <button type="button" mjButton variant="outline" (click)="OpenOrder(row)">
                                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open order
                                </button>
                            </div>
                        </mjo-side-panel>
                    </div>
                }
            </div>
        } @else {
            <div class="mjo-split">
                <div class="mjo-split__main">
                    <div class="row wrap mjo-xq__actions" data-testid="poll-payments-bar">
                        <button type="button" mjButton variant="primary" [disabled]="Busy || !CheckedIDs.length" (click)="OpenSetAside(CheckedIDs)" title="Set the ticked payments aside">
                            <i class="fa-solid fa-box-archive" aria-hidden="true"></i> Set aside{{ CheckedIDs.length ? ' (' + CheckedIDs.length + ')' : '' }}
                        </button>
                        <button type="button" mjButton variant="outline" [disabled]="Busy || PollBlocked" (click)="RunPoll()">
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i> {{ Busy ? 'Working…' : PollJob?.State === 'Preview' ? 'Preview payment check' : 'Check for payments now' }}
                        </button>
                        <span class="small muted">{{ PollHint }}</span>
                    </div>

                    <mjo-worklist-table
                        [Columns]="PaymentColumns"
                        [Rows]="ShownExceptions"
                        [Searchable]="false"
                        [Loading]="Loading"
                        [Totals]="PaymentTotals"
                        MaxHeight="calc(100vh - 380px)"
                        [SortKey]="PaymentSort.Key"
                        [SortDescending]="PaymentSort.Descending"
                        RowKey="ID"
                        [SelectedKey]="SelectedPayment?.ID ?? null"
                        [Selectable]="true"
                        [SelectedKeys]="CheckedIDs"
                        [RowLabel]="PaymentTickLabel"
                        [EmptyTitle]="Exceptions.length ? 'Nothing matches' : 'Nothing needs attention'"
                        [EmptyHint]="Exceptions.length ? 'No payment matches these filters. Clear one to see more.' : 'Every payment reported has been recorded or set aside.'"
                        EmptyIcon="fa-solid fa-hand-holding-dollar"
                        (SelectionChanged)="CheckedIDs = $event"
                        (SortChanged)="OnPaymentSort($event)"
                        (RowClicked)="OnPaymentRow($event)" />
                </div>

                @if (SelectedPayment; as row) {
                    <div class="mjo-split__side">
                        <mjo-side-panel
                            Icon="fa-solid fa-hand-holding-dollar"
                            [Title]="row.ExternalPaymentRef"
                            [Chip]="dispositionLabel(row)"
                            [ChipClass]="dispositionChip(row)"
                            (Closed)="SelectedPayment = null">
                            <div class="mjo-side-panel__amount">{{ money(row.Amount) }}</div>
                            <dl class="mjo-side-panel__facts">
                                <dt>Dated</dt>
                                <dd>{{ date(row.PaymentDate) }}</dd>
                                <dt>Received through</dt>
                                <dd>{{ providerText(row) }}</dd>
                                <dt>Customer</dt>
                                <dd>{{ customerOf(row) || 'Not matched to a customer' }}</dd>
                                <dt>Customer reference</dt>
                                <dd>{{ row.ExternalCustomerRef || '—' }}</dd>
                                <dt>Provider status</dt>
                                <dd>{{ row.ExternalStatus || '—' }}</dd>
                                <dt>What happened</dt>
                                <dd>{{ row.DispositionReason || '—' }}</dd>
                                <dt>First seen</dt>
                                <dd>{{ instant(row.FirstSeenAt) }}</dd>
                                <dt>Last seen</dt>
                                <dd>{{ instant(row.LastSeenAt) }}</dd>
                            </dl>
                            <div class="mjo-side-panel__actions">
                                <button type="button" mjButton variant="primary" [disabled]="Busy" (click)="OpenSetAside([row.ID])">
                                    <i class="fa-solid fa-box-archive" aria-hidden="true"></i> Set aside
                                </button>
                            </div>
                        </mjo-side-panel>
                    </div>
                }
            </div>
        }

        <mj-dialog [Visible]="SetAsideOpen" [Title]="SetAsideTargets.length === 1 ? 'Set aside this payment' : 'Set aside ' + SetAsideTargets.length + ' payments'" Size="md" (Close)="CloseSetAside()">
            <p class="mjo-xq__dialog-lede">
                A payment set aside leaves this list and is never recorded as cash, even if its invoice is loaded later. This cannot be undone here.
            </p>
            <label class="mjo-xq__field">
                <span class="small muted">Reason</span>
                <input
                    type="text"
                    class="mjo-xq__select"
                    maxlength="400"
                    [value]="SetAsideReason"
                    (input)="SetAsideReason = $any($event.target).value"
                    placeholder="For example: paid before go-live, invoice not converted"
                    aria-label="Reason for setting aside">
            </label>
            @if (SetAsideTargets.length > 1) {
                <label class="mjo-xq__field">
                    <span class="small muted">Include unmatched payments dated before</span>
                    <input type="date" class="mjo-xq__select mjo-xq__day" [value]="SetAsideBefore ?? ''" (change)="OnSetAsideBefore($any($event.target).value)" aria-label="Include unmatched payments dated before this day">
                    <span class="small muted">An unmatched payment may be waiting for an invoice still to be loaded, so in a batch only those dated before this day are set aside. Held and refused payments are set aside whatever their date.</span>
                </label>
            }
            @if (SetAsidePlan; as plan) {
                <div class="mjo-xq__plan" role="status">
                    <strong>{{ plan.Eligible.length }} of {{ SetAsideTargets.length }} will be set aside · {{ money(setAsideTotal) }}</strong>
                    @if (plan.Eligible.length) {
                        <!-- Named, not only counted: this cannot be undone, so what is about to be written is read first. -->
                        <table class="mjo-xq__plan-rows small">
                            <tbody>
                                @for (row of setAsideListed; track row.ID) {
                                    <tr>
                                        <td class="mono">{{ row.ExternalPaymentRef }}</td>
                                        <td>{{ date(row.PaymentDate) }}</td>
                                        <td>{{ dispositionLabel(row) }}</td>
                                        <td class="mjo-xq__plan-amount">{{ money(row.Amount) }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                        @if (plan.Eligible.length > setAsideListed.length) {
                            <div class="small muted">and {{ plan.Eligible.length - setAsideListed.length }} more</div>
                        }
                    }
                    @if (plan.Excluded.length) {
                        <ul class="mjo-xq__left-out small">
                            @for (item of plan.Excluded; track item.Row.ID) {
                                <li><span class="mono">{{ item.Row.ExternalPaymentRef }}</span> is left out. {{ item.Why }}</li>
                            }
                        </ul>
                    }
                </div>
            }
            <mj-dialog-actions>
                <button type="button" mjButton variant="outline" (click)="CloseSetAside()">Cancel</button>
                <button type="button" mjButton variant="primary" [disabled]="Busy || !SetAsideReason.trim() || !SetAsidePlan?.Eligible?.length" (click)="ApplySetAside()">
                    {{ Busy ? 'Working…' : 'Set aside' + (SetAsidePlan?.Eligible?.length ? ' ' + SetAsidePlan!.Eligible.length : '') }}
                </button>
            </mj-dialog-actions>
        </mj-dialog>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
            }
            .mjo-xq__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-xq__tile { display: block; border-radius: var(--mj-radius-md); transition: box-shadow 140ms ease; }
            .mjo-xq__tile.is-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 55%, transparent); }
            .mjo-xq__note { display: block; margin-bottom: var(--mj-space-4); }
            .mjo-xq__actions {
                align-items: center;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-3);
            }
            .mjo-xq__field {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-1);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-xq__day { width: 180px; }
            .mjo-xq__dialog-lede { margin: 0 0 var(--mj-space-4); }
            .mjo-xq__plan {
                padding: var(--mj-space-3);
                background: var(--mj-bg-surface-sunken);
                border-radius: var(--mj-radius-md);
            }
            .mjo-xq__plan-rows { width: 100%; margin-top: var(--mj-space-2); border-collapse: collapse; }
            .mjo-xq__plan-rows td { padding: 2px var(--mj-space-3) 2px 0; }
            .mjo-xq__plan-amount { text-align: right; font-variant-numeric: tabular-nums; }
            .mjo-xq__left-out { margin: var(--mj-space-2) 0 0; padding-left: var(--mj-space-5); }
            .mjo-xq__left-out li { margin-bottom: 4px; }
            .mjo-xq__window {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2);
            }
            .mjo-xq__select {
                font: inherit;
                font-size: 13px;
                padding: 4px 8px;
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface);
                color: inherit;
            }
            .mjo-xq__tabs {
                display: flex;
                gap: var(--mj-space-2);
                border-bottom: 1px solid var(--mj-border-default);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-xq__tabs button {
                appearance: none;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                padding: var(--mj-space-3) var(--mj-space-4);
                cursor: pointer;
                font: inherit;
                color: var(--mj-text-muted);
            }
            .mjo-xq__tabs button.is-active {
                color: var(--mj-text-primary);
                border-bottom-color: var(--mj-brand-primary);
                font-weight: 600;
            }
            .mjo-xq__count {
                display: inline-block;
                margin-left: var(--mj-space-2);
                padding: 0 var(--mj-space-2);
                border-radius: 999px;
                background: var(--mj-bg-surface-card);
                font-size: 0.8em;
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
            @media (prefers-reduced-motion: reduce) {
                .mjo-xq__tile { transition: none; }
            }
        `,
    ],
})
export class MJOExternalInvoicingQueuePageComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly confirm = inject(MJConfirmService);

    @Output() OrderOpened = new EventEmitter<{ ID: string }>();
    /** The company choice, the due-date filter or the open tab changed: the section writes it to the tab's address. A null value removes the key. */
    @Output() AddressChanged = new EventEmitter<Record<string, string | null>>();

    public readonly String = String;
    public readonly money = (n: number): string => FormatMoney(n);
    public readonly stateLabel = stateLabel;

    public Tab: QueueTab = 'invoices';
    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Busy = false;

    public Loading = false;
    /** Every waiting invoice the operation returned. */
    public AllRows: ExternalInvoicingWorklistRow[] = [];
    /** `AllRows` for the chosen companies. The tiles count these, and "Send all waiting" sends these. */
    public InScope: ExternalInvoicingWorklistRow[] = [];
    /** `InScope` under the due dates, the search and the quick filter, in the sorted order. */
    public Rows: ExternalInvoicingWorklistRow[] = [];
    /** The invoice open in the side panel. */
    public SelectedInvoice: ExternalInvoicingWorklistRow | null = null;
    public Preset: QueuePreset = 'all';
    public readonly Windows = QUEUE_WINDOWS;
    public Companies: WorklistCompanyOption[] = [];
    /** The chosen companies that are offered: what the filter shows. */
    public CompanyPicks: string[] = [];
    /** The company choice as chosen, shared across Receivables. */
    private companyChoice: string[] = [];
    public Search = '';
    public Window: DayWindow = DEFAULT_WINDOW;
    public InvoiceSort: WorklistSort = { Key: null, Descending: false };
    public PaymentSearch = '';
    public PaymentSort: WorklistSort = { Key: null, Descending: false };
    /** The totals rows. Fields: a getter would hand the table a new object on every pass. */
    public InvoiceTotals: Record<string, string> | null = null;
    public PaymentTotals: Record<string, string> | null = null;

    public Exceptions: PaymentExceptionRow[] = [];
    /** `Exceptions` under the company filter and the search, in the sorted order. */
    public ShownExceptions: PaymentExceptionRow[] = [];
    /** The payment open in the side panel. */
    public SelectedPayment: PaymentExceptionRow | null = null;
    /** Rows ticked for setting aside; always a subset of `ShownExceptions`. */
    public CheckedIDs: string[] = [];
    /** Payment provider ID (lower case) -> the company it belongs to: a payment reaches its company through its provider. */
    private providerCompany = new Map<string, { ID: string; Name: string }>();
    /** Provider ID (lower case) and the provider's customer reference -> our customer's name. */
    private customerNames = new Map<string, string>();
    /** The Company filter's choices on Payment exceptions: the companies that have one, through their payment provider. */
    public PaymentCompanies: WorklistCompanyOption[] = [];
    /** The chosen companies that have payment exceptions: what the filter shows on that tab. */
    public PaymentCompanyPicks: string[] = [];

    /** The set-aside dialog: the payments it is for, its two inputs, and what they would do. */
    public SetAsideOpen = false;
    public SetAsideTargets: PaymentExceptionRow[] = [];
    public SetAsideReason = '';
    /** The cut day (`YYYY-MM-DD`): unmatched payments dated before it may be set aside in a batch. */
    public SetAsideBefore: string | null = null;
    public SetAsidePlan: SetAsidePlan<PaymentExceptionRow> | null = null;

    /**
     * The most permissive state across the poll jobs (one per provider a job names, plus the jobs that
     * name none). The button follows it; the operation then gates each provider by its own job.
     * Null when the jobs could not be read.
     */
    public PollJob: PollJobState | null = null;
    /** The poll jobs are not all in the same state, so a check treats providers differently. */
    public PollJobsMixed = false;
    private address: Record<string, string> = {};
    private readonly companyKey = new AddressKey(COMPANY_ADDRESS_KEY);
    private readonly dueKey = new AddressKey(DUE_ADDRESS_KEY);
    private readonly tabKey = new AddressKey(TAB_ADDRESS_KEY);
    /** Counts loads, so a slow answer to an earlier read cannot overwrite a later one. */
    private loadSeq = 0;
    private ready = false;

    public readonly InvoiceColumns: MJOColumn<ExternalInvoicingWorklistRow>[] = [
        { Key: 'DocumentNumber', Label: 'Document', Kind: 'mono', Width: '150px', Sortable: true, Secondary: (r) => (r.InstallmentNumber ? `installment ${r.InstallmentNumber}` : 'whole order') },
        { Key: 'OrderNumber', Label: 'Order', Kind: 'link', LinkHint: 'Open the order', Width: '130px', HideBelow: 760, Sortable: true },
        { Key: 'CustomerName', Label: 'Customer', Sortable: true },
        { Key: 'CompanyName', Label: 'Billed by', HideBelow: 1000, Sortable: true },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Sortable: true, Format: (r) => FormatMoney(r.Amount) },
        { Key: 'DueDate', Label: 'Due', Kind: 'date', Width: '120px', Sortable: true, Format: (r) => this.date(r.DueDate) },
        {
            Key: 'State',
            Label: 'Status',
            Kind: 'chip',
            Width: '120px',
            Sortable: true,
            SortValue: (r) => stateLabel(r.State),
            ChipClass: (r) => this.stateChip(r),
            Format: (r) => stateLabel(r.State),
            Secondary: (r) => r.LastError ?? null,
        },
    ];

    public readonly PaymentColumns: MJOColumn<PaymentExceptionRow>[] = [
        { Key: 'ExternalPaymentRef', Label: 'Payment reference', Kind: 'mono', Width: '190px', Sortable: true },
        { Key: 'PaymentProvider', Label: 'Received through', HideBelow: 1000, Sortable: true, Format: (r) => r.PaymentProvider || '—', Secondary: (r) => this.companyOf(r) },
        { Key: 'ExternalCustomerRef', Label: 'Customer', HideBelow: 1000, Sortable: true, SortValue: (r) => this.customerOf(r) ?? r.ExternalCustomerRef, Format: (r) => this.customerOf(r) ?? '—', Secondary: (r) => r.ExternalCustomerRef || null },
        { Key: 'Amount', Label: 'Amount', Kind: 'money', Width: '120px', Sortable: true, SortValue: (r) => Number(r.Amount), Format: (r) => FormatMoney(r.Amount) },
        { Key: 'PaymentDate', Label: 'Dated', Kind: 'date', Width: '120px', Sortable: true, SortValue: (r) => ToISODate(r.PaymentDate), Format: (r) => this.date(r.PaymentDate) },
        {
            Key: 'Disposition',
            Label: 'Status',
            Kind: 'chip',
            Width: '160px',
            Sortable: true,
            SortValue: (r) => DispositionLabel(r.Disposition),
            ChipClass: (r) => DispositionChipClass(r.Disposition),
            Format: (r) => DispositionLabel(r.Disposition),
        },
        { Key: 'DispositionReason', Label: 'What happened', HideBelow: 760, Sortable: true, Format: (r) => r.DispositionReason ?? '—' },
    ];

    public readonly PaymentTickLabel = (row: PaymentExceptionRow): string => `Select payment ${row.ExternalPaymentRef}, ${FormatMoney(row.Amount)}`;

    private readonly invoiceExportFields: WorklistExportField<ExternalInvoicingWorklistRow>[] = [
        { Name: 'DocumentNumber', Label: 'Document', Value: (r) => r.DocumentNumber },
        { Name: 'OrderNumber', Label: 'Order', Value: (r) => r.OrderNumber },
        { Name: 'InstallmentNumber', Label: 'Installment', Type: 'number', Value: (r) => r.InstallmentNumber },
        { Name: 'CustomerName', Label: 'Customer', Value: (r) => r.CustomerName },
        { Name: 'CompanyName', Label: 'Billed by', Value: (r) => r.CompanyName },
        { Name: 'Amount', Label: 'Amount', Type: 'money', Value: (r) => r.Amount },
        { Name: 'DueDate', Label: 'Due date', Type: 'date', Value: (r) => r.DueDate },
        { Name: 'State', Label: 'Status', Value: (r) => stateLabel(r.State) },
        { Name: 'LastError', Label: 'Last error', Value: (r) => r.LastError },
    ];

    private readonly paymentExportFields: WorklistExportField<PaymentExceptionRow>[] = [
        { Name: 'ExternalPaymentRef', Label: 'Payment reference', Value: (r) => r.ExternalPaymentRef },
        { Name: 'PaymentProvider', Label: 'Received through', Value: (r) => r.PaymentProvider },
        { Name: 'Company', Label: 'Company', Value: (r) => this.companyOf(r) },
        { Name: 'Customer', Label: 'Customer', Value: (r) => this.customerOf(r) },
        { Name: 'ExternalCustomerRef', Label: 'Customer reference', Value: (r) => r.ExternalCustomerRef },
        { Name: 'Amount', Label: 'Amount', Type: 'money', Value: (r) => r.Amount },
        { Name: 'PaymentDate', Label: 'Dated', Type: 'date', Value: (r) => ToISODate(r.PaymentDate) },
        { Name: 'Disposition', Label: 'Status', Value: (r) => DispositionLabel(r.Disposition) },
        { Name: 'DispositionReason', Label: 'What happened', Value: (r) => r.DispositionReason },
        { Name: 'ExternalStatus', Label: 'Provider status', Value: (r) => r.ExternalStatus },
    ];

    /** The invoices listed, as an export file. Fields, so the bar is handed the same function every pass. */
    public readonly BuildInvoiceExport = (format: 'excel' | 'csv'): MJOWorklistExport => ({
        FileName: ExportFileName('invoices-waiting-to-send', this.CompanyPicks, this.Companies, Today()),
        ...BuildWorklistExport(this.invoiceExportFields, this.Rows, format),
    });

    public readonly BuildPaymentExport = (format: 'excel' | 'csv'): MJOWorklistExport => ({
        FileName: ExportFileName('payment-exceptions', this.PaymentCompanyPicks, this.PaymentCompanies, Today()),
        ...BuildWorklistExport(this.paymentExportFields, this.ShownExceptions, format),
    });

    public async ngOnInit(): Promise<void> {
        const saved = ReadWorklistState(globalThis.localStorage, QUEUE_STATE_KEY);
        if (saved) {
            this.Window = RestoreWindow(saved.Window, QUEUE_WINDOWS, DEFAULT_WINDOW);
            this.InvoiceSort = RestoreSort(saved.Sort, this.InvoiceColumns);
        }
        this.adoptAddress();
        await this.load();
        // An address that arrived while that first load was out was kept, not followed. Follow it now.
        this.adoptAddress();
        this.applyInvoiceView();
        this.applyExceptionFilter();
        this.ready = true;
        this.cdr.detectChanges();
    }

    /**
     * The tab's address, from the section: `company` is shared across Receivables; `queueDue` is the
     * due-date filter and `queueTab` the open tab of this page.
     */
    public ApplyAddress(params: Record<string, string>): void {
        this.address = params;
        if (!this.ready) return;
        this.adoptAddress();
        this.applyInvoiceView();
        this.applyExceptionFilter();
        // Back, Forward and links arrive outside any event of this page's own, so nothing else repaints it.
        this.cdr.detectChanges();
    }

    /** Shown again after another page: an invoice issued there is now waiting here. */
    public async OnShown(): Promise<void> {
        if (!this.ready || this.Busy) return;
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get UnsentCount(): number {
        return this.InScope.filter((r) => r.State === 'Unsent').length;
    }

    public get FailedCount(): number {
        return this.InScope.filter((r) => r.State === 'Failed').length;
    }

    public get UnsentDetail(): string {
        const total = this.InScope.filter((r) => r.State === 'Unsent').reduce((s, r) => s + r.Amount, 0);
        return this.UnsentCount ? FormatMoney(total, { Round: true }) : 'Nothing is waiting';
    }

    public get ExceptionDetail(): string {
        const reversals = this.Exceptions.filter((e) => e.Disposition === 'ReversalNeeded').length;
        if (!this.Exceptions.length) return 'Nothing is waiting';
        return reversals ? `${reversals} need${reversals === 1 ? 's' : ''} a reversal` : 'Payments that could not be recorded';
    }

    public get PresetLabel(): string {
        return PRESET_LABELS[this.Preset];
    }

    public get IsCustomWindow(): boolean {
        return this.Window.Key === CUSTOM_WINDOW;
    }

    public get InvoiceSummary(): string {
        return this.LoadError || (this.Loading && !this.AllRows.length) ? '' : ShownSummary(this.Rows.length, this.AllRows.length, 'invoice');
    }

    public get PaymentSummary(): string {
        return this.Loading && !this.Exceptions.length ? '' : ShownSummary(this.ShownExceptions.length, this.Exceptions.length, 'payment');
    }

    /** The one chosen company's name, or "the N companies chosen"; null when the filter is off. */
    private get companyScopeText(): string | null {
        if (!this.CompanyPicks.length) return null;
        if (this.CompanyPicks.length === 1) return this.Companies.find((o) => o.Value === this.CompanyPicks[0])?.Text ?? 'the company chosen';
        return `the ${this.CompanyPicks.length} companies chosen`;
    }

    /** The poll job is off or missing: the server would refuse, so the button does not offer it. */
    public get PollBlocked(): boolean {
        return this.PollJob?.State === 'NotInstalled' || this.PollJob?.State === 'Inactive';
    }

    public get PollHint(): string {
        switch (this.PollJob?.State) {
            case 'NotInstalled':
            case 'Inactive':
                return `Recording payments is off: ${this.PollJob.Why}.`;
            case 'Preview':
                return this.PollJobsMixed
                    ? 'No payment job is live, so a check here records nothing; providers whose job is off are skipped.'
                    : 'The scheduled payment job is in Preview, so a check here records nothing.';
            case 'Live':
                return this.PollJobsMixed
                    ? 'Payments are recorded only for providers whose job is live; the rest are previewed or skipped.'
                    : 'Recorded payments are not listed here, only those that could not be.';
            default:
                return 'The payment job could not be read; the server decides whether a check records anything.';
        }
    }

    /* ── Filters ────────────────────────────────────────────────────────── */

    public OnTab(tab: QueueTab): void {
        if (this.Tab === tab) return;
        this.Tab = tab;
        this.AddressChanged.emit(this.tabKey.Write(tab === 'payments' ? 'payments' : null));
    }

    /** A tile opens Invoices to send with its quick filter on; the same tile again turns the filter off. */
    public OnTile(preset: QueuePreset): void {
        const on = this.Tab === 'invoices' && this.Preset === preset;
        if (this.Tab !== 'invoices') this.OnTab('invoices');
        this.Preset = on ? 'all' : preset;
        this.applyInvoiceView();
    }

    public OnPreset(preset: QueuePreset): void {
        this.Preset = preset;
        this.applyInvoiceView();
    }

    public OnCompanies(picks: string[]): void {
        this.companyChoice = picks;
        WriteSharedCompanies(globalThis.localStorage, picks);
        this.AddressChanged.emit(this.companyKey.Write(CompaniesToAddress(picks)));
        this.applyInvoiceView();
        this.applyExceptionFilter();
    }

    public OnSearch(text: string): void {
        this.Search = text;
        this.applyInvoiceView();
    }

    public OnWindow(key: string): void {
        if (!QUEUE_WINDOWS.some((o) => o.Key === key)) return;
        this.Window = { Key: key, From: null, To: null };
        // Custom is not a choice until it has a day: nothing is saved or written to the address before then.
        if (key !== CUSTOM_WINDOW) this.saveView();
        this.applyInvoiceView();
    }

    public OnCustomDay(side: 'From' | 'To', day: string): void {
        this.Window = { ...this.Window, Key: CUSTOM_WINDOW, [side]: day || null };
        this.saveView();
        this.applyInvoiceView();
    }

    public OnInvoiceSort(key: string): void {
        this.InvoiceSort = NextSort(this.InvoiceSort, key, this.InvoiceColumns);
        WriteWorklistState(globalThis.localStorage, QUEUE_STATE_KEY, { Window: this.Window, Sort: this.InvoiceSort });
        this.applyInvoiceView();
    }

    public OnPaymentSearch(text: string): void {
        this.PaymentSearch = text;
        this.applyExceptionFilter();
    }

    public OnPaymentSort(key: string): void {
        this.PaymentSort = NextSort(this.PaymentSort, key, this.PaymentColumns);
        this.applyExceptionFilter();
    }

    public async Refresh(): Promise<void> {
        this.Notice = null;
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Rows ───────────────────────────────────────────────────────────── */

    /** Clicking a row opens it beside the list; clicking the open row closes it. */
    public OnInvoiceRow(row: ExternalInvoicingWorklistRow): void {
        this.SelectedInvoice = this.SelectedInvoice?.DocumentNumber === row.DocumentNumber ? null : row;
    }

    public OnPaymentRow(row: PaymentExceptionRow): void {
        this.SelectedPayment = this.SelectedPayment?.ID === row.ID ? null : row;
    }

    public OpenOrder(row: ExternalInvoicingWorklistRow): void {
        this.OrderOpened.emit({ ID: row.OrderHeaderID });
    }

    /* ── Sending ────────────────────────────────────────────────────────── */

    /** One invoice, deliberately. A failed or in-flight one needs the person to have checked the provider. */
    public async SendSelected(): Promise<void> {
        const row = this.SelectedInvoice;
        if (!row || this.Busy) return;
        const risky = row.State !== 'Unsent';
        const proceed = await this.confirm.Confirm({
            title: `Send ${row.DocumentNumber}?`,
            message: `${row.CustomerName} · ${FormatMoney(row.Amount)} · billed by ${row.CompanyName}.`,
            detail: risky
                ? 'A send was attempted before. Check the payment provider first: if the invoice already exists there, sending again bills the customer twice.'
                : 'The scheduled send would pick this up on its own; this sends it now.',
            type: 'warning',
            confirmText: 'Send it',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        await this.run(async () => {
            const result = await new OrdersIssueExternalInvoiceOperation().Execute({
                OrderHeaderID: row.OrderHeaderID,
                CompanyID: row.CompanyID,
                OrderHeaderPaymentScheduleID: row.OrderHeaderPaymentScheduleID,
                AllowReissue: risky,
            });
            const out = result.Output;
            if (!result.Success || !out?.Success) {
                return { Tone: 'error' as const, Text: out?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoice could not be sent.' };
            }
            return { Tone: 'success' as const, Text: out.Message ?? `${row.DocumentNumber} sent.` };
        });
    }

    /** The sweep, by hand. Never retries an invoice a person has to look at — the operation decides that. */
    public async RunSweep(): Promise<void> {
        if (this.Busy) return;
        // The sweep follows the Company filter and nothing else: the due dates, the search and the
        // quick filter change what is listed, not what is sent. The dialog says so when they differ.
        const scope = this.companyScopeText;
        const companyIDs = this.CompanyPicks.slice();
        const waiting = this.UnsentCount;
        const listedUnsent = this.Rows.filter((r) => r.State === 'Unsent').length;
        // What the run does, as the operation does it: at most SWEEP_MAX in one run, and a failed send
        // is tried again when its failure was one that can pass on a retry.
        const proceed = await this.confirm.Confirm({
            title: scope ? `Send the waiting invoices for ${scope}?` : 'Send the waiting invoices?',
            message:
                `${waiting} invoice${waiting === 1 ? ' is' : 's are'} waiting to send. One run sends up to ${SWEEP_MAX}` +
                (waiting + this.FailedCount > SWEEP_MAX ? `, so it may take another run to send the rest.` : '.') +
                (listedUnsent !== waiting ? ` The due dates, the search and the quick filter change what is listed, not what is sent: only the Company filter limits that.` : ''),
            detail:
                (this.FailedCount ? 'A failed send is tried again when its error was temporary. ' : '') +
                'Invoices whose send failed for good, or was never confirmed, are left for review.',
            type: 'warning',
            confirmText: 'Send them',
            cancelText: 'Not yet',
        });
        if (!proceed) return;

        await this.run(async () => {
            const result = await new OrdersSendExternalInvoicesOperation().Execute({ Preview: false, MaxCount: SWEEP_MAX, ...(companyIDs.length ? { CompanyIDs: companyIDs } : {}) });
            const out = result.Output;
            if (!result.Success || !out) {
                return { Tone: 'error' as const, Text: result.ErrorMessage?.trim() || 'The invoices could not be sent.' };
            }
            return { Tone: out.Success ? ('success' as const) : ('warning' as const), Text: out.Message ?? `${out.Sent} sent.` };
        });
    }

    /* ── Setting payments aside ─────────────────────────────────────────── */

    /**
     * Open the set-aside dialog for these payments (bc-aidp-next-golive#449). Setting aside is
     * permanent: a payment set aside is never captured, even once its invoice is loaded. So the dialog
     * shows the plan before anything is written: what will be set aside, and what the bulk guard leaves
     * out and why (`PlanSetAside`: recent Unmatched rows that may be waiting for an invoice, rows with
     * cash recorded). `SetAsideExternalPayments` applies the same guard again to what the database holds.
     */
    public OpenSetAside(ids: ReadonlyArray<string>): void {
        const wanted = new Set(ids);
        this.SetAsideTargets = this.ShownExceptions.filter((r) => wanted.has(r.ID));
        if (!this.SetAsideTargets.length) return;
        // A reason belongs to one act: one typed for an earlier, cancelled attempt must not ride along to other payments.
        this.SetAsideReason = '';
        this.SetAsideBefore = null;
        this.planSetAside();
        this.SetAsideOpen = true;
    }

    public OnSetAsideBefore(day: string): void {
        this.SetAsideBefore = day || null;
        this.planSetAside();
    }

    public CloseSetAside(): void {
        this.SetAsideOpen = false;
    }

    /** The payments the dialog names: the first few of those that will be set aside. */
    public get setAsideListed(): PaymentExceptionRow[] {
        return (this.SetAsidePlan?.Eligible ?? []).slice(0, SET_ASIDE_LISTED);
    }

    public get setAsideTotal(): number {
        return (this.SetAsidePlan?.Eligible ?? []).reduce((s, r) => s + Number(r.Amount), 0);
    }

    public async ApplySetAside(): Promise<void> {
        const reason = this.SetAsideReason.trim();
        const plan = this.SetAsidePlan;
        if (this.Busy || !plan?.Eligible.length || !reason) return;
        const before = this.SetAsideBefore;
        this.SetAsideOpen = false;

        await this.run(async () => {
            const result = await SetAsideExternalPayments({ IDs: plan.Eligible.map((r) => r.ID), Reason: reason, PaidBefore: before });
            this.CheckedIDs = [];
            this.SelectedPayment = null;
            this.cdr.detectChanges();
            const left = [...result.Excluded, ...result.Failed].map((x) => `${x.ExternalPaymentRef}: ${x.Why}`);
            const skipped = plan.Excluded.length ? ` ${plan.Excluded.length} selected payment${plan.Excluded.length === 1 ? ' was' : 's were'} left out.` : '';
            const text = `${result.SetAside.length} payment${result.SetAside.length === 1 ? '' : 's'} set aside.${skipped}${left.length ? ` Not set aside: ${left.join(' ')}` : ''}`;
            return { Tone: left.length ? ('warning' as const) : ('success' as const), Text: text };
        });
    }

    private planSetAside(): void {
        this.SetAsidePlan = PlanSetAside(this.SetAsideTargets, { PaidBefore: this.SetAsideBefore });
    }

    /* ── Checking for payments ──────────────────────────────────────────── */

    /**
     * The poll, by hand, following the scheduled jobs: all off → not offered; none live → a preview,
     * no confirmation since nothing is written; any live (or unreadable) → confirm, because this
     * records cash. The operation gates each provider by its own job on the server, so this only
     * decides what to ask and say.
     * Reports ATTENTION as a warning, because that means money is still waiting.
     */
    public async RunPoll(): Promise<void> {
        if (this.Busy || this.PollBlocked) return;
        const preview = this.PollJob?.State === 'Preview';
        if (!preview) {
            const proceed = await this.confirm.Confirm({
                title: 'Record payments now?',
                message: 'This reads the payments reported since the last check and records each cleared one as cash against its orders.',
                detail: 'The scheduled job would do this on its own at its next run.',
                type: 'warning',
                confirmText: 'Record payments',
                cancelText: 'Not yet',
            });
            if (!proceed) return;
        }

        await this.run(async () => {
            const result = await new OrdersPollExternalPaymentsOperation().Execute({ Preview: preview });
            const out = result.Output;
            if (!result.Success || !out) {
                return { Tone: 'error' as const, Text: result.ErrorMessage?.trim() || 'The payment check could not run.' };
            }
            if (preview && out.Success) {
                return { Tone: 'success' as const, Text: `Preview only, nothing was recorded. ${out.Message ?? ''}`.trim() };
            }
            const clean = out.Success && out.ResultCode !== 'ATTENTION';
            return { Tone: clean ? ('success' as const) : ('warning' as const), Text: out.Message ?? `${out.Captured} payment(s) recorded.` };
        });
    }

    private async run(work: () => Promise<{ Tone: 'success' | 'error' | 'warning'; Text: string }>): Promise<void> {
        this.Busy = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            this.Notice = await work();
            await this.load();
        } catch (err) {
            this.Notice = { Tone: 'error', Text: err instanceof Error ? err.message : String(err) };
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        const seq = ++this.loadSeq;
        this.Loading = true;
        this.cdr.detectChanges();
        try {
            await Promise.all([this.loadInvoices(seq), this.loadExceptions(seq), this.loadPollJob()]);
        } finally {
            if (seq === this.loadSeq) this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadInvoices(seq: number): Promise<void> {
        const result = await new OrdersGetExternalInvoicingWorklistOperation().Execute({ IncludeFailed: true });
        if (seq !== this.loadSeq) return;
        const output = result.Output;
        if (!result.Success || !output?.Success) {
            // An empty queue and a broken one look identical, and "nothing waiting" is the most
            // reassuring sentence here — so a failure has to say so.
            this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The invoicing worklist could not be loaded.';
            this.AllRows = [];
            this.applyInvoiceView();
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.AllRows = output.Rows;
        this.Truncated = output.Truncated;
        this.applyInvoiceView();
        this.cdr.detectChanges();
    }

    /**
     * Whose payments these are. The provider names its customer by its own reference; `ExternalCustomer`
     * says which of our bill-to parties that is, per provider. Context for a column: a failed read, or a
     * reference with no row, leaves the name blank and the reference still shows.
     */
    private async loadCustomers(rv: RunView, rows: PaymentExceptionRow[]): Promise<Map<string, string>> {
        const names = new Map<string, string>();
        try {
            const providers = [...new Set(rows.map((r) => String(r.PaymentProviderID ?? '')).filter(Boolean))].map((id) => `'${RequireUUID(id, 'PaymentProviderID')}'`);
            if (providers.length) {
                const customers = await rv.RunView<{ PaymentProviderID: string; ExternalCustomerRef: string; BillToOrganization?: string | null; BillToPerson?: string | null }>({
                    EntityName: EXTERNAL_CUSTOMER_ENTITY,
                    ExtraFilter: `PaymentProviderID IN (${providers.join(',')})`,
                    Fields: ['PaymentProviderID', 'ExternalCustomerRef', 'BillToOrganization', 'BillToPerson'],
                    ResultType: 'simple',
                });
                for (const c of customers.Results ?? []) {
                    const name = c.BillToOrganization ?? c.BillToPerson;
                    if (name) names.set(`${String(c.PaymentProviderID).toLowerCase()}|${c.ExternalCustomerRef}`, name);
                }
            }
        } catch {
            // Context only: the provider's own reference still identifies the payer.
        }
        return names;
    }

    private async loadExceptions(seq: number): Promise<void> {
        const rv = new RunView();
        const list = EXCEPTION_DISPOSITIONS.map((d) => `'${d}'`).join(',');
        const md = new Metadata();
        const [result] = await Promise.all([
            rv.RunView<PaymentExceptionRow>({
                EntityName: EXTERNAL_PAYMENT_ENTITY,
                ExtraFilter: `Disposition IN (${list})`,
                OrderBy: 'LastSeenAt DESC',
                ResultType: 'simple',
            }),
            LoadOrdersEngine(Metadata.Provider, md.CurrentUser).catch(() => undefined),
        ]);
        if (seq !== this.loadSeq) return;
        const customerNames = await this.loadCustomers(rv, result.Success ? (result.Results ?? []) : []);
        if (seq !== this.loadSeq) return;
        this.customerNames = customerNames;
        const cachedProviders = OrdersEngine.Instance.Loaded ? OrdersEngine.Instance.PaymentProviders : [];
        this.providerCompany = new Map(
            cachedProviders.filter((p) => p.CompanyID).map((p) => [String(p.ID).toLowerCase(), { ID: String(p.CompanyID).toLowerCase(), Name: String(p.Company ?? '') }]),
        );
        this.Exceptions = result.Success ? (result.Results ?? []) : [];
        this.applyExceptionFilter();
        this.cdr.detectChanges();
    }

    /** Narrow to the chosen companies and the search, sort, and let go of ticked or open rows that are no longer shown. */
    private applyExceptionFilter(): void {
        const company = { ID: (r: PaymentExceptionRow) => this.providerOf(r)?.ID, Name: (r: PaymentExceptionRow) => this.providerOf(r)?.Name };
        // The same choice as Invoices to send, counted here by payments. A payment whose provider's
        // company could not be read belongs to no company, so it is only listed when none is chosen.
        const companies = ReconcileCompanies(this.Exceptions, company, this.companyChoice);
        this.PaymentCompanies = companies.Options;
        this.PaymentCompanyPicks = companies.Picks;
        const matched = FilterByCompanies(this.Exceptions, this.PaymentCompanyPicks, company.ID).filter((r) =>
            MatchesText([r.ExternalPaymentRef, r.ExternalCustomerRef, this.customerOf(r), r.PaymentProvider, r.DispositionReason, DispositionLabel(r.Disposition), r.ExternalStatus], this.PaymentSearch),
        );
        this.ShownExceptions = SortRows(matched, this.PaymentColumns, this.PaymentSort);
        this.PaymentTotals = {
            ExternalPaymentRef: 'Total',
            PaymentProvider: `${this.ShownExceptions.length} payment${this.ShownExceptions.length === 1 ? '' : 's'}`,
            Amount: FormatMoney(this.ShownExceptions.reduce((s, r) => s + Number(r.Amount), 0)),
        };
        const shown = new Set(this.ShownExceptions.map((r) => r.ID));
        this.CheckedIDs = this.CheckedIDs.filter((id) => shown.has(id));
        if (this.SelectedPayment) {
            const key = this.SelectedPayment.ID;
            this.SelectedPayment = this.ShownExceptions.find((r) => r.ID === key) ?? null;
        }
    }

    private async loadPollJob(): Promise<void> {
        try {
            const groups = ClassifyPollJobGroups(await LoadPollJobs());
            const rank: Record<PollJobState['State'], number> = { NotInstalled: 0, Inactive: 1, Preview: 2, Live: 3 };
            this.PollJob = groups.length
                ? groups.reduce((best, g) => (rank[g.State] > rank[best.State] ? g : best))
                : { State: 'NotInstalled', Why: 'no scheduled payment job is installed' };
            this.PollJobsMixed = new Set(groups.map((g) => g.State)).size > 1;
        } catch {
            // A user who cannot read Scheduled Jobs still gets the button; the operation decides.
            this.PollJob = null;
            this.PollJobsMixed = false;
        }
        this.cdr.detectChanges();
    }

    /** Take the company choice, the due-date filter and the open tab from the tab's address; see the Billing worklist for the rule. */
    private adoptAddress(): void {
        const picks = AdoptCompanyChoice(this.companyKey, this.address, globalThis.localStorage);
        if (!SameChoice(picks, this.companyChoice)) this.companyChoice = picks;
        const window = AdoptWindow(this.dueKey, this.address, QUEUE_WINDOWS, this.Window, DEFAULT_WINDOW);
        if (!SameWindow(window, this.Window)) {
            this.Window = window;
            // Saved as well, so the next visit opens on what the address last said, as it does for the company.
            WriteWorklistState(globalThis.localStorage, QUEUE_STATE_KEY, { Window: this.Window, Sort: this.InvoiceSort });
        }
        // The tab follows the address once the address has named one; before that it stays where it is.
        const tab = this.tabKey.Read(this.address);
        if (tab !== null) this.Tab = tab === 'payments' ? 'payments' : 'invoices';
    }

    /**
     * Rebuild the Invoices to send list from what was loaded. The Company filter sets the scope the
     * tiles count and the sweep sends; the due dates, the search and the quick filter then narrow what
     * is listed. An open invoice the filters hide is closed, so "Send this invoice" never acts on a row
     * that is not on screen.
     */
    private applyInvoiceView(): void {
        const companies = ReconcileCompanies(this.AllRows, { ID: (r) => r.CompanyID, Name: (r) => r.CompanyName }, this.companyChoice);
        this.Companies = companies.Options;
        this.CompanyPicks = companies.Picks;
        this.InScope = FilterByCompanies(this.AllRows, this.CompanyPicks, (r) => r.CompanyID);
        const range = ResolveWindow(this.Window, QUEUE_WINDOWS, Today());
        const listed = IsOpenRange(range) && !this.Search.trim()
            ? this.InScope
            : this.InScope.filter((r) => InDayRange(r.DueDate, range) && MatchesText([r.CustomerName, r.DocumentNumber, r.OrderNumber], this.Search));
        const shown = this.Preset === 'unsent' ? listed.filter((r) => r.State === 'Unsent') : this.Preset === 'failed' ? listed.filter((r) => r.State === 'Failed') : listed;
        this.Rows = SortRows(shown, this.InvoiceColumns, this.InvoiceSort);
        this.InvoiceTotals = {
            DocumentNumber: 'Total',
            CustomerName: `${this.Rows.length} invoice${this.Rows.length === 1 ? '' : 's'}`,
            Amount: FormatMoney(this.Rows.reduce((s, r) => s + r.Amount, 0)),
        };
        if (this.SelectedInvoice) {
            const key = this.SelectedInvoice.DocumentNumber;
            this.SelectedInvoice = this.Rows.find((r) => r.DocumentNumber === key) ?? null;
        }
    }

    private saveView(): void {
        WriteWorklistState(globalThis.localStorage, QUEUE_STATE_KEY, { Window: this.Window, Sort: this.InvoiceSort });
        this.AddressChanged.emit(this.dueKey.Write(SameWindow(this.Window, DEFAULT_WINDOW) ? null : WindowToAddress(this.Window)));
    }

    /* ── Display helpers ────────────────────────────────────────────────── */

    protected stateChip(row: ExternalInvoicingWorklistRow): string {
        return row.State === 'Failed' ? 'mjo-chip--error' : row.State === 'InFlight' ? 'mjo-chip--info' : 'mjo-chip--outline';
    }

    protected dispositionLabel(row: PaymentExceptionRow): string {
        return DispositionLabel(row.Disposition);
    }

    protected dispositionChip(row: PaymentExceptionRow): string {
        return DispositionChipClass(row.Disposition);
    }

    /** Our customer for a payment, when the provider's reference maps to one. */
    protected customerOf(row: PaymentExceptionRow): string | null {
        if (!row.ExternalCustomerRef) return null;
        return this.customerNames.get(`${String(row.PaymentProviderID ?? '').toLowerCase()}|${row.ExternalCustomerRef}`) ?? null;
    }

    /** The company a payment's provider belongs to, when it could be read. */
    protected companyOf(row: PaymentExceptionRow): string | null {
        return this.providerOf(row)?.Name || null;
    }

    private providerOf(row: PaymentExceptionRow): { ID: string; Name: string } | undefined {
        return this.providerCompany.get(String(row.PaymentProviderID ?? '').toLowerCase());
    }

    protected providerText(row: PaymentExceptionRow): string {
        const company = this.companyOf(row);
        return [row.PaymentProvider, company].filter(Boolean).join(' · ') || '—';
    }

    /** Every date on the page reads MM/DD/YYYY, as on Customer A/R. A cell may carry a time; only its day is shown. */
    protected date(value: string | Date | null | undefined): string {
        const day = ToISODate(value);
        return day ? FormatDate(day, { Numeric: true }) : '—';
    }

    /** A moment (when something was sent or seen), as its day on the business calendar. */
    protected instant(value: string | Date | null | undefined): string {
        const day = InvoicedDay(value);
        return day ? FormatDate(day, { Numeric: true }) : '—';
    }
}

import { ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ExportService } from '@memberjunction/ng-export-service';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJAlertComponent, MJButtonDirective, MJConfirmService, MJEmptyStateComponent, MJFilterChipComponent } from '@memberjunction/ng-ui-components';
import {
    OrdersIssueInstalmentInvoiceOperation,
    Today,
    type DateCell,
    type mjBizAppsOrdersOrderHeaderEntity,
    type mjBizAppsOrdersPaymentHeaderEntity,
    type mjBizAppsOrdersSubscriptionEntity,
} from '@mj-biz-apps/orders-entities';
import { CompositeKey } from '@memberjunction/core';
import { MJO_COMMON_ENTITIES, MJO_ENTITIES } from '../../data/entity-names';
import { GroupInstalmentsByOrder, MJOAgingBarComponent } from '../../panels/aging-bar.component';
import { FormatDate, FormatMoney, Initials } from '../../panels/money-format';
import { MJOMultiSelectComponent } from '../../panels/multi-select.component';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { AddressKey, AdoptCompanyChoice, COMPANY_ADDRESS_KEY, CompaniesToAddress, SameChoice, WriteSharedCompanies } from './worklist-view.model';
import {
    GetInvoiceServiceByCompany,
    GetOpenInstalmentDetails,
    GetPaymentsForCustomer,
    GetReceivableOrders,
    GetSubscriptionsForCustomer,
    type MJOOpenInstalmentDetailRow,
    type MJOReceivableOrderRow,
} from '../../data/orders-queries';
import {
    BuildCustomers,
    BuildItemsExport,
    BuildSummaryExport,
    CanIssue,
    CompanyOptions,
    FilterByCompany,
    ItemFilterOptions,
    ItemStatus,
    LastReceived,
    MatchesItemFilter,
    MatchesPreset,
    MatchesSearch,
    NeighbourKey,
    PruneCompanyPicks,
    ReadPageState,
    Slug,
    SortCustomers,
    SortItems,
    SumCustomers,
    UpdatedLabel,
    WritePageState,
    type ARCompanyOption,
    type ARCustomer,
    type ARItemFilter,
    type ARItemFilterOption,
    type ARItemSortKey,
    type AROpenItem,
    type ARPreset,
    type ARSortKey,
    type ARTotals,
} from './customer-ar-page.model';

/** A column of the customer list. `Wide` columns fold away when a customer is open. */
interface ARColumn {
    Key: ARSortKey;
    Label: string;
    Title: string;
    Wide: boolean;
}

/** Every date on this page is written `MM/DD/YYYY`. */
/** How long the arrow keys must rest before the customer they stopped on is read and written to the address. */
const ARROW_SETTLE_MS = 220;

const DATE_FORMAT = { Numeric: true } as const;

/** The words for the quick filter that is on, shown beside the search so it can be cleared. */
const PRESET_LABELS: Record<ARPreset, string> = {
    all: 'All customers',
    pastdue: 'Past due',
    scheduled: 'Scheduled',
    credit: 'Credit on account',
};

/**
 * `mjo-customer-ar-page` — the A/R book, and one customer on demand.
 *
 * TWO STATES OF ONE SCREEN. It opens on the whole book: one row per customer with their receivable,
 * how old it is, what is scheduled but not yet invoiced, and the next date anything falls. Choosing
 * a customer folds that table into a narrow list and opens their detail beside it, so moving to the
 * next customer is one click (or an arrow key) and the book never leaves the screen. Choosing the
 * same customer again, "All customers", Close or Escape unfolds it.
 *
 * INVOICED AND NOT YET INVOICED ARE SHOWN APART (bc-aidp-next-golive#481). A scheduled installment
 * has no invoice behind it, so it is not receivable and is never aged; see the page model.
 *
 * IT IS A PLACE TO WORK FROM, NOT ONLY TO READ. From a customer you can record a payment, and issue
 * a scheduled installment that is due; a figure in the table opens the invoices behind it.
 *
 * THE OPEN CUSTOMER IS IN THE TAB'S ADDRESS, AND THE SECTION WRITES IT. The page emits
 * `AddressChanged` and is told the address through `ApplyAddress`; it never touches the shell or
 * the browser's history itself, because a cached page acting on "the active tab" would rewrite
 * whichever tab the user happened to be looking at.
 *
 * BALANCES ARE DERIVED FROM THE ORDER ROWS, never stored separately. Credit is a negative order
 * balance; there is no separate instrument.
 *
 * ## Example
 *
 * ```html
 * <mjo-customer-ar-page (OrderOpened)="open($event)" (AddressChanged)="write($event)" />
 * ```
 */
@Component({
    selector: 'mjo-customer-ar-page',
    standalone: true,
    imports: [
        CommonModule,
        CdkMenu,
        CdkMenuGroup,
        CdkMenuItem,
        CdkMenuTrigger,
        MJAlertComponent,
        MJButtonDirective,
        MJEmptyStateComponent,
        MJFilterChipComponent,
        MJOAgingBarComponent,
        MJOMultiSelectComponent,
        MJOStatTileComponent,
    ],
    template: `
        <div class="mjo-ar" [class.is-detail]="IsDetail" (keydown.escape)="OnEscape($event)">
            <!-- ── Filters ── -->
            <div class="mjo-ar__bar">
                <mjo-multi-select
                    Label="Company"
                    Icon="fa-solid fa-building"
                    [Options]="Companies"
                    [Selected]="CompanyPicks"
                    (SelectedChange)="OnCompanies($event)" />
                <div class="mjo-search mjo-ar__search">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <input
                        #search
                        [value]="Search"
                        (input)="OnSearch(search.value)"
                        placeholder="Search customer, order or invoice number"
                        aria-label="Search customer, order or invoice number" />
                </div>
                @if (Preset !== 'all') {
                    <mj-filter-chip [Label]="PresetLabel + ' only'" Icon="fa-solid fa-xmark" [Active]="true" (Clicked)="OnPreset('all')" />
                }
                <span class="small muted mjo-ar__asof" role="status">
                    @if (AsOfDisplay) {
                        As of {{ AsOfDisplay }}
                    }
                    @if (UpdatedText) {
                        · {{ UpdatedText }}
                    }
                </span>
                <button type="button" mjButton variant="outline" size="sm" class="mjo-ar__refresh" [disabled]="Loading" (click)="Refresh()" title="Refresh balances">
                    <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="Loading" aria-hidden="true"></i> Refresh
                </button>
                <button
                    type="button"
                    mjButton
                    variant="outline"
                    size="sm"
                    class="mjo-ar__export"
                    [cdkMenuTriggerFor]="exportMenu"
                    [disabled]="!Shown.length || Exporting"
                    title="Export the customers listed">
                    <i class="fa-solid fa-file-export" aria-hidden="true"></i> {{ Exporting ? 'Exporting…' : 'Export' }}
                    <i class="fa-solid fa-chevron-down mjo-ar__caret" aria-hidden="true"></i>
                </button>
                <ng-template #exportMenu>
                    <div class="mjo-ar__menu" cdkMenu aria-label="Export">
                        <div cdkMenuGroup aria-label="Aging summary, by customer">
                            <div class="mjo-ar__menu-label" aria-hidden="true">Aging summary, by customer</div>
                            <button type="button" class="mjo-ar__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('summary', 'excel')">
                                <i class="fa-solid fa-file-excel" aria-hidden="true"></i> Excel (.xlsx)
                            </button>
                            <button type="button" class="mjo-ar__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('summary', 'csv')">
                                <i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV
                            </button>
                        </div>
                        <div cdkMenuGroup aria-label="Open items, by invoice">
                            <div class="mjo-ar__menu-label" aria-hidden="true">Open items, by invoice</div>
                            <button type="button" class="mjo-ar__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('items', 'excel')">
                                <i class="fa-solid fa-file-excel" aria-hidden="true"></i> Excel (.xlsx)
                            </button>
                            <button type="button" class="mjo-ar__menu-item" cdkMenuItem (cdkMenuItemTriggered)="Export('items', 'csv')">
                                <i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV
                            </button>
                        </div>
                    </div>
                </ng-template>
            </div>

            @if (Notice) {
                <mj-alert [Variant]="Notice.Tone" class="mjo-ar__notice">{{ Notice.Text }}</mj-alert>
            }

            <!-- ── The book at a glance. Past due, Scheduled and Credit are also quick filters (A/R clears them); the figures do not change when one is on. ── -->
            <div class="mj-stat-grid mjo-ar__tiles">
                <mjo-stat-tile
                    class="mjo-ar__tile"
                    Hint="Show all customers"
                    Label="A/R"
                    Icon="fa-solid fa-file-invoice-dollar"
                    [Value]="Loaded ? money(Book.Owed) : '—'"
                    [Detail]="Loaded ? 'Invoiced and unpaid · ' + plural(Book.OwingCustomers, 'customer') : 'Loading…'"
                    (Clicked)="OnPreset('all')" />
                <mjo-stat-tile
                    class="mjo-ar__tile"
                    [class.is-on]="Preset === 'pastdue'"
                    [Pressed]="Preset === 'pastdue'"
                    Hint="Show customers with a past-due balance"
                    Label="Past due"
                    Icon="fa-solid fa-hourglass-half"
                    [Tone]="Book.PastDue > 0 ? 'alert' : 'default'"
                    [Value]="Loaded ? money(Book.PastDue) : '—'"
                    [Detail]="pastDueDetail"
                    (Clicked)="OnPreset('pastdue')" />
                <mjo-stat-tile
                    class="mjo-ar__tile"
                    [class.is-on]="Preset === 'scheduled'"
                    [Pressed]="Preset === 'scheduled'"
                    Hint="Show customers with installments not yet invoiced"
                    Label="Scheduled, not yet invoiced"
                    Icon="fa-solid fa-calendar-day"
                    [Value]="Loaded ? money(Book.Scheduled) : '—'"
                    [Detail]="scheduledDetail"
                    (Clicked)="OnPreset('scheduled')" />
                <mjo-stat-tile
                    class="mjo-ar__tile"
                    [class.is-on]="Preset === 'credit'"
                    [Pressed]="Preset === 'credit'"
                    Hint="Show customers with credit on account"
                    Label="Credit on account"
                    Icon="fa-solid fa-piggy-bank"
                    [Value]="Loaded ? money(Book.Credit) : '—'"
                    [Detail]="Loaded ? 'Unapplied customer credit' : 'Loading…'"
                    (Clicked)="OnPreset('credit')" />
            </div>

            <div class="mjo-ar__stage">
                <!-- ── Customers ── -->
                <section class="mj-card mjo-ar__list" aria-label="Customers">
                    <div class="mj-card-head">
                        @if (IsDetail) {
                            <button type="button" class="mjo-ar__back" (click)="Close()" title="Back to all customers (Esc)">
                                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All customers
                            </button>
                        } @else {
                            <i class="fa-solid fa-user-tag" aria-hidden="true"></i>
                            <h3>Customers</h3>
                        }
                        <span class="right small muted">{{ Shown.length }}{{ Shown.length !== AllCount ? ' of ' + AllCount : '' }}</span>
                    </div>
                    @if (Totals.Owed > 0) {
                        <div class="mjo-ar__age">
                            <mjo-aging-bar [Buckets]="Totals.Buckets" />
                        </div>
                    }
                    <div
                        class="mjo-ar__table"
                        role="table"
                        aria-label="A/R by customer"
                        [attr.aria-busy]="Loading"
                        (keydown.arrowdown)="OnArrow($event, 1)"
                        (keydown.arrowup)="OnArrow($event, -1)">
                        <div class="mjo-ar__cols mjo-ar__cols--head" role="row">
                            @for (column of Columns; track column.Key) {
                                <div
                                    role="columnheader"
                                    class="mjo-ar__hcell"
                                    [class.mjo-ar__wide]="column.Wide"
                                    [attr.aria-sort]="SortKey === column.Key ? (SortDescending ? 'descending' : 'ascending') : 'none'">
                                    <button
                                        type="button"
                                        class="mjo-ar__th"
                                        [class.mjo-ar__th--num]="column.Key !== 'Name'"
                                        [class.is-sorted]="SortKey === column.Key"
                                        [title]="column.Title"
                                        (click)="OnSort(column.Key)">
                                        <span>{{ column.Label }}</span>
                                        @if (SortKey === column.Key) {
                                            <i class="fa-solid" [class.fa-arrow-down]="SortDescending" [class.fa-arrow-up]="!SortDescending" aria-hidden="true"></i>
                                        }
                                    </button>
                                </div>
                            }
                        </div>
                        @if (!Loaded && Loading) {
                            @for (line of Skeleton; track line) {
                                <div class="mjo-ar__cols mjo-ar__row mjo-ar__skeleton" aria-hidden="true">
                                    <span class="mjo-ar__cell mjo-ar__who"><span class="mjo-ar__bone mjo-ar__bone--dot"></span><span class="mjo-ar__bone" [style.width.%]="38 + line * 7"></span></span>
                                    <span class="mjo-ar__cell mjo-ar__num"><span class="mjo-ar__bone mjo-ar__bone--num"></span></span>
                                </div>
                            }
                        } @else if (!Loaded) {
                            <div role="row">
                                <div role="cell">
                                    <mj-empty-state
                                        class="mjo-ar__empty"
                                        Icon="fa-solid fa-triangle-exclamation"
                                        Title="A/R could not be loaded"
                                        Message="Nothing is shown because the read failed, not because nothing is owed. Use Refresh to try again." />
                                </div>
                            </div>
                        } @else {
                            @for (customer of Shown; track customer.Key) {
                                <div
                                    role="row"
                                    class="mjo-ar__cols mjo-ar__row"
                                    [class.is-active]="customer.Key === SelectedKey"
                                    [attr.tabindex]="customer.Key === FocusKey ? 0 : -1"
                                    [attr.data-key]="customer.Key"
                                    [attr.aria-current]="customer.Key === SelectedKey ? 'true' : null"
                                    [attr.aria-label]="rowLabel(customer)"
                                    (focus)="FocusKey = customer.Key"
                                    (click)="Toggle(customer.Key)"
                                    (keydown.enter)="Toggle(customer.Key)"
                                    (keydown.space)="$event.preventDefault(); Toggle(customer.Key)">
                                    <span class="mjo-ar__cell mjo-ar__who" role="cell">
                                        <span class="mj-avatar mjo-ar__avatar" aria-hidden="true">{{ initials(customer.Name) }}</span>
                                        <span class="mjo-ar__who-body">
                                            <span class="mjo-ar__name">{{ customer.Name }}</span>
                                            <span class="small mjo-ar__sub" [class.mjo-ar__late]="customer.PastDue > 0" [class.muted]="customer.PastDue <= 0">{{ subLine(customer) }}</span>
                                        </span>
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__owed" role="cell">
                                        <b class="mj-num">{{ money(customer.Owed) }}</b>
                                        @if (customer.Owed > 0) {
                                            <span class="mjo-ar__mix" aria-hidden="true">
                                                <i class="mjo-ar__mix-cur" [style.flex-grow]="customer.Buckets.Current"></i>
                                                <i class="mjo-ar__mix-30" [style.flex-grow]="customer.Buckets.Days1To30"></i>
                                                <i class="mjo-ar__mix-60" [style.flex-grow]="customer.Buckets.Days31To60"></i>
                                                <i class="mjo-ar__mix-90" [style.flex-grow]="customer.Buckets.Days61Plus"></i>
                                            </span>
                                        }
                                        @if (customer.Credit > 0) {
                                            <span class="small mj-money--credit mjo-ar__cr">{{ money(customer.Credit) }} credit</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.PastDue > 0) {
                                            <button type="button" class="mjo-ar__drill mjo-ar__very-late" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View past-due invoices" (click)="OpenFiltered(customer.Key, 'pastdue', $event)">{{ money(customer.PastDue) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.Buckets.Current > 0) {
                                            <button type="button" class="mjo-ar__drill" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View current invoices" (click)="OpenFiltered(customer.Key, 'Current', $event)">{{ money(customer.Buckets.Current) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.Buckets.Days1To30 > 0) {
                                            <button type="button" class="mjo-ar__drill mjo-ar__late" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View invoices 1 to 30 days past due" (click)="OpenFiltered(customer.Key, 'Days1To30', $event)">{{ money(customer.Buckets.Days1To30) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.Buckets.Days31To60 > 0) {
                                            <button type="button" class="mjo-ar__drill mjo-ar__late" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View invoices 31 to 60 days past due" (click)="OpenFiltered(customer.Key, 'Days31To60', $event)">{{ money(customer.Buckets.Days31To60) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.Buckets.Days61Plus > 0) {
                                            <button type="button" class="mjo-ar__drill mjo-ar__late" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View invoices more than 60 days past due" (click)="OpenFiltered(customer.Key, 'Days61Plus', $event)">{{ money(customer.Buckets.Days61Plus) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">
                                        @if (customer.Scheduled > 0) {
                                            <button type="button" class="mjo-ar__drill" tabindex="-1" (keydown.enter)="$event.stopPropagation()" title="View scheduled installments" (click)="OpenFiltered(customer.Key, 'scheduled', $event)">{{ money(customer.Scheduled) }}</button>
                                        } @else {
                                            <span class="mjo-ar__zero">—</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mjo-ar__next" role="cell" [class.mjo-ar__zero]="!customer.NextDueDate">
                                        <span>{{ dateOf(customer.NextDueDate) }}</span>
                                        @if (customer.NextDueDate && customer.NextDueIsScheduled) {
                                            <span class="small muted">scheduled</span>
                                        }
                                    </span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell" [class.mjo-ar__zero]="!customer.NextDueDate">{{ customer.NextDueDate ? money(customer.NextDueAmount) : '—' }}</span>
                                </div>
                            } @empty {
                                <div role="row">
                                    <div role="cell">
                                        <mj-empty-state
                                            class="mjo-ar__empty"
                                            Icon="fa-solid fa-user-tag"
                                            [Title]="AllCount ? 'No customers match' : 'No open A/R'"
                                            [Message]="AllCount ? 'Clear the search, the quick filter or the company filter to see more.' : 'No customer has an A/R balance, a scheduled installment or credit on account.'" />
                                    </div>
                                </div>
                            }
                            @if (Shown.length > 1) {
                                <div class="mjo-ar__cols mjo-ar__row mjo-ar__total" role="row">
                                    <span class="mjo-ar__cell mjo-ar__who" role="cell"><span class="mjo-ar__name">{{ Preset === 'all' && !Search.trim() ? 'Total' : 'Total listed' }} · {{ plural(Shown.length, 'customer') }}</span></span>
                                    <span class="mjo-ar__cell mjo-ar__num" role="cell"><b class="mj-num">{{ money(Totals.Owed) }}</b></span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.PastDue) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.Buckets.Current) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.Buckets.Days1To30) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.Buckets.Days31To60) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.Buckets.Days61Plus) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__num mjo-ar__wide mj-num" role="cell">{{ amount(Totals.Scheduled) }}</span>
                                    <span class="mjo-ar__cell mjo-ar__wide" role="cell"></span>
                                    <span class="mjo-ar__cell mjo-ar__wide" role="cell"></span>
                                </div>
                            }
                        }
                    </div>
                </section>

                <!-- ── One customer ── -->
                <section class="mjo-ar__detail" [attr.inert]="IsDetail ? null : ''" aria-label="Customer detail">
                    @if (Detail; as customer) {
                        <div class="mj-card">
                            <div class="mj-card-pad">
                                <div class="mjo-ar__header">
                                    <span class="mj-avatar mjo-ar__avatar-lg" aria-hidden="true">{{ initials(customer.Name) }}</span>
                                    <div class="mjo-ar__header-body">
                                        @if (canOpenCustomer(customer)) {
                                            <button type="button" class="mjo-ar__header-name mjo-ar__header-link" (click)="OpenCustomerRecord(customer)" [title]="'Open ' + customer.Name">
                                                {{ customer.Name }} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                                            </button>
                                        } @else {
                                            <div class="mjo-ar__header-name">{{ customer.Name }}</div>
                                        }
                                        <div class="small muted">
                                            {{ customer.IsOrganization ? 'Organization' : 'Individual' }} · {{ plural(customer.OrderCount, 'order') }} with a balance
                                        </div>
                                    </div>
                                    <div class="mjo-ar__actions">
                                        @if (canRecordPayment(customer)) {
                                            <button type="button" mjButton variant="primary" size="sm" (click)="RecordPayment(customer)" title="Start a new payment for this customer in a new tab">
                                                <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Record payment
                                            </button>
                                        }
                                        <button type="button" mjButton variant="outline" size="sm" (click)="Close()" title="Back to all customers (Esc)">
                                            <i class="fa-solid fa-xmark" aria-hidden="true"></i> Close
                                        </button>
                                    </div>
                                </div>

                                <div class="mjo-ar__figures">
                                    <div class="mjo-ar__figure">
                                        <div class="mjo-ar__figure-label">A/R</div>
                                        <div class="mjo-ar__figure-value">{{ money(customer.Owed) }}</div>
                                        <div class="small muted">Invoiced and unpaid</div>
                                    </div>
                                    <div class="mjo-ar__figure">
                                        <div class="mjo-ar__figure-label">Past due</div>
                                        <div class="mjo-ar__figure-value" [class.mjo-ar__very-late]="customer.PastDue > 0">{{ money(customer.PastDue) }}</div>
                                        <div class="small muted">{{ customer.PastDue > 0 ? 'Oldest: ' + plural(customer.OldestDaysPastDue, 'day') + ' past due' : 'Nothing past due' }}</div>
                                    </div>
                                    <div class="mjo-ar__figure">
                                        <div class="mjo-ar__figure-label">Scheduled</div>
                                        <div class="mjo-ar__figure-value">{{ money(customer.Scheduled) }}</div>
                                        <div class="small muted">{{ customer.ReadyToInvoice > 0 ? money(customer.ReadyToInvoice) + ' ready to invoice' : 'Not yet invoiced' }}</div>
                                    </div>
                                    <div class="mjo-ar__figure">
                                        <div class="mjo-ar__figure-label">{{ customer.NextDueIsScheduled ? 'Next scheduled' : 'Next due' }}</div>
                                        <div class="mjo-ar__figure-value">{{ dateOf(customer.NextDueDate) }}</div>
                                        <div class="small muted">{{ customer.NextDueDate ? money(customer.NextDueAmount) : 'No upcoming dates' }}</div>
                                    </div>
                                    <div class="mjo-ar__figure">
                                        <div class="mjo-ar__figure-label">Last payment</div>
                                        @if (LastPayment; as last) {
                                            <div class="mjo-ar__figure-value">{{ dateOf(last.PaymentDate) }}</div>
                                            <div class="small muted">
                                                {{ money(last.Amount) }} ·
                                                <button type="button" class="mjo-ar__ref mono small" (click)="PaymentOpened.emit(last)" [title]="'Open payment ' + last.PaymentNumber">{{ last.PaymentNumber }}</button>
                                            </div>
                                        } @else {
                                            <div class="mjo-ar__figure-value">—</div>
                                            <div class="small muted">{{ DetailLoading ? 'Loading…' : DetailFailed ? 'Could not be loaded' : 'No payments received' }}</div>
                                        }
                                    </div>
                                    @if (customer.Credit > 0) {
                                        <div class="mjo-ar__figure">
                                            <div class="mjo-ar__figure-label">Credit on account</div>
                                            <div class="mjo-ar__figure-value mj-money--credit">{{ money(customer.Credit) }}</div>
                                            <div class="small muted">Net A/R {{ money(netOwed(customer)) }}</div>
                                        </div>
                                    }
                                </div>

                                @if (customer.Owed > 0) {
                                    <div class="mjo-ar__aging">
                                        <mjo-aging-bar [Buckets]="customer.Buckets" />
                                    </div>
                                }

                                @if (customer.Credit > 0 && customer.Owed > 0) {
                                    <mj-alert Variant="success" Icon="fa-solid fa-piggy-bank" class="mjo-ar__credit">
                                        <strong>This customer has {{ money(customer.Credit) }} credit on account and {{ money(customer.Owed) }} A/R.</strong>
                                        To apply it, go to Payments, then Account credits.
                                    </mj-alert>
                                }
                            </div>
                        </div>

                        <div class="mj-card mjo-ar__block">
                            <div class="mj-card-head">
                                <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                                <h3>Open items</h3>
                                <span class="right small muted">{{ plural(ShownItems.length, 'item') }}</span>
                            </div>
                            @if (ItemFilters.length > 2) {
                                <div class="row wrap mjo-ar__item-filters" role="group" aria-label="Show">
                                    @for (option of ItemFilters; track option.Key) {
                                        <mj-filter-chip
                                            [Label]="option.Label"
                                            [Count]="option.Key === 'all' ? null : option.Count"
                                            [Active]="option.Key === ItemFilter"
                                            (Clicked)="OnItemFilter(option.Key)" />
                                    }
                                </div>
                            }
                            <div class="mj-table-wrap mjo-ar__items">
                                <table class="mj-table mj-table--compact">
                                    <thead>
                                        <tr>
                                            @for (column of ItemColumnsList; track column.Key) {
                                                <th [class.mjo-ar__right]="column.Right" [attr.aria-sort]="ItemSortKey === column.Key ? (ItemSortDescending ? 'descending' : 'ascending') : 'none'">
                                                    <button type="button" class="mjo-ar__ith" [class.mjo-ar__ith--right]="column.Right" [class.is-sorted]="ItemSortKey === column.Key" [title]="'Sort by ' + column.Label.toLowerCase()" (click)="OnItemSort(column.Key)">
                                                        <span>{{ column.Label }}</span>
                                                        @if (ItemSortKey === column.Key) {
                                                            <i class="fa-solid" [class.fa-arrow-down]="ItemSortDescending" [class.fa-arrow-up]="!ItemSortDescending" aria-hidden="true"></i>
                                                        } @else {
                                                            <i class="fa-solid fa-sort mjo-ar__sort-idle" aria-hidden="true"></i>
                                                        }
                                                    </button>
                                                </th>
                                            }
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (item of ShownItems; track item.Key) {
                                            <tr class="is-clickable" tabindex="0" (click)="OpenOrder(item)" (keydown.enter)="OpenOrder(item)" (keydown.space)="$event.preventDefault(); OpenOrder(item)" [attr.aria-label]="'Open order ' + item.OrderNumber">
                                                <td class="mono small primary">{{ item.OrderNumber }}</td>
                                                <td class="small">{{ item.Company || '—' }}</td>
                                                <td class="small">{{ item.Label }}</td>
                                                <td class="mono small">{{ item.DocumentNumber ?? '—' }}</td>
                                                <td class="small">{{ dateOf(item.InvoicedOn) }}</td>
                                                <td class="small">{{ dateOf(item.DueDate) }}</td>
                                                <td class="mj-num mjo-ar__right" [class.mjo-ar__zero]="!item.DaysPastDue" [class.mjo-ar__very-late]="item.DaysPastDue > 60">{{ item.DaysPastDue || '—' }}</td>
                                                <td class="mjo-ar__status" (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()" (keydown.space)="$event.stopPropagation()">
                                                    <span class="mjo-chip" [class]="itemChip(item)">{{ itemStatus(item) }}</span>
                                                    @if (canIssue(item)) {
                                                        <button type="button" mjButton variant="outline" size="sm" [disabled]="IssuingKey !== null" (click)="Issue(item, customer)" title="Issue this installment as an invoice">
                                                            <i class="fa-solid fa-file-invoice" aria-hidden="true"></i> {{ IssuingKey === item.Key ? 'Issuing…' : 'Issue invoice' }}
                                                        </button>
                                                    }
                                                </td>
                                                <td class="mj-num mjo-ar__right">{{ money(item.Amount) }}</td>
                                                <td class="mj-num mjo-ar__right" [class.mjo-ar__zero]="!item.Paid">{{ amount(item.Paid) }}</td>
                                                <td class="mj-num mjo-ar__right"><b>{{ money(item.Balance) }}</b></td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="11" class="small muted">{{ customer.Items.length ? 'No items match this filter.' : 'No open items. This customer has credit on account only.' }}</td>
                                            </tr>
                                        }
                                        <!-- A/R and scheduled are subtotalled apart: adding them would put money that has not been invoiced into a balance. -->
                                        @if (ShownReceivable.Count > 1 || (ShownReceivable.Count && ShownScheduled.Count)) {
                                            <tr class="is-total">
                                                <td colspan="10">A/R · {{ plural(ShownReceivable.Count, 'item') }}</td>
                                                <td class="mj-num mjo-ar__right">{{ money(ShownReceivable.Amount) }}</td>
                                            </tr>
                                        }
                                        @if (ShownScheduled.Count > 1 || (ShownReceivable.Count && ShownScheduled.Count)) {
                                            <tr class="is-total">
                                                <td colspan="10">Scheduled, not yet invoiced · {{ plural(ShownScheduled.Count, 'item') }}</td>
                                                <td class="mj-num mjo-ar__right">{{ money(ShownScheduled.Amount) }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="mjo-ar__grid">
                            <div class="mj-card">
                                <div class="mj-card-head">
                                    <i class="fa-solid fa-piggy-bank" aria-hidden="true"></i>
                                    <h3>Credit on account</h3>
                                </div>
                                <div class="mj-card-pad">
                                    @for (credit of customer.Credits; track credit.ID) {
                                        <div class="mjo-ar__line">
                                            <button type="button" class="mjo-ar__ref mono small" (click)="OpenCredit(credit.ID)" [title]="'Open order ' + credit.OrderNumber">{{ credit.OrderNumber }}</button>
                                            <b class="mj-num mj-money--credit">{{ money(credit.Amount) }}</b>
                                        </div>
                                    } @empty {
                                        <div class="small muted">No credit on account.</div>
                                    }
                                </div>
                            </div>

                            <div class="mj-card">
                                <div class="mj-card-head">
                                    <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                                    <h3>Payment history</h3>
                                </div>
                                <div class="mj-card-pad">
                                    @for (payment of Payments; track payment.ID) {
                                        <div class="mjo-ar__line">
                                            <span class="small">
                                                <button type="button" class="mjo-ar__ref mono small" (click)="PaymentOpened.emit(payment)" [title]="'Open payment ' + payment.PaymentNumber">{{ payment.PaymentNumber }}</button>
                                                <span class="muted"> · {{ dateOf(payment.PaymentDate) }}</span>
                                                @if (payment.Status !== 'Captured') {
                                                    <span class="muted"> · {{ payment.Status }}</span>
                                                }
                                            </span>
                                            <b class="mj-num" [class.mjo-ar__zero]="payment.Status !== 'Captured'">{{ money(payment.Amount) }}</b>
                                        </div>
                                    } @empty {
                                        <div class="small muted">{{ DetailLoading ? 'Loading payments…' : DetailFailed ? 'Payments could not be loaded.' : 'No payments received.' }}</div>
                                    }
                                </div>
                            </div>
                        </div>

                        <div class="mj-card mjo-ar__block">
                            <div class="mj-card-head">
                                <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                                <h3>Subscriptions</h3>
                                <span class="right small muted">{{ Subscriptions.length }}</span>
                            </div>
                            <div class="mj-table-wrap">
                                <table class="mj-table mj-table--compact">
                                    <thead>
                                        <tr>
                                            <th>Subscription</th>
                                            <th>Product</th>
                                            <th>Covered through</th>
                                            <th>Renewal</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (sub of Subscriptions; track sub.ID) {
                                            <tr class="is-clickable" tabindex="0" (click)="SubscriptionOpened.emit(sub)" (keydown.enter)="SubscriptionOpened.emit(sub)" [attr.aria-label]="'Open subscription ' + sub.SubscriptionNumber">
                                                <td class="mono small">{{ sub.SubscriptionNumber }}</td>
                                                <td class="small">{{ sub.Product || '—' }}</td>
                                                <td class="small">{{ dateOf(sub.EndDate) }}</td>
                                                <td class="small">{{ sub.AutoRenew ? 'Auto-renews' : 'Manual renewal' }}</td>
                                                <td><span class="mjo-chip" [class]="subClass(sub)">{{ sub.Status || '—' }}</span></td>
                                            </tr>
                                        } @empty {
                                            <tr>
                                                <td colspan="5" class="small muted">{{ DetailLoading ? 'Loading subscriptions…' : DetailFailed ? 'Subscriptions could not be loaded.' : 'No subscriptions.' }}</td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    }
                </section>
            </div>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                overflow: auto;
                padding: var(--mj-space-6);
                /* How long the fold between the two states takes, and its curve. The 340ms wait in
                   revealSelected() is this plus a frame. */
                --mjo-ar-fold: 320ms;
                --mjo-ar-ease: cubic-bezier(0.22, 0.8, 0.26, 1);
                --mjo-ar-list-width: 372px;
            }
            /* The page sits beside the shell's rail and the section's menu, so its own width, not the
               window's, decides how many columns fit. */
            .mjo-ar { container-type: inline-size; container-name: mjo-ar; }

            /* ── Filters ── */
            .mjo-ar__bar {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                flex-wrap: wrap;
                margin-bottom: var(--mj-space-4);
            }
            .mjo-ar__search { min-width: 300px; }
            .mjo-ar__asof { margin-left: auto; white-space: nowrap; }
            .mjo-ar__refresh, .mjo-ar__export { flex: none; }
            .mjo-ar__caret { font-size: 10px; margin-left: 2px; }
            .mjo-ar__menu {
                min-width: 260px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                box-shadow: var(--mj-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
                padding: var(--mj-space-1, 4px);
            }
            .mjo-ar__menu-label {
                font-size: 11px;
                font-weight: var(--mj-font-semibold);
                color: var(--mj-text-muted);
                padding: 8px 10px 2px;
            }
            .mjo-ar__menu-item {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                width: 100%;
                font: inherit;
                font-size: 13px;
                text-align: left;
                padding: 8px 10px;
                border: none;
                border-radius: var(--mj-radius-md);
                background: none;
                color: inherit;
                cursor: pointer;
            }
            .mjo-ar__menu-item:hover, .mjo-ar__menu-item:focus-visible { background: var(--mj-bg-surface-sunken); outline: none; }
            .mjo-ar__menu-item i { color: var(--mj-text-muted); width: 16px; }
            .mjo-ar__notice { display: block; margin-bottom: var(--mj-space-4); }

            /* ── Tiles: the book's totals, and the quick filters ── */
            .mjo-ar__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-ar__tile {
                display: block;
                border-radius: var(--mj-radius-md);
                transition: box-shadow 140ms ease;
            }
            /* Ringed only while its quick filter is on. A/R, which clears the filter, never is. */
            .mjo-ar__tile.is-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 55%, transparent); }

            /* ── The two panes ──
               The list starts at full width. Opening a customer animates its flex-basis down to a fixed
               rail while the detail pane grows from nothing, so the table folds rather than swaps. */
            .mjo-ar__stage {
                display: flex;
                align-items: flex-start;
                gap: 0;
            }
            .mjo-ar__list {
                flex: 1 1 100%;
                min-width: 0;
                /* clip, not hidden: hidden would make this card the sticky container, and it does not
                   scroll in the full-width state, so the header and total row would never stick. */
                overflow: clip;
                transition: flex-basis var(--mjo-ar-fold) var(--mjo-ar-ease);
            }
            .mjo-ar__detail {
                flex: 0 1 0%;
                min-width: 0;
                max-width: 0;
                opacity: 0;
                overflow: hidden;
                transform: translateX(24px);
                transition:
                    max-width var(--mjo-ar-fold) var(--mjo-ar-ease),
                    opacity 200ms ease,
                    transform var(--mjo-ar-fold) var(--mjo-ar-ease),
                    margin-left var(--mjo-ar-fold) var(--mjo-ar-ease);
            }
            .mjo-ar.is-detail .mjo-ar__list {
                flex: 0 0 var(--mjo-ar-list-width);
                position: sticky;
                top: 0;
                max-height: calc(100vh - 140px);
                overflow-y: auto;
            }
            .mjo-ar.is-detail .mjo-ar__detail {
                flex: 1 1 0%;
                max-width: 100%;
                opacity: 1;
                transform: none;
                margin-left: var(--mj-space-5);
                overflow: visible;
                transition:
                    max-width var(--mjo-ar-fold) var(--mjo-ar-ease),
                    opacity 260ms ease 120ms,
                    transform var(--mjo-ar-fold) var(--mjo-ar-ease),
                    margin-left var(--mjo-ar-fold) var(--mjo-ar-ease);
            }
            .mjo-ar__back {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border: none;
                background: none;
                font: inherit;
                font-size: 13px;
                font-weight: var(--mj-font-semibold);
                color: var(--mj-brand-primary);
                cursor: pointer;
                padding: 2px 4px;
                border-radius: var(--mj-radius-md);
            }
            .mjo-ar__back:hover { background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent); }

            /* ── The customer table ──
               A grid whose track list is the same length in every state, so the wide tracks animate to
               zero instead of the columns popping out of the row. */
            .mjo-ar__age { padding: var(--mj-space-3) var(--mj-space-4) var(--mj-space-2); }
            .mjo-ar__table { display: block; }
            .mjo-ar__cols {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 118px 104px 96px 96px 96px 96px 112px 104px 108px;
                align-items: center;
                column-gap: 0;
                transition: grid-template-columns var(--mjo-ar-fold) var(--mjo-ar-ease);
            }
            .mjo-ar.is-detail .mjo-ar__cols { grid-template-columns: minmax(0, 1fr) 124px 0px 0px 0px 0px 0px 0px 0px 0px; }
            .mjo-ar__wide {
                overflow: hidden;
                white-space: nowrap;
                transition: opacity 180ms ease, padding var(--mjo-ar-fold) var(--mjo-ar-ease), visibility 0s;
            }
            /* Folded columns are taken out of the tab order and the accessibility tree, once they have faded. */
            .mjo-ar.is-detail .mjo-ar__wide {
                opacity: 0;
                visibility: hidden;
                padding-left: 0;
                padding-right: 0;
                transition: opacity 180ms ease, padding var(--mjo-ar-fold) var(--mjo-ar-ease), visibility 0s linear 180ms;
            }

            .mjo-ar__cols--head {
                border-top: 1px solid var(--mj-border-subtle);
                border-bottom: 1px solid var(--mj-border-default);
                background: var(--mj-bg-surface-card);
                position: sticky;
                top: 0;
                z-index: 1;
            }
            .mjo-ar__hcell { min-width: 0; }
            .mjo-ar__th {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 100%;
                min-width: 0;
                padding: 9px var(--mj-space-3);
                border: none;
                background: none;
                font: inherit;
                font-size: 11px;
                font-weight: var(--mj-font-semibold);
                letter-spacing: 0.03em;
                text-transform: uppercase;
                color: var(--mj-text-muted);
                cursor: pointer;
                white-space: nowrap;
            }
            .mjo-ar__hcell:first-child .mjo-ar__th { padding-left: var(--mj-space-4); }
            .mjo-ar__th--num { justify-content: flex-end; }
            .mjo-ar__th:hover, .mjo-ar__th.is-sorted { color: var(--mj-text-primary); }
            .mjo-ar__th i { font-size: 9px; }
            .mjo-ar__th:focus-visible, .mjo-ar__row:focus-visible, .mjo-ar__back:focus-visible, .mjo-ar__ref:focus-visible, .mjo-ar__ith:focus-visible, .mjo-ar__header-link:focus-visible {
                outline: 2px solid var(--mj-border-focus);
                outline-offset: -2px;
            }

            .mjo-ar__row {
                width: 100%;
                border-bottom: 1px solid var(--mj-border-subtle);
                border-left: 3px solid transparent;
                cursor: pointer;
                transition: background-color 120ms ease;
            }
            .mjo-ar__row:hover { background: var(--mj-bg-surface-hover); }
            .mjo-ar__row.is-active {
                background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
                border-left-color: var(--mj-brand-primary);
            }
            /* The total stays in view while the list scrolls under it. */
            .mjo-ar__total {
                cursor: default;
                border-bottom: none;
                border-top: 2px solid var(--mj-border-strong);
                background: var(--mj-bg-surface-card);
                font-weight: var(--mj-font-semibold);
                position: sticky;
                bottom: 0;
                z-index: 1;
            }
            .mjo-ar__total:hover { background: var(--mj-bg-surface-card); }
            .mjo-ar__cell { min-width: 0; padding: 10px var(--mj-space-3); font-size: 13px; }
            .mjo-ar__num { text-align: right; white-space: nowrap; }
            .mjo-ar__who {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                padding-left: var(--mj-space-3);
            }
            .mjo-ar__who-body { min-width: 0; display: flex; flex-direction: column; }
            .mjo-ar__name {
                font-weight: var(--mj-font-medium);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .mjo-ar__sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mjo-ar__owed { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
            .mjo-ar__next { display: flex; flex-direction: column; align-items: flex-end; }
            /* The customer's receivable by age, as a thin strip under the amount: the same four colours as the aging bar. */
            .mjo-ar__mix {
                display: flex;
                width: 72px;
                height: 4px;
                border-radius: 2px;
                overflow: hidden;
                background: var(--mj-border-subtle);
            }
            .mjo-ar__mix i { display: block; flex: 0 0 0; min-width: 0; }
            .mjo-ar__mix-cur { background: var(--mj-color-neutral-500); }
            .mjo-ar__mix-30 { background: var(--mj-color-warning-500); }
            .mjo-ar__mix-60 { background: var(--mj-color-error-500); }
            .mjo-ar__mix-90 { background: var(--mj-color-error-700); }
            .mjo-ar__cr { white-space: nowrap; }
            .mjo-ar__zero { color: var(--mj-text-disabled); }
            .mjo-ar__late { color: var(--mj-status-warning-text); }
            .mjo-ar__very-late { color: var(--mj-status-error-text); font-weight: var(--mj-font-semibold); }
            /* A figure that opens the invoices behind it: underlined so it reads as a link at rest. */
            .mjo-ar__drill {
                border: none;
                background: none;
                padding: 1px 3px;
                margin: -1px -3px;
                font: inherit;
                font-variant-numeric: tabular-nums;
                color: inherit;
                cursor: pointer;
                border-radius: var(--mj-radius-md);
                text-decoration: underline dotted;
                text-underline-offset: 3px;
            }
            .mjo-ar__drill.mjo-ar__late { color: var(--mj-status-warning-text); }
            .mjo-ar__drill.mjo-ar__very-late { color: var(--mj-status-error-text); }
            .mjo-ar__drill:hover { text-decoration: underline; background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent); }
            .mjo-ar__avatar { width: 30px; height: 30px; font-size: 11px; flex: none; }
            .mjo-ar__avatar-lg { width: 44px; height: 44px; font-size: 15px; flex: none; }
            .mjo-ar__empty { display: block; padding: var(--mj-space-6) var(--mj-space-4); }

            /* Placeholder rows while the first read is in flight. */
            .mjo-ar__skeleton { cursor: default; }
            .mjo-ar__skeleton:hover { background: none; }
            .mjo-ar__bone {
                display: inline-block;
                height: 12px;
                border-radius: 6px;
                background: linear-gradient(90deg, var(--mj-bg-surface-sunken) 25%, var(--mj-bg-surface-hover) 50%, var(--mj-bg-surface-sunken) 75%);
                background-size: 200% 100%;
                animation: mjo-ar-shimmer 1.3s ease-in-out infinite;
            }
            .mjo-ar__bone--dot { width: 30px; height: 30px; border-radius: 50%; flex: none; }
            .mjo-ar__bone--num { width: 76px; }
            @keyframes mjo-ar-shimmer {
                from { background-position: 200% 0; }
                to { background-position: -200% 0; }
            }

            /* ── One customer ── */
            .mjo-ar__header { display: flex; align-items: flex-start; gap: var(--mj-space-4); }
            .mjo-ar__header-body { flex: 1; min-width: 0; }
            .mjo-ar__header-name { font-size: 18px; font-weight: var(--mj-font-semibold); }
            /* The customer's name is a link to their record, and reads as one at rest. */
            .mjo-ar__header-link {
                display: inline-flex;
                align-items: baseline;
                gap: var(--mj-space-2);
                border: none;
                background: none;
                padding: 0;
                font-family: inherit;
                color: var(--mj-brand-primary);
                cursor: pointer;
                text-align: left;
            }
            .mjo-ar__header-link i { font-size: 11px; }
            .mjo-ar__header-link:hover { text-decoration: underline; text-underline-offset: 3px; }
            .mjo-ar__actions { display: flex; align-items: center; gap: var(--mj-space-2); flex: none; }
            .mjo-ar__figures {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: var(--mj-space-3);
                margin: var(--mj-space-4) 0 0;
            }
            .mjo-ar__figure {
                border: 1px solid var(--mj-border-subtle);
                border-radius: var(--mj-radius-md);
                padding: var(--mj-space-3);
                min-width: 0;
            }
            .mjo-ar__figure-label {
                font-size: 11px;
                font-weight: var(--mj-font-semibold);
                letter-spacing: 0.03em;
                text-transform: uppercase;
                color: var(--mj-text-muted);
            }
            /* Every card reads from the left, money or date alike. */
            .mjo-ar__figure-value {
                margin: 2px 0;
                font-size: 19px;
                font-weight: var(--mj-font-semibold);
                font-variant-numeric: tabular-nums;
                text-align: left;
            }
            .mjo-ar__aging { margin-top: var(--mj-space-4); }
            .mjo-ar__credit { display: block; margin-top: var(--mj-space-4); }
            .mjo-ar__block { margin-top: var(--mj-space-4); }
            .mjo-ar__item-filters { gap: var(--mj-space-2); padding: var(--mj-space-3) var(--mj-space-4) 0; }
            .mjo-ar__items { border: none; border-radius: 0; }
            .mjo-ar__right { text-align: right; }
            /* A column heading of the open-items table that sorts it. Inherits the table's heading type. */
            .mjo-ar__ith {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                border: none;
                background: none;
                padding: 0;
                font: inherit;
                letter-spacing: inherit;
                text-transform: inherit;
                color: inherit;
                cursor: pointer;
                white-space: nowrap;
            }
            .mjo-ar__ith--right { flex-direction: row-reverse; }
            .mjo-ar__ith:hover, .mjo-ar__ith.is-sorted { color: var(--mj-text-primary); }
            .mjo-ar__ith i { font-size: 9px; }
            .mjo-ar__sort-idle { opacity: 0.35; }
            .mjo-ar__ith:hover .mjo-ar__sort-idle { opacity: 0.8; }
            .mjo-ar__status { white-space: nowrap; }
            .mjo-ar__status .mjo-chip { margin-right: var(--mj-space-2); }
            .mjo-ar__grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--mj-space-4);
                margin-top: var(--mj-space-4);
            }
            .mjo-ar__line {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-3);
                padding: 6px 0;
                border-bottom: 1px solid var(--mj-border-subtle);
            }
            .mjo-ar__line:last-child { border-bottom: none; }
            .mjo-ar__ref {
                border: none;
                background: none;
                padding: 0;
                color: var(--mj-brand-primary);
                cursor: pointer;
            }
            .mjo-ar__ref:hover { text-decoration: underline; }

            /* ── Less room: drop columns from the right, then stack. Sized on the page, not the window. ── */
            @container mjo-ar (max-width: 1120px) {
                /* First to go: the three late buckets. Past due still totals them, and a figure opens the detail. */
                .mjo-ar__cols { grid-template-columns: minmax(0, 1fr) 118px 104px 96px 0px 0px 0px 112px 104px 108px; }
                .mjo-ar__cols > :nth-child(n + 5):nth-child(-n + 7) { opacity: 0; visibility: hidden; padding-left: 0; padding-right: 0; overflow: hidden; }
            }
            @container mjo-ar (max-width: 900px) {
                /* Then Current and the next amount; the next due date stays. */
                .mjo-ar__cols { grid-template-columns: minmax(0, 1fr) 118px 104px 0px 0px 0px 0px 112px 104px 0px; }
                .mjo-ar__cols > :nth-child(n + 4):nth-child(-n + 7), .mjo-ar__cols > :nth-child(10) { opacity: 0; visibility: hidden; padding-left: 0; padding-right: 0; overflow: hidden; }
                .mjo-ar.is-detail .mjo-ar__list { display: none; }
                .mjo-ar.is-detail .mjo-ar__detail { margin-left: 0; }
                .mjo-ar__grid { grid-template-columns: 1fr; }
            }
            @container mjo-ar (max-width: 560px) {
                .mjo-ar__cols, .mjo-ar.is-detail .mjo-ar__cols { grid-template-columns: minmax(0, 1fr) 116px 0px 0px 0px 0px 0px 0px 0px 0px; }
                .mjo-ar__wide { opacity: 0; visibility: hidden; padding-left: 0; padding-right: 0; }
                .mjo-ar__search { min-width: 0; flex: 1 1 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
            @media (prefers-reduced-motion: reduce) {
                .mjo-ar__list, .mjo-ar__detail, .mjo-ar.is-detail .mjo-ar__detail, .mjo-ar__cols, .mjo-ar__wide, .mjo-ar.is-detail .mjo-ar__wide, .mjo-ar__row, .mjo-ar__tile { transition: none; }
                .mjo-ar__bone { animation: none; }
            }
        `,
    ],
})
export class MJOCustomerARPageComponent implements OnInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly exporter = inject(ExportService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly confirm = inject(MJConfirmService);
    /** Absent in a host that is not the Explorer shell; the action that needs it is then not offered. */
    private readonly navigation = inject(NavigationService, { optional: true });

    @Output() OrderOpened = new EventEmitter<mjBizAppsOrdersOrderHeaderEntity>();
    /** A subscription or a payment in the customer's detail was chosen; the section opens the record. */
    @Output() SubscriptionOpened = new EventEmitter<mjBizAppsOrdersSubscriptionEntity>();
    @Output() PaymentOpened = new EventEmitter<mjBizAppsOrdersPaymentHeaderEntity>();
    /** Asks the section to put the open customer in the tab's address, or take it out (`customer: null`). */
    @Output() AddressChanged = new EventEmitter<Record<string, string | null>>();

    public readonly Columns: ARColumn[] = [
        { Key: 'Name', Label: 'Customer', Title: 'Sort by customer name', Wide: false },
        { Key: 'Owed', Label: 'A/R', Title: 'Invoiced and unpaid: Current plus Past due', Wide: false },
        { Key: 'PastDue', Label: 'Past due', Title: 'Total past due: 1–30, 31–60 and 61+ days', Wide: true },
        { Key: 'Current', Label: 'Current', Title: 'Invoiced and not past its due date', Wide: true },
        { Key: 'Days1To30', Label: '1–30 days', Title: '1 to 30 days past due', Wide: true },
        { Key: 'Days31To60', Label: '31–60 days', Title: '31 to 60 days past due', Wide: true },
        { Key: 'Days61Plus', Label: '61+ days', Title: 'More than 60 days past due', Wide: true },
        { Key: 'Scheduled', Label: 'Scheduled', Title: 'Installments not yet invoiced. Not included in A/R.', Wide: true },
        { Key: 'NextDueDate', Label: 'Next due date', Title: 'The next date an invoice falls due or an installment is scheduled to be invoiced', Wide: true },
        { Key: 'NextDueAmount', Label: 'Next amount', Title: 'Everything falling on the next due date', Wide: true },
    ];
    /** Placeholder rows shown while the first read is in flight. */
    public readonly Skeleton = [0, 1, 2, 3, 4, 5];

    /** A read is in flight. */
    public Loading = true;
    /** A read has succeeded at least once. Until then there are no figures, only placeholders or an error. */
    public Loaded = false;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public AsOfDisplay = '';
    /** "Updated 4 minutes ago", refreshed on a timer so it does not go stale on a screen left open. */
    public UpdatedText = '';

    /** Company filter: what is offered, and what is ticked (company ids, lower case). */
    public Companies: ARCompanyOption[] = [];
    public CompanyPicks: string[] = [];
    public Search = '';
    public Preset: ARPreset = 'all';
    public SortKey: ARSortKey = 'Owed';
    public SortDescending = true;

    /** Customers the company filter leaves; the ones the search and quick filter then list; and the two totals. */
    public AllCount = 0;
    public Shown: ARCustomer[] = [];
    /** The list's total row: what is listed. */
    public Totals: ARTotals = SumCustomers([]);
    /** The tiles: the book under the company filter and the search. A quick filter does not change them. */
    public Book: ARTotals = SumCustomers([]);

    /** The open customer's key, or null for the whole book. */
    public SelectedKey: string | null = null;
    /** The row that takes Tab focus: the open customer, the last one focused, or the first listed. */
    public FocusKey: string | null = null;
    /** The customer the detail pane renders. Kept after closing so the pane folds away with its content, not empty. */
    public Detail: ARCustomer | null = null;
    public DetailLoading = false;
    /** The open customer's payments and subscriptions could not be read, so their absence is not "none". */
    public DetailFailed = false;
    public Payments: mjBizAppsOrdersPaymentHeaderEntity[] = [];
    public LastPayment: mjBizAppsOrdersPaymentHeaderEntity | null = null;
    public Subscriptions: mjBizAppsOrdersSubscriptionEntity[] = [];

    /** Which of the open customer's items are listed, the choices offered, and the rows that result. */
    public ItemFilter: ARItemFilter = 'all';
    public ItemFilters: ARItemFilterOption[] = [];
    public ShownItems: AROpenItem[] = [];
    public ShownReceivable = { Count: 0, Amount: 0 };
    public ShownScheduled = { Count: 0, Amount: 0 };
    /** The column the open items are sorted on; null for their own order (invoiced first, then by due date). */
    public ItemSortKey: ARItemSortKey | null = null;
    public ItemSortDescending = false;
    public readonly ItemColumnsList: ReadonlyArray<{ Key: ARItemSortKey; Label: string; Right: boolean }> = [
        { Key: 'OrderNumber', Label: 'Order', Right: false },
        { Key: 'Company', Label: 'Company', Right: false },
        { Key: 'Label', Label: 'Type', Right: false },
        { Key: 'DocumentNumber', Label: 'Invoice #', Right: false },
        { Key: 'InvoicedOn', Label: 'Invoice date', Right: false },
        { Key: 'DueDate', Label: 'Due date', Right: false },
        { Key: 'DaysPastDue', Label: 'Days past due', Right: true },
        { Key: 'Status', Label: 'Status', Right: false },
        { Key: 'Amount', Label: 'Amount', Right: true },
        { Key: 'Paid', Label: 'Paid', Right: true },
        { Key: 'Balance', Label: 'Balance', Right: true },
    ];
    /** The item whose installment is being issued, so its button shows progress and the others wait. */
    public IssuingKey: string | null = null;

    public Exporting = false;

    private orders: MJOReceivableOrderRow[] = [];
    private instalments = new Map<string, MJOOpenInstalmentDetailRow[]>();
    private customers: ARCustomer[] = [];
    private today = '';
    private loadedAt: Date | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    /** Counts reads, so a slower earlier one cannot overwrite a later one. */
    private loadSequence = 0;
    /** The customer the tab's address names, held until the first read lands. */
    private linkedCustomer: string | null = null;
    /** The tab's address as the section last gave it. */
    private address: Record<string, string> = {};
    private readonly companyKey = new AddressKey(COMPANY_ADDRESS_KEY);
    /** The company choice as chosen, shared across Receivables. `CompanyPicks` is the part of it this page offers. */
    private companyChoice: string[] = [];
    /** The linked customer we have already said is not in this view, so it is said once. */
    private missingLinkTold: string | null = null;
    /** Company id (lower case) to the service that sends its invoices, for the wording of the issue dialog. */
    private invoiceServices = new Map<string, string>();
    /** Waits for arrow keys to stop before the open customer is written to the address and their history read. */
    private settleTimer: ReturnType<typeof setTimeout> | null = null;

    public get IsDetail(): boolean {
        return this.SelectedKey !== null;
    }

    public get PresetLabel(): string {
        return PRESET_LABELS[this.Preset];
    }

    public async ngOnInit(): Promise<void> {
        const saved = ReadPageState(globalThis.localStorage);
        if (saved) {
            this.SortKey = saved.SortKey;
            this.SortDescending = saved.SortDescending;
        }
        // Started before the first await, so a page destroyed mid-load still has its timer cleared.
        this.ticker = globalThis.setInterval(() => this.tick(), 60000);
        this.adoptCompanyChoice();
        await this.load();
        if (this.destroyed) return;
        this.followAddress();
        this.cdr.detectChanges();
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
        if (this.ticker) globalThis.clearInterval(this.ticker);
        if (this.settleTimer) globalThis.clearTimeout(this.settleTimer);
    }

    /**
     * The tab's address, from the section: on first show, and on Back, Forward or a link.
     * `customer` names the customer to open; without it the book is shown.
     */
    public ApplyAddress(params: Record<string, string>): void {
        this.address = params;
        this.linkedCustomer = params['customer']?.toLowerCase() || null;
        if (!this.Loaded) return;
        // Following the address must not write it: a write made here is dropped by the shell while the
        // section has already recorded it, and the two then disagree about which customer is open.
        if (this.adoptCompanyChoice()) this.rebuild(false);
        this.followAddress();
        // Back, Forward and links arrive outside any event of this page's own, so nothing else repaints it.
        if (!this.destroyed) this.cdr.detectChanges();
    }

    /**
     * Take the company choice every Receivables page shares (`AdoptCompanyChoice`): what the tab's
     * address states, else, where it has never named a company, the saved choice.
     *
     * @returns Whether the choice changed.
     */
    private adoptCompanyChoice(): boolean {
        const picks = AdoptCompanyChoice(this.companyKey, this.address, globalThis.localStorage);
        if (SameChoice(picks, this.companyChoice)) return false;
        this.companyChoice = picks;
        return true;
    }

    /* ── Keys. Bound on the page's own elements, so a cached page that is not on screen hears nothing. ── */

    /** Escape closes the open customer. */
    public OnEscape(event: Event): void {
        if (!this.IsDetail || event.defaultPrevented) return;
        // Escape in a field (the search box, a menu) belongs to that field.
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('input, textarea, select, [contenteditable], [role="menu"], [role="listbox"]')) return;
        event.preventDefault();
        this.Close();
    }

    /** Arrows move through the customers; with one open, they open the next. Focus follows. */
    public OnArrow(event: Event, step: 1 | -1): void {
        const next = NeighbourKey(this.Shown, this.FocusKey, step);
        if (!next) return;
        event.preventDefault();
        if (next === this.FocusKey) return;
        this.FocusKey = next;
        // Held down, the arrows pass through many customers: each is shown at once, but only the one
        // the keys stop on is written to the address and has its history read.
        if (this.IsDetail) void this.Open(next, 'all', true, ARROW_SETTLE_MS);
        else this.cdr.detectChanges();
        this.focusRow(next);
    }

    /* ── Choosing a customer ───────────────────────────────────────────── */

    /** Open a customer, or close them when they are the one already open. */
    public Toggle(key: string): void {
        if (this.SelectedKey === key) this.Close();
        else void this.Open(key);
    }

    /** Open a customer on the invoices behind one figure in their row. */
    public OpenFiltered(key: string, filter: ARItemFilter, event: Event): void {
        event.stopPropagation();
        void this.Open(key, filter);
    }

    /**
     * Open a customer.
     *
     * @param filter - Which of their items to list first.
     * @param record - Whether to ask for the customer to be written into the tab's address. False when the address is what told us.
     * @param settleMs - How long to wait before the address is written and the history read; another open in that time replaces this one.
     */
    public async Open(key: string, filter: ARItemFilter = 'all', record = true, settleMs = 0): Promise<void> {
        const customer = this.customers.find((c) => c.Key === key);
        if (!customer) return;
        this.SelectedKey = key;
        this.FocusKey = key;
        this.Detail = customer;
        this.ItemFilter = filter;
        this.applyItems();
        this.Payments = [];
        this.LastPayment = null;
        this.Subscriptions = [];
        this.DetailFailed = false;
        this.DetailLoading = true;
        if (this.settleTimer) globalThis.clearTimeout(this.settleTimer);
        this.settleTimer = null;
        this.cdr.detectChanges();
        this.revealSelected();
        const settle = async (): Promise<void> => {
            this.settleTimer = null;
            if (this.destroyed || this.SelectedKey !== key) return;
            if (record) this.AddressChanged.emit({ customer: key });
            await this.loadDetail(customer);
        };
        if (settleMs > 0) this.settleTimer = globalThis.setTimeout(() => void settle(), settleMs);
        else await settle();
    }

    public Close(record = true): void {
        const closed = this.SelectedKey;
        if (closed === null) return;
        this.SelectedKey = null;
        if (this.settleTimer) globalThis.clearTimeout(this.settleTimer);
        this.settleTimer = null;
        if (record) this.AddressChanged.emit({ customer: null });
        this.cdr.detectChanges();
        // The button that closed it is inside a pane that is now inert; put focus back on the row.
        this.focusRow(closed);
    }

    public OnItemFilter(filter: ARItemFilter): void {
        this.ItemFilter = this.ItemFilter === filter ? 'all' : filter;
        this.applyItems();
        this.cdr.detectChanges();
    }

    /** Sort the open items on a column; the same column again reverses it, and a third click returns to their own order. */
    public OnItemSort(key: ARItemSortKey): void {
        // Text and dates start A to Z and soonest first; amounts and days start largest first.
        const startsDescending = key === 'Amount' || key === 'Paid' || key === 'Balance' || key === 'DaysPastDue';
        if (this.ItemSortKey !== key) {
            this.ItemSortKey = key;
            this.ItemSortDescending = startsDescending;
        } else if (this.ItemSortDescending === startsDescending) {
            this.ItemSortDescending = !startsDescending;
        } else {
            this.ItemSortKey = null;
        }
        this.applyItems();
        this.cdr.detectChanges();
    }

    /** The customer's own record (the organization, or the person), in a new tab. */
    public OpenCustomerRecord(customer: ARCustomer): void {
        this.navigation?.OpenEntityRecord(customer.IsOrganization ? MJO_COMMON_ENTITIES.Organization : MJO_COMMON_ENTITIES.Person, CompositeKey.FromID(customer.Key));
    }

    public OpenOrder(item: AROpenItem): void {
        this.OrderOpened.emit({ ID: item.OrderID } as mjBizAppsOrdersOrderHeaderEntity);
    }

    public OpenCredit(orderID: string): void {
        this.OrderOpened.emit({ ID: orderID } as mjBizAppsOrdersOrderHeaderEntity);
    }

    /* ── Acting on a customer ──────────────────────────────────────────── */

    /** A new payment for this customer, in its own tab. The payment form lists their open orders to allocate against. */
    public RecordPayment(customer: ARCustomer): void {
        this.navigation?.OpenNewEntityRecord(MJO_ENTITIES.PaymentHeader, {
            newRecordValues: customer.IsOrganization ? { BillToOrganizationID: customer.Key } : { BillToPersonID: customer.Key },
        });
    }

    /**
     * Issue a scheduled installment as an invoice.
     *
     * THE IRREVERSIBLE STEP, so it asks first and says what it does: issuing posts the amount to A/R
     * and, for a company that invoices through an external service, sends the invoice through it.
     * The server re-checks that the installment can be issued.
     */
    public async Issue(item: AROpenItem, customer: ARCustomer): Promise<void> {
        if (!item.ScheduleID || this.IssuingKey) return;
        const service = this.invoiceServices.get((item.CompanyID ?? '').toLowerCase());
        const late = item.DaysPastDue > 0 ? ` That date is ${this.plural(item.DaysPastDue, 'day')} ago, so it will show as past due.` : '';
        const proceed = await this.confirm.Confirm({
            title: `Issue the invoice for ${item.Label.toLowerCase()} of order ${item.OrderNumber}?`,
            message: `${customer.Name} · ${FormatMoney(item.Amount)} due ${FormatDate(item.DueDate, DATE_FORMAT)}.`,
            detail:
                (service
                    ? `This sends the invoice through ${service}, posts the amount to A/R, and starts aging from the due date.`
                    : 'This posts the amount to A/R and starts aging from the due date.') + late,
            type: 'warning',
            confirmText: 'Issue invoice',
            cancelText: 'Not yet',
        });
        if (!proceed || this.destroyed) return;

        this.IssuingKey = item.Key;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersIssueInstalmentInvoiceOperation().Execute({ OrderHeaderPaymentScheduleID: item.ScheduleID });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                this.Notice = { Tone: 'error', Text: output?.Message?.trim() || result.ErrorMessage?.trim() || 'The installment could not be issued.' };
            } else {
                this.Notice = {
                    Tone: 'success',
                    Text: `${item.Label} of order ${item.OrderNumber} was issued${output.DocumentNumber ? ` as invoice ${output.DocumentNumber}` : ''}.`,
                };
                await this.load();
            }
        } catch (err) {
            this.Notice = { Tone: 'error', Text: err instanceof Error ? err.message : String(err) };
        } finally {
            this.IssuingKey = null;
            if (!this.destroyed) this.cdr.detectChanges();
        }
    }

    /** Read the figures again, keeping the open customer and every filter. */
    public async Refresh(): Promise<void> {
        if (this.Loading || this.IssuingKey) return;
        this.Notice = null;
        await this.load();
        if (!this.destroyed) this.cdr.detectChanges();
    }

    /* ── Narrowing and ordering ────────────────────────────────────────── */

    public OnCompanies(ids: string[]): void {
        this.companyChoice = ids;
        WriteSharedCompanies(globalThis.localStorage, ids);
        this.AddressChanged.emit(this.companyKey.Write(CompaniesToAddress(ids)));
        this.rebuild();
    }

    public OnSearch(text: string): void {
        this.Search = text;
        this.applyView();
    }

    /** A tile turns its quick filter on; the same tile again, or "All", turns it off. */
    public OnPreset(key: ARPreset): void {
        this.Preset = this.Preset === key ? 'all' : key;
        this.applyView();
    }

    public OnSort(key: ARSortKey): void {
        if (this.SortKey === key) this.SortDescending = !this.SortDescending;
        else {
            this.SortKey = key;
            // Names read A to Z and dates soonest first; money reads largest first.
            this.SortDescending = key !== 'Name' && key !== 'NextDueDate';
        }
        this.saveView();
        this.applyView();
    }

    /* ── Export ────────────────────────────────────────────────────────── */

    /** The customers listed, as an aging summary or as one row per invoice and installment. */
    public async Export(kind: 'summary' | 'items', format: 'excel' | 'csv'): Promise<void> {
        if (!this.Shown.length || this.Exporting) return;
        const result = kind === 'summary' ? BuildSummaryExport(this.Shown, this.today, format) : BuildItemsExport(this.Shown, this.today, format);
        const company = this.CompanyPicks.length === 1 ? this.Companies.find((o) => o.Value === this.CompanyPicks[0])?.Text : null;
        const fileName = [kind === 'summary' ? 'ar-aging-summary' : 'ar-open-items', company ? Slug(company) : null, this.today ? `as-of-${this.today}` : null].filter(Boolean).join('-');
        this.Exporting = true;
        this.Notice = null;
        this.cdr.detectChanges();
        try {
            // The lower-case name: it is the one every ng-export-service since 6.1 exposes (6.2 adds a capitalised alias).
            const outcome = await this.exporter.exportAndDownload(result.Rows, { format, fileName, columns: result.Columns, includeHeaders: true });
            if (!outcome.success) this.Notice = { Tone: 'error', Text: `The export failed: ${outcome.error ?? 'unknown error'}` };
        } catch (err) {
            this.Notice = { Tone: 'error', Text: `The export failed: ${err instanceof Error ? err.message : String(err)}` };
        } finally {
            this.Exporting = false;
            if (!this.destroyed) this.cdr.detectChanges();
        }
    }

    /* ── Display helpers ───────────────────────────────────────────────── */

    protected get pastDueDetail(): string {
        if (!this.Loaded) return 'Loading…';
        if (this.Book.PastDue <= 0) return 'Nothing past due';
        return `${this.plural(this.Book.PastDueCustomers, 'customer')} · ${this.percent(this.Book.PastDue, this.Book.Owed)} of A/R`;
    }

    protected get scheduledDetail(): string {
        if (!this.Loaded) return 'Loading…';
        if (this.Book.ReadyToInvoice > 0) return `${FormatMoney(this.Book.ReadyToInvoice)} is ready to invoice. Not included in A/R.`;
        return 'Future installments. Not included in A/R.';
    }

    protected money(value: number | null | undefined): string {
        return FormatMoney(value ?? 0);
    }

    /** Money in a table cell: a dash for nothing, so a column of zeros does not read as data. */
    protected amount(value: number): string {
        return value ? FormatMoney(value) : '—';
    }

    /**
     * A `date` cell (due date, invoice day, payment date) as `MM/DD/YYYY`, which is how every date on
     * this page is written. Passed as it is: `String()` of a `Date` reads as no date.
     */
    protected dateOf(value: DateCell): string {
        return value ? FormatDate(value, DATE_FORMAT) : '—';
    }

    protected initials(name: string): string {
        return Initials(name);
    }

    protected plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }

    protected percent(part: number, whole: number): string {
        if (whole <= 0 || part <= 0) return '0%';
        const share = (part / whole) * 100;
        // A small past-due balance is not "0%".
        return share < 1 ? '<1%' : `${Math.round(share)}%`;
    }

    protected netOwed(customer: ARCustomer): number {
        return Math.max(0, Math.round((customer.Owed - customer.Credit) * 100) / 100);
    }

    /** The name links to the customer's record when there is a shell to open it in and a real customer behind the row. */
    protected canOpenCustomer(customer: ARCustomer): boolean {
        return !!this.navigation && customer.Key !== 'unknown';
    }

    /** Recording a payment opens the payment form in a new tab, which needs the Explorer shell and a real customer. */
    protected canRecordPayment(customer: ARCustomer): boolean {
        return !!this.navigation && customer.Owed > 0 && customer.Key !== 'unknown';
    }

    protected rowLabel(customer: ARCustomer): string {
        const late = customer.PastDue > 0 ? `, ${FormatMoney(customer.PastDue)} past due` : '';
        return `${customer.Name}, ${FormatMoney(customer.Owed)} A/R${late}. ${customer.Key === this.SelectedKey ? 'Open. Press Enter to close.' : 'Press Enter to open.'}`;
    }

    /** The line under a customer's name: what is past due if anything is, then what is waiting to be invoiced, otherwise how much is open. */
    protected subLine(customer: ARCustomer): string {
        if (customer.PastDue > 0) return `${FormatMoney(customer.PastDue)} past due, oldest ${this.plural(customer.OldestDaysPastDue, 'day')}`;
        if (customer.ReadyToInvoice > 0) return `${FormatMoney(customer.ReadyToInvoice)} ready to invoice`;
        if (customer.Owed <= 0 && customer.Scheduled > 0) return `${FormatMoney(customer.Scheduled)} scheduled, not yet invoiced`;
        if (customer.Owed <= 0 && customer.Credit > 0) return 'Credit on account only';
        return `${this.plural(customer.OrderCount, 'order')} with a balance`;
    }

    protected canIssue(item: AROpenItem): boolean {
        return CanIssue(item);
    }

    protected itemStatus(item: AROpenItem): string {
        return ItemStatus(item);
    }

    protected itemChip(item: AROpenItem): string {
        switch (ItemStatus(item)) {
            case 'Past due':
                return item.DaysPastDue > 60 ? 'mjo-chip--error' : 'mjo-chip--warning';
            case 'Ready to invoice':
                return 'mjo-chip--brand';
            case 'Scheduled':
                return 'mjo-chip--outline';
            default:
                return 'mjo-chip--info';
        }
    }

    /**
     * The chip for a subscription's state. Paused is the one that wants attention: the customer still
     * holds the seat and is not currently being served by it.
     */
    protected subClass(sub: mjBizAppsOrdersSubscriptionEntity): string {
        switch (sub.Status) {
            case 'Active':
                return 'mjo-chip--success';
            case 'Trialing':
                return 'mjo-chip--info';
            case 'Paused':
                return 'mjo-chip--warning';
            default:
                return 'mjo-chip--outline';
        }
    }

    /* ── Loading and deriving ──────────────────────────────────────────── */

    /**
     * Read the book. On failure what is on screen STAYS: figures a minute old are more use than an
     * empty page, and an empty page under "Nothing is owed" would be a lie. Both reads throw on
     * failure for exactly that reason.
     */
    private async load(): Promise<void> {
        const sequence = ++this.loadSequence;
        this.Loading = true;
        this.cdr.detectChanges();
        try {
            // The invoice services only word the issue dialog; that read never throws.
            const [orders, instalments, services] = await Promise.all([GetReceivableOrders(), GetOpenInstalmentDetails(), GetInvoiceServiceByCompany()]);
            if (this.destroyed || sequence !== this.loadSequence) return;
            this.invoiceServices = services;
            this.orders = orders;
            this.instalments = GroupInstalmentsByOrder(instalments);
            this.today = Today();
            this.AsOfDisplay = FormatDate(this.today, DATE_FORMAT);
            this.loadedAt = new Date();
            this.Loaded = true;
            this.UpdatedText = UpdatedLabel(this.loadedAt, this.loadedAt);
        } catch (err) {
            if (this.destroyed || sequence !== this.loadSequence) return;
            this.Notice = { Tone: 'error', Text: `A/R could not be loaded: ${err instanceof Error ? err.message : String(err)}` };
        }
        this.Loading = false;
        this.rebuild();
        // A refresh also refreshes the open customer's payments and subscriptions.
        if (this.Detail && this.IsDetail) await this.loadDetail(this.Detail);
    }

    /** The open customer's payments and subscriptions. Dropped if another customer is opened meanwhile. */
    private async loadDetail(customer: ARCustomer): Promise<void> {
        const key = customer.Key;
        this.DetailLoading = true;
        this.cdr.detectChanges();
        const identity = { OrganizationID: customer.IsOrganization ? key : null, PersonID: customer.IsOrganization ? null : key };
        try {
            const [payments, subscriptions] = await Promise.all([GetPaymentsForCustomer(identity), GetSubscriptionsForCustomer(identity)]);
            if (this.destroyed || this.SelectedKey !== key) return;
            this.Payments = payments;
            this.LastPayment = LastReceived(payments);
            this.Subscriptions = subscriptions;
            this.DetailFailed = false;
        } catch (err) {
            if (this.destroyed || this.SelectedKey !== key) return;
            this.DetailFailed = true;
            this.Notice = { Tone: 'error', Text: `This customer's history could not be loaded: ${err instanceof Error ? err.message : String(err)}` };
        }
        this.DetailLoading = false;
        this.cdr.detectChanges();
    }

    /** Re-derive the customers from the orders the company filter leaves. */
    private rebuild(record = true): void {
        this.Companies = CompanyOptions(this.orders);
        // The choice is shared across Receivables, so a company with nothing open here is left out of
        // this page's filter without being dropped from the choice: it may have work on another page.
        this.CompanyPicks = this.Loaded ? PruneCompanyPicks(this.companyChoice, this.Companies) : this.companyChoice;
        this.customers = BuildCustomers(FilterByCompany(this.orders, this.CompanyPicks), this.instalments, this.today);
        this.AllCount = this.customers.length;
        if (this.SelectedKey) {
            const still = this.customers.find((c) => c.Key === this.SelectedKey);
            // The same customer with fresh figures keeps their payments and subscriptions on screen.
            if (still) this.Detail = still;
            else this.Close(record);
        }
        this.applyItems();
        this.applyView();
    }

    /** The open customer's items under the current filter. A filter that no longer matches anything falls back to all. */
    private applyItems(): void {
        const items = this.Detail?.Items ?? [];
        this.ItemFilters = ItemFilterOptions(items);
        if (!this.ItemFilters.some((o) => o.Key === this.ItemFilter)) this.ItemFilter = 'all';
        this.ShownItems = SortItems(
            items.filter((i) => MatchesItemFilter(i, this.ItemFilter)),
            this.ItemSortKey,
            this.ItemSortDescending,
        );
        const subtotal = (state: AROpenItem['State']): { Count: number; Amount: number } => {
            const rows = this.ShownItems.filter((i) => i.State === state);
            return { Count: rows.length, Amount: rows.reduce((sum, i) => sum + Math.round(i.Balance * 100), 0) / 100 };
        };
        this.ShownReceivable = subtotal('Invoiced');
        this.ShownScheduled = subtotal('Scheduled');
    }

    /** Apply the search, the quick filter and the sort, and total both what is in scope and what is listed. */
    private applyView(): void {
        const searched = this.customers.filter((c) => MatchesSearch(c, this.Search));
        this.Book = SumCustomers(searched);
        this.Shown = SortCustomers(
            searched.filter((c) => MatchesPreset(c, this.Preset)),
            this.SortKey,
            this.SortDescending,
        );
        this.Totals = SumCustomers(this.Shown);
        if (!this.FocusKey || !this.Shown.some((c) => c.Key === this.FocusKey)) this.FocusKey = this.SelectedKey ?? this.Shown[0]?.Key ?? null;
        this.cdr.detectChanges();
    }

    /** Open or close to match the address the section last gave us. */
    private followAddress(): void {
        const linked = this.linkedCustomer && this.customers.some((c) => c.Key === this.linkedCustomer) ? this.linkedCustomer : null;
        // A link to a customer who is not listed says so, once, instead of silently showing the book.
        if (this.linkedCustomer && !linked && this.missingLinkTold !== this.linkedCustomer) {
            this.missingLinkTold = this.linkedCustomer;
            this.Notice = {
                Tone: 'warning',
                Text: this.CompanyPicks.length
                    ? 'The customer in this link is not listed under the current company filter. Clear the filter to look for them.'
                    : 'The customer in this link has no A/R, scheduled installments or credit on account.',
            };
            this.cdr.detectChanges();
        }
        if (linked === this.SelectedKey) return;
        if (linked) void this.Open(linked, 'all', false);
        else this.Close(false);
    }

    private saveView(): void {
        WritePageState(globalThis.localStorage, { Companies: this.CompanyPicks, SortKey: this.SortKey, SortDescending: this.SortDescending });
    }

    private tick(): void {
        const text = UpdatedLabel(this.loadedAt, new Date());
        if (this.destroyed || text === this.UpdatedText) return;
        this.UpdatedText = text;
        this.cdr.detectChanges();
    }

    private rowOf(key: string): HTMLElement | null {
        return this.host.nativeElement.querySelector<HTMLElement>(`.mjo-ar__row[data-key="${key}"]`);
    }

    private focusRow(key: string): void {
        globalThis.setTimeout?.(() => {
            if (!this.destroyed) this.rowOf(key)?.focus();
        });
    }

    /** Keep the open customer's row in view once the list has folded to its rail. */
    private revealSelected(): void {
        const key = this.SelectedKey;
        if (!key) return;
        const calm = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        globalThis.setTimeout?.(
            () => {
                if (this.destroyed || this.SelectedKey !== key) return;
                this.rowOf(key)?.scrollIntoView?.({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
            },
            calm ? 0 : 340,
        );
    }
}

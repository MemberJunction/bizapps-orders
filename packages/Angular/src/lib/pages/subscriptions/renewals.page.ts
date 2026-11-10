import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    MJAlertComponent,
    MJButtonDirective,
    MJDialogActionsComponent,
    MJDialogComponent,
    MJDropdownComponent,
} from '@memberjunction/ng-ui-components';
import { RunView } from '@memberjunction/core';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import { ExportService } from '@memberjunction/ng-export-service';
import {
    OrdersChangeSubscriptionProductOperation,
    OrdersGetRenewalWorklistOperation,
    OrdersSetRenewalSettingsOperation,
    OrdersSpawnRenewalsOperation,
    type RenewalCandidate,
    type RenewalWorklistRow,
} from '@mj-biz-apps/orders-entities';
import { MJOStatTileComponent } from '../../panels/stat-tile.component';
import { MJOStatedValueComponent } from '../../panels/chips.component';
import { MJOMultiSelectComponent } from '../../panels/multi-select.component';
import { MJOWorklistTableComponent, type MJOColumn, type MJOPreset } from '../../panels/worklist-table.component';
import { FormatDate, FormatMoney } from '../../panels/money-format';
import {
    AppliedFacets,
    BuildRenewalsExport,
    CanPlaceRenewal,
    CompareRows,
    CurrentProductsNote,
    EndsNote,
    ExclusionNote,
    FacetOptions,
    MatchesFacets,
    MatchesPreset,
    MatchesSearch,
    NO_FACETS,
    NeedsAttention,
    ProductChangeText,
    PruneCompanies,
    PruneProducts,
    ReadPageState,
    WritePageState,
    ProjectionLines,
    RENEWALS_DATE,
    RENEWAL_WINDOWS,
    RemoveFacet,
    RenewalPriceDisplay,
    RenewalPriceNote,
    RenewalStateChipClass,
    RenewalStateLabel,
    RenewalStateNote,
    SettingsUpdateText,
    SharedIncrease,
    SharedOrderWarnings,
    SubscriptionIncreaseNote,
    SummarizePlacement,
    TermWarning,
    type PlacementSummary,
    type RenewalPlacement,
    type RenewalsAppliedFacet,
    type RenewalsFacetOption,
    type RenewalsFacets,
    type RenewalsPreset,
    type RenewalsSortKey,
} from './renewals-page.model';

/** Terms that ended this recently and were not renewed are listed too, so a missed renewal is seen. */
const LOOKBACK_DAYS = 30;

/**
 * `mjo-renewals-page` — what ends soon, what renews by itself, and what somebody has to place.
 *
 * ONE LIST FOR TWO TEAMS. Accounting reads it for the renewal revenue coming and the price each
 * renewal will carry; the product teams read it for the customers whose coverage is about to end.
 * Both questions start from the same rows — every subscription whose term ends inside the window,
 * soonest first — so the page shows both answers on each row rather than splitting into two screens
 * that drift.
 *
 * WHAT A ROW SAYS. The customer and account, the product, when the term started and ends, whether
 * auto-renew is on, the order that bought the current term and its price, and then the renewal:
 * the renewal order if one exists (number, date, status, price), otherwise the price a renewal
 * would be placed at and the day the nightly pass will place it. The projection is the pass's own
 * pricer, so the figure here is the figure the order will carry.
 *
 * NARROWING. Two dropdowns, Company and Product, each listing only what has a subscription ending
 * in the window, with a count beside each choice. Status, auto-renew and renewal state are NOT
 * dropdowns: the chips over the grid already split the list by what will happen to it, and a
 * second control for the same question is a thing to keep in sync. The tiles and chip counts follow
 * the dropdowns, so "Will end unless renewed: 4" is four for the company you picked.
 *
 * EXPORT. The rows as shown, to Excel or CSV in one click through MJ's export service (the same
 * engine the order form's journal export uses). Every column the grid and the side panel show, in
 * plain words, so a finance reviewer can total and sort without the app.
 *
 * CHANGE PRODUCT. The cutover load put many subscriptions on "(converted pricing)" stand-ins. A
 * subscription is the record of what the customer has NOW, the order and deal of what was sold, so
 * the correction goes on the subscription alone (`Orders.ChangeSubscriptionProduct`): booked lines,
 * journal and deal keep their product, and the next renewal carries the corrected one at the current
 * price plus increase. The product does not enter the renewal group key, so subscriptions bought
 * together still renew on one order.
 *
 * TICK ROWS, SET THEIR SWITCHES. Every row can be ticked, renewable or not. A tick survives a filter
 * change only while its row is still shown, so a bulk button never acts on a row nobody can see. "Auto-renew" turns the
 * switch on or off for the ticked subscriptions and "Update increase %" sets their own rate, both
 * through `Orders.SetRenewalSettings`. Neither touches an order: a renewal already placed keeps its
 * price, and the next one follows the new settings. The side panel shows each subscription's switch
 * and rate, with the same actions for one row. Every date on the page is MM/DD/YYYY (`RENEWALS_DATE`).
 *
 * TICK ROWS, PLACE THEIR RENEWALS. The other action. It previews first through the same operation
 * the nightly job runs (`Orders.SpawnRenewals`, with the ticked subscriptions named), shows what
 * would be placed and what would be skipped, and asks how to leave the orders: as drafts (the
 * default, for a person to review and confirm) or confirmed at once (Bill.com invoicing is its own
 * job). Either way the nightly pass sees the order and will not place a second one. The engine puts
 * one customer's subscriptions ending the same day on ONE renewal order; the dialog says when it
 * combines, and warns when a sibling from the same original order was left out.
 *
 * ## Example
 *
 * ```html
 * <mjo-renewals-page (SubscriptionOpened)="open($event)" (OrderOpened)="openOrder($event)" />
 * ```
 */
@Component({
    selector: 'mjo-renewals-page',
    standalone: true,
    imports: [
        CommonModule,
        MJButtonDirective,
        MJAlertComponent,
        MJDialogComponent,
        MJDialogActionsComponent,
        MJDropdownComponent,
        OverlayModule,
        MJOStatTileComponent,
        MJOStatedValueComponent,
        MJOMultiSelectComponent,
        MJOWorklistTableComponent,
    ],
    template: `
        <div class="mjo-rn__head">
            <label class="mjo-rn__window">
                <span class="small muted">Ending</span>
                <select class="mjo-rn__select" [value]="WindowDays" (change)="OnWindow($any($event.target).value)" aria-label="How far ahead to look">
                    @for (window of Windows; track window.Days) {
                        <option [value]="window.Days">{{ window.Label }}</option>
                    }
                </select>
            </label>
            <mjo-multi-select
                Label="Company"
                Icon="fa-solid fa-building"
                [Options]="CompanyOptions"
                [Selected]="Facets.Companies"
                (SelectedChange)="OnFacet('Company', $event)" />
            <mjo-multi-select
                Label="Product"
                Icon="fa-solid fa-box-open"
                [Options]="ProductOptions"
                [Selected]="Facets.Products"
                (SelectedChange)="OnFacet('Product', $event)" />
            @if (WindowDisplay) {
                <span class="small muted mjo-rn__range">{{ WindowDisplay }} · terms that ended in the last {{ Lookback }} days without renewing are included</span>
            }
            <button
                type="button"
                mjButton
                variant="outline"
                size="sm"
                class="mjo-rn__export"
                cdkOverlayOrigin
                #exportOrigin="cdkOverlayOrigin"
                [disabled]="!Rows.length || Exporting"
                (click)="ExportMenuOpen = !ExportMenuOpen"
                [attr.aria-expanded]="ExportMenuOpen"
                aria-haspopup="menu"
                title="Export the rows shown">
                <i class="fa-solid fa-file-export" aria-hidden="true"></i> {{ Exporting ? 'Exporting…' : 'Export' }}
                <i class="fa-solid fa-chevron-down mjo-rn__caret" aria-hidden="true"></i>
            </button>
            <ng-template
                cdkConnectedOverlay
                [cdkConnectedOverlayOrigin]="exportOrigin"
                [cdkConnectedOverlayOpen]="ExportMenuOpen"
                [cdkConnectedOverlayPositions]="MenuPositions"
                [cdkConnectedOverlayHasBackdrop]="true"
                cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                (backdropClick)="ExportMenuOpen = false"
                (detach)="ExportMenuOpen = false">
                <div class="mjo-rn__menu" role="menu" aria-label="Export">
                    <button type="button" class="mjo-rn__menu-item" role="menuitem" (click)="Export('excel')">
                        <i class="fa-solid fa-file-excel" aria-hidden="true"></i> Excel (.xlsx)
                    </button>
                    <button type="button" class="mjo-rn__menu-item" role="menuitem" (click)="Export('csv')">
                        <i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV
                    </button>
                </div>
            </ng-template>
        </div>

        @if (Applied.length) {
            <div class="mjo-rn__applied" role="group" aria-label="Applied filters">
                <span class="small muted">Filtered by</span>
                @for (chip of Applied; track chip.key) {
                    <span class="mjo-chip mjo-chip--info mjo-rn__facet">
                        <span class="muted">{{ chip.label }}:</span> {{ chip.value }}
                        <button type="button" class="mjo-rn__facet-x" (click)="OnRemoveFacet(chip)" [attr.aria-label]="'Remove ' + chip.label + ' ' + chip.value">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                    </span>
                }
                <button type="button" class="mjo-rn__link" (click)="OnClearFacets()">Clear all</button>
            </div>
        }

        <div class="mj-stat-grid mjo-rn__tiles">
            <mjo-stat-tile
                Label="Ending in window"
                Icon="fa-solid fa-hourglass-half"
                [Value]="String(Scoped.length)"
                [Amount]="EndingAmount"
                Detail="current-term value"
                (Clicked)="OnPreset('all')" />
            <mjo-stat-tile
                Label="Will auto-renew"
                Icon="fa-solid fa-rotate"
                [Value]="String(AutoCount)"
                [Amount]="AutoAmount"
                [Detail]="AutoDetail"
                (Clicked)="OnPreset('auto')" />
            <mjo-stat-tile
                Label="Will end unless renewed"
                Icon="fa-solid fa-hand"
                Tone="alert"
                [Value]="String(ManualCount)"
                [Amount]="ManualAmount"
                Detail="at risk"
                (Clicked)="OnPreset('manual')" />
            <mjo-stat-tile
                Label="Renewal placed"
                Icon="fa-solid fa-file-circle-check"
                [Value]="String(PlacedCount)"
                [Amount]="PlacedAmount"
                Detail="on renewal orders"
                (Clicked)="OnPreset('placed')" />
        </div>

        @if (LoadError) {
            <mj-alert Variant="error" Icon="fa-solid fa-triangle-exclamation" class="mjo-rn__note">
                <strong>The renewals list did not load.</strong>
                {{ LoadError }}
            </mj-alert>
        }
        @if (Notice) {
            <mj-alert [Variant]="Notice.Tone" Icon="fa-solid fa-circle-info" class="mjo-rn__note">
                {{ Notice.Text }}
            </mj-alert>
        }
        @if (PassNotice; as pass) {
            <mj-alert [Variant]="pass.Tone" Icon="fa-solid fa-clock" class="mjo-rn__note">
                <strong>{{ pass.Title }}</strong>
                {{ pass.Text }}
            </mj-alert>
        }
        @if (Truncated) {
            <mj-alert Variant="warning" Icon="fa-solid fa-triangle-exclamation" class="mjo-rn__note">
                <strong>Showing the first {{ MaxRows.toLocaleString() }} subscriptions by end date.</strong>
                Narrow the window to see the rest.
            </mj-alert>
        }

        <div class="mjo-rn__split">
            <div class="mjo-rn__main">
                <div class="row mjo-rn__actions">
                    <button type="button" mjButton variant="primary" [disabled]="!PlaceableSelected.length || Busy" (click)="OpenPlace(PlaceableSelected, SelectedKeys)" title="Create a renewal order for each selected row that can renew">
                        <i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i>
                        {{ Placing ? 'Creating…' : 'Create renewal orders' + (PlaceableSelected.length ? ' (' + PlaceableSelected.length + ')' : '') }}
                    </button>
                    <button type="button" mjButton variant="outline" [disabled]="!SelectedKeys.length || Busy" (click)="OpenIncrease(SelectedKeys)" title="Set the annual renewal increase for the selected subscriptions">
                        <i class="fa-solid fa-percent" aria-hidden="true"></i>
                        {{ Updating ? 'Updating…' : 'Update increase %' + (SelectedKeys.length ? ' (' + SelectedKeys.length + ')' : '') }}
                    </button>
                    <button type="button" mjButton variant="outline" [disabled]="!SelectedKeys.length || Busy" (click)="OpenProduct(SelectedKeys)" title="Correct the product on the selected subscriptions; booked orders and deals are not changed">
                        <i class="fa-solid fa-box-open" aria-hidden="true"></i>
                        {{ 'Change product' + (SelectedKeys.length ? ' (' + SelectedKeys.length + ')' : '') }}
                    </button>
                    <button type="button" mjButton variant="outline" [disabled]="!SelectedKeys.length || Busy" (click)="OpenAutoRenew(SelectedKeys)" title="Turn auto-renew on or off for the selected subscriptions">
                        <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                        {{ 'Toggle auto-renew' + (SelectedKeys.length ? ' (' + SelectedKeys.length + ')' : '') }}
                    </button>
                    @if (SelectedKeys.length) {
                        <button type="button" mjButton variant="outline" size="sm" (click)="SelectedKeys = []">Clear</button>
                        <span class="small muted">{{ SelectionNote }}</span>
                    } @else {
                        <span class="small muted">Select rows to create renewal orders, set the renewal increase, change the product, or set auto-renew.</span>
                    }
                </div>

                <mjo-worklist-table
                    [Columns]="Columns"
                    [Rows]="Rows"
                    [Presets]="Presets"
                    [ActivePreset]="Preset"
                    [Searchable]="true"
                    [Search]="Search"
                    SearchPlaceholder="Customer, account, product, subscription or order…"
                    [SortKey]="SortKey"
                    [SortDescending]="SortDescending"
                    RowKey="SubscriptionID"
                    [SelectedKey]="Selected?.SubscriptionID ?? null"
                    [Selectable]="true"
                    [SelectedKeys]="SelectedKeys"
                    [EmptyTitle]="Applied.length ? 'Nothing matches these filters' : 'Nothing ending in this window'"
                    [EmptyHint]="Applied.length ? 'Clear a company or product filter to widen the list.' : 'No subscription\\'s term ends inside the window, and none ended recently without renewing.'"
                    EmptyIcon="fa-solid fa-rotate"
                    [FootNote]="FootNote"
                    (PresetChanged)="OnPreset($event)"
                    (SearchChanged)="OnSearch($event)"
                    (SortChanged)="OnSort($event)"
                    (SelectionChanged)="SelectedKeys = $event"
                    (RowClicked)="Selected = $event" />
            </div>

            @if (Selected; as row) {
                <aside class="mjo-rn__side">
                    <div class="mj-card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                            <h3>{{ row.SubscriptionNumber }}</h3>
                            <span class="right mjo-rn__head-actions">
                                <span class="mjo-chip" [class]="stateClass(row)">{{ stateLabel(row) }}</span>
                                <button type="button" mjButton variant="outline" size="sm" (click)="OpenSubscription(row)" title="Open the subscription's form">
                                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open
                                </button>
                            </span>
                        </div>
                        <div class="mj-card-pad">
                            <mjo-stated-value Label="Customer">{{ row.ContactName ?? '—' }}</mjo-stated-value>
                            <mjo-stated-value Label="Account">{{ row.AccountName ?? '—' }}</mjo-stated-value>
                            <mjo-stated-value Label="Company">{{ row.CompanyName || '—' }}</mjo-stated-value>
                            <mjo-stated-value Label="Product">
                                {{ row.ProductName }} <span class="small muted">· {{ row.SubscriptionTypeName }}</span>
                                @if (!row.ProviderBilled) {
                                    <button type="button" mjButton variant="outline" size="sm" class="mjo-rn__inline-edit" [disabled]="Busy" (click)="OpenProduct([row.SubscriptionID])" title="Correct this subscription's product">
                                        <i class="fa-solid fa-pen" aria-hidden="true"></i> Edit
                                    </button>
                                }
                            </mjo-stated-value>
                            <mjo-stated-value Label="Current term">
                                Term {{ row.TermNumber }} · {{ date(row.TermStartDate) }} → {{ date(row.TermEndDate) }}
                                <span class="small muted">· {{ endsNote(row) }}</span>
                                @if (termWarning(row); as warning) {
                                    <span class="mjo-chip mjo-chip--warning">{{ warning }}</span>
                                }
                            </mjo-stated-value>
                            <mjo-stated-value Label="Subscribed since">{{ date(row.StartDate) }}</mjo-stated-value>
                            <mjo-stated-value Label="Auto-renew">
                                {{ row.AutoRenew ? 'On' : 'Off' }}
                                @if (row.AutoRenewOn) {
                                    <span class="small muted">· renews on {{ date(row.AutoRenewOn) }} ({{ row.LeadDays }}-day lead)</span>
                                } @else if (!row.AutoRenew && !row.RenewalOrderID && !row.ProviderBilled) {
                                    <span class="small muted">· ends unless renewed by hand</span>
                                }
                                @if (!row.ProviderBilled) {
                                    <button type="button" mjButton variant="outline" size="sm" class="mjo-rn__inline-edit" [disabled]="Busy" (click)="OpenAutoRenew([row.SubscriptionID])" title="Turn auto-renew on or off for this subscription">
                                        <i class="fa-solid fa-pen" aria-hidden="true"></i> Edit
                                    </button>
                                }
                            </mjo-stated-value>
                            <mjo-stated-value Label="Renewal increase">
                                {{ increaseNote(row) }}
                                <button type="button" mjButton variant="outline" size="sm" class="mjo-rn__inline-edit" [disabled]="Busy" (click)="OpenIncrease([row.SubscriptionID])" title="Set this subscription's annual increase">
                                    <i class="fa-solid fa-pen" aria-hidden="true"></i> Edit
                                </button>
                            </mjo-stated-value>
                        </div>
                    </div>

                    <div class="mj-card mjo-rn__card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
                            <h3>Current order</h3>
                            @if (row.CurrentOrderID) {
                                <button class="right" type="button" mjButton variant="outline" size="sm" (click)="OpenOrder(row.CurrentOrderID)">
                                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> {{ row.CurrentOrderNumber }}
                                </button>
                            }
                        </div>
                        <div class="mj-card-pad">
                            @if (row.CurrentOrderID) {
                                <mjo-stated-value Label="Placed">{{ date(row.CurrentOrderDate) }} <span class="mjo-chip mjo-chip--outline">{{ row.CurrentOrderStatus }}</span></mjo-stated-value>
                                <mjo-stated-value Label="Price">
                                    {{ money(row.CurrentUnitPrice) }}
                                    @if (row.CurrentQuantity && row.CurrentQuantity !== 1) { <span class="small muted">× {{ row.CurrentQuantity }} = {{ money(row.CurrentLineTotal) }}</span> }
                                </mjo-stated-value>
                                @if (row.CurrentOrderBalance) {
                                    <mjo-stated-value Label="Still owed">{{ money(row.CurrentOrderBalance) }}</mjo-stated-value>
                                }
                            } @else {
                                <div class="small muted">The order line that bought this term no longer exists.</div>
                            }
                        </div>
                    </div>

                    <div class="mj-card mjo-rn__card">
                        <div class="mj-card-head">
                            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                            <h3>Renewal</h3>
                            @if (row.RenewalOrderID) {
                                <button class="right" type="button" mjButton variant="outline" size="sm" (click)="OpenOrder(row.RenewalOrderID)">
                                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> {{ row.RenewalOrderNumber }}
                                </button>
                            }
                        </div>
                        <div class="mj-card-pad">
                            @if (row.RenewalOrderID) {
                                <mjo-stated-value Label="Placed">{{ date(row.RenewalOrderDate) }} <span class="mjo-chip mjo-chip--outline">{{ row.RenewalOrderStatus }}</span></mjo-stated-value>
                                <mjo-stated-value Label="Price">
                                    {{ money(row.RenewalUnitPrice) }}
                                    @if (row.RenewalQuantity && row.RenewalQuantity !== 1) { <span class="small muted">× {{ row.RenewalQuantity }} = {{ money(row.RenewalLineTotal) }}</span> }
                                </mjo-stated-value>
                                @if (row.RenewalBooked) {
                                    <mjo-stated-value Label="New term">{{ date(row.RenewalTermStart) }} → {{ date(row.RenewalTermEnd) }}</mjo-stated-value>
                                } @else {
                                    <p class="mjo-note mjo-rn__note">
                                        <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>
                                        A draft. Confirming it books the new term; until then the nightly pass leaves this subscription alone.
                                    </p>
                                }
                            } @else if (row.ProviderBilled) {
                                <div class="small muted">A payment gateway bills this subscription and renews it itself. Orders places no renewal order.</div>
                            } @else if (projectionLines(row); as lines) {
                                @if (row.ProjectedUnitPrice != null) {
                                    <mjo-stated-value Label="Projected price">
                                        {{ money(row.ProjectedUnitPrice) }}
                                        @if (row.ProjectedQuantity && row.ProjectedQuantity !== 1) { <span class="small muted">× {{ row.ProjectedQuantity }} = {{ money(row.ProjectedLineTotal) }}</span> }
                                    </mjo-stated-value>
                                }
                                @for (line of lines; track line.Label) {
                                    <mjo-stated-value [Label]="line.Label">{{ line.Text }}</mjo-stated-value>
                                }
                                @if (CanPlace(row)) {
                                    <button type="button" mjButton variant="outline" size="sm" [disabled]="Busy" (click)="OpenPlace([row.SubscriptionID])">
                                        <i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i> Create renewal order
                                    </button>
                                }
                            } @else {
                                <div class="small muted">{{ stateNote(row) ?? 'Nothing will renew this subscription.' }}</div>
                            }
                        </div>
                    </div>
                </aside>
            }
        </div>

        <mj-dialog [Visible]="IncreaseOpen" Title="Renewal increase" Size="sm" (Close)="IncreaseOpen = false">
            <p class="mjo-rn__dialog-lede">
                {{ IncreaseTargets.length === 1 ? '1 subscription' : IncreaseTargets.length + ' subscriptions' }} selected. Applies to future renewals; existing orders are not affected.
            </p>
            <label class="mjo-rn__field">
                <span class="small muted">Annual increase</span>
                <span class="mjo-rn__pct">
                    <input
                        type="number"
                        class="mjo-rn__select"
                        min="0"
                        max="100"
                        step="0.01"
                        inputmode="decimal"
                        [value]="IncreaseValue ?? ''"
                        [disabled]="IncreaseClear"
                        (input)="OnIncreaseInput($any($event.target).value)"
                        placeholder="e.g. 5"
                        aria-label="Increase in percent" />
                    <span class="muted">%</span>
                </span>
            </label>
            <label class="mjo-rn__check small">
                <input type="checkbox" [checked]="IncreaseClear" (change)="IncreaseClear = $any($event.target).checked" />
                No subscription-level rate (use the product, category or company default)
            </label>
            @if (IncreaseError) {
                <p class="small mjo-rn__error">{{ IncreaseError }}</p>
            }
            <mj-dialog-actions>
                <button type="button" mjButton variant="outline" (click)="IncreaseOpen = false">Cancel</button>
                <button type="button" mjButton variant="primary" [disabled]="Busy || (!IncreaseClear && IncreaseValue == null)" (click)="ApplyIncrease()">
                    {{ Updating ? 'Saving…' : 'Save' }}
                </button>
            </mj-dialog-actions>
        </mj-dialog>

        <mj-dialog [Visible]="PlaceOpen" Title="Create renewal orders" Size="sm" (Close)="PlaceOpen = false">
            @if (PlaceSummary; as summary) {
                <dl class="mjo-rn__facts">
                    <dt>Selected</dt>
                    <dd>{{ PlaceTargets.length + PlaceExcludedCount }} subscription{{ PlaceTargets.length + PlaceExcludedCount === 1 ? '' : 's' }}</dd>
                    <dt>To renew</dt>
                    <dd>
                        @if (summary.Placeable.length) {
                            {{ summary.Placeable.length }} subscription{{ summary.Placeable.length === 1 ? '' : 's' }} on {{ summary.Orders }} renewal order{{ summary.Orders === 1 ? '' : 's' }}
                            @if (summary.Orders < summary.Placeable.length) {
                                <span class="small muted">· same customer, same end date, one order</span>
                            }
                        } @else {
                            none
                        }
                    </dd>
                    @if (summary.Placeable.length) {
                        <dt>Total</dt>
                        <dd>{{ money(summary.Total) }} <span class="small muted">before tax</span></dd>
                    }
                    @if (PlaceExcluded) {
                        <dt>Excluded</dt>
                        <dd>{{ PlaceExcluded }}</dd>
                    }
                    @if (summary.Detail) {
                        <dt>Skipped</dt>
                        <dd>{{ summary.Detail }}</dd>
                    }
                </dl>
                @if (summary.Placeable.length) {
                    <div class="mjo-rn__field">
                        <span class="mjo-rn__field-label">Create as</span>
                        <label class="mjo-rn__check">
                            <input type="radio" name="mjo-rn-placeas" [checked]="PlaceAs === 'Draft'" [disabled]="Placing" (change)="OnPlaceAs('Draft')" />
                            <span><strong>Draft</strong> <span class="muted">· review and confirm each order before it is invoiced</span></span>
                        </label>
                        <label class="mjo-rn__check">
                            <input type="radio" name="mjo-rn-placeas" [checked]="PlaceAs === 'Confirmed'" [disabled]="Placing" (change)="OnPlaceAs('Confirmed')" />
                            <span><strong>Confirmed</strong> <span class="muted">· booked now</span></span>
                        </label>
                    </div>
                }
                @for (warning of PlaceWarnings; track warning) {
                    <p class="mjo-note mjo-rn__dialog-warning">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                        {{ warning }}
                    </p>
                }
            } @else {
                <p class="mjo-rn__dialog-lede small muted">Checking what can be renewed…</p>
            }
            @if (PlaceError) {
                <p class="small mjo-rn__error">{{ PlaceError }}</p>
            }
            <mj-dialog-actions>
                <button type="button" mjButton variant="outline" (click)="PlaceOpen = false">Cancel</button>
                <button type="button" mjButton variant="primary" [disabled]="Busy || !PlaceSummary?.Placeable?.length" (click)="ApplyPlace()">
                    {{ Placing ? 'Creating…' : PlaceAs === 'Confirmed' ? 'Create and confirm' : 'Create drafts' }}
                </button>
            </mj-dialog-actions>
        </mj-dialog>

        <mj-dialog [Visible]="ProductOpen" Title="Change product" Size="sm" (Close)="ProductOpen = false">
            <dl class="mjo-rn__facts">
                <dt>Subscriptions</dt>
                <dd>{{ ProductTargets.length }}</dd>
                <dt>Current product</dt>
                <dd>{{ ProductCurrentNote }}</dd>
                <dt>Company</dt>
                <dd>{{ ProductCompanyNote }}</dd>
            </dl>
            <div class="mjo-rn__field">
                <label class="mjo-rn__field-label" for="mjo-rn-product">New product</label>
                @if (ProductChoicesLoading) {
                    <span class="small muted">Loading products…</span>
                } @else if (!ProductChoices.length) {
                    <span class="small muted">No active subscription products for this company.</span>
                } @else {
                    <mj-dropdown
                        id="mjo-rn-product"
                        [Data]="ProductChoices"
                        TextField="Label"
                        ValueField="ID"
                        [ValuePrimitive]="true"
                        [Filterable]="true"
                        Placeholder="Select a product"
                        (ValueChange)="OnProductChoice($event)" />
                    <span class="small muted mjo-rn__field-help">Active subscription products sold by the same company.</span>
                }
            </div>
            <label class="mjo-rn__check">
                <input type="checkbox" [checked]="ProductAdoptType" (change)="ProductAdoptType = $any($event.target).checked" />
                <span>Move to the new product's subscription type if it differs <span class="muted">(changes term length, billing cadence and lead time)</span></span>
            </label>
            <p class="small muted mjo-rn__dialog-foot">
                Only the subscription changes. Existing orders and deals are not affected. Future renewals use the new product at the current price plus the annual increase.
            </p>
            @if (ProductError) {
                <p class="small mjo-rn__error">{{ ProductError }}</p>
            }
            <mj-dialog-actions>
                <button type="button" mjButton variant="outline" (click)="ProductOpen = false">Cancel</button>
                <button type="button" mjButton variant="primary" [disabled]="Busy || !ProductChoice" (click)="ApplyProduct()">
                    {{ Updating ? 'Saving…' : 'Save' }}
                </button>
            </mj-dialog-actions>
        </mj-dialog>

        <mj-dialog [Visible]="AutoRenewOpen" Title="Auto-renew" Size="sm" (Close)="AutoRenewOpen = false">
            <p class="mjo-rn__dialog-lede">
                {{ AutoRenewTargets.length === 1 ? '1 subscription' : AutoRenewTargets.length + ' subscriptions' }} selected. Existing orders are not affected.
            </p>
            <label class="mjo-rn__check">
                <input type="radio" name="mjo-rn-autorenew" [checked]="AutoRenewValue === true" (change)="AutoRenewValue = true" />
                <span><strong>On</strong> <span class="muted">· renews automatically at the end of each term</span></span>
            </label>
            <label class="mjo-rn__check">
                <input type="radio" name="mjo-rn-autorenew" [checked]="AutoRenewValue === false" (change)="AutoRenewValue = false" />
                <span><strong>Off</strong> <span class="muted">· expires at the end of the term unless renewed manually</span></span>
            </label>
            <p class="small muted mjo-rn__dialog-foot">Subscriptions billed by a payment gateway are managed by the gateway and will be skipped.</p>
            @if (AutoRenewError) {
                <p class="small mjo-rn__error">{{ AutoRenewError }}</p>
            }
            <mj-dialog-actions>
                <button type="button" mjButton variant="outline" (click)="AutoRenewOpen = false">Cancel</button>
                <button type="button" mjButton variant="primary" [disabled]="Busy || AutoRenewValue == null" (click)="ApplyAutoRenew()">
                    {{ Updating ? 'Saving…' : 'Save' }}
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
            .mjo-rn__head {
                display: flex;
                align-items: center;
                gap: var(--mj-space-3);
                flex-wrap: wrap;
                margin-bottom: var(--mj-space-4);
            }
            .mjo-rn__window {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2);
            }
            .mjo-rn__select {
                font: inherit;
                padding: 4px 8px;
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                background: var(--mj-bg-surface);
                color: inherit;
            }
            .mjo-rn__range { flex-basis: 100%; }
            .mjo-rn__export { margin-left: auto; }
            .mjo-rn__caret { font-size: 10px; margin-left: 2px; }
            .mjo-rn__menu {
                min-width: 180px;
                background: var(--mj-bg-surface);
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                box-shadow: var(--mj-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
                padding: var(--mj-space-1, 4px);
            }
            .mjo-rn__menu-item {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                width: 100%;
                font: inherit;
                font-size: 13px;
                text-align: left;
                padding: 8px 10px;
                border: none;
                border-radius: var(--mj-radius-sm, 4px);
                background: none;
                color: inherit;
                cursor: pointer;
            }
            .mjo-rn__menu-item:hover { background: var(--mj-bg-surface-sunken); }
            .mjo-rn__menu-item i { color: var(--mj-text-muted); width: 16px; }
            .mjo-rn__applied {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                flex-wrap: wrap;
                margin-bottom: var(--mj-space-3);
            }
            .mjo-rn__facet { display: inline-flex; align-items: center; gap: 4px; }
            .mjo-rn__facet-x {
                font: inherit;
                border: none;
                background: none;
                color: inherit;
                cursor: pointer;
                padding: 0 0 0 2px;
                line-height: 1;
                opacity: 0.7;
            }
            .mjo-rn__facet-x:hover { opacity: 1; }
            .mjo-rn__link {
                font: inherit;
                font-size: 12px;
                border: none;
                background: none;
                color: var(--mj-brand-primary);
                cursor: pointer;
                padding: 0;
            }
            .mjo-rn__tiles { margin-bottom: var(--mj-space-4); }
            .mjo-rn__inline-edit { margin-left: var(--mj-space-2); }
            .mjo-rn__dialog-lede { margin: 0 0 var(--mj-space-4); }
            .mjo-rn__field { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--mj-space-3); }
            .mjo-rn__pct { display: inline-flex; align-items: center; gap: var(--mj-space-2); }
            .mjo-rn__pct input { width: 120px; }
            .mjo-rn__check { display: flex; align-items: flex-start; gap: var(--mj-space-2); margin-bottom: var(--mj-space-2); }
            .mjo-rn__dialog-foot { margin: var(--mj-space-3) 0 0; }
            .mjo-rn__facts {
                display: grid;
                grid-template-columns: max-content 1fr;
                column-gap: var(--mj-space-4);
                row-gap: 6px;
                margin: 0 0 var(--mj-space-4);
                padding: var(--mj-space-3);
                background: var(--mj-bg-surface-sunken);
                border-radius: var(--mj-radius-md);
                font-size: 13px;
            }
            .mjo-rn__facts dt { color: var(--mj-text-muted); }
            .mjo-rn__facts dd { margin: 0; font-weight: var(--mj-font-medium); min-width: 0; }
            .mjo-rn__field .mjo-rn__check { margin-top: var(--mj-space-2); }
            .mjo-rn__field-label { font-size: 12px; font-weight: var(--mj-font-medium); color: var(--mj-text-secondary); }
            .mjo-rn__field-help { margin-top: 4px; }
            .mjo-rn__dialog-warning { margin: var(--mj-space-3) 0 0; }
            .mjo-rn__error { color: var(--mj-status-error-text, #b42318); margin: var(--mj-space-2) 0 0; }
            .mjo-rn__note { margin-bottom: var(--mj-space-4); }
            .mjo-rn__actions {
                align-items: center;
                gap: var(--mj-space-3);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-rn__split { display: flex; gap: var(--mj-space-4); align-items: flex-start; }
            .mjo-rn__main { flex: 1; min-width: 0; }
            .mjo-rn__side { flex: 0 0 360px; min-width: 0; }
            .mjo-rn__head-actions { display: inline-flex; align-items: center; gap: var(--mj-space-2); }
            .mjo-rn__card { margin-top: var(--mj-space-4); }
            .mjo-rn__card .mjo-note { margin-top: var(--mj-space-3); margin-bottom: 0; }

            @media (max-width: 1100px) {
                .mjo-rn__split { flex-direction: column; }
                .mjo-rn__main, .mjo-rn__side { flex: 1 1 auto; width: 100%; }
            }
            @media (max-width: 760px) {
                :host { padding: var(--mj-space-4); }
            }
        `,
    ],
})
export class MJORenewalsPageComponent implements OnInit {
    /** Same NG0100 reasoning as every other imperatively-created page here: write the DOM after a load. */
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly exporter = inject(ExportService);

    @Output() SubscriptionOpened = new EventEmitter<{ ID: string }>();
    @Output() OrderOpened = new EventEmitter<{ ID: string }>();

    public readonly String = String;
    public readonly Windows = RENEWAL_WINDOWS;
    public readonly Lookback = LOOKBACK_DAYS;
    /** Rows asked for per load. The whole book ends inside twelve months (811 in prod today), so this is a ceiling, not a page. */
    public readonly MaxRows = 2000;
    public WindowDays = RENEWAL_WINDOWS[0].Days;

    public LoadError: string | null = null;
    public Notice: { Tone: 'success' | 'error' | 'warning'; Text: string } | null = null;
    public Truncated = false;
    public Placing = false;
    public Updating = false;
    /** The create-renewals dialog. */
    public PlaceOpen = false;
    public PlaceTargets: string[] = [];
    public PlaceSummary: PlacementSummary | null = null;
    public PlaceWarnings: string[] = [];
    public PlaceExcluded: string | null = null;
    public PlaceExcludedCount = 0;
    public PlaceAs: RenewalPlacement = 'Draft';
    public PlaceError: string | null = null;
    /** The increase dialog. `IncreaseValue` null with `IncreaseClear` off means nothing typed yet. */
    public IncreaseOpen = false;
    public IncreaseTargets: string[] = [];
    public IncreaseValue: number | null = null;
    public IncreaseClear = false;
    public IncreaseError: string | null = null;
    /** The change-product dialog. Options load once, on first open. */
    public ProductOpen = false;
    public ProductTargets: string[] = [];
    public ProductCurrentNote = '';
    public ProductCompanyNote = '';
    /** Every Active subscription product, with its company, loaded once; `ProductChoices` is the slice for the chosen rows' company. */
    private productCatalog: Array<{ ID: string; Name: string; CompanyID: string; Company: string }> = [];
    public ProductChoice: string | null = null;
    public ProductAdoptType = false;
    public ProductError: string | null = null;
    public ProductChoices: Array<{ ID: string; Label: string }> = [];
    public ProductChoicesLoading = false;
    /** The auto-renew dialog. */
    public AutoRenewOpen = false;
    public AutoRenewTargets: string[] = [];
    public AutoRenewValue: boolean | null = null;
    public AutoRenewError: string | null = null;
    /** Every row in the window, as loaded. */
    public AllRows: RenewalWorklistRow[] = [];
    /** The rows the Company and Product facets leave. Tiles and chip counts read this. */
    public Scoped: RenewalWorklistRow[] = [];
    /** What the table shows: scoped, then preset and search, then sorted. */
    public Rows: RenewalWorklistRow[] = [];
    public Facets: RenewalsFacets = NO_FACETS;
    public CompanyOptions: RenewalsFacetOption[] = [];
    public ProductOptions: RenewalsFacetOption[] = [];
    /** A FIELD, like Presets: the chip row would see a fresh array every pass from a getter. */
    public Applied: RenewalsAppliedFacet[] = [];
    public Exporting = false;
    public ExportMenuOpen = false;
    public readonly MenuPositions: ConnectedPosition[] = [
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
    ];
    public Selected: RenewalWorklistRow | null = null;
    /** Ticked subscription IDs. Survives a preset or search change; cleared after a placement. */
    public SelectedKeys: string[] = [];
    public Preset: RenewalsPreset = 'all';
    public Search = '';
    public SortKey: RenewalsSortKey = 'TermEndDate';
    public SortDescending = false;
    public AsOf = '';
    public WindowStart = '';
    public WindowEnd = '';
    public PassMode: 'Live' | 'Preview' | 'Off' | 'Unknown' = 'Unknown';
    public PassNextRunAt: string | null = null;

    /** An arrow so the template can call it without `this`. */
    public readonly CanPlace = (row: RenewalWorklistRow): boolean => CanPlaceRenewal(row);

    public get Busy(): boolean {
        return this.Placing || this.Updating;
    }

    /** The ticked rows a renewal order can be placed for. Any row can be ticked; only these renew. */
    public get PlaceableSelected(): string[] {
        return this.AllRows.filter((r) => this.SelectedKeys.includes(r.SubscriptionID) && CanPlaceRenewal(r)).map((r) => r.SubscriptionID);
    }

    public readonly Columns: MJOColumn<RenewalWorklistRow>[] = [
        { Key: 'ContactName', Label: 'Customer', Sortable: true, Format: (r) => r.ContactName ?? r.AccountName ?? '—', Secondary: (r) => (r.ContactName && r.AccountName ? r.AccountName : null) },
        { Key: 'CompanyName', Label: 'Company', HideBelow: 1000, Sortable: true },
        { Key: 'ProductName', Label: 'Product', Sortable: true, Secondary: (r) => `${r.SubscriptionNumber} · ${r.SubscriptionTypeName}` },
        { Key: 'StartDate', Label: 'Start', Kind: 'date', Width: '112px', HideBelow: 1000, Sortable: true, Format: (r) => FormatDate(r.StartDate, RENEWALS_DATE), Secondary: (r) => `term ${r.TermNumber}` },
        { Key: 'TermEndDate', Label: 'Ends', Kind: 'date', Width: '112px', Sortable: true, Format: (r) => FormatDate(r.TermEndDate, RENEWALS_DATE), Secondary: (r) => [EndsNote(r.DaysUntilEnd), TermWarning(r)].filter(Boolean).join(' · ') },
        { Key: 'Status', Label: 'Status', Kind: 'chip', Width: '90px', HideBelow: 760, Sortable: true, ChipClass: (r) => (r.Status === 'Active' ? 'mjo-chip--success' : r.Status === 'Trialing' ? 'mjo-chip--info' : 'mjo-chip--outline') },
        { Key: 'AutoRenew', Label: 'Auto-renew', Kind: 'chip', Width: '96px', Sortable: true, Format: (r) => (r.AutoRenew ? 'On' : 'Off'), ChipClass: (r) => (r.AutoRenew ? 'mjo-chip--success' : 'mjo-chip--outline') },
        { Key: 'State', Label: 'Renewal', Kind: 'chip', Width: '140px', Sortable: true, Format: (r) => RenewalStateLabel(r.State), ChipClass: (r) => RenewalStateChipClass(r.State), Secondary: (r) => RenewalStateNote(r) },
        { Key: 'CurrentOrderNumber', Label: 'Current order', Kind: 'mono', Width: '140px', HideBelow: 760, Sortable: true, Format: (r) => r.CurrentOrderNumber ?? '—', Secondary: (r) => (r.CurrentOrderDate ? `${FormatDate(r.CurrentOrderDate, RENEWALS_DATE)} · ${r.CurrentOrderStatus}` : null) },
        { Key: 'CurrentUnitPrice', Label: 'Current price', Kind: 'money', Width: '110px', Sortable: true, Format: (r) => (r.CurrentUnitPrice == null ? '—' : FormatMoney(r.CurrentUnitPrice)), Secondary: (r) => (r.CurrentQuantity && r.CurrentQuantity !== 1 ? `× ${r.CurrentQuantity}` : null) },
        { Key: 'RenewalOrderNumber', Label: 'Renewal order', Kind: 'mono', Width: '140px', HideBelow: 760, Sortable: true, Format: (r) => r.RenewalOrderNumber ?? '—', Secondary: (r) => (r.RenewalOrderDate ? `${FormatDate(r.RenewalOrderDate, RENEWALS_DATE)} · ${r.RenewalOrderStatus}` : null) },
        { Key: 'RenewalPrice', Label: 'Renewal price', Kind: 'money', Width: '120px', Sortable: true, Format: (r) => RenewalPriceDisplay(r), Secondary: (r) => RenewalPriceNote(r) },
    ];

    /** A FIELD, rebuilt when the rows change — a getter would be a fresh array on every pass (NG0100). */
    public Presets: MJOPreset[] = [];

    public async ngOnInit(): Promise<void> {
        // The Explorer's refresh re-creates the page, so what a person set comes back from storage:
        // the window, the company and product picks, and the quick filter. Picks no longer in the
        // window are dropped once the rows are in.
        const saved = ReadPageState(globalThis.localStorage);
        if (saved) {
            this.WindowDays = saved.WindowDays;
            this.Facets = { Companies: saved.Companies, Products: saved.Products };
            this.Preset = saved.Preset;
        }
        await this.load();
        this.cdr.detectChanges();
    }

    private remember(): void {
        WritePageState(globalThis.localStorage, { WindowDays: this.WindowDays, Companies: this.Facets.Companies, Products: this.Facets.Products, Preset: this.Preset });
    }

    /* ── Tiles ──────────────────────────────────────────────────────────── */

    public get AutoCount(): number {
        return this.Scoped.filter((r) => MatchesPreset(r, 'auto')).length;
    }
    public get ManualCount(): number {
        return this.Scoped.filter((r) => MatchesPreset(r, 'manual')).length;
    }
    public get PlacedCount(): number {
        return this.Scoped.filter((r) => MatchesPreset(r, 'placed')).length;
    }
    public get EndingAmount(): string {
        return FormatMoney(this.Scoped.reduce((s, r) => s + (r.CurrentLineTotal ?? 0), 0), { Round: true });
    }
    public get AutoAmount(): string {
        return FormatMoney(this.Scoped.filter((r) => MatchesPreset(r, 'auto')).reduce((s, r) => s + (r.ProjectedLineTotal ?? 0), 0), { Round: true });
    }
    public get AutoDetail(): string {
        const unpriced = this.Scoped.filter((r) => MatchesPreset(r, 'auto') && r.ProjectedLineTotal == null).length;
        return unpriced ? `projected · ${unpriced} unpriced` : 'projected';
    }
    public get ManualAmount(): string {
        return FormatMoney(this.Scoped.filter((r) => MatchesPreset(r, 'manual')).reduce((s, r) => s + (r.CurrentLineTotal ?? 0), 0), { Round: true });
    }
    public get PlacedAmount(): string {
        return FormatMoney(this.Scoped.filter((r) => MatchesPreset(r, 'placed')).reduce((s, r) => s + (r.RenewalLineTotal ?? 0), 0), { Round: true });
    }
    /** A banner when the nightly job will NOT place what the list calls due: preview mode, or off. */
    public get PassNotice(): { Tone: 'warning' | 'info'; Title: string; Text: string } | null {
        if (this.PassMode !== 'Preview' && this.PassMode !== 'Off') return null;
        const due = this.AllRows.filter((r) => r.State === 'DueNow').length;
        const text = due
            ? `${due} subscription${due === 1 ? ' is' : 's are'} due for renewal now and require${due === 1 ? 's' : ''} manual processing.`
            : 'No subscriptions are due for renewal right now.';
        return {
            Tone: 'warning',
            Title: this.PassMode === 'Preview' ? 'Automatic renewals are disabled (nightly job in preview mode).' : 'Automatic renewals are disabled.',
            Text: text,
        };
    }

    public get WindowDisplay(): string {
        return this.AsOf ? `${FormatDate(this.AsOf, RENEWALS_DATE)} – ${FormatDate(this.WindowEnd, RENEWALS_DATE)}` : '';
    }
    public get SelectionNote(): string {
        const rows = this.AllRows.filter((r) => this.SelectedKeys.includes(r.SubscriptionID));
        const placeable = rows.filter(CanPlaceRenewal);
        const auto = placeable.filter((r) => r.AutoRenew).length;
        const manual = placeable.length - auto;
        const parts: string[] = [`${rows.length} ticked`];
        if (auto) parts.push(`${auto} to confirm and invoice`);
        if (manual) parts.push(`${manual} to draft`);
        if (rows.length - placeable.length) parts.push(`${rows.length - placeable.length} cannot renew from here`);
        return parts.join(' · ');
    }
    public get FootNote(): string | null {
        return this.AllRows.length
            ? 'Projected prices come from the renewal pricer: the current term’s undiscounted price or a successor’s list price, plus the annual increase where the new term crosses an anniversary. Before tax and promotions.'
            : null;
    }

    /* ── Filters ────────────────────────────────────────────────────────── */

    public OnPreset(preset: string): void {
        this.Preset = preset as RenewalsPreset;
        this.applyFilters();
        this.remember();
    }

    public OnSearch(text: string): void {
        this.Search = text;
        this.applyFilters();
    }

    // A filter change keeps the ticks on rows still in scope and drops the rest: a row ticked and
    // then hidden would be acted on by a bulk button with nobody able to see it to untick it.
    // Widening a filter hides nothing, so it unticks nothing. (`applyFilters` does the pruning.)
    public OnFacet(key: 'Company' | 'Product', ids: string[]): void {
        this.Facets = key === 'Company' ? { ...this.Facets, Companies: ids } : { ...this.Facets, Products: ids };
        this.applyFilters();
        this.remember();
    }

    public OnRemoveFacet(chip: RenewalsAppliedFacet): void {
        this.Facets = RemoveFacet(this.Facets, chip.key);
        this.applyFilters();
        this.remember();
    }

    public OnClearFacets(): void {
        this.Facets = NO_FACETS;
        this.applyFilters();
        this.remember();
    }

    /* ── Export ─────────────────────────────────────────────────────────── */

    /** The rows as shown, downloaded as Excel or CSV. One click; the file is named for the window and any single filter. */
    public async Export(format: 'excel' | 'csv'): Promise<void> {
        this.ExportMenuOpen = false;
        if (!this.Rows.length || this.Exporting) return;
        const result = BuildRenewalsExport(this.Rows);
        const scope = [
            this.Facets.Companies.length === 1 ? this.CompanyOptions.find((o) => o.Value === this.Facets.Companies[0])?.Text : null,
            this.Facets.Products.length === 1 ? this.ProductOptions.find((o) => o.Value === this.Facets.Products[0])?.Text : null,
        ]
            .filter((v): v is string => !!v)
            .map((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
            .join('-');
        const fileName = `renewals-next-${this.WindowDays}d${this.AsOf ? `-as-of-${this.AsOf}` : ''}${scope ? `-${scope}` : ''}`;
        this.Exporting = true;
        this.cdr.detectChanges();
        try {
            // The lower-case name: it is the one every ng-export-service since 6.1 exposes (6.2 adds a capitalised alias).
            const outcome = await this.exporter.exportAndDownload(result.Rows, { format, fileName, columns: result.Columns, includeHeaders: true });
            if (!outcome.success) {
                this.Notice = { Tone: 'error', Text: `The export failed: ${outcome.error ?? 'unknown error'}` };
            }
        } catch (err) {
            this.Notice = { Tone: 'error', Text: `The export failed: ${err instanceof Error ? err.message : String(err)}` };
        } finally {
            this.Exporting = false;
            this.cdr.detectChanges();
        }
    }

    public OnSort(key: string): void {
        if (this.SortKey === key) this.SortDescending = !this.SortDescending;
        else {
            this.SortKey = key as RenewalsSortKey;
            this.SortDescending = false;
        }
        this.applyFilters();
    }

    public async OnWindow(value: string): Promise<void> {
        const days = Number(value);
        if (!Number.isFinite(days) || days === this.WindowDays) return;
        this.WindowDays = days;
        this.remember();
        await this.load();
        this.cdr.detectChanges();
    }

    /* ── Actions ────────────────────────────────────────────────────────── */

    public OpenSubscription(row: RenewalWorklistRow): void {
        this.SubscriptionOpened.emit({ ID: row.SubscriptionID });
    }

    public OpenOrder(orderID: string | null | undefined): void {
        if (orderID) this.OrderOpened.emit({ ID: orderID });
    }

    /* ── Create renewal orders ──────────────────────────────────────────── */

    /**
     * Open the dialog for these subscriptions: preview through the same operation the nightly job
     * runs, so what the dialog describes is what the live call will do, then let the person choose
     * drafts (the default) or confirmed orders.
     */
    public async OpenPlace(subscriptionIDs: ReadonlyArray<string>, ticked: ReadonlyArray<string> = subscriptionIDs): Promise<void> {
        if (!subscriptionIDs.length || this.Busy) return;
        this.PlaceTargets = [...subscriptionIDs];
        // Ticked but not placeable: said up front, so the count in the dialog never surprises.
        const excluded = this.AllRows.filter((r) => ticked.includes(r.SubscriptionID) && !subscriptionIDs.includes(r.SubscriptionID));
        this.PlaceExcludedCount = excluded.length;
        this.PlaceExcluded = ExclusionNote(excluded);
        this.PlaceSummary = null;
        this.PlaceAs = 'Draft';
        this.PlaceError = null;
        const chosen = this.AllRows.filter((r) => subscriptionIDs.includes(r.SubscriptionID));
        this.PlaceWarnings = SharedOrderWarnings(chosen, this.AllRows);
        this.PlaceOpen = true;
        await this.previewPlacement();
        this.cdr.detectChanges();
    }

    /** The radio changes the placement, and the placement is part of the renewal group key, so the preview runs again. */
    public async OnPlaceAs(placeAs: RenewalPlacement): Promise<void> {
        if (this.PlaceAs === placeAs || this.Busy) return;
        this.PlaceAs = placeAs;
        await this.previewPlacement();
        this.cdr.detectChanges();
    }

    /**
     * Preview with the SAME input the live call will send, placement included: what the dialog says
     * (how many orders, the total, what is skipped) is then what Create will do.
     */
    private async previewPlacement(): Promise<void> {
        this.Placing = true;
        this.PlaceSummary = null;
        this.PlaceError = null;
        this.cdr.detectChanges();
        try {
            const preview = await new OrdersSpawnRenewalsOperation().Execute({ SubscriptionIDs: this.PlaceTargets, PlaceAs: this.PlaceAs, Preview: true });
            if (!preview.Success || !preview.Output?.Success) {
                this.PlaceError = preview.Output?.Message?.trim() || preview.ErrorMessage?.trim() || 'The renewals could not be previewed.';
                this.PlaceSummary = SummarizePlacement([], this.PlaceAs);
                return;
            }
            this.PlaceSummary = SummarizePlacement(preview.Output.Candidates, this.PlaceAs);
        } finally {
            this.Placing = false;
            this.cdr.detectChanges();
        }
    }

    /** Place, as the dialog says. */
    public async ApplyPlace(): Promise<void> {
        if (this.Busy || !this.PlaceTargets.length || !this.PlaceSummary?.Placeable.length) return;
        this.Placing = true;
        this.PlaceError = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersSpawnRenewalsOperation().Execute({ SubscriptionIDs: this.PlaceTargets, PlaceAs: this.PlaceAs });
            const output = result.Output;
            if (!result.Success || !output?.Success) {
                this.PlaceError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The renewal orders could not be created.';
                return;
            }
            this.PlaceOpen = false;
            this.Notice = { Tone: output.Placed ? 'success' : 'warning', Text: this.placedText(output.Candidates, output.Placed) };
            this.SelectedKeys = [];
            await this.load();
        } finally {
            this.Placing = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Increase ───────────────────────────────────────────────────────── */

    /** Open the dialog for these subscriptions, prefilled with the rate they all share, if they do. */
    public OpenIncrease(subscriptionIDs: ReadonlyArray<string>): void {
        if (!subscriptionIDs.length || this.Busy) return;
        this.IncreaseTargets = [...subscriptionIDs];
        const rows = this.AllRows.filter((r) => subscriptionIDs.includes(r.SubscriptionID));
        const shared = SharedIncrease(rows);
        this.IncreaseValue = shared === undefined ? null : shared;
        this.IncreaseClear = false;
        this.IncreaseError = null;
        this.IncreaseOpen = true;
    }

    public OnIncreaseInput(text: string): void {
        const trimmed = String(text ?? '').trim();
        this.IncreaseValue = trimmed === '' ? null : Number(trimmed);
        this.IncreaseError = null;
    }

    /** Write the rate through `Orders.SetRenewalSettings`. Subscriptions only; no order is touched. */
    public async ApplyIncrease(): Promise<void> {
        if (this.Busy || !this.IncreaseTargets.length) return;
        const percent = this.IncreaseClear ? null : this.IncreaseValue;
        if (!this.IncreaseClear && (percent == null || !Number.isFinite(percent))) {
            this.IncreaseError = 'Enter a percentage, or choose no subscription-level rate.';
            return;
        }
        if (percent != null && (percent < 0 || percent > 100)) {
            this.IncreaseError = 'Enter a percentage from 0 to 100.';
            return;
        }
        this.Updating = true;
        this.IncreaseError = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersSetRenewalSettingsOperation().Execute({ SubscriptionIDs: this.IncreaseTargets, IncreasePercent: percent });
            const output = result.Output;
            if (!result.Success || !output) {
                this.IncreaseError = result.ErrorMessage?.trim() || 'The increase could not be updated.';
                return;
            }
            if (!output.Success) {
                this.IncreaseError = output.Message ?? 'The increase could not be updated.';
                return;
            }
            this.IncreaseOpen = false;
            this.Notice = SettingsUpdateText(output);
            await this.load();
        } finally {
            this.Updating = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Change product ─────────────────────────────────────────────────── */

    /** Open the dialog for these subscriptions. The product list is every Active subscription product, loaded once. */
    public async OpenProduct(subscriptionIDs: ReadonlyArray<string>): Promise<void> {
        if (!subscriptionIDs.length || this.Busy) return;
        this.ProductTargets = [...subscriptionIDs];
        const chosen = this.AllRows.filter((r) => subscriptionIDs.includes(r.SubscriptionID));
        this.ProductCurrentNote = CurrentProductsNote(chosen);
        const companies = [...new Map(chosen.map((r) => [r.CompanyID, r.CompanyName || '(none)'])).entries()];
        this.ProductCompanyNote = companies.map(([, name]) => name).join(', ');
        this.ProductChoice = null;
        this.ProductAdoptType = false;
        this.ProductError = null;
        this.ProductChoices = [];
        this.ProductOpen = true;
        if (!this.productCatalog.length) {
            this.ProductChoicesLoading = true;
            this.cdr.detectChanges();
            try {
                const result = await new RunView().RunView<{ ID: string; Name: string; CompanyID: string; Company: string }>({
                    EntityName: 'MJ_BizApps_Orders: Products',
                    ExtraFilter: "Status = 'Active' AND SubscriptionTypeID IS NOT NULL",
                    Fields: ['ID', 'Name', 'CompanyID', 'Company'],
                    OrderBy: 'Name',
                    ResultType: 'simple',
                });
                this.productCatalog = result.Results ?? [];
                if (!result.Success) this.ProductError = result.ErrorMessage || 'The product list could not be loaded.';
            } catch (err) {
                this.ProductError = `The product list could not be loaded: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
                this.ProductChoicesLoading = false;
            }
        }
        // Only the chosen rows' company sells what they can be moved to. Rows from several companies
        // see all of those companies' products, each labelled, so a pick is never ambiguous.
        const ids = new Set(companies.map(([id]) => String(id).toLowerCase()));
        this.ProductChoices = this.productCatalog
            .filter((p) => ids.has(String(p.CompanyID).toLowerCase()))
            .map((p) => ({ ID: p.ID, Label: companies.length > 1 ? `${p.Name} · ${p.Company}` : p.Name }));
        this.cdr.detectChanges();
    }

    public OnProductChoice(value: unknown): void {
        this.ProductChoice = value ? String(value) : null;
        this.ProductError = null;
    }

    /** Write the product through `Orders.ChangeSubscriptionProduct`. Subscriptions only. */
    public async ApplyProduct(): Promise<void> {
        if (this.Busy || !this.ProductTargets.length || !this.ProductChoice) return;
        this.Updating = true;
        this.ProductError = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersChangeSubscriptionProductOperation().Execute({
                SubscriptionIDs: this.ProductTargets,
                ProductID: this.ProductChoice,
                AdoptProductType: this.ProductAdoptType,
            });
            const output = result.Output;
            if (!result.Success || !output) {
                this.ProductError = result.ErrorMessage?.trim() || 'The product could not be changed.';
                return;
            }
            if (!output.Success) {
                this.ProductError = ProductChangeText(output).Text || 'The product could not be changed.';
                return;
            }
            this.ProductOpen = false;
            this.Notice = ProductChangeText(output);
            await this.load();
        } finally {
            this.Updating = false;
            this.cdr.detectChanges();
        }
    }

    /* ── Auto-renew ─────────────────────────────────────────────────────── */

    /** Open the dialog for these subscriptions, preselecting the switch they all share, if they do. */
    public OpenAutoRenew(subscriptionIDs: ReadonlyArray<string>): void {
        if (!subscriptionIDs.length || this.Busy) return;
        this.AutoRenewTargets = [...subscriptionIDs];
        const rows = this.AllRows.filter((r) => subscriptionIDs.includes(r.SubscriptionID));
        const allOn = rows.length > 0 && rows.every((r) => r.AutoRenew);
        const allOff = rows.length > 0 && rows.every((r) => !r.AutoRenew);
        // One row: offer the OTHER setting, since that is why the button was pressed.
        this.AutoRenewValue = rows.length === 1 ? !rows[0].AutoRenew : allOn ? true : allOff ? false : null;
        this.AutoRenewError = null;
        this.AutoRenewOpen = true;
    }

    /** Write the switch through `Orders.SetRenewalSettings`. Subscriptions only; no order is touched. */
    public async ApplyAutoRenew(): Promise<void> {
        if (this.Busy || !this.AutoRenewTargets.length || this.AutoRenewValue == null) return;
        this.Updating = true;
        this.AutoRenewError = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersSetRenewalSettingsOperation().Execute({ SubscriptionIDs: this.AutoRenewTargets, AutoRenew: this.AutoRenewValue });
            const output = result.Output;
            if (!result.Success || !output) {
                this.AutoRenewError = result.ErrorMessage?.trim() || 'Auto-renew could not be updated.';
                return;
            }
            if (!output.Success) {
                this.AutoRenewError = output.Message ?? 'Auto-renew could not be updated.';
                return;
            }
            this.AutoRenewOpen = false;
            this.Notice = SettingsUpdateText(output);
            await this.load();
        } finally {
            this.Updating = false;
            this.cdr.detectChanges();
        }
    }

    /** "3 renewal orders placed: ORD-1001 (confirmed), ORD-1002 (draft) … 1 skipped: SUB-7 (reason)". */
    private placedText(candidates: RenewalCandidate[], placed: number): string {
        const done = candidates.filter((c) => c.OrderID);
        const skipped = candidates.filter((c) => !c.OrderID);
        const list = done
            .slice(0, 5)
            .map((c) => `${c.OrderNumber ?? c.OrderID} (${c.OrderStatus === 'Draft' ? 'draft' : 'confirmed'})`)
            .join(', ');
        const head = `${placed} renewal order${placed === 1 ? '' : 's'} created${list ? `: ${list}${done.length > 5 ? ', …' : ''}` : ''}.`;
        const tail = skipped.length
            ? ` ${skipped.length} skipped: ${skipped
                  .slice(0, 3)
                  .map((c) => `${c.SubscriptionNumber} (${c.SkippedReason ?? 'no reason reported'})`)
                  .join('; ')}${skipped.length > 3 ? `, and ${skipped.length - 3} more` : ''}.`
            : '';
        return head + tail;
    }

    /* ── Loading ────────────────────────────────────────────────────────── */

    private async load(): Promise<void> {
        const result = await new OrdersGetRenewalWorklistOperation().Execute({ WindowDays: this.WindowDays, LookbackDays: LOOKBACK_DAYS, MaxCount: this.MaxRows });
        const output = result.Output;
        if (!result.Success || !output?.Success) {
            // SAY SO. An empty list and a failed one look identical, and "nothing ending" is the most
            // reassuring sentence on the screen.
            this.LoadError = output?.Message?.trim() || result.ErrorMessage?.trim() || 'The renewals list could not be loaded.';
            this.AllRows = [];
            this.Scoped = [];
            this.Rows = [];
            this.Presets = [];
            this.Applied = [];
            this.cdr.detectChanges();
            return;
        }
        this.LoadError = null;
        this.AllRows = output.Rows;
        this.Truncated = output.Truncated;
        this.AsOf = output.AsOfDate;
        this.WindowStart = output.WindowStart;
        this.WindowEnd = output.WindowEnd;
        this.PassMode = output.PassMode ?? 'Unknown';
        this.PassNextRunAt = output.PassNextRunAt ?? null;
        // Keep the side panel on the same subscription across a reload, with its fresh row.
        const selectedID = this.Selected?.SubscriptionID;
        this.Selected = selectedID ? (this.AllRows.find((r) => r.SubscriptionID === selectedID) ?? null) : null;
        // A tick on a row that has left the list (now out of the window) is dropped; a renewed row keeps
        // its tick, since its increase can still be set from here.
        this.SelectedKeys = this.SelectedKeys.filter((id) => this.AllRows.some((r) => r.SubscriptionID === id));
        this.applyFilters();
        this.cdr.detectChanges();
    }

    private applyFilters(): void {
        // Company is the outer choice: its list is everything in the window, counted over the rows the
        // product picks leave. Product is inner: only the products the chosen companies have ending,
        // and a product tick that no longer appears is dropped rather than silently filtering to nothing.
        this.Facets = PruneCompanies(this.Facets, FacetOptions(this.AllRows, 'Company'));
        const byCompany = this.AllRows.filter((r) => MatchesFacets(r, { Companies: this.Facets.Companies, Products: [] }));
        this.ProductOptions = FacetOptions(byCompany, 'Product');
        this.Facets = PruneProducts(this.Facets, this.ProductOptions);
        const byProduct = this.AllRows.filter((r) => MatchesFacets(r, { Companies: [], Products: this.Facets.Products }));
        this.CompanyOptions = FacetOptions(this.AllRows, 'Company', byProduct);
        this.Applied = AppliedFacets(this.Facets, this.CompanyOptions, this.ProductOptions);
        this.Scoped = this.AllRows.filter((r) => MatchesFacets(r, this.Facets));
        // Ticks survive only on rows the company and product filters still show.
        if (this.SelectedKeys.length) {
            const visible = new Set(this.Scoped.map((r) => r.SubscriptionID));
            const kept = this.SelectedKeys.filter((id) => visible.has(id));
            if (kept.length !== this.SelectedKeys.length) this.SelectedKeys = kept;
        }

        this.Presets = [
            { Key: 'all', Label: 'All in window', Count: this.Scoped.length },
            { Key: 'auto', Label: 'Will auto-renew', Count: this.AutoCount, Icon: 'fa-solid fa-rotate' },
            { Key: 'manual', Label: 'Will end', Count: this.ManualCount, Icon: 'fa-solid fa-hand' },
            { Key: 'placed', Label: 'Renewal placed', Count: this.PlacedCount, Icon: 'fa-solid fa-file-circle-check' },
            { Key: 'attention', Label: 'Needs attention', Count: this.Scoped.filter(NeedsAttention).length, Icon: 'fa-solid fa-triangle-exclamation' },
        ];
        const rows = this.Scoped.filter((row) => MatchesPreset(row, this.Preset) && MatchesSearch(row, this.Search));
        rows.sort((a, b) => (this.SortDescending ? -1 : 1) * CompareRows(a, b, this.SortKey));
        this.Rows = rows;
    }

    /* ── Template helpers ───────────────────────────────────────────────── */

    protected stateLabel(row: RenewalWorklistRow): string {
        return RenewalStateLabel(row.State);
    }
    protected stateClass(row: RenewalWorklistRow): string {
        return RenewalStateChipClass(row.State);
    }
    protected stateNote(row: RenewalWorklistRow): string | null {
        return RenewalStateNote(row);
    }
    protected termWarning(row: RenewalWorklistRow): string | null {
        return TermWarning(row);
    }
    protected increaseNote(row: RenewalWorklistRow): string {
        return SubscriptionIncreaseNote(row);
    }
    protected endsNote(row: RenewalWorklistRow): string {
        return EndsNote(row.DaysUntilEnd);
    }
    protected projectionLines(row: RenewalWorklistRow): ReturnType<typeof ProjectionLines> {
        return ProjectionLines(row);
    }
    protected date(value: string | null | undefined): string {
        return value ? FormatDate(value, RENEWALS_DATE) : '—';
    }
    protected money(value: number | null | undefined): string {
        return value == null ? '—' : FormatMoney(value);
    }
}

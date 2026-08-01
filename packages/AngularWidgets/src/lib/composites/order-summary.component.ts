import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { MJOMoneyStripComponent, type MJOPaymentStatus } from '../panels/money-strip.component';
import { MJOStatusStepperComponent } from '../panels/status-stepper.component';
import { MJOOriginChipComponent } from '../panels/chips.component';
import { BuildOrderStages, type MJOOrderStage, type MJOStageChangeRequestEventArgs, type MJOStepperStage } from '../panels/order-stages';
import { MJOMoneyPipe } from '../panels/money-format';
import { MJO_ENTITIES } from '../services/orders-data.service';

/** One order line, flattened for display. A view model — never a `BaseEntity`. */
export interface MJOOrderSummaryLine {
    ID: string;
    LineNumber: number;
    Product: string;
    Quantity: number;
    UnitPrice: number;
    LineTotal: number;
}

/**
 * The order header this composite renders. Structurally compatible with the fields the Orders
 * view returns, so a host that already holds the record binds it directly rather than re-reading.
 */
export interface MJOOrderSummaryHeader {
    ID: string;
    OrderNumber: string | null;
    Status: MJOOrderStage;
    Customer: string | null;
    OrderDate: Date | string | null;
    TotalAmount: number | null;
    PaidAmount: number | null;
    BalanceAmount: number | null;
    PaymentStatus: MJOPaymentStatus | null;
    OriginChannel: string | null;
}

/** The host was asked to open a related record. The widget states the ask and stops. */
export class MJORecordOpenRequestedEventArgs {
    constructor(
        public readonly EntityName: string,
        public readonly RecordID: string,
        public readonly Title: string,
        public readonly Preference: 'tab' | 'dialog' | 'slide-in' = 'slide-in',
    ) {}
}

/**
 * `<mjo-order-summary>` — an order at a glance: where it is, what it is worth, what is on it.
 *
 * **Layer 2.** It composes the layer-1 panels (`<mjo-status-stepper>`, `<mjo-money-strip>`,
 * `<mjo-origin-chip>`), loads its own lines through `ProviderToUse`, and emits intent. It never
 * navigates, so the Explorer Order form, a dashboard drill-down and a test can all mount it.
 *
 * ## Why this exists
 *
 * Before this, the rich orders UI was reachable only from the four Explorer **section tabs**.
 * Drilling into an Order record from anywhere else in Explorer — a search result, a related-entity
 * grid, a link on a journal entry — landed on the stock generated form: a field dump with no
 * stage, no money strip and no lines. Two different views of an order depending on how you got
 * there.
 *
 * The composite is the fix, and it is a fix precisely BECAUSE it is Explorer-unaware: the same
 * component now serves the entity form, and can serve any future surface, without either one
 * growing a copy.
 *
 * ## Example
 * ```html
 * <mjo-order-summary
 *   [Header]="HeaderView"
 *   [Provider]="ProviderToUse"
 *   (BeforeStageChange)="guard($event)"
 *   (RecordOpenRequested)="open($event)" />
 * ```
 */
@Component({
    selector: 'mjo-order-summary',
    standalone: true,
    imports: [
        CommonModule,
        MJOStatusStepperComponent,
        MJOMoneyStripComponent,
        MJOOriginChipComponent,
        MJOMoneyPipe,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './order-summary.component.html',
    styleUrls: ['./order-summary.component.css'],
})
export class MJOOrderSummaryComponent extends BaseAngularComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /**
     * The order to summarise. Setter-driven per MJ convention, so lines load exactly when the
     * order changes rather than on every change-detection pass.
     */
    @Input()
    set Header(value: MJOOrderSummaryHeader | null) {
        const previous = this._header?.ID ?? null;
        this._header = value;
        this.Stages = BuildOrderStages(value?.Status ?? 'Draft');
        if (value?.ID && value.ID !== previous) void this.loadLines(value.ID);
        if (!value) this.Lines = [];
    }
    get Header(): MJOOrderSummaryHeader | null {
        return this._header;
    }
    private _header: MJOOrderSummaryHeader | null = null;

    /** Show the order's lines. Off for compact surfaces that only want the stage + money. */
    @Input() ShowLines = true;

    /** Let the operator drive the stepper. Read-only surfaces leave this false. */
    @Input() AllowStageChange = false;

    /**
     * The operator asked to move the order to another stage. Cancelable.
     *
     * Handlers must be SYNCHRONOUS — `emit()` runs synchronous listeners inline, which is the
     * only reason the stepper can read `Cancel` afterwards. An `async` handler returns at its
     * first `await` and the veto silently does nothing.
     */
    @Output() BeforeStageChange = new EventEmitter<MJOStageChangeRequestEventArgs>();

    /** The stage actually changed. Not emitted when the Before was canceled. */
    @Output() AfterStageChange = new EventEmitter<MJOOrderStage>();

    /** The operator asked to open a related record. The host decides how. */
    @Output() RecordOpenRequested = new EventEmitter<MJORecordOpenRequestedEventArgs>();

    public Stages: MJOStepperStage[] = BuildOrderStages('Draft');
    public Lines: MJOOrderSummaryLine[] = [];
    public IsLoadingLines = false;
    public LinesError: string | null = null;

    public get LineTotal(): number {
        return this.Lines.reduce((sum, line) => sum + (line.LineTotal || 0), 0);
    }

    protected onBeforeStageChange(args: MJOStageChangeRequestEventArgs): void {
        this.BeforeStageChange.emit(args);
    }

    protected onStageChanged(stage: MJOOrderStage): void {
        this.AfterStageChange.emit(stage);
    }

    protected onBalanceClicked(): void {
        const header = this._header;
        if (!header) return;
        this.RecordOpenRequested.emit(
            new MJORecordOpenRequestedEventArgs(
                MJO_ENTITIES.PaymentHeader,
                header.ID,
                `Payments for ${header.OrderNumber ?? 'order'}`,
                'slide-in',
            ),
        );
    }

    /**
     * Load the order's lines.
     *
     * Provider-scoped, like every read in this package. `new RunView()` would bind the global
     * default and ignore whichever provider this component was handed.
     */
    private async loadLines(orderID: string): Promise<void> {
        if (!this.ShowLines) return;
        this.IsLoadingLines = true;
        this.LinesError = null;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJOOrderSummaryLine>(
                {
                    EntityName: MJO_ENTITIES.OrderLine,
                    ExtraFilter: `OrderID='${orderID}'`,
                    OrderBy: 'LineNumber ASC',
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            // RunView does not throw — an unchecked .Results here would render "no lines" for a
            // failed query, and an empty state that reads as good news is the worst outcome.
            if (!result.Success) {
                this.LinesError = result.ErrorMessage ?? 'The order lines could not be loaded.';
                this.Lines = [];
                return;
            }
            this.Lines = result.Results ?? [];
        } finally {
            this.IsLoadingLines = false;
            this.cdr.markForCheck();
        }
    }
}

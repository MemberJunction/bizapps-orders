import { ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView, type IMetadataProvider } from '@memberjunction/core';
import {
    OrdersRebuildRecognitionOperation,
    ToISODate,
    UserHasAuthorization,
    type mjBizAppsOrdersOrderLineEntity,
    type OrdersRebuildRecognitionOutput,
} from '@mj-biz-apps/orders-entities';

/** Who may rebuild: Finance, CFO and Developer. The operation checks it again. */
const RECOGNITION_REBUILD_AUTH = 'MJ.BizApps.Orders.Recognition.Rebuild';
const REBUILD_ENTITY = 'MJ_BizApps_Orders: Order Line Recognition Rebuilds';

/** One earlier rebuild of the line, as listed. */
export interface MJORecognitionRebuildRow {
    ID: string;
    RebuiltAt: string;
    RebuiltByUser: string | null;
    RevenueRecognitionType: string | null;
    Reason: string;
    AmountReplaced: number;
}

/**
 * `mjo-recognition-rebuild` — rebuild a booked line's revenue recognition from its product's current type
 * (golive #495), and list the rebuilds already made.
 *
 * The plan is the server's: Preview and Rebuild are the same `Orders.RebuildRecognition` call, the first with
 * `Preview: true`, so what finance confirms is what the operation computed. Editing the reason throws the preview
 * away. Offered only to holders of MJ.BizApps.Orders.Recognition.Rebuild and only on a booked line.
 *
 * ```html
 * <mjo-recognition-rebuild [Line]="line" />
 * ```
 */
@Component({
    standalone: true,
    selector: 'mjo-recognition-rebuild',
    imports: [CommonModule, FormsModule],
    templateUrl: './recognition-rebuild.component.html',
    styleUrls: ['./recognition-rebuild.component.css'],
})
export class MJORecognitionRebuildComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public Line: mjBizAppsOrdersOrderLineEntity | null = null;
    @Input() public Provider: IMetadataProvider = Metadata.Provider;

    public History: MJORecognitionRebuildRow[] = [];
    public Open = false;
    public Busy = false;
    public Reason = '';
    public Preview: OrdersRebuildRecognitionOutput | null = null;
    public Done: string | null = null;
    public Error: string | null = null;

    public get CanRebuild(): boolean {
        const user = this.Provider?.CurrentUser;
        return !!this.Line?.ID && !!user && UserHasAuthorization(RECOGNITION_REBUILD_AUTH, user, this.Provider);
    }

    public async ngOnChanges(): Promise<void> {
        this.Close();
        this.Done = null;
        await this.loadHistory();
    }

    public Day(value: string | null | undefined): string {
        return ToISODate(value) ?? '—';
    }

    public Start(): void {
        this.Open = true;
        this.Reason = '';
        this.Preview = null;
        this.Error = null;
        this.Done = null;
    }

    public Close(): void {
        this.Open = false;
        this.Reason = '';
        this.Preview = null;
        this.Error = null;
    }

    public Changed(): void {
        this.Preview = null;
        this.Error = null;
    }

    public async RunPreview(): Promise<void> {
        const output = await this.execute(true);
        if (output) this.Preview = output;
        this.cdr.detectChanges();
    }

    public async Confirm(): Promise<void> {
        if (!this.Preview || !this.Reason.trim()) return;
        const output = await this.execute(false);
        if (!output) return;
        this.Close();
        this.Done = output.Message ?? 'Recognition rebuilt.';
        await this.loadHistory();
    }

    private async execute(preview: boolean): Promise<OrdersRebuildRecognitionOutput | null> {
        if (!this.Line?.ID) return null;
        this.Busy = true;
        this.Error = null;
        this.cdr.detectChanges();
        try {
            const result = await new OrdersRebuildRecognitionOperation().Execute(
                { OrderLineID: this.Line.ID, Reason: this.Reason.trim() || undefined, Preview: preview },
                { provider: this.Provider },
            );
            if (!result.Success || !result.Output?.Success) {
                throw new Error(result.Output?.Message ?? result.ErrorMessage ?? 'The rebuild failed.');
            }
            return result.Output;
        } catch (err) {
            this.Error = err instanceof Error ? err.message : String(err);
            return null;
        } finally {
            this.Busy = false;
            this.cdr.detectChanges();
        }
    }

    private async loadHistory(): Promise<void> {
        this.History = [];
        if (!this.Line?.ID) return;
        const result = await RunView.FromMetadataProvider(this.Provider).RunView<MJORecognitionRebuildRow>({
            EntityName: REBUILD_ENTITY,
            ExtraFilter: `OrderLineID = '${this.Line.ID}'`,
            Fields: ['ID', 'RebuiltAt', 'RebuiltByUser', 'RevenueRecognitionType', 'Reason', 'AmountReplaced'],
            OrderBy: 'RebuiltAt DESC',
            ResultType: 'simple',
        });
        this.History = result?.Success ? result.Results : [];
        this.cdr.detectChanges();
    }
}

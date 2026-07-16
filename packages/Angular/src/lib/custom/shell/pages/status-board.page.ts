import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { TIME_WINDOWS, type TimeWindowId, timeWindowFilter, andFilters } from '@mj-biz-apps/accounting-ng';
import type { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

type OrderStatusValue = mjBizAppsOrdersOrderEntity['Status'];

/**
 * The WORKING statuses (§13.1 trim, resolved 2026-07-16): Drafts and terminal states live in All
 * orders. Typed as the entity's union so a widened CHECK fails the build rather than silently
 * dropping a column.
 */
const BOARD_STATUSES: readonly OrderStatusValue[] = ['Quoted', 'Confirmed', 'Posted', 'Fulfilled'] as const;

/** How many cards a column shows before collapsing to "+ N more…" (the mockup's shape). */
const CARDS_PER_COLUMN = 8;

export interface BoardCard {
  ID: string;
  OrderNumber: string;
  TotalGross: number | null;
  Balance: number | null;
  PaymentStatus: string | null;
  OrderDate: Date;
  DueDate: Date | null;
}

export interface BoardColumn {
  Status: OrderStatusValue;
  Icon: string;
  /** The TRUE count for this status in the window — not `Cards.length`. */
  Count: number;
  Cards: BoardCard[];
  Hidden: number;
}

/**
 * Status board (orders UI plan §13.1) — the pipeline at a glance, trimmed to the working statuses.
 *
 * One read for the whole board, bucketed in memory (the MJ perf rule: never a query per column).
 * Cards open the same detail slide-in All orders uses — one view of an order, two entry points.
 *
 * The column header shows the REAL count while the column renders at most `CARDS_PER_COLUMN` cards.
 * That distinction is the point: "Fulfilled 41" with 8 cards and "+33 more…" is honest; showing 8
 * and captioning it 8 would quietly under-report the pipeline.
 */
@Component({
  standalone: false,
  selector: 'mj-status-board-page',
  templateUrl: './status-board.page.html',
  styleUrls: ['./status-board.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBoardPageComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  public readonly TimeWindows = TIME_WINDOWS;
  public TimeWindow: TimeWindowId = 'last30';

  public Columns: BoardColumn[] = [];
  public IsLoading = false;
  public LoadError: string | null = null;
  public SelectedID: string | null = null;

  private readonly icons: Record<OrderStatusValue, string> = {
    Draft: 'fa-solid fa-pen-ruler',
    Quoted: 'fa-solid fa-file-signature',
    Confirmed: 'fa-solid fa-check',
    Posted: 'fa-solid fa-paper-plane',
    Fulfilled: 'fa-solid fa-box',
    Voided: 'fa-solid fa-ban',
  };

  ngOnInit(): void {
    void this.load();
  }

  public OnFilterChanged(): void {
    void this.load();
  }
  public Refresh(): void {
    void this.load();
  }

  public OnCardClicked(id: string): void {
    this.SelectedID = id;
    this.cdr.markForCheck();
  }
  public OnDetailClosed(): void {
    this.SelectedID = null;
    this.cdr.markForCheck();
  }
  public OnDetailChanged(): void {
    void this.load();
  }

  /** One read for the board; bucket client-side. Never one query per column. */
  private async load(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = null;
    this.cdr.markForCheck();
    try {
      const filter = andFilters(
        timeWindowFilter(this.TimeWindow, 'OrderDate'),
        `Status IN (${BOARD_STATUSES.map((s) => `'${s}'`).join(',')})`,
      );
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<BoardCard & { Status: OrderStatusValue }>(
        {
          EntityName: ORDER_ENTITY,
          ExtraFilter: filter || undefined,
          Fields: ['ID', 'OrderNumber', 'Status', 'TotalGross', 'Balance', 'PaymentStatus', 'OrderDate', 'DueDate'],
          OrderBy: 'OrderDate DESC',
          ResultType: 'simple',
        },
        this.ProviderToUse.CurrentUser,
      );
      if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not load the board.');

      const rows = res.Results ?? [];
      this.Columns = BOARD_STATUSES.map((status) => {
        const inStatus = rows.filter((r) => r.Status === status);
        return {
          Status: status,
          Icon: this.icons[status],
          Count: inStatus.length,
          Cards: inStatus.slice(0, CARDS_PER_COLUMN),
          Hidden: Math.max(0, inStatus.length - CARDS_PER_COLUMN),
        };
      });
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : String(e);
      this.Columns = [];
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The one-line story under a card: the thing an operator needs to see without opening it. */
  public CardNote(card: BoardCard): string {
    const parts: string[] = [];
    if (card.PaymentStatus) parts.push(card.PaymentStatus);
    if ((card.Balance ?? 0) > 0 && card.DueDate) {
      const overdue = new Date(card.DueDate).getTime() < Date.now();
      parts.push(overdue ? 'overdue' : `due ${new Date(card.DueDate).toISOString().slice(0, 10)}`);
    }
    return parts.join(' · ');
  }

  public IsOverdue(card: BoardCard): boolean {
    return !!card.DueDate && (card.Balance ?? 0) > 0 && new Date(card.DueDate).getTime() < Date.now();
  }

  /** The header chip: the board's true total across the working statuses. */
  public get TotalLabel(): string {
    const total = this.Columns.reduce((sum, c) => sum + c.Count, 0);
    return `${total} in the pipeline`;
  }
}

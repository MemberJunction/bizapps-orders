import { Component, EventEmitter, Input, NgModule, Output } from '@angular/core';
import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';
/**
 * Local stand-in for `@mj-biz-apps/accounting-ng`'s waterfall.
 * Accounting's current build no longer exports DeferredRevenueWaterfallModule.
 */
@Component({
    standalone: false,
    selector: 'mj-deferred-revenue-waterfall',
    template: `
        <div class="mjo-ov-card">
            <header class="mjo-ov-card__h">
                <h3><i class="fa-solid fa-chart-line" aria-hidden="true"></i>{{ Title }}</h3>
            </header>
            <div class="mjo-ov-card__b">
                @if (JournalEntries.length === 0) {
                    <div class="mjo-ov-empty">No recognition journals yet.</div>
                } @else {
                    <table class="mjo-ov-table">
                        <thead>
                            <tr>
                                <th>Journal</th>
                                <th>Date</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (entry of JournalEntries; track entry.ID) {
                                <tr (click)="JournalEntrySelected.emit(entry)" style="cursor: pointer;">
                                    <td>{{ entry.EntryNumber || entry.ID }}</td>
                                    <td>{{ DateLabel(entry) }}</td>
                                    <td>{{ entry.Status }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                }
            </div>
        </div>
    `,
    styleUrls: ['./document-hero.css'],
})
export class DeferredRevenueWaterfallComponent {
    @Input() JournalEntries: mjBizAppsAccountingJournalEntryEntity[] = [];
    @Input() Title = 'Deferred revenue';
    @Input() Currency = 'USD';
    @Input() ForceSingleItemMode = false;
    @Input() TermLookup: Record<string, { TermNumber: number; Label?: string }> = {};
    @Output() JournalEntrySelected = new EventEmitter<mjBizAppsAccountingJournalEntryEntity>();

    public DateLabel(entry: mjBizAppsAccountingJournalEntryEntity): string {
        return entry.EffectiveDate
            ? new Date(entry.EffectiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
    }
}

@NgModule({
    declarations: [DeferredRevenueWaterfallComponent],
    exports: [DeferredRevenueWaterfallComponent],
})
export class DeferredRevenueWaterfallModule {}

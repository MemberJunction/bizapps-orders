import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormatMoney, MJOMoneyPipe } from './money-format';

/** One side of one entry line. */
export interface MJOJournalLine {
    Side: 'Dr' | 'Cr';
    /** The role that resolved — 'AR', 'Sales', 'Deferred Revenue'. */
    AccountRole: string;
    /** The account it resolved to, as accounting names it. */
    AccountName: string;
    Amount: number;
}

/** One journal entry — always exactly one order line's worth. */
export interface MJOJournalEntry {
    CompanyID: string;
    CompanyName: string;
    /** Which order line caused it. One entry per line, always. */
    LineNumber?: number | null;
    /** What the line is, for the header. */
    LineDescription?: string | null;
    /** Set once the entry exists; null while previewing. */
    JournalEntryID?: string | null;
    EntryType?: string;
    Lines: MJOJournalLine[];
}

/**
 * `mjo-journal-entry-preview` — the entries an order will (or did) produce.
 *
 * READ-ONLY, ALWAYS. Orders creates Pending entries and owns nothing in the
 * ledger, so every account and entry here links out to Accounting rather than
 * being editable in place. Duplicating ledger editing into this app would create
 * a second place for the same number to be wrong.
 *
 * The balance check is computed here rather than trusted from the server, because
 * an unbalanced entry displayed as balanced is the single most misleading thing
 * this component could do. Balanced is the normal case; the component's job is to
 * be loud when it is not.
 *
 * ONE ENTRY PER ORDER LINE, always — even for two lines of the same company. The
 * order's "journal entry" is a display grouping over the line entries, not a
 * record. That is why entries are keyed by line rather than merged by company.
 *
 * ## Example
 *
 * ```html
 * <mjo-journal-entry-preview
 *   [Entries]="preview.JournalEntries"
 *   [Pending]="true"
 *   (OpenInAccounting)="openLedger($event)" />
 * ```
 */
@Component({
    selector: 'mjo-journal-entry-preview',
    standalone: true,
    imports: [CommonModule, MJOMoneyPipe],
    template: `
        @if (Entries.length) {
            <div class="row wrap mjo-je__summary">
                <span class="mj-chip" [class.mj-chip--success]="allBalanced" [class.mj-chip--error]="!allBalanced">
                    <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
                    {{ Entries.length }} {{ Entries.length === 1 ? 'entry' : 'entries' }} ·
                    {{ companyCount }} {{ companyCount === 1 ? 'company' : 'companies' }} ·
                    {{ allBalanced ? 'all balanced' : 'NOT balanced' }}
                </span>
                <span class="mj-chip mj-chip--outline">one entry per line, always</span>
                @if (Pending) {
                    <span class="mj-chip mj-chip--info">will land Pending</span>
                }
            </div>

            @for (entry of Entries; track $index) {
                <div class="mjo-je">
                    <div class="mjo-je__head">
                        <b>{{ entry.CompanyName }}</b>
                        @if (entry.LineNumber != null) {
                            <span class="muted">
                                line {{ entry.LineNumber }}@if (entry.LineDescription) { · {{ entry.LineDescription }} }
                            </span>
                        }
                        <span class="spacer"></span>
                        <span class="mj-chip" [class.mj-chip--success]="isBalanced(entry)" [class.mj-chip--error]="!isBalanced(entry)">
                            {{ isBalanced(entry) ? 'balanced' : 'out by ' + variance(entry) }}
                        </span>
                        @if (entry.JournalEntryID) {
                            <a href="#" class="small" (click)="open($event, entry)">
                                Open in Accounting <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                            </a>
                        } @else {
                            <span class="mj-chip mj-chip--outline">not yet created</span>
                        }
                    </div>

                    <table class="mj-table mj-table--compact">
                        <tbody>
                            @for (line of entry.Lines; track $index) {
                                <tr>
                                    <td class="mjo-je__side muted strong">{{ line.Side }}</td>
                                    <td>
                                        {{ line.AccountName }}
                                        <div class="secondary">{{ line.AccountRole }}</div>
                                    </td>
                                    <td class="num">{{ line.Amount | mjoMoney }}</td>
                                </tr>
                            }
                            <tr class="is-total">
                                <td></td>
                                <td>Totals</td>
                                <td class="num">{{ debits(entry) | mjoMoney }} / {{ credits(entry) | mjoMoney }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            }
        } @else {
            <div class="small muted">{{ EmptyText }}</div>
        }
    `,
    styles: [
        `
            .mjo-je__summary {
                gap: var(--mj-space-2);
                margin-bottom: var(--mj-space-4);
            }
            .mjo-je {
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md);
                overflow: hidden;
            }
            .mjo-je + .mjo-je {
                margin-top: var(--mj-space-3);
            }
            .mjo-je__head {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2);
                padding: var(--mj-space-2) var(--mj-space-3);
                background: var(--mj-bg-surface-card);
                border-bottom: 1px solid var(--mj-border-default);
                font-size: 12.5px;
                flex-wrap: wrap;
            }
            .mjo-je__side {
                width: 34px;
                font-size: 11px;
            }
            @media (max-width: 560px) {
                .mjo-je__head .spacer {
                    display: none;
                }
            }
        `,
    ],
})
export class MJOJournalEntryPreviewComponent {
    /** The entries, one per order line. */
    @Input() Entries: MJOJournalEntry[] = [];

    /** Add the "will land Pending" chip — true while previewing a confirm. */
    @Input() Pending = false;

    /** Shown when there is nothing to project. */
    @Input() EmptyText = 'No journal entries — this order has not booked.';

    /** A user asked to open an entry in Accounting. The host decides how. */
    @Output() OpenInAccounting = new EventEmitter<MJOJournalEntry>();

    protected get companyCount(): number {
        return new Set(this.Entries.map((e) => e.CompanyID)).size;
    }

    protected get allBalanced(): boolean {
        return this.Entries.every((e) => this.isBalanced(e));
    }

    protected debits(entry: MJOJournalEntry): number {
        return this.sum(entry, 'Dr');
    }

    protected credits(entry: MJOJournalEntry): number {
        return this.sum(entry, 'Cr');
    }

    protected isBalanced(entry: MJOJournalEntry): boolean {
        // Half a cent of tolerance: these are DECIMAL(18,2) amounts summed in
        // floating point, and an exact-equality check would report a rounding
        // artefact as an unbalanced entry.
        return Math.abs(this.debits(entry) - this.credits(entry)) < 0.005;
    }

    protected variance(entry: MJOJournalEntry): string {
        return FormatMoney(Math.abs(this.debits(entry) - this.credits(entry)));
    }

    protected open(event: Event, entry: MJOJournalEntry): void {
        event.preventDefault();
        this.OpenInAccounting.emit(entry);
    }

    private sum(entry: MJOJournalEntry, side: 'Dr' | 'Cr'): number {
        return entry.Lines.filter((l) => l.Side === side).reduce((s, l) => s + l.Amount, 0);
    }
}

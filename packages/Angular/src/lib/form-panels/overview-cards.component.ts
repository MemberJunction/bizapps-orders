import { Component, Input } from '@angular/core';

export interface MJOOverviewFact {
    Label: string;
    Value: string;
}

export interface MJOOverviewListItem {
    Title: string;
    Detail: string;
    Badge?: string;
    BadgeKind?: 'ok' | 'info' | 'warn' | 'muted';
}

export interface MJOOverviewCard {
    Title: string;
    Icon: string;
    Span?: 1 | 2;
    Note?: string;
    Facts?: MJOOverviewFact[];
    Headers?: string[];
    Rows?: string[][];
    Items?: MJOOverviewListItem[];
}

/**
 * Two-column overview card grid — the body of every Orders Overview section.
 */
@Component({
    standalone: false,
    selector: 'mjo-overview-cards',
    template: `
        <div class="mjo-ov">
            @for (card of Cards; track card.Title) {
                <article class="mjo-ov-card" [class.mjo-ov-card--wide]="card.Span === 2">
                    <header class="mjo-ov-card__h">
                        <h3><i [class]="card.Icon" aria-hidden="true"></i>{{ card.Title }}</h3>
                    </header>
                    <div class="mjo-ov-card__b">
                        @if (card.Note) {
                            <p class="mjo-ov-note">{{ card.Note }}</p>
                        }
                        @if (card.Facts?.length) {
                            <div class="mjo-ov-facts">
                                @for (fact of card.Facts; track fact.Label) {
                                    <div>
                                        <div class="mjo-ov-fact__l">{{ fact.Label }}</div>
                                        <div class="mjo-ov-fact__v">{{ fact.Value }}</div>
                                    </div>
                                }
                            </div>
                        }
                        @if (card.Headers?.length && card.Rows) {
                            @if (card.Rows.length === 0) {
                                <div class="mjo-ov-empty">None yet</div>
                            } @else {
                                <table class="mjo-ov-table">
                                    <thead>
                                        <tr>
                                            @for (h of card.Headers; track h) {
                                                <th>{{ h }}</th>
                                            }
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (row of card.Rows; track $index) {
                                            <tr>
                                                @for (cell of row; track $index) {
                                                    <td>{{ cell }}</td>
                                                }
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            }
                        }
                        @if (card.Items) {
                            @if (card.Items.length === 0) {
                                <div class="mjo-ov-empty">None yet</div>
                            } @else {
                                @for (item of card.Items; track item.Title + item.Detail) {
                                    <div class="mjo-ov-row">
                                        <div>
                                            <h4>{{ item.Title }}</h4>
                                            <p>{{ item.Detail }}</p>
                                        </div>
                                        @if (item.Badge) {
                                            <span class="mjo-doc-chip" [class]="'mjo-doc-chip--' + (item.BadgeKind || 'info')">{{ item.Badge }}</span>
                                        }
                                    </div>
                                }
                            }
                        }
                    </div>
                </article>
            }
        </div>
    `,
    styleUrls: ['./document-hero.css'],
})
export class MJOOverviewCardsComponent {
    @Input() Cards: MJOOverviewCard[] = [];
}

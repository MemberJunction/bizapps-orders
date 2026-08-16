import { Component, Input } from '@angular/core';

export interface MJODocHeroChip {
    Text: string;
    Kind?: 'ok' | 'draft' | 'error' | 'warn' | 'info' | 'muted' | 'on' | 'off' | '';
}

export interface MJODocHeroStat {
    Label: string;
    Value: string;
    Sub?: string;
}

export interface MJODocHeroMeta {
    Label: string;
    Value: string;
}

/**
 * Shared identity banner used by every Orders form header contribution.
 */
@Component({
    standalone: false,
    selector: 'mjo-doc-hero',
    template: `
        <div class="mjo-doc-hero">
            <div class="mjo-doc-hero__identity">
                <div class="mjo-doc-hero__avatar" [class.mjo-doc-hero__avatar--reverse]="ReverseAvatar">
                    <i [class]="Icon" aria-hidden="true"></i>
                </div>
                <div class="mjo-doc-hero__copy">
                    <div class="mjo-doc-hero__title-row">
                        <h1 class="mjo-doc-hero__title">{{ Title }}</h1>
                        @for (chip of Chips; track chip.Text) {
                            <span class="mjo-doc-chip" [class]="'mjo-doc-chip' + (chip.Kind ? ' mjo-doc-chip--' + chip.Kind : '')">
                                {{ chip.Text }}
                            </span>
                        }
                    </div>
                    @if (Meta.length > 0) {
                        <div class="mjo-doc-hero__meta">
                            @for (item of Meta; track item.Label) {
                                <span>{{ item.Label }}: <strong>{{ item.Value }}</strong></span>
                            }
                        </div>
                    }
                </div>
            </div>
            @if (Stats.length > 0) {
                <div class="mjo-doc-hero__stats">
                    @for (stat of Stats; track stat.Label) {
                        <div class="mjo-doc-stat">
                            <span class="mjo-doc-stat__label">{{ stat.Label }}</span>
                            <span class="mjo-doc-stat__value">{{ stat.Value }}</span>
                            @if (stat.Sub) {
                                <span class="mjo-doc-stat__sub">{{ stat.Sub }}</span>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `,
    styleUrls: ['./document-hero.css'],
})
export class MJODocHeroComponent {
    @Input() Title = '';
    @Input() Icon = 'fa-solid fa-tag';
    @Input() ReverseAvatar = false;
    @Input() Chips: MJODocHeroChip[] = [];
    @Input() Stats: MJODocHeroStat[] = [];
    @Input() Meta: MJODocHeroMeta[] = [];
}

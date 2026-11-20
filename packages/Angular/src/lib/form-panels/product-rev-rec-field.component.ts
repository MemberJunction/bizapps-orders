import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CompositeKey, KeyValuePair } from '@memberjunction/core';
import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
import { MJO_ENTITIES } from '../data/entity-names';
import { ProductLookupNamesTracker, REV_REC_FROM_TYPE_LABEL, type ProductLookupNames } from '../panels/product-lookup-names';

/**
 * Read-mode value of a Product's revenue recognition type in the Accounting section
 * (bc-aidp-next-golive#436).
 *
 * `mj-form-field` shows an FK by the record's virtual `RevenueRecognitionType` name, which can
 * still read the old type after the id moved (walkthrough Pin 28). The header resolved the name by
 * id, so the form showed two values for one field. This shows the header's value — same lookup,
 * same type-default fallback booking uses — and says when it comes from the product type. Edit mode
 * keeps `mj-form-field`, whose picker writes the id.
 */
@Component({
    standalone: false,
    selector: 'mjo-product-rev-rec-field',
    template: `
        <div class="mjo-revrec-field">
            <span class="mjo-revrec-field__label">{{ Label }}</span>
            <span class="mjo-revrec-field__value">
                @if (Names.RevRecID) {
                    <a class="mjo-revrec-field__link" (click)="OnLinkClick($event)" title="View related record">{{ Names.RevRec }}</a>
                } @else {
                    {{ Names.RevRec }}
                }
                @if (Source) {
                    <span class="mjo-revrec-field__source">{{ Source }}</span>
                }
            </span>
        </div>
    `,
    styles: [
        `
            /* Mirrors mj-form-field's read-mode row so the field lines up with its neighbours. */
            .mjo-revrec-field {
                display: grid;
                grid-template-columns: 200px 1fr;
                gap: 12px;
                align-items: baseline;
                padding: 8px 0;
                min-width: 0;
            }
            .mjo-revrec-field__label {
                font-size: 13px;
                font-weight: 600;
                color: var(--mj-text-secondary);
                padding-top: 2px;
            }
            .mjo-revrec-field__value {
                color: var(--mj-text-primary);
                min-width: 0;
            }
            .mjo-revrec-field__link {
                color: var(--mj-brand-primary);
                cursor: pointer;
                text-decoration: none;
            }
            .mjo-revrec-field__link:hover {
                text-decoration: underline;
            }
            .mjo-revrec-field__source {
                margin-left: 8px;
                font-size: var(--mj-text-xs);
                color: var(--mj-text-muted);
            }
        `,
    ],
})
export class MJOProductRevRecFieldComponent {
    @Input() public Record!: mjBizAppsOrdersProductEntity;
    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    private cdr = inject(ChangeDetectorRef, { optional: true });
    private lookups = new ProductLookupNamesTracker(() => this.cdr?.markForCheck());

    public get Names(): ProductLookupNames {
        return this.lookups.For(this.Record);
    }

    public get Source(): string | null {
        return this.Names.RevRecFromType ? REV_REC_FROM_TYPE_LABEL : null;
    }

    /** The label `mj-form-field` gives this field in edit mode, so the row reads the same in both. */
    public get Label(): string {
        const field = this.Record?.EntityInfo?.Fields?.find((f) => f.Name === 'RevenueRecognitionTypeID');
        const nameField = field?.RelatedEntityNameFieldMap
            ? this.Record.EntityInfo.Fields.find((f) => f.Name === field.RelatedEntityNameFieldMap)
            : undefined;
        return nameField?.DisplayNameOrName ?? field?.DisplayNameOrName ?? 'Revenue Recognition Type';
    }

    public OnLinkClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const id = this.Names.RevRecID;
        if (!id) return;
        this.Navigate.emit({
            Kind: 'record',
            EntityName: MJO_ENTITIES.RevenueRecognitionType,
            PrimaryKey: new CompositeKey([new KeyValuePair('ID', id)]),
            OpenInNewTab: event.ctrlKey || event.metaKey,
        });
    }
}

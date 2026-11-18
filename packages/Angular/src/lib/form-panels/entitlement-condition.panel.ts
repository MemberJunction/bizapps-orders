import { ChangeDetectorRef, Component, DoCheck, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import {
    LoadOrdersEngine,
    OrdersEngine,
    type EffectiveProductOption,
    type mjBizAppsOrdersProductEntitlementEntity,
} from '@mj-biz-apps/orders-entities';

/** How a template's condition is being edited. */
export type EntitlementConditionMode = 'none' | 'option' | 'typed';

/** The picker's reading of a stored condition. */
export interface EntitlementConditionState {
    Mode: EntitlementConditionMode;
    /** The option the condition names, when it is one of the product's options. */
    OptionID: string;
    /** The value picked, when it is one of that option's values. */
    ValueID: string;
}

const codeKey = (c: string | null | undefined): string => (c ?? '').trim().toLowerCase();

/**
 * Read a stored `ChoiceGroupKey` / `ChoiceOptionValue` against the product's options. A key that is
 * an option's code reads as that option (and the value as one of its values, when it is one); any
 * other key is a widget choice group, which stays typed, since widget groups live in the widget's
 * configuration rather than in a table this form can list.
 */
export function ReadEntitlementCondition(
    options: readonly EffectiveProductOption[],
    groupKey: string | null | undefined,
    optionValue: string | null | undefined,
): EntitlementConditionState {
    if (!codeKey(groupKey)) return { Mode: options.length ? 'none' : 'typed', OptionID: '', ValueID: '' };
    const option = options.find((o) => codeKey(o.Option.Code) === codeKey(groupKey));
    if (!option) return { Mode: 'typed', OptionID: '', ValueID: '' };
    const value = option.Values.find((v) => codeKey(v.Code) === codeKey(optionValue));
    return { Mode: 'option', OptionID: option.Option.ID, ValueID: value?.ID ?? '' };
}

/**
 * The entitlement template's settings, with its condition chosen from the product's options
 * (golive #399).
 *
 * A conditional template grants only on a line whose picks match `ChoiceGroupKey` =
 * `ChoiceOptionValue`, so a typo in either key silently grants nothing. In edit mode the condition
 * is picked: an option the product offers, then one of its values, and the codes are written for
 * the user. A key that is not an option (a checkout widget's choice group) is typed as before.
 *
 * Claims the generated `entitlementConfiguration` section and renders its other fields unchanged,
 * declared directly under the collapsible panel so its hide-when-empty check and rail badge see them
 * (golive #184).
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductEntitlements:configuration',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Entitlements',
        slot: 'before-fields',
        sortKey: 150,
        contributionKey: 'entitlementConfiguration',
        replacesSectionKey: 'entitlementConfiguration',
    },
})
@Component({
    standalone: true,
    selector: 'mjo-entitlement-condition-panel',
    imports: [CommonModule, BaseFormsModule],
    template: `
        <!-- SectionKey differs from the claimed one: the form hides every section whose key a panel claims. -->
        <mj-collapsible-panel
            SectionKey="entitlementSettings"
            SectionName="Entitlement Configuration"
            Icon="fa fa-sliders-h"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="EntitlementType" Type="select" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="Code" Type="code" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="Name" Type="textbox" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="Quantity" Type="number" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="UnitOfMeasure" Type="textbox" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="IsActive" Type="checkbox" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>

            @if (EditMode && Options.length) {
                <div class="mjo-ent-cond" role="group" aria-label="Grant condition">
                    <label class="mjo-ent-cond__field">
                        <span>Grant when</span>
                        <select (change)="OnConditionPicked($event)">
                            <option value="" [selected]="State.Mode === 'none'">Always (no condition)</option>
                            @for (option of Options; track option.Option.ID) {
                                <option [value]="option.Option.ID" [selected]="State.Mode === 'option' && State.OptionID === option.Option.ID">
                                    {{ option.Option.Name }} is picked as…
                                </option>
                            }
                            <option value="typed" [selected]="State.Mode === 'typed'">A checkout choice (type the key)</option>
                        </select>
                    </label>
                    @if (State.Mode === 'option') {
                        <label class="mjo-ent-cond__field">
                            <span>Value</span>
                            <select (change)="OnValuePicked($event)">
                                <option value="" [selected]="!State.ValueID">Choose a value…</option>
                                @for (value of ValuesOfPicked(); track value.ID) {
                                    <option [value]="value.ID" [selected]="State.ValueID === value.ID">{{ value.Label }}</option>
                                }
                            </select>
                        </label>
                    }
                </div>
            }
            @if (!EditMode || !Options.length || State.Mode === 'typed') {
                <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="ChoiceGroupKey" Type="textbox" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
                <mj-form-field [Record]="Record" [ShowLabel]="true" FieldName="ChoiceOptionValue" Type="textbox" [EditMode]="EditMode" [FormContext]="FormContext"></mj-form-field>
            }
        </mj-collapsible-panel>
    `,
    styles: [
        `
            .mjo-ent-cond { display: flex; flex-wrap: wrap; gap: var(--mj-space-3, 12px); margin: var(--mj-space-2, 8px) 0; }
            .mjo-ent-cond__field { display: flex; flex-direction: column; gap: 4px; font-size: var(--mj-text-sm, 13px); }
            .mjo-ent-cond__field span { color: var(--mj-text-muted); font-size: var(--mj-text-xs, 12px); }
            .mjo-ent-cond__field select {
                height: 30px; padding: 0 8px; border: 1px solid var(--mj-border-strong); border-radius: var(--mj-radius-md, 6px);
                background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit;
            }
        `,
    ],
})
export class EntitlementConditionPanel extends BaseFormPanel<mjBizAppsOrdersProductEntitlementEntity> implements DoCheck {
    private readonly cdr = inject(ChangeDetectorRef);

    public Options: EffectiveProductOption[] = [];
    public State: EntitlementConditionState = { Mode: 'typed', OptionID: '', ValueID: '' };
    private readFor: string | null | undefined = undefined;

    /**
     * The slot host sets `Record` directly rather than through an input, so the product is watched
     * here: the options are read once per product the template hangs on.
     */
    public ngDoCheck(): void {
        const productID = this.Record?.ProductID ?? null;
        if (productID === this.readFor) return;
        this.readFor = productID;
        void this.loadOptions(productID);
    }

    private async loadOptions(productID: string | null): Promise<void> {
        try {
            const md = Metadata.Provider as unknown as IMetadataProvider;
            await LoadOrdersEngine(md, md.CurrentUser as UserInfo);
            this.Options = OrdersEngine.Instance.EffectiveOptions(productID);
        } catch {
            // No catalog: the keys are typed, as before options existed.
            this.Options = [];
        }
        this.State = ReadEntitlementCondition(this.Options, this.Record?.ChoiceGroupKey, this.Record?.ChoiceOptionValue);
        this.cdr.markForCheck();
    }

    public ValuesOfPicked() {
        return this.Options.find((o) => o.Option.ID === this.State.OptionID)?.Values ?? [];
    }

    public OnConditionPicked(event: Event): void {
        const picked = (event.target as HTMLSelectElement).value;
        if (picked === 'typed') {
            this.State = { Mode: 'typed', OptionID: '', ValueID: '' };
            return;
        }
        const option = this.Options.find((o) => o.Option.ID === picked);
        this.State = option ? { Mode: 'option', OptionID: option.Option.ID, ValueID: '' } : { Mode: 'none', OptionID: '', ValueID: '' };
        this.Record.ChoiceGroupKey = option ? option.Option.Code : null;
        this.Record.ChoiceOptionValue = null;
    }

    public OnValuePicked(event: Event): void {
        const value = this.ValuesOfPicked().find((v) => v.ID === (event.target as HTMLSelectElement).value);
        this.State = { ...this.State, ValueID: value?.ID ?? '' };
        this.Record.ChoiceOptionValue = value ? value.Code : null;
    }
}

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import {
    ProductAccountingPanel,
    ProductFulfillmentPanel,
    ProductSubscriptionsPanel,
} from '../lib/form-panels/product-widget.panels';
import { ProductHeaderPanel } from '../lib/form-panels/product-header.panel';
import '../public-api';

/**
 * golive#184 — the Product form's contributed sections rendered a bare header when every
 * field in them was empty, and ten fields rendered twice (generated section + widget).
 *
 * Both fixes are structural, so these tests read the structures:
 *  - `replacesSectionKey` on the registration is what removes the duplicate generated section.
 *  - Where an `mj-form-field` is DECLARED is what decides whether mj-collapsible-panel's
 *    `@ContentChildren` query can see it. A field declared inside the widget's own template sits
 *    behind a component view boundary and is invisible to the query. That query drives both
 *    hide-when-empty (golive#184) and the rail badge: a section that sees no fields reports no
 *    required-and-empty count before a save and claims none of the field-named errors after a
 *    failed one (golive#255).
 */

/** Inline `template:` of a panel component, from the decorator metadata Angular keeps on the class. */
function PanelTemplate(panel: unknown): string {
    const annotations = (panel as { __annotations__?: { template?: string }[] }).__annotations__;
    const template = annotations?.[0]?.template;
    expect(typeof template, 'panel must use an inline template').toBe('string');
    return template as string;
}

function ReadRepoFile(relativeToThisFile: string): string {
    return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), 'utf8');
}

const WIDGETS_DIR = '../lib/custom/Product/widgets/';
const SUBSCRIPTION_WIDGET_HTML = ReadRepoFile(`${WIDGETS_DIR}product-subscription-widget.component.html`);
const FULFILLMENT_WIDGET_HTML = ReadRepoFile(`${WIDGETS_DIR}product-fulfillment-widget.component.html`);
const ACCOUNTING_WIDGET_HTML = ReadRepoFile(`${WIDGETS_DIR}product-accounting-widget.component.html`);
const PRODUCT_HEADER_HTML = ReadRepoFile('../lib/form-panels/product-header.panel.html');
const GENERATED_PRODUCT_FORM_HTML = ReadRepoFile(
    '../lib/generated/Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component.html'
);

function FieldNames(markup: string): string[] {
    return [...markup.matchAll(/FieldName="([^"]+)"/g)].map((m) => m[1]);
}

/** Field names declared inside one generated `<mj-collapsible-panel SectionKey="...">` block. */
function GeneratedSectionFields(sectionKey: string): string[] {
    const start = GENERATED_PRODUCT_FORM_HTML.indexOf(`SectionKey="${sectionKey}"`);
    expect(start, `generated section ${sectionKey} not found`).toBeGreaterThan(-1);
    const end = GENERATED_PRODUCT_FORM_HTML.indexOf('</mj-collapsible-panel>', start);
    expect(end, `generated section ${sectionKey} is unterminated`).toBeGreaterThan(start);
    return FieldNames(GENERATED_PRODUCT_FORM_HTML.slice(start, end));
}

function PanelRegistrationMetadata(panel: unknown): Record<string, unknown> | undefined {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel).find((r) => r.SubClass === panel)
        ?.Metadata;
}

describe('Product widget panels replace their duplicate generated sections', () => {
    it.each([
        { name: 'accounting', panel: ProductAccountingPanel, sectionKey: 'financialAndAccounting' },
        { name: 'fulfillment', panel: ProductFulfillmentPanel, sectionKey: 'catalogLifecycle' },
        { name: 'subscriptions', panel: ProductSubscriptionsPanel, sectionKey: 'subscriptionAndEntitlements' },
    ])('the $name panel claims the generated $sectionKey section', ({ panel, sectionKey }) => {
        expect(PanelRegistrationMetadata(panel)?.['replacesSectionKey']).toBe(sectionKey);
    });

    it('still renders every field of the three replaced sections', () => {
        const rendered = new Set([
            ...FieldNames(PanelTemplate(ProductAccountingPanel)),
            ...FieldNames(PanelTemplate(ProductFulfillmentPanel)),
            ...FieldNames(PanelTemplate(ProductSubscriptionsPanel)),
            ...FieldNames(SUBSCRIPTION_WIDGET_HTML),
            ...FieldNames(FULFILLMENT_WIDGET_HTML),
            ...FieldNames(ACCOUNTING_WIDGET_HTML),
        ]);

        // StandaloneSellingPrice is deliberately off generated forms
        // (metadata/entities/.product-standalone-selling-price-deprecation.json sets
        // IncludeInGeneratedForm = 0). The committed generated template still carries it
        // because CodeGen has not been re-run against that metadata yet, so it must not be
        // carried into the replacement panel.
        const deprecated = ['StandaloneSellingPrice'];
        const replaced = [
            ...GeneratedSectionFields('financialAndAccounting'),
            ...GeneratedSectionFields('catalogLifecycle'),
            ...GeneratedSectionFields('subscriptionAndEntitlements'),
        ].filter((field) => !deprecated.includes(field));
        expect(replaced.length).toBeGreaterThan(0);
        expect(rendered.has('StandaloneSellingPrice')).toBe(false);

        const lost = replaced.filter((field) => !rendered.has(field));
        expect(lost, 'replacing a generated section must not drop its fields').toEqual([]);
    });
});

describe('Contributed sections declare their fields where mj-collapsible-panel can see them', () => {
    it.each([
        {
            name: 'subscriptions',
            panel: ProductSubscriptionsPanel,
            fields: ['SubscriptionTypeID', 'EntitlementValidityMode'],
        },
        {
            name: 'accounting',
            panel: ProductAccountingPanel,
            fields: ['CompanyID', 'RevenueRecognitionTypeID', 'IsTaxable', 'TaxCategory'],
        },
        {
            name: 'fulfillment',
            panel: ProductFulfillmentPanel,
            fields: [
                'Status',
                'AvailableFrom',
                'AvailableTo',
                'EntitlementGrantTiming',
                'EntitlementQuantityMode',
                'EntitlementValidityMode',
                'SuccessorProductID',
            ],
        },
    ])('the $name panel declares its fields in its own template', ({ panel, fields }) => {
        // Declared in the panel template => a ContentChild of mj-collapsible-panel =>
        // hasRenderableContent() can see it. Declared in the widget => invisible.
        expect(FieldNames(PanelTemplate(panel))).toEqual(fields);
    });

    it.each([
        { name: 'subscription', html: SUBSCRIPTION_WIDGET_HTML },
        { name: 'fulfillment', html: FULFILLMENT_WIDGET_HTML },
        { name: 'accounting', html: ACCOUNTING_WIDGET_HTML },
    ])('the $name widget projects the fields instead of declaring them', ({ html }) => {
        expect(FieldNames(html)).toEqual([]);
        expect(html).toContain('<ng-content>');
    });

    /**
     * golive#255 — Accounting kept its fields inside the widget so the panel could never
     * hide-when-empty and take the GL links with it. The cost was that the section saw no
     * fields at all, so the rail never badged it: not before a save, while CompanyID and
     * RevenueRecognitionTypeID sat required-and-empty, and not after the failed save either,
     * when both carried inline errors. The fields now live in the panel template; the GL links
     * stay in the widget and are still rendered.
     */
    it('the accounting widget still renders the GL links beside the projected fields', () => {
        expect(ACCOUNTING_WIDGET_HTML).toContain('bizapps-product-gl-links');
    });

    it('the accounting panel can never be hidden as empty on a saved record', () => {
        // hide-when-empty triggers only when EVERY projected field is hidden. The panel projects
        // the two NOT NULL lookups, which a saved record always has a value for, so the GL links
        // cannot be hidden along with an all-blank section.
        const declared = FieldNames(PanelTemplate(ProductAccountingPanel));
        expect(declared).toContain('CompanyID');
        expect(declared).toContain('RevenueRecognitionTypeID');
    });
});

/**
 * golive#233 — the header claimed `productIdentification` but rendered a read-only hero, so
 * Name, SKU and Description had no input anywhere on the form. A claim hides the generated
 * section outright, rail item and Manage Sections entry included, so there is no fallback:
 * the claiming panel is the only place those fields can be edited. Name is required, so a
 * product could be neither created nor renamed.
 */
describe('The Product header panel owns the identification fields it claims', () => {
    it('claims the generated productIdentification section', () => {
        expect(PanelRegistrationMetadata(ProductHeaderPanel)?.['replacesSectionKey']).toBe(
            'productIdentification'
        );
    });

    it('renders every field of that section, bound to EditMode', () => {
        const rendered = FieldNames(PRODUCT_HEADER_HTML);
        const claimed = GeneratedSectionFields('productIdentification');
        expect(claimed).toContain('Name');

        const lost = claimed.filter((field) => !rendered.includes(field));
        expect(lost, 'replacing a generated section must not drop its fields').toEqual([]);

        // Read-only interpolation of a claimed field is what caused the bug; the fields have
        // to be real inputs when the form is in edit mode.
        expect(PRODUCT_HEADER_HTML).toContain('[EditMode]="EditMode"');
        expect(PRODUCT_HEADER_HTML).toContain('@if (EditMode) {');
    });
});

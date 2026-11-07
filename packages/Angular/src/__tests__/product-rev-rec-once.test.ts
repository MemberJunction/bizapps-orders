import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { ProductAccountingPanel } from '../lib/form-panels/product-widget.panels';
import { ProductHeaderPanel } from '../lib/form-panels/product-header.panel';
import { MJOProductRevRecFieldComponent } from '../lib/form-panels/product-rev-rec-field.component';
import {
    LoadProductLookupNames,
    ProductLookupNamesTracker,
    REV_REC_FROM_TYPE_LABEL,
} from '../lib/panels/product-lookup-names';

/**
 * bc-aidp-next-golive#436 — the product header said Percentage of Completion while Accounting said
 * Up Front for the same product. The header resolved the name from the id; Accounting showed the
 * record's virtual `RevenueRecognitionType` name, which still held the previous type. Both now read
 * the id-resolved name, with the type default booking falls back to.
 */

const POC = 'aaaaaaaa-0000-0000-0000-000000000001';
const UP_FRONT = 'aaaaaaaa-0000-0000-0000-000000000002';
const PT_SERVICE = 'bbbbbbbb-0000-0000-0000-000000000001';

const REV_REC_NAMES: Record<string, string> = {
    [POC]: 'Percentage of Completion',
    [UP_FRONT]: 'Up Front',
};

function mockEngine(typeDefault: string | null = UP_FRONT) {
    const engine = {
        EnsureLoaded: async () => undefined,
        ProductTypeByID: (id: string) =>
            id === PT_SERVICE ? { Name: 'Service', DefaultRevenueRecognitionTypeID: typeDefault } : undefined,
        ProductCategoryByID: () => undefined,
        ProductByID: () => undefined,
        RevenueRecognitionTypeByID: (id: string | null | undefined) =>
            id && REV_REC_NAMES[id] ? { ID: id, Name: REV_REC_NAMES[id] } : undefined,
    };
    return vi.spyOn(OrdersEngine, 'Instance', 'get').mockReturnValue(engine as never);
}

/** The id moved to POC; the virtual name was hydrated before and still says Up Front. */
function staleProduct(overrides: Record<string, unknown> = {}) {
    return {
        ProductTypeID: PT_SERVICE,
        ProductCategoryID: null,
        SuccessorProductID: null,
        RevenueRecognitionTypeID: POC,
        RevenueRecognitionType: 'Up Front',
        ...overrides,
    } as never;
}

/** Header and field instances without Angular's injector; the tracker is what they render from. */
function header(record: unknown, tracker: ProductLookupNamesTracker): ProductHeaderPanel {
    const panel = Object.create(ProductHeaderPanel.prototype) as ProductHeaderPanel;
    Object.assign(panel, { Record: record, lookups: tracker });
    return panel;
}

function accountingField(record: unknown, tracker: ProductLookupNamesTracker): MJOProductRevRecFieldComponent {
    const field = Object.create(MJOProductRevRecFieldComponent.prototype) as MJOProductRevRecFieldComponent;
    Object.assign(field, { Record: record, lookups: tracker });
    return field;
}

afterEach(() => vi.restoreAllMocks());

describe('Product revenue recognition shows one value (golive#436)', () => {
    it('resolves the name from the id, not the stale virtual name', async () => {
        mockEngine();
        const names = await LoadProductLookupNames(staleProduct());
        expect(names.RevRec).toBe('Percentage of Completion');
        expect(names.RevRecID).toBe(POC);
        expect(names.RevRecFromType).toBe(false);
    });

    it('the header and the Accounting field show the id\'s name, with no source label', async () => {
        mockEngine();
        const record = staleProduct();
        const headerTracker = new ProductLookupNamesTracker();
        const fieldTracker = new ProductLookupNamesTracker();
        await headerTracker.Refresh(record);
        await fieldTracker.Refresh(record);

        const h = header(record, headerTracker);
        const f = accountingField(record, fieldTracker);
        expect(h.RevRec).toBe('Percentage of Completion');
        expect(f.Names.RevRec).toBe('Percentage of Completion');
        expect(h.RevRecSource).toBeNull();
        expect(f.Source).toBeNull();
    });

    it('follows an edit of the id', async () => {
        mockEngine();
        const record = staleProduct() as unknown as { RevenueRecognitionTypeID: string };
        let resolved = 0;
        const tracker = new ProductLookupNamesTracker(() => resolved++);
        await tracker.Refresh(record as never);
        expect(tracker.For(record as never).RevRec).toBe('Percentage of Completion');

        record.RevenueRecognitionTypeID = UP_FRONT;
        tracker.For(record as never); // starts the re-resolve, as a template read does
        await vi.waitFor(() => expect(tracker.Names.RevRec).toBe('Up Front'));
        expect(resolved).toBe(2);
    });

    it('falls back to the product type default, as booking does, and labels the source', async () => {
        mockEngine(UP_FRONT);
        const record = staleProduct({ RevenueRecognitionTypeID: '', RevenueRecognitionType: 'Percentage of Completion' });
        const tracker = new ProductLookupNamesTracker();
        await tracker.Refresh(record);

        expect(tracker.Names.RevRec).toBe('Up Front');
        expect(tracker.Names.RevRecID).toBe(UP_FRONT);
        expect(tracker.Names.RevRecFromType).toBe(true);
        expect(header(record, tracker).RevRecSource).toBe(REV_REC_FROM_TYPE_LABEL);
        expect(accountingField(record, tracker).Source).toBe(REV_REC_FROM_TYPE_LABEL);
    });

    it('shows a dash, not the virtual name, when neither the product nor its type sets one', async () => {
        mockEngine(null);
        const names = await LoadProductLookupNames(
            staleProduct({ RevenueRecognitionTypeID: '', RevenueRecognitionType: 'Up Front' }),
        );
        expect(names.RevRec).toBe('—');
        expect(names.RevRecID).toBeNull();
        expect(names.RevRecFromType).toBe(false);
    });

    it('Accounting renders the resolved value in read mode and keeps the picker in edit mode', () => {
        const template = (ProductAccountingPanel as unknown as { __annotations__: { template: string }[] })
            .__annotations__[0].template;
        const editStart = template.indexOf('@if (EditMode) {');
        const elseStart = template.indexOf('} @else {', editStart);
        expect(editStart).toBeGreaterThan(-1);
        expect(elseStart).toBeGreaterThan(editStart);
        expect(template.slice(editStart, elseStart)).toContain('FieldName="RevenueRecognitionTypeID"');
        expect(template.slice(elseStart)).toContain('<mjo-product-rev-rec-field');
    });
});

// See seat-split.test.ts: the import graph needs the JIT compiler; nothing here bootstraps Angular.
import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * The line panel's dimension value list follows the order's company (#878). It was read once when
 * the order bound, so changing the company on an open draft kept the old company's values.
 */

function editor(companyID: string, readFor: string | undefined) {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    const reload = vi.fn(async () => undefined);
    Object.assign(c as object, {
        _order: { CompanyID: companyID },
        companyValuesReadFor: readFor,
        cdr: { detectChanges: () => undefined },
        loadCompanyDimensionValues: reload,
    });
    return { c, reload };
}

describe('company dimension values', () => {
    it('re-reads the list when the order changed company', () => {
        const { c, reload } = editor('COMPANY-B', 'company-a');
        c.ngDoCheck();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does nothing while the company is the one the list was read for', () => {
        const { c, reload } = editor('COMPANY-A', 'company-a');
        c.ngDoCheck();
        expect(reload).not.toHaveBeenCalled();
    });

    it('does nothing before the first read', () => {
        const { c, reload } = editor('COMPANY-A', undefined);
        c.ngDoCheck();
        expect(reload).not.toHaveBeenCalled();
    });
});

/**
 * What a row's checkbox is called to assistive technology on `mjo-worklist-table`: the host's
 * `RowLabel` when it gives one, else the row's key. Driven on a bare instance like the selection test.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { MJOWorklistTableComponent, type MJORow } from '../worklist-table.component';

type Internals = {
    RowKey: string;
    RowLabel: ((row: MJORow) => string) | null;
    rowLabel(row: MJORow): string;
};

function table(label: ((row: MJORow) => string) | null): Internals {
    const t = Object.create(MJOWorklistTableComponent.prototype) as Internals;
    t.RowKey = 'SubscriptionID';
    t.RowLabel = label;
    return t;
}

const ROW: MJORow = { SubscriptionID: '3E049FC1-094E-404D-A0E7-D729BB69AFF2', SubscriptionNumber: 'SUB-000042', ContactName: 'Jordan Blake' };

describe('mjo-worklist-table row checkbox label', () => {
    it('uses the host\'s words when it gives them, so a screen reader never hears a GUID', () => {
        const t = table((row) => `Select ${row['SubscriptionNumber']}, ${row['ContactName']}`);
        expect(t.rowLabel(ROW)).toBe('Select SUB-000042, Jordan Blake');
    });

    it('falls back to the row key when the host gives no label', () => {
        expect(table(null).rowLabel(ROW)).toBe('Select 3E049FC1-094E-404D-A0E7-D729BB69AFF2');
        expect(table(null).rowLabel({})).toBe('Select ');
    });
});

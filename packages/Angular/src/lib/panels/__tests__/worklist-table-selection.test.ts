/**
 * Ticking rows on `mjo-worklist-table`: the table proposes a full key set and the host owns it.
 *
 * Driven through the component's own methods on a bare instance (no template), the way the other
 * panel tests do it: the rules worth holding are which rows may be ticked, that tick-all touches
 * only the rows on screen, and that a hidden row's tick survives a tick-all on the rest.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { MJOWorklistTableComponent, type MJORow } from '../worklist-table.component';

type Internals = {
    Rows: MJORow[];
    RowKey: string;
    Selectable: boolean;
    SelectedKeys: ReadonlyArray<string>;
    SelectableRow: ((row: MJORow) => boolean) | null;
    SelectionChanged: { emit(keys: string[]): void; observed: boolean };
    canSelect(row: MJORow): boolean;
    isTicked(row: MJORow): boolean;
    allVisibleSelected(): boolean;
    someVisibleSelected(): boolean;
    toggle(row: MJORow, ticked: boolean): void;
    toggleAll(ticked: boolean): void;
};

function table(rows: MJORow[], selected: string[] = [], selectable: ((row: MJORow) => boolean) | null = null): { t: Internals; emitted: string[][] } {
    const emitted: string[][] = [];
    const t = Object.create(MJOWorklistTableComponent.prototype) as Internals;
    t.Rows = rows;
    t.RowKey = 'ID';
    t.Selectable = true;
    t.SelectedKeys = selected;
    t.SelectableRow = selectable;
    t.SelectionChanged = { emit: (keys) => emitted.push([...keys].sort()), observed: true };
    return { t, emitted };
}

const ROWS: MJORow[] = [{ ID: 'a' }, { ID: 'b' }, { ID: 'c', Locked: true }];

describe('mjo-worklist-table selection', () => {
    it('ticks and unticks one row, emitting the whole set each time', () => {
        const { t, emitted } = table(ROWS, ['a']);
        t.toggle(ROWS[1], true);
        t.toggle(ROWS[0], false);
        expect(emitted).toEqual([['a', 'b'], []]);
    });

    it('lets the host say which rows may be ticked, and tick-all skips the rest', () => {
        const { t, emitted } = table(ROWS, [], (row) => !row['Locked']);
        expect(t.canSelect(ROWS[2])).toBe(false);
        t.toggleAll(true);
        expect(emitted).toEqual([['a', 'b']]);
        t.SelectedKeys = ['a', 'b'];
        expect(t.allVisibleSelected()).toBe(true);
        expect(t.someVisibleSelected()).toBe(false);
    });

    it('tick-all touches only the rows on screen, so a tick on a row a preset hid survives', () => {
        const { t, emitted } = table([ROWS[0]], ['c']);
        t.toggleAll(true);
        expect(emitted).toEqual([['a', 'c']]);
        t.SelectedKeys = ['a', 'c'];
        t.toggleAll(false);
        expect(emitted[1]).toEqual(['c']);
    });

    it('reports a partial selection as indeterminate, never as all', () => {
        const { t } = table(ROWS, ['a']);
        expect(t.someVisibleSelected()).toBe(true);
        expect(t.allVisibleSelected()).toBe(false);
    });

    it('is all-ticked only when there is something to tick', () => {
        const { t } = table([], []);
        expect(t.allVisibleSelected()).toBe(false);
    });
});

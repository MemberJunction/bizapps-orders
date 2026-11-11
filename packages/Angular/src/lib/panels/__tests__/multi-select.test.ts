/**
 * `mjo-multi-select`: the host owns the selection, the component proposes the next one.
 *
 * Driven on a bare instance, like the other panel tests: what the trigger says, what a tick
 * emits, that the search narrows the list without touching the selection, and that Escape closes.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { MJOMultiSelectComponent, type MJOMultiSelectOption } from '../multi-select.component';

function picker(options: MJOMultiSelectOption[], selected: string[] = []): { p: MJOMultiSelectComponent; emitted: string[][] } {
    const emitted: string[][] = [];
    const p = new MJOMultiSelectComponent();
    p.Label = 'Company';
    p.Options = options;
    p.Selected = selected;
    p.SelectedChange.subscribe((v) => emitted.push(v));
    return { p, emitted };
}

const OPTIONS: MJOMultiSelectOption[] = [
    { Value: 'bc', Text: 'Blue Cypress', Count: 12 },
    { Value: 'ci', Text: 'Cimatri', Count: 3 },
    { Value: 'sp', Text: 'SoundPost', Count: 7 },
];

describe('mjo-multi-select', () => {
    it('reads "All" with nothing ticked, the name with one, and "n of m" with several', () => {
        expect(picker(OPTIONS).p.Summary).toBe('All');
        expect(picker(OPTIONS, ['ci']).p.Summary).toBe('Cimatri');
        expect(picker(OPTIONS, ['ci', 'sp']).p.Summary).toBe('2 of 3');
    });

    it('ticking adds to the selection and unticking removes, without mutating the input', () => {
        const { p, emitted } = picker(OPTIONS, ['bc']);
        p.Toggle('ci', true);
        p.Toggle('bc', false);
        expect(emitted).toEqual([['bc', 'ci'], []]);
        expect(p.Selected).toEqual(['bc']);
    });

    it('a tick without a stated direction flips the value', () => {
        const { p, emitted } = picker(OPTIONS, ['bc']);
        p.Toggle('bc');
        p.Toggle('sp');
        expect(emitted).toEqual([[], ['bc', 'sp']]);
    });

    it('Clear emits an empty selection only when something was ticked', () => {
        const a = picker(OPTIONS, ['bc']);
        a.p.Clear();
        expect(a.emitted).toEqual([[]]);
        const b = picker(OPTIONS);
        b.p.Clear();
        expect(b.emitted).toEqual([]);
    });

    it('the search narrows the list by name, case-insensitively, and leaves the selection alone', () => {
        const { p, emitted } = picker(OPTIONS, ['bc']);
        p.Filter = 'SOUND';
        expect(p.FilteredOptions.map((o) => o.Value)).toEqual(['sp']);
        p.Filter = '';
        expect(p.FilteredOptions).toHaveLength(3);
        expect(emitted).toEqual([]);
    });

    it('Toggle() with no value opens and closes, and closing forgets the search', () => {
        const { p } = picker(OPTIONS);
        p.Toggle();
        expect(p.IsOpen).toBe(true);
        p.Filter = 'bl';
        p.Toggle();
        expect(p.IsOpen).toBe(false);
        expect(p.Filter).toBe('');
    });

    it('Escape closes the panel and stops the key reaching the page', () => {
        const { p } = picker(OPTIONS);
        p.Toggle();
        let stopped = false;
        p.OnKey({ key: 'Escape', stopPropagation: () => (stopped = true) } as unknown as KeyboardEvent);
        expect(p.IsOpen).toBe(false);
        expect(stopped).toBe(true);
    });
});

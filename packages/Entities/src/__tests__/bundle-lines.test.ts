/**
 * A bundle line goes with every line expanded beneath it, deleted child first (#793).
 */
import { describe, expect, it } from 'vitest';
import { ChildLinesFirst, DescendantLines } from '../bundle-lines.js';

const line = (ID: string, ParentOrderLineID: string | null = null) => ({ ID, ParentOrderLineID });

describe('DescendantLines', () => {
    it('finds children and grandchildren, case-insensitively, and not the parent', () => {
        const bundle = line('AAA');
        const child = line('BBB', 'aaa');
        const grandchild = line('CCC', 'BBB');
        const other = line('DDD');
        expect(DescendantLines(bundle, [bundle, child, grandchild, other])).toEqual([child, grandchild]);
    });

    it('finds nothing for a line that is not a bundle', () => {
        expect(DescendantLines(line('AAA'), [line('AAA'), line('BBB')])).toEqual([]);
    });

    it('finds nothing for a line with no ID yet', () => {
        expect(DescendantLines(line(''), [line('BBB', null)])).toEqual([]);
    });
});

describe('ChildLinesFirst', () => {
    it('puts each line ahead of the line it was expanded from', () => {
        const bundle = line('AAA');
        const child = line('BBB', 'AAA');
        const grandchild = line('CCC', 'BBB');
        expect(ChildLinesFirst([bundle, child, grandchild])).toEqual([grandchild, child, bundle]);
    });

    it('keeps unrelated lines in their original order', () => {
        const a = line('AAA');
        const b = line('BBB');
        expect(ChildLinesFirst([a, b])).toEqual([a, b]);
    });
});

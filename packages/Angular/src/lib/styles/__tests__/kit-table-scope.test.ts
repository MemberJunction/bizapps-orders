/**
 * The kit must not restyle MJ's own `.mj-table` outside the Orders sections (#904).
 *
 * The section shell loads `orders-kit.css` with ViewEncapsulation.None, so once any Orders section
 * renders the sheet stays in the document for the rest of the session. A bare `.mj-table` rule in it
 * then applies to every MJ and other-app table in Explorer.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const kit = readFileSync(join(import.meta.dirname, '..', 'orders-kit.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector in the sheet that names the `.mj-table` / `.mj-table-wrap` base classes. */
function baseTableSelectors(): string[] {
    const selectors: string[] = [];
    for (const match of kit.matchAll(/([^{}]+)\{/g)) {
        for (const raw of match[1].split(',')) {
            const selector = raw.trim();
            if (/\.mj-table(?![\w-])|\.mj-table-wrap(?![\w-])/.test(selector) && !selector.startsWith('@')) {
                selectors.push(selector);
            }
        }
    }
    return selectors;
}

describe('orders-kit .mj-table rules', () => {
    it('finds the table rules', () => {
        expect(baseTableSelectors().length).toBeGreaterThan(5);
    });

    it('scopes every one to the Orders sections', () => {
        const unscoped = baseTableSelectors().filter(
            (s) => !s.startsWith(':where(mjo-section-shell)') && !s.startsWith('mjo-section-shell') && !s.startsWith('.mj-doc '),
        );
        expect(unscoped, 'these rules restyle MJ tables everywhere in Explorer').toEqual([]);
    });
});

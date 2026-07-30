/**
 * Guards the two ways the component kit can silently stop being loaded.
 *
 * BOTH FAILURES ARE INVISIBLE. A dropped `@import` produces no console error and
 * no failed request — the rules simply are not there, and the page renders with
 * whatever else happened to match. The mockups shipped in exactly that state
 * until a browser screenshot caught the order document laying out unstyled. The
 * existing jsdom harness could not have caught it: jsdom neither follows
 * `@import` nor computes layout, so every mockup "rendered clean" the whole time.
 *
 * These are cheap textual checks precisely because the expensive check (a real
 * browser) is not part of the unit suite.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const appCss = readFileSync(join(REPO, 'mockups', 'assets', 'app.css'), 'utf8');
const pkgJson = JSON.parse(readFileSync(join(REPO, 'packages', 'Angular', 'package.json'), 'utf8'));
const explorerScss = readFileSync(
    join(REPO, 'apps', 'MJExplorer', 'src', 'styles.scss'),
    'utf8',
);

describe('mockup stylesheet chain', () => {
    it('imports the canonical kit rather than copying it', () => {
        expect(appCss).toContain('orders-kit.css');
    });

    it('puts the @import before any rule, or the browser drops it', () => {
        // CSS only honours `@import` ahead of every other rule. Comments and
        // whitespace are fine; a single declaration block before it is fatal.
        const withoutComments = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
        const importAt = withoutComments.indexOf('@import');
        const firstRuleAt = withoutComments.search(/[^\s@][^\n{]*\{/);

        expect(importAt, 'app.css no longer imports anything').toBeGreaterThanOrEqual(0);
        expect(
            firstRuleAt === -1 || importAt < firstRuleAt,
            'the @import sits after a rule, so browsers will silently ignore it and ' +
                'every kit-styled component in the mockups will render unstyled',
        ).toBe(true);
    });
});

describe('shipped package stylesheet', () => {
    it('copies the kit into dist — ngc does not, it only compiles TypeScript', () => {
        expect(pkgJson.scripts.build).toMatch(/build:styles/);
        expect(pkgJson.scripts['build:styles']).toContain('orders-kit.css');
    });

    it('exposes the kit as a declared exports subpath', () => {
        // Angular's sass plugin honours the exports map, so a host importing a
        // `dist/...` path fails to resolve even though bare `sass --load-path`
        // accepts it. The subpath is what makes the host import work.
        expect(pkgJson.exports).toHaveProperty('./styles/orders-kit.css');
    });

    it('is actually loaded by the Explorer host', () => {
        // Without this line every Orders screen renders unstyled in the real app.
        expect(explorerScss).toContain('@mj-biz-apps/orders-ng/styles/orders-kit.css');
    });
});

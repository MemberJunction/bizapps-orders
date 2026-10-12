/**
 * No package source doubles quotes by hand when building SQL filter text.
 *
 * `CLAUDE.md` bans inline `.replace(/'/g, "''")` in filters: it misses `\0` and turns `null` into
 * the text "null". Text goes through `EscapeSQLString` from `@memberjunction/global`; ids through
 * `RequireUUID(s)`. This scans every package's `src` so a new site fails here, not in review.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const PATTERN = /\.replace\(\/'\/g/;

/**
 * Files allowed to keep the pattern. `sql-guards.ts` is the guard itself. The other three are
 * fixed by an open server-side security PR; remove each entry once that fix is on `next` (#665).
 */
const ALLOWED = new Set([
    'packages/CoreEntitiesServer/src/sql-guards.ts',
    'packages/CoreEntitiesServer/src/CapturePaymentOperation.ts',
    'packages/CoreEntitiesServer/src/OrderEntityServer.ts',
    'packages/CoreEntitiesServer/src/PaymentIntentService.ts',
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(path);
        return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [path] : [];
    });
}

/** Code lines only: doc comments that name the banned pattern are not uses of it. */
function usesPattern(text: string): boolean {
    return text.split('\n').some((line) => {
        const t = line.trim();
        return !t.startsWith('*') && !t.startsWith('//') && PATTERN.test(t);
    });
}

describe('package source', () => {
    it('has no hand-rolled quote doubling outside the allowlist', () => {
        const packages = join(ROOT, 'packages');
        const offenders = readdirSync(packages, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .flatMap((e) => {
                const src = join(packages, e.name, 'src');
                try {
                    return sourceFiles(src);
                } catch {
                    return [];
                }
            })
            .map((f) => relative(ROOT, f).split('\\').join('/'))
            .filter((f) => !ALLOWED.has(f))
            .filter((f) => usesPattern(readFileSync(join(ROOT, f), 'utf8')));
        expect(offenders).toEqual([]);
    });

    it('still finds the pattern in the allowlisted guard, so the scan is not vacuous', () => {
        const guard = join(ROOT, 'packages/CoreEntitiesServer/src/sql-guards.ts');
        expect(usesPattern(readFileSync(guard, 'utf8'))).toBe(true);
    });
});

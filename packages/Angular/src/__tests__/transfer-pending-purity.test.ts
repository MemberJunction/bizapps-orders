import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TIER 1 — parking-discipline guard (see `lib/transfer-pending/README.md`).
 *
 * Components in `lib/transfer-pending/` are PARKED here and are owed to
 * `@memberjunction/ng-ui-components`. The rule that keeps extraction a file move rather than a
 * refactor: **they may not import anything orders-specific.**
 *
 * A prose rule decays the moment someone is in a hurry. This test is the enforcement — it fails the
 * build the moment a parked component reaches for an orders type. Do not weaken it; if a component
 * genuinely needs an orders type, it is not framework-clean and belongs beside its page instead.
 *
 * Ported from `bizapps-accounting`, which parks the identical framework. The duplication is the
 * argument for promoting it, and BOTH guards should disappear on the same day the component does.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TRANSFER_PENDING = join(HERE, '..', 'lib', 'transfer-pending');

/** Import specifiers a parked component must never reach for. */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
    { pattern: /@mj-biz-apps\/orders-/, why: 'an orders package (entities/server/actions)' },
    { pattern: /@mj-biz-apps\/(accounting|common|tasks)-/, why: 'a sibling app package (parked code must not bind to a sibling either)' },
    { pattern: /from\s+['"](\.\.\/)+(pages|panels|sections|services)\//, why: "this app's own UI/domain folders" },
    { pattern: /from\s+['"](\.\.\/)+lib\/(pages|panels|sections|services)\//, why: "this app's own UI/domain folders" },
    { pattern: /from\s+['"](\.\.\/)+generated\//, why: "this app's generated entity code" },
];

/** Every import specifier in a TS source file (static imports, type imports, and re-exports). */
function importSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) specifiers.push(match[1]);
    return specifiers;
}

function tsFilesUnder(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) found.push(...tsFilesUnder(full));
        else if (entry.endsWith('.ts')) found.push(full);
    }
    return found;
}

describe('transfer-pending parking discipline', () => {
    const files = tsFilesUnder(TRANSFER_PENDING);

    it('finds the parked components (the guard is actually pointed at something)', () => {
        // Without this, deleting or moving the folder would make every assertion below pass vacuously
        // — a guard that guards nothing is worse than no guard, because it still reports green.
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files.map((f) => [relative(TRANSFER_PENDING, f), f]))(
        '%s imports nothing orders-specific',
        (_label, file) => {
            const source = readFileSync(file, 'utf8');
            const specifiers = importSpecifiers(source);

            const violations = specifiers.flatMap((specifier) =>
                FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(specifier) || pattern.test(`from '${specifier}'`)).map(
                    ({ why }) => `"${specifier}" reaches into ${why}`,
                ),
            );

            expect(
                violations,
                `${relative(TRANSFER_PENDING, file)} breaks parking discipline:\n  ${violations.join('\n  ')}\n` +
                    'Parked components must extract as a file move. Either drop the dependency (pass it in as an ' +
                    '@Input/generic) or move the component beside its page — it is not framework-clean.',
            ).toEqual([]);
        },
    );
});

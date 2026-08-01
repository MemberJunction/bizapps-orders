/**
 * Every component that loads asynchronously must write the DOM when the data lands.
 *
 * WHY. The section shell creates pages imperatively via
 * `ViewContainerRef.createComponent`. When such a component assigns loaded data
 * across Angular's check/verify boundary, dev mode raises NG0100 and ABORTS the
 * update. Nothing schedules another pass, and the failure is self-sustaining: the
 * recorded "previous" value stays pre-load while the getter returns the loaded
 * one, so every later tick mismatches and aborts too. The view is frozen for good.
 *
 * The symptom is the worst kind — a screen full of zeros and empty states, which
 * reads as a quiet day rather than a broken page. The Orders dashboard showed
 * "0 open orders / $0.00" against 73 real orders.
 *
 * THIS GUARD EXISTS BECAUSE THE FIRST FIX MISSED HALF THE COMPONENTS. Two page
 * files declare TWO components each (pricing + promotions, products + charges),
 * and a per-file edit reached only the first. Promotions stayed frozen and looked
 * exactly like an empty catalog — while the database held four rows.
 *
 * Source-level on purpose: mounting nineteen pages in a real Angular environment
 * to assert a lifecycle detail costs far more than reading for the call.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

/** Every page file, across the section folders. */
const pageFiles = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '__tests__')
    .flatMap((d) =>
        readdirSync(join(ROOT, d.name))
            .filter((f) => f.endsWith('.page.ts'))
            .map((f) => join(d.name, f)),
    );

/** One entry per component class, since a file may declare several. */
interface Found {
    file: string;
    name: string;
    loadsAsync: boolean;
    rendersAfterLoad: boolean;
}

const components: Found[] = [];
for (const file of pageFiles) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const part of source.split(/(?=@Component\()/)) {
        const name = /export class (MJO\w+)/.exec(part)?.[1];
        if (!name) continue;
        const bodies = [
            ...part.matchAll(
                /(?:public|private|protected)\s+async\s+\w+\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\n    \}/g,
            ),
        ].map((m) => m[1]);
        components.push({
            file,
            name,
            loadsAsync: bodies.some((b) => b.includes('await') && /this\.\w+\s*=/.test(b)),
            rendersAfterLoad: part.includes('this.cdr.detectChanges()'),
        });
    }
}

describe('pages render what they load', () => {
    it('finds the page components', () => {
        // Guards the guard: an empty list would make the real assertion vacuous.
        expect(components.length).toBeGreaterThan(15);
    });

    it('finds more components than files, so multi-component files are covered', () => {
        // The bug this guard exists for. If this ever equals the file count, the
        // splitter has stopped seeing the second component in a file.
        expect(components.length).toBeGreaterThan(pageFiles.length);
    });

    const loaders = components.filter((c) => c.loadsAsync);

    it.each(loaders)('$name writes the DOM after loading', (component) => {
        expect(
            component.rendersAfterLoad,
            `${component.name} (${component.file}) assigns data after an await but never ` +
                `calls this.cdr.detectChanges(). Its view will freeze on the pre-load ` +
                `render and show empty states that look like real "no data".`,
        ).toBe(true);
    });
});

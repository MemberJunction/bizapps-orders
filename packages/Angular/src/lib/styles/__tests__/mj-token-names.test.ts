/**
 * Guard: every `var(--mj-…)` Orders reads must name a token MemberJunction defines.
 *
 * WHY THIS EXISTS. An undefined custom property fails silently: `var(--mj-color-border)` with no
 * definition resolves to its fallback when it has one, and to nothing when it does not, so the
 * border, colour or radius simply is not there. Neither the compiler nor a render test notices.
 * Orders read about fifty such names (`--mj-color-text-muted`, `--mj-status-danger-bg`,
 * `--mj-font-mono`, …) that look like MJ tokens but never existed in MJ's token sheet. Those with a
 * literal fallback rendered a fixed light-mode colour in dark mode; those without rendered nothing.
 *
 * WHAT COUNTS AS DEFINED.
 *   - A name in `mj-tokens.json`, the snapshot of MJ's `_tokens.scss` for the version this repo
 *     builds against (regenerate with `node packages/Angular/scripts/snapshot-mj-tokens.mjs`).
 *   - A name this repo declares itself: a `--mj-x:` declaration in CSS, or an Angular
 *     `[style.--mj-x]` binding. That covers the checkout widget's public theme hooks
 *     (`--mj-primary-color`, `--mj-bg-color`, …), which the widget sets on its own root from the
 *     theme record so an embedding page can restyle it.
 *
 * A fallback does not exempt a name. `var(--mj-color-border, #e2e8f0)` always renders the fallback,
 * which is a hardcoded light-mode colour wearing a token's name.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const ROOTS = [join(REPO, 'packages', 'Angular', 'src'), join(REPO, 'packages', 'Server', 'src')];
const SCANNED = /\.(css|scss|ts|html)$/;

const snapshot = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'mj-tokens.json'), 'utf8')) as {
    source: string;
    tokens: string[];
};

const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            if (entry !== '__tests__' && entry !== 'node_modules') walk(path, out);
        } else if (SCANNED.test(entry) && !entry.endsWith('.test.ts')) {
            out.push(path);
        }
    }
    return out;
};

const files = ROOTS.flatMap((root) => walk(root)).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/** Names the repo declares itself: `--mj-x: value` in CSS, or `[style.--mj-x]="…"` in a template. */
const declaredLocally = new Set<string>();
for (const { text } of files) {
    for (const m of text.matchAll(/(?<![\w(-])(--mj-[a-z0-9-]+)\s*:/g)) declaredLocally.add(m[1]);
    for (const m of text.matchAll(/\[style\.(--mj-[a-z0-9-]+)\]/g)) declaredLocally.add(m[1]);
}

const defined = new Set<string>([...snapshot.tokens, ...declaredLocally]);

const undefinedReads = (): string[] => {
    const found: string[] = [];
    for (const { path, text } of files) {
        for (const m of text.matchAll(/var\(\s*(--mj-[a-z0-9-]+)/g)) {
            if (defined.has(m[1])) continue;
            const line = text.slice(0, m.index).split('\n').length;
            found.push(`${m[1]} — ${relative(REPO, path)}:${line}`);
        }
    }
    return found.sort();
};

describe('MJ token names', () => {
    it('has a non-trivial snapshot of MJ tokens', () => {
        // An empty or truncated snapshot would make every read look undefined, or, read the other
        // way, a broken regex in the snapshot script would hide the whole sheet. 267 at 6.1.5.
        expect(snapshot.tokens.length).toBeGreaterThan(200);
        expect(snapshot.tokens).toContain('--mj-bg-surface');
        expect(snapshot.tokens).toContain('--mj-text-primary');
    });

    it('reads only --mj-* names MJ or this repo defines', () => {
        const bad = undefinedReads();
        expect(
            bad,
            `These var(--mj-…) reads name a token that ${snapshot.source} does not define and this ` +
                `repo does not declare, so they render their fallback or nothing. Use the MJ token ` +
                `with the same meaning (see _tokens.scss), or an app-prefixed --mjo-* variable for a ` +
                `value MJ has no token for.\n\n${bad.join('\n')}\n`,
        ).toEqual([]);
    });
});

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard: every class name the templates use must actually be styled somewhere.
 *
 * WHY THIS EXISTS. `orders-kit.css` opens by promising that it is the canonical
 * source and that "the mockups and the shipped UI cannot drift". They drifted.
 * The whole §16 LAYOUT HELPERS block — `small`, `muted`, `row`, `wrap`, `strong`,
 * `mono`, `tiny`, `spacer`, `sec-label` — was authored only in
 * `mockups/assets/app.css` and never migrated into the kit the app ships. The
 * markup referenced those classes 267 times and every one resolved to nothing:
 * captions rendered at full body size in full-strength ink and `.row` collapsed
 * from a flex row to a block stack. The mockups looked right, the app looked
 * flat, and nothing failed — because no test compared the two.
 *
 * A missing CSS rule is invisible to the compiler AND to a render test: the
 * element is present and the class attribute is correct, so a DOM assertion
 * passes while the page looks unstyled. Only a rule-existence check catches it,
 * which is what this is.
 *
 * WHAT IT DOES NOT DO. It checks that a rule EXISTS, not that it is correct — a
 * `.small` that set the wrong size would still pass. That is deliberate: the
 * cheap check catches the failure mode that actually shipped, and asserting
 * computed values belongs in a browser tier, not a filesystem test.
 */

const LIB = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Prefixes owned by something other than this app, so an undefined one here is
 * not evidence of a bug: Font Awesome, MemberJunction's own component library
 * (`mj-*` also covers this app's kit, which is checked by the same sweep because
 * the kit lives in `src/lib/styles`), Kendo, and Angular's own state classes.
 */
const EXTERNALLY_OWNED = /^(fa[srlbd]?-|fas$|far$|mj-|k-|ng-)/;

/**
 * Classes that are deliberately markup hooks with no styling of their own —
 * container names kept for readability and future targeting. Keep this list
 * SHORT and justify every entry; it is the escape hatch that could hide the very
 * bug this test exists to catch.
 */
const HOOK_ONLY = new Set<string>([
    'mjo-preflight', // panel root; every child is styled, the root needs nothing
]);

const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
};

const collect = () => {
    const files = walk(LIB);
    const templates = files.filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));

    // Static class attributes only. `[class]` / `[ngClass]` bindings are computed
    // at runtime and cannot be resolved by reading source.
    const used = new Map<string, Set<string>>();
    for (const file of templates) {
        for (const match of readFileSync(file, 'utf8').matchAll(/class="([^"{}]*)"/g)) {
            for (const token of match[1].split(/\s+/).filter(Boolean)) {
                if (!used.has(token)) used.set(token, new Set());
                used.get(token)!.add(file.slice(LIB.length));
            }
        }
    }

    // Rules come from three places: standalone .css, `styleUrls` targets (also
    // .css, already covered), and inline `styles: [...]` blocks on components.
    let stylesheets = files
        .filter((f) => extname(f) === '.css')
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
    for (const file of templates) {
        for (const match of readFileSync(file, 'utf8').matchAll(/styles:\s*\[([\s\S]*?)\]\s*,?\s*\}\)/g)) {
            stylesheets += `\n${match[1]}`;
        }
    }

    const defined = new Set<string>();
    for (const match of stylesheets.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(match[1]);
    // Attribute selectors style whole families at once (e.g. the shared
    // `[class*="mjo-"][class*="__note"]` note rule), so a literal `.mjo-ar__note`
    // never appears. Treat the substrings they match as defined.
    for (const match of stylesheets.matchAll(/\[class\*=["']([^"']+)["']\]/g)) defined.add(`*${match[1]}`);

    const isDefined = (cls: string) =>
        defined.has(cls) || [...defined].some((d) => d.startsWith('*') && cls.includes(d.slice(1)));

    return [...used.entries()]
        .filter(([cls]) => !EXTERNALLY_OWNED.test(cls) && !HOOK_ONLY.has(cls) && !isDefined(cls))
        .map(([cls, where]) => `.${cls} — used in ${[...where].sort().join(', ')}`)
        .sort();
};

describe('kit classes', () => {
    it('styles every app-owned class the templates reference', () => {
        const undefinedClasses = collect();
        expect(
            undefinedClasses,
            `These classes appear in a template but no rule defines them, so they render as ` +
                `nothing. Add the rule to orders-kit.css (if shared) or the component's own ` +
                `styles (if local) — or add it to HOOK_ONLY with a reason if it is genuinely ` +
                `a bare markup hook.\n\n${undefinedClasses.join('\n')}\n`,
        ).toEqual([]);
    });
});

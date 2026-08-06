/**
 * Every component that assigns loaded data asynchronously must write the DOM when it lands.
 *
 * WHY. The section shell creates pages imperatively via `ViewContainerRef.createComponent`, and
 * the app runs zoneless. A component that assigns across Angular's check/verify boundary raises
 * NG0100 and ABORTS the update; nothing schedules another pass, and the failure is
 * self-sustaining — the recorded "previous" value stays pre-load while the getter returns the
 * loaded one, so every later tick mismatches and aborts too. The view is frozen for good.
 *
 * The symptom is the worst kind — a screen full of zeros and empty states, which reads as a quiet
 * day rather than a broken page. The Orders dashboard showed "0 open orders / $0.00" against 73
 * real orders.
 *
 * ── 2026-08-03: THIS GUARD WAS GREEN WHILE THREE INSTANCES OF ITS OWN BUG SHIPPED. ────────────
 * Found by driving Fast entry against a real database. All three froze a view; none tripped this
 * test. Each blind spot is now closed, and each is worth knowing because they are easy to
 * re-introduce:
 *
 *   1. SCOPE — it read only `pages/**\/*.page.ts`. Two of the three bugs were in
 *      `sections/orders-sections.component.ts` (OpenPreflight / ConfirmFromPreflight), which was
 *      never scanned at all. Now every @Component under pages/, sections/ and panels/ is read.
 *
 *   2. GRANULARITY — `rendersAfterLoad` was `part.includes('this.cdr.detectChanges()')`, i.e.
 *      satisfied by ONE call anywhere in the component. `fast-entry.page.ts` has four, and its
 *      preview callback still lacked one, so the component passed while a line sat on
 *      "— resolving…" for ever and Confirm never enabled. The call must now be in the SAME body
 *      as the assignment.
 *
 *   3. SHAPE — it only matched `async name(): Promise<void>` methods. The preview bug assigned
 *      inside an arrow CALLBACK (`SchedulePreview(draft, (state) => { this.Preview = state })`),
 *      and the pre-flight bugs assigned in a `finally` block. Callback bodies that assign `this.x`
 *      are now checked too.
 *
 * Source-level on purpose: mounting every page in a real Angular environment to assert a
 * lifecycle detail costs far more than reading for the call.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIB = join(import.meta.dirname, '..', '..');

/** Every component-bearing source file under the folders that host imperatively-created views. */
function sourceFiles(): string[] {
    const roots = ['pages', 'sections', 'panels'];
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '__tests__') walk(full);
            } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
                out.push(full);
            }
        }
    };
    for (const r of roots) {
        const dir = join(LIB, r);
        try {
            if (statSync(dir).isDirectory()) walk(dir);
        } catch {
            /* folder may not exist in every app */
        }
    }
    return out;
}

/** Read a balanced `{ … }` block starting at the brace at `open`. */
function block(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    return src.slice(open + 1);
}

interface Body {
    file: string;
    component: string;
    what: string;
    source: string;
}

/**
 * Fields a template can actually bind to. Angular can only read public/protected members, so an
 * assignment to a PRIVATE field cannot require a repaint — `catalogCache`, `companyCache` and
 * `tenderCache` in the section shell are memoisation, not view state.
 *
 * This is a narrowing on a real semantic boundary, not a way to quieten the test: anything the
 * view can see is still required to tick. Widen this at your peril — the whole point of the guard
 * is that a frozen view looks exactly like a quiet day.
 */
function privateFields(part: string): Set<string> {
    return new Set([...part.matchAll(/private\s+(?:readonly\s+)?(\w+)\s*[:=]/g)].map((m) => m[1]));
}

/** Bodies that assign `this.x` somewhere an Angular tick is not implied. */
function asyncBodies(file: string, component: string, part: string): Body[] {
    const found: Body[] = [];
    const privates = privateFields(part);
    const assignsViewState = (body: string): boolean =>
        [...body.matchAll(/this\.(\w+)\s*=[^=]/g)].some((m) => !privates.has(m[1]));

    // (a) async methods — any return type, not just Promise<void>
    for (const m of part.matchAll(/(?:public|private|protected)?\s*async\s+(\w+)\s*\([^)]*\)[^{]*\{/g)) {
        const body = block(part, part.indexOf('{', m.index));
        if (/\bawait\b/.test(body) && assignsViewState(body)) {
            found.push({ file, component, what: `async ${m[1]}()`, source: body });
        }
    }

    // (b) arrow callbacks whose block assigns `this.x` — these run from timers, promises and
    //     subscriptions, i.e. outside anything Angular is watching.
    for (const m of part.matchAll(/\([^()]*\)\s*=>\s*\{/g)) {
        const body = block(part, part.indexOf('{', m.index));
        if (!assignsViewState(body)) continue;
        if (body.length > 4000) continue; // a whole class body, not a callback
        found.push({ file, component, what: 'callback assigning this.*', source: body });
    }

    return found;
}

const bodies: Body[] = [];
const componentNames = new Set<string>();
for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('@Component(')) continue;
    const rel = file.slice(LIB.length + 1);
    for (const part of source.split(/(?=@Component\()/)) {
        // NEVER skip a part for want of a class name. Splitting on `@Component(` puts a file's
        // FIRST class body in the leading part, which may carry no `export class` match at all —
        // that is exactly what happened to orders-sections.component.ts, whose ten async methods
        // (OpenPreflight and ConfirmFromPreflight among them) were dropped on the floor while
        // this test reported green. Fall back to the filename so code is analysed either way.
        const name = /export class (\w+)/.exec(part)?.[1] ?? rel.split('/').pop() ?? rel;
        componentNames.add(name);
        bodies.push(...asyncBodies(rel, name, part));
    }
}

describe('components render what they load', () => {
    it('finds components across pages, sections and panels', () => {
        // Guards the guard: an empty list makes every assertion below vacuous, which is exactly
        // how this test stayed green while the bug it exists for shipped three times.
        expect(componentNames.size).toBeGreaterThan(15);
    });

    it('reaches the section shell, not just pages', () => {
        // The two pre-flight freezes lived here and were never scanned.
        expect([...bodies].some((b) => b.file.startsWith('sections/'))).toBe(true);
    });

    it('finds async/callback bodies to check', () => {
        expect(bodies.length).toBeGreaterThan(10);
    });

    it.each(bodies)('$component · $what ($file) ticks after assigning', (body) => {
        expect(
            /this\.cdr\.detectChanges\(\)/.test(body.source),
            `${body.component} — ${body.what} in ${body.file} assigns this.* after an await (or ` +
                `from a callback) but never calls this.cdr.detectChanges() IN THAT BODY. The view ` +
                `will freeze on its pre-load render and show empty states that read as real "no data". ` +
                `A detectChanges() elsewhere in the component does not help: only a tick in this body ` +
                `repaints this assignment.`,
        ).toBe(true);
    });
});

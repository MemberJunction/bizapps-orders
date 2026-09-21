/**
 * @fileoverview Resolve which migration the database ACTUALLY runs last for a layered view.
 *
 * WHY THIS EXISTS. CodeGen owns `vw<X>Generated` and regenerates it wholesale on any schema change.
 * `vw<X>` is hand-written on top, so every schema change forces a human to re-type it — and
 * hand-added logic is exactly what goes missing when they start from a stale copy.
 *
 * THAT IS NOT HYPOTHETICAL. bizapps-contracts PR #59 (2026-09-20) re-created `vwContracts` and its
 * `IsAwaitingDocument` lost the File/FileCategory joins and the `fc.Name = 'Executed Agreement'`
 * predicate that a migration three weeks earlier existed to add. Any attached file — an exhibit, a
 * draft, the wrong PDF — has cleared the "awaiting paper" warning ever since.
 *
 * AND THE GUARD THAT SHOULD HAVE CAUGHT IT WENT GREEN. It resolved the newest definer with a regex
 * requiring `CREATE OR ALTER VIEW`. #59 used `DROP VIEW` + `CREATE VIEW`, so it was filtered OUT of
 * the candidate list, `.pop()` fell back to the older file, and the suite went on asserting —
 * truthfully — about a migration the database no longer runs last.
 *
 * So the selector here matches ANY DDL that names the view, and separately asserts that nothing
 * after the resolved file mentions the view at all. The second check is what catches a definer
 * written in a form this regex has not been taught yet.
 *
 * Comments are stripped before any matching. A required predicate must be satisfied by executable
 * SQL, never by prose that happens to quote it — copying a comment block forward is precisely how a
 * stale retype looks.
 */
import { readdirSync, readFileSync } from 'node:fs';

/** SQL with `--` line comments and block comments removed, so prose can never satisfy an assertion. */
export function sqlCode(sql: string): string {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Any DDL naming the view: `CREATE VIEW`, `CREATE OR ALTER VIEW`, or `DROP VIEW`. */
function ddlFor(view: string): RegExp {
    return new RegExp(
        String.raw`\b(?:CREATE\s+(?:OR\s+ALTER\s+)?VIEW|DROP\s+VIEW)\s+\[[^\]]+\]\.\[${view}\]`,
        'i',
    );
}

export interface ViewDefiner {
    /** The migration the database runs last for this view. */
    file: string;
    /** That file's SQL, comments stripped. */
    code: string;
    /** Every migration that has ever defined the view, in apply order. */
    chain: string[];
}

/**
 * The newest migration defining `view`, by filename order — which is apply order, because the
 * repo's migration-filename convention makes the timestamp prefix monotonic.
 *
 * @throws if no migration defines the view, or if a later migration mentions it without matching
 *   the DDL patterns above — that means a definer form exists which this helper cannot see, and
 *   failing loudly is the only safe answer.
 */
export function newestViewDefiner(migrationsDir: string, view: string): ViewDefiner {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const read = (f: string) => sqlCode(readFileSync(`${migrationsDir}/${f}`, 'utf8'));
    const ddl = ddlFor(view);

    const chain = files.filter((f) => ddl.test(read(f)));
    if (chain.length === 0) {
        throw new Error(`No migration defines [${view}] — a guard over it would assert against nothing.`);
    }
    const file = chain[chain.length - 1];

    const mentionsAfter = files.filter((f) => f > file && new RegExp(String.raw`\[${view}\]`).test(read(f)));
    if (mentionsAfter.length > 0) {
        throw new Error(
            `[${view}] is mentioned by migrations AFTER its newest recognised definer ${file}: ` +
            `${mentionsAfter.join(', ')}. Either they redefine it in a form newestViewDefiner does not ` +
            `match — in which case teach it that form — or the guard is now pointed at stale SQL.`,
        );
    }
    return { file, code: read(file), chain };
}

/** The aliased output columns of a view body, so a re-creation cannot silently drop one. */
export function derivedColumns(code: string): string[] {
    return [...code.matchAll(/\bAS\s+\[([A-Za-z_][A-Za-z0-9_]*)\]/g)].map((m) => m[1]);
}

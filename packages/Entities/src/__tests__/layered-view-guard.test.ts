/**
 * @fileoverview The guard that would have caught bizapps-contracts PR #59.
 *
 * Two assertions per layered view, and they fail for different reasons on purpose.
 *
 * 1. THE NEWEST DEFINER IS THE ONE WE THINK IT IS. `newestViewDefiner` matches any DDL naming the
 *    view and throws if a later migration mentions it without matching. The previous generation of
 *    these guards matched only `CREATE OR ALTER VIEW`, so a `DROP VIEW` + `CREATE VIEW` definer was
 *    filtered out and the selector fell back to older SQL while reporting success.
 *
 * 2. A RE-CREATION MAY ADD COLUMNS BUT NEVER DROP ONE. Cheap, needs no curation, and catches the
 *    accidental-deletion half of this failure class. It does NOT catch logic changed inside a column
 *    that keeps its name — that is what the per-view required fragments below are for, and it is the
 *    half that has to be curated by hand because only a person knows which predicates are load-bearing.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { derivedColumns, newestViewDefiner, sqlCode } from './helpers/view-definer';

const MIGRATIONS = fileURLToPath(new URL('../../../../migrations', import.meta.url));

/**
 * Predicates that must survive every re-creation, per view. Matched against SQL with comments
 * stripped, so a copied comment block cannot satisfy one.
 */
const REQUIRED: Record<string, RegExp[]> = {
    vwOrderHeaders: [
        // The business day, not the UTC day (bc-aidp-next-golive#168). A re-creation that reverts to
        // CAST(GETUTCDATE() AS date) reads as overdue through the whole American evening.
        /CROSS\s+JOIN\s+\[__mj_BizAppsCommon\]\.\[fnBusinessToday\]\(\)\s+AS\s+bt/i,
        /bt\.Today/,
        // The outer view must read the CodeGen base view, never the table directly.
        /FROM\s+\[\$\{flyway:defaultSchema\}\]\.\[vwOrderHeadersGenerated\]/i,
    ],
};

describe('layered views: the newest definer is resolvable and loses nothing', () => {
    for (const view of Object.keys(REQUIRED)) {
        describe(view, () => {
            it('resolves a newest definer, and nothing later redefines it unseen', () => {
                const d = newestViewDefiner(MIGRATIONS, view);
                expect(d.file).toBeTruthy();
                expect(d.chain.length).toBeGreaterThan(0);
            });

            it('keeps every predicate that must survive a re-creation', () => {
                const { code, file } = newestViewDefiner(MIGRATIONS, view);
                for (const required of REQUIRED[view]) {
                    expect(code, `${file} lost ${required}`).toMatch(required);
                }
            });

            it('never reverts the business day to the UTC day', () => {
                const { code } = newestViewDefiner(MIGRATIONS, view);
                // Comments are already stripped, so prose mentioning GETUTCDATE cannot false-fail this.
                const overdueRegion = code.slice(code.search(/CREATE\s+(?:OR\s+ALTER\s+)?VIEW[^;]*?\[vwOrderHeaders\]/i));
                expect(overdueRegion).not.toMatch(/CAST\s*\(\s*GETUTCDATE\s*\(\s*\)\s+AS\s+date\s*\)/i);
            });

            it('drops no column a previous definer produced', () => {
                const { chain, code } = newestViewDefiner(MIGRATIONS, view);
                if (chain.length < 2) return;
                const prev = columnsOf(chain[chain.length - 2]);
                const now = derivedColumns(code);
                const lost = prev.filter((c) => !now.includes(c));
                expect(lost, `columns present in ${chain[chain.length - 2]} and missing now`).toEqual([]);
            });
        });
    }
});

/** The derived columns an earlier definer in the chain produced. */
function columnsOf(migration: string): string[] {
    return derivedColumns(sqlCode(readFileSync(`${MIGRATIONS}/${migration}`, 'utf8')));
}

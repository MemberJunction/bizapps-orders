/**
 * @fileoverview The guard that would have caught bizapps-contracts PR #59, for this repo's views.
 *
 * `vwOrderHeaders` is the layered view the order list, the collections queue and every "is this
 * late?" badge read. Its hand-written half is two lines of arithmetic — `NextDueDate` from a CROSS
 * APPLY over the payment schedule, and `IsOverdue` judged on it against the BUSINESS day — sitting
 * on top of a CodeGen base view that gets regenerated wholesale on any schema change. Every such
 * regeneration is an invitation to re-type those two lines from a stale copy, and the money
 * consequence of getting it wrong is a customer on a collections list for a debt they do not owe.
 *
 * EVERY ASSERTION BELOW IS SCOPED TO THE VIEW BODY, never to the migration file. The newest
 * definer here is a 98,000-character payment-schedule migration that also creates tables, procs and
 * a second view; matching a required predicate anywhere in that file would let `vwOrderHeaders`
 * lose the predicate while some unrelated statement kept the guard green, and matching a forbidden
 * one anywhere in it would fail the build over a `DEFAULT CAST(GETUTCDATE() AS date)` on a column
 * that has nothing to do with this view. `viewBody` cuts the single `CREATE VIEW ... GO` batch the
 * database is left holding, and that is what everything here reads.
 *
 * Four assertions, and they fail for different reasons on purpose.
 *
 * 1. THE NEWEST DEFINER IS THE ONE WE THINK IT IS. `newestViewDefiner` matches any DDL naming the
 *    view and throws if a later migration carries view DDL naming it without matching. The previous
 *    generation of these guards matched only `CREATE OR ALTER VIEW`, so a `DROP VIEW` +
 *    `CREATE VIEW` definer was filtered out and the selector fell back to older SQL while reporting
 *    success — and CodeGen's own output for THIS view uses exactly that form (V202607061432).
 *
 * 2. THE LOAD-BEARING PREDICATES SURVIVE. Curated by hand, because only a person knows which
 *    predicates carry meaning. That is the half a diff does not show and a column check cannot
 *    reach.
 *
 * 3. THE BUSINESS DAY IS NEVER REVERTED TO THE UTC DAY. Asserted as a negative because the revert
 *    fails by returning a wrong answer, not by erroring: `CAST(GETUTCDATE() AS date)` is already
 *    tomorrow for the whole American evening, so orders due today read as overdue from 7 PM
 *    Central and nothing anywhere reports a problem.
 *
 * 4. A RE-CREATION MAY ADD COLUMNS BUT NEVER DROP ONE. Cheap and needs no curation. `IsOverdue` is
 *    aliased unbracketed and `nd.NextDueDate` is projected with no `AS` at all, so this only
 *    asserts anything because `derivedColumns` reads both forms — a bracket-only reader scored this
 *    view at zero columns and passed unconditionally. Both sides of the comparison are read
 *    through `producedColumns`, so the columns inherited through `g.*` from the generated
 *    inner view are protected too — an alias-only BEFORE left every one of them free to
 *    disappear the moment a re-creation spelled the star out as an explicit list.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
    newestViewDefiner,
    producedColumns,
    viewBody,
} from './helpers/view-definer';

const MIGRATIONS = fileURLToPath(new URL('../../../../migrations', import.meta.url));

/**
 * Predicates that must survive every re-creation, per view. Matched against the view's own body
 * with comments stripped, so neither a copied comment block nor an unrelated statement elsewhere in
 * the same migration can satisfy one.
 */
const REQUIRED: Record<string, RegExp[]> = {
    vwOrderHeaders: [
        // The business day, not the UTC day (bc-aidp-next-golive#168). A re-creation that reverts to
        // CAST(GETUTCDATE() AS date) reads as overdue through the whole American evening.
        /CROSS\s+JOIN\s+\[__mj_BizAppsCommon\]\.\[fnBusinessToday\]\(\)\s+AS\s+bt/i,
        // The join is only worth having if the predicate actually reads it.
        /bt\.Today/,
        // The outer view must read the CodeGen base view, never the table directly. Reaching past it
        // is how a column added by a later regeneration silently stops being exposed.
        /FROM\s+\[\$\{flyway:defaultSchema\}\]\.\[vwOrderHeadersGenerated\]/i,
    ],
};

/**
 * Fragments that must NEVER appear in the view body, per view.
 */
const FORBIDDEN: Record<string, RegExp[]> = {
    vwOrderHeaders: [/CAST\s*\(\s*GETUTCDATE\s*\(\s*\)\s+AS\s+date\s*\)/i],
};

describe('layered views: the newest definer is resolvable and loses nothing', () => {
    for (const view of Object.keys(REQUIRED)) {
        describe(view, () => {
            it('resolves a newest definer, and nothing later redefines it unseen', () => {
                const definer = newestViewDefiner(MIGRATIONS, view);
                expect(definer.file).toBeTruthy();
                expect(definer.chain.length).toBeGreaterThan(0);
            });

            it('keeps every predicate that must survive a re-creation', () => {
                const { code, file } = newestViewDefiner(MIGRATIONS, view);
                const body = viewBody(code, view);
                expect(body, `${file} has no CREATE VIEW body for ${view}`).toBeTruthy();
                for (const required of REQUIRED[view]) {
                    expect(body, `${file} lost ${required}`).toMatch(required);
                }
            });

            it('never reverts the business day to the UTC day', () => {
                const { code, file } = newestViewDefiner(MIGRATIONS, view);
                const body = viewBody(code, view);
                expect(body, `${file} has no CREATE VIEW body for ${view}`).toBeTruthy();
                for (const forbidden of FORBIDDEN[view] ?? []) {
                    expect(body, `${file} reintroduced ${forbidden}`).not.toMatch(forbidden);
                }
            });

            it('drops no column a previous definer produced', () => {
                const { chain } = newestViewDefiner(MIGRATIONS, view);
                if (chain.length < 2) return;
                const previous = chain[chain.length - 2];
                // BOTH SIDES ARE READ THE SAME WAY: own columns plus the ones inherited through
                // `g.*`, each measured as of the migration it belongs to. Comparing an alias-only
                // BEFORE against an inheritance-aware NOW left every inherited column unprotected —
                // a re-creation that replaced `g.*` with an explicit list minus one column passed.
                const before = producedColumns(MIGRATIONS, view, previous);
                expect(before, `${previous} produced no readable columns — this check is vacuous`).not.toEqual([]);
                const now = producedColumns(MIGRATIONS, view);
                const lost = before.filter((column) => !now.includes(column));
                expect(lost, `columns ${previous} produced and the newest definer does not`).toEqual([]);
            });
        });
    }
});

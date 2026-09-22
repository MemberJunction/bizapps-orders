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
 * ---------------------------------------------------------------------------------------------
 * WHAT A CURATED PREDICATE IS ALLOWED TO BE. Adversarial review found the previous list failing in
 * BOTH directions, which is the worst place a guard can be: it passed semantics-breaking rewrites
 * and failed semantics-preserving ones.
 *
 * So only two kinds of thing are curated here, because only two kinds survive a legitimate rewrite:
 *
 *   - A STRING LITERAL. `'Scheduled'` is the same five characters however the SQL around it is
 *     formatted, and it cannot be reformatted away. If it is gone, the meaning changed.
 *   - A REFERENCED OBJECT NAME, matched through `references()` — the selector's own name matcher, so
 *     bracketed, bare and `${...}`-qualified spellings are all the same name, because to the
 *     database they are.
 *
 * Everything that was SYNTAX is gone, each entry for a measured reason:
 *
 *   - `CROSS JOIN … AS bt` pinned a join keyword and an alias. `CROSS APPLY` is the same result set
 *     and renaming `bt` changes nothing, yet both failed red. What matters is that the day comes
 *     from `fnBusinessToday`, and that is a NAME.
 *   - `bt.Today` was an alias reference and nothing else. The business day is defended by the
 *     function name above and by the forbidden `GETUTCDATE` below, which is where the actual
 *     regression lives.
 *   - `\[\$\{flyway:defaultSchema\}\]\.\[vwOrderHeadersGenerated\]` pinned one spelling of a name
 *     CodeGen writes both ways.
 *
 * WHAT THIS DELIBERATELY NO LONGER CATCHES, so nobody is surprised: a rewrite that keeps every
 * literal and every object name but changes a join's CARDINALITY — turning an outer join inner, or
 * dropping a `GROUP BY` — passes here. That is not an oversight, it is the price of a list that
 * never fails correct work. `producedColumns` covers the "a column vanished" half; the row-count
 * half belongs to a test with a database behind it, not to a regex over DDL.
 *
 * Four assertions, and they fail for different reasons on purpose.
 *
 * 1. THE NEWEST DEFINER IS THE ONE WE THINK IT IS. `newestViewDefiner` matches any DDL naming the
 *    view and throws if a later migration carries view DDL naming it without matching. The previous
 *    generation of these guards matched only `CREATE OR ALTER VIEW`, so a `DROP VIEW` +
 *    `CREATE VIEW` definer was filtered out and the selector fell back to older SQL while reporting
 *    success — and CodeGen's own output for THIS view uses exactly that form (V202607061432).
 *
 * 2. THE LOAD-BEARING LITERALS AND NAMES SURVIVE. Curated by hand, because only a person knows
 *    which ones carry meaning. That is the half a diff does not show and a column check cannot
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
    references,
    viewBody,
} from './helpers/view-definer';

const MIGRATIONS = fileURLToPath(new URL('../../../../migrations', import.meta.url));

/**
 * Literals and object names that must survive every re-creation, per view. Matched against the
 * view's own body with comments stripped, so neither a copied comment block nor an unrelated
 * statement elsewhere in the same migration can satisfy one.
 *
 * String literals are matched CASE-SENSITIVELY: under a case-sensitive collation `'scheduled'` and
 * `'Scheduled'` are different values, so a guard that accepted either would be lying about which.
 */
const REQUIRED: Record<string, RegExp[]> = {
    vwOrderHeaders: [
        // The outer view must read the CodeGen base view, never the table directly. Reaching past it
        // is how a column added by a later regeneration silently stops being exposed.
        references('vwOrderHeadersGenerated'),
        // The business day, not the UTC day (bc-aidp-next-golive#168). This function is the whole
        // fix: it is the only thing in the body that knows a day boundary is a business question.
        references('fnBusinessToday'),
        // NextDueDate is an aggregate over the payment schedule. Read something else and the column
        // keeps its name, its type and its plausibility while answering a different question.
        references('OrderHeaderPaymentSchedule'),
        // WHICH SCHEDULE ROWS COUNT. A row that is neither scheduled nor invoiced is not money owed
        // yet; widen this set and orders acquire a due date they do not have.
        /'Scheduled'/,
        /'Invoiced'/,
        // WHICH ORDERS CAN BE OVERDUE AT ALL. Lose one of these three and drafts, quotes or voided
        // orders start appearing on the collections queue — a customer chased for a debt that does
        // not exist, which is this view's worst outcome.
        /'Draft'/,
        /'Quoted'/,
        /'Voided'/,
    ],
};

/**
 * Fragments that must NEVER appear in the view body, per view.
 *
 * The UTC clock has no legitimate use anywhere in this view, so the NAME is forbidden rather than
 * one spelling of one expression: `CAST(GETUTCDATE() AS date)` was the shape of the original
 * defect, but `CONVERT(date, GETUTCDATE())` is the same bug and the old pattern let it through.
 */
const FORBIDDEN: Record<string, RegExp[]> = {
    vwOrderHeaders: [/\bGETUTCDATE\b/i],
};

describe('layered views: the newest definer is resolvable and loses nothing', () => {
    /**
     * A forbidden entry that names a view nobody guards, or that is present but empty, asserts
     * nothing while looking like it does. Both are caught here rather than by a silently empty loop.
     */
    it('curates no forbidden list for a view this file does not guard', () => {
        for (const [view, forbidden] of Object.entries(FORBIDDEN)) {
            expect(REQUIRED[view], `FORBIDDEN names ${view}, which is not a guarded view`).toBeDefined();
            expect(forbidden, `FORBIDDEN[${view}] is empty — remove it or fill it in`).not.toEqual([]);
        }
    });

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

            it('never reintroduces a fragment known to fail silently', (context) => {
                const forbidden = FORBIDDEN[view];
                // NOT `?? []`. A view with no forbidden entry used to run this test with an empty
                // loop and report a PASS — a green tick standing for zero assertions, which on a
                // results page is indistinguishable from a check that actually ran.
                if (forbidden === undefined) {
                    context.skip(`nothing is forbidden for ${view}, so this asserts nothing`);
                    return;
                }
                const { code, file } = newestViewDefiner(MIGRATIONS, view);
                const body = viewBody(code, view);
                expect(body, `${file} has no CREATE VIEW body for ${view}`).toBeTruthy();
                for (const pattern of forbidden) {
                    expect(body, `${file} reintroduced ${pattern}`).not.toMatch(pattern);
                }
            });

            it('drops no column a previous definer produced', (context) => {
                const { chain } = newestViewDefiner(MIGRATIONS, view);
                // A view with a single definer has no BEFORE to compare a re-creation against. This
                // used to `return` quietly and report a pass, so the day someone consolidated the
                // history into one migration the column guard would have switched itself off with
                // nothing in the output to say so.
                if (chain.length < 2) {
                    context.skip(`${view} has one definer (${chain[0]}) — there is no BEFORE to compare`);
                    return;
                }
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

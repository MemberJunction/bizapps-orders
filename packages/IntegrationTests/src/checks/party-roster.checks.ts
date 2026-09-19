/**
 * party-roster — Orders' contribution to the shared `Party Signals` category.
 *
 * WHY IT EXISTS
 * The party pickers on orders, contracts and sales search the whole organization directory with no
 * notion of who is a customer, so typing three letters offers organizations we have never billed and
 * a tester picks one with nothing to warn them. The fix is a category, not an import: each app ships
 * ONE query returning `PartyKind, PartyID, Count, LastActivityAt`, and the shared picker unions them.
 *
 * A contract that lives in a query's SQL text has no compiler behind it. Rename a column, lose the
 * category, drop the `[signal: …]` marker from the description, and nothing fails to build — the
 * picker simply stops counting orders and silently goes back to offering the whole directory, which
 * is the exact defect this feature removes. These checks are that compiler.
 *
 *   CR1   the query is registered in `Party Signals` and its description carries the signal marker
 *   CR2   it runs, and every row it returns honours the contract
 *
 * Read-only: it asserts against whatever orders the database already holds, so it needs no fixture
 * and writes nothing. It is still mutation-gated like every bundle here, because it is dispatched by
 * the same suite.
 *
 * CONNECTS TO:
 *   METADATA: metadata/queries/.party-customer-roster.json · metadata/queries/SQL/party-customer-roster.sql
 *   CODE:     `party-signals.ts` in bizapps-common — the contract and the union these rows feed
 *   ISSUE:    bizapps-orders#216
 */
import { RunQuery, type IRunQueryProvider } from '@memberjunction/core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';

/** The three names the shared picker looks for. All of them are load-bearing. */
const QUERY_NAME = 'Party Customer Roster';
const SIGNAL_CATEGORY = 'Party Signals';
const SIGNAL_MARKER = /\[signal:\s*order\s*\|\s*orders\]/i;

/** The query as metadata knows it, or a failure naming what is missing. */
function rosterQuery(ctx: IntegrationCheckContext) {
    const query = ctx.Provider.Queries.find((q) => q.Name === QUERY_NAME);
    Assert(
        query != null,
        `'${QUERY_NAME}' is not registered — the shared party picker has no orders signal at all, and ` +
            `will offer the whole directory as if nobody were a customer`,
    );
    return query!;
}

export const PartyRosterChecks: NamedCheck[] = [
    {
        Id: 'party-roster.CR1',
        Name: 'CR1 — Party Customer Roster is registered in the Party Signals category with the signal marker',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const query = rosterQuery(ctx);

            // The category IS the registry. A query filed anywhere else is invisible to the picker
            // however correct its SQL is.
            AssertEqual(
                query.Category,
                SIGNAL_CATEGORY,
                `'${QUERY_NAME}' must live in '${SIGNAL_CATEGORY}' — the picker discovers signal ` +
                    `queries by category and nothing else`,
            );

            // Without the marker the picker cannot name what it counted, so a chip reads
            // "4 records" instead of "4 orders" — degraded rather than wrong, and easy to miss.
            Assert(
                SIGNAL_MARKER.test(query.Description ?? ''),
                `the description must carry the '[signal: order|orders]' marker; got: ${query.Description ?? '(none)'}`,
            );
        },
    },
    {
        Id: 'party-roster.CR2',
        Name: 'CR2 — the roster runs and every row honours the PartyKind / PartyID / Count contract',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const query = rosterQuery(ctx);

            // The run-scoped provider implements both seams; the context types it as the metadata
            // one, which is the only reason this needs a cast.
            const runner = new RunQuery(ctx.Provider as unknown as IRunQueryProvider);
            const result = await runner.RunQuery({ QueryID: query.ID }, ctx.User);
            Assert(result.Success, `the roster failed to run: ${result.ErrorMessage ?? '(no message)'}`);

            const rows = (result.Results ?? []) as Record<string, unknown>[];
            for (const row of rows) {
                const kind = row['PartyKind'];
                Assert(
                    kind === 'organization' || kind === 'person',
                    `PartyKind must be 'organization' or 'person'; got ${String(kind)}`,
                );

                const id = row['PartyID'];
                Assert(
                    typeof id === 'string' && id.trim().length > 0,
                    `PartyID must be a non-empty party ID; got ${String(id)}`,
                );

                // A roster row exists because records name the party. Zero would mean the grouping
                // counted something other than the orders themselves.
                Assert(
                    Number(row['Count']) >= 1,
                    `Count must be at least 1 for a party on the roster; got ${String(row['Count'])}`,
                );
            }
        },
    },
];

for (const check of PartyRosterChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// No fixture: the roster reads whatever orders the database already holds and writes nothing.
IntegrationCheckRegistry.Instance.RegisterLifecycle('party-roster', {
    Setup: async () => {},
    Teardown: async () => {},
});

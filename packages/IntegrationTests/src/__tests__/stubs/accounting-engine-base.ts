/**
 * A stand-in for `@mj-biz-apps/accounting-engine-base`, used ONLY when the unit suite runs.
 *
 * WHY THIS EXISTS. `registry-parity.test.ts` is the anti-vacuity floor for the integration suite: it
 * asserts exact per-bundle check counts and cross-checks the four places a bundle name has to agree,
 * so a bundle that silently stops being dispatched fails here instead of passing quietly. It has
 * caught that twice.
 *
 * To count the checks it has to IMPORT the check modules, which import `fixture.ts`, which imports
 * the real accounting engine — a sibling repo package resolved through a symlink in a developer's
 * checkout and simply absent on a CI runner. So the most valuable unit test in the repo could not
 * run in CI, for a dependency it never actually calls.
 *
 * It never calls it: `AccountingEngineBase.Instance.Config()` is invoked once, inside
 * `CreateOrdersFixture`, which only runs against a real database. The parity test walks the registry
 * and reads files. So a stub here is not papering over anything — it makes a test that was already
 * independent of accounting *provably* independent of it.
 *
 * WHAT WOULD MAKE THIS DISHONEST: aliasing it for the integration suite too. That suite genuinely
 * depends on the engine's link cache being warm (see the comment at `fixture.ts`'s charge-type
 * links), and it does not run under vitest — it runs through `test-harnesses/integration.mjs` and
 * `mj test`, neither of which reads the vitest config. If that ever changes, this stub has to go.
 */

/** Throws rather than no-oping: a caller reaching this in anger should find out immediately. */
export class AccountingEngineBase {
    public static get Instance(): AccountingEngineBase {
        return new AccountingEngineBase();
    }

    public async Config(..._args: unknown[]): Promise<void> {
        throw new Error(
            'AccountingEngineBase is stubbed for the unit suite and must not be called. Only ' +
                'CreateOrdersFixture uses it, and that needs a real database — run the integration ' +
                'suite via test-harnesses/integration.mjs instead.',
        );
    }
}

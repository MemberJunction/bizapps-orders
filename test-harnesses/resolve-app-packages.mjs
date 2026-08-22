/**
 * Resolve @mj-biz-apps/accounting-* through packages/IntegrationTests, the
 * package that DECLARES them (as mandatory peers), rather than from the repo
 * root. Historically the root could not declare them because no accounting
 * package was published; that is no longer true (accounting-engine-base and
 * accounting-server are both on npm at 0.1.0, and resolve here from the
 * registry alone). Keeping the declaration on the package that actually
 * imports them is still the right shape, and a dev workspace with accounting
 * materialized as a sibling continues to work. If neither is available this
 * throws the honest error that the environment has no accounting.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromTests = createRequire(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'IntegrationTests', 'package.json'),
);

export function importAccountingPackage(specifier) {
    return import(pathToFileURL(requireFromTests.resolve(specifier)).href);
}

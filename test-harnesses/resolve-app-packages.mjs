/**
 * Resolve @mj-biz-apps/accounting-* through packages/IntegrationTests, the
 * package that DECLARES them (as optional peers). The repo root cannot declare
 * them: no accounting package is published, so a root declaration makes the
 * root unresolvable from the registry and no lockfile can exist. In a dev
 * workspace (accounting materialized as a sibling) the peers are linked into
 * IntegrationTests' node_modules and this resolves; anywhere else it throws
 * the honest error that the environment has no accounting.
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

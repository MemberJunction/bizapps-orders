/**
 * Writes src/lib/styles/mj-tokens.json: every `--mj-*` custom property MemberJunction's token
 * sheet declares, read from the installed @memberjunction/ng-shared-generic.
 *
 * The snapshot backs `mj-token-names.test.ts`, which fails when Orders reads a `--mj-*` name MJ
 * never defines. Rerun this after raising the MJ floor, and review the diff: a token MJ dropped
 * shows up as a removal here and as a test failure wherever Orders still reads it.
 *
 *   node packages/Angular/scripts/snapshot-mj-tokens.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const pkgDir = dirname(require.resolve('@memberjunction/ng-shared-generic/package.json'));
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const scss = readFileSync(join(pkgDir, 'dist', 'lib', '_tokens.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const tokens = [...new Set([...scss.matchAll(/(--mj-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))].sort();
const out = {
    source: `@memberjunction/ng-shared-generic@${version} dist/lib/_tokens.scss`,
    tokens,
};
writeFileSync(join(here, '..', 'src', 'lib', 'styles', 'mj-tokens.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${tokens.length} tokens from ${out.source}`);

/**
 * Bundle the public checkout Angular Element for GET /checkout/:slug.
 * Requires `ngc` to have already emitted dist/lib/checkout-widget/*.js
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostJs = path.join(pkgRoot, 'dist/lib/checkout-widget/checkout-public-host.component.js');
if (!fs.existsSync(hostJs)) {
    console.error('build-checkout-element: ngc output missing at', hostJs);
    process.exit(1);
}

const outdir = path.join(pkgRoot, 'dist/checkout-element');
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
    absWorkingDir: pkgRoot,
    entryPoints: [path.join(pkgRoot, 'scripts/checkout-element-entry.ts')],
    bundle: true,
    format: 'esm',
    outfile: path.join(outdir, 'main.js'),
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    legalComments: 'none',
    logOverride: { 'empty-import-meta': 'silent' },
});

console.log('checkout-element →', path.join(outdir, 'main.js'));

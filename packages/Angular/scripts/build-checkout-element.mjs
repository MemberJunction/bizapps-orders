/**
 * Bundle the public checkout Angular Element for GET /checkout/:slug.
 * Requires `ngc` to have already emitted dist/lib/checkout-widget/*.js
 *
 * Angular FESM is partial-compiled (`ɵɵngDeclare*`). esbuild does not run the
 * linker, so we babel-transform `@angular/*` with
 * `@angular/compiler-cli/linker/babel`. That keeps CSP free of `unsafe-eval`
 * (JIT would need it; a payment page must not).
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

const babel = await import('@babel/core');
const linkerMod = await import('@angular/compiler-cli/linker/babel');
const linkerPlugin = linkerMod.default ?? linkerMod.createEs2015LinkerPlugin;

function angularLinkerPlugin() {
    return {
        name: 'angular-linker',
        setup(build) {
            build.onLoad({ filter: /[\\/]@angular[\\/].*\.[cm]?js$/ }, async (args) => {
                const source = await fs.promises.readFile(args.path, 'utf8');
                if (!source.includes('ngDeclare')) {
                    return null;
                }
                const result = await babel.transformAsync(source, {
                    filename: args.path,
                    configFile: false,
                    babelrc: false,
                    compact: false,
                    plugins: [linkerPlugin],
                });
                if (!result?.code) {
                    return null;
                }
                return { contents: result.code, loader: 'js' };
            });
        },
    };
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
    plugins: [angularLinkerPlugin()],
    logOverride: { 'empty-import-meta': 'silent' },
});

const out = path.join(outdir, 'main.js');
const js = fs.readFileSync(out, 'utf8');
if (js.includes('needs to be compiled using the JIT compiler')) {
    console.warn('build-checkout-element: bundle still mentions JIT compiler error string (may be fine)');
}
console.log('checkout-element →', out);

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TIER 1 — the layer-purity guard for this package.
 *
 * A prose rule decays the moment someone is in a hurry, so the rule ships as a test that fails
 * the build.
 *
 * Everything here is UI **layer 1 or 2** (`guides/UI_LAYERING_GUIDE.md` in the MJ repo), which
 * means it may not know about routing or about MJ Explorer. That single constraint is what lets
 * the same order editor render inside an Explorer section tab, inside the Order entity form,
 * inside a standalone Angular app, and inside a test — without a fork.
 *
 * The repo-wide gate (`npm run check:ui-layers`) checks the same boundary from the outside using
 * this package's `"mjUILayer": "widgets"` declaration. Both exist on purpose: the gate covers
 * every opted-in package uniformly, this test fails inside the package's own `npm test` where a
 * developer sees it first.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LIB = join(HERE, '..', 'lib');

/** Import specifiers a layer 1/2 widget must never reach for. */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^@angular\/router$/, why: 'Angular Router — widgets emit an intent event and let the host route' },
  {
    pattern: /^@memberjunction\/ng-shared$/,
    why: 'MJ Explorer shared (NavigationService / BaseResourceComponent / SharedService) — that is layer 3',
  },
  { pattern: /^@memberjunction\/ng-explorer/, why: 'an MJ Explorer package — a widget that imports one cannot be reused' },
  { pattern: /^@mj-biz-apps\/orders-ng$/, why: 'the layer-3 package — that dependency points the wrong way' },
];

/**
 * Source constructs that bind a component to the GLOBAL data provider.
 *
 * Not a style rule: the browser is not inherently single-provider, and a widget that constructs
 * its own `RunView` silently ignores the `Provider` it was handed. Use `ProviderToUse` from
 * `BaseAngularComponent`.
 */
const FORBIDDEN_SOURCE: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bnew\s+RunViews?\s*\(/, why: 'use RunView.FromMetadataProvider(this.ProviderToUse)' },
  { pattern: /\bnew\s+Metadata\s*\(/, why: 'use this.ProviderToUse' },
];

/** Every import specifier in a TS source file (static imports, type imports, and re-exports). */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

/** Blank out comments so a JSDoc block that DESCRIBES a banned construct isn't a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

function tsFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...tsFilesUnder(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('widget layer purity', () => {
  const files = tsFilesUnder(LIB);

  it('finds the widgets (the guard is actually pointed at something)', () => {
    // Without this, moving or emptying lib/ would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(LIB, f), f]))('%s imports no routing and no Explorer', (_label, file) => {
    const specifiers = importSpecifiers(readFileSync(file, 'utf8'));
    const violations = specifiers.flatMap((specifier) =>
      FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(specifier)).map(({ why }) => `"${specifier}" — ${why}`),
    );

    expect(
      violations,
      `${relative(LIB, file)} breaks the layer boundary:\n  ${violations.join('\n  ')}\n` +
        'A widget that navigates cannot be embedded on a surface that wanted to navigate differently. ' +
        'Emit an event and let the host decide — see MJOStageChangeRequestEventArgs for the shape.',
    ).toEqual([]);
  });

  it.each(files.map((f) => [relative(LIB, f), f]))('%s reads through ProviderToUse, not the global', (_label, file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    const violations = FORBIDDEN_SOURCE.filter(({ pattern }) => pattern.test(source)).map(
      ({ pattern, why }) => `${pattern.source} — ${why}`,
    );

    expect(
      violations,
      `${relative(LIB, file)} binds the global data provider:\n  ${violations.join('\n  ')}`,
    ).toEqual([]);
  });
});

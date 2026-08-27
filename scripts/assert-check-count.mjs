#!/usr/bin/env node
/**
 * Fail the build when fewer checks RAN than the registry declares.
 *
 * WHY THIS EXISTS, and it is not belt-and-braces paranoia:
 *
 * Every check in this suite is `RequiresMutation`, and MJ's `IntegrationTestDriver` contains
 *
 *     if (check.RequiresMutation && !mutationEnabled) continue;
 *
 * so a run with mutation disabled executes NOTHING and reports success. A green tick would mean
 * "177 checks were skipped", and nobody reads a green tick that closely. The same failure arrives by
 * other routes too: a bundle whose Setup throws is reported as one failure and its checks never run;
 * a bundle accidentally dropped from the runner's list simply vanishes; a `.only` left in a file
 * silences its siblings.
 *
 * All of those look like success. This turns them into a failure with a message naming the gap.
 *
 * The expected counts come from `registry-parity.test.ts`, which is the same source the unit suite
 * asserts against — so adding a bundle without updating it fails the unit tests first, and the two
 * can never drift into agreeing on the wrong number.
 *
 * Usage: node scripts/assert-check-count.mjs <integration-log>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = process.argv[2];

if (!logPath) {
    console.error('usage: node scripts/assert-check-count.mjs <integration-log>');
    process.exit(2);
}

/** Expected counts, parsed from the parity test so there is exactly one source of truth. */
function expectedCounts() {
    const src = readFileSync(
        join(root, 'packages/IntegrationTests/src/__tests__/registry-parity.test.ts'),
        'utf8',
    );
    const block = src.match(/EXPECTED[^=]*=\s*\{([\s\S]*?)\}\s*;/);
    if (!block) throw new Error('could not find the EXPECTED map in registry-parity.test.ts');
    const counts = new Map();
    for (const [, name, n] of block[1].matchAll(/'?([a-zA-Z-]+)'?\s*:\s*(\d+)/g)) {
        counts.set(name, Number(n));
    }
    if (!counts.size) throw new Error('the EXPECTED map parsed empty');
    return counts;
}

const log = readFileSync(logPath, 'utf8');
const expected = expectedCounts();
const expectedTotal = [...expected.values()].reduce((a, b) => a + b, 0);

// The runner prints one ✔/✖ per check and a final tally.
const ran = (log.match(/^\s*[✔✖]\s/gm) ?? []).length;
const tally = log.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
const passed = tally ? Number(tally[1]) : 0;
const failed = tally ? Number(tally[2]) : 0;

const problems = [];

if (!tally) {
    problems.push('the run produced no final tally — it did not finish');
}
if (ran < expectedTotal) {
    problems.push(
        `only ${ran} checks ran; the registry declares ${expectedTotal}. ` +
            `${expectedTotal - ran} were SKIPPED, which a passing tally would have hidden. ` +
            `The usual cause is RUN_MUTATION_TESTS being unset — every check here is RequiresMutation.`,
    );
}
if (failed > 0) {
    problems.push(`${failed} checks failed`);
}

// Per bundle, so the message names the gap rather than only the total.
for (const [bundle, count] of expected) {
    const header = log.match(new RegExp(`=== ${bundle} \\((\\d+) checks?\\) ===`));
    if (!header) {
        problems.push(`bundle '${bundle}' never ran — is it missing from the runner's list?`);
    } else if (Number(header[1]) !== count) {
        problems.push(
            `bundle '${bundle}' registered ${header[1]} checks, expected ${count}`,
        );
    }
}

if (problems.length) {
    console.error('\n✖ Integration coverage assertion FAILED\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error(
        '\nA green tally is not evidence on its own. This gate exists because every check in ' +
            'this suite is RequiresMutation, and a driver with mutation disabled skips them all ' +
            'and reports success.\n',
    );
    process.exit(1);
}

console.log(
    `✓ coverage assertion passed — ${ran} checks ran across ${expected.size} bundles ` +
        `(${passed} passed, ${failed} failed)`,
);

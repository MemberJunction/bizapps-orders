import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'check-migration-no-prune.mjs');

/**
 * The child process's env, with BASE_REF explicitly unset. Without this, a `BASE_REF` exported in
 * the ambient shell (e.g. by a developer's own workflow, or a sibling test/CI step) leaks into the
 * spawned script and changes which ref it reports as unresolved, decoupling this test's assertions
 * from the environment it happens to run in.
 */
function envWithoutBaseRef() {
    const env = { ...process.env };
    delete env.BASE_REF;
    return env;
}

/**
 * A standalone repo with no `origin/next` (or anything else `BASE_REF` could default to), one
 * commit, and a committed migration that trips the gate. This is gh-1's repro: local form, no
 * args, in a repo whose only remote lacks the ref BASE_REF defaults to.
 */
function repoWithUnresolvableBaseRefAndAViolation() {
    const dir = mkdtempSync(join(tmpdir(), 'no-prune-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    writeFileSync(
        join(dir, 'V202609281200__test.sql'),
        "EXEC [__mj].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging';\n",
    );
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'add migration'], { cwd: dir });
    return dir;
}

// Fails today: main()'s local-form branch (around line 223) has `catch { mergeBase = 'HEAD'; }`,
// which swallows the unresolved-ref error and silently diffs HEAD against itself, so the commit
// above is never scanned and the script exits 0. Fixed by replacing that catch with a loud,
// non-zero failure naming the ref -- gh-1.
test('local form fails loudly, naming the ref, when BASE_REF/origin/next does not resolve', (t) => {
    const dir = repoWithUnresolvableBaseRefAndAViolation();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: envWithoutBaseRef() });

    assert.notEqual(result.status, 0, 'must not silently pass when the base ref cannot be resolved');
    assert.match(result.stderr, /origin\/next/, 'must name the unresolved ref');
    assert.match(result.stderr, /BASE_REF/, 'must say how to fix it (fetch the ref, or set BASE_REF)');
});

// Fails today: the merge-base git() call has no `stdio` override, so git's own "fatal:" line is
// inherited straight to this process's stderr AND captured into `err.stderr`, which the catch
// block then re-prints -- the same line twice. Fixed by piping git's stderr (capture only, don't
// inherit) for this call.
test("git's own error line is captured, not inherited-and-reprinted, so it appears once", (t) => {
    const dir = repoWithUnresolvableBaseRefAndAViolation();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: envWithoutBaseRef() });

    const fatalLines = (result.stdout + result.stderr).match(/fatal:/g) ?? [];
    assert.equal(fatalLines.length, 1, `git's "fatal:" line must appear exactly once, got:\n${result.stderr}`);
});

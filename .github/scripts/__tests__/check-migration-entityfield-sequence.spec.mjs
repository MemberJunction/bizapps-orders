import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', 'check-migration-entityfield-sequence.mjs');

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

/** A standalone repo with one commit and no `origin/next` (or anything BASE_REF could default to). */
function repoWithUnresolvableBaseRef() {
    const dir = mkdtempSync(join(tmpdir(), 'ef-sequence-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
    return dir;
}

// Fails today: main() (around line 397) calls `git(['merge-base', process.env.BASE_REF ||
// 'origin/next', 'HEAD'])` with no try/catch, so an unresolved ref throws a raw, unhandled
// "Command failed: git ... merge-base" Error with a full JS stack trace instead of a clean
// message -- gh-2. Fixed by giving it the same clean, non-zero failure as gh-1.
test('local form fails cleanly (no raw stack trace), naming the ref, when BASE_REF/origin/next does not resolve', (t) => {
    const dir = repoWithUnresolvableBaseRef();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: envWithoutBaseRef() });

    assert.notEqual(result.status, 0, 'an unresolved base ref must not be treated as success');
    assert.doesNotMatch(result.stderr, /at file:\/\//, 'must not leak a raw JS stack trace');
    assert.doesNotMatch(result.stderr, /node:internal/, 'must not leak a raw JS stack trace');
    // On stderr, not stdout: an error belongs on stderr, and this must match its sibling gh-1.
    assert.match(result.stderr, /origin\/next/, 'must name the unresolved ref');
    assert.match(result.stderr, /BASE_REF/, 'must say how to fix it (fetch the ref, or set BASE_REF)');
});

// Fails today: the merge-base git() call has no `stdio` override, so git's own "fatal:" line is
// inherited straight to this process's stderr AND captured into `err.stderr`, which the catch
// block then re-prints (via console.log, to stdout) -- the same line twice, on two streams.
test("git's own error line is captured, not inherited-and-reprinted, so it appears once", (t) => {
    const dir = repoWithUnresolvableBaseRef();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: envWithoutBaseRef() });

    const fatalLines = (result.stdout + result.stderr).match(/fatal:/g) ?? [];
    assert.equal(fatalLines.length, 1, `git's "fatal:" line must appear exactly once, got:\n${result.stdout}${result.stderr}`);
});

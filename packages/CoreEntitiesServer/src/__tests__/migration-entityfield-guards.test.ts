import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every `EntityField` insert in a migration must be guarded on the unique index, not just the ID.
 *
 * WHY THIS EXISTS. `UQ_EntityField_EntityID_Name` enforces one row per `(EntityID, Name)` pair. A guard
 * that tests only the ID passes whenever that pair already exists under a DIFFERENT id — which is
 * exactly what happens when CodeGen re-mints an id for a field somebody already created — and the insert
 * then violates the index and stops the migration chain dead.
 *
 * That is orders#126. The chain sat stopped from 15 August: the Explorer could not open a single orders
 * record because the migrations that would fix it could not be applied. On the affected host there was
 * one row for `(B090A662-…, MaxQuantityPerLine)` under an id the guard was not looking for.
 *
 * WHY IT IS A TEST AND NOT A NOTE IN A REVIEW. The defect appeared TWICE in one file, ~470 lines apart,
 * while eighteen other guards in the same file were written correctly. Fixing the first one left the
 * chain stopping one insert earlier, on `PricingDriverClass`. A rule that a careful author follows
 * eighteen times out of twenty is a rule that needs a machine, not more care.
 *
 * WHAT COUNTS AS GUARDED. Either clause satisfies the index — the pair itself, or a `NOT EXISTS` over
 * `EntityID` and `Name` — so this checks that the guard mentions `EntityID`, not that it is written one
 * exact way. Migrations are generated output as often as they are hand-written, and pinning a spelling
 * would fail on a reformat while missing a real defect.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

/** `IF NOT EXISTS (… [EntityField] …)` openings, with the line that follows for multi-line guards. */
function entityFieldGuards(text: string): Array<{ line: number; guard: string }> {
    const lines = text.split(/\r?\n/);
    const out: Array<{ line: number; guard: string }> = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!/IF\s+NOT\s+EXISTS/i.test(l) || !/\[EntityField\]/i.test(l)) continue;
        // A guard may wrap; take this line plus the next two, which covers every form in these files.
        out.push({ line: i + 1, guard: [l, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ') });
    }
    return out;
}

const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, text: readFileSync(MIGRATIONS + f, 'utf8') }))
    .filter((f) => /IF\s+NOT\s+EXISTS[\s\S]{0,200}\[EntityField\]/i.test(f.text));

describe('EntityField inserts are guarded on the unique index', () => {
    /**
     * The anti-vacuity floor. If the glob, the path, or the pattern ever stops matching, this suite would
     * report success while asserting nothing — the failure mode that let the original defect ship.
     */
    it('finds migrations containing EntityField guards at all', () => {
        expect(files.length).toBeGreaterThan(0);
        const total = files.reduce((n, f) => n + entityFieldGuards(f.text).length, 0);
        expect(total).toBeGreaterThan(0);
    });

    it('every guard tests (EntityID, Name) and not the ID alone', () => {
        const offenders: string[] = [];
        for (const { file, text } of files) {
            for (const { line, guard } of entityFieldGuards(text)) {
                if (!/EntityID/i.test(guard)) offenders.push(`${file}:${line}`);
            }
        }
        expect(offenders, `ID-only EntityField guard(s):\n  ${offenders.join('\n  ')}`).toEqual([]);
    });

    /**
     * The specific pair that stopped the chain, pinned by name. The general rule above would catch a
     * regression here anyway; this one names the incident so a future reader knows what it cost.
     */
    it('the two guards from #126 name their field', () => {
        const heal = files.find((f) => f.file.includes('CodeGen_Heal_PricingDriverClass'));
        expect(heal, 'the #126 migration is missing').toBeDefined();
        for (const field of ['MaxQuantityPerLine', 'PricingDriverClass']) {
            // EVERY guard naming the field, not merely one of them. This file guards
            // MaxQuantityPerLine twice, for two different entities, so `.some()` was satisfied by the
            // correct one while the broken one sat two lines away -- the test passing for a reason
            // unrelated to what it claims, which is the defect it is here to catch.
            const naming = entityFieldGuards(heal!.text).filter((g) => g.guard.includes(field));
            expect(naming.length, `no guard names ${field}`).toBeGreaterThan(0);
            const unguarded = naming.filter((g) => !/EntityID/i.test(g.guard)).map((g) => g.line);
            expect(unguarded, `${field} guard(s) on line(s) ${unguarded.join(', ')} test the ID alone`)
                .toEqual([]);
        }
    });
});

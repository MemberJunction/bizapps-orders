#!/usr/bin/env node
/**
 * Fail when a generated entity form puts fields in the generic "Details" panel (#276).
 *
 * CodeGen puts a field with no `EntityField.Category` in a section named Details. Its AI layout pass
 * fills a blank Category only when it sees a change event (a new entity, a new field, a reopened
 * field), so a field added to an established entity can land uncategorized with no error, and a
 * run without AI skips the pass entirely. This check makes that visible on the PR that regenerates
 * the form. The fix is a `Category` in metadata/entity-fields, pushed, then CodeGen again.
 *
 * Usage:
 *   node .github/scripts/check-form-details-panel.mjs [generated-forms-dir]
 *   node .github/scripts/check-form-details-panel.mjs --self-test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = 'packages/Angular/src/lib/generated/Entities';

/** The fields inside the form's Details panel, in order. */
export function DetailsPanelFields(html) {
    const panel = /<mj-collapsible-panel\s+SectionKey="details"[\s\S]*?<\/mj-collapsible-panel>/.exec(html);
    if (!panel) return [];
    return [...panel[0].matchAll(/FieldName="([^"]+)"/g)].map((m) => m[1]);
}

function htmlFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
        else if (name.endsWith('.html')) out.push(full);
    }
    return out;
}

function selfTest() {
    const grouped = '<mj-collapsible-panel SectionKey="systemMetadata" SectionName="System Metadata"><mj-form-field FieldName="__mj_CreatedAt"></mj-form-field></mj-collapsible-panel>';
    const details = '<mj-collapsible-panel\n SectionKey="details"\n SectionName="Details"><mj-form-field FieldName="Code"></mj-form-field><mj-form-field FieldName="Name"></mj-form-field></mj-collapsible-panel>';
    const empty = '<mj-collapsible-panel SectionKey="details" SectionName="Details"></mj-collapsible-panel>';
    const cases = [
        [grouped, []],
        [grouped + details, ['Code', 'Name']],
        [empty, []],
    ];
    for (const [html, expected] of cases) {
        const actual = DetailsPanelFields(html);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            console.error(`self-test failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            process.exit(1);
        }
    }
    console.log('check-form-details-panel self-test passed');
}

if (process.argv[2] === '--self-test') {
    selfTest();
} else {
    const dir = process.argv[2] ?? DEFAULT_DIR;
    const offenders = htmlFiles(dir)
        .map((file) => ({ file, fields: DetailsPanelFields(readFileSync(file, 'utf8')) }))
        .filter((f) => f.fields.length > 0);
    if (offenders.length) {
        console.error(`${offenders.length} generated form(s) put fields in the generic Details panel:`);
        for (const o of offenders) console.error(`  ${path.relative(dir, o.file)}: ${o.fields.join(', ')}`);
        console.error('\nGive each field a Category in metadata/entity-fields (see .form-categories.json), push it, and run CodeGen again.');
        process.exit(1);
    }
    console.log('No generated form puts fields in the Details panel.');
}

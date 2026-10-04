import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const css = readFileSync(
    join(here, '../lib/custom/EventOrderLine/event-order-line-form.component.css'),
    'utf8',
);

/** The declarations of the first rule whose selector is exactly `selector`. */
function RuleBody(selector: string): string {
    const start = css.indexOf(`${selector} {`);
    expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start));
}

describe('Event Order Line form layout', () => {
    // mj-form-field defaults to a fixed 200px label column beside the control. The form's
    // columns are narrower than that inside an order line card, which left the Person
    // lookup with no width at all.
    it('stacks each field label above its control', () => {
        const field = RuleBody('.mjo-eol-form ::ng-deep .mj-forms-field');
        expect(field).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
        expect(RuleBody('.mjo-eol-form ::ng-deep .mj-forms-field-validation')).toMatch(/grid-column:\s*1;/);
    });

    it('lets the primary grid columns shrink below their content', () => {
        expect(RuleBody('.mjo-eol-primary-grid')).toMatch(
            /grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\);/,
        );
    });
});

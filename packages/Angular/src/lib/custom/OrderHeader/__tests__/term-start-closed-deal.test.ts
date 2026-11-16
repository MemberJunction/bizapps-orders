// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * The term start on the order of a closed sales deal (golive #393). The deal lock refuses the save,
 * so a start the line already stores is shown read-only, with the lock's refusal as the hint, rather
 * than offered and then not saved. A blank start may still be filled (golive #322).
 */

const REFUSAL = 'This deal is closed. Set the status back to Open before changing what was sold.';
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function editor(refusal: string | null) {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, { EditMode: true, LineEditRefusal: refusal, _order: { OrderDate: d('2026-10-20') } });
    return c;
}

function line(storedStart: Date | null, saved = true) {
    const l = { IsSaved: saved, ServicePeriodStart: storedStart } as Record<string, unknown>;
    l.GetFieldByName = (name: string) => (name === 'ServicePeriodStart' ? { OldValue: storedStart } : null);
    return l as unknown as mjBizAppsOrdersOrderLineEntity;
}

describe('term start on a closed deal\'s order', () => {
    it('locks a stored start and keeps it when a change arrives anyway', () => {
        const c = editor(REFUSAL);
        const l = line(d('2026-11-01'));
        expect(c.TermStartLocked(l)).toBe(true);
        c.ResetTermStart(l);
        expect(l.ServicePeriodStart).toEqual(d('2026-11-01'));
    });

    it('leaves a blank start editable, since filling it is allowed', () => {
        expect(editor(REFUSAL).TermStartLocked(line(null))).toBe(false);
    });

    it('leaves the field editable when nothing freezes the lines', () => {
        expect(editor(null).TermStartLocked(line(d('2026-11-01')))).toBe(false);
    });

    it('leaves a line added in this edit editable', () => {
        expect(editor(REFUSAL).TermStartLocked(line(d('2026-11-01'), false))).toBe(false);
    });

    it('shows the refusal as the hint and no input while locked', () => {
        const html = readFileSync(fileURLToPath(new URL('../order-lines-editor.component.html', import.meta.url)), 'utf8');
        expect(html).toContain('@else if (EditMode && !TermStartLocked(line))');
        expect(html).toContain('@if (EditMode && TermStartLocked(line)) {\n                            {{ LineEditRefusal }}');
    });
});

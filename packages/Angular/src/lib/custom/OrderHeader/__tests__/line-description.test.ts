// @vitest-environment jsdom
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

function editor(editMode: boolean): MJOOrderLinesEditorComponent {
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, { EditMode: editMode });
    return c;
}

const line = (Description: string | null) => ({ ID: 'l1', Description }) as unknown as mjBizAppsOrdersOrderLineEntity;

function typed(text: string): Event {
    const area = document.createElement('textarea');
    area.value = text;
    return { target: area } as unknown as Event;
}

describe('order line description on the line card', () => {
    it('writes the trimmed text onto the line', () => {
        const l = line(null);
        editor(true).SetDescription(l, typed('  Support, November 2026  '));
        expect(l.Description).toBe('Support, November 2026');
    });

    it('shows the text as stored once the user leaves the field', () => {
        const l = line(null);
        const event = typed('  Support,\n November  ');
        editor(true).SetDescription(l, event);
        expect((event.target as HTMLTextAreaElement).value).toBe('Support, November');
    });

    it('stores each keystroke without rewriting the box, so a typed space survives', () => {
        const l = line(null);
        const event = typed('Support ');
        editor(true).TypeDescription(l, event);
        expect(l.Description).toBe('Support');
        expect((event.target as HTMLTextAreaElement).value).toBe('Support ');
    });

    it('clears the description when the field is emptied', () => {
        const l = line('Support');
        editor(true).SetDescription(l, typed('   '));
        expect(l.Description).toBeNull();
    });

    it('writes nothing when the order is not editable', () => {
        const l = line('Support');
        editor(false).SetDescription(l, typed('Changed'));
        expect(l.Description).toBe('Support');
    });

    it('ignores an event that did not come from the textarea', () => {
        const l = line('Support');
        editor(true).SetDescription(l, { target: document.createElement('input') } as unknown as Event);
        expect(l.Description).toBe('Support');
    });
});

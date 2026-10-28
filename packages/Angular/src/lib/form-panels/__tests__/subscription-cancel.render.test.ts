// @vitest-environment jsdom
/**
 * In edit mode the Cancel subscription control is shown disabled, with a hint, because the form will
 * not reload the record over unsaved edits after a cancellation (bizapps-orders#749). Rendered through
 * the component's real template.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { MJOMoneyPipe } from '../../panels/money-format';
import { MJOSubscriptionCancelComponent } from '../subscription-cancel.component';

const HINT = 'Save or discard your edits first';

beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
    TestBed.resetTestingModule();
});

function render(editMode: boolean): HTMLElement {
    const template = readFileSync(join(import.meta.dirname, '..', 'subscription-cancel.component.html'), 'utf8');
    TestBed.configureTestingModule({
        imports: [FormsModule, MJOMoneyPipe],
        declarations: [MJOSubscriptionCancelComponent],
        providers: [provideZonelessChangeDetection()],
        // mjButton is the host's button styling; the button itself still renders.
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    TestBed.overrideComponent(MJOSubscriptionCancelComponent, { set: { template, templateUrl: undefined, styleUrls: [], styles: [] } });
    const fixture = TestBed.createComponent(MJOSubscriptionCancelComponent);
    fixture.componentRef.setInput('Record', {
        ID: '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f',
        IsSaved: true,
        Status: 'Active',
        EntityInfo: { GetUserPermisions: () => ({ CanUpdate: true }) },
    } as unknown as mjBizAppsOrdersSubscriptionEntity);
    fixture.componentRef.setInput('Provider', { CurrentUser: { ID: 'user-1' } } as unknown as IMetadataProvider);
    fixture.componentRef.setInput('EditMode', editMode);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
}

const cancelButton = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel subscription')) as HTMLButtonElement | undefined;

describe('Cancel subscription — edit mode (#749)', () => {
    it('is disabled with a hint while the form is in edit mode', () => {
        const el = render(true);
        expect(cancelButton(el)?.disabled).toBe(true);
        expect(el.querySelector('.mjo-sc-toolbar')?.textContent).toContain(HINT);

        cancelButton(el)?.click();
        expect(el.querySelector('.mjo-sc')).toBeNull();
    });

    it('is enabled, with no hint, outside edit mode', () => {
        const el = render(false);
        expect(cancelButton(el)?.disabled).toBe(false);
        expect(el.textContent).not.toContain(HINT);
    });
});

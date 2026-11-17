// @vitest-environment jsdom
/**
 * The Orders home's review card (golive #442), rendered through its real template with the Tasks
 * inbox replaced by a stub that records its inputs. Setting the inbox's person starts its first
 * read, so the type filter must already be set by then, or that read lists every approval type.
 */
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PERSON = '5d1f3b0a-7c2e-4e9b-a1d4-6f8e0c2b9a37';

vi.mock('@mj-biz-apps/tasks-ng', () => import('./approval-inbox.stub'));

import { MJOOrderReviewQueueComponent } from '../order-review-queue.component';
import { InboxSeen as seen, ResolveCurrentPersonID as resolvePerson } from './approval-inbox.stub';

beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

beforeEach(() => {
    for (const key of Object.keys(seen)) delete seen[key as keyof typeof seen];
    resolvePerson.mockReset();
});

afterEach(() => {
    TestBed.resetTestingModule();
});

async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(MJOOrderReviewQueueComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
}

describe('mjo-order-review-queue', () => {
    it('gives the inbox the Order Review filter and title before the person', async () => {
        resolvePerson.mockResolvedValue(PERSON);
        const el = await render();
        expect(seen.person).toBe(PERSON);
        expect(seen.typeAtPerson).toBe('Order Review');
        expect(seen.titleAtPerson).toBe('Orders awaiting review');
        expect(el.querySelector('h3')?.textContent).toBe('Orders awaiting review');
    });

    it('shows nothing for a user with no active Person', async () => {
        resolvePerson.mockResolvedValue(null);
        const el = await render();
        expect(el.querySelector('bizapps-approval-inbox')).toBeNull();
        expect(seen.person).toBeUndefined();
    });

    it('shows nothing when the Person lookup fails', async () => {
        resolvePerson.mockRejectedValue(new Error('denied'));
        const el = await render();
        expect(el.querySelector('bizapps-approval-inbox')).toBeNull();
    });
});

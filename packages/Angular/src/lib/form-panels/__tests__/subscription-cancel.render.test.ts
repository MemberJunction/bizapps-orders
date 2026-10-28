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

/**
 * E2b: when a payment gateway bills the subscription, the open panel says so under its title and the
 * preview carries a "Payment gateway" row; a subscription the gateway does not bill shows neither.
 */
type Output = MJOSubscriptionCancelComponent['Preview'];

const NOTICE = 'The payment gateway bills this subscription';
const DECISION = { EffectiveDate: '2026-12-31T00:00:00.000Z', AccessThroughDate: '2027-01-30T00:00:00.000Z', RefundAmount: 0 };

function renderOpen(options: { gatewayId?: string | null; preview?: Output; error?: string }): HTMLElement {
    const template = readFileSync(join(import.meta.dirname, '..', 'subscription-cancel.component.html'), 'utf8');
    TestBed.configureTestingModule({
        imports: [FormsModule, MJOMoneyPipe],
        declarations: [MJOSubscriptionCancelComponent],
        providers: [provideZonelessChangeDetection()],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    TestBed.overrideComponent(MJOSubscriptionCancelComponent, { set: { template, templateUrl: undefined, styleUrls: [], styles: [] } });
    const fixture = TestBed.createComponent(MJOSubscriptionCancelComponent);
    fixture.componentRef.setInput('Record', {
        ID: '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f',
        IsSaved: true,
        Status: 'Active',
        SubscriptionType: 'Annual',
        ProviderSubscriptionID: options.gatewayId ?? null,
        EntityInfo: { GetUserPermisions: () => ({ CanUpdate: true }) },
    } as unknown as mjBizAppsOrdersSubscriptionEntity);
    fixture.componentRef.setInput('Provider', { CurrentUser: { ID: 'user-1' } } as unknown as IMetadataProvider);
    const c = fixture.componentInstance;
    c.Start();
    c.Preview = options.preview ?? null;
    c.Error = options.error ?? null;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
}

/** The preview's rows as { label: value }. */
function rows(el: HTMLElement): Record<string, string> {
    const out: Record<string, string> = {};
    el.querySelectorAll('.mjo-sc__preview > div').forEach((d) => {
        out[d.querySelector('dt')?.textContent?.trim() ?? ''] = d.querySelector('dd')?.textContent?.trim() ?? '';
    });
    return out;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('Cancel subscription — payment gateway (E2b)', () => {
    it('says under the title that the gateway bills it, naming the gateway id', () => {
        const el = renderOpen({ gatewayId: 'sub_1Abc' });
        const notice = el.querySelector('#mjo-sc-gateway');
        expect(notice).not.toBeNull();
        expect(squash(notice?.textContent)).toBe(
            'The payment gateway bills this subscription (sub_1Abc). Cancelling here also cancels it there, first: if the gateway does not confirm, nothing changes. Refunds are made at the gateway.',
        );
        // Placed directly under the title, before the timing choice.
        expect(el.querySelector('#mjo-sc-title')?.nextElementSibling).toBe(notice);
    });

    it('shows no notice for a subscription the gateway does not bill, and the panel is otherwise unchanged', () => {
        const el = renderOpen({ gatewayId: null });
        expect(el.querySelector('#mjo-sc-gateway')).toBeNull();
        expect(el.textContent).not.toContain(NOTICE);
        // Control: the rest of the panel is still there.
        expect(el.querySelector('#mjo-sc-title')?.textContent).toContain('Cancel subscription');
        expect(el.querySelectorAll('input[type="radio"]')).toHaveLength(3);
        expect(el.querySelector('textarea[name="reason"]')).not.toBeNull();
        expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Keep subscription', 'Preview']);
    });

    it('previews "Stops billing today" for an immediate gateway cancel', () => {
        const el = renderOpen({
            gatewayId: 'sub_x',
            preview: { Success: true, Decision: DECISION, Gateway: { ProviderSubscriptionID: 'sub_x', When: 'Now' } } as Output,
        });
        expect(rows(el)['Payment gateway']).toBe('Stops billing today');
    });

    it('previews the day billing ends for an end-of-coverage gateway cancel', () => {
        const el = renderOpen({
            gatewayId: 'sub_x',
            preview: {
                Success: true,
                Decision: DECISION,
                Gateway: { ProviderSubscriptionID: 'sub_x', When: 'EndOfCoverage', BillingEndsAt: '2026-12-31T00:00:00.000Z' },
            } as Output,
        });
        expect(rows(el)['Payment gateway']).toBe("Won't renew; nothing charged after 2026-12-31");
    });

    it('has no gateway row when the output has no Gateway, and the other rows are as before', () => {
        const el = renderOpen({ gatewayId: null, preview: { Success: true, Decision: DECISION } as Output });
        const r = rows(el);
        expect(Object.keys(r)).not.toContain('Payment gateway');
        expect(r['Coverage ends']).toBe('2026-12-31');
        expect(r['Access ends']).toBe('2027-01-30');
        expect(Object.keys(r)).toEqual(['Coverage ends', 'Access ends', 'Refund']);
        expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Keep subscription', 'Confirm cancellation']);
    });

    it('shows a gateway refusal as the panel error, with the panel still open', () => {
        const message = 'The payment gateway did not confirm the cancel of sub_x: card_declined. Nothing was changed in Orders. Try again.';
        const el = renderOpen({ gatewayId: 'sub_x', error: message });
        expect(el.querySelector('.mjo-sc')).not.toBeNull();
        expect(squash(el.querySelector('.mjo-sc__error[role="alert"]')?.textContent)).toBe(message);
    });
});

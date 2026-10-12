// @vitest-environment jsdom
/**
 * The order form's access override panel offers Approve and Reject only to a viewer the server would
 * let decide (bizapps-orders#517): an assignee of the approval task who is not the requester, and
 * Approve only on or before the override's last day. Everyone else sees whom the request is waiting
 * on. Rendered through the panel's real template; only the data reads are faked.
 */
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import type { mjBizAppsOrdersOrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { OrderAccessOverridesPanel } from '../order-access-overrides.panel';

const ORDER = '11111111-0000-4000-8000-000000000001';
const TASK = '22222222-0000-4000-8000-000000000001';
const REQUESTER = '33333333-0000-4000-8000-000000000001';
const APPROVER = '33333333-0000-4000-8000-000000000002';
const BYSTANDER = '33333333-0000-4000-8000-000000000003';
const APPROVER_PERSON = '44444444-0000-4000-8000-000000000002';
const PERSON_ENTITY_ID = '55555555-0000-4000-8000-000000000001';
const USER_ENTITY_ID = '55555555-0000-4000-8000-000000000002';
const TODAY = '2026-10-09';

interface OverrideRow {
    ID: string;
    OrderHeaderID: string;
    OverrideType: string;
    Status: string;
    Reason: string;
    EffectiveThrough: string;
    RequestedAt: string;
    RequestedByUserID: string;
    RequestedByUser: string;
    ApprovalTaskID: string | null;
    DecidedAt: string | null;
    DecidedByUser: string | null;
    DecisionNotes: string | null;
}

const openRequest = (over: Partial<OverrideRow> = {}): OverrideRow => ({
    ID: '66666666-0000-4000-8000-000000000001',
    OrderHeaderID: ORDER,
    OverrideType: 'DeferCutoff',
    Status: 'Requested',
    Reason: 'Customer is paying by wire next week.',
    EffectiveThrough: '2026-10-31',
    RequestedAt: '2026-10-08',
    RequestedByUserID: REQUESTER,
    RequestedByUser: 'Riley Requester',
    ApprovalTaskID: TASK,
    DecidedAt: null,
    DecidedByUser: null,
    DecisionNotes: null,
    ...over,
});

/** A provider whose views answer from these rows: overrides, the task's assignments, and the assignees. */
function fakeProvider(viewer: string, overrides: OverrideRow[], opts: { AssignmentsFail?: boolean } = {}) {
    return {
        CurrentUser: { ID: viewer, Name: 'Viewer' },
        Authorizations: [],
        EntityByName: (name: string) =>
            name === 'MJ_BizApps_Common: People' ? { ID: PERSON_ENTITY_ID } : name === 'MJ: Users' ? { ID: USER_ENTITY_ID } : undefined,
        RunView: async (params: { EntityName: string }) => {
            switch (params.EntityName) {
                case 'MJ_BizApps_Orders: Entitlement Access Overrides':
                    return { Success: true, Results: overrides };
                case 'MJ_BizApps_Tasks: Task Assignments':
                    if (opts.AssignmentsFail) return { Success: false, ErrorMessage: 'permission denied' };
                    // SQL Server hands IDs back upper-cased.
                    return {
                        Success: true,
                        Results: [{ TaskID: TASK.toUpperCase(), AssigneeEntityID: PERSON_ENTITY_ID.toUpperCase(), AssigneeRecordID: APPROVER_PERSON.toUpperCase() }],
                    };
                case 'MJ_BizApps_Common: People':
                    return {
                        Success: true,
                        Results: [{ ID: APPROVER_PERSON.toUpperCase(), LinkedUserID: APPROVER.toUpperCase(), DisplayName: 'Avery Approver', FirstName: 'Avery', LastName: 'Approver' }],
                    };
                default:
                    return { Success: true, Results: [] };
            }
        },
    };
}

beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

beforeEach(() => {
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(BusinessTimeZoneEngine.Instance, 'Today').mockReturnValue(TODAY);
});

afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
});

/** Render the panel as `viewer` and wait for its loads to settle. */
async function render(viewer: string, overrides: OverrideRow[], opts: { AssignmentsFail?: boolean } = {}): Promise<HTMLElement> {
    const template = readFileSync(join(import.meta.dirname, '..', 'order-access-overrides.panel.html'), 'utf8');
    TestBed.configureTestingModule({
        imports: [FormsModule],
        declarations: [OrderAccessOverridesPanel],
        providers: [provideZonelessChangeDetection()],
        // mj-collapsible-panel and mjButton are the host's chrome; their content still renders.
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    TestBed.overrideComponent(OrderAccessOverridesPanel, { set: { template, templateUrl: undefined, styleUrls: [], styles: [] } });
    const fixture = TestBed.createComponent(OrderAccessOverridesPanel);
    const panel = fixture.componentInstance;
    panel.Record = { ID: ORDER, IsSaved: true } as unknown as mjBizAppsOrdersOrderHeaderEntity;
    panel.FormComponent = {
        ProviderToUse: fakeProvider(viewer, overrides, opts),
        cdr: { detectChanges: () => undefined },
        SetSectionRowCount: () => undefined,
    } as unknown as BaseFormComponent;
    fixture.detectChanges(); // runs ngOnInit, which starts the load
    await vi.waitFor(() => expect(panel.Loading).toBe(false));
    // In the form the panel re-renders through the host form's change detector; here, through its own.
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
}

const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('.mjo-ao-decide button')].map((b) => b.textContent?.trim() ?? '');
const waiting = (el: HTMLElement): string => el.querySelector('.mjo-ao-waiting')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Access overrides panel — who is offered a decision (#517)', () => {
    it('offers Approve and Reject to the approval task assignee', async () => {
        const el = await render(APPROVER, [openRequest()]);
        expect(buttons(el)).toEqual(['Reject', 'Approve']);
        expect(waiting(el)).toBe('');
    });

    it('offers nothing to a user the task is not assigned to, and says whom it waits on', async () => {
        const el = await render(BYSTANDER, [openRequest()]);
        expect(buttons(el)).toEqual([]);
        expect(waiting(el)).toBe('Waiting on Avery Approver.');
    });

    it('offers nothing to the requester, even one the task is assigned to', async () => {
        // The server never assigns the requester, but a task reassigned by hand could; the rule still holds.
        const self = await render(APPROVER, [openRequest({ RequestedByUserID: APPROVER })]);
        expect(buttons(self)).toEqual([]);
        expect(waiting(self)).toBe('Waiting on Avery Approver. You requested it, so you cannot decide it.');
    });

    it("offers the assignee only Reject once the override's last day has passed", async () => {
        const el = await render(APPROVER, [openRequest({ EffectiveThrough: '2026-10-08' })]);
        expect(buttons(el)).toEqual(['Reject']);
        expect(waiting(el)).toMatch(/last day \(2026-10-08\) has passed/);
    });

    it('offers nothing on a request that is already decided', async () => {
        const el = await render(APPROVER, [openRequest({ Status: 'Approved', DecidedAt: '2026-10-09', DecidedByUser: 'Avery Approver' })]);
        expect(buttons(el)).toEqual([]);
        expect(waiting(el)).toBe('');
    });

    it('offers nothing, and says so, when the assignees cannot be read', async () => {
        const el = await render(APPROVER, [openRequest()], { AssignmentsFail: true });
        expect(buttons(el)).toEqual([]);
        expect(waiting(el)).toMatch(/Could not read who these requests are waiting on: .*permission denied/);
    });
});


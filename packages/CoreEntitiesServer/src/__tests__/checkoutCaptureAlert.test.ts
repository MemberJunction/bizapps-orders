/**
 * Terminal checkout-capture alert: the Tasks row must carry TypeID.
 * TypeID is NOT NULL with no default; a Save without it never lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockRunView, mockEntityByName, mockGetEntityObject, mockLogError, mockTask, mockAssign } = vi.hoisted(() => {
    const mockTask = {
        ID: 'task-new',
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: { CompleteMessage: '' },
        Name: '',
        Description: null as string | null,
        Status: 'Open' as 'Blocked' | 'Cancelled' | 'Completed' | 'InProgress' | 'Open',
        TypeID: '',
    };
    return {
        mockRunView: vi.fn(),
        mockEntityByName: vi.fn(),
        mockGetEntityObject: vi.fn(),
        mockLogError: vi.fn(),
        mockTask,
        mockAssign: vi.fn(),
    };
});

// Who gets the alert is AlertTaskAssignment's job (its own tests); here: every raised Task is handed to it once.
vi.mock('../AlertTaskAssignment.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../AlertTaskAssignment.js')>()),
    AssignAlertTask: (...args: unknown[]) => mockAssign(...args),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        Metadata: class {
            // The global provider: what the checkout paths, which have none of their own, write through.
            static Provider = { name: 'the global provider', EntityByName: mockEntityByName, GetEntityObject: mockGetEntityObject };
        },
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

import { Metadata } from '@memberjunction/core';
import {
    CHECKOUT_CAPTURE_TASK_ENTITY,
    CHECKOUT_CAPTURE_TASK_TYPE_CODE,
    CHECKOUT_CAPTURE_TASK_TYPE_ENTITY,
    OUTBOUND_DEAD_LETTER_LOG_MARKER,
    OpenProviderSubscriptionAlerts,
    PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER,
    ProviderSubscriptionAlertName,
    raiseCheckoutCaptureTerminalAlert,
    raiseCheckoutSettledNotBookedAlert,
    raiseOutboundDeadLetterAlert,
    raiseProviderSubscriptionAlert,
} from '../checkoutCaptureAlert.js';
import { CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER } from '../checkoutCaptureRetry.js';
import { IsOpenApprovalTask, OPEN_TASK_SQL } from '../ConcessionApprovalTask.js';

const user = { ID: 'user-1', Email: 'ops@example.com' } as unknown as UserInfo;
const GENERAL_TYPE_ID = 'F7C1E8DE-8DAC-4BF8-943E-3D5A1210BE82';

beforeEach(() => {
    mockRunView.mockReset();
    mockEntityByName.mockReset();
    mockGetEntityObject.mockReset();
    mockLogError.mockReset();
    mockAssign.mockReset().mockResolvedValue({ Assigned: 2 });
    mockTask.NewRecord.mockReset();
    mockTask.Save.mockReset().mockResolvedValue(true);
    mockTask.Name = '';
    mockTask.Description = null;
    mockTask.Status = 'Open';
    mockTask.TypeID = '';
    mockEntityByName.mockReturnValue({ Name: CHECKOUT_CAPTURE_TASK_ENTITY });
    mockGetEntityObject.mockResolvedValue(mockTask);
    mockRunView.mockResolvedValue({ Success: true, Results: [{ ID: GENERAL_TYPE_ID }] });
});

describe('raiseCheckoutCaptureTerminalAlert', () => {
    it('always logs the marker, even when no user can write a Task', async () => {
        await raiseCheckoutCaptureTerminalAlert('order-1', 'sess-1', 'UnknownTender');
        expect(mockLogError.mock.calls[0][0]).toContain(CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('skips the Task when bizapps-tasks is not installed', async () => {
        mockEntityByName.mockReturnValue(undefined);
        await raiseCheckoutCaptureTerminalAlert('order-1', 'sess-1', 'UnknownTender', user);
        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('skips the Task when GENERAL TaskType cannot be resolved — does not Save without TypeID', async () => {
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
        await raiseCheckoutCaptureTerminalAlert('order-1', 'sess-1', 'UnknownTender', user);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
        expect(mockTask.Save).not.toHaveBeenCalled();
        expect(mockLogError.mock.calls.some((c) => String(c[0]).includes('No GENERAL TaskType'))).toBe(true);
    });

    it('looks up TaskType by Code via the typed entity, then assigns TypeID before Save', async () => {
        await raiseCheckoutCaptureTerminalAlert('order-9', 'sess-9', 'no bill-to party', user);

        expect(mockRunView).toHaveBeenCalledTimes(1);
        const params = mockRunView.mock.calls[0][0] as {
            EntityName: string;
            ExtraFilter: string;
            ResultType: string;
            MaxRows: number;
        };
        expect(params.EntityName).toBe(CHECKOUT_CAPTURE_TASK_TYPE_ENTITY);
        expect(params.ExtraFilter).toBe(`Code = '${CHECKOUT_CAPTURE_TASK_TYPE_CODE}'`);
        expect(params.ExtraFilter).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}/);
        expect(params.ResultType).toBe('entity_object');
        expect(params.MaxRows).toBe(1);

        expect(mockTask.TypeID).toBe(GENERAL_TYPE_ID);
        expect(mockTask.Status).toBe('Open');
        expect(mockTask.Name).toContain('order-9');
        expect(mockTask.Save).toHaveBeenCalledTimes(1);
    });
});

describe('raiseCheckoutSettledNotBookedAlert', () => {
    it('logs the marker with the session and no order, even when no user can write a Task', async () => {
        await raiseCheckoutSettledNotBookedAlert('sess-3', 'pi-3', 'total rose on re-price');
        const logged = String(mockLogError.mock.calls[0][0]);
        expect(logged).toContain(CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER);
        expect(logged).toContain('sess-3');
        expect(logged).toContain('no order was booked');
        expect(logged).not.toContain('confirmed checkout order');
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    /** The Task Types lookup finds GENERAL; the Tasks lookup finds the given rows. */
    const existingTasks = (rows: Array<{ ID: string; Status?: string }>) =>
        mockRunView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === CHECKOUT_CAPTURE_TASK_ENTITY
                ? { Success: true, Results: rows }
                : { Success: true, Results: [{ ID: GENERAL_TYPE_ID }] },
        );

    it('raises a typed Task naming the session and payment intent for a refund', async () => {
        existingTasks([]);
        await raiseCheckoutSettledNotBookedAlert('sess-4', 'pi-4', 'member code declined', user);

        expect(mockTask.TypeID).toBe(GENERAL_TYPE_ID);
        expect(mockTask.Status).toBe('Open');
        expect(mockTask.Name).toContain('sess-4');
        expect(mockTask.Description).toContain('no order was created');
        expect(mockTask.Description).toContain('Payment intent: pi-4');
        expect(mockTask.Description).toContain('member code declined');
        expect(mockTask.Save).toHaveBeenCalledTimes(1);
    });

    it('raises one Task per session: a second report of the same session writes nothing (#724)', async () => {
        existingTasks([{ ID: 'task-1' }]);
        await raiseCheckoutSettledNotBookedAlert('sess-4', 'pi-4', 'the checkout expired', user);

        const lookup = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string };
        expect(lookup.EntityName).toBe(CHECKOUT_CAPTURE_TASK_ENTITY);
        expect(lookup.ExtraFilter).toContain('sess-4');
        expect(mockTask.Save).not.toHaveBeenCalled();
        // The log marker is still written for every report.
        expect(String(mockLogError.mock.calls[0][0])).toContain(CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER);
    });
});

describe('every alert Task is assigned (AlertTaskRole)', () => {
    it('a raised Task is handed to the assignment once, with its ID and the caller', async () => {
        await raiseCheckoutCaptureTerminalAlert('order-9', 'sess-9', 'UnknownTender', user);
        expect(mockTask.Save).toHaveBeenCalledTimes(1);
        expect(mockAssign).toHaveBeenCalledTimes(1);
        expect(mockAssign.mock.calls[0][0]).toBe('task-new');
        // The global provider (it can run views), never the `Metadata` facade (it cannot: OB10 caught that).
        expect(mockAssign.mock.calls[0][1]).toBe((Metadata as unknown as { Provider: unknown }).Provider);
        expect(mockAssign.mock.calls[0][2]).toBe(user);
    });

    it('a Task that did not save is not assigned', async () => {
        mockTask.Save.mockResolvedValue(false);
        await raiseCheckoutCaptureTerminalAlert('order-9', 'sess-9', 'UnknownTender', user);
        expect(mockAssign).not.toHaveBeenCalled();
    });

    it('no Task written (tasks app missing): nothing to assign', async () => {
        mockEntityByName.mockReturnValue(undefined);
        await raiseCheckoutCaptureTerminalAlert('order-9', 'sess-9', 'UnknownTender', user);
        expect(mockAssign).not.toHaveBeenCalled();
    });
});

describe('raiseOutboundDeadLetterAlert', () => {
    const delivery = { ID: 'deliv-1', ConsumerKey: 'sidecar-lxp', Attempts: 9, LastError: 'ECONNREFUSED' };
    const event = { ID: 'evt-1', EventType: 'GrantStatusChanged', OrderHeaderID: 'ord-1', EntitlementGrantID: 'grant-1' };
    const existingTasks = (rows: Array<{ ID: string; Status?: string }>) =>
        mockRunView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === CHECKOUT_CAPTURE_TASK_ENTITY ? { Success: true, Results: rows } : { Success: true, Results: [{ ID: GENERAL_TYPE_ID }] },
        );

    it('logs the marker and raises one assigned Task naming the consumer, the grant, the event and the last error', async () => {
        existingTasks([]);
        await raiseOutboundDeadLetterAlert(delivery, event, user);
        expect(String(mockLogError.mock.calls[0][0])).toContain(OUTBOUND_DEAD_LETTER_LOG_MARKER);
        expect(mockTask.Name).toBe('Outbound delivery failed: sidecar-lxp, GrantStatusChanged, grant grant-1 (event evt-1)');
        expect(mockTask.Description).toContain('Last error: ECONNREFUSED');
        expect(mockTask.Description).toContain('Attempts: 9');
        expect(mockTask.Description).toContain('re-send this change');
        expect(mockTask.TypeID).toBe(GENERAL_TYPE_ID);
        expect(mockAssign).toHaveBeenCalledTimes(1);
    });

    it('a re-raise of a Task someone already CLOSED writes nothing and assigns (notifies) nobody', async () => {
        existingTasks([{ ID: 'task-1', Status: 'Completed' }]);
        await raiseOutboundDeadLetterAlert(delivery, event, user);
        expect(mockTask.Save).not.toHaveBeenCalled();
        expect(mockAssign).not.toHaveBeenCalled();
    });

    it('one Task per event: the same event reported again writes no Task, and makes sure the one there is assigned', async () => {
        existingTasks([{ ID: 'task-1', Status: 'Open' }]);
        await raiseOutboundDeadLetterAlert(delivery, event, user);
        const lookup = mockRunView.mock.calls[0][0] as { ExtraFilter: string };
        expect(lookup.ExtraFilter).toContain('event evt-1');
        expect(mockTask.Save).not.toHaveBeenCalled();
        // Its first assignment may have failed; assignment is idempotent, so asking again is safe.
        expect(mockAssign).toHaveBeenCalledTimes(1);
        expect(mockAssign.mock.calls[0][0]).toBe('task-1');
    });

    it("writes through the dispatch pass's provider, never the global one (#939's class)", async () => {
        existingTasks([]);
        const passTask = { ...mockTask, ID: 'task-pass', Save: vi.fn().mockResolvedValue(true), NewRecord: vi.fn() };
        const passProvider = {
            EntityByName: vi.fn().mockReturnValue({ Name: CHECKOUT_CAPTURE_TASK_ENTITY }),
            GetEntityObject: vi.fn().mockResolvedValue(passTask),
        };
        await raiseOutboundDeadLetterAlert(delivery, event, user, passProvider as never);
        expect(passProvider.GetEntityObject).toHaveBeenCalledWith(CHECKOUT_CAPTURE_TASK_ENTITY, user);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
        expect(passTask.Save).toHaveBeenCalledTimes(1);
        expect(mockAssign.mock.calls[0][0]).toBe('task-pass');
        expect(mockAssign.mock.calls[0][1]).toBe(passProvider);
    });

    it('an order event (no grant) names the order; an unreadable event still raises one', async () => {
        existingTasks([]);
        await raiseOutboundDeadLetterAlert(delivery, { ...event, EventType: 'OrderConfirmed', EntitlementGrantID: null }, user);
        expect(mockTask.Name).toContain('order ord-1');
        await raiseOutboundDeadLetterAlert(delivery, null, user);
        expect(mockTask.Name).toContain('an unreadable event');
        expect(mockTask.Name).toContain('(event deliv-1)');
    });
});

describe('raiseProviderSubscriptionAlert (option E, E2)', () => {
    const alert = { SubscriptionID: 'sub-id-110', SubscriptionNumber: 'SUB-000110', Code: 'NoProviderPrice', Reason: 'no price flagged UseForNewSubscriptions' };
    const existingTasks = (rows: Array<{ ID: string }>) =>
        mockRunView.mockImplementation(async (params: { EntityName: string }) =>
            params.EntityName === CHECKOUT_CAPTURE_TASK_ENTITY
                ? { Success: true, Results: rows }
                : { Success: true, Results: [{ ID: GENERAL_TYPE_ID }] },
        );

    it('logs its marker and raises a typed Task naming the subscription, the problem and what to do', async () => {
        existingTasks([]);
        expect(await raiseProviderSubscriptionAlert(alert, user)).toBe(true);
        expect(String(mockLogError.mock.calls[0][0])).toContain(PROVIDER_SUBSCRIPTION_ALERT_LOG_MARKER);
        expect(mockTask.TypeID).toBe(GENERAL_TYPE_ID);
        expect(mockTask.Name).toBe('Gateway subscription needs attention: SUB-000110 (NoProviderPrice)');
        expect(mockTask.Description).toContain('no price flagged UseForNewSubscriptions');
        expect(mockTask.Description).toContain('Create Provider Subscriptions');
        // Unlinked: Orders still renews it, and the job that retries it must be on.
        expect(mockTask.Description).toMatch(/still\s+treat it as theirs to renew/);
        expect(mockTask.Description).toMatch(/must be enabled wherever an account has BillsSubscriptions on/);
        expect(mockTask.Save).toHaveBeenCalledTimes(1);
    });

    it('raises one OPEN Task per subscription and problem: while one is open, nothing new and false', async () => {
        existingTasks([{ ID: 'task-1' }]);
        expect(await raiseProviderSubscriptionAlert(alert, user)).toBe(false);
        const lookup = mockRunView.mock.calls[0][0] as { EntityName: string; ExtraFilter: string };
        expect(lookup.ExtraFilter).toContain('SUB-000110 (NoProviderPrice)');
        // Only an open Task stops a new one: after staff close it, a recurrence is raised again.
        expect(lookup.ExtraFilter).toContain(`Status NOT IN ('Completed', 'Cancelled')`);
        expect(mockTask.Save).not.toHaveBeenCalled();
    });

    it('a problem that comes back after its Task was closed raises a new Task', async () => {
        // The open-Task lookup finds nothing (the earlier Task is Completed, so the filter excludes it).
        existingTasks([]);
        expect(await raiseProviderSubscriptionAlert(alert, user)).toBe(true);
        expect(mockTask.Save).toHaveBeenCalledTimes(1);
    });

    it('a linked subscription\'s Task says the gateway bills it, not that Orders renews it', async () => {
        existingTasks([]);
        await raiseProviderSubscriptionAlert({ ...alert, Code: 'LinkedElsewhere', Linked: true }, user);
        expect(mockTask.Description).toContain("Orders' renewal jobs skip it and the gateway bills it");
        expect(mockTask.Description).not.toMatch(/theirs to renew/);
    });

    it('marks an urgent problem in the name, and writes through the caller\'s provider when one is given', async () => {
        existingTasks([]);
        const providerEntityByName = vi.fn().mockReturnValue({ Name: CHECKOUT_CAPTURE_TASK_ENTITY });
        const providerGetEntityObject = vi.fn().mockResolvedValue(mockTask);
        const provider = { EntityByName: providerEntityByName, GetEntityObject: providerGetEntityObject };
        await raiseProviderSubscriptionAlert({ ...alert, Code: 'ChargedAtCreation', Urgent: true }, user, provider as never);
        expect(mockTask.Name).toBe('URGENT: Gateway subscription needs attention: SUB-000110 (ChargedAtCreation)');
        expect(providerGetEntityObject).toHaveBeenCalledTimes(1);
        expect(mockGetEntityObject).not.toHaveBeenCalled();
    });

    it('the settled-not-booked alert keeps its any-status dedupe (a one-off session is resolved once)', async () => {
        existingTasks([{ ID: 'task-closed' }]);
        await raiseCheckoutSettledNotBookedAlert('sess-9', 'pi-9', 'total rose', user);
        const lookup = mockRunView.mock.calls[0][0] as { ExtraFilter: string };
        expect(lookup.ExtraFilter).not.toContain('Status');
        expect(mockTask.Save).not.toHaveBeenCalled();
    });
});

describe('OpenProviderSubscriptionAlerts (option E, E2)', () => {
    it('reads the open provider-subscription Tasks and groups their problems by subscription', async () => {
        mockRunView.mockResolvedValue({
            Success: true,
            Results: [
                { ID: 't1', Name: 'Gateway subscription needs attention: SUB-000110 (EndedAtGateway)' },
                { ID: 't2', Name: 'URGENT: Gateway subscription needs attention: SUB-000110 (ChargedAtCreation)' },
                { ID: 't3', Name: 'Gateway subscription needs attention: SUB-000111 (GatewayRefused)' },
                { ID: 't4', Name: 'Something else entirely' },
            ],
        });
        const open = await OpenProviderSubscriptionAlerts(user);
        expect([...(open.get('SUB-000110') ?? [])].sort()).toEqual(['ChargedAtCreation', 'EndedAtGateway']);
        expect([...(open.get('SUB-000111') ?? [])]).toEqual(['GatewayRefused']);
        const read = mockRunView.mock.calls[0][0] as { ExtraFilter: string };
        expect(read.ExtraFilter).toContain(`Status NOT IN ('Completed', 'Cancelled')`);
        expect(read.ExtraFilter).toContain(`Name LIKE 'Gateway subscription needs attention: %'`);
    });

    it('reads back every name ProviderSubscriptionAlertName writes, urgent or not, through the one open-Task rule', async () => {
        mockRunView.mockResolvedValue({
            Success: true,
            Results: [
                { ID: 't1', Name: ProviderSubscriptionAlertName('SUB-000120', 'FoundMismatch') },
                { ID: 't2', Name: ProviderSubscriptionAlertName('SUB-000120', 'ChargedAtCreation', true) },
                { ID: 't3', Name: ProviderSubscriptionAlertName('SUB-000121', 'FailedBeforeCreate') },
            ],
        });
        const open = await OpenProviderSubscriptionAlerts(user);
        expect([...(open.get('SUB-000120') ?? [])].sort()).toEqual(['ChargedAtCreation', 'FoundMismatch']);
        expect([...(open.get('SUB-000121') ?? [])]).toEqual(['FailedBeforeCreate']);
        expect((mockRunView.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter).toContain(OPEN_TASK_SQL);
        // The SQL and the in-memory rule are the same rule.
        expect(OPEN_TASK_SQL).toBe(`Status NOT IN ('Completed', 'Cancelled')`);
        expect(['Open', 'In Progress', 'Completed', 'Cancelled'].filter(IsOpenApprovalTask)).toEqual(['Open', 'In Progress']);
    });

    it('is empty, not an error, when the tasks app is not installed or the read fails', async () => {
        mockEntityByName.mockReturnValue(undefined);
        expect((await OpenProviderSubscriptionAlerts(user)).size).toBe(0);
        mockEntityByName.mockReturnValue({ Name: CHECKOUT_CAPTURE_TASK_ENTITY });
        mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'timeout' });
        expect((await OpenProviderSubscriptionAlerts(user)).size).toBe(0);
    });
});

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
vi.mock('../AlertTaskAssignment.js', () => ({ AssignAlertTask: (...args: unknown[]) => mockAssign(...args) }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        Metadata: class {
            static Provider = { name: 'the global provider' };
            EntityByName = mockEntityByName;
            GetEntityObject = mockGetEntityObject;
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
    raiseCheckoutCaptureTerminalAlert,
    raiseCheckoutSettledNotBookedAlert,
    raiseOutboundDeadLetterAlert,
} from '../checkoutCaptureAlert.js';
import { CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER } from '../checkoutCaptureRetry.js';

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
    const existingTasks = (rows: Array<{ ID: string }>) =>
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
    const existingTasks = (rows: Array<{ ID: string }>) =>
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

    it('one Task per event: the same event reported again writes nothing', async () => {
        existingTasks([{ ID: 'task-1' }]);
        await raiseOutboundDeadLetterAlert(delivery, event, user);
        const lookup = mockRunView.mock.calls[0][0] as { ExtraFilter: string };
        expect(lookup.ExtraFilter).toContain('event evt-1');
        expect(mockTask.Save).not.toHaveBeenCalled();
        expect(mockAssign).not.toHaveBeenCalled();
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

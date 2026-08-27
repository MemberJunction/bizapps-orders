/**
 * Terminal checkout-capture alert: the Tasks row must carry TypeID.
 * TypeID is NOT NULL with no default; a Save without it never lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockRunView, mockEntityByName, mockGetEntityObject, mockLogError, mockTask } = vi.hoisted(() => {
    const mockTask = {
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
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        Metadata: class {
            EntityByName = mockEntityByName;
            GetEntityObject = mockGetEntityObject;
        },
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

import {
    CHECKOUT_CAPTURE_TASK_ENTITY,
    CHECKOUT_CAPTURE_TASK_TYPE_CODE,
    CHECKOUT_CAPTURE_TASK_TYPE_ENTITY,
    raiseCheckoutCaptureTerminalAlert,
} from '../checkoutCaptureAlert.js';
import { CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER } from '../checkoutCaptureRetry.js';

const user = { ID: 'user-1', Email: 'ops@example.com' } as unknown as UserInfo;
const GENERAL_TYPE_ID = 'F7C1E8DE-8DAC-4BF8-943E-3D5A1210BE82';

beforeEach(() => {
    mockRunView.mockReset();
    mockEntityByName.mockReset();
    mockGetEntityObject.mockReset();
    mockLogError.mockReset();
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

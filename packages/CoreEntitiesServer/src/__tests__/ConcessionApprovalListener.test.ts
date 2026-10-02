/**
 * A decision recorded on a concession's approval task decides that concession; when the concession refuses
 * it, the concession is put back in front of its approvers on a fresh task (golive #274).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const approval = vi.hoisted(() => ({
    LinkedConcessionIDs: vi.fn(),
    RaiseConcessionApprovalAgain: vi.fn(),
    ReleaseOrderFromTasks: vi.fn(),
    requireSubclass: vi.fn(),
}));
vi.mock('../ConcessionApprovalTask.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ConcessionApprovalTask.js')>()),
    ...approval,
}));

const { ApplyTaskDecisionToConcessions } = await import('../ConcessionApprovalListener.js');
const { OrderConcessionEntityServer } = await import('../OrderConcessionEntityServer.js');
const { ORDER_CONCESSION_ENTITY } = await import('../entity-names.js');

const USER = { ID: 'user-approver' };
const TASK_ID = 'task-1';
const ORDER_ID = 'order-1';
const CONCESSION_ID = 'concession-1';
const REQUESTER_ID = 'user-rep';

type FakeConcession = InstanceType<typeof OrderConcessionEntityServer> & { saves: number };

/** A Pending concession whose Save answers `saves` and whose rule names role-1. */
function concession(opts: { status?: string; saves: boolean; refusal?: string }): FakeConcession {
    const row = Object.create(OrderConcessionEntityServer.prototype) as FakeConcession & Record<string, unknown>;
    // Field accessors live on BaseEntity, so they are shadowed rather than assigned.
    Object.defineProperty(row, 'ID', { value: CONCESSION_ID });
    Object.defineProperty(row, 'OrderHeaderID', { value: ORDER_ID });
    Object.defineProperty(row, 'RequestedByUserID', { value: REQUESTER_ID });
    Object.defineProperty(row, 'Status', { value: opts.status ?? 'Pending', writable: true });
    Object.defineProperty(row, 'DecisionNotes', { value: null, writable: true });
    Object.defineProperty(row, 'LatestResult', { value: { CompleteMessage: opts.refusal ?? '' } });
    row.DecidedThroughTask = false;
    row.saves = 0;
    row.Load = vi.fn().mockResolvedValue(true);
    row.Save = vi.fn(async () => {
        row.saves++;
        return opts.saves;
    });
    row.ApprovingRoleID = vi.fn().mockResolvedValue('role-1');
    return row;
}

function decision(row: FakeConcession, outcome: { Code: string; IsTerminal: boolean }) {
    const provider = {
        GetEntityObject: vi.fn(async (name: string) =>
            name === ORDER_CONCESSION_ENTITY ? row : { Load: vi.fn().mockResolvedValue(true), ...outcome },
        ),
    };
    return {
        ContextCurrentUser: USER,
        ProviderToUse: provider,
        TaskID: TASK_ID,
        OutcomeID: 'outcome-1',
        DecisionNotes: 'decided on the task',
    } as unknown as Parameters<typeof ApplyTaskDecisionToConcessions>[0];
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('ApplyTaskDecisionToConcessions', () => {
    it('approves the task\'s concession as the decider, with the note, and moves the order off the task', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        const row = concession({ saves: true });

        const results = await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Approved', IsTerminal: true }));

        expect(results).toEqual([{ ConcessionID: CONCESSION_ID, Applied: true }]);
        expect(row.Status).toBe('Approved');
        expect(row.DecisionNotes).toBe('decided on the task');
        expect(row.DecidedThroughTask).toBe(true);
        expect(approval.ReleaseOrderFromTasks).toHaveBeenCalledWith(ORDER_ID, [TASK_ID], expect.objectContaining({ User: USER }));
        expect(approval.RaiseConcessionApprovalAgain).not.toHaveBeenCalled();
    });

    it('rejects on a Rejected outcome', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        const row = concession({ saves: true });

        await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Rejected', IsTerminal: true }));

        expect(row.Status).toBe('Rejected');
    });

    it('puts a concession that refuses the decision back in front of its approvers, with the reason', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        approval.RaiseConcessionApprovalAgain.mockResolvedValue('task-2');
        const refusal = 'Only a holder of the role named by the ConcessionLimit rule can decide this concession.';
        const row = concession({ saves: false, refusal });

        const results = await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Approved', IsTerminal: true }));

        expect(row.saves).toBe(1);
        expect(approval.RaiseConcessionApprovalAgain).toHaveBeenCalledWith(
            { ID: CONCESSION_ID, OrderHeaderID: ORDER_ID, RequestedByUserID: REQUESTER_ID },
            'role-1',
            TASK_ID,
            refusal,
            expect.objectContaining({ User: USER }),
        );
        expect(approval.ReleaseOrderFromTasks).not.toHaveBeenCalled();
        expect(results).toEqual([{ ConcessionID: CONCESSION_ID, Applied: false, Message: refusal, ReraisedTaskID: 'task-2' }]);
    });

    it('routes the concession again on a terminal outcome orders does not know, without deciding it', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        approval.RaiseConcessionApprovalAgain.mockResolvedValue('task-2');
        const row = concession({ saves: true });

        const results = await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Escalated', IsTerminal: true }));

        expect(row.saves).toBe(0);
        expect(row.Status).toBe('Pending');
        expect(approval.RaiseConcessionApprovalAgain).toHaveBeenCalledWith(
            expect.objectContaining({ ID: CONCESSION_ID }),
            'role-1',
            TASK_ID,
            expect.stringContaining("'Escalated'"),
            expect.anything(),
        );
        expect(results[0]).toMatchObject({ Applied: false, ReraisedTaskID: 'task-2' });
    });

    it('does nothing on an interim outcome', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        const row = concession({ saves: true });

        expect(await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Approved', IsTerminal: false }))).toEqual([]);
        expect(row.saves).toBe(0);
        expect(approval.RaiseConcessionApprovalAgain).not.toHaveBeenCalled();
    });

    it('leaves a concession that was already decided on its record alone', async () => {
        approval.LinkedConcessionIDs.mockResolvedValue([CONCESSION_ID]);
        const row = concession({ status: 'Approved', saves: true });

        expect(await ApplyTaskDecisionToConcessions(decision(row, { Code: 'Rejected', IsTerminal: true }))).toEqual([]);
        expect(row.saves).toBe(0);
        expect(approval.RaiseConcessionApprovalAgain).not.toHaveBeenCalled();
    });
});

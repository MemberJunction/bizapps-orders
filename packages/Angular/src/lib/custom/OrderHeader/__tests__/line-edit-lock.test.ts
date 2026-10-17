/**
 * The order lines editor's read-only state when a registered order-line veto refuses
 * (bizapps-sales#328).
 *
 * Two layers: `LineEditRefusals`, which turns the server's answer into the sentences shown, and the
 * editor itself — that a refusal, a failed check and a check still in flight all switch `EditMode`
 * off, and that nothing refusing leaves it as the form set it. The operation is mocked; what it
 * answers is pinned in CoreEntitiesServer's CheckOrderLinesEditableOperation.test.ts.
 */
import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteOpResult } from '@memberjunction/core';
import type { OrdersCheckOrderLinesEditableOutput } from '@mj-biz-apps/orders-entities';

type CheckResult = RemoteOpResult<OrdersCheckOrderLinesEditableOutput>;

const mocks = vi.hoisted(() => ({
    next: null as (() => Promise<unknown>) | null,
    asked: [] as Array<{ OrderHeaderID: string }>,
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    class FakeCheck {
        public Execute(input: { OrderHeaderID: string }): Promise<unknown> {
            mocks.asked.push(input);
            return mocks.next ? mocks.next() : Promise.resolve(null);
        }
    }
    return { ...actual, OrdersCheckOrderLinesEditableOperation: FakeCheck };
});

import { LINE_EDIT_CHECKING, LINE_EDIT_CHECK_FAILED, LineEditCheckFailed, LineEditRefusals } from '../line-edit-lock';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const CLOSED = 'This deal is closed. Set the status back to Open before adding a product.';

function answered(output: Partial<OrdersCheckOrderLinesEditableOutput>): CheckResult {
    return {
        Success: true,
        Output: { CreateRefusal: null, UpdateRefusal: null, DeleteRefusal: null, ...output },
    };
}

describe('LineEditRefusals', () => {
    it('is empty when nothing refuses', () => {
        expect(LineEditRefusals(answered({}))).toEqual([]);
    });

    it("returns the vetoer's own words", () => {
        expect(LineEditRefusals(answered({ CreateRefusal: CLOSED }))).toEqual([CLOSED]);
    });

    it('shows a sentence given for several kinds once', () => {
        const same = 'Frozen.';
        expect(LineEditRefusals(answered({ CreateRefusal: same, UpdateRefusal: same, DeleteRefusal: 'Other.' }))).toEqual([
            same,
            'Other.',
        ]);
    });

    it('ignores a blank refusal', () => {
        expect(LineEditRefusals(answered({ UpdateRefusal: '  ' }))).toEqual([]);
    });

    it('fails closed when the operation reports failure, with the server detail', () => {
        const reasons = LineEditRefusals({ Success: false, ErrorMessage: 'FORBIDDEN' });
        expect(reasons).toEqual([`${LINE_EDIT_CHECK_FAILED} (FORBIDDEN)`]);
    });

    it('fails closed when the call threw', () => {
        expect(LineEditRefusals(null, new Error('network down'))).toEqual([`${LINE_EDIT_CHECK_FAILED} (network down)`]);
    });

    it('fails closed on a success with no output', () => {
        expect(LineEditRefusals({ Success: true })).toEqual([LINE_EDIT_CHECK_FAILED]);
    });
});

describe('LineEditCheckFailed', () => {
    it('is false for an answer, refusing or not', () => {
        expect(LineEditCheckFailed(answered({}))).toBe(false);
        expect(LineEditCheckFailed(answered({ CreateRefusal: CLOSED }))).toBe(false);
    });

    it('is true when the call threw, reported failure, or returned no output', () => {
        expect(LineEditCheckFailed(null)).toBe(true);
        expect(LineEditCheckFailed({ Success: false, ErrorMessage: 'boom' })).toBe(true);
        expect(LineEditCheckFailed({ Success: true })).toBe(true);
    });

    it('does not tell the user to reload; the editor offers Retry', () => {
        expect(LINE_EDIT_CHECK_FAILED.toLowerCase()).not.toContain('reload');
    });
});

/** The parts of the editor this test drives; private at compile time only. */
interface EditorUnderTest {
    EditMode: boolean;
    readonly LineEditLockReasons: string[];
    readonly ShowsLineEditLock: boolean;
    PickerOpen: boolean;
    readonly LineEditCheckFailed: boolean;
    readonly CanRetryLineEditCheck: boolean;
    RetryLineEditCheck(): void;
    refreshLineEditLock(): Promise<void>;
}

/**
 * An editor without Angular's injector: the constructor's `inject()` calls need one, and nothing
 * under test reads what they return except `detectChanges`.
 */
function editor(order: { ID: string; IsSaved: boolean } | null, pending: boolean): EditorUnderTest {
    const e = Object.create(MJOOrderLinesEditorComponent.prototype) as Record<string, unknown>;
    Object.assign(e, {
        _order: order,
        cdr: { detectChanges: () => undefined },
        overrideEditorLineIds: new Set<string>(['line-1']),
        lineEditRefusals: [],
        lineEditCheckPending: pending,
        LineEditCheckFailed: false,
        editModeRequested: true,
        PickerOpen: true,
    });
    return e as unknown as EditorUnderTest;
}

async function settle(result: () => Promise<unknown>, order = { ID: ORDER_ID, IsSaved: true }): Promise<EditorUnderTest> {
    mocks.next = result;
    const e = editor(order, true);
    await e.refreshLineEditLock();
    return e;
}

describe('the order lines editor', () => {
    it('is read-only, saying why, while the first check is in flight', () => {
        const e = editor({ ID: ORDER_ID, IsSaved: true }, true);
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons).toEqual([LINE_EDIT_CHECKING]);
        expect(e.ShowsLineEditLock).toBe(true);
    });

    it('stays editable when nothing refuses', async () => {
        mocks.asked = [];
        const e = await settle(() => Promise.resolve(answered({})));
        expect(mocks.asked).toEqual([{ OrderHeaderID: ORDER_ID }]);
        expect(e.EditMode).toBe(true);
        expect(e.ShowsLineEditLock).toBe(false);
    });

    it("goes read-only on a refusal and shows the vetoer's text", async () => {
        const e = await settle(() => Promise.resolve(answered({ CreateRefusal: CLOSED, DeleteRefusal: CLOSED })));
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons).toEqual([CLOSED]);
        expect(e.ShowsLineEditLock).toBe(true);
        expect(e.PickerOpen).toBe(false);
    });

    it('goes read-only when the check reports failure', async () => {
        const e = await settle(() => Promise.resolve({ Success: false, ErrorMessage: 'boom' }));
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons[0]).toContain(LINE_EDIT_CHECK_FAILED);
        expect(e.LineEditCheckFailed).toBe(true);
        expect(e.CanRetryLineEditCheck).toBe(true);
    });

    it('goes read-only when the call throws', async () => {
        const e = await settle(() => Promise.reject(new Error('offline')));
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons).toEqual([`${LINE_EDIT_CHECK_FAILED} (offline)`]);
        expect(e.CanRetryLineEditCheck).toBe(true);
    });

    it('offers no Retry for a refusal, which is an answer and not a failure', async () => {
        const e = await settle(() => Promise.resolve(answered({ UpdateRefusal: CLOSED })));
        expect(e.LineEditCheckFailed).toBe(false);
        expect(e.CanRetryLineEditCheck).toBe(false);
    });

    it('stays read-only while a retry is in flight, then unlocks when nothing refuses', async () => {
        const e = await settle(() => Promise.reject(new Error('offline')));
        let resolve!: (v: unknown) => void;
        mocks.asked = [];
        mocks.next = () => new Promise((r) => (resolve = r));
        e.RetryLineEditCheck();
        expect(mocks.asked).toEqual([{ OrderHeaderID: ORDER_ID }]);
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons).toEqual([LINE_EDIT_CHECKING]);
        expect(e.CanRetryLineEditCheck).toBe(false);
        // A second click while the first retry runs does not ask again.
        e.RetryLineEditCheck();
        expect(mocks.asked).toHaveLength(1);
        resolve(answered({}));
        await vi.waitFor(() => expect(e.EditMode).toBe(true));
        expect(e.LineEditCheckFailed).toBe(false);
        expect(e.ShowsLineEditLock).toBe(false);
    });

    it('shows the failure and Retry again when the retry fails too', async () => {
        const e = await settle(() => Promise.reject(new Error('offline')));
        mocks.next = () => Promise.resolve({ Success: false, ErrorMessage: 'still down' });
        e.RetryLineEditCheck();
        await vi.waitFor(() => expect(e.CanRetryLineEditCheck).toBe(true));
        expect(e.EditMode).toBe(false);
        expect(e.LineEditLockReasons).toEqual([`${LINE_EDIT_CHECK_FAILED} (still down)`]);
    });

    it('shows a refusal, without Retry, when the retry is refused', async () => {
        const e = await settle(() => Promise.reject(new Error('offline')));
        mocks.next = () => Promise.resolve(answered({ CreateRefusal: CLOSED }));
        e.RetryLineEditCheck();
        await vi.waitFor(() => expect(e.LineEditLockReasons).toEqual([CLOSED]));
        expect(e.EditMode).toBe(false);
        expect(e.CanRetryLineEditCheck).toBe(false);
    });

    it('does not ask about an unsaved order, and leaves it editable', async () => {
        mocks.asked = [];
        const e = await settle(() => Promise.resolve(answered({ CreateRefusal: CLOSED })), { ID: ORDER_ID, IsSaved: false });
        expect(mocks.asked).toEqual([]);
        expect(e.EditMode).toBe(true);
    });

    it('does not show the lock when the form itself is not editing', async () => {
        const e = await settle(() => Promise.resolve(answered({ UpdateRefusal: CLOSED })));
        e.EditMode = false;
        expect(e.EditMode).toBe(false);
        expect(e.ShowsLineEditLock).toBe(false);
        // Back into edit mode, the refusal still holds.
        e.EditMode = true;
        expect(e.EditMode).toBe(false);
        expect(e.ShowsLineEditLock).toBe(true);
    });
});

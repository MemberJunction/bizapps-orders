/**
 * Why an order's lines are read-only although the form is in edit mode (bizapps-sales#328).
 *
 * Another app can register a veto that refuses order-line edits — Sales refuses them while the deal
 * behind the order is closed. The veto runs on the server only, so the editor asks
 * `Orders.CheckOrderLinesEditable` and turns the answer into the sentences shown above the lines.
 *
 * FAILS CLOSED, like the seam. A check that could not run is a reason to show the lines read-only,
 * not permission to edit them: the save would ask the same veto and might refuse.
 */
import type { RemoteOpResult } from '@memberjunction/core';
import type { OrdersCheckOrderLinesEditableOutput } from '@mj-biz-apps/orders-entities';

/** Shown while the first answer for an order is on its way. */
export const LINE_EDIT_CHECKING = 'Checking whether these lines can be changed…';

/**
 * Shown when the check itself failed; the server's detail, when it gave one, follows. The editor
 * puts a Retry button beside it, so the text does not tell the user how to try again.
 */
export const LINE_EDIT_CHECK_FAILED = 'Could not check whether these lines can be changed, so they are shown read-only.';

/**
 * Whether the check failed rather than answered: the call threw, reported failure, or returned no
 * output. A failure is retried; a refusal is the vetoer's answer and is not.
 *
 * @param result the operation's result, or null when the call threw before returning one.
 */
export function LineEditCheckFailed(result: RemoteOpResult<OrdersCheckOrderLinesEditableOutput> | null): boolean {
    return !result?.Success || !result.Output;
}

/**
 * The reasons the lines are read-only, one sentence each, or empty when nothing refuses.
 *
 * Any refusal locks every line, the picker and Remove: the vetoer's text is the explanation, and
 * a vetoer that refuses one kind is about a state of the whole order. The same sentence for several
 * kinds is shown once.
 *
 * @param result the operation's result, or null when the call threw before returning one.
 * @param thrown what the call threw, when it did.
 */
export function LineEditRefusals(
    result: RemoteOpResult<OrdersCheckOrderLinesEditableOutput> | null,
    thrown?: unknown,
): string[] {
    if (!result?.Success || !result.Output) {
        const detail =
            result?.ErrorMessage?.trim() || (thrown instanceof Error ? thrown.message : thrown ? String(thrown) : '');
        return [detail ? `${LINE_EDIT_CHECK_FAILED} (${detail})` : LINE_EDIT_CHECK_FAILED];
    }
    const { CreateRefusal, UpdateRefusal, DeleteRefusal } = result.Output;
    const refusals = [CreateRefusal, UpdateRefusal, DeleteRefusal]
        .map((r) => r?.trim() ?? '')
        .filter((r) => r !== '');
    return [...new Set(refusals)];
}

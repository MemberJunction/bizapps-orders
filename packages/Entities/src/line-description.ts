import type { mjBizAppsOrdersOrderLineEntity } from './generated/entities/__mj_BizAppsOrders';

/** `OrderLine.Description` is `NVARCHAR(500)`. An input enforces it; nothing truncates. */
export const ORDER_LINE_DESCRIPTION_MAX_LENGTH = 500;

/**
 * What a typed line description is stored as: one line of text, trimmed, and nothing at all when
 * it is blank. The invoicing rail joins it to the product name and service period as a single
 * line, so a line break or a run of spaces is stored as one space, and every reader of the field
 * sees the same shape.
 */
export function NormalizeLineDescription(text: string | null | undefined): string | null {
    const oneLine = (text ?? '').replace(/\s+/g, ' ').trim();
    return oneLine === '' ? null : oneLine;
}

/**
 * Put a free-text description on an order line (bc-aidp-next-golive#502). The same text reaches
 * the customer's invoice and the invoicing rail, which print it after the product name. Setting
 * it to what the line already holds leaves the line clean, so a field the user only tabbed
 * through does not make the order look edited.
 */
export function SetLineDescription(line: mjBizAppsOrdersOrderLineEntity, text: string | null | undefined): void {
    const next = NormalizeLineDescription(text);
    if (next === (line.Description ?? null)) return;
    line.Description = next;
}

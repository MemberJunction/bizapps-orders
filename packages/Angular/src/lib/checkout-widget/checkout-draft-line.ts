import type { CheckoutSubmissionEvent } from './checkout-widget.component';

/**
 * Maps a widget submission onto the anonymous draft line.
 * Extension payloads are the introspected field maps from ProductType.OrderLineExtensionEntity
 * (any companion entity — Event Order Lines is only one example). No product-type-specific keys.
 */
export function buildCheckoutDraftLine(
    productId: string,
    event: CheckoutSubmissionEvent
): Record<string, unknown> {
    const line: Record<string, unknown> = {
        ProductID: productId,
        Quantity: event.quantity,
    };
    const fields = event.extensionData?.fields;
    const units = event.extensionData?.units;
    if ((fields && Object.keys(fields).length > 0) || (units && units.length > 0)) {
        line.ExtensionData = {
            EntityName: event.extensionData?.entityName,
            Fields: fields,
            Units: units,
        };
    }
    return line;
}

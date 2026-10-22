/**
 * What a payment gateway shows for a charge (#327).
 *
 * Without a description, a gateway dashboard lists a charge by amount and buyer e-mail only, so
 * support and finance cannot tell what was bought without looking up `OrderHeaderID` in Orders. The
 * text is `<first line's product> +N more — Order <OrderNumber>`.
 *
 * CHECKOUT SETS IT IN TWO STEPS. A checkout opens its intent before the order exists — the order is
 * saved only once payment verifies — so the first description carries the products alone, and the
 * order number follows once the order is committed (`SendOrderDescriptionToGateway`).
 *
 * NEVER LOAD-BEARING. Every function here returns null or logs rather than throwing: a charge must not
 * fail, and an order must not un-confirm, because a label could not be read or sent.
 *
 * CONNECTS TO:
 *   OPEN:     ./PaymentIntentService.ts — derives the description from the order when none is given
 *   CHECKOUT: ./CheckoutSessionService.ts — the snapshot description, and the post-commit update
 *   DRIVER:   ./BasePaymentProvider.ts → CreateIntent / UpdateIntent
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { ORDER_HEADER_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

/**
 * Our cap, not the gateway's: Stripe states no maximum for `description`. A dashboard column shows
 * the first few dozen characters, so a longer string only hides the order number at its end.
 */
export const MAX_INTENT_DESCRIPTION_LENGTH = 200;

/**
 * `<first product> +N more — Order <number>`, with either half dropped when unknown.
 *
 * `productNames` is one entry per line, in line order, so N counts lines rather than distinct
 * products. The order number is kept whole when the text must be shortened: it is the part a reader
 * searches for.
 */
export function FormatIntentDescription(productNames: readonly string[], orderNumber?: string | null): string | null {
    const names = productNames.map((n) => n?.trim()).filter((n): n is string => !!n);
    const order = orderNumber?.trim() ? `Order ${orderNumber.trim()}` : '';
    const more = names.length > 1 ? ` +${names.length - 1} more` : '';
    const separator = names.length && order ? ' — ' : '';

    const room = MAX_INTENT_DESCRIPTION_LENGTH - more.length - separator.length - order.length;
    let product = names[0] ?? '';
    if (product.length > room) product = room > 1 ? `${product.slice(0, room - 1).trimEnd()}…` : '';

    const text = `${product}${product ? more : ''}${product ? separator : ''}${order}`.trim();
    return text ? text.slice(0, MAX_INTENT_DESCRIPTION_LENGTH) : null;
}

/** Describe a checkout from its priced snapshot. The order does not exist yet, so no order number. */
export async function DescribeCheckoutSnapshot(
    metadataJSON: string | null | undefined,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    try {
        const productIDs = snapshotProductIDs(metadataJSON);
        if (!productIDs.length) return null;
        const names = await productNames(productIDs, provider, user);
        return FormatIntentDescription(productIDs.map((id) => names.get(id.toLowerCase()) ?? ''));
    } catch (err) {
        LogError(`[IntentDescription] Could not describe checkout snapshot: ${errorText(err)}`);
        return null;
    }
}

/** Describe an existing order from its lines and number. */
export async function DescribeOrder(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    try {
        const id = RequireUUID(orderHeaderID, 'OrderHeaderID');
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const [header, lines] = await rv.RunViews(
            [
                {
                    EntityName: ORDER_HEADER_ENTITY,
                    ExtraFilter: `ID = '${id}'`,
                    Fields: ['OrderNumber'],
                    ResultType: 'simple',
                },
                {
                    EntityName: ORDER_LINE_ENTITY,
                    ExtraFilter: `OrderHeaderID = '${id}'`,
                    Fields: ['Product'],
                    OrderBy: 'LineNumber',
                    ResultType: 'simple',
                },
            ],
            user,
        );
        const orderNumber = (header?.Results?.[0] as { OrderNumber?: string | null } | undefined)?.OrderNumber;
        const names = ((lines?.Results ?? []) as Array<{ Product?: string | null }>).map((l) => l.Product ?? '');
        return FormatIntentDescription(names, orderNumber);
    } catch (err) {
        LogError(`[IntentDescription] Could not describe order ${orderHeaderID}: ${errorText(err)}`);
        return null;
    }
}

/**
 * Checkout's second step: once the order is committed, send the full description and the order id
 * to the gateway intent that was opened without them.
 */
export async function SendOrderDescriptionToGateway(
    intent: { PaymentProviderID: string | null; ProviderIntentID: string | null },
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    if (!intent.PaymentProviderID || !intent.ProviderIntentID) return;
    try {
        const description = await DescribeOrder(orderHeaderID, provider, user);
        const driver = await ResolvePaymentProvider(intent.PaymentProviderID, provider, user);
        const updated = await driver.UpdateIntent({
            ProviderIntentID: intent.ProviderIntentID,
            Description: description,
            Metadata: { OrderHeaderID: orderHeaderID },
        });
        if (!updated.Success) {
            LogError(`[IntentDescription] Gateway kept intent ${intent.ProviderIntentID} without its order details: ${updated.Reason ?? 'no reason given'}`);
        }
    } catch (err) {
        LogError(`[IntentDescription] Could not send order details for intent ${intent.ProviderIntentID}: ${errorText(err)}`);
    }
}

/** Product ids of the snapshot's priced lines, in line order. */
function snapshotProductIDs(metadataJSON: string | null | undefined): string[] {
    if (!metadataJSON) return [];
    const parsed = JSON.parse(metadataJSON) as { PricedLines?: Array<{ ProductID?: string }> };
    return (parsed.PricedLines ?? []).map((l) => l.ProductID ?? '').filter((id) => id.length > 0);
}

/** Product name by lower-cased id. */
async function productNames(productIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, string>> {
    const ids = RequireUUIDs([...new Set(productIDs)], 'ProductID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: PRODUCT_ENTITY,
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        },
        user,
    );
    return new Map((result?.Results ?? []).map((p) => [p.ID.toLowerCase(), p.Name]));
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

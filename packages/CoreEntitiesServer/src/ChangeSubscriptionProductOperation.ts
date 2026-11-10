/**
 * @fileoverview `Orders.ChangeSubscriptionProduct` — correct the product on chosen subscriptions.
 *
 * WHY. The cutover load put 367 active subscriptions on "(converted pricing)" products that stand
 * in for what the customer actually has. A subscription is the record of what the customer has
 * NOW; the order and deal that sold it are the record of what was sold. So the correction is made
 * on the subscription and nowhere else: the booked order lines, their journal entries, recognition
 * schedules and the deal keep the product they were booked with, which is true history, and the
 * next renewal is placed on the corrected product at the current term's price plus the increase
 * (the pricer takes its base from the line that bought the expiring term, not from the product).
 *
 * WHAT IT CHECKS. The product must be Active and a subscription product. A subscription whose type
 * differs from the product's is refused unless the caller says to move it, because a type carries
 * the term length, cadence and lead time and a silent move would change when the customer is
 * billed. A product sold by another company is allowed and reported as a warning: the subscription
 * keeps its own company, which is also what keeps subscriptions bought together on one renewal
 * order. A gateway-billed subscription refuses the change by the entity's own rule (the gateway
 * owns its product) and is reported, not failed.
 *
 * WHO CHANGED WHAT is MJ's record-change log: the Subscriptions entity tracks changes, so the old
 * and new product, the user and the time are kept without a column of this app's own.
 *
 * CONNECTS TO:
 *   CALLERS: the Renewals page (`renewals.page.ts`) · API callers
 *   WRITES:  MJ_BizApps_Orders: Subscriptions, through SubscriptionEntityServer
 *   READS:   MJ_BizApps_Orders: Products
 */
import { BaseRemotableOperation, LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersChangeSubscriptionProductOperation as OrdersChangeSubscriptionProductOperationBase,
    type OrdersChangeSubscriptionProductInput,
    type OrdersChangeSubscriptionProductOutput,
    type SubscriptionEntity,
    type SubscriptionProductChange,
} from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

interface ProductRow {
    ID: string;
    Name: string;
    Status: string;
    CompanyID: string | null;
    SubscriptionTypeID: string | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.ChangeSubscriptionProduct')
export class ChangeSubscriptionProductOperation extends OrdersChangeSubscriptionProductOperationBase {
    protected async InternalExecute(
        input: OrdersChangeSubscriptionProductInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersChangeSubscriptionProductOutput> {
        const empty = (message: string): OrdersChangeSubscriptionProductOutput => ({ Success: false, Message: message, Updated: 0, Unchanged: 0, Failed: 0, Changes: [] });
        let ids: string[];
        let productID: string;
        try {
            if (!Array.isArray(input?.SubscriptionIDs) || !input.SubscriptionIDs.length) throw new Error('SubscriptionIDs must name at least one subscription.');
            ids = [...new Set(input.SubscriptionIDs.map((id) => RequireUUID(id, 'SubscriptionID').toLowerCase()))];
            productID = RequireUUID(input.ProductID, 'ProductID');
        } catch (err) {
            return empty(err instanceof Error ? err.message : String(err));
        }

        const rv = new RunView(provider as unknown as IRunViewProvider);
        const products = new Map<string, ProductRow>();
        const loadProduct = async (id: string): Promise<ProductRow | null> => {
            const key = id.toLowerCase();
            if (!products.has(key)) {
                const result = await rv.RunView<ProductRow>(
                    { EntityName: PRODUCT_ENTITY, ExtraFilter: `ID='${RequireUUID(id, 'ProductID')}'`, Fields: ['ID', 'Name', 'Status', 'CompanyID', 'SubscriptionTypeID'], ResultType: 'simple' },
                    user,
                );
                if (!result.Success) throw new Error(result.ErrorMessage || `Could not read product ${id}.`);
                const row = result.Results[0] ?? null;
                if (row) products.set(key, row);
                return row;
            }
            return products.get(key) ?? null;
        };

        let product: ProductRow | null;
        try {
            product = await loadProduct(productID);
        } catch (err) {
            return empty(err instanceof Error ? err.message : String(err));
        }
        if (!product) return empty(`No product has the ID ${productID}.`);
        if (String(product.Status).toLowerCase() !== 'active') return empty(`${product.Name} is ${product.Status}, not Active. Choose a product that is sold now.`);
        if (!product.SubscriptionTypeID) return empty(`${product.Name} is not a subscription product: it has no subscription type.`);

        const changes: SubscriptionProductChange[] = [];
        for (const id of ids) {
            changes.push(await this.changeOne(provider, user, id, product, !!input.AdoptProductType, loadProduct));
        }
        const updated = changes.filter((c) => c.Changed).length;
        const failed = changes.filter((c) => c.Error).length;
        const unchanged = changes.length - updated - failed;
        const moved = changes.filter((c) => c.TypeMoved).length;
        const message =
            `Product set to ${product.Name}: ${updated} subscription${updated === 1 ? '' : 's'} updated` +
            `${moved ? ` (${moved} moved to its subscription type)` : ''}${unchanged ? `, ${unchanged} already there` : ''}${failed ? `, ${failed} failed` : ''}.`;
        return { Success: failed < changes.length, Message: message, Updated: updated, Unchanged: unchanged, Failed: failed, Changes: changes };
    }

    private async changeOne(
        provider: IMetadataProvider,
        user: UserInfo,
        id: string,
        product: ProductRow,
        adoptType: boolean,
        loadProduct: (id: string) => Promise<ProductRow | null>,
    ): Promise<SubscriptionProductChange> {
        const blank: SubscriptionProductChange = {
            SubscriptionID: id,
            SubscriptionNumber: null,
            PreviousProductID: null,
            PreviousProductName: null,
            CurrentProductID: null,
            CurrentProductName: null,
            TypeMoved: false,
            Changed: false,
        };
        try {
            const sub = await provider.GetEntityObject<SubscriptionEntity>(SUBSCRIPTION_ENTITY, user);
            if (!(await sub.Load(id))) return { ...blank, Error: 'no such subscription' };
            const previousID = sub.ProductID ? String(sub.ProductID) : null;
            let previousName: string | null = null;
            try {
                previousName = previousID ? ((await loadProduct(previousID))?.Name ?? null) : null;
            } catch {
                previousName = null;
            }
            const base: SubscriptionProductChange = {
                ...blank,
                SubscriptionNumber: sub.SubscriptionNumber,
                PreviousProductID: previousID,
                PreviousProductName: previousName,
                CurrentProductID: previousID,
                CurrentProductName: previousName,
            };
            if (previousID && previousID.toLowerCase() === product.ID.toLowerCase()) return base;

            const typeDiffers = String(sub.SubscriptionTypeID ?? '').toLowerCase() !== String(product.SubscriptionTypeID ?? '').toLowerCase();
            if (typeDiffers && !adoptType) {
                return {
                    ...base,
                    Error: `${product.Name} is on a different subscription type than this subscription (term length, cadence or lead time may differ). Choose "also move to the product's subscription type" to change both.`,
                };
            }
            const warnings: string[] = [];
            if (product.CompanyID && sub.CompanyID && String(product.CompanyID).toLowerCase() !== String(sub.CompanyID).toLowerCase()) {
                warnings.push('the product is sold by another company; the subscription keeps its own');
            }
            sub.ProductID = product.ID;
            if (typeDiffers) sub.SubscriptionTypeID = String(product.SubscriptionTypeID);
            if (!(await sub.Save())) {
                return { ...base, Error: sub.LatestResult?.CompleteMessage ?? 'the save was refused' };
            }
            return {
                ...base,
                CurrentProductID: product.ID,
                CurrentProductName: product.Name,
                TypeMoved: typeDiffers,
                Changed: true,
                ...(warnings.length ? { Warning: warnings.join('; ') } : {}),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`Orders.ChangeSubscriptionProduct: subscription ${id} could not be changed: ${message}`);
            return { ...blank, Error: message };
        }
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadChangeSubscriptionProductOperation(): void {
    // intentionally empty
}

/**
 * Orders.PreviewPrice — what would this customer pay for this product, and why? (plan D69)
 *
 * THE ONE RULE THAT MATTERS: this is a one-line `OrderPricingService` call. Save, `Orders.PriceOrder`,
 * and this operation share that walk. Calling `ResolvePrice` here used to be a second entry point;
 * it could return base list while booking used the member list (IT PC14).
 *
 * Nothing is written. Lines are materialised with `NewRecord()` and never `Save()`'d — same as
 * `Orders.PriceOrder`.
 *
 * The output is still one SKU's unit price and decomposition. Promotions / charges / tax that the
 * walk also runs on a one-line order are not the contract of this operation (they need a full
 * header; use `Orders.PriceOrder`). UnitPrice / ExtendedAmount come from the walk's line stamp.
 *
 * Refusals come back INSIDE the output as `Success: false`. Ambiguous rules and unpriced products
 * are refusals, not faults.
 */
import {
    BaseRemotableOperation,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { OrderPricingService, PriceResolutionError, ResolvePriceListForCustomer } from '@mj-biz-apps/orders-entities';
import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

export interface PreviewPriceInput {
    ProductID: string;
    /** Defaults to 1 — the common "what does one cost" question. */
    Quantity?: number;
    /** Who is buying. Either may be omitted; both omitted means base pricing. */
    OrganizationID?: string | null;
    PersonID?: string | null;
    /** Defaults to now. Pass a future date to check a seasonal rate before it starts. */
    AsOf?: string | Date;
    /** Force a specific list, ignoring the customer's assignment — for "what if" comparisons. */
    PriceListID?: string | null;
    FeeType?: string;
}

/** One line of the explanation. */
export interface PreviewComponent {
    ComponentType: string;
    Label: string;
    Amount: number;
    RunningTotal: number;
}

export interface PreviewPriceOutput {
    Success: boolean;
    Message?: string;
    UnitPrice?: number;
    ExtendedAmount?: number;
    Quantity?: number;
    /** The list that applied, and how it was arrived at. */
    PriceListID?: string | null;
    PriceListName?: string | null;
    /** Which rule won, for a rule author checking their work. */
    ProductPriceID?: string | null;
    /** Which resolver answered — 'default', or a plugin key like `Company:<id>`. */
    ResolvedBy?: string;
    Components?: PreviewComponent[];
}

@RegisterClass(BaseRemotableOperation, 'Orders.PreviewPrice')
export class PreviewPriceOperation extends BaseRemotableOperation<PreviewPriceInput, PreviewPriceOutput> {
    public OperationKey = 'Orders.PreviewPrice';

    protected async InternalExecute(
        input: PreviewPriceInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<PreviewPriceOutput> {
        if (!input?.ProductID) {
            return { Success: false, Message: 'ProductID is required.' };
        }
        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireUUID(input.ProductID, 'ProductID');
        RequireOptionalUUID(input.PriceListID, 'PriceListID');
        RequireOptionalUUID(input.OrganizationID, 'OrganizationID');
        RequireOptionalUUID(input.PersonID, 'PersonID');

        const quantity = input.Quantity == null ? 1 : Number(input.Quantity);
        if (!(quantity > 0)) {
            return { Success: false, Message: `Quantity must be greater than zero (received ${input.Quantity}).` };
        }

        const product = await this.loadProduct(provider, user, input.ProductID);
        if (!product) {
            return { Success: false, Message: `Product ${input.ProductID} was not found.` };
        }

        const asOf = input.AsOf ? new Date(input.AsOf) : new Date();
        if (Number.isNaN(asOf.getTime())) {
            return { Success: false, Message: `AsOf is not a valid date (received ${String(input.AsOf)}).` };
        }

        const md = new Metadata();
        const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
        line.NewRecord();
        line.ProductID = input.ProductID;
        line.Quantity = quantity;

        const listCtx = {
            ProductID: input.ProductID,
            ProductCategoryID: product.ProductCategoryID,
            CompanyID: product.CompanyID,
            Quantity: quantity,
            AsOf: asOf,
            OrganizationID: input.OrganizationID ?? null,
            PersonID: input.PersonID ?? null,
            ...(input.PriceListID !== undefined ? { PriceListID: input.PriceListID } : {}),
            ...(input.FeeType ? { FeeType: input.FeeType } : {}),
        };

        try {
            const result = await new OrderPricingService({ Provider: provider, User: user }).Price({
                OrderHeaderID: null,
                CompanyID: product.CompanyID,
                BillToPersonID: input.PersonID ?? null,
                BillToOrganizationID: input.OrganizationID ?? null,
                OrderDate: asOf,
                ShipToAddressID: null,
                Lines: [line],
                PromotionCodes: [],
                ManualDiscounts: [],
                Charges: [],
                ...(input.PriceListID !== undefined ? { PriceListID: input.PriceListID } : {}),
                ...(input.FeeType ? { FeeType: input.FeeType } : {}),
            });

            const resolved = result.PriceComponents.get(line);
            if (!resolved) {
                return {
                    Success: false,
                    Message:
                        `No price is configured for ${product.Name}. Add a ProductPrice for it — either a base ` +
                        `price (no list) or one on the list this customer is assigned to.`,
                    Quantity: quantity,
                };
            }

            // Report the list actually in force, even when the winning rule was a base rule: "you are
            // on WHOLESALE but this SKU has no wholesale rate" is the answer people are looking for.
            const listID = resolved.PriceListID ?? (await ResolvePriceListForCustomer(listCtx, provider, user));
            const listName = listID ? await this.loadPriceListName(provider, user, listID) : null;

            return {
                Success: true,
                Message:
                    `${product.Name} × ${quantity} = ${resolved.ExtendedAmount}` +
                    (listName ? ` on price list ${listName}` : ' at base price'),
                UnitPrice: resolved.UnitPrice,
                ExtendedAmount: resolved.ExtendedAmount,
                Quantity: quantity,
                PriceListID: listID,
                PriceListName: listName,
                ProductPriceID: resolved.ProductPriceID,
                ResolvedBy: resolved.ResolvedBy,
                Components: resolved.Components.map((c) => ({
                    ComponentType: c.ComponentType,
                    Label: c.Label,
                    Amount: c.Amount,
                    RunningTotal: c.RunningTotal,
                })),
            };
        } catch (err) {
            // Configuration problems (ambiguous rules, unpriced SKU) are REFUSALS with a reason, not
            // faults. The walk throws those; mapping them here keeps the PreviewPrice contract.
            const message = err instanceof Error ? err.message : String(err);
            if (err instanceof PriceResolutionError || /cannot be priced|ambiguous/i.test(message)) {
                return { Success: false, Message: message, Quantity: quantity };
            }
            LogError(err as Error);
            throw err;
        }
    }

    private async loadProduct(
        provider: IMetadataProvider,
        user: UserInfo,
        id: string,
    ): Promise<{ Name: string; ProductCategoryID: string | null; CompanyID: string } | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ Name: string; ProductCategoryID: string | null; CompanyID: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Products',
                ExtraFilter: `ID = '${id}'`,
                Fields: ['Name', 'ProductCategoryID', 'CompanyID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0] ?? null;
    }

    private async loadPriceListName(provider: IMetadataProvider, user: UserInfo, id: string): Promise<string | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ Name: string }>(
            {
                EntityName: 'MJ_BizApps_Orders: Price Lists',
                ExtraFilter: `ID = '${id}'`,
                Fields: ['Name'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0]?.Name ?? null;
    }
}

/** Tree-shaking anchor — called from the server bootstrap so the registration is retained. */
export function LoadPreviewPriceOperation(): void {
    // intentionally empty
}

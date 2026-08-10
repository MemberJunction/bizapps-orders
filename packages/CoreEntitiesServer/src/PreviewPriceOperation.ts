/**
 * Orders.PreviewPrice — what would this customer pay for this product, and why? (plan D69)
 *
 * THE ONE RULE THAT MATTERS: this runs the REAL pipeline. It calls `ResolvePrice`, the same function
 * the order path calls, with the same context shape. A preview computed by a parallel simplified
 * implementation is worse than no preview, because people trust it and it diverges silently — the
 * quote says one number and the invoice says another, and nobody can say which is wrong.
 *
 * Nothing is written. That is the only difference from pricing a line.
 *
 * WHAT IT IS FOR
 *   - a sales rep checking what an account is entitled to before quoting
 *   - a product screen showing "your price" against list
 *   - proving a new price rule does what its author meant before it goes live
 *
 * Refusals come back INSIDE the output as `Success: false` with the reason — the same contract
 * `Orders.RefundPayment` and `Orders.ApplyAccountCredit` use. Only genuine faults throw. An
 * ambiguous rule set is a refusal, not a fault: it is a configuration problem the caller can fix,
 * and the message names the rules that collided.
 *
 * CONNECTS TO:
 *   ENGINE: ./PriceResolver.ts (ResolvePrice — the same call the order path makes)
 *   DOC:    plans/pricing-charges-and-promotions.md §9
 */
import {
    BaseRemotableOperation,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { RequireOptionalUUID, RequireUUID } from './sql-guards.js';
import { PriceResolutionError, ResolvePrice, ResolvePriceListForCustomer } from '@mj-biz-apps/orders-entities';

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

        const ctx = {
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
            const resolved = await ResolvePrice(ctx, provider, user);
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
            const listID = resolved.PriceListID ?? (await ResolvePriceListForCustomer(ctx, provider, user));
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
            // A configuration problem the caller can act on — an ambiguous rule set, an unimplemented
            // pricing model — is a REFUSAL with its reason, not a fault. Reporting it as a thrown
            // error would make the preview look broken when it is in fact working correctly and
            // telling you something true.
            if (err instanceof PriceResolutionError) {
                return { Success: false, Message: err.message, Quantity: quantity };
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

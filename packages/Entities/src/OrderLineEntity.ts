/**
 * @fileoverview `OrderLineEntity` — shared entity subclass for Order Lines.
 *
 * @module @mj-biz-apps/orders-entities
 */
import {
    BaseEntity,
    Metadata,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineEntity } from './generated/entity_subclasses';
import { OrderLineExtensionCompanion } from './OrderLineExtensionCompanion';
import { ORDER_LINE_MONEY_FIELDS } from './booked-money';
import { loadApplicabilityContext } from './pricing/applicability';
import {
    isEnginePrice,
    isNamedListPick,
    priceOverrideCatalogInstalled,
    userPriceOverrideKind,
} from './pricing/priceOverride';
import { ListApplicablePrices, PriceResolutionError, ResolvePrice } from './pricing/PriceResolver';
import { LoadOrdersEngine, OrdersEngine } from './pricing/OrdersEngine';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class OrderLineEntity extends mjBizAppsOrdersOrderLineEntity {
    /**
     * Extension entity (e.g. `EventOrderLine`) companion riding with this line.
     */
    public readonly Extension = this.RegisterCompanion(new OrderLineExtensionCompanion(this));

    /**
     * Runs validation on this line and fans out to the extension companion.
     */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.Extension.Validate(result);
        this.refuseBookedMoneyEdits(result);
        return result;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        await this.assertPriceOverride(result);
        return result;
    }

    /**
     * A stated UnitPrice / ProductPriceID that is not the engine result needs
     * OverrideList (named pick) or OverrideAny (typed amount). Skip when the
     * authorization catalog is not synced, and when money fields did not change.
     */
    private async assertPriceOverride(result: ValidationResult): Promise<void> {
        const priceDirty = this.FieldIsDirty('UnitPrice', 'ProductPriceID');
        if (this.IsSaved && !priceDirty) return;
        if (!this.ProductID) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider | undefined;
        const user = (this.ContextCurrentUser ?? new Metadata().CurrentUser) as UserInfo | null;
        if (!provider || !user) return;
        if (!priceOverrideCatalogInstalled(provider)) return;

        const stated = this.FieldIsDirty('UnitPrice') || (this.UnitPrice ?? 0) > 0;
        if (!stated && !this.ProductPriceID) return;

        try {
            const product = await this.loadProductForOverride();
            const header = await this.loadHeaderForOverride();
            const ctx = {
                ProductID: this.ProductID,
                ProductCategoryID: product?.ProductCategoryID ?? null,
                CompanyID: product?.CompanyID ?? header?.CompanyID ?? '',
                Quantity: Number(this.Quantity ?? 0),
                AsOf: header?.OrderDate ? new Date(header.OrderDate) : new Date(),
                OrganizationID: header?.BillToOrganizationID ?? null,
                PersonID: header?.BillToPersonID ?? null,
                ApplicabilityContext: await loadApplicabilityContext(
                    {
                        OrderHeaderID: this.OrderHeaderID,
                        ProductID: this.ProductID,
                        BillToPersonID: header?.BillToPersonID ?? null,
                        BillToOrganizationID: header?.BillToOrganizationID ?? null,
                        ShipToPersonID: header?.ShipToPersonID ?? null,
                        ShipToOrganizationID: header?.ShipToOrganizationID ?? null,
                        BillToAddressID: header?.BillToAddressID ?? null,
                        ShipToAddressID: header?.ShipToAddressID ?? null,
                    },
                    provider,
                    user,
                ),
            };
            if (!ctx.CompanyID) return;

            const engine = await ResolvePrice(ctx, provider, user);
            if (engine && isEnginePrice(this, engine)) return;

            const kind = userPriceOverrideKind(user, provider);
            if (kind === 'any') return;
            if (kind === 'list' && engine) {
                const applicable = await ListApplicablePrices(ctx, provider, user);
                if (isNamedListPick(this, applicable)) return;
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ProductPriceID',
                        'This line uses a price that is not one of the named applicable prices. OverrideList lets you pick another named price; typing an amount needs OverrideAny.',
                        this.ProductPriceID,
                        ValidationErrorType.Failure,
                    ),
                );
                return;
            }
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'UnitPrice',
                    engine
                        ? `This line's price is not the engine price (${engine.PriceName ?? engine.ProductPriceID} · ${engine.UnitPrice}). Changing it requires MJ.BizApps.Orders.Price.OverrideList or OverrideAny.`
                        : 'This line has a stated price and no engine price. Typing an amount requires MJ.BizApps.Orders.Price.OverrideAny.',
                    this.UnitPrice,
                    ValidationErrorType.Failure,
                ),
            );
        } catch (err) {
            if (err instanceof PriceResolutionError) {
                if (userPriceOverrideKind(user, provider) === 'any') return;
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'UnitPrice',
                        err.message,
                        this.UnitPrice,
                        ValidationErrorType.Failure,
                    ),
                );
            }
            // Unreadable provider / missing metadata: leave the line to the confirm-path resolver.
        }
    }

    private async loadProductForOverride(): Promise<{ ProductCategoryID: string | null; CompanyID: string } | null> {
        await LoadOrdersEngine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
        const p = OrdersEngine.Instance.ProductByID(this.ProductID);
        return p ? { ProductCategoryID: p.ProductCategoryID ?? null, CompanyID: p.CompanyID } : null;
    }

    private async loadHeaderForOverride(): Promise<{
        CompanyID: string;
        OrderDate: Date | string | null;
        BillToPersonID: string | null;
        BillToOrganizationID: string | null;
        ShipToPersonID: string | null;
        ShipToOrganizationID: string | null;
        BillToAddressID: string | null;
        ShipToAddressID: string | null;
    } | null> {
        if (!this.OrderHeaderID) return null;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{
            CompanyID: string;
            OrderDate: Date | string | null;
            BillToPersonID: string | null;
            BillToOrganizationID: string | null;
            ShipToPersonID: string | null;
            ShipToOrganizationID: string | null;
            BillToAddressID: string | null;
            ShipToAddressID: string | null;
        }>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Headers',
                ExtraFilter: `ID = '${this.OrderHeaderID}'`,
                Fields: [
                    'CompanyID',
                    'OrderDate',
                    'BillToPersonID',
                    'BillToOrganizationID',
                    'ShipToPersonID',
                    'ShipToOrganizationID',
                    'BillToAddressID',
                    'ShipToAddressID',
                ],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return res?.Results?.[0] ?? null;
    }

    /**
     * A line that already carries its booking journal cannot change quantity or
     * price. New lines on a booked order are refused on the header (graph save)
     * and again in the server subclass (standalone save).
     */
    private refuseBookedMoneyEdits(result: ValidationResult): void {
        if (!this.JournalEntryID) return;
        const dirty = ORDER_LINE_MONEY_FIELDS.filter((name) => this.FieldIsDirty(name));
        if (dirty.length === 0) return;
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                dirty[0],
                `This line is booked — it cannot change ${dirty.join(', ')}. ` +
                    `Voiding the order is how booked money is undone.`,
                this.GetFieldByName(dirty[0])?.Value,
                ValidationErrorType.Failure,
            ),
        );
    }
}

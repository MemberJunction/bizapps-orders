/**
 * @fileoverview `OrderLineEntity` — shared entity subclass for Order Lines.
 *
 * @module @mj-biz-apps/orders-entities
 */
import {
    BaseEntity,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderLineEntity } from './generated/entity_subclasses';
import { OrderLineExtensionCompanion } from './OrderLineExtensionCompanion';
import { ORDER_LINE_MONEY_FIELDS } from './booked-money';
import { anyFieldIsDirty } from './field-dirty';
import { BuildLinePriceContext } from './pricing/linePriceContext';
import {
    isEnginePrice,
    isNamedListPick,
    priceOverrideCatalogInstalled,
    userPriceOverrideKind,
} from './pricing/priceOverride';
import { ListApplicablePrices, PriceResolutionError, ResolvePrice } from './pricing/PriceResolver';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class OrderLineEntity extends mjBizAppsOrdersOrderLineEntity {
    /**
     * Extension entity (e.g. `EventOrderLine`) companion riding with this line.
     */
    public readonly Extension = this.RegisterCompanion(new OrderLineExtensionCompanion(this));

    /**
     * True when any of the named fields has unsaved changes. See {@link anyFieldIsDirty}.
     */
    public FieldIsDirty(...fieldNames: string[]): boolean {
        return anyFieldIsDirty(this, fieldNames);
    }

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
            const ctx = await BuildLinePriceContext(this, provider, user);
            if (!ctx) return;

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

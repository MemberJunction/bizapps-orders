/**
 * @fileoverview Save-time rules that keep a subscription family inside one company (golive #276).
 *
 * A family groups the bands of one offering so confirm can refuse a second band that overlaps
 * coverage the holder already has. The family carries its own `CompanyID`, and the overlap check
 * reads only the family's products in the ordering product's company. So a product in a family of
 * another company would never be checked against its supposed siblings, and the guard would be
 * off for it without anything saying so. These subclasses refuse that at save:
 *
 *   - `ProductEntityServer`: a product's family must belong to the product's company, and a product
 *     cannot be newly put into a retired (inactive) family. It extends `ProductEntity`, not the
 *     generated class: registered on the server it replaces `ProductEntity`, and a product created
 *     there must still take its type's defaults (golive #277).
 *   - `SubscriptionFamilyEntityServer`: a saved family's company cannot change, since its products
 *     were validated against the old one.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.loadFamilyCoverage (the reader these rules protect)
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { BaseEntity, RunView, ValidationErrorInfo, ValidationResult, type IRunViewProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ProductEntity, mjBizAppsOrdersSubscriptionFamilyEntity } from '@mj-biz-apps/orders-entities';

import { SUBSCRIPTION_FAMILY_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

@RegisterClass(BaseEntity, PRODUCT_ENTITY)
export class ProductEntityServer extends ProductEntity {
    /** BaseEntity skips ValidateAsync by default; without this the check never runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!this.SubscriptionFamilyID) return result;

        const familyChanged = !this.IsSaved || this.GetFieldByName('SubscriptionFamilyID')?.Dirty === true;
        const companyChanged = this.GetFieldByName('CompanyID')?.Dirty === true;
        if (!familyChanged && !companyChanged) return result;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const id = RequireUUID(this.SubscriptionFamilyID, 'SubscriptionFamilyID');
        const res = await rv.RunView<{ Code: string; Name: string; CompanyID: string; IsActive: boolean }>(
            {
                EntityName: SUBSCRIPTION_FAMILY_ENTITY,
                ExtraFilter: `ID='${id}'`,
                Fields: ['Code', 'Name', 'CompanyID', 'IsActive'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        if (!res?.Success) throw new Error(`Could not read the product's subscription family: ${res?.ErrorMessage}`);
        const family = res.Results[0];
        if (!family) return result; // the foreign key refuses a family that does not exist

        const fail = (message: string) => {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo('SubscriptionFamilyID', message, this.SubscriptionFamilyID));
        };
        if (!UUIDsEqual(family.CompanyID, this.CompanyID)) {
            fail(
                `Subscription family ${family.Name} (${family.Code}) belongs to another company. A product can only be ` +
                    `a band of a family in its own company; pick one of this company's families or leave it empty.`,
            );
        }
        if (familyChanged && !family.IsActive) {
            fail(`Subscription family ${family.Name} (${family.Code}) is inactive, so no product can be added to it.`);
        }
        return result;
    }
}

@RegisterClass(BaseEntity, SUBSCRIPTION_FAMILY_ENTITY)
export class SubscriptionFamilyEntityServer extends mjBizAppsOrdersSubscriptionFamilyEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (this.IsSaved && this.GetFieldByName('CompanyID')?.Dirty === true) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'CompanyID',
                    `A subscription family's company cannot change once saved. Create a family in the other company instead.`,
                    this.CompanyID,
                ),
            );
        }
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSubscriptionFamilyRules(): void {
    // intentionally empty
}

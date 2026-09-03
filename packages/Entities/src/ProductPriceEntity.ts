/**
 * Shared Product Price subclass.
 *
 * Name, ProductCategoryID, and Applicability are new columns (see
 * V202609031400). CodeGen will emit getters on the generated class once it is
 * run against a database that has those fields. Until then they live here so
 * we do not hand-edit `generated/`.
 *
 * `Product.Prices` is declared by CodeGen from
 * `metadata/entity-relationships/product-prices-collection.json` — do not
 * re-declare it on the generated Product class.
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersProductPriceEntity } from './generated/entity_subclasses';

const ENTITY = 'MJ_BizApps_Orders: Product Prices';

@RegisterClass(BaseEntity, ENTITY)
export class ProductPriceEntity extends mjBizAppsOrdersProductPriceEntity {
    public get Name(): string {
        return this.Get('Name');
    }
    public set Name(value: string) {
        this.Set('Name', value);
    }

    public get ProductCategoryID(): string | null {
        return this.Get('ProductCategoryID');
    }
    public set ProductCategoryID(value: string | null) {
        this.Set('ProductCategoryID', value);
    }

    public get Applicability(): string | null {
        return this.Get('Applicability');
    }
    public set Applicability(value: string | null) {
        this.Set('Applicability', value);
    }
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import type {
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';
import { MJOProductOptionsWidgetComponent } from '../custom/Product/widgets/product-options-widget.component';

/**
 * The Options panel on the product type, category and product forms (golive #399).
 *
 * One widget at three levels: each panel says which level it sits on and where that level stands in
 * the inheritance walk (a product's type and category, a category's parent). Each registration names
 * the assignments as its related entity, so the generated related grid of Product Option Assignments
 * gives way to this panel, which shows the inherited options beside this level's own.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Products:options',
    metadata: {
        entity: 'MJ_BizApps_Orders: Products',
        slot: 'after-related',
        sortKey: 80,
        contributionKey: 'options',
        relatedEntity: 'MJ_BizApps_Orders: Product Option Assignments',
        relatedJoinField: 'ProductID',
    },
})
@Component({
    standalone: true,
    selector: 'mjo-product-options-panel',
    imports: [CommonModule, BaseFormsModule, MJOProductOptionsWidgetComponent],
    template: `
        <mj-collapsible-panel
            SectionKey="productOptions"
            SectionName="Options"
            Icon="fa-solid fa-list-check"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <mjo-product-options-widget
                Level="Product"
                [RecordID]="Record.IsSaved ? Record.ID : null"
                [CompanyID]="Record.CompanyID"
                [ProductTypeID]="Record.ProductTypeID"
                [CategoryID]="Record.ProductCategoryID"
                [EditMode]="EditMode"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </mjo-product-options-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductOptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductCategories:options',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Categories',
        slot: 'after-related',
        sortKey: 50,
        contributionKey: 'options',
        relatedEntity: 'MJ_BizApps_Orders: Product Option Assignments',
        relatedJoinField: 'ProductCategoryID',
    },
})
@Component({
    standalone: true,
    selector: 'mjo-product-category-options-panel',
    imports: [CommonModule, BaseFormsModule, MJOProductOptionsWidgetComponent],
    template: `
        <mj-collapsible-panel
            SectionKey="productCategoryOptions"
            SectionName="Options"
            Icon="fa-solid fa-list-check"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <mjo-product-options-widget
                Level="Category"
                [RecordID]="Record.IsSaved ? Record.ID : null"
                [CompanyID]="Record.CompanyID"
                [CategoryID]="Record.ParentProductCategoryID"
                [EditMode]="EditMode"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </mjo-product-options-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductCategoryOptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> {}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductTypes:options',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Types',
        slot: 'after-related',
        sortKey: 50,
        contributionKey: 'options',
        relatedEntity: 'MJ_BizApps_Orders: Product Option Assignments',
        relatedJoinField: 'ProductTypeID',
    },
})
@Component({
    standalone: true,
    selector: 'mjo-product-type-options-panel',
    imports: [CommonModule, BaseFormsModule, MJOProductOptionsWidgetComponent],
    template: `
        <mj-collapsible-panel
            SectionKey="productTypeOptions"
            SectionName="Options"
            Icon="fa-solid fa-list-check"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext">
            <mjo-product-options-widget
                Level="Type"
                [RecordID]="Record.IsSaved ? Record.ID : null"
                [EditMode]="EditMode"
                (Navigate)="FormComponent.OnFormNavigate($event)">
            </mjo-product-options-widget>
        </mj-collapsible-panel>
    `,
})
export class ProductTypeOptionsPanel extends BaseFormPanel<mjBizAppsOrdersProductTypeEntity> {}

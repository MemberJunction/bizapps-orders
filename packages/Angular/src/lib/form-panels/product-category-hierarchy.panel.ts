import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { HierarchyTreeComponent, HierarchyTreeConfig } from '@memberjunction/ng-hierarchy-tree';
import { mjBizAppsOrdersProductCategoryEntity } from '@mj-biz-apps/orders-entities';

/**
 * Visual Product Category Taxonomy & Hierarchy Tree Panel.
 *
 * Attaches to `MJ_BizApps_Orders: Product Categories` and renders an interactive
 * category taxonomy tree visualizer powered by `@memberjunction/ng-hierarchy-tree`.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:ProductCategories:taxonomy',
    metadata: {
        entity: 'MJ_BizApps_Orders: Product Categories',
        slot: 'after-related',
        sortKey: 40,
        relatedEntity: 'MJ_BizApps_Orders: Product Categories',
        relatedJoinField: 'ParentProductCategoryID'
    }
})
@Component({
    selector: 'bizapps-product-category-hierarchy-panel',
    standalone: true,
    imports: [CommonModule, BaseFormsModule, HierarchyTreeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-collapsible-panel
            SectionKey="categoryTaxonomy"
            SectionName="Category Hierarchy & Taxonomy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    (Navigate)="FormComponent.OnFormNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            margin-bottom: 20px;
        }
    `]
})
export class ProductCategoryHierarchyPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> {
    public get treeConfig(): HierarchyTreeConfig {
        const filter = this.Record?.CompanyID ? `CompanyID = '${this.Record.CompanyID}'` : '';
        return {
            EntityName: 'MJ_BizApps_Orders: Product Categories',
            ParentField: 'ParentProductCategoryID',
            SubtitleField: 'Description',
            DefaultIcon: 'fa-solid fa-tags',
            DefaultColor: '#10b981',
            ActiveRecordID: this.Record?.ID || undefined,
            ExtraFilter: filter,
            Height: '440px',
            ShowSearch: true,
            ShowToolbar: true
        };
    }
}

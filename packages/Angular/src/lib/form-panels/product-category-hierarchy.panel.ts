import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { HierarchyTreeComponent, HierarchyTreeConfig } from '@memberjunction/ng-hierarchy-tree';
import { UserInfoEngine } from '@memberjunction/core-entities';
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
            SectionName="Hierarchy"
            Icon="fa-solid fa-sitemap"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="true">
            @if (Record.IsSaved) {
                <mj-hierarchy-tree
                    [Config]="treeConfig"
                    [ZoomLevel]="persistedZoomLevel"
                    (ZoomChange)="onZoomChange($event)"
                    (Navigate)="onNavigate($event)">
                </mj-hierarchy-tree>
            }
        </mj-collapsible-panel>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            min-height: 640px;
            min-height: calc(100vh - 280px);
            flex: 1;
            margin-bottom: 20px;
        }
    `]
})
export class ProductCategoryHierarchyPanel extends BaseFormPanel<mjBizAppsOrdersProductCategoryEntity> {
    private readonly SETTING_KEY = 'mj.hierarchyTree.zoom.product_categories';
    private _treeConfig: HierarchyTreeConfig | null = null;
    private _cachedRecordId: string | null = null;
    private _cachedCompanyId: string | null = null;

    public get persistedZoomLevel(): number | undefined {
        const raw = UserInfoEngine.Instance.GetSetting(this.SETTING_KEY);
        return raw ? parseFloat(raw) : undefined;
    }

    public onZoomChange(zoom: number): void {
        UserInfoEngine.Instance.SetSettingDebounced(this.SETTING_KEY, zoom.toFixed(2));
    }

    public onNavigate(event: FormNavigationEvent): void {
        if (this.FormComponent?.OnFormNavigate) {
            this.FormComponent.OnFormNavigate(event);
        }
    }

    public get treeConfig(): HierarchyTreeConfig {
        const recId = this.Record?.ID || null;
        const compId = this.Record?.CompanyID || null;
        if (!this._treeConfig || this._cachedRecordId !== recId || this._cachedCompanyId !== compId) {
            this._cachedRecordId = recId;
            this._cachedCompanyId = compId;
            const filter = compId ? `CompanyID = '${compId}'` : '';
            this._treeConfig = {
                EntityName: 'MJ_BizApps_Orders: Product Categories',
                ParentField: 'ParentProductCategoryID',
                SubtitleField: 'Description',
                DefaultIcon: 'fa-solid fa-tags',
                DefaultColor: '#10b981',
                ActiveRecordID: recId || undefined,
                ExtraFilter: filter,
                Height: '100%',
                MinHeight: '640px',
                ShowSearch: true,
                ShowToolbar: true,
                NavigateOnNodeClick: true
            };
        }
        return this._treeConfig;
    }
}

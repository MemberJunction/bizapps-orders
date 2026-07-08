import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent,
} from '@memberjunction/ng-ui-components';

import { ProductCategoryTreeDashboardComponent } from './product-category-tree-dashboard.component';
import { ProductCategoryTreeResourceComponent } from './product-category-tree-resource.component';

/** Feature module for the Product Categories tree dashboard + its Explorer resource shim. */
@NgModule({
  declarations: [ProductCategoryTreeDashboardComponent, ProductCategoryTreeResourceComponent],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJEmptyStateComponent,
  ],
  exports: [ProductCategoryTreeDashboardComponent, ProductCategoryTreeResourceComponent],
})
export class ProductCategoryTreeModule {}

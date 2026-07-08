import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// mj-loading is NgModule-declared — import its module.
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Standalone MJ chrome + UI primitives.
import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent,
} from '@memberjunction/ng-ui-components';

import { OrdersManagementDashboardComponent } from './orders-management-dashboard.component';
import { OrdersManagementResourceComponent } from './orders-management-resource.component';

/**
 * Feature module for the Orders Management dashboard (pipeline board + detail panel) + its Explorer
 * resource shim. NgModule-declared (not standalone) to match the orders-ng package pattern.
 */
@NgModule({
  declarations: [OrdersManagementDashboardComponent, OrdersManagementResourceComponent],
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
  exports: [OrdersManagementDashboardComponent, OrdersManagementResourceComponent],
})
export class OrdersManagementModule {}

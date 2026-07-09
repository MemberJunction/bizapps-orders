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

import { OrderHistoryDashboardComponent } from './order-history-dashboard.component';
import { OrderHistoryResourceComponent } from './order-history-resource.component';

/**
 * Feature module for the Order History dashboard (filterable, sortable order table) + its Explorer
 * resource shim. NgModule-declared (not standalone) to match the orders-ng package pattern.
 */
@NgModule({
  declarations: [OrderHistoryDashboardComponent, OrderHistoryResourceComponent],
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
  exports: [OrderHistoryDashboardComponent, OrderHistoryResourceComponent],
})
export class OrderHistoryModule {}

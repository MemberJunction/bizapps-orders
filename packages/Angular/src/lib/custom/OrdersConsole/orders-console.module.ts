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
  MJDialogComponent,
  MJDialogActionsComponent,
} from '@memberjunction/ng-ui-components';

import { OrdersConsoleDashboardComponent } from './orders-console-dashboard.component';
import { OrdersConsoleResourceComponent } from './orders-console-resource.component';

/**
 * Feature module for the Orders Console dashboard + its Explorer resource shim. NgModule-declared
 * (not standalone) to match the accounting-ng package pattern.
 */
@NgModule({
  declarations: [OrdersConsoleDashboardComponent, OrdersConsoleResourceComponent],
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
    MJDialogComponent,
    MJDialogActionsComponent,
  ],
  exports: [OrdersConsoleDashboardComponent, OrdersConsoleResourceComponent],
})
export class OrdersConsoleModule {}

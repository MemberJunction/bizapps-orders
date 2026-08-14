import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersonIdentityComponent, OrganizationIdentityComponent } from '@mj-biz-apps/common-ng';
import { MJOSummaryStripComponent } from '../panels/summary-strip.component';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { OrdersPersonHeaderPanel } from './person-header.panel';
import { OrdersOrganizationHeaderPanel } from './organization-header.panel';
import { OrdersPersonOrdersPanel } from './person-orders.panel';
import { OrdersOrganizationOrdersPanel } from './organization-orders.panel';

const PANELS = [
    OrdersPersonHeaderPanel,
    OrdersOrganizationHeaderPanel,
    OrdersPersonOrdersPanel,
    OrdersOrganizationOrdersPanel,
];

@NgModule({
    declarations: [...PANELS],
    imports: [
        CommonModule,
        PersonIdentityComponent,
        OrganizationIdentityComponent,
        MJOSummaryStripComponent,
        BaseFormsModule,
    ],
    exports: [...PANELS],
})
export class OrdersPartyHeadersModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersonIdentityComponent, OrganizationIdentityComponent } from '@mj-biz-apps/common-ng';
import { MJOSummaryStripComponent } from '../panels/summary-strip.component';
import { OrdersPersonHeaderPanel } from './person-header.panel';
import { OrdersOrganizationHeaderPanel } from './organization-header.panel';

const PANELS = [OrdersPersonHeaderPanel, OrdersOrganizationHeaderPanel];

@NgModule({
    declarations: [...PANELS],
    imports: [
        CommonModule,
        PersonIdentityComponent,
        OrganizationIdentityComponent,
        MJOSummaryStripComponent,
    ],
    exports: [...PANELS],
})
export class OrdersPartyHeadersModule {}

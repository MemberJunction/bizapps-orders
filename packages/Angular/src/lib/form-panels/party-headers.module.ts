import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersonIdentityComponent, OrganizationIdentityComponent } from '@mj-biz-apps/common-ng';
import { MJOSummaryStripComponent } from '../panels/summary-strip.component';
import { PartyOrdersOverviewComponent } from '../panels/party-orders-overview.component';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { OrdersPersonHeaderPanel } from './person-header.panel';
import { OrdersOrganizationHeaderPanel } from './organization-header.panel';
import { OrdersPersonOrdersPanel } from './person-orders.panel';
import { OrdersOrganizationOrdersPanel } from './organization-orders.panel';
import { PersonOrdersOverviewPanel } from './person-orders-overview.panel';
import { OrganizationOrdersOverviewPanel } from './organization-orders-overview.panel';

const PANELS = [
    OrdersPersonHeaderPanel,
    OrdersOrganizationHeaderPanel,
    OrdersPersonOrdersPanel,
    OrdersOrganizationOrdersPanel,
    PersonOrdersOverviewPanel,
    OrganizationOrdersOverviewPanel,
];

@NgModule({
    declarations: [...PANELS],
    imports: [
        CommonModule,
        PersonIdentityComponent,
        OrganizationIdentityComponent,
        MJOSummaryStripComponent,
        PartyOrdersOverviewComponent,
        BaseFormsModule,
    ],
    exports: [...PANELS, PartyOrdersOverviewComponent],
})
export class OrdersPartyHeadersModule {}

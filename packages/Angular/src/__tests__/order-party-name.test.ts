/**
 * The order form's party names after a party is cleared — bc-aidp-next-golive#254.
 *
 * The name fields are read-only view columns, so clearing a person or organization leaves the old
 * name on the record until it reloads. The header and party cards must not show it.
 */
import '@angular/compiler';
import '../public-api';
import { describe, expect, it } from 'vitest';
import { BizAppsOrderHeaderFormComponent } from '../lib/custom/OrderHeader/order-header-form.component';

type PartyView = { HeaderSubtitle: string; BillToName: string; BillToDetail: string; ShipToName: string };

function formWith(record: object): PartyView {
    const form = Object.create(BizAppsOrderHeaderFormComponent.prototype) as PartyView;
    Object.defineProperty(form, 'record', { value: { IsSaved: true, ...record } });
    return form;
}

describe('order form party names', () => {
    it('shows no name for a cleared bill-to person and organization', () => {
        const form = formWith({
            BillToPersonID: null, BillToPerson: 'Pat Payer',
            BillToOrganizationID: null, BillToOrganization: 'Payer Org',
        });

        expect(form.HeaderSubtitle).toBe('');
        expect(form.BillToName).toBe('Choose who pays');
        expect(form.BillToDetail).toBe('Person or organization');
    });

    it('falls back to the person when only the organization was cleared', () => {
        const form = formWith({
            BillToPersonID: 'aaaaaaaa-0000-4000-8000-000000000001', BillToPerson: 'Pat Payer',
            BillToOrganizationID: null, BillToOrganization: 'Payer Org',
        });

        expect(form.BillToName).toBe('Pat Payer');
    });

    it('shows "Same as bill to" for a cleared ship-to person', () => {
        const form = formWith({ ShipToPersonID: null, ShipToPerson: 'Sam Shipper' });

        expect(form.ShipToName).toBe('Same as bill to');
    });
});

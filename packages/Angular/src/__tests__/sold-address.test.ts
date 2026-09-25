import '@angular/compiler';
import '../public-api';
import { describe, expect, it } from 'vitest';
import { FormatSoldAddress, UNREADABLE_ADDRESS } from '../lib/custom/OrderHeader/order-header-prefs';
import { BizAppsOrderHeaderFormComponent } from '../lib/custom/OrderHeader/order-header-form.component';

const unreadable = () => {
    throw new Error('Stored address snapshot is not in the expected shape');
};

describe('FormatSoldAddress', () => {
    it('formats the snapshot a confirmed order was sold to', () => {
        expect(FormatSoldAddress(() => ({ Line1: '1 Billing Way', City: 'Chicago', StateProvince: 'IL', PostalCode: '60601' }))).toBe(
            '1 Billing Way · Chicago, IL 60601',
        );
    });

    it('answers null when there is no snapshot, so the caller falls back to the live address', () => {
        expect(FormatSoldAddress(() => null)).toBeNull();
    });

    it('shows the failure in place of an unreadable snapshot instead of throwing', () => {
        expect(FormatSoldAddress(unreadable)).toBe(UNREADABLE_ADDRESS);
    });
});

describe('order form with an unreadable snapshot', () => {
    function formWith(record: object): { BillToDetail: string; ShipToDetail: string } {
        const form = Object.create(BizAppsOrderHeaderFormComponent.prototype) as { BillToDetail: string; ShipToDetail: string };
        Object.defineProperty(form, 'record', { value: record });
        return form;
    }

    it('renders the rest of the party and marks the address unreadable', () => {
        const record = {
            BillToPerson: 'Pat Payer',
            PaymentTermsType: 'Net 30',
            BillToAddress: '9 Somewhere Else',
            ShipToAddress: '9 Somewhere Else',
            get BillToAddressAsSold() {
                return unreadable();
            },
            get ShipToAddressAsSold() {
                return unreadable();
            },
        };
        const form = formWith(record);

        expect(form.BillToDetail).toBe(`Pat Payer · Net 30 · ${UNREADABLE_ADDRESS}`);
        expect(form.ShipToDetail).toBe(UNREADABLE_ADDRESS);
    });
});

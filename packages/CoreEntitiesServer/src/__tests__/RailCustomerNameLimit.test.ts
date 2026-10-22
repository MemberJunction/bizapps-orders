/**
 * The bill-to name and the invoice number must fit the rail's fields (bc-aidp-next-golive#280). The
 * limit engine is stubbed with rows shaped like the BILL connector metadata, so these pin which
 * fields are checked and when a company is checked at all. Business Central holds no customer or
 * invoice data, so BILL's limits are the only ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../InvoiceRailResolver.js', () => ({ FindInvoiceRailForCompany: vi.fn() }));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    CheckExternalFieldLength,
    ExternalFieldLimitEngine,
    type ExternalFieldTarget,
    type IntegrationObjectFieldRow,
    type IntegrationObjectRow,
} from '@mj-biz-apps/common-entities';
import { BaseInvoiceRail, type InvoiceRailConfig } from '../BaseInvoiceRail.js';
import { BillComInvoiceRail } from '../BillComInvoiceRail.js';
import { FindInvoiceRailForCompany } from '../InvoiceRailResolver.js';
import { CheckOrderBillToName, CheckRailCustomerName, CheckRailInvoiceNumber, OrganizationCustomerName, PersonCustomerName } from '../RailCustomerNameLimit.js';

const provider = {} as IMetadataProvider;
const user = {} as UserInfo;

const objects: IntegrationObjectRow[] = [
    { ID: 'o-customers', Name: 'customers', Integration: 'Bill.com' },
    { ID: 'o-invoices', Name: 'invoices', Integration: 'Bill.com' },
];

const fields: IntegrationObjectFieldRow[] = [
    { IntegrationObjectID: 'o-customers', Name: 'name', Length: 100 },
    { IntegrationObjectID: 'o-invoices', Name: 'invoiceNumber', Length: 100 },
];

const config: InvoiceRailConfig = {
    PaymentProviderID: 'pp-1',
    TypeCode: 'BillCom',
    CompanyID: 'company-1',
    Name: 'Bill.com AR',
    IsLiveMode: false,
    CompanyIntegrationID: 'ci-1',
};

function billComRail(): BillComInvoiceRail {
    const rail = new BillComInvoiceRail();
    rail.Config = config;
    return rail;
}

beforeEach(() => {
    vi.spyOn(ExternalFieldLimitEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ExternalFieldLimitEngine.Instance, 'Check').mockImplementation(
        (label: string, value: string | null | undefined, targets: ReadonlyArray<ExternalFieldTarget>) => CheckExternalFieldLength(label, value, targets, objects, fields),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(FindInvoiceRailForCompany).mockReset();
});

describe('BillComInvoiceRail targets', () => {
    it("checks a customer name against BILL's customer name only", () => {
        expect(billComRail().CustomerNameTargets()).toEqual([{ Integration: 'Bill.com', Object: 'customers', Field: 'name' }]);
    });

    it("checks an invoice number against BILL's invoice number", () => {
        expect(billComRail().InvoiceNumberTargets()).toEqual([{ Integration: 'Bill.com', Object: 'invoices', Field: 'invoiceNumber' }]);
    });
});

describe('CheckRailCustomerName', () => {
    it('passes a name at the limit', async () => {
        expect(await CheckRailCustomerName(billComRail(), 'Organization', 'x'.repeat(100), provider, user)).toBeNull();
    });

    it('rejects a longer name, naming the field and the limit', async () => {
        expect(await CheckRailCustomerName(billComRail(), 'Organization', 'x'.repeat(110), provider, user)).toBe(
            'Organization name is 110 characters; Bill.com customers.name allows 100. Shorten it.',
        );
    });

    it('checks nothing for a rail that declares no targets', async () => {
        const rail = new BaseInvoiceRail();
        rail.Config = config;
        expect(await CheckRailCustomerName(rail, 'Organization', 'x'.repeat(500), provider, user)).toBeNull();
    });
});

describe('CheckRailInvoiceNumber', () => {
    it('passes a number that fits', async () => {
        expect(await CheckRailInvoiceNumber(billComRail(), 'ORD-001234-A', provider, user)).toBeNull();
    });

    it('rejects a longer number, naming the field and the limit', async () => {
        expect(await CheckRailInvoiceNumber(billComRail(), 'N'.repeat(101), provider, user)).toBe(
            'Invoice number is 101 characters; Bill.com invoices.invoiceNumber allows 100. Shorten it.',
        );
    });

    it('checks nothing for a rail that declares no targets', async () => {
        const rail = new BaseInvoiceRail();
        rail.Config = config;
        expect(await CheckRailInvoiceNumber(rail, 'N'.repeat(500), provider, user)).toBeNull();
    });
});

describe('CheckOrderBillToName', () => {
    it("checks each selling company's rail and skips companies that invoice natively", async () => {
        vi.mocked(FindInvoiceRailForCompany).mockImplementation(async (companyID: string) => (companyID === 'company-1' ? billComRail() : null));
        const messages = await CheckOrderBillToName(['company-1', 'company-2'], { Kind: 'Organization', Name: 'x'.repeat(120) }, provider, user);
        expect(messages).toEqual(['Organization name is 120 characters; Bill.com customers.name allows 100. Shorten it.']);
        expect(FindInvoiceRailForCompany).toHaveBeenCalledTimes(2);
    });

    it('reports one message when two companies share the same limit', async () => {
        vi.mocked(FindInvoiceRailForCompany).mockImplementation(async () => billComRail());
        const messages = await CheckOrderBillToName(['company-1', 'company-3'], { Kind: 'Organization', Name: 'x'.repeat(120) }, provider, user);
        expect(messages).toHaveLength(1);
    });

    it('passes when no selling company invoices through a rail', async () => {
        vi.mocked(FindInvoiceRailForCompany).mockResolvedValue(null);
        expect(await CheckOrderBillToName(['company-2'], { Kind: 'Organization', Name: 'x'.repeat(120) }, provider, user)).toEqual([]);
    });
});

describe('customer names', () => {
    it('uses the organization name, then its legal name', () => {
        expect(OrganizationCustomerName({ Name: 'Acme', LegalName: 'Acme Holdings LLC' })).toBe('Acme');
        expect(OrganizationCustomerName({ Name: null, LegalName: 'Acme Holdings LLC' })).toBe('Acme Holdings LLC');
    });

    it("uses the person's display name, then first and last name", () => {
        expect(PersonCustomerName({ DisplayName: 'Pat Doe', FirstName: 'Pat', LastName: 'Doe' })).toBe('Pat Doe');
        expect(PersonCustomerName({ DisplayName: null, FirstName: 'Pat', LastName: 'Doe' })).toBe('Pat Doe');
    });
});

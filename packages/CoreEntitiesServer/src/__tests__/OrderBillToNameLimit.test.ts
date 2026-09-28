/**
 * An order whose selling company invoices through a rail refuses a bill-to name the rail cannot
 * hold (bc-aidp-next-golive#280). The name check itself is `RailCustomerNameLimit`'s subject; this
 * pins when the order asks and which companies it asks about.
 *
 * `Object.create` matches the sibling order tests: it holds the server entity without standing up
 * metadata, with the generated accessors shadowed by plain properties.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../RailCustomerNameLimit.js', () => ({
    LoadBillToName: vi.fn(async () => ({ Kind: 'Organization', Name: 'x'.repeat(120) })),
    CheckOrderBillToName: vi.fn(async () => ['Organization name is 120 characters; Bill.com customers.name allows 100. Shorten it before saving.']),
}));

import { OrderEntityServer } from '../OrderEntityServer.js';
import { CheckOrderBillToName, LoadBillToName } from '../RailCustomerNameLimit.js';

const ORG = 'b1c2d3e4-0000-4000-8000-00000000000a';
const COMPANY_A = 'A1C2D3E4-0000-4000-8000-000000000001';
const COMPANY_B = 'a1c2d3e4-0000-4000-8000-000000000002';

type BillToCheck = { checkBillToNameFitsRails(): Promise<string[]> };

function order(opts: { saved: boolean; payerDirty: boolean; booking: boolean; lineCompanies: Array<string | null> }): OrderEntityServer & BillToCheck {
    const o = Object.create(OrderEntityServer.prototype) as OrderEntityServer & BillToCheck;
    for (const [k, v] of Object.entries({
        IsSaved: opts.saved,
        CompanyID: COMPANY_A,
        BillToOrganizationID: ORG,
        BillToPersonID: null,
        ContextCurrentUser: { ID: 'user-1' },
        ProviderToUse: {},
        Lines: { Items: opts.lineCompanies.map((CompanyID) => ({ CompanyID })) },
    })) {
        Object.defineProperty(o, k, { value: v, writable: true });
    }
    Object.defineProperty(o, 'GetFieldByName', {
        value: (name: string) => ({ Dirty: opts.payerDirty && name === 'BillToOrganizationID' }),
    });
    Object.defineProperty(o, 'willBookOnThisSave', { value: () => opts.booking });
    return o;
}

afterEach(() => {
    vi.mocked(LoadBillToName).mockClear();
    vi.mocked(CheckOrderBillToName).mockClear();
});

describe('OrderEntityServer bill-to name check', () => {
    it('checks a new order against the header company and each line company, once each', async () => {
        const messages = await order({ saved: false, payerDirty: false, booking: false, lineCompanies: [COMPANY_A.toLowerCase(), COMPANY_B, null] }).checkBillToNameFitsRails();
        expect(messages).toHaveLength(1);
        expect(vi.mocked(CheckOrderBillToName).mock.calls[0][0]).toEqual([COMPANY_A, COMPANY_B]);
        expect(vi.mocked(LoadBillToName).mock.calls[0].slice(0, 2)).toEqual([ORG, null]);
    });

    it('checks a saved order when its payer changes', async () => {
        await order({ saved: true, payerDirty: true, booking: false, lineCompanies: [] }).checkBillToNameFitsRails();
        expect(CheckOrderBillToName).toHaveBeenCalledTimes(1);
    });

    it('checks a saved order when it books', async () => {
        await order({ saved: true, payerDirty: false, booking: true, lineCompanies: [] }).checkBillToNameFitsRails();
        expect(CheckOrderBillToName).toHaveBeenCalledTimes(1);
    });

    it('does not check a saved draft edited for any other reason', async () => {
        const messages = await order({ saved: true, payerDirty: false, booking: false, lineCompanies: [] }).checkBillToNameFitsRails();
        expect(messages).toEqual([]);
        expect(LoadBillToName).not.toHaveBeenCalled();
    });
});

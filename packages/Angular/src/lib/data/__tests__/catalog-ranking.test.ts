import { describe, expect, it } from 'vitest';
import { RankCatalogMatches } from '../orders-queries';
import type { MJOProductOption } from '../orders-queries';

const OWN_COMPANY = '11111111-1111-1111-1111-111111111111';
const OTHER_COMPANY = '22222222-2222-2222-2222-222222222222';

function option(partial: Partial<MJOProductOption> & { ID: string; Name: string }): MJOProductOption {
    return {
        SKU: '',
        TypeName: 'Goods',
        ProductTypeID: 'type-goods',
        OrderLineExtensionEntity: null,
        CompanyName: 'Other Co',
        CompanyID: OTHER_COMPANY,
        ListPrice: 0,
        Taxable: false,
        MaxQuantityPerLine: null,
        SubscriptionTypeID: null,
        ...partial,
    };
}

const names = (rows: MJOProductOption[]): string[] => rows.map((r) => r.Name);

describe('RankCatalogMatches', () => {
    it('ranks a name that starts with the query above one that merely contains it', () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Executive Summary Report' }),
                option({ ID: 'b', Name: 'Summit Ticket' }),
            ],
            'sum',
        );
        expect(names(ranked)).toEqual(['Summit Ticket', 'Executive Summary Report']);
    });

    it('ranks a SKU that starts with the query above a name that only contains it', () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Aardvark Mug', SKU: 'ZZZ-1' }),
                option({ ID: 'b', Name: 'Zebra Poster', SKU: 'MUG-100' }),
            ],
            'mug',
        );
        expect(names(ranked)).toEqual(['Zebra Poster', 'Aardvark Mug']);
    });

    it("puts the order's own company first within a tier", () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Membership — Annual', CompanyID: OTHER_COMPANY, CompanyName: 'SoundPost' }),
                option({ ID: 'b', Name: 'Membership — Student', CompanyID: OWN_COMPANY, CompanyName: 'BCC' }),
            ],
            'member',
            OWN_COMPANY,
        );
        expect(names(ranked)).toEqual(['Membership — Student', 'Membership — Annual']);
    });

    it('does not let the own company outrank a better match', () => {
        // Cross-company selling is intended, so company breaks ties — it does not bury an exact hit.
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Premium Summit Pass', CompanyID: OWN_COMPANY, CompanyName: 'BCC' }),
                option({ ID: 'b', Name: 'Summit Ticket', CompanyID: OTHER_COMPANY, CompanyName: 'SoundPost' }),
            ],
            'summit',
            OWN_COMPANY,
        );
        expect(names(ranked)).toEqual(['Summit Ticket', 'Premium Summit Pass']);
    });

    it('sorts alphabetically within a tier once company is equal', () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Summit Workshop' }),
                option({ ID: 'b', Name: 'Summit Dinner' }),
                option({ ID: 'c', Name: 'Summit Ticket' }),
            ],
            'summit',
        );
        expect(names(ranked)).toEqual(['Summit Dinner', 'Summit Ticket', 'Summit Workshop']);
    });

    it('keeps another company’s products in the results', () => {
        const ranked = RankCatalogMatches(
            [option({ ID: 'a', Name: 'SoundPost Journal', CompanyID: OTHER_COMPANY, CompanyName: 'SoundPost' })],
            'journal',
            OWN_COMPANY,
        );
        expect(names(ranked)).toEqual(['SoundPost Journal']);
    });

    it('drops rows that match neither name nor SKU', () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Summit Ticket', SKU: 'EVT-1' }),
                option({ ID: 'b', Name: 'Coffee Mug', SKU: 'MUG-1' }),
            ],
            'summit',
        );
        expect(names(ranked)).toEqual(['Summit Ticket']);
    });

    it('returns the whole catalog, own company first, when the query is empty', () => {
        const ranked = RankCatalogMatches(
            [
                option({ ID: 'a', Name: 'Zebra Poster', CompanyID: OWN_COMPANY, CompanyName: 'BCC' }),
                option({ ID: 'b', Name: 'Aardvark Mug', CompanyID: OTHER_COMPANY, CompanyName: 'SoundPost' }),
            ],
            '   ',
            OWN_COMPANY,
        );
        expect(names(ranked)).toEqual(['Zebra Poster', 'Aardvark Mug']);
    });

    it('reaches a product that sorts past the old 500-row cap', () => {
        // The cap used to be applied BEFORE the search, so a product whose name sorted after the
        // 500th was unreachable no matter what was typed. This is that product.
        const catalog = Array.from({ length: 900 }, (_, i) =>
            option({ ID: `p-${i}`, Name: `Product ${String(i).padStart(4, '0')}` }),
        );
        catalog.push(option({ ID: 'zz', Name: 'Zzyzx Membership', SKU: 'ZZX-1' }));

        const ranked = RankCatalogMatches(catalog, 'zzyzx');
        expect(names(ranked)).toEqual(['Zzyzx Membership']);
    });

    it('matches case-insensitively on name and SKU', () => {
        const ranked = RankCatalogMatches(
            [option({ ID: 'a', Name: 'Summit Ticket', SKU: 'evt-summit' })],
            'EVT',
        );
        expect(names(ranked)).toEqual(['Summit Ticket']);
    });
});

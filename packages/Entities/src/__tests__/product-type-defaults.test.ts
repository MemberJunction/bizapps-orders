/**
 * bc-aidp-next-golive#277: choosing a product type fills its defaults, which the user can then change.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    PlanProductDefaultWrites,
    ResolveProductDefaults,
    type ProductDefaults,
    type ProductDefaultsLookup,
} from '../ProductEntity';

const EVEN = 'AAAAAAAA-0000-0000-0000-000000000001';
const UP_FRONT = 'AAAAAAAA-0000-0000-0000-000000000002';
const ANNUAL = 'BBBBBBBB-0000-0000-0000-000000000001';

type TypeRow = {
    ID: string;
    DefaultRevenueRecognitionTypeID: string | null;
    DefaultSubscriptionTypeID: string | null;
    DefaultIsTaxable: boolean;
    DefaultTaxCategory: string | null;
};
type CategoryRow = { ID: string; ParentID: string | null; DefaultIsTaxable: boolean | null; DefaultTaxCategory: string | null };

const TYPES: TypeRow[] = [
    { ID: 'subscription', DefaultRevenueRecognitionTypeID: EVEN, DefaultSubscriptionTypeID: ANNUAL, DefaultIsTaxable: true, DefaultTaxCategory: null },
    { ID: 'merch', DefaultRevenueRecognitionTypeID: UP_FRONT, DefaultSubscriptionTypeID: null, DefaultIsTaxable: true, DefaultTaxCategory: null },
    { ID: 'donation', DefaultRevenueRecognitionTypeID: UP_FRONT, DefaultSubscriptionTypeID: null, DefaultIsTaxable: false, DefaultTaxCategory: null },
];
const CATEGORIES: CategoryRow[] = [
    { ID: 'root-exempt', ParentID: null, DefaultIsTaxable: false, DefaultTaxCategory: null },
    { ID: 'leaf-silent', ParentID: 'root-exempt', DefaultIsTaxable: null, DefaultTaxCategory: null },
    { ID: 'silent', ParentID: null, DefaultIsTaxable: null, DefaultTaxCategory: null },
];

const lookup = {
    ProductTypeByID: (id: string | null | undefined) => TYPES.find((t) => t.ID === id),
    ProductCategoryByID: (id: string | null | undefined) => CATEGORIES.find((c) => c.ID === id),
    CategoryChain: (id: string | null | undefined) => {
        const chain: string[] = [];
        let current = CATEGORIES.find((c) => c.ID === id);
        while (current) {
            chain.push(current.ID);
            current = CATEGORIES.find((c) => c.ID === current?.ParentID);
        }
        return chain;
    },
} as unknown as ProductDefaultsLookup;

const EMPTY: ProductDefaults = { RevenueRecognitionTypeID: null, SubscriptionTypeID: null, IsTaxable: null };

describe('ResolveProductDefaults', () => {
    it('reads the type defaults the issue names: Subscription → Even Over Time, Annual Rolling, taxable', () => {
        expect(ResolveProductDefaults(lookup, 'subscription', 'silent')).toEqual({
            RevenueRecognitionTypeID: EVEN,
            SubscriptionTypeID: ANNUAL,
            IsTaxable: true,
        });
    });

    it('takes taxability from the category chain before the type', () => {
        expect(ResolveProductDefaults(lookup, 'subscription', 'leaf-silent')?.IsTaxable).toBe(false);
    });

    it('returns null for an unknown type', () => {
        expect(ResolveProductDefaults(lookup, 'nope', 'silent')).toBeNull();
        expect(ResolveProductDefaults(lookup, null, 'silent')).toBeNull();
    });
});

describe('PlanProductDefaultWrites', () => {
    const subscription = ResolveProductDefaults(lookup, 'subscription', 'silent')!;
    const merch = ResolveProductDefaults(lookup, 'merch', 'silent')!;

    it('fills every empty field', () => {
        expect(PlanProductDefaultWrites(EMPTY, {}, subscription)).toEqual(subscription);
    });

    it('keeps a value the user chose', () => {
        const current = { ...EMPTY, RevenueRecognitionTypeID: UP_FRONT, IsTaxable: false };
        expect(PlanProductDefaultWrites(current, {}, subscription)).toEqual({ SubscriptionTypeID: ANNUAL });
    });

    it('replaces the previous type\'s stamp on a type switch, and clears a default the new type lacks', () => {
        expect(PlanProductDefaultWrites(subscription, subscription, merch)).toEqual({
            RevenueRecognitionTypeID: UP_FRONT,
            SubscriptionTypeID: null,
        });
    });

    it('does not replace a stamped field the user has since changed', () => {
        const current = { ...subscription, RevenueRecognitionTypeID: UP_FRONT };
        expect(PlanProductDefaultWrites(current, subscription, ResolveProductDefaults(lookup, 'donation', 'silent')!)).toEqual({
            SubscriptionTypeID: null,
            IsTaxable: false,
        });
    });

    it('treats ids case-insensitively', () => {
        const current = { ...subscription, RevenueRecognitionTypeID: EVEN.toLowerCase() };
        expect(PlanProductDefaultWrites(current, {}, subscription)).toEqual({});
    });
});

describe('ProductEntity wiring', () => {
    const source = readFileSync(fileURLToPath(new URL('../ProductEntity.ts', import.meta.url)), 'utf8');

    it('is registered for the Products entity and exported from the package', () => {
        expect(source).toMatch(/@RegisterClass\(BaseEntity, ENTITY\)/);
        const index = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
        expect(index).toMatch(/export \* from '\.\/ProductEntity'/);
    });

    it('applies defaults on Set of the type or category, on NewRecord, and before a new product saves', () => {
        expect(source).toMatch(/FieldName === 'ProductTypeID' \|\| FieldName === 'ProductCategoryID'/);
        expect(source).toMatch(/override NewRecord[\s\S]*applyTypeDefaults\(\)/);
        expect(source).toMatch(/override async Save[\s\S]*if \(!this\.IsSaved\)[\s\S]*applyTypeDefaults\(\)/);
    });
});

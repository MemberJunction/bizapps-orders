/**
 * Unit tests for the pure half of tax resolution (plan D73). No database.
 *
 * The taxability WALK is the piece worth pinning. There are three ways to owe no tax — the product
 * is not taxable, the seller has no nexus, the buyer is exempt — and they are different facts that
 * all produce the same number. A walk that silently answers "not taxable" when it meant "nobody
 * said" is the failure mode, so the tests assert WHERE each answer came from, not just what it was.
 */
import { describe, it, expect } from 'vitest';
import { ResolveTaxability } from '../TaxResolver.js';

const product = (isTaxable: boolean | null, cat: string | null = null) => ({
    IsTaxable: isTaxable,
    TaxCategory: cat,
});
/** One level of the category tree. `chain()` builds them nearest-first. */
const lvl = (id: string, isTaxable: boolean | null, cat: string | null = null) => ({
    ID: id,
    DefaultIsTaxable: isTaxable,
    DefaultTaxCategory: cat,
});
/** Nearest first: the product's own category, then its parent, to the root. */
const chain = (...levels: ReturnType<typeof lvl>[]) => levels;
const type = (isTaxable: boolean, cat: string | null = null) => ({
    DefaultIsTaxable: isTaxable,
    DefaultTaxCategory: cat,
});

describe('ResolveTaxability — the walk', () => {
    it('the PRODUCT wins when it states taxability', () => {
        const r = ResolveTaxability(product(false), chain(lvl('c', true)), type(true));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('Product');
    });

    it('falls to the CATEGORY when the product is silent', () => {
        const r = ResolveTaxability(product(null), chain(lvl('c', false)), type(true));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductCategory');
    });

    it('falls to the TYPE when product and category are both silent', () => {
        const r = ResolveTaxability(product(null), chain(lvl('c', null)), type(false));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductType');
    });

    it('defaults to TAXABLE when nothing answers', () => {
        // Under-collecting is the expensive direction: the seller owes tax it failed to charge and
        // usually cannot recover it from the customer after the fact.
        const r = ResolveTaxability(product(null), [], null);
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('Default');
    });

    it('distinguishes "the category said no" from "nobody said"', () => {
        // Same answer, different facts — and an auditor asking why no tax was charged needs the
        // right one.
        expect(ResolveTaxability(product(null), chain(lvl('c', false)), null).DecidedAt).toBe('ProductCategory');
        expect(ResolveTaxability(product(null), [], null).DecidedAt).toBe('Default');
    });

    it('a product may state FALSE against a taxable category', () => {
        const r = ResolveTaxability(product(false), chain(lvl('c', true)), type(true));
        expect(r.IsTaxable).toBe(false);
    });

    it('a product may state TRUE against an exempt category', () => {
        const r = ResolveTaxability(product(true), chain(lvl('c', false)), type(false));
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('Product');
    });

    it('treats a missing category as silent rather than as false', () => {
        // An uncategorised product must not become exempt by omission.
        const r = ResolveTaxability(product(null), [], type(true));
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('ProductType');
    });
});

describe('ResolveTaxability — the tax CATEGORY resolves independently', () => {
    it('the product names its own category', () => {
        expect(ResolveTaxability(product(true, 'Reduced'), chain(lvl('c', true, 'Standard')), type(true, 'Standard')).TaxCategory)
            .toBe('Reduced');
    });

    it('falls to the category, then the type', () => {
        expect(ResolveTaxability(product(true), chain(lvl('c', true, 'Reduced')), type(true, 'Standard')).TaxCategory).toBe('Reduced');
        expect(ResolveTaxability(product(true), chain(lvl('c', true)), type(true, 'Standard')).TaxCategory).toBe('Standard');
    });

    it('is null when nobody names one', () => {
        expect(ResolveTaxability(product(true), chain(lvl('c', true)), type(true)).TaxCategory).toBeNull();
    });

    it('resolves INDEPENDENTLY of taxability — the common real shape', () => {
        // 'Publications are exempt here' is a category statement; the product still carries its own
        // tax category for the jurisdictions where they ARE taxed.
        const r = ResolveTaxability(product(null, 'Publications'), chain(lvl('c', false)), type(true, 'Standard'));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductCategory');
        expect(r.TaxCategory).toBe('Publications');
    });
});

describe('ResolveTaxability — climbing the category tree', () => {
    it('an ANCESTOR answers when the nearest categories are silent', () => {
        // leaf → mid → root, and only the root has an opinion. Reading just the immediate category
        // would make it unreachable, which defeats having a tree.
        const r = ResolveTaxability(
            product(null),
            chain(lvl('leaf', null), lvl('mid', null), lvl('root', false)),
            type(true),
        );
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductCategory');
        expect(r.DecidedAtCategoryID).toBe('root');
    });

    it('the NEAREST category with an opinion wins over its ancestors', () => {
        const r = ResolveTaxability(
            product(null),
            chain(lvl('leaf', true), lvl('root', false)),
            type(false),
        );
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAtCategoryID).toBe('leaf');
    });

    it('reports WHICH category decided — a root answer differs from a leaf answer', () => {
        const atLeaf = ResolveTaxability(product(null), chain(lvl('leaf', false), lvl('root', true)), type(true));
        const atRoot = ResolveTaxability(product(null), chain(lvl('leaf', null), lvl('root', false)), type(true));
        expect(atLeaf.DecidedAtCategoryID).toBe('leaf');
        expect(atRoot.DecidedAtCategoryID).toBe('root');
    });

    it('falls past a wholly silent chain to the type', () => {
        const r = ResolveTaxability(product(null), chain(lvl('leaf', null), lvl('root', null)), type(false));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductType');
        expect(r.DecidedAtCategoryID).toBeUndefined();
    });

    it('the TAX CATEGORY climbs the chain independently of taxability', () => {
        // Taxability answered at the leaf; the category name came from the root. Two facts, two
        // levels, and different people maintain them.
        const r = ResolveTaxability(
            product(null),
            chain(lvl('leaf', false), lvl('root', true, 'Reduced')),
            type(true, 'Standard'),
        );
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAtCategoryID).toBe('leaf');
        expect(r.TaxCategory).toBe('Reduced');
    });

    it('a deep chain still terminates at the type', () => {
        const deep = chain(...Array.from({ length: 12 }, (_, i) => lvl(`c${i}`, null)));
        expect(ResolveTaxability(product(null), deep, type(true)).DecidedAt).toBe('ProductType');
    });
});

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
const category = (isTaxable: boolean | null, cat: string | null = null) => ({
    IsTaxable: isTaxable,
    TaxCategory: cat,
});
const type = (isTaxable: boolean, cat: string | null = null) => ({
    DefaultIsTaxable: isTaxable,
    DefaultTaxCategory: cat,
});

describe('ResolveTaxability — the walk', () => {
    it('the PRODUCT wins when it states taxability', () => {
        const r = ResolveTaxability(product(false), category(true), type(true));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('Product');
    });

    it('falls to the CATEGORY when the product is silent', () => {
        const r = ResolveTaxability(product(null), category(false), type(true));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductCategory');
    });

    it('falls to the TYPE when product and category are both silent', () => {
        const r = ResolveTaxability(product(null), category(null), type(false));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductType');
    });

    it('defaults to TAXABLE when nothing answers', () => {
        // Under-collecting is the expensive direction: the seller owes tax it failed to charge and
        // usually cannot recover it from the customer after the fact.
        const r = ResolveTaxability(product(null), null, null);
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('Default');
    });

    it('distinguishes "the category said no" from "nobody said"', () => {
        // Same answer, different facts — and an auditor asking why no tax was charged needs the
        // right one.
        expect(ResolveTaxability(product(null), category(false), null).DecidedAt).toBe('ProductCategory');
        expect(ResolveTaxability(product(null), null, null).DecidedAt).toBe('Default');
    });

    it('a product may state FALSE against a taxable category', () => {
        const r = ResolveTaxability(product(false), category(true), type(true));
        expect(r.IsTaxable).toBe(false);
    });

    it('a product may state TRUE against an exempt category', () => {
        const r = ResolveTaxability(product(true), category(false), type(false));
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('Product');
    });

    it('treats a missing category as silent rather than as false', () => {
        // An uncategorised product must not become exempt by omission.
        const r = ResolveTaxability(product(null), null, type(true));
        expect(r.IsTaxable).toBe(true);
        expect(r.DecidedAt).toBe('ProductType');
    });
});

describe('ResolveTaxability — the tax CATEGORY resolves independently', () => {
    it('the product names its own category', () => {
        expect(ResolveTaxability(product(true, 'Reduced'), category(true, 'Standard'), type(true, 'Standard')).TaxCategory)
            .toBe('Reduced');
    });

    it('falls to the category, then the type', () => {
        expect(ResolveTaxability(product(true), category(true, 'Reduced'), type(true, 'Standard')).TaxCategory).toBe('Reduced');
        expect(ResolveTaxability(product(true), category(true), type(true, 'Standard')).TaxCategory).toBe('Standard');
    });

    it('is null when nobody names one', () => {
        expect(ResolveTaxability(product(true), category(true), type(true)).TaxCategory).toBeNull();
    });

    it('resolves INDEPENDENTLY of taxability — the common real shape', () => {
        // 'Publications are exempt here' is a category statement; the product still carries its own
        // tax category for the jurisdictions where they ARE taxed.
        const r = ResolveTaxability(product(null, 'Publications'), category(false), type(true, 'Standard'));
        expect(r.IsTaxable).toBe(false);
        expect(r.DecidedAt).toBe('ProductCategory');
        expect(r.TaxCategory).toBe('Publications');
    });
});

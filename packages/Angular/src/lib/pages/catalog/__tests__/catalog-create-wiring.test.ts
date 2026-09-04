import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from '@angular/core';
import { MJO_ENTITIES } from '../../../data/entity-names';
import { MJOChargesTaxPageComponent, MJOProductsPageComponent } from '../products.page';
import { MJOPricingPageComponent, MJOPromotionsPageComponent } from '../pricing.page';

/**
 * bc-aidp-next-golive#195 — every New button on the Catalog did nothing.
 *
 * `mj-entity-viewer` does not create records. It raises `CreateRecordRequested` and leaves creating to
 * the host, so a grid whose host does not bind that event renders a button that silently does nothing:
 * an unbound Angular `@Output` emits into nobody and raises no error. There is no exception to catch and
 * nothing in the console, which is why this survived to a UAT report.
 *
 * TWO KINDS OF TEST, AND WHY BOTH. The behavioural half proves each page asks for the right entity —
 * a page emitting its neighbour's entity name would open the wrong create form, and every one of these
 * pages emits through the same method name. The structural half is the one that matters longer: it reads
 * the page sources and asserts that every `<mj-entity-viewer` on this screen binds the event. Four grids
 * were dead when this was written, and the failure mode is not that someone unbinds one — it is that a
 * fifth grid is added later by copying a block that predates the fix.
 *
 * The pages are instantiated through `Object.create` because they `inject(ChangeDetectorRef)` in their
 * field initializers, which throws outside an injection context. `OnCreateRequested` reads exactly one
 * field, so the emitter is supplied directly rather than standing up a TestBed.
 */

const CATALOG_DIR = fileURLToPath(new URL('..', import.meta.url));

/** Calls the real method with a real emitter attached, and returns what it emitted. */
function emittedBy(ctor: new (...args: never[]) => { OnCreateRequested(): void }): string | undefined {
    const page = Object.create(ctor.prototype) as {
        OnCreateRequested(): void;
        CreateRecordRequested: EventEmitter<string>;
    };
    page.CreateRecordRequested = new EventEmitter<string>();
    let seen: string | undefined;
    page.CreateRecordRequested.subscribe((v: string) => {
        seen = v;
    });
    page.OnCreateRequested();
    return seen;
}

describe('each catalog page asks for its own entity', () => {
    it.each([
        ['Products', MJOProductsPageComponent, MJO_ENTITIES.Product],
        ['Pricing', MJOPricingPageComponent, MJO_ENTITIES.ProductPrice],
        ['Promotions', MJOPromotionsPageComponent, MJO_ENTITIES.Promotion],
        ['Charges & tax', MJOChargesTaxPageComponent, MJO_ENTITIES.ChargeType],
    ])('%s emits its own entity name', (_label, ctor, expected) => {
        expect(emittedBy(ctor as never)).toBe(expected);
    });

    /**
     * Four pages, four distinct entities. Copy-paste is how this file was written and how it will be
     * extended, and two pages sharing an entity would send one grid's New button to the other's form.
     */
    it('no two pages emit the same entity', () => {
        const all = [
            emittedBy(MJOProductsPageComponent as never),
            emittedBy(MJOPricingPageComponent as never),
            emittedBy(MJOPromotionsPageComponent as never),
            emittedBy(MJOChargesTaxPageComponent as never),
        ];
        expect(new Set(all).size).toBe(all.length);
    });

    it('emits a real entity name, not an empty string', () => {
        for (const v of [
            emittedBy(MJOProductsPageComponent as never),
            emittedBy(MJOPricingPageComponent as never),
        ]) {
            expect(v).toBeTruthy();
            expect(String(v)).toContain('MJ_BizApps_Orders:');
        }
    });
});

describe('no catalog grid ships without a create binding', () => {
    const sources = readdirSync(CATALOG_DIR)
        .filter((f) => f.endsWith('.page.ts'))
        .map((f) => ({ file: f, text: readFileSync(CATALOG_DIR + f, 'utf8') }));

    it('finds the catalog pages to check (never asserts against nothing)', () => {
        expect(sources.length).toBeGreaterThan(0);
        expect(sources.some((s) => s.text.includes('<mj-entity-viewer'))).toBe(true);
    });

    it.each([['products.page.ts'], ['pricing.page.ts']])(
        '%s binds CreateRecordRequested once per entity viewer',
        (name) => {
            const src = sources.find((s) => s.file === name);
            expect(src, `${name} not found`).toBeDefined();
            const viewers = (src!.text.match(/<mj-entity-viewer/g) ?? []).length;
            const bindings = (src!.text.match(/\(CreateRecordRequested\)=/g) ?? []).length;
            expect(viewers).toBeGreaterThan(0);
            expect(bindings).toBe(viewers);
        },
    );

    /**
     * The general form of the rule, so a NEW catalog page is covered the day it lands rather than the
     * day someone files the next #195.
     */
    it('every entity viewer anywhere in this folder is bound', () => {
        for (const { file, text } of sources) {
            const viewers = (text.match(/<mj-entity-viewer/g) ?? []).length;
            if (viewers === 0) continue;
            const bindings = (text.match(/\(CreateRecordRequested\)=/g) ?? []).length;
            expect(bindings, `${file}: ${viewers} viewer(s) but ${bindings} create binding(s)`).toBe(
                viewers,
            );
        }
    });
});

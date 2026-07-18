/**
 * TIER 4 (orders) — Product Catalog dashboard, headless against the REAL API path
 * (component → GraphQLDataProvider → MJAPI → DB). Proves the orders gui harness renders a real
 * orders dashboard and real catalog data flows through the component's client. The catalog is seeded
 * (seed-demo-catalog); we assert the data path (products load, each is well-formed, categories
 * present) + a clean render via the keystone. Exact per-product figures are a tier-2/3 concern.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { bootstrapTier4 } from './tier4-bootstrap';
import { ProductCatalogModule } from '../../src/lib/custom/ProductCatalog/product-catalog.module';
import { ProductCatalogDashboardComponent } from '../../src/lib/custom/ProductCatalog/product-catalog-dashboard.component';

interface ProductRow { ID: string; Name: string; }
interface Model { IsLoading: boolean; LoadError: string | null; AllProducts: ProductRow[]; Categories: string[]; }

describe('TIER 4 (orders): Product Catalog dashboard (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);

  it('loads the real product catalog through the client and renders cleanly', async () => {
    TestBed.configureTestingModule({ imports: [ProductCatalogModule] });
    const fixture = TestBed.createComponent(ProductCatalogDashboardComponent);
    const cmp = fixture.componentInstance as unknown as Model;
    fixture.detectChanges();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (cmp.LoadError !== null) break;
      if (i > 3 && cmp.IsLoading === false) break;
    }
    fixture.detectChanges();
    await fixture.whenStable();

    expect(cmp.LoadError, `LoadError: ${cmp.LoadError}`).toBeNull();
    expect((fixture.nativeElement as HTMLElement).innerHTML.length).toBeGreaterThan(0);
    // real data through the API — well-formed, not liveness
    expect(cmp.AllProducts.length, 'seeded products loaded').toBeGreaterThan(0);
    expect(cmp.AllProducts.every((p) => !!p.ID && !!p.Name), 'every product has ID + Name').toBe(true);
    expect(cmp.Categories.length, 'categories present').toBeGreaterThan(0);
  });
});

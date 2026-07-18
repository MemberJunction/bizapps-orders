/** TIER 4 (orders) — Product Categories tree dashboard, real API path: loads the category tree +
 *  products through the real client and renders cleanly. Injects MJFormPresenterService (provided). */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { bootstrapTier4 } from './tier4-bootstrap';
import { ProductCategoryTreeModule } from '../../src/lib/custom/ProductCategoryTree/product-category-tree.module';
import { ProductCategoryTreeDashboardComponent } from '../../src/lib/custom/ProductCategoryTree/product-category-tree-dashboard.component';
interface Model { IsLoading?: boolean; LoadError: string | null; Nodes: unknown[]; AllProducts: unknown[]; }
describe('TIER 4 (orders): Product Categories tree (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);
  it('loads the category tree + products through the real client and renders cleanly', async () => {
    TestBed.configureTestingModule({ imports: [ProductCategoryTreeModule], providers: [MJFormPresenterService] });
    const f = TestBed.createComponent(ProductCategoryTreeDashboardComponent);
    const c = f.componentInstance as unknown as Model;
    f.detectChanges();
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (c.LoadError !== null) break; if (i > 3 && c.IsLoading === false) break; }
    f.detectChanges(); await f.whenStable();
    expect(c.LoadError, `LoadError: ${c.LoadError}`).toBeNull();
    expect((f.nativeElement as HTMLElement).innerHTML.length).toBeGreaterThan(0);
    expect(Array.isArray(c.Nodes) && Array.isArray(c.AllProducts), 'category tree + products loaded').toBe(true);
  });
});

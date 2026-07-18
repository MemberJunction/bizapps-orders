/** TIER 4 (orders) — Orders Management (pipeline) dashboard, real API path: loads all orders through
 *  the real client and renders cleanly. Injects the shared MJFormPresenterService (provided here). */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { bootstrapTier4 } from './tier4-bootstrap';
import { OrdersManagementModule } from '../../src/lib/custom/OrdersManagement/orders-management.module';
import { OrdersManagementDashboardComponent } from '../../src/lib/custom/OrdersManagement/orders-management-dashboard.component';
interface Model { IsLoading?: boolean; LoadError: string | null; AllOrders: unknown[]; }
describe('TIER 4 (orders): Orders Management pipeline (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);
  it('loads all orders through the real client and renders the pipeline cleanly', async () => {
    TestBed.configureTestingModule({ imports: [OrdersManagementModule], providers: [MJFormPresenterService] });
    const f = TestBed.createComponent(OrdersManagementDashboardComponent);
    const c = f.componentInstance as unknown as Model;
    f.detectChanges();
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (c.LoadError !== null) break; if (i > 3 && c.IsLoading === false) break; }
    f.detectChanges(); await f.whenStable();
    expect(c.LoadError, `LoadError: ${c.LoadError}`).toBeNull();
    expect((f.nativeElement as HTMLElement).innerHTML.length).toBeGreaterThan(0);
    expect(Array.isArray(c.AllOrders), 'orders loaded as an array through the real client').toBe(true);
  });
});

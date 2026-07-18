/** TIER 4 (orders) — Order History dashboard, real API path: loads orders (+ customers/products)
 *  through the real client and renders cleanly. */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { bootstrapTier4 } from './tier4-bootstrap';
import { OrderHistoryModule } from '../../src/lib/custom/OrderHistory/order-history.module';
import { OrderHistoryDashboardComponent } from '../../src/lib/custom/OrderHistory/order-history-dashboard.component';
interface Model { IsLoading: boolean; LoadError: string | null; Orders: unknown[]; }
describe('TIER 4 (orders): Order History (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);
  it('loads order history through the real client and renders cleanly', async () => {
    TestBed.configureTestingModule({ imports: [OrderHistoryModule] });
    const f = TestBed.createComponent(OrderHistoryDashboardComponent);
    const c = f.componentInstance as unknown as Model;
    f.detectChanges();
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (c.LoadError !== null) break; if (i > 3 && c.IsLoading === false) break; }
    f.detectChanges(); await f.whenStable();
    expect(c.LoadError, `LoadError: ${c.LoadError}`).toBeNull();
    expect((f.nativeElement as HTMLElement).innerHTML.length).toBeGreaterThan(0);
    expect(Array.isArray(c.Orders), 'orders loaded as an array through the real client').toBe(true);
  });
});

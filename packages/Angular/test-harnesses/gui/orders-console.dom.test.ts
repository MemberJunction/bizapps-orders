/** TIER 4 (orders) — Orders Console dashboard, real API path: loads products + recent orders through
 *  the real client and renders cleanly. */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { bootstrapTier4 } from './tier4-bootstrap';
import { OrdersConsoleModule } from '../../src/lib/custom/OrdersConsole/orders-console.module';
import { OrdersConsoleDashboardComponent } from '../../src/lib/custom/OrdersConsole/orders-console-dashboard.component';
interface Model { IsLoading: boolean; LoadError: string | null; Products: unknown[]; RecentOrders: unknown[]; }
describe('TIER 4 (orders): Orders Console (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);
  it('loads products + recent orders through the real client and renders cleanly', async () => {
    TestBed.configureTestingModule({ imports: [OrdersConsoleModule] });
    const f = TestBed.createComponent(OrdersConsoleDashboardComponent);
    const c = f.componentInstance as unknown as Model;
    f.detectChanges();
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (c.LoadError !== null) break; if (i > 3 && c.IsLoading === false) break; }
    f.detectChanges(); await f.whenStable();
    expect(c.LoadError, `LoadError: ${c.LoadError}`).toBeNull();
    expect((f.nativeElement as HTMLElement).innerHTML.length).toBeGreaterThan(0);
    expect(Array.isArray(c.Products) && Array.isArray(c.RecentOrders), 'products + recent orders loaded').toBe(true);
  });
});

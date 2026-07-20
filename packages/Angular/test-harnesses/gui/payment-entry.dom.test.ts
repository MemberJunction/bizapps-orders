/** TIER 4 (orders) — Payment entry (the create path), real API path.
 *
 *  No dom spec existed for this create surface. This closes that gap. It proves the payment form
 *  renders cleanly (keystone armed → any console.error fails), loads its customer list through the
 *  real client, and the NEW Notes input renders. Payment-application math is covered at tier-1
 *  (payment-application.test) + tier-3 (order-to-je-client P). */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { bootstrapTier4 } from './tier4-bootstrap';
import { OrdersShellModule } from '../../src/lib/custom/shell/shell.module';
import { PaymentEntryPageComponent } from '../../src/lib/custom/shell/pages/payment-entry.page';

interface Model { LoadError: string | null; Customers: unknown[]; }

describe('TIER 4 (orders): Payment entry (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);

  it('renders the payment form + the new Notes input (customers via the real client)', async () => {
    TestBed.configureTestingModule({ imports: [OrdersShellModule] });
    const fixture = TestBed.createComponent(PaymentEntryPageComponent);
    const cmp = fixture.componentInstance as unknown as Model;
    fixture.detectChanges();
    // ngOnInit loads the company scope + customers via the real client; give it time to settle.
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (cmp.LoadError !== null) break; if (i > 6) break; }
    fixture.detectChanges();
    await fixture.whenStable();

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(cmp.LoadError, `LoadError: ${cmp.LoadError}`).toBeNull();
    expect(html.length, 'payment form rendered').toBeGreaterThan(0);
    expect(html.includes('Anything worth recording about this payment'), 'the NEW Notes input renders').toBe(true);
    expect(Array.isArray(cmp.Customers), 'customer list loaded as an array through the real client').toBe(true);
  });
});

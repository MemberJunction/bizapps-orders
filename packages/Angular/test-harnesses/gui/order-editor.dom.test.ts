/** TIER 4 (orders) — Order editor WORKSPACE (the create path), real API path.
 *
 *  No dom spec existed for the create workspace (the suite covered the dashboards). This closes that
 *  gap. It proves the editor renders cleanly (keystone armed → any console.error fails), a new draft
 *  opens on the Lines tab, and the NEW per-line Description input renders. Order money/lifecycle
 *  values are covered at tier-1 (order-draft.test) + tier-3 (order-to-je-client). */
import { describe, it, expect, beforeAll } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { bootstrapTier4 } from './tier4-bootstrap';
import { OrdersShellModule } from '../../src/lib/custom/shell/shell.module';
import { OrderEditorPageComponent } from '../../src/lib/custom/shell/pages/order-editor.page';

interface Model { Draft: unknown | null; ActiveTab: string; }

describe('TIER 4 (orders): Order editor workspace (real API)', () => {
  beforeAll(async () => { await bootstrapTier4(); }, 180000);

  it('renders the editor + the new per-line Description input', async () => {
    TestBed.configureTestingModule({ imports: [OrdersShellModule] });
    const fixture = TestBed.createComponent(OrderEditorPageComponent);
    const cmp = fixture.componentInstance as unknown as Model;
    fixture.detectChanges();
    // init() awaits OrdersEngineBase.Config (real client) then opens a new draft on the Lines tab.
    for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 250)); if (cmp.Draft) break; }
    fixture.detectChanges();
    await fixture.whenStable();

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(cmp.Draft, 'a new order draft opened').not.toBeNull();
    expect(cmp.ActiveTab, 'Lines tab active by default').toBe('lines');
    expect(html.length, 'editor rendered').toBeGreaterThan(0);
    expect(html.includes('Line note (optional)'), 'the NEW per-line Description input renders').toBe(true);
  });
});

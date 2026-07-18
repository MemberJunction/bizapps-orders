/**
 * TIER 4 authoring pattern (copy this shape for real specs). This file is a sample — apps write
 * their own `*.dom.test.ts` next to it. See TEST-ARCHITECTURE.md → Tier 4 for the gotchas.
 *
 * Rules baked into this pattern:
 *  - `bootstrapTier4()` once in `beforeAll` (real GraphQL client → MJAPI).
 *  - Async data goes through a `signal()` (plain fields trip NG0100 under zoneless CD).
 *  - Assert exact values + gating + empty states in the rendered DOM; the keystone (in the setup)
 *    fails the test on any console.error during render.
 *  - For a `BaseDashboard`, provide its `Config`/`ResourceData` input, then assert the rendered data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RunView } from '@memberjunction/core';
import { bootstrapTier4 } from './tier4-bootstrap';

@Component({
  standalone: true,
  selector: 'mjdev-tier4-smoke',
  template: `<div class="count">{{ count() }}</div>`,
})
class SmokeComponent {
  count = signal(-1);
  async load(): Promise<void> {
    const r = await new RunView().RunView({
      EntityName: 'MJ: AI Models',
      MaxRows: 5,
      ResultType: 'simple',
    });
    this.count.set(r.Success ? r.Results.length : -2);
  }
}

describe('tier-4 harness smoke (delete/replace with real app specs)', () => {
  beforeAll(async () => {
    await bootstrapTier4();
  }, 180000);

  it('renders real-API data through the real GraphQL client', async () => {
    const fixture = TestBed.createComponent(SmokeComponent);
    await fixture.componentInstance.load(); // fetch BEFORE first CD
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      Number(fixture.nativeElement.querySelector('.count')?.textContent?.trim())
    ).toBeGreaterThan(0);
  });
});

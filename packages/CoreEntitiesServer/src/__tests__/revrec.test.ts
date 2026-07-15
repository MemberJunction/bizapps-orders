/**
 * revrec.test — the PURE F4 recognition-date waterfall: SingleDate + monthly-anniversary ServicePeriod.
 */
import { describe, it, expect } from 'vitest';
import { computeRecognitionDates } from '@mj-biz-apps/orders-engine-base';

describe('computeRecognitionDates', () => {
  it('SingleDate → one recognition on the event date', () => {
    expect(computeRecognitionDates({ Shape: 'SingleDate', StartDate: new Date('2026-07-15T00:00:00Z'), EventDate: new Date('2026-09-01T00:00:00Z') })).toEqual(['2026-09-01']);
  });

  it('SingleDate defaults the event date to the start date', () => {
    expect(computeRecognitionDates({ Shape: 'SingleDate', StartDate: new Date('2026-07-15T00:00:00Z') })).toEqual(['2026-07-15']);
  });

  it('ServicePeriod → 12 monthly anniversaries for a one-year term (inclusive start month)', () => {
    const dates = computeRecognitionDates({ Shape: 'ServicePeriod', StartDate: new Date('2026-07-13T00:00:00Z'), EndDate: new Date('2027-07-12T00:00:00Z') });
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe('2026-07-13');
    expect(dates[1]).toBe('2026-08-13');
    expect(dates[11]).toBe('2027-06-13');
  });

  it('ServicePeriod clamps the anniversary to short months (Jan 31 → Feb 28)', () => {
    const dates = computeRecognitionDates({ Shape: 'ServicePeriod', StartDate: new Date('2026-01-31T00:00:00Z'), EndDate: new Date('2026-03-31T00:00:00Z') });
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('ServicePeriod with no/short window → at least the start recognition', () => {
    expect(computeRecognitionDates({ Shape: 'ServicePeriod', StartDate: new Date('2026-07-13T00:00:00Z') })).toEqual(['2026-07-13']);
    // end before start → still one recognition
    expect(computeRecognitionDates({ Shape: 'ServicePeriod', StartDate: new Date('2026-07-13T00:00:00Z'), EndDate: new Date('2026-06-01T00:00:00Z') })).toEqual(['2026-07-13']);
  });
});

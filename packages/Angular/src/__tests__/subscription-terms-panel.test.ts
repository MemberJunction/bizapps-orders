import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { SubscriptionTermsPanel } from '../lib/form-panels/subscription-terms.panel';

describe('SubscriptionTermsPanel seat count (#589)', () => {
    const panel = Object.create(SubscriptionTermsPanel.prototype) as SubscriptionTermsPanel;

    it('shows the seats a term covers', () => {
        expect(panel.TermSeats(10)).toBe('10 seats');
        expect(panel.TermSeats(1)).toBe('1 seat');
    });

    it('reads a term with no count as one seat, the column default', () => {
        expect(panel.TermSeats(null)).toBe('1 seat');
    });
});

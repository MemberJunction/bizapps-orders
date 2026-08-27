import { describe, expect, it } from 'vitest';
import {
    CHECKOUT_CAPTURE_RETRY_WINDOW_MS,
    isCaptureRefusalRetryable,
    isTerminalCapturePrecheck,
    webhookEventExceedsRetryWindow,
} from '../checkoutCaptureRetry.js';

describe('isCaptureRefusalRetryable', () => {
    it('retries unclassified and CaptureFailed', () => {
        expect(isCaptureRefusalRetryable([])).toBe(true);
        expect(isCaptureRefusalRetryable(['CaptureFailed'])).toBe(true);
        expect(isCaptureRefusalRetryable(['SomeNewCode'])).toBe(true);
    });

    it('does not retry known business refusals', () => {
        expect(isCaptureRefusalRetryable(['UnknownTender'])).toBe(false);
        expect(isCaptureRefusalRetryable(['BadCompanyID', 'OrderNotFound'])).toBe(false);
    });

    it('retries if any code is not terminal', () => {
        expect(isCaptureRefusalRetryable(['UnknownTender', 'CaptureFailed'])).toBe(true);
    });
});

describe('isTerminalCapturePrecheck', () => {
    it('marks the named pre-checks terminal and everything else retryable', () => {
        expect(isTerminalCapturePrecheck('no bill-to party')).toBe(true);
        expect(isTerminalCapturePrecheck('payment intent not found')).toBe(true);
        expect(isTerminalCapturePrecheck('no context user')).toBe(true);
        expect(isTerminalCapturePrecheck('no metadata provider')).toBe(false);
        expect(isTerminalCapturePrecheck('intent status is RequiresPayment')).toBe(false);
    });
});

describe('webhookEventExceedsRetryWindow', () => {
    const now = Date.parse('2026-08-27T12:00:00Z');

    it('does not stop retries when OccurredAt is missing (bound cannot be applied)', () => {
        expect(webhookEventExceedsRetryWindow({}, now)).toBe(false);
    });

    it('stops retries once the event is older than the window', () => {
        const fresh = new Date(now - 60 * 60 * 1000);
        const stale = new Date(now - CHECKOUT_CAPTURE_RETRY_WINDOW_MS - 1);
        expect(webhookEventExceedsRetryWindow({ OccurredAt: fresh }, now)).toBe(false);
        expect(webhookEventExceedsRetryWindow({ OccurredAt: stale }, now)).toBe(true);
    });
});

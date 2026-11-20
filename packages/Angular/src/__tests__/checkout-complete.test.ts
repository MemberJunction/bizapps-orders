import { describe, expect, it, vi } from 'vitest';
import {
    CHECKOUT_UNREACHABLE_MESSAGE,
    CheckoutTransportError,
    CompleteStillProcessing,
    CompleteWithRetry,
    ReadCheckoutReply,
} from '../lib/checkout-widget/checkout-complete';
import { TurnstileError } from '../lib/checkout-widget/checkout-turnstile';

const GATEWAY_PAGE = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"><HTML><TITLE>504 Gateway Timeout</TITLE></HTML>';

function jsonReply(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

/** A clock the retry loop's sleeps advance, so a two-minute wait runs instantly. */
function fakeClock() {
    let t = 0;
    return {
        now: () => t,
        sleep: vi.fn(async (ms: number) => {
            t += ms;
        }),
    };
}

describe('ReadCheckoutReply', () => {
    it('returns the JSON body with its HTTP status', async () => {
        const reply = await ReadCheckoutReply(jsonReply({ Success: false, ErrorMessage: 'Refused' }, 400));
        expect(reply).toEqual({ Success: false, ErrorMessage: 'Refused', _httpStatus: 400 });
    });

    it('turns a gateway HTML error page into a transport error with a message for the buyer', async () => {
        const res = new Response(GATEWAY_PAGE, { status: 504, headers: { 'Content-Type': 'text/html' } });
        const err = await ReadCheckoutReply(res).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CheckoutTransportError);
        expect((err as CheckoutTransportError).HttpStatus).toBe(504);
        expect((err as Error).message).toBe(CHECKOUT_UNREACHABLE_MESSAGE);
        expect((err as Error).message).not.toMatch(/Unexpected token|DOCTYPE|JSON/);
    });

    it('treats a body that does not parse as a transport error, whatever its content type says', async () => {
        const res = new Response(GATEWAY_PAGE, { status: 502, headers: { 'Content-Type': 'application/json' } });
        await expect(ReadCheckoutReply(res)).rejects.toBeInstanceOf(CheckoutTransportError);
    });
});

describe('CompleteStillProcessing', () => {
    it('is true only for an unsuccessful reply whose session is still Processing', () => {
        expect(CompleteStillProcessing({ Success: false, Status: 'Processing' })).toBe(true);
        expect(CompleteStillProcessing({ Success: true, Status: 'Confirmed' })).toBe(false);
        expect(CompleteStillProcessing({ Success: false, Status: 'Open', ErrorMessage: 'Refused' })).toBe(false);
        expect(CompleteStillProcessing(null)).toBe(false);
    });
});

describe('CompleteWithRetry', () => {
    it('returns the first answer without waiting when the server answers in time', async () => {
        const clock = fakeClock();
        const onWaiting = vi.fn();
        const send = vi.fn(async () => ({ Success: true, Status: 'Confirmed', OrderNumber: 'ORD-1' }));
        const done = await CompleteWithRetry(send, { ...clock, onWaiting });
        expect(done?.OrderNumber).toBe('ORD-1');
        expect(send).toHaveBeenCalledTimes(1);
        expect(onWaiting).not.toHaveBeenCalled();
    });

    it('after a gateway 504, asks again until the replay returns the confirmed order', async () => {
        const clock = fakeClock();
        const onWaiting = vi.fn();
        const send = vi
            .fn<() => Promise<Record<string, unknown>>>()
            .mockRejectedValueOnce(new CheckoutTransportError(504))
            .mockResolvedValueOnce({ Success: false, Status: 'Processing', ErrorMessage: 'Session is not in an Open status' })
            .mockResolvedValueOnce({ Success: true, Status: 'Confirmed', OrderNumber: 'ORD-2' });
        const done = await CompleteWithRetry(send, { ...clock, onWaiting, intervalMs: 3000 });
        expect(done).toEqual({ Success: true, Status: 'Confirmed', OrderNumber: 'ORD-2' });
        expect(send).toHaveBeenCalledTimes(3);
        expect(onWaiting).toHaveBeenCalledTimes(1);
        expect(clock.sleep).toHaveBeenCalledWith(3000);
    });

    it('asks again when no reply arrives at all', async () => {
        const clock = fakeClock();
        const send = vi
            .fn<() => Promise<Record<string, unknown>>>()
            .mockRejectedValueOnce(new CheckoutTransportError(null))
            .mockResolvedValueOnce({ Success: true, Status: 'Confirmed' });
        await expect(CompleteWithRetry(send, clock)).resolves.toEqual({ Success: true, Status: 'Confirmed' });
    });

    it('returns a refusal from the server as it is, so the buyer sees its message', async () => {
        const clock = fakeClock();
        const refusal = { Success: false, Status: 'Open', ErrorMessage: 'The settled payment amount does not cover the order total' };
        const send = vi.fn(async () => refusal);
        await expect(CompleteWithRetry(send, clock)).resolves.toBe(refusal);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('resolves null once the wait runs out, after asking on every interval', async () => {
        const clock = fakeClock();
        const send = vi.fn(async () => ({ Success: false, Status: 'Processing' }));
        const done = await CompleteWithRetry(send, { ...clock, intervalMs: 3000, timeoutMs: 120000 });
        expect(done).toBeNull();
        expect(send).toHaveBeenCalledTimes(41);
    });

    it('does not retry other failures, such as human verification', async () => {
        const clock = fakeClock();
        const send = vi.fn(async () => {
            throw new TurnstileError('Human verification failed. Please try again.');
        });
        await expect(CompleteWithRetry(send, clock)).rejects.toBeInstanceOf(TurnstileError);
        expect(send).toHaveBeenCalledTimes(1);
    });
});

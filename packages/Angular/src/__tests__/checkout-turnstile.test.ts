import { describe, expect, it, vi } from 'vitest';
import { PostWithTurnstile, TurnstileChallengeSiteKey, type TurnstileState } from '../lib/checkout-widget/checkout-turnstile';

const challenge = { Success: false, _httpStatus: 403, TurnstileRequired: true, TurnstileSiteKey: 'site-key-1' };

describe('TurnstileChallengeSiteKey (#592)', () => {
    it('reads the site key from a Turnstile refusal only', () => {
        expect(TurnstileChallengeSiteKey(challenge)).toBe('site-key-1');
        expect(TurnstileChallengeSiteKey({ ...challenge, _httpStatus: 503 })).toBeNull();
        expect(TurnstileChallengeSiteKey({ Success: false, _httpStatus: 403, ErrorMessage: 'Origin not allowed.' })).toBeNull();
        expect(TurnstileChallengeSiteKey({ ...challenge, TurnstileSiteKey: '' })).toBeNull();
        expect(TurnstileChallengeSiteKey(null)).toBeNull();
    });
});

describe('PostWithTurnstile (#592)', () => {
    it('sends no token to a widget that does not ask for one', async () => {
        const post = vi.fn(async () => ({ Success: true, _httpStatus: 200 }));
        const getToken = vi.fn(async () => 'tok');
        const reply = await PostWithTurnstile(post, '/initialize', { slug: 's' }, getToken, { siteKey: null });
        expect(reply.Success).toBe(true);
        expect(post).toHaveBeenCalledOnce();
        expect(getToken).not.toHaveBeenCalled();
    });

    it('answers a refusal by getting a token for the named site key and retrying once', async () => {
        const post = vi.fn()
            .mockResolvedValueOnce(challenge)
            .mockResolvedValueOnce({ Success: true, _httpStatus: 200 });
        const getToken = vi.fn(async () => 'tok-1');
        const state: TurnstileState = { siteKey: null };
        const reply = await PostWithTurnstile(post, '/initialize', { slug: 's' }, getToken, state);
        expect(reply.Success).toBe(true);
        expect(getToken).toHaveBeenCalledWith('site-key-1');
        expect(post.mock.calls[1]).toEqual(['/initialize', { slug: 's', turnstileToken: 'tok-1' }]);
        expect(state.siteKey).toBe('site-key-1');
    });

    it('sends a fresh token up front once the site key is known', async () => {
        const post = vi.fn(async () => ({ Success: true, _httpStatus: 200 }));
        const getToken = vi.fn(async () => 'tok-2');
        await PostWithTurnstile(post, '/complete', { sessionId: 'x' }, getToken, { siteKey: 'site-key-1' });
        expect(post).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith('/complete', { sessionId: 'x', turnstileToken: 'tok-2' });
    });

    it('returns a second refusal to the caller instead of looping', async () => {
        const post = vi.fn(async () => challenge);
        const getToken = vi.fn(async () => 'tok');
        const reply = await PostWithTurnstile(post, '/complete', { sessionId: 'x' }, getToken, { siteKey: 'site-key-1' });
        expect(reply).toBe(challenge);
        expect(post).toHaveBeenCalledTimes(2);
    });
});

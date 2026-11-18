import { describe, expect, it } from 'vitest';
import { BaseEntity, ValidationResult, type RunViewParams } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { mjBizAppsOrdersSubscriptionTypeEntity } from '@mj-biz-apps/orders-entities';
import {
    SUBSCRIPTION_ENTITY,
    SUBSCRIPTION_TERM_ENTITY,
    SUBSCRIPTION_TYPE_ENTITY,
    SubscriptionTypeEntityServer,
} from '../SubscriptionTypeEntityServer.js';

const TYPE_ID = 'c5e1a870-9b24-4d63-8e17-5a6b7c8d9e03';
const SUB_ID = 'a1b2c3d4-9b24-4d63-8e17-5a6b7c8d9e01';
const TERM_ID = 'b2c3d4e5-9b24-4d63-8e17-5a6b7c8d9e02';

function makeSubject(opts: {
    isSaved: boolean;
    cadenceDirty: boolean;
    subscriptions?: { ID: string }[];
    terms?: { ID: string }[];
}): { subject: SubscriptionTypeEntityServer; calls: RunViewParams[] } {
    const calls: RunViewParams[] = [];
    const provider = {
        RunView: async (params: RunViewParams) => {
            calls.push(params);
            if (params.EntityName === SUBSCRIPTION_ENTITY) {
                return { Success: true, Results: opts.subscriptions ?? [] };
            }
            if (params.EntityName === SUBSCRIPTION_TERM_ENTITY) {
                return { Success: true, Results: opts.terms ?? [] };
            }
            return { Success: true, Results: [] };
        },
    };
    const subject = Object.create(SubscriptionTypeEntityServer.prototype) as SubscriptionTypeEntityServer;
    Object.defineProperty(subject, 'IsSaved', { get: () => opts.isSaved });
    Object.defineProperty(subject, 'ID', { get: () => TYPE_ID });
    Object.defineProperty(subject, 'RecognitionCadence', { get: () => 'Monthly' });
    Object.defineProperty(subject, 'ProviderToUse', { get: () => provider });
    Object.defineProperty(subject, 'ContextCurrentUser', { get: () => ({ ID: 'u-1' }) });
    Object.defineProperty(subject, 'GetFieldByName', {
        value: (name: string) => (name === 'RecognitionCadence' ? { Dirty: opts.cadenceDirty } : { Dirty: false }),
    });
    // Stub BaseEntity.ValidateAsync so the unit test does not need an initialized Metadata provider.
    Object.defineProperty(BaseEntity.prototype, 'ValidateAsync', {
        value: async () => {
            const vr = new ValidationResult();
            vr.Success = true;
            return vr;
        },
        configurable: true,
    });
    return { subject, calls };
}

describe('SubscriptionTypeEntityServer (#809)', () => {
    it('extends mjBizAppsOrdersSubscriptionTypeEntity and wins the ClassFactory registration', () => {
        expect(SubscriptionTypeEntityServer.prototype).toBeInstanceOf(mjBizAppsOrdersSubscriptionTypeEntity);
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, SUBSCRIPTION_TYPE_ENTITY);
        expect(registration?.SubClass).toBe(SubscriptionTypeEntityServer);
        expect(SubscriptionTypeEntityServer.prototype.DefaultSkipAsyncValidation).toBe(false);
    });

    it('refuses a RecognitionCadence change when the subscription type has booked terms', async () => {
        const { subject, calls } = makeSubject({
            isSaved: true,
            cadenceDirty: true,
            subscriptions: [{ ID: SUB_ID }],
            terms: [{ ID: TERM_ID }],
        });

        const result = await subject.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('RecognitionCadence');
        expect(result.Errors[0].Message).toMatch(/booked subscription terms/i);
        expect(calls).toHaveLength(2);
    });

    it('allows a RecognitionCadence change when the subscription type has no booked terms', async () => {
        const noSubs = makeSubject({
            isSaved: true,
            cadenceDirty: true,
            subscriptions: [],
            terms: [],
        });
        const res1 = await noSubs.subject.ValidateAsync();
        expect(res1.Success).toBe(true);
        expect(noSubs.calls).toHaveLength(1);

        const subsWithoutTerms = makeSubject({
            isSaved: true,
            cadenceDirty: true,
            subscriptions: [{ ID: SUB_ID }],
            terms: [],
        });
        const res2 = await subsWithoutTerms.subject.ValidateAsync();
        expect(res2.Success).toBe(true);
        expect(subsWithoutTerms.calls).toHaveLength(2);
    });

    it('skips the term lookup when the record is unsaved or RecognitionCadence is not dirty', async () => {
        const unsaved = makeSubject({
            isSaved: false,
            cadenceDirty: true,
            subscriptions: [{ ID: SUB_ID }],
            terms: [{ ID: TERM_ID }],
        });
        expect((await unsaved.subject.ValidateAsync()).Success).toBe(true);
        expect(unsaved.calls).toHaveLength(0);

        const cleanCadence = makeSubject({
            isSaved: true,
            cadenceDirty: false,
            subscriptions: [{ ID: SUB_ID }],
            terms: [{ ID: TERM_ID }],
        });
        expect((await cleanCadence.subject.ValidateAsync()).Success).toBe(true);
        expect(cleanCadence.calls).toHaveLength(0);
    });
});

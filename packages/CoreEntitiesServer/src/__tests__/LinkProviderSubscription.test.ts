/**
 * LinkProviderSubscription with a fake provider: every ownership check refuses before anything is locked or written,
 * the plan must be the subscription's product, and the elsewhere check and the write run under locks so two links
 * cannot both pass.
 *
 * The sanction is NOT mocked away (#989 review): the entity the link saves is a real `SubscriptionEntityServer`
 * instance whose save succeeds only when the real module-private sanction was granted on it, so a link that forgets
 * `SanctionProviderBilledChange` fails here the way the shared entity refuses it in the database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
    [key: string]: unknown;
}

const SUB = '33333333-0000-4000-8000-000000000001';
const ACCT = '33333333-0000-4000-8000-0000000000a1';
const OTHER_ACCT = '33333333-0000-4000-8000-0000000000a2';
const PERSON = '33333333-0000-4000-8000-0000000000b1';

const baseSub = (): Row => ({
    ID: SUB,
    SubscriptionNumber: 'SUB-000110',
    CompanyID: 'co-1',
    PaymentProviderID: null,
    ProviderSubscriptionID: null,
    BeneficiaryPersonID: PERSON,
    HolderOrganizationID: null,
    ProductID: 'prod-pro',
});

const state = vi.hoisted(() => ({
    sub: {} as Row,
    mapped: [{ ProductID: 'prod-pro' }] as Row[],
    elsewhere: [] as Row[],
    personEmail: 'jane@example.com' as string | null,
    described: {} as Row,
    config: {} as Row,
    takenUnderLock: [] as Row[],
    log: [] as string[],
    sql: [] as string[],
    saved: 0,
    synced: 0,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string }) {
                if (p.EntityName.endsWith('Payment Provider Prices')) return { Success: true, Results: state.mapped };
                if (p.EntityName.endsWith('Subscriptions') && /ProviderSubscriptionID = /.test(p.ExtraFilter ?? '')) return { Success: true, Results: state.elsewhere };
                if (p.EntityName.endsWith('Subscriptions')) return { Success: true, Results: [{ ...state.sub }] };
                if (p.EntityName.endsWith('People') || p.EntityName.endsWith('Persons')) {
                    return { Success: true, Results: [{ ID: PERSON, Email: state.personEmail }] };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});
vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: async () => ({ ...state.config }),
    BuildPaymentProvider: async () => ({
        DescribeProviderSubscription: async () => ({ ...state.described }),
    }),
}));
vi.mock('../isolatedProvider.js', () => ({ WithIsolatedProvider: (fn: (p: unknown) => unknown, shared: unknown) => fn(shared) }));
vi.mock('../ProviderSubscriptionSync.js', () => ({
    SyncProviderSubscription: async () => {
        state.synced++;
        return { Outcome: 'InLine', Actions: [], Notices: [], Differences: [] };
    },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { PERSON_ENTITY } from '../entity-names.js';
import { LinkProviderSubscription } from '../LinkProviderSubscription.js';
import { SubscriptionEntityServer } from '../SubscriptionEntityServer.js';

/** A real server-subclass instance (no DB): its save succeeds only if the real sanction was granted on it. */
function sanctionCheckingEntity(): object {
    const entity = Object.create(SubscriptionEntityServer.prototype) as Row;
    Object.defineProperty(entity, 'Save', {
        value: async function (this: { ProviderBilledChangeSanctioned(): boolean }) {
            state.log.push('SAVE');
            if (!this.ProviderBilledChangeSanctioned()) return false;
            state.saved++;
            return true;
        },
    });
    Object.defineProperty(entity, 'LatestResult', { value: { CompleteMessage: 'refused: an unsanctioned link' } });
    for (const f of ['PaymentProviderID', 'ProviderSubscriptionID']) Object.defineProperty(entity, f, { writable: true, value: null });
    return entity;
}

const provider = {
    BeginTransaction: async () => void state.log.push('BEGIN'),
    CommitTransaction: async () => void state.log.push('COMMIT'),
    RollbackTransaction: async () => void state.log.push('ROLLBACK'),
    ExecuteSQL: async (q: string) => {
        state.sql.push(q);
        if (/UPDLOCK, HOLDLOCK/.test(q)) {
            state.log.push('LOCK gateway id');
            return state.takenUnderLock;
        }
        state.log.push('LOCK own row');
        return [{ ID: SUB }];
    },
    GetEntityObject: async () => sanctionCheckingEntity(),
} as unknown as IMetadataProvider;
const user = {} as UserInfo;
const link = (over: Row = {}) => LinkProviderSubscription({ SubscriptionID: SUB, PaymentProviderID: ACCT, ProviderSubscriptionID: 'sub_x', ...over } as never, provider, user);
/** Refused before anything was locked, written or synced. */
const nothingDone = () => {
    expect(state.log).toEqual([]);
    expect(state.saved).toBe(0);
    expect(state.synced).toBe(0);
};

beforeEach(() => {
    state.sub = baseSub();
    state.mapped = [{ ProductID: 'prod-pro' }];
    state.elsewhere = [];
    state.personEmail = 'jane@example.com';
    state.described = { Success: true, State: 'Renewing', Status: 'active', ProviderPriceID: 'price_pro', CustomerEmail: 'Jane@Example.com', Metadata: {} };
    state.config = { ID: ACCT, Name: 'Stripe', CompanyID: 'CO-1', Capabilities: { SupportsSubscriptionBilling: true } };
    state.takenUnderLock = [];
    state.log = [];
    state.sql = [];
    state.saved = 0;
    state.synced = 0;
});

describe('LinkProviderSubscription', () => {
    it('the person read is the PERSON entity (the e-mail check reads the right table)', () => {
        expect(PERSON_ENTITY.endsWith('People') || PERSON_ENTITY.endsWith('Persons')).toBe(true);
    });
    it('links under locks: the gateway id range and the own row locked, THEN saved (sanctioned), committed, then synced', async () => {
        const out = await link();
        expect(out.Code, out.Message).toBe('Linked');
        expect(state.log).toEqual(['BEGIN', 'LOCK gateway id', 'LOCK own row', 'SAVE', 'COMMIT']);
        expect(state.saved).toBe(1);
        expect(state.synced).toBe(1);
    });
    it('the harness is honest: the fake save consults the REAL sanction (refused before it is granted, accepted after)', async () => {
        const sanction = await import('../SubscriptionEntityServer.js');
        // Same check, an entity whose sanction was never granted: what a link that skipped the sanction would save.
        const bare = sanctionCheckingEntity() as { Save(): Promise<boolean> };
        expect(await bare.Save()).toBe(false);
        sanction.SanctionProviderBilledChange(bare as never);
        expect(await bare.Save()).toBe(true);
    });
    it('the own-row lock refuses a row that meanwhile names ANOTHER payment provider', async () => {
        await link();
        const own = state.sql.find((q) => /UPDLOCK, ROWLOCK/.test(q))!;
        expect(own).toMatch(/ProviderSubscriptionID IS NULL AND \(PaymentProviderID IS NULL OR PaymentProviderID = '33333333-0000-4000-8000-0000000000a1'\)/);
    });
    it('another link recorded the id while this one waited: LinkedElsewhere, rolled back, nothing saved', async () => {
        state.takenUnderLock = [{ ID: 'other' }];
        const out = await link();
        expect(out.Code).toBe('LinkedElsewhere');
        expect(state.log).toContain('ROLLBACK');
        expect(state.saved).toBe(0);
    });

    describe('every refusal happens before anything is locked or written', () => {
        it('AlreadyLinked: the subscription already records a gateway id (never replaced)', async () => {
            state.sub.ProviderSubscriptionID = 'sub_old';
            const out = await link();
            expect(out.Code).toBe('AlreadyLinked');
            expect(out.Message).toMatch(/sub_old/);
            nothingDone();
        });
        it('OtherProvider: the subscription already names a different payment provider (never overwritten)', async () => {
            state.sub.PaymentProviderID = OTHER_ACCT;
            const out = await link();
            expect(out.Code).toBe('OtherProvider');
            nothingDone();
        });
        it('control: the subscription already names THIS provider (no gateway id yet): linked', async () => {
            state.sub.PaymentProviderID = ACCT.toUpperCase();
            expect((await link()).Code).toBe('Linked');
        });
        it('ProviderCannotBill: the account cannot bill subscriptions', async () => {
            state.config.Capabilities = { SupportsSubscriptionBilling: false };
            expect((await link()).Code).toBe('ProviderCannotBill');
            nothingDone();
        });
        it('CompanyMismatch: the account is another company\'s', async () => {
            state.config.CompanyID = 'co-2';
            const out = await link();
            expect(out.Code).toBe('CompanyMismatch');
            nothingDone();
        });
        it('NotAtGateway: the gateway has no such subscription', async () => {
            state.described = { Success: false, Reason: 'No such subscription' };
            expect((await link()).Code).toBe('NotAtGateway');
            nothingDone();
        });
        it('EndedAtGateway: the gateway subscription has ended', async () => {
            state.described = { ...state.described, State: 'Ended', Status: 'canceled' };
            const out = await link();
            expect(out.Code).toBe('EndedAtGateway');
            nothingDone();
        });
        it('control: Ending (cancel at period end) still bills this period: linked', async () => {
            state.described = { ...state.described, State: 'Ending' };
            expect((await link()).Code).toBe('Linked');
        });
        it('LinkedElsewhere, before the lock: another Orders subscription records it', async () => {
            state.elsewhere = [{ ID: 'other', SubscriptionNumber: 'SUB-000999' }];
            const out = await link();
            expect(out.Code).toBe('LinkedElsewhere');
            expect(out.Message).toMatch(/SUB-000999/);
            nothingDone();
        });
        it('CreatedForAnother: Orders created it for another subscription (its OrdersSubscriptionID metadata)', async () => {
            state.described = { ...state.described, Metadata: { OrdersSubscriptionID: '33333333-0000-4000-8000-000000000777' } };
            const out = await link();
            expect(out.Code).toBe('CreatedForAnother');
            nothingDone();
        });
        it('control: the metadata names THIS subscription (any case): linked', async () => {
            const lettered = 'abcdef00-0000-4000-8000-00000000000a';
            state.sub.ID = lettered;
            state.described = { ...state.described, Metadata: { OrdersSubscriptionID: lettered.toUpperCase() } };
            expect((await link({ SubscriptionID: lettered })).Code).toBe('Linked');
        });
        it('EmailMismatch: the gateway customer is someone else', async () => {
            state.described = { ...state.described, CustomerEmail: 'bob@example.com' };
            const out = await link();
            expect(out.Code).toBe('EmailMismatch');
            nothingDone();
        });
        it('EmailMismatch is never overridden by CustomerConfirmed', async () => {
            state.described = { ...state.described, CustomerEmail: 'bob@example.com' };
            expect((await link({ CustomerConfirmed: true })).Code).toBe('EmailMismatch');
            nothingDone();
        });
        it.each([
            ['the gateway customer has no e-mail', () => (state.described = { ...state.described, CustomerEmail: null }), /gateway customer has no e-mail/],
            ['the subscriber has no e-mail', () => (state.personEmail = null), /subscriber has no e-mail/],
            ['the subscription has no beneficiary', () => (state.sub.BeneficiaryPersonID = null), /names no subscriber/],
            [
                'an organization holds it and names no beneficiary',
                () => Object.assign(state.sub, { HolderOrganizationID: 'org-1', BeneficiaryPersonID: null }),
                /names no subscriber \(an organization holds it\)/,
            ],
        ])('CustomerUnverified when %s: never skipped silently', async (_l, arrange, why) => {
            arrange();
            const out = await link();
            expect(out.Code).toBe('CustomerUnverified');
            expect(out.Message).toMatch(why);
            expect(out.Message).toMatch(/CustomerConfirmed/);
            nothingDone();
        });
        it('control: the same, confirmed by a person (CustomerConfirmed): linked', async () => {
            Object.assign(state.sub, { HolderOrganizationID: 'org-1', BeneficiaryPersonID: null });
            expect((await link({ CustomerConfirmed: true })).Code).toBe('Linked');
        });
        it('an organization-held subscription whose beneficiary e-mail MATCHES: linked without a confirmation (evidence)', async () => {
            state.sub.HolderOrganizationID = 'org-1';
            expect((await link()).Code).toBe('Linked');
        });
        it('an organization-held subscription whose beneficiary e-mail differs: EmailMismatch, not confirmable', async () => {
            state.sub.HolderOrganizationID = 'org-1';
            state.described = { ...state.described, CustomerEmail: 'billing@acme.example' };
            expect((await link({ CustomerConfirmed: true })).Code).toBe('EmailMismatch');
        });
        it("PriceForAnotherProduct: the gateway bills a price mapped to ANOTHER product, and the message names the parameter that exists", async () => {
            state.mapped = [{ ProductID: 'prod-foundation' }];
            const out = await link();
            expect(out.Code).toBe('PriceForAnotherProduct');
            expect(out.Message).toMatch(/AllowPriceOfAnotherProduct/);
            nothingDone();
        });
        it('a price mapped to no product: refused too', async () => {
            state.mapped = [];
            expect((await link()).Code).toBe('PriceForAnotherProduct');
        });
        it('confirmed by a person (an imported subscriber on an older price): linked', async () => {
            state.mapped = [{ ProductID: 'prod-foundation' }];
            expect((await link({ AllowPriceOfAnotherProduct: true })).Code).toBe('Linked');
        });
    });

    it('Preview: every check runs, nothing is locked, saved or synced', async () => {
        const out = await link({ Preview: true });
        expect(out.Code).toBe('WouldLink');
        expect(out.Success).toBe(true);
        nothingDone();
    });
    it('Preview still refuses what a link would refuse', async () => {
        state.described = { ...state.described, CustomerEmail: 'bob@example.com' };
        expect((await link({ Preview: true })).Code).toBe('EmailMismatch');
    });
});

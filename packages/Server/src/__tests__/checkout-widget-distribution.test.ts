/**
 * Unit tests for CheckoutWidgetDistributionEntityServer — slug normalization, anonymous-invite
 * minting (config-gated + authorization-gated), revocation pairing, and the golden-vector pin
 * that keeps our local token hash byte-compatible with MJ's `hashToken`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => {
    const inviteSave = vi.fn().mockResolvedValue(true);
    const inviteLoad = vi.fn().mockResolvedValue(true);
    class MockInvite {
        ID = 'invite-1';
        TokenHash = '';
        Email: string | null = 'preset@should-be-cleared';
        ApplicationID = '';
        RoleID = '';
        ExpiresAt: Date | null = null;
        MaxUses = 0;
        UseCount = -1;
        CreatedByUserID = '';
        Status = '';
        IdentityMode = '';
        Kind = '';
        LatestResult = { CompleteMessage: '' };
        NewRecord = vi.fn();
        Load = inviteLoad;
        Save = inviteSave;
    }

    const widgetLoad = vi.fn().mockResolvedValue(true);
    class MockWidget {
        ID = 'widget-1';
        Name = 'Summit Widget';
        Configuration: string | null = null;
        Load = widgetLoad;
    }

    class MockDistributionBase {
        ID = 'dist-1';
        CheckoutWidgetID = 'widget-1';
        Slug: string | null = null;
        MagicLinkInviteID: string | null = null;
        Status: 'Active' | 'Revoked' = 'Active';
        RevokedAt: Date | null = null;
        RevocationReason: string | null = null;
        EmbedSnippet: string | null = null;
        IsSaved = false;
        ContextCurrentUser: unknown = null;
        LatestResult = { CompleteMessage: '' };
        statusDirty = false;
        baseSave = vi.fn().mockResolvedValue(true);
        widgetInstance = new MockWidget();
        inviteInstance = new MockInvite();
        ProviderToUse = {
            GetEntityObject: vi.fn(async (name: string) => {
                if (name.includes('Checkout Widgets')) return this.widgetInstance;
                if (name.includes('Magic Link Invites')) return this.inviteInstance;
                throw new Error(`Unexpected entity: ${name}`);
            }),
        };
        GetFieldByName(name: string) {
            return name === 'Status' ? { Dirty: this.statusDirty } : { Dirty: false };
        }
        Save(..._args: unknown[]): Promise<boolean> {
            return this.baseSave();
        }
    }

    return { MockDistributionBase, MockWidget, MockInvite, inviteSave, inviteLoad, widgetLoad };
});

vi.mock('@mj-biz-apps/orders-entities', () => ({
    mjBizAppsOrdersCheckoutWidgetDistributionEntity: mocks.MockDistributionBase,
    mjBizAppsOrdersCheckoutWidgetEntity: mocks.MockWidget,
}));

// The entity server imports only EscapeText from the CES barrel; mock it so the test does not
// drag the entire package (whose other modules re-import the mocked orders-entities above).
vi.mock('@mj-biz-apps/orders-core-entities-server', () => ({
    EscapeText: (value: string) => String(value).replace(/'/g, "''"),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = vi.fn(async (params: { EntityName: string; ExtraFilter: string }) => {
                if (params.EntityName === 'MJ: Applications' && params.ExtraFilter.includes('Portal')) {
                    return { Success: true, Results: [{ ID: 'app-1' }] };
                }
                if (params.EntityName === 'MJ: Roles' && params.ExtraFilter.includes('Checkout Guest')) {
                    return { Success: true, Results: [{ ID: 'role-1' }] };
                }
                return { Success: true, Results: [] };
            });
        },
    };
});

import {
    CheckoutWidgetDistributionEntityServer,
    HashMagicLinkToken,
    MAGIC_LINK_TOKEN_PREFIX,
} from '../custom/CheckoutWidgetDistributionEntityServer.js';

const ownerUser = { ID: 'user-1', Email: 'owner@example.com', Type: 'Owner', UserRoles: [] } as unknown as UserInfo;
const plainUser = {
    ID: 'user-2', Email: 'staff@example.com', Type: 'User',
    UserRoles: [{ Role: 'Sales Ops', RoleID: 'r-9' }],
} as unknown as UserInfo;

const MAGIC_CONFIG = JSON.stringify({
    magicLink: { applicationName: 'Portal', roleName: 'Checkout Guest' },
});

function makeDistribution(user: UserInfo = ownerUser): CheckoutWidgetDistributionEntityServer {
    const dist = new CheckoutWidgetDistributionEntityServer() as unknown as CheckoutWidgetDistributionEntityServer &
        InstanceType<typeof mocks.MockDistributionBase>;
    dist.ContextCurrentUser = user;
    dist.Slug = 'summit-2026';
    return dist;
}

describe('HashMagicLinkToken (MJ hashToken compatibility pin)', () => {
    it('matches MJ magicLinkCore.hashToken byte-for-byte on golden vectors', () => {
        // Vectors computed as sha256(raw).base64url — the documented (and read-at-pin verified)
        // implementation of @memberjunction/server's hashToken. If MJ ever changes its encoding,
        // this pin fails BEFORE a minted invite silently stops redeeming.
        expect(HashMagicLinkToken('mj_ml_pin-test-vector-001')).toBe('Ui2yE-KIzTmf23SRR4SW4aoOIFBNZnO6NNdUdv9Rjp0');
        expect(HashMagicLinkToken('mj_ml_abc123')).toBe('F6KnoZIc937fSCV68CRKak15fGkP1vMt87d1k9_x1Og');
    });

    it('uses the mj_ml_ prefix MJ redemption requires before it will even hash a token', () => {
        expect(MAGIC_LINK_TOKEN_PREFIX).toBe('mj_ml_');
    });
});

describe('CheckoutWidgetDistributionEntityServer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.inviteSave.mockResolvedValue(true);
        mocks.widgetLoad.mockResolvedValue(true);
    });

    it('normalizes the slug and refuses URL-unsafe ones', async () => {
        const dist = makeDistribution();
        dist.Slug = '  Summit-2026 ';
        expect(await dist.Save()).toBe(true);
        expect(dist.Slug).toBe('summit-2026');

        const bad = makeDistribution();
        bad.Slug = 'bad slug!';
        expect(await bad.Save()).toBe(false);
    });

    it('mints a fully-shaped anonymous invite on create when the widget config asks for one', async () => {
        const dist = makeDistribution(ownerUser);
        dist.widgetInstance.Configuration = MAGIC_CONFIG;

        expect(await dist.Save()).toBe(true);

        const invite = dist.inviteInstance;
        expect(invite.NewRecord).toHaveBeenCalled();
        expect(invite.IdentityMode).toBe('anonymous');
        expect(invite.Kind).toBe('anonymous-embed'); // NOT NULL, no DB default — must be explicit
        expect(invite.Email).toBeNull(); // legal only because IdentityMode='anonymous'
        expect(invite.ApplicationID).toBe('app-1');
        expect(invite.RoleID).toBe('role-1');
        expect(invite.Status).toBe('Active');
        expect(invite.UseCount).toBe(0);
        expect(invite.MaxUses).toBeGreaterThan(1); // multi-use by design
        expect(invite.CreatedByUserID).toBe('user-1');
        expect(invite.ExpiresAt!.getTime()).toBeGreaterThan(Date.now());
        expect(invite.TokenHash).toMatch(/^[A-Za-z0-9_-]{43}$/); // base64url sha256, never the raw token

        expect(dist.MagicLinkInviteID).toBe('invite-1');
        // The raw token surfaces exactly once, in the embed snippet
        expect(dist.EmbedSnippet).toContain('data-checkout-slug="summit-2026"');
        expect(dist.EmbedSnippet).toContain('data-checkout-token="mj_ml_');
    });

    it('creates a slug-only distribution (no invite) when the config has no magicLink block', async () => {
        const dist = makeDistribution(ownerUser);
        dist.widgetInstance.Configuration = JSON.stringify({ productId: 'prod-1' });

        expect(await dist.Save()).toBe(true);
        expect(dist.MagicLinkInviteID).toBeNull();
        expect(dist.inviteInstance.NewRecord).not.toHaveBeenCalled();
        expect(dist.EmbedSnippet).toContain('data-checkout-slug="summit-2026"');
        expect(dist.EmbedSnippet).not.toContain('data-checkout-token');
    });

    it('refuses to mint for a non-Owner user whose roles are not in issuerRoleNames', async () => {
        const dist = makeDistribution(plainUser);
        dist.widgetInstance.Configuration = MAGIC_CONFIG;
        expect(await dist.Save()).toBe(false);
        expect(dist.inviteInstance.NewRecord).not.toHaveBeenCalled();
    });

    it('allows a non-Owner user whose role IS listed in issuerRoleNames', async () => {
        const dist = makeDistribution(plainUser);
        dist.widgetInstance.Configuration = JSON.stringify({
            magicLink: { applicationName: 'Portal', roleName: 'Checkout Guest', issuerRoleNames: ['sales ops'] },
        });
        expect(await dist.Save()).toBe(true);
        expect(dist.MagicLinkInviteID).toBe('invite-1');
    });

    it('fails the save when the invite itself cannot be written — no half-wired distribution', async () => {
        mocks.inviteSave.mockResolvedValue(false);
        const dist = makeDistribution(ownerUser);
        dist.widgetInstance.Configuration = MAGIC_CONFIG;
        expect(await dist.Save()).toBe(false);
    });

    it('stamps RevokedAt and revokes the linked invite when Status flips to Revoked', async () => {
        const dist = makeDistribution(ownerUser);
        dist.IsSaved = true;
        dist.MagicLinkInviteID = 'invite-1';
        dist.Status = 'Revoked';
        dist.statusDirty = true;
        dist.inviteInstance.Status = 'Active';

        expect(await dist.Save()).toBe(true);
        expect(dist.RevokedAt).toBeInstanceOf(Date);
        expect(dist.inviteInstance.Status).toBe('Revoked');
        expect(mocks.inviteSave).toHaveBeenCalled();
    });

    it('clears the revocation stamps when a distribution is reactivated, without resurrecting the invite', async () => {
        const dist = makeDistribution(ownerUser);
        dist.IsSaved = true;
        dist.MagicLinkInviteID = 'invite-1';
        dist.Status = 'Active';
        dist.statusDirty = true;
        dist.RevokedAt = new Date();
        dist.RevocationReason = 'oops';
        dist.inviteInstance.Status = 'Revoked';

        expect(await dist.Save()).toBe(true);
        expect(dist.RevokedAt).toBeNull();
        expect(dist.RevocationReason).toBeNull();
        expect(dist.inviteInstance.Status).toBe('Revoked'); // stays revoked, by design
    });
});

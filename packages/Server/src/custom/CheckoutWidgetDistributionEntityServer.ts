/**
 * CheckoutWidgetDistributionEntityServer — the invariants a distribution row cannot keep by itself.
 *
 * A `CheckoutWidgetDistribution` is a PUBLIC door: a vanity slug (the checkout edge's access
 * control) and, optionally, an anonymous magic-link invite (`MagicLinkInviteID`) for embed-auth
 * surfaces. The generated entity enforces none of the lifecycle around that door, so this subclass
 * does — in `Save()`, where every path (Explorer, API, an agent) converges:
 *
 *   • SLUG NORMALIZATION. Lowercased, trimmed, URL-safe charset — `InitializeSession` escapes at
 *     read time but nothing constrained what got written.
 *   • INVITE MINTING ON CREATE. When the widget's Configuration carries a `magicLink` block
 *     (applicationName + roleName), a multi-use ANONYMOUS invite is minted and linked before the
 *     row first saves, so a distribution never exists half-wired. The mint writes the
 *     `MJ: Magic Link Invites` row directly — MJ's `CreateInvite` cannot author the
 *     anonymous-embed shape (it never sets IdentityMode/Kind) — which is exactly why the
 *     authorization gate below exists: a direct insert bypasses MJ's `canIssueInvites`, so this
 *     class applies the equivalent (Owner, or a role listed in `magicLink.issuerRoleNames`).
 *     RoleID/ApplicationID resolve from the ADMIN-AUTHORED Configuration by name — never from
 *     anything a caller supplies.
 *   • REVOCATION PAIRING. Status → 'Revoked' stamps RevokedAt and REVOKES THE LINKED INVITE —
 *     without this, a "revoked" distribution's magic link kept redeeming (the widget path was
 *     closed by the Status filter; the raw link was not). Status back to 'Active' clears the
 *     stamps but deliberately does NOT resurrect the invite: a revoked credential stays revoked;
 *     re-create the distribution to mint a fresh one.
 *   • EMBED SNIPPET. Generated from the slug when absent, so the admin has copy-paste output.
 *
 * WHY THIS FILE LIVES IN packages/Server (not CoreEntitiesServer, where entity servers usually
 * go): minting needs Node's crypto (randomBytes + sha256), and CoreEntitiesServer's tsconfig
 * deliberately has no Node globals (`types: []`). The token hash re-implements MJ's `hashToken`
 * (sha256 → base64url) because the pinned `@memberjunction/server` does not export its magicLink
 * module; a golden-vector test pins the compatibility.
 */
import { createHash, randomBytes } from 'node:crypto';
import { BaseEntity, EntitySaveOptions, IMetadataProvider, IRunViewProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
// EscapeText, not @memberjunction/global's EscapeSQLString: the latter is a LINKED-MJ-ONLY API —
// the published 6.1.0-edge.3 global does not export it, so importing it breaks under registry
// packages (CI). Same escaping, shipped with this repo.
import { EscapeText } from '@mj-biz-apps/orders-core-entities-server';
import {
    mjBizAppsOrdersCheckoutWidgetDistributionEntity,
    mjBizAppsOrdersCheckoutWidgetEntity,
    type CheckoutWidgetConfiguration,
} from '@mj-biz-apps/orders-entities';

const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const MAGIC_LINK_INVITE_ENTITY = 'MJ: Magic Link Invites';

/** Mirrors MJ's MAGIC_LINK_TOKEN_PREFIX + generateRawToken (prefix + 32 random bytes as hex). */
export const MAGIC_LINK_TOKEN_PREFIX = 'mj_ml_';

/**
 * SHA-256 of a raw token, base64url — byte-compatible with MJ's `hashToken` (not importable at
 * the pin: the package's exports map exposes only its root). Pinned by a golden-vector test.
 */
export function HashMagicLinkToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('base64url');
}

/** Slug rule: lowercase URL-safe, 3–255 chars, starts alphanumeric. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9\-_]{2,254}$/;

const DEFAULT_INVITE_EXPIRY_DAYS = 365;
const DEFAULT_INVITE_MAX_USES = 100000;

function boundedInt(value: number | undefined, min: number, max: number, fallback: number): number {
    if (value == null || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
}

@RegisterClass(BaseEntity, CHECKOUT_DISTRIBUTION_ENTITY)
export class CheckoutWidgetDistributionEntityServer extends mjBizAppsOrdersCheckoutWidgetDistributionEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            const isNew = !this.IsSaved;

            // Slug normalization + validation, before anything else writes.
            if (this.Slug) {
                const normalized = this.Slug.trim().toLowerCase();
                if (!SLUG_PATTERN.test(normalized)) {
                    LogError(
                        `[CheckoutWidgetDistribution] Refusing slug '${this.Slug}': slugs are 3–255 URL-safe ` +
                            `characters (a–z, 0–9, '-', '_'), starting alphanumeric.`,
                    );
                    return false;
                }
                this.Slug = normalized;
            }

            // Revocation pairing (both directions), decided off the dirty Status field.
            const statusField = this.GetFieldByName('Status');
            const statusChanged = !!statusField && statusField.Dirty;
            if (this.Status === 'Revoked' && !this.RevokedAt) {
                this.RevokedAt = new Date();
            }
            if (this.Status === 'Active' && statusChanged) {
                this.RevokedAt = null;
                this.RevocationReason = null;
            }

            // Invite minting — new rows only, config-gated, before the first save so the FK rides
            // the same insert.
            if (isNew && !this.MagicLinkInviteID) {
                const minted = await this.mintInviteIfConfigured();
                if (!minted) return false; // reason already logged; config-absent returns true
            }

            if (!this.EmbedSnippet && this.Slug) {
                this.EmbedSnippet = this.buildEmbedSnippet(this.Slug);
            }

            const saved = await super.Save(options);
            if (!saved) return false;

            // Post-save: a revocation takes the linked invite with it. After, not before — the
            // distribution's own state is the source of truth and must commit first.
            if (statusChanged && this.Status === 'Revoked' && this.MagicLinkInviteID) {
                await this.revokeLinkedInvite();
            }
            return true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutWidgetDistribution] Save failed for '${this.Slug ?? this.ID}': ${msg}`);
            return false;
        }
    }

    /**
     * Mints the anonymous invite when the widget's Configuration asks for one. Returns false only
     * on a REFUSAL/FAILURE that must stop the save; true when minted OR when no mint is configured.
     */
    private async mintInviteIfConfigured(): Promise<boolean> {
        const user = this.ContextCurrentUser as UserInfo | undefined;
        const provider = this.ProviderToUse as unknown as IMetadataProvider;

        const widget = await provider.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, user);
        const widgetLoaded = this.CheckoutWidgetID ? await widget.Load(this.CheckoutWidgetID) : false;
        if (!widgetLoaded) {
            // The FK will refuse anyway; let the ordinary save path report it.
            return true;
        }

        let config: CheckoutWidgetConfiguration = {};
        if (widget.Configuration) {
            try {
                config = JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration;
            } catch {
                return true; // malformed config = no magicLink block = slug-only distribution
            }
        }
        const ml = config.magicLink;
        const applicationName = typeof ml?.applicationName === 'string' ? ml.applicationName.trim() : '';
        const roleName = typeof ml?.roleName === 'string' ? ml.roleName.trim() : '';
        if (!applicationName || !roleName) {
            return true; // slug-only distribution, deliberately
        }

        // The canIssueInvites-equivalent gate. Direct row insert bypasses MJ's own, so this class
        // supplies it: Owner users, or members of an admin-listed issuer role.
        if (!this.userMayIssueInvites(user, ml?.issuerRoleNames)) {
            LogError(
                `[CheckoutWidgetDistribution] User ${user?.Email ?? '(unknown)'} may not mint magic-link ` +
                    `invites for widget '${widget.Name}' — requires an Owner user or a role listed in ` +
                    `Configuration.magicLink.issuerRoleNames.`,
            );
            return false;
        }

        const applicationID = await this.lookupIDByName('MJ: Applications', applicationName, provider, user);
        if (!applicationID) {
            LogError(`[CheckoutWidgetDistribution] magicLink.applicationName '${applicationName}' does not resolve to an MJ application.`);
            return false;
        }
        const roleID = await this.lookupIDByName('MJ: Roles', roleName, provider, user);
        if (!roleID) {
            LogError(`[CheckoutWidgetDistribution] magicLink.roleName '${roleName}' does not resolve to an MJ role.`);
            return false;
        }
        if (!user?.ID) {
            LogError('[CheckoutWidgetDistribution] Cannot mint an invite without a saving user — CreatedByUserID must be a real, active user.');
            return false;
        }

        const rawToken = MAGIC_LINK_TOKEN_PREFIX + randomBytes(32).toString('hex');
        const expiresInDays = boundedInt(ml?.expiresInDays, 1, 3650, DEFAULT_INVITE_EXPIRY_DAYS);
        const maxUses = boundedInt(ml?.maxUses, 1, 10_000_000, DEFAULT_INVITE_MAX_USES);

        const invite = await provider.GetEntityObject<MJMagicLinkInviteEntity>(MAGIC_LINK_INVITE_ENTITY, user);
        invite.NewRecord();
        // Field-by-field per the redemption contract (RedeemInvite's checks, in order): the raw
        // token's hash; Email null (legal ONLY because IdentityMode='anonymous'); real app + role;
        // future expiry; multi-use budget; an ACTIVE creating user (redemption re-checks it —
        // deactivating the creator kills every outstanding link); the anonymous-embed kind, which
        // is NOT NULL with no DB default and which MJ's CreateInvite cannot author.
        invite.TokenHash = HashMagicLinkToken(rawToken);
        invite.Email = null;
        invite.ApplicationID = applicationID;
        invite.RoleID = roleID;
        invite.ExpiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        invite.MaxUses = maxUses;
        invite.UseCount = 0;
        invite.CreatedByUserID = user.ID;
        invite.Status = 'Active';
        invite.IdentityMode = 'anonymous';
        invite.Kind = 'anonymous-embed';

        const inviteSaved = await invite.Save();
        if (!inviteSaved) {
            LogError(
                `[CheckoutWidgetDistribution] Failed to mint the anonymous invite for '${this.Slug}': ` +
                    `${invite.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
            return false;
        }

        this.MagicLinkInviteID = invite.ID;
        // The raw token is shown ONCE, in the embed snippet — it is a deliberately PUBLIC
        // credential (anonymous principal, restricted role, multi-use), the same trust level as
        // the slug itself. Only the hash is ever persisted on the invite row.
        this.EmbedSnippet = this.buildEmbedSnippet(this.Slug, rawToken);
        LogStatus(`[CheckoutWidgetDistribution] Minted anonymous invite ${this.MagicLinkInviteID} for distribution '${this.Slug}'.`);
        return true;
    }

    private userMayIssueInvites(user: UserInfo | undefined, issuerRoleNames: string[] | undefined): boolean {
        if (!user) return false;
        if ((user.Type ?? '').toLowerCase() === 'owner') return true;
        if (!Array.isArray(issuerRoleNames) || !issuerRoleNames.length) return false;
        const allowed = new Set(issuerRoleNames.map((r) => r.trim().toLowerCase()).filter(Boolean));
        return (user.UserRoles ?? []).some((r) => allowed.has((r.Role ?? '').trim().toLowerCase()));
    }

    private async lookupIDByName(
        entityName: string,
        name: string,
        provider: IMetadataProvider,
        user: UserInfo | undefined,
    ): Promise<string | null> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: entityName,
                ExtraFilter: `Name = '${EscapeText(name)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            user,
        );
        return res?.Success && res.Results?.length ? res.Results[0].ID : null;
    }

    private buildEmbedSnippet(slug: string, rawToken?: string): string {
        const tokenAttr = rawToken ? `\n  data-checkout-token="${rawToken}"` : '';
        return (
            `<mj-checkout\n  data-checkout-slug="${slug}"${tokenAttr}>\n</mj-checkout>\n` +
            `<!-- Serve the checkout custom-element bundle from your deployment; ` +
            `see docs/checkout-deployment-guide.md §6 -->`
        );
    }

    private async revokeLinkedInvite(): Promise<void> {
        try {
            const provider = this.ProviderToUse as unknown as IMetadataProvider;
            const user = this.ContextCurrentUser as UserInfo | undefined;
            const invite = await provider.GetEntityObject<MJMagicLinkInviteEntity>(MAGIC_LINK_INVITE_ENTITY, user);
            const loaded = await invite.Load(this.MagicLinkInviteID as string);
            if (!loaded) {
                LogError(`[CheckoutWidgetDistribution] Linked invite ${this.MagicLinkInviteID} could not be loaded for revocation.`);
                return;
            }
            if (invite.Status === 'Revoked') return;
            invite.Status = 'Revoked';
            const saved = await invite.Save();
            if (!saved) {
                LogError(
                    `[CheckoutWidgetDistribution] Failed to revoke invite ${this.MagicLinkInviteID} for revoked ` +
                        `distribution '${this.Slug}': ${invite.LatestResult?.CompleteMessage ?? 'unknown error'} — ` +
                        `THE RAW LINK STILL REDEEMS until this is repaired.`,
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutWidgetDistribution] Error revoking linked invite ${this.MagicLinkInviteID}: ${msg}`);
        }
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadCheckoutWidgetDistributionEntityServer(): void {
    // intentionally empty
}

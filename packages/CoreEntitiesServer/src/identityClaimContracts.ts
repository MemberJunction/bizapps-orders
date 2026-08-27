/**
 * @fileoverview LOCAL FALLBACK for the MemberJunction identity-claim driver contracts.
 *
 * WHY THIS FILE EXISTS. The claim drivers are written against MJ's identity-claim
 * contracts — `BaseIdentityClaimDriver` and friends — but those symbols are not in any
 * PUBLISHED `@memberjunction/core-entities`. They exist only in an MJ working tree, so
 * the drivers compile for anyone dev-linked against MJ `next` and fail for everyone else,
 * CI included: `6.1.0-edge.3` is the newest published edge and exports none of them.
 * The result was ten TS2305 errors, an unbuildable `orders-core-entities-server`, and
 * three test suites that could not even load (`Class extends value undefined`).
 *
 * These definitions mirror the surface the drivers actually use — no more. They are a
 * stand-in for a contract owned upstream, NOT a second implementation of it.
 *
 * HOW TO REMOVE IT. When an MJ release ships these exports, delete this file and point
 * the four importers back at the package:
 *
 *   - `EntitlementGrantClaimDriver.ts`, `GuestOrderClaimDriver.ts`
 *   - `__tests__/EntitlementGrantClaimDriver.test.ts`, `__tests__/GuestOrderClaimDriver.test.ts`
 *
 * Each imports the same four names from here; swapping the specifier back to
 * `@memberjunction/core-entities` is the whole migration. If the published shape differs
 * from what is below, the compiler will say so at those four sites — which is the point
 * of keeping the definitions in one module rather than inline in each driver.
 *
 * @module @mj-biz-apps/orders-core-entities-server/identityClaimContracts
 */

import { IEntityDataProvider, IMetadataProvider, UserInfo } from '@memberjunction/core';

/**
 * The claim record a driver is handed.
 *
 * Upstream this is a generated `BaseEntity` subclass; here it is the subset of fields the
 * drivers read, plus an index signature so a real entity object still satisfies it. The
 * tests cast their fixtures through `unknown` to this type, exactly as they would with the
 * upstream entity class.
 */
export interface MJIdentityClaimEntity {
    ID?: string;
    ClaimTypeID?: string;
    Status?: string;
    EntityID?: string | null;
    RecordID?: string | null;
    NormalizedEmail?: string;
    MetadataJSON?: string | null;
    PayloadJSON?: string | null;
    /** Scoped provider the claim was loaded through; drivers pass it to RunView. */
    ProviderToUse?: IEntityDataProvider | IMetadataProvider | null;
    [key: string]: unknown;
}

/**
 * Context for the lifecycle hooks that are not a redemption — create, revoke, expire.
 * `User` is optional because a claim can be created or expire with no one signed in.
 */
export interface ClaimContext {
    Claim: MJIdentityClaimEntity;
    User?: UserInfo;
    [key: string]: unknown;
}

/**
 * Context for a redemption. A redemption is always performed BY someone, so `User`
 * narrows to required here — that is the whole difference from {@link ClaimContext}.
 */
export interface ClaimRedeemContext extends ClaimContext {
    User: UserInfo;
    RedemptionToken?: string;
}

/**
 * Outcome of a redemption. Drivers report failure in-band rather than throwing, so the
 * caller can distinguish "this claim does not apply" from "the driver broke".
 */
export interface ClaimResult {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
}

/**
 * Base class every identity-claim driver extends.
 *
 * It is also the ClassFactory registration key: `@RegisterClass(BaseIdentityClaimDriver, ...)`
 * on a driver, and `CreateInstance(BaseIdentityClaimDriver, '<name>')` to resolve one. That
 * is why this must be a real class and not an interface — the identity is a runtime value.
 */
export abstract class BaseIdentityClaimDriver {
    /** Called once the claim record exists, before anyone has redeemed it. */
    public abstract OnCreate(context: ClaimContext): Promise<void>;

    /** Called when an authenticated user redeems the claim. */
    public abstract OnClaim(context: ClaimRedeemContext): Promise<ClaimResult>;

    /** Called when the claim is revoked before redemption. */
    public abstract OnRevoke(context: ClaimContext): Promise<void>;

    /** Called when the claim lapses unredeemed. */
    public abstract OnExpire(context: ClaimContext): Promise<void>;
}

/**
 * LOCAL FALLBACK for MJ's identity-claim ENGINE, same footing as the contracts above:
 * `IdentityClaimEngineServer` exists only in an MJ working tree, not in any published
 * `@memberjunction/core-entities-server`. The one caller (`CheckoutSessionService`)
 * mints a GuestOrder claim BEST-EFFORT inside a try/catch that logs and proceeds —
 * so until MJ publishes the engine, minting throws here, the caller logs it, and the
 * order books exactly as before. No silent success, no invented claim.
 *
 * HOW TO REMOVE: when an MJ release exports IdentityClaimEngineServer, delete this
 * class and point CheckoutSessionService back at '@memberjunction/core-entities-server'.
 */
export class IdentityClaimEngineServer {
    private static _instance: IdentityClaimEngineServer | null = null;
    public static get Instance(): IdentityClaimEngineServer {
        return (this._instance ??= new IdentityClaimEngineServer());
    }
    public async CreateClaim(_params: {
        ClaimTypeName: string;
        RecordID: string;
        EntityID: string | null;
        NormalizedEmail: string;
        Payload: Record<string, unknown>;
        SendEmail?: boolean;
    }, _contextUser: UserInfo): Promise<{ ID: string } | null> {
        throw new Error(
            'IdentityClaimEngineServer is not available: no published @memberjunction/core-entities-server ' +
            'exports it yet. GuestOrder claim minting is dormant until MJ ships the identity-claim engine.'
        );
    }
}

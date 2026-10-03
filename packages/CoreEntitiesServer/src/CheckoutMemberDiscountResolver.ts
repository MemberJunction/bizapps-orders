/**
 * @fileoverview CheckoutMemberDiscountResolver — the host seam for a server-decided checkout discount.
 *
 * Some hosts price members of a partner organisation without a typed code: the host page passes a
 * signed membership token, and the host verifies it server-side. This package cannot know how any
 * host signs its tokens, so verification is a registered class, keyed by the widget's
 * `memberDiscountResolver` Configuration value:
 *
 *     @RegisterClass(BaseCheckoutMemberDiscountResolver, 'PARTNER-MEMBER')
 *     export class PartnerMemberResolver extends BaseCheckoutMemberDiscountResolver { ... }
 *
 * The resolver answers with a PROMOTION CODE, not an amount. Pricing that code through the ordinary
 * promotion engine means effective dates, qualifiers and redemption limits all apply exactly as they
 * do to a typed code, and the discount books through the same adjustment rows.
 *
 * THE TOKEN IS NEVER STORED. It reaches the resolver on the draft call and is dropped; the session
 * keeps only the resolved code, so `/complete` re-prices from that snapshot without seeing the token.
 *
 * THE TOKEN IS REPLAYABLE. It sits in the host page, so anyone who copies it can present it. Hosts
 * should issue short-lived tokens tied to the member's email, and the resolver should compare that
 * email with `ctx.Email`, the buyer email captured on the draft, returning no code on a mismatch.
 *
 * A MEMBER CODE MUST NOT BE TYPED. It is an ordinary promotion code, so anyone who learns it could
 * enter it in a checkout's code field and get the member price without a token (#358). Before a typed
 * code is priced, every registered resolver is asked `IsMemberPromotionCode`, and a code any of them
 * claims is refused — on every widget, because promotion codes are not scoped to one.
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/** What a resolver is told about the checkout the token arrived with. */
export interface CheckoutMemberDiscountContext {
    MemberToken: string;
    CheckoutWidgetID: string;
    CompanyID: string;
    SessionID: string;
    /** The buyer email captured on this draft, when there is one. */
    Email: string | null;
}

/** What a resolver is told when a buyer types a promotion code at a checkout. */
export interface CheckoutTypedPromotionCodeContext {
    /** The code as the buyer typed it, trimmed. */
    Code: string;
    CheckoutWidgetID: string;
    CompanyID: string;
    SessionID: string;
}

/** A resolver's verdict. */
export interface CheckoutMemberDiscountDecision {
    /** The promotion code to price with, or null when the token earns no discount. */
    PromotionCode: string | null;
    /** Shown to the buyer when no discount applies — e.g. why the token was not accepted. */
    Message?: string;
}

/**
 * Base class for a host's member-token verifier. Returning `{ PromotionCode: null }` prices the
 * checkout at full price; throwing is treated the same way, with a generic message, so a verifier
 * outage never blocks a sale.
 */
export abstract class BaseCheckoutMemberDiscountResolver {
    public abstract Resolve(
        ctx: CheckoutMemberDiscountContext,
        provider: IMetadataProvider,
        user: UserInfo | undefined,
    ): Promise<CheckoutMemberDiscountDecision>;

    /**
     * Whether `ctx.Code` belongs to a promotion this resolver hands out. The checkout refuses a typed
     * code any registered resolver claims, so a member code reaches pricing only through `Resolve`.
     *
     * The default claims every code: a resolver that does not say which codes are its own turns typed
     * codes off at every checkout, rather than letting a leaked member code through. Override it to
     * name the resolver's codes.
     */
    public async IsMemberPromotionCode(
        _ctx: CheckoutTypedPromotionCodeContext,
        _provider: IMetadataProvider,
        _user: UserInfo | undefined,
    ): Promise<boolean> {
        return true;
    }
}

/**
 * Asks every registered resolver whether `ctx.Code` is one of its member codes. True when any claims
 * it. A resolver that throws is treated as claiming it, so an outage cannot open the field to member
 * codes.
 */
export async function IsRegisteredMemberPromotionCode(
    ctx: CheckoutTypedPromotionCodeContext,
    provider: IMetadataProvider,
    user: UserInfo | undefined,
): Promise<boolean> {
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseCheckoutMemberDiscountResolver);
    const keys = new Set(registrations.map((r) => r.Key).filter((k): k is string => typeof k === 'string' && k.length > 0));
    for (const key of keys) {
        const resolver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCheckoutMemberDiscountResolver>(
            BaseCheckoutMemberDiscountResolver,
            key,
        );
        if (!resolver || resolver.constructor === BaseCheckoutMemberDiscountResolver) {
            continue;
        }
        try {
            if (await resolver.IsMemberPromotionCode(ctx, provider, user)) {
                return true;
            }
        } catch {
            return true;
        }
    }
    return false;
}

/** Thrown when a widget names a resolver that nobody registered. */
export class CheckoutMemberDiscountNotConfiguredError extends Error {}

/**
 * Finds the resolver registered under `key`. A missing registration REFUSES rather than pricing at
 * full price: a host that configured member pricing and gets none would otherwise see only customers
 * who were overcharged.
 */
export function ResolveCheckoutMemberDiscountResolver(key: string): BaseCheckoutMemberDiscountResolver {
    const resolver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCheckoutMemberDiscountResolver>(
        BaseCheckoutMemberDiscountResolver,
        key,
    );
    // `CreateInstance` falls back to the base class when no key matches; the base implements nothing.
    if (!resolver || resolver.constructor === BaseCheckoutMemberDiscountResolver) {
        throw new CheckoutMemberDiscountNotConfiguredError(
            `No member discount resolver is registered for '${key}'. Register one with ` +
                `@RegisterClass(BaseCheckoutMemberDiscountResolver, '${key}') and reference it from the ` +
                `server bootstrap so the decorator is not tree-shaken away.`,
        );
    }
    return resolver;
}

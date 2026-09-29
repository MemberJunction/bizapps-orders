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

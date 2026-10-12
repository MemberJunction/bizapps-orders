/**
 * @fileoverview The checks a self-serve checkout runs before it will price a purchase (#323).
 *
 * Two layers, run in order:
 *   1. BUILT IN — the resolved Person already holds an Active or Trialing subscription to a product
 *      on the draft. Buying it again would charge them for coverage they have.
 *   2. HOST — a `CheckoutPrePurchaseCheck` subclass registered through the ClassFactory. A host that
 *      also sells through another system is the only party that can see, for example, a
 *      subscription held there. The base class allows everything, so with nothing registered only
 *      the built-in rule applies.
 *
 * The draft is the gate: a refused draft persists nothing, so no payment intent can be opened for
 * it. The payment-intent step runs the same checks again, because the host's own state can change
 * between the two calls.
 */
import { LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { EscapeSQLString } from './sql-guards.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';

/** Subscription statuses that mean the Person already has the coverage a purchase would sell. */
const HELD_SUBSCRIPTION_STATUSES: ReadonlyArray<string> = ['Active', 'Trialing'];

/** The reason a host returns when its refusal means "this buyer already has it". */
export const ALREADY_SUBSCRIBED_REASON = 'already-subscribed';

/** One line of the purchase being checked. */
export interface PrePurchaseLine {
    ProductID: string;
    Quantity: number;
}

/** Everything a check is told about the purchase. */
export interface PrePurchaseContext {
    /** The buyer's e-mail as entered, normalized to lower case. May be empty. */
    Email: string;
    /** The Person the e-mail resolved to, or null for a buyer the system does not know yet. */
    PersonID: string | null;
    /** The selling company of the checkout widget. */
    CompanyID: string;
    Lines: PrePurchaseLine[];
    ContextUser?: UserInfo;
}

/** A check's answer. */
export interface PrePurchaseVerdict {
    Allowed: boolean;
    /** Shown to the buyer when the purchase is refused. */
    Message?: string;
    /**
     * Why it was refused. Return {@link ALREADY_SUBSCRIBED_REASON} to have the widget emit its
     * `checkout-already-subscribed` event; any other value only shows the message.
     */
    Reason?: string;
    /** The products the refusal is about, when it is about particular ones. */
    ProductIDs?: string[];
}

/** Why a checkout step was refused, as the widget receives it. */
export interface CheckoutRefusal {
    /** `Unverified` means a check could not answer, and the purchase was refused because of it. */
    Code: 'AlreadySubscribed' | 'HostRefused' | 'Unverified';
    Source: 'built-in' | 'host';
    ProductIDs: string[];
}

/** A refusal plus the message the buyer sees. */
export interface PrePurchaseRefusal {
    Message: string;
    Refusal: CheckoutRefusal;
}

/**
 * The host seam. Register a subclass with `@RegisterClass(CheckoutPrePurchaseCheck)` and reference
 * its class from the server bootstrap so the decorator is not tree-shaken away. The highest-priority
 * registration wins; a host with several rules chains them inside its one subclass.
 */
export class CheckoutPrePurchaseCheck {
    public async Check(_context: PrePurchaseContext): Promise<PrePurchaseVerdict> {
        return { Allowed: true };
    }
}

/**
 * Runs the built-in rule, then the registered host check.
 *
 * @returns null when the purchase may proceed, otherwise the refusal to report.
 */
export async function RunPrePurchaseChecks(context: PrePurchaseContext): Promise<PrePurchaseRefusal | null> {
    let builtIn: PrePurchaseRefusal | null;
    try {
        builtIn = await checkHeldSubscriptions(context);
    } catch (err) {
        LogError(`[CheckoutPrePurchaseCheck] subscription check failed: ${err instanceof Error ? err.message : String(err)}`);
        return unverified('built-in');
    }
    return builtIn ?? (await runHostCheck(context));
}

/**
 * Fail closed: the checks exist to stop a charge the buyer should not incur, and a check that
 * cannot answer has not said the charge is safe.
 */
function unverified(source: CheckoutRefusal['Source']): PrePurchaseRefusal {
    return {
        Message: 'This purchase could not be verified right now. Please try again later.',
        Refusal: { Code: 'Unverified', Source: source, ProductIDs: [] },
    };
}

async function checkHeldSubscriptions(context: PrePurchaseContext): Promise<PrePurchaseRefusal | null> {
    const productIDs = [...new Set(context.Lines.map((l) => l.ProductID).filter(Boolean))];
    if (!context.PersonID || productIDs.length === 0) {
        return null;
    }

    const held = await findHeldSubscriptions(context.PersonID, productIDs, context.ContextUser);
    if (held.length === 0) {
        return null;
    }

    const names = [...new Set(held.map((h) => h.Product).filter(Boolean))];
    const what = names.length > 0 ? names.join(', ') : 'this product';
    return {
        Message: `You already have an active subscription to ${what}, so it cannot be bought again.`,
        Refusal: {
            Code: 'AlreadySubscribed',
            Source: 'built-in',
            ProductIDs: [...new Set(held.map((h) => h.ProductID))],
        },
    };
}

/**
 * The Person's held subscriptions to any of these products. Matches on the beneficiary, which a
 * checkout order fills from its ship-to Person — the buyer.
 */
async function findHeldSubscriptions(
    personID: string,
    productIDs: string[],
    contextUser?: UserInfo,
): Promise<Array<{ ProductID: string; Product: string }>> {
    const productList = productIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    const statusList = HELD_SUBSCRIPTION_STATUSES.map((s) => `'${s}'`).join(', ');
    const result = await new RunView().RunView<{ ProductID: string; Product: string }>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter:
                `BeneficiaryPersonID = '${EscapeSQLString(personID)}' ` +
                `AND ProductID IN (${productList}) AND Status IN (${statusList})`,
            Fields: ['ProductID', 'Product'],
            ResultType: 'simple',
            BypassCache: true,
        },
        contextUser,
    );
    if (!result.Success) {
        throw new Error(`Could not read existing subscriptions: ${result.ErrorMessage ?? 'unknown error'}`);
    }
    return result.Results ?? [];
}

async function runHostCheck(context: PrePurchaseContext): Promise<PrePurchaseRefusal | null> {
    const check = MJGlobal.Instance.ClassFactory.CreateInstance<CheckoutPrePurchaseCheck>(CheckoutPrePurchaseCheck);
    if (!check) {
        return null;
    }

    let verdict: PrePurchaseVerdict;
    try {
        verdict = await check.Check(context);
    } catch (err) {
        LogError(`[CheckoutPrePurchaseCheck] ${check.constructor.name} threw: ${err instanceof Error ? err.message : String(err)}`);
        return unverified('host');
    }
    if (verdict.Allowed) {
        return null;
    }

    return {
        Message: verdict.Message?.trim() || 'This purchase cannot be completed.',
        Refusal: {
            Code: verdict.Reason === ALREADY_SUBSCRIBED_REASON ? 'AlreadySubscribed' : 'HostRefused',
            Source: 'host',
            ProductIDs: verdict.ProductIDs ?? [],
        },
    };
}

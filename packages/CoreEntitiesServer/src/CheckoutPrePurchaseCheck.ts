/**
 * @fileoverview The checks a self-serve checkout runs before it will price a purchase (#323).
 *
 * Two layers, run in order:
 *   1. BUILT IN, two rules, the first that refuses wins:
 *      a. the draft sells a subscription product (one with a subscription type) and the resolved
 *         Person already holds an Active or Trialing subscription IN THIS COMPANY that their payment
 *         gateway bills (`ProviderSubscriptionID` set, option E), whatever its product. Orders would
 *         extend or add a term for the new purchase that the gateway knows nothing about, and the
 *         gateway would still charge at its own renewal: the buyer would pay twice. An upgrade would
 *         open a second gateway subscription. A ticket or another one-off is not refused: it neither
 *         extends a term nor opens a gateway subscription. Refused as `ProviderBilledSubscription`,
 *         its own code. The message is the widget's `providerBilledSubscriptionMessage` (a neutral
 *         default otherwise), with `{renewalDate}` filled in. Example: Jane holds SUB-000110, billed
 *         by Stripe as `sub_A1` and renewing 30 Oct 2027; in May she tries to buy Executive on the
 *         same company's widget and is told to contact support; buying an event ticket goes through.
 *         KNOWN LIMIT: a buyer who cancelled in the gateway's own portal stays Active in Orders until
 *         Orders hears the gateway's events (E3/E4), so until then they are still refused, with a
 *         message that says their subscription renews.
 *      b. the resolved Person already holds an Active or Trialing subscription to a product on the
 *         draft. Buying it again would charge them for coverage they have.
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
import { CompareDays, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';
import { EXISTING_HOLDING_STATUSES } from '@mj-biz-apps/orders-entities';
import { SellsSubscription } from './CheckoutSavedInstrument.js';
import { ProviderBilledSql } from './ProviderBilledSubscriptions.js';
import { EscapeSQLString, RequireUUID, RequireUUIDs } from './sql-guards.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

/**
 * Shown when the widget sets no `providerBilledSubscriptionMessage`. Neutral on purpose: a host's own
 * wording (and its support contact) belongs in its widget configuration.
 */
export const DEFAULT_PROVIDER_BILLED_SUBSCRIPTION_MESSAGE =
    'You already have a subscription that renews automatically on {renewalDate}. If you are buying for someone else, ' +
    'enter their email address instead. Otherwise, please contact us with any questions.';

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
    /**
     * The widget's `providerBilledSubscriptionMessage`: what a buyer who already holds a
     * gateway-billed subscription in this company is told. Unset, the default.
     */
    ProviderBilledSubscriptionMessage?: string | null;
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
    /**
     * `AlreadySubscribed`: the buyer holds the product on the draft (the widget's
     * `checkout-already-subscribed` event fires). `ProviderBilledSubscription`: the buyer holds a
     * subscription their payment gateway bills, so no further subscription purchase is taken here;
     * `ProductIDs` are the held products, not the draft's, and the event does not fire.
     * `Unverified` means a check could not answer, and the purchase was refused because of it.
     */
    Code: 'AlreadySubscribed' | 'ProviderBilledSubscription' | 'HostRefused' | 'Unverified';
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
        builtIn = (await checkProviderBilledSubscriptions(context)) ?? (await checkHeldSubscriptions(context));
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

/**
 * Rule 1a: the draft sells a subscription and the Person already holds a subscription in this company
 * that a payment gateway bills. Any subscription product, any widget of the company: the double charge
 * does not depend on which plan is being bought.
 */
async function checkProviderBilledSubscriptions(context: PrePurchaseContext): Promise<PrePurchaseRefusal | null> {
    if (!context.PersonID || !context.CompanyID) {
        return null;
    }
    // Every status Orders counts as still held, Paused included (Robert, #972): a paused subscription the
    // gateway bills is still the gateway's to charge, so a second purchase would still be a double charge.
    const statusList = EXISTING_HOLDING_STATUSES.map((s) => `'${s}'`).join(', ');
    // The holder first: for nearly every buyer it is empty, and the product read is skipped.
    const held = await new RunView().RunView<{ ID: string; ProductID: string }>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter:
                `BeneficiaryPersonID = '${RequireUUID(context.PersonID, 'PersonID')}' ` +
                `AND CompanyID = '${RequireUUID(context.CompanyID, 'CompanyID')}' ` +
                `AND Status IN (${statusList}) AND ${ProviderBilledSql()}`,
            Fields: ['ID', 'ProductID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        context.ContextUser,
    );
    if (!held.Success) {
        throw new Error(`Could not read existing gateway-billed subscriptions: ${held.ErrorMessage ?? 'unknown error'}`);
    }
    const subscriptions = held.Results ?? [];
    if (subscriptions.length === 0) {
        return null;
    }
    if (!(await SellsSubscription(context.Lines.map((l) => l.ProductID), context.ContextUser))) {
        return null;
    }

    const renewalDay = await earliestRenewalDay(subscriptions.map((s) => s.ID), context.ContextUser);
    const template = context.ProviderBilledSubscriptionMessage?.trim() || DEFAULT_PROVIDER_BILLED_SUBSCRIPTION_MESSAGE;
    return {
        Message: template.split('{renewalDate}').join(renewalDay ? FormatRenewalDay(renewalDay) : 'its renewal date'),
        Refusal: {
            Code: 'ProviderBilledSubscription',
            Source: 'built-in',
            ProductIDs: [...new Set(subscriptions.map((s) => s.ProductID))],
        },
    };
}

/** The last day of the latest live term of each subscription, the earliest of those: when the gateway next charges. */
async function earliestRenewalDay(subscriptionIDs: string[], contextUser?: UserInfo): Promise<string | null> {
    const idList = RequireUUIDs(subscriptionIDs, 'SubscriptionID').map((id) => `'${id}'`).join(', ');
    const terms = await new RunView().RunView<{ ID: string; SubscriptionID: string; EndDate: Date | string }>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `SubscriptionID IN (${idList}) AND Status IN ('Scheduled', 'Active')`,
            Fields: ['ID', 'SubscriptionID', 'EndDate'],
            ResultType: 'simple',
            BypassCache: true,
        },
        contextUser,
    );
    if (!terms.Success) {
        // The refusal stands without a date; the date only completes the message.
        LogError(`[CheckoutPrePurchaseCheck] Could not read the renewal date: ${terms.ErrorMessage ?? 'unknown error'}`);
        return null;
    }
    const latest = new Map<string, CalendarDay>();
    for (const t of terms.Results ?? []) {
        const day = ToCalendarDay(t.EndDate);
        if (!day) continue;
        const key = t.SubscriptionID.toLowerCase();
        const held = latest.get(key);
        if (!held || CompareDays(day, held) > 0) latest.set(key, day);
    }
    const days = [...latest.values()].sort(CompareDays);
    return days[0] ?? null;
}

/**
 * A stored day (`YYYY-MM-DD`) as a buyer reads it: `October 30, 2027`. The day is never shifted by a
 * zone. Always US English for now; a widget in another language would need a locale setting beside
 * `providerBilledSubscriptionMessage`.
 */
export function FormatRenewalDay(day: string): string {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
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

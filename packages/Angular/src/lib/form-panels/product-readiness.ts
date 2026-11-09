/**
 * Is a Draft product ready to sell? (golive#433, g433.1 A: warn but allow.)
 *
 * Activating a product puts it in the deal and order pickers. Two gaps then fail at a bad moment: a
 * product with no price in force cannot be priced on a line, and a product whose Sales or Deferred
 * Revenue role resolves to no GL account is refused at confirm. The header checks both before it
 * activates, lists what is missing, and lets the user activate anyway.
 *
 * Both answers come from the server: the price from `Orders.PreviewPrice` (the pricing walk a line
 * uses) and the accounts from `Orders.ExplainProductGLAccounts` (the walk confirm books through).
 * This file only reads their results.
 */
import type { ExplainedGLRole } from '@mj-biz-apps/orders-entities';

/** The roles activation checks: what every product's revenue books to. */
export const ACTIVATION_GL_ROLES = ['Sales', 'Deferred Revenue'] as const;

/** What the two checks returned. A check that could not run carries its error instead. */
export interface ProductReadinessInputs {
    /** True when a price resolved for today, false when pricing refused; null when the check failed. */
    PriceInForce: boolean | null;
    /** Pricing's refusal, or the error that stopped the check. */
    PriceMessage?: string | null;
    /** The explained roles; null when the check failed. */
    Roles: readonly ExplainedGLRole[] | null;
    /** The error that stopped the account check. */
    GLError?: string | null;
}

export interface ProductReadiness {
    Ready: boolean;
    /** One sentence per gap, in the order the header lists them. */
    Missing: string[];
}

/** Turns the two checks into the list the header shows before activating. */
export function EvaluateProductReadiness(inputs: ProductReadinessInputs): ProductReadiness {
    const missing: string[] = [];

    if (inputs.PriceInForce === null) {
        missing.push(`Whether a price is in force today could not be checked${detail(inputs.PriceMessage)}.`);
    } else if (!inputs.PriceInForce) {
        missing.push(`No price is in force today${detail(inputs.PriceMessage)}.`);
    }

    if (inputs.Roles === null) {
        missing.push(`Whether Sales and Deferred Revenue resolve to GL accounts could not be checked${detail(inputs.GLError)}.`);
    } else {
        for (const name of ACTIVATION_GL_ROLES) {
            const role = inputs.Roles.find((r) => r.Role.toLowerCase() === name.toLowerCase());
            if (!role) {
                missing.push(`${name} was not checked.`);
            } else if (!role.ResolvedGLAccountID) {
                missing.push(
                    role.Failure === 'CrossCompany'
                        ? `${name} resolves to a GL account that belongs to another company, so confirm would refuse it.`
                        : `${name} resolves to no GL account: link one on the product, its category, its product type or the company.`,
                );
            }
        }
    }

    return { Ready: missing.length === 0, Missing: missing };
}

function detail(message: string | null | undefined): string {
    const text = (message ?? '').trim().replace(/[.\s]+$/, '');
    return text ? ` (${text})` : '';
}

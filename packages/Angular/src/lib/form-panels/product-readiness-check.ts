/**
 * Runs the two server checks a Draft product needs before it is activated (golive#433), for the
 * product header and the New product dialog (golive#434) alike.
 *
 * The evaluation is in `product-readiness.ts`, which stays free of runtime imports so its tests need
 * no operation classes. This file only calls the operations and hands their results over.
 */
import {
    OrdersExplainProductGLAccountsOperation,
    OrdersPreviewPriceOperation,
} from '@mj-biz-apps/orders-entities';

import { ACTIVATION_GL_ROLES, EvaluateProductReadiness, type ProductReadiness, type ProductReadinessInputs } from './product-readiness';

/** Asks pricing and the GL walk whether the saved product `productID` is ready to sell. */
export async function CheckProductReadiness(productID: string): Promise<ProductReadiness> {
    const [price, gl] = await Promise.all([checkPrice(productID), checkGLAccounts(productID)]);
    return EvaluateProductReadiness({ ...price, ...gl });
}

async function checkPrice(productID: string): Promise<Pick<ProductReadinessInputs, 'PriceInForce' | 'PriceMessage'>> {
    try {
        // A Draft product may not be sold, so pricing refuses it unless told to ignore that.
        const r = await new OrdersPreviewPriceOperation().Execute({ ProductID: productID, IgnoreSellability: true });
        return r.Success && r.Output
            ? { PriceInForce: r.Output.Success, PriceMessage: r.Output.Success ? null : r.Output.Message }
            : { PriceInForce: null, PriceMessage: r.ErrorMessage };
    } catch (e: unknown) {
        return { PriceInForce: null, PriceMessage: e instanceof Error ? e.message : String(e) };
    }
}

async function checkGLAccounts(productID: string): Promise<Pick<ProductReadinessInputs, 'Roles' | 'GLError'>> {
    try {
        const r = await new OrdersExplainProductGLAccountsOperation().Execute({ ProductID: productID, Roles: [...ACTIVATION_GL_ROLES] });
        return r.Success && r.Output?.Success
            ? { Roles: r.Output.Roles ?? null, GLError: null }
            : { Roles: null, GLError: r.Output?.Message ?? r.ErrorMessage };
    } catch (e: unknown) {
        return { Roles: null, GLError: e instanceof Error ? e.message : String(e) };
    }
}


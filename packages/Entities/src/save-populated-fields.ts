/**
 * Fields the save path fills in, so `Validate()` must not treat them as user errors
 * on a record that has not been saved yet.
 *
 * Fast Entry and the editor gate confirm on `Validate()`. `OrderNumber`, each line's
 * `UnitPrice` / `CompanyID` / `LineNumber` are NOT NULL in metadata, and they are
 * empty on a new draft because `OrderEntityServer.Save()` mints or stamps them.
 * Running the generated checks up front disabled Confirm with
 * "Order Number cannot be null" on every complete order.
 *
 * After the first save those values exist, so a later empty is a real failure.
 */

import {
    DocumentNumberingEngine,
    EntityInfo,
    type IDocumentNumberPolicy,
} from '@memberjunction/core';

/**
 * Declarative auto-numbering policy for `OrderHeader.OrderNumber` (`ORD-{SEQ:6}`).
 */
export const ORDER_NUMBER_POLICY: IDocumentNumberPolicy = {
    targetField: 'OrderNumber',
    pattern: 'ORD-{SEQ:6}',
    prefix: 'ORD',
    sequenceKey: 'OrderSequence',
    manualValueMode: 'AllowAny',
    immutableAfterCreate: true,
};

/**
 * Declarative auto-numbering policy for `Subscription.SubscriptionNumber` (`SUB-{SEQ:6}`).
 */
export const SUBSCRIPTION_NUMBER_POLICY: IDocumentNumberPolicy = {
    targetField: 'SubscriptionNumber',
    pattern: 'SUB-{SEQ:6}',
    prefix: 'SUB',
    sequenceKey: 'SubscriptionSequence',
    manualValueMode: 'AllowAny',
    immutableAfterCreate: true,
};

/**
 * Declarative auto-numbering policy for `PaymentHeader.PaymentNumber` (`PAY-{SEQ:6}`).
 */
export const PAYMENT_NUMBER_POLICY: IDocumentNumberPolicy = {
    targetField: 'PaymentNumber',
    pattern: 'PAY-{SEQ:6}',
    prefix: 'PAY',
    sequenceKey: 'PaymentSequence',
    manualValueMode: 'AllowAny',
    immutableAfterCreate: true,
};

const REGISTERED_NUMBERING_ENTITIES: ReadonlyArray<string> = [
    'MJ_BizApps_Orders: Order Headers',
    'MJ_BizApps_Orders: Orders',
    'MJ_BizApps_Orders: Subscriptions',
    'MJ_BizApps_Orders: Payment Headers',
];

const FALLBACK_SAVE_POPULATED_HEADER_FIELDS = new Set<string>([
    'OrderNumber',
    'SubscriptionNumber',
    'PaymentNumber',
]);

/**
 * Registers the Orders document numbering policies (`OrderNumber`, `SubscriptionNumber`, `PaymentNumber`)
 * on {@link DocumentNumberingEngine} so `BaseEntity.Validate()` natively recognizes them as auto-populated on create.
 */
export function registerOrdersDocumentNumberingPolicies(): void {
    DocumentNumberingEngine.Instance.RegisterPolicy('MJ_BizApps_Orders: Order Headers', ORDER_NUMBER_POLICY);
    DocumentNumberingEngine.Instance.RegisterPolicy('MJ_BizApps_Orders: Orders', ORDER_NUMBER_POLICY);
    DocumentNumberingEngine.Instance.RegisterPolicy('MJ_BizApps_Orders: Subscriptions', SUBSCRIPTION_NUMBER_POLICY);
    DocumentNumberingEngine.Instance.RegisterPolicy('MJ_BizApps_Orders: Payment Headers', PAYMENT_NUMBER_POLICY);
}

registerOrdersDocumentNumberingPolicies();

const LINE_POPULATED = /^(Lines)\[(\d+)\]\.(UnitPrice|CompanyID|LineNumber)$/;

function isDocumentNumberedHeaderField(source: string, headerEntityInfo?: EntityInfo | null): boolean {
    if (headerEntityInfo) {
        if (DocumentNumberingEngine.Instance.WillAutoPopulateOnCreate(headerEntityInfo, source)) {
            return true;
        }
    }
    const normalized = source.trim().toLowerCase();
    for (const entityName of REGISTERED_NUMBERING_ENTITIES) {
        const policies = DocumentNumberingEngine.Instance.ResolvePolicies(new EntityInfo({ Name: entityName }));
        if (policies.some((p) => p.targetField.trim().toLowerCase() === normalized)) {
            return true;
        }
    }
    return FALLBACK_SAVE_POPULATED_HEADER_FIELDS.has(source);
}

/**
 * True when this validation error is for a field the save itself will populate.
 */
export function IsSavePopulatedFieldError(
    source: string,
    headerIsSaved: boolean,
    lineIsSaved: (index: number) => boolean,
    headerEntityInfo?: EntityInfo | null,
): boolean {
    if (isDocumentNumberedHeaderField(source, headerEntityInfo)) return !headerIsSaved;
    const match = LINE_POPULATED.exec(source);
    if (!match) return false;
    return !lineIsSaved(Number(match[2]));
}

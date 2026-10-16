/**
 * EVERY SERVER SUBCLASS MUST EXTEND THE SHARED ONE, NOT THE GENERATED ONE.
 *
 * `@RegisterClass` resolves last-registered-wins. When a server class and a shared class both
 * register for one entity key and both extend the GENERATED class, they are siblings rather than a
 * chain — so the winner does not inherit the loser, it replaces it, and everything the shared class
 * defines stops existing on the server. MJAPI prints the collision at boot:
 *
 *     ProductPriceEntityServer is registering for base class BaseEntity with key
 *     'MJ_BizApps_Orders: Product Prices', which is already registered by unrelated class(es):
 *     ProductPriceEntity. These are not in the same inheritance chain ...
 *
 * WHY THIS IS A GUARD RATHER THAN A BUG REPORT. The one collision this app had cost nothing: the
 * shared `ProductPriceEntity` carries only `Name`, `ProductCategoryID` and `Applicability`
 * accessors, added as a stopgap for columns CodeGen had not yet emitted, and CodeGen has since run —
 * the generated class defines all three. The members were identical either way.
 *
 * The same pattern in bizapps-contracts was not harmless: `ContractTypeEntity` overrides `Validate()`
 * to run the value-list check for a `CHECK` constraint `BaseEntity` cannot see, and the server
 * silently never ran it. Same mistake, different cost, and the difference was luck. So this asserts
 * the CHAIN for every entity registered on both sides, not the one that happened to be wrong.
 *
 * ONLY ENTITIES WITH BOTH REGISTRATIONS BELONG HERE. `OrderHeaderPaymentScheduleEntityServer`,
 * `OrderLineProgressMeasurementEntityServer` and `PaymentLineEntityServer` extend generated classes
 * too, and that is correct: no shared subclass registers for those keys, so there is no sibling to
 * collide with and nothing to inherit.
 */
import { describe, expect, it } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    PaymentHeaderEntity,
    ProductPriceEntity,
} from '@mj-biz-apps/orders-entities';

// Import for SIDE EFFECT — this is what fires the decorators, exactly as the server bootstrap does.
import '../index.js';

/** Every entity this app registers on BOTH sides, with the shared class the server one must descend from. */
const PAIRS: ReadonlyArray<{ entity: string; shared: Function; sharedName: string }> = [
    { entity: 'MJ_BizApps_Orders: Order Headers', shared: OrderHeaderEntity, sharedName: 'OrderHeaderEntity' },
    { entity: 'MJ_BizApps_Orders: Order Lines', shared: OrderLineEntity, sharedName: 'OrderLineEntity' },
    { entity: 'MJ_BizApps_Orders: Payment Headers', shared: PaymentHeaderEntity, sharedName: 'PaymentHeaderEntity' },
    { entity: 'MJ_BizApps_Orders: Product Prices', shared: ProductPriceEntity, sharedName: 'ProductPriceEntity' },
];

const resolve = (entity: string) => MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entity);

describe('the class the server resolves descends from the shared class', () => {
    for (const { entity, shared, sharedName } of PAIRS) {
        it(`${entity} -> ... -> ${sharedName}`, () => {
            const registration = resolve(entity);
            expect(registration, `nothing is registered for ${entity}`).toBeTruthy();

            const resolved = registration!.SubClass as unknown as Function;
            const isChained = resolved === shared || resolved.prototype instanceof shared;

            expect(
                isChained,
                `${resolved.name} does not extend ${sharedName}, so everything ${sharedName} defines is `
                    + `lost on the server. Extend the shared class, not the generated one.`,
            ).toBe(true);
        });
    }
});

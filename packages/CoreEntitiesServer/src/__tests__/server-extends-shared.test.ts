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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    PaymentHeaderEntity,
    ProductEntity,
    ProductPriceEntity,
    SubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';

// Import for SIDE EFFECT — this is what fires the decorators, exactly as the server bootstrap does.
import '../index.js';

/** Every entity this app registers on BOTH sides, with the shared class the server one must descend from. */
const PAIRS: ReadonlyArray<{ entity: string; shared: Function; sharedName: string }> = [
    { entity: 'MJ_BizApps_Orders: Order Headers', shared: OrderHeaderEntity, sharedName: 'OrderHeaderEntity' },
    { entity: 'MJ_BizApps_Orders: Order Lines', shared: OrderLineEntity, sharedName: 'OrderLineEntity' },
    { entity: 'MJ_BizApps_Orders: Payment Headers', shared: PaymentHeaderEntity, sharedName: 'PaymentHeaderEntity' },
    { entity: 'MJ_BizApps_Orders: Product Prices', shared: ProductPriceEntity, sharedName: 'ProductPriceEntity' },
    { entity: 'MJ_BizApps_Orders: Products', shared: ProductEntity, sharedName: 'ProductEntity' },
    { entity: 'MJ_BizApps_Orders: Subscription Terms', shared: SubscriptionTermEntity, sharedName: 'SubscriptionTermEntity' },
];

/**
 * Server classes with NO hand-written shared sibling. Extending the generated class is correct for
 * these: nothing registers for the key on the shared side except the generated class itself, so
 * there is no sibling to collide with and nothing to inherit.
 */
const NO_SHARED_SIBLING: ReadonlySet<string> = new Set([
    'ACCESS_OVERRIDE_ENTITY',
    'ENTITLEMENT_GRANT_ENTITY',
    'ORDER_CONCESSION_ENTITY',
    'ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY',
    'ORDER_LINE_PROGRESS_MEASUREMENT_ENTITY',
    'PAYMENT_LINE_ENTITY',
    'SUBSCRIPTION_FAMILY_ENTITY',
]);

/** The key each pair above is written with in the source, so the two lists can be compared. */
const COVERED: ReadonlySet<string> = new Set([
    'ORDER_ENTITY',
    'ORDER_LINE_ENTITY',
    'PAYMENT_HEADER_ENTITY',
    'PRODUCT_PRICE_ENTITY',
    'PRODUCT_ENTITY',
    "'MJ_BizApps_Orders: Subscription Terms'",
]);

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

/**
 * THE LIST ABOVE CANNOT QUIETLY FALL BEHIND THE PACKAGE.
 *
 * It is hand-written, and it had already drifted: four pairs were listed while six entities were
 * registered on both sides, so `Products` and `Subscription Terms` were unguarded. Both happened to
 * extend their shared class correctly, which is exactly why nobody noticed.
 *
 * So every `@RegisterClass(BaseEntity, ...)` in this package must be classified, as a pair above or
 * as one with no shared sibling. A new server entity class fails this until someone says which it
 * is, which is the decision the drift skipped.
 */
describe('every server entity registration is classified', () => {
    const SRC = fileURLToPath(new URL('..', import.meta.url));

    /** The second argument of every `@RegisterClass(BaseEntity, ...)` in the package, as written. */
    const registeredKeys = (): string[] => {
        const keys: string[] = [];
        for (const file of readdirSync(SRC)) {
            if (!file.endsWith('.ts')) continue;
            const text = readFileSync(join(SRC, file), 'utf8');
            for (const m of text.matchAll(/@RegisterClass\(BaseEntity,\s*([^)]+)\)/g)) {
                keys.push(m[1].trim());
            }
        }
        return keys;
    };

    it('names every one of them either as a pair or as having no shared sibling', () => {
        const unclassified = registeredKeys().filter((k) => !COVERED.has(k) && !NO_SHARED_SIBLING.has(k));
        expect(
            unclassified,
            'these register an entity class on the server and are in neither list. If a hand-written '
                + 'shared subclass registers for the same key, add the pair; if not, add it to '
                + 'NO_SHARED_SIBLING with that as the reason.',
        ).toEqual([]);
    });

    it('finds the registrations at all, so an empty scan cannot pass this', () => {
        expect(registeredKeys().length).toBeGreaterThanOrEqual(COVERED.size + NO_SHARED_SIBLING.size);
    });
});

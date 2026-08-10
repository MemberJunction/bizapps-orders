export * from './generated/entity_subclasses';

/**
 * The API surface: one typed `BaseRemotableOperation` base per `MJ: Remote
 * Operations` row, emitted by CodeGen from `metadata/remote-operations/`.
 *
 * Exported from THIS package because it is the app's only browser-safe one — a
 * client imports an operation and calls `.Execute()` without pulling the server
 * engine, which is the whole reason the engine is reached through operations
 * rather than bespoke resolvers.
 *
 * The file also contains unregistered type shells for MJ's own core operations:
 * operations carry no schema, so CodeGen has no core/non-core partition for them
 * and every configured target receives the full set. They are `Manual`, so they
 * emit no `@RegisterClass` and have no runtime effect.
 */
export * from './generated/remote_operations';

/**
 * `OrderStatusBehavior` — the order lifecycle as a table: the legal statuses, the legal MOVES
 * between them, and the predicates every surface asks (is it editable, is it booked, does it count
 * toward the receivable). Pure; no database, no provider. Lives here so the browser enforces the
 * same lifecycle the server does rather than a hand-copied approximation.
 */
export * from './OrderStatusBehavior';

/**
 * `OrderHeaderEntity` — the shared (client + server) order subclass carrying every rule decidable
 * without the database. `OrderEntityServer` extends it and adds persistence, so a rule written once
 * runs in the browser before a round trip AND on the server for every other caller.
 */
export * from './OrderHeaderEntity';

/**
 * Forces the generated entity subclasses to be loaded. Without an explicit
 * import + call, tree-shaking drops the generated entities because they are not
 * directly referenced. Import and call this from the app bootstrap so the
 * @RegisterClass decorators fire and MJ's class factory can resolve them.
 */
export function LoadGeneratedEntities(): void {
}

/**
 * `PromotionCodesCompanion` — the codes a customer presented, carried with the order.
 *
 * A companion rather than a related-record collection because a code has no child row: the RESULT of
 * applying one is an OrderAdjustment the engine derives, and the browser holds only a string.
 */
export * from './PromotionCodesCompanion';

/**
 * `ResolvePricingDriver` — whether a product prices from metadata alone, or needs a server-side
 * `BasePriceResolver` plugin. The decision a client makes before pricing locally; every uncertain
 * case escalates, because a wrong price on screen is worse than a round trip.
 */
export * from './PricingDriverResolver';

/**
 * The pricing engine — price resolution, promotions, charges and tax.
 *
 * Lives HERE, in the browser-safe package, rather than in the server one. It always could: the walk
 * uses `RunView`, `IMetadataProvider` and `MJGlobal` and nothing else, all of which are
 * network-transparent. It sat in `CoreEntitiesServer` by convention, and that convention was the only
 * thing making a price preview cost a server round trip.
 *
 * ONE implementation, both tiers. That is the whole point and the constraint everything else bends
 * to: the number the screen shows and the number the ledger books come from the same code, so they
 * cannot drift. A second client-side pricing implementation would have been faster to write and would
 * have been wrong within a month.
 */
export * from './pricing/PricingBehavior';
export * from './pricing/PriceResolver';
export * from './pricing/TaxResolver';
export * from './pricing/OrdersEngine';
export * from './pricing/ChargeBehavior';
export * from './pricing/PromotionBehavior';
export * from './pricing/ChargeEngine';
export * from './pricing/PromotionEngine';
export * from './pricing/OrderPricingService';

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
export * from './save-populated-fields';

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

/**
/**
 * `ToISODate` and friends — reading a date cell that may be a string or a `Date` and getting the
 * same calendar day back, on both sides of the wire.
 *
 * `String(cell).slice(0, 10)` yields `'Thu Jul 30'` for a `Date`, which prints on an invoice and
 * compares as less than nothing. Which shape a cell arrives in depends on how it was fetched, so
 * the answer is to stop asking callers to know.
 */
export * from './date-cell';

/**
 * `IsOverdue` / `OverdueSQL` / `OverdueFilter` — what "overdue" means, stated once.
 *
 * Three surfaces used to re-derive it and only one excluded a VOIDED order, so a voided order with a
 * stale balance appeared on collections lists as money owed. The rule now lives in one module, with
 * its TS and T-SQL halves side by side so drift shows up in a single diff.
 *
 * It reads days, it does not parse them — `ToISODate` above is the one place that interprets a cell.
 */
export * from './overdue';

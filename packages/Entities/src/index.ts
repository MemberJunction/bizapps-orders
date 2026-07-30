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
 * `OrderDraft` — the framework-free client model of an order under composition,
 * and the payload shapes the `Orders.*` remote operations accept. Lives here
 * rather than in the Angular package because it has no UI dependency and both
 * order-entry lanes plus any non-Angular host share it.
 */
export * from './order-draft';

/**
 * Forces the generated entity subclasses to be loaded. Without an explicit
 * import + call, tree-shaking drops the generated entities because they are not
 * directly referenced. Import and call this from the app bootstrap so the
 * @RegisterClass decorators fire and MJ's class factory can resolve them.
 */
export function LoadGeneratedEntities(): void {
}

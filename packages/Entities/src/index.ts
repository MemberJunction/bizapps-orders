export * from './generated/entity_subclasses';

/**
 * Forces the generated entity subclasses to be loaded. Without an explicit
 * import + call, tree-shaking drops the generated entities because they are not
 * directly referenced. Import and call this from the app bootstrap so the
 * @RegisterClass decorators fire and MJ's class factory can resolve them.
 */
export function LoadGeneratedEntities(): void {
}

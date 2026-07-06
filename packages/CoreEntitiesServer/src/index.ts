/**
 * @mj-biz-apps/orders-core-entities-server — SERVER-ONLY entity subclasses
 * (OPTIONAL — delete if you have no server-side entity logic).
 *
 * Override generated entities here to add server-side behavior: validation,
 * cross-record invariants (ValidateAsync — not DB triggers), Save() hooks,
 * FK cleanup before delete. This package must NEVER be imported by client
 * code — it is a dependency of the Server package only.
 *
 * NOTE the dependency shape in package.json: the sibling app package
 * (@mj-biz-apps/orders-entities) is a HARD dependency pinned to the exact same
 * version (all app packages version together via changesets `fixed`), while
 * every @memberjunction/* package is a PEER (^X.Y.Z).
 *
 * EXAMPLE — override a generated entity's Save():
 *
 *   import { RegisterClass } from '@memberjunction/global';
 *   import { BaseEntity } from '@memberjunction/core';
 *   import { SampleRecordEntity } from '@mj-biz-apps/orders-entities';
 *
 *   @RegisterClass(BaseEntity, 'Sample App: Sample Records')
 *   export class SampleRecordEntityServer extends SampleRecordEntity {
 *       public override async Save(): Promise<boolean> {
 *           // server-side enrichment / invariants here
 *           return super.Save();
 *       }
 *   }
 */
export function LoadBizAppsOrdersEntitiesServer(): void {
    // No-op: importing this module registers the server-side subclasses above.
}

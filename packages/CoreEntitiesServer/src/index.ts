/**
 * @mj-biz-apps/orders-core-entities-server — server-side Orders logic.
 *
 * Exports ONLY what this package defines (MJ rule 5 — no re-exports from other packages):
 *   - OrdersEngine        — catalog cache + GL-account resolver (product → category → company)
 *   - OrderEntityServer    — books the balanced JE into accounting on first Confirmed
 *   - the pure order → JE draft builder + its contract
 *
 * LoadBizAppsOrdersEntitiesServer is the tree-shaking anchor the server bootstrap calls; the
 * static re-export of OrderEntityServer below is what fires its @RegisterClass decorator.
 */
export { OrdersEngine } from './OrdersEngine.js';
export type { ResolvedAccount, OrderDraftBuildResult } from './OrdersEngine.js';
export { buildOrderJournalDraft, OrderDraftError } from './orderJournalDraft.js';
export type {
  ResolvedOrderLine,
  OrderJournalContext,
  OrderDraftInputs,
} from './orderJournalDraft.js';
export { OrderEntityServer, LoadBizAppsOrdersOrderServer } from './OrderEntityServer.js';

import { LoadBizAppsOrdersOrderServer } from './OrderEntityServer.js';

export function LoadBizAppsOrdersEntitiesServer(): void {
  // Importing this module registered OrderEntityServer (via the export above); this call is the
  // tree-shaking anchor the bootstrap invokes so bundlers can't drop the side effect.
  LoadBizAppsOrdersOrderServer();
}

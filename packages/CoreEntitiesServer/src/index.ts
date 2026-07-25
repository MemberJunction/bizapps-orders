/**
 * @mj-biz-apps/orders-core-entities-server
 *
 * Server-only entity subclasses and booking machinery for BizApps Orders. Imported by the orders
 * server bootstrap AFTER `@mj-biz-apps/orders-entities`, so @RegisterClass auto-increment gives
 * these subclasses higher priority than the generated ones.
 */
export { GLAccountResolver, GLAccountResolutionError, GL_ROLE } from './GLAccountResolver.js';
export type { GLRole, ResolverEntityIDs } from './GLAccountResolver.js';

export { OrderJournalEntryFactory } from './OrderJournalEntryFactory.js';
export type { JEDraft, JELineDraft, OrderLineDraft } from './OrderJournalEntryFactory.js';

export {
    RevenueRecognitionDriver,
    UpFrontDriver,
    EvenOverTimeDriver,
    AllBackEndDriver,
    LoadRevenueRecognitionDrivers,
} from './RevenueRecognition.js';
export type { RevRecContext, RevRecEntry, RevRecSchedule } from './RevenueRecognition.js';

export { OrderEntityServer, LoadOrderEntityServer } from './OrderEntityServer.js';
export { OrderLineEntityServer, LoadOrderLineEntityServer } from './OrderLineEntityServer.js';

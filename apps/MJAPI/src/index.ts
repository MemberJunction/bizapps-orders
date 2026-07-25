/**
 * MemberJunction API Server (MJ minimal architecture).
 * All initialization logic lives in @memberjunction/server-bootstrap.
 */
import { createMJServer } from '@memberjunction/server-bootstrap';

// Import BizApps Common first so Organization / Person / Address classes are
// registered before any Orders class references them (soft UUID refs).
import { RESOLVER_PATHS as COMMON_RESOLVER_PATHS } from '@mj-biz-apps/common-server';

// BizApps Accounting — the JE primitives Orders books into. Loaded BEFORE orders so
// its entity/engine classes are registered before any Orders class resolves them.
// Resolved from a local checkout via .mj-links.json (see scripts/link-local-apps.mjs)
// until the app is published; the symlink means two physical copies of
// @memberjunction/* exist, which is safe server-side — MJ's BaseSingleton keeps one
// MJGlobal/ClassFactory on globalThis, so both apps share a single registry.
import { RESOLVER_PATHS as ACCOUNTING_RESOLVER_PATHS } from '@mj-biz-apps/accounting-server';

// Import the BizApps Orders server bootstrap (registers entities, actions, resolvers)
import { RESOLVER_PATHS as ORDERS_RESOLVER_PATHS } from '@mj-biz-apps/orders-server';

const RESOLVER_PATHS = [
    ...COMMON_RESOLVER_PATHS,
    ...ACCOUNTING_RESOLVER_PATHS,
    ...ORDERS_RESOLVER_PATHS,
];

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// NOTE: BizApps Accounting integration (Accounting.CreateJournalEntry remote ops,
// AccountingEngine) is wired in when the booking logic lands — npm-linked from the
// sibling bizapps-accounting repo at that point.

createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);

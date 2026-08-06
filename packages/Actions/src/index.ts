export * from './generated/action_subclasses.js';

// NOTHING SERVER-ONLY MAY LIVE HERE. This package is declared `shared` in mj-app.json, which means
// it is installed into BOTH MJAPI and MJExplorer — so anything reachable from this file is also
// reachable from the BROWSER bundle.
//
// The hand-authored actions (generate-invoice, send-document, open-payment-intent) and the invoice
// renderer moved to @mj-biz-apps/orders-server because they import
// @mj-biz-apps/orders-core-entities-server, which pulls in @memberjunction/storage and, through it,
// Node's `stream`. esbuild cannot bundle `stream` for a browser, so MJExplorer failed to build
// outright — 796 errors, no dev server, no UI.
//
// Keep this package to generated action subclasses (the shape bizapps-accounting and
// bizapps-common both have — neither has a single server dependency). A hand-authored action that
// touches the database or any server package belongs in packages/Server, with its Load* anchor
// called from that bootstrap.

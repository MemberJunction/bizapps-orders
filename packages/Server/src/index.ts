/**
 * @mj-biz-apps/orders-server — the SERVER BOOTSTRAP package.
 *
 * This is the package named in mj-app.json under packages.server with
 * role "bootstrap". At startup MJAPI dynamically imports it and calls the
 * function named by "startupExport" (LoadBizAppsOrdersServer below). That call —
 * plus the imports in this file — fires every @RegisterClass decorator in
 * this app's server-side packages, which is how MJ discovers your entities,
 * actions, and resolvers. Nothing else wires your code in.
 *
 * WHAT LIVES HERE
 *   src/generated/  — CodeGen GraphQLServer output (resolvers; do not edit)
 *   src/            — hand-written resolvers / engines / providers
 *
 * AFTER YOUR FIRST CODEGEN RUN: CodeGen writes src/generated/generated.ts
 * (GraphQL resolvers for your entities). Uncomment the export below so they
 * ship with the package, and commit the generated code with its migration:
 *
 *   export * from './generated/generated';
 *
 * TODO(template): rename the function to Load<YourApp>Server and keep it in
 * sync with mj-app.json "startupExport".
 */
import { LoadBizAppsOrdersEntitiesServer } from '@mj-biz-apps/orders-core-entities-server';
import { LoadBizAppsOrdersActions } from '@mj-biz-apps/orders-actions';

export function LoadBizAppsOrdersServer(): void {
    // Chain the sub-package loaders so a single startupExport call registers
    // everything. Importing the modules is what triggers @RegisterClass.
    LoadBizAppsOrdersEntitiesServer();
    LoadBizAppsOrdersActions();
}

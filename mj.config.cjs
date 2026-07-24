/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * MemberJunction CodeGen + server configuration for BizApps Orders.
   *
   * Minimal-distribution style: most settings come from package defaults
   * (@memberjunction/codegen-lib DEFAULT_CODEGEN_CONFIG, @memberjunction/server
   * DEFAULT_SERVER_CONFIG). Only deployment-specific settings live here.
   * Database/auth come from .env.
   */

  // ============================================================================
  // DEPLOYMENT-SPECIFIC CONFIGURATION (Required)
  // ============================================================================

  /**
   * Single-package (string) form: CodeGen generates THIS app's entity subclasses
   * into packages/Entities and everything imports them as
   * '@mj-biz-apps/orders-entities'.
   *
   * We intentionally do NOT use the schema->package MAP form that `mj app install`
   * writes. The map treats every listed schema as "external, skip local
   * generation" (CodeGenLib getExternalEntitySchemas), which is for pure OpenApp
   * consumers. This repo is the app under DEVELOPMENT: it generates the
   * __mj_BizAppsOrders schema locally and pulls its dependencies (common,
   * accounting, tasks) from their installed npm packages / soft UUID refs.
   * Those dependency schemas are kept out of CodeGen via excludeSchemas below.
   */
  entityPackageName: '@mj-biz-apps/orders-entities',

  /**
   * Additional schema info CodeGen can't infer from the DB. Declares the IsA
   * (Table-Per-Type) inheritance pairs (EventProduct IS-A Product, EventOrderLine
   * IS-A OrderLine) so CodeGen sets Entity.ParentID, mirrors parent fields as
   * virtual fields on the child, and JOINs the parent in the child's base view.
   */
  additionalSchemaInfo: 'codegen-schema-info.json',

  /**
   * Output paths for code generation (specific to this repo's layout).
   */
  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/Angular/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'GraphQLServer', directory: './packages/Server/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/Actions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/Entities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  /**
   * Build commands to run after code generation. Left EMPTY for the initial
   * scaffold: the first CodeGen run only needs to generate + persist entity
   * metadata. Package builds (which require `npm install` of the full MJ stack)
   * are run explicitly via `npm run build` once the generated code exists.
   */
  commands: [],

  /**
   * Open App installer layout. This distribution puts its server/client apps
   * under apps/ (not the MJ-repo default of packages/MJAPI + packages/MJExplorer).
   */
  openApps: {
    serverPackagePath: 'apps/MJAPI',
    clientPackagePath: 'apps/MJExplorer',
  },

  // ============================================================================
  // CodeGen Overrides
  // ============================================================================

  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      // BizApps family convention (matches published bizapps-common /
      // bizapps-accounting). Prefixes this app's entities so their MJ entity
      // names are globally unambiguous, e.g. 'MJ_BizApps_Orders: Products'.
      { SchemaName: '__mj_BizAppsOrders', EntityNamePrefix: 'MJ_BizApps_Orders: ', EntityNameSuffix: '' },
    ],
  },

  // Exclude core (__mj) AND every dependency schema. Orders references common /
  // accounting / tasks only by SOFT UUID (no cross-schema FKs), so their entities
  // ship from their own installed packages and must NOT be regenerated here.
  excludeSchemas: ['sys', 'staging', 'dbo', '__mj', '__mj_BizAppsCommon', '__mj_BizAppsAccounting', '__mj_BizAppsTasks'],

  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: the more-specific schema must come first because
      // substitution runs sequentially with a greedy regex. If '__mj' were
      // first it would also match the '__mj' prefix of '__mj_BizAppsOrders'.
      { schema: '__mj_BizAppsOrders', placeholder: '${flyway:defaultSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },
};

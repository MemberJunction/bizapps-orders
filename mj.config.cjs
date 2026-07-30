require('dotenv').config({ quiet: true });

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * Database connection for the CLI tools that DON'T go through MJServer's config merging —
   * `mj test` and `mj sync` read these keys directly and fail with "Database configuration
   * missing" without them. Values come from .env, which stays the single place credentials live.
   */
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbTrustServerCertificate:
    process.env.DB_TRUST_SERVER_CERTIFICATE === '1' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  coreSchema: process.env.MJ_CORE_SCHEMA || '__mj',

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
    /**
     * Remote Operation typed bases — the API surface, emitted from the
     * `MJ: Remote Operations` rows in metadata/remote-operations/.
     *
     * WHY THE ENTITIES PACKAGE. This is the app's only browser-safe shared
     * package (its sole dependency is `zod`), and both the Angular package and
     * every server package already depend on it. The generated bases are the
     * CONTRACT — a browser imports them and calls `.Execute()` without pulling
     * the server engine, which is the entire reason engine methods are exposed
     * as operations rather than as bespoke resolvers.
     *
     * KNOWN NOISE. Remote operations carry no schema, so CodeGen has no
     * core/non-core partition for them the way it does for entities (which key on
     * SchemaName). Every configured target therefore receives the FULL operation
     * set, so this file also picks up MJ's own core operations. That is harmless
     * here: all of them are GenerationType=Manual, which emits an unregistered
     * type shell — dead exported interfaces, no `@RegisterClass`, no runtime
     * effect, no duplicate ClassFactory registration. Upstream names a per-op
     * core/non-core marker as the open decision that would remove the noise.
     */
    { type: 'RemoteOperations', directory: './packages/Entities/src/generated' },
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

  // Exclude core (__mj) AND every dependency schema. Orders DOES take hard
  // cross-schema foreign keys into common and accounting — those are real
  // constraints, not soft UUID refs — but their ENTITIES ship from their own
  // installed packages and must not be regenerated here.
  excludeSchemas: ['sys', 'staging', 'dbo', '__mj', '__mj_BizAppsCommon', '__mj_BizAppsAccounting', '__mj_BizAppsTasks'],

  /**
   * Integration testing. `mj test` loads these modules before resolving a
   * `MJ: Tests` record's check bundles, which is the extension seam MJ's testing
   * framework exposes for external adopters. Our package registers its bundles on
   * `IntegrationCheckRegistry` as an import side effect.
   *
   * NOTE the module must be resolvable from the CLI's location — run the WORKSPACE
   * cli (`./node_modules/.bin/mj`), never a globally installed one, which ships its
   * own published testing packages and cannot see this private package.
   */
  testing: {
    checkModules: ['@mj-biz-apps/orders-integration-tests'],
  },

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

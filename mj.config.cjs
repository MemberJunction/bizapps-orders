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
   */
  entityPackageName: {
    '__mj_BizAppsOrders': '@mj-biz-apps/orders-entities',
    '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
    '__mj_BizAppsAccounting': '@mj-biz-apps/accounting-entities',
    '__mj_BizAppsTasks': '@mj-biz-apps/tasks-entities',
  },

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

  // ============================================================================
  // CodeGen Overrides
  // ============================================================================

  /**
   * AI "Advanced Generation" features, declared EXPLICITLY.
   *
   * WHY THIS BLOCK EXISTS AT ALL. MJ carries TWO default feature sets that disagree, and which one
   * you land on is decided by the SHAPE of your config rather than by anything you can see
   * (verified against MJ 5.51, `packages/CodeGenLib/src/Config/config.ts`):
   *
   *   - `DEFAULT_CODEGEN_CONFIG` (~line 879) enables the useful set and names it correctly:
   *     FormLayoutGeneration, ParseCheckConstraints, SmartFieldIdentification,
   *     TransitiveJoinIntelligence, VirtualEntityFieldDecoration.
   *   - The zod schema default on `features` (~line 185) is nearly all `false`, and names the
   *     layout feature `FormLayout` — while the code asks for `FormLayoutGeneration`
   *     (`Misc/advanced_generation.ts:480`). Under that set the feature can never run.
   *
   * Omit `advancedGeneration` entirely and you get the first. Declare it WITHOUT `features` and
   * the zod default fills in the second. Either way CodeGen exits 0 and reports success, so the
   * difference is invisible at the point of use — and it is the difference between the layout pass
   * running and silently never running.
   *
   * The list is an ALLOW-LIST, not a merge: `featureEnabled()` is
   * `enabled && getFeature(name)?.enabled === true`, so a feature absent from this array is OFF.
   * That is what makes declaring it deterministic — and it is also this block's one cost: a feature
   * MJ adds later will not reach this app until someone adds it here.
   *
   * The master switch is separate and is NOT set here: mjdev's generated `.mjrc.cjs` overlay owns
   * `enableAdvancedGeneration` (it flips to true when an AI provider key is configured, and
   * `--ai` / `--no-ai` force it per run). Setting it in both places would let them disagree.
   *
   * WHAT EACH ONE BUYS, and when it fires — several only run for NEWLY-CREATED entities/fields,
   * which on an established app means never, because the baseline migration inserts the metadata
   * before CodeGen looks. That is why the enriched baseline is produced against a bare database.
   *
   * DELIBERATELY OFF:
   *   EntityDescriptions — ours are hand-authored and reviewed; we do not want them rewritten.
   *   EntityNames        — renames entities, which breaks every 'MJ_BizApps_Orders: X' string in
   *                        the app, its specs, and any downstream app that references them.
   *
   * NOT LISTED because no code reads them — `EntityFieldDescriptions`, `FormTabs` and
   * `DefaultInViewFields` appear in MJ's default sets but have zero references anywhere in
   * `packages/CodeGenLib/src` outside `config.ts`, so they are dead knobs. Listing a dead knob
   * would read as coverage we do not have. SmartFieldIdentification does the DefaultInView work.
   *
   * Field DESCRIPTIONS do not come from AI at all — CodeGen imports them from
   * `sp_addextendedproperty` in the DDL. To document a column, document it in the migration.
   */
  advancedGeneration: {
    features: [
      // Every run: categorises fields with AutoUpdateCategory=1 and an empty Category, which is
      // what turns a flat field list into a real form layout.
      { name: 'FormLayoutGeneration', enabled: true },
      // Existing objects: CHECK-constraint descriptions + Validate() bodies in the subclasses.
      { name: 'ParseCheckConstraints', enabled: true },
      // Virtual entities lacking a soft PK/FK.
      { name: 'VirtualEntityFieldDecoration', enabled: true },
      // New entities/fields (and existing ones where auto-update is allowed): DefaultInView,
      // IsNameField, user-search flags.
      { name: 'SmartFieldIdentification', enabled: true },
      // New entities: junction / many-to-many detection.
      { name: 'TransitiveJoinIntelligence', enabled: true },
      { name: 'EntityDescriptions', enabled: false },
      { name: 'EntityNames', enabled: false },
    ],
  },

  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      // BizApps family convention (matches published bizapps-common /
      // bizapps-accounting). Prefixes this app's entities so their MJ entity
      // names are globally unambiguous, e.g. 'MJ_BizApps_Orders: Products'.
      { SchemaName: '__mj_BizAppsOrders', EntityNamePrefix: 'MJ_BizApps_Orders: ', EntityNameSuffix: '' },
    ],
  },

  includeSchemas: ['__mj_BizAppsOrders'],
  excludeSchemas: [
    'sys',
    'staging',
    'dbo',
    '__mj',
    '__mj_UDT',
    '__mj_BizAppsCommon',
    '__mj_BizAppsAccounting',
    '__mj_BizAppsTasks',
    '__mj_BizAppsIssues',
    '__mj_BizAppsForms',
    '__mj_BizAppsCommittees',
    '__mj_BizAppsSecureMessaging',
    '__mj_BizAppsATS',
    '__mj_BizAppsCaliber',
    '__mj_BizAppsMarketing',
    '__mj_BizAppsSonar',
    '__mj_BizAppsBCSaaS',
  ],

  /**
   * Server extensions — routes this app adds to MJServer.
   *
   * MJServer loads these BEFORE it installs the auth middleware, which is the only window an
   * unauthenticated webhook can be mounted in. That ordering is the entire reason the payment webhook
   * is an extension rather than something the bootstrap mounts: Stripe presents no bearer token, so
   * behind auth every delivery would be a 401 and no bank debit would ever capture.
   *
   * The route is `POST {RootPath}/:providerId`, one endpoint per configured `PaymentProvider` row.
   * The id in the path is what tells the handler which signing secret to verify against before it has
   * read a byte of the payload.
   *
   * Turning this off disables inbound gateway notifications entirely. That is survivable for cards
   * (a capture books when it is asked) and NOT survivable for ACH (a debit is captured BY the
   * webhook), so leave it on wherever a StripeACH provider is configured.
   */
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'OrdersPaymentWebhook',
      RootPath: '/webhooks/payments',
      Settings: {},
    },
  ],

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

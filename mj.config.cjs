/** @type {import('@memberjunction/config').MJConfig} */
//
// mj.config.cjs — MemberJunction configuration for the BizApps Orders Open App.
//
// Drives `mj codegen` (and, standalone, `mj migrate`). DB connection settings come
// from environment variables / .env — never credentials here. When this app is
// dev-linked into an instance, mjdev renders a gitignored root `.mjrc.cjs` overlay
// that scopes codegen to THIS app's schema; this file is the standalone/source-of-truth.
//
module.exports = {
  // The npm package that receives generated entity subclasses — matches
  // packages/Entities/package.json "name".
  entityPackageName: '@mj-biz-apps/orders-entities',

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

  // Build the generated packages after codegen so the emitted TypeScript compiles
  // and is committed alongside its source.
  commands: [
    { workingDirectory: './packages/Entities', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Actions', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Server', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: './packages/Angular', command: 'npm', args: ['run', 'build'], when: 'after' },
  ],

  // Prefix generated entity names so they never collide with MJ core ("MJ: ...") or
  // other apps. Must agree with the EntityNamePrefix the baseline migration writes into
  // __mj.SchemaInfo.
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      { SchemaName: '__mj_BizAppsOrders', EntityNamePrefix: 'MJ_BizApps_Orders: ', EntityNameSuffix: '' },
    ],
  },

  // CodeGen for THIS app touches ONLY its own schema. Exclude MJ core, system schemas,
  // and every OTHER dev-linked app schema in the instance (common / tasks / accounting) so
  // Orders codegen never regenerates their entities.
  excludeSchemas: [
    'sys',
    'staging',
    'dbo',
    '__mj',
    '__mj_BizAppsCommon',
    '__mj_BizAppsTasks',
    '__mj_BizAppsAccounting',
  ],

  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: more-specific schema names first (greedy sequential substitution).
      { schema: '__mj_BizAppsOrders', placeholder: '${flyway:defaultSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' },
    ],
  },
};

/**
 * MJAPI Server Configuration.
 *
 * Intentionally empty — ALL settings come from @memberjunction/server
 * (DEFAULT_SERVER_CONFIG), which reads deployment-specific values from
 * environment variables (.env):
 *
 * Database:  DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD,
 *            DB_TRUST_SERVER_CERTIFICATE, DB_READ_ONLY_USERNAME/PASSWORD,
 *            MJ_CORE_SCHEMA
 * Server:    GRAPHQL_PORT, GRAPHQL_ROOT_PATH, MJAPI_PUBLIC_URL,
 *            ENABLE_INTROSPECTION, MJ_API_KEY
 * Auth:      AUTH0_* / MSAL_* as configured
 */
module.exports = {
  dynamicPackages: {
    server: [
      {
        PackageName: '@mj-biz-apps/common-server',
        StartupExport: 'LoadBizAppsCommonServer',
        AppName: 'mj-bizapps-common',
        Enabled: true
      },
    ],
    client: [
      {
        PackageName: '@mj-biz-apps/common-ng',
        AppName: 'mj-bizapps-common',
        Enabled: true
      },
    
      {
        PackageName: '@mj-biz-apps/common-entities',
        AppName: 'mj-bizapps-common',
        Enabled: true
      },
    
      {
        PackageName: '@mj-biz-apps/common-actions',
        AppName: 'mj-bizapps-common',
        Enabled: true
      },
    ]
  },

  entityPackageName: {
    '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
  },

  excludeSchemas: ['__mj_BizAppsCommon'],
};

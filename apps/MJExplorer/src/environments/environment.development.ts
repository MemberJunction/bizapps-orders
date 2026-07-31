export const environment = {
    GRAPHQL_URI: 'http://localhost:4103/',
    GRAPHQL_WS_URI: 'ws://localhost:4103/',
    REDIRECT_URI: 'http://localhost:4200/',
    CLIENT_ID: '7e6e6ecf-66ff-4733-9c60-1e6def949897',
    TENANT_ID: 'ff10ade7-5d03-40a9-be28-cb7ab99670b1',
    CLIENT_AUTHORITY: 'https://login.microsoftonline.com/ff10ade7-5d03-40a9-be28-cb7ab99670b1',
    // Auth0 rather than MSAL: the MSAL flow cannot be driven headlessly, so
    // browser-based end-to-end runs authenticate against the Auth0 automation
    // tenant. Domain and client id below are the public SPA values for it.
    AUTH_TYPE: 'auth0',
    NODE_ENV: 'development',
    AUTOSAVE_DEBOUNCE_MS: 1200,
    SEARCH_DEBOUNCE_MS: 800,
    MIN_SEARCH_LENGTH: 3,
    MJ_CORE_SCHEMA_NAME: 'admin',
    production: false,
    APPLICATION_NAME: 'MemberJunction Explorer',
    APPLICATION_INSTANCE: 'DEV',
    AUTH0_DOMAIN: 'bluecypress-dev.us.auth0.com',
    AUTH0_CLIENTID: 'uRNpH3B0sFKVc2yrfBGBalfiUphUK5JI',
  } as const;
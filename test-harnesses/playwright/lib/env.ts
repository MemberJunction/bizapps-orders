/**
 * Environment settings for the bizapps-orders Explorer GUI harness.
 *
 * Every setting is overridable via environment variables so the harness follows
 * the running MJAPI and MJExplorer ports.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** test-harnesses/playwright */
export const HARNESS_DIR = path.resolve(HERE, '..');
/** Repo root. */
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..', '..');

export const API_PORT = Number(process.env.MJAPI_PORT ?? 4143);
export const EXPLORER_PORT = Number(process.env.MJEXPLORER_PORT ?? 4341);

export const API_BASE_URL = process.env.MJAPI_URL ?? `http://localhost:${API_PORT}`;
export const EXPLORER_BASE_URL = process.env.MJEXPLORER_URL ?? `http://localhost:${EXPLORER_PORT}`;

/**
 * Where the captured browser session lives.
 *
 * Explorer's MSAL and Auth0 providers both configure `cacheLocation: 'localStorage'`,
 * which Playwright's `storageState` captures. A human logs in once and subsequent
 * runs reuse the saved session state.
 *
 * Gitignored because the captured state is a live session token.
 */
export const AUTH_DIR = path.join(HARNESS_DIR, '.auth');
export const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');

/** Diagnostic screenshots directory. */
export const ARTIFACTS_DIR = path.join(HARNESS_DIR, 'artifacts');

/** How long the setup project waits for a human to complete the interactive login. */
export const LOGIN_TIMEOUT_MS = Number(process.env.PW_LOGIN_TIMEOUT_MS ?? 300_000);

/**
 * MJ entity names for bizapps-orders verified by the Playwright harness.
 */
export const ENTITY = {
  Products: 'MJ_BizApps_Orders: Products',
  ProductCategories: 'MJ_BizApps_Orders: Product Categories',
  ProductTypes: 'MJ_BizApps_Orders: Product Types',
  OrderHeaders: 'MJ_BizApps_Orders: Order Headers',
  PaymentHeaders: 'MJ_BizApps_Orders: Payment Headers',
  Subscriptions: 'MJ_BizApps_Orders: Subscriptions',
} as const;

/** Prefix for records created by this harness. */
export const TEST_PREFIX = 'PW-VERIFY';

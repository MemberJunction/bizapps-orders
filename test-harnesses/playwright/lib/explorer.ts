/**
 * Explorer driving helpers for the bizapps-orders GUI harness.
 *
 * Provides:
 *  1. `captureConsoleErrors` — collects unexpected console.error and pageerror events so
 *     specs can assert a clean console alongside DOM state.
 *  2. Session authentication detection and route helpers for MJExplorer.
 */
import { expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, EXPLORER_BASE_URL } from './env';

/**
 * Benign console.error patterns from framework/host chrome rather than application defects.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /MISSING FIELDS.*SetMany/i,
  /NG0100: ExpressionChangedAfterItHasBeenCheckedError[\s\S]*DataExplorerDashboardComponent/,
  /kit\.fontawesome\.com/i,
  /graph\.microsoft\.com\/v1\.0\/me\/photo/i,
];

export interface ErrorSink {
  errors: string[];
}

/** Wire console.error + pageerror capture for the life of the page. */
export function captureConsoleErrors(page: Page): ErrorSink {
  const sink: ErrorSink = { errors: [] };
  const benign = (msg: string) => IGNORED_CONSOLE_PATTERNS.some((re) => re.test(msg));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url ?? '';
    const subject = `${text} ${url}`;
    const assetNoise =
      /status of 404/i.test(text) && /(favicon\.ico|\.(?:ico|png|svg|gif|woff2?|map))(?:\?|$)/i.test(url);
    if (!benign(subject) && !assetNoise) {
      sink.errors.push(`console.error: ${text}${url ? ` [${url}]` : ''}`);
    }
  });
  page.on('pageerror', (e) => {
    if (!benign(e.message)) {
      sink.errors.push(`pageerror: ${e.message}`);
    }
  });
  return sink;
}

/** Assert no UI errors were captured; the failure message lists every one. */
export function expectNoConsoleErrors(sink: ErrorSink, context: string): void {
  expect(
    sink.errors,
    `Console/page errors captured while ${context}:\n  - ${sink.errors.join('\n  - ')}`,
  ).toEqual([]);
}

/** Drain the sink, returning what was in it. */
export function drain(sink: ErrorSink): string[] {
  const out = [...sink.errors];
  sink.errors.length = 0;
  return out;
}

/**
 * True once the authenticated Explorer shell is rendered.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  if (/\/app\//i.test(page.url())) return true;
  const chrome = page.locator('mj-nav, .app-switcher-button, [aria-label="Switch application"], mj-user-profile');
  return (await chrome.count()) > 0 && (await chrome.first().isVisible().catch(() => false));
}

/** Wait for the authenticated shell, however the user logged in. */
export async function waitForAuthenticatedShell(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAuthenticated(page)) {
      await page.waitForTimeout(3000);
      return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(
    [
      `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the authenticated Explorer shell at ${EXPLORER_BASE_URL}.`,
      '',
      'Fix it by forcing a headed re-login, which ignores the stored state:',
      '    PW_FORCE_LOGIN=1 pnpm --dir test-harnesses/playwright run auth',
    ].join('\n'),
  );
}

/**
 * Save a named screenshot into artifacts/ and return its path.
 * Never throws so diagnostic screenshot failures cannot abort a test run.
 */
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch (error) {
    console.log(
      `  (screenshot "${name}" failed, continuing: ${error instanceof Error ? error.message.slice(0, 120) : String(error)})`,
    );
    return '';
  }
}

/**
 * Probe candidate routes for an entity in the running Explorer client.
 */
export async function probeEntityRoutes(page: Page, entityName: string): Promise<string[]> {
  const encoded = encodeURIComponent(entityName);
  const candidates = [
    `/app/orders`,
    `/app/mjbizappsorders`,
    `/app/entity/${encoded}`,
    `/entity/${encoded}`,
    `/app/data/${encoded}`,
  ];
  const worked: string[] = [];
  for (const route of candidates) {
    try {
      await page.goto(`${EXPLORER_BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(2500);
      const settled = page.url();
      if (/\/app\/home/i.test(settled) && !/home/i.test(route)) continue;
      const grid = page.locator('mj-entity-grid, .ag-root, kendo-grid, mj-user-view-grid, table, mjo-section-shell');
      if ((await grid.count()) > 0) worked.push(`${route}  ->  ${settled}`);
    } catch {
      /* candidate does not resolve; continue probing */
    }
  }
  return worked;
}

/** Rows currently rendered in whatever grid the page is showing. */
export function gridRows(page: Page): Locator {
  return page.locator('.ag-center-cols-container .ag-row, kendo-grid tbody tr, mj-user-view-grid .ag-row');
}

/**
 * One-time interactive auth capture for the bizapps-orders Playwright harness.
 *
 * Runs headed when no `.auth/user.json` exists (or `PW_FORCE_LOGIN=1`). Opens MJExplorer,
 * waits up to `PW_LOGIN_TIMEOUT_MS` for a human to complete the identity-provider login,
 * and saves the resulting storageState to `.auth/user.json`.
 */
import { test as setup, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTH_DIR,
  ENTITY,
  EXPLORER_BASE_URL,
  LOGIN_TIMEOUT_MS,
  STORAGE_STATE_PATH,
} from './lib/env';
import {
  captureConsoleErrors,
  isAuthenticated,
  probeEntityRoutes,
  shot,
  waitForAuthenticatedShell,
} from './lib/explorer';

const ASSIST_PICK_ACCOUNT = process.env.PW_AUTH_ASSIST_PICK_ACCOUNT === '1';

async function pickAlreadySignedInAccount(page: import('@playwright/test').Page): Promise<void> {
  const deadline = Date.now() + 150_000;
  let clickedTile = false;
  let lastSeen = '';

  const allFrames = (): import('@playwright/test').Frame[] =>
    page.context().pages().flatMap((p) => p.frames());

  const findAcross = async (
    build: (f: import('@playwright/test').Frame) => import('@playwright/test').Locator,
  ): Promise<import('@playwright/test').Locator | null> => {
    for (const frame of allFrames()) {
      const loc = build(frame).first();
      const count = await loc.count().catch(() => 0);
      if (count && (await loc.isVisible().catch(() => false))) {
        return loc;
      }
    }
    return null;
  };

  while (Date.now() < deadline) {
    if (await isAuthenticated(page)) {
      console.log('  assist: authenticated shell reached.');
      return;
    }

    const where = page.context().pages().map((p) => p.url()).join(' | ');
    if (where !== lastSeen) {
      console.log(`  assist: pages -> ${where}`);
      lastSeen = where;
    }

    if (!clickedTile) {
      const tile = await findAcross((f) =>
        f.locator('button, div[role="button"]').filter({ hasText: /Signed in/i }),
      );
      if (tile) {
        const label = ((await tile.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        console.log(`  assist: clicking the already-signed-in account tile [${label}]`);
        await tile.click().catch(() => undefined);
        clickedTile = true;
        await page.waitForTimeout(3000);
        continue;
      }
    }

    const stayPrompt = await findAcross((f) => f.getByText(/Stay signed in\?/i));
    if (stayPrompt) {
      const no = await findAcross((f) =>
        f.locator('input#idBtn_Back, button').filter({ hasText: /^\s*No\s*$/ }),
      );
      if (no) {
        console.log('  assist: answering "Stay signed in?" with No');
        await no.click().catch(() => undefined);
        await page.waitForTimeout(3000);
        continue;
      }
    }

    const login = await findAcross((f) =>
      f.locator('button, a').filter({ hasText: /^\s*(Log ?in|Sign ?in|Sign in with Microsoft)\s*$/i }),
    );
    if (login) {
      console.log('  assist: clicking a "Log in" control to start the flow');
      await login.click().catch(() => undefined);
      await page.waitForTimeout(4000);
      continue;
    }

    await page.waitForTimeout(2000);
  }
  console.log(`  assist: gave up. Last pages seen -> ${lastSeen}`);
}

setup('capture an authenticated Explorer session (human logs in)', async ({ page, context }) => {
  const sink = captureConsoleErrors(page);

  await page.goto(EXPLORER_BASE_URL, { waitUntil: 'domcontentloaded' });

  if (await isAuthenticated(page)) {
    console.log('\n  Already authenticated (an existing session was reused).\n');
  } else {
    const mins = Math.round(LOGIN_TIMEOUT_MS / 60_000);
    console.log(
      [
        '',
        '  ' + '='.repeat(74),
        '  ACTION REQUIRED — complete the login in the browser window that just opened.',
        '',
        `    Explorer:  ${EXPLORER_BASE_URL}`,
        '    Click "Log in" and authenticate.',
        '',
        '    This harness will NOT touch your credentials. It is only watching for the',
        '    authenticated app shell to appear, and will continue automatically when it does.',
        '',
        `    Waiting up to ${mins} minutes...`,
        '  ' + '='.repeat(74),
        '',
      ].join('\n'),
    );
    await shot(page, '00-login-screen');
    if (ASSIST_PICK_ACCOUNT) {
      await pickAlreadySignedInAccount(page);
    }
    await waitForAuthenticatedShell(page, LOGIN_TIMEOUT_MS);
    console.log('  Authenticated shell detected — capturing session.\n');
  }

  await shot(page, '01-authenticated-shell');

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`  session saved -> ${STORAGE_STATE_PATH}`);

  const recon: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    explorerUrl: EXPLORER_BASE_URL,
    landedUrl: page.url(),
    pageTitle: await page.title(),
    appSwitcherPresent:
      (await page.locator('.app-switcher-button, [aria-label="Switch application"]').count()) > 0,
  };

  const productRoutes = await probeEntityRoutes(page, ENTITY.Products);
  recon.productRoutesThatRendered = productRoutes;
  recon.consoleErrorsDuringAuth = sink.errors;

  writeFileSync(path.join(AUTH_DIR, 'recon.json'), JSON.stringify(recon, null, 2), 'utf8');
  console.log(`  recon written -> ${path.join(AUTH_DIR, 'recon.json')}`);

  expect(await isAuthenticated(page), 'must end this setup authenticated').toBe(true);
});

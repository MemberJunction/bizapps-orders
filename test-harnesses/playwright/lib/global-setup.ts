/**
 * Preflight check for the bizapps-orders Playwright harness.
 *
 * Verifies that MJAPI and MJExplorer are reachable before running any spec, and
 * optionally verifies that MJAPI serves orders metadata when `MJ_API_KEY` is set.
 */
import { mkdirSync } from 'node:fs';
import { API_BASE_URL, ARTIFACTS_DIR, AUTH_DIR, EXPLORER_BASE_URL, ENTITY } from './env';

async function reachable(url: string, timeoutMs = 10_000): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ordersEntitiesPresent(): Promise<{ ok: boolean; detail: string }> {
  const apiKey = process.env.MJ_API_KEY;
  if (!apiKey) {
    return { ok: true, detail: 'skipped (no MJ_API_KEY in env — cannot query; not treated as a failure)' };
  }
  try {
    const res = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
      body: JSON.stringify({
        query: '{ __type(name: "mjBizAppsOrdersProduct_") { name } }',
      }),
    });
    const json = (await res.json()) as { data?: { __type?: { name?: string } }; errors?: unknown };
    if (json?.data?.__type?.name === 'mjBizAppsOrdersProduct_') {
      return { ok: true, detail: 'MJAPI serves orders GraphQL schema types' };
    }
    return { ok: false, detail: `unexpected response: ${JSON.stringify(json).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, detail: `query failed: ${(e as Error).message}` };
  }
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const problems: string[] = [];

  if (!(await reachable(API_BASE_URL))) {
    problems.push(
      `MJAPI is not reachable at ${API_BASE_URL}\n` +
        `      check:  override with MJAPI_PORT=<port> or MJAPI_URL=<url> if your host differs.\n` +
        `      start:  from the MJ host checkout`,
    );
  }
  if (!(await reachable(EXPLORER_BASE_URL))) {
    problems.push(
      `MJExplorer is not reachable at ${EXPLORER_BASE_URL}\n` +
        `      check:  override with MJEXPLORER_PORT=<port> or MJEXPLORER_URL=<url> if your host differs.\n` +
        `      start:  ng serve from the MJ host's MJExplorer`,
    );
  }

  if (problems.length) {
    throw new Error(
      `\nbizapps-orders Playwright harness — preflight FAILED.\n\n  - ${problems.join('\n  - ')}\n`,
    );
  }

  const meta = await ordersEntitiesPresent();
  if (!meta.ok) {
    throw new Error(
      `\nMJAPI is up but is not serving orders metadata.\n  ${meta.detail}\n\n` +
        `Restart MJAPI and MJExplorer from the MJ host checkout after running migrations and codegen.\n`,
    );
  }

  console.log(`  preflight: MJAPI ${API_BASE_URL} up · MJExplorer ${EXPLORER_BASE_URL} up`);
  console.log(`  preflight: ${meta.detail}`);
  console.log(`  preflight: target entity "${ENTITY.Products}"`);
}

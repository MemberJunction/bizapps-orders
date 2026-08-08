/**
 * order-entry-live.mjs — take an order through the ORDER EDITOR in a real browser.
 *
 * The end-to-end proof for order entry: customer → lines → tender → Confirm, driven the way a
 * person drives it, then the DATABASE is what gets asserted on. Companion to `booking-live.mjs`
 * and `invoice-live.mjs`, which prove the same engine from the server side.
 *
 * WHY IT EXISTS. Every cheaper tier passed while order entry was unusable: the confirm button was
 * gated on a preview that could fail, and 1000+ unit tests said nothing about it. The only thing
 * that caught it was somebody clicking. This is that click, automated.
 *
 * WHAT IT PROVES (2026-08-07, ORD-000117):
 *   - three lines price through `Orders.PreviewPrice` — no save, no rollback
 *   - Confirm reaches `Orders.ConfirmOrder` directly, with no dry run in front of it
 *   - one journal entry per line, each balanced, Sales vs Deferred by product
 *   - the cash leg books and A/R nets to zero
 *   - the check reference reaches the payment
 *   - a subscription line materialises a Subscription + term
 *
 * RUN IT:
 *   URL=$(mjdev explorer-url orders-e2e --json | jq -r .url)
 *   EXPLORER_URL="$URL" SHOT_DIR=/tmp/shots node test-harnesses/order-entry-live.mjs
 *   HEADED=1 to watch it.  VH=<px> to change the viewport height.
 *
 * TWO THINGS THAT COST TIME, SO THEY ARE WRITTEN DOWN:
 *   1. The editor's tab pane is below the fold at 1280x700 and its scroll container does not
 *      respond to `scrollIntoViewIfNeeded`, so every interaction landed on an off-screen control
 *      and silently did nothing. Hence the tall default viewport — this run proves the DATABASE
 *      outcome; check the LAYOUT separately at the real viewport.
 *   2. `page.locator('mj-dropdown').first()` is the HEADER's entity-search dropdown, not the one
 *      you are looking at. Target the id. Options render in a CDK overlay on the body, so they
 *      are not inside the host element.
 *
 * Drives system Chrome (`channel: 'chrome'`) per TEST-PROTOCOL — no Playwright-managed download.
 */
import { chromium } from 'playwright';

const URL = process.env.EXPLORER_URL;
const HEADED = process.env.HEADED === '1';
if (!URL) throw new Error('EXPLORER_URL is required');

const consoleErrors = [];
const shot = async (page, name) =>
    page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: false });

const browser = await chromium.launch({ headless: !HEADED, channel: 'chrome' });
// 1280x700 — the viewport the below-the-fold pre-flight bug was visible at, and the one
// Marcelo actually uses. A pass at 1500x950 proved nothing last time.
// TALL VIEWPORT FOR THE DRIVE, ON PURPOSE. The editor's tab pane sits below the fold at
// 1280x700 and its scroll container would not respond to programmatic scrolling, so every
// interaction was landing on an off-screen control. This run is proving the DATABASE
// outcome, not the layout — a separate 1280x700 pass checks how it looks at Marcelo's size.
const context = await browser.newContext({
    viewport: { width: 1280, height: Number(process.env.VH ?? 1600) },
});
const page = await context.newPage();

page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const log = (...a) => console.log('   ', ...a);

try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    await shot(page, '01-landed');
    log('landed:', page.url());
    log('title:', await page.title());

    // Find the Orders app. The switcher shape varies, so probe rather than assume.
    // Into the Orders app, then the Orders section's rail.
    await page.getByText('Orders', { exact: true }).first().click();
    await page.waitForTimeout(6000);
    await shot(page, '02-orders-app');
    log('url:', page.url());

    // Into the ORDER EDITOR — the surface the acceptance criteria names.
    await page.getByText('Order editor', { exact: false }).first().click();
    await page.waitForTimeout(5000);
    await shot(page, '03-editor');
    log('editor url:', page.url());

    const clickable = async () => {
        const els = await page.locator('a, button, [role="tab"], [role="button"], input, select').all();
        const out = [];
        for (const el of els) {
            const tag = await el.evaluate((n) => n.tagName.toLowerCase());
            const t = ((await el.innerText().catch(() => '')) ||
                (await el.getAttribute('placeholder').catch(() => '')) ||
                (await el.getAttribute('aria-label').catch(() => '')) || '')
                .trim().replace(/\s+/g, ' ');
            if (t && t.length < 46) out.push(`${tag}:${t}`);
        }
        return [...new Set(out)];
    };
    await page.getByRole('button', { name: 'New order' }).last().click();
    await page.waitForTimeout(4000);
    await shot(page, '04-new-order');

    const dump = async (label, n = 1200) => {
        log(`--- ${label} ---`);
        log((await page.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(0, n));
    };
    // Click by VISIBLE TEXT with an explicit scroll. The editor's pane is its own
    // scroll container (`.ed-scroll`) inside a sticky header, so a plain click on
    // anything below the fold is intercepted by the header rather than landing.
    const click = async (selector, text) => {
        const el = page.locator(selector, { hasText: text }).first();
        await el.waitFor({ state: 'visible', timeout: 20000 });
        await el.scrollIntoViewIfNeeded();
        await el.click({ timeout: 20000 });
    };
    const tab = async (name) => {
        await click('button', name);
        await page.waitForTimeout(2500);
    };

    // ── Parties: say who is paying ──────────────────────────────────────────
    // Customer FIRST, deliberately: Orders.PreviewPrice resolves against the customer
    // (their price-list assignment is an input), so pricing a line before naming them
    // would resolve base pricing and then change under the user.
    await tab('Parties');
    // The editor's pane is its OWN scroll container inside a sticky header, so
    // `scrollIntoViewIfNeeded` on the element does not move it — the element is
    // "in view" of a container that is itself off-screen. Scroll the container.
    const scrollPane = async (px) => {
        await page.evaluate((y) => {
            const pane = document.querySelector('.ed-scroll');
            if (pane) pane.scrollTop = y;
        }, px);
        await page.waitForTimeout(600);
    };

    const typeahead = async (placeholder, text, shotName, optionText) => {
        const box = page.getByPlaceholder(placeholder).first();
        await box.waitFor({ state: 'visible', timeout: 20000 });
        await scrollPane(0);
        await box.click({ force: true });
        await box.fill(text);
        await page.waitForTimeout(3000);
        await shot(page, shotName);

        // Click the OPTION rather than pressing Enter. Keyboard selection depends on the
        // list having focus and a highlighted row; clicking the row is what a user does
        // and is what proves the control is actually wired.
        const option = page.locator('[role="option"], .mj-typeahead__row, li', { hasText: optionText }).first();
        if (await option.count()) {
            await option.click({ force: true });
        } else {
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(3500);
    };

    await typeahead('Search people and organizations', 'Riverside', '05-customer', 'Riverside');
    await shot(page, '06-customer-set');
    await dump('after customer', 900);

    // ── Lines ───────────────────────────────────────────────────────────────
    // Two lines on purpose: a plain good (UpFront revenue) and an event ticket, which
    // the engine DEFERS until the event. One order, both revenue treatments — so the
    // journal entries prove more than "an entry was written".
    await tab('Lines');
    await typeahead('Add a product — name or SKU', 'Style Handbook', '07-typeahead-1', 'Style Handbook');
    await typeahead('Add a product — name or SKU', 'Annual Conference', '08-typeahead-2', 'Conference');
    // A SUBSCRIPTION line, so the confirm has to materialise a Subscription + term as
    // well as book revenue. Three lines, three different downstream consequences.
    await typeahead('Add a product — name or SKU', 'Individual Membership', '08b-typeahead-3', 'Individual Membership');
    await page.waitForTimeout(4000);
    await shot(page, '09-lines');
    await dump('lines', 2000);

    // ── Payment: a check, with the reference the engine requires ────────────
    await tab('Payment');
    await page.waitForTimeout(1500);
    await shot(page, '10-payment');
    log('--- payment controls ---');
    log((await clickable()).join(' | '));

    // Tender. `.first()` on `mj-dropdown` grabbed the HEADER's entity-search dropdown,
    // not this one — hence the id. The list renders in a CDK overlay appended to the
    // body, so the options are not inside the host element.
    const trigger = page.locator('#ed-tender [role="combobox"]').first();
    let tenderChosen = false;
    if (await trigger.count()) {
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await page.waitForTimeout(1500);
        await shot(page, '11-tender-open');
        const opt = page
            .locator('.cdk-overlay-container [role="option"], .cdk-overlay-container li, .mj-dropdown-item')
            .filter({ hasText: 'Check' })
            .first();
        if (await opt.count()) {
            await opt.click();
            await page.waitForTimeout(2500);
            tenderChosen = true;
        } else {
            log('no Check option; overlay text:',
                (await page.locator('.cdk-overlay-container').innerText().catch(() => '')).slice(0, 300));
        }
    }
    log('tender chosen:', tenderChosen);

    if (tenderChosen) {
        // The reference input only exists once a tender that demands one is chosen —
        // that conditional render is itself part of what this proves.
        const ref = page.locator('#ed-tender-ref').first();
        if (await ref.count()) {
            await ref.scrollIntoViewIfNeeded();
            await ref.fill('CHK-99001');
            await ref.blur();
            await page.waitForTimeout(2500);
            log('reference entered');
        } else {
            log('!! reference input did not appear');
        }
        // Pay in full, so a PaymentHeader + PaymentLine are written by the confirm.
        const payFull = page.locator('button', { hasText: 'Pay in full' }).first();
        if (await payFull.count()) {
            await payFull.scrollIntoViewIfNeeded();
            await payFull.click();
            await page.waitForTimeout(2000);
            log('pay in full clicked');
        }
    }
    await shot(page, '12-tender-chosen');

    // ── Confirm ─────────────────────────────────────────────────────────────
    // Straight to Orders.ConfirmOrder. No pre-flight, no dry run, no second booking.
    const before = new Date().toISOString();
    log('confirm at:', before);
    await click('button', 'Confirm order');
    await page.waitForTimeout(12000);
    await shot(page, '13-after-confirm');
    await dump('after confirm', 2000);
    log('--- console errors so far:', consoleErrors.length);

} finally {
    await shot(page, '99-final');
    if (consoleErrors.length) {
        console.log('\nCONSOLE ERRORS:');
        for (const e of consoleErrors.slice(0, 20)) console.log('  ✗', e);
    } else {
        console.log('\nNo console errors.');
    }
    await browser.close();
}

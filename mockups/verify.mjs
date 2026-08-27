/**
 * mockups/verify.mjs — does every mockup actually work?
 *
 *     node mockups/verify.mjs
 *
 * Two passes, because parsing clean is not the same as working:
 *
 *   1. RENDER — mount every screen in jsdom and assert it built its page: no
 *      runtime error, a non-empty body, the <template> consumed, and no template
 *      literal, "undefined" or NaN leaked into the markup.
 *   2. INTERACT — drive the real affordances on the screens that carry logic and
 *      assert the numbers move correctly (fast entry recomputes and ties out,
 *      allocation reaches zero, over-applying surfaces the credit, the pricing
 *      walk changes band with quantity).
 *
 * Offline — the Font Awesome CDN link is stripped before parsing, so the only
 * assets loaded are the local scripts. Run it after touching anything in here.
 *
 * Three real bugs were caught by this and would not have been caught by reading:
 *   - unguarded localStorage, which throws on a file:// origin and blanked the page
 *   - an id on a slot wrapper, which the shell consumes during mount
 *   - template literals left in static HTML, rendering as ${''}
 */
import jsdomPkg from 'jsdom';
const { JSDOM, VirtualConsole } = jsdomPkg;
import fs from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;

async function load(rel) {
  const file = path.join(root, rel);
  const html = fs.readFileSync(file, 'utf8').replace(/<link[^>]*cdnjs[^>]*>/g, '');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'file://' + file, runScripts: 'dangerously',
    resources: 'usable', virtualConsole: vc, pretendToBeVisual: true });
  await new Promise(r => setTimeout(r, 150));
  return { dom, doc: dom.window.document, win: dom.window, errs };
}
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

console.log('── render ──');
const files = ['index.html',
  ...['orders/dashboard', 'orders/list', 'orders/fast-entry', 'orders/editor', 'orders/document',
      'orders/return', 'orders/fulfillment', 'payments/dashboard', 'payments/list', 'payments/entry',
      'payments/refund', 'payments/credit', 'receivables/aging', 'receivables/overdue',
      'receivables/subscriptions', 'receivables/statement', 'catalog/products', 'catalog/pricing', 'catalog/promotions',
      'catalog/charges-tax'].map(f => f + '.html')];

let failures = 0;
for (const rel of files) {
  const { dom, doc, errs } = await load(rel);
  const app = doc.querySelector('.mj-app');
  const body = doc.querySelector('.mj-page-body');
  const bodyLen = body ? body.innerHTML.trim().length : 0;

  const problems = [];
  if (errs.length) problems.push(...errs);
  if (!app) problems.push('no .mj-app frame rendered');
  if (bodyLen < 400) problems.push(`page body nearly empty (${bodyLen} chars)`);
  if (doc.getElementById('page')) problems.push('<template id="page"> was not consumed');
  // Rendered markup only — <script> elements live in <body>, and their source
  // legitimately contains template literals and the token "NaN".
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, template').forEach(n => n.remove());
  const markup = clone.innerHTML;
  if (markup.includes('${')) problems.push('literal ${ found in rendered DOM');
  if (/>\s*undefined\s*</.test(markup)) problems.push('rendered the word "undefined" into markup');
  if (/>\s*NaN|NaN\s*</.test(markup) || markup.includes('$NaN')) problems.push('rendered NaN');

  if (problems.length) {
    failures++;
    console.log('FAIL ' + rel);
    problems.slice(0, 4).forEach(p => console.log('      ' + String(p).slice(0, 260)));
  } else {
    const rail = doc.querySelectorAll('.mj-rail a').length;
    const rows = doc.querySelectorAll('table.mj-table tbody tr').length;
    const overlays = doc.querySelectorAll('.mj-modal, .mj-slide-in').length;
    console.log(`ok   ${rel.padEnd(31)} body=${String(bodyLen).padStart(6)}  rail=${rail}  rows=${String(rows).padStart(3)}  overlays=${overlays}`);
  }
  dom.window.close();
}

console.log('\n── interact ──');
let fails = 0;

const check = (name, cond, extra='') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  — ' + extra : ''));
  if (!cond) fails++;
};

// ── fast entry: add a line, totals must recompute and tie out ──────────────
{
  console.log('\nfast-entry.html');
  const { doc, win, errs } = await load('orders/fast-entry.html');
  const total = () => doc.querySelector('#fe-ladder .is-total .amt').textContent.trim();
  const lines = () => doc.querySelectorAll('#fe-lines .mj-linecard').length;
  const before = total(), nBefore = lines();
  check('2 starting lines', nBefore === 2, `${nBefore} found`);
  check('total is $1,621.57', before === '$1,621.57', before);

  win.eval("FE.add('PR2')");                                     // add a conference ticket
  check('line added', lines() === 3, lines() + ' lines');
  const after = total();
  check('total recomputed', after !== before, `${before} → ${after}`);
  check('total is $2,654.57', after === '$2,654.57', after);

  win.eval('FE.bump(1, 5)');                                     // handbook 5 → 10 units
  const t2 = total();
  check('qty change moves the total', t2 !== after, `${after} → ${t2}`);

  win.eval('FE.remove(2)');
  check('line removed', lines() === 2, lines() + ' lines');

  doc.getElementById('fe-code').value = 'MEMBER40'; win.eval('FE.addCode()');                            // order-level promo allocates
  const shares = doc.querySelectorAll('#fe-lines .mj-consequence').length;
  check('order promo renders allocation chips', shares > 0);
  const ladderRows = doc.querySelectorAll('#fe-ladder .mj-ladder-row').length;
  check('ladder has rows', ladderRows >= 5, ladderRows + ' rows');
  check('no runtime errors', errs.length === 0, errs.join('; '));
}

// ── list: presets filter, row opens the slide-in ───────────────────────────
{
  console.log('\nlist.html');
  const { doc, win, errs } = await load('orders/list.html');
  const rows = () => doc.querySelectorAll('#lst-rows tr').length;
  const all = rows();
  const chip = doc.querySelector('.mj-filter-chip[data-value="overdue"]');
  click(win, chip);
  const od = rows();
  check('overdue preset narrows the list', od < all && od > 0, `${all} → ${od}`);
  check('chip became active', chip.classList.contains('is-active'));

  click(win, doc.querySelector('.mj-filter-chip[data-value="lxp"]'));
  const lxp = rows();
  check('LXP preset works', lxp === 2, lxp + ' rows');

  click(win, doc.querySelector('.mj-filter-chip[data-value="all"]'));
  const row = doc.querySelector('#lst-rows tr');
  click(win, row.querySelector('td'));
  const sl = doc.getElementById('preview');
  check('row opens the preview', sl.classList.contains('is-open'));
  check('preview populated', doc.getElementById('pv-body').innerHTML.length > 300);
  check('backdrop shown', !!doc.querySelector('.mj-backdrop.is-open'));
  click(win, sl.querySelector('[data-close]'));
  check('close works', !sl.classList.contains('is-open'));
  check('no runtime errors', errs.length === 0, errs.join('; '));
}

// ── editor: tabs, line drawer ──────────────────────────────────────────────
{
  console.log('\neditor.html');
  const { doc, win, errs } = await load('orders/editor.html');
  check('meta chips rendered', doc.getElementById('ed-meta').innerHTML.includes('Draft'));
  check('money strip total', doc.getElementById('ed-money').textContent.includes('$1,621.57'));
  check('2 line rows', doc.querySelectorAll('#ed-lines tr').length === 2);
  check('charges: 4 rows + total', doc.querySelectorAll('#ed-charges tr').length === 5);
  check('taxable base shows $385.00', doc.getElementById('ed-basebox').textContent.includes('$385.00'));
  check('2 JE groups', doc.querySelectorAll('#ed-jes .ed-je').length === 2);
  check('12 recognition periods', doc.querySelectorAll('#ed-waterfall > div > div').length === 12);

  const tab = doc.querySelector('.mj-tab[data-tab="charges"]');
  click(win, tab);
  check('tab activates', tab.classList.contains('is-active'));
  check('charges pane visible', doc.querySelector('[data-pane="charges"]').classList.contains('is-active'));
  check('lines pane hidden', !doc.querySelector('[data-pane="lines"]').classList.contains('is-active'));

  click(win, doc.querySelector('#ed-lines tr td'));
  const dr = doc.getElementById('line-drawer');
  check('line drawer opens', dr.classList.contains('is-open'));
  const dbody = doc.getElementById('ld-body').innerHTML;
  check('drawer has the subscription section', dbody.includes('SUB-2038'));
  check('drawer titled', doc.getElementById('ld-title').textContent.includes('Annual Membership'));

  win.eval("MJ.open('#preflight')");
  check('pre-flight opens', doc.getElementById('preflight').classList.contains('is-open'));
  check('pre-flight lists both entries', doc.getElementById('pf-body').textContent.includes('2 entries'));
  check('no runtime errors', errs.length === 0, errs.join('; '));
}

// ── payment entry: auto-apply must reach zero unallocated ──────────────────
{
  console.log('\npayments/entry.html');
  const { doc, win, errs } = await load('payments/entry.html');
  const un = () => doc.getElementById('pe-unalloc-v').textContent.trim();
  check('starts unallocated', un() === '$7,076.77', un());
  win.eval('PE.auto()');
  check('auto-apply reaches zero', un() === '$0.00', un());
  check('unallocated box turns green', doc.getElementById('pe-unalloc').classList.contains('is-zero'));
  check('capture enabled', !doc.getElementById('pe-capture').classList.contains('is-disabled'));
  const rows = doc.querySelectorAll('#pe-rows input.pe-alloc-input');
  const sum = Array.from(rows).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
  check('allocations sum to the amount', Math.abs(sum - 7076.77) < 0.005, sum.toFixed(2));
  check('cross-company note appears', doc.getElementById('pe-effects').textContent.includes('crosses companies'));

  win.eval("PE.set('ORD-1005', '1000')");   // over-apply a $377.77 order
  check('over-apply surfaces credit', doc.getElementById('pe-effects').textContent.includes('creates account credit'));
  check('unallocated goes negative', un().startsWith('−'), un());
  check('capture disabled again', doc.getElementById('pe-capture').classList.contains('is-disabled'));
  check('no runtime errors', errs.length === 0, errs.join('; '));
}

// ── charges & tax: segmented panes + the tax-why walk ──────────────────────
{
  console.log('\ncatalog/charges-tax.html');
  const { doc, win, errs } = await load('catalog/charges-tax.html');
  check('charge rows present', doc.querySelectorAll('#cx-rows tr').length === 6);
  const seg = doc.querySelector('.mj-segmented button[data-value="exempt"]');
  click(win, seg);
  check('exempt pane visible', !doc.getElementById('cx-pane-exempt').classList.contains('hidden'));
  check('charges pane hidden', doc.getElementById('cx-pane-charges').classList.contains('hidden'));
  check('nexus rows', doc.querySelectorAll('#cx-nexus tr').length === 3);

  const sel = doc.getElementById('cw-line');
  check('tax-why defaults to the taxed line', doc.getElementById('cw-out').textContent.includes('$36.57'));
  sel.value = 'exempt';
  sel.dispatchEvent(new win.Event('change'));
  check('switching to exempt re-renders', doc.getElementById('cw-out').textContent.includes('WA-EX-88213'));
  check('no runtime errors', errs.length === 0, errs.join('; '));
}

// ── pricing: the resolution walk reacts to quantity ────────────────────────
{
  console.log('\ncatalog/pricing.html');
  const { doc, win, errs } = await load('catalog/pricing.html');
  const out = () => doc.getElementById('pw-out').textContent;
  check('walk renders', out().includes('The walk'));
  check('qty 5 lands in band 1–9', out().includes('1–9'), '');
  const qty = doc.getElementById('pw-qty');
  qty.value = '25';
  qty.dispatchEvent(new win.Event('input'));
  check('qty 25 moves the band', out().includes('10–49'), '');
  check('resolved unit becomes $72.00', out().includes('$72.00'));
  check('no runtime errors', errs.length === 0, errs.join('; '));
}


const total = failures + fails;
console.log('\n' + (total
  ? `FAILED — ${failures} render, ${fails} interaction`
  : `all ${files.length} screens render clean and every interaction check passed`));
process.exit(total ? 1 : 0);

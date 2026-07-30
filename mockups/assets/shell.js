/* ============================================================================
   Mockup shell harness

   Builds the app frame ONCE, here, so no screen hand-rolls chrome. A screen is
   just its content plus a mount call:

     <template id="page">
       <div slot="meta">…</div>          → <mj-page-header> [meta]
       <div slot="actions">…</div>       → <mj-page-header> [actions]
       <div slot="toolbar">…</div>       → <mj-page-header> [toolbar]
       <div slot="body">…</div>          → <mj-page-body>
       <div slot="overlays">…</div>      → appended outside the layout
     </template>
     <script>MJ.mount({ nav:'orders', rail:'list', title:'All orders', … })</script>

   The slot names are MJ's real projection slots, so the Angular translation is
   mechanical. Interaction wiring is declarative (data-* attributes) so screens
   carry almost no script of their own.
   ============================================================================ */

/** Money formatter usable from inside the shell helpers (F lives in data.js). */
function MJFmtMoney(n) {
  return (typeof F !== 'undefined') ? F.money(n)
    : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MJ = (() => {

  /* ── Navigation map — the IA from plans/orders-ux.md §4 ──────────────── */
  const NAV = [
    { key: 'orders', label: 'Orders', icon: 'fa-solid fa-file-invoice-dollar', home: 'orders/dashboard.html',
      rail: [
        { group: null },
        { key: 'dashboard',   label: 'Dashboard',        icon: 'fa-solid fa-gauge-high',      href: 'orders/dashboard.html' },
        { key: 'list',        label: 'All orders',       icon: 'fa-solid fa-table-list',      href: 'orders/list.html' },
        { key: 'fast',        label: 'Fast entry',       icon: 'fa-solid fa-bolt',            href: 'orders/fast-entry.html' },
        { key: 'editor',      label: 'Order editor',     icon: 'fa-solid fa-pen-ruler',       href: 'orders/editor.html' },
        { group: 'Work' },
        { key: 'fulfillment', label: 'Fulfillment queue',icon: 'fa-solid fa-dolly',           href: 'orders/fulfillment.html', badge: 3 },
        { key: 'returns',     label: 'Returns',          icon: 'fa-solid fa-rotate-left',     href: 'orders/return.html' },
      ]},
    { key: 'payments', label: 'Payments', icon: 'fa-solid fa-money-check-dollar', home: 'payments/dashboard.html',
      rail: [
        { group: null },
        { key: 'dashboard', label: 'Dashboard',      icon: 'fa-solid fa-gauge-high',       href: 'payments/dashboard.html' },
        { key: 'list',      label: 'All payments',   icon: 'fa-solid fa-table-list',       href: 'payments/list.html' },
        { key: 'entry',     label: 'Take a payment', icon: 'fa-solid fa-hand-holding-dollar', href: 'payments/entry.html' },
        { group: 'Work' },
        { key: 'refund',    label: 'Refunds',        icon: 'fa-solid fa-arrow-rotate-left', href: 'payments/refund.html' },
        { key: 'credit',    label: 'Account credits',icon: 'fa-solid fa-piggy-bank',        href: 'payments/credit.html', badge: 1 },
      ]},
    { key: 'receivables', label: 'Receivables', icon: 'fa-solid fa-chart-column', home: 'receivables/aging.html',
      rail: [
        { group: null },
        { key: 'aging',   label: 'Customer A/R',   icon: 'fa-solid fa-user-tag',      href: 'receivables/aging.html' },
        { key: 'overdue', label: 'Overdue worklist', icon: 'fa-solid fa-hourglass-half', href: 'receivables/overdue.html', badge: 4 },
        { key: 'subs',    label: 'Subscriptions',  icon: 'fa-solid fa-rotate',        href: 'receivables/subscriptions.html' },
      ]},
    { key: 'catalog', label: 'Catalog', icon: 'fa-solid fa-box-open', home: 'catalog/products.html',
      rail: [
        { group: null },
        { key: 'products',   label: 'Products & categories', icon: 'fa-solid fa-boxes-stacked', href: 'catalog/products.html' },
        { key: 'pricing',    label: 'Pricing',               icon: 'fa-solid fa-tags',          href: 'catalog/pricing.html' },
        { key: 'promotions', label: 'Promotions',            icon: 'fa-solid fa-percent',       href: 'catalog/promotions.html' },
        { key: 'charges',    label: 'Charges & tax',         icon: 'fa-solid fa-receipt',       href: 'catalog/charges-tax.html' },
      ]},
  ];

  let BASE = '../';

  /* ── Theme ────────────────────────────────────────────────────────────── */
  function initTheme() {
    const saved = localStorage.getItem('mj-mock-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    if (localStorage.getItem('mj-mock-notes') === 'off') document.body.classList.add('hide-notes');
  }
  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('mj-mock-theme', 'light'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('mj-mock-theme', 'dark'); }
    syncThemeIcon();
  }
  function syncThemeIcon() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const i = document.querySelector('#mj-theme-btn i');
    if (i) i.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
  function toggleNotes() {
    document.body.classList.toggle('hide-notes');
    const off = document.body.classList.contains('hide-notes');
    localStorage.setItem('mj-mock-notes', off ? 'off' : 'on');
    const b = document.querySelector('#mj-notes-btn');
    if (b) b.classList.toggle('is-active', !off);
  }

  /* ── Frame ────────────────────────────────────────────────────────────── */
  function frameHTML(opts) {
    const cat = NAV.find(n => n.key === opts.nav);

    const tabs = NAV.map(n => `
      <a class="mj-navtab ${n.key === opts.nav ? 'is-active' : ''}" href="${BASE}${n.home}">
        <i class="${n.icon}"></i> ${n.label}
      </a>`).join('');

    const rail = !cat ? '' : cat.rail.map(item => {
      if ('group' in item) {
        return item.group ? `<div class="mj-rail-group">${item.group}</div>` : '';
      }
      const active = item.key === opts.rail ? 'is-active' : '';
      const badge = item.badge ? `<span class="mj-rail-badge">${item.badge}</span>` : '';
      return `<a class="${active}" href="${BASE}${item.href}">
                <i class="${item.icon}"></i><span class="lbl">${item.label}</span>${badge}
              </a>`;
    }).join('');

    return `
<div class="mj-app">
  <nav class="mj-topnav">
    <a class="mj-brand" href="${BASE}index.html" title="Back to the mockup index">
      <i class="fa-solid fa-cart-shopping"></i> MJ <span class="app">/ Orders</span>
    </a>
    <div class="mj-navtabs">${tabs}</div>
    <div class="mj-topnav-right">
      <button class="mj-iconbtn" id="mj-notes-btn" title="Toggle design notes"><i class="fa-solid fa-lightbulb"></i></button>
      <button class="mj-iconbtn" id="mj-theme-btn" title="Light / dark"><i class="fa-solid fa-moon"></i></button>
      <button class="mj-iconbtn" title="Search (⌘K)"><i class="fa-solid fa-magnifying-glass"></i></button>
      <button class="mj-iconbtn" title="Notifications"><i class="fa-regular fa-bell"></i></button>
      <span class="mj-avatar" title="Alicia Fontaine — Order entry">AF</span>
    </div>
  </nav>

  <div class="mj-shell-body">
    ${cat ? `<aside class="mj-rail" id="mj-rail">
      <button class="mj-iconbtn" style="align-self:flex-start" onclick="MJ.toggleRail()" title="Collapse rail">
        <i class="fa-solid fa-bars"></i>
      </button>
      <div class="mj-scope" title="Company scope, persisted per user">
        <i class="fa-solid fa-building"></i><span class="lbl">Scope: <b>All 3 companies</b></span>
      </div>
      ${rail}
    </aside>` : ''}

    <div class="mj-page-layout">
      ${opts.bare ? '' : `<header class="mj-page-header">
        <div class="mj-page-header-row">
          <div class="title-block">
            <h1>${opts.icon ? `<i class="${opts.icon}"></i>` : ''}${opts.title || ''}</h1>
            ${opts.subtitle ? `<div class="subtitle">${opts.subtitle}</div>` : ''}
          </div>
          <div slot="meta"></div>
          <div slot="actions"></div>
        </div>
        <div slot="toolbar"></div>
      </header>`}
      <div class="mj-page-body ${opts.bodyClass || ''}" slot="body"></div>
    </div>
  </div>
</div>`;
  }

  /* ── Mount ────────────────────────────────────────────────────────────── */
  function mount(opts) {
    BASE = opts.depth === 0 ? './' : '../';
    initTheme();

    const tpl = document.getElementById('page');
    const frag = tpl ? tpl.content.cloneNode(true) : document.createDocumentFragment();

    document.body.insertAdjacentHTML('afterbegin', frameHTML(opts));

    // Distribute the template's slots into the frame's slot targets.
    ['meta', 'actions', 'toolbar', 'body'].forEach(name => {
      const target = document.querySelector(`.mj-app [slot="${name}"]`);
      const source = frag.querySelector(`:scope > [slot="${name}"]`);
      if (!target) return;
      if (!source) { if (name !== 'body') target.remove(); return; }
      while (source.firstChild) target.appendChild(source.firstChild);
      source.remove();
    });

    // Overlays live outside the layout so they can be fixed-positioned.
    const overlays = frag.querySelector(':scope > [slot="overlays"]');
    if (overlays) { while (overlays.firstChild) document.body.appendChild(overlays.firstChild); }

    if (tpl) tpl.remove();

    wire();
    syncThemeIcon();
    const nb = document.querySelector('#mj-notes-btn');
    if (nb) nb.classList.toggle('is-active', !document.body.classList.contains('hide-notes'));

    if (typeof opts.ready === 'function') opts.ready();
  }

  /* ── Declarative interaction wiring ───────────────────────────────────── */
  function wire() {
    document.getElementById('mj-theme-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('mj-notes-btn')?.addEventListener('click', toggleNotes);

    // Overlays: data-open="#id" / data-close (closes the nearest overlay)
    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-open]');
      if (opener) { e.preventDefault(); open(opener.getAttribute('data-open')); return; }

      const closer = e.target.closest('[data-close]');
      if (closer) {
        e.preventDefault();
        const explicit = closer.getAttribute('data-close');
        if (explicit) { close(explicit); return; }
        const host = closer.closest('.mj-modal, .mj-slide-in');
        if (host) close('#' + host.id);
        return;
      }

      if (e.target.classList.contains('mj-backdrop')) closeAll();

      // Tabs
      const tab = e.target.closest('.mj-tab[data-tab]');
      if (tab) {
        const group = tab.closest('[data-tabs]').getAttribute('data-tabs');
        selectTab(group, tab.getAttribute('data-tab'));
        return;
      }

      // Single-select chip groups
      const chip = e.target.closest('[data-chips] .mj-filter-chip');
      if (chip) {
        const box = chip.closest('[data-chips]');
        if (box.getAttribute('data-chips') === 'multi') {
          chip.classList.toggle('is-active');
        } else {
          box.querySelectorAll('.mj-filter-chip').forEach(c => c.classList.remove('is-active'));
          chip.classList.add('is-active');
        }
        const cb = box.getAttribute('data-on-select');
        if (cb && window[cb]) window[cb](chip.getAttribute('data-value'), chip);
        return;
      }

      // Segmented controls
      const seg = e.target.closest('.mj-segmented button');
      if (seg) {
        const box = seg.closest('.mj-segmented');
        box.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
        seg.classList.add('is-active');
        const cb = box.getAttribute('data-on-select');
        if (cb && window[cb]) window[cb](seg.getAttribute('data-value'), seg);
        return;
      }

      // "Why" disclosures — U2. Toggles the element named by data-why.
      const why = e.target.closest('[data-why]');
      if (why) {
        e.preventDefault();
        const t = document.querySelector(why.getAttribute('data-why'));
        if (t) t.classList.toggle('hidden');
        return;
      }

      // Row selection in worklist tables
      const row = e.target.closest('tr.is-clickable');
      if (row && !e.target.closest('a, button, input, select')) {
        const tbody = row.closest('tbody');
        if (tbody.hasAttribute('data-single-select')) {
          tbody.querySelectorAll('tr').forEach(r => r.classList.remove('is-selected'));
          row.classList.add('is-selected');
        }
        const cb = tbody.getAttribute('data-on-row');
        if (cb && window[cb]) window[cb](row.getAttribute('data-row'), row);
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAll();
    });
  }

  function selectTab(group, key) {
    document.querySelectorAll(`[data-tabs="${group}"] .mj-tab`).forEach(t =>
      t.classList.toggle('is-active', t.getAttribute('data-tab') === key));
    document.querySelectorAll(`[data-pane-group="${group}"]`).forEach(p =>
      p.classList.toggle('is-active', p.getAttribute('data-pane') === key));
  }

  function open(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    backdrop(true);
    el.classList.add('is-open');
  }
  function close(sel) {
    const el = document.querySelector(sel);
    if (el) el.classList.remove('is-open');
    if (!document.querySelector('.mj-modal.is-open, .mj-slide-in.is-open')) backdrop(false);
  }
  function closeAll() {
    document.querySelectorAll('.mj-modal.is-open, .mj-slide-in.is-open').forEach(e => e.classList.remove('is-open'));
    backdrop(false);
  }
  function backdrop(on) {
    let b = document.querySelector('.mj-backdrop');
    if (!b) {
      b = document.createElement('div');
      b.className = 'mj-backdrop';
      document.body.appendChild(b);
    }
    b.classList.toggle('is-open', on);
  }

  function toggleRail() {
    document.getElementById('mj-rail')?.classList.toggle('is-collapsed');
  }

  /* ── Tiny render helpers used by screens ──────────────────────────────── */
  const H = {
    /** Status chip for an order status. */
    orderStatus(s) {
      const map = { Draft: '', Quoted: 'mj-chip--info', Confirmed: 'mj-chip--brand',
                    Posted: 'mj-chip--success', Fulfilled: 'mj-chip--success', Voided: 'mj-chip--outline' };
      return `<span class="mj-chip ${map[s] || ''}">${s}</span>`;
    },
    /** Status chip for a payment status on an order. */
    payStatus(s) {
      const map = { Unpaid: '', PartiallyPaid: 'mj-chip--warning', Paid: 'mj-chip--success',
                    Overdue: 'mj-chip--error', WrittenOff: 'mj-chip--outline' };
      return `<span class="mj-chip ${map[s] || ''}">${s === 'PartiallyPaid' ? 'Part paid' : s}</span>`;
    },
    /** Origin chip — U18. Staff / LXP / Renewal / Migration. */
    origin(o, ref) {
      if (!o || o === 'Staff') return `<span class="mj-chip mj-chip--outline"><i class="fa-solid fa-user"></i> Staff</span>`;
      if (o === 'LXP') return `<span class="mj-chip mj-chip--violet" title="${ref || ''}"><i class="fa-solid fa-graduation-cap"></i> LXP</span>`;
      if (o === 'Renewal') return `<span class="mj-chip mj-chip--info" title="${ref || ''}"><i class="fa-solid fa-rotate"></i> Renewal</span>`;
      return `<span class="mj-chip mj-chip--outline">${o}</span>`;
    },
    /** Company badge. */
    company(id) {
      const c = DB.companies[id];
      return c ? `<span class="mj-chip mj-chip--outline" title="${c.name}">${c.abbr}</span>` : '—';
    },
    /** Bill-to display name for an order. */
    billTo(o) {
      if (o.billToOrgID) {
        const org = DB.orgs[o.billToOrgID];
        const p = o.billToPersonID ? DB.people[o.billToPersonID] : null;
        return p ? `${org.name} <span class="secondary">· ${p.name}</span>` : org.name;
      }
      if (o.billToPersonID) return DB.people[o.billToPersonID].name;
      return o.billToPersonName || '—';
    },
    billToPlain(o) {
      if (o.billToOrgID) return DB.orgs[o.billToOrgID].name;
      if (o.billToPersonID) return DB.people[o.billToPersonID].name;
      return o.billToPersonName || '—';
    },
    /** The "why" disclosure pair: a button plus its hidden body. */
    why(id, body) {
      return `<button class="mj-why" data-why="#${id}" title="Why this number?"><i class="fa-solid fa-circle-question"></i></button>
              <div class="mj-why-body hidden" id="${id}">${body}</div>`;
    },
    /** Inline sparkline. Values are plotted as a filled area; no chart library. */
    spark(values, opts = {}) {
      const w = opts.w || 120, h = opts.h || 30;
      const max = Math.max(...values, 1), min = 0;
      const step = values.length > 1 ? w / (values.length - 1) : w;
      const pts = values.map((v, i) => [i * step, h - ((v - min) / (max - min)) * (h - 3) - 1.5]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const area = `${line} L${w},${h} L0,${h} Z`;
      const stroke = opts.color || 'var(--mj-brand-primary)';
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="trend">
        <path d="${area}" fill="${stroke}" opacity="0.12"></path>
        <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.5"
              stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
      </svg>`;
    },
    /**
     * Vertical bars over a few discrete time buckets (7 days).
     * Bars, not a line: seven discrete buckets are magnitudes to compare, not a
     * trend to trace. One hue — the categories are the days, and colouring them
     * differently would encode nothing. Each bar carries a native tooltip.
     */
    dayBars(values, labels, fmt = String) {
      const max = Math.max(...values, 1);
      return `<div style="display:flex;align-items:flex-end;gap:4px;height:84px">
        ${values.map((v, i) => {
          const pct = (v / max) * 100;
          const today = i === values.length - 1;
          return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;
                              align-items:center;gap:4px;height:100%" title="${labels[i]}: ${fmt(v)}">
            <span style="display:block;width:100%;height:${Math.max(pct, 1.5)}%;
              background:${today ? 'var(--mj-brand-primary)' : 'color-mix(in srgb, var(--mj-brand-primary) 42%, transparent)'};
              border-radius:4px 4px 0 0"></span>
            <span class="tiny muted" style="line-height:1">${labels[i]}</span>
          </div>`;
        }).join('')}
      </div>`;
    },
    /** Aging bar. Segments always carry their amount — that is what discharges
     *  the low-contrast warning on the amber step (see PROVENANCE.md). */
    agingBar(b) {
      const total = b.cur + b.d30 + b.d60 + b.d90;
      if (total <= 0) return '<div class="small muted">Nothing outstanding.</div>';
      const seg = (v, cls, label) => {
        if (v <= 0) return '';
        const pct = (v / total) * 100;
        return `<span class="${cls}" style="width:${pct}%" title="${label}: ${MJFmtMoney(v)}">
          ${pct > 13 ? MJFmtMoney(v) : ''}</span>`;
      };
      return `<div class="mj-aging">
        <div class="mj-aging-bar">
          ${seg(b.cur, 'b-cur', 'Current')}${seg(b.d30, 'b-30', '1–30 days')}
          ${seg(b.d60, 'b-60', '31–60 days')}${seg(b.d90, 'b-90', '61+ days')}
        </div>
        <div class="mj-aging-legend">
          <span><i style="background:var(--mj-color-neutral-500)"></i>Current ${MJFmtMoney(b.cur)}</span>
          <span><i style="background:var(--mj-color-warning-500)"></i>1–30 ${MJFmtMoney(b.d30)}</span>
          <span><i style="background:var(--mj-color-error-500)"></i>31–60 ${MJFmtMoney(b.d60)}</span>
          <span><i style="background:#991b1b"></i>61+ ${MJFmtMoney(b.d90)}</span>
        </div>
      </div>`;
    },
    /** Horizontal proportion bars — for tender mix / status mix. */
    bars(rows, opts = {}) {
      const max = Math.max(...rows.map(r => r.value ?? r.n), 1);
      const fmt = opts.fmt || (v => v);
      return `<div class="stack-2">${rows.map(r => {
        const v = r.value ?? r.n;
        const pct = (v / max) * 100;
        return `<div class="row" style="gap:var(--mj-space-3)">
          <span class="small muted" style="width:78px;flex:none">${r.label}</span>
          <span style="flex:1;height:8px;background:var(--mj-bg-surface-sunken);border-radius:var(--mj-radius-full);overflow:hidden">
            <span style="display:block;height:100%;width:${pct}%;background:${r.color || 'var(--mj-brand-primary)'};border-radius:var(--mj-radius-full)"></span>
          </span>
          <span class="small mj-num" style="width:76px;flex:none">${fmt(v)}</span>
        </div>`;
      }).join('')}</div>`;
    },
  };

  return { mount, open, close, closeAll, toggleRail, toggleTheme, selectTab, H, NAV };
})();

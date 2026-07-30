/* ============================================================================
   Mockup data — the eight seeded scenarios
   Mirrors test-harnesses/seed-review-data.mjs (see docs/reviewing-the-data.md).
   Plain objects, no fetch, opens from file://.

   Arithmetic is real and ties out on every order:
       TotalGross = SUM(LineTotalNet) + SUM(ChargeAmount) + SUM(LineTax)
   If a screen ever shows a different total than these numbers, the screen is
   wrong. That is the point of using seeded values instead of lorem numbers.
   ============================================================================ */

const DB = {};

/* ── Formatters ─────────────────────────────────────────────────────────── */
const F = {
  money(n, opts = {}) {
    if (n == null) return '—';
    const neg = n < 0;
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (opts.paren && neg) return `($${s})`;
    return (neg ? '−$' : '$') + s;
  },
  money0(n) {
    if (n == null) return '—';
    const neg = n < 0;
    const s = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return (neg ? '−$' : '$') + s;
  },
  qty(n) {
    if (n == null) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  },
  pct(n) { return (n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 2) + '%'; },
  rate(n) { return (n * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%'; },
  date(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  dateShort(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
  days(iso, from = DB.today) {
    const a = new Date(iso), b = new Date(from);
    return Math.round((b - a) / 86400000);
  },
  initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  },
};

DB.today = '2026-07-29';

/* ── Companies (__mj.Company) ───────────────────────────────────────────── */
DB.companies = {
  C1: { id: 'C1', name: 'Sidecar Learning, Inc.', short: 'Sidecar Learning', abbr: 'SLI',
        address: ['1420 Chestnut Street, Suite 300', 'Philadelphia, PA 19102'] },
  C2: { id: 'C2', name: 'Sidecar Events, LLC', short: 'Sidecar Events', abbr: 'SEV',
        address: ['1420 Chestnut Street, Suite 310', 'Philadelphia, PA 19102'] },
  C3: { id: 'C3', name: 'Blue Cypress Media, LLC', short: 'BC Media', abbr: 'BCM',
        address: ['88 Market Street', 'Wilmington, DE 19801'] },
};

/* ── Parties (bizapps-common Person / Organization) ─────────────────────── */
DB.people = {
  P1: { id: 'P1', name: 'Jane Chen', email: 'jane.chen@meridian.org', title: 'Director of Education',
        orgID: 'O1', orgInferred: true, orgSince: '2019-03-01', orgVia: 'Employee' },
  P2: { id: 'P2', name: 'Marcus Webb', email: 'm.webb@gmail.com', title: null, orgID: null },
  P3: { id: 'P3', name: 'Priya Raman', email: 'praman@northwindsociety.org', title: 'Membership Chair',
        orgID: 'O2', orgInferred: false },
  P4: { id: 'P4', name: 'Daniel Okafor', email: 'dokafor@cascadetrade.com', title: 'VP Marketing',
        orgID: 'O3', orgInferred: true, orgSince: '2021-09-15', orgVia: 'Employee' },
  P5: { id: 'P5', name: 'Sofia Alvarez', email: 'sofia@northwindsociety.org', title: 'Program Manager',
        orgID: 'O2', orgInferred: true, orgSince: '2023-01-09', orgVia: 'Employee' },
};

DB.orgs = {
  O1: { id: 'O1', name: 'Meridian Association', terms: 'Net 30', address: ['200 Meridian Plaza', 'Austin, TX 78701'] },
  O2: { id: 'O2', name: 'Northwind Society', terms: 'Net 30', address: ['15 Harbor Road', 'Seattle, WA 98101'] },
  O3: { id: 'O3', name: 'Cascade Trade Group', terms: 'Net 45', address: ['900 Cascade Ave', 'Portland, OR 97204'] },
  O4: { id: 'O4', name: 'Lakeside Institute', terms: 'Net 30', address: ['4 Lakeside Drive', 'Chicago, IL 60601'] },
};

DB.addresses = {
  A1: { id: 'A1', lines: ['200 Meridian Plaza', 'Austin, TX 78701'], city: 'Austin', region: 'TX' },
  A2: { id: 'A2', lines: ['1180 Wilshire Blvd, Apt 12B', 'Los Angeles, CA 90017'], city: 'Los Angeles', region: 'CA' },
  A3: { id: 'A3', lines: ['15 Harbor Road', 'Seattle, WA 98101'], city: 'Seattle', region: 'WA' },
  A4: { id: 'A4', lines: ['900 Cascade Ave', 'Portland, OR 97204'], city: 'Portland', region: 'OR' },
};

/* ── Catalog ────────────────────────────────────────────────────────────── */
DB.productTypes = {
  T_SUB:   { id: 'T_SUB',   name: 'Membership',    icon: 'fa-id-card',      revRec: 'Ratable over service period', taxable: false, fulfil: false },
  T_EVENT: { id: 'T_EVENT', name: 'Event',         icon: 'fa-calendar-day', revRec: 'All on event date',            taxable: false, fulfil: false },
  T_PHYS:  { id: 'T_PHYS',  name: 'Physical Good', icon: 'fa-box',          revRec: 'Immediate',                    taxable: true,  fulfil: true  },
  T_DIG:   { id: 'T_DIG',   name: 'Digital Good',  icon: 'fa-cloud-arrow-down', revRec: 'Immediate',                taxable: false, fulfil: false },
  T_SVC:   { id: 'T_SVC',   name: 'Service',       icon: 'fa-screwdriver-wrench', revRec: 'Immediate',              taxable: false, fulfil: false },
  T_BUND:  { id: 'T_BUND',  name: 'Bundle',        icon: 'fa-layer-group',  revRec: 'Per component',                taxable: false, fulfil: false },
  T_GIFT:  { id: 'T_GIFT',  name: 'Gift Card',     icon: 'fa-gift',         revRec: 'On redemption',                taxable: false, fulfil: false },
};

DB.categories = [
  { id: 'CAT1', name: 'Membership',   companyID: 'C1', parentID: null, count: 4 },
  { id: 'CAT2', name: 'Events',       companyID: 'C2', parentID: null, count: 6 },
  { id: 'CAT3', name: 'Conferences',  companyID: 'C2', parentID: 'CAT2', count: 3 },
  { id: 'CAT4', name: 'Workshops',    companyID: 'C2', parentID: 'CAT2', count: 3 },
  { id: 'CAT5', name: 'Education',    companyID: 'C1', parentID: null, count: 5 },
  { id: 'CAT6', name: 'Certification',companyID: 'C1', parentID: 'CAT5', count: 2 },
  { id: 'CAT7', name: 'Publications', companyID: 'C3', parentID: null, count: 3 },
  { id: 'CAT8', name: 'Sponsorship',  companyID: 'C2', parentID: null, count: 2 },
];

DB.products = {
  PR1: { id: 'PR1', sku: 'MEM-ANN',  name: 'Annual Membership',        typeID: 'T_SUB',   companyID: 'C1', categoryID: 'CAT1', price: 1200.00, status: 'Active',
         subscriptionType: 'Individual Annual', taxCategory: 'Education (non-taxable)', taxableFrom: 'product type' },
  PR2: { id: 'PR2', sku: 'CONF-26',  name: 'Annual Conference Ticket', typeID: 'T_EVENT', companyID: 'C2', categoryID: 'CAT3', price: 1033.00, status: 'Active',
         event: { name: 'Sidecar Summit 2026', startsAt: '2026-10-14', endsAt: '2026-10-16', venue: 'Austin Convention Center' },
         taxCategory: 'Education (non-taxable)', taxableFrom: 'product type' },
  PR3: { id: 'PR3', sku: 'TRK-LEAD', name: 'Leadership Track Bundle',  typeID: 'T_BUND',  companyID: 'C1', categoryID: 'CAT5', price: 2400.00, status: 'Active',
         bundle: ['Digital Course Library', 'Certification Exam', 'Printed Handbook'], taxCategory: 'Mixed', taxableFrom: 'component' },
  PR4: { id: 'PR4', sku: 'CERT-EXAM',name: 'Certification Exam',       typeID: 'T_SVC',   companyID: 'C1', categoryID: 'CAT6', price: 450.00,  status: 'Active',
         taxCategory: 'Education (non-taxable)', taxableFrom: 'category' },
  PR5: { id: 'PR5', sku: 'BOOK-HB',  name: 'Printed Handbook',         typeID: 'T_PHYS',  companyID: 'C3', categoryID: 'CAT7', price: 80.00,   status: 'Active',
         taxCategory: 'Tangible goods', taxableFrom: 'product type' },
  PR6: { id: 'PR6', sku: 'LIB-DIG',  name: 'Digital Course Library',   typeID: 'T_DIG',   companyID: 'C1', categoryID: 'CAT5', price: 400.00,  status: 'Active',
         taxCategory: 'Digital (non-taxable)', taxableFrom: 'product' },
  PR7: { id: 'PR7', sku: 'SPON-GOLD',name: 'Gold Sponsorship Package', typeID: 'T_SVC',   companyID: 'C2', categoryID: 'CAT8', price: 5000.00, status: 'Active',
         taxCategory: 'Advertising (non-taxable)', taxableFrom: 'category' },
  PR8: { id: 'PR8', sku: 'GIFT-100', name: 'Gift Card',                typeID: 'T_GIFT',  companyID: 'C1', categoryID: 'CAT1', price: 100.00,  status: 'Active',
         taxCategory: 'Non-taxable instrument', taxableFrom: 'product type' },
  PR9: { id: 'PR9', sku: 'WKSHP-AI', name: 'AI Strategy Workshop',     typeID: 'T_EVENT', companyID: 'C2', categoryID: 'CAT4', price: 695.00,  status: 'Active',
         event: { name: 'AI Strategy Workshop', startsAt: '2026-09-08', endsAt: '2026-09-08', venue: 'Virtual' },
         taxCategory: 'Education (non-taxable)', taxableFrom: 'product type' },
  PR10:{ id: 'PR10',sku: 'MEM-ORG',  name: 'Organizational Membership',typeID: 'T_SUB',   companyID: 'C1', categoryID: 'CAT1', price: 4800.00, status: 'Active',
         subscriptionType: 'Organization Annual', taxCategory: 'Education (non-taxable)', taxableFrom: 'product type' },
  PR11:{ id: 'PR11',sku: 'BOOK-STD', name: 'Field Guide (2nd Ed.)',    typeID: 'T_PHYS',  companyID: 'C3', categoryID: 'CAT7', price: 45.00,   status: 'Draft',
         taxCategory: 'Tangible goods', taxableFrom: 'product type' },
};

/* ── Pricing (D69 — one ProductPrice row IS one price rule) ─────────────── */
DB.priceLists = [
  { id: 'PL1', name: 'Standard',        companyID: 'C1', from: '2026-01-01', to: null, products: 9, isDefault: true },
  { id: 'PL2', name: 'Member Pricing',  companyID: 'C1', from: '2026-01-01', to: null, products: 6, isDefault: false },
  { id: 'PL3', name: 'Early Bird 2026', companyID: 'C2', from: '2026-04-01', to: '2026-08-31', products: 3, isDefault: false },
];

DB.productPrices = [
  { id: 'PP1', listID: 'PL1', productID: 'PR1', model: 'Flat',   unit: 1200.00, priority: 10, from: '2026-01-01', to: null, tiers: [] },
  { id: 'PP2', listID: 'PL1', productID: 'PR5', model: 'Tiered', unit: 80.00,   priority: 10, from: '2026-01-01', to: null,
    tiers: [{ min: 1, max: 9, unit: 80.00 }, { min: 10, max: 49, unit: 72.00 }, { min: 50, max: null, unit: 64.00 }] },
  { id: 'PP3', listID: 'PL2', productID: 'PR1', model: 'Flat',   unit: 960.00,  priority: 20, from: '2026-01-01', to: null, tiers: [] },
  { id: 'PP4', listID: 'PL3', productID: 'PR2', model: 'Flat',   unit: 895.00,  priority: 20, from: '2026-04-01', to: '2026-08-31', tiers: [] },
  { id: 'PP5', listID: 'PL1', productID: 'PR2', model: 'Flat',   unit: 1033.00, priority: 10, from: '2026-01-01', to: null, tiers: [] },
];

/* ── Promotions (D70) ───────────────────────────────────────────────────── */
DB.promotions = [
  { id: 'PM1', name: 'Spring Print Sale',   code: 'SPRING10', kind: 'Percent', value: 0.10, scope: 'Line',
    target: 'Category: Publications', from: '2026-03-01', to: '2026-09-30', redemptions: 214, cap: null, status: 'Active' },
  { id: 'PM2', name: 'Member Appreciation', code: 'MEMBER40', kind: 'Fixed',   value: 40.00, scope: 'Order',
    target: 'Any order over $250', from: '2026-01-01', to: '2026-12-31', redemptions: 89, cap: 500, status: 'Active' },
  { id: 'PM3', name: 'Summit Early Bird',   code: 'SUMMIT26', kind: 'Percent', value: 0.15, scope: 'Line',
    target: 'Product: Annual Conference Ticket', from: '2026-04-01', to: '2026-08-31', redemptions: 342, cap: null, status: 'Active' },
  { id: 'PM4', name: 'Lapsed Win-back',     code: 'WELCOME25',kind: 'Percent', value: 0.25, scope: 'Line',
    target: 'Category: Membership', from: '2026-06-01', to: '2026-07-15', redemptions: 31, cap: 100, status: 'Expired' },
];

DB.stackingPolicy = { C1: 'Sequential', C2: 'Sequential', C3: 'Additive' };

/* ── Charge types (D71 — tax IS a charge) ───────────────────────────────── */
DB.chargeTypes = [
  { id: 'CH1', name: 'Shipping',        basis: 'Flat per order',    seq: 10, isTax: false, taxable: true,  glRole: 'Shipping Income',  rate: null,     active: true },
  { id: 'CH2', name: 'Handling',        basis: 'Percent of net',    seq: 20, isTax: false, taxable: true,  glRole: 'Handling Income',  rate: 0.015,    active: true },
  { id: 'CH3', name: 'CA State Tax',    basis: 'Percent of taxable base', seq: 100, isTax: true, taxable: false, glRole: 'Sales Tax Payable', rate: 0.0625, active: true, jurisdiction: 'California' },
  { id: 'CH4', name: 'LA County Tax',   basis: 'Percent of taxable base', seq: 110, isTax: true, taxable: false, glRole: 'Sales Tax Payable', rate: 0.0225, active: true, jurisdiction: 'Los Angeles County' },
  { id: 'CH5', name: 'LA City Tax',     basis: 'Percent of taxable base', seq: 120, isTax: true, taxable: false, glRole: 'Sales Tax Payable', rate: 0.0100, active: true, jurisdiction: 'City of Los Angeles' },
  { id: 'CH6', name: 'Rush Processing', basis: 'Flat per line',     seq: 30, isTax: false, taxable: true,  glRole: 'Other Income',     rate: null,     active: false },
];

DB.nexus = [
  { companyID: 'C1', jurisdiction: 'Pennsylvania', registered: '2019-01-01', status: 'Active' },
  { companyID: 'C3', jurisdiction: 'California',   registered: '2024-06-01', status: 'Active' },
  { companyID: 'C3', jurisdiction: 'Delaware',     registered: '2021-01-01', status: 'Active' },
];

DB.exemptions = [
  { id: 'EX1', party: 'Northwind Society', partyKind: 'Organization', jurisdiction: 'Washington', productCategory: 'All',
    certificate: 'WA-EX-88213', from: '2025-01-01', to: '2027-12-31', status: 'Active' },
  { id: 'EX2', party: 'Lakeside Institute', partyKind: 'Organization', jurisdiction: 'Illinois', productCategory: 'Publications',
    certificate: 'IL-501C3-4471', from: '2024-03-01', to: null, status: 'Active' },
];

/* ── Journal-entry role accounts (read-only projection — D5/U12) ────────── */
DB.glRoles = {
  C1: { AR: '1200 · Accounts Receivable', Sales: '4010 · Program Revenue', Deferred: '2400 · Deferred Revenue',
        Discounts: '4910 · Sales Discounts', Cash: '1010 · Operating Cash', Fee: '6150 · Processing Fees',
        Returns: '4920 · Returns & Allowances', DueTo: '2150 · Due To Affiliates', DueFrom: '1250 · Due From Affiliates' },
  C2: { AR: '1200 · Accounts Receivable', Sales: '4020 · Event Revenue', Deferred: '2400 · Deferred Revenue',
        Discounts: '4910 · Sales Discounts', Cash: '1010 · Operating Cash', Fee: '6150 · Processing Fees',
        Returns: '4920 · Returns & Allowances', DueTo: '2150 · Due To Affiliates', DueFrom: '1250 · Due From Affiliates' },
  C3: { AR: '1200 · Accounts Receivable', Sales: '4030 · Publication Revenue', Deferred: '2400 · Deferred Revenue',
        Discounts: '4910 · Sales Discounts', Cash: '1010 · Operating Cash', Fee: '6150 · Processing Fees',
        Returns: '4920 · Returns & Allowances', Tax: '2250 · Sales Tax Payable' },
};

/* ============================================================================
   ORDERS — the eight scenarios plus list filler
   ============================================================================ */

DB.orders = [

  /* ── 1 · plain taxed sale ────────────────────────────────────────────── */
  {
    number: 'ORD-1001', type: 'Sale', status: 'Posted', paymentStatus: 'Unpaid',
    orderDate: '2026-07-06', dueDate: '2026-08-05', companyID: 'C3', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P2', billToOrgID: null, billToAddressID: 'A2', shipToAddressID: 'A2',
    description: 'Handbook order — phone',
    net: 160.00, charges: 0.00, tax: 10.00, gross: 170.00, paid: 0.00, balance: 170.00,
    lines: [
      { n: 1, productID: 'PR5', companyID: 'C3', qty: 2, unitPrice: 80.00, priceSource: { list: 'Standard', rule: 'Tiered · band 1–9', id: 'PP2' },
        discPct: 0, discAmt: 0, net: 160.00, tax: 10.00, chargeAmt: 0.00, gross: 170.00,
        taxLayers: [{ name: 'CA State Tax', rate: 0.0625, base: 160.00, amount: 10.00 }],
        fulfilment: 'Fulfilled', servicePeriod: null },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C3', entry: 'JE-8801', lines: [
        { dr: '1200 · Accounts Receivable', amount: 170.00 },
        { cr: '4030 · Publication Revenue', amount: 160.00 },
        { cr: '2250 · Sales Tax Payable', amount: 10.00 },
      ]},
    ],
    payments: [],
    scenario: 1, scenarioNote: 'The baseline: one line, one company, one balanced entry.',
  },

  /* ── 2 · two companies on one order ──────────────────────────────────── */
  {
    number: 'ORD-1002', type: 'Sale', status: 'Posted', paymentStatus: 'Unpaid',
    orderDate: '2026-07-08', dueDate: '2026-08-07', companyID: 'C1', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P1', billToOrgID: 'O1', billToAddressID: 'A1', shipToAddressID: 'A1',
    description: 'Meridian — membership + 3 summit seats',
    net: 4299.00, charges: 0.00, tax: 0.00, gross: 4299.00, paid: 0.00, balance: 4299.00,
    lines: [
      { n: 1, productID: 'PR1', companyID: 'C1', qty: 1, unitPrice: 1200.00, priceSource: { list: 'Standard', rule: 'Flat', id: 'PP1' },
        discPct: 0, discAmt: 0, net: 1200.00, tax: 0.00, chargeAmt: 0.00, gross: 1200.00,
        taxLayers: [], taxZeroReason: 'Untaxable — tax category "Education" resolved from product type',
        servicePeriod: ['2026-08-01', '2027-07-31'], subscription: { action: 'create', number: 'SUB-2038', holder: 'Meridian Association', beneficiary: 'Jane Chen', model: 'Individual' } },
      { n: 2, productID: 'PR2', companyID: 'C2', qty: 3, unitPrice: 1033.00, priceSource: { list: 'Standard', rule: 'Flat', id: 'PP5' },
        discPct: 0, discAmt: 0, net: 3099.00, tax: 0.00, chargeAmt: 0.00, gross: 3099.00,
        taxLayers: [], taxZeroReason: 'Untaxable — tax category "Education" resolved from product type',
        servicePeriod: ['2026-10-14', '2026-10-16'], servicePeriodFrom: 'event dates (Sidecar Summit 2026)' },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C1', entry: 'JE-8802', lines: [
        { dr: '1200 · Accounts Receivable', amount: 1200.00 },
        { cr: '2400 · Deferred Revenue', amount: 1200.00 },
      ]},
      { company: 'C2', entry: 'JE-8803', lines: [
        { dr: '1200 · Accounts Receivable', amount: 3099.00 },
        { cr: '2400 · Deferred Revenue', amount: 3099.00 },
      ]},
    ],
    payments: [],
    scenario: 2, scenarioNote: 'Per-line company resolution — two ledgers from one document.',
  },

  /* ── 3 · annual subscription ─────────────────────────────────────────── */
  {
    number: 'ORD-1003', type: 'Sale', status: 'Posted', paymentStatus: 'Paid',
    orderDate: '2026-07-10', dueDate: '2026-08-09', companyID: 'C1', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P3', billToOrgID: 'O2', billToAddressID: 'A3', shipToAddressID: 'A3',
    description: 'Northwind — Priya Raman membership renewal',
    net: 1200.00, charges: 0.00, tax: 0.00, gross: 1200.00, paid: 1200.00, balance: 0.00,
    lines: [
      { n: 1, productID: 'PR1', companyID: 'C1', qty: 1, unitPrice: 1200.00, priceSource: { list: 'Standard', rule: 'Flat', id: 'PP1' },
        discPct: 0, discAmt: 0, net: 1200.00, tax: 0.00, chargeAmt: 0.00, gross: 1200.00,
        taxLayers: [], taxZeroReason: 'Exempt — Northwind Society certificate WA-EX-88213',
        servicePeriod: ['2026-08-01', '2027-07-31'],
        subscription: { action: 'create', number: 'SUB-2041', holder: 'Northwind Society', beneficiary: 'Priya Raman', model: 'Individual' } },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C1', entry: 'JE-8804', lines: [
        { dr: '1200 · Accounts Receivable', amount: 1200.00 },
        { cr: '2400 · Deferred Revenue', amount: 1200.00 },
      ]},
    ],
    payments: ['PAY-3003'],
    scenario: 3, scenarioNote: 'Subscription + term, deferred revenue, 12 forward-dated recognition entries.',
  },

  /* ── 4 · event ticket ────────────────────────────────────────────────── */
  {
    number: 'ORD-1004', type: 'Sale', status: 'Posted', paymentStatus: 'Paid',
    orderDate: '2026-07-13', dueDate: '2026-08-12', companyID: 'C2', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P2', billToOrgID: null, billToAddressID: 'A2', shipToAddressID: 'A2',
    description: 'Summit seat — Marcus Webb',
    net: 1033.00, charges: 0.00, tax: 0.00, gross: 1033.00, paid: 1033.00, balance: 0.00,
    lines: [
      { n: 1, productID: 'PR2', companyID: 'C2', qty: 1, unitPrice: 1033.00, priceSource: { list: 'Standard', rule: 'Flat', id: 'PP5' },
        discPct: 0, discAmt: 0, net: 1033.00, tax: 0.00, chargeAmt: 0.00, gross: 1033.00,
        taxLayers: [], taxZeroReason: 'Untaxable — tax category "Education" resolved from product type',
        servicePeriod: ['2026-10-14', '2026-10-16'], servicePeriodFrom: 'event dates (Sidecar Summit 2026)' },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C2', entry: 'JE-8805', lines: [
        { dr: '1200 · Accounts Receivable', amount: 1033.00 },
        { cr: '2400 · Deferred Revenue', amount: 1033.00 },
      ]},
    ],
    payments: ['PAY-3004'],
    scenario: 4, scenarioNote: 'Service period taken from the EVENT, not typed on the line.',
  },

  /* ── 5 · the everything-order ────────────────────────────────────────── */
  {
    number: 'ORD-1005', type: 'Sale', status: 'Confirmed', paymentStatus: 'Unpaid',
    orderDate: '2026-07-21', dueDate: '2026-08-20', companyID: 'C3', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P1', billToOrgID: 'O1', billToAddressID: 'A1', shipToAddressID: 'A2',
    description: 'Meridian — bulk handbooks, shipped to LA office',
    net: 320.00, charges: 25.00, tax: 32.77, gross: 377.77, paid: 0.00, balance: 377.77,
    lines: [
      { n: 1, productID: 'PR5', companyID: 'C3', qty: 5, unitPrice: 80.00, priceSource: { list: 'Standard', rule: 'Tiered · band 1–9', id: 'PP2' },
        listAmount: 400.00, discPct: 0, discAmt: 80.00, net: 320.00, tax: 32.77, chargeAmt: 25.00, gross: 377.77,
        taxLayers: [
          { name: 'CA State Tax',  rate: 0.0625, base: 345.00, amount: 21.56 },
          { name: 'LA County Tax', rate: 0.0225, base: 345.00, amount: 7.76 },
          { name: 'LA City Tax',   rate: 0.0100, base: 345.00, amount: 3.45 },
        ],
        fulfilment: 'Pending', servicePeriod: null, shipToAddressID: 'A2', shipToNote: 'overrides header ship-to' },
    ],
    orderCharges: [
      { typeID: 'CH1', name: 'Shipping', seq: 10, basis: 'Flat per order', basisAmount: null, rate: null, amount: 25.00, isTax: false, overridden: false },
      { typeID: 'CH3', name: 'CA State Tax',  seq: 100, basis: 'Percent of taxable base', basisAmount: 345.00, rate: 0.0625, amount: 21.56, isTax: true, jurisdiction: 'California', overridden: false },
      { typeID: 'CH4', name: 'LA County Tax', seq: 110, basis: 'Percent of taxable base', basisAmount: 345.00, rate: 0.0225, amount: 7.76,  isTax: true, jurisdiction: 'Los Angeles County', overridden: false },
      { typeID: 'CH5', name: 'LA City Tax',   seq: 120, basis: 'Percent of taxable base', basisAmount: 345.00, rate: 0.0100, amount: 3.45,  isTax: true, jurisdiction: 'City of Los Angeles', overridden: false },
    ],
    taxableBase: { goods: 320.00, nonTaxCharges: 25.00, base: 345.00 },
    promotions: [
      { code: 'SPRING10', name: 'Spring Print Sale',   scope: 'Line',  kind: 'Percent', value: 0.10, applied: 40.00, order: 1, on: 400.00, status: 'applied' },
      { code: 'MEMBER40', name: 'Member Appreciation', scope: 'Order', kind: 'Fixed',   value: 40.00, applied: 40.00, order: 2, on: 360.00, status: 'applied', allocation: 'all to line 1' },
      { code: 'SUMMIT26', name: 'Summit Early Bird',   scope: 'Line',  kind: 'Percent', value: 0.15, applied: 0.00,  order: null, on: null, status: 'offered-not-applied', why: 'No line matches Product: Annual Conference Ticket' },
    ],
    stacking: 'Sequential',
    je: [
      { company: 'C3', entry: 'JE-8806', lines: [
        { dr: '1200 · Accounts Receivable', amount: 377.77 },
        { dr: '4910 · Sales Discounts', amount: 80.00 },
        { cr: '4030 · Publication Revenue', amount: 400.00 },
        { cr: '4035 · Shipping Income', amount: 25.00 },
        { cr: '2250 · Sales Tax Payable', amount: 32.77 },
      ]},
    ],
    payments: [],
    scenario: 5, scenarioNote: 'Line promo + order promo + shipping + three tax layers, together. Net 320 on 400 of goods.',
  },

  /* ── 6 · return of one unit from ORD-1001 ────────────────────────────── */
  {
    number: 'ORD-1006', type: 'Return', status: 'Posted', paymentStatus: 'Unpaid',
    orderDate: '2026-07-24', dueDate: null, companyID: 'C3', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P2', billToOrgID: null, billToAddressID: 'A2', shipToAddressID: 'A2',
    reversesOrder: 'ORD-1001', reversalReason: 'Damaged in transit — one unit returned',
    description: 'Return — 1 handbook from ORD-1001',
    net: -80.00, charges: 0.00, tax: -5.00, gross: -85.00, paid: 0.00, balance: -85.00,
    lines: [
      { n: 1, productID: 'PR5', companyID: 'C3', qty: -1, unitPrice: 80.00, priceSource: { list: null, rule: 'Inherited from ORD-1001 line 1', id: null },
        discPct: 0, discAmt: 0, net: -80.00, tax: -5.00, chargeAmt: 0.00, gross: -85.00,
        taxLayers: [{ name: 'CA State Tax', rate: 0.0625, base: -80.00, amount: -5.00 }],
        reversesLine: 'ORD-1001 · line 1', returnable: { origin: 2, priorReturns: 0, remaining: 1 } },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C3', entry: 'JE-8807', mirror: true, lines: [
        { dr: '4030 · Publication Revenue', amount: 80.00 },
        { dr: '2250 · Sales Tax Payable', amount: 5.00 },
        { cr: '1200 · Accounts Receivable', amount: 85.00 },
      ]},
    ],
    payments: [],
    scenario: 6, scenarioNote: 'Reversal MIRRORS: same accounts, sides swapped, positive amounts. Tax given back.',
  },

  /* ── 7 · paid order ──────────────────────────────────────────────────── */
  {
    number: 'ORD-1007', type: 'Sale', status: 'Fulfilled', paymentStatus: 'Paid',
    orderDate: '2026-07-15', dueDate: '2026-08-29', companyID: 'C2', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P4', billToOrgID: 'O3', billToAddressID: 'A4', shipToAddressID: 'A4',
    description: 'Cascade Trade — Gold sponsorship, Summit 2026',
    net: 5000.00, charges: 0.00, tax: 0.00, gross: 5000.00, paid: 5000.00, balance: 0.00,
    lines: [
      { n: 1, productID: 'PR7', companyID: 'C2', qty: 1, unitPrice: 5000.00, priceSource: { list: 'Standard', rule: 'Flat', id: null },
        discPct: 0, discAmt: 0, net: 5000.00, tax: 0.00, chargeAmt: 0.00, gross: 5000.00,
        taxLayers: [], taxZeroReason: 'Untaxable — tax category "Advertising" resolved from category',
        servicePeriod: ['2026-10-14', '2026-10-16'] },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C2', entry: 'JE-8808', lines: [
        { dr: '1200 · Accounts Receivable', amount: 5000.00 },
        { cr: '2400 · Deferred Revenue', amount: 5000.00 },
      ]},
    ],
    payments: ['PAY-3001'],
    scenario: 7, scenarioNote: 'PaymentHeader/PaymentLine and the rollups they drive.',
  },

  /* ── 8 · overpaid order → the credit ─────────────────────────────────── */
  {
    number: 'ORD-1008', type: 'Sale', status: 'Posted', paymentStatus: 'Paid',
    orderDate: '2026-07-17', dueDate: '2026-08-16', companyID: 'C1', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P5', billToOrgID: 'O2', billToAddressID: 'A3', shipToAddressID: 'A3',
    description: 'Northwind — 4 certification exams',
    net: 1800.00, charges: 0.00, tax: 0.00, gross: 1800.00, paid: 2050.00, balance: -250.00,
    lines: [
      { n: 1, productID: 'PR4', companyID: 'C1', qty: 4, unitPrice: 450.00, priceSource: { list: 'Standard', rule: 'Flat', id: null },
        discPct: 0, discAmt: 0, net: 1800.00, tax: 0.00, chargeAmt: 0.00, gross: 1800.00,
        taxLayers: [], taxZeroReason: 'Exempt — Northwind Society certificate WA-EX-88213' },
    ],
    orderCharges: [],
    promotions: [],
    je: [
      { company: 'C1', entry: 'JE-8809', lines: [
        { dr: '1200 · Accounts Receivable', amount: 1800.00 },
        { cr: '4010 · Program Revenue', amount: 1800.00 },
      ]},
    ],
    payments: ['PAY-3002'],
    scenario: 8, scenarioNote: 'Negative balance IS the account credit. No separate credit-memo table.',
  },

  /* ── list filler — states, origins, and worklist material ────────────── */
  {
    number: 'ORD-1009', type: 'Sale', status: 'Draft', paymentStatus: 'Unpaid',
    orderDate: '2026-07-29', dueDate: null, companyID: 'C1', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P1', billToOrgID: 'O1', billToAddressID: 'A1', shipToAddressID: 'A1',
    description: 'Meridian — 2027 renewal (in progress)',
    net: 1200.00, charges: 0.00, tax: 0.00, gross: 1200.00, paid: 0.00, balance: 1200.00,
    lines: [
      { n: 1, productID: 'PR1', companyID: 'C1', qty: 1, unitPrice: 1200.00, priceSource: { list: 'Standard', rule: 'Flat', id: 'PP1' },
        discPct: 0, discAmt: 0, net: 1200.00, tax: 0.00, chargeAmt: 0.00, gross: 1200.00, taxLayers: [],
        subscription: { action: 'extend', number: 'SUB-2038', holder: 'Meridian Association', beneficiary: 'Jane Chen', through: '2028-07-31' } },
    ],
    orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-1010', type: 'Sale', status: 'Quoted', paymentStatus: 'Unpaid',
    orderDate: '2026-07-27', dueDate: null, companyID: 'C2', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: null, billToOrgID: 'O4', billToAddressID: null, shipToAddressID: null,
    description: 'Lakeside Institute — 12 summit seats (quote)',
    net: 12396.00, charges: 0.00, tax: 0.00, gross: 12396.00, paid: 0.00, balance: 12396.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-1011', type: 'Sale', status: 'Confirmed', paymentStatus: 'Unpaid',
    orderDate: '2026-07-28', dueDate: '2026-08-27', companyID: 'C1', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P5', billToOrgID: 'O2', billToAddressID: 'A3', shipToAddressID: 'A3',
    description: 'Northwind — workshop seats',
    net: 2085.00, charges: 0.00, tax: 0.00, gross: 2085.00, paid: 0.00, balance: 2085.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-0987', type: 'Sale', status: 'Posted', paymentStatus: 'Overdue',
    orderDate: '2026-05-16', dueDate: '2026-06-15', companyID: 'C1', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P1', billToOrgID: 'O1', billToAddressID: 'A1', shipToAddressID: 'A1',
    description: 'Meridian — organizational membership',
    net: 4800.00, charges: 0.00, tax: 0.00, gross: 4800.00, paid: 2400.00, balance: 2400.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: ['PAY-3005'],
  },
  {
    number: 'ORD-0961', type: 'Sale', status: 'Posted', paymentStatus: 'Overdue',
    orderDate: '2026-03-31', dueDate: '2026-04-30', companyID: 'C3', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P2', billToOrgID: null, billToAddressID: 'A2', shipToAddressID: 'A2',
    description: 'Handbook bulk order',
    net: 850.00, charges: 15.00, tax: 25.00, gross: 890.00, paid: 0.00, balance: 890.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-0994', type: 'Sale', status: 'Posted', paymentStatus: 'Overdue',
    orderDate: '2026-06-04', dueDate: '2026-07-04', companyID: 'C2', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P4', billToOrgID: 'O3', billToAddressID: 'A4', shipToAddressID: 'A4',
    description: 'Workshop — 4 seats',
    net: 2780.00, charges: 0.00, tax: 0.00, gross: 2780.00, paid: 0.00, balance: 2780.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-1012', type: 'Sale', status: 'Posted', paymentStatus: 'Paid',
    orderDate: '2026-07-28', dueDate: '2026-07-28', companyID: 'C1', origin: 'LXP',
    originRef: 'LH4I-88213', originDetail: 'LH4I individual checkout · Stripe',
    billToPersonID: null, billToOrgID: null, billToPersonName: 'Erin Vasquez', billToAddressID: null,
    description: 'LH4I Tier 2 + Leadership track',
    net: 1080.00, charges: 0.00, tax: 0.00, gross: 1080.00, paid: 1080.00, balance: 0.00,
    lines: [], orderCharges: [],
    promotions: [{ code: 'SUMMIT26', name: 'Summit Early Bird', scope: 'Line', kind: 'Percent', value: 0.15, applied: 120.00, order: 1, on: 1200.00, status: 'applied' }],
    je: [], payments: ['PAY-3006'],
  },
  {
    number: 'ORD-1013', type: 'Sale', status: 'Posted', paymentStatus: 'Paid',
    orderDate: '2026-07-29', dueDate: '2026-07-29', companyID: 'C1', origin: 'LXP',
    originRef: 'LH4I-88240', originDetail: 'LH4I individual checkout · Stripe',
    billToPersonID: null, billToOrgID: null, billToPersonName: 'Tomas Lindqvist', billToAddressID: null,
    description: 'LH4I Tier 1',
    net: 600.00, charges: 0.00, tax: 0.00, gross: 600.00, paid: 600.00, balance: 0.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  {
    number: 'ORD-1014', type: 'Sale', status: 'Confirmed', paymentStatus: 'Unpaid',
    orderDate: '2026-07-29', dueDate: '2026-08-28', companyID: 'C1', origin: 'Renewal',
    originRef: 'SUB-2019', originDetail: 'Spawned by Orders.SpawnRenewals · 30-day lead',
    billToPersonID: 'P3', billToOrgID: 'O2', billToAddressID: 'A3', shipToAddressID: 'A3',
    description: 'Renewal — Priya Raman membership 2027',
    net: 1200.00, charges: 0.00, tax: 0.00, gross: 1200.00, paid: 0.00, balance: 1200.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
  /* ── the editor's working draft — escalated out of fast entry ────────── */
  {
    number: 'ORD-1016', type: 'Sale', status: 'Draft', paymentStatus: 'Unpaid',
    orderDate: '2026-07-29', dueDate: '2026-08-28', companyID: 'C1', origin: 'Staff', rep: 'Alicia Fontaine',
    billToPersonID: 'P1', billToOrgID: 'O1', billToAddressID: 'A1',
    shipToAddressID: 'A2', shipToPersonID: 'P1', shipToOrganizationID: null,
    externalDocNumber: 'MER-PO-4471',
    description: 'Meridian — 2027 membership renewal + handbooks',
    net: 1560.00, charges: 25.00, tax: 36.57, gross: 1621.57, paid: 0.00, balance: 1621.57,
    initialPayment: { typeCode: 'Card', amount: 1621.57, instrument: { brand: 'Visa', last4: '4118', exp: '08/29', holder: 'Meridian Association' }, fromWallet: 'W1' },
    lines: [
      { n: 1, productID: 'PR1', companyID: 'C1', qty: 1, unitPrice: 1200.00,
        priceSource: { list: 'Standard', rule: 'Flat', id: 'PP1' },
        listAmount: 1200.00, discPct: 0, discAmt: 0, net: 1200.00, tax: 0.00, chargeAmt: 0.00, gross: 1200.00,
        taxLayers: [], taxZeroReason: 'Untaxable — tax category "Education" resolved from product type',
        servicePeriod: ['2027-08-01', '2028-07-31'],
        subscription: { action: 'extend', number: 'SUB-2038', holder: 'Meridian Association',
                        beneficiary: 'Jane Chen', model: 'Individual', through: '2028-07-31' },
        dimensions: [{ name: 'Program', value: 'Membership' }, { name: 'Region', value: 'Southwest' }] },
      { n: 2, productID: 'PR5', companyID: 'C3', qty: 5, unitPrice: 80.00,
        priceSource: { list: 'Standard', rule: 'Tiered · band 1–9', id: 'PP2' },
        listAmount: 400.00, discPct: 0, discAmt: 40.00, net: 360.00, tax: 36.57, chargeAmt: 25.00, gross: 421.57,
        taxLayers: [
          { name: 'CA State Tax',  rate: 0.0625, base: 385.00, amount: 24.06 },
          { name: 'LA County Tax', rate: 0.0225, base: 385.00, amount: 8.66 },
          { name: 'LA City Tax',   rate: 0.0100, base: 385.00, amount: 3.85 },
        ],
        fulfilment: 'Pending', servicePeriod: null,
        shipToAddressID: 'A2', shipToNote: 'inherited from header ship-to',
        dimensions: [{ name: 'Program', value: 'Publications' }] },
    ],
    orderCharges: [
      { typeID: 'CH1', name: 'Shipping', seq: 10, basis: 'Flat per order', basisAmount: null, rate: null,
        amount: 25.00, isTax: false, overridden: false, appliesToLine: 2 },
      { typeID: 'CH3', name: 'CA State Tax',  seq: 100, basis: 'Percent of taxable base', basisAmount: 385.00,
        rate: 0.0625, amount: 24.06, isTax: true, jurisdiction: 'California', overridden: false, appliesToLine: 2 },
      { typeID: 'CH4', name: 'LA County Tax', seq: 110, basis: 'Percent of taxable base', basisAmount: 385.00,
        rate: 0.0225, amount: 8.66, isTax: true, jurisdiction: 'Los Angeles County', overridden: false, appliesToLine: 2 },
      { typeID: 'CH5', name: 'LA City Tax',   seq: 120, basis: 'Percent of taxable base', basisAmount: 385.00,
        rate: 0.0100, amount: 3.85, isTax: true, jurisdiction: 'City of Los Angeles', overridden: false, appliesToLine: 2 },
    ],
    taxableBase: { goods: 360.00, nonTaxCharges: 25.00, base: 385.00, untaxableGoods: 1200.00 },
    promotions: [
      { code: 'SPRING10', name: 'Spring Print Sale', scope: 'Line', kind: 'Percent', value: 0.10,
        applied: 40.00, order: 1, on: 400.00, status: 'applied', lines: [2] },
      { code: 'SUMMIT26', name: 'Summit Early Bird', scope: 'Line', kind: 'Percent', value: 0.15,
        applied: 0.00, order: null, on: null, status: 'offered-not-applied',
        why: 'No line matches Product: Annual Conference Ticket' },
    ],
    stacking: 'Sequential',
    je: [
      { company: 'C1', entry: null, line: 1, balanced: true, lines: [
        { dr: '1200 · Accounts Receivable', amount: 1200.00 },
        { cr: '2400 · Deferred Revenue', amount: 1200.00 },
      ]},
      { company: 'C3', entry: null, line: 2, balanced: true, lines: [
        { dr: '1200 · Accounts Receivable', amount: 421.57 },
        { dr: '4910 · Sales Discounts', amount: 40.00 },
        { cr: '4030 · Publication Revenue', amount: 400.00 },
        { cr: '4035 · Shipping Income', amount: 25.00 },
        { cr: '2250 · Sales Tax Payable', amount: 36.57 },
      ]},
    ],
    payments: [],
    isWorkingDraft: true,
  },

  {
    number: 'ORD-0975', type: 'Sale', status: 'Posted', paymentStatus: 'Overdue',
    orderDate: '2026-05-31', dueDate: '2026-06-30', companyID: 'C1', origin: 'Renewal',
    originRef: 'SUB-2050', originDetail: 'Spawned by Orders.SpawnRenewals — card declined at capture',
    billToPersonID: null, billToOrgID: 'O4', billToAddressID: null, shipToAddressID: null,
    description: 'Renewal — Ruth Anand membership 2027 (payment failed)',
    net: 1200.00, charges: 0.00, tax: 0.00, gross: 1200.00, paid: 0.00, balance: 1200.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },

  {
    number: 'ORD-1015', type: 'Sale', status: 'Voided', paymentStatus: 'Unpaid',
    orderDate: '2026-07-22', dueDate: null, companyID: 'C2', origin: 'Staff', rep: 'Devon Price',
    billToPersonID: 'P2', billToOrgID: null, billToAddressID: 'A2', shipToAddressID: 'A2',
    description: 'Duplicate entry — voided before confirm',
    net: 1033.00, charges: 0.00, tax: 0.00, gross: 1033.00, paid: 0.00, balance: 0.00,
    lines: [], orderCharges: [], promotions: [], je: [], payments: [],
  },
];

DB.orderByNumber = n => DB.orders.find(o => o.number === n);

/* ============================================================================
   PAYMENTS
   ============================================================================ */

DB.paymentTypes = [
  { id: 'PT1', code: 'Card',          name: 'Credit card',    isReversal: false, needsProvider: true,  needsInstrument: true,  needsReference: false },
  { id: 'PT2', code: 'Check',         name: 'Check',          isReversal: false, needsProvider: false, needsInstrument: false, needsReference: true  },
  { id: 'PT3', code: 'ACH',           name: 'ACH / bank',     isReversal: false, needsProvider: true,  needsInstrument: true,  needsReference: false },
  { id: 'PT4', code: 'Wire',          name: 'Wire transfer',  isReversal: false, needsProvider: false, needsInstrument: false, needsReference: true  },
  { id: 'PT5', code: 'AccountCredit', name: 'Account credit', isReversal: false, needsProvider: false, needsInstrument: false, needsReference: false },
  { id: 'PT6', code: 'Refund',        name: 'Refund',         isReversal: true,  needsProvider: true,  needsInstrument: true,  needsReference: false },
];

DB.providers = [
  { id: 'PV1', name: 'Stripe — Sidecar Learning', type: 'Stripe', companyID: 'C1', mode: 'Live',
    tokenize: true, refund: true, webhooks: true, status: 'Active' },
  { id: 'PV2', name: 'Stripe — Sidecar Events',   type: 'Stripe', companyID: 'C2', mode: 'Test',
    tokenize: true, refund: true, webhooks: true, status: 'Active' },
  { id: 'PV3', name: 'Manual entry',              type: 'Manual', companyID: null, mode: '—',
    tokenize: false, refund: true, webhooks: false, status: 'Active' },
];

DB.payments = [
  { number: 'PAY-3001', date: '2026-07-15', status: 'Captured', typeCode: 'Card', receivingCompanyID: 'C2',
    partyPersonID: 'P4', partyOrgID: 'O3', amount: 5000.00, fee: 145.00, net: 4855.00,
    instrument: { brand: 'Visa', last4: '4242', exp: '09/28', holder: 'Cascade Trade Group' },
    providerID: 'PV2', providerChargeID: 'ch_3Qk7fL2eZvKY',
    allocations: [{ order: 'ORD-1007', amount: 5000.00 }],
    je: [{ company: 'C2', entry: 'JE-8901', lines: [
      { dr: '1010 · Operating Cash', amount: 4855.00 },
      { dr: '6150 · Processing Fees', amount: 145.00 },
      { cr: '1200 · Accounts Receivable', amount: 5000.00 },
    ]}],
    refunded: 0.00 },

  { number: 'PAY-3002', date: '2026-07-18', status: 'Captured', typeCode: 'Check', receivingCompanyID: 'C1',
    partyPersonID: 'P5', partyOrgID: 'O2', amount: 2050.00, fee: 0.00, net: 2050.00,
    instrument: { reference: 'Check #40218', date: '2026-07-16' },
    providerID: 'PV3',
    allocations: [{ order: 'ORD-1008', amount: 2050.00 }],
    je: [{ company: 'C1', entry: 'JE-8902', lines: [
      { dr: '1010 · Operating Cash', amount: 2050.00 },
      { cr: '1200 · Accounts Receivable', amount: 2050.00 },
    ]}],
    note: 'Over-applied by $250.00 — drives ORD-1008 to a negative balance, which IS the credit.',
    refunded: 0.00 },

  { number: 'PAY-3003', date: '2026-07-11', status: 'Captured', typeCode: 'Card', receivingCompanyID: 'C1',
    partyPersonID: 'P3', partyOrgID: 'O2', amount: 1200.00, fee: 35.10, net: 1164.90,
    instrument: { brand: 'Mastercard', last4: '8210', exp: '04/29', holder: 'Priya Raman' },
    providerID: 'PV1', providerChargeID: 'ch_3Qj1mB8xTdLQ',
    allocations: [{ order: 'ORD-1003', amount: 1200.00 }],
    je: [{ company: 'C1', entry: 'JE-8903', lines: [
      { dr: '1010 · Operating Cash', amount: 1164.90 },
      { dr: '6150 · Processing Fees', amount: 35.10 },
      { cr: '1200 · Accounts Receivable', amount: 1200.00 },
    ]}],
    refunded: 0.00 },

  { number: 'PAY-3004', date: '2026-07-13', status: 'Captured', typeCode: 'Card', receivingCompanyID: 'C2',
    partyPersonID: 'P2', partyOrgID: null, amount: 1033.00, fee: 30.26, net: 1002.74,
    instrument: { brand: 'Visa', last4: '1881', exp: '11/27', holder: 'Marcus Webb' },
    providerID: 'PV2', providerChargeID: 'ch_3Qj4pR1kNmXz',
    allocations: [{ order: 'ORD-1004', amount: 1033.00 }],
    je: [{ company: 'C2', entry: 'JE-8904', lines: [
      { dr: '1010 · Operating Cash', amount: 1002.74 },
      { dr: '6150 · Processing Fees', amount: 30.26 },
      { cr: '1200 · Accounts Receivable', amount: 1033.00 },
    ]}],
    refunded: 0.00 },

  { number: 'PAY-3005', date: '2026-06-02', status: 'Captured', typeCode: 'ACH', receivingCompanyID: 'C1',
    partyPersonID: 'P1', partyOrgID: 'O1', amount: 2400.00, fee: 0.00, net: 2400.00,
    instrument: { bankLast4: '7745', holder: 'Meridian Association' },
    providerID: 'PV1',
    allocations: [{ order: 'ORD-0987', amount: 2400.00 }],
    je: [{ company: 'C1', entry: 'JE-8905', lines: [
      { dr: '1010 · Operating Cash', amount: 2400.00 },
      { cr: '1200 · Accounts Receivable', amount: 2400.00 },
    ]}],
    note: 'Partial payment — ORD-0987 still carries $2,400.00.',
    refunded: 0.00 },

  { number: 'PAY-3006', date: '2026-07-28', status: 'Captured', typeCode: 'Card', receivingCompanyID: 'C1',
    partyPersonID: null, partyOrgID: null, partyName: 'Erin Vasquez', amount: 1080.00, fee: 31.62, net: 1048.38,
    instrument: { brand: 'Amex', last4: '0031', exp: '02/29', holder: 'Erin Vasquez' },
    providerID: 'PV1', providerChargeID: 'ch_3Qm0aC5wPqRt', origin: 'LXP',
    allocations: [{ order: 'ORD-1012', amount: 1080.00 }],
    je: [{ company: 'C1', entry: 'JE-8906', lines: [
      { dr: '1010 · Operating Cash', amount: 1048.38 },
      { dr: '6150 · Processing Fees', amount: 31.62 },
      { cr: '1200 · Accounts Receivable', amount: 1080.00 },
    ]}],
    refunded: 0.00 },

  { number: 'PAY-3007', date: '2026-07-25', status: 'Refunded', typeCode: 'Refund', receivingCompanyID: 'C3',
    partyPersonID: 'P2', partyOrgID: null, amount: 85.00, fee: 0.00, net: 85.00,
    reverses: 'PAY-2990', reversalReason: 'Damaged handbook returned (ORD-1006)',
    instrument: { brand: 'Visa', last4: '1881', exp: '11/27', holder: 'Marcus Webb' },
    providerID: 'PV3',
    allocations: [{ order: 'ORD-1006', amount: -85.00 }],
    je: [{ company: 'C3', entry: 'JE-8907', mirror: true, lines: [
      { dr: '1200 · Accounts Receivable', amount: 85.00 },
      { cr: '1010 · Operating Cash', amount: 85.00 },
    ]}],
    refunded: 0.00 },

  { number: 'PAY-3008', date: '2026-07-29', status: 'Pending', typeCode: 'Card', receivingCompanyID: 'C1',
    partyPersonID: 'P5', partyOrgID: 'O2', amount: 2085.00, fee: 0.00, net: 2085.00,
    instrument: { brand: 'Mastercard', last4: '4409', exp: '07/28', holder: 'Northwind Society' },
    providerID: 'PV1',
    allocations: [{ order: 'ORD-1011', amount: 2085.00 }],
    je: [], refunded: 0.00,
    note: 'Awaiting capture — allocations are still editable while Pending (frozen at capture).' },
];

DB.paymentByNumber = n => DB.payments.find(p => p.number === n);

/* ── Wallet (CustomerPaymentMethod) ─────────────────────────────────────── */
DB.wallet = [
  { id: 'W1', partyOrgID: 'O1', partyPersonID: 'P1', brand: 'Visa', last4: '4118', exp: '08/29',
    holder: 'Meridian Association', isDefault: true, active: true, addedOn: '2025-02-11', usedCount: 7 },
  { id: 'W2', partyOrgID: 'O2', partyPersonID: 'P3', brand: 'Mastercard', last4: '8210', exp: '04/29',
    holder: 'Priya Raman', isDefault: true, active: true, addedOn: '2024-08-02', usedCount: 3 },
  { id: 'W3', partyOrgID: 'O3', partyPersonID: 'P4', brand: 'Visa', last4: '4242', exp: '09/28',
    holder: 'Cascade Trade Group', isDefault: true, active: true, addedOn: '2025-11-19', usedCount: 2 },
  { id: 'W4', partyOrgID: 'O1', partyPersonID: 'P1', bankLast4: '7745', routingLast4: '0021',
    holder: 'Meridian Association', isDefault: false, active: true, addedOn: '2026-01-08', usedCount: 1 },
];

/* ============================================================================
   SUBSCRIPTIONS
   ============================================================================ */

DB.subscriptionTypes = [
  { id: 'ST1', name: 'Individual Annual', benefitModel: 'Individual', scope: 'Either', term: 12, billing: 'Annual',
    recognition: 'Monthly', concurrency: 'ExtendExisting', cancelMode: 'EndOfTerm', refundMode: 'ProrateUnused',
    grace: 7, renewalLead: 30 },
  { id: 'ST2', name: 'Organization Annual', benefitModel: 'Organization', scope: 'Organization', term: 12, billing: 'Annual',
    recognition: 'Monthly', concurrency: 'ExtendExisting', cancelMode: 'EndOfTerm', refundMode: 'NoRefund',
    grace: 14, renewalLead: 45 },
  { id: 'ST3', name: 'Corporate Seat', benefitModel: 'Individual', scope: 'Organization', term: 12, billing: 'Annual',
    recognition: 'Monthly', concurrency: 'RejectDuplicate', cancelMode: 'Immediate', refundMode: 'ProrateUnused',
    grace: 0, renewalLead: 30 },
];

DB.subscriptions = [
  { number: 'SUB-2038', productID: 'PR1', typeID: 'ST1', holder: 'Meridian Association', holderKind: 'Organization',
    beneficiary: 'Jane Chen', status: 'Active', autoRenew: true, renewalLeadDays: 30,
    startDate: '2025-08-01', endDate: '2027-07-31', amountPerTerm: 1200.00,
    terms: [
      { n: 1, start: '2025-08-01', end: '2026-07-31', amount: 1200.00, orderNumber: 'ORD-0812', status: 'Complete', prorated: false },
      { n: 2, start: '2026-08-01', end: '2027-07-31', amount: 1200.00, orderNumber: 'ORD-1002', status: 'Current',  prorated: false },
    ],
    events: [
      { date: '2025-08-01', kind: 'Created',  detail: 'First purchase — ORD-0812' },
      { date: '2026-07-08', kind: 'Extended', detail: 'Customer bought another year — ORD-1002' },
    ],
    recognition: { total: 1200.00, perPeriod: 100.00, periods: 12, recognized: 0.00, start: '2026-08-01' } },

  { number: 'SUB-2041', productID: 'PR1', typeID: 'ST1', holder: 'Northwind Society', holderKind: 'Organization',
    beneficiary: 'Priya Raman', status: 'Active', autoRenew: true, renewalLeadDays: 30,
    startDate: '2026-08-01', endDate: '2027-07-31', amountPerTerm: 1200.00,
    terms: [
      { n: 1, start: '2026-08-01', end: '2027-07-31', amount: 1200.00, orderNumber: 'ORD-1003', status: 'Current', prorated: false },
    ],
    events: [{ date: '2026-07-10', kind: 'Created', detail: 'First purchase — ORD-1003' }],
    recognition: { total: 1200.00, perPeriod: 100.00, periods: 12, recognized: 0.00, start: '2026-08-01' } },

  { number: 'SUB-2019', productID: 'PR1', typeID: 'ST1', holder: 'Northwind Society', holderKind: 'Organization',
    beneficiary: 'Sofia Alvarez', status: 'Active', autoRenew: true, renewalLeadDays: 30,
    startDate: '2025-09-01', endDate: '2026-08-31', amountPerTerm: 1200.00,
    terms: [{ n: 1, start: '2025-09-01', end: '2026-08-31', amount: 1200.00, orderNumber: 'ORD-0834', status: 'Current', prorated: false }],
    events: [
      { date: '2025-09-01', kind: 'Created', detail: 'First purchase — ORD-0834' },
      { date: '2026-07-29', kind: 'RenewalOrderSpawned', detail: 'ORD-1014 placed at 30-day lead' },
    ],
    renewalDue: '2026-08-31',
    recognition: { total: 1200.00, perPeriod: 100.00, periods: 12, recognized: 1100.00, start: '2025-09-01' } },

  { number: 'SUB-2044', productID: 'PR10', typeID: 'ST2', holder: 'Meridian Association', holderKind: 'Organization',
    beneficiary: 'All Meridian members', status: 'Active', autoRenew: true, renewalLeadDays: 45,
    startDate: '2026-06-01', endDate: '2027-05-31', amountPerTerm: 4800.00,
    terms: [{ n: 1, start: '2026-06-01', end: '2027-05-31', amount: 4800.00, orderNumber: 'ORD-0987', status: 'Current', prorated: false }],
    events: [{ date: '2026-05-16', kind: 'Created', detail: 'First purchase — ORD-0987' }],
    recognition: { total: 4800.00, perPeriod: 400.00, periods: 12, recognized: 800.00, start: '2026-06-01' } },

  { number: 'SUB-2007', productID: 'PR1', typeID: 'ST3', holder: 'Cascade Trade Group', holderKind: 'Organization',
    beneficiary: 'Daniel Okafor', status: 'Cancelled', autoRenew: false, renewalLeadDays: 30,
    startDate: '2026-01-01', endDate: '2026-07-01', amountPerTerm: 1200.00,
    terms: [{ n: 1, start: '2026-01-01', end: '2026-12-31', amount: 1200.00, orderNumber: 'ORD-0901', status: 'Cancelled', prorated: false }],
    events: [
      { date: '2026-01-01', kind: 'Created',   detail: 'First purchase — ORD-0901' },
      { date: '2026-07-01', kind: 'Cancelled', detail: 'Immediate · prorated refund $600.00 · reversal ORD-0955' },
    ],
    recognition: { total: 1200.00, perPeriod: 100.00, periods: 12, recognized: 600.00, start: '2026-01-01' } },

  { number: 'SUB-2050', productID: 'PR1', typeID: 'ST1', holder: 'Lakeside Institute', holderKind: 'Organization',
    beneficiary: 'Ruth Anand', status: 'Grace', autoRenew: true, renewalLeadDays: 30,
    startDate: '2025-07-01', endDate: '2026-06-30', amountPerTerm: 1200.00,
    terms: [{ n: 1, start: '2025-07-01', end: '2026-06-30', amount: 1200.00, orderNumber: 'ORD-0798', status: 'Expired', prorated: false }],
    events: [
      { date: '2025-07-01', kind: 'Created', detail: 'First purchase — ORD-0798' },
      { date: '2026-06-01', kind: 'RenewalOrderSpawned', detail: 'ORD-0975 placed — payment failed' },
    ],
    renewalDue: '2026-06-30', graceEnds: '2026-08-05',
    recognition: { total: 1200.00, perPeriod: 100.00, periods: 12, recognized: 1200.00, start: '2025-07-01' } },
];

DB.subscriptionByNumber = n => DB.subscriptions.find(s => s.number === n);

/* ── Renewals due (Orders.SpawnRenewals candidates) ─────────────────────── */
DB.renewals = [
  { subNumber: 'SUB-2019', holder: 'Northwind Society', beneficiary: 'Sofia Alvarez', product: 'Annual Membership',
    termEnds: '2026-08-31', leadDays: 30, spawnOn: '2026-08-01', amount: 1200.00, autoRenew: true,
    state: 'Spawned', orderNumber: 'ORD-1014' },
  { subNumber: 'SUB-2050', holder: 'Lakeside Institute', beneficiary: 'Ruth Anand', product: 'Annual Membership',
    termEnds: '2026-06-30', leadDays: 30, spawnOn: '2026-05-31', amount: 1200.00, autoRenew: true,
    state: 'Payment failed', orderNumber: 'ORD-0975', graceEnds: '2026-08-05' },
  { subNumber: 'SUB-2044', holder: 'Meridian Association', beneficiary: 'All Meridian members', product: 'Organizational Membership',
    termEnds: '2027-05-31', leadDays: 45, spawnOn: '2027-04-16', amount: 4800.00, autoRenew: true,
    state: 'Scheduled', orderNumber: null },
  { subNumber: 'SUB-2038', holder: 'Meridian Association', beneficiary: 'Jane Chen', product: 'Annual Membership',
    termEnds: '2027-07-31', leadDays: 30, spawnOn: '2027-07-01', amount: 1200.00, autoRenew: true,
    state: 'Scheduled', orderNumber: null },
  { subNumber: 'SUB-2007', holder: 'Cascade Trade Group', beneficiary: 'Daniel Okafor', product: 'Annual Membership',
    termEnds: '2026-12-31', leadDays: 30, spawnOn: null, amount: 1200.00, autoRenew: false,
    state: 'Will not renew', orderNumber: null },
];

/* ============================================================================
   RECEIVABLES
   ============================================================================ */

/* Balances and buckets below are DERIVED from DB.orders at load (see
   recomputeCustomers) rather than typed, so the A/R screens cannot drift from
   the order rows the way two hand-maintained numbers always eventually do. */
DB.customers = [
  { id: 'O1', kind: 'Organization', name: 'Meridian Association', contact: 'Jane Chen', terms: 'Net 30',
    since: '2019-03-01', ytd: 18420.00, wallet: 2 },
  { id: 'O2', kind: 'Organization', name: 'Northwind Society', contact: 'Priya Raman', terms: 'Net 30',
    since: '2021-06-14', ytd: 9285.00, wallet: 1 },
  { id: 'O3', kind: 'Organization', name: 'Cascade Trade Group', contact: 'Daniel Okafor', terms: 'Net 45',
    since: '2022-01-20', ytd: 7780.00, wallet: 1 },
  { id: 'P2', kind: 'Person', name: 'Marcus Webb', contact: null, terms: 'Due on receipt',
    since: '2023-04-02', ytd: 2088.00, wallet: 0 },
  { id: 'O4', kind: 'Organization', name: 'Lakeside Institute', contact: 'Ruth Anand', terms: 'Net 30',
    since: '2020-09-30', ytd: 3600.00, wallet: 0 },
];

/** Which customer an order belongs to — organization wins, else the person. */
DB.orderCustomerID = o => o.billToOrgID || o.billToPersonID || null;

/** An order is open A/R once it has confirmed and still carries a balance. */
DB.isOpenAR = o => o.balance !== 0 && !['Draft', 'Quoted', 'Voided'].includes(o.status);

function recomputeCustomers() {
  const r2 = n => Math.round(n * 100) / 100;
  DB.customers.forEach(c => {
    const mine = DB.orders.filter(o => DB.orderCustomerID(o) === c.id);
    c.orders = mine.map(o => o.number);
    const open = mine.filter(DB.isOpenAR);
    c.credit = r2(-open.filter(o => o.balance < 0).reduce((s, o) => s + o.balance, 0));
    const owing = open.filter(o => o.balance > 0);
    c.open = r2(owing.reduce((s, o) => s + o.balance, 0));
    const b = { cur: 0, d30: 0, d60: 0, d90: 0 };
    owing.forEach(o => {
      const late = o.dueDate ? F.days(o.dueDate) : 0;
      if (late <= 0) b.cur += o.balance;
      else if (late <= 30) b.d30 += o.balance;
      else if (late <= 60) b.d60 += o.balance;
      else b.d90 += o.balance;
    });
    Object.keys(b).forEach(k => b[k] = r2(b[k]));
    c.buckets = b;
  });
}

DB.customerByID = id => DB.customers.find(c => c.id === id);

DB.overdue = [
  { order: 'ORD-0961', customer: 'Marcus Webb', customerID: 'P2', due: '2026-04-30', balance: 890.00,
    company: 'C3', lastContact: '2026-06-12', contactKind: 'Email', attempts: 2, grace: null, owner: 'Alicia Fontaine' },
  { order: 'ORD-0987', customer: 'Meridian Association', customerID: 'O1', due: '2026-06-15', balance: 2400.00,
    company: 'C1', lastContact: '2026-07-08', contactKind: 'Phone', attempts: 1, grace: null, owner: 'Alicia Fontaine' },
  { order: 'ORD-0994', customer: 'Cascade Trade Group', customerID: 'O3', due: '2026-07-04', balance: 2780.00,
    company: 'C2', lastContact: null, contactKind: null, attempts: 0, grace: null, owner: 'Devon Price' },
  { order: 'ORD-0975', customer: 'Lakeside Institute', customerID: 'O4', due: '2026-06-30', balance: 1200.00,
    company: 'C1', lastContact: '2026-07-20', contactKind: 'Email', attempts: 3, grace: '2026-08-05',
    owner: 'Devon Price', note: 'Renewal payment failed — subscription SUB-2050 in grace' },
];

/* ── Fulfillment queue (D15 — logistics, no JE) ─────────────────────────── */
DB.fulfillment = [
  { order: 'ORD-1005', line: 1, product: 'Printed Handbook', qty: 5, customer: 'Meridian Association',
    shipTo: ['1180 Wilshire Blvd, Apt 12B', 'Los Angeles, CA 90017'], requested: '2026-08-05',
    status: 'Pending', company: 'C3', posted: '2026-07-21' },
  { order: 'ORD-0961', line: 1, product: 'Printed Handbook', qty: 10, customer: 'Marcus Webb',
    shipTo: ['1180 Wilshire Blvd, Apt 12B', 'Los Angeles, CA 90017'], requested: '2026-04-15',
    status: 'Pending', company: 'C3', posted: '2026-03-31', late: true },
  { order: 'ORD-1017', line: 2, product: 'Field Guide (2nd Ed.)', qty: 24, customer: 'Lakeside Institute',
    shipTo: ['4 Lakeside Drive', 'Chicago, IL 60601'], requested: '2026-08-12',
    status: 'Pending', company: 'C3', posted: '2026-07-28' },
  { order: 'ORD-1001', line: 1, product: 'Printed Handbook', qty: 2, customer: 'Marcus Webb',
    shipTo: ['1180 Wilshire Blvd, Apt 12B', 'Los Angeles, CA 90017'], requested: '2026-07-15',
    status: 'Fulfilled', company: 'C3', posted: '2026-07-06', fulfilledOn: '2026-07-09' },
];

/* ============================================================================
   DASHBOARD counts (cheap counts only — U11)
   ============================================================================ */

DB.ordersDash = {
  today: { count: 4, gross: 3880.00 },
  week: { count: 17, gross: 28640.00 },
  draft: 3,
  confirmedNotPosted: 2,
  awaitingFulfilment: 3,
  overdueCount: 4, overdueValue: 7270.00,
  bookedThisMonth: 41230.00,
  fromLXP: { count: 2, gross: 1680.00, week: 9 },
  weekSpark: [12, 18, 9, 22, 17, 6, 4],
  statusMix: [
    { label: 'Draft', n: 3 }, { label: 'Quoted', n: 1 }, { label: 'Confirmed', n: 2 },
    { label: 'Posted', n: 7 }, { label: 'Fulfilled', n: 1 }, { label: 'Voided', n: 1 },
  ],
};

DB.paymentsDash = {
  todayCash: 1080.00,
  weekCash: 9398.00,
  monthCash: 31648.00,
  fees: 242.98,
  pendingCount: 1, pendingValue: 2085.00,
  refundsMonth: { count: 1, value: 85.00 },
  disputes: 0,
  unallocated: 0.00,
  creditsOutstanding: 250.00,
  tenderMix: [
    { label: 'Card', value: 7313.00 },
    { label: 'Check', value: 2050.00 },
    { label: 'ACH', value: 2400.00 },
    { label: 'Wire', value: 0.00 },
  ],
  weekSpark: [1200, 0, 5000, 1033, 1085, 0, 1080],
};

/* Derive the A/R aggregates from the order rows. Runs once at load, after every
   order exists — so no screen can show a balance the order list disagrees with. */
recomputeCustomers();

/** Open A/R rows for one customer, oldest first — what the allocation grid works. */
DB.openOrdersFor = id => DB.orders
  .filter(o => DB.orderCustomerID(o) === id && DB.isOpenAR(o) && o.balance > 0)
  .sort((a, b) => (a.dueDate || a.orderDate).localeCompare(b.dueDate || b.orderDate));

/** Credit-carrying orders for one customer — a negative balance IS the credit. */
DB.creditsFor = id => DB.orders
  .filter(o => DB.orderCustomerID(o) === id && DB.isOpenAR(o) && o.balance < 0);

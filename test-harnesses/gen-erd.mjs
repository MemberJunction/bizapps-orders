/**
 * Generate `docs/ERD.md` from the AS-BUILT schema.
 *
 *     node test-harnesses/dump-schema.mjs /tmp/orders-schema.json
 *     node test-harnesses/gen-erd.mjs   /tmp/orders-schema.json docs/ERD.md [checkdefs.json]
 *
 * Run the dump against a database the committed migrations built. `scripts/rebuild-db.sh` builds
 * one; it drops and recreates the `.env` database, so point `.env` at a throwaway one.
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN DOC. An ERD maintained by hand drifts the moment
 * someone adds a column, and a drifted ERD is worse than none — people trust it. Everything
 * structural here (tables, columns, nullability, foreign keys, unique indexes, triggers,
 * value lists) is read out of the database. The prose is the only hand-written part, and it
 * lives in this file so regenerating never discards it.
 *
 * CHECK CONSTRAINT BODIES come from the dump, which reads `OBJECT_DEFINITION` for each one. A
 * login without VIEW DEFINITION on the schema gets NULL there; for those constraints the optional
 * third argument supplies the body instead, as `{ "<constraint name>": "<CHECK body as the
 * migration writes it>" }`. No script in the repo writes that file; for the first ERD it was built
 * outside the repo from the baseline migration's text. The page states how many bodies came from
 * each source, and leaves a constraint with neither out of §4.
 *
 * VALUE-LIST ORDER. SQL Server stores `Col IN ('a', 'b')` as `([Col]='b' OR [Col]='a')`, reversed,
 * but stores an explicit `Col = 'a' OR Col = 'b'` in written order, and the two stored texts look
 * the same. `valueList` reads a live body as an IN list and reverses it back. That holds for this
 * repo, where every value-list CHECK is written with IN; a list written as an explicit OR chain
 * would come out backwards. A checkdefs body is the migration's own spelling and keeps its order.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const [, , schemaPath, outPath, checkDefsPath] = process.argv;
const db = JSON.parse(readFileSync(schemaPath, 'utf8'));
const checkDefs = checkDefsPath ? JSON.parse(readFileSync(checkDefsPath, 'utf8')) : {};
const S = db.schema;

const FLYWAY = 'flyway_schema_history';

/** The newest migration on disk — what a reader should re-check this page against. */
const latestMigration = readdirSync(new URL('../migrations', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .pop() ?? '(none)';
const tables = db.tables.map((t) => t.TableName).filter((t) => t !== FLYWAY).sort();
const hasFlywayTable = db.tables.some((t) => t.TableName === FLYWAY);
const colsOf = (t) => db.columns.filter((c) => c.TableName === t);
const internalFks = db.fks.filter((f) => f.RefSchema === S && f.ParentTable !== FLYWAY);
const crossFks = db.fks.filter((f) => f.RefSchema !== S && f.ParentTable !== FLYWAY);
const uniqueIdx = db.indexes.filter((i) => i.IsUnique && !i.IsPK && i.TableName !== FLYWAY);
const bizTriggers = db.triggers.filter((t) => !t.TriggerName.startsWith('trgUpdate'));
const inbound = (t) => internalFks.filter((f) => f.RefTable === t).length;
const inboundTables = (t) => new Set(internalFks.filter((f) => f.RefTable === t).map((f) => f.ParentTable)).size;

/** Audit columns CodeGen owns; listing them on every table is noise. */
const AUDIT = new Set(['__mj_CreatedAt', '__mj_UpdatedAt', '__mj_DeletedAt']);

/** Short aliases for foreign schemas, so the diagrams say where a box lives. */
const alias = (schema, table) => {
    if (schema === S) return table;
    if (schema === '__mj') return `MJ_${table}`;
    if (schema === '__mj_BizAppsCommon') return `common_${table}`;
    if (schema === '__mj_BizAppsAccounting') return `acct_${table}`;
    if (schema === '__mj_BizAppsTasks') return `tasks_${table}`;
    return `${schema.replace(/^__mj_?/, '')}_${table}`;
};
const APP_NAME = { __mj: 'MJ core', __mj_BizAppsCommon: 'common', __mj_BizAppsAccounting: 'accounting', __mj_BizAppsTasks: 'tasks' };

/** Mermaid attribute types must be single tokens. */
function typeToken(c) {
    const t = c.DataType;
    if (t === 'nvarchar' || t === 'varchar') return c.MaxLen === -1 ? `${t}_max` : `${t}_${t === 'nvarchar' ? c.MaxLen / 2 : c.MaxLen}`;
    if (t === 'decimal' || t === 'numeric') return `${t}_${c.Prec}_${c.Scale}`;
    if (t === 'uniqueidentifier') return 'uuid';
    return t;
}

const pkCols = new Map();
for (const i of db.indexes) if (i.IsPK) pkCols.set(i.TableName, (i.Cols || '').split(', '));
const fkColsByTable = new Map();
for (const f of db.fks) {
    if (!fkColsByTable.has(f.ParentTable)) fkColsByTable.set(f.ParentTable, new Set());
    fkColsByTable.get(f.ParentTable).add(f.ParentColumn);
}
const uqColsByTable = new Map();
for (const i of uniqueIdx) {
    if (!uqColsByTable.has(i.TableName)) uqColsByTable.set(i.TableName, new Set());
    for (const c of (i.Cols || '').split(', ')) uqColsByTable.get(i.TableName).add(c);
}

/** One mermaid entity block with every non-audit column. */
function entityBlock(t, indent = '    ') {
    const out = [`${indent}${t} {`];
    for (const c of colsOf(t)) {
        if (AUDIT.has(c.ColumnName)) continue;
        const marks = [];
        if ((pkCols.get(t) || []).includes(c.ColumnName)) marks.push('PK');
        else if ((fkColsByTable.get(t) || new Set()).has(c.ColumnName)) marks.push('FK');
        else if ((uqColsByTable.get(t) || new Set()).has(c.ColumnName)) marks.push('UK');
        const notes = [];
        if (!c.IsNullable) notes.push('required');
        if (c.IsComputed) notes.push('computed');
        const note = notes.length ? ` "${notes.join(', ')}"` : '';
        out.push(`${indent}    ${typeToken(c)} ${c.ColumnName}${marks.length ? ' ' + marks[0] : ''}${note}`);
    }
    out.push(`${indent}}`);
    return out.join('\n');
}

/** Relationship lines for a set of tables; `includeCross` pulls in the foreign parents too. */
function relLines(set, { includeCross = true, onlyWithin = false } = {}) {
    const lines = [];
    for (const f of internalFks) {
        if (!set.has(f.ParentTable)) continue;
        if (onlyWithin && !set.has(f.RefTable)) continue;
        lines.push(`    ${f.RefTable} ||--o{ ${f.ParentTable} : "${f.ParentColumn}"`);
    }
    if (includeCross) {
        for (const f of crossFks) {
            if (!set.has(f.ParentTable)) continue;
            lines.push(`    ${alias(f.RefSchema, f.RefTable)} ||--o{ ${f.ParentTable} : "${f.ParentColumn}"`);
        }
    }
    return [...new Set(lines)].sort();
}

/** `§2.n` for an area key, so blurbs can point at each other without hard-coding the order. */
function sec(key) {
    const i = AREAS.findIndex((a) => a.key === key);
    if (i < 0) throw new Error(`no area '${key}'`);
    return `§2.${i + 1}`;
}

// ── the areas. Every table belongs to exactly one; the generator asserts that. ──────────────
// Blurbs are functions so they can read counts and section numbers at render time.
const AREAS = [
    {
        key: 'catalog', title: 'What can be sold — the catalogue',
        tables: ['Product', 'ProductType', 'ProductCategory', 'ProductBundleItem', 'ProductEntitlement',
            'EventProduct', 'SubscriptionType', 'SubscriptionFamily', 'RevenueRecognitionType'],
        blurb: () => `**\`Product\` is the hub of the catalogue** — ${inbound('Product')} foreign keys from ${inboundTables('Product')} tables point at it.
Everything a customer can buy is a Product row, and what KIND of thing it is comes from \`ProductType\`
plus the presence of a satellite row: an \`EventProduct\` row makes it an event with a capacity and a
date, a \`SubscriptionTypeID\` makes it recurring, \`ProductBundleItem\` rows make it a bundle that
expands into children at order time. That is deliberate — a new product kind adds a satellite table,
not a column to \`Product\` and not a new sibling of it.

\`ProductEntitlement\` rows are the templates for what buying the product grants (${sec('subs')}).
\`SubscriptionFamily\` groups products that are bands of one subscription offering, so confirm can see
that a holder already covered under one band is ordering another.

\`RevenueRecognitionType\` is where the catalogue meets accounting: it decides whether a line's money is
earned at once or deferred across a service window. A deferred type with \`ScheduleBasis\` \`AtBooking\`
makes one order line produce one booking entry and \`N\` forward-dated release entries; with
\`OnMeasurement\`, nothing is released at booking and revenue follows recorded progress (${sec('schedule')}).`,
    },
    {
        key: 'pricing', title: 'What it costs — price, promotion and who may discount',
        tables: ['ProductPrice', 'PriceList', 'PriceListAssignment', 'PriceTier', 'Promotion', 'PromotionCode',
            'PromotionTarget', 'PromotionType', 'ChargeType', 'SalesAuthority', 'SalesRule', 'OrderConcession', 'ReferralProgram'],
        blurb: () => `**Price is resolved, not stored on the product.** The price walk reads no price from \`Product\`; its
\`StandaloneSellingPrice\` is used only by bundle expansion, to price \`SumOfParts\` components and to
split a bundle's price across its \`Bundled\` ones. \`ProductPrice\` rows carry the money: each hangs on
a product or on a whole category, with or without a \`PriceList\`, and is scoped by quantity range,
date window and an optional \`Applicability\` rule.
\`PriceListAssignment\` decides which lists a given customer sees, and \`PriceTier\` carries the bands for
tiered and volume models. The walk that reads all this is in §6.

**\`Promotion\` is separated from \`PromotionCode\` on purpose**: one promotion can have many codes
(per-campaign, per-partner, single-use), and \`PromotionTarget\` scopes what a promotion may apply to.
\`SalesAuthority\` and \`SalesRule\` are the guardrails — who is allowed to give value away, and how much.
\`OrderConcession\` records each concession on an order, whatever form it takes (price, duration, seats,
scope or payment terms), with its computed value and the approval decision. An order cannot be
confirmed, nor its documents sent, while a concession on it is \`Pending\`.`,
    },
    {
        key: 'order', title: 'The order itself',
        tables: ['OrderHeader', 'OrderLine', 'OrderLineDimension', 'OrderLinePriceComponent', 'EventOrderLine',
            'OrderCharge', 'OrderChargeAllocation', 'OrderAdjustment', 'OrderAdjustmentAllocation',
            'OrderSequence', 'OrderCompanyPolicy', 'DimensionDefault'],
        blurb: () => `**The LINE is the unit of money.** A line carries its own \`CompanyID\` (a denormalised copy of the
product's company, captured at save time), its own journal entry, its own tax, and its own billed and
recognised totals (\`BilledToDate\`, \`RecognizedToDate\`). That is what lets one order sell products
belonging to several companies and still produce correct, single-company journal entries.

**Charges and adjustments are allocated, not summed.** \`OrderCharge\` and \`OrderAdjustment\` sit at the
header, and their \`*Allocation\` children push the money down onto specific lines — so a shipping
charge or an order-level discount still lands on a line, which still lands on one company's ledger.

\`OrderLinePriceComponent\` is the audit trail of the pricing walk: how the number was arrived at, kept
beside the number itself. \`OrderLineDimension\` holds the tags derived for a line, from \`DimensionDefault\`
rows and from the line's own facts (§6); the one tag a person types is on the line,
\`OrderLine.DimensionID\` / \`DimensionValueID\`. \`OrderCompanyPolicy\` is the per-company orders
settings row, and its ID is the \`__mj.Company\` ID: promotion stacking, whether unpriced lines are
refused, and the company's default price list, payment terms, pricing driver and renewal increase.
\`OrderSequence\` is a singleton counter for \`ORD-{seq}\`, not part of the graph.`,
    },
    {
        key: 'checkout', title: 'How a web buyer orders — the embeddable checkout',
        tables: ['CheckoutWidget', 'CheckoutWidgetDistribution', 'CheckoutSession', 'CheckoutSessionStep',
            'OrderCheckoutAnswer', 'OrderLineChoice'],
        blurb: () => `A \`CheckoutWidget\` is one company's configured checkout; its questions, choice groups and settings
live in \`Configuration\`. A \`CheckoutWidgetDistribution\` publishes it at a public slug, optionally
through a magic-link invite, and can be revoked. A \`CheckoutSession\` is one anonymous buyer's visit:
its client key, the draft order and payment intent it built, and any auto-renew consent the buyer gave.

After payment the session confirms the order and captures the payment. \`CheckoutSessionStep\` records
each of those steps per session, how often it was tried and how the last try ended; a failed or
unfinished step is what an operator reviews and replays.

What the buyer told the widget is kept on the order: \`OrderCheckoutAnswer\` holds one answer per
question, and \`OrderLineChoice\` one row per option chosen, on the line it was chosen for. A
\`ProductEntitlement\` template with a \`ChoiceGroupKey\` grants only on a line carrying that choice, and a
renewal copies the choices. \`OrderHeader.Origin\` and \`SourceCheckoutWidgetID\` mark an order the widget
created. See [\`checkout-widget-and-session-architecture.md\`](checkout-widget-and-session-architecture.md).`,
    },
    {
        key: 'subs', title: 'What the customer keeps getting — subscriptions and entitlements',
        tables: ['Subscription', 'SubscriptionTerm', 'SubscriptionEvent', 'SubscriptionSequence',
            'EntitlementGrant', 'EntitlementAccessOverride', 'StoredValueAccount', 'StoredValueTransaction'],
        blurb: () => `**\`Subscription\` is the durable thing; \`SubscriptionTerm\` is the billable slice.** A subscription
persists across renewals, and its terms are the periods that get billed and recognised; the engine
operates on the term. A subscription row carries no quantity: the seat count is on the order line that
bought each term (\`SubscriptionTerm.OrderLineID\`), and a renewal copies it from there.

\`SubscriptionEvent\` is the history; §4 lists its event types. \`EntitlementGrant\` is what a purchase
actually gives someone: an instance of one of the product's \`ProductEntitlement\` templates, granted
from an order line and, for a subscription, tied to its term. A payment-gated grant can be held until
the first payment, and a renewal's grant cut off once its order is past due beyond a configured
cutoff; \`EntitlementAccessOverride\` is a recorded, approved exception to either on one order.
\`StoredValueAccount\` / \`StoredValueTransaction\` hold gift cards and other stored value, where the
customer holds value rather than a right. An account credit is not one of them: it is the over-paid
order's negative balance.

A subscription's \`CompanyID\` comes from the ORDER LINE that created it, not from the order header, so a
mixed-company order puts each subscription on its own seller's books.`,
    },
    {
        key: 'pay', title: 'Getting paid',
        tables: ['PaymentHeader', 'PaymentDetail', 'PaymentLine', 'PaymentIntent', 'PaymentProvider',
            'PaymentProviderType', 'PaymentProviderPrice', 'PaymentType', 'PaymentSequence', 'CustomerPaymentMethod', 'PaymentWebhookDelivery'],
        blurb: () => `**The money that arrived and the money's application are separate tables, because a payment is
not an allocation.** \`PaymentHeader\` is the receipt; \`PaymentLine\` hangs off it and records how that
money was applied: against an order, and optionally a specific line or instalment. One cheque paying
three invoices is one header and three lines — which is what lets the ledger and the receivable agree.

**\`PaymentDetail\` is NOT a third level below them.** The header *points at* it
(\`PaymentHeader.PaymentDetailID\`), because it is the instrument snapshot — brand, last four, expiry,
bank routing tail, or a stored-value account. It is copied on use, never shared: an order's intended
instrument (\`OrderHeader.InitialPaymentDetailID\`), a payment's actual one and a saved
\`CustomerPaymentMethod\` each get their own row. Reading the arrow the other way is the easy mistake here.

\`PaymentHeader.ReversesPaymentHeaderID\` makes a refund or a bank return a payment of its own that
points at the original; the reversal's negative lines take the cash back off the orders the original
settled, and \`ReversalSource\` says which of the two it was. \`IdempotencyKey\`, unique when set, is
what stops a retried request from recording the same money twice.

\`PaymentIntent\` is the provider handshake (Stripe and friends) held separately from the payment
itself, so an abandoned intent leaves no payment behind, and \`PaymentWebhookDelivery\` records each
verified webhook delivery from a provider and what was done with it. \`PaymentProviderType\` /
\`PaymentProvider\` keep the app provider-agnostic, and \`CustomerPaymentMethod\` stores the customer's
saved instrument — a token, never a card number.

Immutability here is enforced by TRIGGERS, not by the application: see §5.`,
    },
    {
        key: 'schedule', title: 'Billing and earning over time — instalments and progress',
        tables: ['OrderHeaderPaymentSchedule', 'InstalmentLineBilling', 'OrderLineProgressMeasurement'],
        blurb: () => `**Instalments.** An order billed in instalments carries \`OrderHeaderPaymentSchedule\` rows, one per
instalment, each stamped with the order's company: a due date and an amount the customer agreed to. An
order that had already issued an instalment, or aimed a payment at one, under the earlier per-company
rows keeps those rows. Each row takes its own document number when it is invoiced; the ledger splits it
into one billing entry per product company, and the row records the first. Each row keeps its own
\`AmountPaid\` and \`Balance\`, and is frozen once \`Invoiced\` (§5). \`PaymentLine.OrderHeaderPaymentScheduleID\`
aims a payment at one instalment; cash that names none counts against invoiced instalments before
scheduled ones, oldest due first. That the instalments add up to the lines they bill is checked in
code, at confirm and at invoicing. An order with no rows is billed as a whole.

**Progress.** A line whose recognition type has \`ScheduleBasis\` \`OnMeasurement\` (percentage of
completion) releases nothing at booking. Each \`OrderLineProgressMeasurement\` row is an attested
observation of cumulative percent complete on a date, and \`Orders.RecordProgress\` posts the catch-up
to it with its journal entry. A posted row never changes (§5): a correction is a new row that
supersedes it, and the superseded row's recognition is reversed.`,
    },
    {
        key: 'external', title: 'Invoicing through an external system — Bill.com',
        tables: ['ExternalCustomer', 'ExternalInvoice', 'ExternalPayment', 'PaymentProviderSyncState'],
        blurb: () => `A company can invoice and collect through an external system instead of natively. The system is a
\`PaymentProvider\` row whose type is an invoice rail; Bill.com is the one rail today.

\`ExternalInvoice\` is the authoritative order-to-invoice mapping: one row per billing unit (order,
selling company, and an instalment or the whole order) per attempt. It is written as \`Sending\` before
the rail is called, and \`UQ_ExternalInvoice_LiveUnit\` refuses a second live invoice for the same unit.
\`ExternalCustomer\` maps a bill-to organization or person to the rail's customer. \`ExternalPayment\` is
every payment the poller has seen on the rail and what it did with it (\`Captured\` with the
\`PaymentHeader\` it made, \`Held\`, \`Unmatched\`, …), and \`PaymentProviderSyncState\` is the poll
watermark per provider and rail object. See [\`billcom-invoice-rail.md\`](billcom-invoice-rail.md).`,
    },
    {
        key: 'outbound', title: 'Telling other systems — outbound events',
        tables: ['OutboundEvent', 'OutboundDelivery'],
        blurb: () => `\`OutboundEvent\` is a transactional outbox: an event is written in the same transaction as the change
that caused it (an order confirmed, an entitlement grant's status changed), so it exists exactly when
that change committed, and its ID is the event id consumers dedupe on. \`OutboundDelivery\` is one row
per event per registered consumer. A dispatcher sends \`Pending\` rows after commit and retries until
\`Delivered\` or, past the deadline, \`DeadLettered\`; \`GatesAccess\` marks the consumers whose delivery
decides whether a buyer's access is ready. See [\`outbound-events.md\`](outbound-events.md).`,
    },
    {
        key: 'cust', title: 'What this customer specifically gets',
        tables: ['CustomerPaymentTerms', 'CustomerTaxExemption', 'PaymentTermsType'],
        blurb: () => `\`CustomerPaymentTerms\` and \`CustomerTaxExemption\` carry per-customer deviations from the default;
\`PaymentTermsType\` is the list of terms (net days) that customer terms, orders and the company default
point at. \`CustomerPaymentTerms\` is date-effective and optionally scoped to one selling company, keyed
on an organization OR a person the same way \`CustomerTaxExemption\` is: the \`CK_*_Party\` constraints
require exactly one of the two.

The payment-terms walk (§6) reads \`CustomerPaymentTerms\` at its third rung. The fourth is the selling
company's default, \`OrderCompanyPolicy.DefaultPaymentTermsTypeID\` (${sec('order')}).`,
    },
];

// Assert the partition is total and disjoint — a table silently missing from every area is
// exactly the kind of drift this generator exists to prevent.
const assigned = AREAS.flatMap((a) => a.tables);
const missing = tables.filter((t) => !assigned.includes(t));
const dupes = assigned.filter((t, i) => assigned.indexOf(t) !== i);
const unknown = assigned.filter((t) => !tables.includes(t));
if (missing.length || dupes.length || unknown.length) {
    console.error(`AREA PARTITION BROKEN — unassigned: ${missing}  duplicated: ${dupes}  not-in-db: ${unknown}`);
    process.exit(2);
}

// §1 names the three most-referenced tables and the role of each. If another table overtakes one
// of them the sentence has to be rewritten, not regenerated.
const SHAPE_TABLES = ['Product', 'OrderLine', 'OrderHeader'];
const leastShape = Math.min(...SHAPE_TABLES.map(inbound));
const rivals = tables.filter((t) => !SHAPE_TABLES.includes(t) && inbound(t) > leastShape);
if (rivals.length) {
    console.error(`§1 PROSE IS STALE — ${rivals.map((t) => `${t} (${inbound(t)})`).join(', ')} now has more inbound foreign keys than one of ${SHAPE_TABLES.join(', ')}`);
    process.exit(2);
}

// ── CHECK constraint bodies: live where the dump has them, else the checkdefs file ──────────
const checkBody = new Map(); // constraint name → { body, live }
let liveBodies = 0;
let fileBodies = 0;
for (const c of db.checks) {
    if (c.Definition) { checkBody.set(c.CheckName, { body: c.Definition, live: true }); liveBodies += 1; }
    else if (checkDefs[c.CheckName]) { checkBody.set(c.CheckName, { body: checkDefs[c.CheckName], live: false }); fileBodies += 1; }
}
const noBody = db.checks.length - liveBodies - fileBodies;

/**
 * `{ col, lits }` when a CHECK body only says "this column is one of these literals", else null.
 * Two literals at least; one is an equality, not a list.
 *
 *   as a migration writes it:  Status IN ('Draft','Quoted')                 — declared order
 *   as SQL Server stores it:   ([Status]='Quoted' OR [Status]='Draft')     — reversed
 *
 * The body is split into its OR terms, parenthesised groups included, so an IS NULL term may sit
 * anywhere. It adds nothing to the list: a CHECK passes on NULL either way, so whether the column
 * takes NULL is its nullability, which §2 shows. A live body's values are reversed back to declared
 * order (the header states the limit); a checkdefs body is read in written order.
 */
function valueList(defn, live) {
    let col = null;
    const lits = [];
    for (const t of orTerms(defn)) {
        const isNull = /^\[?(\w+)\]?\s+IS\s+NULL$/i.exec(t);
        const eq = /^\[?(\w+)\]?\s*=\s*N?'((?:[^']|'')*)'$/.exec(t);
        const inList = /^\[?(\w+)\]?\s+IN\s*\(([^)]*)\)$/i.exec(t);
        const m = isNull ?? eq ?? inList;
        if (!m || (col && col.toLowerCase() !== m[1].toLowerCase())) return null;
        col ??= m[1];
        if (eq) lits.push(eq[2]);
        if (inList) lits.push(...[...inList[2].matchAll(/N?'((?:[^']|'')*)'/g)].map((x) => x[1]));
    }
    if (lits.length < 2) return null;
    return { col, lits: (live ? lits.reverse() : lits).map((x) => x.replace(/''/g, "'")) };
}

/** The OR terms of an expression, with parenthesised OR groups flattened into it. */
function orTerms(expr) {
    let s = expr.trim();
    while (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
    const parts = [];
    let depth = 0;
    let inStr = false;
    let start = 0;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === "'") inStr = !inStr;
        else if (!inStr && ch === '(') depth += 1;
        else if (!inStr && ch === ')') depth -= 1;
        else if (!inStr && depth === 0) {
            const or = /^\s+OR\s+/i.exec(s.slice(i));
            if (or) { parts.push(s.slice(start, i)); i += or[0].length - 1; start = i + 1; }
        }
    }
    parts.push(s.slice(start));
    return parts.length > 1 ? parts.flatMap(orTerms) : [s];
}

/** True when every parenthesis in `s` closes, outside string literals. */
function balanced(s) {
    let depth = 0;
    let inStr = false;
    for (const ch of s) {
        if (ch === "'") inStr = !inStr;
        else if (!inStr && ch === '(') depth += 1;
        else if (!inStr && ch === ')') { depth -= 1; if (depth < 0) return false; }
    }
    return depth === 0;
}

// ── document ────────────────────────────────────────────────────────────────────────────────
const L = [];
const p = (s = '') => L.push(s);

const nCross = crossFks.length;
const crossByTarget = {};
for (const f of crossFks) {
    const k = `${f.RefSchema}.${f.RefTable}`;
    (crossByTarget[k] ||= []).push(f);
}

// Where the CHECK bodies behind §4 came from, stated from the counts rather than assumed.
const provenance = [];
if (!fileBodies && !noBody) {
    provenance.push(`> **CHECK constraint bodies** (§4) were read from the same database, through \`OBJECT_DEFINITION\` (${liveBodies}/${db.checks.length}).`);
} else {
    const parts = [
        liveBodies && `${liveBodies} have a body read live`,
        fileBodies && `${fileBodies} have a body from a checkdefs file written from the migrations, not from the database`,
        noBody && `${noBody} have no body and are left out of §4`,
    ].filter(Boolean);
    provenance.push(`> **One provenance caveat.** The login that ran the dump lacked \`VIEW DEFINITION\`, so \`OBJECT_DEFINITION\``);
    provenance.push(`> returned NULL for ${fileBodies + noBody} of the ${db.checks.length} CHECK constraints. Of the ${db.checks.length} constraints, ${parts.join('; ')}.`);
}

p(`# \`bizapps-orders\` — ERD`);
p();
p(`> **This is the AS-BUILT ERD — a reflection of the implementation, not a plan.** Intended-but-unbuilt`);
p(`> schema belongs in \`plans/\`, never here; this file must always describe what the database actually`);
p(`> contains.`);
p(`>`);
p(`> **GENERATED FROM THE LIVE SCHEMA.** Every table, column, nullability, foreign key, unique index,`);
p(`> CHECK constraint and trigger below was read out of \`sys.tables\` / \`sys.columns\` / \`sys.foreign_keys\` /`);
p(`> \`sys.indexes\` / \`sys.check_constraints\` / \`sys.triggers\` on a database built by the committed`);
p(`> migrations. \`scripts/rebuild-db.sh\` builds one; it drops and recreates the \`.env\` database, so point`);
p(`> \`.env\` at a throwaway one. Do not hand-edit this page — regenerate:`);
p(`>`);
p('> ```sh');
p(`> node test-harnesses/dump-schema.mjs /tmp/orders-schema.json`);
p(`> node test-harnesses/gen-erd.mjs   /tmp/orders-schema.json docs/ERD.md`);
p('> ```');
p(`>`);
// A verification STAMP, not decoration. Without it a reader cannot tell whether this page was
// checked against the database today or three migrations ago — and an ERD nobody can date is one
// nobody can trust. The migration filename is included because that is what actually determines
// the shape; if it changes and this page did not, the two disagree.
p(`> **Verified against the live database:** ${new Date().toISOString().slice(0, 10)} · latest migration \`${latestMigration}\``);
p(`>`);
p(`> **Schema:** \`${S}\` · **Entity prefix:** \`MJ_BizApps_Orders: \` · **Keys:** UUID throughout`);
p(`> **${tables.length} tables · ${internalFks.length} internal relationships · ${nCross} cross-app foreign keys ·`);
p(`> ${db.checks.length} CHECK constraints · ${uniqueIdx.length} unique indexes** beyond the primary keys ·`);
p(`> **${bizTriggers.length} business triggers** · ${db.views.length} views.`);
p(`>`);
if (hasFlywayTable) {
    p(`> (${tables.length} is the app's own tables. \`sys.tables\` reports ${db.tables.length} because the migration runner keeps its`);
    p(`> \`flyway_schema_history\` in this schema; that table belongs to the migration tool, not to the model.)`);
    p(`>`);
}
for (const line of provenance) p(line);
p(`>`);
p(`> **How to read this.** §1 is the master map: every table, every connection, no columns — an`);
p(`> orientation tool, too wide to work from. §2 is the ${AREAS.length} area maps WITH full column lists, small`);
p(`> enough to actually read, and they are what you want open while writing code. §3 is the cross-app`);
p(`> register. §4 is the value lists. §5 and §6 are the parts no diagram can carry — the rules that live`);
p(`> in triggers and in server code rather than in the schema. §7 is the known gaps, and §8 is what is`);
p(`> deliberately absent.`);
p();
p(`---`);
p();

// §0
p(`## 0. Three rules that explain most of this schema`);
p();
p(`**1 — The LINE is the unit of money, not the order.** \`OrderLine\` carries its own \`CompanyID\`, its own`);
p(`journal entry, its own tax and its own billed and recognised totals; \`OrderHeader\` is a container`);
p(`whose totals are rolled up from its lines by trigger. This is what lets a single order sell products`);
p(`belonging to several different companies and still emit journal entries that are each single-company`);
p(`and balanced — the alternative, a company on the header, makes multi-company orders unrepresentable.`);
p();
p(`**2 — References point UP the dependency graph, and they are real foreign keys.** Orders depends on`);
p(`\`common\`, \`tasks\`, \`accounting\` and MJ core, so it may hold hard FKs into them (${nCross} of them, §3) —`);
p(`installs run in dependency order, so the targets always exist. Orders holds NO reference to any app`);
p(`that depends on it. Accounting's link back to an order line is a polymorphic`);
p(`\`LinkedEntityID\`/\`LinkedRecordID\` pair on the journal entry, which is a typed polymorphic link and not`);
p(`a soft key.`);
p();
p(`**3 — Derived money is materialised and then frozen.** Line totals are computed server-side, rolled`);
p(`up to the header by trigger, and made immutable once the order is confirmed (§5). A client cannot`);
p(`supply a total that disagrees with what was booked, and a booked figure cannot drift afterwards.`);
p();
p(`---`);
p();

// §1
p(`## 1. Master map — every table, every connection inside the app`);
p();
p(`No columns; this is the shape only. **Cross-app foreign keys are deliberately NOT drawn here** — all`);
p(`${nCross} of them would join the ${internalFks.length} edges below and hide the app's own structure, which is the one thing`);
p(`this diagram exists to show. They get their own map and full register in §3.`);
p();
p('```mermaid');
p('erDiagram');
for (const l of relLines(new Set(tables), { includeCross: false })) p(l);
p('```');
p();
p(`**Reading the shape.** Three tables carry the graph: \`Product\` (${inbound('Product')} inbound) is what can be`);
p(`sold, \`OrderLine\` (${inbound('OrderLine')} inbound) is what was sold, and \`OrderHeader\` (${inbound('OrderHeader')} inbound) groups it. Read the`);
p(`app as catalogue → order → what an order leaves behind: subscriptions and entitlements, payments and`);
p(`instalments, invoices on an external system, and events for other systems.`);
p();
// Anything with no INTERNAL foreign key cannot appear in the diagram above. Derive the list from
// that exact predicate rather than describing it from memory, so the note can never disagree with
// the picture — an earlier hand-written version named three of these five and quietly lost two.
const absent = tables.filter((t) => !internalFks.some((f) => f.ParentTable === t || f.RefTable === t));
if (absent.length) {
    const crossOnly = absent.filter((t) => crossFks.some((f) => f.ParentTable === t));
    const isolated = absent.filter((t) => !crossOnly.includes(t));
    p(`**Not in the diagram above (${absent.length} tables), because they have no foreign key to or from another orders table:**`);
    p();
    if (isolated.length) p(`- ${isolated.map((t) => `\`${t}\``).join(', ')} — no foreign key at all.`);
    for (const t of crossOnly) {
        const apps = [...new Set(crossFks.filter((f) => f.ParentTable === t).map((f) => APP_NAME[f.RefSchema] ?? f.RefSchema))];
        p(`- \`${t}\` — connected only outside the app, to ${apps.join(' and ')} (see §3).`);
    }
    p();
}
p(`---`);
p();

// §2 area maps
p(`## 2. Area maps — full columns, small enough to read`);
p();
p(`Audit columns CodeGen owns (\`__mj_CreatedAt\`, \`__mj_UpdatedAt\`) are omitted from every block; they`);
p(`are on every table. \`PK\`/\`FK\`/\`UK\` mark the key role; \`required\` means \`NOT NULL\`.`);
p();
let n = 0;
for (const a of AREAS) {
    n += 1;
    const set = new Set(a.tables);
    p(`### 2.${n} ${a.title}`);
    p();
    p(a.blurb());
    p();
    p('```mermaid');
    p('erDiagram');
    for (const l of relLines(set, { includeCross: false, onlyWithin: true })) p(l);
    for (const t of a.tables) p(entityBlock(t));
    p('```');
    p();
    const outbound = internalFks.filter((f) => set.has(f.ParentTable) && !set.has(f.RefTable));
    if (outbound.length) {
        p(`**Leaves this area:** ` + [...new Set(outbound.map((f) => `\`${f.ParentTable}.${f.ParentColumn}\` → \`${f.RefTable}\``))].join(', ') + '.');
        p();
    }
    const xs = crossFks.filter((f) => set.has(f.ParentTable));
    if (xs.length) {
        p(`**Reaches outside the app:** ` + [...new Set(xs.map((f) => `\`${f.ParentTable}.${f.ParentColumn}\` → \`${f.RefSchema}.${f.RefTable}\``))].join(', ') + '.');
        p();
    }
}
p(`---`);
p();

// §3
p(`## 3. Cross-app reference register`);
p();
p(`${nCross} foreign keys leave this schema. All point UP the dependency graph (rule 2). Nothing here is`);
p(`optional trivia: **these are the references that break silently when an upstream app re-bakes its`);
p(`baseline**, because our generated metadata pins upstream entity IDs by GUID.`);
p();
p('```mermaid');
p('erDiagram');
for (const [target, list] of Object.entries(crossByTarget).sort((a, b) => b[1].length - a[1].length)) {
    const [sch, tbl] = target.split('.');
    // Label each edge with the column(s) that carry it — an empty label is both unhelpful and
    // something Mermaid is not obliged to accept.
    const byParent = new Map();
    for (const f of list) {
        if (!byParent.has(f.ParentTable)) byParent.set(f.ParentTable, new Set());
        byParent.get(f.ParentTable).add(f.ParentColumn);
    }
    for (const pt of [...byParent.keys()].sort()) {
        p(`    ${alias(sch, tbl)} ||--o{ ${pt} : "${[...byParent.get(pt)].sort().join(', ')}"`);
    }
}
p('```');
p();
p(`| → target | count | from |`);
p(`|---|---|---|`);
for (const [target, list] of Object.entries(crossByTarget).sort((a, b) => b[1].length - a[1].length)) {
    const froms = [...new Set(list.map((f) => `\`${f.ParentTable}.${f.ParentColumn}\``))].sort().join(', ');
    p(`| \`${target}\` | ${list.length} | ${froms} |`);
}
p();
const companyTables = new Set((crossByTarget['__mj.Company'] ?? []).map((f) => f.ParentTable)).size;
p(`**\`__mj.Company\` is the multi-company spine.** ${companyTables} tables reference it, most through a \`CompanyID\``);
p(`column, \`OrderLine\` among them — that column is what makes a mixed-company order bookable (rule 1).`);
p();
p(`---`);
p();

// §4 value lists
const vlists = db.checks
    .map((c) => {
        const entry = checkBody.get(c.CheckName);
        const v = entry ? valueList(entry.body, entry.live) : null;
        return v ? { name: c.CheckName, tbl: c.TableName, ...v } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.tbl.localeCompare(b.tbl) || a.col.localeCompare(b.col));

p(`## 4. Value lists (CHECK-constrained)`);
p();
p(`${vlists.length} columns are constrained to a closed set at the database. These are the ones worth knowing`);
p(`before writing a query — a value not on this list cannot be in the column. A column §2 does not mark`);
p(`\`required\` can also be NULL, because a CHECK of this shape does not refuse NULL.`);
p();
p(`| table.column | allowed values |`);
p(`|---|---|`);
for (const v of vlists) p(`| \`${v.tbl}.${v.col}\` | ${v.lits.map((x) => `\`${x}\``).join(' · ')} |`);
p();
p(`The other ${db.checks.length - vlists.length - noBody} CHECK constraints are rules rather than lists: exactly one of two party columns, a`);
p(`window whose end follows its start, a non-negative amount, a column that must hold valid JSON, a`);
p(`field required by another field's value. §2 does not show them; \`sys.check_constraints\` has their`);
p(`bodies.${noBody ? ` ${noBody} more could not be classified, because their bodies were not available.` : ''}`);
p();
p(`---`);
p();

// §5 triggers
p(`## 5. The rules that live in TRIGGERS, not in the tables`);
p();
p(`${bizTriggers.length} business triggers, and they carry two of the app's load-bearing guarantees: totals the database`);
p(`derives, and records that cannot change once they are booked, captured or decided. A diagram cannot`);
p(`show either, and code that ignores them will fail at runtime rather than at compile time.`);
p();
p(`| table | trigger | what it guarantees |`);
p(`|---|---|---|`);
const TRIGGER_NOTE = {
    'trg_EntitlementAccessOverride_Record': "An update cannot rewrite the override's request or decision. What was requested (order, type, reason, last day, requester) never changes (51023); its status moves only from Requested to Approved, Rejected or Withdrawn, and from Approved to Expired (51024); and the approval task and the decision, once recorded, are not rewritten (51025). The trigger fires on UPDATE only, so a row can still be deleted. That the decision came through the approval task is checked in code (`EntitlementAccessOverrideEntityServer`).",
    'trg_InstalmentLineBilling_Immutable': 'A billing row records what an issued instalment invoice billed a line, and later instalments are sliced against it, so a row cannot be updated or deleted (51032). A correction is an amount change or a reversal order. Purges of committed test orders disable it with the other order guards.',
    'trg_OrderConcession_RollupTotals': "A concession that carries a `ScheduleReduction` or a `CreditMemoAmount` changes what the order still owes, so adding, changing or removing one recomputes the order's totals through `spRecalcOrderHeaderTotals`. Concessions with neither leave the totals alone.",
    'trg_OrderHeader_ImmutableAfterConfirm': "Every rule that freezes a confirmed order header. Its status cannot leave Confirmed (51014), and its date, selling company, order type, reversal link and set bill-to party are history (51013); an empty bill-to party may still be filled, which is what claiming a guest order relies on (claim minting is dormant: `CheckoutSessionService` calls the local stand-in in `identityClaimContracts.ts`, which throws). A set `BillToAddressID` / `ShipToAddressID` cannot be replaced or cleared, an empty one can be filled only together with its snapshot, and a written snapshot never changes on any order (51015); reporting and the invoice read `BillToAddressSnapshot` / `ShipToAddressSnapshot` on a confirmed order, because the Common `Address` row stays editable. Once `ConfirmedAt` is set, `ConfirmedByUserID` cannot change (51017). Its `PaymentTermsTypeID` changes only to match its latest approved `Terms` `OrderConcession`, prior terms to new (51018); matching the latest, not any, keeps an earlier approval from being replayed, and `DueDate` stays writable. The checks run in that order, so a write that breaks two rules is refused with the first.",
    'trg_OrderHeaderPaymentSchedule_Immutable': 'An instalment is frozen once it is past Scheduled. Only a Scheduled row may be deleted (51020); after that its order, company, number, due date, amount and invoice identity cannot change, and it cannot return to Scheduled (51021). `DocumentNumber` and `JournalEntryID` are set once and never cleared or replaced, on any status (51022). That the instalments add up to the lines is checked in code, at confirm and at invoicing, because editing a schedule one row at a time passes through states that do not add up.',
    'trg_OrderHeaderPaymentSchedule_RollupTotals': "Adding, re-amounting or removing an instalment recomputes the order's instalment rollups (`AmountPaid`, `Balance`, `Status` per row).",
    'trg_OrderLine_ImmutableAfterConfirm': "Every rule that freezes a confirmed order line. A line of a confirmed order cannot be deleted (51002), and its product, quantity, money and selling company are history (51003). This is why the server short-circuits its own total recomputation once `JournalEntryID` is stamped — a figure it cannot reproduce from stored state alone would be rejected here and roll back the whole confirm. The same set-once address rule as the header holds for a line's own `ShipToAddressID` and `ShipToAddressSnapshot` (51016); the confirm path writes a draft's line snapshots while the header is still Draft for this reason. A set `JournalEntryID` is never cleared or replaced, on any status (51008). `test-harnesses/order-guard-triggers.mjs` and `address-snapshot-triggers.mjs` exercise both triggers.",
    'trg_OrderLine_RollupTotals': "The order's `TotalGross`, `Balance` and `FulfillmentStatus`, and its instalment rollups, are recomputed from the lines by the database, so a client cannot supply a total that disagrees with what was booked.",
    'trg_OrderLineProgressMeasurement_Immutable': 'A posted progress observation cannot be changed or deleted (51030), and nothing may promote a Draft one to Posted (51031): `Orders.RecordProgress` writes a row Posted in the same transaction as its journal entry. A correction is a new observation that supersedes the old one.',
    'trg_PaymentDetail_Immutable': "Once written, an instrument's company, payment type, provider customer and instrument references, brand, last four, expiry, bank name, routing and account tails, reference number and stored-value account cannot change (51009). Not covered: `HolderName`, `BankAccountType`, `InstrumentDate`, `PaymentProviderID`, `SourceCustomerPaymentMethodID`, `SourceOrderHeaderID` and `Notes`. The trigger fires on UPDATE only; the foreign keys from a payment, an order or a saved method keep a referenced detail from being deleted.",
    'trg_PaymentHeader_ImmutableAfterCapture': 'Captured money is frozen. A captured payment cannot be deleted (51004), its amount, fees, type, date, receiving company and customer cannot change (51005), a set `JournalEntryID` is never cleared or replaced (51006), and its status cannot go back (51007).',
    'trg_PaymentHeader_RollupTotals': 'A payment status change (Pending to Captured, say) changes what counts as paid, so the orders its lines touch are recomputed.',
    'trg_PaymentLine_ImmutableAfterCapture': "Once its payment is captured, an applied payment line cannot be deleted (51010), and its amount, order and order line cannot change (51011); the instalment it names (`OrderHeaderPaymentScheduleID`) is not covered. A set `BookedAt` is never cleared or replaced (51012).",
    'trg_PaymentLine_RollupTotals': "The order's `AmountPaid` and `Balance`, and its instalments', are recomputed from the lines of its captured payments.",
};
for (const t of bizTriggers) p(`| \`${t.TableName}\` | \`${t.TriggerName}\`${t.IsDisabled ? ' (disabled)' : ''} | ${TRIGGER_NOTE[t.TriggerName] ?? '—'} |`);
p();
const updTables = new Set(db.triggers.filter((t) => t.TriggerName.startsWith('trgUpdate')).map((t) => t.TableName));
const onePerTable = updTables.size === tables.length && tables.every((t) => updTables.has(t));
p(`The other ${db.triggers.length - bizTriggers.length} triggers are CodeGen's \`trgUpdate*\` \`__mj_UpdatedAt\` maintainers, ${onePerTable ? 'one per table' : `on ${updTables.size} of the ${tables.length} tables`}.`);
p(`They are not business logic and are omitted above.`);
p();
p(`---`);
p();

// §6 resolution walks / server rules
const WALKS = [
    ['**GL account**', 'product → its category → that category\'s ancestors → its product type → the line\'s company', '**Refuses the confirm.** Booked money with nowhere to go is worse than no order.'],
    ['**Price**', 'stated `UnitPrice` → a pricing plugin registered for the product, its category or an ancestor, or the company → the default resolver, which picks by `Priority` among the `ProductPrice` rows on the product or inherited from its category chain, from the customer\'s price lists and the base prices', 'When no price rule is found, the line is refused unless the company\'s `OrderCompanyPolicy.RefuseUnpricedLines` is off, and then it books at zero. Rules that exist but do not apply to the quantity or date, or two that tie, are refused either way.'],
    ['**Payment terms**', 'stated `DueDate` → stated `PaymentTermsTypeID` → `CustomerPaymentTerms` → the selling company\'s default, `OrderCompanyPolicy.DefaultPaymentTermsTypeID` → due on receipt', 'Falls through to due on receipt.'],
    ['**GL dimensions**', 'the tag stated on the line (`OrderLine.DimensionID` / `DimensionValueID`) → tags derived from the line itself (ARR type from its subscription action, vintage from its event\'s start year) → `DimensionDefault` rows on the product → its category → that category\'s ancestors → its product type → the line\'s company, nearest level per dimension; derived tags are written as `OrderLineDimension` rows', 'The line books untagged on that dimension. The booking is refused only where the GL account\'s link requires the dimension.'],
];
p(`## 6. The rules that are not in the schema at all`);
p();
const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
p(`${COUNT_WORD[WALKS.length] ?? WALKS.length} of the app's **resolution walks** decide values the tables only store the result of; the entitlement`);
p(`settings stored on \`EntitlementGrant\` and a line's taxability walk the same product chain and are not listed`);
p(`here. Each tries progressively more general sources; the nearest answer wins, except that among prices`);
p(`the row's \`Priority\` decides. They are the reason a column can be non-null and still tell you nothing`);
p(`about where its value came from.`);
p();
p(`| walk | order tried | on exhaustion |`);
p(`|---|---|---|`);
for (const [walk, order, exhausted] of WALKS) p(`| ${walk} | ${order} | ${exhausted} |`);
p();
p(`Two more behaviours are server-side only:`);
p();
p(`- **\`OrderLine.CompanyID\` is derived, never authored.** While the order is open it is stamped from the`);
p(`  product's company on every save, overwriting whatever a caller passed. Once the order is booked the`);
p(`  line keeps the company it was sold under, even if the product later moves (51003, §5).`);
p(`- **A bundle's parent line contributes zero.** An expanded bundle keeps its parent line for the`);
p(`  invoice to print, but the money lives on the children; the parent's totals are forced to zero so`);
p(`  the header rollup does not double the order.`);
p();
p(`---`);
p();

// §7 known gaps
p(`## 7. Known gaps in this schema`);
p();
p(`Recorded here because each is a place where the tables and the code disagree, and a reader who trusts`);
p(`the diagram alone will be misled.`);
p();
p(`- **Event capacity is not enforced — [#33](https://github.com/MemberJunction/bizapps-orders/issues/33).**`);
p(`  \`EventProduct\` has a capacity column and nothing counts against it; an event with capacity 1 sold`);
p(`  five seats. The obvious fix was written and reverted — \`vwOrderLines\` does not expose the order's`);
p(`  status, so every variant either counts abandoned drafts as sold or misses free tickets.`);
p(`- **Cross-app entity IDs are pinned by GUID.** Our generated metadata references upstream entities by`);
p(`  ID, so an upstream re-bake silently breaks a from-zero install while every existing instance keeps`);
p(`  working. The durable fix is resolving cross-app entities by schema + table name.`);
p();
p(`---`);
p();
p(`## 8. Deliberately absent`);
p();
p(`| Not a column here | Where it lives instead | Why |`);
p(`|---|---|---|`);
p(`| A price on \`Product\` that pricing reads | \`ProductPrice\` rows | Price is per list, per quantity break and per date window. A column could only hold one of those and would decay into "whichever we set last". |`);
p(`| A company on \`OrderHeader\` alone | \`OrderLine.CompanyID\` | A single order legitimately sells products from several companies; a header-only company makes that unrepresentable and puts the wrong company on the ledger. |`);
p(`| An order reference on accounting's journal entry | \`LinkedEntityID\`/\`LinkedRecordID\` | Accounting must not reference its dependents. The polymorphic pair lets a journal entry name its origin without accounting knowing orders exists. |`);
p(`| A contract link on \`OrderHeader\` | Nowhere in orders | Orders knows nothing of bizapps-contracts, which does not depend on orders either. Terms agreed in a contract arrive stated on the order, as rungs 1 and 2 of the terms walk (§6). |`);
p();
p(`<!-- generated by test-harnesses/gen-erd.mjs — do not hand-edit -->`);

writeFileSync(outPath, L.join('\n') + '\n');
console.log(`wrote ${outPath}: ${L.length} lines · ${tables.length} tables · ${internalFks.length} internal FKs · ${nCross} cross-app FKs · ${vlists.length} value lists · ${bizTriggers.length} business triggers · CHECK bodies ${liveBodies} live / ${fileBodies} file / ${noBody} none`);

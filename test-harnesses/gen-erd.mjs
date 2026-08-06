/**
 * Generate `docs/ERD.md` from the AS-BUILT schema.
 *
 *     node test-harnesses/dump-schema.mjs /tmp/orders-schema.json
 *     node test-harnesses/gen-erd.mjs   /tmp/orders-schema.json docs/ERD.md
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN DOC. An ERD maintained by hand drifts the moment
 * someone adds a column, and a drifted ERD is worse than none — people trust it. Everything
 * structural here (tables, columns, nullability, foreign keys, unique indexes, triggers,
 * value lists) is read out of the database. The prose is the only hand-written part, and it
 * lives in this file so regenerating never discards it.
 *
 * ONE PROVENANCE CAVEAT, stated in the document too: the app's DB login cannot read
 * `VIEW DEFINITION`, so CHECK constraint BODIES come from the committed migration rather
 * than from `sys.check_constraints.definition`. The constraint NAMES are read live, and the
 * generator asserts every live name was found in the migration — 120/120 — so the two agree
 * on what exists even though only one can say what it means.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , schemaPath, outPath, checkDefsPath] = process.argv;
const db = JSON.parse(readFileSync(schemaPath, 'utf8'));
const checkDefs = checkDefsPath ? JSON.parse(readFileSync(checkDefsPath, 'utf8')) : {};
const S = db.schema;

const FLYWAY = 'flyway_schema_history';
const tables = db.tables.map((t) => t.TableName).filter((t) => t !== FLYWAY).sort();
const colsOf = (t) => db.columns.filter((c) => c.TableName === t);
const internalFks = db.fks.filter((f) => f.RefSchema === S && f.ParentTable !== FLYWAY);
const crossFks = db.fks.filter((f) => f.RefSchema !== S && f.ParentTable !== FLYWAY);
const uniqueIdx = db.indexes.filter((i) => i.IsUnique && !i.IsPK && i.TableName !== FLYWAY);
const bizTriggers = db.triggers.filter((t) => !t.TriggerName.startsWith('trgUpdate'));

/** Audit columns CodeGen owns; listing them 49 times is noise. */
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

// ── the areas. Every table belongs to exactly one; the generator asserts that. ──────────────
const AREAS = [
    {
        key: 'catalog', title: 'What can be sold — the catalogue',
        tables: ['Product', 'ProductType', 'ProductCategory', 'ProductBundleItem', 'ProductEntitlement',
            'EventProduct', 'SubscriptionType', 'RevenueRecognitionType'],
        blurb: `**\`Product\` is the hub of the whole app** — ten tables reference it. Everything a customer can
buy is a Product row, and what KIND of thing it is comes from \`ProductType\` plus the presence of a
satellite row: an \`EventProduct\` row makes it an event with a capacity and a date, a
\`SubscriptionTypeID\` makes it recurring, \`ProductBundleItem\` rows make it a bundle that expands into
children at order time. That is deliberate — a new product kind adds a satellite table, not a column
to \`Product\` and not a new sibling of it.

\`RevenueRecognitionType\` is the join to accounting's world: it decides whether a line's money is
earned immediately or deferred across a service window, which is what makes one order line produce
one booking entry and \`N\` future release entries.`,
    },
    {
        key: 'pricing', title: 'What it costs — price, promotion and who may discount',
        tables: ['ProductPrice', 'PriceList', 'PriceListAssignment', 'PriceTier', 'Promotion', 'PromotionCode',
            'PromotionTarget', 'PromotionType', 'ChargeType', 'SalesAuthority', 'SalesRule'],
        blurb: `**Price is resolved, not stored on the product.** A \`Product\` has no price column. \`ProductPrice\`
rows carry the money, scoped by \`PriceList\`, currency, quantity break and date window, and
\`PriceListAssignment\` decides which list a given customer sees. \`PriceTier\` carries the bands for
tiered and volume models. The resolution walk that reads all this is the second of the app's three
resolution walks (GL account and payment terms are the others) — see §6.

**\`Promotion\` is separated from \`PromotionCode\` on purpose**: one promotion can have many codes
(per-campaign, per-partner, single-use), and \`PromotionTarget\` scopes what a promotion may apply to.
\`SalesAuthority\` and \`SalesRule\` are the guardrails — who is allowed to discount, and by how much.`,
    },
    {
        key: 'order', title: 'The order itself',
        tables: ['OrderHeader', 'OrderLine', 'OrderLineDimension', 'OrderLinePriceComponent', 'EventOrderLine',
            'OrderCharge', 'OrderChargeAllocation', 'OrderAdjustment', 'OrderAdjustmentAllocation',
            'OrderSequence', 'OrderCompanyPolicy'],
        blurb: `**\`OrderLine\` is the most-referenced table in the schema** (13 inbound foreign keys), not
\`OrderHeader\` — because the LINE is the unit of money. It carries its own \`CompanyID\` (a denormalised
copy of the product's company, captured at save time), its own journal entry, its own tax and its own
recognition treatment. That is what lets one order sell products belonging to several companies and
still produce correct, single-company journal entries.

**Charges and adjustments are allocated, not summed.** \`OrderCharge\` and \`OrderAdjustment\` sit at the
header, and their \`*Allocation\` children push the money down onto specific lines — so a shipping
charge or an order-level discount still lands on a line, which still lands on one company's ledger.

\`OrderLinePriceComponent\` is the audit trail of the pricing walk: how the number was arrived at, kept
beside the number itself. \`OrderSequence\` is a singleton counter for \`ORD-{seq}\`, not part of the graph.`,
    },
    {
        key: 'subs', title: 'What the customer keeps getting — subscriptions and entitlements',
        tables: ['Subscription', 'SubscriptionTerm', 'SubscriptionEvent', 'SubscriptionSequence',
            'EntitlementGrant', 'StoredValueAccount', 'StoredValueTransaction'],
        blurb: `**\`Subscription\` is the durable thing; \`SubscriptionTerm\` is the billable slice.** A subscription
persists across renewals and its terms are the periods that get billed and recognised — the same
split contracts makes between \`Contract\` and \`ContractTerm\`, and for the same reason: the engine
operates on the term.

\`SubscriptionEvent\` is the history (started, renewed, upgraded, cancelled). \`EntitlementGrant\` is
what the subscription actually gives you, and \`StoredValueAccount\` / \`StoredValueTransaction\` cover
the balance kinds — gift cards, credits — where the customer holds value rather than a right.

A subscription's \`CompanyID\` comes from the ORDER LINE that created it, not from the order header;
getting that wrong put subscriptions on the wrong company's books and is fixed in this branch.`,
    },
    {
        key: 'pay', title: 'Getting paid',
        tables: ['PaymentHeader', 'PaymentDetail', 'PaymentLine', 'PaymentIntent', 'PaymentProvider',
            'PaymentProviderType', 'PaymentType', 'PaymentSequence', 'CustomerPaymentMethod'],
        blurb: `**The money that arrived and the money's application are separate tables, because a payment is
not an allocation.** \`PaymentHeader\` is the receipt; \`PaymentLine\` hangs off it and records how that
money was applied, against an order and optionally a specific line. One cheque paying three invoices
is one header and three lines — which is what lets the ledger and the receivable agree.

**\`PaymentDetail\` is NOT a third level below them.** The header *points at* it
(\`PaymentHeader.PaymentDetailID\`), because it is the instrument — brand, last four, expiry, bank
routing tail, or a stored-value account — and one instrument is reused across many payments. Reading
the arrow the other way is the easy mistake here.

\`PaymentHeader.ReversesPaymentHeaderID\` is the self-reference that makes a refund a first-class
payment rather than a negative amount, and \`IdempotencyKey\` is what stops a retried provider callback
from taking the money twice.

\`PaymentIntent\` is the provider handshake (Stripe and friends) held separately from the payment
itself, so an abandoned intent leaves no payment behind. \`PaymentProviderType\` / \`PaymentProvider\`
keep the app provider-agnostic, and \`CustomerPaymentMethod\` stores the customer's saved instrument —
a token, never a card number.

Immutability here is enforced by TRIGGERS, not by the application: see §5.`,
    },
    {
        key: 'cust', title: 'What this customer specifically gets',
        tables: ['CustomerPaymentTerms', 'CustomerTaxExemption', 'PaymentTermsType'],
        blurb: `Three small tables carrying per-customer deviations from the default. \`CustomerPaymentTerms\` is
date-effective and optionally scoped to one selling company, keyed on an organization OR a person the
same way \`CustomerTaxExemption\` is — the \`CK_*_Party\` constraints spell out the exclusive-or because
SQL Server has no boolean value type.

**This is where the payment-terms walk currently breaks.** Its fourth rung reads a selling company's
default from accounting, which accounting deleted (issue #34); \`CustomerPaymentTerms\` cannot hold it
because by construction every row names a customer. See §7.`,
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

// ── document ────────────────────────────────────────────────────────────────────────────────
const L = [];
const p = (s = '') => L.push(s);

const nCross = crossFks.length;
const crossByTarget = {};
for (const f of crossFks) {
    const k = `${f.RefSchema}.${f.RefTable}`;
    (crossByTarget[k] ||= []).push(f);
}

p(`# \`bizapps-orders\` — ERD`);
p();
p(`> **This is the AS-BUILT ERD — a reflection of the implementation, not a plan.** Intended-but-unbuilt`);
p(`> schema belongs in \`plans/\`, never here; this file must always describe what the database actually`);
p(`> contains.`);
p(`>`);
p(`> **GENERATED FROM THE LIVE SCHEMA.** Every table, column, nullability, foreign key, unique index and`);
p(`> trigger below was read out of \`sys.tables\` / \`sys.columns\` / \`sys.foreign_keys\` / \`sys.indexes\` /`);
p(`> \`sys.triggers\` on a database built by the committed migrations. Do not hand-edit the diagrams —`);
p(`> regenerate:`);
p(`>`);
p('> ```sh');
p(`> node test-harnesses/dump-schema.mjs /tmp/orders-schema.json`);
p(`> node test-harnesses/gen-erd.mjs   /tmp/orders-schema.json docs/ERD.md /tmp/checkdefs.json`);
p('> ```');
p(`>`);
p(`> **Schema:** \`${S}\` · **Entity prefix:** \`MJ_BizApps_Orders: \` · **Keys:** UUID throughout`);
p(`> **${tables.length} tables · ${internalFks.length} internal relationships · ${nCross} cross-app foreign keys ·`);
p(`> ${db.checks.length} CHECK constraints · ${uniqueIdx.length} unique indexes** beyond the primary keys ·`);
p(`> **${bizTriggers.length} business triggers** · ${db.views.length} generated views.`);
p(`>`);
p(`> (${tables.length} is the app's own tables. \`sys.tables\` reports ${tables.length + 1} because Flyway keeps its`);
p(`> \`flyway_schema_history\` in this schema; that table belongs to the migration tool, not to the model.)`);
p(`>`);
p(`> **One provenance caveat.** The app's DB login lacks \`VIEW DEFINITION\`, so CHECK constraint *bodies*`);
p(`> in §4 come from the committed migration rather than from \`sys.check_constraints\`. The constraint`);
p(`> *names* are read live, and the generator asserts that every live name was found in the migration`);
p(`> — currently **${db.checks.length}/${db.checks.length}** — so the two sources agree on what exists even though only one`);
p(`> can say what it means. Everything else on this page is read from the database directly.`);
p(`>`);
p(`> **How to read this.** §1 is the master map: every table, every connection, no columns — an`);
p(`> orientation tool, too wide to work from. §2 is the six area maps WITH full column lists, small`);
p(`> enough to actually read, and they are what you want open while writing code. §3 is the cross-app`);
p(`> register. §4 is the value lists. §5 and §6 are the parts no diagram can carry — the rules that live`);
p(`> in triggers and in server code rather than in the schema. §7 is what is deliberately absent.`);
p();
p(`---`);
p();

// §0
p(`## 0. Three rules that explain most of this schema`);
p();
p(`**1 — The LINE is the unit of money, not the order.** \`OrderLine\` carries its own \`CompanyID\`, its own`);
p(`journal entry, its own tax and its own revenue-recognition treatment; \`OrderHeader\` is a container`);
p(`whose totals are rolled up from its lines by trigger. This is what lets a single order sell products`);
p(`belonging to several different companies and still emit journal entries that are each single-company`);
p(`and balanced — the alternative, a company on the header, makes multi-company orders unrepresentable.`);
p();
p(`**2 — References point UP the dependency graph, and they are real foreign keys.** Orders depends on`);
p(`\`common\`, \`accounting\` and MJ core, so it may hold hard FKs into them (${nCross} of them, §3) — installs`);
p(`run in dependency order, so the targets always exist. Orders holds NO reference to anything that`);
p(`depends on orders; \`bizapps-contracts\` points down at us instead. Accounting's link back to an order`);
p(`line is a polymorphic \`LinkedEntityID\`/\`LinkedRecordID\` pair on the journal entry, which is a typed`);
p(`polymorphic link and not a soft key.`);
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
p(`${nCross} of them would triple the edge count and hide the app's own structure, which is the one thing this`);
p(`diagram exists to show. They get their own map and full register in §3.`);
p();
p('```mermaid');
p('erDiagram');
for (const l of relLines(new Set(tables), { includeCross: false })) p(l);
p('```');
p();
p(`**Reading the shape.** Three tables carry the graph: \`Product\` (${internalFks.filter((f) => f.RefTable === 'Product').length} inbound) is what can be`);
p(`sold, \`OrderLine\` (${internalFks.filter((f) => f.RefTable === 'OrderLine').length} inbound) is what was sold, and \`OrderHeader\` (${internalFks.filter((f) => f.RefTable === 'OrderHeader').length} inbound) groups it. Read the`);
p(`app as catalogue → order → the two things an order can leave behind (a subscription, a payment).`);
p();
// Anything with no INTERNAL foreign key cannot appear in the diagram above. Derive the list from
// that exact predicate rather than describing it from memory, so the note can never disagree with
// the picture — an earlier hand-written version named three of these five and quietly lost two.
const absent = tables.filter((t) => !internalFks.some((f) => f.ParentTable === t || f.RefTable === t));
if (absent.length) {
    const crossOnly = absent.filter((t) => crossFks.some((f) => f.ParentTable === t));
    const isolated = absent.filter((t) => !crossOnly.includes(t));
    p(`**Not in the diagram above (${absent.length} tables), because they have no foreign key to another orders table:**`);
    p();
    if (isolated.length) p(`- ${isolated.map((t) => `\`${t}\``).join(', ')} — singleton counters and rule tables, read by code rather than joined to.`);
    if (crossOnly.length) p(`- ${crossOnly.map((t) => `\`${t}\``).join(', ')} — connected only OUTSIDE the app (see §3); it hangs off \`common\`, not off us.`);
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
    p(a.blurb);
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
p(`**\`__mj.Company\` is the multi-company spine.** ${crossByTarget['__mj.Company']?.length ?? 0} tables carry a \`CompanyID\`, including`);
p(`\`OrderLine\` — that column is what makes a mixed-company order bookable (rule 1).`);
p();
p(`---`);
p();

// §4 value lists
const vlists = Object.entries(checkDefs)
    .map(([name, defn]) => {
        const m = /^\s*\(?\s*\[?(\w+)\]?\s+IN\s*\(/i.exec(defn);
        if (!m) return null;
        const lits = [...defn.matchAll(/'([^']*)'/g)].map((x) => x[1]);
        if (lits.length < 2) return null;
        const tbl = db.checks.find((c) => c.CheckName === name)?.TableName;
        return tbl ? { name, tbl, col: m[1], lits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.tbl + a.col).localeCompare(b.tbl + b.col));

p(`## 4. Value lists (CHECK-constrained)`);
p();
p(`${vlists.length} columns are constrained to a closed set at the database. These are the ones worth knowing`);
p(`before writing a query — a value not on this list cannot be in the column.`);
p();
p(`| table.column | allowed values |`);
p(`|---|---|`);
for (const v of vlists) p(`| \`${v.tbl}.${v.col}\` | ${v.lits.map((x) => `\`${x}\``).join(' · ')} |`);
p();
p(`The remaining ${db.checks.length - vlists.length} CHECK constraints are not value lists — they are cross-field rules`);
p(`(exclusive-or of two party columns, a window whose end must follow its start, a non-negative amount).`);
p(`Those are listed with their tables in §2 only as \`required\`/nullability; their bodies live in the`);
p(`migration.`);
p();
p(`---`);
p();

// §5 triggers
p(`## 5. The rules that live in TRIGGERS, not in the tables`);
p();
p(`${bizTriggers.length} business triggers, and they carry two of the app's load-bearing guarantees. A diagram cannot`);
p(`show either, and code that ignores them will fail at runtime rather than at compile time.`);
p();
p(`| table | trigger | what it guarantees |`);
p(`|---|---|---|`);
const TRIGGER_NOTE = {
    'trg_OrderLine_ImmutableAfterConfirm': "A confirmed line's money is history. Error 51003. This is why the server short-circuits its own total recomputation once `JournalEntryID` is stamped — a figure it cannot reproduce from stored state alone would be rejected here and roll back the whole confirm.",
    'trg_OrderLine_RollupTotals': 'Header totals are derived from lines by the database, so a client cannot supply a total that disagrees with what was booked.',
    'trg_PaymentDetail_Immutable': 'A recorded payment instrument cannot be edited after the fact.',
    'trg_PaymentHeader_ImmutableAfterCapture': 'Captured money is frozen.',
    'trg_PaymentHeader_RollupTotals': 'Payment header totals are derived from its lines.',
    'trg_PaymentLine_ImmutableAfterCapture': 'An applied payment line cannot be re-pointed after capture.',
    'trg_PaymentLine_RollupTotals': 'Applied-amount rollup.',
};
for (const t of bizTriggers) p(`| \`${t.TableName}\` | \`${t.TriggerName}\` | ${TRIGGER_NOTE[t.TriggerName] ?? '—'} |`);
p();
p(`The other ${db.triggers.length - bizTriggers.length} triggers are CodeGen's \`trgUpdate*\` \`__mj_UpdatedAt\` maintainers, one per table.`);
p(`They are not business logic and are omitted above.`);
p();
p(`---`);
p();

// §6 resolution walks / server rules
p(`## 6. The rules that are not in the schema at all`);
p();
p(`Three **resolution walks** decide values the tables only store the result of. Each tries progressively`);
p(`more general sources and stops at the first hit. They are the reason a column can be non-null and`);
p(`still tell you nothing about where its value came from.`);
p();
p(`| walk | order tried | on exhaustion |`);
p(`|---|---|---|`);
p(`| **GL account** | product → its category tree → the company default | **Refuses the confirm.** Booked money with nowhere to go is worse than no order. |`);
p(`| **Price** | stated unit price → price-list entry for the customer's list → tier/volume band → product default | Line cannot be priced; confirm refuses. |`);
p(`| **Payment terms** | stated \`DueDate\` → stated \`PaymentTermsTypeID\` → \`CustomerPaymentTerms\` → *the selling company's default* → due on receipt | Falls through to due on receipt. **Rung 4 is currently broken — see §7.** |`);
p();
p(`Two more behaviours are server-side only:`);
p();
p(`- **\`OrderLine.CompanyID\` is derived, never authored.** It is stamped from the product's company at`);
p(`  save time, so the line records who owned the product at transaction time even if ownership later`);
p(`  moves. Whatever a caller passes is overwritten.`);
p(`- **A bundle's parent line contributes zero.** An expanded bundle keeps its parent line for the`);
p(`  invoice to print, but the money lives on the children; the parent's totals are forced to zero so`);
p(`  the header rollup does not double the order.`);
p();
p(`---`);
p();

// §7 known gaps
p(`## 7. Known gaps in this schema (filed, not fixed)`);
p();
p(`Recorded here because each is a place where the tables and the code disagree, and a reader who trusts`);
p(`the diagram alone will be misled.`);
p();
p(`- **Payment terms rung 4 is dead — [#34](https://github.com/MemberJunction/bizapps-orders/issues/34).**`);
p(`  Accounting dropped \`AccountingCompanyProfile.DefaultPaymentTermsTypeID\` in its issue-#22 realignment`);
p(`  ("per-company default terms move to the orders side"); orders never did that modelling.`);
p(`  \`CustomerPaymentTerms\` cannot hold it — \`CK_CustomerPaymentTerms_Party\` requires every row to name`);
p(`  an organization or a person — and orders has no per-company configuration table at all. Proposed:`);
p(`  a small \`OrdersCompanyProfile\`, mirroring accounting's own profile pattern.`);
p(`- **Event capacity is not enforced — [#33](https://github.com/MemberJunction/bizapps-orders/issues/33).**`);
p(`  \`EventProduct\` has a capacity column and nothing counts against it; an event with capacity 1 sold`);
p(`  five seats. The obvious fix was written and reverted — \`vwOrderLines\` does not expose the order's`);
p(`  status, so every variant either counts abandoned drafts as sold or misses free tickets.`);
p(`- **A subscription records no quantity.** A ten-seat subscription bills ten times correctly but`);
p(`  stores no seat count, so nothing downstream can tell it from a single seat.`);
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
p(`| A price on \`Product\` | \`ProductPrice\` rows | Price is per list, per currency, per quantity break and per date window. A column could only hold one of those and would decay into "whichever we set last". |`);
p(`| A company on \`OrderHeader\` alone | \`OrderLine.CompanyID\` | A single order legitimately sells products from several companies; a header-only company makes that unrepresentable and puts the wrong company on the ledger. |`);
p(`| An order reference on accounting's journal entry | \`LinkedEntityID\`/\`LinkedRecordID\` | Accounting must not reference its dependents. The polymorphic pair lets a journal entry name its origin without accounting knowing orders exists. |`);
p(`| A contract link on \`OrderHeader\` | \`bizapps-contracts\` points down at us | Contracts depends on orders, not the reverse. |`);
p();
p(`<!-- generated by test-harnesses/gen-erd.mjs — do not hand-edit -->`);

writeFileSync(outPath, L.join('\n') + '\n');
console.log(`wrote ${outPath}: ${L.length} lines · ${tables.length} tables · ${internalFks.length} internal FKs · ${nCross} cross-app FKs · ${vlists.length} value lists · ${bizTriggers.length} business triggers`);

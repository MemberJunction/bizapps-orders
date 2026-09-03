/**
 * @fileoverview The reads the list and detail surfaces make, as plain functions over `RunView`.
 *
 * WHAT THIS REPLACED, AND WHY
 *
 * `MJOOrdersDataService` — an `@Injectable` every page took in its constructor, returning
 * `Record<string, unknown>` rows and two hand-written row interfaces (`MJOOrderRow`,
 * `MJOPaymentRow`). It predates `docs/ui-architecture.md`, and it is the shape that document names:
 * a data-access service layer whose real cost is the TYPING.
 *
 * The cost was not hypothetical. `MJOOrderRow` declared `OriginChannel?: string | null`. There is no
 * such column and never was — so a filter, a table column, a chip class and a whole preset were
 * written against a field the schema does not have, and the compiler had nothing to say, because the
 * type was hand-written. The feature survived behind a `MJO_ORIGIN_CHANNEL_AVAILABLE = false` flag
 * precisely BECAUSE nothing could tell anyone it was fiction. Typing these reads from the schema
 * deleted it: `mjBizAppsOrdersOrderHeaderEntity` has no `OriginChannel`, so the code stopped
 * compiling and had to go.
 *
 * WHAT DID NOT CHANGE, AND WHY IT IS NOT A SERVICE
 *
 * These are QUERIES, not an abstraction over MJ. Each one is an entity name, a filter that encodes a
 * real rule, and an order-by. They live together so four screens do not independently decide what
 * "open" means — and they are functions rather than an injected class because there is no state to
 * hold and no lifetime to manage. A caller wanting something unusual still writes `RunView` directly;
 * that was always true and is the point.
 *
 * `ResultType: 'entity_object'` — the screens hold REAL ENTITIES, which is what
 * `docs/ui-architecture.md` asks for and also what makes the types honest. Declaring one shape and
 * returning another is how this code came to hold `String(r.OrderDate).slice(0, 4)` to read a year:
 * it works only while the value is secretly a string, and on a `Date` it yields `'Mon '`.
 *
 * Which shape a `'simple'` read returns is not a fact worth encoding in call sites — it used to be
 * the raw transport value and MJ now normalizes date columns to `Date` there too. Read date cells
 * with `ToISODate`/`IsBefore` from the entities package and the question stops needing an answer.
 *
 * The one exception is {@link GetOrderSummary}, which reduces up to 5,000 rows into six numbers and
 * has no use for entity behaviour. It reads the four columns it needs and says so.
 *
 * CONNECTS TO:
 *   DOC:    docs/ui-architecture.md — the rule this file exists to satisfy
 *   TYPES:  @mj-biz-apps/orders-entities generated entity classes
 *
 * @module @mj-biz-apps/orders-ng
 */
import { Metadata, RunView, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { NetLines, type NetGroup, type NettableLine } from '@mj-biz-apps/accounting-engine-base';
import { IsBefore, Today, type DateCell } from '@mj-biz-apps/orders-entities';
import type {
    mjBizAppsOrdersChargeTypeEntity,
    mjBizAppsOrdersCustomerTaxExemptionEntity,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineDimensionEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersPaymentHeaderEntity,
    mjBizAppsOrdersPaymentLineEntity,
    mjBizAppsOrdersPaymentTypeEntity,
    mjBizAppsOrdersPriceListEntity,
    mjBizAppsOrdersPriceTierEntity,
    mjBizAppsOrdersProductCategoryEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductPriceEntity,
    mjBizAppsOrdersProductTypeEntity,
    mjBizAppsOrdersPromotionEntity,
    mjBizAppsOrdersSubscriptionEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
    mjBizAppsOrdersSubscriptionTermEntity,
} from '@mj-biz-apps/orders-entities';
import { MJO_ACCOUNTING_ENTITIES, MJO_COMMON_ENTITIES, MJO_ENTITIES } from './entity-names';

/** Ids reach filter strings as SQL text, so they are shape-checked first. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** A company an order can be raised under. */
export interface MJOCompanyOption {
    ID: string;
    Name: string;
}

/** Counts and totals for the orders list header. */
export interface MJOOrderSummary {
    Total: number;
    TotalValue: number;
    OpenBalance: number;
    /** A positive magnitude — the strip renders the direction, not the sign. */
    CreditsHeld: number;
    /** Keyed by preset, for the chip pills. */
    Counts: Record<string, number>;
}

/** A customer the picker can offer — an organization or a person, presented identically. */
export interface MJOCustomerOption {
    ID: string;
    Name: string;
    IsOrganization: boolean;
    Email: string | null;
}

/**
 * Entities whose last read came back capped.
 *
 * Module-scoped rather than per-instance because it is a DIAGNOSTIC REGISTER, not application state:
 * the question it answers ("did anything get truncated in this session") has one answer for the whole
 * page, and nobody should be able to get a second opinion by injecting a different copy.
 *
 * Deliberately NOT a UI element — the fix for a truncated total is a server-side aggregate, not a
 * disclaimer next to a wrong number. This exists so the condition is *detectable* (by a test, by a
 * caller that wants to refuse to render a total, or by anyone reading the console) instead of being
 * invisible until someone reconciles by hand.
 */
const truncated = new Set<string>();

/** True when the last read of `entityName` was capped by its default `MaxRows`. */
export function WasTruncated(entityName: string): boolean {
    return truncated.has(entityName);
}

/**
 * One `RunView`, with the provider resolved the standard way.
 *
 * `MaxRows` defaults to 500 rather than being unbounded: these are worklists, and the tail of a
 * ten-thousand-row aging list is not something anyone works through in a table. A screen that needs
 * more should say so explicitly.
 */
async function run<T>(
    entityName: string,
    filters: string[],
    orderBy: string,
    maxRows?: number,
    user?: UserInfo,
): Promise<T[]> {
    const rv = new RunView();
    const result = await rv.RunView<T>(
        {
            EntityName: entityName,
            ExtraFilter: filters.filter(Boolean).join(' AND '),
            OrderBy: orderBy,
            MaxRows: maxRows ?? 500,
            ResultType: 'entity_object',
        },
        user ?? currentUser(),
    );

    if (!result.Success) {
        // NEVER fail silently into an empty list. Every caller renders an empty state, and an empty
        // state is the most reassuring thing on the screen — "no orders", "nothing overdue", "no
        // payments". A failed query that reads as good news is the worst outcome available.
        //
        // This is not theoretical: two entity names were wrong for the entire build, and the only
        // symptom was dashboards reporting zero against a database with 73 orders.
        console.error(
            `[orders-queries] Query failed for "${entityName}" — the screen will render an empty ` +
                `state that does NOT mean "no data".\n` +
                `  Filter: ${filters.filter(Boolean).join(' AND ') || '(none)'}\n` +
                `  Reason: ${result.ErrorMessage ?? 'no error message supplied'}`,
        );
        return [];
    }

    // A TRUNCATED read is not an error, so nothing above catches it — and a truncated read that
    // feeds a TOTAL is a wrong number rather than a short list. Past the cap the headline figure
    // silently understates with nothing on screen to say so: the same class of failure as the
    // empty-state case, since a plausible number is more dangerous than an obvious blank.
    //
    // ONLY the implicit default is reported. A caller that passed its own `maxRows` chose a short
    // list on purpose — the typeahead asks for a handful of products out of hundreds and is right
    // to. Flagging those buries the real signal under noise.
    if (maxRows === undefined && result.TotalRowCount > result.RowCount) {
        truncated.add(entityName);
        console.error(
            `[orders-queries] TRUNCATED read of "${entityName}" — returned ${result.RowCount} of ` +
                `${result.TotalRowCount} matching rows.\n` +
                `  Any TOTAL derived from this read is UNDERSTATED by the remainder.\n` +
                `  Filter: ${filters.filter(Boolean).join(' AND ') || '(none)'}\n` +
                `  Fix: pass an explicit MaxRows for a worklist, or aggregate server-side (RunQuery) ` +
                `for a figure. See BACKLOG.md task 11d.`,
        );
    }
    return result.Results ?? [];
}

/**
 * The acting user.
 *
 * The browser session supplies one; on the server a caller passes it explicitly. Read lazily so these
 * functions work in both places without anything to construct.
 */
function currentUser(): UserInfo | undefined {
    return new Metadata().CurrentUser;
}

/**
 * The four columns {@link GetOrderSummary} reduces, as they arrive ON THE WIRE.
 *
 * Deliberately NOT the generated entity type. Four fields for an arithmetic strip is not a mirror of
 * an order, and claiming a shape nobody delivers is what made the old `MJOOrderRow` a hazard.
 *
 * `DueDate` is a {@link DateCell} rather than a `string` because what a `'simple'` read hands back
 * has changed underneath this code once already: it used to be the raw transport value (an ISO
 * string), and MJ now normalizes date columns on simple rows into real `Date`s to match
 * `'entity_object'`. Either is fine — `IsBefore` reads both — but a field TYPED `string` that holds
 * a `Date` is worse than an honest union, because the compiler then certifies the string operations
 * that are about to go quietly wrong.
 */
interface MJOSummaryRow {
    Status?: string;
    Balance?: number;
    TotalGross?: number;
    DueDate?: DateCell;
}

/**
 * A `'simple'` read — raw rows, no entities.
 *
 * For AGGREGATES only. `GetOrderSummary` reduces up to 5,000 orders into six numbers, and
 * materialising 5,000 `BaseEntity` instances to sum three columns is work with no answer attached to
 * it. Everything a screen RENDERS goes through {@link run} and gets real entities.
 */
async function runRows<T>(
    entityName: string,
    filters: string[],
    orderBy: string,
    maxRows: number,
    user: UserInfo | undefined,
    fields: string[],
): Promise<T[]> {
    const rv = new RunView();
    const result = await rv.RunView<T>(
        {
            EntityName: entityName,
            ExtraFilter: filters.filter(Boolean).join(' AND '),
            OrderBy: orderBy,
            MaxRows: maxRows,
            Fields: fields,
            ResultType: 'simple',
        },
        user ?? currentUser(),
    );
    if (!result.Success) {
        console.error(
            `[orders-queries] Aggregate read failed for "${entityName}" — the figures above the list ` +
                `will read as zero, which does NOT mean "nothing owing".\n` +
                `  Reason: ${result.ErrorMessage ?? 'no error message supplied'}`,
        );
        return [];
    }
    return result.Results ?? [];
}

/** Quoted, comma-separated ids, or null when none survive validation. */
function uuidList(ids: string[]): string | null {
    const safe = [...new Set(ids)].filter((id) => UUID_PATTERN.test(id));
    return safe.length ? safe.map((id) => `'${id}'`).join(',') : null;
}

/** Escape a user-typed fragment for a LIKE clause. */
function likeText(value: string): string {
    return value.replace(/'/g, "''");
}

/* ── Orders ──────────────────────────────────────────────────────────────────── */

export type MJOOrderPreset = 'all' | 'overdue' | 'unpaid' | 'notposted' | 'drafts' | 'credits';

export interface MJOGetOrdersOptions {
    Preset?: MJOOrderPreset;
    /** One specific order. Cheaper and exact where a caller already has the ID. */
    OrderHeaderID?: string;
    Search?: string;
    CompanyID?: string;
    BillToOrganizationID?: string;
    /**
     * Filter to ONE person's orders, server-side.
     *
     * Its absence was a real performance bug, not an omission: fast entry's customer picker called
     * this with no filter — every order in the database — and filtered in the browser. That is
     * invisible on a fresh instance and gets steadily worse with every order taken, which is exactly
     * how it presented: "selecting a customer started getting slow".
     */
    BillToPersonID?: string;
    MaxRows?: number;
    User?: UserInfo;
}

/**
 * Orders matching a preset.
 *
 * The presets are the business rules, and each is a filter rather than a stored flag because every
 * one of them changes with the clock or with a rollup:
 *
 * - `overdue` — a balance past its due date. Never a column: it changes as time passes, not as
 *   anything is written, so storing it would need a nightly job whose only purpose is keeping it
 *   honest.
 * - `unpaid` — a balance owing on an order that has confirmed. Drafts are excluded because a draft
 *   owes nothing yet.
 * - `notposted` — confirmed but not yet posted. Normally a matter of seconds; a row lingering here
 *   is worth investigating.
 * - `credits` — a NEGATIVE balance, which IS the customer's credit. There is no separate instrument
 *   to look up.
 */
export async function GetOrders(
    options: MJOGetOrdersOptions = {},
): Promise<mjBizAppsOrdersOrderHeaderEntity[]> {
    const filters: string[] = [];
    const today = new Date().toISOString().slice(0, 10);

    switch (options.Preset) {
        case 'overdue':
            filters.push(`Balance > 0 AND DueDate IS NOT NULL AND DueDate < '${today}'`);
            filters.push(`Status NOT IN ('Draft','Quoted','Voided')`);
            break;
        case 'unpaid':
            filters.push(`Balance > 0 AND Status NOT IN ('Draft','Quoted','Voided')`);
            break;
        case 'notposted':
            filters.push(`Status = 'Confirmed'`);
            break;
        case 'drafts':
            filters.push(`Status IN ('Draft','Quoted')`);
            break;
        case 'credits':
            filters.push(`Balance < 0`);
            break;
        default:
            filters.push(`Status <> 'Voided'`);
            break;
    }

    // Guarded rather than interpolated raw. The server package has `RequireUUID` for exactly this,
    // but it does not ship to the browser, so this is the same idea locally: an id that is not a
    // UUID never reaches the filter string.
    if (options.OrderHeaderID) {
        if (!UUID_PATTERN.test(options.OrderHeaderID)) {
            throw new Error(`OrderHeaderID is not a UUID: ${options.OrderHeaderID}`);
        }
        filters.push(`ID = '${options.OrderHeaderID}'`);
    }
    if (options.CompanyID) filters.push(`CompanyID = '${options.CompanyID}'`);
    if (options.BillToPersonID && options.BillToOrganizationID) {
        filters.push(`(BillToOrganizationID = '${options.BillToOrganizationID}' OR BillToPersonID = '${options.BillToPersonID}')`);
    } else {
        if (options.BillToPersonID) filters.push(`BillToPersonID = '${options.BillToPersonID}'`);
        if (options.BillToOrganizationID) filters.push(`BillToOrganizationID = '${options.BillToOrganizationID}'`);
    }
    if (options.Search?.trim()) {
        const escaped = likeText(options.Search);
        filters.push(
            `(OrderNumber LIKE '%${escaped}%' OR Description LIKE '%${escaped}%' ` +
                `OR ExternalDocumentNumber LIKE '%${escaped}%')`,
        );
    }

    return run<mjBizAppsOrdersOrderHeaderEntity>(
        MJO_ENTITIES.OrderHeader,
        filters,
        'OrderDate DESC',
        options.MaxRows,
        options.User,
    );
}

/**
 * The counts and totals the orders list shows above its table.
 *
 * ONE query, not one per preset. The presets partition the same population six different ways, so
 * six COUNT round trips would ask the database the same question repeatedly to fill one strip. This
 * reads the few columns the arithmetic needs and derives every figure from them.
 *
 * The filters mirror `GetOrders` exactly. They are stated once here as the same expressions rather
 * than re-queried, because a count that disagrees with the list it labels is worse than no count.
 */
export async function GetOrderSummary(user?: UserInfo): Promise<MJOOrderSummary> {
    const rows = await runRows<MJOSummaryRow>(
        MJO_ENTITIES.OrderHeader,
        [`Status <> 'Voided'`],
        'OrderDate DESC',
        5000,
        user,
        // Four columns, because that is what the arithmetic reads. Fetching fifty to sum three is
        // work with no answer attached.
        ['Status', 'Balance', 'TotalGross', 'DueDate'],
    );
    // The operator's calendar day, not a UTC instant: an order due today is not overdue at 8pm in
    // New York just because it is already tomorrow in London.
    const today = Today();
    const settleable = (o: MJOSummaryRow): boolean => !['Draft', 'Quoted', 'Voided'].includes(o.Status ?? '');

    const credits = rows.filter((o) => settleable(o) && Number(o.Balance ?? 0) < 0);
    const owing = rows.filter((o) => settleable(o) && Number(o.Balance ?? 0) > 0);

    return {
        Total: rows.length,
        TotalValue: rows.reduce((sum, o) => sum + Number(o.TotalGross ?? 0), 0),
        OpenBalance: owing.reduce((sum, o) => sum + Number(o.Balance ?? 0), 0),
        CreditsHeld: Math.abs(credits.reduce((sum, o) => sum + Number(o.Balance ?? 0), 0)),
        Counts: {
            all: rows.length,
            overdue: owing.filter((o) => IsBefore(o.DueDate, today)).length,
            unpaid: owing.length,
            notposted: rows.filter((o) => o.Status === 'Confirmed').length,
            drafts: rows.filter((o) => ['Draft', 'Quoted'].includes(o.Status ?? '')).length,
            credits: credits.length,
        },
    };
}

/** Lines belonging to one order. */
export async function GetOrderLines(
    orderHeaderID: string,
    user?: UserInfo,
): Promise<mjBizAppsOrdersOrderLineEntity[]> {
    if (!UUID_PATTERN.test(orderHeaderID)) return [];
    return run<mjBizAppsOrdersOrderLineEntity>(
        MJO_ENTITIES.OrderLine,
        [`OrderHeaderID = '${orderHeaderID}'`],
        'LineNumber',
        undefined,
        user,
    );
}

/**
 * Lines for MANY orders in one query, grouped by order id.
 *
 * WHY THIS EXISTS ALONGSIDE `GetOrderLines`. The fulfillment board needs the lines of every posted
 * order, and asking per order is one round trip per order — fine against a seeded fixture, visibly
 * slow the moment a company has a few hundred posted orders. The single-order function stays because
 * the editor genuinely wants one order's lines.
 */
export async function GetOrderLinesForOrders(
    orderHeaderIDs: string[],
    user?: UserInfo,
): Promise<Map<string, mjBizAppsOrdersOrderLineEntity[]>> {
    const grouped = new Map<string, mjBizAppsOrdersOrderLineEntity[]>();
    const list = uuidList(orderHeaderIDs);
    if (!list) return grouped;

    const rows = await run<mjBizAppsOrdersOrderLineEntity>(
        MJO_ENTITIES.OrderLine,
        [`OrderHeaderID IN (${list})`],
        'LineNumber',
        // One cap for the whole board rather than per order, so a single enormous order cannot
        // silently crowd out every other one.
        5000,
        user,
    );

    for (const row of rows) {
        const key = String(row.OrderHeaderID ?? '');
        const existing = grouped.get(key);
        if (existing) existing.push(row);
        else grouped.set(key, [row]);
    }
    return grouped;
}

/**
 * The ids of an order's lines — the key both consequence grids filter on.
 *
 * @returns Line ids in line-number order. Empty when the order has no lines or the id is not a
 *          UUID; callers must treat empty as "there is nothing to show", never as a filter.
 */
export async function GetOrderLineIDs(orderHeaderID: string, user?: UserInfo): Promise<string[]> {
    const lines = await GetOrderLines(orderHeaderID, user);
    return lines.map((line) => String(line.ID ?? '')).filter((id) => UUID_PATTERN.test(id));
}

/* ── The order's consequences: what it booked, and what it started ─────────────
 *
 * Both tabs render through `mj-entity-data-grid` (@memberjunction/ng-entity-viewer), which takes a
 * `RunViewParams` and does its own loading, paging and column generation from entity metadata. So
 * the job here is NOT to fetch and reshape rows — it is to hand the grid the right question.
 *
 * BOTH ARE KEYED ON THE ORDER'S LINES, not the order:
 *   · a journal entry points at the ORDER LINE that caused it (`LinkedRecordID`, D25) — one entry
 *     per line, per company;
 *   · a subscription records the line that brought it into existence (`OrderLineID`, D39/D40).
 * There is no column on either that names the order header, which is why the line ids come first and
 * why an order with no lines can have neither.
 */

/**
 * What this order booked into the ledger, as grid params.
 *
 * Newest first: a corrected or reversed order accumulates entries, and the one that explains the
 * current state is the most recent.
 *
 * @returns Params for `mj-entity-data-grid`, or **null** when the order has no lines. Null means "do
 *          not load": an `IN ()` with nothing in it is not valid SQL, and a filter that matches
 *          everything would show another order's ledger.
 */
export function JournalEntryViewParams(orderLineIDs: string[]): RunViewParams | null {
    const list = uuidList(orderLineIDs);
    if (!list) return null;
    return {
        EntityName: MJO_ACCOUNTING_ENTITIES.JournalEntry,
        ExtraFilter: `LinkedRecordID IN (${list})`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
    };
}

/** A dimension tag on a rolled-up journal line, already labeled. */
export interface OrderJournalDimension {
    Name: string;
    Value: string;
}

/** One row of the display-only order journal (NetLines over every line JE). */
export interface OrderJournalRollupRow {
    Key: string;
    CompanyID: string;
    Company: string;
    GLAccountID: string;
    AccountCode: string;
    AccountName: string;
    Dimensions: OrderJournalDimension[];
    Side: NetGroup['side'];
    Debit: number;
    Credit: number;
    SourceLineCount: number;
}

/** One company's books — a real JE is single-company, so the rollup is too. */
export interface OrderJournalCard {
    CompanyID: string;
    Company: string;
    Rows: OrderJournalRollupRow[];
    TotalDebit: number;
    TotalCredit: number;
}

/** The order-level JE is a UI aggregation of the per-line journals — never a stored row. */
export interface OrderJournalRollup {
    Cards: OrderJournalCard[];
    TotalDebit: number;
    TotalCredit: number;
    JournalCount: number;
}

interface JournalHeaderRow {
    ID: string;
    CompanyID: string;
    Company: string;
}

interface JournalLineRow {
    ID: string;
    JournalEntryID: string;
    GLAccountID: string;
    GLAccount: string;
    DebitAmount: number | null;
    CreditAmount: number | null;
}

interface JournalLineDimRow {
    JournalEntryLineID: string;
    DimensionID: string;
    DimensionValueID: string;
    Dimension: string;
    DimensionValue: string;
}

interface GLAccountRow {
    ID: string;
    Code: string;
    Name: string;
}

interface RollupLabels {
    Company: Record<string, string>;
    Account: Record<string, { Code: string; Name: string }>;
    Dimension: Record<string, string>;
    DimensionValue: Record<string, string>;
}

const EMPTY_ROLLUP: OrderJournalRollup = { Cards: [], TotalDebit: 0, TotalCredit: 0, JournalCount: 0 };

/**
 * Turn NetLines groups into display rows. Pure — the form never nets itself.
 *
 * Preserves {@link NetLines} order (company, then every debit, then every credit).
 * Labels are looked up by lowercased id so SQL Server / PostgreSQL UUID casing cannot split a key.
 */
export function PresentOrderJournalRollup(groups: NetGroup[], labels: RollupLabels): OrderJournalRollupRow[] {
    return groups.map((group) => {
        const amount = Math.abs(group.net);
        const account = labels.Account[group.glAccountId.toLowerCase()];
        return {
            Key: `${group.companyId}#${group.glAccountId}#${group.dimKey}`,
            CompanyID: group.companyId,
            Company: labels.Company[group.companyId.toLowerCase()] || group.companyId,
            GLAccountID: group.glAccountId,
            AccountCode: account?.Code ?? '',
            AccountName: account?.Name || group.glAccountId,
            Dimensions: presentDimensions(group.dims, labels),
            Side: group.side,
            Debit: group.side === 'Debit' ? amount : 0,
            Credit: group.side === 'Credit' ? amount : 0,
            SourceLineCount: group.sourceLineCount,
        };
    });
}

/** Split a flat rollup into one card per company, keeping NetLines order inside each. */
export function GroupOrderJournalByCompany(rows: OrderJournalRollupRow[]): OrderJournalCard[] {
    const cards: OrderJournalCard[] = [];
    const index = new Map<string, OrderJournalCard>();
    for (const row of rows) {
        const key = row.CompanyID.toLowerCase();
        let card = index.get(key);
        if (!card) {
            card = {
                CompanyID: row.CompanyID,
                Company: row.Company,
                Rows: [],
                TotalDebit: 0,
                TotalCredit: 0,
            };
            index.set(key, card);
            cards.push(card);
        }
        card.Rows.push(row);
        card.TotalDebit += row.Debit;
        card.TotalCredit += row.Credit;
    }
    return cards;
}

/**
 * The order-level journal: every line JE rolled up with {@link NetLines}.
 *
 * This is a DISPLAY aggregation. Orders books one JE per line; there is no stored
 * "order journal" row.
 */
export async function GetOrderJournalRollup(
    orderLineIDs: string[],
    user?: UserInfo,
): Promise<OrderJournalRollup> {
    const journals = await loadJournalsForOrderLines(orderLineIDs, user);
    if (journals.length === 0) return EMPTY_ROLLUP;

    const { lines, dims } = await loadJournalLinesAndDims(journals.map((j) => j.ID), user);
    const accounts = await loadGLAccounts(lines.map((line) => line.GLAccountID), user);
    const nettable = toNettableLines(journals, lines, dims);
    const rows = PresentOrderJournalRollup(NetLines(nettable), rollupLabels(journals, lines, dims, accounts));
    const cards = GroupOrderJournalByCompany(rows);
    return {
        Cards: cards,
        TotalDebit: cards.reduce((sum, card) => sum + card.TotalDebit, 0),
        TotalCredit: cards.reduce((sum, card) => sum + card.TotalCredit, 0),
        JournalCount: journals.length,
    };
}

/**
 * Filter expression resolving all journal entries linked to a payment header
 * or its payment line allocations.
 */
export function BuildPaymentJournalFilter(payment: mjBizAppsOrdersPaymentHeaderEntity): string {
    if (!payment?.IsSaved || !payment.ID) return '1 = 0';
    const filters: string[] = [];
    if (payment.JournalEntryID) {
        filters.push(`ID = '${payment.JournalEntryID}'`);
    }
    filters.push(`LinkedRecordID = '${payment.ID}'`);
    filters.push(`LinkedRecordID IN (SELECT ID FROM [__mj_BizAppsOrders].[PaymentLine] WHERE PaymentHeaderID = '${payment.ID}')`);
    return filters.join(' OR ');
}

/**
 * Rollup of all journal entries produced by a payment and its line allocations.
 */
export async function GetPaymentJournalRollup(
    payment: mjBizAppsOrdersPaymentHeaderEntity,
    user?: UserInfo,
): Promise<OrderJournalRollup> {
    if (!payment?.IsSaved || !payment.ID) return EMPTY_ROLLUP;
    const filter = BuildPaymentJournalFilter(payment);
    const journals = await runRows<JournalHeaderRow>(
        MJO_ACCOUNTING_ENTITIES.JournalEntry,
        [filter],
        '__mj_CreatedAt DESC',
        500,
        user,
        ['ID', 'CompanyID', 'Company'],
    );
    if (journals.length === 0) return EMPTY_ROLLUP;

    const { lines, dims } = await loadJournalLinesAndDims(journals.map((j) => j.ID), user);
    const accounts = await loadGLAccounts(lines.map((line) => line.GLAccountID), user);
    const nettable = toNettableLines(journals, lines, dims);
    const rows = PresentOrderJournalRollup(NetLines(nettable), rollupLabels(journals, lines, dims, accounts));
    const cards = GroupOrderJournalByCompany(rows);
    return {
        Cards: cards,
        TotalDebit: cards.reduce((sum, card) => sum + card.TotalDebit, 0),
        TotalCredit: cards.reduce((sum, card) => sum + card.TotalCredit, 0),
        JournalCount: journals.length,
    };
}

function presentDimensions(dims: NetGroup['dims'], labels: RollupLabels): OrderJournalDimension[] {
    return dims.map((dim) => ({
        Name: labels.Dimension[dim.DimensionID.toLowerCase()] || dim.DimensionID,
        Value: labels.DimensionValue[dim.DimensionValueID.toLowerCase()] || dim.DimensionValueID,
    }));
}

async function loadJournalsForOrderLines(orderLineIDs: string[], user?: UserInfo): Promise<JournalHeaderRow[]> {
    const list = uuidList(orderLineIDs);
    if (!list) return [];
    return runRows<JournalHeaderRow>(
        MJO_ACCOUNTING_ENTITIES.JournalEntry,
        [`LinkedRecordID IN (${list})`],
        '__mj_CreatedAt DESC',
        500,
        user,
        ['ID', 'CompanyID', 'Company'],
    );
}

async function loadJournalLinesAndDims(
    journalIDs: string[],
    user?: UserInfo,
): Promise<{ lines: JournalLineRow[]; dims: JournalLineDimRow[] }> {
    const jeList = uuidList(journalIDs);
    if (!jeList) return { lines: [], dims: [] };

    const lines = await runRows<JournalLineRow>(
        MJO_ACCOUNTING_ENTITIES.JournalEntryLine,
        [`JournalEntryID IN (${jeList})`],
        'LineNumber',
        2000,
        user,
        ['ID', 'JournalEntryID', 'GLAccountID', 'GLAccount', 'DebitAmount', 'CreditAmount'],
    );
    const lineList = uuidList(lines.map((line) => line.ID));
    if (!lineList) return { lines, dims: [] };

    const dims = await runRows<JournalLineDimRow>(
        MJO_ACCOUNTING_ENTITIES.JournalEntryLineDimension,
        [`JournalEntryLineID IN (${lineList})`],
        'DimensionID',
        2000,
        user,
        ['JournalEntryLineID', 'DimensionID', 'DimensionValueID', 'Dimension', 'DimensionValue'],
    );
    return { lines, dims };
}

async function loadGLAccounts(ids: string[], user?: UserInfo): Promise<GLAccountRow[]> {
    const list = uuidList(ids);
    if (!list) return [];
    return runRows<GLAccountRow>(
        MJO_ACCOUNTING_ENTITIES.GLAccount,
        [`ID IN (${list})`],
        'Code',
        500,
        user,
        ['ID', 'Code', 'Name'],
    );
}

function toNettableLines(
    journals: JournalHeaderRow[],
    lines: JournalLineRow[],
    dims: JournalLineDimRow[],
): NettableLine[] {
    const companyByJE = new Map(journals.map((j) => [j.ID.toLowerCase(), j.CompanyID]));
    const dimsByLine = new Map<string, NettableLine['dims']>();
    for (const dim of dims) {
        const existing = dimsByLine.get(dim.JournalEntryLineID) ?? [];
        existing.push({ DimensionID: dim.DimensionID, DimensionValueID: dim.DimensionValueID });
        dimsByLine.set(dim.JournalEntryLineID, existing);
    }
    return lines.map((line) => ({
        companyId: companyByJE.get(line.JournalEntryID.toLowerCase()) ?? '',
        glAccountId: line.GLAccountID,
        debit: line.DebitAmount ?? 0,
        credit: line.CreditAmount ?? 0,
        dims: dimsByLine.get(line.ID) ?? [],
    }));
}

function rollupLabels(
    journals: JournalHeaderRow[],
    lines: JournalLineRow[],
    dims: JournalLineDimRow[],
    accounts: GLAccountRow[],
): RollupLabels {
    const Company: Record<string, string> = {};
    for (const journal of journals) {
        Company[journal.CompanyID.toLowerCase()] = journal.Company;
    }
    const Account: Record<string, { Code: string; Name: string }> = {};
    for (const line of lines) {
        Account[line.GLAccountID.toLowerCase()] = { Code: '', Name: line.GLAccount };
    }
    for (const account of accounts) {
        Account[account.ID.toLowerCase()] = { Code: account.Code, Name: account.Name || Account[account.ID.toLowerCase()]?.Name || '' };
    }
    const Dimension: Record<string, string> = {};
    const DimensionValue: Record<string, string> = {};
    for (const dim of dims) {
        Dimension[dim.DimensionID.toLowerCase()] = dim.Dimension;
        DimensionValue[dim.DimensionValueID.toLowerCase()] = dim.DimensionValue;
    }
    return { Company, Account, Dimension, DimensionValue };
}

/** What this order started, as grid params. Null when the order has no lines. */
export function SubscriptionViewParams(orderLineIDs: string[]): RunViewParams | null {
    const list = uuidList(orderLineIDs);
    if (!list) return null;
    return {
        EntityName: MJO_ENTITIES.Subscription,
        ExtraFilter: `OrderLineID IN (${list})`,
        OrderBy: 'StartDate DESC',
        ResultType: 'entity_object',
    };
}

/** Dimension tags on an order's lines — the analysis axes a line was filed under. */
export async function GetLineDimensionsForOrder(
    orderLineIDs: string[],
    user?: UserInfo,
): Promise<mjBizAppsOrdersOrderLineDimensionEntity[]> {
    const list = uuidList(orderLineIDs);
    if (!list) return [];
    return run<mjBizAppsOrdersOrderLineDimensionEntity>(
        MJO_ENTITIES.OrderLineDimension,
        [`OrderLineID IN (${list})`],
        'Dimension',
        undefined,
        user,
    );
}

/* ── Payments ────────────────────────────────────────────────────────────────── */

export type MJOPaymentPreset = 'all' | 'captured' | 'pending' | 'refunds';

/** Payments, newest first. */
export async function GetPayments(
    options: { Preset?: MJOPaymentPreset; Search?: string; MaxRows?: number; User?: UserInfo } = {},
): Promise<mjBizAppsOrdersPaymentHeaderEntity[]> {
    const filters: string[] = [];
    switch (options.Preset) {
        case 'captured':
            filters.push(`Status = 'Captured'`);
            break;
        case 'pending':
            filters.push(`Status = 'Pending'`);
            break;
        case 'refunds':
            filters.push(`Status = 'Refunded'`);
            break;
        default:
            break;
    }
    if (options.Search?.trim()) {
        const escaped = likeText(options.Search);
        filters.push(`(PaymentNumber LIKE '%${escaped}%' OR Description LIKE '%${escaped}%')`);
    }
    return run<mjBizAppsOrdersPaymentHeaderEntity>(
        MJO_ENTITIES.PaymentHeader,
        filters,
        'PaymentDate DESC',
        options.MaxRows,
        options.User,
    );
}

/**
 * One customer's payments.
 *
 * The A/R screen shows a customer at a time, so this is fetched for the SELECTED customer rather
 * than for everyone up front — a hundred customers' payment histories to render one is work with no
 * answer attached to it.
 */
export async function GetPaymentsForCustomer(
    customer: { OrganizationID?: string | null; PersonID?: string | null },
    user?: UserInfo,
): Promise<mjBizAppsOrdersPaymentHeaderEntity[]> {
    const filters: string[] = [];
    if (customer.OrganizationID && UUID_PATTERN.test(customer.OrganizationID)) {
        filters.push(`BillToOrganizationID = '${customer.OrganizationID}'`);
    } else if (customer.PersonID && UUID_PATTERN.test(customer.PersonID)) {
        filters.push(`BillToPersonID = '${customer.PersonID}'`);
    } else {
        return [];
    }
    return run<mjBizAppsOrdersPaymentHeaderEntity>(
        MJO_ENTITIES.PaymentHeader,
        filters,
        'PaymentDate DESC',
        50,
        user,
    );
}

/**
 * Payments that have landed on one order.
 *
 * An allocation LINE, not a payment header: one payment can settle several orders, so the amount
 * that matters here is what reached THIS order rather than what the customer handed over.
 */
export async function GetPaymentLinesForOrder(
    orderHeaderID: string,
    user?: UserInfo,
): Promise<mjBizAppsOrdersPaymentLineEntity[]> {
    if (!UUID_PATTERN.test(orderHeaderID)) return [];
    return run<mjBizAppsOrdersPaymentLineEntity>(
        MJO_ENTITIES.PaymentLine,
        [`OrderHeaderID = '${orderHeaderID}'`],
        'AllocatedAt DESC',
        undefined,
        user,
    );
}

/**
 * Payment numbers for a set of payment ids.
 *
 * WHY THIS EXISTS. `PaymentLine` carries `PaymentHeaderID` and nothing else about the payment — no
 * number, because the base view does not join one. The order editor's "applied payments" table
 * rendered `line['PaymentHeader']`, a field that has never existed, so its Payment column showed a
 * dash on every row of every order that had ever been paid. Nothing failed; the column was simply
 * always empty, and an empty column reads as "no data" rather than as a wrong field name.
 *
 * One query for the whole set, keyed by id, rather than one per line.
 */
export async function GetPaymentNumbers(
    paymentHeaderIDs: string[],
    user?: UserInfo,
): Promise<Map<string, string>> {
    const numbers = new Map<string, string>();
    const list = uuidList(paymentHeaderIDs);
    if (!list) return numbers;

    const rows = await run<mjBizAppsOrdersPaymentHeaderEntity>(
        MJO_ENTITIES.PaymentHeader,
        [`ID IN (${list})`],
        'PaymentDate DESC',
        undefined,
        user,
    );
    for (const row of rows) {
        if (row.ID && row.PaymentNumber) numbers.set(String(row.ID).toLowerCase(), row.PaymentNumber);
    }
    return numbers;
}

/** A tender the customer can pay with. */
export interface MJOTenderOption {
    ID: string;
    Code: string;
    Name: string;
    RequiresReference: boolean;
    RequiresInstrument: boolean;
}

/**
 * Tenders a payment can be taken on, in the order they should be offered.
 *
 * Reversal types are excluded because they are not something a person CHOOSES — a refund creates
 * one, and offering it here would let someone record a reversal with nothing to reverse.
 */
export async function GetPaymentTypes(user?: UserInfo): Promise<mjBizAppsOrdersPaymentTypeEntity[]> {
    return run<mjBizAppsOrdersPaymentTypeEntity>(
        MJO_ENTITIES.PaymentType,
        [`IsActive = 1`, `IsReversal = 0`],
        'Sequence',
        undefined,
        user,
    );
}

/* ── Subscriptions ───────────────────────────────────────────────────────────── */

/**
 * Subscriptions a customer holds or benefits from.
 *
 * Both sides are checked because they are genuinely different roles — an employer HOLDS a seat that
 * an employee BENEFITS from, and the A/R screen wants either to count as "theirs".
 */
export async function GetSubscriptionsForCustomer(
    customer: { OrganizationID?: string | null; PersonID?: string | null },
    user?: UserInfo,
): Promise<mjBizAppsOrdersSubscriptionEntity[]> {
    const clauses: string[] = [];
    if (customer.OrganizationID && UUID_PATTERN.test(customer.OrganizationID)) {
        clauses.push(`HolderOrganizationID = '${customer.OrganizationID}'`);
    }
    if (customer.PersonID && UUID_PATTERN.test(customer.PersonID)) {
        clauses.push(`BeneficiaryPersonID = '${customer.PersonID}'`);
    }
    if (!clauses.length) return [];
    return run<mjBizAppsOrdersSubscriptionEntity>(
        MJO_ENTITIES.Subscription,
        [`(${clauses.join(' OR ')})`],
        'EndDate DESC',
        50,
        user,
    );
}

/**
 * Coverage terms for one subscription, oldest first.
 *
 * A term is a PERIOD of coverage, and renewals APPEND one rather than moving a pointer. That is why
 * "current" is not a field: it is the term whose window covers today, which cannot go stale.
 */
export async function GetSubscriptionTerms(
    subscriptionID: string,
    user?: UserInfo,
): Promise<mjBizAppsOrdersSubscriptionTermEntity[]> {
    if (!UUID_PATTERN.test(subscriptionID)) return [];
    return run<mjBizAppsOrdersSubscriptionTermEntity>(
        MJO_ENTITIES.SubscriptionTerm,
        [`SubscriptionID = '${subscriptionID}'`],
        'TermNumber',
        undefined,
        user,
    );
}

/** What happened to a subscription, newest first. */
export async function GetSubscriptionEvents(
    subscriptionID: string,
    user?: UserInfo,
): Promise<mjBizAppsOrdersSubscriptionEventEntity[]> {
    if (!UUID_PATTERN.test(subscriptionID)) return [];
    return run<mjBizAppsOrdersSubscriptionEventEntity>(
        MJO_ENTITIES.SubscriptionEvent,
        [`SubscriptionID = '${subscriptionID}'`],
        'OccurredAt DESC',
        undefined,
        user,
    );
}

/* ── Catalog ─────────────────────────────────────────────────────────────────── */

/** Active products, for a picker. */
export async function GetProducts(
    options: { Search?: string; MaxRows?: number; User?: UserInfo } = {},
): Promise<mjBizAppsOrdersProductEntity[]> {
    const filters = [
        `Status = 'Active'`,
        // Leftover IT-ORD-* fixture rows from the retired prefix-and-sweep catalog. They sort
        // first by name, often have no price, and made Fast Entry refuse with "no price rule".
        // The live catalog is ORD-WORLD (natural names). Keep this filter as a leftover guard.
        `Name NOT LIKE 'IT-ORD-%'`,
    ];
    if (options.Search?.trim()) {
        const escaped = likeText(options.Search);
        filters.push(`(Name LIKE '%${escaped}%' OR SKU LIKE '%${escaped}%')`);
    }
    return run<mjBizAppsOrdersProductEntity>(
        MJO_ENTITIES.Product,
        filters,
        'Name',
        options.MaxRows ?? 200,
        options.User,
    );
}

/** Price rules, highest priority first — that is the order that resolves a tie. */
export async function GetProductPrices(user?: UserInfo): Promise<mjBizAppsOrdersProductPriceEntity[]> {
    return run<mjBizAppsOrdersProductPriceEntity>(MJO_ENTITIES.ProductPrice, [], 'Priority DESC', undefined, user);
}

/** A catalog row as the product picker shows it. */
export interface MJOProductOption {
    ID: string;
    Name: string;
    SKU: string;
    TypeName: string;
    ProductTypeID: string;
    /** MJ entity name of the IS-A Order Line extension, when the type has one. */
    OrderLineExtensionEntity: string | null;
    CompanyName: string;
    ListPrice: number;
    Taxable: boolean;
    /** NULL = no cap. 1 = one unit per line (conference tickets). */
    MaxQuantityPerLine: number | null;
}

/** Flatten a product + its type into the picker row. */
export function CatalogOptionFrom(
    product: Pick<
        mjBizAppsOrdersProductEntity,
        'ID' | 'Name' | 'SKU' | 'ProductType' | 'ProductTypeID' | 'Company' | 'StandaloneSellingPrice' | 'IsTaxable' | 'MaxQuantityPerLine'
    >,
    type: Pick<mjBizAppsOrdersProductTypeEntity, 'OrderLineExtensionEntity'> | undefined,
    listPrice: number,
): MJOProductOption {
    return {
        ID: product.ID,
        Name: product.Name,
        SKU: product.SKU ?? '',
        TypeName: product.ProductType ?? '',
        ProductTypeID: product.ProductTypeID,
        OrderLineExtensionEntity: type?.OrderLineExtensionEntity ?? null,
        CompanyName: product.Company ?? '',
        ListPrice: product.StandaloneSellingPrice || listPrice || 0,
        Taxable: !!product.IsTaxable,
        MaxQuantityPerLine: readMaxQuantityPerLine(product),
    };
}

function readMaxQuantityPerLine(product: { MaxQuantityPerLine?: number | null }): number | null {
    const value = product.MaxQuantityPerLine;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Products the picker can add, with an indicative list price.
 *
 * The figure comes from the PRICE RULES, not `StandaloneSellingPrice`: SSP is
 * null for anything priced by a rule, and rendering that as $0.00 tells an
 * order taker the item is free. The engine still resolves the real price on
 * the line.
 */
let catalogCache: MJOProductOption[] | null = null;
let catalogLoad: Promise<MJOProductOption[]> | null = null;

/** Catalog picker rows, loaded once per session. */
export async function GetCatalogOptions(user?: UserInfo): Promise<MJOProductOption[]> {
    if (catalogCache) return catalogCache;
    if (catalogLoad) return catalogLoad;
    catalogLoad = loadCatalogOptions(user).then((rows) => {
        catalogCache = rows;
        catalogLoad = null;
        return rows;
    });
    return catalogLoad;
}

async function loadCatalogOptions(user?: UserInfo): Promise<MJOProductOption[]> {
    const [products, prices, types] = await Promise.all([
        GetProducts({ MaxRows: 500, User: user }),
        GetProductPrices(user),
        GetProductTypes(user),
    ]);
    const byProduct = new Map<string, number>();
    for (const price of prices) {
        if (price.ProductID && !byProduct.has(price.ProductID)) byProduct.set(price.ProductID, price.Amount);
    }
    const typesById = new Map(types.map((type) => [type.ID, type]));
    return products.map((product) =>
        CatalogOptionFrom(product, typesById.get(product.ProductTypeID), byProduct.get(product.ID) ?? 0),
    );
}

/** Promotions, newest window first. */
export async function GetPromotions(user?: UserInfo): Promise<mjBizAppsOrdersPromotionEntity[]> {
    return run<mjBizAppsOrdersPromotionEntity>(
        MJO_ENTITIES.Promotion,
        [],
        // The window columns are EffectiveFrom/EffectiveTo. `StartDate` does not exist on this
        // entity, and ordering by it made SQL Server reject the whole query — so the promotions
        // screen showed "No promotions", which reads as an empty catalog rather than a broken one.
        'EffectiveFrom DESC',
        undefined,
        user,
    );
}

/** Categories, which supply a product's defaults when it states none. */
export async function GetProductCategories(user?: UserInfo): Promise<mjBizAppsOrdersProductCategoryEntity[]> {
    return run<mjBizAppsOrdersProductCategoryEntity>(MJO_ENTITIES.ProductCategory, [`IsActive = 1`], 'Name', undefined, user);
}

/**
 * Product types — the behaviour root.
 *
 * A type decides recognition, taxability, fulfilment and recurrence, and every order line inherits
 * those answers. That is why an order screen never asks.
 */
export async function GetProductTypes(user?: UserInfo): Promise<mjBizAppsOrdersProductTypeEntity[]> {
    return run<mjBizAppsOrdersProductTypeEntity>(MJO_ENTITIES.ProductType, [`IsActive = 1`], 'Name', undefined, user);
}

/** Price lists — the named sets a customer can be assigned to. */
export async function GetPriceLists(user?: UserInfo): Promise<mjBizAppsOrdersPriceListEntity[]> {
    return run<mjBizAppsOrdersPriceListEntity>(MJO_ENTITIES.PriceList, [], 'Name', undefined, user);
}

/**
 * Quantity bands, in the order they are read.
 *
 * A band belongs to a PRICE, not a product: the same product can be banded differently on two price
 * lists, which is the point of having price lists.
 */
export async function GetPriceTiers(user?: UserInfo): Promise<mjBizAppsOrdersPriceTierEntity[]> {
    return run<mjBizAppsOrdersPriceTierEntity>(MJO_ENTITIES.PriceTier, [], 'SortOrder', undefined, user);
}

/** Charge types, in the sequence they compute. */
export async function GetChargeTypes(user?: UserInfo): Promise<mjBizAppsOrdersChargeTypeEntity[]> {
    return run<mjBizAppsOrdersChargeTypeEntity>(
        MJO_ENTITIES.ChargeType,
        [],
        // Sequence, not name: the ORDER is the behaviour — non-tax charges run first and enlarge the
        // taxable base, tax charges run after.
        'Sequence',
        undefined,
        user,
    );
}

/** Customer exemption certificates, newest first. */
export async function GetTaxExemptions(user?: UserInfo): Promise<mjBizAppsOrdersCustomerTaxExemptionEntity[]> {
    return run<mjBizAppsOrdersCustomerTaxExemptionEntity>(MJO_ENTITIES.TaxExemption, [], 'StartedAt DESC', undefined, user);
}

/* ── Tax reference data, read from ACCOUNTING ─────────────────────────────────
 *
 * Jurisdictions, rates and nexus belong to the accounting app; Orders consumes them. That direction
 * is deliberate (D44) — cross-app references point UP the graph, so tax can be reasoned about
 * without knowing anything about orders.
 *
 * Typed as `Record<string, unknown>` rather than an accounting row type: importing accounting's
 * generated types into this package would pull a second app's schema into every screen's compile,
 * and these three feed a read-only reference table. The moment one of them drives a DECISION here,
 * it should take the real type.
 */

/** Tax jurisdictions with their current rates. */
export async function GetTaxJurisdictions(user?: UserInfo): Promise<Array<Record<string, unknown>>> {
    return run<Record<string, unknown>>(MJO_ACCOUNTING_ENTITIES.TaxJurisdiction, [`IsActive = 1`], 'Name', undefined, user);
}

/** Rates, newest effective window first. */
export async function GetTaxRates(user?: UserInfo): Promise<Array<Record<string, unknown>>> {
    return run<Record<string, unknown>>(MJO_ACCOUNTING_ENTITIES.TaxRate, [], 'EffectiveFrom DESC', undefined, user);
}

/**
 * Where each company is registered to collect.
 *
 * Nexus is the question that decides whether tax applies at all — a rate without a registration is a
 * rate we must NOT charge.
 */
export async function GetTaxNexus(user?: UserInfo): Promise<Array<Record<string, unknown>>> {
    return run<Record<string, unknown>>(MJO_ACCOUNTING_ENTITIES.CompanyTaxNexus, [], 'RegisteredFrom DESC', undefined, user);
}

/* ── Parties ─────────────────────────────────────────────────────────────────── */

/**
 * Customers matching a query — organizations and people together.
 *
 * BOTH are searched because an order can be billed to either, and making the user choose which KIND
 * of party they are looking for before they have found it is a question the screen can answer itself.
 *
 * Typed as `Record<string, unknown>` inside: the party model belongs to the COMMON app, and its
 * generated types are not a dependency of this package. The shape that leaves here is
 * `MJOCustomerOption`, which is what the picker actually renders.
 */
export async function SearchCustomers(query: string, user?: UserInfo): Promise<MJOCustomerOption[]> {
    const text = query.trim();
    if (text.length < 2) return [];
    const escaped = likeText(text);

    const [orgs, people] = await Promise.all([
        run<Record<string, unknown>>(MJO_COMMON_ENTITIES.Organization, [`Name LIKE '%${escaped}%'`], 'Name', 20, user),
        run<Record<string, unknown>>(
            MJO_COMMON_ENTITIES.Person,
            [`(FirstName LIKE '%${escaped}%' OR LastName LIKE '%${escaped}%' OR Email LIKE '%${escaped}%')`],
            'LastName',
            20,
            user,
        ),
    ]);

    return [
        ...orgs.map((o) => ({
            ID: String(o['ID']),
            Name: String(o['Name'] ?? ''),
            IsOrganization: true,
            Email: (o['Email'] as string) ?? null,
        })),
        ...people.map((p) => ({
            ID: String(p['ID']),
            Name: [p['FirstName'], p['LastName']].filter(Boolean).join(' ').trim() || String(p['Email'] ?? ''),
            IsOrganization: false,
            Email: (p['Email'] as string) ?? null,
        })),
    ];
}

/**
 * The customers this desk has billed most recently, newest first.
 *
 * WHY THIS EXISTS. The customer field only searched, and only from two characters in — so an order
 * taker facing an empty box had to already know a name to type. On seeded data that is close to
 * unusable, and even on real data it makes the commonest case — the customer you billed an hour ago
 * — the slowest one.
 *
 * RECENCY, not alphabetical: a desk bills the same handful of accounts over and over, so the last
 * few orders predict the next one far better than the top of the alphabet does. Derived from recent
 * orders rather than stored, because "who we deal with" is already recorded there and a second list
 * would be one more thing to keep true.
 *
 * Returns the same shape as {@link SearchCustomers} so the picker renders both through one template
 * and selection behaves identically.
 */
export async function RecentCustomers(limit = 8, user?: UserInfo): Promise<MJOCustomerOption[]> {
    const orders = await run<mjBizAppsOrdersOrderHeaderEntity>(
        MJO_ENTITIES.OrderHeader,
        [],
        'OrderDate DESC',
        80,
        user,
    );

    const seen = new Set<string>();
    const out: MJOCustomerOption[] = [];
    for (const order of orders) {
        // An order can carry BOTH a bill-to organization and a bill-to person (an employee ordering
        // against their employer's account), and either is a legitimate thing to start the next
        // order from — so consider both.
        const candidates = [
            { id: String(order.BillToOrganizationID ?? ''), name: String(order.BillToOrganization ?? ''), isOrg: true },
            { id: String(order.BillToPersonID ?? ''), name: String(order.BillToPerson ?? ''), isOrg: false },
        ];
        for (const c of candidates) {
            if (!c.id || !c.name || seen.has(c.id)) continue;
            seen.add(c.id);
            out.push({ ID: c.id, Name: c.name, IsOrganization: c.isOrg, Email: null });
            if (out.length >= limit) return out;
        }
    }
    return out;
}

/**
 * The companies this instance can SELL as, ordered by name.
 *
 * Derived from which companies own PRODUCTS rather than from the Company table: a company with
 * nothing to sell cannot raise an order, and the Company table is MJ-core-wide, so it carries every
 * company any app ever created. Note this does NOT exclude integration-test fixture companies —
 * those own products too, so they appear here until the fixture data is purged
 * (`test-harnesses/purge-fixture-data.mjs`).
 */
export async function GetSellingCompanies(user?: UserInfo): Promise<MJOCompanyOption[]> {
    const products = await GetProducts({ MaxRows: 500, User: user });
    const byID = new Map<string, string>();
    for (const p of products) {
        const id = String(p.CompanyID ?? '');
        if (!id) continue;
        if (!byID.has(id)) byID.set(id, String(p.Company ?? ''));
    }
    return [...byID].map(([ID, Name]) => ({ ID, Name })).sort((a, b) => a.Name.localeCompare(b.Name));
}

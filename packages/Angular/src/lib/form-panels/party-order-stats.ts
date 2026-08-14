import { RunQuery, RunView, type IMetadataProvider, type IRunQueryProvider } from '@memberjunction/core';
import type { MJOSummaryFigure } from '../panels/summary-strip.component';
import { FormatMoney } from '../panels/money-format';
import { MJO_ENTITIES } from '../data/entity-names';

export type PartyKind = 'person' | 'organization';

export const PARTY_ORDER_LIFETIME_QUERY = 'Party Order Lifetime';
export const PARTY_ORDER_LIFETIME_CATEGORY = 'Orders';

interface CountSpec {
    Label: string;
    EntityName: string;
    Filter: string;
    Tone?: MJOSummaryFigure['Tone'];
}

interface PartyLifetimeRow {
    OrderCount: number;
    OpenCount: number;
    OverdueCount: number;
    ActiveSubCount: number;
    LifetimeValue: number;
    FirstOrderDate: Date | string | null;
    YearsAsCustomer: number | null;
}

/**
 * Party-level order figures for the Person/Org header strip.
 *
 * Prefers the stored `Party Order Lifetime` query (one indexed aggregate:
 * counts + LTV + first order). Falls back to the original four count
 * RunViews if the query is not installed yet.
 */
export async function LoadPartyOrderFigures(
    kind: PartyKind,
    partyId: string,
    provider: IMetadataProvider,
    runQuery: IRunQueryProvider,
): Promise<MJOSummaryFigure[]> {
    const fromQuery = await tryLoadLifetimeQuery(kind, partyId, runQuery);
    if (fromQuery) {
        return fromQuery;
    }
    return loadCountFigures(kind, partyId, provider);
}

export function FiguresFromLifetimeRow(row: PartyLifetimeRow): MJOSummaryFigure[] {
    return [
        { Label: 'Orders', Value: formatCount(row.OrderCount) },
        { Label: 'Open', Value: formatCount(row.OpenCount) },
        { Label: 'Overdue', Value: formatCount(row.OverdueCount), Tone: 'muted' },
        { Label: 'Active subs', Value: formatCount(row.ActiveSubCount) },
        { Label: 'LTV', Value: FormatMoney(row.LifetimeValue, { Round: true, Zero: '$0' }) },
        { Label: 'Customer', Value: formatTenure(row.FirstOrderDate, row.YearsAsCustomer) },
    ];
}

export function formatTenure(
    firstOrder: Date | string | null | undefined,
    years: number | null | undefined,
): string {
    const first = parseDate(firstOrder);
    if (!first) return '—';
    if (years != null && years >= 1) {
        return `${years} yr`;
    }
    return `since ${first.getUTCFullYear()}`;
}

async function tryLoadLifetimeQuery(
    kind: PartyKind,
    partyId: string,
    runQuery: IRunQueryProvider,
): Promise<MJOSummaryFigure[] | null> {
    const rq = new RunQuery(runQuery);
    const result = await rq.RunQuery({
        QueryName: PARTY_ORDER_LIFETIME_QUERY,
        CategoryPath: PARTY_ORDER_LIFETIME_CATEGORY,
        Parameters: {
            PartyKind: kind,
            PartyID: partyId,
        },
    });
    if (!result.Success || !result.Results || result.Results.length === 0) {
        return null;
    }
    const row = readLifetimeRow(result.Results[0]);
    return row ? FiguresFromLifetimeRow(row) : null;
}

function readLifetimeRow(raw: object): PartyLifetimeRow | null {
    const rec = raw as Record<string, string | number | Date | null>;
    const orderCount = toNumber(rec['OrderCount']);
    if (orderCount == null) return null;
    return {
        OrderCount: orderCount,
        OpenCount: toNumber(rec['OpenCount']) ?? 0,
        OverdueCount: toNumber(rec['OverdueCount']) ?? 0,
        ActiveSubCount: toNumber(rec['ActiveSubCount']) ?? 0,
        LifetimeValue: toNumber(rec['LifetimeValue']) ?? 0,
        FirstOrderDate: toDateOrString(rec['FirstOrderDate']),
        YearsAsCustomer: toNumber(rec['YearsAsCustomer']),
    };
}

async function loadCountFigures(
    kind: PartyKind,
    partyId: string,
    provider: IMetadataProvider,
): Promise<MJOSummaryFigure[]> {
    const partyCol = kind === 'person' ? 'BillToPersonID' : 'BillToOrganizationID';
    const subCol = kind === 'person' ? 'BeneficiaryPersonID' : 'HolderOrganizationID';
    const id = partyId.replace(/'/g, "''");

    const specs: CountSpec[] = [
        {
            Label: 'Orders',
            EntityName: MJO_ENTITIES.OrderHeader,
            Filter: `${partyCol}='${id}' AND Status<>'Voided'`,
        },
        {
            Label: 'Open',
            EntityName: MJO_ENTITIES.OrderHeader,
            Filter: `${partyCol}='${id}' AND PaymentStatus IN ('Unpaid','PartiallyPaid','Overdue')`,
        },
        {
            Label: 'Overdue',
            EntityName: MJO_ENTITIES.OrderHeader,
            Filter: `${partyCol}='${id}' AND PaymentStatus='Overdue'`,
            Tone: 'muted',
        },
        {
            Label: 'Active subs',
            EntityName: MJO_ENTITIES.Subscription,
            Filter: `${subCol}='${id}' AND Status='Active'`,
        },
    ];

    const rv = RunView.FromMetadataProvider(provider);
    const results = await rv.RunViews(
        specs.map((spec) => ({
            EntityName: spec.EntityName,
            ExtraFilter: spec.Filter,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple' as const,
        })),
    );

    return specs.map((spec, i) => {
        const result = results[i];
        const count = result?.Success ? (result.TotalRowCount ?? result.Results?.length ?? 0) : 0;
        return {
            Label: spec.Label,
            Value: formatCount(count),
            Tone: spec.Tone,
        };
    });
}

function formatCount(value: number): string {
    return value.toLocaleString();
}

function toNumber(value: string | number | Date | null | undefined): number | null {
    if (value == null) return null;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string' && value.length > 0) {
        const n = Number(value);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

function toDateOrString(value: string | number | Date | null | undefined): Date | string | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return value;
    return null;
}

function parseDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

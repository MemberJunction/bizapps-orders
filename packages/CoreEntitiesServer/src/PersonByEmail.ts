/**
 * @fileoverview Which Person an e-mail address means — one rule for every Orders path that finds a
 * buyer by e-mail.
 *
 * A directory can hold several Person rows with the same e-mail: imports, merges not yet done, a
 * person entered twice. A path that takes "the first match" without an order gets whichever row the
 * database returns, which can differ from one call to the next, so one buyer's orders, subscriptions
 * and grants end up split across rows — and a path that refuses when several match disagrees with
 * the path that picked one.
 *
 * THE RULE. Trimmed and lower-cased; the `Email` column's case-insensitive collation matches any
 * casing. Among several matches:
 *   1. a Person that already has Orders activity — an order billed to them, or a subscription or
 *      entitlement grant for them — so a returning buyer stays on the row that holds their history;
 *   2. then the oldest (`__mj_CreatedAt`);
 *   3. then the lowest ID, so the answer never depends on row order.
 * The rule does not merge anything; duplicates are a data task.
 */
import { RunView, UserInfo } from '@memberjunction/core';
import { EscapeText } from './sql-guards.js';

const PERSON_ENTITY = 'MJ_BizApps_Common: People';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

/** Longest address accepted, as RFC 5321 allows. */
export const MAX_PERSON_EMAIL_LENGTH = 254;

/** Trimmed and lower-cased, or null when empty or longer than {@link MAX_PERSON_EMAIL_LENGTH}. */
export function NormalizePersonEmail(value: unknown): string | null {
    const email = String(value ?? '').trim().toLowerCase();
    if (!email || email.length > MAX_PERSON_EMAIL_LENGTH) return null;
    return email;
}

export interface PersonCandidate {
    ID: string;
    CreatedAt: Date | string | null;
    HasOrdersActivity: boolean;
}

/** The rule's choice among candidates for one e-mail — pure. Null for none. */
export function ChoosePersonForEmail(candidates: PersonCandidate[]): string | null {
    if (candidates.length === 0) return null;
    const time = (c: PersonCandidate): number => {
        const t = c.CreatedAt == null ? NaN : new Date(c.CreatedAt).getTime();
        return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };
    const sorted = [...candidates].sort((a, b) => {
        if (a.HasOrdersActivity !== b.HasOrdersActivity) return a.HasOrdersActivity ? -1 : 1;
        const byTime = time(a) - time(b);
        if (byTime !== 0) return byTime;
        const idA = a.ID.toLowerCase();
        const idB = b.ID.toLowerCase();
        return idA < idB ? -1 : idA > idB ? 1 : 0;
    });
    return sorted[0].ID;
}

export interface ResolvePersonByEmailResult {
    /** False when a read failed; `PersonID` is then null and the caller must not treat it as "no Person". */
    Success: boolean;
    PersonID: string | null;
    /** How many Persons carry this e-mail. */
    MatchCount: number;
    ErrorMessage?: string;
}

/**
 * The Person an e-mail means, by the rule above.
 *
 * @param rv - The RunView to read through (carries the caller's provider)
 */
export async function ResolvePersonByEmail(email: unknown, rv: RunView, user: UserInfo | undefined): Promise<ResolvePersonByEmailResult> {
    const normalized = NormalizePersonEmail(email);
    if (!normalized) return { Success: true, PersonID: null, MatchCount: 0 };

    const people = await rv.RunView<{ ID: string; __mj_CreatedAt: Date | string | null }>(
        {
            EntityName: PERSON_ENTITY,
            ExtraFilter: `Email = '${EscapeText(normalized)}'`,
            Fields: ['ID', '__mj_CreatedAt'],
            ResultType: 'simple',
        },
        user
    );
    if (!people?.Success) {
        return { Success: false, PersonID: null, MatchCount: 0, ErrorMessage: people?.ErrorMessage ?? 'Person lookup failed' };
    }
    const rows = people.Results ?? [];
    if (rows.length <= 1) return { Success: true, PersonID: rows[0]?.ID ?? null, MatchCount: rows.length };

    const ids = rows.map((r) => `'${EscapeText(r.ID)}'`).join(',');
    const [orders, subscriptions, grants] = await rv.RunViews(
        [
            { EntityName: ORDER_HEADER_ENTITY, ExtraFilter: `BillToPersonID IN (${ids})`, Fields: ['BillToPersonID'], ResultType: 'simple' },
            { EntityName: SUBSCRIPTION_ENTITY, ExtraFilter: `BeneficiaryPersonID IN (${ids})`, Fields: ['BeneficiaryPersonID'], ResultType: 'simple' },
            { EntityName: ENTITLEMENT_GRANT_ENTITY, ExtraFilter: `BeneficiaryPersonID IN (${ids})`, Fields: ['BeneficiaryPersonID'], ResultType: 'simple' },
        ],
        user
    );
    if (!orders?.Success || !subscriptions?.Success || !grants?.Success) {
        const failed = [orders, subscriptions, grants].find((r) => !r?.Success);
        return { Success: false, PersonID: null, MatchCount: rows.length, ErrorMessage: failed?.ErrorMessage ?? 'Orders activity lookup failed' };
    }
    const active = new Set<string>();
    for (const r of (orders.Results ?? []) as Array<{ BillToPersonID?: string | null }>) if (r.BillToPersonID) active.add(r.BillToPersonID.toLowerCase());
    for (const set of [subscriptions, grants]) {
        for (const r of (set.Results ?? []) as Array<{ BeneficiaryPersonID?: string | null }>) if (r.BeneficiaryPersonID) active.add(r.BeneficiaryPersonID.toLowerCase());
    }
    const personID = ChoosePersonForEmail(
        rows.map((r) => ({ ID: r.ID, CreatedAt: r.__mj_CreatedAt, HasOrdersActivity: active.has(r.ID.toLowerCase()) }))
    );
    return { Success: true, PersonID: personID, MatchCount: rows.length };
}

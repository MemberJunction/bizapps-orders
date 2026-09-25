/**
 * New records always start expanded. The persisted UserInfoEngine pref
 * applies only when opening an existing order. `'0'` is collapsed;
 * anything else (including unset) is expanded.
 */
export type OrderFormParty = 'bill' | 'ship';

/** Clicking the open party collapses it; clicking the other opens that one. */
export function NextExpandedParty(current: OrderFormParty | null, clicked: OrderFormParty): OrderFormParty | null {
    return current === clicked ? null : clicked;
}

/** Empty / unknown prefs mean both parties are collapsed. */
export function ExpandedPartyFromPref(raw: string | undefined): OrderFormParty | null {
    if (raw === 'bill' || raw === 'ship') return raw;
    return null;
}

export function FormatPartyAddress(parts: {
    Line1?: string | null;
    City?: string | null;
    StateProvince?: string | null;
    PostalCode?: string | null;
}): string {
    const city = [parts.City, [parts.StateProvince, parts.PostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [parts.Line1, city].filter(Boolean).join(' · ');
}

/** Shown in place of a stored address snapshot that cannot be read. */
export const UNREADABLE_ADDRESS = 'Address record unreadable';

/**
 * The address a confirmed order was sold to, formatted for display; null when it has no snapshot.
 *
 * Reading a snapshot throws when the stored value is not one, which should only happen to a row
 * altered by hand. A getter that throws takes the whole screen down with it, so the failure is
 * shown in place of the address instead — never the live address, which may be somewhere else.
 */
export function FormatSoldAddress(snapshot: () => { Line1?: string | null; City?: string | null; StateProvince?: string | null; PostalCode?: string | null } | null): string | null {
    try {
        const sold = snapshot();
        return sold ? FormatPartyAddress(sold) || null : null;
    } catch {
        return UNREADABLE_ADDRESS;
    }
}

export function OrderHeaderExpandedFromPref(isSaved: boolean, raw: string | undefined): boolean {
    if (!isSaved) return true;
    return raw !== '0';
}

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

export function OrderHeaderExpandedFromPref(isSaved: boolean, raw: string | undefined): boolean {
    if (!isSaved) return true;
    return raw !== '0';
}

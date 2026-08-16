/**
 * New records always start expanded. The persisted UserInfoEngine pref
 * applies only when opening an existing order. `'0'` is collapsed;
 * anything else (including unset) is expanded.
 */
export function OrderHeaderExpandedFromPref(isSaved: boolean, raw: string | undefined): boolean {
    if (!isSaved) return true;
    return raw !== '0';
}

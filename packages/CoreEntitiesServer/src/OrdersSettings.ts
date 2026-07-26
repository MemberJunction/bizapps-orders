/**
 * Typed access to this app's settings (plan D63).
 *
 * MJ already owns the mechanism: `__mj.ApplicationSetting` rows scoped to an `Application`, cached
 * and auto-refreshed by `ApplicationSettingEngine` in `@memberjunction/core-entities`. This is NOT a
 * second engine — it is a thin typed façade over that one, so callers read
 * `OrdersSettings.AutoPopulateOrganizationFromPerson` (a real boolean, default applied) instead of
 * parsing `"true"` at each call site and re-deciding the default every time.
 *
 * WHY A FAÇADE AT ALL
 * `GetSetting` returns `string | undefined`. Every consumer would otherwise repeat the same three
 * decisions — what the key is called, what the default is, and how to coerce — and they would drift.
 * Naming the defaults in one place is what makes "the setting is off" and "the setting was never
 * configured" behave identically on purpose rather than by accident.
 *
 * The engine is a BaseEngine, so `AutoRefresh` (default true) propagates a change made through the
 * entity API without a restart. Callers must still have called `Config()` once — the entity servers
 * do that on the booking path.
 *
 * CONNECTS TO:
 *   ENGINE: ApplicationSettingEngine (@memberjunction/core-entities)
 *   TABLE:  __mj.ApplicationSetting, scoped to the '__mj_BizAppsOrders' Application row
 */
import { ApplicationSettingEngine } from '@memberjunction/core-entities';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';

/** The `MJ: Applications` row this app's settings hang off. */
const ORDERS_APPLICATION_NAME = '__mj_BizAppsOrders';

/** Setting keys, in one place so a typo is a compile error rather than a silent default. */
export const ORDERS_SETTING = {
    /**
     * Whether confirming an order stamps the ship-to/bill-to organization from the named person's
     * affiliation when the organization was left blank (D64).
     */
    AutoPopulateOrganizationFromPerson: 'AutoPopulateOrganizationFromPerson',
    /**
     * Comma-separated `RelationshipType` NAMES that count as an organizational affiliation for the
     * rule above. Names rather than IDs because `RelationshipType` is a seeded lookup in
     * bizapps-common — extensible data, so a deployment can add its own type and list it here
     * without a schema change on either side.
     */
    OrganizationAffiliationRelationshipTypes: 'OrganizationAffiliationRelationshipTypes',
} as const;

/**
 * Defaults, applied when a setting is absent.
 *
 * `Employee` only, deliberately. The seeded types include `Vendor`, `Customer` and `Friend`, and a
 * person being a VENDOR to an organization must not make that organization their bill-to. Widening
 * this is a data change, not a release — which is the whole point of it being a setting.
 */
const DEFAULTS = {
    AutoPopulateOrganizationFromPerson: true,
    OrganizationAffiliationRelationshipTypes: ['Employee'],
} as const;

/** Anything other than an explicit falsey string is true — an unparseable value should not disable a feature silently. */
function asBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    return fallback;
}

function asList(raw: string | undefined, fallback: readonly string[]): string[] {
    if (raw == null) return [...fallback];
    const parts = raw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    // An explicitly EMPTY list means "no type qualifies", which switches the feature off just as
    // surely as the boolean does. That is a legitimate way to configure it, so it is honoured
    // rather than being treated as "unset" and silently replaced by the default.
    return parts;
}

export class OrdersSettings {
    /**
     * Load the settings cache. Idempotent and cheap after the first call; the entity servers invoke
     * it on the booking path so callers rarely need to.
     */
    public static async Load(provider: IMetadataProvider, user: UserInfo): Promise<void> {
        await ApplicationSettingEngine.Instance.Config(false, user, provider);
    }

    /** The `__mj_BizAppsOrders` Application ID, or undefined when the app row is absent. */
    private static applicationID(): string | undefined {
        return new Metadata().Applications?.find((a) => a.Name === ORDERS_APPLICATION_NAME)?.ID;
    }

    private static raw(key: string): string | undefined {
        const appID = this.applicationID();
        // Without the app row there is nothing to scope to; fall through to the defaults rather
        // than reading some other application's setting of the same name.
        if (!appID) return undefined;
        return ApplicationSettingEngine.Instance.GetSetting(key, appID);
    }

    /** Stamp the organization from the person's affiliation when it was left blank (D64). */
    public static get AutoPopulateOrganizationFromPerson(): boolean {
        return asBoolean(
            this.raw(ORDERS_SETTING.AutoPopulateOrganizationFromPerson),
            DEFAULTS.AutoPopulateOrganizationFromPerson,
        );
    }

    /** `RelationshipType` names that count as an organizational affiliation. */
    public static get OrganizationAffiliationRelationshipTypes(): string[] {
        return asList(
            this.raw(ORDERS_SETTING.OrganizationAffiliationRelationshipTypes),
            DEFAULTS.OrganizationAffiliationRelationshipTypes,
        );
    }
}

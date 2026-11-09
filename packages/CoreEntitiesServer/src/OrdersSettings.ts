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
import { GetGlobalObjectStore } from '@memberjunction/global';
import { ParseOrderReviewTriggers, type OrderReviewConfig, type ParsedOrderReviewTriggers } from '@mj-biz-apps/orders-entities';

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
    /**
     * Days past due at which a renewal's `OnFirstPayment` grants are suspended (bc-aidp-next-golive#223).
     * A whole number of 0 or more; `off` disables the cutoff.
     */
    RenewalAccessCutoffDaysPastDue: 'RenewalAccessCutoffDaysPastDue',
    /**
     * The NAME of the MJ role whose active holders acknowledge an amendment to a booked arrangement
     * (bc-aidp-next-golive#221). Every holder but the amendment's requester is assigned the task that
     * confirms the recognition re-cut. Unset or empty refuses every amendment: a change nobody in
     * accounting is told about is the failure the acknowledgment exists to prevent.
     */
    AmendmentAcknowledgmentRole: 'AmendmentAcknowledgmentRole',
    /**
     * The NAME of the MJ role whose active holders approve an access override when its requester is
     * the order company's `ApprovalCFOUserID`, who would otherwise approve it (bizapps-orders#360).
     * Every holder but the requester is assigned. Unset or empty refuses such a request: nobody may
     * approve their own override.
     */
    AccessOverrideFallbackApproverRole: 'AccessOverrideFallbackApproverRole',
    /**
     * The NAME of the MJ role whose active holders are assigned every alert Task Orders raises: a checkout
     * payment that could not be booked, a provider subscription that needs a person, an outbound delivery
     * that was dead-lettered. Assignment is what makes the tasks app notify someone; an unassigned alert is
     * a row nobody is told about. Unset or empty leaves alerts unassigned, as before this setting existed.
     */
    AlertTaskRole: 'AlertTaskRole',
    /**
     * Days a booked term's start and end may move together before the shift goes to finance review
     * (bizapps-orders#507). A shift is a term change, not a sales concession, so this is one figure for
     * the app rather than a rep's SalesAuthority limit. At or above it is reviewed. Unset or unreadable
     * reviews every shift.
     */
    TermShiftReviewDays: 'TermShiftReviewDays',
    /**
     * Comma-separated days after a renewal's due day on which a declined renewal-card charge is tried
     * again (#289). The due day itself is always the first attempt. Attempts stop at the access
     * cutoff (`RenewalAccessCutoffDaysPastDue`) whatever this lists.
     */
    RenewalChargeRetryDays: 'RenewalChargeRetryDays',
    /**
     * The public address of the checkout edge (its `RootPath` on this host, for example
     * `https://shop.example.org/checkout`), which the update-card link is built on (#289). Unset, no
     * link is sent: a link to the wrong host is worse than none.
     */
    RenewalPaymentLinkBaseUrl: 'RenewalPaymentLinkBaseUrl',
    /**
     * Who decides a concession requested by a holder of its ConcessionLimit rule's role (bc-aidp-next-golive#320).
     * Comma-separated targets, tried in order: `CompanyCFO` (the order company's `ApprovalCFOUserID`) or an MJ
     * role NAME (its active holders). The first that names an active user other than the requester decides it.
     * Unset or empty keeps the requester approving their own.
     */
    ConcessionSelfApprovalEscalation: 'ConcessionSelfApprovalEscalation',
    /**
     * Comma-separated order review triggers that are switched on (bc-aidp-next-golive#320 §5): any of
     * `NoDeal`, `PriceVariance`, `ChangedAfterDealOrReview`, `OverThreshold`, `ServicePeriod`. Empty or
     * unset switches review off, so an order confirms as it always has. An entry that names no trigger
     * refuses every reviewed confirm until it is corrected.
     */
    OrderReviewTriggers: 'OrderReviewTriggers',
    /** The net order total above which `OverThreshold` sends an order to review (#320 §5). */
    OrderReviewTotalThreshold: 'OrderReviewTotalThreshold',
    /** `ServicePeriod` reviews a line whose service starts more than this many months out (default 13). */
    OrderReviewServiceStartMonths: 'OrderReviewServiceStartMonths',
    /** `ServicePeriod` reviews a line whose service covers more than this many months (default 12). */
    OrderReviewLineTermMonths: 'OrderReviewLineTermMonths',
    /**
     * The NAME of the MJ role whose active holders review an order that hit a trigger (#320 §5). Each is
     * assigned the review task through the Person linked to their user. Required once a trigger is on.
     */
    OrderReviewerRole: 'OrderReviewerRole',
    /**
     * The NAME of the MJ role whose active holders review an order that a holder of `OrderReviewerRole`
     * created, since nobody reviews their own order (#320 §5). Unset refuses such an order's confirm.
     */
    OrderReviewEscalationRole: 'OrderReviewEscalationRole',
    /**
     * Comma-separated NAMES of the MJ roles whose holders may confirm an order no deal created
     * (bc-aidp-next-golive#390). Checkout, provider-payment, reversal and renewal-only orders are exempt.
     * Empty or unset switches the check off, so anyone who may confirm an order may confirm it.
     */
    NoDealConfirmRoles: 'NoDealConfirmRoles',
    /**
     * The amount at or below which a refund may be issued by a holder of `RefundApproverRole`
     * (bc-aidp-next-golive#320 §3). Above it, only the receiving company's `ApprovalCFOUserID` may
     * issue it. Counted per payment, not per order: what this refund brings the payment's refunds to,
     * so an order settled by several payments can be refunded a payment at a time by a role holder for
     * more than the threshold in all. Empty switches the check off, so anyone who may call the
     * operation may refund, as before. A value that is not a number of 0 or more is read as 0, so
     * every refund needs the company approver.
     */
    RefundApprovalThreshold: 'RefundApprovalThreshold',
    /**
     * The NAME of the MJ role whose holders may issue a refund at or below `RefundApprovalThreshold`
     * (bc-aidp-next-golive#320 §3). Unset, only the company approver may issue refunds while the
     * threshold is set.
     */
    RefundApproverRole: 'RefundApproverRole',
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
    RenewalAccessCutoffDaysPastDue: 14,
    RenewalChargeRetryDays: [3, 7, 11],
    OrderReviewServiceStartMonths: 13,
    OrderReviewLineTermMonths: 12,
} as const;

/** Anything other than an explicit falsey string is true — an unparseable value should not disable a feature silently. */
function asBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    return fallback;
}

/**
 * A whole number of days, or `null` for an explicit `off`. Anything unreadable takes the default
 * rather than disabling the rule: a mistyped cutoff should keep the policy, not quietly drop it.
 */
function asDaysOrOff(raw: string | undefined, fallback: number): number | null {
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (['off', 'none', 'disabled'].includes(v)) return null;
    if (!/^\d+$/.test(v)) return fallback;
    return Number(v);
}

/** A whole number of 1 or more, or the fallback when the value is absent or unreadable. */
function asPositiveWholeNumber(raw: string | undefined, fallback: number): number {
    const v = raw?.trim();
    return v && /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : fallback;
}

/** A non-negative amount ("25000", "25,000.00"), or `null` when the value is absent, empty or unreadable. */
function asAmountOrNull(raw: string | undefined): number | null {
    const v = raw?.trim().replace(/,/g, '');
    return v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}

/**
 * A money amount of 0 or more, `null` when absent or empty (the check is off), and 0 when unreadable:
 * a mistyped threshold must tighten the rule, not switch it off.
 */
function asAmountOrOff(raw: string | undefined): number | null {
    const v = raw?.trim();
    if (!v) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return 0;
    return Number(v);
}

/** A whole number of days, or `null` when the value is absent, empty or unreadable. */
function asDaysOrNull(raw: string | undefined): number | null {
    const v = raw?.trim();
    return v && /^\d+$/.test(v) ? Number(v) : null;
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

/**
 * Whole positive day offsets, ascending and without repeats. An empty value means no retries. Any
 * entry that is not a whole number of 1 or more takes the default for the whole list: a typo must not
 * turn three retries into one.
 */
function asDayOffsets(raw: string | undefined, fallback: readonly number[]): number[] {
    if (raw == null) return [...fallback];
    const parts = raw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    if (parts.some((p) => !/^\d+$/.test(p) || Number(p) < 1)) return [...fallback];
    return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}

const OVERRIDES_STORE_KEY = '__orders_settings_overrides__';

interface GlobalWithOverrides {
    [OVERRIDES_STORE_KEY]?: Map<string, string>;
}

function getOverridesMap(): Map<string, string> {
    const g = globalThis as unknown as GlobalWithOverrides;
    if (!g[OVERRIDES_STORE_KEY]) {
        g[OVERRIDES_STORE_KEY] = new Map<string, string>();
    }
    return g[OVERRIDES_STORE_KEY]!;
}

export class OrdersSettings {
    private static _localOverrides = new Map<string, string>();

    /**
     * Load the settings cache. Idempotent and cheap after the first call; the entity servers invoke
     * it on the booking path so callers rarely need to.
     */
    public static async Load(provider: IMetadataProvider, user: UserInfo): Promise<void> {
        await ApplicationSettingEngine.Instance.Config(false, user, provider);
    }

    /** Override a setting value for tests. Pass undefined to remove the override. */
    public static SetOverride(key: string, value: string | undefined): void {
        const map = getOverridesMap();
        if (value === undefined) {
            map.delete(key);
            this._localOverrides.delete(key);
        } else {
            map.set(key, value);
            this._localOverrides.set(key, value);
        }
        try {
            const engine = ApplicationSettingEngine.Instance;
            for (const s of engine.ApplicationSettings) {
                if (s.Name === key) {
                    s.Value = value ?? '';
                }
            }
        } catch {
            // ignore
        }
    }

    /** Clear all test overrides. */
    public static ClearOverrides(): void {
        this._localOverrides.clear();
        getOverridesMap().clear();
    }

    /** The `__mj_BizAppsOrders` Application ID, or undefined when the app row is absent. */
    private static applicationID(): string | undefined {
        const apps = new Metadata().Applications;
        return apps?.find((a) => a.Name === ORDERS_APPLICATION_NAME || a.Name === 'MJ_BizApps_Orders' || a.Name === 'Orders')?.ID;
    }

    private static raw(key: string): string | undefined {
        if (this._localOverrides.has(key)) {
            return this._localOverrides.get(key);
        }
        const map = getOverridesMap();
        if (map.has(key)) {
            return map.get(key);
        }
        const appID = this.applicationID();
        return ApplicationSettingEngine.Instance.GetSetting(key, appID);
    }

    /**
     * Like {@link raw}, but throws when the Orders application row cannot be found. Without its ID
     * the engine consults only GLOBAL rows, so an app-scoped value would read as unset. For a
     * control whose unset value switches it OFF, that must be loud, not silent.
     */
    private static rawAppScoped(key: string): string | undefined {
        if (this._localOverrides.has(key)) {
            return this._localOverrides.get(key);
        }
        const map = getOverridesMap();
        if (map.has(key)) {
            return map.get(key);
        }
        const appID = this.applicationID();
        if (!appID) {
            throw new Error(
                `The Orders application (${ORDERS_APPLICATION_NAME}) is not in metadata, so the Orders setting ${key} cannot be read.`,
            );
        }
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

    /** The role whose holders are assigned Orders' alert Tasks, or null when none is configured. */
    public static get AlertTaskRole(): string | null {
        const value = this.raw(ORDERS_SETTING.AlertTaskRole)?.trim();
        return value ? value : null;
    }

    /** The role that acknowledges amendments, or `null` when none is configured. */
    public static get AmendmentAcknowledgmentRole(): string | null {
        const value = this.raw(ORDERS_SETTING.AmendmentAcknowledgmentRole)?.trim();
        return value ? value : null;
    }

    /** The role that approves an access override its company's CFO approver requested, or `null` when none is configured. */
    public static get AccessOverrideFallbackApproverRole(): string | null {
        const value = this.raw(ORDERS_SETTING.AccessOverrideFallbackApproverRole)?.trim();
        return value ? value : null;
    }

    /** Days after the due day on which a declined renewal-card charge is retried, ascending (#289). */
    public static get RenewalChargeRetryDays(): number[] {
        return asDayOffsets(this.raw(ORDERS_SETTING.RenewalChargeRetryDays), DEFAULTS.RenewalChargeRetryDays);
    }

    /** The checkout edge's public address the update-card link is built on, or `null` when unset (#289). */
    public static get RenewalPaymentLinkBaseUrl(): string | null {
        const value = this.raw(ORDERS_SETTING.RenewalPaymentLinkBaseUrl)?.trim();
        return value && /^https?:\/\/\S+$/i.test(value) ? value.replace(/\/+$/, '') : null;
    }

    /** Days past due at which a renewal loses access, or `null` when the cutoff is switched off. */
    public static get RenewalAccessCutoffDaysPastDue(): number | null {
        return asDaysOrOff(
            this.raw(ORDERS_SETTING.RenewalAccessCutoffDaysPastDue),
            DEFAULTS.RenewalAccessCutoffDaysPastDue,
        );
    }

    /** The escalation targets for a self-requested concession, in order; empty keeps self-approval. */
    public static get ConcessionSelfApprovalEscalation(): string[] {
        return asList(this.raw(ORDERS_SETTING.ConcessionSelfApprovalEscalation), []);
    }

    /** The order review triggers switched on, and any entry that names no trigger (#320 §5). */
    public static get OrderReviewTriggers(): ParsedOrderReviewTriggers {
        return ParseOrderReviewTriggers(this.raw(ORDERS_SETTING.OrderReviewTriggers));
    }

    /** The order review configuration as one value (#320 §5). */
    public static get OrderReview(): OrderReviewConfig {
        return {
            Triggers: this.OrderReviewTriggers.Enabled,
            TotalThreshold: asAmountOrNull(this.raw(ORDERS_SETTING.OrderReviewTotalThreshold)),
            MaxMonthsToServiceStart: asPositiveWholeNumber(
                this.raw(ORDERS_SETTING.OrderReviewServiceStartMonths),
                DEFAULTS.OrderReviewServiceStartMonths,
            ),
            MaxLineServiceMonths: asPositiveWholeNumber(
                this.raw(ORDERS_SETTING.OrderReviewLineTermMonths),
                DEFAULTS.OrderReviewLineTermMonths,
            ),
            ReviewerRole: this.raw(ORDERS_SETTING.OrderReviewerRole)?.trim() || null,
            EscalationRole: this.raw(ORDERS_SETTING.OrderReviewEscalationRole)?.trim() || null,
        };
    }

    /**
     * The roles whose holders may confirm an order with no deal; empty switches the check off (#390).
     * @throws when the Orders application row is missing, rather than reading the check as off.
     */
    public static get NoDealConfirmRoles(): string[] {
        return asList(this.rawAppScoped(ORDERS_SETTING.NoDealConfirmRoles), []);
    }

    /**
     * The refund amount at or below which `RefundApproverRole` may refund, or `null` when the check is off.
     *
     * @throws when the Orders application row is missing, rather than reading the check as off.
     */
    public static get RefundApprovalThreshold(): number | null {
        return asAmountOrOff(this.rawAppScoped(ORDERS_SETTING.RefundApprovalThreshold));
    }

    /** The role that may refund at or below the threshold, or `null` when none is configured. */
    public static get RefundApproverRole(): string | null {
        const value = this.raw(ORDERS_SETTING.RefundApproverRole)?.trim();
        return value ? value : null;
    }

    /** Days at or above which a term shift goes to finance review, or `null` to review every shift. */
    public static get TermShiftReviewDays(): number | null {
        return asDaysOrNull(this.raw(ORDERS_SETTING.TermShiftReviewDays));
    }

}

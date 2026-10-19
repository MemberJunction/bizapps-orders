/**
 * Who may issue a refund (bc-aidp-next-golive#320 §3: "Refund up to the threshold: the refund approver
 * role; above it, the CFO").
 *
 * INTERIM SHAPE. Orders has no refund request record yet, so the approval is the authority to perform
 * the refund: the user who runs `Orders.RefundPayment` must be allowed to approve it.
 *   - At or below the `RefundApprovalThreshold` setting: a holder of the `RefundApproverRole` role, or
 *     the receiving company's `AccountingCompanyProfile.ApprovalCFOUserID`.
 *   - Above it: only that company approver.
 * The amount compared is what the payment's refunds come to WITH this one, so a large refund cannot
 * be split into several small ones that each pass. It is counted PER PAYMENT, not per order: an order
 * settled by several payments can be refunded one payment at a time by a role holder, each under the
 * threshold, for more than the threshold in all.
 *
 * A named approver who has been deactivated counts as no approver, as in ./AccessOverride.ts, so the
 * refusal says to set a new one rather than naming someone who cannot log in.
 *
 * The follow-up is a request-then-approve flow (a refund requested by one person and approved by
 * another, through a Tasks approval), which needs a durable refund-request record.
 *
 * OFF BY DEFAULT. With `RefundApprovalThreshold` empty nothing is checked, as before.
 * EXEMPT: a refund the payment gateway already made, booked by the system user's webhook handling
 * (`ProviderRefundBooking`): the money has moved, and refusing to book it would only hide it.
 *
 * CONNECTS TO:
 *   CALLER:   ./RefundPaymentOperation.ts (before Preview and before any write)
 *   SETTINGS: ./OrdersSettings.ts (RefundApprovalThreshold, RefundApproverRole)
 *   READS:    MJ_BizApps_Accounting: Accounting Company Profiles · MJ: Users · MJ: Roles · MJ: User Roles
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { OrdersSettings } from './OrdersSettings.js';
import { EscapeText, RequireUUID } from './sql-guards.js';

const COMPANY_PROFILE_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const USER_ENTITY = 'MJ: Users';
const ROLE_ENTITY = 'MJ: Roles';
const USER_ROLE_ENTITY = 'MJ: User Roles';

/** Everything the rule needs. */
export interface RefundAuthorityFacts {
    /** The `RefundApprovalThreshold` setting; null switches the check off. */
    Threshold: number | null;
    /** The `RefundApproverRole` setting. */
    ApproverRoleName: string | null;
    /** What the payment's refunds come to with this one. */
    RefundedTotalAfter: number;
    /** The payment being refunded, for the message. */
    PaymentNumber: string;
    /** A gateway refund booked by the system user. */
    IsProviderOriginated: boolean;
    /** The user issuing the refund. */
    CallerUserID: string;
    /** The receiving company's ApprovalCFOUserID, or null when it is unset or that user is inactive. */
    CompanyApproverUserID: string | null;
    /** Whether the caller holds the approver role. */
    CallerHoldsApproverRole: boolean;
}

/** Round to the cent, so float noise on either side of the comparison cannot move the boundary. */
const money = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Why the caller may not issue this refund, or null when they may.
 *
 * Defensive about its input, since it is exported: both amounts are rounded to the cent, a threshold
 * that is not a finite number of 0 or more is read as 0, and a total that is not a finite number is
 * treated as above any threshold. Every such case tightens the rule rather than opening it.
 *
 * @returns a sentence for the person refunding, or null.
 */
export function RefundAuthorityRefusal(facts: RefundAuthorityFacts): string | null {
    if (facts.Threshold == null || facts.IsProviderOriginated) return null;
    const isCompanyApprover = !!facts.CompanyApproverUserID && UUIDsEqual(facts.CompanyApproverUserID, facts.CallerUserID);
    if (isCompanyApprover) return null;

    const thresholdAmount = Number.isFinite(facts.Threshold) && facts.Threshold > 0 ? money(facts.Threshold) : 0;
    const totalAmount = Number.isFinite(facts.RefundedTotalAfter) ? money(facts.RefundedTotalAfter) : null;
    const total = totalAmount == null ? String(facts.RefundedTotalAfter) : totalAmount.toFixed(2);
    const threshold = thresholdAmount.toFixed(2);
    if (totalAmount == null || totalAmount > thresholdAmount) {
        return facts.CompanyApproverUserID
            ? `Refunds on payment ${facts.PaymentNumber} would come to ${total}, above the ${threshold} refund approval threshold, ` +
                  `so only the receiving company's approver (the Approval CFO on its Accounting Company Profile) may issue this refund.`
            : `Refunds on payment ${facts.PaymentNumber} would come to ${total}, above the ${threshold} refund approval threshold, ` +
                  `and the receiving company has no approver (the Approval CFO on its Accounting Company Profile), so nobody may issue it. ` +
                  `Set the company's Approval CFO first.`;
    }
    if (facts.ApproverRoleName && facts.CallerHoldsApproverRole) return null;
    return facts.ApproverRoleName
        ? `Issuing a refund needs the '${facts.ApproverRoleName}' role, or the receiving company's approver (the Approval CFO on its ` +
              `Accounting Company Profile), and you hold neither.`
        : `Issuing a refund needs the receiving company's approver (the Approval CFO on its Accounting Company Profile): no refund ` +
              `approver role is configured (Orders setting RefundApproverRole).`;
}

/** What {@link CheckRefundAuthority} needs about the refund. */
export interface RefundAuthorityRequest {
    PaymentNumber: string;
    ReceivingCompanyID: string;
    RefundedTotalAfter: number;
    ProviderRefundID?: string | null;
}

/**
 * Apply the rule to a refund the caller is about to issue: reads the settings and, only when the
 * check is on, the company approver and the caller's role.
 *
 * @returns the refusal, or null when the caller may refund.
 * @throws when a lookup fails, so a refund is never issued unchecked.
 */
export async function CheckRefundAuthority(
    request: RefundAuthorityRequest,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    await OrdersSettings.Load(provider, user);
    const threshold = OrdersSettings.RefundApprovalThreshold;
    if (threshold == null) return null;
    const approverRoleName = OrdersSettings.RefundApproverRole;
    const rv = RunView.FromMetadataProvider(provider);
    return RefundAuthorityRefusal({
        Threshold: threshold,
        ApproverRoleName: approverRoleName,
        RefundedTotalAfter: request.RefundedTotalAfter,
        PaymentNumber: request.PaymentNumber,
        IsProviderOriginated: isProviderOriginated(request, user),
        CallerUserID: user.ID,
        CompanyApproverUserID: await readCompanyApprover(rv, request.ReceivingCompanyID, user),
        CallerHoldsApproverRole: approverRoleName ? await holdsRole(rv, approverRoleName, user) : false,
    });
}

/** A gateway refund, booked by the system user that webhook handling runs as. */
function isProviderOriginated(request: RefundAuthorityRequest, user: UserInfo): boolean {
    if (!request.ProviderRefundID?.trim()) return false;
    const systemUser = UserCache.Instance.GetSystemUser();
    return !!systemUser && UUIDsEqual(systemUser.ID, user.ID);
}

async function readCompanyApprover(rv: RunView, companyID: string, user: UserInfo): Promise<string | null> {
    // IS-A: the accounting profile shares its company's ID.
    const res = await rv.RunView<{ ApprovalCFOUserID: string | null }>(
        {
            EntityName: COMPANY_PROFILE_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(companyID, 'ReceivingCompanyID')}'`,
            Fields: ['ApprovalCFOUserID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) throw new Error(`Could not read the receiving company's approver: ${res?.ErrorMessage ?? 'no result'}`);
    const named = res.Results?.[0]?.ApprovalCFOUserID ?? null;
    if (!named) return null;

    // A deactivated approver is no approver (the AccessOverride.ts / EntitlementBehavior contract).
    const active = await rv.RunView<{ ID: string }>(
        {
            EntityName: USER_ENTITY,
            ExtraFilter: `ID = '${RequireUUID(named, 'ApprovalCFOUserID')}' AND IsActive = 1`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!active?.Success) throw new Error(`Could not read the receiving company's approver: ${active?.ErrorMessage ?? 'no result'}`);
    return (active.Results?.length ?? 0) > 0 ? named : null;
}

async function holdsRole(rv: RunView, roleName: string, user: UserInfo): Promise<boolean> {
    const roles = await rv.RunView<{ ID: string }>(
        { EntityName: ROLE_ENTITY, ExtraFilter: `Name = '${EscapeText(roleName)}'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple', BypassCache: true },
        user,
    );
    if (!roles?.Success) throw new Error(`Could not read role '${roleName}': ${roles?.ErrorMessage ?? 'no result'}`);
    const role = roles.Results?.[0];
    if (!role) throw new Error(`The refund approver role '${roleName}' (Orders setting RefundApproverRole) does not exist.`);
    const held = await rv.RunView<{ ID: string }>(
        {
            EntityName: USER_ROLE_ENTITY,
            ExtraFilter: `UserID = '${RequireUUID(user.ID, 'UserID')}' AND RoleID = '${RequireUUID(role.ID, 'RoleID')}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!held?.Success) throw new Error(`Could not read your roles: ${held?.ErrorMessage ?? 'no result'}`);
    return (held.Results?.length ?? 0) > 0;
}

/**
 * PersonAccountLinkClaimDriver — makes the guest's Person row and their real account one identity.
 *
 * A guest checkout mints a Person from an email (`resolveOrEnsurePerson`) with no MJ user behind
 * it. When that buyer later creates an account and redeems the claim (or claim-on-login fires),
 * this driver stamps `Person.LinkedUserID` with the authenticated user's id — after which every
 * Person lookup can resolve DETERMINISTICALLY by user id instead of by email string match (which
 * is non-deterministic when two People share an email, the documented weakness of
 * `resolvePersonID`).
 *
 * TWO LINKAGES EXIST AND POINT OPPOSITE WAYS: `Person.LinkedUserID → MJ: Users` (bizapps-common
 * owns it) and `User.LinkedEntityID/LinkedEntityRecordID → anything` (MJ core owns it). THIS
 * DRIVER MAINTAINS ONLY THE FORMER, deliberately: it is the one the orders lookups read, and
 * writing `MJ: Users` rows from an app-level claim driver is a privilege the checkout principal
 * should not need.
 *
 * ENTITY ACCESS BY STRING NAME + Set(): this package cannot depend on
 * `@mj-biz-apps/common-entities` (see claimDriverHelpers.ts, the in-repo precedent) — the typed
 * `LinkedUserID` property lives there. The single untyped write below is the same seam, kept to
 * one field with the shape asserted first.
 */
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, LogError, LogStatus, RunView, UserInfo, IRunViewProvider, Metadata } from '@memberjunction/core';
import {
    BaseIdentityClaimDriver,
    type ClaimContext,
    type ClaimRedeemContext,
    type ClaimResult,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';

const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/**
 * Pluggable driver for PersonAccountLink identity claims (DriverClass registered in
 * metadata/identity-claim-types).
 */
@RegisterClass(BaseIdentityClaimDriver, 'PersonAccountLinkClaimDriver')
export class PersonAccountLinkClaimDriver extends BaseIdentityClaimDriver {
    public async OnCreate(_context: ClaimContext): Promise<void> {
        // Claim registered in pending state; nothing to prepare.
    }

    public async OnClaim(context: ClaimRedeemContext): Promise<ClaimResult> {
        const { Claim, User } = context;
        if (!User?.ID) {
            return { Success: false, ErrorMessage: 'PersonAccountLink requires an authenticated user.' };
        }

        const personID = this.resolveTargetPersonID(Claim.RecordID, Claim.PayloadJSON) ?? (await this.findPersonForUser(User));
        if (!personID) {
            return {
                Success: false,
                ErrorMessage: 'The claim names no Person record and none matches this account\'s email.',
            };
        }

        // `GetEntityObject` with a CompositeKey loads on creation — the house idiom (see
        // EntitlementEngine.RevokeGrantsForReturn). A missing row throws; caught and reported.
        const md = new Metadata();
        let person;
        try {
            person = await md.GetEntityObject(PERSON_ENTITY, CompositeKey.FromID(personID), User);
        } catch (loadErr) {
            const loadMsg = loadErr instanceof Error ? loadErr.message : String(loadErr);
            return { Success: false, ErrorMessage: `Person ${personID} could not be loaded: ${loadMsg}` };
        }

        const existing: unknown = person.Get('LinkedUserID');
        if (typeof existing === 'string' && existing.length > 0) {
            if (existing.toLowerCase() === User.ID.toLowerCase()) {
                // Idempotent replay — already linked to this very account.
                return { Success: true, Data: { PersonID: personID, LinkedUserID: existing, AlreadyLinked: true } };
            }
            // Linked to a DIFFERENT account: refusing beats silently re-pointing an identity —
            // that would let a claim redeem someone else's purchase history onto a new login.
            return {
                Success: false,
                ErrorMessage: 'This person record is already linked to a different account.',
            };
        }

        // The one untyped write (see header). LinkedUserID is a nullable uniqueidentifier FK to
        // MJ: Users on the common Person entity.
        person.Set('LinkedUserID', User.ID);
        const saved = await person.Save();
        if (!saved) {
            return {
                Success: false,
                ErrorMessage: `Failed to link person ${personID}: ${person.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            };
        }

        LogStatus(`[PersonAccountLinkClaimDriver] Linked person ${personID} to user ${User.ID} via claim ${Claim.ID}.`);
        return { Success: true, Data: { PersonID: personID, LinkedUserID: User.ID } };
    }

    public async OnRevoke(context: ClaimContext): Promise<void> {
        // Deliberately does NOT null LinkedUserID: revoking the CLAIM withdraws the invitation to
        // link, but an already-established identity link is a fact about the data, and severing it
        // is an admin decision, not a side effect. Log so the trail exists.
        LogStatus(`[PersonAccountLinkClaimDriver] Claim ${context.Claim.ID} revoked; any established link is left intact.`);
    }

    public async OnExpire(_context: ClaimContext): Promise<void> {
        // Same posture as OnRevoke: expiry withdraws the pending claim, never the established link.
    }

    /** The Person the claim itself names — RecordID first, then payload. */
    private resolveTargetPersonID(recordID: string | null | undefined, payloadJSON: string | null | undefined): string | null {
        if (recordID) return recordID;
        if (payloadJSON) {
            try {
                const payload = JSON.parse(payloadJSON) as Record<string, unknown>;
                if (typeof payload.PersonID === 'string') return payload.PersonID;
                if (typeof payload.personId === 'string') return payload.personId;
            } catch {
                // Malformed payload → fall through to the email path
            }
        }
        return null;
    }

    /**
     * Fallback when the claim names nothing: prefer a Person already linked to this user (fully
     * deterministic), then an email match with NO existing link — never an email match that is
     * linked elsewhere.
     */
    private async findPersonForUser(user: UserInfo): Promise<string | null> {
        const rv = new RunView(undefined as unknown as IRunViewProvider);
        const byLink = await rv.RunView<{ ID: string }>(
            {
                EntityName: PERSON_ENTITY,
                ExtraFilter: `LinkedUserID = '${EscapeSQLString(user.ID)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            user,
        );
        if (byLink?.Success && byLink.Results?.length) return byLink.Results[0].ID;

        const email = (user.Email ?? '').trim().toLowerCase();
        if (!email) return null;
        const byEmail = await rv.RunView<{ ID: string }>(
            {
                EntityName: PERSON_ENTITY,
                ExtraFilter: `Email = '${EscapeSQLString(email)}' AND LinkedUserID IS NULL`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            user,
        );
        if (byEmail?.Success && byEmail.Results?.length === 1) return byEmail.Results[0].ID;
        if (byEmail?.Success && (byEmail.Results?.length ?? 0) > 1) {
            LogError(`[PersonAccountLinkClaimDriver] ${byEmail.Results?.length} unlinked People share email ${email} — refusing a non-deterministic link.`);
        }
        return null;
    }
}

/**
 * Registration helper to ensure the class factory decorator executes.
 */
export function LoadPersonAccountLinkClaimDriver(): void {
    // Explicit trigger for bundler tree-shaking preservation
}

/**
 * SubscriptionType server subclass — refuses a `RecognitionCadence` change on a type with booked terms (#809).
 *
 * `OrderEntityServer.inheritReversalCadence` reads the origin subscription's `SubscriptionType.RecognitionCadence`
 * live when a return or cancellation unwinds a booked subscription term. Changing `RecognitionCadence` on a
 * subscription type that already has booked terms causes subsequent returns or cancellations of those terms
 * to slice their reversal entries on the new cadence rather than the cadence the sale used.
 *
 * CONNECTS TO:
 *   READER: ./OrderEntityServer.ts (inheritReversalCadence)
 *   BASE:   @mj-biz-apps/orders-entities mjBizAppsOrdersSubscriptionTypeEntity
 */
import {
    BaseEntity,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    type IRunViewProvider,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersSubscriptionTypeEntity } from '@mj-biz-apps/orders-entities';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

export const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';
export const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
export const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

@RegisterClass(BaseEntity, SUBSCRIPTION_TYPE_ENTITY)
export class SubscriptionTypeEntityServer extends mjBizAppsOrdersSubscriptionTypeEntity {
    /** BaseEntity skips ValidateAsync by default; without this the check never runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!this.IsSaved || !this.ID) return result;

        const cadenceField = this.GetFieldByName('RecognitionCadence');
        if (!cadenceField?.Dirty) return result;

        const hasBookedTerms = await this.hasBookedSubscriptionTerms();
        if (hasBookedTerms) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'RecognitionCadence',
                    'RecognitionCadence cannot be changed on a subscription type that already has booked subscription terms, because returns and cancellations unwind booked terms using the type\u2019s cadence.',
                    this.RecognitionCadence,
                    ValidationErrorType.Failure,
                ),
            );
            result.Success = false;
        }
        return result;
    }

    private async hasBookedSubscriptionTerms(): Promise<boolean> {
        const typeID = RequireUUID(this.ID, 'ID');
        const rv = new RunView((this.ProviderToUse as unknown as IRunViewProvider | null) ?? undefined);
        const subs = await rv.RunView<{ ID: string }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `SubscriptionTypeID = '${typeID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        if (!subs.Success) {
            throw new Error(
                `Could not check subscriptions for subscription type ${typeID}: ${subs.ErrorMessage || 'unknown error'}`,
            );
        }
        const subIDs = RequireUUIDs(
            (subs.Results ?? []).map((s) => s.ID),
            'SubscriptionID',
        );
        if (subIDs.length === 0) return false;

        const inList = subIDs.map((id) => `'${id}'`).join(', ');
        const terms = await rv.RunView<{ ID: string }>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `SubscriptionID IN (${inList})`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        if (!terms.Success) {
            throw new Error(
                `Could not check subscription terms for subscription type ${typeID}: ${terms.ErrorMessage || 'unknown error'}`,
            );
        }
        return (terms.Results ?? []).length > 0;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSubscriptionTypeEntityServer(): void {
    // intentionally empty
}

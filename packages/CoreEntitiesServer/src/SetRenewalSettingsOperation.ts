/**
 * @fileoverview `Orders.SetRenewalSettings` — set auto-renew and the annual increase on chosen subscriptions.
 *
 * WHY AN OPERATION, FOR A TWO-COLUMN WRITE. The Renewals page lets a person tick subscriptions and
 * flip auto-renew or give them a rate in one go. A browser saving each entity in turn would work,
 * but every save is a round trip, a refused one lands mid-list with no account of the rest, and an
 * API caller fixing a book of rates would have to reinvent the loop. Here the loop runs once, on
 * the server, and comes back with one line per subscription saying what happened.
 *
 * IT WRITES SUBSCRIPTIONS AND NOTHING ELSE. Through the entity, so the server subclass's rules
 * apply: a subscription a payment gateway bills refuses an auto-renew change (the gateway owns that
 * switch), and that refusal comes back on the row rather than failing the batch. No order is
 * touched: a renewal order already placed keeps its price, and the next one each subscription
 * places follows the new settings.
 *
 * A FIELD LEFT OUT IS LEFT ALONE. `IncreasePercent: null` clears the rate so the subscription
 * inherits; `0` is a negotiated "no increase" that overrides product, category and company. The
 * three are different answers and the input keeps them apart.
 *
 * CONNECTS TO:
 *   CALLERS: the Renewals page (`renewals.page.ts`) · API callers
 *   WRITES:  MJ_BizApps_Orders: Subscriptions, through SubscriptionEntityServer
 */
import { BaseRemotableOperation, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersSetRenewalSettingsOperation as OrdersSetRenewalSettingsOperationBase,
    type OrdersSetRenewalSettingsInput,
    type OrdersSetRenewalSettingsOutput,
    type RenewalSettingsChange,
    type RenewalSettingsState,
    type SubscriptionEntity,
} from '@mj-biz-apps/orders-entities';
import { RequireUUID } from './sql-guards.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
/** The column is decimal(9,4): four decimals, and a percentage, so 0 to 100. */
const MAX_DECIMALS = 4;

/** Refuses a rate the column cannot hold or a percentage that makes no sense. Returns the rate as a number, or null. */
export function RequireIncreasePercent(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) throw new Error(`IncreasePercent must be a number of percent (5 for five percent), or null to clear; got '${String(value)}'.`);
    if (n < 0 || n > 100) throw new Error(`IncreasePercent must be between 0 and 100; got ${n}.`);
    // Compared after rounding back, not on the scaled product: 12.3456 * 10000 is 123455.99999999999 in floating point.
    if (Math.round(n * 10 ** MAX_DECIMALS) / 10 ** MAX_DECIMALS !== n) throw new Error(`IncreasePercent takes at most ${MAX_DECIMALS} decimals; got ${n}.`);
    return n;
}

/** What the call asks to change: each field present or absent. */
interface Wanted {
    AutoRenew?: boolean;
    IncreasePercent?: number | null;
}

@RegisterClass(BaseRemotableOperation, 'Orders.SetRenewalSettings')
export class SetRenewalSettingsOperation extends OrdersSetRenewalSettingsOperationBase {
    protected async InternalExecute(
        input: OrdersSetRenewalSettingsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersSetRenewalSettingsOutput> {
        let ids: string[];
        const wanted: Wanted = {};
        try {
            if (!Array.isArray(input?.SubscriptionIDs) || !input.SubscriptionIDs.length) throw new Error('SubscriptionIDs must name at least one subscription.');
            ids = [...new Set(input.SubscriptionIDs.map((id) => RequireUUID(id, 'SubscriptionID').toLowerCase()))];
            if (input.AutoRenew !== undefined) {
                if (typeof input.AutoRenew !== 'boolean') throw new Error(`AutoRenew must be true or false; got '${String(input.AutoRenew)}'.`);
                wanted.AutoRenew = input.AutoRenew;
            }
            if (input.IncreasePercent !== undefined) wanted.IncreasePercent = RequireIncreasePercent(input.IncreasePercent);
            if (wanted.AutoRenew === undefined && wanted.IncreasePercent === undefined) throw new Error('Nothing to set: give AutoRenew, IncreasePercent, or both.');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: message, Updated: 0, Unchanged: 0, Failed: 0, Changes: [] };
        }

        const changes: RenewalSettingsChange[] = [];
        for (const id of ids) {
            changes.push(await this.setOne(provider, user, id, wanted));
        }
        const updated = changes.filter((c) => c.Changed).length;
        const failed = changes.filter((c) => c.Error).length;
        const unchanged = changes.length - updated - failed;
        const what: string[] = [];
        if (wanted.AutoRenew !== undefined) what.push(`auto-renew ${wanted.AutoRenew ? 'on' : 'off'}`);
        if (wanted.IncreasePercent !== undefined) what.push(`renewal increase ${wanted.IncreasePercent == null ? 'cleared (inherits)' : `${wanted.IncreasePercent}%`}`);
        const head = what.join(', ');
        const message =
            `${head.charAt(0).toUpperCase()}${head.slice(1)}: ${updated} subscription${updated === 1 ? '' : 's'} updated` +
            `${unchanged ? `, ${unchanged} already there` : ''}${failed ? `, ${failed} failed` : ''}.`;
        // Success is "the call did its job", so one refused row does not fail the batch; every row
        // failing does, because then nothing a person asked for happened.
        return { Success: failed < changes.length, Message: message, Updated: updated, Unchanged: unchanged, Failed: failed, Changes: changes };
    }

    private async setOne(provider: IMetadataProvider, user: UserInfo, id: string, wanted: Wanted): Promise<RenewalSettingsChange> {
        const nothing: RenewalSettingsState = { AutoRenew: null, IncreasePercent: null };
        try {
            const sub = await provider.GetEntityObject<SubscriptionEntity>(SUBSCRIPTION_ENTITY, user);
            if (!(await sub.Load(id))) {
                return { SubscriptionID: id, SubscriptionNumber: null, Previous: nothing, Current: nothing, Changed: false, Error: 'no such subscription' };
            }
            const previous: RenewalSettingsState = {
                AutoRenew: !!sub.AutoRenew,
                IncreasePercent: sub.RenewalIncreasePercent == null ? null : Number(sub.RenewalIncreasePercent),
            };
            const target: RenewalSettingsState = {
                AutoRenew: wanted.AutoRenew === undefined ? previous.AutoRenew : wanted.AutoRenew,
                IncreasePercent: wanted.IncreasePercent === undefined ? previous.IncreasePercent : wanted.IncreasePercent,
            };
            if (target.AutoRenew === previous.AutoRenew && target.IncreasePercent === previous.IncreasePercent) {
                return { SubscriptionID: id, SubscriptionNumber: sub.SubscriptionNumber, Previous: previous, Current: previous, Changed: false };
            }
            if (wanted.AutoRenew !== undefined) sub.AutoRenew = wanted.AutoRenew;
            if (wanted.IncreasePercent !== undefined) sub.RenewalIncreasePercent = wanted.IncreasePercent;
            if (!(await sub.Save())) {
                const reason = sub.LatestResult?.CompleteMessage ?? 'the save was refused';
                return { SubscriptionID: id, SubscriptionNumber: sub.SubscriptionNumber, Previous: previous, Current: previous, Changed: false, Error: reason };
            }
            return { SubscriptionID: id, SubscriptionNumber: sub.SubscriptionNumber, Previous: previous, Current: target, Changed: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`Orders.SetRenewalSettings: subscription ${id} could not be updated: ${message}`);
            return { SubscriptionID: id, SubscriptionNumber: null, Previous: nothing, Current: nothing, Changed: false, Error: message };
        }
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSetRenewalSettingsOperation(): void {
    // intentionally empty
}

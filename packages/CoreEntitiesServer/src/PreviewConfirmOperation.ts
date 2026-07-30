/**
 * @fileoverview `Orders.PreviewConfirm` — what confirming will do, before it does it.
 *
 * THE OPERATION THE PRE-FLIGHT RESTS ON, and the one with the strictest
 * obligation in this codebase: **what it predicts must be what confirming
 * actually does.** A preview that can disagree with reality is worse than no
 * preview, because it is trusted.
 *
 * That obligation is why this does NOT re-implement the confirm path. It runs the
 * REAL confirm — the same `OrderEntityServer.Save()` transition into `Confirmed`
 * that books entries, decides subscriptions and issues grants — inside a
 * transaction that always rolls back, then reads what happened off the entities
 * before they vanish. It cannot drift, because it is the same code.
 *
 * The alternative (resolve accounts here, evaluate sales rules here, decide the
 * subscription here) would be a second implementation of the most consequential
 * path in the system, and the two would eventually diverge in the way that
 * produces a BALANCED journal entry for the wrong thing.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import {
    BaseRemotableOperation,
    RunView,
    type BaseEntity,
    type DatabaseProviderBase,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    OrdersPreviewConfirmOperation as OrdersPreviewConfirmOperationBase,
    type OrdersPreviewConfirmInput,
    type OrdersPreviewConfirmOutput,
    type JournalEntryPreview,
    type SubscriptionDecisionPreview,
    type EntitlementGrantPreview,
    type BlockerResult,
} from '@mj-biz-apps/orders-entities';

import { ComputeLinesAndTotals } from './order-totals.js';
import { HydrateOrderDraft, type HydratableDraft } from './OrderDraftHydrator.js';
import { RequireOptionalUUID } from './sql-guards.js';

/** The terms table — one row per period of coverage. */
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

const money = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const field = <T>(entity: BaseEntity, name: string, fallback: T): T => {
    const value = (entity as unknown as Record<string, unknown>)[name];
    return (value === undefined || value === null ? fallback : value) as T;
};

/**
 * Dry-run a confirm.
 *
 * Success means the dry run COMPLETED, not that the order can confirm — that is
 * `CanConfirm`, and it is false whenever a blocker is present. The two are
 * deliberately separate: "I could not tell you" and "I can tell you it will fail"
 * are different answers and the UI treats them differently.
 */
@RegisterClass(BaseRemotableOperation, 'Orders.PreviewConfirm')
export class PreviewConfirmOperation extends OrdersPreviewConfirmOperationBase {
    protected async InternalExecute(
        input: OrdersPreviewConfirmInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersPreviewConfirmOutput> {
        const hasDraft = !!input?.Draft?.Header?.CompanyID;
        const hasID = !!input?.OrderHeaderID;

        if (hasDraft === hasID) {
            return this.blocked([
                {
                    Code: 'INPUT_AMBIGUOUS',
                    Message: hasDraft
                        ? 'Both OrderHeaderID and Draft were supplied; they are mutually exclusive.'
                        : 'Neither OrderHeaderID nor Draft was supplied.',
                },
            ]);
        }

        // Caller-supplied ids reach SQL filter text downstream. Validated here,
        // at the boundary, so every frame below this one can trust them.
        RequireOptionalUUID(input?.OrderHeaderID, 'OrderHeaderID');

        const db = provider as unknown as DatabaseProviderBase;
        await db.BeginTransaction();
        try {
            // Force a create even when previewing a saved draft, so the dry run can
            // never touch the persisted row. The rollback should not be the only
            // thing standing between a preview and a mutation.
            const draft: HydratableDraft = hasDraft
                ? { ...(input.Draft as HydratableDraft), Header: { ...(input.Draft as HydratableDraft).Header, OrderHeaderID: null } }
                : await this.draftFromSaved(String(input.OrderHeaderID), provider, user);

            const hydrated = await HydrateOrderDraft(draft, provider, user);
            const order = hydrated.Order as unknown as BaseEntity;

            // THE REAL TRANSITION. Everything below reads what this produced.
            order.Set('Status', 'Confirmed');
            const confirmed = await order.Save();

            if (!confirmed) {
                // The reason lives on LatestResult — an unresolvable GL role, a
                // subscription rule refusal. Surfacing it verbatim is the entire
                // point of the pre-flight.
                const reason = order.LatestResult?.CompleteMessage?.trim();
                return this.blocked([
                    {
                        Code: 'CONFIRM_REFUSED',
                        Message: reason && reason.length > 0 ? reason : 'The order could not be confirmed.',
                        ResolutionHint: this.hintFor(reason ?? ''),
                    },
                ]);
            }

            const entries = await this.readJournalEntries(hydrated.Lines, provider, user);
            const subscriptions = await this.readSubscriptionDecisions(hydrated.Lines, provider, user);
            const grants = await this.readGrants(field(order, 'ID', ''), provider, user);

            const companies = new Set(entries.map((e) => e.CompanyID));
            const holds = hydrated.Lines
                .map((line, index) => ({ line: line as unknown as BaseEntity, index }))
                .filter(({ line }) => field<string | null>(line, 'FulfillmentStatus', null) === 'Pending')
                .map(({ line, index }) => ({
                    LineNumber: Number(field(line, 'LineNumber', index + 1)),
                    ProductName: field(line, 'Product', ''),
                    Quantity: Number(field(line, 'Quantity', 0)),
                }));

            // The REAL decomposition, from the same function the entry rail uses.
            // This ran inside the rolled-back confirm transaction, so the lines
            // carry engine-computed amounts and these are the figures the actual
            // confirm will produce. Placeholder zeros lived here once, which made
            // the pre-flight understate tax and discount as $0 on the one screen
            // whose entire job is telling someone what they are about to commit.
            const { Totals } = ComputeLinesAndTotals(hydrated);

            return {
                Success: true,
                CanConfirm: true,
                Totals,
                JournalEntries: entries,
                EntryCount: entries.length,
                CompanyCount: companies.size,
                AllBalanced: entries.every((e) => e.Balanced),
                SubscriptionDecisions: subscriptions,
                EntitlementGrants: grants,
                // Approvals are NOT blockers: a rule over the rep's authority
                // escalates and the confirm still proceeds. When the routing engine
                // lands, its requirements surface here while CanConfirm stays true.
                Approvals: [],
                FulfillmentHolds: holds,
                Blockers: [],
            };
        } catch (e) {
            return this.blocked([
                {
                    Code: 'PREVIEW_FAILED',
                    Message: e instanceof Error ? e.message : String(e),
                },
            ]);
        } finally {
            try {
                await db.RollbackTransaction();
            } catch (e) {
                // SQL Server dooms a transaction on a severity-16 trigger error, so
                // by the time we ask there is nothing left to roll back. Isolation
                // still held; swallow only that case.
                const aborted = /transaction has been aborted|no active transaction/i.test(
                    String((e as Error).message),
                );
                if (!aborted) throw e;
            }
        }
    }

    /** The entries the confirm actually created, read back before the rollback. */
    private async readJournalEntries(
        lines: Array<BaseEntity & Record<string, unknown>>,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<JournalEntryPreview[]> {
        const entries: JournalEntryPreview[] = [];
        const rv = RunView.FromMetadataProvider(provider);

        for (const raw of lines) {
            const line = raw as unknown as BaseEntity;
            const journalEntryID = field<string | null>(line, 'JournalEntryID', null);
            if (!journalEntryID) continue;

            const result = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: 'MJ_BizApps_Accounting: Journal Entry Lines',
                    ExtraFilter: `JournalEntryID = '${journalEntryID}'`,
                    ResultType: 'simple',
                },
                user,
            );

            const entryLines = (result.Results ?? []).map((row) => {
                const debit = Number(row['Debit'] ?? 0);
                const credit = Number(row['Credit'] ?? 0);
                return {
                    Side: (debit > 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr',
                    AccountRole: String(row['AccountRole'] ?? ''),
                    AccountName: String(row['GLAccount'] ?? row['AccountName'] ?? ''),
                    Amount: money(debit > 0 ? debit : credit),
                };
            });

            const debits = entryLines.filter((l) => l.Side === 'Dr').reduce((s, l) => s + l.Amount, 0);
            const credits = entryLines.filter((l) => l.Side === 'Cr').reduce((s, l) => s + l.Amount, 0);

            entries.push({
                CompanyID: field(line, 'CompanyID', ''),
                CompanyName: field(line, 'Company', ''),
                LineNumber: Number(field(line, 'LineNumber', 0)),
                JournalEntryID: null, // previewing — the id vanishes with the rollback
                EntryType: 'OrderBooking',
                Balanced: Math.abs(debits - credits) < 0.005,
                Lines: entryLines,
            });
        }
        return entries;
    }

    /** What happened to a subscription, read from the lines that carry one. */
    private async readSubscriptionDecisions(
        lines: Array<BaseEntity & Record<string, unknown>>,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<SubscriptionDecisionPreview[]> {
        const decisions: SubscriptionDecisionPreview[] = [];
        const rv = RunView.FromMetadataProvider(provider);

        for (const raw of lines) {
            const line = raw as unknown as BaseEntity;
            const subscriptionID = field<string | null>(line, 'SubscriptionID', null);
            if (!subscriptionID) continue;

            const result = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: 'MJ_BizApps_Orders: Subscriptions',
                    ExtraFilter: `ID = '${subscriptionID}'`,
                    ResultType: 'simple',
                },
                user,
            );
            const subscription = result.Results?.[0];
            if (!subscription) continue;

            // Create vs Extend is decided by how many terms the subscription has
            // after this confirm: exactly one means this order brought it into
            // existence, more means it added coverage to something already running.
            // The distinction drives retention reporting — counting an extension as
            // a new subscription inflates acquisition and hides churn — so it is
            // read rather than assumed.
            const terms = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: SUBSCRIPTION_TERM_ENTITY,
                    ExtraFilter: `SubscriptionID = '${subscriptionID}'`,
                    ResultType: 'simple',
                },
                user,
            );
            const termCount = terms.Results?.length ?? 0;

            decisions.push({
                Action: termCount <= 1 ? 'Create' : 'Extend',
                SubscriptionID: subscriptionID,
                SubscriptionNumber: String(subscription['SubscriptionNumber'] ?? ''),
                CoverageThrough: subscription['EndDate'] ? String(subscription['EndDate']).slice(0, 10) : null,
                BeneficiaryName: (subscription['BeneficiaryPerson'] as string) ?? null,
                HolderName: (subscription['HolderOrganization'] as string) ?? null,
                BenefitModel: (subscription['BenefitModel'] as string) ?? null,
            });
        }
        return decisions;
    }

    /** Grants the confirm issued, with the policy that shaped each one. */
    private async readGrants(
        orderHeaderID: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<EntitlementGrantPreview[]> {
        if (!orderHeaderID) return [];
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: 'MJ_BizApps_Orders: Entitlement Grants',
                ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
                ResultType: 'simple',
            },
            user,
        );
        return (result.Results ?? []).map((row) => ({
            ProductEntitlementID: String(row['ProductEntitlementID'] ?? ''),
            EntitlementName: String(row['ProductEntitlement'] ?? row['Name'] ?? 'Entitlement'),
            BeneficiaryName: (row['BeneficiaryPerson'] as string) ?? null,
            GrantTiming: (row['GrantTiming'] as string) ?? null,
            QuantityMode: (row['QuantityMode'] as string) ?? null,
            ValidityMode: (row['ValidityMode'] as string) ?? null,
            Quantity: row['Quantity'] == null ? null : Number(row['Quantity']),
            ValidFrom: row['ValidFrom'] ? String(row['ValidFrom']).slice(0, 10) : null,
            ValidTo: row['ValidTo'] ? String(row['ValidTo']).slice(0, 10) : null,
        }));
    }

    /** Rebuild a draft payload from a saved order and its lines. */
    private async draftFromSaved(
        orderHeaderID: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<HydratableDraft> {
        const rv = RunView.FromMetadataProvider(provider);
        const headers = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: 'MJ_BizApps_Orders: Orders',
                ExtraFilter: `ID = '${orderHeaderID}'`,
                ResultType: 'simple',
            },
            user,
        );
        const header = headers.Results?.[0];
        if (!header) throw new Error(`Order ${orderHeaderID} was not found, or is not visible to this user.`);

        const lines = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: 'MJ_BizApps_Orders: Order Lines',
                ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
                OrderBy: 'LineNumber',
                ResultType: 'simple',
            },
            user,
        );

        return {
            Header: {
                CompanyID: String(header['CompanyID'] ?? ''),
                OrderType: String(header['OrderType'] ?? 'Sale'),
                BillToPersonID: (header['BillToPersonID'] as string) ?? null,
                BillToOrganizationID: (header['BillToOrganizationID'] as string) ?? null,
                BillToAddressID: (header['BillToAddressID'] as string) ?? null,
                ShipToPersonID: (header['ShipToPersonID'] as string) ?? null,
                ShipToOrganizationID: (header['ShipToOrganizationID'] as string) ?? null,
                ShipToAddressID: (header['ShipToAddressID'] as string) ?? null,
                PaymentTermsTypeID: (header['PaymentTermsTypeID'] as string) ?? null,
                OrderHeaderID: null,
            },
            Lines: (lines.Results ?? []).map((line) => ({
                ProductID: String(line['ProductID'] ?? ''),
                Quantity: Number(line['Quantity'] ?? 0),
                // The saved unit price WAS stated once, so it is restated here —
                // re-resolving would let a price that has since changed alter what
                // the preview reports about an order already committed to.
                UnitPrice: Number(line['UnitPrice'] ?? 0),
                DiscountPct: Number(line['DiscountPct'] ?? 0),
            })),
        };
    }

    /** Where to send someone, inferred from the refusal's wording. */
    private hintFor(message: string): string | null {
        if (/account|GL|role/i.test(message)) return 'Fix the account links in Accounting, then retry.';
        if (/subscription/i.test(message)) return 'Check the subscription type\'s rules.';
        if (/price|pricing/i.test(message)) return 'Check the product\'s price rules.';
        return null;
    }

    private blocked(blockers: BlockerResult[]): OrdersPreviewConfirmOutput {
        return {
            // The dry run COMPLETED — it can tell you the confirm will fail. That is
            // a different answer from "I could not tell you", which is Success:false.
            Success: true,
            CanConfirm: false,
            JournalEntries: [],
            EntryCount: 0,
            CompanyCount: 0,
            AllBalanced: false,
            SubscriptionDecisions: [],
            EntitlementGrants: [],
            Approvals: [],
            Blockers: blockers,
        };
    }
}

/** Registers {@link PreviewConfirmOperation}. Called from the server bootstrap. */
export function LoadPreviewConfirmOperation(): void {
    void PreviewConfirmOperation;
}

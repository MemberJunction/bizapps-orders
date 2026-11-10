/**
 * @fileoverview The negotiated annual increase, read from the contract behind an order.
 *
 * WHERE THE RATE LIVES. Orders prices a renewal from `Subscription.RenewalIncreasePercent`, then the
 * product, its category and the company's policy. The rate a customer actually negotiated is written
 * on their CONTRACT (`Contract.AnnualIncreasePercent`, the contracts app), and a contract names an
 * organization, never a subscription or a product. The link runs through Sales: the deal that
 * produced an order carries both the order and the contract that papered it. So:
 *
 *     subscription → its birth order line → the order → the deal(s) on that order → the contract.
 *
 * WHEN IT IS COPIED. Once, when a subscription is created (`SubscriptionEntityServer.Save`), and
 * only when nobody set a rate on it. The subscription's own column stays the one the pricer reads,
 * so a person can see and change the rate on the subscription and the Renewals page, and the
 * pricer never depends on another app at renewal time.
 *
 * OPTIONAL BY CONSTRUCTION. Orders has no dependency on Sales or Contracts. Both entities are looked
 * up by name in metadata; on a host without them this returns null and the subscription is created
 * exactly as before. A failed lookup is logged and swallowed for the same reason: a contract that
 * could not be read must never stop an order from confirming.
 *
 * CONNECTS TO:
 *   CALLERS: ./SubscriptionEntityServer.ts (on create)
 *   READS:   MJ_BizApps_Orders: Order Lines · MJ_BizApps_Sales: Deals · MJ_BizApps_Contracts: Contracts
 */
import { LogError, LogStatus, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { RequireUUID } from './sql-guards.js';

export const DEALS_ENTITY = 'MJ_BizApps_Sales: Deals';
export const CONTRACTS_ENTITY = 'MJ_BizApps_Contracts: Contracts';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/** What the contract said, and which contract. */
export interface ContractIncrease {
    /** `Contract.AnnualIncreasePercent`, as written: 5 means five percent. */
    Percent: number;
    ContractID: string;
    ContractNumber: string | null;
}

interface DealRow {
    ContractID: string | null;
}

interface ContractRow {
    ID: string;
    ContractNumber: string | null;
    AnnualIncreasePercent: number | string | null;
    TerminatedDate: Date | string | null;
    SupersededByContractID: string | null;
}

/** True when both sibling apps are installed on this host. */
export function ContractsReadable(provider: IMetadataProvider): boolean {
    return !!provider.EntityByName(DEALS_ENTITY) && !!provider.EntityByName(CONTRACTS_ENTITY);
}

/**
 * The increase the contract behind an order carries, or null: no Sales or Contracts app here, no
 * deal on the order, no contract on the deal, a contract with no rate, or two live contracts that
 * disagree (reported, not guessed).
 */
export async function ContractIncreaseForOrder(provider: IMetadataProvider, user: UserInfo, orderHeaderID: string): Promise<ContractIncrease | null> {
    if (!ContractsReadable(provider)) return null;
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const rv = new RunView(provider as unknown as IRunViewProvider);

    const deals = await rv.RunView<DealRow>(
        { EntityName: DEALS_ENTITY, ExtraFilter: `OrderID='${orderID}' AND ContractID IS NOT NULL`, Fields: ['ContractID'], ResultType: 'simple' },
        user,
    );
    if (!deals.Success) throw new Error(deals.ErrorMessage || `Could not read the deals on order ${orderID}.`);
    const contractIDs = [...new Set(deals.Results.map((d) => d.ContractID).filter((id): id is string => !!id))];
    if (!contractIDs.length) return null;

    const contracts = await rv.RunView<ContractRow>(
        {
            EntityName: CONTRACTS_ENTITY,
            ExtraFilter: `ID IN (${contractIDs.map((id) => `'${RequireUUID(id, 'ContractID')}'`).join(',')})`,
            Fields: ['ID', 'ContractNumber', 'AnnualIncreasePercent', 'TerminatedDate', 'SupersededByContractID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!contracts.Success) throw new Error(contracts.ErrorMessage || `Could not read the contracts behind order ${orderID}.`);

    // Prefer the contracts still in force; fall back to whatever the deals named.
    const live = contracts.Results.filter((c) => c.TerminatedDate == null && c.SupersededByContractID == null);
    const candidates = (live.length ? live : contracts.Results).filter((c) => c.AnnualIncreasePercent != null && Number.isFinite(Number(c.AnnualIncreasePercent)));
    if (!candidates.length) return null;

    const rates = new Set(candidates.map((c) => Number(c.AnnualIncreasePercent)));
    if (rates.size > 1) {
        LogStatus(
            `ContractIncrease: order ${orderID} is papered by ${candidates.length} contracts with different increases ` +
                `(${candidates.map((c) => `${c.ContractNumber ?? c.ID}: ${Number(c.AnnualIncreasePercent)}%`).join(', ')}); none copied.`,
        );
        return null;
    }
    const chosen = candidates[0];
    return { Percent: Number(chosen.AnnualIncreasePercent), ContractID: chosen.ID, ContractNumber: chosen.ContractNumber ?? null };
}

/** The same, starting from the order line a subscription was born on. */
export async function ContractIncreaseForOrderLine(provider: IMetadataProvider, user: UserInfo, orderLineID: string): Promise<ContractIncrease | null> {
    if (!ContractsReadable(provider)) return null;
    const lineID = RequireUUID(orderLineID, 'OrderLineID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const lines = await rv.RunView<{ OrderHeaderID: string }>(
        { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `ID='${lineID}'`, Fields: ['OrderHeaderID'], ResultType: 'simple' },
        user,
    );
    const orderID = lines.Success ? lines.Results[0]?.OrderHeaderID : null;
    if (!orderID) return null;
    return ContractIncreaseForOrder(provider, user, orderID);
}

/** The slice of a subscription the create hook reads and writes. */
export interface IncreaseOnCreateSubject {
    IsSaved: boolean;
    OrderLineID: string | null;
    SubscriptionNumber: string | null;
    RenewalIncreasePercent: number | null;
}

/**
 * On a subscription's FIRST save, with no rate of its own and a birth line, copy the contract's
 * increase onto it. Returns what was copied, or null when nothing was (already saved, a rate already
 * set, no line, no contract, or the lookup failed, which is logged and never thrown: a contract
 * that could not be read must not stop the order confirming).
 */
export async function ApplyContractIncreaseOnCreate(
    subject: IncreaseOnCreateSubject,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ContractIncrease | null> {
    if (subject.IsSaved || subject.RenewalIncreasePercent != null || !subject.OrderLineID) return null;
    try {
        const found = await ContractIncreaseForOrderLine(provider, user, subject.OrderLineID);
        if (!found) return null;
        subject.RenewalIncreasePercent = found.Percent;
        LogStatus(
            `ContractIncrease: subscription ${subject.SubscriptionNumber ?? '(new)'} takes ${found.Percent}% from contract ${found.ContractNumber ?? found.ContractID}.`,
        );
        return found;
    } catch (err) {
        LogError(
            `ContractIncrease: the contract behind subscription ${subject.SubscriptionNumber ?? '(new)'} could not be read; ` +
                `created without a rate: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}

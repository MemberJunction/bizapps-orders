import { IRemoteOperationProvider, LogError } from '@memberjunction/core';

/**
 * Thin typed client for `Orders.GetOverdueWorklist` (§13.1 Overdue worklist + the Orders rail badge).
 *
 * The overdue RULE lives on the server (time-derived off DueDate/Balance via the pure `isOverdue`
 * predicate — never a stored flag). This client exists so the rail badge and the worklist page ask
 * the same question of the same owner instead of each hand-writing a filter that can drift.
 *
 * Types are declared structurally rather than imported: the op's interfaces live in
 * `@mj-biz-apps/orders-core-entities-server`, a SERVER package the browser must not pull in. (Their
 * accounting counterparts live in the browser-safe engine-base package, which is why the JE client
 * can import its contract and this one cannot — worth fixing upstream, not here.)
 */

/** Mirrors OverdueWorklistOperation's `OverdueOrder` (CoreEntitiesServer/OverdueWorklistOperation.ts). */
export interface OverdueOrderRow {
  OrderID: string;
  OrderNumber: string;
  CustomerOrganizationID: string | null;
  Balance: number;
  DueDate: string | null;
  DaysOverdue: number;
}

interface OverdueWorklistOutput {
  Success: boolean;
  AsOf: string;
  Orders: OverdueOrderRow[];
  Errors?: string[];
}

export class OverdueWorklistClient {
  /**
   * The overdue worklist as of now (or `asOf`).
   *
   * Returns [] rather than throwing when the op reports a logical failure: this feeds a rail badge
   * on every category open, and a transient query failure must not take the whole category down.
   * The worklist PAGE surfaces errors properly; the badge degrades to "no badge".
   */
  public async Get(provider: IRemoteOperationProvider, asOf?: Date): Promise<OverdueOrderRow[]> {
    try {
      const res = await provider.RouteOperation<{ AsOf?: string }, OverdueWorklistOutput>(
        'Orders.GetOverdueWorklist',
        asOf ? { AsOf: asOf.toISOString() } : {},
      );
      if (!res.Success || !res.Output?.Success) {
        LogError(`OverdueWorklistClient: ${res.ErrorMessage ?? res.Output?.Errors?.join('; ') ?? 'failed'}`);
        return [];
      }
      return res.Output.Orders;
    } catch (e) {
      LogError(`OverdueWorklistClient: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }
}

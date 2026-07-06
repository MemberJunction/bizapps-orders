/**
 * @mj-biz-apps/orders-actions — the app's ACTIONS package (OPTIONAL — delete the
 * package + its manifest entry if your app exposes no Actions).
 *
 * Actions are metadata-driven integration points for agents / workflows /
 * low-code — NOT for code-to-code calls (import classes directly for that).
 *
 * WHAT LIVES HERE
 *   src/generated/  — CodeGen ActionSubclasses output (do not hand-edit)
 *   src/            — your hand-written BaseAction subclasses
 *
 * EXAMPLE — a hand-written action (uncomment once @memberjunction/* deps are
 * present in your workspace, register the action row via metadata + a
 * migration, then run codegen):
 *
 *   import { RegisterClass } from '@memberjunction/global';
 *   import { BaseAction } from '@memberjunction/actions';
 *   import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
 *
 *   @RegisterClass(BaseAction, 'Sample App: Do Something')
 *   export class DoSomethingAction extends BaseAction {
 *       protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
 *           return { Success: true, ResultCode: 'SUCCESS' };
 *       }
 *   }
 *
 * The Load function below is imported by the server bootstrap so bundlers
 * cannot tree-shake the @RegisterClass side effects away.
 */
export function LoadBizAppsOrdersActions(): void {
    // No-op: importing this module registers the action classes above.
}

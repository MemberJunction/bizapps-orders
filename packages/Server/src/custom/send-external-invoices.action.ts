/**
 * @fileoverview `Orders: Send External Invoices` — the scheduling surface for `Orders.SendExternalInvoices`.
 *
 * MJ's scheduler dispatches Actions and Agents; no driver takes an operation key. This Action is the
 * adapter between the two and is deliberately the thinnest thing that can be: read params, route to
 * the operation through the provider (so its `Authorize` hook runs), report what came back. Every
 * rule about WHAT gets sent lives in the operation and in `IssueOneUnit`, where the order form's
 * button exercises the same code.
 *
 * PREVIEW IS A PARAMETER, NOT A SEPARATE ACTION. The go-live gate is one preview run whose list a
 * person confirms before the same job is allowed to send anything.
 *
 * @module @mj-biz-apps/orders-server
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OrdersSendExternalInvoicesOperation, type OrdersSendExternalInvoicesInput } from '@mj-biz-apps/orders-entities';
import { boolParam, listParam, numParam, param, setOutput, supplied, UUID } from './action-params.js';

/**
 * Inputs: `CompanyIDs`, `MaxCount`, `Preview`, `RetryTransientFailures` — all optional.
 * Outputs: `Sent`, `Failed`, `Skipped`, `Results`, `PreviewedOnly`.
 */
@RegisterClass(BaseAction, 'Orders.SendExternalInvoices')
export class SendExternalInvoicesAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.send(params);
        } catch (error) {
            return { Success: false, ResultCode: 'ERROR', Message: `The external invoice sweep failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    private async send(params: RunActionParams): Promise<ActionResultSimple> {
        const user = params.ContextUser;
        if (!user) {
            return { Success: false, ResultCode: 'NO_CONTEXT_USER', Message: 'ContextUser is required: a rail invoice has to be attributable to somebody.' };
        }
        const input: OrdersSendExternalInvoicesInput = {};

        const companies = listParam(params, 'CompanyIDs');
        if (companies !== null) {
            const bad = companies.filter((c) => !UUID.test(c));
            if (bad.length) return { Success: false, ResultCode: 'INVALID_COMPANY_IDS', Message: `CompanyIDs must be company IDs, comma-separated — got '${bad.join(', ')}'.` };
            input.CompanyIDs = companies;
        }

        const maxCount = numParam(params, 'MaxCount');
        if (maxCount !== null) {
            if (!Number.isInteger(maxCount) || maxCount < 1) {
                return { Success: false, ResultCode: 'INVALID_MAX_COUNT', Message: `MaxCount is a cap on units sent in one pass, so it must be a whole number of at least 1 — got '${String(param(params, 'MaxCount'))}'.` };
            }
            input.MaxCount = maxCount;
        }

        for (const name of ['Preview', 'RetryTransientFailures'] as const) {
            const value = boolParam(params, name);
            if (value === null && supplied(params, name)) {
                return { Success: false, ResultCode: `INVALID_${name.toUpperCase()}`, Message: `${name} takes true or false — got '${String(param(params, name))}'. Refused rather than guessed, because the wrong guess sends customers invoices.` };
            }
            if (value !== null) input[name] = value;
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const result = await new OrdersSendExternalInvoicesOperation().Execute(input, { provider, user });
        if (!result.Success || !result.Output) {
            return { Success: false, ResultCode: result.ResultCode ?? 'OPERATION_FAILED', Params: params.Params, Message: result.ErrorMessage ?? 'Orders.SendExternalInvoices returned no result.' };
        }
        const out = result.Output;
        setOutput(params, 'Sent', out.Sent);
        setOutput(params, 'Failed', out.Failed);
        setOutput(params, 'Skipped', out.Skipped);
        setOutput(params, 'Results', out.Results);
        setOutput(params, 'PreviewedOnly', input.Preview === true);

        if (!out.Success) {
            return { Success: false, ResultCode: 'PARTIAL', Params: params.Params, Message: out.Message ?? `${out.Failed} unit(s) were not sent.` };
        }
        return { Success: true, ResultCode: input.Preview === true ? 'PREVIEWED' : 'COMPLETED', Params: params.Params, Message: out.Message ?? `${out.Sent} unit(s) sent.` };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadSendExternalInvoicesAction(): void {
    void SendExternalInvoicesAction;
}

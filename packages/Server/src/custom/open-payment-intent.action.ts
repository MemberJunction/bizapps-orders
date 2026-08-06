/**
 * @fileoverview `Orders: Open Payment Intent` — ask a gateway to stand ready to take money.
 *
 * WHY AN ACTION. Three callers want this and they are different in kind: the customer portal opening
 * a checkout, a renewal job charging a saved mandate on schedule, and a person in the back office
 * sending a pay link. Actions are the surface all three already speak, and they are discoverable in
 * metadata rather than only from code.
 *
 * IT MOVES NO MONEY AND WRITES NO PAYMENT. Opening an intent is the gateway agreeing to stand ready;
 * nothing is owed differently because of it, and an intent nobody completes simply expires. The
 * payment is written later by `Orders.CapturePayment`, which takes the `PaymentIntentID` this returns.
 *
 * THE ORDER OF THE TWO CALLS IS THE WHOLE POINT. Until now `CreateIntent` existed on every driver and
 * was called by nothing but unit tests, so a provider-backed capture always failed with "there is
 * nothing for the gateway to capture". This action is the missing first step.
 *
 * THE CLIENT SECRET IS AN OUTPUT AND IS NEVER PERSISTED. It authorises a browser to confirm this one
 * intent. Callers should hand it straight to Stripe.js and not log it.
 *
 * @module @mj-biz-apps/orders-actions
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { OpenPaymentIntent } from '@mj-biz-apps/orders-core-entities-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

function strParam(params: RunActionParams, name: string): string | null {
    const raw = param(params, name);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length ? value : null;
}

function numParam(params: RunActionParams, name: string): number | null {
    const raw = param(params, name);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function setOutput(params: RunActionParams, name: string, value: unknown): void {
    const existing = params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.Value = value;
        existing.Type = 'Output';
        return;
    }
    params.Params = params.Params ?? [];
    params.Params.push({ Name: name, Value: value, Type: 'Output' } as ActionParam);
}

/**
 * Open a gateway payment intent.
 *
 * Inputs: `PaymentProviderID` (required), `Amount` (required), `CurrencyCode`, `OrderHeaderID`,
 * `BillToPersonID`, `BillToOrganizationID`, `ProviderCustomerRef`, `ProviderInstrumentRef`,
 * `IdempotencyKey`.
 * Outputs: `PaymentIntentID`, `ProviderIntentID`, `Status`, `ClientSecret`, `HostedUrl`, `WasExisting`.
 */
@RegisterClass(BaseAction, 'Orders.OpenPaymentIntent')
export class OpenPaymentIntentAction extends BaseAction {
    /** An action must not throw at its caller — same reasoning as the other hand-authored actions. */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.open(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Could not open a payment intent: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async open(params: RunActionParams): Promise<ActionResultSimple> {
        const providerID = strParam(params, 'PaymentProviderID');
        if (!providerID) {
            return {
                Success: false,
                ResultCode: 'MISSING_PROVIDER_ID',
                Message: 'PaymentProviderID is required — it decides which gateway account to ask and which credentials to use.',
            };
        }
        if (!UUID.test(providerID)) {
            return {
                Success: false,
                ResultCode: 'INVALID_PROVIDER_ID',
                Message: `'${providerID}' is not a payment provider ID. This takes the PaymentProvider row's ID, not the type code.`,
            };
        }

        for (const optional of ['OrderHeaderID', 'BillToPersonID', 'BillToOrganizationID'] as const) {
            const value = strParam(params, optional);
            if (value && !UUID.test(value)) {
                return { Success: false, ResultCode: 'INVALID_ID', Message: `'${value}' is not a valid ${optional}.` };
            }
        }

        const amount = numParam(params, 'Amount');
        if (amount == null || amount <= 0) {
            return {
                Success: false,
                ResultCode: 'INVALID_AMOUNT',
                Message: `Amount must be a positive number; received '${param(params, 'Amount')}'.`,
            };
        }

        const user = params.ContextUser;
        if (!user) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER',
                Message: 'ContextUser is required: the provider and its credentials are resolved through the metadata layer.',
            };
        }

        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        if (!provider) {
            return { Success: false, ResultCode: 'NO_PROVIDER', Message: 'No metadata provider is configured.' };
        }

        const result = await OpenPaymentIntent(
            {
                PaymentProviderID: providerID,
                Amount: amount,
                CurrencyCode: strParam(params, 'CurrencyCode') ?? 'USD',
                OrderHeaderID: strParam(params, 'OrderHeaderID'),
                BillToPersonID: strParam(params, 'BillToPersonID'),
                BillToOrganizationID: strParam(params, 'BillToOrganizationID'),
                ProviderCustomerRef: strParam(params, 'ProviderCustomerRef'),
                ProviderInstrumentRef: strParam(params, 'ProviderInstrumentRef'),
                IdempotencyKey: strParam(params, 'IdempotencyKey'),
            },
            provider,
            user,
        );

        if (!result.Success) {
            // A gateway refusal, not a fault. Reported with the gateway's own words so the person
            // retrying knows whether to change something or just try again.
            return {
                Success: false,
                ResultCode: 'GATEWAY_REFUSED',
                Params: params.Params,
                Message: result.Reason ?? 'The gateway did not open a payment intent.',
            };
        }

        setOutput(params, 'PaymentIntentID', result.PaymentIntentID);
        setOutput(params, 'ProviderIntentID', result.ProviderIntentID);
        setOutput(params, 'Status', result.Status);
        setOutput(params, 'ClientSecret', result.ClientSecret);
        setOutput(params, 'HostedUrl', result.HostedUrl);
        setOutput(params, 'WasExisting', result.WasExisting === true);

        return {
            Success: true,
            ResultCode: result.WasExisting ? 'ALREADY_OPEN' : 'OPENED',
            Params: params.Params,
            Message: result.WasExisting
                ? `Payment intent ${result.ProviderIntentID} was already open; reusing it.`
                : `Opened payment intent ${result.ProviderIntentID} (${result.Status}). Pass PaymentIntentID to Orders.CapturePayment when the money is confirmed.`,
        };
    }
}

/** Tree-shaking anchor — without it the decorator never runs and the action has nothing behind it. */
export function LoadOpenPaymentIntentAction(): void {
    void OpenPaymentIntentAction;
}

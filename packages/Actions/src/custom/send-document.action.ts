/**
 * @fileoverview `Orders: Send Document` — render a customer-facing document and actually send it.
 *
 * WHY THIS IS SEPARATE FROM `Orders: Generate Invoice`. Generating writes nothing and can be called a
 * hundred times safely — a print button, a reconciliation check, a PDF job. Sending is IRREVERSIBLE and
 * reaches a person outside the company. Folding a `Send: true` flag into the render action would put
 * the single most consequential side effect in this app behind a boolean that is easy to set by
 * accident, in an action whose whole documented contract is that it never writes.
 *
 * WHAT IT COMPOSES, and the order is the design:
 *
 *   1. RENDER   `RenderInvoiceDocuments` — the same service `Orders.GenerateInvoice` calls
 *   2. RESOLVE  who the order says it is billed to, and their recorded addresses
 *   3. DECIDE   `DecideDelivery` — is this a bill at all, and is there anybody to send it to
 *   4. DELIVER  the registered channel for the requested code
 *
 * Every step is somebody else's code. This action extracts parameters, sequences four calls, and maps
 * the answers onto result codes — which is what an action is supposed to be.
 *
 * ONE DOCUMENT PER SELLING COMPANY, ONE SEND EACH. An order sold by two companies is two receivables
 * owed to two legal entities, and each has its own remit-to details. They are sent as two messages,
 * and if the second fails the first is still reported as sent — the alternative, reporting the whole
 * thing as failed, invites a retry that sends the first one twice.
 *
 * IT IS NOT IDEMPOTENT, AND SAYS SO. Calling it twice sends the document twice. `DeliveryIdempotencyKey`
 * exists so a caller that needs at-most-once can build it, but this action cannot make that judgement:
 * re-sending because the customer asked again is ordinary, and re-sending because a workflow retried is
 * not, and only the caller knows which happened.
 *
 * @module @mj-biz-apps/orders-actions
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    BuildSubject,
    DecideDelivery,
    DeliveryIdempotencyKey,
    LoadOrderDeliveryContacts,
    LoadOrderStatus,
    ResolveDeliveryChannel,
    ResolveRecipients,
    type DeliverableFacts,
    type DeliveryChannelCode,
    type DeliveryContact,
} from '@mj-biz-apps/orders-core-entities-server';
import { RenderInvoiceDocuments, type RenderedInvoice } from '../services/invoice-renderer.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The channels this action will route to. One today; the seam is what matters. */
const CHANNELS: readonly DeliveryChannelCode[] = ['Email'];

/** What happened to one document. */
export interface DocumentDeliveryOutcome {
    DocumentNumber: string;
    Kind: string;
    CompanyID: string;
    Sent: boolean;
    /** Addresses the channel accepted. */
    Recipients: string[];
    /** Why not, when not. */
    Reason?: string;
    /** A stable key for "this document, this channel, this address" — for a caller doing its own dedup. */
    IdempotencyKeys: string[];
}

function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

function strParam(params: RunActionParams, name: string): string | null {
    const raw = param(params, name);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length ? value : null;
}

function boolParam(params: RunActionParams, name: string, fallback: boolean): boolean {
    const raw = param(params, name);
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes'].includes(String(raw).trim().toLowerCase());
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
 * Send an order's document to the customer.
 *
 * Inputs: `OrderID` (required), `CompanyID`, `Channel`, `TemplateName`, `Locale`, `CurrencyCode`,
 * `ToAddress`, `CC`, `BCC`, `From`, `FromName`, `PreviewOnly`.
 * Outputs: `Deliveries`, `SentCount`, `FailedCount`.
 */
@RegisterClass(BaseAction, 'Orders.SendDocument')
export class SendDocumentAction extends BaseAction {
    /**
     * AN ACTION MUST NOT THROW AT ITS CALLER — same reasoning as `Orders.GenerateInvoice`. The layers
     * below guard by throwing, and a workflow or agent needs a result it can branch on.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.send(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Could not send the document: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async send(params: RunActionParams): Promise<ActionResultSimple> {
        const orderID = strParam(params, 'OrderID');
        if (!orderID) {
            return { Success: false, ResultCode: 'MISSING_ORDER_ID', Message: 'OrderID is required.' };
        }
        if (!UUID.test(orderID)) {
            return {
                Success: false,
                ResultCode: 'INVALID_ORDER_ID',
                Message: `'${orderID}' is not an order ID. This action takes the OrderHeader's ID, not its order number.`,
            };
        }

        const companyID = strParam(params, 'CompanyID');
        if (companyID && !UUID.test(companyID)) {
            return { Success: false, ResultCode: 'INVALID_COMPANY_ID', Message: `'${companyID}' is not a company ID.` };
        }

        const channel = (strParam(params, 'Channel') ?? 'Email') as DeliveryChannelCode;
        if (!CHANNELS.includes(channel)) {
            return {
                Success: false,
                ResultCode: 'UNSUPPORTED_CHANNEL',
                Message: `'${channel}' is not a delivery channel this action routes to. Supported: ${CHANNELS.join(', ')}.`,
            };
        }

        const user = params.ContextUser;
        if (!user) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER',
                Message: 'ContextUser is required: the order is read through the metadata layer, which resolves permissions per user.',
            };
        }

        // `Metadata.Provider`, NOT `new Metadata()` — a Metadata instance is a facade and does not
        // implement IMetadataProvider; handing one down type-checks only through a cast and fails at
        // the first read.
        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        if (!provider) {
            return { Success: false, ResultCode: 'NO_PROVIDER', Message: 'No metadata provider is configured.' };
        }

        // ── 1. Render ──────────────────────────────────────────────────────
        const rendered = await RenderInvoiceDocuments(orderID, provider, user, {
            CompanyID: companyID,
            TemplateName: strParam(params, 'TemplateName'),
            Locale: strParam(params, 'Locale') ?? 'en-US',
            CurrencyCode: strParam(params, 'CurrencyCode'),
            Format: 'HTML',
        });
        if (!rendered.Success) {
            return {
                Success: false,
                ResultCode: rendered.Code ?? 'RENDER_FAILED',
                Message: rendered.Message ?? 'The order could not be rendered.',
            };
        }

        // ── 2. Resolve who it goes to ──────────────────────────────────────
        // An explicit ToAddress overrides the recorded contacts, for the "send me a copy" case. It is
        // marked Billing so it survives ResolveRecipients — the caller naming an address IS the
        // deliberate decision that rule exists to require.
        const override = strParam(params, 'ToAddress');
        const contacts: DeliveryContact[] = override
            ? [{ Address: override, FullName: null, Purpose: 'Billing' }]
            : await LoadOrderDeliveryContacts(orderID, provider, user);

        const orderStatus = (await LoadOrderStatus(orderID, provider, user)) ?? '';

        // ── 3. Decide, then 4. Deliver — per document ──────────────────────
        const driver = ResolveDeliveryChannel(channel);
        const previewOnly = boolParam(params, 'PreviewOnly', false);
        const cc = this.addressList(params, 'CC');
        const bcc = this.addressList(params, 'BCC');
        const from = strParam(params, 'From');
        const fromName = strParam(params, 'FromName');

        const outcomes: DocumentDeliveryOutcome[] = [];
        for (const doc of rendered.Documents) {
            const facts = this.toFacts(doc, orderStatus);
            const decision = DecideDelivery({ Document: facts, Recipients: contacts });

            if (decision.Verdict === 'Refuse') {
                outcomes.push({
                    DocumentNumber: doc.DocumentNumber,
                    Kind: doc.Kind,
                    CompanyID: doc.CompanyID,
                    Sent: false,
                    Recipients: [],
                    Reason: decision.Reason,
                    IdempotencyKeys: [],
                });
                continue;
            }

            const recipients = ResolveRecipients(contacts);
            const result = await driver.Deliver(
                {
                    Kind: doc.Kind,
                    DocumentNumber: doc.DocumentNumber,
                    Subject: BuildSubject(facts),
                    BodyHtml: doc.HTML ?? '',
                },
                { To: recipients, CC: cc, BCC: bcc, From: from, FromName: fromName },
                { Provider: provider, User: user, PreviewOnly: previewOnly },
            );

            outcomes.push({
                DocumentNumber: doc.DocumentNumber,
                Kind: doc.Kind,
                CompanyID: doc.CompanyID,
                Sent: result.Success,
                Recipients: result.Delivered,
                Reason: result.Reason,
                IdempotencyKeys: recipients.map((r) =>
                    DeliveryIdempotencyKey(doc.DocumentNumber, channel, r.Address ?? ''),
                ),
            });
        }

        const sent = outcomes.filter((o) => o.Sent);
        const failed = outcomes.filter((o) => !o.Sent);

        setOutput(params, 'Deliveries', outcomes);
        setOutput(params, 'SentCount', sent.length);
        setOutput(params, 'FailedCount', failed.length);

        if (!sent.length) {
            // NOTHING went out. Reported as a failure with the first reason, because an action that
            // returns Success=true having sent nothing reads to a workflow as "the customer has been
            // billed".
            return {
                Success: false,
                ResultCode: 'NOT_SENT',
                Params: params.Params,
                Message: failed[0]?.Reason ?? 'Nothing was sent.',
            };
        }

        if (failed.length) {
            return {
                Success: false,
                ResultCode: 'PARTIALLY_SENT',
                Params: params.Params,
                Message:
                    `${sent.length} of ${outcomes.length} documents were sent. ` +
                    `Not sent: ${failed.map((f) => `${f.DocumentNumber} (${f.Reason ?? 'no reason given'})`).join('; ')}`,
            };
        }

        const verb = previewOnly ? 'previewed' : 'sent';
        return {
            Success: true,
            ResultCode: previewOnly ? 'PREVIEWED' : 'SENT',
            Params: params.Params,
            Message:
                outcomes.length > 1
                    ? `${outcomes.length} documents ${verb}: ${outcomes.map((o) => o.DocumentNumber).join(', ')}.`
                    : `${outcomes[0].Kind} ${outcomes[0].DocumentNumber} ${verb} to ${outcomes[0].Recipients.join(', ')}.`,
        };
    }

    /**
     * The rendered document, reduced to what the delivery decision needs.
     *
     * The ORDER's status is carried through rather than the document's kind alone, because "may this
     * be sent" is a question about the order — a draft renders perfectly well and must not be mailed.
     */
    private toFacts(doc: RenderedInvoice, orderStatus: string): DeliverableFacts {
        return {
            Kind: doc.Kind,
            DocumentNumber: doc.DocumentNumber,
            SourceStatus: orderStatus,
            IssuerName: doc.CompanyName,
            AmountDue: doc.AmountDue,
            // Already formatted by the decorator for the caller's locale — this action never formats
            // money, and reformatting here would put a second opinion in the subject line.
            AmountDueDisplay: doc.Data?.AmountDueText,
            DueDateDisplay: doc.Data?.DueDateText ?? null,
        };
    }

    /** A comma- or semicolon-separated list, or an array, from one parameter. */
    private addressList(params: RunActionParams, name: string): string[] {
        const raw = param(params, name);
        if (!raw) return [];
        const values = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[;,]/);
        return values.map((v) => v.trim()).filter(Boolean);
    }
}

/**
 * Registers {@link SendDocumentAction}.
 *
 * WITHOUT THIS ANCHOR the class is tree-shaken out, the `@RegisterClass` decorator never runs, and
 * `ActionEngine` finds an action row with no implementation behind it.
 */
export function LoadSendDocumentAction(): void {
    void SendDocumentAction;
}

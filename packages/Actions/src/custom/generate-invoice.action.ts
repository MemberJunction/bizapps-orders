/**
 * @fileoverview `Orders: Generate Invoice` — hand it any order, get back the document you send the
 * customer.
 *
 * WHY AN ACTION AND NOT A REMOTE OPERATION. The other order verbs — confirm, capture, fulfil — are
 * operations because they are the API a browser calls to change something. This one changes
 * nothing, and its callers are different in kind: a workflow that emails a bill on confirmation, an
 * agent asked to "send Contoso their invoice", a scheduled job producing a month's PDFs, a person
 * clicking Print. Actions are the surface all four already speak, and they are discoverable in
 * metadata rather than only from code.
 *
 * WHAT IT COMPOSES. This class does no arithmetic, no formatting and no markup. It resolves inputs,
 * calls the reader, the display layer and the template engine in that order, and hands back what
 * they produced:
 *
 *   `InvoiceBuilder`  → the document, per selling company, derived from the order
 *   `InvoiceDisplay`  → the strings, so the template can print without computing
 *   MJ Templates      → the HTML, editable in the database with no deploy
 *
 * IT RETURNS THE DATA ALONGSIDE THE HTML. A caller that wants a PDF renders the HTML; a caller
 * doing a reconciliation check wants the numbers, and making it scrape them back out of markup
 * would be a guarantee that the check and the document eventually disagree.
 *
 * IT NEVER WRITES. There is no invoice record — the confirmed order IS the receivable — so
 * rendering the same order twice produces two identical documents. See the header of
 * `InvoiceBehavior` for why storing one would be a mistake, and why statements are the opposite
 * case.
 *
 * @module @mj-biz-apps/orders-actions
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BuildInvoiceDocuments, DecorateInvoice, type DisplayInvoice } from '@mj-biz-apps/orders-core-entities-server';
import { TemplateEngineServer } from '@memberjunction/templates';

/** The template rendered when a caller does not name one. */
export const DEFAULT_INVOICE_TEMPLATE = 'Orders: Standard Invoice';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One rendered document, as it comes back on the `Invoices` output parameter. */
export interface RenderedInvoice {
    DocumentNumber: string;
    Kind: string;
    CompanyID: string;
    CompanyName: string;
    Gross: number;
    AmountDue: number;
    /** Null when `Format` asked for data only. */
    HTML: string | null;
    /** The full decorated document, so a caller can reconcile without parsing markup. */
    Data: DisplayInvoice;
    /** Anything the builder had to decide rather than read. Empty is the expected state. */
    Notes: string[];
}

/** Read a parameter case-insensitively — action callers are not consistent about casing. */
function param(params: RunActionParams, name: string): unknown {
    return params.Params?.find((p) => p.Name?.toLowerCase() === name.toLowerCase())?.Value;
}

function boolParam(params: RunActionParams, name: string, fallback: boolean): boolean {
    const raw = param(params, name);
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes'].includes(String(raw).trim().toLowerCase());
}

function strParam(params: RunActionParams, name: string): string | null {
    const raw = param(params, name);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value.length ? value : null;
}

/** Attach an output value, replacing any placeholder the engine already put there. */
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
 * Render an order as an invoice, quote or credit memo.
 *
 * Inputs: `OrderID` (required), `CompanyID`, `AsOfDate`, `TemplateName`, `Locale`, `CurrencyCode`,
 * `Format`, `ShowDiagnostics`. Outputs: `Invoices`, `HTML`, `DocumentCount`, `Notes`.
 */
@RegisterClass(BaseAction, 'Orders.GenerateInvoice')
export class GenerateInvoiceAction extends BaseAction {
    /**
     * AN ACTION MUST NOT THROW AT ITS CALLER. The layers below guard their inputs by throwing —
     * `RequireUUID` is what keeps an id out of a SQL string — and a workflow, an agent or a print
     * button calling this gets an exception rather than a result it can branch on. So the whole body
     * runs behind this, and every failure comes back as a Success=false with a code.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            return await this.render(params);
        } catch (error) {
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Could not produce the invoice: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async render(params: RunActionParams): Promise<ActionResultSimple> {
        const orderID = strParam(params, 'OrderID');
        if (!orderID) {
            return {
                Success: false,
                ResultCode: 'MISSING_ORDER_ID',
                Message: 'OrderID is required — this action renders an existing order and has nothing to render without one.',
            };
        }
        if (!UUID.test(orderID)) {
            // Refused HERE rather than let the reader's SQL guard throw, so a caller passing a
            // record number, a blank string or an injection attempt gets an answer it can branch on.
            return {
                Success: false,
                ResultCode: 'INVALID_ORDER_ID',
                Message: `'${orderID}' is not an order ID. This action takes the OrderHeader's ID, not its order number.`,
            };
        }

        const companyID = strParam(params, 'CompanyID');
        if (companyID && !UUID.test(companyID)) {
            return {
                Success: false,
                ResultCode: 'INVALID_COMPANY_ID',
                Message: `'${companyID}' is not a company ID.`,
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

        // Honour a caller's provider when one is threaded through — an invoice rendered inside a
        // transaction must read the same connection that owns it, or it reports the order as it was
        // before the work it is meant to document.
        //
        // The fallback is `Metadata.Provider`, NOT `new Metadata()`. A `Metadata` instance is a
        // facade over the provider and does not implement `IMetadataProvider`; handing one to
        // `RunView.FromMetadataProvider` type-checks only through a cast and fails at the first
        // read with "RunView is not a function".
        const provider: IMetadataProvider = params.Provider ?? Metadata.Provider;
        if (!provider) {
            return {
                Success: false,
                ResultCode: 'NO_PROVIDER',
                Message: 'No metadata provider is configured — the data layer has not been set up in this process.',
            };
        }

        const format = (strParam(params, 'Format') ?? 'HTML').toUpperCase();
        if (!['HTML', 'DATA'].includes(format)) {
            return {
                Success: false,
                ResultCode: 'UNSUPPORTED_FORMAT',
                Message: `Format '${format}' is not supported. Use 'HTML' for a rendered document or 'DATA' for the figures alone. PDF is produced by rendering this HTML — see the operations notes.`,
            };
        }

        const asOf = strParam(params, 'AsOfDate');
        const built = await BuildInvoiceDocuments(orderID, provider, user, { AsOf: asOf, OnlyCompanyID: companyID });

        if (!built.Success) {
            // A refusal is reported as a refusal, not as an empty success. An action that returns
            // zero documents and Success=true reads to a workflow as "this order needed no invoice".
            return {
                Success: false,
                ResultCode: built.Message?.includes('voided') ? 'NOT_INVOICEABLE' : 'ORDER_NOT_FOUND',
                Message: built.Message,
            };
        }

        const locale = strParam(params, 'Locale') ?? 'en-US';
        const currencyOverride = strParam(params, 'CurrencyCode');
        const showDiagnostics = boolParam(params, 'ShowDiagnostics', false);
        const generatedOn = asOf ?? new Date().toISOString().slice(0, 10);

        const templateName = strParam(params, 'TemplateName') ?? DEFAULT_INVOICE_TEMPLATE;
        let render: ((doc: DisplayInvoice) => Promise<{ html: string | null; error?: string }>) | null = null;

        if (format === 'HTML') {
            const prepared = await this.prepareTemplate(templateName, user, provider, showDiagnostics);
            if ('error' in prepared) {
                return { Success: false, ResultCode: 'TEMPLATE_NOT_FOUND', Message: prepared.error };
            }
            render = prepared.render;
        }

        const invoices: RenderedInvoice[] = [];
        for (const doc of built.Documents) {
            // Currency comes from the SELLING COMPANY's accounting profile, because it is a property
            // of the seller and not of the sale. An explicit parameter overrides it for the caller
            // who genuinely knows better; nothing else does.
            const currency = currencyOverride ?? doc.Issuer.CurrencyCode ?? 'USD';
            const decorated = DecorateInvoice(doc, { Locale: locale, Currency: currency, GeneratedOn: generatedOn });

            let html: string | null = null;
            if (render) {
                const rendered = await render(decorated);
                if (rendered.error) {
                    return {
                        Success: false,
                        ResultCode: 'RENDER_FAILED',
                        Message: `Could not render ${doc.DocumentNumber}: ${rendered.error}`,
                    };
                }
                html = rendered.html;
            }

            invoices.push({
                DocumentNumber: doc.DocumentNumber,
                Kind: doc.Kind,
                CompanyID: doc.CompanyID,
                CompanyName: doc.CompanyName,
                Gross: doc.Gross,
                AmountDue: doc.AmountDue,
                HTML: html,
                Data: decorated,
                Notes: doc.Notes,
            });
        }

        setOutput(params, 'Invoices', invoices);
        // The scalar HTML is a convenience for the overwhelmingly common single-company order. It is
        // deliberately null when an order split, rather than silently handing back the first of two
        // documents as though it were the whole bill.
        setOutput(params, 'HTML', invoices.length === 1 ? invoices[0].HTML : null);
        setOutput(params, 'DocumentCount', invoices.length);

        const notes = invoices.flatMap((i) => i.Notes.map((n) => `${i.DocumentNumber}: ${n}`));
        setOutput(params, 'Notes', notes);

        const kind = invoices[0]?.Kind ?? 'Invoice';
        return {
            Success: true,
            ResultCode: invoices.length > 1 ? 'SPLIT_BY_COMPANY' : 'SUCCESS',
            Params: params.Params,
            Message:
                invoices.length > 1
                    ? `This order is sold by ${invoices.length} companies, so it produces ${invoices.length} documents: ${invoices.map((i) => i.DocumentNumber).join(', ')}. Each one bills only what its company is owed.`
                    : `${kind} ${invoices[0]?.DocumentNumber ?? ''} rendered.`,
        };
    }

    /**
     * Find the template and its HTML content, and return a render function bound to them.
     *
     * The lookup happens ONCE for the whole run rather than per document: a two-company order should
     * not resolve the same template twice, and a month-end job rendering four hundred invoices
     * should not resolve it four hundred times.
     */
    private async prepareTemplate(
        templateName: string,
        user: UserInfo,
        provider: IMetadataProvider,
        showDiagnostics: boolean,
    ): Promise<{ render: (doc: DisplayInvoice) => Promise<{ html: string | null; error?: string }> } | { error: string }> {
        const engine = TemplateEngineServer.Instance;
        await engine.Config(false, user, provider);

        const template = engine.FindTemplate(templateName);
        if (!template) {
            return {
                error: `No template named '${templateName}'. The standard one is '${DEFAULT_INVOICE_TEMPLATE}'; if it is missing, the app's metadata has not been pushed.`,
            };
        }

        // Ask for HTML first, then whatever the template does have. A deployment that overrode this
        // template with a text version should still render rather than refuse.
        const content = template.GetHighestPriorityContent('HTML') ?? template.GetHighestPriorityContent();

        if (!content) {
            return { error: `Template '${templateName}' has no content rows — there is nothing to render.` };
        }

        return {
            render: async (doc: DisplayInvoice) => {
                // Validation is skipped rather than declaring one template param per field: the
                // context is a single nested document, and a param list mirroring it would be a
                // second schema to keep in step with the first.
                const result = await engine.RenderTemplate(template, content, { doc, options: { ShowDiagnostics: showDiagnostics } }, true, true);
                if (!result.Success) return { html: null, error: result.Message ?? 'unknown template error' };
                return { html: result.Output ?? '' };
            },
        };
    }
}

/**
 * Registers {@link GenerateInvoiceAction}.
 *
 * WITHOUT THIS ANCHOR the class is tree-shaken out of the bundle, the `@RegisterClass` decorator
 * never runs, and `ActionEngine` falls back to no implementation — which surfaces as an action that
 * exists in metadata and does nothing.
 */
export function LoadGenerateInvoiceAction(): void {
    void GenerateInvoiceAction;
}

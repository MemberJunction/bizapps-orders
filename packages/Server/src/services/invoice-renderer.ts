/**
 * Turning an order into rendered documents — the orchestration, extracted so two actions can share it.
 *
 * WHY IT MOVED OUT OF THE ACTION. `Orders.GenerateInvoice` owned this sequence, which was correct while
 * it was the only caller. `Orders.SendDocument` needs the identical sequence — read the order, build
 * one document per selling company, decorate it for a locale, render it through a database template —
 * and an action calling another action is the pattern MJ's own guidance rules out: it produces a stack
 * trace that goes through the metadata dispatcher instead of the code, and a rename that the compiler
 * cannot follow. So the sequence became a service and both actions are thin wrappers over it, which is
 * what the guidance asks for.
 *
 * IT RETURNS A RESULT, NEVER THROWS FOR A REFUSAL. A voided order, a missing template and an unknown
 * order id are all ANSWERS — the caller has to branch on them and turn them into an action result code
 * — while a provider that is not configured is a fault. Keeping that line in the same place the
 * payment drivers keep it means a caller can trust it everywhere.
 *
 * THE TEMPLATE IS RESOLVED ONCE PER CALL, not once per document. A two-company order should not
 * resolve the same template twice, and a month-end run producing four hundred invoices should not
 * resolve it four hundred times.
 *
 * CONNECTS TO:
 *   READER:  @mj-biz-apps/orders-core-entities-server → BuildInvoiceDocuments, DecorateInvoice
 *   ACTIONS: ../custom/generate-invoice.action.ts · ../custom/send-document.action.ts
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BuildInvoiceDocuments, DecorateInvoice, type DisplayInvoice } from '@mj-biz-apps/orders-core-entities-server';
import { TemplateEngineServer } from '@memberjunction/templates';

/** The template rendered when a caller does not name one. */
export const DEFAULT_INVOICE_TEMPLATE = 'Orders: Standard Invoice';

/** One rendered document. */
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

export interface RenderInvoiceOptions {
    /** Render only this selling company's document. Omit for every document the order produces. */
    CompanyID?: string | null;
    AsOfDate?: string | null;
    TemplateName?: string | null;
    Locale?: string | null;
    /** Overrides the selling company's functional currency. Only for a caller who genuinely knows better. */
    CurrencyCode?: string | null;
    /** `HTML` for rendered markup, `DATA` for the figures alone. */
    Format?: 'HTML' | 'DATA';
    ShowDiagnostics?: boolean;
}

/** A refusal carries a code so the caller can map it to an action result without parsing prose. */
export type RenderFailureCode = 'ORDER_NOT_FOUND' | 'NOT_INVOICEABLE' | 'TEMPLATE_NOT_FOUND' | 'RENDER_FAILED';

/**
 * A flat result rather than a discriminated union, matching `RefundPaymentOutput` and the driver
 * results throughout this app. The repo's tsconfig does not enable `strict`, so a boolean-literal
 * discriminant does not narrow — a union here would compile as a type that no caller can read.
 */
export interface RenderInvoiceResult {
    Success: boolean;
    /** Empty on refusal. */
    Documents: RenderedInvoice[];
    /** Set when `Success` is false. */
    Code?: RenderFailureCode;
    /** Set when `Success` is false — written for the person who has to fix it. */
    Message?: string;
}

/**
 * Build and render every document an order produces.
 *
 * An order sold by more than one company produces one document PER COMPANY — they are different
 * receivables owed to different legal entities — so this always returns an array and the caller must
 * not treat the first element as the whole bill.
 */
export async function RenderInvoiceDocuments(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    options: RenderInvoiceOptions = {},
): Promise<RenderInvoiceResult> {
    const asOf = options.AsOfDate ?? null;
    const built = await BuildInvoiceDocuments(orderID, provider, user, {
        AsOf: asOf,
        OnlyCompanyID: options.CompanyID ?? null,
    });

    if (!built.Success) {
        // A refusal is reported as a refusal, not as an empty success. Zero documents with Success=true
        // reads to a workflow as "this order needed no invoice".
        return {
            Success: false,
            Documents: [],
            Code: built.Message?.includes('voided') ? 'NOT_INVOICEABLE' : 'ORDER_NOT_FOUND',
            Message: built.Message ?? `Order '${orderID}' produced no documents.`,
        };
    }

    const format = options.Format ?? 'HTML';
    const locale = options.Locale ?? 'en-US';
    const generatedOn = asOf ?? new Date().toISOString().slice(0, 10);
    const templateName = options.TemplateName ?? DEFAULT_INVOICE_TEMPLATE;

    let render: ((doc: DisplayInvoice) => Promise<{ html: string | null; error?: string }>) | null = null;
    if (format === 'HTML') {
        const prepared = await prepareTemplate(templateName, user, provider, options.ShowDiagnostics === true);
        if ('error' in prepared) {
            return { Success: false, Documents: [], Code: 'TEMPLATE_NOT_FOUND', Message: prepared.error };
        }
        render = prepared.render;
    }

    const documents: RenderedInvoice[] = [];
    for (const doc of built.Documents) {
        // Currency comes from the SELLING COMPANY's accounting profile, because it is a property of the
        // seller and not of the sale.
        const currency = options.CurrencyCode ?? doc.Issuer.CurrencyCode ?? 'USD';
        const decorated = DecorateInvoice(doc, { Locale: locale, Currency: currency, GeneratedOn: generatedOn });

        let html: string | null = null;
        if (render) {
            const rendered = await render(decorated);
            if (rendered.error) {
                return {
                    Success: false,
                    Documents: [],
                    Code: 'RENDER_FAILED',
                    Message: `Could not render ${doc.DocumentNumber}: ${rendered.error}`,
                };
            }
            html = rendered.html;
        }

        documents.push({
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

    return { Success: true, Documents: documents };
}

/**
 * Find the template and its content, and return a render function bound to them.
 */
async function prepareTemplate(
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
            // Validation is skipped rather than declaring one template param per field: the context is
            // a single nested document, and a param list mirroring it would be a second schema to keep
            // in step with the first.
            const result = await engine.RenderTemplate(
                template,
                content,
                { doc, options: { ShowDiagnostics: showDiagnostics } },
                true,
                true,
            );
            if (!result.Success) return { html: null, error: result.Message ?? 'unknown template error' };
            return { html: result.Output ?? '' };
        },
    };
}

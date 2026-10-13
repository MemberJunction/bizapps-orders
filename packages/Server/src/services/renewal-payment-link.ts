/**
 * @fileoverview The update-card e-mail (#289): after a renewal card's first failed charge, send the
 * buyer a signed link that pays the renewal with a new card.
 *
 * Called by the charge pass (`charge-renewals.action.ts` hands it to `ChargeRenewals` as its
 * first-failure hook). The wording is two MJ Templates shipped as metadata, so a host edits it
 * without a deploy; the send goes through the registered `Email` delivery channel, which is MJ's
 * `CommunicationEngine` and writes a communication log row per message.
 *
 * NOTHING HERE CAN CHANGE A CHARGE. Every refusal — no secret, no link address, no recipient, a
 * template or provider failure — comes back as `{ Sent: false, Reason }` and is recorded on the
 * attempt the job reports.
 *
 * @module @mj-biz-apps/orders-server
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { TemplateEngineServer } from '@memberjunction/templates';
import {
    LoadRenewalPaymentOrder,
    OrdersSettings,
    RenewalPaymentLinkExpiresAt,
    RenewalPaymentLinkSecret,
    RenewalPaymentLinkUrl,
    RequireUUID,
    ResolveDeliveryChannel,
    SignRenewalPaymentToken,
    type RenewalChargeAttempt,
} from '@mj-biz-apps/orders-core-entities-server';

/** The environment variable the server reads the link-signing secret from. */
export const RENEWAL_LINK_SECRET_ENV_VAR = 'ORDERS_RENEWAL_LINK_SECRET';

/** The e-mail body: an MJ Template with HTML content, editable by the host. */
export const RENEWAL_LINK_BODY_TEMPLATE = 'Orders: Renewal Payment Link';
/** The e-mail subject: an MJ Template with Text content, editable by the host. */
export const RENEWAL_LINK_SUBJECT_TEMPLATE = 'Orders: Renewal Payment Link Subject';

/** The data both templates are rendered with. */
export interface RenewalLinkTemplateData {
    FirstName: string;
    OrderNumber: string;
    SubscriptionNumber: string;
    Description: string;
    /** Formatted to two decimals. */
    Amount: string;
    PaymentUrl: string;
    /** `YYYY-MM-DD`, the last day the link works. */
    ExpiresOn: string;
    /** `YYYY-MM-DD`, the next day the old card will be tried; empty when none is left. */
    NextAttemptDay: string;
    /** True when the bank asked for the buyer to authenticate, rather than declining. */
    AuthenticationRequired: boolean;
}

/** Send the update-card link for a renewal order's first failed charge. Never throws. */
export async function SendRenewalPaymentLink(
    attempt: RenewalChargeAttempt,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Sent: boolean; Reason?: string }> {
    try {
        const secret = RenewalPaymentLinkSecret();
        if (!secret) return { Sent: false, Reason: `no link-signing secret is configured (${RENEWAL_LINK_SECRET_ENV_VAR})` };
        await OrdersSettings.Load(provider, user);
        const baseUrl = OrdersSettings.RenewalPaymentLinkBaseUrl;
        if (!baseUrl) return { Sent: false, Reason: 'the RenewalPaymentLinkBaseUrl setting is not set' };

        const order = await LoadRenewalPaymentOrder(attempt.OrderID, provider, user);
        if (!order) return { Sent: false, Reason: 'the renewal order was not found' };
        const recipient = order.BillToPersonID ? await personContact(order.BillToPersonID, provider, user) : null;
        if (!recipient?.Email) return { Sent: false, Reason: 'the renewal has no bill-to person with an e-mail address' };

        const expiresAt = RenewalPaymentLinkExpiresAt(attempt.DueDate, OrdersSettings.RenewalAccessCutoffDaysPastDue);
        const token = await SignRenewalPaymentToken({ OrderID: order.OrderID, SubscriptionID: attempt.SubscriptionID, ExpiresAt: expiresAt }, secret);
        const data: RenewalLinkTemplateData = {
            FirstName: recipient.FirstName ?? '',
            OrderNumber: order.OrderNumber,
            SubscriptionNumber: attempt.SubscriptionNumber,
            Description: order.Description,
            Amount: Number(order.Balance).toFixed(2),
            PaymentUrl: RenewalPaymentLinkUrl(baseUrl, token),
            ExpiresOn: expiresAt.toISOString().slice(0, 10),
            NextAttemptDay: attempt.NextAttemptDay ?? '',
            AuthenticationRequired: attempt.Outcome === 'AuthenticationRequired',
        };

        const rendered = await renderLinkEmail(data, provider, user);
        if ('Error' in rendered) return { Sent: false, Reason: rendered.Error };

        const result = await ResolveDeliveryChannel('Email').Deliver(
            {
                Kind: 'RenewalPaymentLink',
                DocumentNumber: order.OrderNumber,
                Subject: rendered.Subject,
                BodyHtml: rendered.Html,
            },
            { To: [{ Address: recipient.Email, FullName: recipient.FullName, Purpose: 'Billing' }] },
            { Provider: provider, User: user },
        );
        return result.Success ? { Sent: true } : { Sent: false, Reason: result.Reason ?? 'the e-mail provider reported a failure' };
    } catch (err) {
        return { Sent: false, Reason: err instanceof Error ? err.message : String(err) };
    }
}

/** Render the subject and body templates. */
export async function renderLinkEmail(
    data: RenewalLinkTemplateData,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Subject: string; Html: string } | { Error: string }> {
    const engine = TemplateEngineServer.Instance;
    await engine.Config(false, user, provider);
    const body = engine.FindTemplate(RENEWAL_LINK_BODY_TEMPLATE);
    const subject = engine.FindTemplate(RENEWAL_LINK_SUBJECT_TEMPLATE);
    if (!body || !subject) {
        return { Error: `the '${RENEWAL_LINK_BODY_TEMPLATE}' and '${RENEWAL_LINK_SUBJECT_TEMPLATE}' templates are not installed; push the app metadata` };
    }
    const bodyContent = body.GetHighestPriorityContent('HTML') ?? body.GetHighestPriorityContent();
    const subjectContent = subject.GetHighestPriorityContent('Text') ?? subject.GetHighestPriorityContent();
    if (!bodyContent || !subjectContent) return { Error: 'a renewal link template has no content' };

    const html = await engine.RenderTemplate(body, bodyContent, data, true, true);
    if (!html.Success) return { Error: `the e-mail body did not render: ${html.Message ?? 'unknown template error'}` };
    const line = await engine.RenderTemplate(subject, subjectContent, data, true, true);
    if (!line.Success) return { Error: `the e-mail subject did not render: ${line.Message ?? 'unknown template error'}` };
    return { Subject: (line.Output ?? '').replace(/\s+/g, ' ').trim(), Html: html.Output ?? '' };
}

async function personContact(
    personID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Email: string | null; FirstName: string | null; FullName: string | null } | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const found = await rv.RunView<{ Email: string | null; FirstName: string | null; LastName: string | null }>(
        {
            EntityName: 'MJ_BizApps_Common: People',
            ExtraFilter: `ID = '${RequireUUID(personID, 'PersonID')}'`,
            Fields: ['Email', 'FirstName', 'LastName'],
            ResultType: 'simple',
        },
        user,
    );
    const person = found.Results?.[0];
    if (!person) return null;
    const fullName = [person.FirstName, person.LastName].filter(Boolean).join(' ') || null;
    return { Email: person.Email?.trim() || null, FirstName: person.FirstName, FullName: fullName };
}

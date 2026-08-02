/**
 * EmailDeliveryChannel — sending a rendered document, over MJ's communication framework.
 *
 * THIS CLASS IS DELIBERATELY THIN, and the thinness is the design. MJ's `CommunicationEngine` already
 * owns provider registration, credential resolution, template processing, dry-run preview, and — the
 * one that matters most here — a persisted log row per message with its status and any error. Every
 * one of those is a thing a hand-rolled mail path in this app would have had to grow, badly, over the
 * following year. So this channel translates our vocabulary into MJ's and gets out of the way.
 *
 * THE LOG IS WHY THERE IS NO ORDERS-SIDE DELIVERY TABLE YET. `CommunicationEngine.SendSingleMessage`
 * writes a `MJ: Communication Logs` row for every send, carrying the recipient, the body as sent, the
 * status and the failure reason. That answers "was it sent, to whom, and did it work" today, without
 * a schema change. What it does NOT answer is "has THIS ORDER been invoiced, and when" — that needs a
 * row keyed by the order, and it is the deliberate next step rather than something to fake here by
 * stuffing an order id into a log message.
 *
 * ONE MESSAGE PER RECIPIENT, NOT ONE MESSAGE WITH MANY RECIPIENTS. Two reasons, and the second is the
 * one that decided it. A single message would expose every billing contact's address to all the
 * others — a real disclosure when a customer's contacts span two organisations. And a partial failure
 * on a multi-recipient send is unattributable: the provider reports one status for the message, so
 * "delivered to two of three" is indistinguishable from "delivered", and nobody learns which contact
 * did not get the bill.
 *
 * A PARTIAL SEND IS A FAILURE, reported with the addresses that DID work. The alternative — reporting
 * success because at least one landed — is how an invoice quietly stops reaching the person who
 * actually pays it while the send log stays green.
 *
 * CONNECTS TO:
 *   BASE:  ./BaseDeliveryChannel.ts
 *   PURE:  ./DeliveryBehavior.ts
 *   MJ:    @memberjunction/communication-engine
 *   DOC:   plans/bizapps-orders-master.md §4.4
 */
import { LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import {
    BaseDeliveryChannel,
    type DeliverableDocument,
    type DeliveryAddressing,
    type DeliveryContext,
    type DeliveryResult,
} from './BaseDeliveryChannel.js';

/**
 * The MJ communication provider used when the app has not been told otherwise.
 *
 * SendGrid because it is the provider MJ ships an email implementation for and the one most
 * deployments already configure. It is a constant rather than a hard-coded string in five places so
 * a deployment that uses Microsoft Graph changes it here, and so this comment has somewhere to live.
 */
const DEFAULT_PROVIDER = 'SendGrid';

/** MJ's own name for the message type. Not ours to invent — it is looked up in MJ's metadata. */
const MESSAGE_TYPE = 'Email';

@RegisterClass(BaseDeliveryChannel, 'Email')
export class EmailDeliveryChannel extends BaseDeliveryChannel {
    /**
     * Which MJ communication provider to send through.
     *
     * A GETTER, NOT AN ENV READ. This package's tsconfig sets `"types": []` — it has no Node globals
     * by design, which is also why the signature code uses Web Crypto rather than `node:crypto`. So a
     * deployment that sends through Microsoft Graph subclasses this and overrides the getter, and its
     * `@RegisterClass(BaseDeliveryChannel, 'Email')` wins by load-order priority. That is the same
     * escape hatch the payment drivers offer, and it keeps the choice in code somebody can read rather
     * than in an environment variable nobody can find.
     */
    protected get ProviderName(): string {
        return DEFAULT_PROVIDER;
    }

    public override async Deliver(
        document: DeliverableDocument,
        addressing: DeliveryAddressing,
        context: DeliveryContext,
    ): Promise<DeliveryResult> {
        const recipients = (addressing.To ?? []).filter((r) => (r.Address ?? '').trim());
        if (!recipients.length) {
            // A REFUSAL, not a throw: nothing is broken, there is simply nobody to send to. The caller
            // should have asked `DecideDelivery` first, and this is the backstop for the one who did not.
            return { Success: false, Delivered: [], Reason: 'no recipient address was supplied' };
        }

        const engine = CommunicationEngine.Instance;
        await engine.Config(false, context.User, context.Provider);

        const delivered: string[] = [];
        const failures: string[] = [];
        let providerMessageID: string | undefined;

        for (const recipient of recipients) {
            const address = recipient.Address!.trim();
            const message = this.buildMessage(document, addressing, address, recipient.FullName ?? undefined);

            try {
                const result = await engine.SendSingleMessage(
                    this.ProviderName,
                    MESSAGE_TYPE,
                    message,
                    undefined,
                    context.PreviewOnly === true,
                );

                if (result?.Success) {
                    delivered.push(address);
                    providerMessageID ??= result.Message?.MessageType?.ID;
                } else {
                    failures.push(`${address}: ${result?.Error || 'the provider reported a failure with no reason'}`);
                }
            } catch (err) {
                // A FAULT — the provider was unreachable or threw. It is caught rather than propagated
                // so one unreachable recipient does not abandon the rest, and it is recorded as a
                // failure so the overall result cannot come back green.
                const reason = err instanceof Error ? err.message : String(err);
                LogError(`Delivering ${document.DocumentNumber} to ${address} threw: ${reason}`);
                failures.push(`${address}: ${reason}`);
            }
        }

        if (failures.length) {
            // Partial success is reported as failure WITH the addresses that worked, so a retry can
            // skip them. Reporting success because one landed is how a bill quietly stops reaching the
            // person who pays it.
            return {
                Success: false,
                Delivered: delivered,
                ProviderMessageID: providerMessageID,
                Reason:
                    `${document.DocumentNumber} reached ${delivered.length} of ${recipients.length} recipients. ` +
                    `Failures: ${failures.join('; ')}`,
            };
        }

        LogStatus(
            `${document.Kind} ${document.DocumentNumber} ${context.PreviewOnly ? 'previewed for' : 'sent to'} ` +
                `${delivered.join(', ')}.`,
        );
        return { Success: true, Delivered: delivered, ProviderMessageID: providerMessageID };
    }

    /**
     * Our vocabulary, translated into MJ's `Message`.
     *
     * `From` IS LEFT UNSET WHEN THE CALLER DID NOT SUPPLY ONE, rather than defaulted to something
     * plausible. MJ's provider resolves its own configured sender, and a guess here — a no-reply
     * address this app invented — would either be rejected by the provider's domain authentication or,
     * worse, accepted and send the company's invoices from an address nobody monitors for replies.
     *
     * BOTH BODIES ARE SET when the caller supplied a plain-text alternative. An HTML-only message is
     * one of the strongest spam signals there is, and an invoice landing in a junk folder is
     * indistinguishable from one that was never sent.
     */
    private buildMessage(
        document: DeliverableDocument,
        addressing: DeliveryAddressing,
        address: string,
        fullName?: string,
    ): Message {
        const message = new Message();
        message.To = address;
        message.Subject = document.Subject;
        message.HTMLBody = document.BodyHtml;
        if (document.BodyPlain) message.Body = document.BodyPlain;
        if (addressing.From) message.From = addressing.From;
        if (addressing.FromName) message.FromName = addressing.FromName;
        if (addressing.CC?.length) message.CCRecipients = [...addressing.CC];
        if (addressing.BCC?.length) message.BCCRecipients = [...addressing.BCC];
        void fullName; // MJ's Message carries no per-recipient display name; kept for the seam's shape.
        return message;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadEmailDeliveryChannel(): void {
    // intentionally empty
}

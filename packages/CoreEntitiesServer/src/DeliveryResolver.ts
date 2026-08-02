/**
 * Finding the channel a document should leave through.
 *
 * SHORT BY DESIGN, and it exists for exactly one reason: to refuse the base class. MJ's ClassFactory
 * falls back to the base when no registration matches a key, and `BaseDeliveryChannel` declines every
 * send. Accepting that fallback would turn "nobody registered an email channel" into "the email
 * channel refused to send", which points the reader at a mail provider instead of at the missing
 * `Load*` anchor in the server bootstrap. That is the same trap `PaymentProviderResolver` guards, and
 * it is worth guarding twice because the symptom — documents that never arrive — is identical to a
 * genuine provider outage.
 *
 * CONNECTS TO:
 *   SEAM: ./BaseDeliveryChannel.ts
 *   DOC:  plans/bizapps-orders-master.md §4.4
 */
import { MJGlobal } from '@memberjunction/global';
import { BaseDeliveryChannel } from './BaseDeliveryChannel.js';
import type { DeliveryChannelCode } from './DeliveryBehavior.js';

/** Raised when a channel code has no working implementation behind it. */
export class DeliveryChannelNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeliveryChannelNotConfiguredError';
    }
}

/**
 * The channel registered for this code.
 *
 * @throws {DeliveryChannelNotConfiguredError} when nothing is registered, or when the only thing
 * registered is the base class that implements nothing.
 */
export function ResolveDeliveryChannel(code: DeliveryChannelCode): BaseDeliveryChannel {
    const channel = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDeliveryChannel>(BaseDeliveryChannel, code);

    if (!channel) {
        throw new DeliveryChannelNotConfiguredError(
            `No delivery channel is registered for '${code}'. Register one with ` +
                `@RegisterClass(BaseDeliveryChannel, '${code}') and call its Load* anchor from the server ` +
                `bootstrap — without the anchor the decorator is tree-shaken away and the class is silently absent.`,
        );
    }

    if (channel.constructor === BaseDeliveryChannel) {
        throw new DeliveryChannelNotConfiguredError(
            `Delivery channel '${code}' resolved to the BASE channel, which sends nothing. Its Load* anchor ` +
                `is almost certainly missing from the server bootstrap.`,
        );
    }

    channel.Code = code;
    return channel;
}

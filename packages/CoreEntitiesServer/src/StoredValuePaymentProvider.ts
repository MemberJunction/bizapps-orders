/**
 * StoredValuePaymentProvider — money we already hold, in the two forms it takes.
 *
 * ONE DRIVER, TWO INSTRUMENT SHAPES, and that was a deliberate call (Amith 2026-07-30). A gift card and
 * an over-payment are genuinely different things:
 *
 *   GIFT CARD        a `StoredValueAccount` with a redeemable `Code`, a stored balance and a
 *                    transaction ledger. A BEARER instrument — transferable, possibly to somebody who
 *                    was never a customer — which is exactly why it cannot be modelled as an order's
 *                    negative balance: an order belongs to the party who placed it. Selling one is
 *                    DEFERRED REVENUE; you took cash and owe goods.
 *
 *   ACCOUNT CREDIT   an over-paid order's negative balance (D68). No separate record, because the
 *                    balance already has a home and a second copy could disagree with it. Not revenue
 *                    at all — a customer deposit.
 *
 * They differ in ownership, transferability, expiry and accounting treatment. What they do NOT differ in
 * is the MECHANICS of spending them: check a balance we control, decrement it, record the movement, no
 * network. That shared half is why they are one driver rather than two — and why the split lives in
 * `PaymentDetail` (`StoredValueAccountID` versus `SourceOrderHeaderID`), which is where an instrument's
 * identity belongs.
 *
 * THIS DRIVER REFUSES MORE THAN IT MOVES, and every refusal is a case where the alternative silently
 * creates money: spending an expired card, spending past a balance, spending a credit that belongs to
 * somebody else. A gateway can afford to be optimistic because a real institution will decline; here we
 * ARE the institution.
 *
 * WHAT IT DOES NOT DO. It never writes the journal entry — `PaymentHeaderEntityServer` owns that, as for
 * every other tender. Nor does it ISSUE a gift card; that happens when one is sold, on the ordinary
 * order path, because a gift card is a product.
 *
 * CONNECTS TO:
 *   BASE:  ./BasePaymentProvider.ts
 *   AKIN:  ./ApplyAccountCreditOperation.ts — the operation that spends a credit across orders (D68)
 *   DOC:   plans/archive/bizapps-orders-master.md D19, D38, D68
 */
import { RegisterClass } from '@memberjunction/global';
import { IRunViewProvider, RunView } from '@memberjunction/core';
import {
    BasePaymentProvider,
    type CaptureRequest,
    type CaptureResult,
    type CreateIntentRequest,
    type CreateIntentResult,
    type RefundRequest,
    type RefundResult,
} from './BasePaymentProvider.js';

const STORED_VALUE_ACCOUNT_ENTITY = 'MJ_BizApps_Orders: Stored Value Accounts';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/**
 * Which internal balance is being drawn down. Set by the caller from the `PaymentDetail` it is acting
 * on, because that row is what already distinguishes the two.
 */
export interface StoredValueTarget {
    /** A gift card, by its account id. */
    StoredValueAccountID?: string | null;
    /** An over-paid order whose negative balance is the credit. */
    SourceOrderHeaderID?: string | null;
}

@RegisterClass(BasePaymentProvider, 'StoredValue')
export class StoredValuePaymentProvider extends BasePaymentProvider {
    /** Internal money. Nothing external tells us about it. */
    public override get HandledEventKinds(): readonly string[] {
        return [];
    }

    /**
     * Confirm there is enough, before anything is spent.
     *
     * The balance check happens HERE rather than at capture because refusing early is the difference
     * between "this card cannot cover it" and a half-applied payment. It is deliberately NOT a
     * reservation: nothing is locked between this call and the capture, so a genuinely concurrent spend
     * of the same card could still overdraw it. The guard against that is the capture's own re-read plus
     * the balance's own constraint — the same shape as the order counter, where the authoritative check
     * is the one inside the writing transaction.
     */
    public override async CreateIntent(request: CreateIntentRequest & StoredValueTarget): Promise<CreateIntentResult> {
        if (request.Amount <= 0) {
            return { Success: false, Reason: `A gift card or account credit payment must be for more than zero (${request.Amount} was entered).` };
        }

        const available = await this.available(request);
        if (!available.Found) return { Success: false, Reason: available.Reason };
        if (available.Balance < request.Amount) {
            return {
                Success: false,
                Reason:
                    `${available.Label} has ${available.Balance.toFixed(2)} available, which does not cover ` +
                    `${request.Amount.toFixed(2)}. Apply the ${available.Balance.toFixed(2)} and pay the rest another way.`,
            };
        }

        return {
            Success: true,
            ProviderIntentID: `sv_${crypto.randomUUID()}`,
            // Immediately payable: the money is ours to move, and there is no third party to wait for.
            Status: 'RequiresPayment',
        };
    }

    /**
     * Spend it.
     *
     * RE-READS THE BALANCE. The check in `CreateIntent` is a courtesy that produces a good error
     * message; this one is the one that protects the money, because it runs inside the caller's
     * transaction alongside the write that spends it.
     */
    public override async Capture(request: CaptureRequest & StoredValueTarget): Promise<CaptureResult> {
        const amount = request.Amount ?? 0;
        if (amount <= 0) {
            return { Success: false, Reason: 'Enter the amount to take from the gift card or account credit.' };
        }

        const available = await this.available(request);
        if (!available.Found) return { Success: false, Reason: available.Reason };
        if (available.Balance < amount) {
            return {
                Success: false,
                Reason:
                    `${available.Label} now has only ${available.Balance.toFixed(2)} available, less than the ` +
                    `${amount.toFixed(2)} being charged, because its balance changed after the payment was started. ` +
                    `Nothing was spent; start the payment again.`,
            };
        }

        return {
            Success: true,
            Amount: amount,
            // We are the institution, so there is no cut. Genuinely zero, not unknown.
            FeeAmount: 0,
            ProviderChargeID: request.ProviderIntentID,
            Status: 'Succeeded',
        };
    }

    /**
     * Refunding TO an internal balance puts the money back where it came from.
     *
     * Always succeeds at this layer for the same reason the manual driver's does: nothing external has
     * to agree. The row that actually restores the balance is written by the caller, in its transaction.
     */
    public override async Refund(request: RefundRequest): Promise<RefundResult> {
        const amount = request.Amount;
        if (amount == null || amount <= 0) {
            return { Success: false, Reason: 'Enter the amount to put back on the gift card or account credit.' };
        }
        return { Success: true, Amount: amount, ProviderRefundID: `sv_refund_${crypto.randomUUID()}` };
    }

    /**
     * What is actually available, from whichever of the two shapes this is.
     *
     * Returns a LABEL as well as a number so the refusals above can name the thing that was short —
     * "gift card ABC-123" or "order ORD-000042" — rather than saying "the balance", which tells a
     * person nothing about where to look.
     */
    private async available(
        target: StoredValueTarget,
    ): Promise<{ Found: boolean; Balance: number; Label: string; Reason?: string }> {
        const none = { Found: false, Balance: 0, Label: '' };

        if (!this.Provider || !this.User) {
            return { ...none, Reason: 'Gift card and account credit balances cannot be read because the server did not set up the stored-value driver correctly. Report this to the development team.' };
        }
        const rv = new RunView(this.Provider as unknown as IRunViewProvider);

        if (target.StoredValueAccountID) {
            const result = await rv.RunView<{
                ID: string;
                Code: string;
                CurrentBalance: number;
                Status: string;
                ExpiresAt: Date | null;
            }>(
                {
                    EntityName: STORED_VALUE_ACCOUNT_ENTITY,
                    ExtraFilter: `ID = '${target.StoredValueAccountID}'`,
                    ResultType: 'simple',
                },
                this.User,
            );
            const account = result?.Results?.[0];
            if (!account) {
                return { ...none, Reason: `Gift card ${target.StoredValueAccountID} was not found.` };
            }
            const label = `Gift card ${account.Code}`;
            if (account.Status !== 'Active') {
                return { ...none, Reason: `${label} is ${account.Status}, so it cannot be spent.` };
            }
            // Expiry is checked HERE rather than left to a nightly sweep, because a card that expired
            // this morning must not be spendable this afternoon just because nothing has run yet.
            if (account.ExpiresAt && new Date(account.ExpiresAt).getTime() < Date.now()) {
                return {
                    ...none,
                    Reason: `${label} expired on ${new Date(account.ExpiresAt).toISOString().slice(0, 10)}.`,
                };
            }
            return { Found: true, Balance: Number(account.CurrentBalance ?? 0), Label: label };
        }

        if (target.SourceOrderHeaderID) {
            const result = await rv.RunView<{ ID: string; OrderNumber: string; Balance: number | null }>(
                {
                    EntityName: ORDER_ENTITY,
                    ExtraFilter: `ID = '${target.SourceOrderHeaderID}'`,
                    ResultType: 'simple',
                },
                this.User,
            );
            const order = result?.Results?.[0];
            if (!order) {
                return { ...none, Reason: `Order ${target.SourceOrderHeaderID} was not found, so its credit cannot be used.` };
            }
            const balance = Number(order.Balance ?? 0);
            const label = `Order ${order.OrderNumber}`;
            if (balance >= 0) {
                // A credit IS a negative balance (D68). A zero or positive balance means there is
                // nothing owed to the customer — and saying so beats reporting "0.00 available", which
                // reads as an empty wallet rather than as the wrong order.
                return {
                    ...none,
                    Reason:
                        `${label} has a balance of ${balance.toFixed(2)}, so it has no credit to spend. ` +
                        `An order has credit only when it has been paid more than it is worth.`,
                };
            }
            return { Found: true, Balance: Math.abs(balance), Label: `${label}'s credit` };
        }

        return {
            ...none,
            Reason:
                'Pick a gift card, or the overpaid order whose credit is being spent.',
        };
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadStoredValuePaymentProvider(): void {
    // intentionally empty
}

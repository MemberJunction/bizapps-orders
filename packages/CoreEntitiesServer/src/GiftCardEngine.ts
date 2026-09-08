/**
 * Turn gift-card lines into StoredValueAccount rows and their opening ledger entries.
 *
 * The DECISIONS live in `GiftCardBehavior` and are unit-tested without a database. What lives here
 * is the part that needs one: finding which lines are gift cards, minting codes that survive the
 * UNIQUE constraint, and writing the account plus its `Issue` transaction as one act.
 *
 * IDEMPOTENCY IS THE WHOLE GAME. `OrderEntityServer.Save` re-runs on every save of an already
 * confirmed order, and issuing a second set of cards would hand the customer free money that
 * reconciles perfectly — the accounts exist, the ledger balances, the order is unchanged. So
 * issuance keys on `IssuedFromOrderLineID`: a line that has already issued issues nothing. That is
 * checked against the DATABASE rather than a flag in memory, because the second save is a different
 * object than the first.
 *
 * CONNECTS TO:
 *   PURE: GiftCardBehavior (+ its unit tests)
 *   CODE: OrderEntityServer.issueGiftCards (lifecycle) · StoredValuePaymentProvider (redemption)
 *   DOC:  plans/archive/bizapps-orders-master.md D4, D27, D44
 */
import {
    BaseEntity,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    LoadOrdersEngine,
    OrdersEngine,
    mjBizAppsOrdersStoredValueAccountEntity,
    mjBizAppsOrdersStoredValueTransactionEntity,
} from '@mj-biz-apps/orders-entities';
import {
    FormatGiftCardCode,
    GIFT_CARD_ALPHABET,
    GiftCardLiability,
    IsGiftCardLine,
    PlanGiftCardIssuance,
    PlanGiftCardVoid,
    type GiftCardLineFacts,
    type GiftCardOrderFacts,
} from './GiftCardBehavior.js';

const STORED_VALUE_ACCOUNT_ENTITY = 'MJ_BizApps_Orders: Stored Value Accounts';
const STORED_VALUE_TRANSACTION_ENTITY = 'MJ_BizApps_Orders: Stored Value Transactions';

const key = (id: string | null | undefined): string => (id ?? '').toLowerCase();
const quote = (ids: string[]): string => [...new Set(ids.map((i) => `'${i}'`))].join(',');

/** What the caller hands us about the order. */
export interface GiftCardOrder extends GiftCardOrderFacts {
    ID: string;
    IssuingCompanyID: string;
}

/** What the caller hands us about each line. `ProductTypeCode` is resolved here, not by the caller. */
export interface GiftCardOrderLine {
    ID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ReversesOrderLineID: string | null;
    ShipToPersonID: string | null;
    ShipToOrganizationID: string | null;
}

export interface GiftCardOutcome {
    /** Accounts created by this call. Empty on a re-save, which is correct rather than a failure. */
    Issued: Array<{ ID: string; Code: string; FaceValue: number; OrderLineID: string }>;
    /** Total face value minted. What the company now OWES — not what the customer paid. */
    Liability: number;
    /** Accounts voided because a reversal line sent cards back. */
    Voided: string[];
}

/** A crypto-quality character picker over the unambiguous alphabet. */
function randomChar(): string {
    // Web Crypto, not node:crypto — the shared tsconfig sets "types": [], so the node typings are
    // not visible here. Same reason PaymentProviderBehavior uses crypto.subtle.
    const buf = new Uint8Array(1);
    // Rejection-sample so the alphabet stays uniform: 256 is not a multiple of 30, and taking the
    // modulo without rejecting the tail would make the first 16 characters slightly likelier.
    const limit = 256 - (256 % GIFT_CARD_ALPHABET.length);
    for (;;) {
        crypto.getRandomValues(buf);
        if (buf[0] < limit) return GIFT_CARD_ALPHABET[buf[0] % GIFT_CARD_ALPHABET.length];
    }
}

/**
 * Issue every gift card this order's lines confer.
 *
 * Returns an outcome rather than throwing when there is nothing to do — most orders sell no gift
 * cards, and that is not an error. A genuine failure (a save the database refused) does throw, so
 * the enclosing confirm transaction rolls back: an order that took the money and failed to mint the
 * card has sold nothing, and that must not be committed.
 */
export async function IssueGiftCards(
    order: GiftCardOrder,
    lines: GiftCardOrderLine[],
    provider: IMetadataProvider,
    user: UserInfo,
    options?: EntitySaveOptions,
): Promise<GiftCardOutcome> {
    const out: GiftCardOutcome = { Issued: [], Liability: 0, Voided: [] };
    if (!lines.length) return out;

    const rv = new RunView(provider as unknown as IRunViewProvider);
    await LoadOrdersEngine(provider, user);

    const typeCodeByProductID = new Map<string, string | null>();
    for (const line of lines) {
        typeCodeByProductID.set(key(line.ProductID), OrdersEngine.Instance.ProductTypeCode(line.ProductID));
    }

    const facts = (line: GiftCardOrderLine): GiftCardLineFacts => ({
        ID: line.ID,
        ProductID: line.ProductID,
        ProductTypeCode: typeCodeByProductID.get(key(line.ProductID)) ?? null,
        Quantity: Number(line.Quantity ?? 0),
        UnitPrice: Number(line.UnitPrice ?? 0),
        ReversesOrderLineID: line.ReversesOrderLineID,
        ShipToPersonID: line.ShipToPersonID,
        ShipToOrganizationID: line.ShipToOrganizationID,
    });

    const giftCardLines = lines.filter((l) => IsGiftCardLine(facts(l)));
    if (!giftCardLines.length) return out;

    // WHAT HAS ALREADY BEEN ISSUED. One query across every gift-card line on the order, so a re-save
    // costs one round trip and mints nothing. Reversal lines are included because voiding needs to
    // find the ORIGIN line's cards.
    const relevantLineIDs = [
        ...giftCardLines.map((l) => l.ID),
        ...giftCardLines.map((l) => l.ReversesOrderLineID).filter((x): x is string => !!x),
    ];
    const existing = await rv.RunView<{ ID: string; IssuedFromOrderLineID: string; Status: string }>(
        {
            EntityName: STORED_VALUE_ACCOUNT_ENTITY,
            ExtraFilter: `IssuedFromOrderLineID IN (${quote(relevantLineIDs)})`,
            ResultType: 'simple',
        },
        user,
    );
    const issuedByLine = new Map<string, Array<{ ID: string; Status: string }>>();
    for (const row of existing.Results ?? []) {
        const k = key(row.IssuedFromOrderLineID);
        if (!issuedByLine.has(k)) issuedByLine.set(k, []);
        issuedByLine.get(k)!.push({ ID: row.ID, Status: row.Status });
    }

    for (const line of giftCardLines) {
        // ── A REVERSAL: void, never mint ──────────────────────────────────────────────────────────
        if (line.ReversesOrderLineID) {
            const originCards = (issuedByLine.get(key(line.ReversesOrderLineID)) ?? []).filter(
                (c) => c.Status === 'Active',
            );
            const toVoid = PlanGiftCardVoid(Number(line.Quantity ?? 0), originCards.length);
            for (let i = 0; i < toVoid; i++) {
                const account = await provider.GetEntityObject<mjBizAppsOrdersStoredValueAccountEntity>(
                    STORED_VALUE_ACCOUNT_ENTITY,
                    user,
                );
                if (!(await account.Load(originCards[i].ID))) {
                    continue;
                }
                // Voided, not Depleted: the card was never spent, it was un-sold. Keeping the two
                // apart is what lets breakage reporting tell a card the customer used from one the
                // company took back.
                account.Status = 'Voided';
                const balanceBefore = Number(account.CurrentBalance ?? 0);
                account.CurrentBalance = 0;
                if (!(await account.Save(options))) {
                    throw new Error(
                        `Could not void gift card ${originCards[i].ID} for returned line ${line.ID}: ` +
                            `${account.LatestResult?.CompleteMessage ?? 'no reason given'}`,
                    );
                }
                // The ledger has to show the money leaving, or the account's balance and its
                // transaction history stop agreeing.
                if (balanceBefore > 0) {
                    await writeTransaction(
                        provider,
                        user,
                        originCards[i].ID,
                        'Refund',
                        -balanceBefore,
                        0,
                        order.ID,
                        options,
                    );
                }
                out.Voided.push(originCards[i].ID);
            }
            continue;
        }

        // ── An ordinary gift-card line ────────────────────────────────────────────────────────────
        // Already issued? Then this is a re-save and there is nothing to do. Checked against the
        // database, not memory: the second save is a different object than the first.
        if ((issuedByLine.get(key(line.ID)) ?? []).length > 0) continue;

        const plan = PlanGiftCardIssuance(facts(line), order);
        if (!plan.Cards.length) {
            // A gift-card product that issues nothing is worth failing over rather than shrugging
            // at — a zero-value or fractional-quantity card line means somebody sold something that
            // cannot exist, and letting it through books revenue against no instrument.
            throw new Error(
                `Order line ${line.ID} is a gift-card product but issues no card (${plan.Refusal}). ` +
                    `A gift card needs a whole positive quantity and a face value above zero.`,
            );
        }

        for (const card of plan.Cards) {
            const account = await provider.GetEntityObject<mjBizAppsOrdersStoredValueAccountEntity>(STORED_VALUE_ACCOUNT_ENTITY, user);
            account.NewRecord();
            account.Code = FormatGiftCardCode(randomChar);
            account.IssuingCompanyID = order.IssuingCompanyID;
            account.InitialAmount = card.FaceValue;
            account.CurrentBalance = card.FaceValue;
            account.Status = 'Active';
            account.IssuedFromOrderLineID = card.OrderLineID;
            if (card.BeneficiaryPersonID) account.BeneficiaryPersonID = card.BeneficiaryPersonID;
            if (card.BeneficiaryOrganizationID) {
                account.BeneficiaryOrganizationID = card.BeneficiaryOrganizationID;
            }
            // ExpiresAt stays null. Breakage and expiry are deferred (§21), and a card with an
            // expiry nothing enforces would be worse than one with none.

            if (!(await account.Save(options))) {
                throw new Error(
                    `Could not issue gift card ${card.Sequence} of ${plan.Cards.length} for line ` +
                        `${card.OrderLineID}: ${account.LatestResult?.CompleteMessage ?? 'no reason given'}`,
                );
            }

            const accountID = account.ID;
            await writeTransaction(
                provider,
                user,
                accountID,
                'Issue',
                card.FaceValue,
                card.FaceValue,
                order.ID,
                options,
            );

            out.Issued.push({
                ID: accountID,
                Code: account.Code,
                FaceValue: card.FaceValue,
                OrderLineID: card.OrderLineID,
            });
        }
        out.Liability += GiftCardLiability(plan);
    }

    out.Liability = Math.round((out.Liability + Number.EPSILON) * 100) / 100;
    return out;
}

/** One signed movement on a card's ledger. */
async function writeTransaction(
    provider: IMetadataProvider,
    user: UserInfo,
    storedValueAccountID: string,
    type: 'Issue' | 'Redeem' | 'Refund' | 'Adjust' | 'Expire',
    amount: number,
    balanceAfter: number,
    relatedOrderHeaderID: string | null,
    options?: EntitySaveOptions,
): Promise<void> {
    const txn = await provider.GetEntityObject<mjBizAppsOrdersStoredValueTransactionEntity>(STORED_VALUE_TRANSACTION_ENTITY, user);
    txn.NewRecord();
    txn.StoredValueAccountID = storedValueAccountID;
    txn.TransactionType = type;
    txn.Amount = amount;
    txn.BalanceAfter = balanceAfter;
    if (relatedOrderHeaderID) txn.RelatedOrderHeaderID = relatedOrderHeaderID;
    txn.OccurredAt = new Date();
    if (!(await txn.Save(options))) {
        throw new Error(
            `Could not write the ${type} transaction for stored-value account ${storedValueAccountID}: ` +
                `${txn.LatestResult?.CompleteMessage ?? 'no reason given'}`,
        );
    }
}

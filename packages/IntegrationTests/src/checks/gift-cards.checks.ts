/**
 * gift-cards — issuance on sale, and the liability it creates (D44).
 *
 * WHY THIS BUNDLE EXISTS
 * Selling a gift card is the one sale that earns NOTHING. Money comes in and goods are owed, so the
 * credit leg is a liability and revenue appears later, on whatever order the card is eventually
 * spent on. Recognising at issue AND at redemption is the classic gift-card double-count, and it is
 * invisible from the ledger: both entries balance, the order reconciles, the customer is billed
 * correctly. Only the revenue figure is wrong.
 *
 * The redemption half already worked — `StoredValuePaymentProvider` spends a card as a tender. What
 * did not exist was ISSUANCE: nothing created the card when one was sold, so the schema shipped and
 * the feature did not.
 *
 * WHAT IT PROVES
 *   GC1   selling a gift card issues a StoredValueAccount with the line's face value
 *   GC2   quantity 3 issues THREE cards, not one card worth three times as much
 *   GC3   the opening ledger entry is written, and the balance agrees with it
 *   GC4   the card credits a LIABILITY, never Sales — the double-count guard
 *   GC5   no revenue-recognition schedule is created for a gift-card line
 *   GC6   re-saving a confirmed order issues NOTHING (idempotency — free money otherwise)
 *   GC7   the beneficiary is the line's ship-to, falling back to the buyer
 *   GC8   a discounted card is still worth its FACE value, not what was paid
 *   GC9   returning a gift-card line VOIDS the card and zeroes its balance
 *   GC10  a partial return voids only that many cards
 *   GC11  an ordinary product issues nothing at all
 *   GC12  the issued card is spendable — it round-trips into a redemption
 *
 * Deterministic. Every check runs inside a rolled-back transaction.
 *
 * CONNECTS TO:
 *   CODE: GiftCardEngine · GiftCardBehavior · OrderJournalEntryFactory (the liability leg)
 *   PURE: packages/CoreEntitiesServer/src/__tests__/GiftCardBehavior.test.ts
 *   DOC:  plans/bizapps-orders-master.md D4, D27, D44
 */
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import {
  ACCT_SCHEMA,
  CreateOrdersFixture,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
} from "../fixture.js";
import { ConfirmOrder } from "../order-builder.js";

interface CardRow {
  ID: string;
  Code: string;
  InitialAmount: number;
  CurrentBalance: number;
  Status: string;
  IssuedFromOrderLineID: string;
  BeneficiaryPersonID: string | null;
  BeneficiaryOrganizationID: string | null;
}

/** Every card issued by an order, oldest first. */
const cardsOf = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<CardRow>(
    ctx,
    `SELECT sva.ID, sva.Code, sva.InitialAmount, sva.CurrentBalance, sva.Status,
            sva.IssuedFromOrderLineID, sva.BeneficiaryPersonID, sva.BeneficiaryOrganizationID
       FROM ${ORDERS_SCHEMA}.StoredValueAccount sva
       JOIN ${ORDERS_SCHEMA}.OrderLine ol ON ol.ID = sva.IssuedFromOrderLineID
      WHERE ol.OrderHeaderID = '${orderID}'
      ORDER BY sva.Code`,
  );

/** A card's ledger, oldest first. */
const ledgerOf = (ctx: IntegrationCheckContext, cardID: string) =>
  TxQuery<{ TransactionType: string; Amount: number; BalanceAfter: number }>(
    ctx,
    `SELECT TransactionType, Amount, BalanceAfter
       FROM ${ORDERS_SCHEMA}.StoredValueTransaction
      WHERE StoredValueAccountID = '${cardID}'
      ORDER BY OccurredAt, TransactionType`,
  );

/** The ledger lines an order's booking produced, by account code. */
const bookingLines = (ctx: IntegrationCheckContext, orderID: string) =>
  TxQuery<{ Code: string; Name: string; DebitAmount: number; CreditAmount: number; EntryType: string; EffectiveDate: string | null }>(
    ctx,
    `SELECT gl.Code, gl.Name, jel.DebitAmount, jel.CreditAmount, je.EntryType, je.EffectiveDate
       FROM ${ACCT_SCHEMA}.JournalEntry je
       JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
       JOIN ${ACCT_SCHEMA}.GLAccount gl ON gl.ID = jel.GLAccountID
      WHERE je.LinkedRecordID IN
            (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${orderID}')`,
  );

/** Sell `qty` gift cards at `price` each. */
async function sellGiftCards(
  ctx: IntegrationCheckContext,
  qty = 1,
  price = 50,
  extra: Record<string, unknown> = {},
) {
  const f = Fx();
  const result = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    BillToPersonID: f.Customers.PersonID,
    Lines: [{ ProductID: f.Products.GiftCardA, Quantity: qty, UnitPrice: price, ...extra }],
  });
  Assert(result.Saved, `confirm failed: ${result.Message}`);
  return result;
}

export const GiftCardChecks: NamedCheck[] = [
  {
    Id: "gift-cards.GC1",
    Name: "GC1: selling a gift card issues a stored-value account at the line's face value",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 1, 50);
        const cards = await cardsOf(ctx, order.Order.ID as string);

        AssertEqual(cards.length, 1, "one card for a quantity-one line");
        AssertEqual(Number(cards[0].InitialAmount), 50, "face value from the line");
        AssertEqual(Number(cards[0].CurrentBalance), 50, "a fresh card is worth its face value");
        AssertEqual(cards[0].Status, "Active", "and it is spendable");
        Assert(
          /^GC-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}(-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}){3}$/.test(cards[0].Code),
          `the code should be readable and unambiguous, got '${cards[0].Code}'`,
        );
      }),
  },
  {
    Id: "gift-cards.GC2",
    Name: "GC2: quantity three issues THREE cards, not one worth three times as much",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 3, 50);
        const cards = await cardsOf(ctx, order.Order.ID as string);

        // Somebody buying three gift cards expects three cards. Issuing one for 150 would satisfy
        // every total on the order and hand them a single card they cannot split.
        AssertEqual(cards.length, 3, "three cards");
        for (const c of cards) AssertEqual(Number(c.InitialAmount), 50, "each worth the unit price");
        AssertEqual(
          cards.reduce((s, c) => s + Number(c.InitialAmount), 0),
          150,
          "and together they are the line total",
        );
        AssertEqual(new Set(cards.map((c) => c.Code)).size, 3, "with three distinct codes");
      }),
  },
  {
    Id: "gift-cards.GC3",
    Name: "GC3: the opening ledger entry is written and the balance agrees with it",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 1, 75);
        const [card] = await cardsOf(ctx, order.Order.ID as string);
        const ledger = await ledgerOf(ctx, card.ID);

        AssertEqual(ledger.length, 1, `exactly one opening entry: ${JSON.stringify(ledger)}`);
        AssertEqual(ledger[0].TransactionType, "Issue", "and it is an Issue");
        AssertEqual(Number(ledger[0].Amount), 75, "for the face value");
        // The account's balance and its ledger must never disagree — that is the whole point of
        // keeping a ledger rather than only a balance column.
        AssertEqual(
          Number(ledger[0].BalanceAfter),
          Number(card.CurrentBalance),
          "BalanceAfter matches the account",
        );
      }),
  },
  {
    Id: "gift-cards.GC4",
    Name: "GC4: the sale credits a LIABILITY, never Sales — the double-count guard",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 1, 50);
        const lines = await bookingLines(ctx, order.Order.ID as string);
        Assert(lines.length > 0, "the sale booked something");

        // THE ASSERTION THAT MATTERS. If this line credited Sales, revenue would be recognised now
        // AND again when the card is spent — and every entry involved would still balance.
        const salesCredit = lines
          .filter((l) => l.Code === "40100")
          .reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
        AssertEqual(salesCredit, 0, `a gift card must credit no revenue: ${JSON.stringify(lines)}`);

        // It landed on an obligation account instead — the dedicated liability if accounting has
        // linked one, otherwise Deferred Revenue, which is the same shape of obligation.
        const obligationCredit = lines
          .filter((l) => /liability|deferred/i.test(l.Name))
          .reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
        AssertEqual(obligationCredit, 50, `the liability carries the face value: ${JSON.stringify(lines)}`);
      }),
  },
  {
    Id: "gift-cards.GC5",
    Name: "GC5: a gift-card line creates no revenue-recognition schedule",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 1, 50);
        const lines = await bookingLines(ctx, order.Order.ID as string);

        // A deferred type releases on DATES. A gift card releases when somebody spends it, which is
        // an event on a different order — so a schedule here would recognise revenue on a timetable
        // that has nothing to do with the customer, and do it a second time at redemption.
        // THE LEDGER IS THE SCHEDULE (D84). This used to also query
        // `RevenueRecognitionSchedule`, which no longer exists — the envelope tables were retired
        // because nothing ever wrote them and the forward-dated entries already are the schedule.
        // So the release entries are the whole assertion, which is what the check was really about.
        const releases = lines.filter((l) => l.EntryType === "RevenueRecognition");
        AssertEqual(releases.length, 0, `no release entries: ${JSON.stringify(releases)}`);

        // And nothing forward-dated at all: a release is identified by its type above, but a gift
        // card must not stage an entry for a future date under any type.
        const future = lines.filter((l) => l.EffectiveDate != null && new Date(l.EffectiveDate) > new Date());
        AssertEqual(future.length, 0, `nothing is staged for a future date: ${JSON.stringify(future)}`);
      }),
  },
  {
    Id: "gift-cards.GC6",
    Name: "GC6: re-saving a confirmed order issues nothing — a second set would be free money",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const order = await sellGiftCards(ctx, 2, 25);
        const before = await cardsOf(ctx, order.Order.ID as string);
        AssertEqual(before.length, 2, "two cards to begin with");

        // Re-save the order exactly as a UI would on any subsequent edit.
        const entity = order.Order as unknown as { Save(): Promise<boolean>; Set(f: string, v: unknown): void };
        entity.Set("Description", "touched");
        Assert(await entity.Save(), "the re-save should succeed");

        const after = await cardsOf(ctx, order.Order.ID as string);
        // Issuing again would reconcile perfectly: the accounts exist, the ledger balances, the
        // order is unchanged. It is simply money the company never sold.
        AssertEqual(after.length, 2, `still two cards, not four: ${JSON.stringify(after.map((c) => c.Code))}`);
        AssertEqual(
          new Set(after.map((c) => c.ID)).size,
          2,
          "and they are the same two accounts",
        );
      }),
  },
  {
    Id: "gift-cards.GC7",
    Name: "GC7: the beneficiary is the line's ship-to, falling back to the buyer",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();

        // Bought for yourself: the buyer holds it.
        const own = await sellGiftCards(ctx, 1, 20);
        const [ownCard] = await cardsOf(ctx, own.Order.ID as string);
        Assert(
          (ownCard.BeneficiaryPersonID ?? "").toLowerCase() === (f.Customers.PersonID ?? "").toLowerCase(),
          `with no recipient named the buyer holds it, got ${ownCard.BeneficiaryPersonID}`,
        );

        // Bought FOR somebody else: the recipient holds it. This is the whole point of a gift card,
        // and the case a buyer-only default would silently get wrong.
        const gifted = await sellGiftCards(ctx, 1, 20, {
          ShipToOrganizationID: f.Customers.SecondOrganizationID,
        });
        const [giftCard] = await cardsOf(ctx, gifted.Order.ID as string);
        Assert(
          (giftCard.BeneficiaryOrganizationID ?? "").toLowerCase() ===
            (f.Customers.SecondOrganizationID ?? "").toLowerCase(),
          `the named recipient holds it, got ${giftCard.BeneficiaryOrganizationID}`,
        );
        // The person side falls back INDEPENDENTLY to the buyer — naming an organization must not
        // blank out who the card is for.
        Assert(
          (giftCard.BeneficiaryPersonID ?? "").toLowerCase() === (f.Customers.PersonID ?? "").toLowerCase(),
          `the person side still falls back to the buyer, got ${giftCard.BeneficiaryPersonID}`,
        );
      }),
  },
  {
    Id: "gift-cards.GC8",
    Name: "GC8: a discounted card is worth its FACE value, not what the customer paid",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        // 20% off a $100 card: the customer pays 80, the company still owes 100 of goods.
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.GiftCardA,
              Quantity: 1,
              UnitPrice: 100,
              DiscountPct: 0.2,
            },
          ],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        const [card] = await cardsOf(ctx, result.Order.ID as string);
        AssertEqual(Number(card.InitialAmount), 100, "the card is worth its face value");

        const line = await TxOne<{ LineTotalNet: number }>(
          ctx,
          `SELECT TOP 1 LineTotalNet FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${result.Order.ID}'`,
        );
        AssertEqual(Number(line.LineTotalNet), 80, "while the customer paid the discounted amount");
        // Deriving the liability from what was PAID would be wrong by exactly the discount — and
        // every other number on the order would still agree with itself.
        Assert(
          Number(card.InitialAmount) !== Number(line.LineTotalNet),
          "the two are deliberately different, and that is the point",
        );
      }),
  },
  {
    Id: "gift-cards.GC9",
    Name: "GC9: returning a gift-card line voids the card and zeroes its balance",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sellGiftCards(ctx, 1, 60);
        const [card] = await cardsOf(ctx, sale.Order.ID as string);
        AssertEqual(card.Status, "Active", "active before the return");

        const soldLine = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${sale.Order.ID}'`,
        );
        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.GiftCardA,
              Quantity: -1,
              UnitPrice: 60,
              ReversesOrderLineID: soldLine.ID,
            },
          ],
        });
        Assert(ret.Saved, `return failed: ${ret.Message}`);

        const after = await TxOne<{ Status: string; CurrentBalance: number }>(
          ctx,
          `SELECT Status, CurrentBalance FROM ${ORDERS_SCHEMA}.StoredValueAccount WHERE ID='${card.ID}'`,
        );
        // Voided, not Depleted: the card was never spent, it was un-sold. Conflating the two would
        // make breakage reporting count a refunded card as one the customer used.
        AssertEqual(after.Status, "Voided", "the card is voided");
        AssertEqual(Number(after.CurrentBalance), 0, "and worth nothing");

        const ledger = await ledgerOf(ctx, card.ID);
        Assert(
          ledger.some((t) => t.TransactionType === "Refund" && Number(t.Amount) === -60),
          `the ledger records the money leaving: ${JSON.stringify(ledger)}`,
        );
      }),
  },
  {
    Id: "gift-cards.GC10",
    Name: "GC10: a partial return voids only as many cards as came back",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const sale = await sellGiftCards(ctx, 3, 40);
        AssertEqual((await cardsOf(ctx, sale.Order.ID as string)).length, 3, "three issued");

        const soldLine = await TxOne<{ ID: string }>(
          ctx,
          `SELECT TOP 1 ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID='${sale.Order.ID}'`,
        );
        const ret = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [
            {
              ProductID: f.Products.GiftCardA,
              Quantity: -1,
              UnitPrice: 40,
              ReversesOrderLineID: soldLine.ID,
            },
          ],
        });
        Assert(ret.Saved, `return failed: ${ret.Message}`);

        const cards = await cardsOf(ctx, sale.Order.ID as string);
        const voided = cards.filter((c) => c.Status === "Voided");
        const active = cards.filter((c) => c.Status === "Active");
        AssertEqual(voided.length, 1, `one card back, one voided: ${JSON.stringify(cards.map((c) => c.Status))}`);
        AssertEqual(active.length, 2, "the customer keeps the other two");
        AssertEqual(
          active.reduce((s, c) => s + Number(c.CurrentBalance), 0),
          80,
          "and they are still worth their face value",
        );
      }),
  },
  {
    Id: "gift-cards.GC11",
    Name: "GC11: an ordinary product issues no stored value at all",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const result = await ConfirmOrder(ctx.User, {
          CompanyID: f.CoA.ID,
          BillToOrganizationID: f.Customers.OrganizationID,
          Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2, UnitPrice: 50 }],
        });
        Assert(result.Saved, `confirm failed: ${result.Message}`);

        AssertEqual((await cardsOf(ctx, result.Order.ID as string)).length, 0, "no cards");

        // And it books revenue the ordinary way — the mirror of GC4, so the liability routing
        // cannot have leaked onto every product.
        const lines = await bookingLines(ctx, result.Order.ID as string);
        const salesCredit = lines
          .filter((l) => l.Code === "40100")
          .reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
        AssertEqual(salesCredit, 100, `an ordinary sale credits Sales: ${JSON.stringify(lines)}`);
      }),
  },
  {
    Id: "gift-cards.GC12",
    Name: "GC12: the issued card is a real instrument — it resolves and can be spent",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        const sale = await sellGiftCards(ctx, 1, 90);
        const [card] = await cardsOf(ctx, sale.Order.ID as string);

        // Issuance and redemption were built at different times against the same table. This is the
        // check that they actually meet: the row issuance writes is the row redemption looks up, by
        // the code printed on the card.
        const found = await TxOne<{ ID: string; CurrentBalance: number; Status: string }>(
          ctx,
          `SELECT ID, CurrentBalance, Status FROM ${ORDERS_SCHEMA}.StoredValueAccount
            WHERE Code = '${card.Code}'`,
        );
        AssertEqual(found.ID.toLowerCase(), card.ID.toLowerCase(), "the code finds the card");
        AssertEqual(Number(found.CurrentBalance), 90, "with its balance intact");
        AssertEqual(found.Status, "Active", "and spendable");

        // The code is unique — the constraint that stops two cards colliding.
        const dupes = await TxOne<{ N: number }>(
          ctx,
          `SELECT COUNT(*) AS N FROM ${ORDERS_SCHEMA}.StoredValueAccount WHERE Code='${card.Code}'`,
        );
        AssertEqual(Number(dupes.N), 1, "and it is unique");
      }),
  },
];

for (const check of GiftCardChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("gift-cards", {
  Setup: async (ctx) => { await CreateOrdersFixture(ctx); },
  Teardown: TeardownOrdersFixture,
});

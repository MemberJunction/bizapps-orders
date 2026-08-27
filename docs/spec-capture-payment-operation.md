# Spec: `Orders.CapturePayment` remote operation

**Status:** requested by the front end, not yet built.
**Owner:** backend.
**Why the front end cannot do this itself:** below.

---

## 1. The problem this solves

Taking a payment in the UI is currently impossible — not unwired, *impossible*.

A payment is a HEADER plus its ALLOCATION LINES, and the two must be written in
one transaction. `PaymentHeaderEntityServer` exposes them the same way
`OrderEntityServer` does:

```ts
// PaymentHeaderEntityServer.ts:95
/** Unsaved allocation lines to persist with this payment (D68). Populate before `Save()`;
 *  they are written inside the same transaction as the header … */
public get Lines(): BaseEntity[]
public set Lines(value: BaseEntity[])
```

`Lines` is **transient — not a column**. CodeGen therefore cannot emit it on the
client entity, and a browser `entity.Save()` has nowhere to put the allocations.
This is exactly the situation that produced `Orders.SaveOrder` for orders, and it
needs the same answer.

The UI is already built and already blocked on it. `payment-entry.page.ts` emits
`CaptureRequested` and calls nothing, because there is nothing to call. It is
recorded in `output-wiring.test.ts` under `AWAITING_OPERATION` so it cannot be
mistaken for finished work.

---

## 2. What the UI already has when the user clicks Capture

This is the emitted payload today — the operation's input should be a
straightforward mapping of it, not a new shape the client has to be rebuilt for.

```ts
CaptureRequested = new EventEmitter<{
    Amount: number;                 // gross received
    Allocations: MJOAllocationMap;  // { [orderHeaderID: string]: number }
    TenderCode: string;             // 'Card' | 'Check' | 'ACH' | 'AccountCredit' | …
    Reference: string;              // cheque number, wire ref, free text
    PaymentDate: string;            // 'YYYY-MM-DD'
}>();
```

The page guarantees, before it emits:

- `Amount > 0`
- `UnallocatedRemainder(Amount, Allocations) === 0` — the allocations already sum
  to the amount, so **D68 holds at the point of the call**

The page also computes a `Fee` (currently illustrative: 2.9% on `Card`, zero
otherwise). **It should not send it.** See §5.

---

## 3. Proposed contract

### Input

```ts
export interface OrdersCapturePaymentInput {
    /** Gross amount received. Must equal the sum of Allocations[].Amount (D68). */
    Amount: number;

    /** Which company received the cash. */
    ReceivingCompanyID: string;

    /** Who paid. Exactly one of these. */
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;

    /** Tender, by CODE not id — the client should not have to resolve a lookup. */
    TenderCode: string;

    PaymentDate: string;          // 'YYYY-MM-DD'
    Reference?: string | null;
    Notes?: string | null;

    /** Where the money lands. Must be non-empty. */
    Allocations: Array<{
        OrderHeaderID: string;
        Amount: number;
        /** Optional: settle a specific line rather than the order as a whole. */
        OrderLineID?: string | null;
    }>;

    /** Instrument detail, when the tender needs one (card, ACH). */
    PaymentDetail?: {
        PaymentProviderID?: string | null;
        ProviderInstrumentRef?: string | null;
        SourceCustomerPaymentMethodID?: string | null;
        ReferenceNumber?: string | null;
    } | null;

    /** Spend a stored-value balance instead of taking new cash. */
    SourceOrderHeaderID?: string | null;

    /** Compute and validate WITHOUT writing — for the confirmation screen. */
    Preview?: boolean;
}
```

### Output

Mirror `OrdersSaveOrderOutput`'s shape so the client handles both the same way:

```ts
export interface OrdersCapturePaymentOutput {
    Success: boolean;
    Message?: string;

    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    Status?: string | null;              // expected 'Captured'

    /** As booked, after the engine has had its say. */
    Amount?: number;
    ProcessingFeeAmount?: number;
    NetAmount?: number;

    /** What each order looks like AFTER this payment — the UI shows these directly. */
    OrderEffects?: Array<{
        OrderHeaderID: string;
        OrderNumber: string;
        AmountPaid: number;
        Balance: number;
        PaymentStatus: string;
    }>;

    /** The entries this produced, so the screen can show what moved. */
    JournalEntries?: JournalEntryPreview[];   // reuse the PreviewConfirm type
    EntryCount?: number;
    AllBalanced?: boolean;

    /** Refusals, in the shape the UI already renders. */
    Blockers?: BlockerResult[];
}
```

`JournalEntryPreview` and `BlockerResult` already exist in
`metadata/remote-operations/types/` — reuse rather than redeclare, the way the
order operations share `OrderTotalsResult`.

---

## 4. Behaviour

1. **Resolve** `TenderCode` → `PaymentTypeID`. Refuse an unknown code with a
   blocker naming it; do not silently fall back to a default tender.
2. **Create** the `PaymentHeader`, `Status = 'Pending'`.
3. **Create** a `PaymentDetail` when `PaymentDetail` is supplied, and link it.
4. **Build** the allocation lines and assign them to `header.Lines` — the
   transient collection. This is the whole point of the operation.
5. **Transition** to `Captured` and `Save()` once, inside one transaction. The
   existing engine does the rest: `PaymentLineEntityServer` books each allocation,
   the fee leg follows, and the order rollups (`AmountPaid`, `Balance`,
   `PaymentStatus`) update by trigger.
6. **Project** the saved state into the output by READING what the engine
   computed. Do not recompute — that is the mistake `PreviewConfirm` made with
   placeholder totals, and it produced a screen that quietly disagreed with the
   ledger.

### Preview

`Preview: true` should run **the real capture inside a transaction that always
rolls back**, exactly as `Orders.PreviewOrder` does. Not a reimplementation. A
preview that models the arithmetic separately will eventually disagree with the
capture, and the disagreement shows up as a balanced journal entry for the wrong
amount — which nothing downstream can catch.

---

## 5. Decisions I would like the backend to make, not the client

**The fee is the server's number.** The page currently computes 2.9% on card as a
placeholder. The client must not send a fee — it has no access to the provider's
schedule, and a client-supplied fee is a client-supplied general-ledger amount.
Return `ProcessingFeeAmount` in the output and the page will display what came
back. I will delete the local calculation the day this lands.

**Idempotency.** A double-clicked Capture must not take the money twice. Whatever
key you choose — a client-supplied token, or `ProviderChargeID` when a provider
is involved — please state it in the output so the UI can be honest about a
retry rather than guessing.

**Over-payment.** D68 says a payment may exceed what is owed and the surplus
becomes a credit (a negative balance). The UI already allows allocating more than
an order's balance. Please confirm the operation accepts it rather than refusing,
since the account-credit screen depends on credits existing.

---

## 6. Validation the operation should own

The page enforces these before emitting, but the operation is the trust boundary
and must not rely on that:

| Rule | Refusal |
|---|---|
| `Amount` equals the sum of allocations (D68) | blocker, not a silent adjustment |
| `Allocations` non-empty | blocker |
| Every `OrderHeaderID` is a UUID | reject — these reach SQL filter text |
| Every allocation `Amount > 0` | blocker |
| Orders exist and belong to `ReceivingCompanyID` | blocker naming the order |
| `TenderCode` resolves | blocker naming the code |
| Exactly one of `BillToOrganizationID` / `BillToPersonID` | blocker |

The UUID one is not hypothetical — `GetOverdueWorklist` interpolated
caller-supplied ids straight into `ExtraFilter`, and `' OR 1=1 --` in a customer
id widened the result set rather than erroring. `sql-guards.ts` has
`RequireUUID` / `RequireUUIDs` ready to use at the boundary.

---

## 7. Registration

Follow the existing ten:

- Row in `metadata/remote-operations/.orders-remote-operations.json`
  — `ExecutionMode: 'Sync'` (only `SpawnRenewals` is `LongRunning`)
  — category `Payments and Credits` (**no ampersand** — the `@lookup` resolver
    splits on `&`)
- Input/output types in `metadata/remote-operations/types/`, remembering that
  CodeGen emits definitions **verbatim with no import resolution**, so shared
  shapes live in one file and are not imported across siblings
- `@RegisterClass(BaseRemotableOperation, 'Orders.CapturePayment')`

---

## 8. What I will do when it lands

1. Wire `CaptureRequested` → `Orders.CapturePayment` in
   `orders-sections.component.ts`, alongside the confirm pre-flight.
2. Delete the client-side fee calculation and display the returned figure.
3. Remove `CaptureRequested` from `AWAITING_OPERATION` in
   `output-wiring.test.ts` — the guard asserts that list shrinks rather than
   quietly keeps excusing a control that could now work.
4. Run the write test: take a real payment against a real order and assert the
   journal entries land balanced and the order rollups move.

One call from the client, please — the page has everything it needs at the moment
of the click, and a two-step create-then-allocate flow would put a payment with no
allocations in the database between the steps.

# UI Architecture — bind to the primitives, not to a service layer

> **The rule:** no data-access service layer. Angular components talk to `BaseEntity` subclasses and
> Remote Operation classes directly. Services are for Angular-shaped, non-persistent state only.

## Why this is different from ordinary Angular advice

The classical Angular service layer exists to solve four problems. In a MemberJunction app, three of
them are already solved by stronger primitives, and wrapping those primitives makes each one *worse*.

**Data access.** `BaseEntity` already is the data access layer, and it is network-transparent: the
same object runs against GraphQL in the browser and SQL on the server, because the provider is
injected rather than assumed. A service that wraps it is a second, weaker abstraction over an
existing one.

**Typing.** This is where the real damage is. Generated entity classes are typed from the schema —
the compiler knows `OrderLine.Status` is a closed union and `LineTotalGross` is `DECIMAL(18,2)`. A
service that accepts and returns DTOs re-types the same data by hand, and every field is a place the
two can drift. In practice the boundary degrades to `any` and the strong typing the platform
generated for free is thrown away one method signature at a time.

**Orchestration.** That is what Remote Operations *are*: typed, registered, network-capable units of
server work, with a generated base class per operation. `Orders.CapturePayment` already has an
`.Execute()` with a typed input and output. A service method wrapping it adds a call with a weaker
contract and one more place for the shapes to disagree.

**Shared state.** The one job that genuinely remains — and for cached, metadata-shaped data
(`PaymentTypes`, `ChargeTypes`, GL roles) `BaseEngine` already covers it.

## What changed in MJ 6.1, and why the old pattern existed at all

Before related-record collections, composing a header and its lines in the browser was *impossible*
to do with entities: the collection did not exist client-side, and the client provider cannot open a
transaction. So this app grew `OrderDraft` — a hand-maintained mirror of the entity shape whose only
job was to cross the wire — plus `HydrateOrderDraft`, several hundred lines that turned it back into
entities on the server. That is pure translation loss in both directions, and it is where the
service layer came from.

`DeclareRelatedRecords` removes the reason. `order.Lines.Create()` works in the browser, `Validate()`
runs the same rules on both tiers, and `order.Save()` ships the whole graph in one call. The service
was never the pattern — it was scaffolding around a missing primitive.

## The patterns

**Read one record and its children**

```typescript
const md = new Metadata();
const order = await md.GetEntityObject<OrderEntity>('MJ_BizApps_Orders: Orders');
await order.Load(orderId);
await order.Lines.Load();          // or LoadRelatedRecords() for every declared collection
```

**Read a list — never loop children (that is the N+1)**

```typescript
const rv = new RunView();
const result = await rv.RunView<OrderEntity>({
    EntityName: 'MJ_BizApps_Orders: Orders',
    ExtraFilter: `Status = 'Draft'`,
    ResultType: 'entity_object',   // real entities, not rows
    IncludeRelatedRecords: ['Lines'],  // 1 + K queries for ALL orders' lines
});
```

**Compose and save — one call, one transaction**

```typescript
const line = await order.Lines.Create();   // stamps the FK and the LineNumber for you
line.ProductID = productId;
line.Quantity = 2;

if (!(await order.Save())) {               // header + lines, one unit of work
    this.error = order.LatestResult?.CompleteMessage;
}
```

**Validate before the round trip**

```typescript
const result = order.Validate();           // the SAME rules the server runs
if (!result.Success) {
    this.errors = result.Errors;           // attributed by position, e.g. Lines[3].Quantity
    return;                                // no network call at all
}
```

That works because the rules live on the shared subclass (`OrderHeaderEntity` in
`@mj-biz-apps/orders-entities`), not on the server subclass. Anything decidable from the record and
its children belongs there; anything needing the database stays in `OrderEntityServer`.

**Server-side work — call the operation**

```typescript
const op = new OrdersCapturePaymentOperation();
const result = await op.Execute({ PaymentID: id, Amount: amount });
```

**Cached lookups — ask the engine**

```typescript
await OrdersEngine.Instance.Config();
const type = OrdersEngine.Instance.PaymentTypeByCode('CreditCard');
```

## What a service IS still for

Angular-shaped, non-persistent state. A helper class, injected for lifetime and DI, holding nothing
that belongs in a table:

- wizard step, selection, expand/collapse, filter-panel state
- router coordination and navigation intent
- cross-component UI coordination that has no entity behind it

If a method on it loads, saves, validates or maps entity data, it is in the wrong place.

## The test to apply in review

> Could a non-Angular host — a script, a server job, another app — do this same work with the same
> objects?

If yes, it belongs on the entity, the shared subclass, or a Remote Operation. If the answer is "no,
because the logic is trapped in a service", the logic is in the wrong layer, and the giveaway is
usually a DTO that mirrors an entity.

## See also

- `packages/Entities/src/OrderHeaderEntity.ts` — the shared subclass and what belongs on it
- `metadata/entity-relationships/` — how `Lines` is declared (metadata, not TypeScript)
- MJ: `packages/MJCore/docs/related-record-collections.md`

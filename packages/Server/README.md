# `@mj-biz-apps/orders-server`

**The bootstrap.** Its job is to make sure every `@RegisterClass` decorator in this app has actually
fired before a request is served.

## Why it exists

MJ resolves entity subclasses and remotable operations through `ClassFactory` at runtime. A
decorator only registers when its module is **loaded**, and a bundler will happily tree-shake a
module nothing imports by name. The failure mode is quiet and expensive: `Metadata.GetEntityObject`
returns the *base* entity, `Save()` writes the row without running a single business rule, and the
order books with no journal entry.

So this package imports the `Load*` anchors explicitly:

```ts
LoadOrderEntityServer();
LoadRefundPaymentOperation();      // 'Orders.RefundPayment'          (D17)
LoadApplyAccountCreditOperation(); // 'Orders.ApplyAccountCredit'     (D68)
LoadPreviewPriceOperation();       // 'Orders.PreviewPrice'           (D69)
LoadDefaultPriceResolver();        // the resolver the walk falls back to
LoadPromotionEngine();             // the promotion qualifier seam    (D70)
LoadTaxResolver();                 // the address → jurisdiction seam (D73)
```

Each anchor is an empty exported function. Its only purpose is to be a name a bundler cannot prove
is unused.

**Adding a registered class? Add its anchor here.** Nothing will fail loudly if you forget — the base
class will be used instead, and the first symptom is a financial one.

## Also here

- `config.ts` — server configuration
- `src/generated/` — CodeGen's GraphQL resolvers. Do not edit; see the Entities package README.

## Verifying registration

The integration suite is the real check: it resolves entities through the same `ClassFactory` a
request does, so a missing anchor shows up as a rule not running. If a check fails in a way that
looks like "the guard didn't fire", suspect a missing anchor before suspecting the guard.

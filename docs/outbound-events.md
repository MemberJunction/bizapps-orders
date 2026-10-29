# Outbound events

Orders tells registered consumers when a **sale confirms** (renewals included) and when an **entitlement grant is created, or its status or validity dates change**. A CRM can create a deal per purchase; a downstream system that keeps its own copy of access can provision and revoke without polling.

## Registering a consumer

```typescript
import { RegisterClass } from '@memberjunction/global';
import { OrdersOutboundConsumer, type OutboundEventEnvelope, type OutboundEventType } from '@mj-biz-apps/orders-core-entities-server';

@RegisterClass(OrdersOutboundConsumer, 'crm-deals')          // the key is recorded on each delivery row
export class CrmDealsConsumer extends OrdersOutboundConsumer {
    public override get EventTypes(): ReadonlyArray<OutboundEventType> {
        return ['OrderConfirmed'];                              // default: both types
    }
    public override get GatesAccess(): boolean {
        return false;                                           // true when this delivery decides whether access is ready
    }
    public override async Deliver(event: OutboundEventEnvelope): Promise<void> {
        // Resolve when accepted; throw to have it retried. Dedupe on event.EventID.
    }
}
```

Reference the class from the server bootstrap so the decorator is not tree-shaken away. For one key, the highest-priority registration wins. With no consumer registered for an event type, nothing is recorded.

## Events

| `EventType` | When | `Payload` |
|---|---|---|
| `OrderConfirmed` | The first save that confirms a `Sale` order, renewals included. Returns, cancellations, amendments and account credits do not fire it; their effect on access arrives as `GrantStatusChanged`. A later save of a confirmed order does not fire again. | `OrderID`, `OrderNumber`, `OrderType`, `OrderDate`, `CompanyID`, `Origin`, `BillToPersonID`, `BillToOrganizationID`, `TotalGross`, `IsRenewal`, `Lines[]` (`OrderLineID`, `ProductID`, `Quantity`, `UnitPrice`, `LineTotalGross`, `RenewsSubscriptionID`, `ReversesOrderLineID`, `ShipToPersonID`, `ShipToOrganizationID`), `CheckoutAnswers[]` (`QuestionKey`, `QuestionLabel`, `Answer`, `OtherText`; the buyer's answers to the checkout widget's questions, ordered by `QuestionKey`, empty when none were asked) |
| `GrantStatusChanged` | A grant is created, or a save changes its `Status`, `ValidFrom` or `ValidTo` — whoever wrote it (booking, payment gating, a return or cancellation, a term extension or shift, a cancel that moves the end of access, an access override, a person). A save that changes none of the three records nothing. The name is kept from when only the status counted; a consumer that keeps a copy of access re-reads the grant on any of them. | `GrantID`, `Code`, `FromStatus` (null when new), `ToStatus`, `SuspensionReason`, `OrderLineID`, `SubscriptionID`, `SubscriptionTermID`, `BeneficiaryPersonID`, `BeneficiaryOrganizationID`, `ValidFrom`, `ValidTo`, `ChangedFields` (`Status` / `ValidFrom` / `ValidTo`; empty when new), `FromValidFrom`, `FromValidTo` (null when new). A term grant's `ValidFrom` / `ValidTo` cover its term's days in full in the business zone: `ValidTo` is 00:00 business time on the day after the last day |

The envelope is `{ EventID, EventType, OccurredAt, OrderHeaderID, EntitlementGrantID, Payload }`. `EventID` is stable across retries.

A term that lapses without renewal changes nothing on the grant, so it fires no event.

## How delivery works

1. **Recorded with the change.** `OutboundEvent` and one `OutboundDelivery` per consumer are written in the same transaction as the confirm or the grant save. A rolled-back confirm leaves no event; a committed one cannot lose it. Nothing is sent inside that transaction.
2. **Sent after it.** The `Orders — Dispatch Outbound Events (every minute)` scheduled job runs `DispatchOutboundDeliveries`. The checkout edge also dispatches a completed order's events right after `/complete`, so a buyer does not wait for the clock.
3. **Claimed once, oldest first.** A pass claims due `Pending` rows in one statement under a 5-minute lease, so two passes never send the same row at the same time.
4. **Bounded.** A `Deliver` call that has not settled after 30 seconds counts as a failed attempt. A pass that runs short of lease hands its unsent rows back for the next pass instead of sending them.
5. **Retried, then dead-lettered.** A consumer that throws or times out is tried again after 1, 5, 15 and 60 minutes, then every 4 hours, until 24 hours after the event; then the row is `DeadLettered`. `LastError` keeps the consumer's message, and an alert Task ("Outbound delivery failed: …", one per event) tells a person: it is assigned to the active holders of the role the `AlertTaskRole` setting names, as every Orders alert Task is. With no role set, the Task is raised unassigned and the log carries `[ORDERS-OUTBOUND-DEAD-LETTER]`. The alert never fails the pass.
6. **At least once.** A consumer can see an event twice (a timed-out call that later succeeded, a crash between its success and the write). Dedupe on `EventID`.

## Access status on the checkout's success screen

A consumer whose delivery decides whether the buyer's access is ready declares `GatesAccess`. After a checkout completes, the public checkout polls `POST /checkout/access-status` (`{ sessionId, clientSessionKey }`, a confirmed session only) every 2 seconds for up to a minute. The state is read from the order's gating deliveries:

| State | Meaning | Success screen (overridable in the widget's `accessMessages`) |
|---|---|---|
| `Ready` | every gating delivery was accepted | `ready`: "Your access is ready." |
| `Pending` | at least one is still being tried | `pending`: "Your access is being set up…" |
| `Failed` | at least one was dead-lettered | `failed`: "We couldn't finish setting up your access. Please contact support." |
| `NotTracked` | no consumer gates access | nothing extra; the confirmation is as before |

Each change is also dispatched as a bubbling, composed `checkout-access-state` DOM event with `{ state }`. A configured `redirectUrl` is followed once the state is final or the wait runs out.

## Operating it

- `OutboundDelivery` rows show each consumer's status per event, and can be read per order through `OutboundEvent.OrderHeaderID`.
- To re-send a dead-lettered row, set its `Status` back to `Pending` and its `DeadlineAt` into the future; the next pass sends it.

## Where the code lives

| What | Where |
|---|---|
| Consumer base class, envelope, recording, dispatch, and the retry, lease and timeout constants | [`packages/CoreEntitiesServer/src/OutboundEvents.ts`](../packages/CoreEntitiesServer/src/OutboundEvents.ts) |
| `OrderConfirmed`, recorded in the booking transaction | `recordOrderConfirmedEvent` in [`packages/CoreEntitiesServer/src/OrderEntityServer.ts`](../packages/CoreEntitiesServer/src/OrderEntityServer.ts) |
| `GrantStatusChanged`, recorded when a grant is created or a save changes its `Status`, `ValidFrom` or `ValidTo` | [`packages/CoreEntitiesServer/src/EntitlementGrantEntityServer.ts`](../packages/CoreEntitiesServer/src/EntitlementGrantEntityServer.ts) |
| The `Orders.DispatchOutboundEvents` action the scheduled job runs | [`packages/Server/src/custom/dispatch-outbound-events.action.ts`](../packages/Server/src/custom/dispatch-outbound-events.action.ts) |
| The action and job metadata | [`metadata/actions/.orders-outbound-actions.json`](../metadata/actions/.orders-outbound-actions.json), [`metadata/scheduled-jobs/.orders-outbound-scheduled-jobs.json`](../metadata/scheduled-jobs/.orders-outbound-scheduled-jobs.json) |
| The dispatch after `/complete`, and `POST /checkout/access-status` | [`packages/Server/src/CheckoutServerExtension.ts`](../packages/Server/src/CheckoutServerExtension.ts) |
| The access state, read from the gating deliveries | [`packages/CoreEntitiesServer/src/CheckoutAccessStatus.ts`](../packages/CoreEntitiesServer/src/CheckoutAccessStatus.ts) |
| The success screen's polling interval, timeout and default messages | [`packages/Angular/src/lib/checkout-widget/checkout-access.ts`](../packages/Angular/src/lib/checkout-widget/checkout-access.ts) |
| Checks against a real database | [`packages/IntegrationTests/src/checks/outbound-events.checks.ts`](../packages/IntegrationTests/src/checks/outbound-events.checks.ts) |

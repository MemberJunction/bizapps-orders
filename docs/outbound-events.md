# Outbound events

Orders tells registered consumers when an **order confirms** (renewals included) and when an **entitlement grant is created or its status changes**. A CRM can create a deal per purchase; a downstream system that keeps its own copy of access can provision and revoke without polling.

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
| `OrderConfirmed` | The first save that confirms an order, renewals included. A later save of a confirmed order does not fire again. | `OrderID`, `OrderNumber`, `OrderType`, `OrderDate`, `CompanyID`, `Origin`, `BillToPersonID`, `BillToOrganizationID`, `TotalGross`, `IsRenewal`, `Lines[]` (`OrderLineID`, `ProductID`, `Quantity`, `UnitPrice`, `LineTotalGross`, `RenewsSubscriptionID`, `ReversesOrderLineID`, `ShipToPersonID`, `ShipToOrganizationID`) |
| `GrantStatusChanged` | A grant is created, or a save changes its `Status` — whoever wrote it (booking, payment gating, a return or cancellation, an access override, a person). | `GrantID`, `Code`, `FromStatus` (null when new), `ToStatus`, `SuspensionReason`, `OrderLineID`, `SubscriptionID`, `SubscriptionTermID`, `BeneficiaryPersonID`, `BeneficiaryOrganizationID`, `ValidFrom`, `ValidTo` |

The envelope is `{ EventID, EventType, OccurredAt, OrderHeaderID, EntitlementGrantID, Payload }`. `EventID` is stable across retries.

A term that lapses without renewal changes nothing on the grant, so it fires no event.

## How delivery works

1. **Recorded with the change.** `OutboundEvent` and one `OutboundDelivery` per consumer are written in the same transaction as the confirm or the grant save. A rolled-back confirm leaves no event; a committed one cannot lose it. Nothing is sent inside that transaction.
2. **Sent after it.** The `Orders — Dispatch Outbound Events (every minute)` scheduled job runs `DispatchOutboundDeliveries`. The checkout edge also dispatches a completed order's events right after `/complete`, so a buyer does not wait for the clock.
3. **Claimed once.** A pass claims due `Pending` rows in one statement under a 5-minute lease, so two passes never send the same row at the same time.
4. **Retried, then dead-lettered.** A consumer that throws is tried again after 1, 5, 15 and 60 minutes, then every 4 hours, until 24 hours after the event; then the row is `DeadLettered`. `LastError` keeps the consumer's message.
5. **At least once.** A consumer can see an event twice (a lease that ran out while it was still working, a crash between its success and the write). Dedupe on `EventID`.

## Operating it

- `OutboundDelivery` rows show each consumer's status per event, and can be read per order through `OutboundEvent.OrderHeaderID`.
- To re-send a dead-lettered row, set its `Status` back to `Pending` and its `DeadlineAt` into the future; the next pass sends it.

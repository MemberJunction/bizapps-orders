/**
 * @fileoverview The outbound invoice seam — `BaseInvoiceRail`.
 *
 * A RAIL is the system a customer actually holds our invoice in and pays through: Bill.com today,
 * possibly Business Central later. Orders remains the receivable of record; the rail is delivery and
 * collection. This base names the five things a rail has to do and nothing else:
 *
 *   EnsureCustomer     our bill-to party  → the rail's customer id
 *   IssueInvoice       one billing unit   → the rail's invoice id
 *   GetInvoice         the rail's view of an invoice we issued (total, due, status, archived)
 *   CancelInvoice      withdraw an unpaid invoice on the rail
 *   FetchPaymentsSince every receivable payment the rail has changed since a watermark
 *
 * WHY NOT `BaseDeliveryChannel`. That seam carries a rendered HTML document and email recipients; a
 * rail needs structured facts (amount, due date, lines, the frozen document number) and hands back a
 * reference we must persist. Different inputs, different outputs, different idempotency — so a
 * different base (design §3, D-B1).
 *
 * WHY NOT `BasePaymentProvider`. That seam is about taking money at a till: intents, capture, refund.
 * A rail issues documents and reports money that arrived on its own. The two share a type code and a
 * `PaymentProvider` row so that "which Bill.com organisation is this company" is configured once.
 *
 * THE BASE IS NOT DECORATED, on purpose — the resolver detects "nothing registered under this code"
 * by seeing the base class come back (same trick as `BaseDeliveryChannel`).
 *
 * REFUSAL IS A RESULT, NOT AN EXCEPTION. `RailResult` carries `Transient`, which is what lets the
 * sweep retry a timeout and never retry "this customer has no email address".
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** The bill-to party, flattened to what a rail's customer record needs. */
export interface RailCustomerFacts {
    PartyKind: 'Organization' | 'Person';
    /** Our party id — sent as the rail's account number so the link is recoverable from the rail side. */
    PartyID: string;
    Name: string;
    Email: string | null;
    AddressLines: string[];
    City: string | null;
    State: string | null;
    PostalCode: string | null;
    Country: string | null;
}

export interface RailInvoiceLine {
    Description: string;
    Quantity: number;
    UnitPrice: number;
}

/** One billing unit, ready to send. Built by `ExternalInvoiceBehavior.BuildExternalInvoicePayload`. */
export interface RailInvoiceFacts {
    /** The frozen document number — `ORD-1234`, `ORD-1234-2`. Sent as the rail's invoice number. */
    DocumentNumber: string;
    /** `YYYY-MM-DD`. */
    InvoiceDate: string;
    /** `YYYY-MM-DD`, or null for "on receipt". */
    DueDate: string | null;
    /** What the lines must total, to the cent. */
    Amount: number;
    ExternalCustomerRef: string;
    Lines: RailInvoiceLine[];
    Memo: string | null;
}

/** The rail's own view of an invoice we issued. */
export interface RailInvoiceSnapshot {
    ExternalInvoiceRef: string;
    InvoiceNumber: string | null;
    Total: number;
    /** What is still owed on the rail's books, net of applied credits and payments (cleared or scheduled). */
    DueAmount: number;
    /** Payment promised but not yet cleared. */
    ScheduledAmount: number;
    Status: string | null;
    Archived: boolean;
}

/** One receivable payment as the rail reports it. `InvoicePayments` is the fan-out to our invoices. */
export interface RailPaymentRecord {
    ExternalPaymentRef: string;
    ExternalCustomerRef: string | null;
    Amount: number;
    UnappliedAmount: number;
    /** `YYYY-MM-DD` when known. */
    PaymentDate: string | null;
    /** The rail's status string, verbatim — classified by `ExternalPaymentBehavior`, never here. */
    Status: string | null;
    /** True when the rail moved the money itself; false when a person recorded money that arrived elsewhere. */
    OnlinePayment: boolean | null;
    /**
     * ISO-4217 as the rail reports it, or null when it reports none.
     *
     * Orders books a capture in the receiving company's functional currency and applies no rate, so a
     * payment in anything else must be REFUSED rather than booked one-for-one. Null is treated as
     * "the rail did not say", which the poller resolves against the company rather than assuming.
     */
    CurrencyCode: string | null;
    ReceivablesType: string | null;
    /** The rail's updated-time, ISO — the watermark candidate. */
    UpdatedAt: string | null;
    InvoicePayments: Array<{ ExternalInvoiceRef: string; Amount: number; PaymentDate: string | null }>;
    /** The record as received, for the audit trail. */
    Raw: Record<string, unknown>;
}

/**
 * Success carries the value; refusal carries a reason and whether trying again could change the
 * answer. `Transient: true` is a timeout, a 5xx, a lost session. `Transient: false` is "the customer
 * has no email" — retrying that is noise.
 */
export type RailResult<T> = { Success: true; Value: T } | { Success: false; Reason: string; Transient: boolean };

/** What the resolver reads off the `PaymentProvider` row and hands to the rail. */
export interface InvoiceRailConfig {
    PaymentProviderID: string;
    TypeCode: string;
    CompanyID: string;
    Name: string;
    IsLiveMode: boolean;
    /** The `MJ: Company Integrations` row the connector resolves credentials from. */
    CompanyIntegrationID: string | null;
}

export class BaseInvoiceRail {
    public Config!: InvoiceRailConfig;
    public Provider?: IMetadataProvider;
    public User?: UserInfo;

    /**
     * Is this rail configured well enough to be called at all? Resolves the integration row and the
     * credential's environment; makes NO network call. A refusal here is a CONFIGURATION fault the
     * operations raise as an error (no row written, nothing marked Failed), so a bad provider row
     * cannot poison every unit in a sweep — and a preview run surfaces it before go-live.
     */
    public async CheckConfiguration(): Promise<RailResult<true>> {
        return { Success: true, Value: true };
    }

    public async EnsureCustomer(_facts: RailCustomerFacts): Promise<RailResult<{ ExternalCustomerRef: string }>> {
        return this.notImplemented('ensuring a customer');
    }

    public async IssueInvoice(_facts: RailInvoiceFacts): Promise<RailResult<{ ExternalInvoiceRef: string }>> {
        return this.notImplemented('issuing an invoice');
    }

    public async GetInvoice(_externalInvoiceRef: string): Promise<RailResult<RailInvoiceSnapshot | null>> {
        return this.notImplemented('reading an invoice');
    }

    public async CancelInvoice(_externalInvoiceRef: string): Promise<RailResult<{ Archived: true }>> {
        return this.notImplemented('cancelling an invoice');
    }

    public async FetchPaymentsSince(
        _watermark: string | null,
    ): Promise<RailResult<{ Payments: RailPaymentRecord[]; NewWatermark: string | null }>> {
        return this.notImplemented('fetching payments');
    }

    protected notImplemented<T>(what: string): RailResult<T> {
        const code = this.Config?.TypeCode ?? 'unknown';
        return {
            Success: false,
            Transient: false,
            Reason:
                `The '${code}' invoice rail does not implement ${what}. Register a subclass with ` +
                `@RegisterClass(BaseInvoiceRail, '${code}') and call its Load* anchor from the server bootstrap — ` +
                `without the anchor the decorator is tree-shaken away and the class is silently absent.`,
        };
    }
}

/** Tree-shaking anchor for the base — keeps the class reachable for the resolver's fallback check. */
export function LoadBaseInvoiceRail(): void {
    void BaseInvoiceRail;
}

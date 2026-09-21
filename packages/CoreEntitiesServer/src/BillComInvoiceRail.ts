/**
 * @fileoverview `BillCom` invoice rail — our facts in, Bill.com's wire shapes out, and back.
 *
 * WHAT THIS FILE KNOWS THAT NOTHING ELSE SHOULD:
 *
 *   · An invoice is created with `customer: { id }` and MUST NOT carry `customerId`. BILL's read and
 *     write DTOs disagree here, and the connector's live write verification found that sending the
 *     read-side name fails every create with HTTP 400 (Integrations `Finance/BillCom/docs/SUPPORT.md`).
 *   · Totals are `totalAmount`, `dueAmount`, `scheduledAmount`, `creditAmount`. There is no
 *     `paidAmount`; paid is derived, and `dueAmount === 0` with `scheduledAmount > 0` means promised,
 *     not banked.
 *   · Cancellation is the `archived` flag, never a status. The v3 archive endpoint is not exposed by
 *     the connector (upstream ask U1); until it is, this rail asks for `archived: true` through the
 *     generic update and READS BACK to confirm. If BILL ignores the flag the cancel is refused,
 *     permanently, with the reason — never reported as done.
 *   · A receivable payment fans out across invoices in `invoicePayments[]`; `status` is an object
 *     whose vocabulary is classified by `ExternalPaymentBehavior`, not here.
 *   · The connector does not yet apply the `updatedTime` watermark filter (upstream ask U2), so
 *     `FetchPaymentsSince` narrows locally after the fetch. Correct, and slower than it should be.
 *
 * LIVE-MODE MISMATCH IS REFUSED BEFORE THE FIRST CALL. A live provider row pointed at a sandbox
 * credential would send a real customer a sandbox invoice, or record sandbox money as cash.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BaseInvoiceRail,
    type RailCustomerFacts,
    type RailInvoiceFacts,
    type RailInvoiceSnapshot,
    type RailPaymentRecord,
    type RailResult,
} from './BaseInvoiceRail.js';
import { BillComGateway, type BillComGatewaySeams } from './BillComGateway.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** What a retry could plausibly change. Anything else is a fact about the data, and retrying it is noise. */
// HTTP status codes count only when they stand alone: `500.00` (money) and `INV-500` (a document
// number) must not read as a server error, or a permanent refusal is retried forever.
export const BILLCOM_TRANSIENT = /timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|socket|rate limit|too many|session|(?<![\d.\-])(?:5\d\d|401|429)(?![\d.])/i;

const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));

/** A rail timestamp → canonical ISO-8601 UTC (`…Z`), or null when it cannot be read. Never compare rail strings raw. */
export function CanonicalInstant(v: unknown): string | null {
    if (v == null || v === '') return null;
    const ms = typeof v === 'number' ? v : Date.parse(String(v));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** BILL returns several fields as objects; flatten to the string a decision table can read. */
const str = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const inner = o.value ?? o.name ?? o.status ?? o.id;
        return inner == null ? JSON.stringify(v) : String(inner);
    }
    return String(v);
};

@RegisterClass(BaseInvoiceRail, 'BillCom')
export class BillComInvoiceRail extends BaseInvoiceRail {
    private fail<T>(reason: string): RailResult<T> {
        return { Success: false, Reason: reason, Transient: BILLCOM_TRANSIENT.test(reason) };
    }

    /** The Company Integration and gateway, with the live-mode check done once per call. */
    private async session(): Promise<{ gw: BillComGatewaySeams; ci: MJCompanyIntegrationEntity }> {
        if (!this.Provider || !this.User) throw new Error('BillComInvoiceRail needs Provider and User; resolve it through ResolveInvoiceRail.');
        if (!this.Config.CompanyIntegrationID) {
            throw new Error(
                `Payment provider '${this.Config.Name}' has no CompanyIntegrationID. Bill.com cannot be reached without the ` +
                    `MJ Company Integration that holds its credential; set it on the provider row.`,
            );
        }
        const gw = BillComGateway(this.Provider);
        const ci = await gw.loadCompanyIntegration(this.Config.CompanyIntegrationID, this.Provider, this.User);
        const env = await gw.loadCredentialEnvironment(ci, this.Provider, this.User);
        if (env !== null) {
            const credentialIsLive = env.toLowerCase() === 'production';
            if (credentialIsLive !== this.Config.IsLiveMode) {
                throw new Error(
                    `Payment provider '${this.Config.Name}' is ${this.Config.IsLiveMode ? 'LIVE' : 'not live'} but its Bill.com credential is ` +
                        `'${env}'. Refusing rather than sending a real customer a sandbox invoice, or recording sandbox money as cash.`,
                );
            }
        }
        return { gw, ci };
    }

    public override async CheckConfiguration(): Promise<RailResult<true>> {
        try {
            await this.session();
            return { Success: true, Value: true };
        } catch (e) {
            return { Success: false, Transient: false, Reason: e instanceof Error ? e.message : String(e) };
        }
    }

    public override async EnsureCustomer(f: RailCustomerFacts): Promise<RailResult<{ ExternalCustomerRef: string }>> {
        try {
            if (!f.Email) {
                return this.fail(
                    `Bill.com requires a customer email and ${f.Name} has none. Add a billing email to the ${f.PartyKind.toLowerCase()} and send again.`,
                );
            }
            const { gw, ci } = await this.session();
            const attrs: Record<string, unknown> = {
                name: f.Name,
                email: f.Email,
                // Our party id, so the link survives even if our mapping row is lost.
                accountNumber: f.PartyID,
            };
            if (f.AddressLines.length || f.City || f.PostalCode) {
                attrs.billingAddress = {
                    line1: f.AddressLines[0] ?? null,
                    line2: f.AddressLines[1] ?? null,
                    city: f.City,
                    stateOrProvince: f.State,
                    zipOrPostalCode: f.PostalCode,
                    country: f.Country,
                };
            }
            const r = await gw.createRecord(ci, 'customers', attrs, this.User!);
            if (!r.Success || !r.ExternalID) return this.fail(r.ErrorMessage ?? `Bill.com refused the customer (HTTP ${r.StatusCode}).`);
            return { Success: true, Value: { ExternalCustomerRef: r.ExternalID } };
        } catch (e) {
            return this.fail(e instanceof Error ? e.message : String(e));
        }
    }

    public override async IssueInvoice(f: RailInvoiceFacts): Promise<RailResult<{ ExternalInvoiceRef: string }>> {
        try {
            if (!f.Lines.length) return this.fail(`${f.DocumentNumber} has no lines; Bill.com will not accept an empty invoice.`);
            const { gw, ci } = await this.session();
            const attrs: Record<string, unknown> = {
                invoiceNumber: f.DocumentNumber,
                invoiceDate: f.InvoiceDate,
                // Write shape: an InvoiceCustomer object. NOT `customerId` — see the file header.
                customer: { id: f.ExternalCustomerRef },
                invoiceLineItems: f.Lines.map((l) => ({ description: l.Description, quantity: l.Quantity, price: l.UnitPrice })),
            };
            if (f.DueDate) attrs.dueDate = f.DueDate;
            if (f.Memo) attrs.description = f.Memo;
            const r = await gw.createRecord(ci, 'invoices', attrs, this.User!);
            if (!r.Success || !r.ExternalID) return this.fail(r.ErrorMessage ?? `Bill.com refused the invoice (HTTP ${r.StatusCode}).`);
            return { Success: true, Value: { ExternalInvoiceRef: r.ExternalID } };
        } catch (e) {
            return this.fail(e instanceof Error ? e.message : String(e));
        }
    }

    public override async GetInvoice(ref: string): Promise<RailResult<RailInvoiceSnapshot | null>> {
        try {
            const { gw, ci } = await this.session();
            const rec = await gw.getRecord(ci, 'invoices', ref, this.User!);
            if (!rec) return { Success: true, Value: null };
            const x = rec.Fields;
            return {
                Success: true,
                Value: {
                    ExternalInvoiceRef: ref,
                    InvoiceNumber: str(x.invoiceNumber),
                    Total: num(x.totalAmount),
                    DueAmount: num(x.dueAmount),
                    ScheduledAmount: num(x.scheduledAmount),
                    Status: str(x.status),
                    Archived: x.archived === true,
                },
            };
        } catch (e) {
            return this.fail(e instanceof Error ? e.message : String(e));
        }
    }

    public override async CancelInvoice(ref: string): Promise<RailResult<{ Archived: true }>> {
        try {
            const { gw, ci } = await this.session();
            const r = await gw.updateRecord(ci, 'invoices', ref, { archived: true }, this.User!);
            if (!r.Success) return this.fail(r.ErrorMessage ?? `Bill.com refused the archive (HTTP ${r.StatusCode}).`);
            const back = await this.GetInvoice(ref);
            if (!back.Success) return back as RailResult<{ Archived: true }>;
            if (!back.Value?.Archived) {
                return {
                    Success: false,
                    Transient: false,
                    Reason:
                        `Bill.com accepted the update but ${ref} is not archived. The archive verb is not available through this ` +
                        `connector version (Integrations ask U1); archive it in Bill.com and record the cancel here.`,
                };
            }
            return { Success: true, Value: { Archived: true } };
        } catch (e) {
            return this.fail(e instanceof Error ? e.message : String(e));
        }
    }

    public override async FetchPaymentsSince(
        watermark: string | null,
    ): Promise<RailResult<{ Payments: RailPaymentRecord[]; NewWatermark: string | null }>> {
        try {
            const { gw, ci } = await this.session();
            const batch = await gw.fetchChanges(ci, 'receivable-payments', watermark, this.User!);
            // Compare INSTANTS, never strings: BILL may write `+0000` where we wrote `Z`, and a
            // non-UTC offset compares wrong by hours lexically. UpdatedAt is canonical ISO-Z after
            // NormalizeReceivablePayment, so ISO-Z strings do order lexically — but the watermark the
            // caller hands us may be anything, so it is parsed here too.
            const sinceMs = watermark ? Date.parse(watermark) : NaN;
            const payments = batch.Records.map((r) => NormalizeReceivablePayment(r.ExternalID, r.Fields)).filter(
                // Local narrowing until the connector applies the filter (U2). A record with no readable
                // updatedTime is kept — dropping it would hide a payment.
                (p) => !Number.isFinite(sinceMs) || !p.UpdatedAt || Date.parse(p.UpdatedAt) >= sinceMs,
            );
            const newWatermark = payments.reduce<string | null>(
                (max, p) => (p.UpdatedAt && (!max || p.UpdatedAt > max) ? p.UpdatedAt : max),
                CanonicalInstant(batch.NewWatermarkValue),
            );
            return { Success: true, Value: { Payments: payments, NewWatermark: newWatermark } };
        } catch (e) {
            return this.fail(e instanceof Error ? e.message : String(e));
        }
    }
}

/** One `receivable-payments` record as BILL returns it → the rail-neutral shape. Exported for tests. */
export function NormalizeReceivablePayment(externalID: string, x: Record<string, unknown>): RailPaymentRecord {
    const ip = Array.isArray(x.invoicePayments) ? (x.invoicePayments as Array<Record<string, unknown>>) : [];
    return {
        ExternalPaymentRef: externalID,
        ExternalCustomerRef: str(x.customerId),
        Amount: num(x.amount),
        UnappliedAmount: num(x.unappliedAmount),
        PaymentDate: str(x.paymentDate)?.slice(0, 10) ?? null,
        Status: str(x.status),
        OnlinePayment: typeof x.onlinePayment === 'boolean' ? x.onlinePayment : null,
        ReceivablesType: str(x.receivablesType),
        UpdatedAt: CanonicalInstant(x.updatedTime),
        InvoicePayments: ip.map((p) => ({ ExternalInvoiceRef: String(p.invoiceId ?? ''), Amount: num(p.amount), PaymentDate: str(p.paymentDate) })),
        Raw: x,
    };
}

/** Tree-shaking anchor — call from the server bootstrap. */
export function LoadBillComInvoiceRail(): void {
    void BillComInvoiceRail;
}

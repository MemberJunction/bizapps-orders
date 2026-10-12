/**
 * billcom-rail — the Bill.com invoice rail against a real database (golive #146/#148, #591).
 *
 * WHAT THE UNIT TESTS ALREADY PROVE, AND WHAT THEY CANNOT. `BillComInvoiceRail.test.ts` pins the wire
 * shape (`customer:{id}`, never `customerId`), the read-back mapping and the payment fan-out, and the
 * behaviour modules pin every decision table. None of them has a database, so none of them can say
 * whether the ROWS are right: that a provider row resolves to this rail through its Company
 * Integration, that a send claims the unit and records the rail's reference, that a cleared payment
 * becomes exactly one captured payment with its cash leg, that the watermark moves, and that a preview
 * writes nothing. Those are the questions this bundle asks.
 *
 * THE STUB IS THE GATEWAY SEAM, NOT HTTP. Every call to Bill.com goes through `BillComGateway`, and
 * `UseBillComGatewaySeams` swaps it for an in-memory Bill.com (`FakeBillCom` below). So the resolver,
 * the operations, the rail class, the capture path and the ledger all run as they do in production;
 * only the connector and the network are replaced. That is the same line `payment-providers` draws
 * with Stripe's stub. What the stub cannot prove — that Bill.com itself answers the way the stub does —
 * is `test-harnesses/billcom-live.mjs`, against a sandbox, never in CI.
 *
 * THE WEBHOOK IS DRIVEN THROUGH `HandleBillComWebhook`, NOT EXPRESS, for the reason `ach-settlement`
 * gives: the route's transport is unit-tested, and what is unproven is what a verified notification
 * does to real rows. The poll it asks for is captured and run here, inside the check's transaction.
 *
 * THE CONNECTOR'S METADATA IS CREATED WHEN ABSENT. A send refuses any customer name or invoice number
 * it cannot check against the connector's field lengths, and those live in `MJ: Integration Objects`
 * rows the Bill.com connector installs. A database built from this repo's migrations has none, so each
 * check creates them (inside its transaction) with the lengths the connector ships.
 *
 * CONNECTS TO:
 *   CODE: BillComGateway · BillComInvoiceRail · InvoiceRailResolver · IssueExternalInvoiceOperation ·
 *         SendExternalInvoicesOperation · CancelExternalInvoiceOperation · PollExternalPaymentsOperation ·
 *         BillComWebhookExtension.HandleBillComWebhook
 *   PURE: packages/CoreEntitiesServer/src/__tests__/BillComInvoiceRail.test.ts,
 *         BillComWebhook.test.ts, ExternalInvoiceBehavior.test.ts
 *   DOC:  docs/billcom-invoice-rail.md
 */
import { randomUUID } from "crypto";
import type { IMetadataProvider, UserInfo } from "@memberjunction/core";
import type { MJCompanyIntegrationEntity } from "@memberjunction/core-entities";
import {
  Assert,
  AssertEqual,
  IntegrationCheckRegistry,
  type IntegrationCheckContext,
  type NamedCheck,
} from "@memberjunction/testing-integration";
import { ExternalFieldLimitEngine } from "@mj-biz-apps/common-entities";
import {
  OrdersCancelExternalInvoiceOperation,
  OrdersIssueExternalInvoiceOperation,
  OrdersPollExternalPaymentsOperation,
  OrdersSendExternalInvoicesOperation,
  type OrdersCancelExternalInvoiceOutput,
  type OrdersIssueExternalInvoiceOutput,
  type OrdersPollExternalPaymentsInput,
  type OrdersPollExternalPaymentsOutput,
  type OrdersSendExternalInvoicesOutput,
} from "@mj-biz-apps/orders-entities";
// STATIC, per the repo rule — no dynamic import()/require() anywhere.
import {
  BILLCOM_SIGNATURE_HEADER,
  CurrentBillComGatewaySeams,
  ResolveInvoiceRail,
  SignBillComPayload,
  UseBillComGatewaySeams,
  type BillComGatewaySeams,
} from "@mj-biz-apps/orders-core-entities-server";
import { HandleBillComWebhook } from "@mj-biz-apps/orders-server";
import {
  ACCT_SCHEMA,
  CreateOrdersFixture,
  CreateProductPrice,
  createViaEntity,
  Fx,
  InRolledBackTransaction,
  ORDERS_SCHEMA,
  SameID,
  TeardownOrdersFixture,
  TxMaybeOne,
  TxOne,
  TxQuery,
  upsertViaEntity,
} from "../fixture.js";
import {
  COMPANY_INTEGRATION_ENTITY,
  INTEGRATION_ENTITY,
  INTEGRATION_OBJECT_ENTITY,
  INTEGRATION_OBJECT_FIELD_ENTITY,
  PAYMENT_PROVIDER_ENTITY,
  SCHEDULED_JOB_ENTITY,
} from "../entity-names.js";
import { ConfirmOrder } from "../order-builder.js";

// ─── An in-memory Bill.com behind the gateway seam ─────────────────────────────────────────────

type CrudResult = Awaited<ReturnType<BillComGatewaySeams["createRecord"]>>;
type RailRecord = NonNullable<Awaited<ReturnType<BillComGatewaySeams["getRecord"]>>>;
type RailBatch = Awaited<ReturnType<BillComGatewaySeams["fetchChanges"]>>;

interface FakeInvoice {
  id: string;
  invoiceNumber: string;
  customer: { id: string };
  totalAmount: number;
  dueAmount: number;
  scheduledAmount: number;
  status: { value: string };
  archived: boolean;
}

interface FakePaymentInput {
  /** Bill.com's status string: `PAID` clears, `SCHEDULED` is promised, `VOID` reverses. */
  Status: string;
  /** The invoices it is applied to, by the rail's invoice id. */
  Applied: Array<{ InvoiceRef: string; Amount: number }>;
  CustomerRef?: string;
}

interface FakeCall {
  Verb: "create" | "update" | "get" | "archive" | "fetch";
  Object: string;
  ID?: string;
  Attributes?: Record<string, unknown>;
  Watermark?: string | null;
}

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Bill.com as far as the rail can see it: customers, invoices and receivable payments, each with the
 * fields BILL actually returns. Every call is recorded, so a check can say "nothing reached Bill.com"
 * as well as "this did".
 *
 * Amounts follow BILL's own arithmetic, because the cancel guard and the post-capture refresh read
 * them: `dueAmount` falls by what is applied, cleared or scheduled, and `scheduledAmount` holds what
 * is promised but not banked.
 */
class FakeBillCom {
  public readonly Calls: FakeCall[] = [];
  public readonly Customers = new Map<string, Record<string, unknown>>();
  public readonly Invoices = new Map<string, FakeInvoice>();
  private readonly payments = new Map<string, Record<string, unknown>>();
  private counter = 0;
  /** Each payment is a minute newer than the last, so the watermark has something to advance over. */
  private clock = Date.now() - 60 * 60 * 1000;

  constructor(private readonly currencyCode: string) {}

  public Seams(): BillComGatewaySeams {
    return {
      loadCompanyIntegration: async (id, provider, user) => loadCompanyIntegration(id, provider, user),
      loadCredentialEnvironment: async () => ({ Known: true, Environment: "sandbox" }),
      createRecord: async (_ci, object, attrs) => this.create(object, attrs),
      updateRecord: async (_ci, object, id, attrs) => {
        this.Calls.push({ Verb: "update", Object: object, ID: id, Attributes: attrs });
        return { Success: true, ExternalID: id, StatusCode: 200 };
      },
      getRecord: async (_ci, object, id) => {
        this.Calls.push({ Verb: "get", Object: object, ID: id });
        const invoice = object === "invoices" ? this.Invoices.get(id) : undefined;
        return invoice ? record("invoices", id, { ...invoice }) : null;
      },
      archiveInvoice: async (_ci, id) => {
        this.Calls.push({ Verb: "archive", Object: "invoices", ID: id });
        const invoice = this.Invoices.get(id);
        if (!invoice) return { Success: false, StatusCode: 404, ErrorMessage: `No invoice ${id}.` };
        invoice.archived = true;
        return { Success: true, ExternalID: id, StatusCode: 200 };
      },
      fetchChanges: async (_ci, object, watermark) => {
        this.Calls.push({ Verb: "fetch", Object: object, Watermark: watermark });
        const batch: RailBatch = {
          Records: [...this.payments.entries()].map(([id, fields]) => record(object, id, { ...fields })),
          HasMore: false,
        };
        return batch;
      },
    };
  }

  /** A receivable payment arriving on Bill.com, applied to invoices we issued (or did not). */
  public ReceivePayment(p: FakePaymentInput): string {
    const id = `0rp${this.nextID()}`;
    const amount = money(p.Applied.reduce((s, a) => s + a.Amount, 0));
    const firstInvoice = p.Applied.length ? this.Invoices.get(p.Applied[0].InvoiceRef) : undefined;
    this.payments.set(id, {
      id,
      customerId: p.CustomerRef ?? firstInvoice?.customer.id ?? null,
      amount,
      unappliedAmount: 0,
      paymentDate: today(),
      status: p.Status,
      onlinePayment: false,
      // An offline check: the shape spike S2 confirmed live, and a tender every database seeds.
      receivablesType: "CHECK",
      currency: this.currencyCode,
      updatedTime: this.tick(),
      invoicePayments: p.Applied.map((a) => ({ invoiceId: a.InvoiceRef, amount: a.Amount, paymentDate: today() })),
    });
    this.apply(p.Status, p.Applied);
    return id;
  }

  /** Bill.com changing a payment's status (a scheduled payment clearing), which bumps `updatedTime`. */
  public SetPaymentStatus(id: string, status: string): void {
    const p = this.payments.get(id);
    Assert(p != null, `the fake holds payment ${id}`);
    const applied = (p!.invoicePayments as Array<{ invoiceId: string; amount: number }>).map((ip) => ({
      InvoiceRef: ip.invoiceId,
      Amount: ip.amount,
    }));
    if (p!.status === "SCHEDULED" && status === "PAID") {
      for (const a of applied) {
        const inv = this.Invoices.get(a.InvoiceRef);
        if (inv) inv.scheduledAmount = money(inv.scheduledAmount - a.Amount);
      }
    }
    p!.status = status;
    p!.updatedTime = this.tick();
  }

  /** An invoice that exists on Bill.com but was never sent by Orders (pre-cutover AR). */
  public ForeignInvoice(total: number): string {
    const id = `00e${this.nextID()}`;
    this.Invoices.set(id, {
      id,
      invoiceNumber: `LEGACY-${id}`,
      customer: { id: "0cuLEGACY" },
      totalAmount: total,
      dueAmount: total,
      scheduledAmount: 0,
      status: { value: "OPEN" },
      archived: false,
    });
    return id;
  }

  /** Bill.com's `updatedTime` for a payment — what the poll's watermark is built from. */
  public PaymentUpdatedAt(id: string): string {
    const p = this.payments.get(id);
    Assert(p != null, `the fake holds payment ${id}`);
    return String(p!.updatedTime);
  }

  public Creates(object: string): FakeCall[] {
    return this.Calls.filter((c) => c.Verb === "create" && c.Object === object);
  }

  public InvoiceByNumber(invoiceNumber: string): FakeInvoice | undefined {
    return [...this.Invoices.values()].find((i) => i.invoiceNumber === invoiceNumber);
  }

  private create(object: string, attrs: Record<string, unknown>): CrudResult {
    this.Calls.push({ Verb: "create", Object: object, Attributes: attrs });
    if (object === "customers") {
      const id = `0cu${this.nextID()}`;
      this.Customers.set(id, { id, ...attrs });
      return { Success: true, ExternalID: id, StatusCode: 201 };
    }
    if (object === "invoices") {
      const id = `00e${this.nextID()}`;
      const lines = (attrs.invoiceLineItems as Array<{ quantity: number; price: number }>) ?? [];
      // BILL totals the lines itself; the send reads the total back and refuses one that does not tie.
      const total = money(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.price), 0));
      this.Invoices.set(id, {
        id,
        invoiceNumber: String(attrs.invoiceNumber),
        customer: attrs.customer as { id: string },
        totalAmount: total,
        dueAmount: total,
        scheduledAmount: 0,
        status: { value: "OPEN" },
        archived: false,
      });
      return { Success: true, ExternalID: id, StatusCode: 201 };
    }
    return { Success: false, StatusCode: 400, ErrorMessage: `The fake Bill.com does not create '${object}'.` };
  }

  private apply(status: string, applied: FakePaymentInput["Applied"]): void {
    for (const a of applied) {
      const inv = this.Invoices.get(a.InvoiceRef);
      if (!inv) continue;
      inv.dueAmount = money(inv.dueAmount - a.Amount);
      if (status === "SCHEDULED") inv.scheduledAmount = money(inv.scheduledAmount + a.Amount);
      inv.status = { value: inv.dueAmount <= 0 ? "PAID_IN_FULL" : "PARTIALLY_PAID" };
    }
  }

  private nextID(): string {
    this.counter++;
    return `IT${String(this.counter).padStart(4, "0")}${randomUUID().slice(0, 6)}`;
  }

  private tick(): string {
    this.clock += 60 * 1000;
    return new Date(this.clock).toISOString();
  }
}

function record(object: string, id: string, fields: Record<string, unknown>): RailRecord {
  return { ExternalID: id, ObjectType: object, Fields: fields };
}

/** The real `MJ: Company Integrations` row the provider points at — the seam replaces the wire, not the row. */
async function loadCompanyIntegration(
  id: string,
  provider: IMetadataProvider,
  user: UserInfo,
): Promise<MJCompanyIntegrationEntity> {
  const ci = await provider.GetEntityObject<MJCompanyIntegrationEntity>(COMPANY_INTEGRATION_ENTITY, user);
  Assert(await ci.Load(id), `Company Integration ${id} loads`);
  return ci;
}

/**
 * Run `body` against a fresh fake Bill.com, inside a transaction that rolls back. The previous seams
 * are restored afterwards whatever happens, so a failing check cannot leave every later rail call in
 * the process talking to a stub.
 */
async function withBillCom(
  ctx: IntegrationCheckContext,
  body: (bill: FakeBillCom) => Promise<void>,
): Promise<void> {
  const bill = new FakeBillCom(Fx().CurrencyCode);
  const previous = CurrentBillComGatewaySeams();
  UseBillComGatewaySeams(bill.Seams());
  try {
    await InRolledBackTransaction(ctx, () => body(bill));
  } finally {
    UseBillComGatewaySeams(previous);
  }
}

// ─── Fixture: a Bill.com rail for company A ────────────────────────────────────────────────────

/**
 * BILL's own limits, as `@memberjunction/connector-bill-com` ships them in its integration metadata
 * (customers.name and invoices.invoiceNumber, both 100). The rail names these targets.
 */
const BILLCOM_FIELD_LENGTHS: ReadonlyArray<{ Object: string; Field: string; Length: number }> = [
  { Object: "customers", Field: "name", Length: 100 },
  { Object: "invoices", Field: "invoiceNumber", Length: 100 },
];

/**
 * The `Bill.com` integration and the two field lengths a send checks, reusing whatever the database
 * already has. Then the limit engine is reloaded on the check's connection, because it caches per
 * process and would otherwise keep the lengths from before these rows existed.
 */
async function ensureBillComIntegration(ctx: IntegrationCheckContext): Promise<string> {
  const existing = await TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM __mj.Integration WHERE Name = 'Bill.com'`);
  const integrationID =
    existing?.ID ??
    (await createViaEntity(ctx, INTEGRATION_ENTITY, {
      Name: "Bill.com",
      Description: "Bill.com connector metadata created by the billcom-rail integration bundle.",
      ClassName: "@memberjunction/connector-bill-com",
      ImportPath: "@memberjunction/connector-bill-com",
    }));

  for (const target of BILLCOM_FIELD_LENGTHS) {
    const object = await TxMaybeOne<{ ID: string }>(
      ctx,
      `SELECT ID FROM __mj.IntegrationObject WHERE IntegrationID = '${integrationID}' AND Name = '${target.Object}'`,
    );
    const objectID =
      object?.ID ??
      (await createViaEntity(ctx, INTEGRATION_OBJECT_ENTITY, {
        IntegrationID: integrationID,
        Name: target.Object,
        APIPath: `/${target.Object}`,
      }));
    const field = await TxMaybeOne<{ ID: string; Length: number | null }>(
      ctx,
      `SELECT ID, Length FROM __mj.IntegrationObjectField WHERE IntegrationObjectID = '${objectID}' AND Name = '${target.Field}'`,
    );
    if (!field) {
      await createViaEntity(ctx, INTEGRATION_OBJECT_FIELD_ENTITY, {
        IntegrationObjectID: objectID,
        Name: target.Field,
        Type: "string",
        Length: target.Length,
      });
    }
  }
  await ExternalFieldLimitEngine.Instance.Config(true, ctx.User, ctx.Provider);
  return integrationID;
}

interface BillComRail {
  ProviderID: string;
  CompanyIntegrationID: string;
  /** The `CredentialsRef` prefix; `<ref>_WEBHOOK_SECRET` is the subscription's security key. */
  CredentialsRef: string;
}

/**
 * Company A invoicing through Bill.com: the connector metadata, a Company Integration, and a `BillCom`
 * provider row pointing at it. Built BEFORE any order is confirmed, as in production — a company with
 * a rail checks the bill-to name against BILL's limit at confirm.
 */
async function configureRail(ctx: IntegrationCheckContext, opts: { live?: boolean } = {}): Promise<BillComRail> {
  const f = Fx();
  const integrationID = await ensureBillComIntegration(ctx);
  const companyIntegrationID = await createViaEntity(ctx, COMPANY_INTEGRATION_ENTITY, {
    CompanyID: f.CoA.ID,
    IntegrationID: integrationID,
    IsActive: true,
  });
  // `BillCom` is shipped by the V…BillCom_Metadata_Sync migration; a database without it is not one
  // this bundle can say anything about.
  const type = await TxMaybeOne<{ ID: string }>(
    ctx,
    `SELECT ID FROM ${ORDERS_SCHEMA}.PaymentProviderType WHERE Code = 'BillCom'`,
  );
  Assert(type != null, "the BillCom payment provider type is installed (V202609291003 Bill.com metadata migration)");
  const credentialsRef = `IT_BILLCOM_${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const providerID = await createViaEntity(ctx, PAYMENT_PROVIDER_ENTITY, {
    PaymentProviderTypeID: type!.ID,
    CompanyID: f.CoA.ID,
    Name: "IT Bill.com",
    CredentialsRef: credentialsRef,
    CompanyIntegrationID: companyIntegrationID,
    IsLiveMode: opts.live ? 1 : 0,
    IsActive: 1,
  });
  return { ProviderID: providerID, CompanyIntegrationID: companyIntegrationID, CredentialsRef: credentialsRef };
}

/** A confirmed order on company A, billed to the fixture organisation — one whole-order billing unit. */
async function sellOnRail(ctx: IntegrationCheckContext, amount = 300): Promise<{ ID: string; OrderNumber: string }> {
  const f = Fx();
  await CreateProductPrice(ctx, f.Products.WidgetA, amount);
  const order = await ConfirmOrder(ctx.User, {
    CompanyID: f.CoA.ID,
    BillToOrganizationID: f.Customers.OrganizationID,
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
  });
  Assert(order.Saved, `the order must confirm on a company with a Bill.com rail: ${order.Message}`);
  return { ID: order.Order.ID as string, OrderNumber: order.Order.OrderNumber as string };
}

/**
 * Put the scheduled poll job in the state a live poll is meant to run under: Active and out of
 * Preview. Both jobs ship Disabled and in Preview; a run that records cash is the one Finance turns on
 * (#583, item 25). Inside the check's transaction, so the committed job is untouched.
 */
async function allowLivePoll(ctx: IntegrationCheckContext): Promise<void> {
  const job = await TxMaybeOne<{ ID: string; Configuration: string }>(
    ctx,
    `SELECT ID, Configuration FROM __mj.ScheduledJob WHERE Configuration LIKE '%${POLL_ACTION_ID}%'`,
  );
  if (!job) return;
  const config = JSON.parse(job.Configuration) as { Params?: Array<{ ActionParamID: string; Value: unknown }> };
  for (const p of config.Params ?? []) {
    if (SameID(p.ActionParamID, POLL_PREVIEW_PARAM_ID)) p.Value = "false";
  }
  await upsertViaEntity(ctx, SCHEDULED_JOB_ENTITY, job.ID, { Status: "Active", Configuration: JSON.stringify(config) });
}

/** The scheduler adapters' Action and `Preview` param ids, as `metadata/scheduled-jobs` names them. */
const SEND_ACTION_ID = "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B01";
const SEND_PREVIEW_PARAM_ID = "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B04";
const POLL_ACTION_ID = "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11";
const POLL_PREVIEW_PARAM_ID = "B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13";

// ─── The operations, as the scheduler and the order form call them ─────────────────────────────

const opContext = (ctx: IntegrationCheckContext) => ({ provider: ctx.Provider, user: ctx.User });

async function issue(ctx: IntegrationCheckContext, orderID: string, preview = false): Promise<OrdersIssueExternalInvoiceOutput> {
  const r = await new OrdersIssueExternalInvoiceOperation().Execute({ OrderHeaderID: orderID, Preview: preview }, opContext(ctx));
  Assert(r.Output != null, `Orders.IssueExternalInvoice did not execute: ${r.ErrorMessage ?? "no output"}`);
  return r.Output!;
}

/**
 * The sweep the half-hourly job runs, for company A. Other committed orders on company A are in the
 * worklist too, so MaxCount is wide and checks read their own order's row rather than the totals.
 */
async function sweep(ctx: IntegrationCheckContext, preview: boolean): Promise<OrdersSendExternalInvoicesOutput> {
  const r = await new OrdersSendExternalInvoicesOperation().Execute(
    { CompanyIDs: [Fx().CoA.ID], MaxCount: 10000, Preview: preview },
    opContext(ctx),
  );
  Assert(r.Output != null, `Orders.SendExternalInvoices did not execute: ${r.ErrorMessage ?? "no output"}`);
  return r.Output!;
}

async function cancel(ctx: IntegrationCheckContext, externalInvoiceID: string): Promise<OrdersCancelExternalInvoiceOutput> {
  const r = await new OrdersCancelExternalInvoiceOperation().Execute(
    { ExternalInvoiceID: externalInvoiceID, Reason: "Integration check: customer withdrew the order." },
    opContext(ctx),
  );
  Assert(r.Output != null, `Orders.CancelExternalInvoice did not execute: ${r.ErrorMessage ?? "no output"}`);
  return r.Output!;
}

async function poll(
  ctx: IntegrationCheckContext,
  rail: BillComRail,
  opts: Omit<OrdersPollExternalPaymentsInput, "PaymentProviderID"> = {},
): Promise<OrdersPollExternalPaymentsOutput> {
  if (!opts.Preview) await allowLivePoll(ctx);
  const r = await new OrdersPollExternalPaymentsOperation().Execute({ PaymentProviderID: rail.ProviderID, ...opts }, opContext(ctx));
  Assert(r.Output != null, `Orders.PollExternalPayments did not execute: ${r.ErrorMessage ?? "no output"}`);
  return r.Output!;
}

/** Send one order and return its rail reference — the starting state of every payment check. */
async function sent(ctx: IntegrationCheckContext, orderID: string): Promise<{ ExternalInvoiceID: string; Ref: string }> {
  const out = await issue(ctx, orderID);
  AssertEqual(out.ResultCode, "SENT", `the order is sent to Bill.com: ${out.Message}`);
  return { ExternalInvoiceID: out.ExternalInvoiceID!, Ref: out.ExternalInvoiceRef! };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────────

interface ExternalInvoiceRead {
  ID: string;
  Status: string;
  DocumentNumber: string;
  Amount: number;
  ExternalInvoiceRef: string | null;
  ExternalCustomerRef: string | null;
  ExternalTotal: number | null;
  ExternalDueAmount: number | null;
  ExternalStatus: string | null;
  SentAt: Date | null;
}

const externalInvoices = (ctx: IntegrationCheckContext, rail: BillComRail) =>
  TxQuery<ExternalInvoiceRead>(
    ctx,
    `SELECT ID, Status, DocumentNumber, Amount, ExternalInvoiceRef, ExternalCustomerRef, ExternalTotal,
            ExternalDueAmount, ExternalStatus, SentAt
       FROM ${ORDERS_SCHEMA}.ExternalInvoice WHERE PaymentProviderID = '${rail.ProviderID}'`,
  );

const count = async (ctx: IntegrationCheckContext, from: string, where: string): Promise<number> =>
  Number((await TxOne<{ N: number }>(ctx, `SELECT COUNT(*) AS N FROM ${from} WHERE ${where}`)).N);

const orderMoney = (ctx: IntegrationCheckContext, orderID: string) =>
  TxOne<{ AmountPaid: number; Balance: number; ExternalDocumentNumber: string | null }>(
    ctx,
    `SELECT AmountPaid, Balance, ExternalDocumentNumber FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${orderID}'`,
  );

const paymentsFor = (ctx: IntegrationCheckContext, rail: BillComRail) =>
  TxQuery<{ ID: string; Status: string; Amount: number; IdempotencyKey: string | null }>(
    ctx,
    `SELECT ph.ID, ph.Status, ph.Amount, ph.IdempotencyKey
       FROM ${ORDERS_SCHEMA}.PaymentHeader ph
      WHERE ph.IdempotencyKey LIKE 'billcom:%'
        AND ph.ID IN (SELECT ep.PaymentHeaderID FROM ${ORDERS_SCHEMA}.ExternalPayment ep
                       WHERE ep.PaymentProviderID = '${rail.ProviderID}')`,
  );

const externalPayment = (ctx: IntegrationCheckContext, rail: BillComRail, ref: string) =>
  TxMaybeOne<{ Disposition: string; PaymentHeaderID: string | null; DispositionReason: string | null }>(
    ctx,
    `SELECT Disposition, PaymentHeaderID, DispositionReason FROM ${ORDERS_SCHEMA}.ExternalPayment
      WHERE PaymentProviderID = '${rail.ProviderID}' AND ExternalPaymentRef = '${ref}'`,
  );

// ─── Webhook plumbing ──────────────────────────────────────────────────────────────────────────

interface WebhookReply {
  Status: number;
  Body: { received?: boolean; polled?: boolean; kind?: string | null } | null;
  PollsRequested: string[];
  /** The poll the handler asked for, run here so the check can wait on it inside its transaction. */
  Poll: Promise<void> | null;
}

/**
 * Deliver one notification to the handler the Express route calls, with the `CredentialsRef` secret
 * set for the duration. `runPoll` stands in for the route's own poll so the check controls when it
 * runs; what it runs is the real operation.
 */
async function deliverWebhook(
  ctx: IntegrationCheckContext,
  rail: BillComRail,
  rawBody: string,
  opts: { secret: string | null; signWith: string | null },
): Promise<WebhookReply> {
  const reply: WebhookReply = { Status: 0, Body: null, PollsRequested: [], Poll: null };
  const envKey = `${rail.CredentialsRef}_WEBHOOK_SECRET`;
  const before = process.env[envKey];
  if (opts.secret) process.env[envKey] = opts.secret;
  else delete process.env[envKey];
  try {
    const headers: Record<string, string | undefined> = {};
    if (opts.signWith) headers[BILLCOM_SIGNATURE_HEADER] = await SignBillComPayload(rawBody, opts.signWith);
    await HandleBillComWebhook(
      { rawBody, headers, providerId: rail.ProviderID },
      {
        status: (code: number) => ({
          json: (body: unknown) => {
            reply.Status = code;
            reply.Body = body as WebhookReply["Body"];
            return body;
          },
        }),
      },
      () => ({ provider: ctx.Provider, user: ctx.User }),
      async (providerId) => {
        reply.PollsRequested.push(providerId);
        reply.Poll = poll(ctx, rail).then(() => undefined);
        await reply.Poll;
      },
    );
    if (reply.Poll) await reply.Poll;
  } finally {
    if (before === undefined) delete process.env[envKey];
    else process.env[envKey] = before;
  }
  return reply;
}

const invoiceUpdated = (ref: string) =>
  JSON.stringify({ type: "invoice.updated", eventId: `evt_${randomUUID()}`, createdTime: new Date().toISOString(), data: { id: ref } });

// ─── Checks ────────────────────────────────────────────────────────────────────────────────────

export const BillComRailChecks: NamedCheck[] = [
  {
    Id: "billcom-rail.BR1",
    Name: "BR1: a BillCom provider row resolves to the Bill.com rail through its Company Integration",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async () => {
        const rail = await configureRail(ctx);
        const resolved = await ResolveInvoiceRail(rail.ProviderID, ctx.Provider, ctx.User);
        AssertEqual(resolved.constructor.name, "BillComInvoiceRail", "the ClassFactory produced the Bill.com rail, not the base");
        Assert(
          SameID(resolved.Config.CompanyIntegrationID, rail.CompanyIntegrationID),
          "the rail carries the provider row's Company Integration, read from the database",
        );
        const ready = await resolved.CheckConfiguration();
        Assert(ready.Success, `a sandbox provider over a sandbox connection is ready: ${ready.Success === false ? ready.Reason : ""}`);
      }),
  },
  {
    Id: "billcom-rail.BR2",
    Name: "BR2: a LIVE provider over a sandbox connection is refused before anything reaches Bill.com",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx, { live: true });
        const order = await sellOnRail(ctx);
        const out = await issue(ctx, order.ID);
        Assert(!out.Success, "a send through a mismatched rail must not succeed");
        Assert(/sandbox/i.test(out.Message ?? ""), `the refusal names the mismatch. Got: ${out.Message}`);
        AssertEqual((await externalInvoices(ctx, rail)).length, 0, "no unit was claimed");
        AssertEqual(bill.Creates("customers").length + bill.Creates("invoices").length, 0, "and Bill.com was never written to");
      }),
  },
  {
    Id: "billcom-rail.BR3",
    Name: "BR3: the send sweep in Preview lists the order and writes nothing, here or on Bill.com",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const out = await sweep(ctx, true);
        const mine = out.Results.find((r) => r.OrderNumber === order.OrderNumber);
        Assert(mine != null, `the confirmed order is on the worklist the preview reports (${out.Message})`);
        AssertEqual(mine!.ResultCode, "PREVIEWED", "and would be sent");
        AssertEqual(Number(mine!.Amount), 300, "for the order's amount");
        Assert(out.PreviewedOnly, "the result says it was a preview");
        AssertEqual((await externalInvoices(ctx, rail)).length, 0, "no external invoice row was written");
        AssertEqual(
          await count(ctx, `${ORDERS_SCHEMA}.ExternalCustomer`, `PaymentProviderID = '${rail.ProviderID}'`),
          0,
          "no customer mapping was written",
        );
        AssertEqual(bill.Creates("customers").length + bill.Creates("invoices").length, 0, "nothing was created on Bill.com");
      }),
  },
  {
    Id: "billcom-rail.BR4",
    Name: "BR4: a live sweep sends the order: the rail's invoice and customer are recorded, and no money moves",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const out = await sweep(ctx, false);
        const mine = out.Results.find((r) => r.OrderNumber === order.OrderNumber);
        Assert(mine != null, `the order was in the sweep (${out.Message})`);
        AssertEqual(mine!.ResultCode, "SENT", `the order was sent: ${mine!.Message}`);

        const onRail = bill.InvoiceByNumber(order.OrderNumber);
        Assert(onRail != null, "Bill.com holds an invoice numbered as the order");
        AssertEqual(onRail!.totalAmount, 300, "for the order's total");
        AssertEqual(mine!.ExternalInvoiceRef, onRail!.id, "and the sweep reports Bill.com's id for it");
        const invoiceCreate = bill.Creates("invoices").find((c) => c.Attributes?.invoiceNumber === order.OrderNumber)!;
        Assert(invoiceCreate.Attributes?.customerId === undefined, "the invoice names its customer as customer:{id}, never customerId");

        const row = (await externalInvoices(ctx, rail)).find((r) => r.DocumentNumber === order.OrderNumber);
        Assert(row != null, "the unit has an external invoice row");
        AssertEqual(row!.Status, "Sent", "marked Sent");
        AssertEqual(row!.ExternalInvoiceRef, onRail!.id, "holding Bill.com's invoice id");
        AssertEqual(Number(row!.ExternalTotal), 300, "with the total Bill.com read back");
        Assert(row!.SentAt != null, "and the time it was sent");

        const mapping = await TxOne<{ ExternalCustomerRef: string }>(
          ctx,
          `SELECT ExternalCustomerRef FROM ${ORDERS_SCHEMA}.ExternalCustomer
            WHERE PaymentProviderID = '${rail.ProviderID}' AND BillToOrganizationID = '${Fx().Customers.OrganizationID}'`,
        );
        AssertEqual(mapping.ExternalCustomerRef, onRail!.customer.id, "the bill-to organisation is mapped to the Bill.com customer the invoice names");
        AssertEqual(row!.ExternalCustomerRef, onRail!.customer.id, "and the invoice row names the same customer");

        const header = await orderMoney(ctx, order.ID);
        AssertEqual(header.ExternalDocumentNumber, order.OrderNumber, "the order shows the rail's invoice number");
        AssertEqual(Number(header.Balance), 300, "sending an invoice moves no money: the balance is untouched");
        AssertEqual(Number(header.AmountPaid), 0, "and nothing reads as paid");
      }),
  },
  {
    Id: "billcom-rail.BR5",
    Name: "BR5: sending the same unit again answers ALREADY_SENT and creates no second Bill.com invoice",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx);
        const first = await sent(ctx, order.ID);
        const again = await issue(ctx, order.ID);
        AssertEqual(again.ResultCode, "ALREADY_SENT", `a second send is answered from our row: ${again.Message}`);
        AssertEqual(again.ExternalInvoiceRef, first.Ref, "naming the invoice already on Bill.com");

        const swept = await sweep(ctx, false);
        Assert(
          !swept.Results.some((r) => r.OrderNumber === order.OrderNumber),
          "the sweep no longer offers a unit that is already Sent",
        );
        AssertEqual(
          bill.Creates("invoices").filter((c) => c.Attributes?.invoiceNumber === order.OrderNumber).length,
          1,
          "Bill.com was asked to create this invoice exactly once",
        );
        AssertEqual(
          (await externalInvoices(ctx, rail)).filter((r) => r.DocumentNumber === order.OrderNumber).length,
          1,
          "and the unit has one row",
        );
      }),
  },
  {
    Id: "billcom-rail.BR6",
    Name: "BR6: a second order for the same customer reuses its Bill.com customer",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const one = await sellOnRail(ctx, 300);
        const two = await sellOnRail(ctx, 300);
        await sent(ctx, one.ID);
        await sent(ctx, two.ID);
        AssertEqual(bill.Creates("customers").length, 1, "the customer was created on Bill.com once");
        AssertEqual(
          await count(ctx, `${ORDERS_SCHEMA}.ExternalCustomer`, `PaymentProviderID = '${rail.ProviderID}'`),
          1,
          "and is mapped once",
        );
        const customers = new Set((await externalInvoices(ctx, rail)).map((r) => r.ExternalCustomerRef));
        AssertEqual(customers.size, 1, "both invoices sit under that one customer");
      }),
  },
  {
    Id: "billcom-rail.BR7",
    Name: "BR7: cancelling an unpaid invoice archives it on Bill.com, reads it back, and clears the order's number",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx);
        const unit = await sent(ctx, order.ID);
        const out = await cancel(ctx, unit.ExternalInvoiceID);
        AssertEqual(out.ResultCode, "CANCELED", `the cancel succeeds: ${out.Message}`);
        Assert(bill.Invoices.get(unit.Ref)!.archived, "Bill.com's invoice is archived");
        const archiveAt = bill.Calls.findIndex((c) => c.Verb === "archive" && c.ID === unit.Ref);
        Assert(
          archiveAt >= 0 && bill.Calls.slice(archiveAt + 1).some((c) => c.Verb === "get" && c.ID === unit.Ref),
          "and the archive was read back rather than trusted",
        );
        const row = (await externalInvoices(ctx, rail)).find((r) => SameID(r.ID, unit.ExternalInvoiceID))!;
        AssertEqual(row.Status, "Canceled", "the row is Canceled");
        AssertEqual(row.ExternalStatus, "ARCHIVED", "and records Bill.com's state");
        AssertEqual((await orderMoney(ctx, order.ID)).ExternalDocumentNumber, null, "the order no longer shows a live rail invoice");
      }),
  },
  {
    Id: "billcom-rail.BR8",
    Name: "BR8: a cancel is refused while Bill.com shows money applied that the poll has not recorded",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 100 }] });
        const out = await cancel(ctx, unit.ExternalInvoiceID);
        AssertEqual(out.ResultCode, "PAYMENT_PENDING_ON_RAIL", `the cancel waits for the poll: ${out.Message}`);
        Assert(!bill.Calls.some((c) => c.Verb === "archive"), "nothing was archived on Bill.com");
        const row = (await externalInvoices(ctx, rail)).find((r) => SameID(r.ID, unit.ExternalInvoiceID))!;
        AssertEqual(row.Status, "Sent", "and the invoice stays Sent");
      }),
  },
  {
    Id: "billcom-rail.BR9",
    Name: "BR9: the payment poll in Preview reports the capture and records nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        const ref = bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });
        const out = await poll(ctx, rail, { Preview: true });
        AssertEqual(out.ResultCode, "PREVIEWED", `the poll ran as a preview: ${out.Message}`);
        const outcome = out.Outcomes.find((o) => o.ExternalPaymentRef === ref);
        AssertEqual(outcome?.Disposition, "Captured", "and says it would capture the cleared payment");
        AssertEqual((await paymentsFor(ctx, rail)).length, 0, "no payment was recorded");
        AssertEqual(await externalPayment(ctx, rail, ref), null, "no external payment row was written");
        AssertEqual(
          await count(ctx, `${ORDERS_SCHEMA}.PaymentProviderSyncState`, `PaymentProviderID = '${rail.ProviderID}'`),
          0,
          "and no watermark was stored",
        );
        AssertEqual(Number((await orderMoney(ctx, order.ID)).Balance), 300, "the order still owes its full amount");
      }),
  },
  {
    Id: "billcom-rail.BR10",
    Name: "BR10: a cleared Bill.com payment is captured once, with its cash leg, and settles the order",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        const ref = bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });
        const out = await poll(ctx, rail);
        AssertEqual(out.ResultCode, "COMPLETED", `the poll completed: ${out.Message}`);
        AssertEqual(out.Captured, 1, "one payment captured");

        const payments = await paymentsFor(ctx, rail);
        AssertEqual(payments.length, 1, "exactly one payment was recorded");
        AssertEqual(payments[0].Status, "Captured", "as Captured");
        AssertEqual(Number(payments[0].Amount), 300, "for the amount Bill.com reported");
        AssertEqual(payments[0].IdempotencyKey, `billcom:${ref}`, "keyed on Bill.com's payment id");

        const ep = await externalPayment(ctx, rail, ref);
        AssertEqual(ep?.Disposition, "Captured", "the external payment row records the capture");
        Assert(SameID(ep?.PaymentHeaderID, payments[0].ID), "and points at the payment");

        const header = await orderMoney(ctx, order.ID);
        AssertEqual(Number(header.AmountPaid), 300, "the order records the payment");
        AssertEqual(Number(header.Balance), 0, "and its balance clears");

        const row = (await externalInvoices(ctx, rail)).find((r) => SameID(r.ID, unit.ExternalInvoiceID))!;
        AssertEqual(Number(row.ExternalDueAmount), 0, "the invoice row is refreshed from Bill.com after the capture");

        const ledger = await TxOne<{ Entries: number; Unbalanced: number }>(
          ctx,
          `WITH e AS (
              SELECT je.ID, SUM(jel.DebitAmount) AS D, SUM(jel.CreditAmount) AS C
                FROM ${ACCT_SCHEMA}.JournalEntry je
                JOIN ${ACCT_SCHEMA}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
               WHERE je.LinkedRecordID IN (
                     SELECT CAST(pl.ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.PaymentLine pl
                      WHERE pl.PaymentHeaderID = '${payments[0].ID}')
               GROUP BY je.ID)
           SELECT COUNT(*) AS Entries,
                  SUM(CASE WHEN ABS(ISNULL(D,0)-ISNULL(C,0)) > 0.005 THEN 1 ELSE 0 END) AS Unbalanced
             FROM e`,
        );
        Assert(Number(ledger.Entries) > 0, "the capture booked its cash leg");
        AssertEqual(Number(ledger.Unbalanced ?? 0), 0, "and every entry balances");
      }),
  },
  {
    Id: "billcom-rail.BR11",
    Name: "BR11: the next poll records nothing again and reads Bill.com from the stored watermark",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        const ref = bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });
        await poll(ctx, rail);

        const state = await TxOne<{ Watermark: string | null; LastSucceededAt: Date | null }>(
          ctx,
          `SELECT Watermark, LastSucceededAt FROM ${ORDERS_SCHEMA}.PaymentProviderSyncState
            WHERE PaymentProviderID = '${rail.ProviderID}' AND ObjectName = 'receivable-payments'`,
        );
        const paymentTime = Date.parse(bill.PaymentUpdatedAt(ref));
        Assert(state.Watermark != null, "the first pass stored a watermark");
        AssertEqual(Date.parse(state.Watermark!), paymentTime, "at the newest payment time Bill.com returned");
        Assert(state.LastSucceededAt != null, "and recorded the pass as succeeded");

        const second = await poll(ctx, rail);
        AssertEqual(second.Captured, 0, "the second pass captures nothing");
        AssertEqual((await paymentsFor(ctx, rail)).length, 1, "there is still exactly one payment");
        AssertEqual(Number((await orderMoney(ctx, order.ID)).AmountPaid), 300, "and the order is paid once, not twice");

        const fetches = bill.Calls.filter((c) => c.Verb === "fetch");
        AssertEqual(fetches.length, 2, "Bill.com was read once per pass");
        AssertEqual(fetches[0].Watermark, null, "the first pass read from the start");
        AssertEqual(
          Date.parse(fetches[1].Watermark ?? ""),
          paymentTime - 24 * 60 * 60 * 1000,
          "the second read from the watermark less the one-day overlap",
        );
      }),
  },
  {
    Id: "billcom-rail.BR12",
    Name: "BR12: a part payment is captured for what arrived and the order keeps the rest owing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 120 }] });
        const out = await poll(ctx, rail);
        AssertEqual(out.Captured, 1, `the part payment is captured: ${out.Message}`);
        const header = await orderMoney(ctx, order.ID);
        AssertEqual(Number(header.AmountPaid), 120, "for what arrived");
        AssertEqual(Number(header.Balance), 180, "and the rest is still owed");
        const row = (await externalInvoices(ctx, rail)).find((r) => SameID(r.ID, unit.ExternalInvoiceID))!;
        AssertEqual(row.Status, "Sent", "the invoice stays Sent");
        AssertEqual(Number(row.ExternalDueAmount), 180, "showing what Bill.com still expects");
      }),
  },
  {
    Id: "billcom-rail.BR13",
    Name: "BR13: one Bill.com payment across two orders' invoices is one payment with a line per order",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const one = await sellOnRail(ctx, 300);
        const two = await sellOnRail(ctx, 200);
        const a = await sent(ctx, one.ID);
        const b = await sent(ctx, two.ID);
        bill.ReceivePayment({
          Status: "PAID",
          Applied: [
            { InvoiceRef: a.Ref, Amount: 300 },
            { InvoiceRef: b.Ref, Amount: 200 },
          ],
        });
        const out = await poll(ctx, rail);
        AssertEqual(out.Captured, 1, `the payment is captured once: ${out.Message}`);
        const payments = await paymentsFor(ctx, rail);
        AssertEqual(payments.length, 1, "as a single payment");
        AssertEqual(Number(payments[0].Amount), 500, "for the whole receipt");
        const lines = await TxQuery<{ OrderHeaderID: string; Amount: number }>(
          ctx,
          `SELECT OrderHeaderID, Amount FROM ${ORDERS_SCHEMA}.PaymentLine WHERE PaymentHeaderID = '${payments[0].ID}'`,
        );
        AssertEqual(lines.length, 2, "with one line per order");
        AssertEqual(Number(lines.find((l) => SameID(l.OrderHeaderID, one.ID))?.Amount), 300, "300 to the first order");
        AssertEqual(Number(lines.find((l) => SameID(l.OrderHeaderID, two.ID))?.Amount), 200, "200 to the second");
        AssertEqual(Number((await orderMoney(ctx, one.ID)).Balance), 0, "the first order is settled");
        AssertEqual(Number((await orderMoney(ctx, two.ID)).Balance), 0, "and so is the second");
      }),
  },
  {
    Id: "billcom-rail.BR14",
    Name: "BR14: a scheduled payment is held, then captured once Bill.com reports it paid",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        const ref = bill.ReceivePayment({ Status: "SCHEDULED", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });

        const first = await poll(ctx, rail);
        AssertEqual(first.Held, 1, `a promised payment is held: ${first.Message}`);
        AssertEqual((await externalPayment(ctx, rail, ref))?.Disposition, "Held", "and recorded as Held");
        AssertEqual((await paymentsFor(ctx, rail)).length, 0, "no cash is recorded for money not yet banked");

        bill.SetPaymentStatus(ref, "PAID");
        const second = await poll(ctx, rail);
        AssertEqual(second.Captured, 1, `once it clears it is captured: ${second.Message}`);
        AssertEqual((await externalPayment(ctx, rail, ref))?.Disposition, "Captured", "and the row moves to Captured");
        AssertEqual(Number((await orderMoney(ctx, order.ID)).Balance), 0, "settling the order");
      }),
  },
  {
    Id: "billcom-rail.BR15",
    Name: "BR15: a payment on an invoice Orders did not issue is left Unmatched and nothing is captured",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const legacy = bill.ForeignInvoice(250);
        const ref = bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: legacy, Amount: 250 }] });
        const out = await poll(ctx, rail);
        AssertEqual(out.ResultCode, "ATTENTION", `a payment nobody here can place needs a person: ${out.Message}`);
        Assert(!out.Success, "and the pass reports it as not clean, so a job that notifies on failure tells somebody");
        AssertEqual(out.Unmatched, 1, "one payment unmatched");
        const ep = await externalPayment(ctx, rail, ref);
        AssertEqual(ep?.Disposition, "Unmatched", "recorded as Unmatched for the exceptions worklist");
        Assert((ep?.DispositionReason ?? "").includes(legacy), "naming the invoice it could not place");
        AssertEqual((await paymentsFor(ctx, rail)).length, 0, "and no cash was recorded");
      }),
  },
  {
    Id: "billcom-rail.BR16",
    Name: "BR16: a signed invoice.updated notification asks for the poll, and that poll captures the payment",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });

        const secret = `whsec_${randomUUID()}`;
        const reply = await deliverWebhook(ctx, rail, invoiceUpdated(unit.Ref), { secret, signWith: secret });
        AssertEqual(reply.Status, 202, "a verified notification is acknowledged at once");
        AssertEqual(reply.Body?.polled, true, "and says a poll follows");
        AssertEqual(reply.PollsRequested.length, 1, "the handler asked for one poll");
        Assert(SameID(reply.PollsRequested[0], rail.ProviderID), "for the provider named in the URL");
        AssertEqual((await paymentsFor(ctx, rail)).length, 1, "the poll it asked for recorded the payment");
        AssertEqual(Number((await orderMoney(ctx, order.ID)).Balance), 0, "and the order is settled");
      }),
  },
  {
    Id: "billcom-rail.BR17",
    Name: "BR17: a notification with a wrong signature, or with no key configured, is refused and polls nothing",
    RequiresMutation: true,
    Fn: async (ctx) =>
      withBillCom(ctx, async (bill) => {
        const rail = await configureRail(ctx);
        const order = await sellOnRail(ctx, 300);
        const unit = await sent(ctx, order.ID);
        bill.ReceivePayment({ Status: "PAID", Applied: [{ InvoiceRef: unit.Ref, Amount: 300 }] });
        const body = invoiceUpdated(unit.Ref);

        const forged = await deliverWebhook(ctx, rail, body, { secret: `whsec_${randomUUID()}`, signWith: `whsec_${randomUUID()}` });
        AssertEqual(forged.Status, 401, "a signature made with another key is refused");
        AssertEqual(forged.PollsRequested.length, 0, "and asks for no poll");

        const unkeyed = await deliverWebhook(ctx, rail, body, { secret: null, signWith: `whsec_${randomUUID()}` });
        AssertEqual(unkeyed.Status, 401, "with no key configured every notification is refused");
        AssertEqual(unkeyed.PollsRequested.length, 0, "and asks for no poll");

        Assert(!bill.Calls.some((c) => c.Verb === "fetch"), "Bill.com was never read");
        AssertEqual((await paymentsFor(ctx, rail)).length, 0, "and nothing was recorded");
      }),
  },
  {
    Id: "billcom-rail.BR18",
    Name: "BR18: the send and poll jobs are installed Disabled and in Preview",
    RequiresMutation: true,
    Fn: async (ctx) =>
      InRolledBackTransaction(ctx, async () => {
        // Going live is two named acts per job: enable it, read a run, then set Preview to false. A job
        // that arrived enabled, or out of Preview, would send invoices or record cash on the day the
        // migration lands, before anyone had read a preview.
        for (const [label, actionID, previewParamID] of [
          ["send", SEND_ACTION_ID, SEND_PREVIEW_PARAM_ID],
          ["poll", POLL_ACTION_ID, POLL_PREVIEW_PARAM_ID],
        ] as const) {
          const jobs = await TxQuery<{ Status: string; Configuration: string }>(
            ctx,
            `SELECT Status, Configuration FROM __mj.ScheduledJob WHERE Configuration LIKE '%${actionID}%'`,
          );
          AssertEqual(jobs.length, 1, `the ${label} job is installed once`);
          AssertEqual(jobs[0].Status, "Disabled", `the ${label} job ships Disabled`);
          const params = (JSON.parse(jobs[0].Configuration) as { Params?: Array<{ ActionParamID: string; Value: unknown }> }).Params ?? [];
          const preview = params.find((p) => SameID(p.ActionParamID, previewParamID));
          AssertEqual(String(preview?.Value ?? "").toLowerCase(), "true", `and the ${label} job is set to Preview`);
        }
      }),
  },
];

for (const check of BillComRailChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle("billcom-rail", {
  Setup: async (ctx) => {
    await CreateOrdersFixture(ctx);
  },
  Teardown: async (ctx) => {
    // The field-length cache was loaded with rows each check rolled back; reload it from what is
    // committed so a later bundle in the same process does not read lengths that no longer exist.
    await ExternalFieldLimitEngine.Instance.Config(true, ctx.User, ctx.Provider);
    await TeardownOrdersFixture(ctx);
  },
});

/**
 * OrderEntityServer — the server-only Order subclass that makes booking atomic (plan D12).
 *
 * On the FIRST transition into `Confirmed` (plan D8), one transaction covers:
 *
 *     order header  →  its lines  →  one JE per line  →  each line's JournalEntryID stamp
 *
 * Any failure rolls the whole thing back. A confirmed order without its journal entries is
 * invalid state, so there is deliberately no partial-success path and no compensation logic.
 *
 * The JE set is written by accounting's `Accounting.CreateJournalEntries`, whose own transaction
 * NESTS inside ours as savepoints — so the single outer commit here covers the order row and
 * every entry. (This is why no TransactionGroup plumbing is needed; nesting composes.)
 *
 * PROVIDER DISCIPLINE (plan D12): everything uses `this.ProviderToUse` — the entity's own
 * provider — throughout. A fresh global `Metadata` inside the transaction path would open a
 * SECOND connection that cannot see our uncommitted work, silently breaking atomicity.
 *
 * IDEMPOTENCY: booking keys off `ConfirmedAt`. Once set, re-saving a confirmed order updates the
 * row normally and never re-books. `OrderLine.JournalEntryID` is additionally NULL→value-once at
 * the database level (trigger 51008), so a double-book is refused by the DB even if this class
 * were bypassed.
 *
 * CONNECTS TO:
 *   FACTORY:  OrderJournalEntryFactory (./OrderJournalEntryFactory.ts)
 *   RESOLVER: GLAccountResolver (./GLAccountResolver.ts)
 *   OP:       'Accounting.CreateJournalEntries' (@mj-biz-apps/accounting-core-entities-server)
 */
import {
    BaseEntity,
    BaseRemotableOperation,
    CompositeKey,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { GLAccountResolver } from './GLAccountResolver.js';
import { OrderJournalEntryFactory, type OrderLineDraft } from './OrderJournalEntryFactory.js';
import {
    SubscriptionBehavior,
    type ExistingSubscription,
    type SubscriptionDecision,
    type SubscriptionTypeRules,
} from './SubscriptionBehavior.js';

interface ProductRow {
    ID: string;
    Name: string;
    SubscriptionTypeID?: string | null;
    RevenueRecognitionTypeID: string;
}

/** Terms created during a confirm, and the recognition cadence each line inherits from its type. */
interface SubscriptionMaterialization {
    TermsByLine: Map<string, { ID: string; StartDate: Date; EndDate: Date; Amount: number }>;
    RecognitionMonthsByLine: Map<string, number>;
}

const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const COMPANY_ENTITY = 'MJ: Companies';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_TYPE_ENTITY = 'MJ_BizApps_Orders: Subscription Types';

/** Statuses at or beyond the booking lock (plan D8/D9). */
const BOOKED_STATUSES = new Set(['Confirmed', 'Posted', 'Fulfilled']);

/**
 * The subset of `AccountingEngineBase` this class uses. Declared structurally so the accounting
 * peer stays an optional, dynamically-imported dependency at build time.
 */
interface AccountingEngineSurface {
    ConfigEx: (o: { contextUser: UserInfo; provider: IMetadataProvider }) => Promise<unknown>;
    /** Returns the matched link (account lives on `Link.GLAccountID`) plus its dimensions. */
    ResolveLinkedAccount: (
        entityId: string,
        recordId: string,
        role: string,
        asOf: Date,
    ) => { Link?: { GLAccountID?: string } } | null;
    GLAccountByID: (id: string) => { CompanyID?: string } | undefined;
}

/** Shape of the result accounting returns for the JE set. */
interface CreateJournalEntriesResult {
    Success: boolean;
    Results?: Array<{ Success: boolean; JournalEntryID?: string; EntryNumber?: string }>;
    Errors?: Array<{ Code: string; Message: string; DraftIndex?: number; LineIndex?: number }>;
}

@RegisterClass(BaseEntity, ORDER_ENTITY)
export class OrderEntityServer extends mjBizAppsOrdersOrderHeaderEntity {
    private _lines: mjBizAppsOrdersOrderLineEntity[] = [];

    /**
     * Unsaved child lines to persist with this order (plan D12). Populate before `Save()` when
     * creating an order and its lines as one unit; leave empty to save the header alone.
     */
    public get Lines(): mjBizAppsOrdersOrderLineEntity[] {
        return this._lines;
    }
    public set Lines(value: mjBizAppsOrdersOrderLineEntity[]) {
        this._lines = value ?? [];
    }

    // ─── Validation ────────────────────────────────────────────────────────────

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // An order entering the booked state must have something to book. Draft orders may be
        // empty — you build them up over time.
        if (this.willBookOnThisSave()) {
            const lineCount = this._lines.length > 0 ? this._lines.length : await this.countPersistedLines();
            if (lineCount === 0) {
                result.Success = false;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Status',
                        `Order ${this.OrderNumber ?? ''} cannot be confirmed with no lines — there would be nothing to book.`,
                        this.Status,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        }

        // Children guard their own invariants; surface their failures against the order.
        for (const line of this._lines) {
            const lineResult = await line.ValidateAsync();
            if (!lineResult.Success) {
                result.Success = false;
                result.Errors.push(...lineResult.Errors);
            }
        }

        return result;
    }

    // ─── Save Override ─────────────────────────────────────────────────────────

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const booking = this.willBookOnThisSave();

        // Not a booking save — ordinary path, no transaction needed beyond the base save.
        if (!booking && this._lines.length === 0) {
            return super.Save(options);
        }

        const dbProvider = this.ProviderToUse as unknown as DatabaseProviderBase;

        try {
            await dbProvider.BeginTransaction();

            if (booking) {
                this.ConfirmedAt = new Date();
            }

            // The order IS the receivable, so its number is an A/R document number — assigned
            // gap-consciously from OrderSequence before the first insert (D30).
            if (!this.IsSaved && !this.OrderNumber) {
                this.OrderNumber = await this.assignOrderNumber();
            }

            const savedHeader = await super.Save(options);
            if (!savedHeader) {
                throw new Error(
                    `Failed to save order header: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            await this.savePendingLines(options);

            if (booking) {
                const lines = await this.loadLinesForBooking();
                // Subscriptions first: a term must exist before booking so recognition entries can
                // anchor to it (D46) and use its anchored/prorated window rather than raw line dates.
                const subs = await this.materializeSubscriptions(lines, options);
                await this.bookLines(lines, options, subs);
                await this.createInitialPayment(options);
            }

            await dbProvider.CommitTransaction();
            return true;
        } catch (err) {
            LogError(`OrderEntityServer.Save failed for order ${this.OrderNumber ?? this.ID}: ${err}`);
            try {
                await dbProvider.RollbackTransaction();
            } catch (rollbackErr) {
                LogError(`Rollback failed after OrderEntityServer.Save error: ${rollbackErr}`);
            }
            return false;
        }
    }

    // ─── Booking ───────────────────────────────────────────────────────────────

    /** True when this save is the first transition into a booked status (plan D8). */
    private willBookOnThisSave(): boolean {
        if (!BOOKED_STATUSES.has(this.Status)) return false;
        if (this.ConfirmedAt) return false; // already booked — never re-book
        return true;
    }

    private async savePendingLines(options?: EntitySaveOptions): Promise<void> {
        for (const line of this._lines) {
            line.OrderHeaderID = this.ID;
            const saved = await line.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to save order line ${line.LineNumber}: ${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        this._lines = [];
    }

    /**
     * Build one draft per line, submit them as ONE set, then stamp each line with its entry.
     * Every step is inside the caller's transaction.
     */
    private async bookLines(
        lines: mjBizAppsOrdersOrderLineEntity[],
        options?: EntitySaveOptions,
        subs?: SubscriptionMaterialization,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const unbooked = lines.filter((l) => !l.JournalEntryID);
        if (unbooked.length === 0) return;

        const factory = new OrderJournalEntryFactory(
            await this.buildResolver(provider, user),
            this.entityIDFor(ORDER_LINE_ENTITY),
            this.entityIDFor(SUBSCRIPTION_TERM_ENTITY),
            provider,
            user,
        );

        const drafts = await factory.BuildDrafts(this, unbooked, subs?.TermsByLine, subs?.RecognitionMonthsByLine);
        const result = await this.submitDrafts(drafts, provider, user);

        if (!result.Success) {
            const detail = (result.Errors ?? [])
                .map((e) => {
                    const which =
                        e.DraftIndex !== undefined
                            ? ` (order line ${
                                  unbooked.find((l) => l.ID === drafts[e.DraftIndex!]?.OrderLineID)?.LineNumber ??
                                  e.DraftIndex
                              })`
                            : '';
                    return `${e.Code}${which}: ${e.Message}`;
                })
                .join('; ');
            throw new Error(`Journal entry booking failed — no entries were written. ${detail}`);
        }

        await this.stampJournalEntryIDs(drafts, result, options);
    }

    /**
     * Invoke accounting's SET operation. Resolved through MJ's class factory by key so this
     * package does not hard-depend on the accounting server package at build time.
     */
    private async submitDrafts(
        drafts: OrderLineDraft[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CreateJournalEntriesResult> {
        const op = MJGlobal.Instance.ClassFactory.CreateInstance<
            BaseRemotableOperation<{ Drafts: unknown[] }, CreateJournalEntriesResult>
        >(BaseRemotableOperation, 'Accounting.CreateJournalEntries');

        if (!op) {
            throw new Error(
                `The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps ` +
                    `Accounting server package must be loaded before orders can book journal entries.`,
            );
        }

        const result = await op.Execute({ Drafts: drafts.map((d) => d.Draft) }, { provider, user });

        // The envelope reports transport/authorization failure; the payload reports the
        // accounting-domain outcome. Both must be checked — a successful call can still carry
        // a failed booking.
        if (!result.Success) {
            throw new Error(
                `Accounting.CreateJournalEntries did not execute: ${result.ErrorMessage ?? result.ResultCode ?? 'unknown error'}`,
            );
        }
        if (!result.Output) {
            throw new Error(`Accounting.CreateJournalEntries returned no payload.`);
        }
        return result.Output;
    }

    /**
     * Stamp each line with its BOOKING entry (NULL→value-once; trigger 51008 enforces the same
     * rule independently). Recognition entries are forward-dated releases — they belong to the
     * schedule, not to the line's booking pointer, so they are skipped here.
     */
    private async stampJournalEntryIDs(
        drafts: OrderLineDraft[],
        result: CreateJournalEntriesResult,
        options?: EntitySaveOptions,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const results = result.Results ?? [];

        for (let i = 0; i < drafts.length; i++) {
            if (!drafts[i].IsBooking) continue;
            const jeID = results[i]?.JournalEntryID;
            if (!jeID) {
                throw new Error(
                    `Accounting reported success but returned no journal entry for order line index ${i}.`,
                );
            }

            // Provider discipline (plan D12): load through the entity's OWN provider so the read
            // sees our uncommitted transaction, not a second connection.
            const line = await provider.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
                ORDER_LINE_ENTITY,
                CompositeKey.FromID(drafts[i].OrderLineID),
                this.ContextCurrentUser,
            );
            line.JournalEntryID = jeID;

            const saved = await line.Save(options);
            if (!saved) {
                throw new Error(
                    `Failed to stamp JournalEntryID on order line ${line.LineNumber}: ` +
                        `${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
    }



    // ─── Subscriptions (D45/D46) ───────────────────────────────────────────────

    /**
     * For every subscription line, apply the type's rules and materialize the Subscription (find,
     * extend, reactivate, or create) plus the SubscriptionTerm this purchase bought.
     *
     * Runs BEFORE booking so the recognition entries can anchor to the term and use its
     * anchored/prorated window — a calendar-anchored membership bought in July does NOT recognize
     * over July→July; it recognizes over July→Dec at a prorated amount.
     *
     * All rule evaluation is delegated to `SubscriptionBehavior`, which is pure. This method does
     * the persistence, inside the caller's transaction.
     */
    private async materializeSubscriptions(
        lines: mjBizAppsOrdersOrderLineEntity[],
        options?: EntitySaveOptions,
    ): Promise<SubscriptionMaterialization> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;
        const out: SubscriptionMaterialization = { TermsByLine: new Map(), RecognitionMonthsByLine: new Map() };

        const subLines = await this.subscriptionLines(lines);
        if (subLines.length === 0) return out;

        for (const { line, product, rules } of subLines) {
            const behavior = this.behaviorFor(rules);
            const existing = await this.findExistingSubscription(product.ID);

            const decision = behavior.Decide({
                Rules: rules,
                PurchaseDate: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                Amount: line.LineTotalNet ?? 0,
                Existing: existing,
                SubscriberIsOrganization: !!this.CustomerOrganizationID,
            });

            if (decision.Action === 'Reject') {
                // A rules violation must fail the whole confirm — booking is all-or-none, and a
                // silently-dropped subscription would leave a paid-for line with no coverage.
                throw new Error(
                    `Order line ${line.LineNumber} (${product.Name}) cannot be subscribed: ${decision.RejectReason}`,
                );
            }

            const subscriptionID =
                decision.Action === 'CreateNew'
                    ? await this.createSubscription(product, rules, decision, options)
                    : await this.touchExistingSubscription(decision, options);

            const term = decision.Term!;
            const termEntity = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_TERM_ENTITY, user);
            termEntity.NewRecord();
            termEntity.Set('SubscriptionID', subscriptionID);
            termEntity.Set('TermNumber', term.TermNumber);
            termEntity.Set('OrderLineID', line.ID);
            termEntity.Set('StartDate', term.StartDate);
            termEntity.Set('EndDate', term.EndDate);
            termEntity.Set('Amount', term.Amount);
            termEntity.Set('IsProrated', term.IsProrated);
            termEntity.Set('ProrationFactor', term.ProrationFactor);
            // Frozen at purchase: later changes to the product's rules must never restate a
            // term that has already been booked.
            termEntity.Set('RevenueRecognitionTypeID', product.RevenueRecognitionTypeID);
            termEntity.Set('Status', 'Active');

            if (!(await termEntity.Save(options))) {
                throw new Error(
                    `Failed to create the subscription term for order line ${line.LineNumber}: ` +
                        `${termEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            // The term is the coverage window the schedule must follow, and its cadence decides
            // how many slices that window produces.
            out.TermsByLine.set(line.ID, {
                ID: termEntity.Get('ID') as string,
                StartDate: term.StartDate,
                EndDate: term.EndDate,
                Amount: term.Amount,
            });
            out.RecognitionMonthsByLine.set(line.ID, behavior.RecognitionMonths(rules));

            // The line's stored service period reflects the TERM, not what a user typed.
            line.ServicePeriodStart = term.StartDate;
            line.ServicePeriodEnd = term.EndDate;
            await line.Save(options);
        }

        return out;
    }

    /** Lines whose product carries a subscription type, joined to their rules. */
    private async subscriptionLines(
        lines: mjBizAppsOrdersOrderLineEntity[],
    ): Promise<Array<{ line: mjBizAppsOrdersOrderLineEntity; product: ProductRow; rules: SubscriptionTypeRules }>> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const ids = [...new Set(lines.map(l => l.ProductID))].map(id => `'${id}'`).join(',');
        if (!ids) return [];

        const prod = await rv.RunView<ProductRow>(
            {
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `ID IN (${ids}) AND SubscriptionTypeID IS NOT NULL`,
                Fields: ['ID', 'Name', 'SubscriptionTypeID', 'RevenueRecognitionTypeID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const products = new Map((prod?.Results ?? []).map(p => [p.ID, p]));
        if (products.size === 0) return [];

        const types = await rv.RunView<SubscriptionTypeRules>(
            { EntityName: SUBSCRIPTION_TYPE_ENTITY, ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        const rulesByID = new Map((types?.Results ?? []).map(t => [t.ID, t]));

        const out = [];
        for (const line of lines) {
            const product = products.get(line.ProductID);
            if (!product) continue;
            const rules = rulesByID.get(product.SubscriptionTypeID!);
            if (!rules) {
                throw new Error(`Product '${product.Name}' names a subscription type that was not found.`);
            }
            out.push({ line, product, rules });
        }
        return out;
    }

    /**
     * The behaviour object: the base class when the type has no driver (the common case — the
     * columns ARE the rules, D45), or a registered subclass when one is named.
     */
    private behaviorFor(rules: SubscriptionTypeRules): SubscriptionBehavior {
        if (!rules.DriverClass) return new SubscriptionBehavior();
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<SubscriptionBehavior>(
            SubscriptionBehavior,
            rules.DriverClass,
        );
        if (!driver) {
            throw new Error(
                `Subscription type '${rules.Code}' names driver '${rules.DriverClass}', which is not ` +
                    `registered. Register a SubscriptionBehavior subclass under that key.`,
            );
        }
        return driver;
    }

    /** The most recent subscription for this (customer, product), whatever its status. */
    private async findExistingSubscription(productID: string): Promise<ExistingSubscription | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const scope = this.CustomerOrganizationID
            ? `CustomerOrganizationID='${this.CustomerOrganizationID}'`
            : this.CustomerPersonID
              ? `BeneficiaryPersonID='${this.CustomerPersonID}'`
              : null;
        if (!scope) return null;

        const res = await rv.RunView<{ ID: string; Status: string }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: `ProductID='${productID}' AND ${scope}`,
                Fields: ['ID', 'Status'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const sub = res?.Results?.[0];
        if (!sub) return null;

        const terms = await rv.RunView<{ EndDate: string; TermNumber: number }>(
            {
                EntityName: SUBSCRIPTION_TERM_ENTITY,
                ExtraFilter: `SubscriptionID='${sub.ID}'`,
                Fields: ['EndDate', 'TermNumber'],
                OrderBy: 'TermNumber DESC',
                MaxRows: 1,
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        const latest = terms?.Results?.[0];
        return {
            ID: sub.ID,
            Status: sub.Status,
            LatestTermEnd: latest?.EndDate ? new Date(latest.EndDate) : null,
            LatestTermNumber: latest?.TermNumber ?? 0,
        };
    }

    private async createSubscription(
        product: ProductRow,
        rules: SubscriptionTypeRules,
        decision: SubscriptionDecision,
        options?: EntitySaveOptions,
    ): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const sub = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_ENTITY, this.ContextCurrentUser);
        sub.NewRecord();
        sub.Set('SubscriptionNumber', await this.assignSubscriptionNumber());
        sub.Set('CompanyID', this.CompanyID);
        sub.Set('SubscriptionTypeID', rules.ID);
        sub.Set('ProductID', product.ID);
        sub.Set('CustomerOrganizationID', this.CustomerOrganizationID);
        sub.Set('BeneficiaryPersonID', this.CustomerPersonID);
        sub.Set('Status', rules.TrialDays > 0 ? 'Trialing' : 'Active');
        sub.Set('StartDate', decision.Term!.StartDate);
        sub.Set('AutoRenew', rules.AutoRenewDefault);

        if (!(await sub.Save(options))) {
            throw new Error(
                `Failed to create the subscription for '${product.Name}': ` +
                    `${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return sub.Get('ID') as string;
    }

    /** Extension or reactivation — the term is what changes; the subscription just re-activates. */
    private async touchExistingSubscription(
        decision: SubscriptionDecision,
        options?: EntitySaveOptions,
    ): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const sub = await provider.GetEntityObject<BaseEntity>(
            SUBSCRIPTION_ENTITY,
            CompositeKey.FromID(decision.SubscriptionID!),
            this.ContextCurrentUser,
        );
        if (decision.Action === 'Reactivate') {
            sub.Set('Status', 'Active');
            sub.Set('CanceledAt', null);
            sub.Set('EndDate', null);
            if (!(await sub.Save(options))) {
                throw new Error(
                    `Failed to reactivate subscription: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        return decision.SubscriptionID!;
    }

    private async assignSubscriptionNumber(): Promise<string> {
        // Subscriptions have no dedicated sequence table; derive from the order number, which is
        // already gap-conscious and unique, plus the term index appended by the caller.
        return `SUB-${(this.OrderNumber ?? this.ID).replace(/^ORD-/, '')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    // ─── Numbering (D30) ───────────────────────────────────────────────────────

    /**
     * Mint the next `ORD-{seq}` from the OrderSequence singleton.
     *
     * The order IS the invoice (D2), so this is an A/R document number and auditors expect it to
     * be gap-conscious. Taken with UPDLOCK+HOLDLOCK inside the caller's transaction so concurrent
     * confirms serialize on the counter rather than colliding on the UNIQUE index.
     *
     * Currently a GLOBAL sequence per D30. Jeremy's global-vs-per-company call is still open; the
     * change would be a WHERE clause here plus a CompanyID on the sequence table.
     */
    private async assignOrderNumber(): Promise<string> {
        const provider = this.ProviderToUse as unknown as { ExecuteSQL: (sql: string, params?: unknown[]) => Promise<unknown> };
        const rows = (await provider.ExecuteSQL(
            // OUTPUT ... INTO (not a bare OUTPUT): CodeGen puts an __mj_UpdatedAt trigger on every
            // table, and SQL Server forbids a bare OUTPUT clause on a table that has triggers.
            `DECLARE @seq TABLE (Seq INT);
             UPDATE __mj_BizAppsOrders.OrderSequence WITH (UPDLOCK, HOLDLOCK)
             SET NextSequenceNumber = NextSequenceNumber + 1
             OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
             WHERE ID = 1;
             SELECT Seq FROM @seq;`,
        )) as Array<{ Seq: number }>;

        const seq = rows?.[0]?.Seq;
        if (!seq) {
            throw new Error(
                `Could not obtain the next order number — the OrderSequence singleton (ID=1) is missing. ` +
                    `It is seeded by the baseline migration.`,
            );
        }
        return `ORD-${String(seq).padStart(6, '0')}`;
    }

    // ─── Initial payment (D42) ─────────────────────────────────────────────────

    /**
     * Turn the order's captured payment INTENT into a real payment.
     *
     * `InitialPaymentTypeID`/`Amount`/`DetailID` are a convenience capture at order entry; on
     * confirm they become a PaymentHeader plus a PaymentLine applied to this order. The rollup
     * triggers then move AmountPaid/Balance/PaymentStatus on their own (D41) — nothing here
     * touches those fields.
     *
     * The instrument is COPIED, never shared (D39): the order keeps its snapshot of what was
     * intended, the payment gets its own record of what ran, and neither can rewrite the other.
     */
    private async createInitialPayment(options?: EntitySaveOptions): Promise<void> {
        const amount = this.InitialPaymentAmount ?? 0;
        if (!this.InitialPaymentTypeID || amount <= 0) return;

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;

        // Copy the intent instrument so the payment owns its own row (D39).
        let paymentDetailID: string | null = null;
        if (this.InitialPaymentDetailID) {
            paymentDetailID = await this.copyPaymentDetail(this.InitialPaymentDetailID, options);
        }

        const payment = await provider.GetEntityObject<BaseEntity>(PAYMENT_HEADER_ENTITY, user);
        payment.NewRecord();
        payment.Set('PaymentNumber', await this.assignPaymentNumber());
        payment.Set('ReceivingCompanyID', this.CompanyID);
        payment.Set('CustomerOrganizationID', this.CustomerOrganizationID);
        payment.Set('PaymentDate', this.OrderDate ?? new Date());
        payment.Set('PaymentTypeID', this.InitialPaymentTypeID);
        payment.Set('Amount', amount);
        payment.Set('PaymentDetailID', paymentDetailID);
        payment.Set('Status', 'Captured');
        payment.Set('Description', `Initial payment for order ${this.OrderNumber}`);

        if (!(await payment.Save(options))) {
            throw new Error(
                `Failed to create the initial payment for order ${this.OrderNumber}: ` +
                    `${payment.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        const line = await provider.GetEntityObject<BaseEntity>(PAYMENT_LINE_ENTITY, user);
        line.NewRecord();
        line.Set('PaymentHeaderID', payment.Get('ID'));
        line.Set('OrderHeaderID', this.ID);
        line.Set('Amount', amount);
        line.Set('AllocatedAt', new Date());
        line.Set('AllocatedByUserID', user?.ID ?? null);

        if (!(await line.Save(options))) {
            throw new Error(
                `Failed to apply the initial payment to order ${this.OrderNumber}: ` +
                    `${line.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** Duplicate a PaymentDetail so each host owns its own immutable snapshot (D39). */
    private async copyPaymentDetail(sourceID: string, options?: EntitySaveOptions): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const source = await provider.GetEntityObject<BaseEntity>(
            PAYMENT_DETAIL_ENTITY,
            CompositeKey.FromID(sourceID),
            this.ContextCurrentUser,
        );

        const copy = await provider.GetEntityObject<BaseEntity>(PAYMENT_DETAIL_ENTITY, this.ContextCurrentUser);
        copy.NewRecord();
        for (const f of source.Fields) {
            if (f.Name === 'ID' || f.Name.startsWith('__mj_')) continue;
            copy.Set(f.Name, source.Get(f.Name));
        }
        // Record where the copy came from when the source was a saved wallet entry.
        if (!source.Get('SourceCustomerPaymentMethodID')) {
            copy.Set('SourceCustomerPaymentMethodID', source.Get('SourceCustomerPaymentMethodID'));
        }

        if (!(await copy.Save(options))) {
            throw new Error(
                `Failed to copy the payment instrument for order ${this.OrderNumber}: ` +
                    `${copy.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return copy.Get('ID') as string;
    }

    private async assignPaymentNumber(): Promise<string> {
        const provider = this.ProviderToUse as unknown as { ExecuteSQL: (sql: string, params?: unknown[]) => Promise<unknown> };
        const rows = (await provider.ExecuteSQL(
            // OUTPUT ... INTO (not a bare OUTPUT): CodeGen puts an __mj_UpdatedAt trigger on every
            // table, and SQL Server forbids a bare OUTPUT clause on a table that has triggers.
            `DECLARE @seq TABLE (Seq INT);
             UPDATE __mj_BizAppsOrders.PaymentSequence WITH (UPDLOCK, HOLDLOCK)
             SET NextSequenceNumber = NextSequenceNumber + 1
             OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
             WHERE ID = 1;
             SELECT Seq FROM @seq;`,
        )) as Array<{ Seq: number }>;
        const seq = rows?.[0]?.Seq;
        if (!seq) throw new Error('Could not obtain the next payment number — PaymentSequence (ID=1) is missing.');
        return `PAY-${String(seq).padStart(6, '0')}`;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private async buildResolver(provider: IMetadataProvider, user: UserInfo): Promise<GLAccountResolver> {
        const engine = await this.loadAccountingEngine(provider, user);

        return new GLAccountResolver(
            {
                Product: this.entityIDFor(PRODUCT_ENTITY),
                ProductCategory: this.entityIDFor(PRODUCT_CATEGORY_ENTITY),
                Company: this.entityIDFor(COMPANY_ENTITY),
            },
            provider,
            user,
            (entityId, recordId, role, asOf) => {
                // ResolveLinkedAccount returns { Link, Dimensions } — the account is on the link.
                const hit = engine.ResolveLinkedAccount(entityId, recordId, role, asOf);
                const glAccountID = hit?.Link?.GLAccountID;
                if (!glAccountID) return null;

                // The company comes from the ACCOUNT, which is what accounting uses to derive the
                // JE's company (their CH-2) — so this is the value the D6 guard must compare.
                const account = engine.GLAccountByID(glAccountID);
                return { GLAccountID: glAccountID, CompanyID: account?.CompanyID ?? '' };
            },
        );
    }

    /** Loaded dynamically so the accounting peer stays optional at build time. */
    private async loadAccountingEngine(
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AccountingEngineSurface> {
        const mod = (await import('@mj-biz-apps/accounting-engine-base')) as unknown as {
            AccountingEngineBase: { Instance: AccountingEngineSurface };
        };

        const engine = mod.AccountingEngineBase.Instance;
        await engine.ConfigEx({ contextUser: user, provider });
        return engine;
    }

    private entityIDFor(entityName: string): string {
        const md = new Metadata();
        const entity = md.Entities.find((e) => e.Name === entityName);
        if (!entity) {
            throw new Error(`Entity '${entityName}' was not found in metadata.`);
        }
        return entity.ID;
    }

    private async loadLinesForBooking(): Promise<mjBizAppsOrdersOrderLineEntity[]> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView<mjBizAppsOrdersOrderLineEntity>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.ID}'`,
                OrderBy: 'LineNumber',
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser,
        );
        return result?.Results ?? [];
    }

    private async countPersistedLines(): Promise<number> {
        if (!this.IsSaved) return 0;
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const result = await rv.RunView(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `OrderHeaderID='${this.ID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            this.ContextCurrentUser,
        );
        return result?.Results?.length ?? 0;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderEntityServer(): void {
    // intentionally empty
}

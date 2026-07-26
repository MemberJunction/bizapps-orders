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
    BaseEntityResult,
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
import { BuildGLAccountResolver, EntityIDFor } from './AccountingBridge.js';
import { OrdersSettings } from './OrdersSettings.js';
import { OrderJournalEntryFactory, type OrderLineDraft } from './OrderJournalEntryFactory.js';
import {
    SubscriptionBehavior,
    type SubscriberIdentity,
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
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const RELATIONSHIP_ENTITY = 'MJ.BizApps.Common: Relationships';
const COMMON_SCHEMA = '__mj_BizAppsCommon';
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
/**
 * Normalize a GUID for use as a Map key.
 *
 * SQL Server returns `UNIQUEIDENTIFIER` uppercased, while an ID that arrived from a caller (or from
 * `randomUUID()`) is lowercase. Both name the same row, and SQL compares them correctly — but a JS
 * `Map` does not, so any lookup that crosses the boundary between "value I was handed" and "value
 * that came back from the database" MUST go through here. Every place this was skipped produced the
 * same failure shape: a silent miss that looks like missing data rather than a key mismatch.
 */
const uuidKey = (id: string | null | undefined): string => (id ?? '').toLowerCase();

/** A line's subscription decision, carried from the pre-insert pass to the persistence pass. */
interface SubscriptionDecisionForLine {
    Product: ProductRow;
    Rules: SubscriptionTypeRules;
    Decision: SubscriptionDecision;
    /** Resolved once during the decision pass so persistence uses the same answer. */
    Subscriber: SubscriberIdentity;
    /** The resolved behaviour — reused for RecognitionMonths so a driver's override still applies. */
    Behavior: SubscriptionBehavior;
}

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

            // DECIDE BEFORE THE LINES ARE INSERTED. The rules may shorten the first period, and a
            // prorated term must bill the prorated amount — but the header is already Confirmed by
            // now, so the immutability trigger (correctly) refuses to let a saved line's Quantity
            // change afterwards. Deciding first means the line is INSERTED at its final quantity
            // and never updated, which keeps the trigger's guarantee intact instead of working
            // around it.
            const decisions = booking ? await this.decideSubscriptions() : new Map();

            await this.savePendingLines(options, decisions);

            if (booking) {
                const lines = await this.loadLinesForBooking();
                // Subscriptions before booking: a term must exist so recognition entries can anchor
                // to it (D46) and use its anchored/prorated window rather than raw line dates.
                const subs = await this.materializeSubscriptions(lines, decisions, options);
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
            // Surface WHY. Without this the caller gets a bare `false` and `LatestResult` still
            // holds the header's SUCCESSFUL save — so a subscription rule rejection or an
            // unresolvable GL account reads as "it just didn't work". The UI, the API and the
            // integration suite all need the reason; the log is not a return value.
            this.RegisterResultHistoryEntry(this.buildFailureResult(err));
            return false;
        }
    }

    /**
     * Turn a thrown booking error into the `BaseEntityResult` a caller can read off `LatestResult`.
     * The message is the error's own text — GLAccountResolver and SubscriptionBehavior both write
     * messages meant for a human, so passing them through beats a generic "save failed".
     */
    private buildFailureResult(err: unknown): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = err instanceof Error ? err.message : String(err);
        result.Error = err;
        result.OriginalValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map(f => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }

    // ─── Booking ───────────────────────────────────────────────────────────────

    /** True when this save is the first transition into a booked status (plan D8). */
    private willBookOnThisSave(): boolean {
        if (!BOOKED_STATUSES.has(this.Status)) return false;
        if (this.ConfirmedAt) return false; // already booked — never re-book
        return true;
    }

    private async savePendingLines(
        options?: EntitySaveOptions,
        decisions?: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
    ): Promise<void> {
        for (const line of this._lines) {
            line.OrderHeaderID = this.ID;

            // Scale the QUANTITY, not DiscountPct: a short first period is not a concession, and
            // routing it through the discount field would corrupt discount reporting and post the
            // difference to the Sales Discounts contra account, where it does not belong.
            // Rounded to 4dp — `OrderLine.Quantity`'s scale — so the stored value and any later
            // recomputation of the line total agree exactly.
            const decided = decisions?.get(line);
            const term = decided?.Decision.Term;
            if (term?.IsProrated && term.ProrationFactor != null) {
                line.Quantity = Math.round(line.Quantity * term.ProrationFactor * 1e4) / 1e4;
            }

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
        decisions: Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>,
        options?: EntitySaveOptions,
    ): Promise<SubscriptionMaterialization> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser;
        const out: SubscriptionMaterialization = { TermsByLine: new Map(), RecognitionMonthsByLine: new Map() };

        if (decisions.size === 0) return out;

        // The decisions were made against the PENDING line objects; re-key them by ID so they can
        // be matched to the freshly loaded, now-persisted lines.
        //
        // LOWERCASED: a GUID that round-trips through SQL Server comes back uppercased, so keying
        // on the raw value silently misses every lookup — the subscription would be created with no
        // term attached, and the recognition schedule would then fail for want of a coverage window.
        const byLineID = new Map<string, SubscriptionDecisionForLine>();
        for (const [pending, decided] of decisions) {
            if (pending.ID) byLineID.set(uuidKey(pending.ID), decided);
        }

        for (const line of lines) {
            const decided = byLineID.get(uuidKey(line.ID));
            if (!decided) continue;
            const { Product: product, Rules: rules, Decision: decision } = decided;

            const subscriptionID =
                decision.Action === 'CreateNew'
                    ? await this.createSubscription(line, product, rules, decision, decided.Subscriber, options)
                    : await this.touchExistingSubscription(decision, !!line.RenewsSubscriptionID, options);

            const term = decision.Term!;

            // The LINE is the authority on price — `savePendingLines` already inserted it at the
            // prorated quantity. Taking the term's amount from it makes booking (line net), the
            // term, and the recognition schedule reconcile exactly; three numbers that must agree
            // or deferred revenue never clears to zero.
            term.Amount = line.LineTotalNet ?? term.Amount;

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
            out.RecognitionMonthsByLine.set(line.ID, decided.Behavior.RecognitionMonths(rules));

            // The line's stored service period reflects the TERM, not what a user typed.
            line.ServicePeriodStart = term.StartDate;
            line.ServicePeriodEnd = term.EndDate;
            await line.Save(options);
        }

        return out;
    }

    /**
     * Evaluate the subscription rules for every pending line, BEFORE any of them is inserted.
     *
     * Pure with respect to this app's tables — it reads the catalog and any existing subscription,
     * then asks the behaviour what to do. Nothing is written, so a rules rejection aborts the
     * confirm before a single line exists.
     */
    private async decideSubscriptions(): Promise<Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>> {
        const out = new Map<mjBizAppsOrdersOrderLineEntity, SubscriptionDecisionForLine>();
        const subLines = await this.subscriptionLines(this._lines);
        if (subLines.length === 0) return out;

        // Settings drive whether the organization is inferred at all, so load the cache once here
        // rather than per line.
        await OrdersSettings.Load(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);

        for (const { line, product, rules } of subLines) {
            const behavior = this.behaviorFor(rules);
            let subscriber = await this.withInferredOrganization(this.resolveSubscriber(line));
            // An explicitly named subscription wins; otherwise find one for this subscriber and
            // product, scoped by the type's BenefitModel (D62).
            const existing = line.RenewsSubscriptionID
                ? await this.loadSubscriptionState(`ID='${line.RenewsSubscriptionID}'`)
                : await this.findExistingSubscription(product.ID, behavior.DedupeIdentity(rules, subscriber));

            // NAMING a subscription IS the statement of who the subscriber is. Requiring the line to
            // restate it would make renewing a seat impossible without repeating the person, and any
            // mismatch between the two would be a silent contradiction. The target wins.
            if (line.RenewsSubscriptionID && existing) {
                subscriber = {
                    OrganizationID: existing.CustomerOrganizationID ?? null,
                    PersonID: existing.BeneficiaryPersonID ?? null,
                };
            }

            const decision = behavior.Decide({
                Rules: rules,
                PurchaseDate: this.OrderDate ? new Date(this.OrderDate) : new Date(),
                // The line is not saved yet, so `LineTotalNet` is not computed — derive the same
                // figure OrderLineEntityServer will: quantity × price, less the discount.
                Amount: this.pendingLineNet(line),
                Existing: existing,
                Subscriber: subscriber,
                // A renewal continues the NAMED subscription rather than starting one, so the
                // concurrency rule must not refuse it (D55).
                IsRenewal: !!line.RenewsSubscriptionID,
            });

            if (decision.Action === 'Reject') {
                // A rules violation fails the WHOLE confirm — booking is all-or-none, and a
                // silently-dropped subscription would leave a paid-for line with no coverage.
                throw new Error(
                    `Order line ${line.LineNumber} (${product.Name}) cannot be subscribed: ${decision.RejectReason}`,
                );
            }

            out.set(line, { Product: product, Rules: rules, Decision: decision, Behavior: behavior, Subscriber: subscriber });
        }
        return out;
    }

    /**
     * WHO a line is for: the line's ship-to, falling back to the order header (D61).
     *
     * Ship-to on a line means "where this goes" for a physical product and "who this is for" when
     * there is nothing to ship. A subscription line therefore reads its subscriber from the same
     * fields a shipped line reads its destination from — one question, two kinds of answer.
     *
     * The fallback is per-side, not all-or-nothing: a line may name only a person (a seat bought
     * under the order's customer organization) and still inherit that organization from the header.
     */
    private resolveSubscriber(line: mjBizAppsOrdersOrderLineEntity): SubscriberIdentity {
        // THREE tiers, resolved per side independently: the line's ship-to, then the ORDER's
        // ship-to, then the order's customer. Nothing is required at the line — an order shipping
        // everything to one recipient states them once on the header, and a line only overrides
        // when it genuinely differs.
        return {
            OrganizationID:
                line.ShipToOrganizationID ?? this.ShipToOrganizationID ?? this.CustomerOrganizationID ?? null,
            PersonID: line.ShipToPersonID ?? this.ShipToPersonID ?? this.CustomerPersonID ?? null,
        };
    }

    /**
     * Fill in the organization from the person's affiliation, when it was left blank (D64).
     *
     * Only ever ADDS: an organization that was stated — on the line, the order's ship-to, or its
     * customer — is never second-guessed. And it only runs when the setting says so, so a
     * deployment that would rather not infer anything simply turns it off and blank stays blank.
     */
    private async withInferredOrganization(subscriber: SubscriberIdentity): Promise<SubscriberIdentity> {
        if (subscriber.OrganizationID) return subscriber;
        if (!subscriber.PersonID) return subscriber;
        if (!OrdersSettings.AutoPopulateOrganizationFromPerson) return subscriber;

        const asOf = this.OrderDate ? new Date(this.OrderDate) : new Date();
        const inferred = await this.organizationAsOf(subscriber.PersonID, asOf);
        return inferred ? { ...subscriber, OrganizationID: inferred } : subscriber;
    }

    /**
     * The organization a person belonged to AS OF the order date (D64).
     *
     * `Person` has no organization column — bizapps-common models affiliation as a dated
     * `Relationship` (FromPersonID → ToOrganizationID, with StartDate/EndDate/Status). So this is a
     * point-in-time question, and the answer legitimately changes when someone moves employer. That
     * is exactly why the result is STAMPED onto the order rather than resolved on read: deriving it
     * later would silently rewrite the history of an order that is otherwise immutable once booked.
     *
     * The rule, per Amith:
     *   zero qualifying affiliations → leave blank. That IS a personal order — no flag needed,
     *                                  because "person, no organization" already says it.
     *   exactly one                  → use it.
     *   more than one                → the most recent by StartDate. A person can hold several at
     *                                  once (employee here, board member there), and Relationship
     *                                  has no uniqueness constraint, so this case is normal rather
     *                                  than exceptional and needs a stated rule instead of a guess.
     *
     * Which relationship types qualify is a SETTING, defaulting to `Employee` — being a `Vendor` to
     * an organization must not make it your bill-to.
     */
    private async organizationAsOf(personID: string, asOf: Date): Promise<string | null> {
        const types = OrdersSettings.OrganizationAffiliationRelationshipTypes;
        if (types.length === 0) return null;

        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const quoted = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
        const date = asOf.toISOString().slice(0, 10);

        const result = await rv.RunView<{ ToOrganizationID: string; StartDate: string }>(
            {
                EntityName: RELATIONSHIP_ENTITY,
                ExtraFilter:
                    `FromPersonID='${personID}' AND ToOrganizationID IS NOT NULL ` +
                    `AND Status='Active' ` +
                    `AND (StartDate IS NULL OR StartDate <= '${date}') ` +
                    `AND (EndDate IS NULL OR EndDate >= '${date}') ` +
                    `AND RelationshipTypeID IN (SELECT ID FROM ${COMMON_SCHEMA}.RelationshipType WHERE Name IN (${quoted}))`,
                Fields: ['ToOrganizationID', 'StartDate'],
                // Most recent affiliation first. NULL StartDate sorts last: an undated relationship
                // is weaker evidence than one that says when it began.
                OrderBy: 'StartDate DESC',
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );

        return result?.Results?.[0]?.ToOrganizationID ?? null;
    }

    /** Net for a line that has not been saved yet — mirrors OrderLineEntityServer's own formula. */
    private pendingLineNet(line: mjBizAppsOrdersOrderLineEntity): number {
        const gross = (line.Quantity ?? 0) * (line.UnitPrice ?? 0);
        const net = gross * (1 - (line.DiscountPct ?? 0));
        return Math.round((net + Number.EPSILON) * 100) / 100;
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
        const products = new Map((prod?.Results ?? []).map(p => [uuidKey(p.ID), p]));
        if (products.size === 0) return [];

        const types = await rv.RunView<SubscriptionTypeRules>(
            { EntityName: SUBSCRIPTION_TYPE_ENTITY, ResultType: 'simple' },
            this.ContextCurrentUser,
        );
        const rulesByID = new Map((types?.Results ?? []).map(t => [uuidKey(t.ID), t]));

        const out = [];
        for (const line of lines) {
            const product = products.get(uuidKey(line.ProductID));
            if (!product) continue;
            // A REVERSAL line buys nothing — it unwinds a purchase (D16). Materializing here would
            // create a second subscription (and a second term) every time one was cancelled, which
            // is the exact opposite of what the line means.
            if (line.ReversesOrderLineID || (line.Quantity ?? 0) < 0) continue;
            const rules = rulesByID.get(uuidKey(product.SubscriptionTypeID));
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

    /**
     * The subscription this purchase attaches to.
     *
     * A RENEWAL names its subscription outright (D55) — resolving by (customer, product) instead
     * would be a guess, and would pick the wrong one whenever a customer holds two subscriptions to
     * the same product under an `AllowMultiple` type.
     */
    private async findExistingSubscription(
        productID: string,
        identity: SubscriberIdentity,
    ): Promise<ExistingSubscription | null> {
        // Match on exactly the axes the BenefitModel says define a duplicate. An org-members type
        // ignores the person entirely (one company membership, however many employees); a seat type
        // matches BOTH, so two seats for two people never collide.
        const clauses: string[] = [];
        clauses.push(
            identity.OrganizationID
                ? `CustomerOrganizationID='${identity.OrganizationID}'`
                : `CustomerOrganizationID IS NULL`,
        );
        clauses.push(
            identity.PersonID ? `BeneficiaryPersonID='${identity.PersonID}'` : `BeneficiaryPersonID IS NULL`,
        );
        if (!identity.OrganizationID && !identity.PersonID) return null;

        return this.loadSubscriptionState(`ProductID='${productID}' AND ${clauses.join(' AND ')}`);
    }

    /** Load a subscription plus the end and number of its latest term, by whatever filter. */
    private async loadSubscriptionState(filter: string): Promise<ExistingSubscription | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<{
            ID: string;
            Status: string;
            CustomerOrganizationID: string | null;
            BeneficiaryPersonID: string | null;
        }>(
            {
                EntityName: SUBSCRIPTION_ENTITY,
                ExtraFilter: filter,
                Fields: ['ID', 'Status', 'CustomerOrganizationID', 'BeneficiaryPersonID'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true,
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
                BypassCache: true,
            },
            this.ContextCurrentUser,
        );
        const latest = terms?.Results?.[0];
        return {
            ID: sub.ID,
            Status: sub.Status,
            CustomerOrganizationID: sub.CustomerOrganizationID,
            BeneficiaryPersonID: sub.BeneficiaryPersonID,
            LatestTermEnd: latest?.EndDate ? new Date(latest.EndDate) : null,
            LatestTermNumber: latest?.TermNumber ?? 0,
        };
    }

    private async createSubscription(
        line: mjBizAppsOrdersOrderLineEntity,
        product: ProductRow,
        rules: SubscriptionTypeRules,
        decision: SubscriptionDecision,
        subscriber: SubscriberIdentity,
        options?: EntitySaveOptions,
    ): Promise<string> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const sub = await provider.GetEntityObject<BaseEntity>(SUBSCRIPTION_ENTITY, this.ContextCurrentUser);
        sub.NewRecord();
        sub.Set('SubscriptionNumber', await this.assignSubscriptionNumber());
        sub.Set('CompanyID', this.CompanyID);
        // The BIRTH line (D39/D40) — which purchase brought this subscription into existence.
        // Renewals append terms that carry their own OrderLineID; this one never changes.
        sub.Set('OrderLineID', line.ID);
        sub.Set('SubscriptionTypeID', rules.ID);
        sub.Set('ProductID', product.ID);
        // The RESOLVED subscriber, which may differ from the order's customer: the customer pays,
        // the ship-to holds and benefits.
        sub.Set('CustomerOrganizationID', subscriber.OrganizationID);
        sub.Set('BeneficiaryPersonID', subscriber.PersonID);
        sub.Set('Status', rules.TrialDays > 0 ? 'Trialing' : 'Active');
        sub.Set('StartDate', decision.Term!.StartDate);
        sub.Set('AutoRenew', rules.AutoRenewDefault);
        // A trial with no end date is not a trial. Without this, `Status='Trialing'` is a label
        // nothing can ever act on — no job can find trials about to expire.
        if (rules.TrialDays > 0) {
            const trialEnd = new Date(decision.Term!.StartDate);
            trialEnd.setUTCDate(trialEnd.getUTCDate() + rules.TrialDays);
            sub.Set('TrialEndDate', trialEnd);
        }

        if (!(await sub.Save(options))) {
            throw new Error(
                `Failed to create the subscription for '${product.Name}': ` +
                    `${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        const subscriptionID = sub.Get('ID') as string;
        await this.logSubscriptionEvent(
            subscriptionID,
            rules.TrialDays > 0 ? 'TrialStarted' : 'Created',
            options,
        );
        return subscriptionID;
    }

    /**
     * Append to the subscription's immutable lifecycle log.
     *
     * The log is the answer to "what happened to this membership, and when" — the question support
     * actually gets asked. Writing it at every transition is the only thing that makes the table
     * worth having; a `SubscriptionEvent` table nobody writes to is just schema.
     */
    private async logSubscriptionEvent(
        subscriptionID: string,
        eventType: string,
        options?: EntitySaveOptions,
        data?: Record<string, unknown>,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const event = await provider.GetEntityObject<BaseEntity>(
            SUBSCRIPTION_EVENT_ENTITY,
            this.ContextCurrentUser,
        );
        event.NewRecord();
        event.Set('SubscriptionID', subscriptionID);
        event.Set('EventType', eventType);
        event.Set('OccurredAt', new Date());
        event.Set('RelatedOrderHeaderID', this.ID);
        if (data) event.Set('EventData', JSON.stringify(data));

        if (!(await event.Save(options))) {
            // Inside the booking transaction: a lost lifecycle record is a silent hole in the
            // audit trail, so it fails the confirm rather than being swallowed.
            throw new Error(
                `Failed to log the '${eventType}' subscription event: ` +
                    `${event.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /** Extension or reactivation — the term is what changes; the subscription just re-activates. */
    private async touchExistingSubscription(
        decision: SubscriptionDecision,
        isRenewal: boolean,
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
            sub.Set('AutoRenew', true);
            if (!(await sub.Save(options))) {
                throw new Error(
                    `Failed to reactivate subscription: ${sub.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
        // 'Extended' is the CUSTOMER buying more coverage. The system renewing them under standing
        // authority logs 'RenewalOrderSpawned' from SpawnRenewalsOperation instead — same table,
        // opposite answers to "why is this member still here", and retention reporting needs both.
        // A renewal reaches this method too, so it must not also log the customer-side event. The
        // marker is now per-LINE (D61): one order can renew several subscriptions, so "is this a
        // renewal" is a question about the line, not the order.
        if (!isRenewal) {
            await this.logSubscriptionEvent(
                decision.SubscriptionID!,
                decision.Action === 'Reactivate' ? 'Activated' : 'Extended',
                options,
                { TermNumber: decision.Term?.TermNumber, Action: decision.Action },
            );
        }
        return decision.SubscriptionID!;
    }

    /**
     * Mint the next `SUB-{seq}` from the SubscriptionSequence singleton.
     *
     * A subscription number is member-facing — it is the "membership number" someone reads over the
     * phone — so it gets its own counter rather than being derived from whichever order created it.
     */
    private async assignSubscriptionNumber(): Promise<string> {
        return `SUB-${String(await this.nextSequence('SubscriptionSequence')).padStart(6, '0')}`;
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
        return `ORD-${String(await this.nextSequence('OrderSequence')).padStart(6, '0')}`;
    }

    /**
     * Take the next value from one of the singleton counter tables.
     *
     * Taken with UPDLOCK+HOLDLOCK inside the CALLER'S transaction, so concurrent confirms serialize
     * on the counter row rather than colliding on the UNIQUE index — and a confirm that rolls back
     * releases its number rather than burning it.
     *
     * `OUTPUT ... INTO` (not a bare `OUTPUT`): CodeGen puts an `__mj_UpdatedAt` trigger on every
     * table, and SQL Server forbids a bare OUTPUT clause on a table that has triggers.
     */
    private async nextSequence(table: 'OrderSequence' | 'PaymentSequence' | 'SubscriptionSequence'): Promise<number> {
        const provider = this.ProviderToUse as unknown as { ExecuteSQL: (sql: string, params?: unknown[]) => Promise<unknown> };
        const rows = (await provider.ExecuteSQL(
            `DECLARE @seq TABLE (Seq INT);
             UPDATE __mj_BizAppsOrders.${table} WITH (UPDLOCK, HOLDLOCK)
             SET NextSequenceNumber = NextSequenceNumber + 1
             OUTPUT deleted.NextSequenceNumber INTO @seq(Seq)
             WHERE ID = 1;
             SELECT Seq FROM @seq;`,
        )) as Array<{ Seq: number }>;

        const seq = rows?.[0]?.Seq;
        if (!seq) {
            throw new Error(
                `Could not obtain the next number from ${table} — its singleton row (ID=1) is missing. ` +
                    `It is seeded by the baseline migration.`,
            );
        }
        return seq;
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
        return `PAY-${String(await this.nextSequence('PaymentSequence')).padStart(6, '0')}`;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    /** Resolver + accounting engine come from the shared bridge — see AccountingBridge.ts. */
    private async buildResolver(provider: IMetadataProvider, user: UserInfo): Promise<GLAccountResolver> {
        return BuildGLAccountResolver(provider, user);
    }

    private entityIDFor(entityName: string): string {
        return EntityIDFor(entityName);
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

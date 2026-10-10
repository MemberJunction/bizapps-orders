/**
 * OrderConcession server subclass — values a concession and decides who may approve it (golive #222).
 *
 * RECORDING ONE. The requester states what was given — the line, or the term and the days added — and
 * why. Everything else is derived here and whatever the caller sent is overwritten: the order it
 * belongs to, its value at the arrangement's own rate, the order's net total and the share of it that
 * the order's concessions now come to, the requester, and its status. Within the
 * requester's `SalesAuthority` it is Approved on save; outside it, it is Pending, stamped with the
 * active ConcessionLimit rule whose role decides it. A requester who holds that role approves their
 * own, and the record shows that it went through the rule rather than through their authority.
 *
 * DECIDING ONE. The only change a recorded concession accepts is Pending → Approved or Rejected, by a
 * holder of the rule's role, with an optional note. A different concession is a new record: withdraw
 * a Pending one (delete it) and record again.
 *
 * AN APPROVED DURATION CONCESSION EXTENDS ITS TERM (golive #221). It is checked when recorded and applied in
 * the approval's own transaction by ./TermExtension.ts: the term's end, the recognition schedule, access and an
 * acknowledgment task for accounting. If the extension cannot be applied, the approval does not happen.
 *
 * AN APPROVED TERMS CONCESSION CHANGES A CONFIRMED ORDER'S PAYMENT TERMS (#309). It records the prior and new
 * terms, and its value is the change in days to payment rather than a currency figure. It always goes to
 * approval, whatever the requester's authority, and the requester cannot decide it even when they hold the
 * approving role. ./PaymentTermsChange.ts applies it in the approval's own transaction.
 *
 * A LINE WHOSE PRODUCT ALWAYS NEEDS APPROVAL (golive #281) is valued like any other Price or Scope concession, at
 * zero when it gives nothing away against an engine price, and always goes to the ConcessionLimit rule's role: the
 * requester's own authority never approves it, and the requester cannot decide it. The confirm gate holds the order
 * until one is Approved (./ConcessionGate.ts).
 *
 * ITS APPROVERS ARE TOLD (golive #274). A Pending concession raises its own approval task in the tasks
 * app, assigned to the rule's role holders, in the same transaction as the row. Deciding it on this record,
 * or withdrawing it, closes that task.
 *
 * ITS SIGNED AMENDMENT IS RECORDED AFTERWARDS (golive #268). `SignedAmendmentReference` says where the customer's
 * signed contract amendment is kept. It is the one column of a decided concession that may change, and only on an
 * Approved one: the amendment is usually signed after the approval. The shared view "Concessions: Approved, No
 * Signed Amendment" lists the approved concessions still without one.
 *
 * A REFERRAL PROGRAM APPROVES ITS OWN (golive #268). A referral's earned time is added to the next term, on the
 * renewal order, never to the current one: extending the current term re-cuts recognition already scheduled and can
 * change a renewal invoice already sent. A Duration concession that names an active `ReferralProgram` of the order's
 * company, extends a term bought by a renewal line, and adds no more than the program's `DaysPerReferral` is
 * Approved by the program, with no Sales Authority and no approver. One that adds more, or names an inactive
 * program, is routed like any other. Naming a program on a term that is not a renewal is refused.
 *
 * ACCOUNTING IS TOLD OF EVERY APPROVAL (golive #268). Any concession reaching Approved, on the requester's authority
 * or by a decision, raises accounting's acknowledgment task in the same transaction (./ConcessionAcknowledgment.ts).
 * A term extension raises its own, with the re-cut schedule. Withdrawing the concession closes its task.
 *
 * WITHDRAWING ONE. A Pending concession can be withdrawn, and so can one approved on the requester's
 * own authority while its order is not confirmed. No approver decided the second kind, and the
 * customer is not yet committed to it; withdrawing and recording it again is how it is measured
 * against a draft that has since changed (the confirm gate's share check).
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-entities ConcessionBehavior
 *   READS:  ./ConcessionGate.ts (authority, rule, line price) · Subscription Terms · Order Lines
 *   TASKS:  ./ConcessionApprovalTask.ts (raise, close) · ./ConcessionApprovalListener.ts (decide from task)
 *   APPLY:  ./TermExtension.ts (a Duration concession reaching Approved)
 *           ./PaymentTermsChange.ts (a Terms concession reaching Approved)
 *   GATE:   OrderEntityServer (confirm) and the send-document action refuse while one is Pending
 */
import {
    BaseEntity,
    BaseEntityResult,
    DatabaseProviderBase,
    EntityDeleteOptions,
    EntitySaveOptions,
    IRunViewProvider,
    LogError,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    AssessConcession,
    ConcessionAlwaysEscalates,
    ConcessionShare,
    ConcessionValue,
    InclusiveDays,
    TermDateChangeDays,
    IsEditable,
    UserHoldsRole,
    mjBizAppsOrdersOrderConcessionEntity,
    type ConcessionValuation,
} from '@mj-biz-apps/orders-entities';
import {
    ActiveRoleHolderIDs,
    CloseConcessionTasks,
    ConcessionSummary,
    RouteConcessionToApproval,
    UnlinkConcession,
    type ApprovalTaskContext,
} from './ConcessionApprovalTask.js';
import {
    FindConcessionLimitRule,
    LinePriceConcessionFor,
    LoadConcessionAuthority,
    OrderConcessionTotal,
    OrderNetTotal,
    ProductsRequiringSaleApproval,
} from './ConcessionGate.js';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RaiseConcessionAcknowledgment } from './ConcessionAcknowledgment.js';
import { ApplyTermsChange, CheckTermsChange } from './PaymentTermsChange.js';
import { CheckReferralProgram } from './ReferralProgram.js';
import { RequireUUID } from './sql-guards.js';
import { ApplyTermExtension, CheckTermExtension, type ApprovedDurationConcession } from './TermExtension.js';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';

/** The columns a requester authors. Once recorded, none of them change. */
const AUTHORED_FIELDS = [
    'OrderHeaderID',
    'OrderLineID',
    'SubscriptionTermID',
    'DeliveryForm',
    'ReasonCategory',
    'Reason',
    'AddedDays',
    'AddedQuantity',
    'PriorPaymentTermsTypeID',
    'NewPaymentTermsTypeID',
    'ReferralProgramID',
    'ComputedValue',
    'OrderNetTotal',
    'CumulativeShare',
    'RequestedByUserID',
    'AuthorizedBySalesAuthorityID',
    'SalesRuleID',
    'DecidedByUserID',
    'DecidedAt',
] as const;

interface LineRow {
    ID: string;
    OrderHeaderID: string;
    LineNumber: number;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ProductPriceID: string | null;
    DiscountPct: number | null;
    RenewsSubscriptionID: string | null;
}

interface TermRow {
    OrderLineID: string;
    StartDate: Date | string;
    EndDate: Date | string;
    Amount: number;
    Status: string;
}

@RegisterClass(BaseEntity, ORDER_CONCESSION_ENTITY)
export class OrderConcessionEntityServer extends mjBizAppsOrdersOrderConcessionEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const recording = !this.IsSaved;
        const problem = recording ? await this.prepareNew() : await this.applyDecision();
        if (problem) {
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }

        if (recording && this.Status === 'Pending' && this.approvingRole) {
            const roleID = this.approvingRole;
            const summary = this.approvalSummary;
            return this.withApprovalTask('create', () => super.Save(options), async (ctx) => {
                await RouteConcessionToApproval(
                    { ID: this.ID, OrderHeaderID: this.OrderHeaderID, RequestedByUserID: this.RequestedByUserID },
                    roleID,
                    summary,
                    ctx,
                );
            });
        }
        // An approved Duration concession IS the term extension (golive #221): it applies in the same
        // transaction as the approval, so a concession is never Approved on a term it did not extend.
        const deciding = !recording && this.GetFieldByName('Status')?.Dirty === true;
        const extending = this.DeliveryForm === 'Duration' && this.Status === 'Approved' && (recording || deciding);
        // An approved Terms concession changes the order's payment terms the same way (#309). It is never
        // Approved on save, so only a decision applies it.
        const changingTerms = this.DeliveryForm === 'Terms' && this.Status === 'Approved' && deciding;
        // A decision made through the task leaves the task to the tasks app, which closes it itself.
        const closing =
            deciding && !this.DecidedThroughTask && (this.Status === 'Approved' || this.Status === 'Rejected') ? this.Status : null;
        // Every other approval is acknowledged by accounting too (golive #268); an extension's own task carries its schedule.
        const acknowledging = this.Status === 'Approved' && (recording || deciding) && this.DeliveryForm !== 'Duration';
        if (extending || changingTerms || closing || acknowledging) {
            return this.withApprovalTask(recording ? 'create' : 'update', () => super.Save(options), async (ctx) => {
                // Closed first: closing completes every open task linked to the concession, and the acknowledgment
                // raised below must stay open.
                if (closing) await CloseConcessionTasks(this.ID, this.OrderHeaderID, closing, ctx);
                if (extending) await ApplyTermExtension(this.asApprovedExtension(), ctx);
                if (acknowledging) await RaiseConcessionAcknowledgment(this.asApprovedFacts(), ctx);
                if (changingTerms) {
                    await ApplyTermsChange(
                        {
                            OrderHeaderID: this.OrderHeaderID,
                            PriorPaymentTermsTypeID: this.PriorPaymentTermsTypeID,
                            NewPaymentTermsTypeID: this.NewPaymentTermsTypeID!,
                        },
                        ctx,
                    );
                }
            });
        }
        return super.Save(options);
    }

    private asApprovedFacts() {
        return {
            ID: this.ID,
            OrderHeaderID: this.OrderHeaderID,
            DeliveryForm: this.DeliveryForm,
            ReasonCategory: this.ReasonCategory,
            Reason: this.Reason,
            ComputedValue: Number(this.ComputedValue ?? 0),
            CumulativeShare: this.CumulativeShare == null ? null : Number(this.CumulativeShare),
            AddedDays: this.AddedDays,
            AddedQuantity: this.AddedQuantity,
            RequestedByUserID: this.RequestedByUserID,
            ApprovedOnAuthority: !this.SalesRuleID && !!this.AuthorizedBySalesAuthorityID,
        };
    }

    private asApprovedExtension(): ApprovedDurationConcession {
        return {
            ID: this.ID,
            SubscriptionTermID: this.SubscriptionTermID!,
            AddedDays: Number(this.AddedDays),
            RequestedByUserID: this.RequestedByUserID,
            ReasonCategory: this.ReasonCategory,
            Reason: this.Reason,
            ComputedValue: Number(this.ComputedValue),
        };
    }

    /** Set only by ConcessionApprovalListener, when the decision was recorded on the concession's approval task. */
    public DecidedThroughTask = false;

    /** The ConcessionLimit rule's role, kept by `prepareNew` for routing a Pending concession. */
    private approvingRole: string | null = null;
    /** How far this concession moves its term's dates, set when a Duration concession is valued. */
    private termDateChangeDays: number | null = null;
    /** Set when a Price or Scope concession is valued on a line whose product always needs approval (golive #281). */
    private saleApprovalRequired = false;
    /** The line that bought the term a Duration concession extends, set when it is valued. */
    private extendedLine: LineRow | null = null;

    /** What the approval task calls this concession ("25% discount, 3,000.00"), kept by `prepareNew`. */
    private approvalSummary = '';

    /**
     * Set only by `OrderEntityServer` when it deletes a removed DRAFT line's dependents. A booked order
     * refuses line removals outright, so this never reaches a concession a customer was committed to.
     */
    public WithdrawWithDraftLine = false;

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (this.Status !== 'Pending' && !this.WithdrawWithDraftLine && !(await this.approvedOnAuthorityInDraft())) {
            this.RegisterResultHistoryEntry(
                this.buildRejection(
                    `This concession is ${this.Status}. A decided concession is the record of that decision and ` +
                        `cannot be deleted; only a Pending one, or one approved on the requester's own authority ` +
                        `while its order is not confirmed, can be withdrawn.`,
                    'delete',
                ),
            );
            return false;
        }
        const id = this.ID;
        const orderHeaderID = this.OrderHeaderID;
        // A draft-line removal runs inside the order's own save, so the order header is not saved again here.
        const releaseOrder = !this.WithdrawWithDraftLine;
        return this.withApprovalTask('delete', () => super.Delete(options), async (ctx) => {
            // A Pending concession's approval task, or an approved one's acknowledgment task (golive #268).
            await CloseConcessionTasks(id, orderHeaderID, 'Withdrawn', ctx, releaseOrder);
            await UnlinkConcession(id, ctx);
        });
    }

    /**
     * Write the row and its approval-task follow-up in one transaction: the task work fails, the row is
     * not written. Joins the caller's transaction when there is one, as a draft-line removal is.
     */
    private async withApprovalTask(
        type: 'create' | 'update' | 'delete',
        write: () => Promise<boolean>,
        follow: (ctx: ApprovalTaskContext) => Promise<void>,
    ): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user?.ID) {
            this.RegisterResultHistoryEntry(this.buildRejection('A concession change must be attributable to a user, and no user was supplied.', type));
            return false;
        }
        const scope = await (this.ProviderToUse as unknown as DatabaseProviderBase).BeginEntityTransaction();
        try {
            if (!(await write())) {
                await scope.Rollback();
                return false;
            }
            await follow({ Provider: this.provider(), User: user });
            await scope.Commit();
            return true;
        } catch (err) {
            try {
                await scope.Rollback();
            } catch (rollbackErr) {
                LogError(`OrderConcessionEntityServer: rollback failed after an approval-task error: ${rollbackErr}`);
            }
            this.RegisterResultHistoryEntry(this.buildRejection(err instanceof Error ? err.message : String(err), type));
            return false;
        }
    }

    /** Approved on the requester's own authority, with no approver's decision, on an order not yet booked. */
    private async approvedOnAuthorityInDraft(): Promise<boolean> {
        if (this.Status !== 'Approved' || this.SalesRuleID || !this.AuthorizedBySalesAuthorityID) return false;
        const user = this.ContextCurrentUser;
        if (!user) return false;
        const order = await this.loadRow<{ Status: string }>(ORDER_HEADER_ENTITY, this.OrderHeaderID, ['Status'], user);
        return !!order && IsEditable(order.Status);
    }

    // ─── Recording ────────────────────────────────────────────────────────────

    private async prepareNew(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        if (!user?.ID) return 'A concession must be attributable to a user, and no user was supplied.';
        if (!this.Reason?.trim()) return 'A concession must state its reason.';

        this.termDateChangeDays = null;
        this.saleApprovalRequired = false;
        this.extendedLine = null;
        const valued = await this.valueByForm(user);
        if (typeof valued === 'string') return valued;

        // Measured against the order as it stands, with every concession on it that is not Rejected.
        const net = await OrderNetTotal(this.OrderHeaderID, [], this.provider(), user);
        const others = await OrderConcessionTotal(this.OrderHeaderID, this.provider(), user);
        const share = ConcessionShare(others + valued.Value, net);

        this.RequestedByUserID = user.ID;
        this.ComputedValue = valued.Value;
        this.OrderNetTotal = net;
        this.CumulativeShare = share === null ? null : Math.round(share * 1e4) / 1e4;
        this.AuthorizedBySalesAuthorityID = null;
        this.SalesRuleID = null;
        this.DecidedByUserID = null;
        this.DecidedAt = null;
        this.approvingRole = null;

        if (ConcessionAlwaysEscalates(this.DeliveryForm) || this.saleApprovalRequired) return this.escalate(user);

        if (this.ReferralProgramID) {
            const inProgram = await this.inReferralProgram(user);
            if (typeof inProgram === 'string') return inProgram;
            if (inProgram) {
                this.decide('Approved', user);
                return null;
            }
        }

        const authority = await LoadConcessionAuthority(user.ID, this.provider(), user);
        const assessment = AssessConcession(this.DeliveryForm, valued, authority, this.termDateChangeDays, share);
        if (assessment.WithinAuthority && authority) {
            this.AuthorizedBySalesAuthorityID = authority.ID;
            this.decide('Approved', user);
            return null;
        }

        const rule = await FindConcessionLimitRule(this.provider(), user);
        if (!rule?.ApprovalRequiredRoleID) {
            return (
                `This concession is outside the requester's authority (${assessment.Breaches.join('; ')}), and no ` +
                `active SalesRule of type 'ConcessionLimit' names an approving role, so no one could approve it. ` +
                `Configure a ConcessionLimit rule with an ApprovalRequiredRoleID.`
            );
        }
        this.SalesRuleID = rule.ID;
        if (await UserHoldsRole(rule.ApprovalRequiredRoleID, this.provider(), user, user.ID)) {
            this.decide('Approved', user);
        } else {
            this.Status = 'Pending';
            this.approvingRole = rule.ApprovalRequiredRoleID;
            this.approvalSummary = ConcessionSummary({
                DeliveryForm: this.DeliveryForm,
                ComputedValue: valued.Value,
                Percent: valued.Percent,
                AddedDays: this.AddedDays,
                AddedQuantity: this.AddedQuantity,
            });
        }
        return null;
    }

    /**
     * Route a form that always needs approval to the ConcessionLimit rule's role, whatever the requester's
     * authority. The requester cannot decide it, so someone else must hold the role.
     */
    private async escalate(user: UserInfo): Promise<string | null> {
        const what = this.saleApprovalRequired
            ? 'A concession on a line whose product always needs approval'
            : `A ${this.DeliveryForm} concession`;
        const rule = await FindConcessionLimitRule(this.provider(), user);
        if (!rule?.ApprovalRequiredRoleID) {
            return (
                `${what} always needs approval, and no active SalesRule of type ` +
                `'ConcessionLimit' names an approving role, so no one could approve it. Configure a ConcessionLimit ` +
                `rule with an ApprovalRequiredRoleID.`
            );
        }
        const holders = await ActiveRoleHolderIDs(rule.ApprovalRequiredRoleID, { Provider: this.provider(), User: user });
        if (!holders.some((id) => !UUIDsEqual(id, user.ID))) {
            return (
                `${what} cannot be decided by the person who asked for it, and no other active ` +
                `user holds the role the ConcessionLimit rule names. Assign that role to another approver.`
            );
        }
        this.SalesRuleID = rule.ID;
        this.Status = 'Pending';
        this.approvingRole = rule.ApprovalRequiredRoleID;
        this.approvalSummary = ConcessionSummary({
            DeliveryForm: this.DeliveryForm,
            ComputedValue: Number(this.ComputedValue ?? 0),
            AddedDays: this.AddedDays,
        });
        return null;
    }

    /** Value the concession from its own line or term, and stamp the order it belongs to. */
    private async valueByForm(user: UserInfo): Promise<ConcessionValuation | string> {
        switch (this.DeliveryForm) {
            case 'Duration':
                return this.valueDuration(user);
            case 'Price':
            case 'Scope':
                return this.valueLinePrice(user);
            case 'Seats':
                return this.valueSeats(user);
            case 'Terms':
                return this.valueTerms(user);
            default:
                return `'${String(this.DeliveryForm)}' is not a concession form.`;
        }
    }

    private async valueDuration(user: UserInfo): Promise<ConcessionValuation | string> {
        if (!this.SubscriptionTermID) return 'A Duration concession must name the term it extends.';
        const days = Number(this.AddedDays ?? 0);
        if (!Number.isInteger(days) || days <= 0) return 'A Duration concession must add a whole number of days.';

        const term = await this.loadRow<TermRow>(SUBSCRIPTION_TERM_ENTITY, this.SubscriptionTermID, [
            'OrderLineID',
            'StartDate',
            'EndDate',
            'Amount',
            'Status',
        ], user);
        if (!term) return `Subscription term ${this.SubscriptionTermID} was not found.`;
        if (term.Status === 'Canceled') return 'A canceled term cannot be extended.';

        const line = await this.loadLine(term.OrderLineID, user);
        if (!line) return `The order line that bought term ${this.SubscriptionTermID} was not found.`;

        // Refuse now what could never be applied — a placed renewal, a batched entry, nobody to acknowledge it —
        // rather than route it for approval and refuse the approval.
        const applicable = await CheckTermExtension(
            { SubscriptionTermID: this.SubscriptionTermID, AddedDays: days, RequestedByUserID: user.ID },
            { Provider: this.provider(), User: user },
        );
        if (typeof applicable === 'string') return applicable;

        this.OrderHeaderID = line.OrderHeaderID;
        this.OrderLineID = line.ID;
        this.extendedLine = line;
        this.termDateChangeDays = TermDateChangeDays(
            { StartDate: applicable.TermStartDate, EndDate: applicable.CurrentEndDate },
            { StartDate: applicable.TermStartDate, EndDate: applicable.NewEndDate },
        );
        return ConcessionValue({
            Form: 'Duration',
            TermAmount: Number(term.Amount),
            TermDays: InclusiveDays(new Date(term.StartDate), new Date(term.EndDate)),
            AddedDays: days,
        });
    }

    /**
     * Whether the referral program this concession names approves it: true when it is in program, false when it
     * is routed like any other, or why naming the program is refused.
     */
    private async inReferralProgram(user: UserInfo): Promise<boolean | string> {
        if (this.DeliveryForm !== 'Duration' || !this.extendedLine) {
            return 'A referral program grants extra time on a renewed term, so only a Duration concession names one.';
        }
        const verdict = await CheckReferralProgram(
            {
                ReferralProgramID: this.ReferralProgramID!,
                DeliveryForm: this.DeliveryForm,
                ReasonCategory: this.ReasonCategory,
                AddedDays: Number(this.AddedDays ?? 0),
                OrderHeaderID: this.OrderHeaderID,
                RenewsSubscriptionID: this.extendedLine.RenewsSubscriptionID,
            },
            { Provider: this.provider(), User: user },
        );
        return typeof verdict === 'string' ? verdict : verdict.InProgram;
    }

    private async valueLinePrice(user: UserInfo): Promise<ConcessionValuation | string> {
        const line = await this.requireLine(user);
        if (typeof line === 'string') return line;
        const concession = await LinePriceConcessionFor(line, this.provider(), user);
        this.saleApprovalRequired = await this.lineRequiresSaleApproval(line, user);
        if (!concession && this.saleApprovalRequired) {
            // Nothing given away against an engine price, often because the product has none: the approval is
            // of the sale itself, so it is recorded at no value.
            this.OrderHeaderID = line.OrderHeaderID;
            return { Value: 0, Percent: null };
        }
        if (!concession) {
            return (
                `Line ${line.LineNumber} is charged its engine price or another named price that applies, with no ` +
                `discount, so there is no price concession on it to record.`
            );
        }
        this.DeliveryForm = concession.Form;
        this.OrderHeaderID = line.OrderHeaderID;
        return concession.Valuation;
    }

    private async valueSeats(user: UserInfo): Promise<ConcessionValuation | string> {
        const added = Number(this.AddedQuantity ?? 0);
        if (!(added > 0)) return 'A Seats concession must add a positive quantity.';
        const line = await this.requireLine(user);
        if (typeof line === 'string') return line;
        this.OrderHeaderID = line.OrderHeaderID;
        return ConcessionValue({ Form: 'Seats', UnitPrice: Number(line.UnitPrice), AddedQuantity: added });
    }

    /** A change of payment terms is worth the change in days to payment, held in `AddedDays`; it has no currency value. */
    private async valueTerms(user: UserInfo): Promise<ConcessionValuation | string> {
        if (!this.OrderHeaderID) return 'A Terms concession must name the order whose payment terms it changes.';
        if (!this.NewPaymentTermsTypeID) return 'A Terms concession must name the new payment terms.';
        const checked = await CheckTermsChange(
            { OrderHeaderID: this.OrderHeaderID, NewPaymentTermsTypeID: this.NewPaymentTermsTypeID },
            { Provider: this.provider(), User: user },
        );
        if (typeof checked === 'string') return checked;

        this.OrderLineID = null;
        this.SubscriptionTermID = null;
        this.AddedQuantity = null;
        this.PriorPaymentTermsTypeID = checked.PriorPaymentTermsTypeID;
        this.AddedDays = checked.DaysChange;
        return { Value: 0, Percent: null };
    }

    /** Whether the line's product always needs approval. A renewal line's sale was approved when it was first sold. */
    private async lineRequiresSaleApproval(line: LineRow, user: UserInfo): Promise<boolean> {
        if (line.RenewsSubscriptionID || !line.ProductID) return false;
        const required = await ProductsRequiringSaleApproval([line.ProductID], this.provider(), user);
        return required.has(line.ProductID.toLowerCase());
    }

    /** A Price or Scope concession on a line whose product always needs approval. */
    private async onSaleApprovalLine(user: UserInfo): Promise<boolean> {
        if ((this.DeliveryForm !== 'Price' && this.DeliveryForm !== 'Scope') || !this.OrderLineID) return false;
        const line = await this.loadLine(this.OrderLineID, user);
        return !!line && (await this.lineRequiresSaleApproval(line, user));
    }

    private async requireLine(user: UserInfo): Promise<LineRow | string> {
        if (!this.OrderLineID) return `A ${this.DeliveryForm} concession must name the order line it applies to.`;
        const line = await this.loadLine(this.OrderLineID, user);
        return line ?? `Order line ${this.OrderLineID} was not found.`;
    }

    // ─── Deciding ─────────────────────────────────────────────────────────────

    private async applyDecision(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        const changed = AUTHORED_FIELDS.filter((name) => this.GetFieldByName(name)?.Dirty === true);
        if (changed.length > 0) {
            return (
                `A recorded concession cannot change ${changed.join(', ')}. Withdraw it while it is Pending and ` +
                `record a new one.`
            );
        }

        const statusField = this.GetFieldByName('Status');
        if (!statusField?.Dirty) {
            if (this.GetFieldByName('DecisionNotes')?.Dirty) {
                return 'A decision note is recorded with the decision itself, by setting Status to Approved or Rejected.';
            }
            if (this.GetFieldByName('SignedAmendmentReference')?.Dirty && this.Status !== 'Approved') {
                return `This concession is ${this.Status}. A signed amendment is recorded only against an Approved concession.`;
            }
            return null;
        }

        const previous = String(statusField.OldValue ?? '');
        if (previous !== 'Pending') return `This concession was already ${previous}; a decision is not reopened.`;
        if (this.Status !== 'Approved' && this.Status !== 'Rejected') {
            return 'A Pending concession can only be Approved or Rejected.';
        }
        if (!user?.ID) return 'A decision must be attributable to a user, and no user was supplied.';
        if (ConcessionAlwaysEscalates(this.DeliveryForm) && UUIDsEqual(user.ID, this.RequestedByUserID)) {
            return `A ${this.DeliveryForm} concession cannot be decided by the person who asked for it.`;
        }
        if (UUIDsEqual(user.ID, this.RequestedByUserID) && (await this.onSaleApprovalLine(user))) {
            return 'A concession on a line whose product always needs approval cannot be decided by the person who asked for it.';
        }

        const roleID = await this.ApprovingRoleID(user);
        if (!roleID) {
            return 'This concession names no ConcessionLimit rule with an approving role, so no one can decide it.';
        }
        if (!(await UserHoldsRole(roleID, this.provider(), user, user.ID))) {
            return 'Only a holder of the role named by the ConcessionLimit rule can decide this concession.';
        }
        // Measured again at the decision: the draft may have changed while this sat Pending, and the
        // record should show the share the decision was made at.
        const net = await OrderNetTotal(this.OrderHeaderID, [], this.provider(), user);
        const share = ConcessionShare(await OrderConcessionTotal(this.OrderHeaderID, this.provider(), user), net);
        this.OrderNetTotal = net;
        this.CumulativeShare = share === null ? null : Math.round(share * 1e4) / 1e4;
        this.decide(this.Status, user);
        return null;
    }

    /** The role that decides this concession: its ConcessionLimit rule's, or null when it names none. */
    public async ApprovingRoleID(user: UserInfo): Promise<string | null> {
        if (!this.SalesRuleID) return null;
        const rule = await this.loadRow<{ ApprovalRequiredRoleID: string | null }>(
            SALES_RULE_ENTITY,
            this.SalesRuleID,
            ['ApprovalRequiredRoleID'],
            user,
        );
        return rule?.ApprovalRequiredRoleID ?? null;
    }

    private decide(status: 'Approved' | 'Rejected', user: UserInfo): void {
        this.Status = status;
        this.DecidedByUserID = user.ID;
        this.DecidedAt = new Date();
    }

    // ─── Reads ────────────────────────────────────────────────────────────────

    private provider(): IMetadataProvider {
        return this.ProviderToUse as unknown as IMetadataProvider;
    }

    private async loadLine(id: string, user: UserInfo): Promise<LineRow | null> {
        return this.loadRow<LineRow>(
            ORDER_LINE_ENTITY,
            id,
            [
                'ID',
                'OrderHeaderID',
                'LineNumber',
                'ProductID',
                'Quantity',
                'UnitPrice',
                'ProductPriceID',
                'DiscountPct',
                'RenewsSubscriptionID',
            ],
            user,
        );
    }

    private async loadRow<T>(entityName: string, id: string, fields: string[], user: UserInfo): Promise<T | null> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const res = await rv.RunView<T>(
            {
                EntityName: entityName,
                ExtraFilter: `ID = '${RequireUUID(id, 'ID')}'`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        return res?.Results?.[0] ?? null;
    }

    private buildRejection(message: string, type: 'create' | 'update' | 'delete' = this.IsSaved ? 'update' : 'create'): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.OriginalValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.OldValue }));
        result.NewValues = this.Fields.map((f) => ({ FieldName: f.Name, Value: f.Value }));
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadOrderConcessionEntityServer(): void {
    // intentionally empty
}

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
 * TIERS (#308). Several active ConcessionLimit rules are approval tiers: the concession goes to the
 * highest-ranked one whose thresholds it meets (value, share of the order, term-date change), and only
 * that tier's role decides it. A tier with `RequiresDecisionWithinAuthority` decides every concession
 * routed to it, inside the requester's authority too, and never lets the requester decide their own.
 *
 * DECIDING ONE. The only change a recorded concession accepts is Pending → Approved or Rejected, by a
 * holder of the rule's role, with an optional note. A different concession is a new record: withdraw
 * a Pending one (delete it) and record again.
 *
 * AN APPROVED DURATION CONCESSION EXTENDS ITS TERM (golive #221). It is checked when recorded and applied in
 * the approval's own transaction by ./TermExtension.ts: the term's end, the recognition schedule, access and an
 * acknowledgment task for accounting. If the extension cannot be applied, the approval does not happen.
 *
 * AN APPROVED AMOUNT CHANGE LOWERS ITS TERM'S AMOUNT (#506). A Price concession carrying `NewAmount` names a
 * booked term and its new, lower amount. It is valued as the reduction, checked when recorded, and applied in the
 * approval's own transaction by ./AmountChange.ts: the catch-up and re-cut entries, the term's amount, the
 * instalments not yet invoiced, any credit memo, and accounting's acknowledgment task. `ScheduleReduction` is set
 * when it is approved: what it took off the instalments, which the order's balance and schedule check subtract. So
 * are `CreditMemoAmount` and `CreditMemoNumber` when the instalments cannot absorb the whole reduction (#662): the
 * approved change is that credit memo, and the order's balance subtracts it too.
 *
 * AN APPROVED SEATS CONCESSION ADDS ITS SEATS TO THE TERM (#686). The line's term counts them from the approval, its
 * PerUnit grants follow, and the renewal buys them at the full price (./SeatAddition.ts). A line on a draft order has
 * no term yet; confirm counts its approved Seats concessions when it creates the term.
 *
 * AN APPROVED TERMS CONCESSION CHANGES A CONFIRMED ORDER'S PAYMENT TERMS (#309). It records the prior and new
 * terms, and its value is the change in days to payment rather than a currency figure. It always goes to
 * approval, whatever the requester's authority, and the requester cannot decide it even when they hold the
 * approving role. ./PaymentTermsChange.ts applies it in the approval's own transaction.
 *
 * AN APPROVED SHIFT CONCESSION MOVES ITS TERM'S START AND END TOGETHER (#507). A shift is a term change, not a sales
 * concession: it is valued at zero and the rep's authority and the ConcessionLimit tiers do not decide it. Under the
 * `TermShiftReviewDays` setting it is approved on save; at or above it, it waits for the finance acknowledgment role
 * (`AmendmentAcknowledgmentRole`), and the requester cannot decide it. A holder of that role can approve or reject it,
 * or escalate it to the ConcessionLimit tier it meets (`EscalateShift`), whose role then decides it. ./TermShift.ts
 * applies it in the approval's own transaction and raises the acknowledgment task, so it gets no second one.
 *
 * A LINE WHOSE PRODUCT ALWAYS NEEDS APPROVAL (golive #281) is valued like any other Price or Scope concession, at
 * zero when it gives nothing away against an engine price, and always goes to the approval tier it meets: the
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
 *           ./SeatAddition.ts (a Seats concession reaching Approved)
 *           ./AmountChange.ts (a Price concession with NewAmount reaching Approved)
 *           ./PaymentTermsChange.ts (a Terms concession reaching Approved)
 *           ./TermShift.ts (a Shift concession reaching Approved)
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
    ShiftNeedsFinanceReview,
    SplitTermDateChange,
    TermLengthChangeDays,
    IsEditable,
    UserHoldsRole,
    mjBizAppsOrdersOrderConcessionEntity,
    type ConcessionTierMeasure,
    type ConcessionTierRule,
    type ConcessionValuation,
    type TermDateChange,
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
    FindConcessionTier,
    LinePriceConcessionFor,
    LoadConcessionAuthority,
    OrderConcessionTotal,
    OrderNetTotal,
    ProductsRequiringSaleApproval,
} from './ConcessionGate.js';
import { ApplyAmountChange, CheckAmountChange, NextCreditMemoNumber, type ApprovedAmountChange } from './AmountChange.js';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RaiseConcessionAcknowledgment } from './ConcessionAcknowledgment.js';
import { ApplyTermsChange, CheckTermsChange } from './PaymentTermsChange.js';
import { CheckReferralProgram } from './ReferralProgram.js';
import { OrdersSettings } from './OrdersSettings.js';
import { RequireUUID } from './sql-guards.js';
import { ApplyTermExtension, AsDay, CheckTermExtension, IsoDay, type ApprovedDurationConcession, type CheckedTermExtension } from './TermExtension.js';
import { ApplyTermShift, CheckTermShift, ShiftReviewRoleID, type ApprovedShiftConcession } from './TermShift.js';
import { ApplySeatAddition, CheckSeatAddition } from './SeatAddition.js';

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
    'PriorStartDate',
    'PriorEndDate',
    'NewStartDate',
    'NewEndDate',
    'NewAmount',
    'AppliesToPaymentScheduleID',
    'RefundRequested',
    'ScheduleReduction',
    'CreditMemoAmount',
    'CreditMemoNumber',
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
        if (this.escalation) return this.saveEscalation(options);
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
        // An approved Shift concession moves its term the same way (#507).
        const shifting = this.DeliveryForm === 'Shift' && this.Status === 'Approved' && (recording || deciding);
        // An approved Seats concession adds its seats to the line's term the same way (#686).
        const addingSeats = this.DeliveryForm === 'Seats' && this.Status === 'Approved' && (recording || deciding);
        // An approved amount change lowers its term in the same transaction (#506).
        const changingAmount = this.IsAmountChange && this.Status === 'Approved' && (recording || deciding);
        // A decision made through the task leaves the task to the tasks app, which closes it itself.
        const closing =
            deciding && !this.DecidedThroughTask && (this.Status === 'Approved' || this.Status === 'Rejected') ? this.Status : null;
        // Every other approval is acknowledged by accounting too (golive #268); an extension's, a shift's and an
        // amount change's own task carries its schedule.
        const acknowledging =
            this.Status === 'Approved' &&
            (recording || deciding) &&
            this.DeliveryForm !== 'Duration' &&
            this.DeliveryForm !== 'Shift' &&
            !this.IsAmountChange;
        if (changingAmount) {
            const problem = await this.stampScheduleReduction();
            if (problem) {
                this.RegisterResultHistoryEntry(this.buildRejection(problem));
                return false;
            }
        }
        if (extending || changingTerms || shifting || addingSeats || changingAmount || closing || acknowledging) {
            return this.withApprovalTask(recording ? 'create' : 'update', () => super.Save(options), async (ctx) => {
                // Closed first: closing completes every open task linked to the concession, and the acknowledgment
                // raised below must stay open.
                if (closing) await CloseConcessionTasks(this.ID, this.OrderHeaderID, closing, ctx);
                if (extending) await ApplyTermExtension(this.asApprovedExtension(), ctx);
                if (shifting) await ApplyTermShift(this.asApprovedShift(), ctx);
                if (addingSeats) await ApplySeatAddition({ OrderLineID: this.OrderLineID!, AddedQuantity: Number(this.AddedQuantity) }, ctx);
                if (acknowledging) await RaiseConcessionAcknowledgment(this.asApprovedFacts(), ctx);
                if (changingAmount) {
                    const applied = await ApplyAmountChange(this.asApprovedAmountChange(), ctx);
                    if (applied.ScheduleReduction !== Number(this.ScheduleReduction)) {
                        throw new Error(
                            `This amount change would now take ${applied.ScheduleReduction.toFixed(2)} off the instalments, not the ` +
                                `${Number(this.ScheduleReduction).toFixed(2)} recorded when it was approved, because the order has changed since. Try again.`,
                        );
                    }
                }
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

    private asApprovedShift(): ApprovedShiftConcession {
        return {
            ID: this.ID,
            SubscriptionTermID: this.SubscriptionTermID!,
            PriorStartDate: this.PriorStartDate!,
            PriorEndDate: this.PriorEndDate!,
            NewStartDate: this.NewStartDate!,
            RequestedByUserID: this.RequestedByUserID,
            ReasonCategory: this.ReasonCategory,
            Reason: this.Reason,
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

    /** A Price concession that lowers a booked term's amount rather than a draft line's price. */
    public get IsAmountChange(): boolean {
        return this.DeliveryForm === 'Price' && this.NewAmount != null;
    }

    private asApprovedAmountChange(): ApprovedAmountChange {
        return {
            ID: this.ID,
            SubscriptionTermID: this.SubscriptionTermID!,
            NewAmount: Number(this.NewAmount),
            AppliesToPaymentScheduleID: this.AppliesToPaymentScheduleID,
            RefundRequested: this.RefundRequested === true,
            RequestedByUserID: this.RequestedByUserID,
            ReasonCategory: this.ReasonCategory,
            Reason: this.Reason,
            ComputedValue: Number(this.ComputedValue),
            CreditMemoAmount: Number(this.CreditMemoAmount ?? 0),
            CreditMemoNumber: this.CreditMemoNumber,
        };
    }

    /**
     * Record on the approved row what the change takes off the uninvoiced instalments, and the credit memo it issues
     * for the rest with its number, read as the order stands at the approval. The application then checks it took
     * exactly that.
     */
    private async stampScheduleReduction(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        if (!user?.ID) return 'An amount change needs a signed-in user to record who made it, and none was given.';
        const checked = await CheckAmountChange(
            {
                SubscriptionTermID: this.SubscriptionTermID!,
                NewAmount: Number(this.NewAmount),
                AppliesToInvoiceID: this.AppliesToPaymentScheduleID,
                RefundRequested: this.RefundRequested === true,
                RequestedByUserID: this.RequestedByUserID,
                OrderConcessionID: this.IsSaved ? this.ID : null,
            },
            { Provider: this.provider(), User: user },
        );
        if (typeof checked === 'string') return checked;
        this.ScheduleReduction = checked.ScheduleReduction > 0 ? checked.ScheduleReduction : null;
        if (checked.CreditMemo.Gross > 0) {
            this.CreditMemoAmount = checked.CreditMemo.Gross;
            this.CreditMemoNumber = await NextCreditMemoNumber(checked.OrderHeaderID, checked.OrderNumber, { Provider: this.provider(), User: user });
        } else {
            this.CreditMemoAmount = null;
            this.CreditMemoNumber = null;
        }
        return null;
    }

    /** Set only by ConcessionApprovalListener, when the decision was recorded on the concession's approval task. */
    public DecidedThroughTask = false;

    /** The ConcessionLimit rule's role, kept by `prepareNew` for routing a Pending concession. */
    private approvingRole: string | null = null;
    /** How this concession changes its term's dates, set when a Duration concession is valued. */
    private termDateChange: TermDateChange | null = null;
    /** Set when a Price or Scope concession is valued on a line whose product always needs approval (golive #281). */
    private saleApprovalRequired = false;
    /** The line that bought the term a Duration concession extends, set when it is valued. */
    private extendedLine: LineRow | null = null;
    /** That term's first day and today's business day, as the extension check read them; set with `extendedLine`. */
    private extendedTerm: Pick<CheckedTermExtension, 'TermStartDate' | 'EffectiveDate'> | null = null;

    /** What the approval task calls this concession ("25% discount, 3,000.00"), kept by `prepareNew`. */
    private approvalSummary = '';
    /** The concession's value as a share of what the line would have cost, kept by `prepareNew` for the summary. */
    private valuedPercent: number | null = null;

    /**
     * Set only by `OrderEntityServer` when it deletes a removed DRAFT line's dependents. A booked order
     * refuses line removals outright, so this never reaches a concession a customer was committed to.
     */
    public WithdrawWithDraftLine = false;

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (this.Status !== 'Pending' && !this.WithdrawWithDraftLine && !(await this.approvedOnAuthorityInDraft())) {
            this.RegisterResultHistoryEntry(
                this.buildRejection(
                    `This concession is ${this.Status}, so it cannot be deleted: it is the record of that decision. Only a ` +
                        `pending concession, or one approved within the requester's own authority on an order that is ` +
                        `not yet confirmed, can be withdrawn.`,
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
            this.RegisterResultHistoryEntry(this.buildRejection('A concession change needs a signed-in user to record who made it, and none was given.', type));
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
        if (!user?.ID) return 'A concession needs a signed-in user to record who asked for it, and none was given.';
        if (!this.Reason?.trim()) return 'A concession must state its reason.';

        this.termDateChange = null;
        this.saleApprovalRequired = false;
        this.extendedLine = null;
        this.extendedTerm = null;
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

        const measure: ConcessionTierMeasure = {
            Value: valued.Value,
            CumulativeShare: share,
            TermLengthChangeDays: this.termDateChange ? TermLengthChangeDays(this.termDateChange) : null,
        };
        this.valuedPercent = valued.Percent ?? null;

        if (this.DeliveryForm === 'Shift') return this.routeShift(user);
        if (ConcessionAlwaysEscalates(this.DeliveryForm) || this.saleApprovalRequired) return this.escalate(user, measure);

        if (this.ReferralProgramID) {
            const inProgram = await this.inReferralProgram(user);
            if (typeof inProgram === 'string') return inProgram;
            if (inProgram) {
                this.decide('Approved', user);
                return null;
            }
        }

        const authority = await LoadConcessionAuthority(user.ID, this.provider(), user);
        const assessment = AssessConcession(this.DeliveryForm, valued, authority, this.termDateChange?.ExtensionDays, share);
        const tier = await FindConcessionTier(measure, this.provider(), user);
        if (tier.Conflict) return tier.Conflict;

        if (assessment.WithinAuthority && authority) {
            this.AuthorizedBySalesAuthorityID = authority.ID;
            // A tier that requires sign-off decides it anyway; the authority is recorded as covering it.
            if (tier.Rule?.RequiresDecisionWithinAuthority) {
                return this.pendForAnotherHolder(
                    tier.Rule,
                    user,
                    `Tier '${tier.Rule.Name}' requires a decision even within the requester's authority`,
                );
            }
            this.decide('Approved', user);
            return null;
        }

        const rule = tier.Rule;
        if (!rule?.ApprovalRequiredRoleID) {
            return (
                `This concession is outside the requester's sales authority (${assessment.Breaches.join('; ')}), and no ` +
                `active ConcessionLimit sales rule whose thresholds it meets names an approving role, so no one could ` +
                `approve it. Ask an administrator to set up a ConcessionLimit rule with an approving role and no ` +
                `thresholds, as the lowest tier.`
            );
        }
        if (rule.RequiresDecisionWithinAuthority) {
            return this.pendForAnotherHolder(rule, user, `Tier '${rule.Name}' requires a decision by someone other than the requester`);
        }
        this.SalesRuleID = rule.ID;
        if (await UserHoldsRole(rule.ApprovalRequiredRoleID, this.provider(), user, user.ID)) {
            this.decide('Approved', user);
        } else {
            this.pend(rule.ID, rule.ApprovalRequiredRoleID);
        }
        return null;
    }

    /** Pending under a tier: stamped with its rule, routed to its role, and summarised for the approval task. */
    private pend(ruleID: string, roleID: string): void {
        this.SalesRuleID = ruleID;
        this.Status = 'Pending';
        this.approvingRole = roleID;
        this.approvalSummary = ConcessionSummary({
            DeliveryForm: this.DeliveryForm,
            ComputedValue: Number(this.ComputedValue ?? 0),
            Percent: this.valuedPercent,
            AddedDays: this.AddedDays,
            AddedQuantity: this.AddedQuantity,
        });
    }

    /**
     * Route a form that always needs approval to the tier it meets, whatever the requester's authority.
     * The requester cannot decide it, so someone else must hold the role.
     */
    private async escalate(user: UserInfo, measure: ConcessionTierMeasure): Promise<string | null> {
        const what = this.saleApprovalRequired
            ? 'A concession on a line whose product always needs approval'
            : `A ${this.DeliveryForm} concession`;
        const tier = await FindConcessionTier(measure, this.provider(), user);
        if (tier.Conflict) return tier.Conflict;
        if (!tier.Rule?.ApprovalRequiredRoleID) {
            return (
                `${what} always needs approval, and no active ConcessionLimit sales rule whose thresholds it meets ` +
                `names an approving role, so no one could approve it. Ask an administrator to set up a ConcessionLimit ` +
                `rule with an approving role and no thresholds, as the lowest tier.`
            );
        }
        return this.pendForAnotherHolder(tier.Rule, user, `${what} cannot be decided by the person who asked for it`);
    }

    /**
     * Pending under `rule`, for a holder of its role other than the requester. Refused up front, with
     * `why` leading the message, when the requester is the only active holder.
     */
    private async pendForAnotherHolder(rule: ConcessionTierRule, user: UserInfo, why: string): Promise<string | null> {
        if (!rule.ApprovalRequiredRoleID) {
            return `${why}, and the ConcessionLimit sales rule '${rule.Name}' names no approving role, so no one could decide it. Ask an administrator to give the rule an approving role.`;
        }
        const holders = await ActiveRoleHolderIDs(rule.ApprovalRequiredRoleID, { Provider: this.provider(), User: user });
        if (!holders.some((id) => !UUIDsEqual(id, user.ID))) {
            return (
                `${why}, and no active user other than the requester holds the approving role of sales rule ` +
                `'${rule.Name}'. Ask an administrator to give that role to another approver.`
            );
        }
        this.pend(rule.ID, rule.ApprovalRequiredRoleID);
        return null;
    }

    /**
     * Route a shift (#507). It is not a concession on the rep's authority: under `TermShiftReviewDays` it goes
     * through, and at or above it the finance acknowledgment role reviews it. Recording already checked that
     * someone other than the requester holds that role (`CheckTermShift`).
     */
    private async routeShift(user: UserInfo): Promise<string | null> {
        await OrdersSettings.Load(this.provider(), user);
        const days = this.termDateChange?.ShiftDays ?? 0;
        if (!ShiftNeedsFinanceReview(days, OrdersSettings.TermShiftReviewDays)) {
            this.decide('Approved', user);
            return null;
        }
        const roleID = await ShiftReviewRoleID({ Provider: this.provider(), User: user });
        if (!roleID) {
            return (
                'A shift of this size is reviewed by the finance acknowledgment role, and none is configured (Orders ' +
                'setting AmendmentAcknowledgmentRole).'
            );
        }
        this.Status = 'Pending';
        this.approvingRole = roleID;
        this.approvalSummary = ConcessionSummary({ DeliveryForm: 'Shift', ComputedValue: 0, AddedDays: days });
        return null;
    }

    /** Set by `EscalateShift` for the save that hands a Shift from finance review to a ConcessionLimit tier. */
    private escalation: { Note: string; Rule: ConcessionTierRule } | null = null;

    /**
     * Send a Shift awaiting finance review to the ConcessionLimit tier it meets, for an unusual case (#507). Only
     * a holder of the finance acknowledgment role may, and not the requester. The finance review task is
     * cancelled with `note`, and the tier's role gets an approval task in the same transaction. Returns false
     * with the reason on `LatestResult` when it cannot be escalated.
     */
    public async EscalateShift(note: string): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const refuse = (message: string): boolean => {
            this.RegisterResultHistoryEntry(this.buildRejection(message, 'update'));
            return false;
        };
        if (!user?.ID) return refuse('An escalation needs a signed-in user to record who made it, and none was given.');
        if (!this.IsSaved || this.DeliveryForm !== 'Shift' || this.Status !== 'Pending' || this.SalesRuleID) {
            return refuse('Only a Shift concession awaiting finance review can be escalated.');
        }
        if (!note?.trim()) return refuse('Enter a note saying why this case is unusual before escalating it.');
        if (UUIDsEqual(user.ID, this.RequestedByUserID)) return refuse('The person who asked for a shift cannot escalate it.');
        const reviewRoleID = await ShiftReviewRoleID({ Provider: this.provider(), User: user });
        if (!reviewRoleID || !(await UserHoldsRole(reviewRoleID, this.provider(), user, user.ID))) {
            return refuse('Only a holder of the finance acknowledgment role can escalate a shift.');
        }
        const tier = await FindConcessionTier(
            { Value: 0, CumulativeShare: this.CumulativeShare == null ? null : Number(this.CumulativeShare), TermLengthChangeDays: 0 },
            this.provider(),
            user,
        );
        if (tier.Conflict) return refuse(tier.Conflict);
        if (!tier.Rule?.ApprovalRequiredRoleID) {
            return refuse(
                'No active ConcessionLimit sales rule names an approving role for this shift, so there is no one to ' +
                    'escalate it to. Ask an administrator to set up a ConcessionLimit rule with an approving role and no thresholds.',
            );
        }
        this.escalation = { Note: note.trim(), Rule: tier.Rule };
        try {
            return await this.Save();
        } finally {
            this.escalation = null;
        }
    }

    /** The escalation's own save: the tier is stamped, finance's task cancelled and the tier's role told. */
    private async saveEscalation(options?: EntitySaveOptions): Promise<boolean> {
        const { Note, Rule } = this.escalation!;
        this.SalesRuleID = Rule.ID;
        return this.withApprovalTask('update', () => super.Save(options), async (ctx) => {
            await CloseConcessionTasks(this.ID, this.OrderHeaderID, 'Escalated', ctx, true, Note);
            await RouteConcessionToApproval(
                { ID: this.ID, OrderHeaderID: this.OrderHeaderID, RequestedByUserID: this.RequestedByUserID },
                Rule.ApprovalRequiredRoleID!,
                ConcessionSummary({ DeliveryForm: 'Shift', ComputedValue: 0, AddedDays: this.shiftDays() }),
                ctx,
            );
        });
    }

    /** How far a recorded Shift moves its term, in days. */
    private shiftDays(): number {
        if (!this.PriorStartDate || !this.NewStartDate) return 0;
        return Math.round((AsDay(this.NewStartDate).getTime() - AsDay(this.PriorStartDate).getTime()) / 86_400_000);
    }

    /** Value the concession from its own line or term, and stamp the order it belongs to. */
    private async valueByForm(user: UserInfo): Promise<ConcessionValuation | string> {
        switch (this.DeliveryForm) {
            case 'Duration':
                return this.valueDuration(user);
            case 'Price':
                return this.NewAmount != null ? this.valueAmountChange(user) : this.valueLinePrice(user);
            case 'Scope':
                return this.valueLinePrice(user);
            case 'Seats':
                return this.valueSeats(user);
            case 'Terms':
                return this.valueTerms(user);
            case 'Shift':
                return this.valueShift(user);
            default:
                return `'${String(this.DeliveryForm)}' is not a known type of concession.`;
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
        if (!term) return 'The subscription term this concession names was not found.';
        if (term.Status === 'Canceled') return 'A canceled term cannot be extended.';

        const line = await this.loadLine(term.OrderLineID, user);
        if (!line) return 'The order line that bought this subscription term was not found.';

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
        this.extendedTerm = { TermStartDate: applicable.TermStartDate, EffectiveDate: applicable.EffectiveDate };
        this.termDateChange = SplitTermDateChange(
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
     * A booked term's amount lowered: worth the reduction, as a share of the term's current amount. Refused now
     * what could never be applied.
     */
    private async valueAmountChange(user: UserInfo): Promise<ConcessionValuation | string> {
        if (!this.SubscriptionTermID) return 'An amount change must name the term whose amount it lowers.';
        const checked = await CheckAmountChange(
            {
                SubscriptionTermID: this.SubscriptionTermID,
                NewAmount: Number(this.NewAmount),
                AppliesToInvoiceID: this.AppliesToPaymentScheduleID,
                RefundRequested: this.RefundRequested === true,
                RequestedByUserID: user.ID,
            },
            { Provider: this.provider(), User: user },
        );
        if (typeof checked === 'string') return checked;

        this.OrderHeaderID = checked.OrderHeaderID;
        this.OrderLineID = checked.OrderLineID;
        this.ScheduleReduction = null;
        this.CreditMemoAmount = null;
        this.CreditMemoNumber = null;
        const reduction = checked.Recognition.Reduction;
        return { Value: reduction, Percent: checked.CurrentAmount > 0 ? reduction / checked.CurrentAmount : null };
    }

    /**
     * Whether the referral program this concession names approves it: true when it is in program, false when it
     * is routed like any other, or why naming the program is refused.
     */
    private async inReferralProgram(user: UserInfo): Promise<boolean | string> {
        if (this.DeliveryForm !== 'Duration' || !this.extendedLine || !this.extendedTerm) {
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
                TermStartDate: this.extendedTerm.TermStartDate,
                Today: this.extendedTerm.EffectiveDate,
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
                `Line ${line.LineNumber} is charged its standard price, or another price that applies to it, with no ` +
                `discount, so there is no price concession to record.`
            );
        }
        this.DeliveryForm = concession.Form;
        this.OrderHeaderID = line.OrderHeaderID;
        return concession.Valuation;
    }

    private async valueSeats(user: UserInfo): Promise<ConcessionValuation | string> {
        const added = Number(this.AddedQuantity ?? 0);
        // Whole seats, as confirm counts them: the added seats join the term's count (#686).
        if (!Number.isInteger(added) || added <= 0) return 'A Seats concession must add a whole, positive number of seats.';
        const line = await this.requireLine(user);
        if (typeof line === 'string') return line;
        this.OrderHeaderID = line.OrderHeaderID;
        const blocked = await CheckSeatAddition({ OrderLineID: line.ID, AddedQuantity: added }, { Provider: this.provider(), User: user });
        if (blocked) return blocked;
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

    /**
     * A shift is worth nothing: the same price buys the same length of time, later or earlier. The requester names
     * the term and its new start and end; the dates before are read from the term.
     */
    private async valueShift(user: UserInfo): Promise<ConcessionValuation | string> {
        if (!this.SubscriptionTermID) return 'A Shift concession must name the term it moves.';
        if (!this.NewStartDate || !this.NewEndDate) return 'A Shift concession must give the term\'s new start and end dates.';
        const term = await this.loadRow<TermRow>(SUBSCRIPTION_TERM_ENTITY, this.SubscriptionTermID, ['OrderLineID', 'StartDate', 'EndDate', 'Amount', 'Status'], user);
        if (!term) return 'The subscription term this concession names was not found.';

        const priorStart = AsDay(term.StartDate);
        const priorEnd = AsDay(term.EndDate);
        const change = SplitTermDateChange(
            { StartDate: priorStart, EndDate: priorEnd },
            { StartDate: AsDay(this.NewStartDate), EndDate: AsDay(this.NewEndDate) },
        );
        if (change.ShiftDays === 0 || change.ExtensionDays !== 0 || change.ShorteningDays !== 0) {
            return (
                `A shift moves a term's start and end by the same number of days. Moving the term from ${IsoDay(priorStart)} – ` +
                `${IsoDay(priorEnd)} to ${IsoDay(AsDay(this.NewStartDate))} – ${IsoDay(AsDay(this.NewEndDate))} changes its length, so it is not a shift. Pick new dates the same distance apart.`
            );
        }

        // Refuse now what could never be applied, rather than route it for review and refuse the approval.
        const applicable = await CheckTermShift(
            { SubscriptionTermID: this.SubscriptionTermID, ShiftDays: change.ShiftDays, RequestedByUserID: user.ID },
            { Provider: this.provider(), User: user },
        );
        if (typeof applicable === 'string') return applicable;

        this.OrderHeaderID = applicable.OrderHeaderID;
        this.OrderLineID = applicable.OrderLineID;
        this.AddedDays = null;
        this.AddedQuantity = null;
        this.PriorStartDate = priorStart;
        this.PriorEndDate = priorEnd;
        this.termDateChange = change;
        return { Value: 0, Percent: null };
    }

    private async requireLine(user: UserInfo): Promise<LineRow | string> {
        if (!this.OrderLineID) return `A ${this.DeliveryForm} concession must name the order line it applies to.`;
        const line = await this.loadLine(this.OrderLineID, user);
        return line ?? 'The order line this concession names was not found.';
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
                return 'A decision note can only be added when the concession is approved or rejected.';
            }
            if (this.GetFieldByName('SignedAmendmentReference')?.Dirty && this.Status !== 'Approved') {
                return `This concession is ${this.Status}. A signed amendment is recorded only against an Approved concession.`;
            }
            return null;
        }

        const previous = String(statusField.OldValue ?? '');
        if (previous !== 'Pending') return `This concession was already ${previous}, and a decision cannot be changed.`;
        if (this.Status !== 'Approved' && this.Status !== 'Rejected') {
            return 'A Pending concession can only be Approved or Rejected.';
        }
        if (!user?.ID) return 'A decision needs a signed-in user to record who made it, and none was given.';
        if (ConcessionAlwaysEscalates(this.DeliveryForm) && UUIDsEqual(user.ID, this.RequestedByUserID)) {
            return `A ${this.DeliveryForm} concession cannot be decided by the person who asked for it.`;
        }
        if (UUIDsEqual(user.ID, this.RequestedByUserID) && (await this.onSaleApprovalLine(user))) {
            return 'A concession on a line whose product always needs approval cannot be decided by the person who asked for it.';
        }

        if (this.DeliveryForm === 'Shift' && !this.SalesRuleID) return this.decideShiftReview(user);

        const rule = await this.approvingRule(user);
        if (!rule?.ApprovalRequiredRoleID) {
            return 'This concession has no ConcessionLimit sales rule with an approving role, so no one can decide it. Ask an administrator to check the ConcessionLimit rules.';
        }
        if (!(await UserHoldsRole(rule.ApprovalRequiredRoleID, this.provider(), user, user.ID))) {
            return "Only a holder of the role named by this concession's approval rule can decide it.";
        }
        if (rule.RequiresDecisionWithinAuthority && UUIDsEqual(user.ID, this.RequestedByUserID)) {
            return `The sales rule '${rule.Name}' requires a decision by someone other than the person who asked for it.`;
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

    /** A Shift under finance review: a holder of the finance acknowledgment role decides it, never the requester. */
    private async decideShiftReview(user: UserInfo): Promise<string | null> {
        if (UUIDsEqual(user.ID, this.RequestedByUserID)) return 'A shift cannot be decided by the person who asked for it.';
        const roleID = await ShiftReviewRoleID({ Provider: this.provider(), User: user });
        if (!roleID) return 'No finance acknowledgment role is set up, so no one can decide this shift. Ask an administrator to set the Orders setting AmendmentAcknowledgmentRole.';
        if (!(await UserHoldsRole(roleID, this.provider(), user, user.ID))) {
            return 'Only a holder of the finance acknowledgment role can decide a shift under review.';
        }
        this.decide(this.Status as 'Approved' | 'Rejected', user);
        return null;
    }

    /**
     * The role that decides this concession: its ConcessionLimit rule's, or null when it names none. A Shift
     * under finance review is decided by the finance acknowledgment role.
     */
    public async ApprovingRoleID(user: UserInfo): Promise<string | null> {
        if (this.DeliveryForm === 'Shift' && !this.SalesRuleID) return ShiftReviewRoleID({ Provider: this.provider(), User: user });
        return (await this.approvingRule(user))?.ApprovalRequiredRoleID ?? null;
    }

    /** The ConcessionLimit rule (tier) stamped on this concession, or null when it names none. */
    private async approvingRule(
        user: UserInfo,
    ): Promise<{ Name: string; ApprovalRequiredRoleID: string | null; RequiresDecisionWithinAuthority: boolean } | null> {
        if (!this.SalesRuleID) return null;
        const rule = await this.loadRow<{ Name: string; ApprovalRequiredRoleID: string | null; RequiresDecisionWithinAuthority: boolean }>(
            SALES_RULE_ENTITY,
            this.SalesRuleID,
            ['Name', 'ApprovalRequiredRoleID', 'RequiresDecisionWithinAuthority'],
            user,
        );
        return rule ? { ...rule, RequiresDecisionWithinAuthority: !!rule.RequiresDecisionWithinAuthority } : null;
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

/**
 * OrderConcession server subclass — values a concession and decides who may approve it (golive #222).
 *
 * RECORDING ONE. The requester states what was given — the line, or the term and the days added — and
 * why. Everything else is derived here and whatever the caller sent is overwritten: the order it
 * belongs to, its value at the arrangement's own rate, the requester, and its status. Within the
 * requester's `SalesAuthority` it is Approved on save; outside it, it is Pending, stamped with the
 * active ConcessionLimit rule whose role decides it. A requester who holds that role approves their
 * own, and the record shows that it went through the rule rather than through their authority.
 *
 * DECIDING ONE. The only change a recorded concession accepts is Pending → Approved or Rejected, by a
 * holder of the rule's role, with an optional note. A different concession is a new record: withdraw
 * a Pending one (delete it) and record again.
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-entities ConcessionBehavior
 *   READS:  ./ConcessionGate.ts (authority, rule, line price) · Subscription Terms · Order Lines
 *   GATE:   OrderEntityServer (confirm) and the send-document action refuse while one is Pending
 */
import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IRunViewProvider,
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    AssessConcession,
    ConcessionValue,
    InclusiveDays,
    UserHoldsRole,
    mjBizAppsOrdersOrderConcessionEntity,
    type ConcessionValuation,
} from '@mj-biz-apps/orders-entities';
import { FindConcessionLimitRule, LinePriceConcessionFor, LoadConcessionAuthority } from './ConcessionGate.js';
import { ORDER_CONCESSION_ENTITY, ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID } from './sql-guards.js';

const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SALES_RULE_ENTITY = 'MJ_BizApps_Orders: Sales Rules';

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
    'ComputedValue',
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
        const problem = this.IsSaved ? await this.applyDecision() : await this.prepareNew();
        if (problem) {
            this.RegisterResultHistoryEntry(this.buildRejection(problem));
            return false;
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (this.Status !== 'Pending') {
            this.RegisterResultHistoryEntry(
                this.buildRejection(
                    `This concession is ${this.Status}. A decided concession is the record of that decision and ` +
                        `cannot be deleted; only a Pending one can be withdrawn.`,
                    'delete',
                ),
            );
            return false;
        }
        return super.Delete(options);
    }

    // ─── Recording ────────────────────────────────────────────────────────────

    private async prepareNew(): Promise<string | null> {
        const user = this.ContextCurrentUser;
        if (!user?.ID) return 'A concession must be attributable to a user, and no user was supplied.';
        if (!this.Reason?.trim()) return 'A concession must state its reason.';

        const valued = await this.valueByForm(user);
        if (typeof valued === 'string') return valued;

        this.RequestedByUserID = user.ID;
        this.ComputedValue = valued.Value;
        this.AuthorizedBySalesAuthorityID = null;
        this.SalesRuleID = null;
        this.DecidedByUserID = null;
        this.DecidedAt = null;

        const authority = await LoadConcessionAuthority(user.ID, this.provider(), user);
        const assessment = AssessConcession(this.DeliveryForm, valued, authority, this.AddedDays);
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
        }
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

        this.OrderHeaderID = line.OrderHeaderID;
        this.OrderLineID = line.ID;
        return ConcessionValue({
            Form: 'Duration',
            TermAmount: Number(term.Amount),
            TermDays: InclusiveDays(new Date(term.StartDate), new Date(term.EndDate)),
            AddedDays: days,
        });
    }

    private async valueLinePrice(user: UserInfo): Promise<ConcessionValuation | string> {
        const line = await this.requireLine(user);
        if (typeof line === 'string') return line;
        const concession = await LinePriceConcessionFor(line, this.provider(), user);
        if (!concession) {
            return (
                `Line ${line.LineNumber} is charged its engine price or another named price that applies, so there ` +
                `is no price concession on it to record.`
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
            return this.GetFieldByName('DecisionNotes')?.Dirty
                ? 'A decision note is recorded with the decision itself, by setting Status to Approved or Rejected.'
                : null;
        }

        const previous = String(statusField.OldValue ?? '');
        if (previous !== 'Pending') return `This concession was already ${previous}; a decision is not reopened.`;
        if (this.Status !== 'Approved' && this.Status !== 'Rejected') {
            return 'A Pending concession can only be Approved or Rejected.';
        }
        if (!user?.ID) return 'A decision must be attributable to a user, and no user was supplied.';

        const roleID = await this.approvingRoleID(user);
        if (!roleID) {
            return 'This concession names no ConcessionLimit rule with an approving role, so no one can decide it.';
        }
        if (!(await UserHoldsRole(roleID, this.provider(), user, user.ID))) {
            return 'Only a holder of the role named by the ConcessionLimit rule can decide this concession.';
        }
        this.decide(this.Status, user);
        return null;
    }

    private async approvingRoleID(user: UserInfo): Promise<string | null> {
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
            ['ID', 'OrderHeaderID', 'LineNumber', 'ProductID', 'Quantity', 'UnitPrice', 'ProductPriceID'],
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

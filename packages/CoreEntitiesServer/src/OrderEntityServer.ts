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

const ORDER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const COMPANY_ENTITY = 'MJ: Companies';

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

            const savedHeader = await super.Save(options);
            if (!savedHeader) {
                throw new Error(
                    `Failed to save order header: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }

            await this.savePendingLines(options);

            if (booking) {
                const lines = await this.loadLinesForBooking();
                await this.bookLines(lines, options);
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
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const user = this.ContextCurrentUser as UserInfo;

        const unbooked = lines.filter((l) => !l.JournalEntryID);
        if (unbooked.length === 0) return;

        const factory = new OrderJournalEntryFactory(
            await this.buildResolver(provider, user),
            this.entityIDFor(ORDER_LINE_ENTITY),
            provider,
            user,
        );

        const drafts = await factory.BuildDrafts(this, unbooked);
        const result = await this.submitDrafts(drafts, provider, user);

        if (!result.Success) {
            const detail = (result.Errors ?? [])
                .map((e) => {
                    const which =
                        e.DraftIndex !== undefined
                            ? ` (order line ${unbooked[e.DraftIndex]?.LineNumber ?? e.DraftIndex})`
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

    /** NULL→value-once; the DB trigger enforces the same rule independently. */
    private async stampJournalEntryIDs(
        drafts: OrderLineDraft[],
        result: CreateJournalEntriesResult,
        options?: EntitySaveOptions,
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const results = result.Results ?? [];

        for (let i = 0; i < drafts.length; i++) {
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

/**
 * GLAccountResolver — turns a (product, role) pair into a concrete GL account UUID.
 *
 * Accounting's `CreateJournalEntries` contract takes `GLAccountID`, never a role name, so the
 * role→account walk is the CALLER's job (plan D5). Accounting supplies only the per-record link
 * primitive — `AccountingEngineBase.ResolveLinkedAccount(entityId, recordId, role, asOfDate)` —
 * and this class implements the precedence over it:
 *
 *     Product  →  its ProductCategory  →  that category's ancestors  →  the line's Company
 *
 * Most specific wins; the first link found at any level ends the walk. Nothing resolves → we
 * FAIL LOUDLY (plan D5: "fail loudly" — never silently book to a default account).
 *
 * COMPANY INVARIANT (plan D6): the resolved account MUST belong to the order line's company.
 * Accounting derives a JE's company from `GLAccount.CompanyID` and takes no CompanyID in its
 * contract (their CH-2), so a mis-resolved account would silently book revenue to the wrong
 * legal entity with nothing downstream to catch it. This class is therefore the ONLY place that
 * invariant can be enforced, and it hard-blocks — cross-company mapping is refused entirely.
 *
 * CONNECTS TO:
 *   PRIMITIVE: AccountingEngineBase.ResolveLinkedAccount (@mj-biz-apps/accounting-engine-base)
 *   CALLER:    OrderJournalEntryFactory (./OrderJournalEntryFactory.ts)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';

/** GL account roles this app books against (seeded by accounting's metadata). */
export const GL_ROLE = {
    AccountsReceivable: 'Accounts Receivable',
    Sales: 'Sales',
    SalesDiscounts: 'Sales Discounts',
    DeferredRevenue: 'Deferred Revenue',
    SalesReturnsAndAllowances: 'Sales Returns and Allowances',
    /** Where captured cash lands. Company-level only — a payment has no product to walk from. */
    Cash: 'Cash',
    /**
     * The provider's cut on a capture (D18). NOT seeded by accounting's starter roles, so callers
     * must tolerate it failing to resolve — see PaymentJournalEntryFactory, which books the gross
     * to Cash and reports the shortfall rather than silently misstating the bank line.
     */
    ProcessingFee: 'Processing Fee',
} as const;

export type GLRole = (typeof GL_ROLE)[keyof typeof GL_ROLE];

/** MJ Entity IDs for the records the account links hang off. */
export interface ResolverEntityIDs {
    Product: string;
    ProductCategory: string;
    Company: string;
}

export class GLAccountResolutionError extends Error {
    constructor(
        public readonly Role: string,
        public readonly ProductID: string,
        message: string,
    ) {
        super(message);
        this.name = 'GLAccountResolutionError';
    }
}

interface CategoryRow {
    ID: string;
    ParentProductCategoryID: string | null;
}

/**
 * Resolves role→account for products, caching the category tree for the life of one booking.
 * Construct per unit of work; do not hold across requests (the category tree is read once).
 */
export class GLAccountResolver {
    private readonly _categoryParent = new Map<string, string | null>();
    private _categoriesLoaded = false;

    constructor(
        private readonly _entityIDs: ResolverEntityIDs,
        private readonly _provider: IMetadataProvider,
        private readonly _contextUser: UserInfo,
        /** Injected so this class stays testable without a live accounting engine. */
        private readonly _resolveLink: (
            entityId: string,
            recordId: string,
            role: string,
            asOf: Date,
            /** When given, only links whose ACCOUNT belongs to this company are considered (D71). */
            forCompanyID?: string,
        ) => { GLAccountID: string; CompanyID: string } | null,
    ) {}

    /**
     * Walk product → category → ancestors → company for `role`.
     *
     * @param expectedCompanyID the order line's company; the resolved account must belong to it
     * @returns the resolved GL account UUID
     * @throws GLAccountResolutionError when nothing resolves, or when the account's company differs
     */
    public async Resolve(
        role: GLRole,
        /**
         * NULL for company-level roles. A payment clears a receivable for a COMPANY — there is no
         * product or category to walk from, so the company default is both the start and the end of
         * the resolution.
         */
        productID: string | null,
        productCategoryID: string | null,
        expectedCompanyID: string,
        asOf: Date,
    ): Promise<string> {
        const hit =
            (productID ? this._resolveLink(this._entityIDs.Product, productID, role, asOf) : null) ??
            (await this.resolveUpCategoryTree(role, productCategoryID, asOf)) ??
            this._resolveLink(this._entityIDs.Company, expectedCompanyID, role, asOf);

        if (!hit) {
            throw new GLAccountResolutionError(
                role,
                productID,
                productID
                    ? `No GL account is linked for role '${role}'. Checked the product, its category ` +
                      `tree, and the company default for company ${expectedCompanyID}. Link an account ` +
                      `for this role (product, category, or company level) before booking.`
                    : `No GL account is linked for role '${role}' at the company level for company ` +
                      `${expectedCompanyID}. This role is resolved company-wide (there is no product ` +
                      `involved), so link an account to the company before booking.`,
            );
        }

        // Plan D6 — hard block. Accounting takes no CompanyID; the account IS the company.
        if (hit.CompanyID !== expectedCompanyID) {
            throw new GLAccountResolutionError(
                role,
                productID,
                `GL account ${hit.GLAccountID} resolved for role '${role}' belongs to company ` +
                    `${hit.CompanyID}, but this books to company ${expectedCompanyID}. ` +
                    `Cross-company account mapping is refused — the journal entry would book revenue ` +
                    `to the wrong legal entity.`,
            );
        }

        return hit.GLAccountID;
    }

    /**
     * Resolve a link for an ARBITRARY record, with no walk (D71).
     *
     * The product walk answers "what account does this product's revenue go to". Some things are not
     * products and have no category tree — a charge type, for instance — so they are looked up
     * directly. Returns null rather than throwing: the caller knows whether the absence is fatal.
     *
     * The company invariant still applies. An account belonging to another company is refused for
     * exactly the reason D6 gives: accounting derives the entry's company FROM the account, so a
     * mis-resolved one books to the wrong legal entity with nothing downstream to catch it.
     */
    public async ResolveForRecord(
        role: GLRole,
        entityID: string,
        recordID: string,
        expectedCompanyID: string,
        asOf: Date,
    ): Promise<string | null> {
        const hit = this._resolveLink(entityID, recordID, role, asOf, expectedCompanyID);
        if (!hit) return null;
        if (hit.CompanyID !== expectedCompanyID) {
            throw new GLAccountResolutionError(
                role,
                recordID,
                `GL account ${hit.GLAccountID} resolved for role '${role}' belongs to company ${hit.CompanyID}, ` +
                    `but this books to company ${expectedCompanyID}. Cross-company account mapping is refused.`,
            );
        }
        return hit.GLAccountID;
    }

    /** Category, then each ancestor, nearest first. */
    private async resolveUpCategoryTree(
        role: GLRole,
        startCategoryID: string | null,
        asOf: Date,
    ): Promise<{ GLAccountID: string; CompanyID: string } | null> {
        if (!startCategoryID) return null;
        await this.ensureCategoriesLoaded();

        const seen = new Set<string>();
        let current: string | null = startCategoryID;

        while (current && !seen.has(current)) {
            seen.add(current); // cycle guard — the DB CHECK blocks self-parenting, not longer loops
            const hit = this._resolveLink(this._entityIDs.ProductCategory, current, role, asOf);
            if (hit) return hit;
            current = this._categoryParent.get(current) ?? null;
        }
        return null;
    }

    /** One read of the category tree per booking — the walk is pointer-chasing after this. */
    private async ensureCategoriesLoaded(): Promise<void> {
        if (this._categoriesLoaded) return;

        const rv = new RunView(this._provider as unknown as IRunViewProvider);
        const result = await rv.RunView<CategoryRow>(
            {
                EntityName: 'MJ_BizApps_Orders: Product Categories',
                Fields: ['ID', 'ParentProductCategoryID'],
                ResultType: 'simple',
            },
            this._contextUser,
        );

        for (const row of result?.Results ?? []) {
            this._categoryParent.set(row.ID, row.ParentProductCategoryID ?? null);
        }
        this._categoriesLoaded = true;
    }
}

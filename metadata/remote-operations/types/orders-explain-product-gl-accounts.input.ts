/**
 * Input for `Orders.ExplainProductGLAccounts`.
 *
 * Which GL account each role books to for one product, and where in the walk (product, category
 * and its parents, product type, company) each comes from (golive#439). Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersExplainProductGLAccountsInput {
    ProductID: string;
    /** The selling company. Defaults to the product's own company. */
    CompanyID?: string | null;
    /** The day the links are read for, `YYYY-MM-DD`. Defaults to today on the business calendar. */
    AsOf?: string;
    /**
     * The roles to explain, by accounting's role name. Defaults to the five a product's lines book:
     * Sales, Deferred Revenue, Sales Discounts, Sales Returns and Allowances, Accounts Receivable.
     */
    Roles?: string[];
}

/**
 * Output of `Orders.ExplainProductGLAccounts`.
 *
 * One entry per role, each listing every level the walk tried, in booking order. The step and role
 * shapes carry the fields accounting's `mj-gl-resolution-preview` renders, so a role can be handed
 * to it as it is.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ExplainedGLStep {
    /** `Product`, `Category`, `ParentCategory`, `ProductType`, `Company` or `LegalEntity`. */
    Level: string;
    /** What was looked at, as a person reads it, e.g. "Category: Services". */
    Scope: string;
    /** The record whose links were read. */
    RecordID: string;
    /** The account linked at this level for the role, or null when there is none. */
    GLAccountID: string | null;
    AccountCode: string | null;
    AccountName: string | null;
    /** True for the step booking stops on: the first one with a link. */
    Won: boolean;
    /** Codes of the dimensions the link at this level requires on a journal entry line. */
    Dimensions: string[];
}

export interface ExplainedGLRole {
    Role: string;
    Steps: ExplainedGLStep[];
    /** The account booking would use. All three are null when booking would refuse. */
    ResolvedGLAccountID: string | null;
    ResolvedCode: string | null;
    ResolvedName: string | null;
    /** `NotLinked` (nothing in the walk) or `CrossCompany` (the winning account is on other books); null when it resolves. */
    Failure: string | null;
    /** Booking's refusal, word for word; null when it resolves. */
    Message: string | null;
}

export interface OrdersExplainProductGLAccountsOutput {
    Success: boolean;
    /** Why nothing could be explained, when `Success` is false. */
    Message?: string;
    ProductID: string;
    /** The company explained for: the one asked for, else the product's own. */
    CompanyID: string;
    /** The day the links were read for, `YYYY-MM-DD`. */
    AsOf: string;
    Roles: ExplainedGLRole[];
}

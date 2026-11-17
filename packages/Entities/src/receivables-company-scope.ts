/**
 * Who sees every company's receivables (#813), shared by the server worklist operations and the
 * Receivables pages so the two tiers cannot disagree.
 *
 * A user holding one of these roles sees all companies, narrowed only by a filter they choose. Any
 * other user sees only the company of the employee record linked to their user, and no company at
 * all when there is no such record: an unlinked user is not proof of finance access, so the scope
 * fails closed.
 *
 * MJ's own `UI` and `Developer` roles are deliberately absent. MJ gives `UI` to every new user, so
 * listing it would make every user an all-companies user and the scope would restrict no one.
 *
 * @module @mj-biz-apps/orders-entities
 */

export const RECEIVABLES_ALL_COMPANIES_ROLES = [
    'Senior Finance (AR)',
    'CFO',
    'CEO Approver',
    'Orders Revenue Supervisor',
    'Finance',
    'Integration',
    'Administrator',
] as const;

/**
 * Shown on a Receivables page when the user is scoped to no company: says why the page is empty and
 * what fixes it.
 */
export const RECEIVABLES_NO_COMPANY_NOTE =
    'You see no companies here: your user holds no finance role and is not linked to an employee record ' +
    'with a company. Ask an administrator to link your user to an employee record, or to grant a finance role.';

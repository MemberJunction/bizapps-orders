/**
 * @fileoverview The AR reclass seam: `Dr Accounts Receivable / Cr Unbilled Receivable` for one
 * instalment, at the moment it is invoiced (plan §1.1 and §5, D89).
 *
 * A DOCUMENTED NO-OP UNTIL AIDP-25 (#240). This ticket ships the schedule, the invoicing act and
 * the per-instalment document; the ledger change — the `UnbilledReceivable` GL role and the split
 * of the booking debit — is the next ticket, and the reclass entry is meaningless until confirm
 * books to Unbilled. So `Orders.IssueInstalmentInvoice` calls this seam inside its transaction, and
 * this seam returns null: no entry, `JournalEntryID` stays NULL, the row still freezes and advances.
 *
 * WHAT AIDP-25 FILLS IN. One `Accounting.CreateJournalEntries` draft per (instalment × company)
 * — the row already carries its company — `Dr AR / Cr Unbilled` for `Amount`, dated `InvoicedAt`,
 * with accounting's D25 provenance pair pointing at the schedule row. Return its JournalEntryID.
 * `AccountingEngine` joins the caller's transaction rather than opening its own, so this stays
 * atomic with the freeze without any plumbing here.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** Everything the reclass entry needs, read once by the operation. */
export interface InstalmentReclassContext {
    OrderHeaderPaymentScheduleID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    CompanyID: string;
    InstallmentNumber: number;
    DocumentNumber: string;
    Amount: number;
    InvoicedAt: Date;
}

/**
 * Book the reclass entry for one instalment and return its JournalEntryID, or null when no entry
 * was booked. NULL IS THE ONLY ANSWER TODAY — see the file header.
 */
export async function EmitInstalmentReclassEntry(
    _context: InstalmentReclassContext,
    _provider: IMetadataProvider,
    _user: UserInfo,
): Promise<string | null> {
    // ponytail: seam only. AIDP-25 (#240) adds the UnbilledReceivable role, splits the booking
    // debit, and books the Dr AR / Cr Unbilled draft here.
    return null;
}

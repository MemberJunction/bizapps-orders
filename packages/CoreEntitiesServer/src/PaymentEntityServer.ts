/**
 * PaymentEntityServer — books a payment's journal entry when it is first Captured (F3.2).
 *
 * On the transition to Status='Captured' (and not yet booked — the Payment.JournalEntryID guard),
 * resolves the receiving company's Cash / A/R / Processing-Fee accounts (company-level GLAccountLink
 * roles), assembles the balanced payment draft, and books it as an ATOMIC unit of work: the JE set
 * is queued onto ONE TransactionGroup via accounting's QueueJournalEntries seam, the payment row is
 * queued onto the same TG, and the TG is submitted ONCE (payment + JE, or nothing) — the same
 * pattern as the order Confirm unit of work (F1.2b).
 *
 *   capture: Dr Cash (net) / Dr Fee / Cr A/R (gross, tagged with the customer)
 *   refund (negative Amount, Method Refund/Chargeback/BankReturn): the mirror image (EntryType 'Refund').
 *
 * FAILURE POLICY: unresolved accounts or a failed write BLOCK the capture (Save returns false; logged).
 *
 * CONNECTS TO:
 *   PURE:   @mj-biz-apps/orders-engine-base (buildPaymentJournalDraft)
 *   ENGINE: OrdersEngine.Base.ResolveCompanyAccount (Cash / A/R / Processing Fee) · AccountingEngine.QueueJournalEntries
 *   ENTITY: @mj-biz-apps/orders-entities (mjBizAppsOrdersPaymentEntity)
 */
import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AccountingEngine } from '@mj-biz-apps/accounting-core-entities-server';
import { buildPaymentJournalDraft, PaymentDraftError } from '@mj-biz-apps/orders-engine-base';
import { mjBizAppsOrdersPaymentEntity } from '@mj-biz-apps/orders-entities';
import { OrdersEngine } from './OrdersEngine.js';

const ROLE_CASH = 'Cash';
const ROLE_AR = 'Accounts Receivable';
const ROLE_PROCESSING_FEE = 'Processing Fee';

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payments')
export class PaymentEntityServer extends mjBizAppsOrdersPaymentEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (this.TransactionGroup) return super.Save(options); // caller owns the unit of work
    if (this.shouldBook()) return this.bookAtomically(options);
    return super.Save(options);
  }

  /** Book once, on reaching Captured, when not yet booked (JournalEntryID guard). */
  private shouldBook(): boolean {
    return this.Status === 'Captured' && !this.JournalEntryID;
  }

  private async bookAtomically(options?: EntitySaveOptions): Promise<boolean> {
    const user = this.ContextCurrentUser;
    const provider = this.ProviderToUse as unknown as IMetadataProvider;
    const draft = await this.buildDraft(user);
    if (!draft) return false; // reason logged in buildDraft
    const tg = await provider.CreateTransactionGroup();
    const q = await AccountingEngine.Instance.QueueJournalEntries({ Drafts: [draft] }, tg, user as UserInfo, provider);
    if (!q.Success || (q.Queued ?? []).length !== 1) {
      LogError(`PaymentEntityServer: payment ${this.PaymentNumber} JE booking failed: ${(q.Errors ?? []).map(e => e.Message).join('; ')}`);
      return false;
    }
    this.JournalEntryID = q.Queued![0].JournalEntryID;
    this.TransactionGroup = tg;
    if (!(await super.Save(options))) {
      LogError(`PaymentEntityServer: payment ${this.PaymentNumber} row failed to queue: ${this.LatestResult?.CompleteMessage ?? 'unknown'}`);
      return false;
    }
    if (!(await tg.Submit())) {
      LogError(`PaymentEntityServer: payment ${this.PaymentNumber} unit of work rolled back: ${this.LatestResult?.CompleteMessage ?? 'transaction group rolled back'}`);
      return false;
    }
    return true;
  }

  /** Resolve the receiving company's accounts + assemble the balanced payment draft; null on failure. */
  private async buildDraft(user: UserInfo | undefined): Promise<ReturnType<typeof buildPaymentJournalDraft> | null> {
    await OrdersEngine.Instance.Config(false, user);
    const base = OrdersEngine.Instance.Base;
    const asOf = this.PaymentDate ?? new Date();
    const cash = base.ResolveCompanyAccount(this.ReceivingCompanyID, ROLE_CASH, asOf);
    const ar = base.ResolveCompanyAccount(this.ReceivingCompanyID, ROLE_AR, asOf);
    if (!cash || !ar) {
      LogError(`PaymentEntityServer: payment ${this.PaymentNumber}: could not resolve ${!cash ? ROLE_CASH : ROLE_AR} for company ${this.ReceivingCompanyID}.`);
      return null;
    }
    let feeAccountID: string | undefined;
    if (this.ProcessingFeeAmount > 0) {
      const fee = base.ResolveCompanyAccount(this.ReceivingCompanyID, ROLE_PROCESSING_FEE, asOf);
      if (!fee) {
        LogError(`PaymentEntityServer: payment ${this.PaymentNumber} has a processing fee but no "${ROLE_PROCESSING_FEE}" account is linked for company ${this.ReceivingCompanyID}.`);
        return null;
      }
      feeAccountID = fee.GLAccountID;
    }
    try {
      return buildPaymentJournalDraft({
        Amount: this.Amount,
        ProcessingFee: this.ProcessingFeeAmount,
        CashAccountID: cash.GLAccountID,
        ArAccountID: ar.GLAccountID,
        ProcessingFeeAccountID: feeAccountID,
        CounterpartyOrganizationID: this.CustomerOrganizationID ?? undefined,
        EffectiveDate: new Date(asOf).toISOString().slice(0, 10),
        Description: `Payment ${this.PaymentNumber}`,
      });
    } catch (e) {
      const msg = e instanceof PaymentDraftError ? e.message : String(e);
      LogError(`PaymentEntityServer: payment ${this.PaymentNumber} draft assembly failed: ${msg}`);
      return null;
    }
  }
}

/** Tree-shaking anchor — imported by the server bootstrap so @RegisterClass fires. */
export function LoadBizAppsOrdersPaymentServer(): void {
  // No-op: importing this module registers PaymentEntityServer above.
}

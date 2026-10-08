import { AccountingEngineBase, isAccountingResolutionError } from '@mj-biz-apps/accounting-engine-base';

/**
 * The legal entity of a company, for the "intercompany entries will be created" hints (golive #313).
 *
 * A company whose legal entity cannot be found (a Division with no parent) reads as its own here,
 * so the hint falls back to comparing companies. The hint is advisory: capture runs the same walk on
 * the server and refuses the payment with a message naming the company. Any other error propagates.
 */
export function LegalEntityForHint(companyID: string): string {
    try {
        return AccountingEngineBase.Instance.LegalEntityFor(companyID);
    } catch (e) {
        if (isAccountingResolutionError(e) && e.Code === 'LEGAL_ENTITY_UNRESOLVED') return companyID;
        throw e;
    }
}

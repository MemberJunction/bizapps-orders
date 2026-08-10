/**
 * Output for `Orders.PriceOrder`.
 *
 * What the order comes to, per line and in total, plus WHY — the same decisions the booking path
 * makes, produced by the same code, with nothing written.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PriceOrderOutput {
    /** False when pricing could not complete; `Message` says what stopped it. */
    Success: boolean;
    Message?: string | null;

    /** Priced lines, positionally matching the input's `Lines`. */
    Lines: Array<{
        ProductID: string;
        Quantity: number;
        /** Resolved unless the caller pinned it. */
        UnitPrice: number;
        /** From promotions and manual discounts, apportioned across the order. */
        DiscountAmount: number;
        /** Non-tax charges apportioned onto this line. */
        ChargeAmount: number;
        LineTax: number;
        LineTotalNet: number;
        LineTotalGross: number;
        /**
         * How the unit price was arrived at — which list, which rule, which volume band. The same
         * decomposition `Orders.PreviewPrice` returns, so the price badge can explain itself.
         */
        Components?: Array<{ Kind: string; Label: string; Amount: number }>;
        /** Present when the line owes no tax, saying why (exempt, non-taxable, no nexus). */
        TaxExemptReason?: string | null;
    }>;

    Totals: {
        Net: number;
        Discount: number;
        Charges: number;
        Tax: number;
        Gross: number;
    };

    /**
     * Codes that resolved to nothing usable, and why — 'no such code', 'not currently running',
     * 'this customer does not qualify'.
     *
     * Silence is the wrong answer here: a customer who typed a code needs to be told it did nothing,
     * and told what would make it work. The order path already carries these; exposing them means the
     * screen can too, before the order is saved.
     */
    UnusableCodes: Array<{ Code: string; Reason: string }>;
}

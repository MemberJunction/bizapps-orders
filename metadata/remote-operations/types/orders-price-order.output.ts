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
        /**
         * The rule that produced `UnitPrice`, or null when the caller pinned the price or no rule
         * applied. This is what `OrderLine.ProductPriceID` would be stamped with.
         */
        ProductPriceID?: string | null;
        /**
         * What the rules say for this line REGARDLESS of any pinned price — the engine's default.
         *
         * A pinned line is priced at what the caller stated, so `UnitPrice` above cannot say what
         * the line would have cost on its own. The editor needs that answer while a line is
         * overridden: it is how the Default row of the picker knows what it restores, how the
         * "overridden" badge knows whether the stated price is actually a deviation, and how a
         * named rule that merely restates the default is told apart from one that changes it.
         * Null when no rule prices the product. Absent when the operation was not asked for it.
         */
        Default?: { UnitPrice: number; ProductPriceID: string | null; PriceName: string | null } | null;
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

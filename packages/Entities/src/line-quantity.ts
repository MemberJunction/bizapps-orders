/**
 * Cap a line quantity against Product.MaxQuantityPerLine.
 * NULL / missing max = no cap. Quantity is always at least 1.
 */
export function ClampLineQuantity(quantity: number, maxPerLine: number | null | undefined): number {
    const n = !Number.isFinite(quantity) || quantity <= 0 ? 1 : quantity;
    if (maxPerLine == null || maxPerLine <= 0) return n;
    return Math.min(n, maxPerLine);
}

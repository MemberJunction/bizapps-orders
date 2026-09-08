import { Metadata } from '@memberjunction/core';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';
import { FormatMoney } from './money-format';

/** List price for display: ProductPrice rows on the product (base channel), never SSP. */
export function FormatListPriceFromRows(amounts: number[]): string {
    const nums = amounts.filter((n) => Number.isFinite(n));
    if (nums.length === 0) return 'No price';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (min === max) return FormatMoney(min);
    return `From ${FormatMoney(min)}`;
}

export async function LoadProductListPriceLabel(productId: string | null | undefined): Promise<string> {
    if (!productId) return 'No price';
    const md = new Metadata();
    await LoadOrdersEngine(Metadata.Provider, md.CurrentUser);
    const amounts = OrdersEngine.Instance.BaseProductPrices(productId).map((p) => Number(p.Amount));
    return FormatListPriceFromRows(amounts);
}

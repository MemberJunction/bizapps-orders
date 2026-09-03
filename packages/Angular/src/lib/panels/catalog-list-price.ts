import { RunView } from '@memberjunction/core';
import { FormatMoney } from './money-format';

const PRODUCT_PRICES = 'MJ_BizApps_Orders: Product Prices';

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
    const rv = new RunView();
    const res = await rv.RunView<{ Amount: number }>({
        EntityName: PRODUCT_PRICES,
        ExtraFilter: `ProductID = '${productId.replace(/'/g, "''")}' AND PriceListID IS NULL AND Status = 'Active'`,
        Fields: ['Amount'],
        ResultType: 'simple',
        MaxRows: 50,
    });
    const amounts = (res.Success && res.Results ? res.Results : []).map((r) => Number(r.Amount));
    return FormatListPriceFromRows(amounts);
}

import { describe, expect, it } from 'vitest';
import { MJO_ORDER_HEADER_GRID_STATE } from '../lib/data/orders-grid-state';

/**
 * The grid falls back to a field-name heuristic (`amount`/`price`/`cost`/`total`) when a column
 * carries no format of its own, which formats `TotalGross` as currency and leaves `Balance` a raw
 * number. Every money column here must therefore declare its currency format explicitly.
 */
describe('MJO_ORDER_HEADER_GRID_STATE', () => {
    const moneyColumns = ['TotalGross', 'Balance'];

    it.each(moneyColumns)('formats %s as currency', (name) => {
        const column = MJO_ORDER_HEADER_GRID_STATE.columnSettings?.find((c) => c.Name === name);
        expect(column, `${name} column missing from the shared grid state`).toBeDefined();
        expect(column?.format?.type).toBe('currency');
        expect(column?.format?.currencyCode).toBe('USD');
        expect(column?.format?.decimals).toBe(2);
    });
});

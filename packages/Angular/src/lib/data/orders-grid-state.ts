import { type ViewGridState } from '@memberjunction/ng-entity-viewer';

/**
 * Column state for the Order Headers grids the app hosts directly (All Orders, the dashboard's
 * Active Orders / Orders Explorer / Overdue Collections panes).
 *
 * The grid only renders a money column as currency when the column carries an explicit
 * `format: { type: 'currency' }` or its field name happens to match the core name heuristic
 * (`amount` / `price` / `cost` / `total`). `TotalGross` matches that heuristic and `Balance`
 * does not, so a grid with no column state of its own showed Total as currency and Balance as a
 * raw number. Declaring the state here formats every money column the same way, regardless of
 * field name.
 *
 * Mirrors the shared "Orders: Working" saved view in `metadata/user-views`; keep the two in step.
 */
export const MJO_ORDER_HEADER_GRID_STATE: ViewGridState = {
    sortSettings: [{ field: 'OrderDate', dir: 'desc' }],
    columnSettings: [
        { Name: 'OrderNumber', DisplayName: 'Number', orderIndex: 0, width: 130, pinned: 'left' },
        { Name: 'Status', DisplayName: 'Status', orderIndex: 1, width: 110 },
        { Name: 'BillToOrganization', DisplayName: 'Bill to', orderIndex: 2, width: 200 },
        { Name: 'OrderDate', DisplayName: 'Ordered', orderIndex: 3, width: 120, format: { type: 'date', dateFormat: 'medium' } },
        { Name: 'DueDate', DisplayName: 'Due', orderIndex: 4, width: 120, format: { type: 'date', dateFormat: 'medium' } },
        {
            Name: 'TotalGross',
            DisplayName: 'Total',
            orderIndex: 5,
            width: 120,
            format: { type: 'currency', currencyCode: 'USD', decimals: 2, align: 'right' },
        },
        {
            Name: 'Balance',
            DisplayName: 'Balance',
            orderIndex: 6,
            width: 120,
            format: {
                type: 'currency',
                currencyCode: 'USD',
                decimals: 2,
                align: 'right',
                conditionalRules: [{ condition: 'greaterThan', value: 0, style: { color: '#b45309', bold: true } }],
            },
        },
        { Name: 'Company', DisplayName: 'Company', orderIndex: 7, width: 140 },
    ],
};

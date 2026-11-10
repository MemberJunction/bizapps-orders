/**
 * Percentage of Completion lines confirm without service dates (bc-aidp-next-golive#455).
 *
 * POC recognises by cumulative catch-up as progress is attested (`Orders.RecordProgress`); nothing on
 * that path reads the line's dates. The type was seeded with `RequiresServicePeriod = 1`, so an
 * undated POC line counted as a "Line" service-period source and confirm refused it. The seed now
 * says 0. This test reads the shipped metadata row, so a revert of the seed fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OrdersEngine } from '../pricing/OrdersEngine.js';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';

type Row = Record<string, unknown>;

const SEED_PATH = '../../../../metadata/revenue-recognition-types/.revenue-recognition-types.json';
const seedRows = JSON.parse(readFileSync(fileURLToPath(new URL(SEED_PATH, import.meta.url)), 'utf8')) as {
    fields: Row;
    primaryKey: { ID: string };
}[];

/** The shipped POC row, as the engine would load it (bit columns arrive as booleans). */
function shippedRevRec(code: string): Row {
    const row = seedRows.find((r) => r.fields['Code'] === code);
    if (!row) throw new Error(`metadata has no revenue recognition type ${code}`);
    return {
        ID: row.primaryKey.ID,
        Code: row.fields['Code'],
        ScheduleBasis: row.fields['ScheduleBasis'],
        RequiresServicePeriod: row.fields['RequiresServicePeriod'] === 1,
    };
}

const POC = shippedRevRec('PercentComplete');
const BACK_END = shippedRevRec('AllBackEnd');

function seed(data: { products?: Row[]; types?: Row[]; revRec?: Row[] }): void {
    const engine = OrdersEngine.Instance as unknown as Record<string, unknown>;
    engine._products = data.products ?? [];
    engine._productTypes = data.types ?? [];
    engine._revenueRecognitionTypes = data.revRec ?? [];
    engine._eventProducts = [];
}

beforeEach(() =>
    seed({
        revRec: [POC, BACK_END],
        types: [{ ID: 't-service', Code: 'Service', ProductExtensionEntity: null }],
        products: [
            { ID: 'p-poc', ProductTypeID: 't-service', RevenueRecognitionTypeID: POC.ID },
            { ID: 'p-backend', ProductTypeID: 't-service', RevenueRecognitionTypeID: BACK_END.ID },
        ],
    }),
);
afterEach(() => seed({}));

/** Just enough of an order for `ConfirmEligibility` (same stand-in as service-period.test.ts). */
function order(lines: Row[]): OrderHeaderEntity {
    const stub = {
        IsSaved: true,
        Status: 'Draft',
        Origin: 'Direct',
        BillToPersonID: 'person-1',
        BillToOrganizationID: null,
        Lines: { Items: lines, Count: lines.length, IsLoaded: true },
        GetFieldByName: () => ({ OldValue: 'Draft' }),
    };
    Object.setPrototypeOf(stub, OrderHeaderEntity.prototype);
    return stub as unknown as OrderHeaderEntity;
}

const undated = (n: number, productID: string): Row => ({
    LineNumber: n,
    ProductID: productID,
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
});

describe('Percentage of Completion service dates are optional (golive#455)', () => {
    it('the shipped POC row does not require a service period', () => {
        expect(POC.ScheduleBasis).toBe('OnMeasurement');
        expect(POC.RequiresServicePeriod).toBe(false);
    });

    it('an undated POC line is not a "Line" service-period source', () => {
        expect(OrdersEngine.Instance.ServicePeriodSource('p-poc')).toBe('NotRequired');
        expect(OrdersEngine.Instance.IsProgressMeasured('p-poc')).toBe(true);
    });

    it('confirm does not refuse an undated POC line', () => {
        const o = order([undated(1, 'p-poc')]);
        expect(o.LinesMissingServicePeriod()).toEqual([]);
        expect(o.ConfirmEligibility().Allowed).toBe(true);
    });

    it('still refuses an undated date-driven line', () => {
        expect(OrdersEngine.Instance.IsProgressMeasured('p-backend')).toBe(false);
        const verdict = order([undated(1, 'p-poc'), undated(2, 'p-backend')]).ConfirmEligibility();
        expect(verdict.Allowed).toBe(false);
        expect(verdict.Reason).toContain('Line 2');
    });
});

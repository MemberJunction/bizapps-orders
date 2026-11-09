/**
 * The order's concession total, which the share check measures, counts only concessions still standing:
 * a Rejected or Withdrawn one gives nothing away (golive #403).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { OrderConcessionTotal } from '../ConcessionGate.js';

const ORDER_ID = '0b9a6c2e-4f3d-4a1b-9c8e-7d6f5e4a3b2c';
const USER = { ID: 'user-1' } as UserInfo;
const PROVIDER = {} as IMetadataProvider;

function row(Status: string, ComputedValue: number) {
    return { Status, ComputedValue, DeliveryForm: 'Price', ReasonCategory: 'Retention', OrderLineID: 'line-1', AuthorizedBySalesAuthorityID: null, SalesRuleID: null };
}

afterEach(() => vi.restoreAllMocks());

describe('OrderConcessionTotal', () => {
    it('adds Pending and Approved concessions and leaves out Rejected and Withdrawn ones', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [row('Pending', 300), row('Approved', 200), row('Rejected', 1000), row('Withdrawn', 150)],
        } as Awaited<ReturnType<RunView['RunView']>>);

        expect(await OrderConcessionTotal(ORDER_ID, PROVIDER, USER)).toBe(500);
    });
});

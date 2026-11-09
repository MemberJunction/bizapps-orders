import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { OrderPricingService } from '@mj-biz-apps/orders-entities';
import { PriceOrderOperation } from '../PriceOrderOperation.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ADDRESS_ID = '44444444-4444-4444-8444-444444444444';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            public async GetEntityObject() {
                const state: Record<string, unknown> = {
                    ProductID: '',
                    Quantity: 0,
                    UnitPrice: 100,
                    DiscountPct: 0,
                    DiscountAmount: 0,
                    ChargeAmount: 0,
                    LineTax: 0,
                    ExtendedAmount: null,
                    RenewsSubscriptionID: null,
                    ShipToAddressID: null,
                    ServicePeriodStart: null,
                    ServicePeriodEnd: null,
                    NewRecord: () => undefined,
                };
                return state;
            }
        },
    };
});

describe('PriceOrderOperation', () => {
    it('forwards RenewsSubscriptionID and per-line ShipToAddressID onto the materialised OrderLine entities', async () => {
        const priceSpy = vi.spyOn(OrderPricingService.prototype, 'Price').mockImplementation(async (input) => {
            for (const line of input.Lines) {
                line.UnitPrice = 120;
                line.LineTax = 9.6;
            }
            return {
                PriceComponents: new Map(),
                EngineDefaults: new Map(),
                Promotions: { Applications: [], UnusableCodes: [] },
                Charges: { Charges: [], ByLine: new Map() },
                TaxReasons: new Map(),
                UnusableCodes: [],
            };
        });

        const op = new PriceOrderOperation();
        const output = await (op as unknown as {
            InternalExecute: PriceOrderOperation['InternalExecute'];
        }).InternalExecute(
            {
                CompanyID: COMPANY_ID,
                Lines: [
                    {
                        ProductID: PRODUCT_ID,
                        Quantity: 2,
                        RenewsSubscriptionID: SUBSCRIPTION_ID,
                        ShipToAddressID: LINE_ADDRESS_ID,
                    },
                ],
            },
            {} as IMetadataProvider,
            { ID: 'user-1' } as UserInfo,
        );

        expect(output.Success).toBe(true);
        expect(priceSpy).toHaveBeenCalledOnce();
        const pricedLines = priceSpy.mock.calls[0][0].Lines;
        expect(pricedLines).toHaveLength(1);
        expect(pricedLines[0].RenewsSubscriptionID).toBe(SUBSCRIPTION_ID);
        expect(pricedLines[0].ShipToAddressID).toBe(LINE_ADDRESS_ID);
        priceSpy.mockRestore();
    });

    it('rejects a malformed RenewsSubscriptionID or per-line ShipToAddressID at the boundary', async () => {
        const op = new PriceOrderOperation();
        await expect(
            (op as unknown as { InternalExecute: PriceOrderOperation['InternalExecute'] }).InternalExecute(
                {
                    CompanyID: COMPANY_ID,
                    Lines: [
                        {
                            ProductID: PRODUCT_ID,
                            Quantity: 1,
                            RenewsSubscriptionID: 'not-a-uuid',
                        },
                    ],
                },
                {} as IMetadataProvider,
                { ID: 'user-1' } as UserInfo,
            ),
        ).rejects.toThrow(/RenewsSubscriptionID/);

        await expect(
            (op as unknown as { InternalExecute: PriceOrderOperation['InternalExecute'] }).InternalExecute(
                {
                    CompanyID: COMPANY_ID,
                    Lines: [
                        {
                            ProductID: PRODUCT_ID,
                            Quantity: 1,
                            ShipToAddressID: 'not-a-uuid',
                        },
                    ],
                },
                {} as IMetadataProvider,
                { ID: 'user-1' } as UserInfo,
            ),
        ).rejects.toThrow(/ShipToAddressID/);
    });
});

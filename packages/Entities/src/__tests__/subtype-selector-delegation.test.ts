import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersEventProductEntity } from '../generated/entity_subclasses.js';
import { OrderHeaderEntity } from '../OrderHeaderEntity.js';
import { OrderLineExtensionCompanion } from '../OrderLineExtensionCompanion.js';
import { OrdersEngine } from '../pricing/OrdersEngine.js';

const EVENT_PRODUCT_ID = 'aaaaaaaa-0000-0000-0000-000000000011';
const EVENT_ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Event Order Lines';

afterEach(() => vi.restoreAllMocks());

describe('SubtypeSelector delegation across Orders entities', () => {
    it('OrderHeaderEntity.SplitLineIntoSeats sets seat.ProductID before zero-arg EnsureISAChild() without manual ProductType lookup', async () => {
        vi.spyOn(OrdersEngine.Instance, 'EventProductByID').mockImplementation((id) =>
            id === EVENT_PRODUCT_ID
                ? ({ RequiresAttendeeInfo: true } as mjBizAppsOrdersEventProductEntity)
                : undefined,
        );
        const productByIdSpy = vi.spyOn(OrdersEngine.Instance, 'ProductByID');
        const productTypeByIdSpy = vi.spyOn(OrdersEngine.Instance, 'ProductTypeByID');

        type CreatedSeat = {
            ProductID: string | null;
            Quantity: number;
            productIdAtEnsureCall: string | null;
            EnsureISAChild: ReturnType<typeof vi.fn>;
        };
        const createdSeats: CreatedSeat[] = [];

        const fakeOrder = Object.create(OrderHeaderEntity.prototype) as OrderHeaderEntity;
        Object.defineProperty(fakeOrder, 'Lines', {
            value: {
                Create: vi.fn(async () => {
                    const seat: CreatedSeat = {
                        ProductID: null,
                        Quantity: 0,
                        productIdAtEnsureCall: null,
                        EnsureISAChild: vi.fn(async () => {
                            seat.productIdAtEnsureCall = seat.ProductID;
                            return null;
                        }),
                    };
                    createdSeats.push(seat);
                    return seat as unknown as OrderHeaderEntity['Lines']['Items'][number];
                }),
            },
        });

        const sourceLine = {
            ProductID: EVENT_PRODUCT_ID,
            CompanyID: 'company-1',
            Description: 'Summit ticket',
            ProductPriceID: 'price-1',
            UnitPrice: 250,
            PriceOverridden: false,
            PriceOverrideReason: null,
            DimensionID: null,
            DimensionValueID: null,
            ShipToAddressID: null,
            ShipToOrganizationID: null,
            ShipToPersonID: null,
            ShipToAddressSnapshot: null,
            ServicePeriodStart: null,
            ServicePeriodEnd: null,
            Quantity: 3,
            ReversesOrderLineID: null,
            ParentOrderLineID: null,
        } as unknown as OrderHeaderEntity['Lines']['Items'][number];

        const added = await fakeOrder.SplitLineIntoSeats(sourceLine);

        expect(added).toHaveLength(2);
        expect(sourceLine.Quantity).toBe(1);
        for (const seat of createdSeats) {
            expect(seat.productIdAtEnsureCall).toBe(EVENT_PRODUCT_ID);
            expect(seat.EnsureISAChild).toHaveBeenCalledTimes(1);
            expect(seat.EnsureISAChild).toHaveBeenCalledWith();
        }
        expect(productByIdSpy).not.toHaveBeenCalled();
        expect(productTypeByIdSpy).not.toHaveBeenCalled();
    });

    it('OrderLineExtensionCompanion.EnsureEntity() with zero arguments delegates to Owner.EnsureISAChild() and flushes staged wire fields', async () => {
        const setMany = vi.fn();
        const fakeChild = {
            EntityInfo: { Name: EVENT_ORDER_LINE_ENTITY } as EntityInfo,
            IsSaved: false,
            Dirty: true,
            SetMany: setMany,
        } as unknown as BaseEntity;

        const ensureISAChild = vi.fn(async () => fakeChild);
        const owner = {
            ISAChild: null as BaseEntity | null,
            EnsureISAChild: ensureISAChild,
            ProviderToUse: null,
            ContextCurrentUser: undefined,
            FirstPrimaryKey: { Value: 'line-1' },
        } as unknown as BaseEntity;

        const companion = new OrderLineExtensionCompanion(owner);
        await companion.Deserialize(
            {
                EntityName: EVENT_ORDER_LINE_ENTITY,
                Fields: { Comments: 'Wheelchair aisle' },
                IsNew: true,
            },
            'request',
        );

        // Also verify a fresh companion with NO prior EntityName delegates zero-arg EnsureEntity() to Owner.EnsureISAChild(undefined)
        const freshCompanion = new OrderLineExtensionCompanion(owner);
        const resolved = await freshCompanion.EnsureEntity();

        expect(ensureISAChild).toHaveBeenCalledWith(undefined);
        expect(resolved).toBe(fakeChild);
        expect(freshCompanion.EntityName).toBe(EVENT_ORDER_LINE_ENTITY);

        // And staged wire data flushes into the ensured child
        const hydrated = await companion.EnsureEntity();
        expect(hydrated).toBe(fakeChild);
        expect(setMany).toHaveBeenCalledWith({ Comments: 'Wheelchair aisle' }, true);
    });
});

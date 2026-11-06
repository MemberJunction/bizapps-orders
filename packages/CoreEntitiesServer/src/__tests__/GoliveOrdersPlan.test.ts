import { describe, expect, it } from 'vitest';
import { ValidationResult, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    ORDER_HEADER_MONEY_FIELDS,
    ORDER_LINE_MONEY_FIELDS,
    IsLineOnUndecidedBand,
    IsProductReplacedWithoutPriceEdit,
    MarkLinePriceStated,
    StatedLineUnitPrice,
    LoadAccessOverrideAssignees,
    type mjBizAppsOrdersOrderLineEntity,
} from '../../../Entities/src/index.js';
import { OrderLineEntityServer } from '../OrderLineEntityServer.js';
import { OrderEntityServer } from '../OrderEntityServer.js';
import { OrdersSettings, ORDERS_SETTING } from '../OrdersSettings.js';
import { PreviewPriceOperation } from '../PreviewPriceOperation.js';
import { SpawnRenewalsOperation } from '../SpawnRenewalsOperation.js';
import { DetectOverlappingSubscriptionsOperation } from '../DetectOverlappingSubscriptionsOperation.js';
import { ReconcilePaymentProviderChargesOperation } from '../ReconcilePaymentProviderChargesOperation.js';
import { MergeDerivedTags, MergeLineDimensions } from '../LineDimensionMerge.js';
import { SubscriptionViewParams } from '../../../Angular/src/lib/data/orders-queries.js';

const USER = { ID: '11111111-2222-4333-8444-555555555555', Name: 'Test User' } as unknown as UserInfo;

describe('Group 01 — Order booking & line money guards', () => {
    it('includes ServicePeriodStart and ServicePeriodEnd in ORDER_LINE_MONEY_FIELDS and ConfirmedByUserID in ORDER_HEADER_MONEY_FIELDS (#975, #915)', () => {
        expect(ORDER_LINE_MONEY_FIELDS).toContain('ServicePeriodStart');
        expect(ORDER_LINE_MONEY_FIELDS).toContain('ServicePeriodEnd');
        expect(ORDER_HEADER_MONEY_FIELDS).toContain('ConfirmedByUserID');
    });

    it('refuses money edits on a saved $0 line without JournalEntryID when parent order is Confirmed (#916)', async () => {
        const line = Object.create(OrderLineEntityServer.prototype) as {
            storedOrderStatus: () => Promise<string | null>;
            refuseMoneyEditOnBookedOrder: (r: ValidationResult) => Promise<void>;
        };
        Object.defineProperty(line, 'IsSaved', { value: true, configurable: true });
        Object.defineProperty(line, 'BypassBookedCheck', { value: false, configurable: true });
        Object.defineProperty(line, 'BypassExternalEditVeto', { value: false, configurable: true });
        Object.defineProperty(line, 'Fields', {
            value: [
                { Name: 'OrderHeaderID', Value: 'aaaaaaaa-2222-4333-8444-555555555555', Dirty: false },
                { Name: 'JournalEntryID', Value: null, Dirty: false },
                { Name: 'Quantity', Value: 2, Dirty: true },
            ],
            configurable: true,
        });
        line.storedOrderStatus = async () => 'Confirmed';

        const result = new ValidationResult();
        await line.refuseMoneyEditOnBookedOrder(result);

        expect(result.Success).toBe(false);
        expect(result.Errors[0]?.Message).toContain('This line is booked');
        expect(result.Errors[0]?.Message).toContain('Quantity');
    });
});

describe('Group 02 — Pricing & Operation UUID guards', () => {
    it('IsLineOnUndecidedBand identifies a line on an undecided revenue band (#960)', () => {
        const priceID = '11111111-1111-4111-8111-111111111111';
        const fakeLine = {
            ProductPriceID: priceID,
            UnitPrice: 500,
        };
        expect(
            IsLineOnUndecidedBand(fakeLine, null, [
                {
                    ID: priceID,
                    Name: 'Tier 1',
                    UnitPrice: 500,
                    ExtendedAmount: 500,
                    PriceListID: null,
                    InheritedFrom: 'product',
                    InheritedFromCategoryID: null,
                    BandUndecided: true,
                },
            ]),
        ).toBe(true);
    });

    it('MarkLinePriceStated preserves a $0 renewal line price and IsProductReplacedWithoutPriceEdit resets a replaced product (#960, #907)', () => {
        const zeroLine = {
            IsSaved: false,
            UnitPrice: 0,
            GetFieldByName: () => ({ Dirty: false }),
        } as unknown as mjBizAppsOrdersOrderLineEntity;
        expect(StatedLineUnitPrice(zeroLine)).toBeNull();
        MarkLinePriceStated(zeroLine);
        expect(StatedLineUnitPrice(zeroLine)).toBe(0);

        const replacedLine = {
            IsSaved: true,
            UnitPrice: 250,
            GetFieldByName: (name: string) => ({ Dirty: name === 'ProductID' }),
        } as unknown as mjBizAppsOrdersOrderLineEntity;
        expect(IsProductReplacedWithoutPriceEdit(replacedLine)).toBe(true);
        expect(StatedLineUnitPrice(replacedLine)).toBeNull();
    });

    it('PreviewPriceOperation rejects non-UUID ProductID (#823)', async () => {
        const op = new PreviewPriceOperation() as unknown as {
            InternalExecute: (i: unknown, p: IMetadataProvider, u: UserInfo) => Promise<unknown>;
        };
        await expect(
            op.InternalExecute({ ProductID: 'not-a-uuid' }, {} as IMetadataProvider, USER),
        ).rejects.toThrow(/ProductID/);
    });

    it('SpawnRenewalsOperation rejects non-UUID SubscriptionID (#823)', async () => {
        const op = new SpawnRenewalsOperation() as unknown as {
            InternalExecute: (i: unknown, p: IMetadataProvider, u: UserInfo) => Promise<unknown>;
        };
        await expect(
            op.InternalExecute({ SubscriptionID: 'bad-subscription-id' }, {} as IMetadataProvider, USER),
        ).rejects.toThrow(/SubscriptionID/);
    });

    it('DetectOverlappingSubscriptionsOperation.loadConfirmers rejects non-UUID LaterOrderHeaderID (#823)', async () => {
        const op = new DetectOverlappingSubscriptionsOperation() as unknown as {
            loadConfirmers: (pairs: Array<{ LaterOrderHeaderID: string | null }>, p: IMetadataProvider, u: UserInfo) => Promise<unknown>;
        };
        await expect(
            op.loadConfirmers(
                [{ LaterOrderHeaderID: 'bad-order-id' }],
                {} as IMetadataProvider,
                USER,
            ),
        ).rejects.toThrow(/LaterOrderHeaderID/);
    });

    it('ReconcilePaymentProviderChargesOperation rejects non-UUID PaymentProviderID (#823)', async () => {
        const op = new ReconcilePaymentProviderChargesOperation() as unknown as {
            InternalExecute: (i: unknown, p: IMetadataProvider, u: UserInfo) => Promise<unknown>;
        };
        await expect(
            op.InternalExecute(
                { PaymentProviderID: 'bad-provider-id' },
                {} as IMetadataProvider,
                USER,
            ),
        ).rejects.toThrow(/PaymentProviderID/);
    });
});

describe('Group 03 — LoadAccessOverrideAssignees person-to-user link (#914)', () => {
    it('resolves a person assignee via User.LinkedEntityRecordID when Person.LinkedUserID is null', async () => {
        const taskID = '11111111-1111-4111-8111-111111111111';
        const personEntityID = '22222222-2222-4222-8222-222222222222';
        const userEntityID = '33333333-3333-4333-8333-333333333333';
        const personID = '44444444-4444-4444-8444-444444444444';
        const linkedUserID = '55555555-5555-4555-8555-555555555555';

        const provider = {
            Entities: [{ ID: personEntityID, Name: 'MJ_BizApps_Common: People', ParentChain: [] }],
            EntityByName: (name: string) => {
                if (name === 'MJ_BizApps_Common: People') return { ID: personEntityID };
                if (name === 'MJ: Users') return { ID: userEntityID };
                return undefined;
            },
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ_BizApps_Tasks: Task Assignments') {
                    return {
                        Success: true,
                        Results: [{ TaskID: taskID, AssigneeEntityID: personEntityID, AssigneeRecordID: personID }],
                    };
                }
                if (params.EntityName === 'MJ_BizApps_Common: People') {
                    return {
                        Success: true,
                        Results: [{ ID: personID, LinkedUserID: null, DisplayName: 'Approver Person', FirstName: null, LastName: null }],
                    };
                }
                if (params.EntityName === 'MJ: Users') {
                    return {
                        Success: true,
                        Results: [{ ID: linkedUserID, LinkedEntityRecordID: personID }],
                    };
                }
                return { Success: true, Results: [] };
            },
        } as unknown as IMetadataProvider;

        const map = await LoadAccessOverrideAssignees([taskID], provider, USER);
        expect(map.get(taskID)).toEqual([{ UserID: linkedUserID, Name: 'Approver Person' }]);
    });
});

describe('Group 04 — Bill.com application settings (#741, #970, #755)', () => {
    it('defaults BillComCreateCustomerOnSend to true and BillComInvoiceReadyNotifyRole to null', () => {
        OrdersSettings.ClearOverrides();
        expect(OrdersSettings.BillComCreateCustomerOnSend).toBe(true);
        expect(OrdersSettings.BillComInvoiceReadyNotifyRole).toBeNull();

        OrdersSettings.SetOverride(ORDERS_SETTING.BillComCreateCustomerOnSend, 'false');
        OrdersSettings.SetOverride(ORDERS_SETTING.BillComInvoiceReadyNotifyRole, 'Finance Manager');
        try {
            expect(OrdersSettings.BillComCreateCustomerOnSend).toBe(false);
            expect(OrdersSettings.BillComInvoiceReadyNotifyRole).toBe('Finance Manager');
        } finally {
            OrdersSettings.ClearOverrides();
        }
    });
});

describe('Group 05 — Subscription placement & Order Subscriptions tab (#384)', () => {
    it('findExistingSubscription excludes non-gateway Canceled and Migrated subscriptions while preserving gateway-billed Canceled (#384)', async () => {
        const capturedFilters: string[] = [];
        const order = Object.create(OrderEntityServer.prototype) as {
            findExistingSubscription: (
                productID: string,
                match: { OrganizationID: string | null; PersonID: string | null },
            ) => Promise<unknown>;
        };
        Object.defineProperty(order, 'ContextCurrentUser', { value: USER, configurable: true });
        Object.defineProperty(order, 'ProviderToUse', {
            value: {
                RunView: async (params: { ExtraFilter?: string }) => {
                    if (params.ExtraFilter) capturedFilters.push(params.ExtraFilter);
                    return { Success: true, Results: [] };
                },
            } as unknown as IMetadataProvider,
            configurable: true,
        });

        await order.findExistingSubscription('aaaaaaaa-1111-4222-8333-444444444444', {
            OrganizationID: 'bbbbbbbb-1111-4222-8333-444444444444',
            PersonID: null,
        });

        expect(capturedFilters).toHaveLength(1);
        expect(capturedFilters[0]).toContain("Status <> 'Migrated'");
        expect(capturedFilters[0]).toContain("(Status <> 'Canceled' OR ProviderSubscriptionID IS NOT NULL)");
    });

    it('SubscriptionViewParams includes subscriptions whose terms reference the order lines (#384)', () => {
        const lineID = 'cccccccc-1111-4222-8333-444444444444';
        const params = SubscriptionViewParams([lineID]);
        expect(params).not.toBeNull();
        expect(params?.ExtraFilter).toContain(`OrderLineID IN ('${lineID}')`);
        expect(params?.ExtraFilter).toContain(
            `OR ID IN (SELECT SubscriptionID FROM [__mj_BizAppsOrders].[vwSubscriptionTerms] WHERE OrderLineID IN ('${lineID}'))`,
        );
    });
});

describe('Group 06 — Payment allocation line dimension merging (#383)', () => {
    it('merges OrderLine.DimensionID/DimensionValueID, OrderLineDimension rows, and default dimensions without duplicating axes (#383)', () => {
        const ventureDim = '11111111-aaaa-4bbb-8ccc-111111111111';
        const ventureVal = '22222222-aaaa-4bbb-8ccc-222222222222';
        const productDim = '33333333-aaaa-4bbb-8ccc-333333333333';
        const productValDefault = '44444444-aaaa-4bbb-8ccc-444444444444';
        const productValStored = '55555555-aaaa-4bbb-8ccc-555555555555';

        const defaultDims = [
            { DimensionID: ventureDim, DimensionValueID: ventureVal },
            { DimensionID: productDim, DimensionValueID: productValDefault },
        ];
        const storedDims = [{ DimensionID: productDim, DimensionValueID: productValStored }];

        const merged = MergeLineDimensions(
            { DimensionID: ventureDim, DimensionValueID: ventureVal },
            MergeDerivedTags(defaultDims, storedDims),
        );

        expect(merged).toEqual([
            { DimensionID: productDim, DimensionValueID: productValStored },
            { DimensionID: ventureDim, DimensionValueID: ventureVal },
        ]);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationResult, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    ORDER_HEADER_MONEY_FIELDS,
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

const USER = { ID: '11111111-2222-4333-8444-555555555555', Name: 'Test User' } as unknown as UserInfo;

describe('Group 01 — Order booking & line money guards', () => {
    it('includes ConfirmedByUserID in ORDER_HEADER_MONEY_FIELDS (#915)', () => {
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

describe('Group 05 — the guards are wired into Validate and Save', () => {
    afterEach(() => vi.restoreAllMocks());

    /** What the shared entity's own checks answer here: nothing wrong. */
    const passing = (): ValidationResult => Object.assign(new ValidationResult(), { Success: true });

    /** A saved line on a Confirmed order with no journal entry, Quantity dirty; every other guard stubbed. */
    function zeroLine(flags: { BypassBookedCheck?: boolean; BypassExternalEditVeto?: boolean } = {}) {
        const line = Object.create(OrderLineEntityServer.prototype) as Record<string, unknown> & {
            ValidateAsync: () => Promise<ValidationResult>;
        };
        const define = (name: string, value: unknown) => Object.defineProperty(line, name, { value, configurable: true, writable: true });
        define('IsSaved', true);
        define('Quantity', 2);
        define('ReversesOrderLineID', null);
        define('DimensionID', null);
        define('DimensionValueID', null);
        define('BypassBookedCheck', flags.BypassBookedCheck ?? false);
        define('BypassExternalEditVeto', flags.BypassExternalEditVeto ?? false);
        define('Fields', [
            { Name: 'OrderHeaderID', Value: 'aaaaaaaa-2222-4333-8444-555555555555', Dirty: false },
            { Name: 'JournalEntryID', Value: null, Dirty: false },
            { Name: 'Quantity', Value: 2, Dirty: true },
        ]);
        for (const guard of ['refuseUnexplainedOverride', 'refuseParentNotFromExpansion', 'refuseNewLineOnBookedOrder', 'refuseVetoedEdit']) {
            define(guard, () => undefined);
        }
        define('storedOrderStatus', async () => 'Confirmed');
        // The shared entity's own checks pass; what is under test is this class's ValidateAsync.
        vi.spyOn(Object.getPrototypeOf(OrderLineEntityServer.prototype), 'ValidateAsync').mockImplementation(async () => passing());
        return line;
    }

    it('a standalone save of a $0 booked line is refused through ValidateAsync (#916)', async () => {
        const result = await zeroLine().ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Message).join(' ')).toContain('This line is booked');
    });

    it("Orders' own-write flag does not switch the $0-line guard off; only the booking graph save does", async () => {
        expect((await zeroLine({ BypassExternalEditVeto: true }).ValidateAsync()).Success).toBe(false);
        const graph = await zeroLine({ BypassBookedCheck: true }).ValidateAsync();
        expect(graph.Errors.map((e) => e.Message)).toEqual([]);
        expect(graph.Success).toBe(true);
    });

    it('a caller-set ConfirmedAt is refused through the header Validate (#915)', () => {
        const order = Object.create(OrderEntityServer.prototype) as Record<string, unknown> & { Validate: () => ValidationResult };
        const define = (name: string, value: unknown) => Object.defineProperty(order, name, { value, configurable: true, writable: true });
        define('InitialPaymentDetailID_Object', null);
        define('confirmationStamped', false);
        define('MoneyLocked', false);
        define('FieldIsDirty', (name: string) => name === 'ConfirmedAt');
        define('GetFieldByName', () => ({ Value: new Date() }));
        for (const guard of ['dropSavePopulatedFieldErrors', 'refuseBookedMoneyEdits', 'refuseBookedAddressEdits', 'refuseBookedPaymentTermsEdit']) {
            define(guard, () => undefined);
        }
        define('statusTransitionVerdict', () => ({ Allowed: true }));
        define('willBookOnThisSave', () => false);
        // Walk up to the generated class and let its own field checks pass.
        let generated = Object.getPrototypeOf(OrderEntityServer.prototype);
        while (generated && !Object.prototype.hasOwnProperty.call(generated, 'refuseCallerConfirmationStamp')) generated = Object.getPrototypeOf(generated);
        vi.spyOn(Object.getPrototypeOf(generated), 'Validate').mockImplementation(() => passing());

        const result = order.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Message).join(' ')).toContain('ConfirmedAt is stamped by the server');
    });

    it('a failed booking save puts the confirmation stamp back through Save (#969)', async () => {
        const order = Object.create(OrderEntityServer.prototype) as Record<string, unknown> & { Save: () => Promise<boolean> };
        const define = (name: string, value: unknown) => Object.defineProperty(order, name, { value, configurable: true, writable: true });
        // Every gate ahead of the transaction passes; the booking then fails as the transaction opens.
        for (const gate of ['passesStatusTransition', 'passesOriginGuard', 'passesConfirmationStampGuard', 'passesCleanupRight']) {
            define(gate, () => true);
        }
        for (const gate of ['passesOrderReviewOnChange', 'passesConcessionGate', 'passesNoDealConfirmGate', 'passesOrderReviewGate']) {
            define(gate, async () => true);
        }
        for (const step of ['ApplySavePartyDefaults', 'loadPersistedRenewalMarks', 'resolveDueDate', 'refuseUnansweredHeldLines']) define(step, async () => undefined);
        define('willBookOnThisSave', () => true);
        define('IsSaved', true);
        define('Lines', { IsLoaded: true });
        define('OrderNumber', 'ORD-TEST');
        define('Fields', []);
        define('ProviderToUse', {
            BeginTransaction: async () => {
                throw new Error('booking failed');
            },
            RollbackTransaction: async () => undefined,
        });
        define('RegisterResultHistoryEntry', () => undefined);
        const prior = [{ Name: 'ConfirmedAt', Value: null, OldValue: null }];
        define('captureConfirmationStamp', () => prior);
        const restore = vi.fn();
        define('restoreConfirmationStamp', restore);

        expect(await order.Save()).toBe(false);
        expect(restore).toHaveBeenCalledWith(prior);
    });

    it('a line saved as the parent leg of an IS-A leaf save does not save its extension again', async () => {
        const line = Object.create(OrderLineEntityServer.prototype) as { Save: (o?: unknown) => Promise<boolean>; persistExtension: () => Promise<void>; PrepareForSave: () => Promise<void> };
        line.PrepareForSave = async () => undefined;
        const persist = vi.fn(async () => undefined);
        line.persistExtension = persist;
        vi.spyOn(Object.getPrototypeOf(OrderLineEntityServer.prototype), 'Save').mockResolvedValue(true);

        await line.Save({ IsParentEntitySave: true });
        expect(persist).not.toHaveBeenCalled();
        await line.Save({});
        expect(persist).toHaveBeenCalledTimes(1);
    });

    it('an IS-A extension whose parent is this line is not re-loaded from itself', async () => {
        const line = Object.create(OrderLineEntityServer.prototype) as Record<string, unknown> & { persistExtension: () => Promise<void> };
        const loadFromData = vi.fn(async () => true);
        const ext = { ISAParent: line, IsSaved: true, Dirty: false, Get: () => 'L1', Set: () => undefined, EntityInfo: { ParentEntityFieldNames: new Set<string>() }, Fields: [] };
        Object.defineProperty(line, 'Extension', { value: { IsConfigured: true, EnsureEntity: async () => ext }, configurable: true });
        Object.defineProperty(line, 'ID', { value: 'L1', configurable: true });
        Object.defineProperty(line, 'LoadFromData', { value: loadFromData, configurable: true });
        Object.defineProperty(line, 'GetAll', { value: () => ({}), configurable: true });

        await line.persistExtension();
        expect(loadFromData).not.toHaveBeenCalled();
    });
});

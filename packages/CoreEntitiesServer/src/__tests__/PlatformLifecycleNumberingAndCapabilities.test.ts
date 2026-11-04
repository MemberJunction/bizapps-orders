import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppCapabilityExecutionContext,
    AppCapabilityRegistry,
    BaseEntity,
    CrossEntityBatchItem,
    CrossEntityPolicyEngine,
    DocumentNumberingEngine,
    EntityField,
    EntityFieldInfo,
    EntityInfo,
    EntityLifecyclePolicyEngine,
    IAppCapabilityProvider,
    IMetadataProvider,
    RunViewParams,
    RunViewResult,
    TransactionGroupBase,
    UserInfo,
    ValidationResult,
} from '@memberjunction/core';
import {
    ORDER_LIFECYCLE_POLICY,
    ORDER_NUMBER_POLICY,
    PAYMENT_NUMBER_POLICY,
    SUBSCRIPTION_NUMBER_POLICY,
    registerOrderLifecyclePolicy,
    registerOrdersDocumentNumberingPolicies,
} from '@mj-biz-apps/orders-entities';
import {
    ACCOUNTING_CREATE_JOURNAL_ENTRIES_CAPABILITY,
    ACCOUNTING_GET_FINANCE_EXCEPTION_TYPES_CAPABILITY,
    ACCOUNTING_RAISE_FINANCE_EXCEPTIONS_CAPABILITY,
    CreateJournalEntriesCapabilityInput,
    CreateJournalEntriesOutcome,
    GetActiveFinanceExceptionType,
    GetFinanceExceptionTypesCapabilityInput,
    GetFinanceExceptionTypesCapabilityOutput,
    RaiseFinanceExceptions,
    RaiseFinanceExceptionsCapabilityInput,
    RaiseFinanceExceptionsOutcome,
    SubmitJournalEntryDrafts,
} from '../AccountingBridge.js';
import { LoadOrderEntityServer } from '../OrderEntityServer.js';
import {
    LoadOrderLineEntityServer,
    ORDER_LINE_CROSS_ENTITY_POLICY,
    OrderLineEntityServer,
    registerOrderLineCrossEntityPolicy,
} from '../OrderLineEntityServer.js';
import { LoadPaymentHeaderEntityServer } from '../PaymentHeaderEntityServer.js';

function createField(name: string, value: string | number | null, oldValue: string | number | null, dirty: boolean): EntityField {
    const field = Object.create(EntityField.prototype) as EntityField;
    const fieldInfo = {
        Name: name,
        DisplayName: name,
        CodeName: name,
        AllowUpdateAPI: true,
        ReadOnly: false,
    } as EntityFieldInfo;
    Object.defineProperty(field, 'EntityFieldInfo', { value: fieldInfo, configurable: true });
    Object.defineProperty(field, 'Name', { get: () => name, configurable: true });
    Object.defineProperty(field, 'CodeName', { get: () => name, configurable: true });
    Object.defineProperty(field, 'Value', { value, writable: true, configurable: true });
    Object.defineProperty(field, 'OldValue', { value: oldValue, writable: true, configurable: true });
    Object.defineProperty(field, 'Dirty', { get: () => dirty, configurable: true });
    return field;
}

function createFakeEntity(
    entityName: string,
    isSaved: boolean,
    fields: Record<string, { value: string | number | null; oldValue: string | number | null; dirty: boolean }>,
): BaseEntity {
    const entity = Object.create(BaseEntity.prototype) as BaseEntity;
    const info = new EntityInfo({ Name: entityName });
    const fieldList = Object.entries(fields).map(([name, spec]) =>
        createField(name, spec.value, spec.oldValue, spec.dirty),
    );
    Object.defineProperty(entity, 'EntityInfo', { get: () => info, configurable: true });
    Object.defineProperty(entity, 'IsSaved', { get: () => isSaved, configurable: true });
    Object.defineProperty(entity, 'Fields', { get: () => fieldList, configurable: true });
    Object.defineProperty(entity, 'GetFieldByName', {
        value: (fieldName: string) =>
            fieldList.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase()) ?? null,
        configurable: true,
    });
    Object.defineProperty(entity, 'Get', {
        value: (fieldName: string) =>
            fieldList.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase())?.Value ?? null,
        configurable: true,
    });
    return entity;
}

class FakeTransactionGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<boolean> {
        return true;
    }
}

class MockCreateJournalEntriesProvider
    implements IAppCapabilityProvider<CreateJournalEntriesCapabilityInput, CreateJournalEntriesOutcome>
{
    public async Execute(
        _input: CreateJournalEntriesCapabilityInput,
        _context: AppCapabilityExecutionContext,
    ): Promise<CreateJournalEntriesOutcome> {
        return {
            Success: true,
            Results: [{ Success: true, JournalEntryID: 'je-cap-1', EntryNumber: 'JE-ACME-2026-000001' }],
        };
    }
}

class MockGetFinanceExceptionTypesProvider
    implements IAppCapabilityProvider<GetFinanceExceptionTypesCapabilityInput, GetFinanceExceptionTypesCapabilityOutput>
{
    public async Execute(
        input: GetFinanceExceptionTypesCapabilityInput,
        _context: AppCapabilityExecutionContext,
    ): Promise<GetFinanceExceptionTypesCapabilityOutput> {
        return {
            Success: true,
            Types: (input.Codes ?? []).map((code) => ({
                Code: code,
                IsActive: true,
                Configuration: { thresholdPct: 10 },
            })),
        };
    }
}

class MockRaiseFinanceExceptionsProvider
    implements IAppCapabilityProvider<RaiseFinanceExceptionsCapabilityInput, RaiseFinanceExceptionsOutcome>
{
    public async Execute(
        input: RaiseFinanceExceptionsCapabilityInput,
        _context: AppCapabilityExecutionContext,
    ): Promise<RaiseFinanceExceptionsOutcome> {
        return {
            Success: true,
            Results: input.Exceptions.map((_, idx) => ({
                Index: idx,
                FinanceExceptionID: `fe-${idx + 1}`,
                Created: true,
            })),
        };
    }
}

describe('MJ Core PR #6203 Platform Primitives Adoption (Orders)', () => {
    const mockUser = { ID: 'user-orders-1', Name: 'Orders Tester' } as UserInfo;

    beforeEach(() => {
        registerOrderLifecyclePolicy();
        registerOrdersDocumentNumberingPolicies();
        registerOrderLineCrossEntityPolicy();
        LoadOrderEntityServer();
        LoadPaymentHeaderEntityServer();
        LoadOrderLineEntityServer();
    });

    afterEach(() => {
        AppCapabilityRegistry.Instance.Unregister(ACCOUNTING_CREATE_JOURNAL_ENTRIES_CAPABILITY);
        AppCapabilityRegistry.Instance.Unregister(ACCOUNTING_GET_FINANCE_EXCEPTION_TYPES_CAPABILITY);
        AppCapabilityRegistry.Instance.Unregister(ACCOUNTING_RAISE_FINANCE_EXCEPTIONS_CAPABILITY);
    });

    describe('EntityLifecyclePolicyEngine registrations', () => {
        it('enforces Order transitions and Confirmed terminal state while permitting non-status updates', () => {
            const resolved = EntityLifecyclePolicyEngine.Instance.ResolvePolicy(
                new EntityInfo({ Name: 'MJ_BizApps_Orders: Orders' }),
            );
            expect(resolved).toEqual(ORDER_LIFECYCLE_POLICY);

            // Legal transition: Draft -> Confirmed
            const confirmEntity = createFakeEntity('MJ_BizApps_Orders: Order Headers', true, {
                Status: { value: 'Confirmed', oldValue: 'Draft', dirty: true },
            });
            const confirmResult = new ValidationResult();
            confirmResult.Success = true;
            EntityLifecyclePolicyEngine.Instance.ValidateLifecycleOnEntity(confirmEntity, mockUser, confirmResult);
            expect(confirmResult.Success).toBe(true);

            // Illegal transition: Voided -> Confirmed
            const voidToConfirm = createFakeEntity('MJ_BizApps_Orders: Order Headers', true, {
                Status: { value: 'Confirmed', oldValue: 'Voided', dirty: true },
            });
            const voidResult = new ValidationResult();
            voidResult.Success = true;
            EntityLifecyclePolicyEngine.Instance.ValidateLifecycleOnEntity(voidToConfirm, mockUser, voidResult);
            expect(voidResult.Success).toBe(false);
            expect(voidResult.Errors.some((e) => e.Message.includes("'Voided' -> 'Confirmed'"))).toBe(true);

            // Illegal outbound transition from terminal state: Confirmed -> Voided
            const confirmedToVoided = createFakeEntity('MJ_BizApps_Orders: Order Headers', true, {
                Status: { value: 'Voided', oldValue: 'Confirmed', dirty: true },
            });
            const terminalExitResult = new ValidationResult();
            terminalExitResult.Success = true;
            EntityLifecyclePolicyEngine.Instance.ValidateLifecycleOnEntity(confirmedToVoided, mockUser, terminalExitResult);
            expect(terminalExitResult.Success).toBe(false);

            // Allowed non-status update on Confirmed order (e.g. FulfillmentStatus rollup)
            const confirmedFulfillmentUpdate = createFakeEntity('MJ_BizApps_Orders: Order Headers', true, {
                Status: { value: 'Confirmed', oldValue: 'Confirmed', dirty: false },
                FulfillmentStatus: { value: 'Fulfilled', oldValue: 'Pending', dirty: true },
            });
            const nonStatusResult = new ValidationResult();
            nonStatusResult.Success = true;
            EntityLifecyclePolicyEngine.Instance.ValidateLifecycleOnEntity(
                confirmedFulfillmentUpdate,
                mockUser,
                nonStatusResult,
            );
            expect(nonStatusResult.Success).toBe(true);
        });
    });

    describe('DocumentNumberingEngine registrations', () => {
        it('registers OrderNumber, SubscriptionNumber, and PaymentNumber policies on DocumentNumberingEngine', () => {
            const orderInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Order Headers' });
            const ordersAliasInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Orders' });
            const subInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Subscriptions' });
            const payInfo = new EntityInfo({ Name: 'MJ_BizApps_Orders: Payment Headers' });

            expect(DocumentNumberingEngine.Instance.ResolvePolicies(orderInfo)).toEqual([ORDER_NUMBER_POLICY]);
            expect(DocumentNumberingEngine.Instance.ResolvePolicies(ordersAliasInfo)).toEqual([ORDER_NUMBER_POLICY]);
            expect(DocumentNumberingEngine.Instance.ResolvePolicies(subInfo)).toEqual([SUBSCRIPTION_NUMBER_POLICY]);
            expect(DocumentNumberingEngine.Instance.ResolvePolicies(payInfo)).toEqual([PAYMENT_NUMBER_POLICY]);
        });
    });

    describe('CrossEntityPolicyEngine parent Order lock memoization', () => {
        it('memoizes parent Order status across 100 OrderLine validations in a transaction (1 query instead of 100)', async () => {
            const orderId = '11111111-2222-4333-8444-555555555555';
            const runViewSpy = vi.fn(
                async (_params: RunViewParams): Promise<RunViewResult<{ ID: string; Status: string }>> => {
                    return {
                        Success: true,
                        Results: [{ ID: orderId, Status: 'Confirmed' }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                },
            );
            const mockProvider = {
                Entities: [new EntityInfo({ Name: 'MJ_BizApps_Orders: Order Lines' })],
                RunView: runViewSpy,
                RunViews: vi.fn(),
            } as IMetadataProvider;

            const txGroup = Object.create(FakeTransactionGroup.prototype) as TransactionGroupBase;
            const lines: OrderLineEntityServer[] = [];
            const batchItems: CrossEntityBatchItem[] = [];
            for (let i = 0; i < 100; i++) {
                const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer;
                const info = new EntityInfo({ Name: 'MJ_BizApps_Orders: Order Lines' });
                Object.defineProperty(line, 'EntityInfo', { get: () => info, configurable: true });
                Object.defineProperty(line, 'IsSaved', { get: () => false, configurable: true });
                Object.defineProperty(line, 'BypassBookedCheck', { value: false, writable: true, configurable: true });
                Object.defineProperty(line, 'OrderHeaderID', { value: orderId, writable: true, configurable: true });
                Object.defineProperty(line, 'ProviderToUse', { get: () => mockProvider, configurable: true });
                Object.defineProperty(line, 'ContextCurrentUser', { get: () => mockUser, configurable: true });
                Object.defineProperty(line, 'TransactionGroup', { get: () => txGroup, configurable: true });
                lines.push(line);
                batchItems.push({ Entity: line, Operation: 'Create' });
            }

            expect(ORDER_LINE_CROSS_ENTITY_POLICY.PolicyKey).toBe('OrderLineParentOrderLockPolicy');

            // Validate all 100 lines via CrossEntityPolicyEngine PreEvaluateBatch
            const batchError = await CrossEntityPolicyEngine.Instance.PreEvaluateBatch(
                batchItems,
                mockProvider,
                mockUser,
                txGroup,
            );
            expect(batchError).toContain('the order is booked');
            expect(runViewSpy).toHaveBeenCalledTimes(1);

            // Also verify direct refuseNewLineOnBookedOrder calls across all 100 lines sharing a fresh TransactionGroup
            const txGroup2 = Object.create(FakeTransactionGroup.prototype) as TransactionGroupBase;
            runViewSpy.mockClear();
            type OrderLineWithRefuseGuard = OrderLineEntityServer & {
                refuseNewLineOnBookedOrder?: (res: ValidationResult) => Promise<void>;
            };
            for (const line of lines) {
                Object.defineProperty(line, 'TransactionGroup', { get: () => txGroup2, configurable: true });
                const res = new ValidationResult();
                res.Success = true;
                const callable = line as OrderLineWithRefuseGuard;
                if (callable.refuseNewLineOnBookedOrder) {
                    await callable.refuseNewLineOnBookedOrder(res);
                }
                expect(res.Success).toBe(false);
                expect(res.Errors[0]?.Message).toContain('the order is booked');
            }
            expect(runViewSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('AppCapabilityRegistry integration in AccountingBridge', () => {
        it('dispatches SubmitJournalEntryDrafts, GetActiveFinanceExceptionType, and RaiseFinanceExceptions through AppCapabilityRegistry when registered', async () => {
            AppCapabilityRegistry.Instance.Register(
                ACCOUNTING_CREATE_JOURNAL_ENTRIES_CAPABILITY,
                MockCreateJournalEntriesProvider,
                { ownerApp: '@mj-biz-apps/accounting' },
            );

            AppCapabilityRegistry.Instance.Register(
                ACCOUNTING_GET_FINANCE_EXCEPTION_TYPES_CAPABILITY,
                MockGetFinanceExceptionTypesProvider,
                { ownerApp: '@mj-biz-apps/accounting' },
            );

            AppCapabilityRegistry.Instance.Register(
                ACCOUNTING_RAISE_FINANCE_EXCEPTIONS_CAPABILITY,
                MockRaiseFinanceExceptionsProvider,
                { ownerApp: '@mj-biz-apps/accounting' },
            );

            const mockProvider = {} as IMetadataProvider;
            const jeOutcome = await SubmitJournalEntryDrafts(
                [{ CompanyID: 'co-1' }],
                'test order confirm',
                mockProvider,
                mockUser,
            );
            expect(jeOutcome.Success).toBe(true);
            expect(jeOutcome.Results?.[0]?.EntryNumber).toBe('JE-ACME-2026-000001');

            const feType = await GetActiveFinanceExceptionType('PRICE_BELOW_ENGINE', mockProvider, mockUser);
            expect(feType).toEqual({
                Code: 'PRICE_BELOW_ENGINE',
                IsActive: true,
                Configuration: { thresholdPct: 10 },
            });

            const raiseOutcome = await RaiseFinanceExceptions(
                [
                    {
                        TypeCode: 'PRICE_BELOW_ENGINE',
                        SourceEntityName: 'MJ_BizApps_Orders: Order Lines',
                        SourceRecordID: 'line-1',
                        CompanyID: 'co-1',
                        ExceptionDate: '2026-04-19',
                        Summary: 'Line priced below engine',
                        DedupeKey: 'dedupe-1',
                    },
                ],
                'price below engine exception',
                mockProvider,
                mockUser,
            );
            expect(raiseOutcome.Success).toBe(true);
            expect(raiseOutcome.Results[0]?.FinanceExceptionID).toBe('fe-1');
        });
    });
});

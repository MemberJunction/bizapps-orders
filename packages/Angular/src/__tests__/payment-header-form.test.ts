import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import '../public-api';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import { mjBizAppsOrdersPaymentHeaderFormComponent } from '../lib/generated/Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component';
import { BizAppsPaymentHeaderFormComponent } from '../lib/custom/PaymentHeader/payment-header-form.component';
import { PaymentHeaderPanel } from '../lib/form-panels/payment-header.panel';
import { PaymentJournalsPanel } from '../lib/form-panels/payment-journals.panel';

describe('BizAppsPaymentHeaderFormComponent Custom Form Registration & Getters', () => {
    it('subclasses the generated mjBizAppsOrdersPaymentHeaderFormComponent', () => {
        expect(BizAppsPaymentHeaderFormComponent.prototype instanceof mjBizAppsOrdersPaymentHeaderFormComponent).toBe(true);
    });

    it('registers the custom Payment Header form with priority 2', () => {
        const activeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            'MJ_BizApps_Orders: Payment Headers'
        );
        expect(activeReg?.SubClass?.name).toBe('BizAppsPaymentHeaderFormComponent');
        expect(activeReg?.Priority).toBe(2);
    });

    it('leaves header rendering to the custom form rather than a duplicate panel contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === PaymentHeaderPanel)).toBe(false);
    });

    it('computes tender-tailored avatar icons accurately', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;

        // Card
        instance.record = { PaymentType: 'Credit Card', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-credit-card');

        // Check
        instance.record = { PaymentType: 'Check', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-money-check');

        // ACH
        instance.record = { PaymentType: 'ACH', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-building-columns');

        // Wallet / Stored Value
        instance.record = { PaymentType: 'Account Credit', ReversesPaymentHeaderID: null, Amount: 100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-piggy-bank');

        // Reversal
        instance.record = { PaymentType: 'Credit Card', ReversesPaymentHeaderID: 'pay-orig-123', Amount: -100 } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        expect(instance.PaymentAvatarIcon).toBe('fa-solid fa-rotate-left');
    });

    it('formats gross amount, fee, and net amount properly', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Amount: 7076.77,
            ProcessingFeeAmount: 145.2,
            NetAmount: 6931.57,
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.FormattedGrossAmount).toBe('$7,076.77');
        expect(instance.FormattedFee).toBe('$145.20');
        expect(instance.FormattedNetAmount).toBe('$6,931.57');
    });

    it('computes settlement status text and status badge classes', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Status: 'Captured',
            BillToOrganization: 'Meridian Association',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toContain('Captured');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--active');
        expect(instance.PayerDisplayName).toBe('Meridian Association');

        instance.record = {
            Status: 'Pending',
            BillToPerson: 'John Smith',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toBe('Pending Capture');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--draft');
        expect(instance.PayerDisplayName).toBe('John Smith');

        instance.record = {
            Status: 'Refunded',
            BillToOrganization: 'Acme Corp',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        expect(instance.SettlementStatusText).toContain('Refunded');
        expect(instance.StatusBadgeClass).toContain('mjo-status-chip--purple');
    });

    it('builds comprehensive payment journal filter including direct and allocation line links', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            IsSaved: true,
            ID: 'pay-hdr-123',
            JournalEntryID: 'je-direct-456',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        const params = instance.PaymentJournalEntryParams;
        expect(params).not.toBeNull();
        expect(params?.EntityName).toBe('MJ_BizApps_Accounting: Journal Entries');
        expect(params?.ExtraFilter).toContain("ID = 'je-direct-456'");
        expect(params?.ExtraFilter).toContain("LinkedRecordID = 'pay-hdr-123'");
        expect(params?.ExtraFilter).toContain("SELECT ID FROM [__mj_BizAppsOrders].[PaymentLine] WHERE PaymentHeaderID = 'pay-hdr-123'");
    });

    it('registers PaymentJournalsPanel as a form panel contribution', () => {
        const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
        expect(regs.some(r => r.SubClass === PaymentJournalsPanel)).toBe(true);
    });

    it('evaluates CardIsBalanced correctly', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        expect(instance.CardIsBalanced({
            CompanyID: 'co-1',
            Company: 'Co 1',
            TotalDebit: 500,
            TotalCredit: 500,
            Rows: [],
        })).toBe(true);

        expect(instance.CardIsBalanced({
            CompanyID: 'co-1',
            Company: 'Co 1',
            TotalDebit: 500,
            TotalCredit: 499.99,
            Rows: [],
        })).toBe(false);
    });

    it('formats source line label correctly', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        expect(instance.SourceLineLabel(1)).toBe('1 allocation');
        expect(instance.SourceLineLabel(3)).toBe('3 allocations');
    });

    it('calculates TotalAllocated, UnallocatedRemainder, and IsAllocationBalanced accurately', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Amount: 500,
            Status: 'Pending',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        instance.AmountManuallySet = true;

        instance.OrderAllocations = {
            'ord-1': 300,
        };
        instance.LineAllocations = {
            'line-2': 100,
        };

        expect(instance.TotalAllocated).toBe(400);
        expect(instance.UnallocatedRemainder).toBe(100);
        expect(instance.IsAllocationBalanced).toBe(false);

        // Add remaining $100
        instance.SetOrderAllocation('ord-3', 100);
        expect(instance.TotalAllocated).toBe(500);
        expect(instance.UnallocatedRemainder).toBe(0);
        expect(instance.IsAllocationBalanced).toBe(true);

        // Over-allocated by $50
        instance.SetLineAllocation('line-4', 50);
        expect(instance.TotalAllocated).toBe(550);
        expect(instance.UnallocatedRemainder).toBe(-50);
        expect(instance.IsAllocationBalanced).toBe(false);
    });

    it('toggles order expansion and computes leaves balance properly', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.ExpandedOrderIDs = new Set();
        instance.OrderAllocations = {};
        instance.LineAllocations = {};
        instance.OrderLinesMap = new Map();

        expect(instance.IsOrderExpanded('ord-100')).toBe(false);
        instance.ToggleOrderExpanded('ord-100');
        expect(instance.IsOrderExpanded('ord-100')).toBe(true);
        instance.ToggleOrderExpanded('ord-100');
        expect(instance.IsOrderExpanded('ord-100')).toBe(false);

        const mockOrder = {
            ID: 'ord-100',
            TotalGross: 1000,
            Balance: 1000,
        } as unknown as mjBizAppsOrdersOrderHeaderEntity;

        // No allocation -> Leaves balance is full 1000
        expect(instance.CalculateLeavesBalance(mockOrder)).toBe(1000);

        // Order-level allocation of 400
        instance.SetOrderAllocation('ord-100', 400);
        expect(instance.CalculateLeavesBalance(mockOrder)).toBe(600);

        // Line-level allocation of 200 on line of ord-100 clears order-level allocation to prevent double counting
        instance.OrderLinesMap.set('ord-100', [
            { ID: 'line-1', LineNumber: 1, LineTotalGross: 500 } as unknown as mjBizAppsOrdersOrderLineEntity,
        ]);
        instance.SetLineAllocation('line-1', 200);
        expect(instance.HasLineAllocations('ord-100')).toBe(true);
        expect(instance.GetOrderAllocation('ord-100')).toBe(200);
        expect(instance.CalculateLeavesBalance(mockOrder)).toBe(800);
    });

    it('auto-applies oldest first to open orders', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Amount: 650,
            Status: 'Pending',
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        instance.OpenOrders = [
            { ID: 'ord-2', OrderDate: new Date('2026-08-10'), Balance: 400 } as unknown as mjBizAppsOrdersOrderHeaderEntity,
            { ID: 'ord-1', OrderDate: new Date('2026-08-01'), Balance: 500 } as unknown as mjBizAppsOrdersOrderHeaderEntity,
        ];
        instance.OrderAllocations = {};
        instance.LineAllocations = {};

        instance.AutoApplyOldestFirst();

        // Oldest order (ord-1, $500) gets $500 in full
        expect(instance.GetOrderAllocation('ord-1')).toBe(500);
        // Next order (ord-2, $400) gets remaining $150
        expect(instance.GetOrderAllocation('ord-2')).toBe(150);
        expect(instance.TotalAllocated).toBe(650);
        expect(instance.IsAllocationBalanced).toBe(true);
    });

    it('synchronizes order-level and line-level allocations into record.Lines', async () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        const mockLinesList: any[] = [];
        const mockRelatedCollection = {
            Items: mockLinesList,
            Create: async () => {
                const item: any = {};
                mockLinesList.push(item);
                return item;
            },
            Remove: (item: any) => {
                const idx = mockLinesList.indexOf(item);
                if (idx >= 0) mockLinesList.splice(idx, 1);
            },
        };

        instance.record = {
            Lines: mockRelatedCollection,
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        instance.OrderAllocations = {
            'ord-1': 300,
        };
        instance.LineAllocations = {
            'line-5': 150,
        };
        instance.OrderLinesMap = new Map([
            ['ord-2', [{ ID: 'line-5' } as unknown as mjBizAppsOrdersOrderLineEntity]],
        ]);

        await instance.SyncAllocationsToRecord();

        expect(mockLinesList).toHaveLength(2);

        const orderAlloc = mockLinesList.find(l => l.OrderHeaderID === 'ord-1');
        expect(orderAlloc).toBeDefined();
        expect(orderAlloc.OrderLineID).toBeNull();
        expect(orderAlloc.Amount).toBe(300);

        const lineAlloc = mockLinesList.find(l => l.OrderLineID === 'line-5');
        expect(lineAlloc).toBeDefined();
        expect(lineAlloc.OrderHeaderID).toBe('ord-2');
        expect(lineAlloc.Amount).toBe(150);
    });

    it('updates existing unbooked lines in record.Lines in-place instead of recreating', async () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        const existingLine = { OrderHeaderID: 'ord-1', OrderLineID: null, Amount: 100, BookedAt: null };
        const removedLine = { OrderHeaderID: 'ord-old', OrderLineID: null, Amount: 50, BookedAt: null };
        const mockLinesList = [existingLine, removedLine];
        const removedItems: any[] = [];
        const createdItems: any[] = [];

        const mockRelatedCollection = {
            Items: mockLinesList,
            Create: async () => {
                const item: any = {};
                createdItems.push(item);
                mockLinesList.push(item);
                return item;
            },
            Remove: (item: any) => {
                removedItems.push(item);
                const idx = mockLinesList.indexOf(item);
                if (idx >= 0) mockLinesList.splice(idx, 1);
            },
        };

        instance.record = {
            Lines: mockRelatedCollection,
        } as unknown as mjBizAppsOrdersPaymentHeaderEntity;

        // Change ord-1 from 100 -> 250, ord-old is not in allocations (so deleted), ord-new is added (so created)
        instance.OrderAllocations = {
            'ord-1': 250,
            'ord-new': 75,
        };
        instance.LineAllocations = {};
        instance.OrderLinesMap = new Map();

        await instance.SyncAllocationsToRecord();

        // existingLine amount is updated in-place
        expect(existingLine.Amount).toBe(250);
        // removedLine was removed from collection
        expect(removedItems).toContain(removedLine);
        // ord-new was created
        expect(createdItems).toHaveLength(1);
        expect(createdItems[0].OrderHeaderID).toBe('ord-new');
        expect(createdItems[0].Amount).toBe(75);
    });

    it('evaluates ComposeMode accurately for new vs saved vs captured records', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;

        // Unsaved record -> always editable
        instance.record = { IsSaved: false, Status: 'Pending' } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        (instance as any).EditMode = false;
        expect(instance.ComposeMode).toBe(true);

        // Saved pending record, EditMode = false -> not editable
        instance.record = { IsSaved: true, Status: 'Pending' } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        (instance as any).EditMode = false;
        expect(instance.ComposeMode).toBe(false);

        // Saved pending record, EditMode = true -> editable
        (instance as any).EditMode = true;
        expect(instance.ComposeMode).toBe(true);

        // Captured record -> never editable
        instance.record = { IsSaved: true, Status: 'Captured' } as unknown as mjBizAppsOrdersPaymentHeaderEntity;
        (instance as any).EditMode = true;
        expect(instance.ComposeMode).toBe(false);
    });

    it('auto-updates payment amount when allocations are filled if amount was not manually set', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        instance.record = {
            Amount: 0,
            ProcessingFeeAmount: 0,
            NetAmount: 0,
        } as unknown as PaymentHeaderEntity;
        instance.AmountManuallySet = false;
        instance.OpenOrders = [
            { ID: 'ord-1', Balance: 100 } as unknown as mjBizAppsOrdersOrderHeaderEntity,
            { ID: 'ord-2', Balance: 200 } as unknown as mjBizAppsOrdersOrderHeaderEntity,
        ];
        instance.OrderLinesMap = new Map([
            ['ord-2', [{ ID: 'line-1', LineTotalGross: 75 } as unknown as mjBizAppsOrdersOrderLineEntity]],
        ]);
        instance.OrderAllocations = {};
        instance.LineAllocations = {};

        // Allocate to ord-1 -> record.Amount auto-updates
        instance.SetOrderAllocation('ord-1', 100);
        expect(instance.record.Amount).toBe(100);
        expect(instance.record.NetAmount).toBe(100);

        // Allocate to line-1 -> record.Amount auto-updates to 100 + 75 = 175
        instance.SetLineAllocation('line-1', 75, 'ord-2');
        expect(instance.record.Amount).toBe(175);
        expect(instance.record.NetAmount).toBe(175);

        // If user manually changes amount, auto-updates stop
        instance.OnAmountChanged(300);
        expect(instance.AmountManuallySet).toBe(true);
        expect(instance.record.Amount).toBe(300);

        instance.SetOrderAllocation('ord-1', 50);
        // Manual amount remains 300
        expect(instance.record.Amount).toBe(300);
    });

    it('properly reads and writes tender-specific instrument details on PaymentDetailID_Object', () => {
        const instance = Object.create(BizAppsPaymentHeaderFormComponent.prototype) as BizAppsPaymentHeaderFormComponent;
        let mockDetail: mjBizAppsOrdersPaymentDetailEntity | null = null;
        instance.record = {
            get PaymentDetailID_Object() {
                return mockDetail;
            },
            PaymentDetailID_EnsureObject: () => {
                if (!mockDetail) {
                    mockDetail = {} as mjBizAppsOrdersPaymentDetailEntity;
                }
                return mockDetail;
            },
            ClearPaymentDetail: () => {
                mockDetail = null;
            },
        } as unknown as PaymentHeaderEntity;

        // Check details
        instance.ReferenceNumber = '10428';
        expect(instance.ReferenceNumber).toBe('10428');
        expect(mockDetail?.ReferenceNumber).toBe('10428');

        instance.BankName = 'Chase';
        expect(instance.BankName).toBe('Chase');
        expect(mockDetail?.BankName).toBe('Chase');

        // Card details
        instance.CardBrand = 'Visa';
        instance.CardLast4 = '4242';
        instance.CardExpMonth = 12;
        instance.CardExpYear = 2028;
        instance.CardHolderName = 'Jane Doe';

        expect(instance.CardBrand).toBe('Visa');
        expect(instance.CardLast4).toBe('4242');
        expect(instance.CardExpMonth).toBe(12);
        expect(instance.CardExpYear).toBe(2028);
        expect(instance.CardHolderName).toBe('Jane Doe');

        // ACH details
        instance.BankAccountType = 'Checking';
        instance.RoutingLast4 = '1234';
        instance.AccountLast4 = '5678';

        expect(instance.BankAccountType).toBe('Checking');
        expect(instance.RoutingLast4).toBe('1234');
        expect(instance.AccountLast4).toBe('5678');
    });
});

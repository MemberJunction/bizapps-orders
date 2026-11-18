import '@angular/compiler';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { AccountingEngineBase, pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';
import {
  BizAppsDimensionDefaultsComponent,
  type DimensionDefaultRow,
} from '../lib/custom/DimensionDefaults/dimension-defaults.component';
import { ProductCategoryDimensionDefaultsPanel } from '../lib/custom/ProductCategory/product-category-dimension-defaults.panel';
import { ProductTypeDimensionDefaultsPanel } from '../lib/custom/ProductType/product-type-dimension-defaults.panel';
import productAccountingHtml from '../lib/custom/Product/widgets/product-accounting-widget.component.html?raw';

const runViewMock = vi.fn();
const getEntityObjectMock = vi.fn();
const entitiesFixture = [
  { ID: '11111111-1111-4111-8111-111111111111', Name: 'MJ_BizApps_Orders: Products' },
  { ID: '22222222-2222-4222-8222-222222222222', Name: 'MJ_BizApps_Orders: Product Categories' },
  { ID: '33333333-3333-4333-8333-333333333333', Name: 'MJ_BizApps_Orders: Product Types' },
  { ID: '44444444-4444-4444-8444-444444444444', Name: 'MJ_BizApps_Orders: Dimension Defaults' },
  { ID: '55555555-5555-4555-8555-555555555555', Name: 'MJ_BizApps_Accounting: Dimensions' },
];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: class {
      RunView = runViewMock;
    },
    Metadata: class {
      Entities = entitiesFixture;
      CurrentUser = { ID: 'user-1', Email: 'test@example.com' };
      GetEntityObject = getEntityObjectMock;
    },
  };
});

function makeComponent(targetEntity = 'MJ_BizApps_Orders: Products'): BizAppsDimensionDefaultsComponent {
  const cdr: Pick<ChangeDetectorRef, 'detectChanges'> = {
    detectChanges: vi.fn(),
  };
  const comp = new BizAppsDimensionDefaultsComponent(cdr as ChangeDetectorRef);
  comp.TargetEntityName = targetEntity;
  return comp;
}

describe('BizAppsDimensionDefaultsComponent and form panel mounts', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    getEntityObjectMock.mockReset();
    vi.restoreAllMocks();
  });

  it('registers form panels for Product Categories and Product Types after-fields slot', () => {
    void ProductCategoryDimensionDefaultsPanel;
    void ProductTypeDimensionDefaultsPanel;

    const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel);
    const catReg = regs.find((r) => r.Key === 'form-panel:ProductCategories:dimensionDefaults');
    const typeReg = regs.find((r) => r.Key === 'form-panel:ProductTypes:dimensionDefaults');

    expect(catReg).toBeDefined();
    expect(catReg?.Metadata).toMatchObject({
      entity: 'MJ_BizApps_Orders: Product Categories',
      slot: 'after-fields',
      contributionKey: 'dimensionDefaults',
    });

    expect(typeReg).toBeDefined();
    expect(typeReg?.Metadata).toMatchObject({
      entity: 'MJ_BizApps_Orders: Product Types',
      slot: 'after-fields',
      contributionKey: 'dimensionDefaults',
    });
  });

  it('mounts <bizapps-dimension-defaults> inside the Product accounting widget template without adding FieldName', () => {
    expect(productAccountingHtml).toContain('<bizapps-dimension-defaults');
    expect(productAccountingHtml).toContain('TargetEntityName="MJ_BizApps_Orders: Products"');
    expect(productAccountingHtml).not.toMatch(/FieldName\s*=/);
  });

  it('agrees with pickActiveLinkIndex when resolving which dimension default is in force per dimension axis', () => {
    const comp = makeComponent();
    const inForce = (comp as unknown as { inForceIDs(r: Array<Record<string, unknown>>): Set<string> }).inForceIDs.bind(comp);

    const rows = [
      { ID: 'old-dept', DimensionID: 'dim-dept', Status: 'Active', StartedAt: new Date('2020-01-01T00:00:00.000Z'), EndedAt: null },
      { ID: 'new-dept', DimensionID: 'dim-dept', Status: 'Active', StartedAt: new Date('2026-01-01T00:00:00.000Z'), EndedAt: null },
      { ID: 'loc-hq', DimensionID: 'dim-loc', Status: 'Active', StartedAt: null, EndedAt: null },
    ];
    const winners = inForce(rows);
    expect([...winners].sort()).toEqual(['loc-hq', 'new-dept']);

    const deptCandidates = rows.slice(0, 2).map((r) => ({
      Status: r.Status as 'Active',
      StartedAt: r.StartedAt,
      EndedAt: r.EndedAt,
    }));
    const idx = pickActiveLinkIndex(deptCandidates, new Date());
    expect(idx).toBe(1);
  });

  it('loads dimension defaults for a saved record and maps dimension and value labels from AccountingEngineBase', async () => {
    vi.spyOn(AccountingEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AccountingEngineBase.Instance, 'Dimensions', 'get').mockReturnValue([
      { ID: 'dim-dept', Code: 'DEPT', Name: 'Department', IsActive: true, DisplayOrder: 1 } as never,
    ]);
    vi.spyOn(AccountingEngineBase.Instance, 'DimensionValues', 'get').mockReturnValue([
      { ID: 'val-edit', DimensionID: 'dim-dept', Code: 'EDIT', Name: 'Editorial', IsActive: true } as never,
    ]);

    runViewMock.mockResolvedValueOnce({
      Success: true,
      Results: [
        {
          ID: 'def-1',
          DimensionID: 'dim-dept',
          DimensionValueID: 'val-edit',
          Status: 'Active',
          StartedAt: '2025-01-01T00:00:00.000Z',
          EndedAt: null,
          Comments: null,
        },
      ],
    });

    const comp = makeComponent('MJ_BizApps_Orders: Products');
    comp.Record = { ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', IsSaved: true };
    comp.EditMode = true;

    await comp.Refresh(false);

    expect(comp.Rows).toHaveLength(1);
    expect(comp.Rows[0]).toMatchObject({
      ID: 'def-1',
      DimensionID: 'dim-dept',
      DimensionValueID: 'val-edit',
      DimensionCode: 'DEPT',
      DimensionName: 'Department',
      ValueCode: 'EDIT',
      ValueName: 'Editorial',
      Status: 'Active',
      Active: true,
    });
  });

  it('creates a new DimensionDefault via GetEntityObject with typed property setters on AddDefault', async () => {
    vi.spyOn(AccountingEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(AccountingEngineBase.Instance, 'Dimensions', 'get').mockReturnValue([
      { ID: 'dim-dept', Code: 'DEPT', Name: 'Department', IsActive: true, DisplayOrder: 1 } as never,
    ]);
    vi.spyOn(AccountingEngineBase.Instance, 'DimensionValues', 'get').mockReturnValue([
      { ID: 'val-edit', DimensionID: 'dim-dept', Code: 'EDIT', Name: 'Editorial', IsActive: true } as never,
    ]);

    runViewMock.mockResolvedValue({ Success: true, Results: [] });

    const createdEntity = {
      EntityID: '',
      RecordID: '',
      DimensionID: '',
      DimensionValueID: '',
      Status: 'Pending' as 'Active' | 'Disabled' | 'Pending',
      StartedAt: null as Date | null,
      NewRecord: vi.fn(),
      Save: vi.fn().mockResolvedValue(true),
      LatestResult: null,
    };
    getEntityObjectMock.mockResolvedValue(createdEntity);

    const comp = makeComponent('MJ_BizApps_Orders: Product Categories');
    const recordID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    comp.Record = { ID: recordID, IsSaved: true };
    comp.EditMode = true;

    comp.OpenDraft();
    comp.Draft!.DimensionID = 'dim-dept';
    comp.Draft!.DimensionValueID = 'val-edit';
    comp.Draft!.StartedAt = '2026-06-01';

    await comp.AddDefault();

    expect(createdEntity.NewRecord).toHaveBeenCalledTimes(1);
    expect(createdEntity.EntityID).toBe('22222222-2222-4222-8222-222222222222');
    expect(createdEntity.RecordID).toBe(recordID);
    expect(createdEntity.DimensionID).toBe('dim-dept');
    expect(createdEntity.DimensionValueID).toBe('val-edit');
    expect(createdEntity.Status).toBe('Active');
    expect(createdEntity.StartedAt?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(createdEntity.Save).toHaveBeenCalledTimes(1);
  });

  it('distinguishes In force, Superseded, Not started, and Disabled status labels', () => {
    const comp = makeComponent();
    const baseRow: DimensionDefaultRow = {
      ID: 'r1',
      DimensionID: 'd1',
      DimensionValueID: 'v1',
      DimensionCode: 'DEPT',
      DimensionName: 'Department',
      ValueCode: 'EDIT',
      ValueName: 'Editorial',
      Status: 'Active',
      StartedAt: '2020-01-01',
      EndedAt: null,
      Comments: null,
      Active: false,
    };

    expect(comp.StatusLabel({ ...baseRow, Active: true })).toBe('In force');
    expect(comp.StatusLabel({ ...baseRow, Active: false, StartedAt: '2020-01-01' })).toBe('Superseded');
    expect(comp.StatusLabel({ ...baseRow, Active: false, StartedAt: '2099-01-01' })).toBe('Not started');
    expect(comp.StatusLabel({ ...baseRow, Active: false, Status: 'Disabled' })).toBe('Disabled');
  });
});

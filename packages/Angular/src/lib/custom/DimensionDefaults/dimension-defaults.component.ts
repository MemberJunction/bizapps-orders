import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CompositeKey, Metadata, RunView, type BaseEntity } from '@memberjunction/core';
import type { FormContext, FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { AccountingEngineBase, pickActiveLinkIndex, type LinkCandidate } from '@mj-biz-apps/accounting-engine-base';
import { Today, type mjBizAppsOrdersDimensionDefaultEntity } from '@mj-biz-apps/orders-entities';

/** The polymorphic dimension-default mapping entity in the Orders schema. */
const DEFAULT_ENTITY = 'MJ_BizApps_Orders: Dimension Defaults';

/** Accounting's dimension entity — checked in metadata so an Orders-only install degrades cleanly. */
const DIMENSION_ENTITY = 'MJ_BizApps_Accounting: Dimensions';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type DimensionDefaultStatus = 'Active' | 'Disabled' | 'Pending';

export interface DimensionDefaultLike {
    ID: unknown;
    DimensionID: unknown;
    DimensionValueID: unknown;
    Status: unknown;
    StartedAt: unknown;
    EndedAt: unknown;
    Comments?: unknown;
}

export interface DimensionPickerOption {
    ID: string;
    Code: string;
    Name: string;
    Label: string;
    Disabled?: boolean;
}

export interface DimensionValuePickerOption {
    ID: string;
    DimensionID: string;
    Code: string;
    Name: string;
    Label: string;
    Disabled?: boolean;
}

export interface DimensionDefaultRow {
    ID: string;
    DimensionID: string;
    DimensionValueID: string;
    DimensionCode: string;
    DimensionName: string;
    ValueCode: string;
    ValueName: string;
    Status: DimensionDefaultStatus;
    StartedAt: string | null;
    EndedAt: string | null;
    Comments: string | null;
    /** True when this is the default `DimensionDefaultResolver` would pick today for its axis. */
    Active: boolean;
}

export interface DimensionDefaultTargetRecord {
    ID?: string | null;
    IsSaved?: boolean;
}

export function normalizeDimensionId(id: unknown): string {
    return String(id ?? '').trim().toLowerCase();
}

/**
 * Polymorphic editor for `MJ_BizApps_Orders: Dimension Defaults` rows attached to a catalog record
 * (`Products`, `Product Categories`, or `Product Types`).
 *
 * Follows the same resolution and window rules as `DimensionDefaultResolver` and the GL-links panel:
 * active winner per dimension axis is chosen by `pickActiveLinkIndex`, dates are stored and rendered
 * in UTC, and mappings that have already taken effect preserve their history by retiring (ending the
 * window) rather than deleting.
 */
@Component({
    standalone: false,
    selector: 'bizapps-dimension-defaults',
    templateUrl: './dimension-defaults.component.html',
    styleUrls: ['./dimension-defaults.component.css'],
})
export class BizAppsDimensionDefaultsComponent implements OnInit, OnDestroy {
    @Input() public Record: DimensionDefaultTargetRecord | null | undefined = null;
    @Input() public TargetEntityName = 'MJ_BizApps_Orders: Products';
    @Input() public EditMode = false;
    @Input() public FormContext?: FormContext;

    @Output() public Navigate = new EventEmitter<FormNavigationEvent>();

    public Rows: DimensionDefaultRow[] = [];
    public Loading = true;
    public LoadError: string | null = null;

    public Dimensions: DimensionPickerOption[] = [];
    public DimensionValues: DimensionValuePickerOption[] = [];

    public Draft: {
        DimensionID: string;
        DimensionValueID: string;
        StartedAt: string;
    } | null = null;

    public Editing: {
        ID: string;
        DimensionID: string;
        DimensionValueID: string;
        Status: DimensionDefaultStatus;
        StartedAt: string;
        EndedAt: string;
        Applied: boolean;
    } | null = null;

    public WriteError: string | null = null;
    public Saving = false;

    private EditDimensionOptions: ReadonlyArray<DimensionPickerOption> = [];
    private EditValueOptions: ReadonlyArray<DimensionValuePickerOption> = [];
    private destroyed = false;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    public async ngOnInit(): Promise<void> {
        await this.Refresh(false);
    }

    public ngOnDestroy(): void {
        this.destroyed = true;
    }

    private tick(): void {
        if (!this.destroyed) {
            this.cdr.detectChanges();
        }
    }

    public get CanWrite(): boolean {
        return this.EditMode && !!this.Record?.ID && Boolean(this.Record.IsSaved);
    }

    public get DraftValues(): ReadonlyArray<DimensionValuePickerOption> {
        const dimID = normalizeDimensionId(this.Draft?.DimensionID);
        if (!dimID) return [];
        return this.DimensionValues.filter((v) => normalizeDimensionId(v.DimensionID) === dimID);
    }

    public get EditDimensions(): ReadonlyArray<DimensionPickerOption> {
        return this.EditDimensionOptions;
    }

    public get EditValues(): ReadonlyArray<DimensionValuePickerOption> {
        const dimID = normalizeDimensionId(this.Editing?.DimensionID);
        if (!dimID) return [];
        return this.EditValueOptions.filter((v) => normalizeDimensionId(v.DimensionID) === dimID);
    }

    public OnDraftDimensionChange(): void {
        if (!this.Draft) return;
        const dimID = normalizeDimensionId(this.Draft.DimensionID);
        const stillValid = this.DimensionValues.some(
            (v) =>
                normalizeDimensionId(v.DimensionID) === dimID &&
                normalizeDimensionId(v.ID) === normalizeDimensionId(this.Draft?.DimensionValueID),
        );
        if (!stillValid) {
            this.Draft.DimensionValueID = '';
        }
    }

    public OnEditDimensionChange(): void {
        if (!this.Editing) return;
        const dimID = normalizeDimensionId(this.Editing.DimensionID);
        const stillValid = this.EditValueOptions.some(
            (v) =>
                normalizeDimensionId(v.DimensionID) === dimID &&
                normalizeDimensionId(v.ID) === normalizeDimensionId(this.Editing?.DimensionValueID),
        );
        if (!stillValid) {
            this.Editing.DimensionValueID = '';
        }
    }

    public async Refresh(reloadEngine = true): Promise<void> {
        this.Loading = true;
        this.LoadError = null;
        this.tick();
        try {
            if (reloadEngine) {
                await AccountingEngineBase.Instance.Config(true, new Metadata().CurrentUser);
            }
            this.Rows = await this.load();
        } catch (err) {
            this.Rows = [];
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Loading = false;
            this.tick();
        }
    }

    public StatusLabel(row: DimensionDefaultRow): string {
        if (row.Active) {
            return 'In force';
        }
        if (row.Status !== 'Active') {
            return row.Status;
        }
        return this.HasApplied(row) ? 'Superseded' : 'Not started';
    }

    public RemoveWarning(row: DimensionDefaultRow): string {
        return row.Active
            ? 'Remove this default permanently. It is IN FORCE today, so orders booked today may already '
                + 'have resolved through it. It cannot be retired instead, because a default cannot end on '
                + 'the day it starts.'
            : 'Remove this default permanently. It has not started yet, so nothing has booked through it.';
    }

    public OpenDefaultRecord(row: DimensionDefaultRow): void {
        this.Navigate.emit({
            Kind: 'record',
            EntityName: DEFAULT_ENTITY,
            PrimaryKey: CompositeKey.FromID(row.ID),
        });
    }

    public OpenDraft(): void {
        this.WriteError = null;
        this.Editing = null;
        this.Draft = { DimensionID: '', DimensionValueID: '', StartedAt: this.today() };
    }

    public CancelDraft(): void {
        this.Draft = null;
        this.WriteError = null;
    }

    public OpenEdit(row: DimensionDefaultRow): void {
        this.WriteError = null;
        this.Draft = null;
        this.EditDimensionOptions = this.dimensionOptionsForEditing(row);
        this.EditValueOptions = this.valueOptionsForEditing(row);
        this.Editing = {
            ID: row.ID,
            DimensionID: normalizeDimensionId(row.DimensionID),
            DimensionValueID: normalizeDimensionId(row.DimensionValueID),
            Status: row.Status,
            StartedAt: this.asDateInput(row.StartedAt),
            EndedAt: this.asDateInput(row.EndedAt),
            Applied: this.HasApplied(row),
        };
    }

    public CancelEdit(): void {
        this.Editing = null;
        this.EditDimensionOptions = [];
        this.EditValueOptions = [];
        this.WriteError = null;
    }

    private dimensionOptionsForEditing(row: DimensionDefaultRow): ReadonlyArray<DimensionPickerOption> {
        const current = normalizeDimensionId(row.DimensionID);
        if (!current || this.Dimensions.some((d) => normalizeDimensionId(d.ID) === current)) {
            return this.Dimensions;
        }
        const label = `${row.DimensionCode} ${row.DimensionName}`.trim() || current;
        return [
            ...this.Dimensions,
            {
                ID: current,
                Code: row.DimensionCode,
                Name: row.DimensionName,
                Label: `${label} — no longer active`,
                Disabled: true,
            },
        ];
    }

    private valueOptionsForEditing(row: DimensionDefaultRow): ReadonlyArray<DimensionValuePickerOption> {
        const current = normalizeDimensionId(row.DimensionValueID);
        const dimID = normalizeDimensionId(row.DimensionID);
        if (!current || this.DimensionValues.some((v) => normalizeDimensionId(v.ID) === current)) {
            return this.DimensionValues;
        }
        const label = `${row.ValueCode} — ${row.ValueName}`.trim() || current;
        return [
            ...this.DimensionValues,
            {
                ID: current,
                DimensionID: dimID,
                Code: row.ValueCode,
                Name: row.ValueName,
                Label: `${label} — no longer active`,
                Disabled: true,
            },
        ];
    }

    private appliedNowFor(id: string): boolean {
        const live = this.Rows.find((r) => normalizeDimensionId(r.ID) === normalizeDimensionId(id));
        return live ? this.HasApplied(live) : true;
    }

    public async AddDefault(): Promise<void> {
        const draft = this.Draft;
        const recordID = this.Record?.ID;
        if (!draft || !draft.DimensionID || !draft.DimensionValueID || !draft.StartedAt || !recordID) {
            return;
        }
        this.Saving = true;
        this.WriteError = null;
        this.tick();
        try {
            const md = new Metadata();
            const targetEntity = md.Entities.find((e) => e.Name === this.TargetEntityName);
            if (!targetEntity) {
                throw new Error(`${this.TargetEntityName} is not registered in metadata.`);
            }
            const entity = await md.GetEntityObject<mjBizAppsOrdersDimensionDefaultEntity>(DEFAULT_ENTITY);
            entity.NewRecord();
            entity.EntityID = targetEntity.ID;
            entity.RecordID = recordID;
            entity.DimensionID = draft.DimensionID;
            entity.DimensionValueID = draft.DimensionValueID;
            entity.Status = 'Active';
            entity.StartedAt = new Date(`${draft.StartedAt}T00:00:00.000Z`);

            if (!(await entity.Save())) {
                this.WriteError = this.readableError(entity) ?? 'the dimension default could not be saved';
                return;
            }
            this.Draft = null;
            await this.Refresh(true);
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.tick();
        }
    }

    public async SaveEdit(): Promise<void> {
        const edit = this.Editing;
        if (!edit) {
            return;
        }
        this.Saving = true;
        this.WriteError = null;
        this.tick();
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<mjBizAppsOrdersDimensionDefaultEntity>(DEFAULT_ENTITY);
            if (!(await entity.Load(edit.ID))) {
                throw new Error(`dimension default ${edit.ID} could not be re-read`);
            }

            const appliedNow = this.appliedNowFor(edit.ID);
            if (!appliedNow) {
                entity.DimensionID = edit.DimensionID;
                entity.DimensionValueID = edit.DimensionValueID;
                entity.StartedAt = edit.StartedAt ? new Date(`${edit.StartedAt}T00:00:00.000Z`) : null;
            }
            entity.Status = edit.Status;
            entity.EndedAt = edit.EndedAt ? new Date(`${edit.EndedAt}T00:00:00.000Z`) : null;

            if (!(await entity.Save())) {
                this.WriteError = this.readableError(entity) ?? 'the dimension default could not be updated';
                return;
            }
            this.Editing = null;
            await this.Refresh(true);
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.tick();
        }
    }

    public HasApplied(row: DimensionDefaultRow): boolean {
        if (!row.StartedAt) {
            return true;
        }
        const started = new Date(row.StartedAt as unknown as string | Date);
        if (Number.isNaN(started.getTime())) {
            return true;
        }
        return started.getTime() < new Date(`${this.today()}T00:00:00.000Z`).getTime();
    }

    private closeEditFor(id: string): void {
        if (this.Editing && normalizeDimensionId(this.Editing.ID) === normalizeDimensionId(id)) {
            this.Editing = null;
            this.EditDimensionOptions = [];
            this.EditValueOptions = [];
        }
    }

    public async RetireDefault(row: DimensionDefaultRow): Promise<void> {
        this.Saving = true;
        this.WriteError = null;
        this.tick();
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<mjBizAppsOrdersDimensionDefaultEntity>(DEFAULT_ENTITY);
            if (!(await entity.Load(row.ID))) {
                throw new Error(`dimension default ${row.ID} could not be re-read`);
            }
            entity.EndedAt = new Date(`${this.today()}T00:00:00.000Z`);
            if (!(await entity.Save())) {
                this.WriteError = this.readableError(entity) ?? 'the dimension default could not be retired';
                return;
            }
            this.closeEditFor(row.ID);
            await this.Refresh(true);
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.tick();
        }
    }

    public async RemoveDefault(row: DimensionDefaultRow): Promise<void> {
        if (this.HasApplied(row)) {
            return;
        }
        this.Saving = true;
        this.WriteError = null;
        this.tick();
        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<mjBizAppsOrdersDimensionDefaultEntity>(DEFAULT_ENTITY);
            if (!(await entity.Load(row.ID))) {
                throw new Error(`dimension default ${row.ID} could not be re-read`);
            }
            if (!(await entity.Delete())) {
                this.WriteError = this.readableError(entity) ?? 'the dimension default could not be removed';
                return;
            }
            this.closeEditFor(row.ID);
            await this.Refresh(true);
        } catch (err) {
            this.WriteError = err instanceof Error ? err.message : String(err);
        } finally {
            this.Saving = false;
            this.tick();
        }
    }

    private asDateInput(value: string | null): string {
        if (!value) {
            return '';
        }
        const d = new Date(value as unknown as string | Date);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }

    private readableError(entity: BaseEntity): string | null {
        const raw = entity.LatestResult?.CompleteMessage;
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw) as { Message?: string } | Array<{ Message?: string }>;
            const messages = (Array.isArray(parsed) ? parsed : [parsed])
                .map((p) => p?.Message)
                .filter((m): m is string => !!m);
            if (messages.length) {
                return messages.join(' ');
            }
        } catch {
            /* plain text */
        }
        return raw;
    }

    private today(): string {
        return Today();
    }

    private async load(): Promise<DimensionDefaultRow[]> {
        const recordID = this.Record?.ID;
        if (!recordID) {
            return [];
        }

        const md = new Metadata();
        const dimensionEntity = md.Entities.find((e) => e.Name === DIMENSION_ENTITY);
        const defaultEntity = md.Entities.find((e) => e.Name === DEFAULT_ENTITY);
        if (!dimensionEntity || !defaultEntity) {
            return [];
        }

        const targetEntity = md.Entities.find((e) => e.Name === this.TargetEntityName);
        if (!targetEntity) {
            throw new Error(`${this.TargetEntityName} is not registered in metadata, so its defaults cannot be identified.`);
        }

        await AccountingEngineBase.Instance.Config(false, md.CurrentUser);
        const engine = AccountingEngineBase.Instance;

        this.Dimensions = engine.Dimensions
            .filter((d) => d.IsActive !== false)
            .slice()
            .sort((a, b) => (a.DisplayOrder ?? 100) - (b.DisplayOrder ?? 100) || a.Name.localeCompare(b.Name))
            .map((d) => ({
                ID: normalizeDimensionId(d.ID),
                Code: String(d.Code ?? ''),
                Name: String(d.Name ?? '(unnamed dimension)'),
                Label: `${d.Code ? `${d.Code} — ` : ''}${d.Name ?? '(unnamed dimension)'}`,
            }));

        this.DimensionValues = engine.DimensionValues
            .filter((v) => v.IsActive !== false)
            .slice()
            .sort((a, b) => a.Code.localeCompare(b.Code) || a.Name.localeCompare(b.Name))
            .map((v) => ({
                ID: normalizeDimensionId(v.ID),
                DimensionID: normalizeDimensionId(v.DimensionID),
                Code: String(v.Code ?? ''),
                Name: String(v.Name ?? ''),
                Label: `${v.Code ?? '(no code)'} — ${v.Name ?? ''}`.trim(),
            }));

        const rows = await this.readDirect(targetEntity.ID, recordID);
        const inForce = this.inForceIDs(rows);

        return rows
            .map((r) => {
                const dimID = normalizeDimensionId(r.DimensionID);
                const valID = normalizeDimensionId(r.DimensionValueID);
                const dim = engine.Dimensions.find((d) => normalizeDimensionId(d.ID) === dimID);
                const val = engine.DimensionValues.find((v) => normalizeDimensionId(v.ID) === valID);
                const statusRaw = String(r.Status ?? 'Active');
                const status: DimensionDefaultStatus =
                    statusRaw === 'Disabled' || statusRaw === 'Pending' ? statusRaw : 'Active';
                return {
                    ID: String(r.ID),
                    DimensionID: dimID,
                    DimensionValueID: valID,
                    DimensionCode: dim?.Code ?? '',
                    DimensionName: dim?.Name ?? '(unknown dimension)',
                    ValueCode: val?.Code ?? '(unknown)',
                    ValueName: val?.Name ?? '',
                    Status: status,
                    StartedAt: (r.StartedAt as unknown as string) ?? null,
                    EndedAt: (r.EndedAt as unknown as string) ?? null,
                    Comments: r.Comments != null ? String(r.Comments) : null,
                    Active: inForce.has(normalizeDimensionId(r.ID)),
                };
            })
            .sort(
                (a, b) =>
                    a.DimensionName.localeCompare(b.DimensionName) ||
                    a.ValueCode.localeCompare(b.ValueCode),
            );
    }

    private async readDirect(entityID: string, recordID: string): Promise<DimensionDefaultLike[]> {
        if (!UUID_PATTERN.test(entityID) || !UUID_PATTERN.test(recordID)) {
            throw new Error('the dimension defaults could not be read: the record could not be identified');
        }
        const rv = new RunView();
        const res = await rv.RunView<Record<string, unknown>>({
            EntityName: DEFAULT_ENTITY,
            ExtraFilter: `EntityID = '${entityID}' AND RecordID = '${recordID}'`,
            ResultType: 'simple',
            Fields: ['ID', 'DimensionID', 'DimensionValueID', 'Status', 'StartedAt', 'EndedAt', 'Comments'],
        });
        if (!res?.Success) {
            throw new Error(res?.ErrorMessage ?? 'the dimension defaults could not be read');
        }
        return (res.Results ?? []) as unknown as DimensionDefaultLike[];
    }

    private inForceIDs(rows: ReadonlyArray<DimensionDefaultLike>): Set<string> {
        const byDimension = new Map<string, DimensionDefaultLike[]>();
        for (const row of rows) {
            const axis = normalizeDimensionId(row.DimensionID);
            const group = byDimension.get(axis);
            if (group) {
                group.push(row);
            } else {
                byDimension.set(axis, [row]);
            }
        }

        const asOf = new Date();
        const winners = new Set<string>();
        for (const group of byDimension.values()) {
            const index = pickActiveLinkIndex(
                group.map((d): LinkCandidate => ({
                    Status: String(d.Status ?? '') as LinkCandidate['Status'],
                    StartedAt: (d.StartedAt as Date | null) ?? null,
                    EndedAt: (d.EndedAt as Date | null) ?? null,
                })),
                asOf,
            );
            if (index >= 0) {
                winners.add(normalizeDimensionId(group[index].ID));
            }
        }
        return winners;
    }
}

export function LoadDimensionDefaultsComponent(): void {
    void BizAppsDimensionDefaultsComponent;
}

/**
 * @fileoverview `OrderLineExtensionCompanion` — weaves an extension entity (e.g. `EventOrderLine`)
 * into an `OrderLine`, participating in validation, serialization, and server-side atomic persistence.
 *
 * @module @mj-biz-apps/orders-entities
 */
import {
    BaseEntity,
    CompositeKey,
    EntityCompanion,
    KeyValuePair,
    ValidationResult,
    type EntityCompanionDeserializeMode,
    type IMetadataProvider,
} from '@memberjunction/core';

/**
 * The wire shape for an order line extension.
 */
export type OrderLineExtensionWire = {
    /** The extension entity name in MJ metadata (e.g. `'MJ_BizApps_Orders: Event Order Lines'`). */
    EntityName: string;
    /** The extension entity's field values. */
    Fields: Record<string, unknown>;
    /** Whether this extension record is a pending insert rather than an existing row. */
    IsNew: boolean;
};

export class OrderLineExtensionCompanion extends EntityCompanion<OrderLineExtensionWire> {
    /**
     * Stable companion identifier.
     */
    public readonly Name = 'OrderLineExtension';

    private _entityName: string | null = null;
    private _entity: BaseEntity | null = null;
    private _wireData: OrderLineExtensionWire | null = null;

    /** The extension entity name in metadata, if configured. */
    public get EntityName(): string | null {
        return this._entity?.EntityInfo?.Name ?? this._entityName;
    }

    /** The live extension entity instance, if provisioned. */
    public get Entity(): BaseEntity | null {
        return this._entity;
    }

    /** True when this companion has an extension entity attached or specified. */
    public get IsConfigured(): boolean {
        return !!this._entity || !!this._entityName || !!this._wireData;
    }

    /** True when the extension entity is persisted in the database. */
    public get IsSaved(): boolean {
        return this._entity?.IsSaved ?? (!this._wireData?.IsNew && !!this._wireData);
    }

    /** True when the extension entity has uncommitted changes. */
    public override get Dirty(): boolean {
        if (this._entity) {
            return !this._entity.IsSaved || this._entity.Dirty;
        }
        return !!this._wireData?.IsNew;
    }

    /**
     * Attaches an extension entity instance directly.
     */
    public SetEntity(entity: BaseEntity | null): void {
        this._entity = entity;
        this._entityName = entity?.EntityInfo?.Name ?? null;
        this._wireData = null;
    }

    /**
     * Ensures an extension entity object exists, creating or hydrating one if necessary.
     */
    public async EnsureEntity(entityName?: string): Promise<BaseEntity | null> {
        const targetName = entityName ?? this.EntityName;
        if (!targetName) {
            return null;
        }

        if (this._entity && (!entityName || this._entity.EntityInfo?.Name === entityName)) {
            return this._entity;
        }

        const provider = this.Owner.ProviderToUse as unknown as IMetadataProvider;
        if (!provider) {
            return null;
        }

        const ext = await provider.GetEntityObject(targetName, this.Owner.ContextCurrentUser);
        if (!ext) {
            return null;
        }

        const lineId = this.Owner.FirstPrimaryKey?.Value;
        if (this._wireData) {
            if (this._wireData.IsNew) {
                ext.NewRecord();
                if (lineId) {
                    ext.Set('ID', lineId);
                }
                ext.SetMany(this._wireData.Fields, true);
            } else {
                const key = new CompositeKey(
                    ext.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, this._wireData!.Fields[pk.Name] ?? lineId)),
                );
                const loaded = await ext.InnerLoad(key);
                if (!loaded) {
                    ext.NewRecord();
                }
                ext.SetMany(this._wireData.Fields, true);
            }
        } else if (lineId && this.Owner.IsSaved) {
            const key = new CompositeKey(
                ext.EntityInfo.PrimaryKeys.map(pk => new KeyValuePair(pk.Name, lineId)),
            );
            const loaded = await ext.InnerLoad(key);
            if (!loaded) {
                ext.NewRecord();
                ext.Set('ID', lineId);
            }
        } else {
            ext.NewRecord();
            if (lineId) {
                ext.Set('ID', lineId);
            }
        }

        this._entity = ext;
        this._entityName = targetName;
        return ext;
    }

    /** @inheritdoc */
    public override async Serialize(
        mode: EntityCompanionDeserializeMode = 'request',
    ): Promise<OrderLineExtensionWire | null> {
        if (!this.IsConfigured) {
            return null;
        }

        // In request mode, skip clean saved extensions to save bandwidth
        if (mode !== 'result' && this._entity && this._entity.IsSaved && !this._entity.Dirty) {
            return null;
        }

        if (this._entity) {
            return {
                EntityName: this._entity.EntityInfo?.Name ?? this._entityName ?? '',
                Fields: this._entity.GetAll(),
                IsNew: !this._entity.IsSaved,
            };
        }

        if (this._wireData) {
            return this._wireData;
        }

        return null;
    }

    /** @inheritdoc */
    public override async Deserialize(
        data: OrderLineExtensionWire,
        mode: EntityCompanionDeserializeMode = 'request',
    ): Promise<void> {
        if (!data || !data.EntityName) {
            this._entity = null;
            this._entityName = null;
            this._wireData = null;
            return;
        }

        this._entityName = data.EntityName;
        this._wireData = data;

        const provider = this.Owner.ProviderToUse as unknown as IMetadataProvider;
        if (provider) {
            await this.EnsureEntity(data.EntityName);
            if (this._entity && mode === 'result') {
                await this._entity.LoadFromData(data.Fields, true);
            }
        }
    }

    /** @inheritdoc */
    public override Validate(result: ValidationResult): void {
        if (this._entity) {
            const extResult = this._entity.Validate();
            if (!extResult.Success && extResult.Errors.length > 0) {
                // If extension is an IS-A child, only include its own field errors, not parent chain duplicates
                const ownErrors = this._entity.ISAParent
                    ? extResult.Errors.filter(err => !this._entity!.EntityInfo.ParentEntityFieldNames?.has(err.Source))
                    : extResult.Errors;
                if (ownErrors.length > 0) {
                    result.Success = false;
                    result.Errors.push(...ownErrors);
                }
            }
        }
    }

    /** @inheritdoc */
    public override AcceptChanges(): void {
        if (this._wireData) {
            this._wireData.IsNew = false;
        }
    }
}

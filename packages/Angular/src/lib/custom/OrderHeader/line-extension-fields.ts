/**
 * Pure helpers for weaving a ProductType.OrderLineExtensionEntity into a line card.
 *
 * Simple mode shows only required, extension-owned fields. Extended mode embeds
 * the plugin form — this file only decides which fields belong in Simple.
 */
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';

/** Control type `<mj-form-field>` understands. */
export type LineExtensionFieldType =
    | 'textbox'
    | 'textarea'
    | 'number'
    | 'datepicker'
    | 'checkbox'
    | 'select';

/** One required extension field, ready to bind in Simple mode. */
export interface LineExtensionField {
    Name: string;
    DisplayName: string;
    Type: LineExtensionFieldType;
    LinkType: 'Email' | 'URL' | 'Record' | 'None';
}

/** The field facts Simple mode needs — a slice of EntityFieldInfo. */
export interface ExtensionFieldSource {
    Name: string;
    DisplayName: string | null;
    Type: string;
    Length: number | null;
    AllowsNull: boolean;
    IsPrimaryKey: boolean;
    IsVirtual: boolean;
    AutoIncrement: boolean;
    AllowUpdateAPI: boolean;
    IncludeInGeneratedForm: boolean | null;
    ValueListType: string | null;
    RelatedEntityID: string | null;
    ExtendedType: string | null;
}

const NUMERIC_SQL = new Set([
    'int',
    'bigint',
    'smallint',
    'tinyint',
    'decimal',
    'numeric',
    'float',
    'real',
    'money',
    'smallmoney',
]);

const DATE_SQL = new Set(['date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime']);

const LONG_TEXT_SQL = new Set(['ntext', 'text', 'nvarchar(max)', 'varchar(max)']);

/**
 * Fields Simple mode should render: owned by the extension, required, writable.
 *
 * Inherited Order Line columns, system timestamps, virtuals, and optional
 * columns (Check-In is optional on Event Order Lines) stay out.
 */
export function SelectSimpleExtensionFields(
    fields: ExtensionFieldSource[],
    parentFieldNames: ReadonlySet<string>,
): ExtensionFieldSource[] {
    return fields.filter((field) => isSimpleExtensionField(field, parentFieldNames));
}

/** Maps an entity's metadata into the Simple-mode field list. */
export function SimpleExtensionFields(entity: BaseEntity): LineExtensionField[] {
    const info = entity.EntityInfo;
    const selected = SelectSimpleExtensionFields(
        info.Fields.map((field) => toFieldSource(field)),
        parentFieldNameSet(info),
    );
    return selected.map((field) => ({
        Name: field.Name,
        DisplayName: field.DisplayName?.trim() || splitName(field.Name),
        Type: FormTypeForField(field),
        LinkType: LinkTypeForField(field),
    }));
}

/** Short label for a `Schema: Entity Name` string. */
export function ExtensionEntityLabel(entityName: string): string {
    const trimmed = entityName.trim();
    const colon = trimmed.lastIndexOf(':');
    return colon >= 0 ? trimmed.slice(colon + 1).trim() : trimmed;
}

/** `<mj-form-field>` Type for a SQL / value-list field. */
export function FormTypeForField(field: ExtensionFieldSource): LineExtensionFieldType {
    const valueList = (field.ValueListType ?? '').toLowerCase();
    if (valueList === 'list' || valueList === 'listoruserentry') {
        return 'select';
    }

    const sql = (field.Type ?? '').toLowerCase();
    if (sql === 'bit') return 'checkbox';
    if (DATE_SQL.has(sql)) return 'datepicker';
    if (NUMERIC_SQL.has(sql)) return 'number';
    if (LONG_TEXT_SQL.has(sql) || isLongNvarchar(sql, field.Length)) return 'textarea';
    return 'textbox';
}

/** Link treatment for a Simple-mode field. */
export function LinkTypeForField(field: ExtensionFieldSource): 'Email' | 'URL' | 'Record' | 'None' {
    const extended = (field.ExtendedType ?? '').toLowerCase();
    if (extended === 'email') return 'Email';
    if (extended === 'url') return 'URL';
    if (field.RelatedEntityID) return 'Record';
    return 'None';
}

function isSimpleExtensionField(
    field: ExtensionFieldSource,
    parentFieldNames: ReadonlySet<string>,
): boolean {
    if (field.IsPrimaryKey || field.AutoIncrement || field.IsVirtual) return false;
    if (field.AllowsNull) return false;
    if (field.AllowUpdateAPI === false) return false;
    if (field.IncludeInGeneratedForm === false) return false;
    if (field.Name.startsWith('__mj_')) return false;
    if (parentFieldNames.has(field.Name)) return false;
    return true;
}

function parentFieldNameSet(info: EntityInfo): Set<string> {
    const names = new Set<string>(info.ParentEntityFieldNames ?? []);
    for (const field of info.AllParentFields ?? []) {
        names.add(field.Name);
    }
    return names;
}

function toFieldSource(field: EntityFieldInfo): ExtensionFieldSource {
    return {
        Name: field.Name,
        DisplayName: field.DisplayName,
        Type: field.Type,
        Length: field.Length,
        AllowsNull: field.AllowsNull,
        IsPrimaryKey: field.IsPrimaryKey,
        IsVirtual: field.IsVirtual,
        AutoIncrement: field.AutoIncrement,
        AllowUpdateAPI: field.AllowUpdateAPI,
        IncludeInGeneratedForm: field.IncludeInGeneratedForm,
        ValueListType: field.ValueListType,
        RelatedEntityID: field.RelatedEntityID,
        ExtendedType: field.ExtendedType,
    };
}

function isLongNvarchar(sql: string, length: number | null): boolean {
    if (sql !== 'nvarchar' && sql !== 'varchar') return false;
    return length != null && (length < 0 || length > 1000);
}

function splitName(name: string): string {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

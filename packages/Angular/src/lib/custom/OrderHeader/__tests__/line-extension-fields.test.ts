import { describe, expect, it } from 'vitest';
import {
    ExtensionEntityLabel,
    FormTypeForField,
    LinkTypeForField,
    SelectSimpleExtensionFields,
    type ExtensionFieldSource,
} from '../line-extension-fields';

function field(partial: Partial<ExtensionFieldSource> & Pick<ExtensionFieldSource, 'Name'>): ExtensionFieldSource {
    return {
        DisplayName: partial.DisplayName ?? partial.Name,
        Type: partial.Type ?? 'nvarchar',
        Length: partial.Length ?? 300,
        AllowsNull: partial.AllowsNull ?? false,
        IsPrimaryKey: partial.IsPrimaryKey ?? false,
        IsVirtual: partial.IsVirtual ?? false,
        AutoIncrement: partial.AutoIncrement ?? false,
        AllowUpdateAPI: partial.AllowUpdateAPI ?? true,
        IncludeInGeneratedForm: partial.IncludeInGeneratedForm ?? true,
        ValueListType: partial.ValueListType ?? null,
        RelatedEntityID: partial.RelatedEntityID ?? null,
        ExtendedType: partial.ExtendedType ?? null,
        ...partial,
    };
}

describe('SelectSimpleExtensionFields', () => {
    const parent = new Set(['ID', 'OrderHeaderID', 'ProductID', 'Quantity', 'UnitPrice']);

    it('keeps a required extension-owned field', () => {
        const selected = SelectSimpleExtensionFields(
            [field({ Name: 'SeatNumber', AllowsNull: false })],
            parent,
        );
        expect(selected.map((f) => f.Name)).toEqual(['SeatNumber']);
    });

    it('drops inherited Order Line columns', () => {
        const selected = SelectSimpleExtensionFields(
            [field({ Name: 'Quantity', AllowsNull: false }), field({ Name: 'AttendeeName', AllowsNull: false })],
            parent,
        );
        expect(selected.map((f) => f.Name)).toEqual(['AttendeeName']);
    });

    it('drops optional fields — Event Order Lines have none required', () => {
        const selected = SelectSimpleExtensionFields(
            [
                field({ Name: 'AttendeeName', AllowsNull: true }),
                field({ Name: 'AttendeeEmail', AllowsNull: true }),
                field({ Name: 'CheckInAt', Type: 'datetimeoffset', AllowsNull: true }),
            ],
            parent,
        );
        expect(selected).toEqual([]);
    });

    it('drops primary keys, virtuals, timestamps and non-updatable fields', () => {
        const selected = SelectSimpleExtensionFields(
            [
                field({ Name: 'ID', IsPrimaryKey: true }),
                field({ Name: 'OrderHeader', IsVirtual: true }),
                field({ Name: '__mj_CreatedAt', Type: 'datetimeoffset' }),
                field({ Name: 'LockedCode', AllowUpdateAPI: false }),
                field({ Name: 'Hidden', IncludeInGeneratedForm: false }),
            ],
            parent,
        );
        expect(selected).toEqual([]);
    });
});

describe('FormTypeForField', () => {
    it('maps SQL types to mj-form-field controls', () => {
        expect(FormTypeForField(field({ Name: 'Flag', Type: 'bit' }))).toBe('checkbox');
        expect(FormTypeForField(field({ Name: 'When', Type: 'datetimeoffset' }))).toBe('datepicker');
        expect(FormTypeForField(field({ Name: 'Qty', Type: 'decimal' }))).toBe('number');
        expect(FormTypeForField(field({ Name: 'Name', Type: 'nvarchar', Length: 300 }))).toBe('textbox');
        expect(FormTypeForField(field({ Name: 'Notes', Type: 'nvarchar', Length: -1 }))).toBe('textarea');
        expect(FormTypeForField(field({ Name: 'Status', ValueListType: 'List' }))).toBe('select');
    });
});

describe('LinkTypeForField', () => {
    it('uses ExtendedType and related-entity metadata', () => {
        expect(LinkTypeForField(field({ Name: 'AttendeeEmail', ExtendedType: 'Email' }))).toBe('Email');
        expect(LinkTypeForField(field({ Name: 'Site', ExtendedType: 'URL' }))).toBe('URL');
        expect(LinkTypeForField(field({ Name: 'VenueID', RelatedEntityID: 'abc' }))).toBe('Record');
        expect(LinkTypeForField(field({ Name: 'AttendeeName' }))).toBe('None');
    });
});

describe('ExtensionEntityLabel', () => {
    it('strips the schema prefix', () => {
        expect(ExtensionEntityLabel('MJ_BizApps_Orders: Event Order Lines')).toBe('Event Order Lines');
        expect(ExtensionEntityLabel('Event Order Lines')).toBe('Event Order Lines');
    });
});

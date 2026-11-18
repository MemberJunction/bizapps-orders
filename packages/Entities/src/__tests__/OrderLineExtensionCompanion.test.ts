import { describe, expect, it } from 'vitest';
import { BaseEntity, ValidationResult, ValidationErrorInfo } from '@memberjunction/core';
import { OrderLineExtensionCompanion, type OrderLineExtensionWire } from '../OrderLineExtensionCompanion.js';

describe('OrderLineExtensionCompanion', () => {
    it('is not configured by default', async () => {
        const c = new OrderLineExtensionCompanion({} as never);
        expect(c.IsConfigured).toBe(false);
        expect(c.EntityName).toBeNull();
        expect(c.Entity).toBeNull();
        expect(c.Dirty).toBe(false);
        expect(await c.Serialize()).toBeNull();
    });

    it('serializes configured entity state', async () => {
        const c = new OrderLineExtensionCompanion({} as never);
        const mockEntity = {
            IsSaved: false,
            Dirty: true,
            EntityInfo: { Name: 'MJ_BizApps_Orders: Event Order Lines' },
            GetAll: () => ({ PersonID: 'p-1', BadgeName: 'Speaker' }),
            Validate: () => new ValidationResult(),
            AcceptChanges: () => {},
        } as unknown as BaseEntity;

        c.SetEntity(mockEntity);
        expect(c.IsConfigured).toBe(true);
        expect(c.EntityName).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(c.Dirty).toBe(true);

        const serialized = await c.Serialize('request');
        expect(serialized).toEqual({
            EntityName: 'MJ_BizApps_Orders: Event Order Lines',
            Fields: { PersonID: 'p-1', BadgeName: 'Speaker' },
            IsNew: true,
        });
    });

    it('omits clean saved entity in request mode but includes in result mode', async () => {
        const c = new OrderLineExtensionCompanion({} as never);
        const mockEntity = {
            IsSaved: true,
            Dirty: false,
            EntityInfo: { Name: 'MJ_BizApps_Orders: Event Order Lines' },
            GetAll: () => ({ PersonID: 'p-1' }),
            Validate: () => new ValidationResult(),
            AcceptChanges: () => {},
        } as unknown as BaseEntity;

        c.SetEntity(mockEntity);
        expect(c.Dirty).toBe(false);
        expect(await c.Serialize('request')).toBeNull();

        const resultSerialized = await c.Serialize('result');
        expect(resultSerialized).toEqual({
            EntityName: 'MJ_BizApps_Orders: Event Order Lines',
            Fields: { PersonID: 'p-1' },
            IsNew: false,
        });
    });

    it('deserializes wire payload and stores wire data', async () => {
        const c = new OrderLineExtensionCompanion({} as never);
        const wire: OrderLineExtensionWire = {
            EntityName: 'MJ_BizApps_Orders: Event Order Lines',
            Fields: { PersonID: 'p-2' },
            IsNew: true,
        };

        await c.Deserialize(wire, 'request');
        expect(c.IsConfigured).toBe(true);
        expect(c.EntityName).toBe('MJ_BizApps_Orders: Event Order Lines');
        expect(c.Dirty).toBe(true);
        expect(await c.Serialize('request')).toEqual(wire);
    });

    it('fans out validation errors to parent result', () => {
        const c = new OrderLineExtensionCompanion({} as never);
        const mockEntity = {
            IsSaved: false,
            Dirty: true,
            EntityInfo: { Name: 'MJ_BizApps_Orders: Event Order Lines' },
            GetAll: () => ({}),
            Validate: () => {
                const r = new ValidationResult();
                r.Success = false;
                r.Errors.push(new ValidationErrorInfo('PersonID', 'Person is required', null));
                return r;
            },
            AcceptChanges: () => {},
        } as unknown as BaseEntity;

        c.SetEntity(mockEntity);

        const parentResult = new ValidationResult();
        c.Validate(parentResult);

        expect(parentResult.Success).toBe(false);
        expect(parentResult.Errors).toHaveLength(1);
        expect(parentResult.Errors[0].Message).toBe('Person is required');
    });

    describe('an extension that is the line\'s IS-A child (golive #382)', () => {
        function isaChild(fields: Record<string, unknown>, opts: { saved?: boolean; dirty?: boolean } = {}) {
            const values = { ...fields };
            return {
                IsSaved: opts.saved ?? false,
                Dirty: opts.dirty ?? true,
                EntityInfo: { Name: 'MJ_BizApps_Orders: Event Order Lines', ParentEntityFieldNames: new Set<string>() },
                ISAParent: {},
                GetAll: () => ({ ...values }),
                SetMany: (incoming: Record<string, unknown>) => Object.assign(values, incoming),
                Validate: () => {
                    const r = new ValidationResult();
                    if (!values.PersonID) {
                        r.Success = false;
                        r.Errors.push(new ValidationErrorInfo('PersonID', 'Person is required', null));
                    }
                    return r;
                },
                values,
            };
        }

        it('serializes the attendee the order form set on the child, which never went through SetEntity', async () => {
            const child = isaChild({ PersonID: 'p-1', AttendanceStatus: 'Registered' });
            const c = new OrderLineExtensionCompanion({ ISAChild: child } as never);
            expect(await c.Serialize('request')).toEqual({
                EntityName: 'MJ_BizApps_Orders: Event Order Lines',
                Fields: { PersonID: 'p-1', AttendanceStatus: 'Registered' },
                IsNew: true,
            });
        });

        it('validates the child it did not attach itself', () => {
            const c = new OrderLineExtensionCompanion({ ISAChild: isaChild({}) } as never);
            const result = new ValidationResult();
            c.Validate(result);
            expect(result.Success).toBe(false);
        });

        it('applies a request\'s values on the server when EnsureISAChild hands back the child', async () => {
            const child = isaChild({ PersonID: null }, { saved: true, dirty: false });
            const owner = { ProviderToUse: {}, ISAChild: null, EnsureISAChild: async () => child };
            const c = new OrderLineExtensionCompanion(owner as never);
            await c.Deserialize(
                { EntityName: 'MJ_BizApps_Orders: Event Order Lines', Fields: { PersonID: 'p-9' }, IsNew: false },
                'request',
            );
            expect(child.values.PersonID).toBe('p-9');
        });

        it('applies a request\'s values to an extension already attached', async () => {
            const child = isaChild({ PersonID: 'p-1' }, { saved: true, dirty: false });
            const owner = { ProviderToUse: {}, ISAChild: child, EnsureISAChild: async () => child };
            const c = new OrderLineExtensionCompanion(owner as never);
            c.SetEntity(child as unknown as BaseEntity);
            await c.Deserialize(
                { EntityName: 'MJ_BizApps_Orders: Event Order Lines', Fields: { PersonID: 'p-7' }, IsNew: false },
                'request',
            );
            expect(child.values.PersonID).toBe('p-7');
        });
    });
});


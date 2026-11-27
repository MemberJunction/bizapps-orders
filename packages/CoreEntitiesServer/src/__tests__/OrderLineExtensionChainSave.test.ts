import { describe, expect, it, vi } from 'vitest';
import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { OrderLineEntityServer } from '../OrderLineEntityServer';

describe('OrderLineEntityServer.Save — IS-A parent-chain recursion guard', () => {
    it('does not re-enter Extension.EnsureEntity / ext.Save when IsParentEntitySave is true', async () => {
        const superSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        try {
            const line = Object.create(OrderLineEntityServer.prototype) as OrderLineEntityServer;
            vi.spyOn(line, 'PrepareForSave').mockResolvedValue();

            const extSave = vi.fn().mockResolvedValue(true);
            const ensureEntity = vi.fn().mockResolvedValue({
                Get: () => 'line-1',
                Set: vi.fn(),
                ISAParent: line,
                IsSaved: false,
                Dirty: true,
                Save: extSave,
            });
            Object.defineProperty(line, 'Extension', {
                value: {
                    IsConfigured: true,
                    EntityName: 'MJ_BizApps_Orders: Event Order Lines',
                    EnsureEntity: ensureEntity,
                },
                configurable: true,
            });

            const parentChainOptions = new EntitySaveOptions();
            parentChainOptions.IsParentEntitySave = true;

            const savedInChain = await line.Save(parentChainOptions);
            expect(savedInChain).toBe(true);
            expect(ensureEntity).not.toHaveBeenCalled();
            expect(extSave).not.toHaveBeenCalled();
        } finally {
            superSaveSpy.mockRestore();
        }
    });
});

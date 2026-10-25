/**
 * Pricing filters escape caller text and refuse non-UUID ids.
 *
 * Charge and promotion codes come from the caller, and the pricing engines compose them into
 * `ExtraFilter` SQL on both tiers. `RunCharges` is driven against a stubbed RunView to check the
 * filter text it sends; a source-level guard keeps hand-rolled quote doubling out of the package.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const filters: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StubRunView {
        async RunView(params: { ExtraFilter?: string }) {
            filters.push(params.ExtraFilter ?? '');
            return { Success: true, Results: [] };
        }
    }
    return { ...actual, RunView: StubRunView };
});

import { RunCharges } from '../pricing/ChargeEngine.js';
import { InvalidOperationInputError, RequireUUID, RequireUUIDs } from '../sql-guards.js';

const provider = {} as IMetadataProvider;
const user = {} as UserInfo;
const GOOD = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('RunCharges charge-type filter', () => {
    it('doubles quotes and strips null bytes in caller-supplied codes', async () => {
        filters.length = 0;
        await RunCharges(
            [{ Code: "SHIP' OR '1'='1\0" } as never],
            [{ LineID: 'l1', Amount: 10 } as never],
            provider,
            user,
        ).catch(() => undefined); // the unknown code is refused after the read; only the filter matters
        expect(filters[0]).toBe("Code IN ('SHIP'' OR ''1''=''1')");
    });
});

describe('orders-entities UUID guards', () => {
    it('accepts a UUID and refuses an injected id', () => {
        expect(RequireUUID(GOOD, 'ProductID')).toBe(GOOD);
        expect(() => RequireUUID(`${GOOD}' OR '1'='1`, 'ProductID')).toThrow(InvalidOperationInputError);
        expect(() => RequireUUIDs([GOOD, 'nope'], 'PriceListID')).toThrow(/PriceListID/);
    });
});

describe('package source', () => {
    it('has no hand-rolled quote doubling', () => {
        // The whole package, not just `pricing/` — the convention (CLAUDE.md) bans inline
        // `.replace(/'/g, "''")` everywhere; the sanctioned helpers are `EscapeSQLString`
        // and the guards in `sql-guards.ts`. `__tests__` is skipped because this file names
        // the pattern; `generated/` is CodeGen's output, not hand-written source.
        const src = join(import.meta.dirname, '..');
        const offenders: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    if (entry.name === '__tests__' || entry.name === 'generated') continue;
                    walk(join(dir, entry.name));
                } else if (entry.name.endsWith('.ts')) {
                    const file = join(dir, entry.name);
                    if (readFileSync(file, 'utf8').includes(`.replace(/'/g`)) offenders.push(file);
                }
            }
        };
        walk(src);
        expect(offenders).toEqual([]);
    });
});

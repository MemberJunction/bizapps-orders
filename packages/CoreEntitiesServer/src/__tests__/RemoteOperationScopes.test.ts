import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseRemotableOperation } from '@memberjunction/core';
import { describe, expect, it } from 'vitest';
import * as server from '../index.js';

/**
 * MJAPI checks an API key's scopes only when the registered operation class carries a
 * `RequiredScope`. That value comes from the generated base class, so a server class that extends
 * `BaseRemotableOperation` directly carries none and every API key gets through (#383). This pins
 * each Orders operation in metadata to a server class whose scope is the one metadata declares.
 */

const METADATA_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'metadata', 'remote-operations');

function declaredScopes(): Map<string, string> {
    const scopes = new Map<string, string>();
    for (const file of readdirSync(METADATA_DIR).filter((f) => f.endsWith('.json') && f !== '.mj-sync.json')) {
        const records = JSON.parse(readFileSync(join(METADATA_DIR, file), 'utf8')) as Array<{
            fields: { OperationKey: string; RequiredScope?: string };
        }>;
        for (const r of records) scopes.set(r.fields.OperationKey, r.fields.RequiredScope ?? '');
    }
    return scopes;
}

function serverScopes(): Map<string, string | undefined> {
    const scopes = new Map<string, string | undefined>();
    for (const value of Object.values(server)) {
        if (typeof value !== 'function' || !(value.prototype instanceof BaseRemotableOperation)) continue;
        const op = new (value as new () => BaseRemotableOperation)();
        if (op.OperationKey?.startsWith('Orders.')) scopes.set(op.OperationKey, op.RequiredScope);
    }
    return scopes;
}

describe('Orders remote operation scopes (#383)', () => {
    const declared = declaredScopes();
    const actual = serverScopes();

    it('reads every operation from metadata', () => {
        expect(declared.size).toBeGreaterThan(0);
    });

    it.each([...declared.keys()])('%s carries the scope metadata declares', (key) => {
        expect(declared.get(key)).toMatch(/^orders:/);
        expect(actual.get(key)).toBe(declared.get(key));
    });
});

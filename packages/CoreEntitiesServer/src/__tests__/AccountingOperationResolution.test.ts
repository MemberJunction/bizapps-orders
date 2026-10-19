/**
 * Booking on a host without accounting's server package says which package is missing (#865).
 *
 * `CreateInstance` hands back a hollow `BaseRemotableOperation` for an unregistered key rather than
 * null, so a null check after it never fires and the call routes with no operation key. Every
 * journal-entry caller therefore resolves through `ResolveAccountingOperation` (`TryCreateInstance`).
 * Nothing in this file registers 'Accounting.CreateJournalEntries', which is the host being modelled.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SubmitJournalEntryDrafts } from '../AccountingBridge.js';

const SRC = fileURLToPath(new URL('../', import.meta.url));

describe('an unregistered accounting operation is reported by name (#865)', () => {
    it('SubmitJournalEntryDrafts throws the not-registered error, not a routing failure', async () => {
        await expect(
            SubmitJournalEntryDrafts([], 'the test entry', {} as IMetadataProvider, {} as UserInfo),
        ).rejects.toThrow(
            "The 'Accounting.CreateJournalEntries' operation is not registered. The BizApps Accounting server package must be loaded before orders can book the test entry.",
        );
    });

    it('no source file resolves an accounting operation with CreateInstance', () => {
        // The five open-coded copies this replaced each carried a dead null check. A sixth would
        // compile and pass every unit test that registers a fake, so it is held by source.
        const offenders: string[] = [];
        for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
            const body = readFileSync(`${SRC}${file}`, 'utf8');
            if (/CreateInstance<[\s\S]{0,200}?>\(\s*BaseRemotableOperation,\s*'Accounting\./.test(body)) offenders.push(file);
        }
        expect(offenders, 'use ResolveAccountingOperation for accounting operations').toEqual([]);
    });
});

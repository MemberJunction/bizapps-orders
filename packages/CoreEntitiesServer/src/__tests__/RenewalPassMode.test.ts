/**
 * The scheduled renewal pass's mode, as the Renewals page reports it: live, preview, off, unknown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fail: false }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation(() =>
                Promise.resolve(mocks.fail ? { Success: false, ErrorMessage: 'boom', Results: [] } : { Success: true, Results: mocks.rows }),
            );
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { LoadRenewalPass, ReadPassMode, RENEWAL_PREVIEW_PARAM_ID } from '../RenewalPassMode.js';

const USER = { ID: 'u' } as unknown as UserInfo;
const PROVIDER = {} as IMetadataProvider;
const config = (preview: string | null, extra: Record<string, unknown>[] = []) =>
    JSON.stringify({
        ActionID: 'a',
        Params: [...(preview == null ? [] : [{ ActionParamID: RENEWAL_PREVIEW_PARAM_ID.toLowerCase(), ValueType: 'Static', Value: preview }]), ...extra],
    });

beforeEach(() => {
    mocks.rows = [];
    mocks.fail = false;
});

describe('ReadPassMode', () => {
    it('is Preview while the shipped Preview=true parameter stands, Live once it is false or absent', () => {
        expect(ReadPassMode({ Status: 'Active', Configuration: config('true') })).toBe('Preview');
        expect(ReadPassMode({ Status: 'Active', Configuration: config('false') })).toBe('Live');
        expect(ReadPassMode({ Status: 'Active', Configuration: config('') })).toBe('Live');
        expect(ReadPassMode({ Status: 'Active', Configuration: config(null) })).toBe('Live');
    });

    it('is Off when the job is disabled or missing, Unknown when its configuration cannot be read', () => {
        expect(ReadPassMode({ Status: 'Disabled', Configuration: config('false') })).toBe('Off');
        expect(ReadPassMode(null)).toBe('Off');
        expect(ReadPassMode({ Status: 'Active', Configuration: '{not json' })).toBe('Unknown');
    });
});

describe('LoadRenewalPass', () => {
    it('reads the job row and its next run', async () => {
        mocks.rows = [{ Status: 'Active', Configuration: config('true'), NextRunAt: new Date('2026-11-11T03:00:00Z') }];
        expect(await LoadRenewalPass(PROVIDER, USER)).toEqual({ Mode: 'Preview', NextRunAt: '2026-11-11T03:00:00.000Z' });
    });

    it('a host without the job reads as Off; a failed read as Unknown, never a throw', async () => {
        expect(await LoadRenewalPass(PROVIDER, USER)).toEqual({ Mode: 'Off', NextRunAt: null });
        mocks.fail = true;
        expect(await LoadRenewalPass(PROVIDER, USER)).toEqual({ Mode: 'Unknown', NextRunAt: null });
    });
});

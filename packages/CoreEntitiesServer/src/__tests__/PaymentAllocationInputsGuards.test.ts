/**
 * The payment allocation loader validates the order id before it reaches a filter (#772).
 *
 * The id comes from the database today, but every id in a filter passes through the shared guard
 * so a future caller cannot widen the line read by passing text through.
 */
import { describe, expect, it } from 'vitest';
import type { IRunViewProvider, UserInfo } from '@memberjunction/core';

import { LoadOrderLineShares } from '../PaymentAllocationInputs.js';
import { InvalidOperationInputError } from '../sql-guards.js';

describe('LoadOrderLineShares id guard', () => {
    it('refuses a malformed order id before running any view', async () => {
        const provider = {
            RunView: () => {
                throw new Error('RunView must not run for a malformed id');
            },
        } as unknown as IRunViewProvider;
        await expect(LoadOrderLineShares(provider, {} as UserInfo, "' OR 1=1 --")).rejects.toThrow(
            InvalidOperationInputError,
        );
    });
});

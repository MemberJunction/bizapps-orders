/**
 * `Orders.ConfirmReadiness` (golive #340): the order form's list of concession problems comes from
 * the gate confirm refuses with, over the saved order, and writes nothing.
 *
 * The order is a stub; the operation is real. What the gate itself decides is ConcessionGate.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ConfirmReadinessInput, ConfirmReadinessOutput } from '@mj-biz-apps/orders-entities';
import { ConcessionProblemSentence, ConfirmReadinessOperation } from '../ConfirmReadinessOperation.js';

const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';

interface StubOrder {
    Status: string;
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    PreviewConcessionProblems: ReturnType<typeof vi.fn>;
}

function stubOrder(status: string, clauses: string[], exists = true): StubOrder {
    return {
        Status: status,
        Load: vi.fn(async () => exists),
        Save: vi.fn(async () => true),
        PreviewConcessionProblems: vi.fn(async () => clauses),
    };
}

interface Callable {
    InternalExecute(i: ConfirmReadinessInput, p: IMetadataProvider, u: UserInfo): Promise<ConfirmReadinessOutput>;
}

async function ask(order: StubOrder, input: ConfirmReadinessInput = { OrderHeaderID: ORDER }) {
    const provider = { GetEntityObject: vi.fn(async () => order) } as unknown as IMetadataProvider;
    const user = { ID: 'user' } as unknown as UserInfo;
    const output = await (new ConfirmReadinessOperation() as unknown as Callable).InternalExecute(input, provider, user);
    return { output, provider };
}

describe('Orders.ConfirmReadiness', () => {
    it('lists each concession problem on a draft as its own sentence, in the gate wording', async () => {
        const order = stubOrder('Draft', [
            'line 1 is discounted 10%, a concession worth 1000.00 with no approved Price concession recorded for it',
            'a price concession worth 50.00 (goodwill) is awaiting approval',
        ]);
        const { output } = await ask(order);
        expect(output.ConcessionProblems).toEqual([
            'Line 1 is discounted 10%, a concession worth 1000.00 with no approved Price concession recorded for it.',
            'A price concession worth 50.00 (goodwill) is awaiting approval.',
        ]);
        expect(order.Load).toHaveBeenCalledWith(ORDER);
    });

    it('checks a quote the same way as a draft', async () => {
        const order = stubOrder('Quoted', ['a scope concession worth 5.00 (other) is awaiting approval']);
        expect((await ask(order)).output.ConcessionProblems).toHaveLength(1);
    });

    it('returns no problems when the gate has none', async () => {
        expect((await ask(stubOrder('Draft', []))).output.ConcessionProblems).toEqual([]);
    });

    it.each(['Confirmed', 'Voided'])('does not run the gate on a %s order', async (status) => {
        const order = stubOrder(status, ['should not be asked']);
        const { output } = await ask(order);
        expect(output.ConcessionProblems).toEqual([]);
        expect(order.PreviewConcessionProblems).not.toHaveBeenCalled();
    });

    it('writes nothing', async () => {
        const order = stubOrder('Draft', ['a price concession worth 1.00 (other) is awaiting approval']);
        await ask(order);
        expect(order.Save).not.toHaveBeenCalled();
    });

    it('loads the order as the calling user, so the read permission is the order view permission', async () => {
        const order = stubOrder('Draft', []);
        const { provider } = await ask(order);
        expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ_BizApps_Orders: Order Headers', { ID: 'user' });
    });

    it('refuses an order that does not exist or cannot be read', async () => {
        await expect(ask(stubOrder('Draft', [], false))).rejects.toThrow(/does not exist/);
    });

    it('refuses an ID that is not a UUID before loading anything', async () => {
        const order = stubOrder('Draft', []);
        await expect(ask(order, { OrderHeaderID: "x' OR 1=1 --" })).rejects.toThrow();
        expect(order.Load).not.toHaveBeenCalled();
    });

    it('carries the scope the metadata declares', () => {
        expect(new ConfirmReadinessOperation().RequiredScope).toBe('orders:read');
        expect(new ConfirmReadinessOperation().OperationKey).toBe('Orders.ConfirmReadiness');
    });
});

describe('ConcessionProblemSentence', () => {
    it('raises the first letter and ends with a full stop', () => {
        expect(ConcessionProblemSentence('line 2 is priced at 10.00')).toBe('Line 2 is priced at 10.00.');
    });

    it('keeps a clause that already ends a sentence', () => {
        expect(ConcessionProblemSentence('Already a sentence.')).toBe('Already a sentence.');
    });

    it('leaves an empty clause empty', () => {
        expect(ConcessionProblemSentence('  ')).toBe('');
    });
});

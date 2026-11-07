/**
 * `Orders.CheckOrderLinesEditable` — the editor's question to the server-side order-line veto
 * (bizapps-sales#328).
 *
 * The registry and `ResolveOrderLineEditRefusal` are pinned in OrderLineEditVeto.test.ts. What is
 * pinned here is what the operation does with them: every kind is asked, as the caller, of the
 * order rather than a line; a throwing vetoer comes back as a refusal, never as "editable"; and an
 * order the caller cannot load is an error rather than an answer.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    RegisterOrderLineEditVeto,
    type OrderLineEditContext,
    type OrderLineEditVeto,
    type OrdersCheckOrderLinesEditableInput,
    type OrdersCheckOrderLinesEditableOutput,
} from '@mj-biz-apps/orders-entities';

import { CheckOrderLinesEditableOperation } from '../CheckOrderLinesEditableOperation.js';

const ORDER = 'a1b2c3d4-0000-4000-8000-000000000001';
const USER = { ID: 'a1b2c3d4-0000-4000-8000-0000000000aa', Name: 'Test User' } as unknown as UserInfo;

/** `InternalExecute` is `protected` at compile time only; this is the typed shape to call it through. */
interface CallableOperation {
    InternalExecute(
        input: OrdersCheckOrderLinesEditableInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<OrdersCheckOrderLinesEditableOutput>;
}

/** A provider whose order loads, or does not, and that records what was loaded as whom. */
function provider(orderExists = true) {
    const loads: Array<{ ID: string; User: UserInfo | undefined }> = [];
    const fake = {
        GetEntityObject: async (_name: string, user?: UserInfo) => ({
            Load: async (id: string) => {
                loads.push({ ID: id, User: user });
                return orderExists;
            },
        }),
    } as unknown as IMetadataProvider;
    return { fake, loads };
}

function check(input: OrdersCheckOrderLinesEditableInput, p: IMetadataProvider): Promise<OrdersCheckOrderLinesEditableOutput> {
    const op = new CheckOrderLinesEditableOperation() as unknown as CallableOperation;
    return op.InternalExecute(input, p, USER);
}

function recordingVeto(answer: (ctx: OrderLineEditContext) => Promise<string | null>) {
    const seen: OrderLineEditContext[] = [];
    const veto: OrderLineEditVeto = {
        MayEdit: (ctx) => {
            seen.push(ctx);
            return answer(ctx);
        },
    };
    return { veto, seen };
}

afterEach(() => RegisterOrderLineEditVeto(null));

describe('Orders.CheckOrderLinesEditable', () => {
    it('answers null for every kind when no vetoer is registered', async () => {
        const { fake } = provider();
        expect(await check({ OrderHeaderID: ORDER }, fake)).toEqual({
            CreateRefusal: null,
            UpdateRefusal: null,
            DeleteRefusal: null,
        });
    });

    it("returns the vetoer's own words for each kind it refuses", async () => {
        const { veto, seen } = recordingVeto(async (ctx) =>
            ctx.Kind === 'update' ? null : `Closed: no ${ctx.Kind}.`,
        );
        RegisterOrderLineEditVeto(veto);

        const { fake } = provider();
        expect(await check({ OrderHeaderID: ORDER }, fake)).toEqual({
            CreateRefusal: 'Closed: no create.',
            UpdateRefusal: null,
            DeleteRefusal: 'Closed: no delete.',
        });
        // Asked once per kind, of the order, as the caller.
        expect(seen.map((c) => c.Kind).sort()).toEqual(['create', 'delete', 'update']);
        for (const ctx of seen) {
            expect(ctx.OrderHeaderID).toBe(ORDER);
            expect(ctx.OrderLineID).toBeNull();
            expect(ctx.ContextUser).toBe(USER);
        }
    });

    it('turns a vetoer that throws into a refusal naming the fault, never into "editable"', async () => {
        const { veto } = recordingVeto(async () => {
            throw new Error('the deal behind this order could not be read');
        });
        RegisterOrderLineEditVeto(veto);

        const { fake } = provider();
        const result = await check({ OrderHeaderID: ORDER }, fake);
        for (const refusal of [result.CreateRefusal, result.UpdateRefusal, result.DeleteRefusal]) {
            expect(refusal).toContain('the deal behind this order could not be read');
            expect(refusal).toContain('The lines cannot be changed until it can.');
        }
    });

    it('loads the order as the caller before asking', async () => {
        const { veto, seen } = recordingVeto(async () => 'Closed.');
        RegisterOrderLineEditVeto(veto);

        const { fake, loads } = provider();
        await check({ OrderHeaderID: ORDER }, fake);
        expect(loads).toEqual([{ ID: ORDER, User: USER }]);
        expect(seen).toHaveLength(3);
    });

    it('refuses an order the caller cannot load, and does not ask the vetoer about it', async () => {
        const { veto, seen } = recordingVeto(async () => 'Closed.');
        RegisterOrderLineEditVeto(veto);

        const { fake } = provider(false);
        await expect(check({ OrderHeaderID: ORDER }, fake)).rejects.toThrow(/does not exist/);
        expect(seen).toHaveLength(0);
    });

    it('refuses an id that is not a UUID before loading anything', async () => {
        const { fake, loads } = provider();
        await expect(check({ OrderHeaderID: "x' OR 1=1 --" }, fake)).rejects.toThrow();
        expect(loads).toHaveLength(0);
    });
});

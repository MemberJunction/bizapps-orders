/**
 * The veto AS THE ENTITY ACTUALLY RUNS IT — golive#206 item 1, review items 1, 2 and 4.
 *
 * The sibling file, `OrderLineEditVeto.test.ts`, exercises the registry and the resolve helper
 * directly. Fourteen tests, all green, and none of them ran a line of `OrderLineEntityServer`. That is
 * how the delete path shipped broken: it set `this.LatestResult.Success`, and core returns **null**
 * from that getter when the result history is empty — while TYPING it as non-null, so neither the
 * compiler nor any test objected. The history is empty on exactly the entity that path receives,
 * because the delete resolver loads a line and deletes it without ever saving. The refusal arrived as
 * a TypeError.
 *
 * So these drive the class. `Object.create` matches `OrderLineRemoval.test.ts`, which is the
 * established way to hold one of these server entities without standing up metadata; the property
 * initialisers do not run, which is itself faithful to the case that broke — `BypassExternalEditVeto`
 * is `undefined` rather than `false`, and the guard has to treat that as "not bypassed".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RegisterOrderLineEditVeto, type OrderLineEditContext } from '@mj-biz-apps/orders-entities';
import { OrderLineEntityServer } from '../OrderLineEntityServer.js';
import { ValidationResult } from '@memberjunction/core';

const ORDER = 'a1b2c3d4-0000-4000-8000-000000000001';
const LINE = 'a1b2c3d4-0000-4000-8000-000000000002';
const USER = { ID: 'user-1' };
const FROZEN = 'This deal is closed. Reopen it to change what was sold.';

/** The private surface these tests drive, plus the flag Orders' own writers set. */
type LineUnderTest = {
    refuseVetoedEdit(result: ValidationResult, kind: 'create' | 'update'): Promise<void>;
    Delete(): Promise<boolean>;
    LatestResult: { Success: boolean; Message: string } | null;
    BypassExternalEditVeto?: boolean;
};

function line(opts: { isSaved: boolean; bypass?: boolean }): LineUnderTest {
    const instance = Object.create(OrderLineEntityServer.prototype) as LineUnderTest;
    // ALL shadowed, none assigned. `OrderHeaderID` and `ID` are generated ACCESSORS that route
    // through BaseEntity.Set -> GetFieldByName, so assigning to them needs a loaded field map;
    // defineProperty puts a plain value in front of the accessor instead.
    Object.defineProperty(instance, 'OrderHeaderID', { value: ORDER, writable: true });
    Object.defineProperty(instance, 'ID', { value: LINE, writable: true });
    Object.defineProperty(instance, 'IsSaved', { value: opts.isSaved, writable: true });
    Object.defineProperty(instance, 'ContextCurrentUser', { value: USER, writable: true });
    Object.defineProperty(instance, 'Fields', { value: [], writable: true });
    // The result history is initialised in the CONSTRUCTOR, which Object.create skips, and
    // `RegisterResultHistoryEntry` pushes onto it. A real entity from GetEntityObject has one; this
    // has to be given one, or the delete path throws for a reason that has nothing to do with the veto.
    Object.defineProperty(instance, '_resultHistory', { value: [], writable: true });
    if (opts.bypass) instance.BypassExternalEditVeto = true;
    return instance;
}

/** Records the question as well as supplying the answer. */
function veto(answer: string | null) {
    const seen: OrderLineEditContext[] = [];
    RegisterOrderLineEditVeto({
        MayEdit: async (ctx) => {
            seen.push(ctx);
            return answer;
        },
    });
    return seen;
}

afterEach(() => RegisterOrderLineEditVeto(null));

describe('a refused edit, through the entity', () => {
    it('fails validation on a CREATE and carries the refusal message', async () => {
        veto(FROZEN);
        const result = new ValidationResult();
        result.Success = true;
        await line({ isSaved: false }).refuseVetoedEdit(result, 'create');

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Message)).toContain(FROZEN);
    });

    it('fails validation on an UPDATE, which is the case the tester actually hit', async () => {
        veto(FROZEN);
        const result = new ValidationResult();
        result.Success = true;
        await line({ isSaved: true }).refuseVetoedEdit(result, 'update');

        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Message)).toContain(FROZEN);
    });

    it('hands the vetoer a user to run its own lookup as', async () => {
        // Without this the vetoer queries as nobody or reaches for a system user and skips RLS — and
        // because a throwing vetoer is treated as a refusal, a lookup that fails for want of a user
        // would refuse EVERY line edit on EVERY order.
        const seen = veto(null);
        const result = new ValidationResult();
        result.Success = true;
        await line({ isSaved: true }).refuseVetoedEdit(result, 'update');

        expect(seen).toHaveLength(1);
        expect(seen[0].ContextUser).toBe(USER);
        expect(seen[0].OrderHeaderID).toBe(ORDER);
    });
});

describe('a refused DELETE reports rather than throws', () => {
    it('returns false and leaves the reason where a caller reads it', async () => {
        // THE REGRESSION. Assigning onto `LatestResult` threw here, because the history is empty on a
        // line that was loaded and never saved — which is every line the delete resolver hands over.
        veto(FROZEN);
        const entity = line({ isSaved: true });

        const deleted = await entity.Delete();

        expect(deleted, 'the delete must be stopped').toBe(false);
        expect(entity.LatestResult, 'and a result must exist to read it from').not.toBeNull();
        expect(entity.LatestResult?.Success).toBe(false);
        expect(entity.LatestResult?.Message).toBe(FROZEN);
    });
});

describe("Orders' own writes are not what an external app froze", () => {
    it('lets a marked write past the check without asking', async () => {
        // Orders saves lines constantly after a deal is won — fulfilment, the journal entry id,
        // bundle ripples, the cancel reversal. The vetoer cannot tell those from a person typing in a
        // grid, so the distinction is made here, and `MarkAsOrdersOwnWrite` is what makes it.
        const seen = veto(FROZEN);
        const result = new ValidationResult();
        result.Success = true;
        await line({ isSaved: true, bypass: true }).refuseVetoedEdit(result, 'update');

        expect(result.Success, 'Orders fulfilling its own order must not be refused').toBe(true);
        expect(seen, 'and the vetoer should not even be asked').toHaveLength(0);
    });

    it('still asks when the flag is absent rather than false', async () => {
        // `Object.create` skips the initialiser, so the flag is `undefined` here — the guard has to
        // read that as "not bypassed" rather than trusting a boolean that was never assigned.
        const seen = veto(FROZEN);
        const result = new ValidationResult();
        result.Success = true;
        const entity = line({ isSaved: true });
        expect(entity.BypassExternalEditVeto, 'the premise of this test').toBeUndefined();

        await entity.refuseVetoedEdit(result, 'update');
        expect(result.Success).toBe(false);
        expect(seen).toHaveLength(1);
    });
});

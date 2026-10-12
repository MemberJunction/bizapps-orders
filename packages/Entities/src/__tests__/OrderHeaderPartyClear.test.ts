/**
 * Clearing a party person on an order — bc-aidp-next-golive#254.
 *
 * Picking a bill-to person copies them into an empty ship-to and stamps their employer as the
 * organization on each side. Clearing the person left those copies behind, and the server save's
 * party defaults then copied the ship-to person straight back into the bill-to, so the clear
 * never reached the database.
 *
 * On a saved order nothing records which organization a default stamped, so the cleared
 * person's employer is cleared by the rule that stamps it, and the form offers an undo
 * (bizapps-orders#356).
 *
 * Each test drives the real entity methods in the order the form and the server call them:
 * pick → (clear | replace) → server save.
 */
import { describe, expect, it, vi } from 'vitest';
import { DescribeClearedEmployers, OrderHeaderEntity, type PartyOrganizationClear } from '../OrderHeaderEntity';

const PERSON = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_PERSON = 'aaaaaaaa-0000-4000-8000-000000000002';
const EMPLOYER = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_EMPLOYER = 'bbbbbbbb-0000-4000-8000-000000000002';
const CHOSEN_ORG = 'cccccccc-0000-4000-8000-000000000001';

type Values = Record<string, unknown>;

/**
 * An order with the real prototype over a plain value store. `onDisk` is what a loaded order
 * read from the database, and is what each field reports as its `OldValue`.
 */
function order(options: { onDisk?: Values; employers?: Record<string, string> } = {}) {
    const onDisk: Values = { Status: 'Draft', OrderDate: '2026-09-25', ...options.onDisk };
    const values: Values = { ...onDisk };
    const employers = options.employers ?? { [PERSON]: EMPLOYER, [OTHER_PERSON]: OTHER_EMPLOYER };

    const o = Object.create(OrderHeaderEntity.prototype) as OrderHeaderEntity;
    Object.defineProperty(o, 'partyFills', { value: new Map() });
    Object.defineProperty(o, 'partyCopiesCleared', { value: new Set() });
    Object.defineProperty(o, 'Get', { value: (f: string) => values[f] ?? null });
    Object.defineProperty(o, 'Set', { value: (f: string, v: unknown) => { values[f] = v; } });
    Object.defineProperty(o, 'GetFieldByName', {
        value: (f: string) => ({
            Value: values[f] ?? null,
            OldValue: onDisk[f] ?? null,
            Dirty: (values[f] ?? null) !== (onDisk[f] ?? null),
        }),
    });
    Object.defineProperty(o, 'ProviderToUse', {
        value: {
            RunView: vi.fn(async (params: { ExtraFilter: string }) => {
                const person = /FromPersonID='([^']+)'/.exec(params.ExtraFilter)?.[1] ?? '';
                const org = employers[person];
                return { Success: true, Results: org ? [{ ToOrganizationID: org }] : [] };
            }),
        },
    });
    Object.defineProperty(o, 'ContextCurrentUser', { value: { ID: 'user-1' } });
    /** What a successful save leaves behind: the values are now what is on disk. */
    const commit = () => Object.assign(onDisk, values);
    return { o, values, commit };
}

/** What the order form does when the user changes a person field (MJ's form field has already set it). */
async function changePerson(o: OrderHeaderEntity, side: 'BillTo' | 'ShipTo', personID: string | null): Promise<PartyOrganizationClear[]> {
    const old = o.Get(`${side}PersonID`) as string | null;
    o.Set(`${side}PersonID`, personID);
    o.Set(`${side}Person`, personID ? `Name of ${personID}` : '');
    const cleared = await o.ClearPersonParty(side, old);
    if (personID) await o.ApplyPersonPartyDefaults(side);
    return cleared;
}

/** What `OrderEntityServer.Save()` runs before writing. */
const serverSave = (o: OrderHeaderEntity) => o.ApplySavePartyDefaults();

describe('clearing the bill-to person on a new order', () => {
    it('stays cleared through the server save', async () => {
        const { o, values } = order();
        await changePerson(o, 'BillTo', PERSON);
        await changePerson(o, 'BillTo', null);
        await serverSave(o);

        expect(values.BillToPersonID).toBeNull();
    });

    it('takes the copied ship-to person and both stamped organizations with it', async () => {
        const { o, values } = order();
        await changePerson(o, 'BillTo', PERSON);
        expect(values).toMatchObject({ ShipToPersonID: PERSON, BillToOrganizationID: EMPLOYER, ShipToOrganizationID: EMPLOYER });

        await changePerson(o, 'BillTo', null);

        expect(values).toMatchObject({ ShipToPersonID: null, BillToOrganizationID: null, ShipToOrganizationID: null });
    });

    it('keeps an organization the user chose before picking the person', async () => {
        const { o, values } = order({ onDisk: { BillToOrganizationID: CHOSEN_ORG } });
        await changePerson(o, 'BillTo', PERSON);
        await changePerson(o, 'BillTo', null);

        expect(values.BillToOrganizationID).toBe(CHOSEN_ORG);
    });

    it('keeps a ship-to person the user set to someone else', async () => {
        const { o, values } = order();
        await changePerson(o, 'ShipTo', OTHER_PERSON);
        await changePerson(o, 'BillTo', PERSON);
        await changePerson(o, 'BillTo', null);

        expect(values.ShipToPersonID).toBe(OTHER_PERSON);
        expect(values.ShipToOrganizationID).toBe(OTHER_EMPLOYER);
    });

    it('keeps a stamped organization while its side still holds the person', async () => {
        // Ship-to picked first and copied into bill-to; clearing the bill-to copy leaves the
        // ship-to side, which still holds the person, with its employer.
        const { o, values } = order();
        await changePerson(o, 'ShipTo', PERSON);
        await changePerson(o, 'BillTo', null);

        expect(values).toMatchObject({ ShipToPersonID: PERSON, ShipToOrganizationID: EMPLOYER, BillToOrganizationID: null });
    });
});

describe('replacing the bill-to person', () => {
    it('brings the new person\'s copy and employer instead of keeping the old ones', async () => {
        const { o, values } = order();
        await changePerson(o, 'BillTo', PERSON);
        await changePerson(o, 'BillTo', OTHER_PERSON);

        expect(values).toMatchObject({
            BillToPersonID: OTHER_PERSON, ShipToPersonID: OTHER_PERSON,
            BillToOrganizationID: OTHER_EMPLOYER, ShipToOrganizationID: OTHER_EMPLOYER,
        });
    });
});

describe('clearing the bill-to person on a saved order', () => {
    const saved = { BillToPersonID: PERSON, ShipToPersonID: PERSON, BillToOrganizationID: EMPLOYER, ShipToOrganizationID: EMPLOYER };

    it('stays cleared through the server save and clears the matching ship-to person', async () => {
        const { o, values } = order({ onDisk: saved });
        await changePerson(o, 'BillTo', null);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: null, ShipToPersonID: null });
    });

    it('clears the organizations that are the person\'s employer, and reports them for undo (#356)', async () => {
        const { o, values } = order({ onDisk: saved });
        const cleared = await changePerson(o, 'BillTo', null);
        await serverSave(o);

        expect(values).toMatchObject({ BillToOrganizationID: null, ShipToOrganizationID: null });
        expect(cleared).toEqual([
            { Field: 'BillToOrganizationID', OrganizationID: EMPLOYER },
            { Field: 'ShipToOrganizationID', OrganizationID: EMPLOYER },
        ]);
    });

    it('keeps an organization that is not the person\'s employer', async () => {
        const { o, values } = order({ onDisk: { ...saved, BillToOrganizationID: CHOSEN_ORG } });
        const cleared = await changePerson(o, 'BillTo', null);

        expect(values.BillToOrganizationID).toBe(CHOSEN_ORG);
        expect(cleared).toEqual([{ Field: 'ShipToOrganizationID', OrganizationID: EMPLOYER }]);
    });

    it('keeps the ship-to organization while the ship-to holds someone else', async () => {
        const { o, values } = order({
            onDisk: { ...saved, ShipToPersonID: OTHER_PERSON, ShipToOrganizationID: EMPLOYER },
            employers: { [PERSON]: EMPLOYER, [OTHER_PERSON]: EMPLOYER },
        });
        await changePerson(o, 'BillTo', null);

        expect(values).toMatchObject({ ShipToPersonID: OTHER_PERSON, ShipToOrganizationID: EMPLOYER, BillToOrganizationID: null });
    });

    it('undo puts the organizations back, and the server save keeps them', async () => {
        const { o, values } = order({ onDisk: saved });
        const cleared = await changePerson(o, 'BillTo', null);
        o.RestorePartyOrganizations(cleared);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: null, BillToOrganizationID: EMPLOYER, ShipToOrganizationID: EMPLOYER });
    });
});

describe('the cleared-employer notice', () => {
    const names = { BillToOrganizationID: 'Example Co', ShipToOrganizationID: 'Example Co' };

    it('names the organization and the sides it left', () => {
        expect(DescribeClearedEmployers([{ Field: 'BillToOrganizationID', OrganizationID: EMPLOYER }], names)).toBe(
            "Removed Example Co as the bill-to organization: it is the previous person's employer.",
        );
        expect(DescribeClearedEmployers([
            { Field: 'BillToOrganizationID', OrganizationID: EMPLOYER },
            { Field: 'ShipToOrganizationID', OrganizationID: EMPLOYER },
        ], names)).toBe("Removed Example Co as the bill-to and ship-to organization: it is the previous person's employer.");
    });
});

describe('the server save', () => {
    it('does not refill a bill-to person cleared in this save, even with a ship-to person set', async () => {
        // A writer that is not the form — an API call or a workflow — clears only the bill-to.
        const { o, values } = order({ onDisk: { BillToPersonID: PERSON, ShipToPersonID: OTHER_PERSON } });
        o.Set('BillToPersonID', null);
        await serverSave(o);

        expect(values.BillToPersonID).toBeNull();
    });

    it('does not restamp an organization cleared in this save', async () => {
        const { o, values } = order({ onDisk: { BillToPersonID: PERSON, BillToOrganizationID: EMPLOYER } });
        o.Set('BillToOrganizationID', null);
        await serverSave(o);

        expect(values.BillToOrganizationID).toBeNull();
    });

    it('still fills an empty ship-to from the bill-to on a new order', async () => {
        const { o, values } = order();
        o.Set('BillToPersonID', PERSON);
        await serverSave(o);

        expect(values).toMatchObject({ ShipToPersonID: PERSON, BillToOrganizationID: EMPLOYER, ShipToOrganizationID: EMPLOYER });
    });
});

describe('a later save', () => {
    it('does not refill a bill-to person cleared by an earlier save', async () => {
        const { o, values, commit } = order({ onDisk: { BillToPersonID: PERSON, ShipToPersonID: OTHER_PERSON } });
        await changePerson(o, 'BillTo', null);
        await serverSave(o);
        commit();

        o.Set('Notes', 'edited');
        await serverSave(o);
        commit();
        o.Set('Status', 'Quoted');
        await serverSave(o);

        expect(values.BillToPersonID).toBeNull();
    });

    it('does not refill a ship-to person cleared by an earlier save', async () => {
        const { o, values, commit } = order({ onDisk: { BillToPersonID: PERSON, ShipToPersonID: PERSON } });
        await changePerson(o, 'ShipTo', null);
        await serverSave(o);
        commit();

        o.Set('Notes', 'edited');
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: PERSON, ShipToPersonID: null });
    });

    it('does not restamp an organization cleared by an earlier save', async () => {
        const { o, values } = order({ onDisk: { BillToPersonID: PERSON, BillToOrganizationID: null } });
        o.Set('Notes', 'edited');
        await serverSave(o);

        expect(values.BillToOrganizationID).toBeNull();
    });
});

describe('the ship-to person is never copied into the bill-to by the server save', () => {
    it('leaves a new order\'s cleared bill-to empty when the user set the ship-to', async () => {
        const { o, values } = order();
        await changePerson(o, 'ShipTo', OTHER_PERSON);
        await changePerson(o, 'BillTo', PERSON);
        await changePerson(o, 'BillTo', null);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: null, ShipToPersonID: OTHER_PERSON });
    });
});

describe('replacing the bill-to person on a saved order', () => {
    const saved = { BillToPersonID: PERSON, ShipToPersonID: PERSON };

    it('copies the new person into the ship-to', async () => {
        const { o, values } = order({ onDisk: saved });
        await changePerson(o, 'BillTo', OTHER_PERSON);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: OTHER_PERSON, ShipToPersonID: OTHER_PERSON });
    });

    it('bills the new person\'s employer, not the previous person\'s (#356)', async () => {
        const { o, values } = order({ onDisk: { ...saved, BillToOrganizationID: EMPLOYER, ShipToOrganizationID: EMPLOYER } });
        await changePerson(o, 'BillTo', OTHER_PERSON);
        await serverSave(o);

        expect(values).toMatchObject({ BillToOrganizationID: OTHER_EMPLOYER, ShipToOrganizationID: OTHER_EMPLOYER });
    });

    it('copies the new person when the old one is cleared first', async () => {
        const { o, values } = order({ onDisk: saved });
        await changePerson(o, 'BillTo', null);
        await changePerson(o, 'BillTo', OTHER_PERSON);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: OTHER_PERSON, ShipToPersonID: OTHER_PERSON });
    });

    it('leaves a ship-to the user emptied in this edit empty', async () => {
        const { o, values } = order({ onDisk: saved });
        await changePerson(o, 'ShipTo', null);
        await changePerson(o, 'BillTo', OTHER_PERSON);
        await serverSave(o);

        expect(values).toMatchObject({ BillToPersonID: OTHER_PERSON, ShipToPersonID: null });
    });
});

import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    IsPeopleEntity,
    LinkedPersonRecordID,
    PEOPLE_ENTITY,
    ResolvePersonIDForUser,
    ResolvePersonIDsForUsers,
    ResolveUserIDForPerson,
    ResolveUserIDsForPeople,
} from '../person-user-link.js';

const PEOPLE_ID = 'E0000000-0000-4000-8000-000000000001';
const PLATFORM_PEOPLE_ID = 'E0000000-0000-4000-8000-000000000002';
const OTHER_ENTITY_ID = 'E0000000-0000-4000-8000-000000000003';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const PERSON_A = 'A0000000-0000-4000-8000-00000000000A';
const PERSON_B = 'B0000000-0000-4000-8000-00000000000B';

function entity(id: string, name: string, parents: EntityInfo[] = []): EntityInfo {
    return { ID: id, Name: name, ParentChain: parents } as unknown as EntityInfo;
}
const people = entity(PEOPLE_ID, PEOPLE_ENTITY);
const platformPeople = entity(PLATFORM_PEOPLE_ID, 'Platform: People', [people]);
const other = entity(OTHER_ENTITY_ID, 'Employees');

/** A provider that answers each read from `answer` and records the params it was given. */
function providerOver(answer: (params: RunViewParams) => object[] | null): { provider: IMetadataProvider; calls: RunViewParams[] } {
    const calls: RunViewParams[] = [];
    const runView = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        calls.push(params);
        const rows = answer(params);
        if (!rows) return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'the read failed' };
        return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    };
    const entities = [people, platformPeople, other];
    const provider = {
        Entities: entities,
        EntityByID: (id: string) => entities.find((e) => e.ID.toLowerCase() === id.toLowerCase()),
        RunView: runView,
    } as unknown as IMetadataProvider;
    return { provider, calls };
}

function user(linkedEntityID: string | null, linkedRecordID: string | null): UserInfo {
    return { ID: USER_ID, LinkedEntityID: linkedEntityID, LinkedEntityRecordID: linkedRecordID } as unknown as UserInfo;
}

describe('IsPeopleEntity', () => {
    it('accepts People and its IS-A subtypes, and nothing else', () => {
        expect(IsPeopleEntity(people)).toBe(true);
        expect(IsPeopleEntity(platformPeople)).toBe(true);
        expect(IsPeopleEntity(other)).toBe(false);
        expect(IsPeopleEntity(undefined)).toBe(false);
    });
});

describe('LinkedPersonRecordID', () => {
    it('reads the record ID when the user links to a People subtype', () => {
        const { provider } = providerOver(() => []);
        expect(LinkedPersonRecordID(user(PLATFORM_PEOPLE_ID, PERSON_A), provider)).toBe(PERSON_A);
    });
    it('ignores a link to another entity, or a record ID that is not a UUID', () => {
        const { provider } = providerOver(() => []);
        expect(LinkedPersonRecordID(user(OTHER_ENTITY_ID, PERSON_A), provider)).toBeNull();
        expect(LinkedPersonRecordID(user(PEOPLE_ID, "x' OR 1=1 --"), provider)).toBeNull();
        expect(LinkedPersonRecordID(user(null, null), provider)).toBeNull();
    });
});

describe('ResolvePersonIDForUser', () => {
    it('finds the Person through the user link when LinkedUserID is empty', async () => {
        const { provider, calls } = providerOver((p) => (String(p.ExtraFilter).includes(`ID = '${PERSON_A}'`) ? [{ ID: PERSON_A }] : []));
        expect(await ResolvePersonIDForUser(user(PLATFORM_PEOPLE_ID, PERSON_A), provider)).toBe(PERSON_A);
        expect(calls[0].ExtraFilter).not.toContain('LinkedUserID');
    });
    it('falls back to LinkedUserID for a user with no People link', async () => {
        const { provider, calls } = providerOver(() => [{ ID: PERSON_B }]);
        expect(await ResolvePersonIDForUser(user(OTHER_ENTITY_ID, PERSON_A), provider)).toBe(PERSON_B);
        expect(calls[0].ExtraFilter).toBe(`LinkedUserID = '${USER_ID}'`);
    });
    it('adds the Active filter on request', async () => {
        const { provider, calls } = providerOver(() => []);
        expect(await ResolvePersonIDForUser(user(PEOPLE_ID, PERSON_A), provider, undefined, { ActiveOnly: true })).toBeNull();
        expect(calls[0].ExtraFilter).toBe(`ID = '${PERSON_A}' AND Status = 'Active'`);
    });
    it('throws when the lookup fails', async () => {
        const { provider } = providerOver(() => null);
        await expect(ResolvePersonIDForUser(user(null, null), provider)).rejects.toThrow('Person lookup failed');
    });
});

describe('ResolveUserIDsForPeople', () => {
    it('takes the user link first and LinkedUserID for the rest', async () => {
        const { provider, calls } = providerOver((p) => {
            if (p.EntityName === 'MJ: Users') return [{ ID: USER_ID, LinkedEntityRecordID: PERSON_A.toLowerCase() }];
            return [{ ID: PERSON_B, LinkedUserID: OTHER_USER_ID }];
        });
        const found = await ResolveUserIDsForPeople([PERSON_A, PERSON_B, 'not-a-uuid'], provider);
        expect(found.get(PERSON_A.toLowerCase())).toBe(USER_ID);
        expect(found.get(PERSON_B.toLowerCase())).toBe(OTHER_USER_ID);
        expect(found.size).toBe(2);
        expect(calls[0].ExtraFilter).toContain(`'${PEOPLE_ID}', '${PLATFORM_PEOPLE_ID}'`);
        expect(calls[0].ExtraFilter).not.toContain(OTHER_ENTITY_ID);
        expect(calls[0].ExtraFilter).not.toContain('not-a-uuid');
        expect(calls[1].ExtraFilter).toBe(`ID IN ('${PERSON_B.toLowerCase()}') AND LinkedUserID IS NOT NULL`);
    });
    it('skips the LinkedUserID read when every Person resolved through a user link', async () => {
        const { provider, calls } = providerOver(() => [{ ID: USER_ID, LinkedEntityRecordID: PERSON_A }]);
        expect(await ResolveUserIDForPerson(PERSON_A, provider)).toBe(USER_ID);
        expect(calls).toHaveLength(1);
    });
    it('keeps the first user per Person, which the read orders active first', async () => {
        const { provider } = providerOver((p) =>
            p.EntityName === 'MJ: Users'
                ? [{ ID: USER_ID, LinkedEntityRecordID: PERSON_A }, { ID: OTHER_USER_ID, LinkedEntityRecordID: PERSON_A }]
                : [],
        );
        expect(await ResolveUserIDForPerson(PERSON_A, provider)).toBe(USER_ID);
    });
    it('reads nothing for an empty or invalid list, and throws when a read fails', async () => {
        const empty = providerOver(() => []);
        expect((await ResolveUserIDsForPeople(['nope'], empty.provider)).size).toBe(0);
        expect(empty.calls).toHaveLength(0);
        const failing = providerOver(() => null);
        await expect(ResolveUserIDsForPeople([PERSON_A], failing.provider)).rejects.toThrow('User lookup failed');
    });
});

describe('ResolvePersonIDsForUsers', () => {
    it('maps linked users through their link and the rest through LinkedUserID', async () => {
        const { provider, calls } = providerOver((p) => {
            if (p.EntityName === 'MJ: Users') {
                return [
                    { ID: USER_ID, LinkedEntityID: PLATFORM_PEOPLE_ID, LinkedEntityRecordID: PERSON_A },
                    { ID: OTHER_USER_ID, LinkedEntityID: null, LinkedEntityRecordID: null },
                ];
            }
            return [{ ID: PERSON_A, LinkedUserID: null }, { ID: PERSON_B, LinkedUserID: OTHER_USER_ID.toUpperCase() }];
        });
        const found = await ResolvePersonIDsForUsers([USER_ID, OTHER_USER_ID, 'bad'], provider, undefined, { ActiveOnly: true });
        expect(found.get(USER_ID)).toBe(PERSON_A);
        expect(found.get(OTHER_USER_ID)).toBe(PERSON_B);
        expect(calls[1].ExtraFilter).toBe(
            `(ID IN ('${PERSON_A.toLowerCase()}') OR LinkedUserID IN ('${OTHER_USER_ID}')) AND Status = 'Active'`,
        );
    });
    it('leaves out a linked user whose Person is missing or inactive, without falling back to LinkedUserID', async () => {
        const { provider } = providerOver((p) =>
            p.EntityName === 'MJ: Users'
                ? [{ ID: USER_ID, LinkedEntityID: PEOPLE_ID, LinkedEntityRecordID: PERSON_A }]
                : [{ ID: PERSON_B, LinkedUserID: USER_ID }],
        );
        expect((await ResolvePersonIDsForUsers([USER_ID], provider)).size).toBe(0);
    });
    it('throws when a read fails', async () => {
        const { provider } = providerOver(() => null);
        await expect(ResolvePersonIDsForUsers([USER_ID], provider)).rejects.toThrow('User lookup failed');
    });
});

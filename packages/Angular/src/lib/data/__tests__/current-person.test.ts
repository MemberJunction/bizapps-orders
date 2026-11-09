import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runView } = vi.hoisted(() => ({ runView: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    RunView: class {
        RunView = runView;
    },
}));

import type { IMetadataProvider } from '@memberjunction/core';
import { ResolveSignedInPersonID } from '../current-person';

const USER = 'B0000000-0000-0000-0000-000000000001';
const PEOPLE_ENTITY = 'A0000000-0000-0000-0000-000000000001';
const MEMBER_ENTITY = 'A0000000-0000-0000-0000-000000000002';
const OTHER_ENTITY = 'A0000000-0000-0000-0000-000000000003';
const PERSON = 'C0000000-0000-0000-0000-000000000001';

function provider(link: { LinkedEntityID?: string; LinkedEntityRecordID?: string } = {}): IMetadataProvider {
    const entities: Record<string, { Name: string; ParentChain: Array<{ Name: string }> }> = {
        [PEOPLE_ENTITY]: { Name: 'MJ_BizApps_Common: People', ParentChain: [] },
        [MEMBER_ENTITY]: { Name: 'Members', ParentChain: [{ Name: 'MJ_BizApps_Common: People' }] },
        [OTHER_ENTITY]: { Name: 'Contacts', ParentChain: [] },
    };
    return {
        CurrentUser: { ID: USER, ...link },
        EntityByID: (id: string) => entities[id],
    } as unknown as IMetadataProvider;
}

const lastFilter = () => runView.mock.calls.at(-1)![0].ExtraFilter as string;

describe('ResolveSignedInPersonID', () => {
    beforeEach(() => {
        runView.mockReset();
        runView.mockResolvedValue({ Success: true, Results: [{ ID: PERSON }] });
    });

    it("reads the user's own People link first", async () => {
        expect(await ResolveSignedInPersonID(provider({ LinkedEntityID: PEOPLE_ENTITY, LinkedEntityRecordID: PERSON }))).toBe(PERSON);
        expect(lastFilter()).toBe(`ID = '${PERSON}' AND Status = 'Active'`);
    });

    it('accepts a link through an IS-A subtype of People', async () => {
        await ResolveSignedInPersonID(provider({ LinkedEntityID: MEMBER_ENTITY, LinkedEntityRecordID: PERSON }));
        expect(lastFilter()).toBe(`ID = '${PERSON}' AND Status = 'Active'`);
    });

    it('falls back to People.LinkedUserID when the user links to something else', async () => {
        await ResolveSignedInPersonID(provider({ LinkedEntityID: OTHER_ENTITY, LinkedEntityRecordID: PERSON }));
        expect(lastFilter()).toBe(`LinkedUserID = '${USER}' AND Status = 'Active'`);
    });

    it('returns null when no active Person matches', async () => {
        runView.mockResolvedValue({ Success: true, Results: [] });
        expect(await ResolveSignedInPersonID(provider())).toBeNull();
    });

    it('returns null with no signed-in user', async () => {
        expect(await ResolveSignedInPersonID({ CurrentUser: undefined } as unknown as IMetadataProvider)).toBeNull();
        expect(runView).not.toHaveBeenCalled();
    });

    it('throws when the lookup fails', async () => {
        runView.mockResolvedValue({ Success: false, ErrorMessage: 'denied', Results: [] });
        await expect(ResolveSignedInPersonID(provider())).rejects.toThrow('denied');
    });
});

/**
 * A referral program's verdict on a concession that names it (golive #268, #529): one rule, read by the
 * concession when it is recorded and by Orders.AmendArrangement's preview.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = (...args: unknown[]) => mockRunView(...args);
        },
    };
});

const { CheckReferralProgram } = await import('../ReferralProgram.js');

const PROGRAM_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';
const ORDER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3402';
const COMPANY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3403';
const OTHER_COMPANY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3404';
const SUBSCRIPTION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3405';
const ctx = { Provider: {} as never, User: { ID: 'user-1' } as never };

type Row = Record<string, unknown>;

/** Answers each RunView by entity: the program, then the order. */
function database(program: Row | null, order: Row | null = { CompanyID: COMPANY_ID }) {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => ({
        Success: true,
        Results: params.EntityName.endsWith('Referral Programs') ? (program ? [program] : []) : order ? [order] : [],
    }));
}

const activeProgram = { CompanyID: COMPANY_ID, Name: 'Refer a peer', DaysPerReferral: 30, IsActive: true };

const request = {
    ReferralProgramID: PROGRAM_ID,
    DeliveryForm: 'Duration',
    ReasonCategory: 'Referral',
    AddedDays: 30,
    OrderHeaderID: ORDER_ID,
    RenewsSubscriptionID: SUBSCRIPTION_ID as string | null,
};

beforeEach(() => {
    mockRunView.mockReset();
});

describe('CheckReferralProgram', () => {
    it('approves days within the program on a renewed term', async () => {
        database(activeProgram);
        expect(await CheckReferralProgram(request, ctx)).toEqual({ ProgramName: 'Refer a peer', DaysPerReferral: 30, InProgram: true });
    });

    it('routes more days than the program grants', async () => {
        database(activeProgram);
        expect(await CheckReferralProgram({ ...request, AddedDays: 31 }, ctx)).toMatchObject({ InProgram: false });
    });

    it('routes an inactive program', async () => {
        database({ ...activeProgram, IsActive: false });
        expect(await CheckReferralProgram(request, ctx)).toMatchObject({ InProgram: false });
    });

    it('refuses a term that was not bought by a renewal', async () => {
        database(activeProgram);
        expect(await CheckReferralProgram({ ...request, RenewsSubscriptionID: null }, ctx)).toMatch(
            /adds its time to the next term, on the renewal order/,
        );
    });

    it('refuses a program of another company', async () => {
        database(activeProgram, { CompanyID: OTHER_COMPANY_ID });
        expect(await CheckReferralProgram(request, ctx)).toMatch(/belongs to another company/);
    });

    it('refuses a reason category other than Referral, before reading anything', async () => {
        expect(await CheckReferralProgram({ ...request, ReasonCategory: 'Retention' }, ctx)).toMatch(/reason category 'Referral'/);
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('refuses a form other than Duration', async () => {
        expect(await CheckReferralProgram({ ...request, DeliveryForm: 'Seats' }, ctx)).toMatch(/only a Duration concession/);
    });

    it('refuses a program that does not exist', async () => {
        database(null);
        expect(await CheckReferralProgram(request, ctx)).toMatch(/was not found/);
    });
});

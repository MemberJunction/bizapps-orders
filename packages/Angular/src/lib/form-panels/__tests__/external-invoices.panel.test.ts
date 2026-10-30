import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Answers handed out in call order: each RunView call takes the next one. */
    answers: [] as Array<{ gate: Promise<void> | null; rows: Array<{ ID: string; Status: string }> }>,
    /** What the issue operation's preview answers. */
    preview: null as { ResultCode: string; Message: string } | null,
}));

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@mj-biz-apps/orders-entities')>()),
    OrdersIssueExternalInvoiceOperation: class {
        async Execute() {
            return { Success: true, Output: { Success: false, ...mocks.preview } };
        }
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class RunView {
        async RunView() {
            const next = mocks.answers.shift()!;
            if (next.gate) await next.gate;
            return { Success: true, Results: next.rows };
        }
    }
    return { ...actual, RunView };
});

import { ExternalInvoicesPanel } from '../external-invoices.panel';

const ORDER = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';

/** A panel with `Record` set and its other reads stubbed, without standing up Angular DI. */
function panel(): ExternalInvoicesPanel {
    const p = Object.create(ExternalInvoicesPanel.prototype) as ExternalInvoicesPanel;
    // Field initialisers do not run under Object.create; set the ones load() reads.
    Object.assign(p, {
        loadSeq: 0,
        Rows: [],
        Selected: null,
        Visible: false,
        LoadError: null,
        SendBlocked: null,
        BilledOnSchedule: false,
        ProviderName: 'Bill.com',
        cdr: { detectChanges: vi.fn() },
        loadRail: vi.fn(async () => ({ Present: true, Name: 'Bill.com' })),
        hasPaymentSchedule: vi.fn(async () => false),
        previewBlock: vi.fn(async () => null),
    });
    (p as unknown as { Record: unknown }).Record = { IsSaved: true, ID: ORDER, Status: 'Confirmed', CompanyID: ORDER };
    return p;
}

const load = (p: ExternalInvoicesPanel) => (p as unknown as { load(): Promise<void> }).load();

beforeEach(() => {
    mocks.answers.length = 0;
});

describe('External invoices panel — overlapping loads', () => {
    it('keeps the newer rows when an older load finishes last', async () => {
        let release!: () => void;
        const slow = new Promise<void>((r) => (release = r));
        mocks.answers.push({ gate: slow, rows: [{ ID: 'old', Status: 'Failed' }] });
        mocks.answers.push({ gate: null, rows: [{ ID: 'new', Status: 'Sent' }] });

        const p = panel();
        const older = load(p);
        // Start the second load once the first is waiting on its invoice read.
        await vi.waitFor(() => expect(mocks.answers).toHaveLength(1));
        await load(p);
        expect(p.Rows.map((r) => r.ID)).toEqual(['new']);

        release();
        await older;
        expect(p.Rows.map((r) => r.ID)).toEqual(['new']);
    });
});

describe('External invoices panel — what the preview blocks', () => {
    const previewBlock = (p: ExternalInvoicesPanel) =>
        (ExternalInvoicesPanel.prototype as unknown as { previewBlock(this: ExternalInvoicesPanel): Promise<string | null> }).previewBlock.call(p);

    it.each(['NO_CUSTOMER_EMAIL', 'RAIL_REFUSED'])('blocks Send on %s, with the operation\'s message', async (code) => {
        mocks.preview = { ResultCode: code, Message: 'No customer on file in SoundPost — Bill.com for Cimatri HoldCo.' };
        expect(await previewBlock(panel())).toBe('No customer on file in SoundPost — Bill.com for Cimatri HoldCo.');
    });

    it('leaves Send enabled for any other refusal', async () => {
        mocks.preview = { ResultCode: 'NOT_INVOICEABLE', Message: 'Nothing is owed.' };
        expect(await previewBlock(panel())).toBeNull();
    });
});

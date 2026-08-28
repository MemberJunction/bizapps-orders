/**
 * @fileoverview #113 — the Product GL-accounts panel must agree with what an order actually books.
 *
 * ── THE BUG THIS EXISTS TO PIN ──
 *
 * The first version of this panel decided "active" with its own window test: status is `Active` and
 * today falls between `StartedAt` and `EndedAt`. That is right for one link and WRONG the moment a role
 * has two — a mapping superseded while the old row is still open, which is what an accountant does when
 * they re-point a product mid-year. Both rows pass a window test, so the panel showed two active
 * accounts for one role while the booking pipeline used exactly one. A screen that disagrees with the
 * booking about where money lands is worse than no screen at all.
 *
 * The fix is not a better window test; it is refusing to have one. `pickActiveLinkIndex` is the pure
 * function behind accounting's own `ResolveLinkedAccount`, exported by that package, and it carries the
 * tie-break this panel has no business restating (latest `StartedAt` wins; a null `StartedAt` loses to
 * any dated one). These checks assert the panel's answer IS the picker's answer — including one that
 * compares them directly, so the two cannot drift apart later.
 */
import { describe, expect, it } from 'vitest';
import { pickActiveLinkIndex } from '@mj-biz-apps/accounting-engine-base';

import { BizAppsProductGLLinksComponent, type ProductGLLinkRow } from '../lib/custom/Product/widgets/product-gl-links.component';

/** The component with a no-op change detector — nothing here touches the view. */
function panel(): BizAppsProductGLLinksComponent {
    return new BizAppsProductGLLinksComponent({ detectChanges: () => undefined } as never);
}

/** Reaches the private resolver. Deliberate: it is internal, and it is the thing worth pinning. */
function inForce(rows: Array<Record<string, unknown>>): Set<string> {
    return (panel() as unknown as { inForceIDs(r: Array<Record<string, unknown>>): Set<string> }).inForceIDs(rows);
}

const REVENUE = 'role-revenue';
const DEFERRED = 'role-deferred';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const PAST = day('2020-01-01');
const RECENT = day('2026-01-01');
const FUTURE = day('2099-01-01');

function link(over: Partial<Record<string, unknown>> & { ID: string }): Record<string, unknown> {
    return {
        GLAccountRoleID: REVENUE,
        Status: 'Active',
        StartedAt: null,
        EndedAt: null,
        ...over,
    };
}

describe('#113 — which GL link the product panel calls active', () => {
    it('a single open-ended Active link is in force', () => {
        expect([...inForce([link({ ID: 'a' })])]).toEqual(['a']);
    });

    it('TWO Active links on one role resolve to ONE — the later StartedAt wins', () => {
        // The defect this file exists for. A window test marks both; the booking uses one.
        const rows = [
            link({ ID: 'old', StartedAt: PAST }),
            link({ ID: 'new', StartedAt: RECENT }),
        ];
        const winners = inForce(rows);
        expect(winners.size, 'exactly one link may be in force for a role').toBe(1);
        expect([...winners]).toEqual(['new']);
    });

    it('a dated StartedAt beats a null one, which is accounting\'s tie-break and not ours', () => {
        const winners = inForce([link({ ID: 'undated' }), link({ ID: 'dated', StartedAt: PAST })]);
        expect([...winners]).toEqual(['dated']);
    });

    it('two different ROLES are both in force — they do not compete', () => {
        const winners = inForce([
            link({ ID: 'rev' }),
            link({ ID: 'def', GLAccountRoleID: DEFERRED }),
        ]);
        expect(winners.size).toBe(2);
    });

    it('a link that has not started, or has ended, is not in force', () => {
        expect(inForce([link({ ID: 'later', StartedAt: FUTURE })]).size).toBe(0);
        expect(inForce([link({ ID: 'over', EndedAt: PAST })]).size).toBe(0);
    });

    it('a Disabled link is never in force, however open its window', () => {
        expect(inForce([link({ ID: 'disabled', Status: 'Disabled' })]).size).toBe(0);
    });

    it('an open window on both sides means "always has, still does"', () => {
        expect(inForce([link({ ID: 'always', StartedAt: null, EndedAt: null })]).size).toBe(1);
    });

    /**
     * THE ANTI-DRIFT CHECK. The others describe the behaviour; this one asserts the panel and the
     * booking pipeline give the SAME answer, so re-implementing the rule here later fails loudly
     * instead of quietly disagreeing about money.
     */
    it('agrees with accounting\'s own picker on the same candidates', () => {
        const rows = [
            link({ ID: 'a', StartedAt: PAST }),
            link({ ID: 'b', StartedAt: RECENT }),
            link({ ID: 'c', StartedAt: RECENT, EndedAt: PAST }),
            link({ ID: 'd', Status: 'Disabled' }),
        ];
        const mine = inForce(rows);

        const idx = pickActiveLinkIndex(
            rows.map((r) => ({
                Status: String(r.Status),
                StartedAt: r.StartedAt as Date | null,
                EndedAt: r.EndedAt as Date | null,
            })),
            new Date(),
        );

        expect(idx, 'the picker must find a winner for this set').toBeGreaterThanOrEqual(0);
        expect([...mine]).toEqual([String(rows[idx].ID)]);
    });
});

describe('#113 — the write half refuses to act on an incomplete draft', () => {
    /** A component with a product attached, as the form would supply it. */
    function withProduct(product: unknown): BizAppsProductGLLinksComponent {
        const c = panel();
        (c as unknown as { Product: unknown }).Product = product;
        return c;
    }

    it('offers writing only on a SAVED product', () => {
        // RecordID stores the product's primary key, so there is nothing to point at until the record
        // exists. Same reason sales blocks Add line on an unsaved deal instead of failing at save time.
        expect(withProduct({ ID: 'p1', IsSaved: true }).CanWrite).toBe(true);
        expect(withProduct({ ID: 'p1', IsSaved: false }).CanWrite).toBe(false);
        expect(withProduct({ ID: '', IsSaved: true }).CanWrite).toBe(false);
        expect(panel().CanWrite, 'no product at all').toBe(false);
    });

    it('opens a draft dated today in UTC, and closing it clears the error', () => {
        const c = withProduct({ ID: 'p1', IsSaved: true });
        (c as unknown as { WriteError: string | null }).WriteError = 'previous refusal';
        c.OpenDraft();

        expect(c.Draft, 'opening must produce a draft').toBeTruthy();
        expect(c.WriteError, 'opening clears a stale refusal from a previous attempt').toBeNull();

        // UTC, not local. The window is stored and rendered in UTC, and a local date would put the
        // start a day out for anyone west of Greenwich — the same defect the From/To columns had.
        const now = new Date();
        const utc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
        expect(c.Draft?.StartedAt).toBe(utc);

        c.CancelDraft();
        expect(c.Draft).toBeNull();
        expect(c.WriteError).toBeNull();
    });

    it('does nothing when the draft is missing a role or an account', async () => {
        // The guard matters because the alternative is a link with a null FK reaching the server and
        // being refused there — a round trip, and an error about a column instead of about the form.
        const c = withProduct({ ID: 'p1', IsSaved: true });

        for (const draft of [
            { RoleID: '', AccountID: 'a1', StartedAt: '2026-01-01' },
            { RoleID: 'r1', AccountID: '', StartedAt: '2026-01-01' },
        ]) {
            c.Draft = { ...draft };
            (c as unknown as { WriteError: string | null }).WriteError = null;
            await c.AddLink();

            expect(c.Draft, 'an incomplete draft stays open rather than being silently discarded').toBeTruthy();
            // WriteError, not Saving. `Saving` is reset in a `finally`, so it reads false whether the
            // guard returned early or the attempt ran and failed — the assertion could not tell the two
            // apart, and a mutation removing the guard passed against it. A guarded call never reaches
            // the try block at all, so it cannot have recorded an error.
            expect(
                c.WriteError,
                'the guard means no attempt was made, so there is nothing to report',
            ).toBeNull();
        }
    });

    it('does nothing when there is no product to point at', async () => {
        const c = panel();
        c.Draft = { RoleID: 'r1', AccountID: 'a1', StartedAt: '2026-01-01' };
        await c.AddLink();
        expect(c.Saving).toBe(false);
    });
});

describe('#113 — retire versus remove, and the boundary between them', () => {
    const utcToday = () => {
        const n = new Date();
        return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
    };
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'x', RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: true, ...over,
    });

    it('a link starting TODAY has explained nothing yet', () => {
        // This is the case that made the hole: the server refuses an end date on or before the start,
        // so a link mistyped today can only be undone by removing it.
        expect(panel().HasApplied(row({ StartedAt: utcToday() }))).toBe(false);
    });

    it('a link starting in the PAST is assumed to have booked something — in BOTH shapes', () => {
        // BOTH, because that is what the first version got wrong. StartedAt arrives as a Date from the
        // engine cache and as an ISO string from the view fallback; the string-slicing version read
        // "Wed Jan 01" out of a Date, compared it as text against "2026-08-28", and reported a link
        // from 2020 as never having applied — offering Remove on six years of history. The original
        // test used only the string shape, which is the one the bug did not have.
        expect(panel().HasApplied(row({ StartedAt: '2020-01-01' })), 'ISO string').toBe(true);
        expect(
            panel().HasApplied(row({ StartedAt: new Date('2020-01-01T00:00:00.000Z') as unknown as string })),
            'Date object — the shape the engine cache supplies',
        ).toBe(true);
    });

    it('handles the Date shape for a same-day link too', () => {
        const n = new Date();
        const todayUtc = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
        expect(panel().HasApplied(row({ StartedAt: todayUtc as unknown as string }))).toBe(false);
    });

    it('an unreadable date is assumed to have applied rather than offered for deletion', () => {
        expect(panel().HasApplied(row({ StartedAt: 'not-a-date' }))).toBe(true);
    });

    it('a NULL start is the widest claim there is, so it counts as applied', () => {
        // pickActiveLinkIndex reads a null StartedAt as "always has", so treating it as never-applied
        // would let the one link with the broadest window be deleted outright.
        expect(panel().HasApplied(row({ StartedAt: null }))).toBe(true);
    });

    it('a future-dated link has not applied either', () => {
        expect(panel().HasApplied(row({ StartedAt: '2099-01-01' }))).toBe(false);
    });

    it('RemoveLink refuses a link that HAS applied, whatever the template offers', () => {
        // The guard lives in the method as well as the template, so a stale render cannot delete
        // history by being clicked a moment after the boundary moved.
        const c = panel();
        const before = c.Saving;
        void c.RemoveLink(row({ StartedAt: '2020-01-01' }));
        expect(c.Saving, 'no write was even started').toBe(before);
    });
});

describe('#113 — editing, and how much of a link may change', () => {
    const utcToday = () => {
        const n = new Date();
        return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
    };
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'link-1', RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: true, ...over,
    });
    function ready(): BizAppsProductGLLinksComponent {
        const c = panel();
        (c as unknown as { Product: unknown }).Product = { ID: 'p1', IsSaved: true };
        c.Roles = [{ ID: 'role-rev', Name: 'Revenue' }];
        c.Accounts = [{ ID: 'acct-4000', Label: '4000 Sales — Blue Cypress' }];
        return c;
    }

    it('a NOT-YET-APPLIED link opens fully editable', () => {
        const c = ready();
        c.OpenEdit(row({ StartedAt: utcToday() }));
        expect(c.Editing?.Applied, 'nothing has booked through it').toBe(false);
        // Role and account resolve back to ids so the pickers open on the CURRENT values rather than
        // blank — a blank picker on an edit reads as "this link has no account".
        expect(c.Editing?.RoleID).toBe('role-rev');
        expect(c.Editing?.AccountID).toBe('acct-4000');
        expect(c.Editing?.StartedAt).toBe(utcToday());
    });

    it('an APPLIED link opens marked so only its end date may change', () => {
        const c = ready();
        c.OpenEdit(row({ StartedAt: '2020-01-01' }));
        expect(
            c.Editing?.Applied,
            'it has been the reason journal entries name their account; its identity is history',
        ).toBe(true);
    });

    it('opening an edit closes the add draft, so only one form is live', () => {
        const c = ready();
        c.OpenDraft();
        expect(c.Draft).toBeTruthy();
        c.OpenEdit(row({ StartedAt: utcToday() }));
        expect(c.Draft, 'two open forms would leave it ambiguous which Save applies').toBeNull();
        c.CancelEdit();
        expect(c.Editing).toBeNull();
    });

    it('reads dates back in UTC, from either shape', () => {
        const c = ready();
        c.OpenEdit(row({ StartedAt: '2020-01-01', EndedAt: new Date('2026-03-04T00:00:00.000Z') as unknown as string }));
        // An <input type="date"> takes yyyy-MM-dd and renders a Date as BLANK with no error, so the
        // conversion has to happen here — and in UTC, or the day slips west of Greenwich.
        expect(c.Editing?.StartedAt).toBe('2020-01-01');
        expect(c.Editing?.EndedAt).toBe('2026-03-04');
    });

    it('a null end date becomes an empty input, which is what clears it again', () => {
        const c = ready();
        c.OpenEdit(row({ StartedAt: '2020-01-01', EndedAt: null }));
        expect(c.Editing?.EndedAt).toBe('');
    });

    it('SaveEdit does nothing when no edit is open', async () => {
        const c = ready();
        await c.SaveEdit();
        expect(c.WriteError, 'no attempt was made, so there is nothing to report').toBeNull();
    });
});

describe('#113 — the sentence a refused write shows', () => {
    /** Reaches the private extractor with a stand-in entity carrying just LatestResult. */
    function readable(completeMessage: string | null | undefined): string | null {
        const c = panel() as unknown as { readableError(e: unknown): string | null };
        return c.readableError({ LatestResult: { CompleteMessage: completeMessage } });
    }

    it('pulls the Message out of a validation blob', () => {
        // This is the real one, observed on a refused retire: showing it verbatim buries the only
        // sentence that says what to do inside JSON punctuation.
        const raw = JSON.stringify({
            Source: 'EndedAt',
            Message: 'The end date must be after the start date.',
            Value: '2026-08-28T00:00:00.000Z',
            Type: 'Failure',
        });
        expect(readable(raw)).toBe('The end date must be after the start date.');
    });

    it('joins every Message when the server sends several', () => {
        const raw = JSON.stringify([{ Message: 'First problem.' }, { Message: 'Second problem.' }]);
        expect(readable(raw)).toBe('First problem. Second problem.');
    });

    it('passes plain text through untouched', () => {
        // Not every refusal is JSON, and swallowing a plain message would leave the user with nothing.
        expect(readable('the link could not be saved')).toBe('the link could not be saved');
    });

    it('passes JSON through when it carries no Message, rather than losing it', () => {
        // Better an ugly blob than silence: the caller falls back to its own wording only on null.
        const raw = JSON.stringify({ Source: 'EndedAt', Type: 'Failure' });
        expect(readable(raw)).toBe(raw);
    });

    it('returns null when there is nothing to report, so the caller can use its own wording', () => {
        expect(readable(null)).toBeNull();
        expect(readable(undefined)).toBeNull();
        expect(readable('')).toBeNull();
    });
});

describe('#113 — what the status chip says', () => {
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'x', RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: false, ...over,
    });

    it('the link that books reads as in force', () => {
        expect(panel().StatusLabel(row({ Active: true }))).toBe('In force');
    });

    it('an Active row that does NOT book reads as superseded, not as "Active"', () => {
        // Rendering the raw column here would put "Active" on two rows of the same role — the exact
        // confusion the resolver was changed to remove.
        expect(panel().StatusLabel(row({ Active: false, Status: 'Active' }))).toBe('Superseded');
    });

    it('any other stored status is shown as itself', () => {
        expect(panel().StatusLabel(row({ Active: false, Status: 'Disabled' }))).toBe('Disabled');
    });
});

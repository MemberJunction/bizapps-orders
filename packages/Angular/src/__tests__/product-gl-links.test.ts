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

import {
    AccountIsOfferable,
    BizAppsProductGLLinksComponent,
    idKey,
    type ProductGLLinkRow,
} from '../lib/custom/Product/widgets/product-gl-links.component';

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
        // The panel is only writable in edit mode; these cases are about the PRODUCT, so put the form
        // in the state where the product is the remaining variable.
        c.EditMode = true;
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

    it('refuses a draft with no START DATE, which would otherwise write a link that does nothing', async () => {
        /**
         * `<input type="date">` is clearable, and neither the guard nor the template's disabled-state
         * checked it. A null `StartedAt` LOSES `pickActiveLinkIndex`'s tie-break — it compares
         * `(started ?? -Infinity)` — so the link was written, accepted by the server (a different start
         * means the duplicate rule does not fire), and silently ranked below any dated link. It showed
         * up as history beside the link it was meant to replace, with no error explaining why, and
         * `HasApplied(null)` returns true so no Remove was offered either.
         */
        const c = withProduct({ ID: 'p1', IsSaved: true });
        c.Draft = { RoleID: 'r1', AccountID: 'a1', StartedAt: '' };
        await c.AddLink();
        expect(c.WriteError, 'the guard means no attempt was made').toBeNull();
        expect(c.Draft, 'and the draft stays open so the date can be supplied').toBeTruthy();
    });

    it('offers no writing at all while the form is READ-ONLY', () => {
        /**
         * `EditMode` was accepted as an `@Input` and never read, so Add, Edit, Retire and Remove stayed
         * live on a form the user was only viewing — the sibling pricing widget gates every one of its
         * edit affordances on the same input. An unread `@Input` is worse than a missing one: it reads
         * as though the gating is handled.
         */
        const c = withProduct({ ID: 'p1', IsSaved: true });
        c.EditMode = false;
        expect(c.CanWrite).toBe(false);
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
        /**
         * This asserted `Saving === false` — four lines below the sibling test's comment explaining why
         * that exact assertion proves nothing. `Saving` is reset in a `finally`, so it reads false
         * whether the guard returned early or the attempt ran and threw. An audit caught it still here.
         *
         * `WriteError` is the discriminator: a guarded call never enters the try, so it cannot have
         * recorded an error, whereas an unguarded one reaches `new Metadata()` and throws.
         */
        const c = panel();
        c.Draft = { RoleID: 'r1', AccountID: 'a1', StartedAt: '2026-01-01' };
        await c.AddLink();
        expect(c.WriteError, 'the guard means no attempt was made, so there is nothing to report').toBeNull();
        expect(c.Draft, 'and the draft stays open rather than being silently discarded').toBeTruthy();
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

describe('#113 — which accounts the picker may offer (PR #125 review)', () => {
    /**
     * The panel used to offer every GL account in the system. A link to another company's account is
     * not merely untidy: `GLAccountResolver.Resolve` passes the order line's company down and
     * `AccountingBridge` filters candidates by the ACCOUNT's company before the window rules run, so
     * the booking path SKIPS such a link and falls through to the category, the product type and
     * finally the company default.
     *
     * So the failure is not a wrong posting — it is configuration that looks set and does nothing.
     * That is the worse of the two, because a wrong posting is at least visible in the ledger.
     */
    const BC = 'company-blue-cypress';
    const BETTY = 'company-betty';

    it('offers an account belonging to the product\'s company', () => {
        expect(AccountIsOfferable(BC, BC)).toBe(true);
    });

    it('REFUSES an account belonging to another company — the booking would skip it', () => {
        expect(AccountIsOfferable(BETTY, BC)).toBe(false);
    });

    it('compares case- and whitespace-insensitively, because ids arrive from several sources', () => {
        expect(AccountIsOfferable('  COMPANY-Blue-Cypress ', BC)).toBe(true);
    });

    it('offers everything when the product has no company, rather than an empty picker', () => {
        // Product.CompanyID is NOT NULL, so this is a defensive branch. An empty picker would read as
        // "no accounts exist"; the unfiltered list is at worst what shipped before.
        expect(AccountIsOfferable(BETTY, null)).toBe(true);
        expect(AccountIsOfferable(BETTY, '   ')).toBe(true);
    });

    it('refuses an account with NO company when the product has one', () => {
        // A company-less account cannot satisfy a company-scoped resolution, so offering it would be
        // offering another dead link.
        expect(AccountIsOfferable(null, BC)).toBe(false);
    });
});

describe('#113 — what Remove tells the user, on a link that is in force TODAY', () => {
    /**
     * ── THE MOST DANGEROUS THING THE AUDIT FOUND ──────────────────────────────────────────────────
     *
     * `pickActiveLinkIndex` skips only when `t < started`, so a link starting at today's UTC midnight
     * IS the one resolution picks. `HasApplied` used a strict `<`, so it reported the same link as
     * never having applied. `OpenDraft` defaults the start to today, so EVERY link this panel creates
     * spent its first UTC day rendering an "In force" chip beside a Remove button whose title read
     * "It has not started yet, so nothing has booked through it" — with `Delete()` behind it.
     *
     * The button cannot simply be withdrawn: `CK_GLAccountLink_Window` enforces
     * `EndedAt > StartedAt`, so a link created today cannot be retired and Remove is its only undo.
     * The defect was the sentence, so the sentence is what these pin.
     */
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'link-1', RoleID: 'role-rev', AccountID: 'acct-4000',
        RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: false, ...over,
    });

    it('does NOT claim nothing has booked when the link is in force', () => {
        const warning = panel().RemoveWarning(row({ Active: true }));
        expect(warning).not.toContain('nothing has booked');
        expect(warning, 'it must say the link is live right now').toContain('IN FORCE');
    });

    it('explains WHY retiring is not offered instead, so the user is not left guessing', () => {
        // Without this the honest warning just reads as "this is dangerous", with no route forward.
        expect(panel().RemoveWarning(row({ Active: true }))).toContain('cannot end on the day it starts');
    });

    it('keeps the simple wording for a link that genuinely has not started', () => {
        const warning = panel().RemoveWarning(row({ Active: false, StartedAt: '2099-01-01' }));
        expect(warning).toContain('nothing has booked through it');
        expect(warning).not.toContain('IN FORCE');
    });

    it('and the two cases really do produce different sentences', () => {
        // Guards against a future edit collapsing the branch back to one string.
        expect(panel().RemoveWarning(row({ Active: true }))).not.toBe(
            panel().RemoveWarning(row({ Active: false })),
        );
    });
});

describe('#113 — what a row that is NOT in force says about itself', () => {
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'link-1', RoleID: 'role-rev', AccountID: 'acct-4000',
        RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
        Status: 'Active', StartedAt: null, EndedAt: null, Active: false, ...over,
    });

    it('says In force when it is the one resolution would pick', () => {
        expect(panel().StatusLabel(row({ Active: true }))).toBe('In force');
    });

    it('says Not started — NOT Superseded — for a link whose start is in the future', () => {
        /**
         * It used to print "Superseded" for every inactive Active-status row. A link added to take over
         * next quarter therefore read as superseded — it supersedes something, nothing supersedes it —
         * beside a Remove button saying it had not started. Two controls in one row telling opposite
         * stories is how a user concludes the save was rejected and adds another link.
         */
        expect(panel().StatusLabel(row({ StartedAt: '2099-01-01' }))).toBe('Not started');
    });

    it('still says Superseded when a later link took over', () => {
        expect(panel().StatusLabel(row({ StartedAt: '2020-01-01' }))).toBe('Superseded');
    });

    it('defers to the row status when it is not Active at all', () => {
        expect(panel().StatusLabel(row({ Status: 'Disabled' }))).toBe('Disabled');
        expect(panel().StatusLabel(row({ Status: 'Pending' }))).toBe('Pending');
    });
});

describe('#113 — a write must not leave an edit form bound to the row it changed', () => {
    /**
     * Retire and Remove used to leave the form open, and the template only hides a row's EDIT button
     * while that row is being edited — Retire and Remove stayed live. Both orderings corrupted:
     * Retire then Save wrote `EndedAt = null` from the stale form and silently UN-RETIRED the link;
     * Remove then Save threw "could not be re-read" on a record that no longer existed.
     */
    function withEdit(id: string) {
        const c = panel();
        (c as unknown as { Editing: unknown }).Editing = { ID: id, RoleID: 'r', AccountID: 'a', StartedAt: '', EndedAt: '', Applied: false };
        return c as unknown as { Editing: { ID: string } | null; closeEditFor(id: string): void };
    }

    it('closes the form when the row it points at is the one that changed', () => {
        const c = withEdit('link-1');
        c.closeEditFor('link-1');
        expect(c.Editing).toBeNull();
    });

    it('matches the row regardless of the case the id arrived in', () => {
        const c = withEdit('9F3A1C2D-0000-4000-8000-00000000ABCD');
        c.closeEditFor('9f3a1c2d-0000-4000-8000-00000000abcd');
        expect(c.Editing, 'a case difference must not leave a stale form open').toBeNull();
    });

    it('leaves a form open that is editing a DIFFERENT row', () => {
        const c = withEdit('link-1');
        c.closeEditFor('link-2');
        expect(c.Editing, 'retiring one row must not discard an unrelated edit in progress').not.toBeNull();
    });
});

describe('#113 — ids compare by VALUE, not by the case they arrive in', () => {
    /**
     * ── THE DEFECT THIS PINS ───────────────────────────────────────────────────────────────────
     *
     * Ids reach this panel from two sources that disagree on case. The engine cache lowercases; a
     * direct view read returns SQL Server's uppercase `uniqueidentifier` rendering. Accounting's own
     * engine normalises every id comparison for exactly this reason.
     *
     * When the row carried its ids raw, a case difference meant:
     *   - the edit select matched no `<option>` and rendered BLANK on a link that plainly has an
     *     account, which is the #112 confusion the template forbids; and
     *   - the same account appeared TWICE, the second copy labelled "not available", telling the user
     *     a correctly-configured account was invalid.
     *
     * Neither is visible from a test that uses one casing throughout, which is why the original suite
     * passed while the bug was live.
     */
    const UPPER = '9F3A1C2D-0000-4000-8000-00000000ABCD';
    const lower = UPPER.toLowerCase();

    it('idKey normalises case and surrounding whitespace', () => {
        expect(idKey(UPPER)).toBe(lower);
        expect(idKey(`  ${UPPER} `)).toBe(lower);
        expect(idKey(null)).toBe('');
        expect(idKey(undefined)).toBe('');
    });

    it('AccountIsOfferable matches ids that differ only in case', () => {
        expect(AccountIsOfferable(UPPER, lower)).toBe(true);
        expect(AccountIsOfferable(lower, UPPER)).toBe(true);
    });

    it('does NOT re-admit an account as unavailable merely because the row spelled its id in caps', () => {
        const c = Object.create(BizAppsProductGLLinksComponent.prototype) as BizAppsProductGLLinksComponent;
        c.Accounts = [{ ID: lower, Label: '40000 Sales — Blue Cypress' }];
        c.OpenEdit({
            ID: 'link-1', RoleID: 'role-rev', AccountID: UPPER,
            RoleName: 'Revenue', AccountCode: '40000', AccountName: 'Sales',
            Status: 'Active', StartedAt: null, EndedAt: null, Active: true,
        });
        expect(c.EditAccounts, 'one account, not two').toHaveLength(1);
        expect(c.EditAccounts.some((a) => a.Disabled), 'and it is not flagged unavailable').toBe(false);
        expect(c.Editing?.AccountID, 'and the model value matches an option, so the select is not blank').toBe(
            c.EditAccounts[0].ID,
        );
    });
});

describe('#113 — editing, and how much of a link may change', () => {
    const utcToday = () => {
        const n = new Date();
        return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
    };
    const row = (over: Partial<ProductGLLinkRow>): ProductGLLinkRow => ({
        ID: 'link-1', RoleID: 'role-rev', AccountID: 'acct-4000',
        RoleName: 'Revenue', AccountCode: '4000', AccountName: 'Sales',
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
        // The pickers open on the CURRENT values rather than blank — a blank picker on an edit reads
        // as "this link has no account". The ids come off the ROW; see the collision check below for
        // why they are no longer looked up.
        expect(c.Editing?.RoleID).toBe('role-rev');
        expect(c.Editing?.AccountID).toBe('acct-4000');
        expect(c.Editing?.StartedAt).toBe(utcToday());
    });

    it('opens the account the row NAMES, even when another company shares its code (PR #125 review)', () => {
        /**
         * ── THE BUG ANDREW CAUGHT, AND IT IS A REPEAT OFFENDER ────────────────────────────────
         *
         * `OpenEdit` used to find the account by scanning the picker for the first label starting
         * with the row's code. GL account codes REPEAT ACROSS COMPANIES by design — every company
         * has a 40000 — so it returned whichever sorted first, and on a not-yet-applied link Save
         * then wrote that arbitrary account.
         *
         * The same shape had already cost a day earlier in this project: a probe picked a GL account
         * by code prefix, matched another company's, and made a tie-guard look broken when it was
         * working correctly. Identity is the ID; a code is a label.
         *
         * Ordering here is deliberate. Blue Cypress sorts FIRST, so a code search would return it —
         * the row names the Betty account, and only carrying the id gets that right.
         */
        const c = ready();
        c.Accounts = [
            { ID: 'acct-bc-40000', Label: '40000 Sales — Blue Cypress' },
            { ID: 'acct-betty-40000', Label: '40000 Sales — Betty' },
        ];
        c.OpenEdit(row({ AccountCode: '40000', AccountID: 'acct-betty-40000', StartedAt: utcToday() }));
        expect(c.Editing?.AccountID, 'the row named Betty; a code search would have returned Blue Cypress').toBe(
            'acct-betty-40000',
        );
    });

    it('opens the role the row NAMES rather than matching on its name', () => {
        // Same defect, same fix, one field over. Role names are not unique either, and a row whose
        // role could not be resolved renders '(unknown role)' -- which matched nothing and opened the
        // picker blank, reading as "this link has no role".
        const c = ready();
        c.Roles = [{ ID: 'role-a', Name: 'Revenue' }, { ID: 'role-b', Name: 'Revenue' }];
        c.OpenEdit(row({ RoleID: 'role-b', StartedAt: utcToday() }));
        expect(c.Editing?.RoleID).toBe('role-b');
    });

    it('keeps the CURRENT account of the link in the edit options when it is outside the company', () => {
        /**
         * Scoping the picker (above) is right for CHOOSING but must not hide what a link ALREADY points
         * at. Cross-company links exist — nothing stopped the panel creating them before the scoping
         * change. Offering only the scoped list would render the select blank on a link that plainly has
         * an account, which the template itself calls out as the #112 confusion.
         */
        const c = ready();
        c.Accounts = [{ ID: 'acct-bc-40000', Label: '40000 Sales — Blue Cypress' }];
        c.OpenEdit(row({ AccountID: 'acct-betty-9999', AccountCode: '9999', AccountName: 'Betty Revenue', StartedAt: utcToday() }));
        const ids = c.EditAccounts.map((a) => a.ID);
        expect(ids, 'the current account must still be selectable, or the picker reads as empty').toContain('acct-betty-9999');
        // LAST and DISABLED, not first and selectable. Re-admitting it as a choosable option at the top
        // of the list would let the repair path write back the very link the scoping exists to prevent —
        // and nothing downstream refuses it, because the tie guard only rejects ties WITHIN a company.
        const readmitted = c.EditAccounts[c.EditAccounts.length - 1];
        expect(readmitted.ID).toBe('acct-betty-9999');
        expect(readmitted.Label, 'it names the account, so the reader can see what the link points at').toContain(
            '9999 Betty Revenue',
        );
        expect(
            readmitted.Disabled,
            'visible so the picker never reads as empty, unselectable so the repair cannot rewrite it',
        ).toBe(true);
    });

    it('does NOT duplicate the current account when it is already offered', () => {
        const c = ready();
        c.OpenEdit(row({ StartedAt: utcToday() }));
        expect(c.EditAccounts.filter((a) => a.ID === 'acct-4000')).toHaveLength(1);
        expect(c.EditAccounts).toBe(c.Accounts);
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

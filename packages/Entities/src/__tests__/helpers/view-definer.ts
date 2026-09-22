/**
 * @fileoverview Resolve which migration the database ACTUALLY runs last for a layered view.
 *
 * WHY THIS EXISTS. CodeGen owns `vw<X>Generated` and regenerates it wholesale on any schema change.
 * `vw<X>` is hand-written on top, so every schema change forces a human to re-type it — and
 * hand-added logic is exactly what goes missing when they start from a stale copy.
 *
 * THAT IS NOT HYPOTHETICAL. bizapps-contracts PR #59 (2026-09-20) re-created `vwContracts` and its
 * `IsAwaitingDocument` lost the File/FileCategory joins and the `fc.Name = 'Executed Agreement'`
 * predicate that a migration three weeks earlier existed to add. Any attached file — an exhibit, a
 * draft, the wrong PDF — has cleared the "awaiting paper" warning ever since.
 *
 * AND THE GUARD THAT SHOULD HAVE CAUGHT IT WENT GREEN. It resolved the newest definer with a regex
 * requiring `CREATE OR ALTER VIEW`. #59 used `DROP VIEW` + `CREATE VIEW`, so it was filtered OUT of
 * the candidate list, `.pop()` fell back to the older file, and the suite went on asserting —
 * truthfully — about a migration the database no longer runs last.
 *
 * So the selector here matches ANY DDL that names the view, and separately asserts that nothing
 * after the resolved file redefines it in a form this regex has not been taught yet.
 *
 * Comments are stripped before any matching. A required predicate must be satisfied by executable
 * SQL, never by prose that happens to quote it — copying a comment block forward is precisely how a
 * stale retype looks.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS FILE IS SHARED, VERBATIM, BY bizapps-common, bizapps-accounting, bizapps-sales AND
 * bizapps-orders. Four identical copies is the point: the failure it guards against is a hand
 * re-type, and a guard that drifts per repo is the same mistake one level up. Fix it here, copy it
 * there.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS HELPER HAS BEEN TAUGHT, AND WHY. Each item below is a way a dropped predicate stayed
 * invisible, reproduced against real migrations in these four repos before it was fixed.
 *
 * A. A NAME IS A NAME WHETHER OR NOT IT IS BRACKETED. `CREATE OR ALTER VIEW
 *    ${flyway:defaultSchema}.vwPeople` is the same statement as `CREATE OR ALTER VIEW
 *    [__mj_BizAppsCommon].[vwPeople]`, and T-SQL does not care. A selector that demanded
 *    `[vwPeople]` did: a migration redefining the view unbracketed, with every curated predicate
 *    stripped, left the suite GREEN. `qualifiedName` accepts either spelling for the object and for
 *    the schema — brackets, a bare identifier, or a `${...}` Flyway placeholder.
 *
 * B. FILENAME ORDER IS NOT APPLY ORDER. Flyway runs versioned migrations by VERSION and then runs
 *    every repeatable, and re-runs a repeatable whenever its checksum changes — so an
 *    `R__Layered_Views.sql` that defines a view is ALWAYS the effective definer, no matter what it
 *    sorts next to. Under `readdirSync().sort()` `R__` sorts before `V__`, so such a file was never
 *    even considered "later"; adding one with the predicates stripped left the suite GREEN. A
 *    `V<ts>.1__` hotfix sorted wrong too (`.` < `_`), and `U__` undo scripts — which `migrate`
 *    never applies at all — sorted in as though they did. `migrationFiles` now returns exactly what
 *    Flyway applies, in the order Flyway applies it.
 *
 * C. STRING LITERALS AND QUOTED IDENTIFIERS ARE NOT CODE. Every depth-sensitive scan here used to
 *    count parentheses in literals: `COALESCE(addr.Line1, 'n/a (unknown')` unbalanced the SELECT
 *    list, `derivedColumns` returned `[]`, and the column check asserted NOTHING while passing. A
 *    lone `)` in a literal drove the counter negative and it was never re-checked. `mapCode` marks
 *    literals, `[quoted]` identifiers and `"quoted"` identifiers as non-code and clamps depth at
 *    zero, and `sqlCode` strips comments without walking into a literal that contains `--`.
 *
 * D. THE PROJECTION IS THE OUTER QUERY'S, NOT THE FIRST `SELECT` IN THE TEXT. A view written as
 *    `WITH cte AS (SELECT ...) SELECT ...` handed its CTE's projection to the column check, which
 *    then reported every real column as lost. `splitProjection` takes the first `SELECT` at the
 *    shallowest parenthesis depth, which is the one whose column names the view publishes.
 *
 * E. `ALTER VIEW` DEFINES A VIEW. The selector accepted it; `viewBody` matched only
 *    `CREATE [OR ALTER] VIEW` and returned an empty body for it, so every predicate failed and
 *    every column read as lost. Both now accept the same set of verbs.
 *
 * F. READING A VIEW IS NOT REDEFINING IT — AND NEITHER IS DDL FOR SOME OTHER VIEW. The
 *    "redefined later" check used to fire when a single batch contained any view-DDL verb AND the
 *    guarded name anywhere in it. CodeGen emits exactly that shape constantly: a `GRANT SELECT ON
 *    [vwPeople]` block with no trailing `GO`, running on into the next entity's `DROP VIEW`; a new
 *    view whose body selects `FROM [vwPeople]`. Real SQL in bizapps-sales tripped it —
 *    V202609190901 DROP/CREATEs `vwSalesContacts` in a batch that names `vwSalesContactsGenerated`,
 *    so a guard over the inner view threw on correct history. The check now reads the object each
 *    DDL verb actually TARGETS, and only fires when that target is the guarded view (in a form the
 *    selector could not parse) or cannot be read at all.
 *
 * G. COLUMN COUNTS ARE READ FROM ONE VIEW BODY, AND BARE ALIASES COUNT. A definer here can be a
 *    38,000-line CodeGen dump defining dozens of views, whose unrelated alias sets would swamp the
 *    comparison. Aliases are also written bare (`END AS AnomalyOutcome`, not `AS [AnomalyOutcome]`),
 *    which a bracket-only regex scores as zero columns — a column check that silently asserts
 *    nothing.
 *
 * H. AN UNALIASED COLUMN REFERENCE IS STILL A COLUMN. bizapps-orders' `vwOrderHeaders` projects
 *    `nd.NextDueDate` from a CROSS APPLY with no `AS` at all, and SQL Server names the output
 *    column after the trailing identifier. An alias-only reader scored that view as producing one
 *    column when it produces two. `derivedColumns` therefore takes the whole SELECT item when the
 *    item is nothing but a column reference; aliases still win where both could apply, so this only
 *    ever ADDS columns. It adds fifteen to bizapps-sales' `vwSalesContactsGenerated`, which lists
 *    its inherited Person columns out by hand — columns the alias-only reader silently scored as
 *    absent, leaving that repo's column-drop guard far weaker than it looked.
 *
 * I. INHERITED COLUMNS COUNT AS PRESENT — ON BOTH SIDES OF THE COMPARISON. A layered outer view
 *    projects `g.*` from `vw<X>Generated`, so every column the flat pre-layering view aliased by
 *    hand still exists, through the inner view, under the same name. `producedColumns` follows the
 *    star into the inner view's own definer so the assertion compares what the database actually
 *    projects. It takes an `asOf` migration precisely so the BEFORE side can be measured the same
 *    way: comparing an alias-only "before" against an inheritance-aware "now" left every inherited
 *    column unprotected, and a retype that replaced `g.*` with an explicit list minus one column
 *    passed green.
 *
 * J. THE STAR MUST BE A STAR. The test for `g.*` used to match any `*` after whitespace, so
 *    `g.[Rate] * g.[Hours]` read as a star projection and silently unioned in another view's
 *    columns — a false pass. A star is now recognised only as a whole SELECT item, and its
 *    qualifier is resolved against the FROM/JOIN aliases so the columns come from the view the star
 *    actually belongs to.
 *
 * K. `DROP VIEW` TAKES A LIST, AND ONLY THE FIRST NAME WAS READ. T-SQL's grammar is
 *    `DROP VIEW [schema.]view [ ,...n ]`, so `DROP VIEW [vwOther], [vwJournalEntries];` drops two
 *    views. `viewDdlTargets` stopped at the first object, so the second name was invisible: a
 *    migration after the newest definer that dropped the guarded view in second position left the
 *    suite GREEN, reproduced in bizapps-accounting before this was fixed. (In FIRST position the
 *    same statement went red, because `ddlFor` matched it — which is how the asymmetry hid.) Only
 *    `DROP` takes a list; `CREATE` and `ALTER` name exactly one view, so the list is read for
 *    `DROP` alone.
 *
 * L. THE GUARDS MATCH NAMES THE SAME WAY THIS FILE DOES. `references()` hands the per-repo guards
 *    the selector's own name matcher, so a curated predicate naming an object accepts every
 *    spelling the database treats as identical. Curating `\[\$\{flyway:defaultSchema\}\]\.\[vwX\]`
 *    by hand failed on correct SQL the moment anyone wrote `[__mj_BizAppsSales].[vwX]` instead —
 *    and a guard that fails on correct work is a guard somebody switches off.
 */
import { readdirSync, readFileSync } from 'node:fs';

/* ----------------------------------------------------------------------------------------------
 * Lexing. Comments, string literals, quoted identifiers, parenthesis depth.
 * ------------------------------------------------------------------------------------------- */

/** Index just past the closing delimiter of the literal or quoted identifier starting at `start`. */
function endOfQuoted(sql: string, start: number): number {
    const closer = sql[start] === '[' ? ']' : sql[start];
    let i = start + 1;
    while (i < sql.length) {
        if (sql[i] === closer) {
            if (sql[i + 1] === closer) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i++;
    }
    return sql.length;
}

/** Index just past the block comment starting at `start`. T-SQL nests them, so this counts. */
function endOfBlockComment(sql: string, start: number): number {
    let depth = 0;
    let i = start;
    while (i < sql.length) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
            depth++;
            i += 2;
            continue;
        }
        if (sql[i] === '*' && sql[i + 1] === '/') {
            depth--;
            i += 2;
            if (depth <= 0) return i;
            continue;
        }
        i++;
    }
    return sql.length;
}

/**
 * SQL with line and block comments removed, so prose can never satisfy an assertion.
 *
 * Literal-aware: a comment marker inside `'...'`, `"..."` or `[...]` is data, not a comment, and
 * chopping there would leave an unterminated quote that poisons every later depth scan. Newlines
 * are preserved for line comments so `GO` batch separators still stand alone on their own line.
 */
export function sqlCode(sql: string): string {
    const parts: string[] = [];
    let last = 0;
    let i = 0;
    while (i < sql.length) {
        const character = sql[i];
        if (character === "'" || character === '"' || character === '[') {
            i = endOfQuoted(sql, i);
            continue;
        }
        if (character === '-' && sql[i + 1] === '-') {
            parts.push(sql.slice(last, i), ' ');
            const newline = sql.indexOf('\n', i);
            i = newline < 0 ? sql.length : newline;
            last = i;
            continue;
        }
        if (character === '/' && sql[i + 1] === '*') {
            parts.push(sql.slice(last, i), ' ');
            i = endOfBlockComment(sql, i);
            last = i;
            continue;
        }
        i++;
    }
    parts.push(sql.slice(last));
    return parts.join('');
}

/**
 * Per-character parenthesis depth, plus whether the character is executable SQL at all.
 *
 * `code[i]` is 0 inside a string literal or a quoted identifier, which is what stops
 * `COALESCE(x, 'n/a (unknown')` from unbalancing a SELECT list and a `FROM` inside a literal from
 * splitting a projection. Depth is clamped at zero so a stray `)` cannot drive the count negative
 * and silence every subsequent depth-0 test.
 */
interface CodeMap {
    depth: Int32Array;
    code: Uint8Array;
}

function mapCode(sql: string): CodeMap {
    const depth = new Int32Array(sql.length);
    const code = new Uint8Array(sql.length);
    let level = 0;
    let i = 0;
    while (i < sql.length) {
        const character = sql[i];
        if (character === "'" || character === '"' || character === '[') {
            const end = endOfQuoted(sql, i);
            for (; i < end; i++) depth[i] = level;
            continue;
        }
        code[i] = 1;
        if (character === '(') {
            depth[i] = level;
            level++;
        } else if (character === ')') {
            level = level > 0 ? level - 1 : 0;
            depth[i] = level;
        } else {
            depth[i] = level;
        }
        i++;
    }
    return { depth, code };
}

function isIdentifierChar(character: string | undefined): boolean {
    return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

/** True when `word` stands as its own keyword at `index`. */
function keywordAt(sql: string, index: number, word: string): boolean {
    if (sql.slice(index, index + word.length).toUpperCase() !== word) return false;
    return !isIdentifierChar(sql[index - 1]) && !isIdentifierChar(sql[index + word.length]);
}

/* ----------------------------------------------------------------------------------------------
 * Names and DDL.
 * ------------------------------------------------------------------------------------------- */

/** A schema qualifier: `[__mj]`, `${flyway:defaultSchema}`, `[${mjSchema}]`, or a bare `dbo`. */
const SCHEMA = String.raw`(?:\[[^\]\r\n]*\]|\$\{[^}\r\n]*\}|[A-Za-z_][A-Za-z0-9_@#$]*)`;

/**
 * Any object reference, bracketed or bare, however many dotted parts it carries. A name may not
 * begin with `@` or `#`: `DROP VIEW @name` targets a VARIABLE, which is a definer form nothing
 * here can read, and reading it as an object called `name` would quietly let it through.
 */
const OBJECT_REFERENCE = String.raw`(?:${SCHEMA}\s*\.\s*)*(?:\[([^\]\r\n]+)\]|([A-Za-z_][A-Za-z0-9_@#$]*))`;

/**
 * `[vwPeople]` or a bare `vwPeople`, optionally schema-qualified in any spelling.
 *
 * Demanding brackets is how an unbracketed re-creation became invisible to both the selector and
 * the "redefined later" check — see note A. `\b` after the bare form is what keeps `vwPeople` from
 * matching inside `vwPeopleGenerated`.
 */
function qualifiedName(view: string): string {
    return String.raw`(?:${SCHEMA}\s*\.\s*)?(?:\[${view}\]|${view}\b)`;
}

/** The view name on its own, in either spelling — a MENTION, which is not the same as a definition. */
function mentions(view: string): RegExp {
    return new RegExp(String.raw`(?:\[${view}\]|\b${view}\b)`, 'i');
}

/**
 * A reference to `object` anywhere in a view body, in every spelling the database treats as the
 * same name: bracketed or bare, schema-qualified in any spelling or not qualified at all —
 * `[__mj_BizAppsCommon].[vwPeople]`, `${flyway:defaultSchema}.vwPeople`, a plain `vwPeople`.
 *
 * This is the selector's own name matcher, handed to the per-repo guards on purpose. A curated
 * predicate that spelled the schema out by hand failed on correct SQL the moment CodeGen wrote the
 * other spelling — see note L — and one that demanded brackets missed an unbracketed re-creation
 * entirely, which is note A. An object name matched this way is one of the two things a legitimate
 * reformatting cannot take away; a string literal is the other.
 *
 * The `\b` after the bare form is what keeps `vwPeople` from matching inside `vwPeopleGenerated`.
 */
export function references(object: string): RegExp {
    return new RegExp(qualifiedName(object), 'i');
}

/** The verbs that define, redefine or remove a view. */
const VIEW_DDL_VERB = String.raw`(?:CREATE\s+(?:OR\s+ALTER\s+)?VIEW|ALTER\s+VIEW|DROP\s+VIEW(?:\s+IF\s+EXISTS)?)`;

/** The verbs that leave a view body behind. `DROP` is a definer but has no body to read. */
const VIEW_BODY_VERB = String.raw`(?:CREATE\s+(?:OR\s+ALTER\s+)?VIEW|ALTER\s+VIEW)`;

/** Any DDL naming the view: `CREATE VIEW`, `CREATE OR ALTER VIEW`, `ALTER VIEW`, or `DROP VIEW`. */
function ddlFor(view: string): RegExp {
    return new RegExp(String.raw`\b${VIEW_DDL_VERB}\s+${qualifiedName(view)}`, 'i');
}

/* ----------------------------------------------------------------------------------------------
 * Apply order. What Flyway runs, and when.
 * ------------------------------------------------------------------------------------------- */

const VERSIONED = 0;
const REPEATABLE = 1;

interface Migration {
    file: string;
    /** `VERSIONED` (`B`/`V`) or `REPEATABLE` (`R`). Undo scripts never get one — they never run. */
    rank: number;
    /** The dotted version, numerically, so `202609051800.1` sorts AFTER `202609051800`. */
    version: number[];
    /** Everything after `__`, which is how Flyway orders repeatables among themselves. */
    description: string;
}

const VERSION_TEXT = /^\d+(?:[._]\d+)*$/;

/**
 * A `.sql` filename read as a Flyway migration, or `undefined` when Flyway would not run it —
 * a `U__` undo script (applied only by `flyway undo`, never by `migrate`) or a name that is not a
 * migration at all.
 */
function parseMigration(file: string): Migration | undefined {
    const separator = file.indexOf('__');
    if (separator < 1) return undefined;
    const prefix = file.slice(0, 1).toUpperCase();
    const version = file.slice(1, separator);
    const description = file.slice(separator + 2).replace(/\.sql$/i, '');
    if (prefix === 'R') {
        return version === '' ? { file, rank: REPEATABLE, version: [], description } : undefined;
    }
    if (prefix !== 'B' && prefix !== 'V') return undefined;
    if (!VERSION_TEXT.test(version)) return undefined;
    return { file, rank: VERSIONED, version: version.split(/[._]/).map(Number), description };
}

function compareText(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

/**
 * Flyway's apply order. Versioned migrations (`B`/`V`) first, by VERSION — compared part by part as
 * numbers, so `202609051800.1` follows `202609051800` instead of preceding it the way `.` < `_`
 * makes a string sort claim. Then every repeatable, by description, because Flyway runs repeatables
 * after all versioned migrations and re-runs them whenever they change: a repeatable that defines a
 * view is ALWAYS the effective definer.
 */
function byApplyOrder(a: Migration, b: Migration): number {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank === REPEATABLE) return compareText(a.description, b.description) || compareText(a.file, b.file);
    const parts = Math.max(a.version.length, b.version.length);
    for (let i = 0; i < parts; i++) {
        const difference = (a.version[i] ?? 0) - (b.version[i] ?? 0);
        if (difference !== 0) return difference;
    }
    return compareText(a.file, b.file);
}

/** Every `.sql` file in the directory, whether or not Flyway would apply it. */
function sqlFiles(migrationsDir: string): string[] {
    return readdirSync(migrationsDir).filter((f) => f.toLowerCase().endsWith('.sql'));
}

/**
 * The migrations Flyway applies, in the order it applies them.
 *
 * Exported because FILENAME ORDER IS NOT APPLY ORDER and a guard that sorts filenames to decide
 * "this must run before that" is asserting about the directory listing, not about the database —
 * an `R__` repeatable sorts before every `V__` and runs after all of them (note B).
 */
export function migrationFiles(migrationsDir: string): string[] {
    const migrations: Migration[] = [];
    for (const file of sqlFiles(migrationsDir)) {
        const migration = parseMigration(file);
        if (migration !== undefined) migrations.push(migration);
    }
    return migrations.sort(byApplyOrder).map((migration) => migration.file);
}

/**
 * `.sql` files whose names Flyway does not recognise as migrations at all — not versioned, not
 * repeatable, not undo. Flyway ignores them, so SQL sitting in one never reaches a database while
 * looking for all the world like it does.
 */
function unrecognisedFiles(migrationsDir: string): string[] {
    return sqlFiles(migrationsDir).filter((file) => {
        if (parseMigration(file) !== undefined) return false;
        return file.slice(0, 1).toUpperCase() !== 'U' || file.indexOf('__') < 1;
    });
}

/* ----------------------------------------------------------------------------------------------
 * Resolving the definer.
 * ------------------------------------------------------------------------------------------- */

/** Statement batches, which is the scope SQL Server applies a single DDL statement in. */
function batches(code: string): string[] {
    return code.split(/^[ \t]*GO[ \t]*$/im);
}

/**
 * Every object the view-DDL verbs in `code` target, with `undefined` for a verb whose target cannot
 * be read (dynamic SQL built from a variable, say).
 *
 * `DROP VIEW` takes a COMMA-SEPARATED LIST — `DROP VIEW [vwOther], [vwJournalEntries];` drops both —
 * and reading only the name immediately after the verb made every name but the first invisible to
 * the "redefined later" alarm. See note K. `CREATE` and `ALTER` name exactly one view, so the list
 * is only read after a `DROP`.
 */
function viewDdlTargets(code: string): (string | undefined)[] {
    const verb = new RegExp(String.raw`\b(${VIEW_DDL_VERB})\s*`, 'gi');
    const object = new RegExp(OBJECT_REFERENCE, 'y');
    const separator = /\s*,\s*/y;
    const targets: (string | undefined)[] = [];
    for (const match of code.matchAll(verb)) {
        object.lastIndex = match.index + match[0].length;
        let reference = object.exec(code);
        if (reference === null) {
            targets.push(undefined);
            continue;
        }
        targets.push(reference[1] ?? reference[2]);
        if (!/^DROP/i.test(match[1])) continue;
        // A sticky regex resets lastIndex to 0 when it fails, so the cursor is carried by hand.
        let cursor = object.lastIndex;
        for (;;) {
            separator.lastIndex = cursor;
            if (separator.exec(code) === null) break;
            object.lastIndex = separator.lastIndex;
            reference = object.exec(code);
            if (reference === null) break;
            targets.push(reference[1] ?? reference[2]);
            cursor = object.lastIndex;
        }
    }
    return targets;
}

/** True when a `sp_rename` statement in this batch names the view among its arguments. */
function renamesInto(batch: string, view: string): boolean {
    const names = mentions(view);
    for (const match of batch.matchAll(/\bsp_rename\b/gi)) {
        const rest = batch.slice(match.index, match.index + 400);
        const terminator = rest.indexOf(';');
        if (names.test(terminator < 0 ? rest : rest.slice(0, terminator))) return true;
    }
    return false;
}

/**
 * True when a batch carries view DDL that could be FOR THIS VIEW in a form `ddlFor` cannot see.
 *
 * Reading a view is not redefining it, and neither is defining a different one. CodeGen emits both
 * shapes constantly — `GRANT SELECT ON [vwPeople]` in a batch that runs on into another entity's
 * `DROP VIEW`, a brand-new view whose body selects `FROM [vwPeople]` — and a check that fired on
 * them failed legitimate work, which is how a guard gets switched off. So the batch must mention
 * the view AND carry a DDL verb whose TARGET is either this view or unreadable.
 */
function mayRedefineUnseen(code: string, view: string): boolean {
    const names = mentions(view);
    const isView = new RegExp(String.raw`^${view}$`, 'i');
    for (const batch of batches(code)) {
        if (!names.test(batch)) continue;
        for (const target of viewDdlTargets(batch)) {
            if (target === undefined || isView.test(target)) return true;
        }
        if (renamesInto(batch, view)) return true;
    }
    return false;
}

export interface ViewDefiner {
    /** The migration the database runs last for this view. */
    file: string;
    /** That file's SQL, comments stripped. */
    code: string;
    /** Every migration that has ever defined the view, in apply order. */
    chain: string[];
}

/** One migration's SQL with comments stripped. */
export function readMigration(migrationsDir: string, file: string): string {
    return sqlCode(readFileSync(`${migrationsDir}/${file}`, 'utf8'));
}

/** Every migration defining `view`, in apply order. Empty when none does. */
function definerChain(migrationsDir: string, view: string): string[] {
    const ddl = ddlFor(view);
    return migrationFiles(migrationsDir).filter((f) => ddl.test(readMigration(migrationsDir, f)));
}

/**
 * The migration the database runs last for `view`, in Flyway's apply order.
 *
 * @throws if no migration defines the view; if a `.sql` file Flyway will never apply defines it; or
 *   if a later migration carries view DDL that could name it without matching the patterns above —
 *   that means a definer form exists which this helper cannot see, and failing loudly is the only
 *   safe answer.
 */
export function newestViewDefiner(migrationsDir: string, view: string): ViewDefiner {
    const ddl = ddlFor(view);
    const stranded = unrecognisedFiles(migrationsDir)
        .filter((f) => ddl.test(sqlCode(readFileSync(`${migrationsDir}/${f}`, 'utf8'))));
    if (stranded.length > 0) {
        throw new Error(
            `[${view}] is defined in ${stranded.join(', ')}, which Flyway does not recognise as a ` +
            `migration and will never apply. Rename it to V<timestamp>__<description>.sql, or the ` +
            `database will never see that SQL while this guard reports on it.`,
        );
    }

    const order = migrationFiles(migrationsDir);
    const chain = order.filter((f) => ddl.test(readMigration(migrationsDir, f)));
    if (chain.length === 0) {
        throw new Error(`No migration defines [${view}] — a guard over it would assert against nothing.`);
    }
    const file = chain[chain.length - 1];

    const redefinedAfter = order
        .slice(order.indexOf(file) + 1)
        .filter((f) => mayRedefineUnseen(readMigration(migrationsDir, f), view));
    if (redefinedAfter.length > 0) {
        throw new Error(
            `[${view}] carries view DDL in migrations AFTER its newest recognised definer ${file}: ` +
            `${redefinedAfter.join(', ')}. Either they redefine it in a form newestViewDefiner does ` +
            `not match — in which case teach it that form — or the guard is now pointed at stale SQL.`,
        );
    }
    return { file, code: readMigration(migrationsDir, file), chain };
}

/**
 * The LAST view body for `view` in `code`. Last, not first: a CodeGen dump can define the same view
 * several times in one file and the final one is what the database is left holding. `ALTER VIEW`
 * counts — the selector accepts it as a definer, and a body reader that did not would hand every
 * assertion an empty string and report the whole view as lost.
 */
export function viewBody(code: string, view: string): string {
    const ddl = new RegExp(String.raw`\b${VIEW_BODY_VERB}\s+${qualifiedName(view)}`, 'gi');
    let start = -1;
    for (const match of code.matchAll(ddl)) start = match.index;
    if (start < 0) return '';
    const rest = code.slice(start);
    const end = rest.search(/^[ \t]*GO[ \t]*$/im);
    return end < 0 ? rest : rest.slice(0, end);
}

/* ----------------------------------------------------------------------------------------------
 * Reading a view's projection.
 * ------------------------------------------------------------------------------------------- */

export interface ViewProjection {
    /** Everything between `SELECT` and the `FROM` at the same depth — the output columns. */
    select: string;
    /** That `FROM` onward: joins, ON clauses, and the derived tables the columns are built from. */
    from: string;
}

/**
 * Split a view body at the `FROM` of its OUTERMOST query.
 *
 * Depth matters twice. A scalar subquery in the SELECT list has a `FROM` of its own, and splitting
 * on the first one would cut the projection in half. And a `WITH cte AS (SELECT ...)` prologue puts
 * a whole SELECT ahead of the real one, so taking the first `SELECT` in the text handed the column
 * check the CTE's projection and reported every real column as lost. The outermost query is the one
 * at the shallowest depth any `SELECT` reaches.
 */
export function splitProjection(body: string): ViewProjection {
    const { depth, code } = mapCode(body);
    let level = -1;
    let selectAt = -1;
    for (let i = 0; i < body.length; i++) {
        if (code[i] !== 1 || !keywordAt(body, i, 'SELECT')) continue;
        if (level < 0 || depth[i] < level) {
            level = depth[i];
            selectAt = i;
        }
        if (level === 0) break;
    }
    if (selectAt < 0) return { select: '', from: '' };
    const start = selectAt + 'SELECT'.length;
    for (let i = start; i < body.length; i++) {
        if (code[i] === 1 && depth[i] === level && keywordAt(body, i, 'FROM')) {
            return { select: body.slice(start, i), from: body.slice(i) };
        }
    }
    return { select: body.slice(start), from: '' };
}

/**
 * The top-level, comma-separated items of a SELECT list — one per projected column. Splitting at
 * depth 0 is what keeps a function's argument list (`COALESCE(a, b)`) from being read as two
 * columns, and skipping literals is what keeps `'a, b'` from being read as two either.
 */
function selectItems(select: string): string[] {
    const { depth, code } = mapCode(select);
    const items: string[] = [];
    let start = 0;
    for (let i = 0; i < select.length; i++) {
        if (code[i] === 1 && depth[i] === 0 && select[i] === ',') {
            items.push(select.slice(start, i));
            start = i + 1;
        }
    }
    items.push(select.slice(start));
    return items;
}

/** `AS [Name]` or a bare `AS Name`, anchored so it can be applied at one position at a time. */
const ALIAS = /\bAS\s+(?:\[([A-Za-z_][A-Za-z0-9_]*)\]|([A-Za-z_][A-Za-z0-9_]*))/iy;

/**
 * The aliases one SELECT item declares at its own parenthesis depth 0 — which is what separates a
 * column alias from a table alias or a cast: `[AddressLink] AS al` and `CAST(g.[ID] AS
 * NVARCHAR(MAX))` live in the FROM clause or inside parentheses, while `(SELECT COUNT(*) ...) AS
 * [ChildOrgCount]` lands back at depth 0 after its closing bracket and is correctly counted.
 */
function aliasesIn(item: string): string[] {
    const { depth, code } = mapCode(item);
    const columns: string[] = [];
    for (let i = 0; i < item.length; i++) {
        if (code[i] !== 1 || depth[i] !== 0 || isIdentifierChar(item[i - 1])) continue;
        ALIAS.lastIndex = i;
        const match = ALIAS.exec(item);
        if (match === null) continue;
        columns.push(match[1] ?? match[2]);
        i = ALIAS.lastIndex - 1;
    }
    return columns;
}

/**
 * A SELECT item that is nothing but a column reference: `nd.NextDueDate`, `[Balance]`, `g.[Status]`.
 * SQL Server names the output column after the trailing identifier, so the view produces a column
 * called `NextDueDate` with no `AS` anywhere — see note H at the top of this file.
 *
 * Anchored end to end, so only a pure reference qualifies: `g.*` has no identifier to take,
 * `CAST(x AS date)` and `CASE ... END` carry punctuation the pattern will not match, and both fall
 * through to the alias pass that already handles them.
 */
const BARE_COLUMN =
    /^\s*(?:(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)\s*\.\s*)*(?:\[([A-Za-z_][A-Za-z0-9_]*)\]|([A-Za-z_][A-Za-z0-9_]*))\s*$/;

/** The columns a view body names itself, in order: its own aliases, plus bare column references. */
export function derivedColumns(body: string): string[] {
    const { select } = splitProjection(body);
    return selectItems(select).flatMap((item) => {
        const aliased = aliasesIn(item);
        if (aliased.length > 0) return aliased;
        const bare = BARE_COLUMN.exec(item);
        return bare === null ? [] : [bare[1] ?? bare[2]];
    });
}

/* ----------------------------------------------------------------------------------------------
 * Following `g.*` into the inner view.
 * ------------------------------------------------------------------------------------------- */

/** A whole SELECT item that is a star, with the alias it belongs to: `g.*`, `[g].*`, or `*`. */
const STAR_ITEM = /^\s*(?:(?:\[([A-Za-z_][A-Za-z0-9_]*)\]|([A-Za-z_][A-Za-z0-9_]*))\s*\.\s*)?\*\s*$/;

/** A source in the FROM clause: its schema-qualified object, and the alias the query calls it by. */
const FROM_SOURCE = new RegExp(
    String.raw`\b(?:FROM|JOIN|APPLY)\s+${SCHEMA}\s*\.\s*(?:\[([A-Za-z0-9_]+)\]|([A-Za-z0-9_]+))` +
    String.raw`(?:\s+(?:AS\s+)?(?!(?:AS|ON|WHERE|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|JOIN|GROUP|ORDER|` +
    String.raw`HAVING|UNION|EXCEPT|INTERSECT|WITH|APPLY|OPTION|PIVOT|UNPIVOT|FOR|GO)\b)` +
    String.raw`(?:\[([A-Za-z0-9_]+)\]|([A-Za-z_][A-Za-z0-9_]*)))?`,
    'gi',
);

/**
 * The object the star's qualifier refers to. An unqualified star, or a qualifier no source claims,
 * falls back to the first source in the FROM clause — the shape every layered view here uses.
 */
function starSource(from: string, qualifier: string | undefined): string | undefined {
    let first: string | undefined;
    for (const match of from.matchAll(FROM_SOURCE)) {
        const object = match[1] ?? match[2];
        const alias = match[3] ?? match[4];
        if (first === undefined) first = object;
        if (qualifier !== undefined && (alias ?? object).toLowerCase() === qualifier.toLowerCase()) {
            return object;
        }
    }
    return first;
}

/**
 * The view this body inherits columns from — the source of a `g.*` projection. That star is why a
 * layered wrapper can be nine lines long and still expose everything the flat view used to.
 *
 * The star has to be a whole SELECT item. Matching any `*` after whitespace read the arithmetic in
 * `g.[Rate] * g.[Hours]` as a star projection and silently unioned in another view's columns.
 */
function inheritedView(body: string): string | undefined {
    const { select, from } = splitProjection(body);
    for (const item of selectItems(select)) {
        const star = STAR_ITEM.exec(item);
        if (star === null) continue;
        return starSource(from, star[1] ?? star[2]);
    }
    return undefined;
}

/** How far to follow `*` through nested views before giving up. Layering here is two deep. */
const MAX_INHERITANCE_DEPTH = 4;

/** The definers of `view` that had been applied by the time `asOf` ran, `asOf` included. */
function chainAsOf(migrationsDir: string, view: string, asOf: string | undefined): string[] {
    const chain = definerChain(migrationsDir, view);
    if (asOf === undefined) return chain;
    const order = migrationFiles(migrationsDir);
    const cutoff = order.indexOf(asOf);
    if (cutoff < 0) return chain;
    return chain.filter((file) => order.indexOf(file) <= cutoff);
}

function produced(
    migrationsDir: string,
    view: string,
    asOf: string | undefined,
    depth: number,
    seen: Set<string>,
): string[] {
    const key = view.toLowerCase();
    if (seen.has(key) || depth > MAX_INHERITANCE_DEPTH) return [];
    seen.add(key);
    const chain = chainAsOf(migrationsDir, view, asOf);
    if (chain.length === 0) return [];
    const body = viewBody(readMigration(migrationsDir, chain[chain.length - 1]), view);
    const own = derivedColumns(body);
    const inner = inheritedView(body);
    if (inner === undefined) return own;
    return [...own, ...produced(migrationsDir, inner, asOf, depth + 1, seen)];
}

/**
 * Every column the view projects under a name: the ones it names itself, plus the ones it inherits
 * through `g.*` from the generated inner view (and so on inward). A source that is a TABLE rather
 * than a view contributes nothing, because a table's columns are not aliases.
 *
 * `asOf` measures the view as of a particular migration, following the star into whichever inner
 * definer had been applied by then. Both sides of a "drops no column" comparison must be read this
 * way: an alias-only BEFORE against an inheritance-aware NOW leaves every inherited column
 * unprotected — see note I at the top of this file.
 */
export function producedColumns(migrationsDir: string, view: string, asOf?: string): string[] {
    return produced(migrationsDir, view, asOf, 0, new Set<string>());
}

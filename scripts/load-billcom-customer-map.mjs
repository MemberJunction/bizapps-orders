#!/usr/bin/env node
/**
 * Reconcile and load `ExternalCustomer` mapping rows between Bill.com customers and
 * `MJ_BizApps_Common` Organizations / People (`#741`, `#970`).
 *
 * WHY
 *   Before an invoice is sent to Bill.com, Orders resolves the bill-to party to a Bill.com customer
 *   through `[__mj_BizAppsOrders].[ExternalCustomer]`. When a company already has customers in
 *   Bill.com before Orders goes live, loading those mappings ahead of time prevents duplicate
 *   customers from being created on the first invoice send and surfaces ambiguous or unmatched
 *   records for review.
 *
 * INPUT
 *   Reads a JSON or CSV export of Bill.com customers (`--customers <file>`) together with the target
 *   `PaymentProviderID` (`--provider <uuid>`), and matches each active Bill.com customer against
 *   Organizations and People by:
 *     1. Exact `accountNumber` = Party `ID`
 *     2. Normalized `email` + normalized `name`
 *     3. Normalized `name` (exact unique match)
 *
 * SAFETY
 *   - Dry-run by default: prints a JSON/table reconciliation report of `Matched`, `AlreadyMapped`,
 *     `Ambiguous`, and `Unmatched` records without writing anything.
 *   - Pass `--apply` to insert the unambiguous `Matched` rows into `[__mj_BizAppsOrders].[ExternalCustomer]`
 *     inside a single transaction, skipping any party that already has a mapping for that provider.
 *
 * USAGE
 *   DB_HOST=... DB_PORT=1433 DB_DATABASE=... DB_USERNAME=... DB_PASSWORD=... \
 *     node scripts/load-billcom-customer-map.mjs --provider <PaymentProviderID> --customers <path.json> [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

/** Normalize a display name or email for case-insensitive matching. */
export function normalizeKey(raw) {
    if (raw == null) return '';
    return String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Reconcile a list of Bill.com customer records against Organizations, People, and existing
 * `ExternalCustomer` rows. Pure function so unit tests can exercise every matching branch.
 *
 * @param {object} params
 * @param {Array<{ id: string, name?: string | null, email?: string | null, accountNumber?: string | null, archived?: boolean, isActive?: boolean | string }>} params.billComCustomers
 * @param {Array<{ ID: string, Name: string, Email?: string | null }>} params.organizations
 * @param {Array<{ ID: string, Name: string, Email?: string | null }>} params.people
 * @param {Array<{ BillToOrganizationID?: string | null, BillToPersonID?: string | null, ExternalCustomerRef: string }>} params.existingMappings
 */
export function reconcileBillComCustomerMap({
    billComCustomers,
    organizations,
    people,
    existingMappings = [],
}) {
    const mappedByParty = new Map();
    const mappedByRef = new Map();
    for (const m of existingMappings) {
        const partyKey = m.BillToOrganizationID
            ? `Org:${String(m.BillToOrganizationID).toLowerCase()}`
            : m.BillToPersonID
              ? `Person:${String(m.BillToPersonID).toLowerCase()}`
              : null;
        if (partyKey) mappedByParty.set(partyKey, m.ExternalCustomerRef);
        if (m.ExternalCustomerRef) mappedByRef.set(String(m.ExternalCustomerRef), partyKey);
    }

    const parties = [
        ...organizations.map((o) => ({
            Kind: 'Organization',
            ID: String(o.ID),
            Key: `Org:${String(o.ID).toLowerCase()}`,
            Name: String(o.Name ?? ''),
            NormName: normalizeKey(o.Name),
            NormEmail: normalizeKey(o.Email),
        })),
        ...people.map((p) => ({
            Kind: 'Person',
            ID: String(p.ID),
            Key: `Person:${String(p.ID).toLowerCase()}`,
            Name: String(p.Name ?? ''),
            NormName: normalizeKey(p.Name),
            NormEmail: normalizeKey(p.Email),
        })),
    ];

    const byId = new Map(parties.map((p) => [p.ID.toLowerCase(), p]));
    const byName = new Map();
    const byNameAndEmail = new Map();
    for (const p of parties) {
        if (p.NormName) {
            const list = byName.get(p.NormName) ?? [];
            list.push(p);
            byName.set(p.NormName, list);
        }
        if (p.NormName && p.NormEmail) {
            const k = `${p.NormName}|${p.NormEmail}`;
            const list = byNameAndEmail.get(k) ?? [];
            list.push(p);
            byNameAndEmail.set(k, list);
        }
    }

    const matched = [];
    const alreadyMapped = [];
    const ambiguous = [];
    const unmatched = [];

    for (const c of billComCustomers) {
        if (!c || !c.id) continue;
        if (c.archived === true || String(c.isActive ?? 'true').toLowerCase() === 'false') continue;
        const ref = String(c.id).trim();
        if (mappedByRef.has(ref)) {
            alreadyMapped.push({ ExternalCustomerRef: ref, Name: c.name ?? null, PartyKey: mappedByRef.get(ref) });
            continue;
        }

        const acct = normalizeKey(c.accountNumber);
        const normName = normalizeKey(c.name);
        const normEmail = normalizeKey(c.email);

        let candidates = [];
        let matchedBy = null;
        if (acct && byId.has(acct)) {
            candidates = [byId.get(acct)];
            matchedBy = 'accountNumber';
        } else if (normName && normEmail && byNameAndEmail.has(`${normName}|${normEmail}`)) {
            candidates = byNameAndEmail.get(`${normName}|${normEmail}`);
            matchedBy = 'name+email';
        } else if (normName && byName.has(normName)) {
            candidates = byName.get(normName);
            matchedBy = 'name';
        }

        if (candidates.length === 1) {
            const party = candidates[0];
            if (mappedByParty.has(party.Key)) {
                alreadyMapped.push({
                    ExternalCustomerRef: ref,
                    Name: c.name ?? null,
                    PartyKey: party.Key,
                    ExistingExternalCustomerRef: mappedByParty.get(party.Key),
                });
                continue;
            }
            matched.push({
                ExternalCustomerRef: ref,
                PartyKind: party.Kind,
                PartyID: party.ID,
                BillToOrganizationID: party.Kind === 'Organization' ? party.ID : null,
                BillToPersonID: party.Kind === 'Person' ? party.ID : null,
                PartyName: party.Name,
                BillComName: c.name ?? null,
                MatchedBy: matchedBy,
            });
            mappedByParty.set(party.Key, ref);
            mappedByRef.set(ref, party.Key);
        } else if (candidates.length > 1) {
            ambiguous.push({
                ExternalCustomerRef: ref,
                Name: c.name ?? null,
                Email: c.email ?? null,
                CandidateIDs: candidates.map((x) => `${x.Kind}:${x.ID}`),
            });
        } else {
            unmatched.push({
                ExternalCustomerRef: ref,
                Name: c.name ?? null,
                Email: c.email ?? null,
                AccountNumber: c.accountNumber ?? null,
            });
        }
    }

    return { Matched: matched, AlreadyMapped: alreadyMapped, Ambiguous: ambiguous, Unmatched: unmatched };
}

function parseArgs(argv) {
    const out = { apply: false, provider: null, customers: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') out.apply = true;
        else if (a === '--provider') out.provider = argv[++i] ?? null;
        else if (a === '--customers') out.customers = argv[++i] ?? null;
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.provider || !args.customers) {
        console.error('Usage: node scripts/load-billcom-customer-map.mjs --provider <PaymentProviderID> --customers <customers.json> [--apply]');
        process.exit(2);
    }
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.customers), 'utf8'));
    const billComCustomers = Array.isArray(raw) ? raw : Array.isArray(raw.records) ? raw.records : [];
    const ordersSchema = process.env.MJ_ORDERS_SCHEMA || '__mj_BizAppsOrders';
    const commonSchema = process.env.MJ_COMMON_SCHEMA || '__mj_BizAppsCommon';

    const pool = await sql.connect({
        server: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        options: {
            encrypt: false,
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== '0',
        },
    });

    try {
        const [orgs, people, existing] = await Promise.all([
            pool.request().query(`SELECT ID, Name, Email FROM [${commonSchema}].[Organization]`),
            pool.request().query(`SELECT ID, FirstName + N' ' + LastName AS Name, Email FROM [${commonSchema}].[Person]`),
            pool
                .request()
                .input('ProviderID', sql.UniqueIdentifier, args.provider)
                .query(
                    `SELECT BillToOrganizationID, BillToPersonID, ExternalCustomerRef
                       FROM [${ordersSchema}].[ExternalCustomer]
                      WHERE PaymentProviderID = @ProviderID`,
                ),
        ]);

        const report = reconcileBillComCustomerMap({
            billComCustomers,
            organizations: orgs.recordset,
            people: people.recordset,
            existingMappings: existing.recordset,
        });

        console.log(
            JSON.stringify(
                {
                    Mode: args.apply ? 'apply' : 'dry-run',
                    PaymentProviderID: args.provider,
                    Counts: {
                        Matched: report.Matched.length,
                        AlreadyMapped: report.AlreadyMapped.length,
                        Ambiguous: report.Ambiguous.length,
                        Unmatched: report.Unmatched.length,
                    },
                    Ambiguous: report.Ambiguous,
                    Unmatched: report.Unmatched,
                },
                null,
                2,
            ),
        );

        if (args.apply && report.Matched.length > 0) {
            const tx = new sql.Transaction(pool);
            await tx.begin();
            try {
                for (const m of report.Matched) {
                    await new sql.Request(tx)
                        .input('ProviderID', sql.UniqueIdentifier, args.provider)
                        .input('OrgID', sql.UniqueIdentifier, m.BillToOrganizationID)
                        .input('PersonID', sql.UniqueIdentifier, m.BillToPersonID)
                        .input('Ref', sql.NVarChar(200), m.ExternalCustomerRef)
                        .query(`
                            INSERT INTO [${ordersSchema}].[ExternalCustomer]
                                (PaymentProviderID, BillToOrganizationID, BillToPersonID, ExternalCustomerRef, LastSyncedAt)
                            SELECT @ProviderID, @OrgID, @PersonID, @Ref, GETUTCDATE()
                             WHERE NOT EXISTS (
                                 SELECT 1
                                   FROM [${ordersSchema}].[ExternalCustomer]
                                  WHERE PaymentProviderID = @ProviderID
                                    AND ((@OrgID IS NOT NULL AND BillToOrganizationID = @OrgID)
                                      OR (@PersonID IS NOT NULL AND BillToPersonID = @PersonID)
                                      OR ExternalCustomerRef = @Ref)
                             );
                        `);
                }
                await tx.commit();
            } catch (err) {
                await tx.rollback();
                throw err;
            }
        }
    } finally {
        await pool.close();
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

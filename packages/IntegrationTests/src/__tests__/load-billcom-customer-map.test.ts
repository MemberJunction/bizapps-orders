/**
 * The Bill.com customer-map loader (`scripts/load-billcom-customer-map.mjs`), unit-level: the pure
 * reconciler, the argument parser and the schema-name guard. The database half needs a server and is
 * not run here.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Party {
    ID: string;
    Name: string;
    Email?: string | null;
}
interface Loader {
    reconcileBillComCustomerMap(p: {
        billComCustomers: Array<Record<string, unknown>>;
        organizations: Party[];
        people: Party[];
        existingMappings?: Array<{ BillToOrganizationID?: string | null; BillToPersonID?: string | null; ExternalCustomerRef: string }>;
    }): Record<'Matched' | 'AlreadyMapped' | 'Ambiguous' | 'Unmatched', Array<Record<string, unknown>>>;
    parseArgs(argv: string[]): { apply: boolean; dryRun: boolean; provider: string | null; customers: string | null };
    schemaName(value: string | undefined, fallback: string): string;
}

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../scripts/load-billcom-customer-map.mjs');
const loader = (await import(pathToFileURL(scriptPath).href)) as Loader;

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG_TWIN = '22222222-2222-4222-8222-222222222222';
const PERSON = '33333333-3333-4333-8333-333333333333';

const organizations: Party[] = [
    { ID: ORG, Name: 'Example Org', Email: 'ap@example.org' },
    { ID: ORG_TWIN, Name: 'Twin Name' },
];
const people: Party[] = [
    { ID: PERSON, Name: 'Pat Example', Email: 'pat@example.com' },
    { ID: '44444444-4444-4444-8444-444444444444', Name: 'Twin Name' },
];

describe('reconcileBillComCustomerMap', () => {
    it('matches by account number first, then name and e-mail, then a unique name', () => {
        const report = loader.reconcileBillComCustomerMap({
            billComCustomers: [
                { id: 'c1', name: 'Renamed In Bill.com', accountNumber: ORG.toUpperCase() },
                { id: 'c2', name: ' pat  EXAMPLE ', email: 'PAT@example.com' },
            ],
            organizations,
            people,
        });
        expect(report.Matched.map((m) => [m.ExternalCustomerRef, m.MatchedBy, m.PartyID])).toEqual([
            ['c1', 'accountNumber', ORG],
            ['c2', 'name+email', PERSON],
        ]);
    });

    it('reports a name two parties share as ambiguous, and an unknown one as unmatched', () => {
        const report = loader.reconcileBillComCustomerMap({
            billComCustomers: [
                { id: 'c3', name: 'Twin Name' },
                { id: 'c4', name: 'Nobody Here' },
            ],
            organizations,
            people,
        });
        expect(report.Matched).toEqual([]);
        expect(report.Ambiguous.map((a) => a.ExternalCustomerRef)).toEqual(['c3']);
        expect(report.Unmatched.map((u) => u.ExternalCustomerRef)).toEqual(['c4']);
    });

    it('skips archived and inactive customers, and leaves a mapped party or ref alone', () => {
        const report = loader.reconcileBillComCustomerMap({
            billComCustomers: [
                { id: 'c5', name: 'Example Org', archived: true },
                { id: 'c6', name: 'Example Org', isActive: 'false' },
                { id: 'c7', name: 'Example Org' },
                { id: 'mapped-ref', name: 'Anything' },
            ],
            organizations,
            people,
            existingMappings: [{ BillToOrganizationID: ORG, ExternalCustomerRef: 'mapped-ref' }],
        });
        expect(report.Matched).toEqual([]);
        expect(report.AlreadyMapped.map((m) => m.ExternalCustomerRef)).toEqual(['c7', 'mapped-ref']);
    });
});

describe('the command line', () => {
    it('is a dry run unless --apply is given', () => {
        expect(loader.parseArgs(['--provider', 'p', '--customers', 'c.json'])).toMatchObject({ apply: false, dryRun: false });
        expect(loader.parseArgs(['--dry-run', '--provider', 'p', '--customers', 'c.json'])).toMatchObject({ apply: false, dryRun: true });
    });

    it('refuses --apply with --dry-run, and any flag it does not know', () => {
        expect(() => loader.parseArgs(['--apply', '--dry-run'])).toThrow(/cannot be combined/);
        expect(() => loader.parseArgs(['--aply'])).toThrow(/Unknown argument/);
    });

    it('accepts only a plain identifier as a schema name', () => {
        expect(loader.schemaName(undefined, '__mj_BizAppsOrders')).toBe('__mj_BizAppsOrders');
        expect(loader.schemaName('custom_schema', '__mj_BizAppsOrders')).toBe('custom_schema');
        expect(() => loader.schemaName('x].[Organization]; DROP TABLE t; --', '__mj_BizAppsOrders')).toThrow(/plain identifier/);
    });
});

/**
 * stripe-live.mjs — `Orders.CreateOrderFromProviderPayment` against Stripe's TEST mode (#575).
 * NEVER CI, and never against a database anyone else uses: it books orders, payments and journal
 * entries it does not remove.
 *
 * WHY THIS EXISTS. The integration suite runs Stripe's stub (`PaymentProvider.IsLiveMode = 0`), which
 * has no charges, so PV13–PV16 hand the operation a charge they build. That skips the parts only Stripe
 * can answer: `RetrieveCharge` and its mapping of Stripe's charge object, and the capture's
 * already-captured path with its read of the fee from the balance transaction. This probe takes those
 * paths with real Stripe objects.
 *
 * WHY THE ROW IS "LIVE" AND THE KEY IS NOT. The stub is chosen by the provider row, not by the key, so
 * a test key on a test-mode row never leaves the process. The probe creates its own provider row with
 * `IsLiveMode = 1` and a credentials ref whose key MUST be a Stripe test key; it refuses a live key
 * before touching the database. At the end the row is deactivated, not deleted: the orders and
 * payments it booked reference it.
 *
 * WHAT IT CHECKS
 *   S1  a confirmed charge with no Orders intent becomes a confirmed order in the provider's company,
 *       paid by a captured payment for the gross, with Stripe's own fee recorded and net + fee = gross
 *   S2  the same charge again returns the same order and payment
 *   S3  a partly refunded charge is refused (ChargeRefunded) and writes no intent
 *   S4  a charge on an intent Orders already holds is refused (IntentOpenedByOrders)
 *   S5  a charge id Stripe does not have is refused (ChargeNotFound)
 *
 * Environment (from ../.env, like the other live harnesses): DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME,
 * DB_PASSWORD, MJ_CORE_SCHEMA; plus
 *   STRIPE_PROBE_CREDENTIALS_REF   the env-var prefix the provider row stores; `<ref>_API_KEY` must hold
 *                                  an sk_test_ or rk_test_ key (default STRIPE_PROBE)
 *   STRIPE_PROBE_COMPANY_ID        the selling company; charges are made in its functional currency
 *   STRIPE_PROBE_PRODUCT_ID        a product priced at STRIPE_PROBE_AMOUNT that draws no tax or charges
 *   STRIPE_PROBE_PERSON_ID         the buyer
 *   STRIPE_PROBE_AMOUNT            the charge amount in major units (default 30)
 *
 * Usage: node test-harnesses/stripe-live.mjs   (build first: it loads the packages from dist/)
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';
import { importAccountingPackage } from './resolve-app-packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const ORDERS = '__mj_BizAppsOrders';
const ACCT = '__mj_BizAppsAccounting';
const STRIPE_API = 'https://api.stripe.com/v1';

const need = (name) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required for this probe`);
    return v;
};
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

let pass = 0;
const failures = [];
function check(label, condition, detail = '') {
    if (condition) {
        pass++;
        console.log(`  ok    ${label}`);
    } else {
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

/** Stripe's form encoding over fetch, the same transport the driver uses. */
function stripeClient(apiKey) {
    return async (method, apiPath, fields) => {
        const res = await fetch(`${STRIPE_API}${apiPath}`, {
            method,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: fields ? new URLSearchParams(fields).toString() : undefined,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(`Stripe ${method} ${apiPath}: ${body?.error?.message ?? res.status}`);
        return body;
    };
}

async function main() {
    const ref = process.env.STRIPE_PROBE_CREDENTIALS_REF || 'STRIPE_PROBE';
    const apiKey = need(`${ref}_API_KEY`);
    // Refused before anything else runs: this probe creates charges, and a live key would make them real.
    if (!/^(sk|rk)_test_/.test(apiKey)) {
        throw new Error(`${ref}_API_KEY is not a Stripe test key (sk_test_/rk_test_). This probe never runs against live Stripe.`);
    }
    const companyID = need('STRIPE_PROBE_COMPANY_ID');
    const productID = need('STRIPE_PROBE_PRODUCT_ID');
    const personID = need('STRIPE_PROBE_PERSON_ID');
    const amount = money(process.env.STRIPE_PROBE_AMOUNT ?? 30);
    const stripe = stripeClient(apiKey);

    const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
    const pool = await new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: DB_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: true, encrypt: false },
        pool: { max: 5, min: 1 },
    }).connect();
    const one = async (q) => (await pool.request().query(q)).recordset[0] ?? null;

    const { setupSQLServerClient, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
    const { UserCache } = await import('@memberjunction/generic-database-provider');
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    await UserCache.Instance.Refresh(pool);
    const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!user) throw new Error('No context user in UserCache.');

    const acctServer = await importAccountingPackage('@mj-biz-apps/accounting-server');
    acctServer.LoadBizAppsAccountingServer?.();
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();
    const { CreateOrderFromProviderPaymentOperation } = await import('@mj-biz-apps/orders-core-entities-server');
    const { Metadata } = await import('@memberjunction/core');
    const provider = Metadata.Provider;

    const booksIn = await one(`SELECT FunctionalCurrencyCode AS Code FROM ${ACCT}.AccountingCompanyProfile WHERE ID='${companyID}'`);
    if (!booksIn?.Code) throw new Error(`Company ${companyID} has no accounting profile with a functional currency.`);
    const currency = booksIn.Code.toLowerCase();
    const minor = String(Math.round(amount * 100));

    // ── The provider row: live mode so the real driver runs, holding the test key's ref ──
    const type = await one(`SELECT ID FROM ${ORDERS}.PaymentProviderType WHERE Code='Stripe'`);
    if (!type) throw new Error("No PaymentProviderType 'Stripe': push the app metadata (mj sync push) first.");
    const row = await provider.GetEntityObject('MJ_BizApps_Orders: Payment Providers', user);
    row.NewRecord();
    row.PaymentProviderTypeID = type.ID;
    row.CompanyID = companyID;
    row.Name = `Stripe test-mode probe ${randomUUID().slice(0, 8)}`;
    row.CredentialsRef = ref;
    row.IsLiveMode = true;
    row.IsActive = true;
    if (!(await row.Save())) throw new Error(`Could not create the probe provider: ${row.LatestResult?.CompleteMessage}`);
    const providerID = row.ID;
    console.log(`\nProbe provider ${row.Name} (${providerID}), ${amount} ${booksIn.Code}`);

    const run = async (chargeID) => {
        const result = await new CreateOrderFromProviderPaymentOperation().ExecuteServer(
            { PaymentProviderID: providerID, ProviderChargeID: chargeID, ProductID: productID, BillToPersonID: personID, BillToOrganizationID: null },
            { provider, user, emitProgress: () => undefined },
        );
        if (!result.Success) throw new Error(`The operation itself failed: ${result.ErrorMessage}`);
        return result.Output;
    };
    // A card payment confirmed in Stripe directly: no Orders checkout behind it.
    const directCharge = async (description) => {
        const pi = await stripe('POST', '/payment_intents', {
            amount: minor,
            currency,
            payment_method: 'pm_card_visa',
            confirm: 'true',
            'automatic_payment_methods[enabled]': 'true',
            'automatic_payment_methods[allow_redirects]': 'never',
            description,
        });
        if (pi.status !== 'succeeded') throw new Error(`Stripe left intent ${pi.id} as '${pi.status}'.`);
        return { intentID: pi.id, chargeID: pi.latest_charge };
    };

    try {
        // ── S1: the unmatched charge becomes a paid order ──
        console.log('\nS1 charge with no Orders intent');
        const c1 = await directCharge('bizapps-orders stripe-live probe S1');
        const out = await run(c1.chargeID);
        check('the order is created and paid', out?.Success === true, `${out?.Code} ${out?.Message}`);
        if (out?.Success) {
            const order = await one(`SELECT CompanyID, Status, Origin, TotalGross, AmountPaid, Balance, BillToPersonID
                                       FROM ${ORDERS}.OrderHeader WHERE ID='${out.OrderHeaderID}'`);
            check("in the provider's company", same(order.CompanyID, companyID));
            check('billed to the named buyer', same(order.BillToPersonID, personID));
            check('booked, not a draft', order.Status !== 'Draft', `status ${order.Status}`);
            check('origin ProviderPayment', order.Origin === 'ProviderPayment', order.Origin);
            check('totals the charge and is fully paid', money(order.TotalGross) === amount && money(order.AmountPaid) === amount && money(order.Balance) === 0,
                `gross ${order.TotalGross}, paid ${order.AmountPaid}, balance ${order.Balance}`);

            const pay = await one(`SELECT Status, Amount, ProcessingFeeAmount AS Fee, NetAmount AS Net, ProviderChargeID AS ChargeID
                                     FROM ${ORDERS}.PaymentHeader WHERE ID='${out.PaymentHeaderID}'`);
            const stripeCharge = await stripe('GET', `/charges/${c1.chargeID}?expand[]=balance_transaction`);
            const stripeFee = money(Number(stripeCharge.balance_transaction?.fee ?? NaN) / 100);
            check('the payment is captured for the gross', pay.Status === 'Captured' && money(pay.Amount) === amount, `${pay.Status} ${pay.Amount}`);
            check("the fee is Stripe's own", Number.isFinite(stripeFee) && money(pay.Fee) === stripeFee, `recorded ${pay.Fee}, Stripe ${stripeFee}`);
            check('net + fee is the gross', money(Number(pay.Net) + Number(pay.Fee)) === amount, `net ${pay.Net}, fee ${pay.Fee}`);
            check('the Stripe charge is stamped', pay.ChargeID === c1.chargeID, pay.ChargeID);

            // ── S2: a repeat finds the same order ──
            console.log('\nS2 same charge again');
            const again = await run(c1.chargeID);
            check('the repeat succeeds and says it found the order', again?.Success === true && again.WasExisting === true, `${again?.Code} ${again?.Message}`);
            check('the same order and payment', same(again?.OrderHeaderID, out.OrderHeaderID) && same(again?.PaymentHeaderID, out.PaymentHeaderID));
        }

        // ── S3: a partly refunded charge is refused ──
        console.log('\nS3 partly refunded charge');
        const c3 = await directCharge('bizapps-orders stripe-live probe S3');
        await stripe('POST', '/refunds', { charge: c3.chargeID, amount: String(Math.max(1, Math.floor(Number(minor) / 4))) });
        const r3 = await run(c3.chargeID);
        check('refused as ChargeRefunded', r3?.Code === 'ChargeRefunded', `${r3?.Code} ${r3?.Message}`);
        const i3 = await one(`SELECT COUNT(*) AS N FROM ${ORDERS}.PaymentIntent WHERE ProviderIntentID='${c3.intentID}'`);
        check('and writes no intent', Number(i3.N) === 0, `${i3.N} rows`);

        // ── S4: a charge on an intent Orders holds is refused ──
        // The intent row is created as a checkout would leave it before its order: Orders' own row for
        // the Stripe intent, with no order of the ProviderPayment origin behind it.
        console.log('\nS4 charge on an intent Orders already holds');
        const c4 = await directCharge('bizapps-orders stripe-live probe S4');
        const held = await provider.GetEntityObject('MJ_BizApps_Orders: Payment Intents', user);
        held.NewRecord();
        held.PaymentProviderID = providerID;
        held.ProviderIntentID = c4.intentID;
        held.Status = 'RequiresPayment';
        held.Amount = amount;
        if (!(await held.Save())) throw new Error(`Could not create the held intent: ${held.LatestResult?.CompleteMessage}`);
        const r4 = await run(c4.chargeID);
        check('refused as IntentOpenedByOrders', r4?.Code === 'IntentOpenedByOrders', `${r4?.Code} ${r4?.Message}`);

        // ── S5: an unknown charge id ──
        console.log('\nS5 charge Stripe does not have');
        const r5 = await run(`ch_missing_${randomUUID().replace(/-/g, '').slice(0, 16)}`);
        check('refused as ChargeNotFound', r5?.Code === 'ChargeNotFound', `${r5?.Code} ${r5?.Message}`);
    } finally {
        row.IsActive = false;
        if (!(await row.Save())) console.error(`Could not deactivate probe provider ${providerID}: ${row.LatestResult?.CompleteMessage}`);
        await pool.close();
    }

    console.log(`\n${pass} passed, ${failures.length} failed`);
    if (failures.length) {
        for (const f of failures) console.log(`  - ${f}`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

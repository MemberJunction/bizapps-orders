/**
 * stripe-live.mjs — Orders' Stripe paths against Stripe's TEST mode: `Orders.CreateOrderFromProviderPayment`
 * (#575), and renewal charging with the update-card link (#894).
 * NEVER CI, and never against a database anyone else uses: it books orders, payments, journal entries,
 * people and subscriptions it does not remove.
 *
 * WHY THIS EXISTS. The integration suite runs Stripe's stub (`PaymentProvider.IsLiveMode = 0`), which
 * has no charges and answers a saved-card charge from the test card's name. That skips the parts only
 * Stripe can answer: whether it accepts the requests the driver builds, and whether its answers (a
 * charge object, a fee on the balance transaction, a 402 decline with its code, an SCA demand) are read
 * the way the driver reads them. This probe takes those paths with real Stripe objects.
 *
 * WHY THE ROW IS "LIVE" AND THE KEY IS NOT. The stub is chosen by the provider row, not by the key, so
 * a test key on a test-mode row never leaves the process. The probe creates its own provider row with
 * `IsLiveMode = 1` and a credentials ref whose key MUST be a Stripe test key; it refuses a live key
 * before touching the database. At the end the row is deactivated, not deleted: the orders and
 * payments it booked reference it.
 *
 * WHAT IT CHECKS
 *   provider-payment group (#575)
 *   S1  a confirmed charge with no Orders intent becomes a confirmed order in the provider's company,
 *       paid by a captured payment for the gross, with Stripe's own fee recorded and net + fee = gross
 *   S2  the same charge again returns the same order and payment
 *   S3  a partly refunded charge is refused (ChargeRefunded) and writes no intent
 *   S4  a charge on an intent Orders already holds is refused (IntentOpenedByOrders)
 *   S5  a charge id Stripe does not have is refused (ChargeNotFound)
 *
 *   renewal group (#894). Each scenario buys its own subscription, backdated so the renewal's due day
 *   and every retry day are already past, files a renewal card and books the renewal order; the
 *   charge pass then runs with an as-of day, as the scheduled Action does.
 *   R1  a card on a customer Orders' driver made is charged off-session on the due day and captured
 *       against the renewal order, with Stripe's fee, and a PaymentSucceeded event names the payment
 *   R2  rerunning the pass the same day charges nothing more, for the paid order and the declined one
 *   R3  a card Stripe declines records a Failed intent with Stripe's decline code, and the
 *       update-card link is asked for once
 *   R4  a card that demands authentication is recorded as an authentication failure, not a decline
 *   R5  the declined card is tried again on each retry day, each its own Stripe intent, on no day in
 *       between, and the link is not asked for again
 *   R6  the update-card link pays R4's renewal on-session: the probe confirms the session's intent
 *       with a new card in place of the browser; the payment books against the renewal order, the new
 *       card becomes the renewal card, and the link is refused afterwards
 *   R7  cards Orders never saw, on a customer made directly in Stripe, are charged off-session: a
 *       PaymentMethod (`pm_…`) and a legacy card source (`card_…`), the two kinds an imported
 *       subscription carries
 *
 * Environment (from ../.env, like the other live harnesses): DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME,
 * DB_PASSWORD, MJ_CORE_SCHEMA; plus
 *   STRIPE_PROBE_CREDENTIALS_REF   the env-var prefix the provider row stores; `<ref>_API_KEY` must hold
 *                                  an sk_test_ or rk_test_ key (default STRIPE_PROBE)
 *   STRIPE_PROBE_COMPANY_ID        the selling company; charges are made in its functional currency
 *   provider-payment group:
 *   STRIPE_PROBE_PRODUCT_ID        a product priced at STRIPE_PROBE_AMOUNT that draws no tax or charges
 *   STRIPE_PROBE_PERSON_ID         the buyer
 *   STRIPE_PROBE_AMOUNT            the charge amount in major units (default 30)
 *   renewal group:
 *   STRIPE_PROBE_SUBSCRIPTION_PRODUCT_ID  an annual subscription product that renews automatically,
 *                                  with a list price, a renewal lead time of at least one day, and no
 *                                  tax or charges. Its first order is backdated by a year and a few
 *                                  weeks, so that period must be open in the company's books.
 *
 * Usage: node test-harnesses/stripe-live.mjs [--only provider-payment|renewal]
 *   (build first: it loads the packages from dist/). Without --only, both groups run.
 */
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';
import { importAccountingPackage } from './resolve-app-packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const ORDERS = '__mj_BizAppsOrders';
const ACCT = '__mj_BizAppsAccounting';
const STRIPE_API = 'https://api.stripe.com/v1';
const GROUPS = ['provider-payment', 'renewal'];

const need = (name) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required for this probe`);
    return v;
};
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (day, n) => {
    const d = new Date(`${isoDay(day)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return isoDay(d);
};

/** The groups to run: every group, or the one `--only` names. */
function selectedGroups(argv) {
    const at = argv.indexOf('--only');
    if (at === -1) return GROUPS;
    const name = argv[at + 1];
    if (!GROUPS.includes(name)) throw new Error(`--only takes one of: ${GROUPS.join(', ')}`);
    return [name];
}

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
    const groups = selectedGroups(process.argv.slice(2));
    const ref = process.env.STRIPE_PROBE_CREDENTIALS_REF || 'STRIPE_PROBE';
    const apiKey = need(`${ref}_API_KEY`);
    // Refused before anything else runs: this probe creates charges, and a live key would make them real.
    if (!/^(sk|rk)_test_/.test(apiKey)) {
        throw new Error(`${ref}_API_KEY is not a Stripe test key (sk_test_/rk_test_). This probe never runs against live Stripe.`);
    }
    const companyID = need('STRIPE_PROBE_COMPANY_ID');
    // Read before the database is touched, so a missing setting fails the run before it books anything.
    const settings = {
        productID: groups.includes('provider-payment') ? need('STRIPE_PROBE_PRODUCT_ID') : null,
        personID: groups.includes('provider-payment') ? need('STRIPE_PROBE_PERSON_ID') : null,
        amount: money(process.env.STRIPE_PROBE_AMOUNT ?? 30),
        subscriptionProductID: groups.includes('renewal') ? need('STRIPE_PROBE_SUBSCRIPTION_PRODUCT_ID') : null,
    };
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
    const all = async (q) => (await pool.request().query(q)).recordset;
    const one = async (q) => (await all(q))[0] ?? null;

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
    const core = await import('@mj-biz-apps/orders-core-entities-server');
    const { Metadata } = await import('@memberjunction/core');
    const provider = Metadata.Provider;

    const booksIn = await one(`SELECT FunctionalCurrencyCode AS Code FROM ${ACCT}.AccountingCompanyProfile WHERE ID='${companyID}'`);
    if (!booksIn?.Code) throw new Error(`Company ${companyID} has no accounting profile with a functional currency.`);

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
    console.log(`\nProbe provider ${row.Name} (${providerID}), books in ${booksIn.Code}`);

    const ctx = { stripe, all, one, core, provider, user, providerID, companyID, currency: booksIn.Code.toLowerCase(), ...settings };
    try {
        if (groups.includes('provider-payment')) await providerPaymentScenarios(ctx);
        if (groups.includes('renewal')) await renewalScenarios(ctx);
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

// ─── provider-payment: Orders.CreateOrderFromProviderPayment (#575) ─────────────────────────────

async function providerPaymentScenarios({ stripe, one, core, provider, user, providerID, companyID, currency, productID, personID, amount }) {
    const minor = String(Math.round(amount * 100));
    const run = async (chargeID) => {
        const result = await new core.CreateOrderFromProviderPaymentOperation().ExecuteServer(
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
        const stripeFee = await feeOfCharge(stripe, c1.chargeID);
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
}

/** Stripe's fee on a charge, in major units, from its balance transaction. */
async function feeOfCharge(stripe, chargeID) {
    const charge = await stripe('GET', `/charges/${chargeID}?expand[]=balance_transaction`);
    return money(Number(charge.balance_transaction?.fee ?? NaN) / 100);
}

// ─── renewal: charging the renewal card and the update-card link (#894) ─────────────────────────

async function renewalScenarios(ctx) {
    const { stripe, all, one, core, provider, user, providerID, companyID, subscriptionProductID } = ctx;
    const { AsDateValue } = await import('@mj-biz-apps/orders-entities');
    const run = randomUUID().slice(0, 8);
    const opContext = { provider, user, emitProgress: () => undefined };

    await core.OrdersSettings.Load(provider, user);
    const retryDays = [...core.OrdersSettings.RenewalChargeRetryDays];
    const lastRetry = Math.max(0, ...retryDays);
    const today = isoDay(new Date());
    const tender = await one(`SELECT ID FROM ${ORDERS}.PaymentType WHERE Code='CreditCard'`);
    if (!tender) throw new Error("No PaymentType 'CreditCard': push the app metadata (mj sync push) first.");
    const driver = await core.ResolvePaymentProvider(providerID, provider, user);

    // The link is signed with a secret made for this run; the address is never opened.
    const linkSecret = randomBytes(32).toString('hex');
    core.ConfigureRenewalPaymentLinks({ Secret: linkSecret });
    core.OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', 'https://checkout.example.test/checkout');

    // The update-card e-mail is the server's; here the pass only says when it would send one.
    const linkAsks = [];
    const hooks = {
        OnFirstFailure: async (attempt) => {
            linkAsks.push(attempt.OrderID);
            return { Sent: true };
        },
    };
    const charge = (subscriptionID, day) => core.ChargeRenewals({ SubscriptionID: subscriptionID, AsOfDate: day }, provider, user, hooks);
    const attemptOf = (out, orderID) => out.Attempts.find((a) => same(a.OrderID, orderID));
    const intentsOf = (orderID) =>
        all(`SELECT ID, Status, ProviderIntentID FROM ${ORDERS}.PaymentIntent WHERE OrderHeaderID='${orderID}' ORDER BY __mj_CreatedAt`);
    const eventsOf = (orderID) =>
        all(`SELECT EventType, EventData, RelatedPaymentID FROM ${ORDERS}.SubscriptionEvent
              WHERE RelatedOrderHeaderID='${orderID}' AND EventType IN ('PaymentSucceeded','PaymentFailed')
              ORDER BY __mj_CreatedAt, ID`);
    const balanceOf = async (orderID) => money((await one(`SELECT Balance FROM ${ORDERS}.vwOrderHeaders WHERE ID='${orderID}'`)).Balance);
    const paymentsOf = (orderID) =>
        all(`SELECT DISTINCT ph.ID, ph.Status, ph.Amount, ph.ProcessingFeeAmount AS Fee, ph.NetAmount AS Net, ph.ProviderChargeID AS ChargeID
               FROM ${ORDERS}.PaymentHeader ph JOIN ${ORDERS}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
              WHERE pl.OrderHeaderID='${orderID}'`);

    /**
     * A person who holds a new subscription, bought far enough back that the renewal's due day and
     * every retry day have passed, with `card` filed as its renewal card and the renewal order booked.
     * A new person each time: the same holder buying again would extend the first subscription.
     */
    const renewalOn = async (label, card) => {
        const person = await provider.GetEntityObject('MJ_BizApps_Common: People', user);
        person.NewRecord();
        person.FirstName = 'Stripe probe';
        person.LastName = `${label} ${run}`;
        person.Email = `stripe-probe+${run}-${label.toLowerCase()}@example.test`;
        person.Status = 'Active';
        if (!(await person.Save())) throw new Error(`${label}: could not create the holder: ${person.LatestResult?.CompleteMessage}`);

        const order = await provider.GetEntityObject('MJ_BizApps_Orders: Order Headers', user);
        order.NewRecord();
        order.OrderType = 'Sale';
        order.OrderDate = AsDateValue(new Date(`${addDays(today, -(366 + lastRetry + 2))}T00:00:00Z`));
        order.Status = 'Draft';
        order.CompanyID = companyID;
        order.BillToPersonID = person.ID;
        const line = await provider.GetEntityObject('MJ_BizApps_Orders: Order Lines', user);
        line.NewRecord();
        line.ProductID = subscriptionProductID;
        line.LineNumber = 1;
        line.Quantity = 1;
        line.DiscountPct = 0;
        order.Lines.Add(line);
        order.Status = 'Confirmed';
        if (!(await order.Save())) throw new Error(`${label}: could not confirm the subscription order: ${order.LatestResult?.CompleteMessage}`);
        const term = await one(`SELECT st.SubscriptionID, CONVERT(varchar(10), st.EndDate, 23) AS EndDate
                                  FROM ${ORDERS}.SubscriptionTerm st JOIN ${ORDERS}.OrderLine ol ON ol.ID = st.OrderLineID
                                 WHERE ol.OrderHeaderID='${order.ID}'`);
        if (!term) throw new Error(`${label}: the order made no subscription term; is STRIPE_PROBE_SUBSCRIPTION_PRODUCT_ID a subscription product?`);
        const dueDay = addDays(term.EndDate, 1);
        if (addDays(dueDay, lastRetry) > today) {
            throw new Error(`${label}: the renewal's last retry day ${addDays(dueDay, lastRetry)} is after today; the product's term is longer than a year.`);
        }

        const stripeCard = await card(person);
        const wallet = await provider.GetEntityObject('MJ_BizApps_Orders: Customer Payment Methods', user);
        wallet.NewRecord();
        wallet.OwnerPersonID = person.ID;
        wallet.IsDefault = true;
        wallet.IsActive = true;
        const detail = wallet.PaymentDetailID_Object;
        detail.CompanyID = companyID;
        detail.PaymentTypeID = tender.ID;
        detail.PaymentProviderID = providerID;
        detail.ProviderCustomerRef = stripeCard.customer;
        detail.ProviderInstrumentRef = stripeCard.instrument;
        detail.Brand = stripeCard.brand;
        detail.Last4 = stripeCard.last4;
        if (!(await wallet.Save())) throw new Error(`${label}: could not file the renewal card: ${wallet.LatestResult?.CompleteMessage}`);
        const sub = await provider.GetEntityObject('MJ_BizApps_Orders: Subscriptions', user);
        if (!(await sub.Load(term.SubscriptionID))) throw new Error(`${label}: could not load subscription ${term.SubscriptionID}`);
        sub.DefaultCustomerPaymentMethodID = wallet.ID;
        if (!(await sub.Save())) throw new Error(`${label}: could not set the renewal card: ${sub.LatestResult?.CompleteMessage}`);

        const placed = await new core.SpawnRenewalsOperation().ExecuteServer({ SubscriptionID: term.SubscriptionID, AsOfDate: term.EndDate }, opContext);
        const renewalID = placed.Output?.Candidates?.find((c) => c.OrderID)?.OrderID;
        if (!placed.Success || placed.Output?.Placed !== 1 || !renewalID) {
            throw new Error(`${label}: the renewal was not placed: ${placed.ErrorMessage ?? placed.Output?.Message}`);
        }
        return {
            PersonID: person.ID,
            SourceOrderID: order.ID,
            SubscriptionID: term.SubscriptionID,
            OrderID: renewalID,
            DueDay: dueDay,
            Due: await balanceOf(renewalID),
            Customer: stripeCard.customer,
            Instrument: stripeCard.instrument,
        };
    };

    // Cards. `attach` turns one of Stripe's test PaymentMethods into a card saved on the customer,
    // as a checkout with setup_future_usage leaves it.
    const attach = async (customer, testPaymentMethod) => {
        const pm = await stripe('POST', `/payment_methods/${testPaymentMethod}/attach`, { customer });
        return { customer, instrument: pm.id, brand: pm.card?.brand ?? 'visa', last4: pm.card?.last4 ?? '0000' };
    };
    const ordersCustomer = async (person) => {
        const made = await driver.EnsureCustomer({ Email: person.Email, Name: `${person.FirstName} ${person.LastName}`, BillToPersonID: person.ID });
        if (!made.Success || !made.ProviderCustomerRef) throw new Error(`Orders' driver made no Stripe customer: ${made.Reason}`);
        return made.ProviderCustomerRef;
    };
    const outsideCustomer = async (person) =>
        (await stripe('POST', '/customers', { email: person.Email, description: 'bizapps-orders stripe-live probe: made outside Orders' })).id;

    // Stripe's own record of a failed off-session attempt: what the driver should have read.
    const stripeRefusal = async (providerIntentID) => {
        const pi = await stripe('GET', `/payment_intents/${providerIntentID}`);
        const err = pi.last_payment_error ?? {};
        return { status: pi.status, code: err.decline_code ?? err.code ?? null, sca: err.code === 'authentication_required' || err.decline_code === 'authentication_required' };
    };

    const checkPaidBy = async (r, label, providerIntentID) => {
        check(`${label}: the renewal order is paid`, (await balanceOf(r.OrderID)) === 0);
        const payments = await paymentsOf(r.OrderID);
        check(`${label}: by one captured payment for the balance`, payments.length === 1 && payments[0].Status === 'Captured' && money(payments[0].Amount) === r.Due,
            JSON.stringify(payments));
        if (payments.length !== 1) return;
        const pi = await stripe('GET', `/payment_intents/${providerIntentID}`);
        check(`${label}: Stripe took the money`, pi.status === 'succeeded' && Number(pi.amount_received) === Math.round(r.Due * 100), `${pi.status} ${pi.amount_received}`);
        const fee = await feeOfCharge(stripe, pi.latest_charge);
        check(`${label}: the fee is Stripe's own`, Number.isFinite(fee) && money(payments[0].Fee) === fee, `recorded ${payments[0].Fee}, Stripe ${fee}`);
        check(`${label}: net + fee is the gross`, money(Number(payments[0].Net) + Number(payments[0].Fee)) === r.Due, `net ${payments[0].Net}, fee ${payments[0].Fee}`);
    };

    // Charged on the due day and captured, for a card on `r`.
    const checkChargedOnDueDay = async (r, label) => {
        const out = await charge(r.SubscriptionID, r.DueDay);
        const attempt = attemptOf(out, r.OrderID);
        check(`${label}: charged on the due day`, attempt?.Outcome === 'Charged', `${attempt?.Outcome} ${attempt?.Reason ?? ''} ${JSON.stringify(out.Failures)}`);
        const intents = await intentsOf(r.OrderID);
        check(`${label}: one intent, Succeeded`, intents.length === 1 && intents[0].Status === 'Succeeded', JSON.stringify(intents));
        if (intents.length !== 1) return;
        const pi = await stripe('GET', `/payment_intents/${intents[0].ProviderIntentID}`);
        check(`${label}: Stripe charged the saved card on its customer`, pi.payment_method === r.Instrument && pi.customer === r.Customer,
            `payment_method ${pi.payment_method}, customer ${pi.customer}`);
        await checkPaidBy(r, label, intents[0].ProviderIntentID);
        const events = await eventsOf(r.OrderID);
        const succeeded = events.filter((e) => e.EventType === 'PaymentSucceeded');
        check(`${label}: a PaymentSucceeded event names the payment`, succeeded.length === 1 && !!succeeded[0].RelatedPaymentID, JSON.stringify(events));
        return out;
    };

    try {
        // ── R1: a card on a customer Orders made ──
        console.log('\nR1 off-session charge of a saved card');
        const r1 = await renewalOn('R1', async (person) => attach(await ordersCustomer(person), 'pm_card_visa'));
        await checkChargedOnDueDay(r1, 'R1');

        // ── R3: a declined card ──
        // pm_card_chargeCustomerFail attaches to the customer and is declined when charged, as a card
        // that was good at checkout and fails at renewal is. Stripe's test-card docs give it for this
        // case; pm_card_chargeDeclined, which the stub answers to, is declined already when attached.
        console.log('\nR3 declined card');
        const r3 = await renewalOn('R3', async (person) => attach(await ordersCustomer(person), 'pm_card_chargeCustomerFail'));
        const asksBefore3 = linkAsks.length;
        const out3 = await charge(r3.SubscriptionID, r3.DueDay);
        const a3 = attemptOf(out3, r3.OrderID);
        check('R3: recorded as declined', a3?.Outcome === 'Declined', `${a3?.Outcome} ${a3?.Reason ?? ''} ${JSON.stringify(out3.Failures)}`);
        const i3 = await intentsOf(r3.OrderID);
        check('R3: one Failed intent, holding Stripe\'s id', i3.length === 1 && i3[0].Status === 'Failed' && /^pi_/.test(i3[0].ProviderIntentID ?? ''), JSON.stringify(i3));
        if (i3.length === 1 && i3[0].ProviderIntentID) {
            const refusal = await stripeRefusal(i3[0].ProviderIntentID);
            const failed = (await eventsOf(r3.OrderID)).filter((e) => e.EventType === 'PaymentFailed').map((e) => JSON.parse(e.EventData ?? '{}'));
            check("R3: the PaymentFailed event carries Stripe's decline code", failed.length === 1 && failed[0].FailureCode === refusal.code && !!refusal.code,
                `event ${failed[0]?.FailureCode}, Stripe ${refusal.code}`);
            check('R3: not read as an authentication demand', failed[0]?.AuthenticationRequired === false);
        }
        check('R3: the update-card link is asked for once', linkAsks.length - asksBefore3 === 1 && same(linkAsks.at(-1), r3.OrderID), `${linkAsks.length - asksBefore3} asks`);
        check('R3: nothing was booked', (await paymentsOf(r3.OrderID)).length === 0);

        // ── R2: the same day again ──
        console.log('\nR2 the pass again on the same day');
        const asksBefore2 = linkAsks.length;
        await charge(r1.SubscriptionID, r1.DueDay);
        await charge(r3.SubscriptionID, r3.DueDay);
        check('R2: the paid order has still one intent and one payment', (await intentsOf(r1.OrderID)).length === 1 && (await paymentsOf(r1.OrderID)).length === 1);
        check('R2: the declined order has still one intent', (await intentsOf(r3.OrderID)).length === 1);
        const r1Charges = await stripe('GET', `/payment_intents?customer=${r1.Customer}&limit=10`);
        check('R2: Stripe holds one intent for the paid order\'s customer', r1Charges.data?.length === 1, `${r1Charges.data?.length}`);
        check('R2: no second link', linkAsks.length === asksBefore2);

        // ── R5: the retry days ──
        console.log(`\nR5 retries on days ${retryDays.join(', ')}`);
        const asksBefore5 = linkAsks.length;
        const offDay = addDays(r3.DueDay, 1);
        if (!retryDays.includes(1)) {
            await charge(r3.SubscriptionID, offDay);
            check(`R5: nothing on ${offDay}, not a retry day`, (await intentsOf(r3.OrderID)).length === 1);
        }
        for (const [n, days] of retryDays.entries()) {
            const out = await charge(r3.SubscriptionID, addDays(r3.DueDay, days));
            const a = attemptOf(out, r3.OrderID);
            check(`R5: day ${days} is attempt ${n + 2} and declined`, a?.Outcome === 'Declined' && a?.Attempt === n + 2, `${a?.Outcome} attempt ${a?.Attempt} ${a?.Reason ?? ''}`);
        }
        const i5 = await intentsOf(r3.OrderID);
        check('R5: one intent per attempt, each a distinct Stripe intent', i5.length === retryDays.length + 1 && new Set(i5.map((i) => i.ProviderIntentID)).size === i5.length,
            JSON.stringify(i5));
        check('R5: every attempt Failed', i5.every((i) => i.Status === 'Failed'));
        check('R5: no further link', linkAsks.length === asksBefore5);

        // ── R4: a card that wants the customer to authenticate ──
        console.log('\nR4 authentication demanded off-session');
        const r4 = await renewalOn('R4', async (person) => attach(await ordersCustomer(person), 'pm_card_authenticationRequired'));
        const asksBefore4 = linkAsks.length;
        const out4 = await charge(r4.SubscriptionID, r4.DueDay);
        const a4 = attemptOf(out4, r4.OrderID);
        check('R4: recorded as an authentication demand', a4?.Outcome === 'AuthenticationRequired', `${a4?.Outcome} ${a4?.Reason ?? ''} ${JSON.stringify(out4.Failures)}`);
        const i4 = await intentsOf(r4.OrderID);
        check('R4: one Failed intent', i4.length === 1 && i4[0].Status === 'Failed', JSON.stringify(i4));
        if (i4.length === 1 && i4[0].ProviderIntentID) {
            const refusal = await stripeRefusal(i4[0].ProviderIntentID);
            const failed = (await eventsOf(r4.OrderID)).filter((e) => e.EventType === 'PaymentFailed').map((e) => JSON.parse(e.EventData ?? '{}'));
            check('R4: Stripe asked for authentication', refusal.sca, `${refusal.status} ${refusal.code}`);
            check('R4: the event says so', failed[0]?.AuthenticationRequired === true && failed[0]?.FailureCode === 'authentication_required',
                `${failed[0]?.AuthenticationRequired} ${failed[0]?.FailureCode}`);
        }
        check('R4: the update-card link is asked for once', linkAsks.length - asksBefore4 === 1);

        // ── R6: the update-card link pays R4's renewal ──
        console.log('\nR6 paying through the update-card link');
        await soldThroughCheckout(ctx, r4.SourceOrderID, run);
        const token = await core.SignRenewalPaymentToken(
            { OrderID: r4.OrderID, SubscriptionID: r4.SubscriptionID, ExpiresAt: new Date(Date.now() + 86_400_000) },
            linkSecret,
        );
        const key = `stripe-probe-${run}`;
        const init = await core.CheckoutSessionService.InitializeRenewalPaymentSession(token, key, user);
        check('R6: the link opens a session for the balance', init.Success && money(init.RenewalPayment?.Amount) === r4.Due, `${init.ErrorMessage ?? ''} ${init.RenewalPayment?.Amount}`);
        if (init.Success) {
            const opened = await core.CheckoutSessionService.OpenPaymentIntentForSession(init.SessionID, key, user);
            check('R6: an intent opens', opened.Success, opened.ErrorMessage);
            const held = await one(`SELECT pi.ProviderIntentID FROM ${ORDERS}.CheckoutSession cs JOIN ${ORDERS}.PaymentIntent pi ON pi.ID = cs.PaymentIntentID
                                     WHERE cs.ID='${init.SessionID}'`);
            if (opened.Success && held?.ProviderIntentID) {
                const before = await stripe('GET', `/payment_intents/${held.ProviderIntentID}`);
                check('R6: on the declined card\'s customer, keeping the new card', before.customer === r4.Customer && before.setup_future_usage === 'off_session',
                    `customer ${before.customer}, setup_future_usage ${before.setup_future_usage}`);
                // In place of the browser's confirmCardPayment: the buyer enters a new card.
                const confirmed = await stripe('POST', `/payment_intents/${held.ProviderIntentID}/confirm`, {
                    payment_method: 'pm_card_mastercard',
                    return_url: 'https://checkout.example.test/return',
                });
                check('R6: Stripe takes the payment', confirmed.status === 'succeeded', confirmed.status);

                const done = await core.CheckoutSessionService.CompleteCheckout(init.SessionID, key, user);
                check('R6: the checkout completes on the renewal order', done.Success && same(done.OrderID, r4.OrderID), `${done.ErrorMessage ?? ''} ${done.OrderID}`);
                await checkPaidBy(r4, 'R6', held.ProviderIntentID);
                const card = await one(`SELECT pd.ProviderCustomerRef, pd.ProviderInstrumentRef, cpm.OwnerPersonID
                                          FROM ${ORDERS}.Subscription s
                                          JOIN ${ORDERS}.CustomerPaymentMethod cpm ON cpm.ID = s.DefaultCustomerPaymentMethodID
                                          JOIN ${ORDERS}.PaymentDetail pd ON pd.ID = cpm.PaymentDetailID
                                         WHERE s.ID='${r4.SubscriptionID}'`);
                check('R6: the new card is the renewal card', card?.ProviderInstrumentRef === confirmed.payment_method && card?.ProviderCustomerRef === r4.Customer,
                    `${card?.ProviderInstrumentRef} on ${card?.ProviderCustomerRef}, Stripe ${confirmed.payment_method}`);
                check('R6: in the holder\'s wallet', same(card?.OwnerPersonID, r4.PersonID));
                const reused = await core.CheckoutSessionService.InitializeRenewalPaymentSession(token, `${key}-again`, user);
                check('R6: the link is refused once the renewal is paid', !reused.Success, 'it opened a second session');
                const later = await charge(r4.SubscriptionID, addDays(r4.DueDay, retryDays[0] ?? 3));
                check('R6: the paid renewal is not charged again', !attemptOf(later, r4.OrderID));
            }
        }

        // ── R7: cards Orders never saw ──
        console.log('\nR7 cards on a customer made outside Orders');
        const r7pm = await renewalOn('R7pm', async (person) => attach(await outsideCustomer(person), 'pm_card_visa'));
        await checkChargedOnDueDay(r7pm, 'R7 PaymentMethod');
        const r7card = await renewalOn('R7card', async (person) => {
            const customer = await outsideCustomer(person);
            const source = await stripe('POST', `/customers/${customer}/sources`, { source: 'tok_visa' });
            return { customer, instrument: source.id, brand: (source.brand ?? 'visa').toLowerCase(), last4: source.last4 ?? '4242' };
        });
        check('R7: the legacy source is a card_ id', /^card_/.test(r7card.Instrument), r7card.Instrument);
        await checkChargedOnDueDay(r7card, 'R7 legacy card source');
    } finally {
        core.ConfigureRenewalPaymentLinks({ Secret: null });
        core.OrdersSettings.SetOverride('RenewalPaymentLinkBaseUrl', undefined);
    }
}

/**
 * The checkout that sold the subscription: an active widget on the probe's provider, with a
 * distribution, named as the source of the subscription's first order. The update-card page is
 * shown in it.
 */
async function soldThroughCheckout({ all, provider, user, providerID, companyID, currency }, sourceOrderID, run) {
    const widget = await provider.GetEntityObject('MJ_BizApps_Orders: Checkout Widgets', user);
    widget.NewRecord();
    widget.Name = `Stripe probe renewal checkout ${run}`;
    widget.CompanyID = companyID;
    widget.Status = 'Active';
    widget.Configuration = JSON.stringify({ paymentProviderId: providerID, currency: currency.toUpperCase() });
    if (!(await widget.Save())) throw new Error(`Could not create the checkout widget: ${widget.LatestResult?.CompleteMessage}`);
    const distribution = await provider.GetEntityObject('MJ_BizApps_Orders: Checkout Widget Distributions', user);
    distribution.NewRecord();
    distribution.CheckoutWidgetID = widget.ID;
    distribution.Slug = `stripe-probe-renew-${run}`;
    distribution.Status = 'Active';
    if (!(await distribution.Save())) throw new Error(`Could not create the widget distribution: ${distribution.LatestResult?.CompleteMessage}`);
    // A checkout stamps its widget on the order it creates. This order was entered directly, so the
    // stamp is written here, as that checkout would have left it.
    await all(`UPDATE ${ORDERS}.OrderHeader SET SourceCheckoutWidgetID='${widget.ID}' WHERE ID='${sourceOrderID}'`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

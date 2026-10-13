/**
 * Orders from unmatched charges (#481): the product and buyer rules, and the per-charge step with the
 * order path, the Person lookup and the database stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasePaymentProvider, GatewayCharge, GatewayChargeItem, ListChargeItemsResult, PaymentProviderConfig } from '../BasePaymentProvider.js';
import type { ChargeMismatch } from '../ChargeReconciliation.js';
import { BuyerFromCharge, ChooseProductForCharge, PriceMapLookup, SplitBuyerName } from '../UnmatchedChargeRules.js';

const mocks = vi.hoisted(() => ({
    createOrder: vi.fn(),
    resolvePerson: vi.fn(),
    personSave: vi.fn(),
    savedPeople: [] as Array<{ FirstName: string; LastName: string; Email: string }>,
}));

vi.mock('../CreateOrderFromProviderPaymentOperation.js', () => ({ CreateOrderFromGatewayCharge: mocks.createOrder }));
vi.mock('../PersonByEmail.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../PersonByEmail.js')>()),
    ResolvePersonByEmail: mocks.resolvePerson,
}));

const { CreateOrderForUnmatchedCharge, IsUnmatchedCharge } = await import('../UnmatchedChargeOrders.js');

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const PRODUCT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PRODUCT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const PERSON_ID = 'cccccccc-0000-4000-8000-000000000003';

const charge = (over: Partial<GatewayCharge> = {}): GatewayCharge => ({
    ProviderChargeID: 'ch_test_1',
    ProviderIntentID: 'pi_test_1',
    Amount: 250,
    AmountRefunded: 0,
    CurrencyCode: 'USD',
    Status: 'succeeded',
    BuyerEmail: 'pat@example.com',
    BuyerName: 'Pat Example',
    ...over,
});
const item = (price: string, over: Partial<GatewayChargeItem> = {}): GatewayChargeItem => ({ ProviderPriceID: price, Quantity: 1, Amount: 250, ...over });
const map = PriceMapLookup([
    { ProviderPriceID: 'price_a', ProductID: PRODUCT_A },
    { ProviderPriceID: 'price_a2', ProductID: PRODUCT_A },
    { ProviderPriceID: 'price_b', ProductID: PRODUCT_B },
]);

describe('choosing the product', () => {
    it('takes the one product every checkout line maps to', () => {
        expect(ChooseProductForCharge('ch', [item('price_a'), item('price_a2')], map)).toEqual({ ProductID: PRODUCT_A });
    });

    it('leaves a charge with no checkout lines to a person', () => {
        expect(ChooseProductForCharge('ch', [], map)).toMatchObject({ Code: 'NoCheckoutItems' });
    });

    it('leaves an unmapped price to a person, naming it', () => {
        const result = ChooseProductForCharge('ch', [item('price_a'), item('price_x')], map);
        expect(result).toMatchObject({ Code: 'PriceNotMapped' });
        expect('Message' in result && result.Message).toContain('price_x');
    });

    it('leaves a checkout of two products to a person', () => {
        expect(ChooseProductForCharge('ch', [item('price_a'), item('price_b')], map)).toMatchObject({ Code: 'SeveralProducts' });
    });
});

describe('the buyer', () => {
    it('prefers what the checkout collected over the charge', () => {
        expect(BuyerFromCharge(charge(), { BuyerEmail: ' Sam@Example.com ', BuyerName: 'Sam Q Example' })).toEqual({
            Email: 'sam@example.com',
            FirstName: 'Sam',
            LastName: 'Q Example',
        });
    });

    it('falls back to the charge, and reports a missing name as null', () => {
        expect(BuyerFromCharge(charge({ BuyerName: null }), {})).toEqual({ Email: 'pat@example.com', FirstName: null, LastName: null });
    });

    it('needs an e-mail', () => {
        expect(BuyerFromCharge(charge({ BuyerEmail: null }), { BuyerEmail: '  ' })).toMatchObject({ Code: 'NoBuyerEmail' });
    });

    it('uses a single word as both names', () => {
        expect(SplitBuyerName('Cher')).toEqual({ FirstName: 'Cher', LastName: 'Cher' });
        expect(SplitBuyerName('   ')).toBeNull();
    });
});

describe('which mismatches are unmatched charges', () => {
    const base: ChargeMismatch = { Kind: 'ChargeWithoutPayment', ProviderChargeID: 'ch', Amount: 1, Detail: '' };
    it('is a charge without a payment on an intent Orders did not open', () => {
        expect(IsUnmatchedCharge(base)).toBe(true);
        expect(IsUnmatchedCharge({ ...base, PaymentIntentID: 'x' })).toBe(false);
        expect(IsUnmatchedCharge({ ...base, PaymentHeaderID: 'x' })).toBe(false);
        expect(IsUnmatchedCharge({ ...base, Kind: 'RefundNotBooked' })).toBe(false);
    });
});

describe('creating the order for one charge', () => {
    const config: PaymentProviderConfig = {
        ID: PROVIDER_ID, TypeCode: 'Stripe', CompanyID: 'company', Name: 'Test account', CredentialsRef: null, IsLiveMode: true,
        Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
    };
    const driverWith = (result: ListChargeItemsResult) =>
        ({ ListChargeItems: vi.fn(async () => result) }) as unknown as BasePaymentProvider;
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const person = {
                ID: PERSON_ID,
                FirstName: '',
                LastName: '',
                Email: '',
                NewRecord: () => undefined,
                Save: async () => {
                    mocks.savedPeople.push({ FirstName: person.FirstName, LastName: person.LastName, Email: person.Email });
                    return mocks.personSave();
                },
                LatestResult: { CompleteMessage: 'refused' },
            };
            return person;
        }),
    };
    const run = (driver: BasePaymentProvider, c = charge()) =>
        CreateOrderForUnmatchedCharge(
            { Driver: driver, Config: config, PaymentProviderID: PROVIDER_ID, Charge: c, PriceMap: map },
            provider as never,
            {} as never,
        );

    beforeEach(() => {
        mocks.createOrder.mockReset();
        mocks.resolvePerson.mockReset();
        mocks.personSave.mockReset().mockReturnValue(true);
        mocks.savedPeople.length = 0;
        mocks.createOrder.mockResolvedValue({ Success: true, Message: 'ok', OrderHeaderID: 'order-1', OrderNumber: 'ORD-1', PaymentHeaderID: 'pay-1', PaymentNumber: 'PAY-1' });
    });

    it('bills the Person the e-mail names and creates the order with the mapped product', async () => {
        mocks.resolvePerson.mockResolvedValue({ Success: true, PersonID: PERSON_ID, MatchCount: 1 });
        const outcome = await run(driverWith({ Success: true, Items: [item('price_a')] }));
        expect(outcome).toEqual({ Created: true, OrderHeaderID: 'order-1', OrderNumber: 'ORD-1', PaymentHeaderID: 'pay-1', PaymentNumber: 'PAY-1' });
        expect(mocks.createOrder).toHaveBeenCalledWith(
            expect.objectContaining({ ProductID: PRODUCT_A, BillToPersonID: PERSON_ID, BillToOrganizationID: null, ProviderChargeID: 'ch_test_1' }),
            provider,
            {},
        );
        expect(mocks.savedPeople).toEqual([]);
    });

    it('creates the Person from the buyer\'s name when no Person has the e-mail', async () => {
        mocks.resolvePerson.mockResolvedValue({ Success: true, PersonID: null, MatchCount: 0 });
        const outcome = await run(driverWith({ Success: true, Items: [item('price_a')] }));
        expect(outcome.Created).toBe(true);
        expect(mocks.savedPeople).toEqual([{ FirstName: 'Pat', LastName: 'Example', Email: 'pat@example.com' }]);
        expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({ BillToPersonID: PERSON_ID }), provider, {});
    });

    it('creates no Person, and no order, when the payment has no name', async () => {
        mocks.resolvePerson.mockResolvedValue({ Success: true, PersonID: null, MatchCount: 0 });
        const outcome = await run(driverWith({ Success: true, Items: [item('price_a')] }), charge({ BuyerName: null }));
        expect(outcome).toMatchObject({ Created: false, Code: 'NoBuyerName' });
        expect(mocks.savedPeople).toEqual([]);
        expect(mocks.createOrder).not.toHaveBeenCalled();
    });

    it('does not look for a buyer when the product cannot be chosen', async () => {
        const outcome = await run(driverWith({ Success: true, Items: [item('price_x')] }));
        expect(outcome).toMatchObject({ Created: false, Code: 'PriceNotMapped' });
        expect(mocks.resolvePerson).not.toHaveBeenCalled();
    });

    it('reports a failed checkout read, and an order the order path refused', async () => {
        expect(await run(driverWith({ Success: false, Reason: 'rate limited' }))).toMatchObject({ Created: false, Code: 'ItemsReadFailed' });

        mocks.resolvePerson.mockResolvedValue({ Success: true, PersonID: PERSON_ID, MatchCount: 1 });
        mocks.createOrder.mockResolvedValue({ Success: false, Code: 'ConfirmRefused', Message: 'below the product price' });
        expect(await run(driverWith({ Success: true, Items: [item('price_a')] }))).toEqual({
            Created: false,
            Code: 'ConfirmRefused',
            Message: 'below the product price',
        });
    });

    it('turns a thrown error into an outcome, so one charge cannot stop the run', async () => {
        mocks.resolvePerson.mockRejectedValue(new Error('connection reset'));
        expect(await run(driverWith({ Success: true, Items: [item('price_a')] }))).toMatchObject({ Created: false, Code: 'Failed', Message: 'connection reset' });
    });
});

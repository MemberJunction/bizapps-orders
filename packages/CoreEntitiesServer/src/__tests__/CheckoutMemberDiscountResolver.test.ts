import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseCheckoutMemberDiscountResolver,
    CheckoutMemberDiscountNotConfiguredError,
    ResolveCheckoutMemberDiscountResolver,
    type CheckoutMemberDiscountDecision,
} from '../CheckoutMemberDiscountResolver.js';

@RegisterClass(BaseCheckoutMemberDiscountResolver, 'TEST-PARTNER-MEMBER')
class TestPartnerResolver extends BaseCheckoutMemberDiscountResolver {
    public async Resolve(): Promise<CheckoutMemberDiscountDecision> {
        return { PromotionCode: 'PARTNER' };
    }
}

describe('ResolveCheckoutMemberDiscountResolver', () => {
    it('returns the class registered under the key', () => {
        expect(ResolveCheckoutMemberDiscountResolver('TEST-PARTNER-MEMBER')).toBeInstanceOf(TestPartnerResolver);
    });

    it('refuses an unregistered key rather than falling back to the base class', () => {
        expect(() => ResolveCheckoutMemberDiscountResolver('NOBODY-REGISTERED-THIS')).toThrow(CheckoutMemberDiscountNotConfiguredError);
    });
});

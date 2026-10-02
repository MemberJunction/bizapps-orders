import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseCheckoutMemberDiscountResolver,
    CheckoutMemberDiscountNotConfiguredError,
    IsRegisteredMemberPromotionCode,
    ResolveCheckoutMemberDiscountResolver,
    type CheckoutMemberDiscountDecision,
    type CheckoutTypedPromotionCodeContext,
} from '../CheckoutMemberDiscountResolver.js';

@RegisterClass(BaseCheckoutMemberDiscountResolver, 'TEST-PARTNER-MEMBER')
class TestPartnerResolver extends BaseCheckoutMemberDiscountResolver {
    public async Resolve(): Promise<CheckoutMemberDiscountDecision> {
        return { PromotionCode: 'PARTNER' };
    }
    public override async IsMemberPromotionCode(ctx: CheckoutTypedPromotionCodeContext): Promise<boolean> {
        return ctx.Code.toLowerCase() === 'partner';
    }
}

@RegisterClass(BaseCheckoutMemberDiscountResolver, 'TEST-FLAKY-MEMBER')
class TestFlakyResolver extends BaseCheckoutMemberDiscountResolver {
    public async Resolve(): Promise<CheckoutMemberDiscountDecision> {
        return { PromotionCode: null };
    }
    public override async IsMemberPromotionCode(ctx: CheckoutTypedPromotionCodeContext): Promise<boolean> {
        if (ctx.Code === 'BOOM') throw new Error('verifier down');
        return false;
    }
}

/** Not registered: only used to read the base class's default answer. */
class DefaultAnswerResolver extends BaseCheckoutMemberDiscountResolver {
    public async Resolve(): Promise<CheckoutMemberDiscountDecision> {
        return { PromotionCode: null };
    }
}

const typed = (code: string): CheckoutTypedPromotionCodeContext => ({ Code: code, CheckoutWidgetID: 'w-1', CompanyID: 'c-1', SessionID: 's-1' });

describe('ResolveCheckoutMemberDiscountResolver', () => {
    it('returns the class registered under the key', () => {
        expect(ResolveCheckoutMemberDiscountResolver('TEST-PARTNER-MEMBER')).toBeInstanceOf(TestPartnerResolver);
    });

    it('refuses an unregistered key rather than falling back to the base class', () => {
        expect(() => ResolveCheckoutMemberDiscountResolver('NOBODY-REGISTERED-THIS')).toThrow(CheckoutMemberDiscountNotConfiguredError);
    });
});

describe('typed member codes (#358)', () => {
    it('a resolver that does not name its codes claims every code', async () => {
        expect(await new DefaultAnswerResolver().IsMemberPromotionCode(typed('SAVE10'), {} as never, undefined)).toBe(true);
    });

    it('a code a registered resolver claims is a member code, whichever widget it is typed at', async () => {
        expect(await IsRegisteredMemberPromotionCode(typed('Partner'), {} as never, undefined)).toBe(true);
    });

    it('a code no registered resolver claims is not', async () => {
        expect(await IsRegisteredMemberPromotionCode(typed('SAVE10'), {} as never, undefined)).toBe(false);
    });

    it('a resolver that throws counts as claiming the code', async () => {
        expect(ResolveCheckoutMemberDiscountResolver('TEST-FLAKY-MEMBER')).toBeInstanceOf(TestFlakyResolver);
        expect(await IsRegisteredMemberPromotionCode(typed('BOOM'), {} as never, undefined)).toBe(true);
    });
});

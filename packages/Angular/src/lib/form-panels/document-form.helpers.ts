import { FormatMoney } from '../panels/money-format';
import type { mjBizAppsOrdersPaymentHeaderEntity } from '@mj-biz-apps/orders-entities';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';

export function PaymentStatusChipClass(
    status: mjBizAppsOrdersPaymentHeaderEntity['Status'] | undefined,
): string {
    switch (status) {
        case 'Captured':
            return 'mjo-doc-chip mjo-doc-chip--ok';
        case 'Pending':
            return 'mjo-doc-chip mjo-doc-chip--draft';
        case 'Failed':
            return 'mjo-doc-chip mjo-doc-chip--error';
        case 'Refunded':
            return 'mjo-doc-chip mjo-doc-chip--info';
        case 'Disputed':
            return 'mjo-doc-chip mjo-doc-chip--warn';
        default:
            return 'mjo-doc-chip';
    }
}

export interface PaymentReversalFields {
    ReversesPaymentHeaderID?: string | null;
    Amount?: number | null;
    ProviderRefundID?: string | null;
    PaymentType?: string | null;
}

export function PaymentAvatarIcon(
    record: PaymentReversalFields | null | undefined,
): string {
    if (IsPaymentReversal(record)) return 'fa-solid fa-rotate-left';
    const tender = (record?.PaymentType ?? '').toLowerCase();
    if (tender.includes('card') || tender.includes('debit')) return 'fa-solid fa-credit-card';
    if (tender.includes('check')) return 'fa-solid fa-money-check';
    if (tender.includes('wire') || tender.includes('ach') || tender.includes('bank')) {
        return 'fa-solid fa-building-columns';
    }
    if (tender.includes('credit') || tender.includes('stored') || tender.includes('wallet')) {
        return 'fa-solid fa-piggy-bank';
    }
    return 'fa-solid fa-hand-holding-dollar';
}

export function IsPaymentReversal(
    record: PaymentReversalFields | null | undefined,
): boolean {
    if (!record) return false;
    return Boolean(record.ReversesPaymentHeaderID || (record.Amount != null && record.Amount < 0) || record.ProviderRefundID);
}

export function PaymentMoney(record: mjBizAppsOrdersPaymentHeaderEntity | null | undefined): {
    Gross: string;
    Fee: string;
    Net: string;
} {
    const gross = record?.Amount;
    const fee = record?.ProcessingFeeAmount ?? 0;
    const net = record?.NetAmount ?? (gross != null ? gross - fee : null);
    return {
        Gross: FormatMoney(gross),
        Fee: FormatMoney(fee, { Zero: '$0.00' }),
        Net: FormatMoney(net),
    };
}

export function SubscriptionStatusChipClass(
    status: mjBizAppsOrdersSubscriptionEntity['Status'] | undefined,
): string {
    switch (status) {
        case 'Active':
            return 'mjo-doc-chip mjo-doc-chip--ok';
        case 'Trialing':
            return 'mjo-doc-chip mjo-doc-chip--info';
        case 'Paused':
            return 'mjo-doc-chip mjo-doc-chip--warn';
        case 'Canceled':
        case 'Migrated':
            return 'mjo-doc-chip mjo-doc-chip--muted';
        default:
            return 'mjo-doc-chip';
    }
}

export function TermStatusChipClass(status: string | null | undefined): string {
    switch (status) {
        case 'Active':
            return 'mjo-doc-chip mjo-doc-chip--ok';
        case 'Scheduled':
            return 'mjo-doc-chip mjo-doc-chip--info';
        case 'Completed':
            return 'mjo-doc-chip mjo-doc-chip--muted';
        case 'Canceled':
        case 'Lapsed':
            return 'mjo-doc-chip mjo-doc-chip--muted';
        default:
            return 'mjo-doc-chip';
    }
}

export function FormatCoverageWindow(
    start: Date | string | null | undefined,
    end: Date | string | null | undefined,
): string {
    if (!start && !end) return '—';
    return `${FormatShortDate(start) || '—'} – ${end ? FormatShortDate(end) : 'Open-ended'}`;
}

export function FormatShortDate(value: Date | string | null | undefined): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function TermColorClass(index: number): string {
    return `mjo-term-tone--${(index % 5) + 1}`;
}

export function ProductStatusChipClass(status: string | null | undefined): string {
    switch (status) {
        case 'Active':
            return 'mjo-doc-chip mjo-doc-chip--ok';
        case 'Draft':
            return 'mjo-doc-chip mjo-doc-chip--draft';
        case 'Discontinued':
        case 'EOL':
            return 'mjo-doc-chip mjo-doc-chip--muted';
        default:
            return 'mjo-doc-chip';
    }
}

export function ProductAvatarIcon(typeName: string | null | undefined): string {
    const name = (typeName ?? '').toLowerCase();
    if (name.includes('event') || name.includes('conference') || name.includes('summit')) {
        return 'fa-solid fa-ticket';
    }
    if (name.includes('subscription') || name.includes('saas') || name.includes('recurring')) {
        return 'fa-solid fa-repeat';
    }
    if (name.includes('service') || name.includes('consulting')) {
        return 'fa-solid fa-handshake-angle';
    }
    if (name.includes('digital') || name.includes('course')) {
        return 'fa-solid fa-graduation-cap';
    }
    return 'fa-solid fa-box-open';
}

export function PromotionStatusChipClass(status: string | null | undefined): string {
    switch (status) {
        case 'Active':
            return 'mjo-doc-chip mjo-doc-chip--ok';
        case 'Draft':
            return 'mjo-doc-chip mjo-doc-chip--draft';
        case 'Paused':
            return 'mjo-doc-chip mjo-doc-chip--warn';
        case 'Expired':
            return 'mjo-doc-chip mjo-doc-chip--muted';
        default:
            return 'mjo-doc-chip';
    }
}

export function ActiveChipClass(isActive: boolean | null | undefined): string {
    return isActive ? 'mjo-doc-chip mjo-doc-chip--ok' : 'mjo-doc-chip mjo-doc-chip--muted';
}

export function ActiveChipLabel(isActive: boolean | null | undefined): string {
    return isActive ? 'Active' : 'Inactive';
}

export function YesNo(value: boolean | null | undefined): string {
    return value ? 'Yes' : 'No';
}

export function FormatPercentFraction(value: number | null | undefined): string {
    if (value == null) return '—';
    return `${Math.round(value * 1000) / 10}%`;
}

export function PromotionValueLabel(value: number | null | undefined, typeName: string | null | undefined): string {
    const val = value ?? 0;
    const typeStr = (typeName || '').toLowerCase();
    if (typeStr.includes('percent') || val <= 1) {
        return `${val}% Off`;
    }
    return `${FormatMoney(val)} Off`;
}

export interface PriceListSimResult {
    Quantity: number;
    EffectiveUnitPrice: number;
    TotalOrderAmount: number;
    DiscountPercent: number;
    SavingsAmount: number;
}

export function RecalculatePriceListSim(
    base: number,
    qty: number,
    mode: 'volume' | 'tiered',
): PriceListSimResult {
    const discountPct = qty >= 50 ? 25 : qty >= 20 ? 15 : 0;
    let total = 0;
    if (mode === 'volume') {
        total = qty * (base * (1 - discountPct / 100));
    } else {
        const tier1 = Math.min(qty, 19);
        const tier2 = Math.max(0, Math.min(qty - 19, 30));
        const tier3 = Math.max(0, qty - 49);
        total = (tier1 * base) + (tier2 * base * 0.85) + (tier3 * base * 0.75);
    }
    const undiscounted = qty * base;
    const savings = Math.max(0, undiscounted - total);
    return {
        Quantity: qty,
        EffectiveUnitPrice: qty > 0 ? total / qty : base,
        TotalOrderAmount: total,
        DiscountPercent: undiscounted > 0 ? (savings / undiscounted) * 100 : 0,
        SavingsAmount: savings,
    };
}

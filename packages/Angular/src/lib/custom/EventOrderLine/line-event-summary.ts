import type { mjBizAppsOrdersEventProductEntity } from '@mj-biz-apps/orders-entities';
import { FormatShortDate } from '../../form-panels/document-form.helpers';

/** What the Event details panel shows about the event an event order line is for. */
export interface LineEventSummary {
    Name: string;
    Dates: string;
}

type LineEventSource = Pick<mjBizAppsOrdersEventProductEntity, 'Name' | 'EventStartsAt' | 'EventEndsAt'>;

/**
 * The event behind an order line, read from the line product's Event Products row (the product
 * IS the event: the row shares the product's ID). Null when the product has no such row, which
 * the panel reports rather than hides — the line then has no event dates to stamp.
 */
export function DescribeLineEvent(event: LineEventSource | null | undefined): LineEventSummary | null {
    if (!event) return null;
    const start = FormatShortDate(event.EventStartsAt);
    const end = FormatShortDate(event.EventEndsAt);
    const dates = !start ? end : !end || end === start ? start : `${start} – ${end}`;
    return { Name: event.Name, Dates: dates || 'No dates set' };
}

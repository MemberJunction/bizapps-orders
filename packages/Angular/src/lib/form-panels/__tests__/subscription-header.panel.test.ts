import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
import { SubscriptionHeaderPanel } from '../subscription-header.panel';
import { MJO_ENTITIES } from '../../data/entity-names';

/** A panel with `Record` set, without standing up Angular DI. */
function panelFor(record: Partial<mjBizAppsOrdersSubscriptionEntity>): SubscriptionHeaderPanel {
    const panel = Object.create(SubscriptionHeaderPanel.prototype) as SubscriptionHeaderPanel;
    panel.Record = record as mjBizAppsOrdersSubscriptionEntity;
    return panel;
}

const LINE_ID = '3f0c1d9e-6b2a-4c71-9d55-0a1b2c3d4e5f';

describe('Subscription header — Order chip', () => {
    it('describes the order behind the subscription as one related link', () => {
        const links = panelFor({ OrderLineID: LINE_ID }).RelatedLinks;

        expect(links).toHaveLength(1);
        expect(links[0].Key).toBe('order');
        expect(links[0].EntityName).toBe(MJO_ENTITIES.OrderHeader);
        expect(links[0].Label).toBe('Order');
    });

    it('selects the order by way of the line, since a subscription holds no OrderID', () => {
        const [link] = panelFor({ OrderLineID: LINE_ID }).RelatedLinks;

        // A filter rather than a RecordID: the chip resolves the hop the tester had to make by hand.
        expect(link.RecordID).toBeUndefined();
        expect(link.Filter).toBe(
            `ID IN (SELECT OrderHeaderID FROM [__mj_BizAppsOrders].[vwOrderLines] WHERE ID = '${LINE_ID}')`,
        );
    });

    it('offers no link for a subscription that no order line created', () => {
        expect(panelFor({ OrderLineID: null }).RelatedLinks).toEqual([]);
        expect(panelFor({}).RelatedLinks).toEqual([]);
    });

    it('offers no link when OrderLineID is not a uniqueidentifier', () => {
        // The value is spliced into a SQL filter; anything that is not an id composes no filter.
        expect(panelFor({ OrderLineID: "' OR 1=1 --" } as Partial<mjBizAppsOrdersSubscriptionEntity>).RelatedLinks).toEqual([]);
    });

    it('returns the same array until the record changes, so the chip row resolves once', () => {
        const panel = panelFor({ OrderLineID: LINE_ID });

        // `bizapps-related-chips` re-resolves on a new array identity, and a template reads this
        // getter every change-detection pass.
        expect(panel.RelatedLinks).toBe(panel.RelatedLinks);

        panel.Record = { OrderLineID: null } as mjBizAppsOrdersSubscriptionEntity;
        expect(panel.RelatedLinks).toEqual([]);
    });
});

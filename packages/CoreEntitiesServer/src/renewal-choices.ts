/**
 * The choices a renewal line carries: checkout-widget choices and product option picks (golive #399).
 *
 * A renewal on the same product copies the line that bought the expiring term, picks included, so
 * the renewal keeps its tier and size, its price rules and its conditional entitlements.
 *
 * A renewal that moves to a successor product takes the picks each product it moves away from names
 * in `ProductSuccessorOptionValue`. That is how one product per combination ("Hosting Pro Medium")
 * is retired onto one product with options: the retired product names its successor and the tier
 * and size it stood for. A pick for an option the final product does not offer is dropped, since a
 * line may only carry picks its product offers.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { LoadOrdersEngine, OrdersEngine, RequireUUID, RequireUUIDs } from '@mj-biz-apps/orders-entities';

const ORDER_LINE_CHOICE_ENTITY = 'MJ_BizApps_Orders: Order Line Choices';
const SUCCESSOR_OPTION_VALUE_ENTITY = 'MJ_BizApps_Orders: Product Successor Option Values';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/** One choice on a line, as stored in `OrderLineChoice`. */
export interface LineChoiceRow {
    GroupKey: string;
    GroupLabel: string;
    OptionValue: string;
    OptionLabel: string;
    ProductOptionID: string | null;
    ProductOptionValueID: string | null;
}

/** A pick a retired product hands its successor. */
export interface SuccessorPickRow {
    ProductID: string;
    ProductOptionID: string;
    ProductOptionValueID: string;
}

/** What `OverlaySuccessorPicks` needs to know about the option catalog. */
export interface SuccessorPickCatalog {
    OptionByID(id: string): { ID: string; Code: string; Name: string } | undefined;
    ValueByID(id: string): { ID: string; Code: string; Label: string } | undefined;
}

/** The choices recorded on a line, in group and option order. */
export async function LoadLineChoices(orderLineID: string, provider: IMetadataProvider, user: UserInfo): Promise<LineChoiceRow[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<LineChoiceRow>(
        {
            EntityName: ORDER_LINE_CHOICE_ENTITY,
            ExtraFilter: `OrderLineID = '${RequireUUID(orderLineID, 'OrderLineID')}'`,
            Fields: ['GroupKey', 'GroupLabel', 'OptionValue', 'OptionLabel', 'ProductOptionID', 'ProductOptionValueID'],
            OrderBy: 'GroupKey, OptionValue',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r.Success) throw new Error(`Could not read the choices on order line ${orderLineID}: ${r.ErrorMessage}`);
    return r.Results ?? [];
}

/**
 * The choices a renewal moving along `chainProductIDs` (the subscription's product first, the product
 * the renewal books on last) carries.
 *
 * Widget choices are kept. Option picks start from the source line's; each hop's successor picks
 * then replace the pick for the same option, later hops winning. Picks for options the final product
 * does not offer are dropped.
 */
export function OverlaySuccessorPicks(
    source: readonly LineChoiceRow[],
    chainProductIDs: readonly string[],
    successorPicks: readonly SuccessorPickRow[],
    finalProductOptionIDs: ReadonlySet<string>,
    catalog: SuccessorPickCatalog,
): LineChoiceRow[] {
    const widget = source.filter((c) => !c.ProductOptionID);
    const picks = new Map<string, LineChoiceRow>();
    for (const c of source) if (c.ProductOptionID) picks.set(uuidKey(c.ProductOptionID), c);

    for (const productID of chainProductIDs.slice(0, -1)) {
        for (const p of successorPicks.filter((s) => uuidKey(s.ProductID) === uuidKey(productID))) {
            const option = catalog.OptionByID(p.ProductOptionID);
            const value = catalog.ValueByID(p.ProductOptionValueID);
            if (!option || !value) continue;
            picks.set(uuidKey(option.ID), {
                GroupKey: option.Code,
                GroupLabel: option.Name,
                OptionValue: value.Code,
                OptionLabel: value.Label,
                ProductOptionID: option.ID,
                ProductOptionValueID: value.ID,
            });
        }
    }
    const kept = [...picks.values()].filter((c) => finalProductOptionIDs.has(uuidKey(c.ProductOptionID)));
    return [...widget, ...kept];
}

/** `OverlaySuccessorPicks`, reading the successor picks and the final product's options. */
export async function ChoicesForSuccessorRenewal(
    source: readonly LineChoiceRow[],
    chainProductIDs: readonly string[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LineChoiceRow[]> {
    await LoadOrdersEngine(provider, user);
    const engine = OrdersEngine.Instance;
    const movedFrom = chainProductIDs.slice(0, -1);
    let successorPicks: SuccessorPickRow[] = [];
    if (movedFrom.length) {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const ids = RequireUUIDs(movedFrom, 'ProductID').map((id) => `'${id}'`).join(',');
        const r = await rv.RunView<SuccessorPickRow>(
            {
                EntityName: SUCCESSOR_OPTION_VALUE_ENTITY,
                ExtraFilter: `ProductID IN (${ids})`,
                Fields: ['ProductID', 'ProductOptionID', 'ProductOptionValueID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!r.Success) throw new Error(`Could not read the successor picks: ${r.ErrorMessage}`);
        successorPicks = r.Results ?? [];
    }
    const finalProductID = chainProductIDs[chainProductIDs.length - 1];
    const offered = new Set(engine.EffectiveOptions(finalProductID).map((e) => uuidKey(e.Option.ID)));
    return OverlaySuccessorPicks(source, chainProductIDs, successorPicks, offered, {
        OptionByID: (id) => engine.ProductOptions.find((o) => uuidKey(o.ID) === uuidKey(id)),
        ValueByID: (id) => engine.ProductOptionValues.find((v) => uuidKey(v.ID) === uuidKey(id)),
    });
}

/** Add `rows` to a line being built, in its graph, so they save with it. */
export async function AddLineChoices(
    line: { Choices: { Create(): Promise<LineChoiceRow> } },
    rows: readonly LineChoiceRow[],
): Promise<void> {
    for (const choice of rows) {
        const row = await line.Choices.Create();
        row.GroupKey = choice.GroupKey;
        row.GroupLabel = choice.GroupLabel;
        row.OptionValue = choice.OptionValue;
        row.OptionLabel = choice.OptionLabel;
        row.ProductOptionID = choice.ProductOptionID ?? null;
        row.ProductOptionValueID = choice.ProductOptionValueID ?? null;
    }
}

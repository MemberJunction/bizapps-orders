/**
 * @fileoverview The `MJ: User Views` rows the Orders grids open with.
 *
 * WHY THE GRIDS NEED A VIEW ROW AT ALL
 *
 * The Orders grids are hosted in `mj-view-workspace`, because it is the only host that answers the
 * grid's "Manage columns" request with a column-config panel. The workspace takes no `GridState`
 * input: it reads column state off the view it is showing (`[SelectedView]`), or off the user's
 * saved default when it shows none. So the column set and money formatting these grids depend on
 * have to arrive on a view row — without one, `Balance` renders as a raw number again.
 *
 * Two kinds of row:
 *   - the shared "Orders: Working" view, shipped in `metadata/user-views/.orders-working-view.json`,
 *     which the unfiltered grids open on;
 *   - a new, UNSAVED view per preset (unpaid, overdue, fulfillment queue...), carrying the preset's
 *     WHERE clause and the working view's column state. The viewer runs a view by its `WhereClause`,
 *     never by its ID, so an unsaved row filters exactly as a saved one would. It belongs to the
 *     current user, so saving it from the workspace creates that user's own view rather than
 *     writing over the shared one.
 *
 * @module @mj-biz-apps/orders-ng
 */
import { Metadata, type EntityInfo } from '@memberjunction/core';
import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';

/** Primary key of the shared "Orders: Working" view in `metadata/user-views/.orders-working-view.json`. */
export const MJO_ORDERS_WORKING_VIEW_ID = '0DD3A50B-0001-4E71-B0A8-3F17C5E2D803';

/**
 * Load the shared "Orders: Working" view.
 *
 * Throws when the row is missing. It ships with the app, so a missing row is a broken install, and a
 * grid that quietly fell back to default columns would hide that behind a subtly different screen.
 */
export async function LoadOrdersWorkingView(): Promise<MJUserViewEntityExtended> {
    const md = new Metadata();
    const view = await md.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views');
    const loaded = await view.Load(MJO_ORDERS_WORKING_VIEW_ID);
    if (!loaded) {
        throw new Error(
            `The shared "Orders: Working" view (${MJO_ORDERS_WORKING_VIEW_ID}) could not be loaded. ` +
                `It ships in the app's metadata; the grids cannot show their columns without it.`,
        );
    }
    return view;
}

/**
 * An unsaved view over `entity` filtered by `whereClause`, optionally carrying `gridState` (a view's
 * `GridState` JSON — pass the working view's to keep a preset's columns identical to it).
 */
export async function NewPresetView(entity: EntityInfo, name: string, whereClause: string, gridState: string | null = null): Promise<MJUserViewEntityExtended> {
    const md = new Metadata();
    const view = await md.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views');
    view.Name = name;
    view.EntityID = entity.ID;
    view.UserID = md.CurrentUser.ID;
    view.IsShared = false;
    view.WhereClause = whereClause;
    if (gridState) {
        view.GridState = gridState;
    }
    return view;
}

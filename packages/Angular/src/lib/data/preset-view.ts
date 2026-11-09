import { type MJUserViewEntityExtended } from '@memberjunction/core-entities';

/**
 * A STABLE preset view object for `mj-entity-viewer`'s `[ViewEntity]` input.
 *
 * ── WHY THIS EXISTS, AND WHY A PLAIN GETTER CANNOT ─────────────────────────────────────────────
 *
 * Four pages here hand the viewer a synthetic view they build themselves rather than a saved one:
 * Customer A/R, Account Credit, Overdue and Fulfillment. Each built it in a getter that returned a
 * fresh object literal, which is the natural way to write it and is what deadlocked two of those
 * screens (bc-aidp-next-golive#362): "Loading MJ_BizApps_Orders: Order Headers..." with 0 records,
 * for as long as anyone was willing to wait.
 *
 * Angular compares an `@Input()` by REFERENCE, so a getter that builds a new object runs the
 * viewer's `ViewEntity` setter on every change-detection pass. That setter keys its "did the view
 * change" test on `value?.ID`, so the ID being stable is not enough: its last branch reloads
 * whenever `!this._records`, regardless of whether the view changed at all. While the first load is
 * still in flight `_records` is unset, so each pass restarts it -- and the response is itself a
 * change-detection trigger, so the next pass restarts it again. The load can never finish.
 *
 * Measured rather than reasoned about: the reproduction showed ~2,800 POSTs to the API, every one
 * returning `Success: true` with the correct rows, while the grid showed nothing. The data was
 * never the problem; the view object's identity was.
 *
 * So the rule for these pages is: the same inputs must give back the SAME OBJECT. `For` holds one
 * view per instance and rebuilds only when its key changes, which is what lets the load settle.
 *
 * ```typescript
 * private readonly openOrders = new PresetViewRef();
 *
 * public get CustomerOpenOrdersView(): MJUserViewEntityExtended | null {
 *     if (!this.OrderEntityInfo || !this.Selected) return null;
 *     return this.openOrders.For(`${this.OrderEntityInfo.ID}|${this.Selected.Key}`, () => ({ ... }));
 * }
 * ```
 *
 * The key names every input the built view reads. Leave one out and the grid keeps showing the
 * previous customer's rows; that is the failure this trades for, and it is the safer one, because a
 * wrong key shows wrong data ONCE while a new object shows nothing forever.
 */
export class PresetViewRef {
    private _key: string | null = null;
    private _view: MJUserViewEntityExtended | null = null;

    /**
     * The view for `key`, built once and returned by reference until `key` changes.
     *
     * @param key - Every input the built view depends on, joined. See the class note.
     * @param build - Builds the view. Called only when the key changes.
     */
    public For(key: string, build: () => MJUserViewEntityExtended): MJUserViewEntityExtended {
        if (this._key !== key || !this._view) {
            this._key = key;
            this._view = build();
        }
        return this._view;
    }
}

/**
 * Keep the add-product picker's highlighted row visible while the user arrows through it (#796).
 *
 * The list is a fixed-height scroll area holding up to a dozen ranked rows; moving the cursor only
 * changes which row carries `.is-cursor`, so without this the highlight walks below the fold and Enter
 * adds a product the user cannot see. `block: 'nearest'` scrolls the list only as far as needed and
 * not at all when the row is already in view.
 *
 * Takes the picker's host element; a no-op when the list is not rendered.
 */
export function ScrollPickerCursorIntoView(host: Pick<ParentNode, 'querySelector'> | null | undefined): void {
    const row = host?.querySelector<HTMLElement>('.mj-typeahead-item.is-cursor');
    row?.scrollIntoView?.({ block: 'nearest' });
}

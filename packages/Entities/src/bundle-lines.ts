/**
 * Bundle lines and their expanded children, as the order's line collection holds them (#793).
 *
 * A bundle line expands into child lines whose `ParentOrderLineID` names it, and
 * `FK_OrderLine_ParentOrderLine` does not cascade. So a bundle line goes with every line beneath
 * it, and those lines are deleted before it. Pure: no provider, no engine.
 */

/** The fields these helpers read. */
export interface BundleLineShape {
    ID: string | null;
    ParentOrderLineID: string | null;
}

function key(id: string | null | undefined): string | null {
    return id ? id.toLowerCase() : null;
}

/**
 * Every line beneath `parent` in `lines`: its children, their children, and so on. `parent`
 * itself is not included.
 */
export function DescendantLines<T extends BundleLineShape>(parent: BundleLineShape, lines: readonly T[]): T[] {
    const found: T[] = [];
    const seen = new Set<string>();
    const pending = [key(parent.ID)];
    while (pending.length) {
        const parentKey = pending.pop();
        if (!parentKey || seen.has(parentKey)) continue;
        seen.add(parentKey);
        for (const line of lines) {
            if (key(line.ParentOrderLineID) === parentKey && !found.includes(line)) {
                found.push(line);
                pending.push(key(line.ID));
            }
        }
    }
    return found;
}

/**
 * `lines` reordered so a line comes before the line it was expanded from, wherever both are in the
 * list. That is the order the deletes must run in.
 */
export function ChildLinesFirst<T extends BundleLineShape>(lines: readonly T[]): T[] {
    const byID = new Map<string, T>();
    for (const line of lines) {
        const id = key(line.ID);
        if (id) byID.set(id, line);
    }
    const depth = (line: T): number => {
        let d = 0;
        const seen = new Set<string>();
        let parent = key(line.ParentOrderLineID);
        while (parent && byID.has(parent) && !seen.has(parent)) {
            seen.add(parent);
            d++;
            parent = key(byID.get(parent)!.ParentOrderLineID);
        }
        return d;
    };
    return lines
        .map((line, index) => ({ line, index, depth: depth(line) }))
        .sort((a, b) => b.depth - a.depth || a.index - b.index)
        .map((entry) => entry.line);
}

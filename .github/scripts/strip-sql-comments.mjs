/**
 * strip-sql-comments.mjs
 *
 * Offset-preserving SQL masker: blanks comments (single-line -- and multi-line /* * /)
 * and string literals ('...'), preserving newlines and bracketed identifiers verbatim.
 * Positions in the masked text equal positions in the source.
 */

export function stripSqlComments(source) {
    const chunks = [];
    let i = 0;
    const n = source.length;
    const stateOpeners = /[-/'[]/g;

    /** Blank a span, preserving newlines so `--` still terminates and positions hold. */
    const mask = (start, end) => {
        const nl = source.indexOf('\n', start);
        if (nl === -1 || nl >= end) return ' '.repeat(end - start);
        return source.slice(start, end).replace(/[^\n]/g, ' ');
    };

    while (i < n) {
        stateOpeners.lastIndex = i;
        const opener = stateOpeners.exec(source);
        if (opener === null) {
            chunks.push(source.slice(i));
            break;
        }
        if (opener.index > i) chunks.push(source.slice(i, opener.index));
        i = opener.index;

        const two = source.slice(i, i + 2);

        if (two === '--') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? n : end;
            chunks.push(mask(i, stop));
            i = stop;
            continue;
        }

        if (two === '/*') {
            let depth = 1;
            let j = i + 2;
            while (j < n && depth > 0) {
                const open = source.indexOf('/*', j);
                const close = source.indexOf('*/', j);
                if (close === -1) {
                    j = n;
                    break;
                }
                if (open !== -1 && open < close) {
                    depth++;
                    j = open + 2;
                } else {
                    depth--;
                    j = close + 2;
                }
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === "'") {
            let j = i + 1;
            for (;;) {
                const quote = source.indexOf("'", j);
                if (quote === -1) {
                    j = n;
                    break;
                }
                if (source[quote + 1] === "'") {
                    j = quote + 2;
                    continue;
                }
                j = quote + 1;
                break;
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === '[') {
            let j = i + 1;
            for (;;) {
                const bracket = source.indexOf(']', j);
                if (bracket === -1) {
                    j = n;
                    break;
                }
                if (source[bracket + 1] === ']') {
                    j = bracket + 2;
                    continue;
                }
                j = bracket + 1;
                break;
            }
            chunks.push(source.slice(i, j));
            i = j;
            continue;
        }

        chunks.push(source[i]);
        i++;
    }
    return chunks.join('');
}

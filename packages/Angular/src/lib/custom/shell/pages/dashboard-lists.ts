/**
 * The list-card view model shared by the two category dashboards (Orders §13.1, Payments §13.2).
 *
 * Why a view model rather than two bespoke templates: both dashboards show the same SHAPE — a small
 * card, a header, a handful of rows carrying an identifier, a bit of context, a date and a figure.
 * Modelling that once means the card markup and CSS exist once and cannot drift apart; each
 * dashboard only decides WHAT goes in the rows. (The rule of thumb from the workspace guide: unify
 * when the same job is genuinely being done, keep separate when the resemblance is superficial. Two
 * lists of "recent things, newest first" is the former.)
 */

/** One row inside a list card. Every field is display-ready except `Date` — see below. */
export interface DashboardListItem {
  /** Stable identity for `@for` tracking — the underlying record's ID. */
  Id: string;
  Icon: string;
  /** The headline: an order/payment number. */
  Primary: string;
  /** The context line: customer, status, how many days overdue. */
  Secondary: string;
  /**
   * The RAW value of a DATE column, left unformatted on purpose.
   *
   * OrderDate / PaymentDate / DueDate are DATE columns — no timezone — so the template renders them
   * with `| date: 'mediumDate' : 'UTC'`. Without the UTC argument Angular applies the viewer's
   * local zone and every date west of UTC displays a day early. Pre-formatting here would move that
   * decision out of the template and invite exactly that bug back in.
   */
  Date: string | null;
  /** A pre-formatted figure (see FormatMoney), or null to show no figure at all. */
  Value: string | null;
  /** Renders the row in the warning treatment — used for overdue orders. */
  Warn?: boolean;
}

/** A card: a small header, then the rows within it. */
export interface DashboardListCard {
  Id: string;
  Title: string;
  Icon: string;
  /**
   * The TOTAL number of matching records, which is NOT `Items.length`: the lists are capped at five
   * rows (§0 — small lists only), so the header count has to be sourced from the authoritative
   * count rather than from however many rows we chose to show.
   */
  Count: number;
  Items: DashboardListItem[];
  EmptyIcon: string;
  EmptyMessage: string;
}

/**
 * Format a monetary figure for display.
 *
 * Deliberately NO currency symbol: neither Order nor Payment carries a currency (amendment §3 — FX
 * is deferred), so stamping a "$" on these numbers would assert something the schema does not know.
 * Grouped, two-decimal, tabular figures read correctly and stay honest until currency lands.
 */
export function FormatMoney(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

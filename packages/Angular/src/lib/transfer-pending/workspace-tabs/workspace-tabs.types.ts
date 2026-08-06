/**
 * Workspace-tab framework contract (UI plan §8.0; approved mockup round 2, 2026-07-16).
 *
 * v1 is **session-scoped**: a tab's state lives until the tab is closed or the session ends, and is
 * deliberately **NOT DB-persisted** (DB persistence is the v2 fork — see the component inventory).
 * App types never appear here; a tab carries an opaque `State` the host owns.
 */

/** Lifecycle state of a draft tab. */
export type WorkspaceTabState =
  /** Normal in-progress draft. */
  | 'draft'
  /** Round-tripped after a rejection — the tab returns for rework carrying its rejection context. */
  | 'rejected'
  /** Committed/built — kept open read-only until the user closes it. */
  | 'complete';

/**
 * One workspace tab. `State` is intentionally `unknown`: the framework moves tabs around and never
 * inspects their payload, which is what keeps it app-agnostic (parking discipline, ../README.md).
 * Hosts narrow it themselves — this is the layer boundary, not weak typing.
 */
export interface WorkspaceTab<TState = unknown> {
  /** Stable identity within the strip. */
  Id: string;
  /** Tab caption. */
  Label: string;
  /** Optional Font Awesome class rendered before the label. */
  Icon?: string;
  Status: WorkspaceTabState;
  /** Host-owned payload — the in-progress draft. */
  State: TState;
  /** Set when Status is 'rejected'; surfaced as the tab tooltip so the reason travels with the tab. */
  RejectionReason?: string | null;
  /** True when the tab has unsaved edits — drives the discard confirm. */
  Dirty?: boolean;
}

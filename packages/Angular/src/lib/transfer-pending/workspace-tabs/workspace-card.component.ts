import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkspaceTab } from './workspace-tabs.types';
import { WorkspaceTabStripComponent, TabReorder } from './workspace-tab-strip.component';

/**
 * `mj-workspace-card` — the reusable frame every "workspace" screen shares (JE + batch workspaces,
 * order editor). A THIN, slotted wrapper (Marcelo 2026-07-21): it owns ONLY the invariant chrome —
 *   • the card surface (border + rounded corners + contained scroll),
 *   • the tab-strip row (delegated to `mj-workspace-tab-strip`, which carries all tab behavior),
 *   • an identity band beside the tabs, and
 *   • a single scrollable body —
 * and PROJECTS everything that varies:
 *   • `[workspaceHeader]` — the per-workshop identity band content (JE's number/status/currency badges);
 *   • the default slot — the workshop's form/body.
 *
 * The card deliberately bakes in NO workshop-specific header (no currency badge, no entry-number field);
 * those differ per workshop and are projected. Height chain: `:host` fills its parent (a display:block
 * `mj-page-body-interior`), the card fills the host, the body is the flex:1 scroller — so the BODY
 * scrolls in place while the strip + identity band stay pinned (the compact-workspace feel).
 */
@Component({
  standalone: true,
  selector: 'mj-workspace-card',
  imports: [CommonModule, WorkspaceTabStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ws-card" [attr.aria-label]="AriaLabel">
      <header class="ws-card__head">
        <mj-workspace-tab-strip
          [Tabs]="Tabs"
          [ActiveId]="ActiveId"
          [NewTabLabel]="NewTabLabel"
          (TabSelected)="TabSelected.emit($event)"
          (TabClosed)="TabClosed.emit($event)"
          (NewTabRequested)="NewTabRequested.emit()"
          (TabReordered)="TabReordered.emit($event)">
        </mj-workspace-tab-strip>
        <div class="ws-card__headmeta">
          <ng-content select="[workspaceHeader]"></ng-content>
        </div>
      </header>
      <div class="ws-card__body">
        <ng-content></ng-content>
      </div>
      <!-- Standardized action bar (Marcelo 2026-07-21): the SAME three verbs on every workspace —
           a primary confirm/submit whose LABEL is the only thing that varies per use case, a neutral
           save-as-draft, and a neutral discard — so no workshop hand-rolls its own footer. Pinned
           below the scrolling body. Opt-in via [ShowFooter]; a [workspaceFooterNote] slot carries any
           per-workshop caption beside the buttons. -->
      @if (ShowFooter) {
        <footer class="ws-card__foot">
          <button type="button" class="mj-btn mj-btn--primary"
            [disabled]="ConfirmDisabled || ConfirmBusy"
            [title]="ConfirmTitle || ConfirmLabel"
            (click)="Confirm.emit()">
            @if (ConfirmBusy) {
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> {{ ConfirmBusyLabel }}
            } @else {
              @if (ConfirmIcon) { <i [class]="ConfirmIcon" aria-hidden="true"></i> } {{ ConfirmLabel }}
            }
          </button>
          @if (ShowDraft) {
            <button type="button" class="mj-btn mj-btn--outline" [disabled]="DraftDisabled" (click)="SaveDraft.emit()">
              @if (DraftIcon) { <i [class]="DraftIcon" aria-hidden="true"></i> } {{ DraftLabel }}
            </button>
          }
          <button type="button" class="mj-btn mj-btn--flat" (click)="Discard.emit()">{{ DiscardLabel }}</button>
          <span class="ws-card__footnote"><ng-content select="[workspaceFooterNote]"></ng-content></span>
        </footer>
      }
    </section>
  `,
  styleUrls: ['./workspace-card.component.css'],
})
export class WorkspaceCardComponent {
  @Input() Tabs: WorkspaceTab[] = [];
  @Input() ActiveId: string | null = null;
  @Input() NewTabLabel = 'New';
  @Input() AriaLabel = 'Workspace';

  // ── Standardized footer (opt-in) ────────────────────────────────────────────
  /** Render the standardized action bar (confirm / save-as-draft / discard) below the body. */
  @Input() ShowFooter = false;
  /** The primary verb's label — the ONE thing that changes per workshop ("Create entry" / "Build batch"). */
  @Input() ConfirmLabel = 'Confirm';
  /** Optional Font Awesome class for the confirm button (e.g. 'fa-solid fa-check'). */
  @Input() ConfirmIcon: string | null = null;
  @Input() ConfirmDisabled = false;
  /** Tooltip / blocked-reason on the confirm button; falls back to ConfirmLabel. */
  @Input() ConfirmTitle: string | null = null;
  /** Show the spinner + busy label on the confirm button while an async confirm runs. */
  @Input() ConfirmBusy = false;
  @Input() ConfirmBusyLabel = 'Working…';
  /** Whether the save-as-draft button appears (some workshops have no draft concept). */
  @Input() ShowDraft = true;
  @Input() DraftLabel = 'Keep as draft';
  @Input() DraftIcon: string | null = 'fa-regular fa-floppy-disk';
  @Input() DraftDisabled = false;
  @Input() DiscardLabel = 'Discard';

  @Output() TabSelected = new EventEmitter<string>();
  @Output() TabClosed = new EventEmitter<string>();
  @Output() NewTabRequested = new EventEmitter<void>();
  @Output() TabReordered = new EventEmitter<TabReorder>();
  /** The primary verb (create / build / …). */
  @Output() Confirm = new EventEmitter<void>();
  @Output() SaveDraft = new EventEmitter<void>();
  @Output() Discard = new EventEmitter<void>();
}

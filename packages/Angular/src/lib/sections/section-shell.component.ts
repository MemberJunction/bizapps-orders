import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    MJLeftNavComponent,
    MJLeftNavContentComponent,
    MJPageBodyComponent,
    MJPageBodyInteriorComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    type MJLeftNavItem,
    type MJLeftNavSection,
} from '@memberjunction/ng-ui-components';

/**
 * `mjo-section-shell` — the frame every Orders section renders inside.
 *
 * One of the four top-level sections (Orders, Payments, Receivables, Catalog)
 * occupies a tab in MJ Explorer; each owns a LEFT rail over its own sub-pages.
 * This component is that frame: MJ's chrome trio plus `<mj-left-nav>`, with the
 * active sub-page projected into the content pane.
 *
 * Composition rather than inheritance, deliberately. Angular does not inherit
 * templates, so a base *class* would have forced four copies of this markup — and
 * four copies of a frame is four places for the frame to drift. Each section is a
 * thin component that hands this one a rail and projects a page.
 *
 * Nothing here is bespoke chrome: the header, body, rail and content pane all come
 * from `@memberjunction/ng-ui-components`. A section that wanted its own gradient
 * header would be a section that no longer looks like MJ.
 *
 * ## Example
 *
 * ```html
 * <mjo-section-shell
 *   Title="Orders"
 *   Icon="fa-solid fa-file-invoice-dollar"
 *   Subtitle="Take an order, then work the ones you have"
 *   [NavSections]="NavSections"
 *   [ActivePageId]="ActivePageId"
 *   [Loading]="IsLoading"
 *   [Error]="LoadError"
 *   (PageSelected)="OnPageSelected($event)">
 *
 *   <div meta><mj-stat-badge [Count]="OpenCount" Label="open" /></div>
 *   <div actions><button mjButton variant="primary">New order</button></div>
 *
 *   <ng-container #pageHost />
 * </mjo-section-shell>
 * ```
 */
@Component({
    selector: 'mjo-section-shell',
    standalone: true,
    // The component kit ships WITH the component, via ngc.
    //
    // It used to be a standalone stylesheet that nothing imported: `ngc` only compiles what a
    // component references, so the kit was built into dist and then never loaded by any real
    // Explorer. The app rendered as unstyled text — no cards, overlapping footers — while the
    // mockups and this repo's own apps/MJExplorer harness looked perfect, because both @import
    // it by hand. That is also why `stylesheet-wiring` passed: it checks the harness, not the app.
    //
    // Referencing it from the shell that every section renders inside means Angular carries it
    // wherever the app is mounted, with no host-app wiring to forget. `ViewEncapsulation.None`
    // is required and deliberate: these are shared classes used by descendant components, so
    // they must NOT be scoped to this component's own DOM.
    encapsulation: ViewEncapsulation.None,
    styleUrls: ['../styles/orders-kit.css'],
    imports: [
        CommonModule,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJLeftNavComponent,
        MJLeftNavContentComponent,
        MJPageBodyInteriorComponent,
    ],
    template: `
        <mj-page-layout>
            <mj-page-header [Title]="Title" [Icon]="Icon" [Subtitle]="Subtitle">
                <div meta><ng-content select="[meta]"></ng-content></div>
                <div actions><ng-content select="[actions]"></ng-content></div>
                <div toolbar><ng-content select="[toolbar]"></ng-content></div>
            </mj-page-header>

            <mj-page-body [Flex]="true" [Padding]="false" Direction="row">
                <mj-left-nav
                    [Sections]="NavSections"
                    [ActiveId]="ActivePageId"
                    [Width]="RailWidth"
                    [MobileTitle]="Title"
                    (ItemClicked)="onItemClicked($event)" />

                <!--
                  The interior is what makes the sub-pages SCROLL, and it is required.

                  mj-left-nav-content deliberately forces every DIRECT child to
                  flex + height:100% + overflow:hidden via a ::ng-deep child rule, and that
                  rule outranks a sub-page's own :host overflow:auto. Projected straight in,
                  every page became a fixed-height box with its overflow hidden: anything past
                  the fold — the lower card headings on Catalog and Receivables — was clipped
                  and unreachable, because a mouse wheel cannot scroll overflow:hidden.

                  mj-page-body-interior is MJ's own answer to exactly this: it is named in
                  that rule's :not() exemption list and self-declares flex:1 1 auto plus
                  overflow-y:auto. Wrapping here restores scrolling for every section at once
                  and keeps the sub-pages as grandchildren, so their own :host layout applies
                  as written. Padding stays off because each page supplies its own.
                -->
                <mj-left-nav-content [Loading]="Loading" [Error]="Error">
                    <mj-page-body-interior [Padding]="false">
                        <ng-content></ng-content>
                    </mj-page-body-interior>
                </mj-left-nav-content>
            </mj-page-body>
        </mj-page-layout>
    `,
})
export class MJOSectionShellComponent {
    /** Section title — the identity of the whole tab, so sub-pages never restate it. */
    @Input() Title = '';

    /** Font Awesome class for the title. */
    @Input() Icon = '';

    /** One line saying what this section is for. */
    @Input() Subtitle = '';

    /** The rail, built by {@link BuildLeftNavSections} from the section's page list. */
    @Input() NavSections: MJLeftNavSection[] = [];

    /** Which sub-page is showing. Drives the rail's active state. */
    @Input() ActivePageId: string | null = null;

    /** Rail width in pixels. 232 matches the mockups. */
    @Input() RailWidth = 232;

    /** Shows the content pane's built-in spinner instead of the projected page. */
    @Input() Loading = false;

    /** Shows the content pane's built-in error state. Null clears it. */
    @Input() Error: string | null = null;

    /**
     * A rail item was chosen. Emits the page id.
     *
     * Emitted rather than acted on: this component does not know how the host
     * loads a page, and a shell that routed would stop being reusable outside
     * the one app that taught it how.
     */
    @Output() PageSelected = new EventEmitter<string>();

    protected onItemClicked(item: MJLeftNavItem): void {
        if (item.disabled) return;
        // Re-selecting the current page is a no-op rather than a reload — people
        // click the rail item they are already on surprisingly often.
        if (item.id === this.ActivePageId) return;
        this.PageSelected.emit(item.id);
    }
}

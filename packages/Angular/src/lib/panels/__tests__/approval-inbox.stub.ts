/**
 * Stands in for `@mj-biz-apps/tasks-ng` in `order-review-queue.render.test.ts`: an approval inbox
 * that records its inputs, and a Person resolver the test controls. In its own file because
 * decorators cannot run inside a hoisted `vi.mock` factory.
 */
import { Component, Input } from '@angular/core';
import { vi } from 'vitest';

/** What the stub inbox saw: the type name and title in force when the person arrived. */
export const InboxSeen: { typeAtPerson?: string | null; titleAtPerson?: string; person?: string } = {};

export const ResolveCurrentPersonID = vi.fn<() => Promise<string | null>>();

@Component({ selector: 'bizapps-approval-inbox', standalone: true, template: '<h3>{{ Title }}</h3>' })
export class ApprovalInboxComponent {
    @Input() ApprovalTypeName: string | null = null;
    @Input() Title = 'Approvals';
    @Input() set ApproverPersonID(value: string) {
        InboxSeen.person = value;
        InboxSeen.typeAtPerson = this.ApprovalTypeName;
        InboxSeen.titleAtPerson = this.Title;
    }
}

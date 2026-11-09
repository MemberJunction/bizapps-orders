/**
 * Party organizations a writer chose to keep when it replaced the person on that side.
 *
 * When a save replaces the bill-to or ship-to person, the server save clears that side's
 * organization if it is the previous person's employer, so the replacement brings their own
 * (bizapps-orders#542). Nothing records whether a default stamped that employer or someone chose
 * it, and an unchanged organization does not count as changed in the save, so a writer that means
 * to keep it has to say so. The order form says so when the user undoes its cleared-employer
 * notice; any other writer calls `OrderHeaderEntity.KeepPartyOrganization`.
 *
 * Each entry names the person the organization is kept against. The server honors it only while
 * that person is the one being replaced, so a stale entry left on a browser's order object does
 * not keep an organization through a later replacement.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { EntityCompanion, type EntityCompanionDeserializeMode, type EntitySavePlan } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

export type KeptPartyOrganizationField = 'BillToOrganizationID' | 'ShipToOrganizationID';

export interface KeptPartyOrganization {
    Field: KeptPartyOrganizationField;
    /** The person being replaced on that side, whose employer the organization may be. */
    FromPersonID: string;
}

export type KeptPartyOrganizationsWire = { Kept: KeptPartyOrganization[] };

const PERSON_FIELD: Record<KeptPartyOrganizationField, 'BillToPersonID' | 'ShipToPersonID'> = {
    BillToOrganizationID: 'BillToPersonID',
    ShipToOrganizationID: 'ShipToPersonID',
};

export class KeptPartyOrganizationsCompanion extends EntityCompanion<KeptPartyOrganizationsWire> {
    /** The wire key. Renaming it drops kept organizations from payloads written by the other tier. */
    public readonly Name = 'KeptPartyOrganizations';

    private kept: KeptPartyOrganization[] = [];

    public get Items(): readonly KeptPartyOrganization[] {
        return this.kept;
    }

    /** Keep `field`'s organization through the replacement of `fromPersonID`. */
    public Keep(field: KeptPartyOrganizationField, fromPersonID: string): void {
        this.kept = [...this.kept.filter((k) => k.Field !== field), { Field: field, FromPersonID: fromPersonID }];
    }

    /** True when `field`'s organization is kept through the replacement of `fromPersonID`. */
    public IsKept(field: KeptPartyOrganizationField, fromPersonID: string): boolean {
        return this.kept.some((k) => k.Field === field && UUIDsEqual(k.FromPersonID, fromPersonID));
    }

    public Clear(): void {
        this.kept = [];
    }

    public async Serialize(): Promise<KeptPartyOrganizationsWire | null> {
        return this.kept.length ? { Kept: [...this.kept] } : null;
    }

    public async Deserialize(data: KeptPartyOrganizationsWire, _mode: EntityCompanionDeserializeMode): Promise<void> {
        const kept = Array.isArray(data?.Kept) ? data.Kept : [];
        this.kept = kept.filter(
            (k): k is KeptPartyOrganization =>
                !!k && (k.Field === 'BillToOrganizationID' || k.Field === 'ShipToOrganizationID') && typeof k.FromPersonID === 'string',
        );
    }

    /**
     * Dirty only while a kept side's person is changing in this save, the one save the entry
     * matters to. An entry alone never makes an otherwise clean order save.
     */
    public override get Dirty(): boolean {
        return this.kept.some((k) => this.Owner.GetFieldByName(PERSON_FIELD[k.Field])?.Dirty === true);
    }

    /**
     * Sends a save that carries a kept organization to the server as a graph save, the only save
     * that carries companions.
     *
     * A client save whose plan holds only the order's own row takes the plain GraphQL update,
     * which sends field values and nothing else (MemberJunction/MJ#5528). The entry would not
     * reach the server, and the server save would clear the organization the writer kept. A
     * second node makes the client route the save through `MJ.SaveEntityGraph`, which restores
     * companions before saving. The client never runs the plan's nodes; the server builds its
     * own plan, where this companion adds nothing and the order saves once.
     *
     * Not added on a provider with entity transactions: that save runs here, where the entry is
     * already in memory, and the node would save the order a second time.
     */
    public override ContributeSaveWork(plan: EntitySavePlan): void {
        if (!this.Dirty || this.Owner.ProviderToUse?.SupportsEntityTransactions === true) return;
        plan.Add({ Entity: this.Owner, Operation: 'Save', Label: `${this.Name} (routes the save through the graph)`, SelfOnly: true });
    }
}

import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { AddressEditorComponent } from '@mj-biz-apps/common-ng';
import {
    mjBizAppsCommonAddressEntity,
    mjBizAppsCommonAddressLinkEntity,
} from '@mj-biz-apps/common-entities';
import { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJO_COMMON_ENTITIES } from '../../data/entity-names';
import { FormatPartyAddress } from './order-header-prefs';

export type PartyAddressSide = 'ship' | 'bill';

interface PartyAddressOption {
    ID: string;
    Label: string;
    Source: 'person' | 'organization';
}

const CUSTOM = '__custom__';

/**
 * Binds OrderHeader.ShipToAddressID / BillToAddressID to an existing party
 * address (by ID, not a copy). Custom addresses use the same Address entity
 * the common address editor writes; optional checkboxes create AddressLinks
 * onto the person and/or organization.
 */
@Component({
    standalone: true,
    selector: 'mjo-party-address-picker',
    imports: [CommonModule, FormsModule, BaseFormsModule, AddressEditorComponent],
    templateUrl: './party-address-picker.component.html',
    styleUrls: ['./party-address-picker.component.css'],
})
export class MJOPartyAddressPickerComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input({ required: true }) public Order!: OrderHeaderEntity;
    @Input({ required: true }) public Side!: PartyAddressSide;
    @Input() public EditMode = true;
    @Input() public PersonName: string | null = null;
    @Input() public OrganizationName: string | null = null;

    public Options: PartyAddressOption[] = [];
    public Selection = '';
    public Custom = false;
    public SaveToPerson = false;
    public SaveToOrg = false;
    public ManagingProfile = false;
    public Loading = false;

    /** Person or org is on this panel — the picker is only meaningful then. */
    public get HasParty(): boolean {
        return !!(this.PersonID || this.OrganizationID);
    }

    /** Dropdown + custom editor: compose mode with a party to pick from. */
    public get ShowPicker(): boolean {
        return this.EditMode && this.HasParty;
    }

    /** An address ID is bound on the order. */
    public get ShowSelected(): boolean {
        return !!this.AddressID;
    }

    /** Hide the whole block: no party in compose, and nothing selected in read-only. */
    public get ShowSection(): boolean {
        return this.ShowPicker || (!this.EditMode && this.ShowSelected);
    }

    /**
     * Selected address as loaded with the order: embedded Address bits, then the
     * header virtual `ShipToAddress` / `BillToAddress` (the related-entity join
     * on the order view — not a second Address RunView).
     */
    public get SelectedAddressText(): string {
        const embedded = this.CustomAddress;
        if (embedded) {
            const formatted = FormatPartyAddress(embedded);
            if (formatted) return formatted;
        }
        const virtual = this.Side === 'ship' ? this.Order.ShipToAddress : this.Order.BillToAddress;
        if (virtual) return virtual;
        const opt = this.Options.find((o) => o.ID.toLowerCase() === (this.AddressID ?? '').toLowerCase());
        return opt?.Label ?? '';
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Order'] || changes['Side'] || changes['PersonName'] || changes['OrganizationName']) {
            void this.reload();
        }
    }

    public get PersonID(): string | null {
        return this.Side === 'ship' ? this.Order.ShipToPersonID : this.Order.BillToPersonID;
    }

    public get OrganizationID(): string | null {
        return this.Side === 'ship' ? this.Order.ShipToOrganizationID : this.Order.BillToOrganizationID;
    }

    public get AddressID(): string | null {
        return this.Side === 'ship' ? this.Order.ShipToAddressID : this.Order.BillToAddressID;
    }

    public get CustomAddress(): mjBizAppsCommonAddressEntity | null {
        return this.Side === 'ship' ? this.Order.ShipToAddressID_Object : this.Order.BillToAddressID_Object;
    }

    public get PersonEntity(): string {
        return MJO_COMMON_ENTITIES.Person;
    }

    public get OrgEntity(): string {
        return MJO_COMMON_ENTITIES.Organization;
    }

    public async OnSelect(value: string): Promise<void> {
        this.Selection = value;
        this.Custom = value === CUSTOM;
        if (!value) {
            this.clear();
            return;
        }
        if (value === CUSTOM) {
            this.clear();
            this.ensureCustom();
            return;
        }
        this.clear();
        this.setAddressID(value);
        this.cdr.detectChanges();
    }

    public ToggleManageProfile(): void {
        this.ManagingProfile = !this.ManagingProfile;
    }

    public async OnSaveToPersonChange(): Promise<void> {
        if (this.SaveToPerson) await this.linkTo(this.PersonEntity, this.PersonID);
    }

    public async OnSaveToOrgChange(): Promise<void> {
        if (this.SaveToOrg) await this.linkTo(this.OrgEntity, this.OrganizationID);
    }

    public reloadFromProfile(): void {
        void this.reload();
    }

    private async reload(): Promise<void> {
        if (!this.HasParty) {
            this.Options = [];
            this.Selection = this.AddressID && !this.EditMode ? this.AddressID : '';
            this.Custom = false;
            this.ManagingProfile = false;
            this.cdr.detectChanges();
            return;
        }
        this.Loading = true;
        try {
            this.Options = await this.loadPartyAddresses();
            const current = this.AddressID;
            if (current && this.Options.some((o) => o.ID.toLowerCase() === current.toLowerCase())) {
                this.Selection = current;
                this.Custom = false;
            } else if (current) {
                this.Selection = CUSTOM;
                this.Custom = true;
            } else {
                this.Selection = '';
                this.Custom = false;
            }
        } finally {
            this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadPartyAddresses(): Promise<PartyAddressOption[]> {
        const md = new Metadata();
        const personEntity = md.EntityByName(MJO_COMMON_ENTITIES.Person);
        const orgEntity = md.EntityByName(MJO_COMMON_ENTITIES.Organization);
        const clauses: string[] = [];
        if (this.PersonID && personEntity) {
            clauses.push(`(EntityID='${personEntity.ID}' AND RecordID='${this.PersonID}')`);
        }
        if (this.OrganizationID && orgEntity) {
            clauses.push(`(EntityID='${orgEntity.ID}' AND RecordID='${this.OrganizationID}')`);
        }
        if (clauses.length === 0) return [];

        const rv = new RunView();
        const links = await rv.RunView<mjBizAppsCommonAddressLinkEntity>({
            EntityName: MJO_COMMON_ENTITIES.AddressLink,
            ExtraFilter: clauses.join(' OR '),
            ResultType: 'entity_object',
        });
        const rows = links.Success ? links.Results : [];
        const personEntityID = personEntity?.ID.toLowerCase();
        const out: PartyAddressOption[] = [];
        const seen = new Set<string>();
        for (const link of rows) {
            if (!link.AddressID || seen.has(link.AddressID.toLowerCase())) continue;
            seen.add(link.AddressID.toLowerCase());
            const fromPerson = personEntityID != null && link.EntityID.toLowerCase() === personEntityID;
            const who = fromPerson ? (this.PersonName || 'Person') : (this.OrganizationName || 'Organization');
            const type = link.AddressType || (link.IsPrimary ? 'Primary' : 'Address');
            const street = link.Address || 'Address';
            out.push({
                ID: link.AddressID,
                Label: `${type} · ${street} (${who})`,
                Source: fromPerson ? 'person' : 'organization',
            });
        }
        return out;
    }

    private setAddressID(id: string | null): void {
        if (this.Side === 'ship') this.Order.ShipToAddressID = id;
        else this.Order.BillToAddressID = id;
    }

    private clear(): void {
        if (this.Side === 'ship') this.Order.ClearShipToAddress();
        else this.Order.ClearBillToAddress();
        this.Custom = false;
        this.SaveToPerson = false;
        this.SaveToOrg = false;
    }

    private ensureCustom(): void {
        if (this.Side === 'ship') this.Order.ShipToAddressID_EnsureObject();
        else this.Order.BillToAddressID_EnsureObject();
        this.Custom = true;
        this.cdr.detectChanges();
    }

    private async linkTo(entityName: string, recordID: string | null): Promise<void> {
        const address = this.CustomAddress;
        if (!address || !recordID) return;
        if (!address.IsSaved) {
            const saved = await address.Save();
            if (!saved) return;
            this.setAddressID(address.ID);
        }
        const md = new Metadata();
        const entity = md.EntityByName(entityName);
        if (!entity) return;
        const rv = new RunView();
        const existing = await rv.RunView({
            EntityName: MJO_COMMON_ENTITIES.AddressLink,
            ExtraFilter: `AddressID='${address.ID}' AND EntityID='${entity.ID}' AND RecordID='${recordID}'`,
            ResultType: 'simple',
            MaxRows: 1,
        });
        if (existing.Success && (existing.Results?.length ?? 0) > 0) return;
        const link = await md.GetEntityObject<mjBizAppsCommonAddressLinkEntity>(MJO_COMMON_ENTITIES.AddressLink);
        link.NewRecord();
        link.AddressID = address.ID;
        link.EntityID = entity.ID;
        link.RecordID = recordID;
        await link.Save();
        await this.reload();
    }
}

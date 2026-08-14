/**
 * The committed ORD-WORLD catalog, resolved by natural keys.
 */
export interface WorldCompany {
    ID: string;
    Name: string;
    Linked: boolean;
    Accounts: Record<string, string>;
}

export interface WorldState {
    CurrencyCode: string;
    CompanyEntityID: string;
    Companies: Record<string, WorldCompany>;
    Accounts: Record<string, string>;
    Organizations: Record<string, string>;
    People: Record<string, string>;
    Categories: Record<string, string>;
    Products: Record<string, string>;
    /** Old fixture mnemonics (WidgetA, SubRolling, …) → product ID. */
    ProductMnemonics: Record<string, string>;
    Entitlements: Record<string, string>;
    Addresses: Record<string, string>;
    Jurisdictions: Record<string, string>;
    Dimensions: Record<string, string>;
    DimensionValues: Record<string, string>;
    RevRecTypeIDs: Map<string, string>;
    SubscriptionTypeIDs: Map<string, string>;
    PaymentTypeIDs: Map<string, string>;
    ProductTypeIDs: Record<string, string>;
    Event: { StartsAt: Date; EndsAt: Date };
}

let current: WorldState | undefined;

export function SetWorld(world: WorldState): void {
    current = world;
}

export function World(): WorldState {
    if (!current) {
        throw new Error('ORD-WORLD is not loaded — run the catalog-world bundle (ORD-00) first');
    }
    return current;
}

export function HasWorld(): boolean {
    return current != null;
}

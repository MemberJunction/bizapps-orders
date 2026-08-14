import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Orders: Charge Types
 */
export const mjBizAppsOrdersChargeTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.union([z.literal('Fee'), z.literal('Handling'), z.literal('Shipping'), z.literal('Surcharge'), z.literal('Tax')]).describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Fee
    *   * Handling
    *   * Shipping
    *   * Surcharge
    *   * Tax
        * * Description: Shipping | Handling | Tax | Surcharge | Fee.`),
    Basis: z.union([z.literal('Flat'), z.literal('LineNet'), z.literal('LineNetPlusCharges'), z.literal('OrderNet')]).describe(`
        * * Field Name: Basis
        * * Display Name: Basis
        * * SQL Data Type: nvarchar(30)
        * * Default Value: LineNet
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * LineNet
    *   * LineNetPlusCharges
    *   * OrderNet
        * * Description: What the charge computes on: LineNet (the discounted line), LineNetPlusCharges (after earlier charges in sequence), OrderNet, or Flat. This is the field that makes tax-on-shipping work, which is jurisdiction-dependent and therefore configuration rather than code.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Application order. Charges compute in this order and later ones may build on earlier ones via Basis.`),
    AllowsOverride: z.boolean().describe(`
        * * Field Name: AllowsOverride
        * * Display Name: Allows Override
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether a human may override a computed charge of this type.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersChargeTypeEntityType = z.infer<typeof mjBizAppsOrdersChargeTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Customer Payment Methods
 */
export const mjBizAppsOrdersCustomerPaymentMethodSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OwnerPersonID: z.string().nullable().describe(`
        * * Field Name: OwnerPersonID
        * * Display Name: Owner Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    OwnerOrganizationID: z.string().nullable().describe(`
        * * Field Name: OwnerOrganizationID
        * * Display Name: Owner Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the organization this saved method belongs to (D65). Nullable; CK_CustomerPaymentMethod_Owner requires a person or an organization.`),
    PaymentDetailID: z.string().describe(`
        * * Field Name: PaymentDetailID
        * * Display Name: Payment Detail ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)`),
    Nickname: z.string().nullable().describe(`
        * * Field Name: Nickname
        * * Display Name: Nickname
        * * SQL Data Type: nvarchar(100)`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the customer's default method for charge-on-file.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this method is active/usable.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    OwnerPerson: z.string().nullable().describe(`
        * * Field Name: OwnerPerson
        * * Display Name: Owner Person
        * * SQL Data Type: nvarchar(100)`),
    OwnerOrganization: z.string().nullable().describe(`
        * * Field Name: OwnerOrganization
        * * Display Name: Owner Organization
        * * SQL Data Type: nvarchar(255)`),
    PaymentDetail: z.string().nullable().describe(`
        * * Field Name: PaymentDetail
        * * Display Name: Payment Detail
        * * SQL Data Type: char(4)`),
});

export type mjBizAppsOrdersCustomerPaymentMethodEntityType = z.infer<typeof mjBizAppsOrdersCustomerPaymentMethodSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Customer Payment Terms
 */
export const mjBizAppsOrdersCustomerPaymentTermsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person
        * * SQL Data Type: uniqueidentifier`),
    PaymentTermsTypeID: z.string().describe(`
        * * Field Name: PaymentTermsTypeID
        * * Display Name: Payment Terms Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Terms Types (vwPaymentTermsTypes.ID)`),
    CompanyID: z.string().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset`),
    EndedAt: z.date().nullable().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetimeoffset`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive`),
    Comments: z.string().nullable().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PaymentTermsType: z.string().describe(`
        * * Field Name: PaymentTermsType
        * * Display Name: Payment Terms Type
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersCustomerPaymentTermsEntityType = z.infer<typeof mjBizAppsOrdersCustomerPaymentTermsSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Customer Tax Exemptions
 */
export const mjBizAppsOrdersCustomerTaxExemptionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    TaxJurisdictionID: z.string().nullable().describe(`
        * * Field Name: TaxJurisdictionID
        * * Display Name: Tax Jurisdiction ID
        * * SQL Data Type: uniqueidentifier`),
    TaxCategory: z.string().nullable().describe(`
        * * Field Name: TaxCategory
        * * Display Name: Tax Category
        * * SQL Data Type: nvarchar(50)`),
    ExemptionType: z.union([z.literal('Educational'), z.literal('Government'), z.literal('NonProfit'), z.literal('Other'), z.literal('Resale')]).describe(`
        * * Field Name: ExemptionType
        * * Display Name: Exemption Type
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Other
    * * Value List Type: List
    * * Possible Values 
    *   * Educational
    *   * Government
    *   * NonProfit
    *   * Other
    *   * Resale`),
    CertificateRef: z.string().nullable().describe(`
        * * Field Name: CertificateRef
        * * Display Name: Certificate Reference
        * * SQL Data Type: nvarchar(200)`),
    CertificateIssuedAt: z.date().nullable().describe(`
        * * Field Name: CertificateIssuedAt
        * * Display Name: Certificate Issued At
        * * SQL Data Type: date`),
    CertificateExpiresAt: z.date().nullable().describe(`
        * * Field Name: CertificateExpiresAt
        * * Display Name: Certificate Expires At
        * * SQL Data Type: date`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset`),
    EndedAt: z.date().nullable().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetimeoffset`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive`),
    Comments: z.string().nullable().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Person: z.string().nullable().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersCustomerTaxExemptionEntityType = z.infer<typeof mjBizAppsOrdersCustomerTaxExemptionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Entitlement Grants
 */
export const mjBizAppsOrdersEntitlementGrantSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProductEntitlementID: z.string().describe(`
        * * Field Name: ProductEntitlementID
        * * Display Name: Product Entitlement
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Entitlements (vwProductEntitlements.ID)`),
    OrderLineID: z.string().nullable().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    SubscriptionID: z.string().nullable().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    BeneficiaryPersonID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPersonID
        * * Display Name: Beneficiary Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: FK to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).`),
    BeneficiaryOrganizationID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganizationID
        * * Display Name: Beneficiary Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the benefiting organization.`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Granted quantity (defaults from the entitlement definition).`),
    ValidFrom: z.date().nullable().describe(`
        * * Field Name: ValidFrom
        * * Display Name: Valid From
        * * SQL Data Type: datetimeoffset
        * * Description: Grant validity start.`),
    ValidTo: z.date().nullable().describe(`
        * * Field Name: ValidTo
        * * Display Name: Valid To
        * * SQL Data Type: datetimeoffset
        * * Description: Grant validity end.`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Revoked'), z.literal('Suspended')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
    *   * Suspended
        * * Description: Active | Suspended | Revoked | Expired.`),
    ProvisionedAt: z.date().nullable().describe(`
        * * Field Name: ProvisionedAt
        * * Display Name: Provisioned At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp downstream provisioning completed (NULL until provisioned).`),
    ValidityModeApplied: z.union([z.literal('EventWindow'), z.literal('FixedDuration'), z.literal('Perpetual'), z.literal('SubscriptionTerm')]).nullable().describe(`
        * * Field Name: ValidityModeApplied
        * * Display Name: Validity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm`),
    SubscriptionTermID: z.string().nullable().describe(`
        * * Field Name: SubscriptionTermID
        * * Display Name: Subscription Term
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Terms (vwSubscriptionTerms.ID)`),
    RevokedAt: z.date().nullable().describe(`
        * * Field Name: RevokedAt
        * * Display Name: Revoked At
        * * SQL Data Type: datetimeoffset`),
    RevocationReason: z.string().nullable().describe(`
        * * Field Name: RevocationReason
        * * Display Name: Revocation Reason
        * * SQL Data Type: nvarchar(300)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ProductEntitlement: z.string().nullable().describe(`
        * * Field Name: ProductEntitlement
        * * Display Name: Product Entitlement Name
        * * SQL Data Type: nvarchar(200)`),
    Subscription: z.string().nullable().describe(`
        * * Field Name: Subscription
        * * Display Name: Subscription Name
        * * SQL Data Type: nvarchar(40)`),
    BeneficiaryPerson: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPerson
        * * Display Name: Beneficiary Person Name
        * * SQL Data Type: nvarchar(100)`),
    BeneficiaryOrganization: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganization
        * * Display Name: Beneficiary Organization Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsOrdersEntitlementGrantEntityType = z.infer<typeof mjBizAppsOrdersEntitlementGrantSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Event Order Lines
 */
export const mjBizAppsOrdersEventOrderLineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    CheckInAt: z.date().nullable().describe(`
        * * Field Name: CheckInAt
        * * Display Name: Check-In At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp the attendee checked in.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PersonID: z.string().describe(`
        * * Field Name: PersonID
        * * Display Name: Attendee
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: FK to __mj_BizAppsCommon.Person — the attendee. Required for a new event line; check-in is separate and optional.`),
    DietaryPreferences: z.string().nullable().describe(`
        * * Field Name: DietaryPreferences
        * * Display Name: Dietary Preferences
        * * SQL Data Type: nvarchar(500)
        * * Description: Dietary preferences for the attendee (vegetarian, kosher, etc.). Shown to conference organizers.`),
    Allergies: z.string().nullable().describe(`
        * * Field Name: Allergies
        * * Display Name: Allergies
        * * SQL Data Type: nvarchar(500)
        * * Description: Food or other allergies conference organizers should know about.`),
    Comments: z.string().nullable().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(2000)
        * * Description: Free-form notes for conference organizers about this attendee.`),
    OrderHeaderID: z.string().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order Header
        * * SQL Data Type: uniqueidentifier`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product
        * * SQL Data Type: uniqueidentifier`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier`),
    LineNumber: z.number().describe(`
        * * Field Name: LineNumber
        * * Display Name: Line Number
        * * SQL Data Type: int`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(19, 4)`),
    ProductPriceID: z.string().nullable().describe(`
        * * Field Name: ProductPriceID
        * * Display Name: Product Price
        * * SQL Data Type: uniqueidentifier`),
    DiscountPct: z.number().describe(`
        * * Field Name: DiscountPct
        * * Display Name: Discount Percent
        * * SQL Data Type: decimal(7, 4)`),
    DiscountAmount: z.number().describe(`
        * * Field Name: DiscountAmount
        * * Display Name: Discount Amount
        * * SQL Data Type: decimal(19, 4)`),
    LineTotalNet: z.number().nullable().describe(`
        * * Field Name: LineTotalNet
        * * Display Name: Line Total Net
        * * SQL Data Type: decimal(18, 2)`),
    ChargeAmount: z.number().describe(`
        * * Field Name: ChargeAmount
        * * Display Name: Charge Amount
        * * SQL Data Type: decimal(18, 2)`),
    LineTax: z.number().describe(`
        * * Field Name: LineTax
        * * Display Name: Line Tax
        * * SQL Data Type: decimal(18, 2)`),
    LineTotalGross: z.number().nullable().describe(`
        * * Field Name: LineTotalGross
        * * Display Name: Line Total Gross
        * * SQL Data Type: decimal(18, 2)`),
    ShipToAddressID: z.string().nullable().describe(`
        * * Field Name: ShipToAddressID
        * * Display Name: Ship To Address
        * * SQL Data Type: uniqueidentifier`),
    ShipToOrganizationID: z.string().nullable().describe(`
        * * Field Name: ShipToOrganizationID
        * * Display Name: Ship To Organization
        * * SQL Data Type: uniqueidentifier`),
    ShipToPersonID: z.string().nullable().describe(`
        * * Field Name: ShipToPersonID
        * * Display Name: Ship To Person
        * * SQL Data Type: uniqueidentifier`),
    RenewsSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RenewsSubscriptionID
        * * Display Name: Renews Subscription
        * * SQL Data Type: uniqueidentifier`),
    ServicePeriodStart: z.date().nullable().describe(`
        * * Field Name: ServicePeriodStart
        * * Display Name: Service Period Start
        * * SQL Data Type: date`),
    ServicePeriodEnd: z.date().nullable().describe(`
        * * Field Name: ServicePeriodEnd
        * * Display Name: Service Period End
        * * SQL Data Type: date`),
    FulfillmentStatus: z.string().nullable().describe(`
        * * Field Name: FulfillmentStatus
        * * Display Name: Fulfillment Status
        * * SQL Data Type: nvarchar(20)`),
    ReversesOrderLineID: z.string().nullable().describe(`
        * * Field Name: ReversesOrderLineID
        * * Display Name: Reverses Order Line
        * * SQL Data Type: uniqueidentifier`),
    SourceBundleProductID: z.string().nullable().describe(`
        * * Field Name: SourceBundleProductID
        * * Display Name: Source Bundle Product
        * * SQL Data Type: uniqueidentifier`),
    ParentOrderLineID: z.string().nullable().describe(`
        * * Field Name: ParentOrderLineID
        * * Display Name: Parent Order Line
        * * SQL Data Type: uniqueidentifier`),
    IsRollupParent: z.boolean().describe(`
        * * Field Name: IsRollupParent
        * * Display Name: Is Rollup Parent
        * * SQL Data Type: bit`),
    IsQuantityOverridden: z.boolean().describe(`
        * * Field Name: IsQuantityOverridden
        * * Display Name: Is Quantity Overridden
        * * SQL Data Type: bit`),
    SubscriptionID: z.string().nullable().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier`),
    Person: z.string().describe(`
        * * Field Name: Person
        * * Display Name: Attendee Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersEventOrderLineEntityType = z.infer<typeof mjBizAppsOrdersEventOrderLineSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Event Products
 */
export const mjBizAppsOrdersEventProductSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    EventStartsAt: z.date().describe(`
        * * Field Name: EventStartsAt
        * * Display Name: Event Starts At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC start of the event (also the SingleDate recognition date for Deferred event products).`),
    EventEndsAt: z.date().nullable().describe(`
        * * Field Name: EventEndsAt
        * * Display Name: Event Ends At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC end of the event.`),
    VenueName: z.string().nullable().describe(`
        * * Field Name: VenueName
        * * Display Name: Venue Name
        * * SQL Data Type: nvarchar(300)
        * * Description: Venue display name.`),
    VenueAddressID: z.string().nullable().describe(`
        * * Field Name: VenueAddressID
        * * Display Name: Venue Address
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
        * * Description: FK to __mj_BizAppsCommon.Address — the venue address.`),
    Capacity: z.number().nullable().describe(`
        * * Field Name: Capacity
        * * Display Name: Capacity
        * * SQL Data Type: int
        * * Description: Maximum attendee count. NULL = uncapped.`),
    RequiresAttendeeInfo: z.boolean().describe(`
        * * Field Name: RequiresAttendeeInfo
        * * Display Name: Requires Attendee Info
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether order lines for this event require attendee info (EventOrderLine).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    SKU: z.string().nullable().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(80)`),
    ProductTypeID: z.string().describe(`
        * * Field Name: ProductTypeID
        * * Display Name: Product Type
        * * SQL Data Type: uniqueidentifier`),
    ProductCategoryID: z.string().describe(`
        * * Field Name: ProductCategoryID
        * * Display Name: Product Category
        * * SQL Data Type: uniqueidentifier`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)`),
    SuccessorProductID: z.string().nullable().describe(`
        * * Field Name: SuccessorProductID
        * * Display Name: Successor Product
        * * SQL Data Type: uniqueidentifier`),
    AvailableFrom: z.date().nullable().describe(`
        * * Field Name: AvailableFrom
        * * Display Name: Available From
        * * SQL Data Type: date`),
    AvailableTo: z.date().nullable().describe(`
        * * Field Name: AvailableTo
        * * Display Name: Available To
        * * SQL Data Type: date`),
    RevenueRecognitionTypeID: z.string().describe(`
        * * Field Name: RevenueRecognitionTypeID
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: uniqueidentifier`),
    StandaloneSellingPrice: z.number().nullable().describe(`
        * * Field Name: StandaloneSellingPrice
        * * Display Name: Standalone Selling Price
        * * SQL Data Type: decimal(19, 4)`),
    SubscriptionTypeID: z.string().nullable().describe(`
        * * Field Name: SubscriptionTypeID
        * * Display Name: Subscription Type
        * * SQL Data Type: uniqueidentifier`),
    IsTaxable: z.boolean().nullable().describe(`
        * * Field Name: IsTaxable
        * * Display Name: Is Taxable
        * * SQL Data Type: bit`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    TaxCategory: z.string().nullable().describe(`
        * * Field Name: TaxCategory
        * * Display Name: Tax Category
        * * SQL Data Type: nvarchar(50)`),
    EntitlementGrantTiming: z.string().nullable().describe(`
        * * Field Name: EntitlementGrantTiming
        * * Display Name: Entitlement Grant Timing
        * * SQL Data Type: nvarchar(20)`),
    EntitlementQuantityMode: z.string().nullable().describe(`
        * * Field Name: EntitlementQuantityMode
        * * Display Name: Entitlement Quantity Mode
        * * SQL Data Type: nvarchar(20)`),
    EntitlementValidityMode: z.string().nullable().describe(`
        * * Field Name: EntitlementValidityMode
        * * Display Name: Entitlement Validity Mode
        * * SQL Data Type: nvarchar(20)`),
    PricingDriverClass: z.string().nullable().describe(`
        * * Field Name: PricingDriverClass
        * * Display Name: Pricing Driver Class
        * * SQL Data Type: nvarchar(255)`),
    VenueAddress: z.string().nullable().describe(`
        * * Field Name: VenueAddress
        * * Display Name: Venue Address
        * * SQL Data Type: nvarchar(255)`),
    __mj_Latitude: z.number().nullable().describe(`
        * * Field Name: __mj_Latitude
        * * Display Name: Latitude
        * * SQL Data Type: decimal(10, 6)`),
    __mj_Longitude: z.number().nullable().describe(`
        * * Field Name: __mj_Longitude
        * * Display Name: Longitude
        * * SQL Data Type: decimal(10, 6)`),
    MaxQuantityPerLine: z.number().nullable().describe(`
        * * Field Name: MaxQuantityPerLine
        * * Display Name: Max Quantity Per Line
        * * SQL Data Type: decimal(18, 4)`),
});

export type mjBizAppsOrdersEventProductEntityType = z.infer<typeof mjBizAppsOrdersEventProductSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Adjustment Allocations
 */
export const mjBizAppsOrdersOrderAdjustmentAllocationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderAdjustmentID: z.string().describe(`
        * * Field Name: OrderAdjustmentID
        * * Display Name: Order Adjustment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Adjustments (vwOrderAdjustments.ID)`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersOrderAdjustmentAllocationEntityType = z.infer<typeof mjBizAppsOrdersOrderAdjustmentAllocationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Adjustments
 */
export const mjBizAppsOrdersOrderAdjustmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderHeaderID: z.string().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order Header
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    OrderLineID: z.string().nullable().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
        * * Description: The line reduced. NULL means order-level, in which case OrderAdjustmentAllocation distributes it across lines.`),
    PromotionID: z.string().nullable().describe(`
        * * Field Name: PromotionID
        * * Display Name: Promotion
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)
        * * Description: The promotion redeemed. NULL means a manual discount, which then requires a Reason and a SalesAuthority.`),
    PromotionCodeID: z.string().nullable().describe(`
        * * Field Name: PromotionCodeID
        * * Display Name: Promotion Code ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotion Codes (vwPromotionCodes.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: Always POSITIVE - it is a reduction, and the direction is carried by what the pipeline does with it rather than by the stored sign.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    Reason: z.string().nullable().describe(`
        * * Field Name: Reason
        * * Display Name: Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Why this discount was given. Required when no promotion is named.`),
    AppliedByUserID: z.string().nullable().describe(`
        * * Field Name: AppliedByUserID
        * * Display Name: Applied By
        * * SQL Data Type: uniqueidentifier`),
    AppliedAt: z.date().describe(`
        * * Field Name: AppliedAt
        * * Display Name: Applied At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()`),
    AuthorizedBySalesAuthorityID: z.string().nullable().describe(`
        * * Field Name: AuthorizedBySalesAuthorityID
        * * Display Name: Authorized By Sales Authority
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Sales Authorities (vwSalesAuthorities.ID)
        * * Description: Which SalesAuthority permitted a manual discount. Stamped so that lowering a rep's limit later does not retroactively make past discounts look unauthorized.`),
    ApprovedByUserID: z.string().nullable().describe(`
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By
        * * SQL Data Type: uniqueidentifier
        * * Description: Who approved a discount exceeding the applying user's authority. Over-limit discounts ESCALATE rather than being refused - a hard refusal is what pushes people to record the discount as something else.`),
    ApprovedAt: z.date().nullable().describe(`
        * * Field Name: ApprovedAt
        * * Display Name: Approved At
        * * SQL Data Type: datetimeoffset`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    OrderHeader: z.string().describe(`
        * * Field Name: OrderHeader
        * * Display Name: Order Header Name
        * * SQL Data Type: nvarchar(40)`),
    Promotion: z.string().nullable().describe(`
        * * Field Name: Promotion
        * * Display Name: Promotion Name
        * * SQL Data Type: nvarchar(200)`),
    PromotionCode: z.string().nullable().describe(`
        * * Field Name: PromotionCode
        * * Display Name: Promotion Code
        * * SQL Data Type: nvarchar(60)`),
});

export type mjBizAppsOrdersOrderAdjustmentEntityType = z.infer<typeof mjBizAppsOrdersOrderAdjustmentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Charge Allocations
 */
export const mjBizAppsOrdersOrderChargeAllocationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderChargeID: z.string().describe(`
        * * Field Name: OrderChargeID
        * * Display Name: Order Charge
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Charges (vwOrderCharges.ID)`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersOrderChargeAllocationEntityType = z.infer<typeof mjBizAppsOrdersOrderChargeAllocationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Charges
 */
export const mjBizAppsOrdersOrderChargeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderHeaderID: z.string().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order Header
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    ChargeTypeID: z.string().describe(`
        * * Field Name: ChargeTypeID
        * * Display Name: Charge Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Charge Types (vwChargeTypes.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)`),
    BasisAmount: z.number().nullable().describe(`
        * * Field Name: BasisAmount
        * * Display Name: Basis Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: What the charge was computed on, kept so the arithmetic can be reproduced.`),
    Rate: z.number().nullable().describe(`
        * * Field Name: Rate
        * * Display Name: Rate
        * * SQL Data Type: decimal(9, 6)
        * * Description: The rate applied, for rate-driven charges such as tax.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    TaxJurisdictionID: z.string().nullable().describe(`
        * * Field Name: TaxJurisdictionID
        * * Display Name: Tax Jurisdiction
        * * SQL Data Type: uniqueidentifier
        * * Description: For tax charges, the accounting TaxJurisdiction this layer came from. A soft reference across schemas.`),
    TaxRateID: z.string().nullable().describe(`
        * * Field Name: TaxRateID
        * * Display Name: Tax Rate
        * * SQL Data Type: uniqueidentifier
        * * Description: For tax charges, the accounting TaxRate that produced the number - provenance, so it can be defended years later.`),
    CalculationSource: z.string().describe(`
        * * Field Name: CalculationSource
        * * Display Name: Calculation Source
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Internal
        * * Description: Internal, or the name of the external provider that returned this amount.`),
    IsOverridden: z.boolean().describe(`
        * * Field Name: IsOverridden
        * * Display Name: Is Overridden
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether a human replaced the computed amount. Requires a reason and preserves the computed value.`),
    ComputedAmount: z.number().nullable().describe(`
        * * Field Name: ComputedAmount
        * * Display Name: Computed Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: What the charge would have been before the override.`),
    OverrideReason: z.string().nullable().describe(`
        * * Field Name: OverrideReason
        * * Display Name: Override Reason
        * * SQL Data Type: nvarchar(MAX)`),
    OverriddenByUserID: z.string().nullable().describe(`
        * * Field Name: OverriddenByUserID
        * * Display Name: Overridden By
        * * SQL Data Type: uniqueidentifier`),
    OverriddenAt: z.date().nullable().describe(`
        * * Field Name: OverriddenAt
        * * Display Name: Overridden At
        * * SQL Data Type: datetimeoffset`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    OrderHeader: z.string().describe(`
        * * Field Name: OrderHeader
        * * Display Name: Order
        * * SQL Data Type: nvarchar(40)`),
    ChargeType: z.string().describe(`
        * * Field Name: ChargeType
        * * Display Name: Charge Type Name
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersOrderChargeEntityType = z.infer<typeof mjBizAppsOrdersOrderChargeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Company Policies
 */
export const mjBizAppsOrdersOrderCompanyPolicySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    AllowPromotionStacking: z.boolean().describe(`
        * * Field Name: AllowPromotionStacking
        * * Display Name: Allow Promotion Stacking
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Company-level flip permitting promotions to combine at all. A promotion must ALSO opt in via its own AllowsStacking.`),
    StackingMode: z.union([z.literal('Additive'), z.literal('Sequential')]).describe(`
        * * Field Name: StackingMode
        * * Display Name: Stacking Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Sequential
    * * Value List Type: List
    * * Possible Values 
    *   * Additive
    *   * Sequential
        * * Description: Sequential (each promotion applies to the running total: ten percent then ten percent is nineteen) or Additive (percentages sum: twenty). Per company rather than per promotion, because the mode describes how a SET combines and two promotions disagreeing has no coherent answer. Sequential is the default because it discounts less, so a misconfiguration costs nothing.`),
    RefuseUnpricedLines: z.boolean().describe(`
        * * Field Name: RefuseUnpricedLines
        * * Display Name: Refuse Unpriced Lines
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When nothing prices a line and no UnitPrice was supplied, refuse it rather than booking zero. A silently-zero price is an invoice for nothing that looks deliberate.`),
    DefaultPriceListID: z.string().nullable().describe(`
        * * Field Name: DefaultPriceListID
        * * Display Name: Default Price List ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)
        * * Description: Fallback list for customers with no assignment of their own.`),
    DefaultPaymentTermsTypeID: z.string().nullable().describe(`
        * * Field Name: DefaultPaymentTermsTypeID
        * * Display Name: Default Payment Terms Type ID
        * * SQL Data Type: uniqueidentifier`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PricingDriverClass: z.string().nullable().describe(`
        * * Field Name: PricingDriverClass
        * * Display Name: Pricing Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of this company's house BasePriceResolver, or NULL. This is where every plugin registered before this column existed was keyed (Company:<id>), so it is the level that makes those visible to metadata.`),
    DefaultPriceList: z.string().nullable().describe(`
        * * Field Name: DefaultPriceList
        * * Display Name: Default Price List
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersOrderCompanyPolicyEntityType = z.infer<typeof mjBizAppsOrdersOrderCompanyPolicySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Headers
 */
export const mjBizAppsOrdersOrderHeaderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderNumber: z.string().describe(`
        * * Field Name: OrderNumber
        * * Display Name: Order Number
        * * SQL Data Type: nvarchar(40)
        * * Description: Human-readable order identifier. Unique.`),
    OrderType: z.union([z.literal('AccountCredit'), z.literal('Amendment'), z.literal('Cancellation'), z.literal('Return'), z.literal('Sale')]).describe(`
        * * Field Name: OrderType
        * * Display Name: Order Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Sale
    * * Value List Type: List
    * * Possible Values 
    *   * AccountCredit
    *   * Amendment
    *   * Cancellation
    *   * Return
    *   * Sale
        * * Description: Sale | Return | Cancellation | Amendment | AccountCredit. Non-Sale types are the correction/reversal document family (BO-D9/D15). AccountCredit is a DELIBERATELY ISSUED credit document; an ordinary Sale order can also carry a credit balance simply by being over-paid, and both are spendable through the Account Credit payment type (D68).`),
    OrderDate: z.date().describe(`
        * * Field Name: OrderDate
        * * Display Name: Order Date
        * * SQL Data Type: date
        * * Description: Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.`),
    Status: z.union([z.literal('Confirmed'), z.literal('Draft'), z.literal('Fulfilled'), z.literal('Posted'), z.literal('Quoted'), z.literal('Voided')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Confirmed
    *   * Draft
    *   * Fulfilled
    *   * Posted
    *   * Quoted
    *   * Voided
        * * Description: Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
        * * Description: The ORIGINATING/owning company (D6): document, visibility, and sales-attribution anchor (pairs with SalesRepUserID). NEVER used for GL resolution — revenue company is per line via the product's company. FK to __mj.Company.`),
    BillToPersonID: z.string().nullable().describe(`
        * * Field Name: BillToPersonID
        * * Display Name: Bill To Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    BillToOrganizationID: z.string().nullable().describe(`
        * * Field Name: BillToOrganizationID
        * * Display Name: Bill To Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the paying organization (D65). Nullable; a personal order names only a person.`),
    SalesRepUserID: z.string().nullable().describe(`
        * * Field Name: SalesRepUserID
        * * Display Name: Sales Rep
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    BillToAddressID: z.string().nullable().describe(`
        * * Field Name: BillToAddressID
        * * Display Name: Bill To Address
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
        * * Description: FK to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.`),
    ShipToAddressID: z.string().nullable().describe(`
        * * Field Name: ShipToAddressID
        * * Display Name: Ship To Address
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
        * * Description: FK to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.`),
    ShipToOrganizationID: z.string().nullable().describe(`
        * * Field Name: ShipToOrganizationID
        * * Display Name: Ship To Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    ShipToPersonID: z.string().nullable().describe(`
        * * Field Name: ShipToPersonID
        * * Display Name: Ship To Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    PaymentTermsTypeID: z.string().nullable().describe(`
        * * Field Name: PaymentTermsTypeID
        * * Display Name: Payment Terms
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Terms Types (vwPaymentTermsTypes.ID)`),
    TotalGross: z.number().nullable().describe(`
        * * Field Name: TotalGross
        * * Display Name: Total Gross
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-materialized order total = SUM(OrderLine.LineTotalGross). Never user-entered; frozen after Confirm.`),
    AmountPaid: z.number().describe(`
        * * Field Name: AmountPaid
        * * Display Name: Amount Paid
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Engine-materialized total cash applied to this order = SUM(posted PaymentLine.Amount). Never user-entered.`),
    Balance: z.number().nullable().describe(`
        * * Field Name: Balance
        * * Display Name: Balance
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-materialized open balance = TotalGross - AmountPaid. Negative means a credit memo owed to the customer.`),
    DueDate: z.date().nullable().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: date
        * * Description: Payment due date, derived at Confirm/Post from PaymentTermsType.NetDays (posting date + net days) when not manually supplied. Editable override.`),
    PaymentStatus: z.union([z.literal('Overdue'), z.literal('Paid'), z.literal('PartiallyPaid'), z.literal('Unpaid'), z.literal('WrittenOff')]).describe(`
        * * Field Name: PaymentStatus
        * * Display Name: Payment Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Unpaid
    * * Value List Type: List
    * * Possible Values 
    *   * Overdue
    *   * Paid
    *   * PartiallyPaid
    *   * Unpaid
    *   * WrittenOff
        * * Description: Unpaid | PartiallyPaid | Paid | Overdue | WrittenOff. Engine-derived from AmountPaid vs TotalGross; Overdue is time-derived in views/UI, WrittenOff is an explicit action.`),
    ExternalDocumentNumber: z.string().nullable().describe(`
        * * Field Name: ExternalDocumentNumber
        * * Display Name: External Document Number
        * * SQL Data Type: nvarchar(80)
        * * Description: External document/invoice number for downstream systems (e.g. bill.com sync, UPD-1). Free-form; may equal OrderNumber. Not unique pending the dual-numbering decision.`),
    InitialPaymentTypeID: z.string().nullable().describe(`
        * * Field Name: InitialPaymentTypeID
        * * Display Name: Initial Payment Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)`),
    InitialPaymentAmount: z.number().describe(`
        * * Field Name: InitialPaymentAmount
        * * Display Name: Initial Payment Amount
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0`),
    InitialPaymentDetailID: z.string().nullable().describe(`
        * * Field Name: InitialPaymentDetailID
        * * Display Name: Initial Payment Detail
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)`),
    PostedAt: z.date().nullable().describe(`
        * * Field Name: PostedAt
        * * Display Name: Posted At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp of the transition to Posted — the issue/tax-point date of the invoice.`),
    PostedByUserID: z.string().nullable().describe(`
        * * Field Name: PostedByUserID
        * * Display Name: Posted By
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    ReversesOrderHeaderID: z.string().nullable().describe(`
        * * Field Name: ReversesOrderHeaderID
        * * Display Name: Reverses Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    ReversalReason: z.string().nullable().describe(`
        * * Field Name: ReversalReason
        * * Display Name: Reversal Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason this order reverses another (required by validation when ReversesOrderHeaderID is set).`),
    RequestedDeliveryDate: z.date().nullable().describe(`
        * * Field Name: RequestedDeliveryDate
        * * Display Name: Requested Delivery Date
        * * SQL Data Type: date
        * * Description: Customer-requested delivery/service date. Informational.`),
    ApprovalTaskID: z.string().nullable().describe(`
        * * Field Name: ApprovalTaskID
        * * Display Name: Approval Task
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the __mj_BizAppsTasks Task raised when a sales rule blocked Confirm (BO-D17). Convenience pointer; Task Links carry the authoritative linkage.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional free-text description / memo for the order.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Internal notes on the order (Description is the customer-facing memo).`),
    ConfirmedAt: z.date().nullable().describe(`
        * * Field Name: ConfirmedAt
        * * Display Name: Confirmed At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp of the first transition to Confirmed.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    BillToPerson: z.string().nullable().describe(`
        * * Field Name: BillToPerson
        * * Display Name: Bill To Person Name
        * * SQL Data Type: nvarchar(100)`),
    BillToOrganization: z.string().nullable().describe(`
        * * Field Name: BillToOrganization
        * * Display Name: Bill To Organization Name
        * * SQL Data Type: nvarchar(255)`),
    SalesRepUser: z.string().nullable().describe(`
        * * Field Name: SalesRepUser
        * * Display Name: Sales Rep Name
        * * SQL Data Type: nvarchar(100)`),
    BillToAddress: z.string().nullable().describe(`
        * * Field Name: BillToAddress
        * * Display Name: Bill To Address Text
        * * SQL Data Type: nvarchar(255)`),
    ShipToAddress: z.string().nullable().describe(`
        * * Field Name: ShipToAddress
        * * Display Name: Ship To Address Text
        * * SQL Data Type: nvarchar(255)`),
    ShipToOrganization: z.string().nullable().describe(`
        * * Field Name: ShipToOrganization
        * * Display Name: Ship To Organization Name
        * * SQL Data Type: nvarchar(255)`),
    ShipToPerson: z.string().nullable().describe(`
        * * Field Name: ShipToPerson
        * * Display Name: Ship To Person Name
        * * SQL Data Type: nvarchar(100)`),
    PaymentTermsType: z.string().nullable().describe(`
        * * Field Name: PaymentTermsType
        * * Display Name: Payment Terms Name
        * * SQL Data Type: nvarchar(200)`),
    InitialPaymentType: z.string().nullable().describe(`
        * * Field Name: InitialPaymentType
        * * Display Name: Initial Payment Type Name
        * * SQL Data Type: nvarchar(200)`),
    InitialPaymentDetail: z.string().nullable().describe(`
        * * Field Name: InitialPaymentDetail
        * * Display Name: Initial Payment Detail Info
        * * SQL Data Type: char(4)`),
    PostedByUser: z.string().nullable().describe(`
        * * Field Name: PostedByUser
        * * Display Name: Posted By User
        * * SQL Data Type: nvarchar(100)`),
    ReversesOrderHeader: z.string().nullable().describe(`
        * * Field Name: ReversesOrderHeader
        * * Display Name: Reverses Order Header
        * * SQL Data Type: nvarchar(40)`),
    __mj_Latitude: z.number().nullable().describe(`
        * * Field Name: __mj_Latitude
        * * Display Name: Latitude
        * * SQL Data Type: decimal(10, 6)`),
    __mj_Longitude: z.number().nullable().describe(`
        * * Field Name: __mj_Longitude
        * * Display Name: Longitude
        * * SQL Data Type: decimal(10, 6)`),
    RootReversesOrderHeaderID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderHeaderID
        * * Display Name: Root Reverses Order
        * * SQL Data Type: uniqueidentifier`),
    IsOverdue: z.number().describe(`
        * * Field Name: IsOverdue
        * * Display Name: Is Overdue
        * * SQL Data Type: int`),
});

export type mjBizAppsOrdersOrderHeaderEntityType = z.infer<typeof mjBizAppsOrdersOrderHeaderSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Line Dimensions
 */
export const mjBizAppsOrdersOrderLineDimensionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    DimensionID: z.string().describe(`
        * * Field Name: DimensionID
        * * Display Name: Dimension
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Dimensions (vwDimensions.ID)
        * * Description: FK to __mj_BizAppsAccounting.Dimension.`),
    DimensionValueID: z.string().describe(`
        * * Field Name: DimensionValueID
        * * Display Name: Dimension Value
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Dimension Values (vwDimensionValues.ID)
        * * Description: FK to __mj_BizAppsAccounting.DimensionValue.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Dimension: z.string().describe(`
        * * Field Name: Dimension
        * * Display Name: Dimension Name
        * * SQL Data Type: nvarchar(100)`),
    DimensionValue: z.string().describe(`
        * * Field Name: DimensionValue
        * * Display Name: Dimension Value Name
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersOrderLineDimensionEntityType = z.infer<typeof mjBizAppsOrdersOrderLineDimensionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Line Price Components
 */
export const mjBizAppsOrdersOrderLinePriceComponentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int`),
    ComponentType: z.union([z.literal('Adjustment'), z.literal('Base'), z.literal('Charge'), z.literal('Rule'), z.literal('Tax')]).describe(`
        * * Field Name: ComponentType
        * * Display Name: Component Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Adjustment
    *   * Base
    *   * Charge
    *   * Rule
    *   * Tax
        * * Description: Base | Rule | Adjustment | Charge | Tax - which pipeline stage produced this component.`),
    Label: z.string().describe(`
        * * Field Name: Label
        * * Display Name: Label
        * * SQL Data Type: nvarchar(200)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: SIGNED: negative for a discount, positive for a charge.`),
    RunningTotal: z.number().describe(`
        * * Field Name: RunningTotal
        * * Display Name: Running Total
        * * SQL Data Type: decimal(19, 4)
        * * Description: The line total after this component, so the decomposition reads top to bottom.`),
    SourceEntityID: z.string().nullable().describe(`
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
        * * Description: The MJ Entity of whatever produced this component. Set together with SourceRecordID, or neither.`),
    SourceRecordID: z.string().nullable().describe(`
        * * Field Name: SourceRecordID
        * * Display Name: Source Record ID
        * * SQL Data Type: nvarchar(400)
        * * Description: Primary key of the producing record, as text. A soft reference by nature - it points at whichever table the stage used.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    SourceEntity: z.string().nullable().describe(`
        * * Field Name: SourceEntity
        * * Display Name: Source Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsOrdersOrderLinePriceComponentEntityType = z.infer<typeof mjBizAppsOrdersOrderLinePriceComponentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Lines
 */
export const mjBizAppsOrdersOrderLineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderHeaderID: z.string().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order Header
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
        * * Description: Denormalized stamp of the product's company at line save (D6): perf/reporting + temporal integrity — records who owned the product at transaction time. Derived from Product.CompanyID, never authored. FK to __mj.Company.`),
    LineNumber: z.number().describe(`
        * * Field Name: LineNumber
        * * Display Name: Line Number
        * * SQL Data Type: int
        * * Description: Order-scoped line sequence (1..n), unique within the order.`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Quantity ordered (> 0).`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(19, 4)
        * * Description: Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.`),
    ProductPriceID: z.string().nullable().describe(`
        * * Field Name: ProductPriceID
        * * Display Name: Product Price Rule
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Prices (vwProductPrices.ID)
        * * Description: Which price RULE produced UnitPrice. UnitPrice still stamps; this records why, so a disputed invoice can be traced back to the rule that priced it. NULL when the caller supplied the price directly, which remains valid.`),
    DiscountPct: z.number().describe(`
        * * Field Name: DiscountPct
        * * Display Name: Discount Percentage
        * * SQL Data Type: decimal(7, 4)
        * * Default Value: 0
        * * Description: Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).`),
    DiscountAmount: z.number().describe(`
        * * Field Name: DiscountAmount
        * * Display Name: Discount Amount
        * * SQL Data Type: decimal(19, 4)
        * * Default Value: 0
        * * Description: Absolute discount on this line, in currency. Separate from DiscountPct because a percentage cannot express an ALLOCATED share exactly - a 50.00 order-level promotion split across a 333.33 line is 0.15000015 as a fraction, and DiscountPct's 4dp scale would round it into a total that no longer sums to the promotion. Promotions and manual discounts land here; DiscountPct stays for a negotiated percentage concession, and a line may carry both.`),
    LineTotalNet: z.number().nullable().describe(`
        * * Field Name: LineTotalNet
        * * Display Name: Line Total Net
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-computed stored net line total = (Quantity * UnitPrice * (1 - DiscountPct)) - DiscountAmount, floored at zero. Frozen after Confirm.`),
    ChargeAmount: z.number().describe(`
        * * Field Name: ChargeAmount
        * * Display Name: Charge Amount
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Non-tax charges allocated to this line - shipping, handling, surcharges (D71). Tax keeps its own LineTax column because tax is reported, remitted and audited separately everywhere, even though both are charges to the engine that computes them.`),
    LineTax: z.number().describe(`
        * * Field Name: LineTax
        * * Display Name: Line Tax
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Tax amount for this line. 0 until the tax subsystem lands (O4).`),
    LineTotalGross: z.number().nullable().describe(`
        * * Field Name: LineTotalGross
        * * Display Name: Line Total Gross
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-computed stored gross line total = LineTotalNet + LineTax + ChargeAmount. Frozen after Confirm.`),
    ShipToAddressID: z.string().nullable().describe(`
        * * Field Name: ShipToAddressID
        * * Display Name: Ship To Address
        * * SQL Data Type: uniqueidentifier`),
    ShipToOrganizationID: z.string().nullable().describe(`
        * * Field Name: ShipToOrganizationID
        * * Display Name: Ship To Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    ShipToPersonID: z.string().nullable().describe(`
        * * Field Name: ShipToPersonID
        * * Display Name: Ship To Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    RenewsSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RenewsSubscriptionID
        * * Display Name: Renews Subscription
        * * SQL Data Type: uniqueidentifier`),
    ServicePeriodStart: z.date().nullable().describe(`
        * * Field Name: ServicePeriodStart
        * * Display Name: Service Period Start
        * * SQL Data Type: date
        * * Description: Start of the service period for Deferred products (UPD-2 service-period recognition shape). Nullable.`),
    ServicePeriodEnd: z.date().nullable().describe(`
        * * Field Name: ServicePeriodEnd
        * * Display Name: Service Period End
        * * SQL Data Type: date
        * * Description: End of the service period for Deferred products (>= ServicePeriodStart). Nullable.`),
    FulfillmentStatus: z.union([z.literal('Fulfilled'), z.literal('Pending'), z.literal('Returned')]).nullable().describe(`
        * * Field Name: FulfillmentStatus
        * * Display Name: Fulfillment Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Fulfilled
    *   * Pending
    *   * Returned
        * * Description: Pending | Fulfilled | Returned. NULL when the product type does not require fulfillment. The one line column a Fulfiller may change on Confirmed+ orders (trigger carve-out).`),
    ReversesOrderLineID: z.string().nullable().describe(`
        * * Field Name: ReversesOrderLineID
        * * Display Name: Reverses Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    SourceBundleProductID: z.string().nullable().describe(`
        * * Field Name: SourceBundleProductID
        * * Display Name: Source Bundle Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    ParentOrderLineID: z.string().nullable().describe(`
        * * Field Name: ParentOrderLineID
        * * Display Name: Parent Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
        * * Description: The bundle line this component was expanded from (D45). NULL on ordinary lines. Distinct from SourceBundleProductID, which names the bundle PRODUCT and therefore cannot tell two instances of the same bundle apart on one order. One level only: a component may not itself be a parent.`),
    IsRollupParent: z.boolean().describe(`
        * * Field Name: IsRollupParent
        * * Display Name: Is Rollup Parent
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: TRUE on an expanded bundle's parent line. The parent is customer-facing and contributes ZERO to every rollup - subtotal, tax base, charge base, discount base, GL - because the bundle price is allocated down to its children. Set by the expansion path, never authored.`),
    IsQuantityOverridden: z.boolean().describe(`
        * * Field Name: IsQuantityOverridden
        * * Display Name: Is Quantity Overridden
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: TRUE when a child's quantity was hand-edited, detaching it from the parent quantity ripple. Without it, bumping the bundle quantity would silently overwrite a deliberate correction.`),
    SubscriptionID: z.string().nullable().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Optional free-text description for the line.`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Journal Entries (vwJournalEntries.ID)
        * * Description: FK to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order's journal entry is the aggregate of its lines' JEs.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    OrderHeader: z.string().describe(`
        * * Field Name: OrderHeader
        * * Display Name: Order Header Name
        * * SQL Data Type: nvarchar(40)`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product Name
        * * SQL Data Type: nvarchar(200)`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    ShipToOrganization: z.string().nullable().describe(`
        * * Field Name: ShipToOrganization
        * * Display Name: Ship To Organization Name
        * * SQL Data Type: nvarchar(255)`),
    ShipToPerson: z.string().nullable().describe(`
        * * Field Name: ShipToPerson
        * * Display Name: Ship To Person Name
        * * SQL Data Type: nvarchar(100)`),
    SourceBundleProduct: z.string().nullable().describe(`
        * * Field Name: SourceBundleProduct
        * * Display Name: Source Bundle Product Name
        * * SQL Data Type: nvarchar(200)`),
    Subscription: z.string().nullable().describe(`
        * * Field Name: Subscription
        * * Display Name: Subscription Name
        * * SQL Data Type: nvarchar(40)`),
    JournalEntry: z.string().nullable().describe(`
        * * Field Name: JournalEntry
        * * Display Name: Journal Entry Name
        * * SQL Data Type: nvarchar(40)`),
    __mj_Latitude: z.number().nullable().describe(`
        * * Field Name: __mj_Latitude
        * * Display Name: Latitude
        * * SQL Data Type: decimal(10, 6)`),
    __mj_Longitude: z.number().nullable().describe(`
        * * Field Name: __mj_Longitude
        * * Display Name: Longitude
        * * SQL Data Type: decimal(10, 6)`),
    RootReversesOrderLineID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderLineID
        * * Display Name: Root Reverses Order Line
        * * SQL Data Type: uniqueidentifier`),
    RootParentOrderLineID: z.string().nullable().describe(`
        * * Field Name: RootParentOrderLineID
        * * Display Name: Root Parent Order Line
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersOrderLineEntityType = z.infer<typeof mjBizAppsOrdersOrderLineSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Sequences
 */
export const mjBizAppsOrdersOrderSequenceSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int
        * * Default Value: 1`),
    NextSequenceNumber: z.number().describe(`
        * * Field Name: NextSequenceNumber
        * * Display Name: Next Sequence Number
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: The next order sequence number to assign.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersOrderSequenceEntityType = z.infer<typeof mjBizAppsOrdersOrderSequenceSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Details
 */
export const mjBizAppsOrdersPaymentDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    PaymentTypeID: z.string().describe(`
        * * Field Name: PaymentTypeID
        * * Display Name: Payment Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)`),
    PaymentProviderID: z.string().nullable().describe(`
        * * Field Name: PaymentProviderID
        * * Display Name: Payment Provider
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    SourceCustomerPaymentMethodID: z.string().nullable().describe(`
        * * Field Name: SourceCustomerPaymentMethodID
        * * Display Name: Customer Payment Method
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Customer Payment Methods (vwCustomerPaymentMethods.ID)`),
    ProviderCustomerRef: z.string().nullable().describe(`
        * * Field Name: ProviderCustomerRef
        * * Display Name: Provider Customer Reference
        * * SQL Data Type: nvarchar(100)`),
    ProviderInstrumentRef: z.string().nullable().describe(`
        * * Field Name: ProviderInstrumentRef
        * * Display Name: Provider Instrument Reference
        * * SQL Data Type: nvarchar(100)`),
    Brand: z.string().nullable().describe(`
        * * Field Name: Brand
        * * Display Name: Brand
        * * SQL Data Type: nvarchar(40)`),
    Last4: z.string().nullable().describe(`
        * * Field Name: Last4
        * * Display Name: Last 4 Digits
        * * SQL Data Type: char(4)`),
    ExpiryMonth: z.number().nullable().describe(`
        * * Field Name: ExpiryMonth
        * * Display Name: Expiry Month
        * * SQL Data Type: int`),
    ExpiryYear: z.number().nullable().describe(`
        * * Field Name: ExpiryYear
        * * Display Name: Expiry Year
        * * SQL Data Type: int`),
    HolderName: z.string().nullable().describe(`
        * * Field Name: HolderName
        * * Display Name: Cardholder Name
        * * SQL Data Type: nvarchar(200)`),
    BankName: z.string().nullable().describe(`
        * * Field Name: BankName
        * * Display Name: Bank Name
        * * SQL Data Type: nvarchar(200)`),
    RoutingLast4: z.string().nullable().describe(`
        * * Field Name: RoutingLast4
        * * Display Name: Routing Last 4
        * * SQL Data Type: char(4)`),
    AccountLast4: z.string().nullable().describe(`
        * * Field Name: AccountLast4
        * * Display Name: Account Last 4
        * * SQL Data Type: char(4)`),
    BankAccountType: z.union([z.literal('Checking'), z.literal('Savings')]).nullable().describe(`
        * * Field Name: BankAccountType
        * * Display Name: Bank Account Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Checking
    *   * Savings`),
    ReferenceNumber: z.string().nullable().describe(`
        * * Field Name: ReferenceNumber
        * * Display Name: Reference Number
        * * SQL Data Type: nvarchar(100)`),
    InstrumentDate: z.date().nullable().describe(`
        * * Field Name: InstrumentDate
        * * Display Name: Instrument Date
        * * SQL Data Type: date`),
    StoredValueAccountID: z.string().nullable().describe(`
        * * Field Name: StoredValueAccountID
        * * Display Name: Stored Value Account
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)`),
    SourceOrderHeaderID: z.string().nullable().describe(`
        * * Field Name: SourceOrderHeaderID
        * * Display Name: Source Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
        * * Description: ACCOUNT CREDIT tender (D68): the order whose NEGATIVE balance this payment draws down. A customer credit is not its own instrument the way a gift card is — it already lives on the over-paid order — so this points at that order rather than duplicating the balance onto a second record. NULL for every other tender type.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    PaymentType: z.string().describe(`
        * * Field Name: PaymentType
        * * Display Name: Payment Type Name
        * * SQL Data Type: nvarchar(200)`),
    PaymentProvider: z.string().nullable().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider Name
        * * SQL Data Type: nvarchar(200)`),
    SourceCustomerPaymentMethod: z.string().nullable().describe(`
        * * Field Name: SourceCustomerPaymentMethod
        * * Display Name: Payment Method Name
        * * SQL Data Type: nvarchar(100)`),
    StoredValueAccount: z.string().nullable().describe(`
        * * Field Name: StoredValueAccount
        * * Display Name: Stored Value Account Name
        * * SQL Data Type: nvarchar(60)`),
    SourceOrderHeader: z.string().nullable().describe(`
        * * Field Name: SourceOrderHeader
        * * Display Name: Source Order Name
        * * SQL Data Type: nvarchar(40)`),
});

export type mjBizAppsOrdersPaymentDetailEntityType = z.infer<typeof mjBizAppsOrdersPaymentDetailSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Headers
 */
export const mjBizAppsOrdersPaymentHeaderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PaymentNumber: z.string().describe(`
        * * Field Name: PaymentNumber
        * * Display Name: Payment Number
        * * SQL Data Type: nvarchar(40)
        * * Description: Human-readable payment identifier (PAY-{seq}). Unique.`),
    ReceivingCompanyID: z.string().describe(`
        * * Field Name: ReceivingCompanyID
        * * Display Name: Receiving Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    BillToPersonID: z.string().nullable().describe(`
        * * Field Name: BillToPersonID
        * * Display Name: Bill To Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    BillToOrganizationID: z.string().nullable().describe(`
        * * Field Name: BillToOrganizationID
        * * Display Name: Bill To Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the paying organization (D65).`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: date
        * * Description: Date the money moved (bank date, not entry date).`),
    PaymentTypeID: z.string().describe(`
        * * Field Name: PaymentTypeID
        * * Display Name: Payment Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Gross amount received (negative for reversal methods).`),
    ProcessingFeeAmount: z.number().describe(`
        * * Field Name: ProcessingFeeAmount
        * * Display Name: Processing Fee Amount
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Processor fee withheld from this payment.`),
    NetAmount: z.number().nullable().describe(`
        * * Field Name: NetAmount
        * * Display Name: Net Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Net cash = Amount - ProcessingFeeAmount (engine-computed, BO-D47).`),
    PaymentProviderID: z.string().nullable().describe(`
        * * Field Name: PaymentProviderID
        * * Display Name: Payment Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    PaymentIntentID: z.string().nullable().describe(`
        * * Field Name: PaymentIntentID
        * * Display Name: Payment Intent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Intents (vwPaymentIntents.ID)`),
    PaymentDetailID: z.string().nullable().describe(`
        * * Field Name: PaymentDetailID
        * * Display Name: Payment Detail ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)`),
    ProviderChargeID: z.string().nullable().describe(`
        * * Field Name: ProviderChargeID
        * * Display Name: Provider Charge ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side charge identifier (e.g. Stripe ch_...).`),
    ProviderRefundID: z.string().nullable().describe(`
        * * Field Name: ProviderRefundID
        * * Display Name: Provider Refund ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side refund identifier when this payment is a provider refund.`),
    ReversesPaymentHeaderID: z.string().nullable().describe(`
        * * Field Name: ReversesPaymentHeaderID
        * * Display Name: Reverses Payment Header ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)`),
    ReversalReason: z.string().nullable().describe(`
        * * Field Name: ReversalReason
        * * Display Name: Reversal Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason this payment reverses another (required by validation when ReversesPaymentHeaderID is set).`),
    Status: z.union([z.literal('Captured'), z.literal('Disputed'), z.literal('Failed'), z.literal('Pending'), z.literal('Refunded')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Captured
    *   * Disputed
    *   * Failed
    *   * Pending
    *   * Refunded
        * * Description: Pending | Captured | Failed | Refunded | Disputed. Financial fields freeze at Captured (DB trigger); corrections via reversal payments.`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Journal Entries (vwJournalEntries.ID)
        * * Description: FK to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Customer-facing description / memo.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Internal notes.`),
    IdempotencyKey: z.string().nullable().describe(`
        * * Field Name: IdempotencyKey
        * * Display Name: Idempotency Key
        * * SQL Data Type: nvarchar(200)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ReceivingCompany: z.string().describe(`
        * * Field Name: ReceivingCompany
        * * Display Name: Receiving Company
        * * SQL Data Type: nvarchar(50)`),
    BillToPerson: z.string().nullable().describe(`
        * * Field Name: BillToPerson
        * * Display Name: Bill To Person
        * * SQL Data Type: nvarchar(100)`),
    BillToOrganization: z.string().nullable().describe(`
        * * Field Name: BillToOrganization
        * * Display Name: Bill To Organization
        * * SQL Data Type: nvarchar(255)`),
    PaymentType: z.string().describe(`
        * * Field Name: PaymentType
        * * Display Name: Payment Type
        * * SQL Data Type: nvarchar(200)`),
    PaymentProvider: z.string().nullable().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider
        * * SQL Data Type: nvarchar(200)`),
    PaymentIntent: z.string().nullable().describe(`
        * * Field Name: PaymentIntent
        * * Display Name: Payment Intent
        * * SQL Data Type: nvarchar(100)`),
    PaymentDetail: z.string().nullable().describe(`
        * * Field Name: PaymentDetail
        * * Display Name: Payment Detail
        * * SQL Data Type: char(4)`),
    ReversesPaymentHeader: z.string().nullable().describe(`
        * * Field Name: ReversesPaymentHeader
        * * Display Name: Reverses Payment Header
        * * SQL Data Type: nvarchar(40)`),
    JournalEntry: z.string().nullable().describe(`
        * * Field Name: JournalEntry
        * * Display Name: Journal Entry
        * * SQL Data Type: nvarchar(40)`),
    RootReversesPaymentHeaderID: z.string().nullable().describe(`
        * * Field Name: RootReversesPaymentHeaderID
        * * Display Name: Root Reverses Payment Header ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersPaymentHeaderEntityType = z.infer<typeof mjBizAppsOrdersPaymentHeaderSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Intents
 */
export const mjBizAppsOrdersPaymentIntentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PaymentProviderID: z.string().describe(`
        * * Field Name: PaymentProviderID
        * * Display Name: Payment Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    ProviderIntentID: z.string().describe(`
        * * Field Name: ProviderIntentID
        * * Display Name: Provider Intent ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side intent identifier (e.g. Stripe pi_...). Unique.`),
    Status: z.union([z.literal('Canceled'), z.literal('Failed'), z.literal('Processing'), z.literal('RequiresPayment'), z.literal('Succeeded')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Failed
    *   * Processing
    *   * RequiresPayment
    *   * Succeeded
        * * Description: RequiresPayment | Processing | Succeeded | Canceled | Failed. Mirrors the provider lifecycle.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Amount being collected.`),
    OrderHeaderID: z.string().nullable().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    BillToPersonID: z.string().nullable().describe(`
        * * Field Name: BillToPersonID
        * * Display Name: Bill To Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    BillToOrganizationID: z.string().nullable().describe(`
        * * Field Name: BillToOrganizationID
        * * Display Name: Bill To Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the organization being collected from (D65).`),
    ProviderEventID: z.string().nullable().describe(`
        * * Field Name: ProviderEventID
        * * Display Name: Provider Event ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Last processed provider webhook event id — the idempotency key (unique when present).`),
    LastEventAt: z.date().nullable().describe(`
        * * Field Name: LastEventAt
        * * Display Name: Last Event At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp of the last provider event applied to this intent.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PaymentProvider: z.string().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider
        * * SQL Data Type: nvarchar(200)`),
    OrderHeader: z.string().nullable().describe(`
        * * Field Name: OrderHeader
        * * Display Name: Order Header
        * * SQL Data Type: nvarchar(40)`),
    BillToPerson: z.string().nullable().describe(`
        * * Field Name: BillToPerson
        * * Display Name: Bill To Person Name
        * * SQL Data Type: nvarchar(100)`),
    BillToOrganization: z.string().nullable().describe(`
        * * Field Name: BillToOrganization
        * * Display Name: Bill To Organization Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsOrdersPaymentIntentEntityType = z.infer<typeof mjBizAppsOrdersPaymentIntentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Lines
 */
export const mjBizAppsOrdersPaymentLineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PaymentHeaderID: z.string().describe(`
        * * Field Name: PaymentHeaderID
        * * Display Name: Payment Header
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)`),
    OrderHeaderID: z.string().describe(`
        * * Field Name: OrderHeaderID
        * * Display Name: Order Header
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    OrderLineID: z.string().nullable().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Amount of the payment applied to this order (<> 0; negative when applying a credit memo).`),
    AllocatedAt: z.date().describe(`
        * * Field Name: AllocatedAt
        * * Display Name: Allocated At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp when this application was made.`),
    AllocatedByUserID: z.string().nullable().describe(`
        * * Field Name: AllocatedByUserID
        * * Display Name: Allocated By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    BookedAt: z.date().nullable().describe(`
        * * Field Name: BookedAt
        * * Display Name: Booked At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp when this allocation's journal entries were written; NULL until booked. Not a JournalEntryID: one payment line produces one entry PER COMPANY owning a line on the order it settles, so there is no single entry to point at — the entries are found via accounting's provenance pair (LinkedEntityID = Payment Lines, LinkedRecordID = this row). Idempotency key: checked before booking so a re-save never doubles the cash leg.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PaymentHeader: z.string().describe(`
        * * Field Name: PaymentHeader
        * * Display Name: Payment Header Name
        * * SQL Data Type: nvarchar(40)`),
    OrderHeader: z.string().describe(`
        * * Field Name: OrderHeader
        * * Display Name: Order Header Name
        * * SQL Data Type: nvarchar(40)`),
    AllocatedByUser: z.string().nullable().describe(`
        * * Field Name: AllocatedByUser
        * * Display Name: Allocated By User
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersPaymentLineEntityType = z.infer<typeof mjBizAppsOrdersPaymentLineSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Provider Types
 */
export const mjBizAppsOrdersPaymentProviderTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DriverClass: z.string().nullable().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(200)`),
    SupportsTokenization: z.boolean().describe(`
        * * Field Name: SupportsTokenization
        * * Display Name: Supports Tokenization
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SupportsRefund: z.boolean().describe(`
        * * Field Name: SupportsRefund
        * * Display Name: Supports Refund
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SupportsWebhooks: z.boolean().describe(`
        * * Field Name: SupportsWebhooks
        * * Display Name: Supports Webhooks
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPaymentProviderTypeEntityType = z.infer<typeof mjBizAppsOrdersPaymentProviderTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Providers
 */
export const mjBizAppsOrdersPaymentProviderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PaymentProviderTypeID: z.string().describe(`
        * * Field Name: PaymentProviderTypeID
        * * Display Name: Payment Provider Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Provider Types (vwPaymentProviderTypes.ID)`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of this provider account.`),
    CredentialsRef: z.string().nullable().describe(`
        * * Field Name: CredentialsRef
        * * Display Name: Credentials Reference
        * * SQL Data Type: nvarchar(200)
        * * Description: MJ Credentials engine key referencing the provider credentials. NEVER a secret value at rest.`),
    IsLiveMode: z.boolean().describe(`
        * * Field Name: IsLiveMode
        * * Display Name: Is Live Mode
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this account points at the provider's live environment (vs test/sandbox).`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this provider account is active.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PaymentProviderType: z.string().describe(`
        * * Field Name: PaymentProviderType
        * * Display Name: Provider Type
        * * SQL Data Type: nvarchar(200)`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(50)`),
});

export type mjBizAppsOrdersPaymentProviderEntityType = z.infer<typeof mjBizAppsOrdersPaymentProviderSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Sequences
 */
export const mjBizAppsOrdersPaymentSequenceSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int
        * * Default Value: 1`),
    NextSequenceNumber: z.number().describe(`
        * * Field Name: NextSequenceNumber
        * * Display Name: Next Sequence Number
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: The next payment sequence number to assign.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPaymentSequenceEntityType = z.infer<typeof mjBizAppsOrdersPaymentSequenceSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Terms Types
 */
export const mjBizAppsOrdersPaymentTermsTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Stable machine code (Net30, DueOnReceipt, Prepaid, ...). Unique.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the payment terms.`),
    NetDays: z.number().describe(`
        * * Field Name: NetDays
        * * Display Name: Net Days
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Days from the posting date to DueDate (0 = due on receipt).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the terms.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether these terms are active and selectable.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPaymentTermsTypeEntityType = z.infer<typeof mjBizAppsOrdersPaymentTermsTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Types
 */
export const mjBizAppsOrdersPaymentTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsReversal: z.boolean().describe(`
        * * Field Name: IsReversal
        * * Display Name: Is Reversal
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequiresProvider: z.boolean().describe(`
        * * Field Name: RequiresProvider
        * * Display Name: Requires Provider
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequiresInstrument: z.boolean().describe(`
        * * Field Name: RequiresInstrument
        * * Display Name: Requires Instrument
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequiresReference: z.boolean().describe(`
        * * Field Name: RequiresReference
        * * Display Name: Requires Reference
        * * SQL Data Type: bit
        * * Default Value: 0`),
    DetailExtensionEntity: z.string().nullable().describe(`
        * * Field Name: DetailExtensionEntity
        * * Display Name: Detail Extension Entity
        * * SQL Data Type: nvarchar(255)`),
    BookProcessingFeeInline: z.boolean().describe(`
        * * Field Name: BookProcessingFeeInline
        * * Display Name: Book Processing Fee Inline
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When 1, a capture with a processor fee books it as its own journal entry (Dr Processing Fee / Cr Cash). DEFAULT 0: a per-payment fee leg cannot reconcile to a bank statement, because the processor batches into payouts and deducts costs that never attach to any payment - a failed-debit charge, a dispute fee, a monthly platform charge - so the whole processor cost is accrued in the accounting system at month end instead (D82). The fee is still READ from the gateway and still stored on PaymentHeader.ProcessingFeeAmount and NetAmount regardless; this flag decides only whether it becomes a ledger entry. Turn it on only for a tender whose per-payment fee attribution is genuinely needed, and expect to reconcile the difference.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPaymentTypeEntityType = z.infer<typeof mjBizAppsOrdersPaymentTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Price List Assignments
 */
export const mjBizAppsOrdersPriceListAssignmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PriceListID: z.string().describe(`
        * * Field Name: PriceListID
        * * Display Name: Price List ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    Priority: z.number().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Breaks the tie when a person's own assignment and their organization's both apply. Higher wins.`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset`),
    EndedAt: z.date().nullable().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetimeoffset`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive`),
    Comments: z.string().nullable().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PriceList: z.string().describe(`
        * * Field Name: PriceList
        * * Display Name: Price List
        * * SQL Data Type: nvarchar(200)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Person: z.string().nullable().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersPriceListAssignmentEntityType = z.infer<typeof mjBizAppsOrdersPriceListAssignmentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Price Lists
 */
export const mjBizAppsOrdersPriceListSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Stable machine code. Unique.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    EffectiveFrom: z.date().nullable().describe(`
        * * Field Name: EffectiveFrom
        * * Display Name: Effective From
        * * SQL Data Type: date
        * * Description: List validity start.`),
    EffectiveTo: z.date().nullable().describe(`
        * * Field Name: EffectiveTo
        * * Display Name: Effective To
        * * SQL Data Type: date
        * * Description: List validity end.`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Active | Inactive. Deliberately NO CompanyID on this table: every price in a list points at a Product that already carries its company, so a column here would only be an administrative guardrail - and it would force a group-wide member rate to be duplicated per company.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPriceListEntityType = z.infer<typeof mjBizAppsOrdersPriceListSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Price Tiers
 */
export const mjBizAppsOrdersPriceTierSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProductPriceID: z.string().describe(`
        * * Field Name: ProductPriceID
        * * Display Name: Product Price
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Prices (vwProductPrices.ID)`),
    MinQuantity: z.number().describe(`
        * * Field Name: MinQuantity
        * * Display Name: Minimum Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Tier lower bound (inclusive).`),
    MaxQuantity: z.number().nullable().describe(`
        * * Field Name: MaxQuantity
        * * Display Name: Maximum Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Tier upper bound. NULL = unbounded top tier.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: Per-unit (or flat) price within this tier.`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order of tiers.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPriceTierEntityType = z.infer<typeof mjBizAppsOrdersPriceTierSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Bundle Items
 */
export const mjBizAppsOrdersProductBundleItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BundleProductID: z.string().describe(`
        * * Field Name: BundleProductID
        * * Display Name: Bundle Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    ComponentProductID: z.string().describe(`
        * * Field Name: ComponentProductID
        * * Display Name: Component Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Default Value: 1
        * * Description: Quantity of the component per one bundle.`),
    PricingMode: z.union([z.literal('Bundled'), z.literal('SumOfParts')]).describe(`
        * * Field Name: PricingMode
        * * Display Name: Pricing Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Bundled
    * * Value List Type: List
    * * Possible Values 
    *   * Bundled
    *   * SumOfParts
        * * Description: Bundled (fixed bundle price, SSP-allocated) | SumOfParts (components price individually).`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order of components within the bundle.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    BundleProduct: z.string().describe(`
        * * Field Name: BundleProduct
        * * Display Name: Bundle Product
        * * SQL Data Type: nvarchar(200)`),
    ComponentProduct: z.string().describe(`
        * * Field Name: ComponentProduct
        * * Display Name: Component Product
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersProductBundleItemEntityType = z.infer<typeof mjBizAppsOrdersProductBundleItemSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Categories
 */
export const mjBizAppsOrdersProductCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
        * * Description: The company that owns this category tree (D7). No shared/global categories. FK to __mj.Company.`),
    Code: z.string().nullable().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Stable machine code for the category. Unique when present.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the category.`),
    ParentProductCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentProductCategoryID
        * * Display Name: Parent Category
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the category.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this category is active and selectable.`),
    DefaultIsTaxable: z.boolean().nullable().describe(`
        * * Field Name: DefaultIsTaxable
        * * Display Name: Default Is Taxable
        * * SQL Data Type: bit
        * * Description: Default taxability for products in this category (D73). NULL means the walk continues to this category's PARENT, then upward to the root, and only then to the product type. Taxability resolves product -> category -> ancestors -> type, most specific wins - the same walk GL accounts use.`),
    DefaultTaxCategory: z.string().nullable().describe(`
        * * Field Name: DefaultTaxCategory
        * * Display Name: Default Tax Category
        * * SQL Data Type: nvarchar(50)
        * * Description: Default taxability key for products in this category, matched against accounting's TaxRate.TaxCategory. NULL means the walk continues up the category tree and then to the product type.`),
    DefaultEntitlementGrantTiming: z.union([z.literal('OnActivation'), z.literal('OnConfirm'), z.literal('OnPaidInFull')]).nullable().describe(`
        * * Field Name: DefaultEntitlementGrantTiming
        * * Display Name: Default Grant Timing
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull`),
    DefaultEntitlementQuantityMode: z.union([z.literal('Flat'), z.literal('PerUnit')]).nullable().describe(`
        * * Field Name: DefaultEntitlementQuantityMode
        * * Display Name: Default Quantity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit`),
    DefaultEntitlementValidityMode: z.union([z.literal('EventWindow'), z.literal('FixedDuration'), z.literal('Perpetual'), z.literal('SubscriptionTerm')]).nullable().describe(`
        * * Field Name: DefaultEntitlementValidityMode
        * * Display Name: Default Validity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PricingDriverClass: z.string().nullable().describe(`
        * * Field Name: PricingDriverClass
        * * Display Name: Pricing Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of a BasePriceResolver subclass for every product in this category (and, unless overridden, its child categories), or NULL. See Product.PricingDriverClass for the resolution order.`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    ParentProductCategory: z.string().nullable().describe(`
        * * Field Name: ParentProductCategory
        * * Display Name: Parent Category Name
        * * SQL Data Type: nvarchar(200)`),
    RootParentProductCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentProductCategoryID
        * * Display Name: Root Category
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersProductCategoryEntityType = z.infer<typeof mjBizAppsOrdersProductCategorySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Entitlements
 */
export const mjBizAppsOrdersProductEntitlementSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    EntitlementType: z.union([z.literal('AccessLevel'), z.literal('Custom'), z.literal('Feature'), z.literal('ResourceQuantity')]).describe(`
        * * Field Name: EntitlementType
        * * Display Name: Entitlement Type
        * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * AccessLevel
    *   * Custom
    *   * Feature
    *   * ResourceQuantity
        * * Description: Feature | AccessLevel | ResourceQuantity | Custom.`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Entitlement Code
        * * SQL Data Type: nvarchar(80)
        * * Description: Machine key consumed by downstream apps (unique per product).`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the entitlement.`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Granted quantity for ResourceQuantity entitlements (e.g. 100 GB, 5 seats).`),
    UnitOfMeasure: z.string().nullable().describe(`
        * * Field Name: UnitOfMeasure
        * * Display Name: Unit of Measure
        * * SQL Data Type: nvarchar(40)
        * * Description: Unit for Quantity (GB, seats, hours, ...).`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this entitlement is currently granted by new purchases.`),
    ValidityMode: z.union([z.literal('EventWindow'), z.literal('FixedDuration'), z.literal('Perpetual'), z.literal('SubscriptionTerm')]).nullable().describe(`
        * * Field Name: ValidityMode
        * * Display Name: Validity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm`),
    ValidityDurationDays: z.number().nullable().describe(`
        * * Field Name: ValidityDurationDays
        * * Display Name: Validity Duration (Days)
        * * SQL Data Type: int`),
    AccessLeadHours: z.number().nullable().describe(`
        * * Field Name: AccessLeadHours
        * * Display Name: Access Lead Hours
        * * SQL Data Type: int`),
    AccessLagHours: z.number().nullable().describe(`
        * * Field Name: AccessLagHours
        * * Display Name: Access Lag Hours
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product Name
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersProductEntitlementEntityType = z.infer<typeof mjBizAppsOrdersProductEntitlementSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Prices
 */
export const mjBizAppsOrdersProductPriceSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    PriceListID: z.string().nullable().describe(`
        * * Field Name: PriceListID
        * * Display Name: Price List ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)
        * * Description: The list this rule belongs to. NULL means the product's BASE price, which is what a customer with no price-list assignment resolves to.`),
    PricingModel: z.union([z.literal('Flat'), z.literal('Package'), z.literal('PerUnit'), z.literal('Tiered'), z.literal('Usage'), z.literal('Volume')]).describe(`
        * * Field Name: PricingModel
        * * Display Name: Pricing Model
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Flat
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * Package
    *   * PerUnit
    *   * Tiered
    *   * Usage
    *   * Volume
        * * Description: Flat | PerUnit | Tiered | Volume | Package | Usage.`),
    FeeType: z.union([z.literal('Overage'), z.literal('Recurring'), z.literal('Setup'), z.literal('Standard')]).describe(`
        * * Field Name: FeeType
        * * Display Name: Fee Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Standard
    * * Value List Type: List
    * * Possible Values 
    *   * Overage
    *   * Recurring
    *   * Setup
    *   * Standard
        * * Description: Standard | Setup | Recurring | Overage.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: Base/flat amount; tier detail lives in PriceTier.`),
    UnitOfMeasure: z.string().nullable().describe(`
        * * Field Name: UnitOfMeasure
        * * Display Name: Unit Of Measure
        * * SQL Data Type: nvarchar(40)
        * * Description: Pricing unit (each, month, hour, GB, seat, ...).`),
    PackageQuantity: z.number().nullable().describe(`
        * * Field Name: PackageQuantity
        * * Display Name: Package Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Package model only: this many units for Amount (twelve for the price of ten).`),
    MinQuantity: z.number().nullable().describe(`
        * * Field Name: MinQuantity
        * * Display Name: Minimum Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Minimum quantity this price applies to.`),
    MaxQuantity: z.number().nullable().describe(`
        * * Field Name: MaxQuantity
        * * Display Name: Maximum Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Maximum quantity this price applies to.`),
    EffectiveFrom: z.date().describe(`
        * * Field Name: EffectiveFrom
        * * Display Name: Effective From
        * * SQL Data Type: date
        * * Description: Price validity start.`),
    EffectiveTo: z.date().nullable().describe(`
        * * Field Name: EffectiveTo
        * * Display Name: Effective To
        * * SQL Data Type: date
        * * Description: Price validity end.`),
    RecurrenceMonths: z.string().nullable().describe(`
        * * Field Name: RecurrenceMonths
        * * Display Name: Recurrence Months
        * * SQL Data Type: nvarchar(40)
        * * Description: Comma-separated month numbers this rule applies in, e.g. '11,12' for a winter rate. Evaluated in TypeScript and never filtered in SQL, which is why it is a string rather than a child table.`),
    RecurrenceDaysOfWeek: z.string().nullable().describe(`
        * * Field Name: RecurrenceDaysOfWeek
        * * Display Name: Recurrence Days Of Week
        * * SQL Data Type: nvarchar(20)
        * * Description: Comma-separated ISO day numbers (Monday=1) this rule applies on.`),
    RecurrenceDayOfMonthMin: z.number().nullable().describe(`
        * * Field Name: RecurrenceDayOfMonthMin
        * * Display Name: Recurrence Day Of Month Min
        * * SQL Data Type: tinyint
        * * Description: Start of a day-of-month window, for rules like 'the first week of any month'.`),
    RecurrenceDayOfMonthMax: z.number().nullable().describe(`
        * * Field Name: RecurrenceDayOfMonthMax
        * * Display Name: Recurrence Day Of Month Max
        * * SQL Data Type: tinyint
        * * Description: End of the day-of-month window.`),
    TimeOfDayStart: z.date().nullable().describe(`
        * * Field Name: TimeOfDayStart
        * * Display Name: Time Of Day Start
        * * SQL Data Type: time
        * * Description: Start of a daily window, in the OWNING COMPANY's timezone. Left unstated, a happy-hour rate would run at the wrong hour for every entity but one.`),
    TimeOfDayEnd: z.date().nullable().describe(`
        * * Field Name: TimeOfDayEnd
        * * Display Name: Time Of Day End
        * * SQL Data Type: time
        * * Description: End of the daily window, in the owning company's timezone.`),
    Priority: z.number().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Disambiguates overlapping rules; highest wins. Two applicable rules sharing a priority are refused at write time.`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Active | Inactive. Only Active rules resolve.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Why this rule exists, in words - the thing nobody can reconstruct from the predicates a year later.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(200)`),
    PriceList: z.string().nullable().describe(`
        * * Field Name: PriceList
        * * Display Name: Price List
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersProductPriceEntityType = z.infer<typeof mjBizAppsOrdersProductPriceSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Types
 */
export const mjBizAppsOrdersProductTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().nullable().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Stable machine code (Event, Membership, PhysicalGood, ...). Unique when present; seeded types carry codes.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the product type. Unique.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the product type.`),
    RequiresFulfillment: z.boolean().describe(`
        * * Field Name: RequiresFulfillment
        * * Display Name: Requires Fulfillment
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When 1, orders containing products of this type hold at Posted until a fulfiller marks every such line Fulfilled; when no line requires fulfillment the order auto-advances to Fulfilled.`),
    DefaultRevenueRecognitionTypeID: z.string().nullable().describe(`
        * * Field Name: DefaultRevenueRecognitionTypeID
        * * Display Name: Default Revenue Recognition Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)`),
    DefaultIsTaxable: z.boolean().describe(`
        * * Field Name: DefaultIsTaxable
        * * Display Name: Default Is Taxable
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Default taxability stamped onto new products of this type.`),
    DefaultTaxCategory: z.string().nullable().describe(`
        * * Field Name: DefaultTaxCategory
        * * Display Name: Default Tax Category
        * * SQL Data Type: nvarchar(50)
        * * Description: Default taxability key for products of this type - the backstop of the taxability walk, used when neither the product nor its category names one.`),
    DefaultSubscriptionTypeID: z.string().nullable().describe(`
        * * Field Name: DefaultSubscriptionTypeID
        * * Display Name: Default Subscription Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)`),
    ProductExtensionEntity: z.string().nullable().describe(`
        * * Field Name: ProductExtensionEntity
        * * Display Name: Product Extension Entity
        * * SQL Data Type: nvarchar(255)
        * * Description: MJ entity name of the IsA Product-level extension for this type (e.g. MJ_BizApps_Orders: Event Products). NULL = no extension (BO-D37).`),
    OrderLineExtensionEntity: z.string().nullable().describe(`
        * * Field Name: OrderLineExtensionEntity
        * * Display Name: Order Line Extension Entity
        * * SQL Data Type: nvarchar(255)
        * * Description: MJ entity name of the IsA OrderLine-level extension for this type (e.g. MJ_BizApps_Orders: Event Order Lines). NULL = no extension (BO-D37).`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is active and selectable.`),
    DefaultEntitlementGrantTiming: z.union([z.literal('OnActivation'), z.literal('OnConfirm'), z.literal('OnPaidInFull')]).describe(`
        * * Field Name: DefaultEntitlementGrantTiming
        * * Display Name: Default Entitlement Grant Timing
        * * SQL Data Type: nvarchar(20)
        * * Default Value: OnConfirm
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull`),
    DefaultEntitlementQuantityMode: z.union([z.literal('Flat'), z.literal('PerUnit')]).describe(`
        * * Field Name: DefaultEntitlementQuantityMode
        * * Display Name: Default Entitlement Quantity Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: PerUnit
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit`),
    DefaultEntitlementValidityMode: z.union([z.literal('EventWindow'), z.literal('FixedDuration'), z.literal('Perpetual'), z.literal('SubscriptionTerm')]).describe(`
        * * Field Name: DefaultEntitlementValidityMode
        * * Display Name: Default Entitlement Validity Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Perpetual
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PricingDriverClass: z.string().nullable().describe(`
        * * Field Name: PricingDriverClass
        * * Display Name: Pricing Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of a BasePriceResolver subclass for every product of this type, or NULL. The natural home for behaviour-wide pricing such as usage metering.`),
    DefaultRevenueRecognitionType: z.string().nullable().describe(`
        * * Field Name: DefaultRevenueRecognitionType
        * * Display Name: Default Revenue Recognition Type
        * * SQL Data Type: nvarchar(200)`),
    DefaultSubscriptionType: z.string().nullable().describe(`
        * * Field Name: DefaultSubscriptionType
        * * Display Name: Default Subscription Type
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersProductTypeEntityType = z.infer<typeof mjBizAppsOrdersProductTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Products
 */
export const mjBizAppsOrdersProductSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the product.`),
    SKU: z.string().nullable().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(80)
        * * Description: Stock-keeping unit / product code. Unique when present.`),
    ProductTypeID: z.string().describe(`
        * * Field Name: ProductTypeID
        * * Display Name: Product Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Types (vwProductTypes.ID)`),
    ProductCategoryID: z.string().describe(`
        * * Field Name: ProductCategoryID
        * * Display Name: Product Category
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
        * * Description: The company whose revenue this product accrues to — the SOURCE OF TRUTH for order-line ownership (D6). Stamped onto OrderLine.CompanyID at line save. GL routing is via accounting's GLAccountLink, anchored at this company (D5).`),
    Status: z.union([z.literal('Active'), z.literal('Discontinued'), z.literal('Draft'), z.literal('EOL')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Discontinued
    *   * Draft
    *   * EOL
        * * Description: Draft | Active | Discontinued | EOL — catalog lifecycle. Data-only until the catalog engine gates ordering on it.`),
    SuccessorProductID: z.string().nullable().describe(`
        * * Field Name: SuccessorProductID
        * * Display Name: Successor Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    AvailableFrom: z.date().nullable().describe(`
        * * Field Name: AvailableFrom
        * * Display Name: Available From
        * * SQL Data Type: date
        * * Description: First date the product may be sold.`),
    AvailableTo: z.date().nullable().describe(`
        * * Field Name: AvailableTo
        * * Display Name: Available To
        * * SQL Data Type: date
        * * Description: Last date the product may be sold.`),
    RevenueRecognitionTypeID: z.string().describe(`
        * * Field Name: RevenueRecognitionTypeID
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)
        * * Description: HOW revenue for this product is earned (plan D43). Resolves to a pluggable driver via RevenueRecognitionType.DriverClass; the driver returns a schedule and the order entity turns it into forward-dated journal entries.`),
    StandaloneSellingPrice: z.number().nullable().describe(`
        * * Field Name: StandaloneSellingPrice
        * * Display Name: Standalone Selling Price
        * * SQL Data Type: decimal(19, 4)
        * * Description: Standalone selling price for ASC 606 bundle revenue allocation (BO-D35; fields now, allocation engine later).`),
    SubscriptionTypeID: z.string().nullable().describe(`
        * * Field Name: SubscriptionTypeID
        * * Display Name: Subscription Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)`),
    IsTaxable: z.boolean().nullable().describe(`
        * * Field Name: IsTaxable
        * * Display Name: Is Taxable
        * * SQL Data Type: bit
        * * Description: Whether this product is subject to tax (tax subsystem lands at O4).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the product.`),
    TaxCategory: z.string().nullable().describe(`
        * * Field Name: TaxCategory
        * * Display Name: Tax Category
        * * SQL Data Type: nvarchar(50)
        * * Description: Taxability key, matched against accounting's TaxRate.TaxCategory. A string rather than a lookup table because accounting already keys taxability by string, and a table here would need syncing to it and could drift.`),
    EntitlementGrantTiming: z.union([z.literal('OnActivation'), z.literal('OnConfirm'), z.literal('OnPaidInFull')]).nullable().describe(`
        * * Field Name: EntitlementGrantTiming
        * * Display Name: Entitlement Grant Timing
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull`),
    EntitlementQuantityMode: z.union([z.literal('Flat'), z.literal('PerUnit')]).nullable().describe(`
        * * Field Name: EntitlementQuantityMode
        * * Display Name: Entitlement Quantity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit`),
    EntitlementValidityMode: z.union([z.literal('EventWindow'), z.literal('FixedDuration'), z.literal('Perpetual'), z.literal('SubscriptionTerm')]).nullable().describe(`
        * * Field Name: EntitlementValidityMode
        * * Display Name: Entitlement Validity Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PricingDriverClass: z.string().nullable().describe(`
        * * Field Name: PricingDriverClass
        * * Display Name: Pricing Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of a BasePriceResolver subclass that prices this, or NULL for the standard metadata-driven walk. Resolved most-specific-first: product, then up the category chain, then the type, then the company policy. A client may price LOCALLY only when every level is NULL; anything else escalates to the server, because a plugin's answer cannot be reproduced from metadata.`),
    MaxQuantityPerLine: z.number().nullable().describe(`
        * * Field Name: MaxQuantityPerLine
        * * Display Name: Max Quantity Per Line
        * * SQL Data Type: decimal(18, 4)
        * * Description: Maximum quantity allowed on a single order line. NULL = no cap. Set to 1 for products that are one person / one unit per line (e.g. conference tickets).`),
    ProductType: z.string().describe(`
        * * Field Name: ProductType
        * * Display Name: Product Type Name
        * * SQL Data Type: nvarchar(100)`),
    ProductCategory: z.string().describe(`
        * * Field Name: ProductCategory
        * * Display Name: Product Category Name
        * * SQL Data Type: nvarchar(200)`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    SuccessorProduct: z.string().nullable().describe(`
        * * Field Name: SuccessorProduct
        * * Display Name: Successor Product Name
        * * SQL Data Type: nvarchar(200)`),
    RevenueRecognitionType: z.string().describe(`
        * * Field Name: RevenueRecognitionType
        * * Display Name: Revenue Recognition Name
        * * SQL Data Type: nvarchar(200)`),
    SubscriptionType: z.string().nullable().describe(`
        * * Field Name: SubscriptionType
        * * Display Name: Subscription Type Name
        * * SQL Data Type: nvarchar(200)`),
    RootSuccessorProductID: z.string().nullable().describe(`
        * * Field Name: RootSuccessorProductID
        * * Display Name: Root Successor Product
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersProductEntityType = z.infer<typeof mjBizAppsOrdersProductSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Promotion Codes
 */
export const mjBizAppsOrdersPromotionCodeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PromotionID: z.string().describe(`
        * * Field Name: PromotionID
        * * Display Name: Promotion ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(60)`),
    MaxRedemptions: z.number().nullable().describe(`
        * * Field Name: MaxRedemptions
        * * Display Name: Max Redemptions
        * * SQL Data Type: int
        * * Description: Cap for THIS code, distinct from the promotion's overall cap.`),
    AssignedOrganizationID: z.string().nullable().describe(`
        * * Field Name: AssignedOrganizationID
        * * Display Name: Assigned Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: Restricts the code to one organization. NULL means anyone may use it.`),
    AssignedPersonID: z.string().nullable().describe(`
        * * Field Name: AssignedPersonID
        * * Display Name: Assigned Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: Restricts the code to one individual. NULL means anyone may use it.`),
    EffectiveFrom: z.date().nullable().describe(`
        * * Field Name: EffectiveFrom
        * * Display Name: Effective From
        * * SQL Data Type: datetimeoffset`),
    EffectiveTo: z.date().nullable().describe(`
        * * Field Name: EffectiveTo
        * * Display Name: Effective To
        * * SQL Data Type: datetimeoffset`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Inactive`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Promotion: z.string().describe(`
        * * Field Name: Promotion
        * * Display Name: Promotion
        * * SQL Data Type: nvarchar(200)`),
    AssignedOrganization: z.string().nullable().describe(`
        * * Field Name: AssignedOrganization
        * * Display Name: Assigned Organization
        * * SQL Data Type: nvarchar(255)`),
    AssignedPerson: z.string().nullable().describe(`
        * * Field Name: AssignedPerson
        * * Display Name: Assigned Person
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersPromotionCodeEntityType = z.infer<typeof mjBizAppsOrdersPromotionCodeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Promotion Targets
 */
export const mjBizAppsOrdersPromotionTargetSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PromotionID: z.string().describe(`
        * * Field Name: PromotionID
        * * Display Name: Promotion
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)`),
    ProductID: z.string().nullable().describe(`
        * * Field Name: ProductID
        * * Display Name: Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    ProductCategoryID: z.string().nullable().describe(`
        * * Field Name: ProductCategoryID
        * * Display Name: Product Category
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)`),
    IncludeDescendants: z.boolean().describe(`
        * * Field Name: IncludeDescendants
        * * Display Name: Include Child Categories
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: For a category target, whether child categories are included.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Promotion: z.string().describe(`
        * * Field Name: Promotion
        * * Display Name: Promotion Name
        * * SQL Data Type: nvarchar(200)`),
    Product: z.string().nullable().describe(`
        * * Field Name: Product
        * * Display Name: Product Name
        * * SQL Data Type: nvarchar(200)`),
    ProductCategory: z.string().nullable().describe(`
        * * Field Name: ProductCategory
        * * Display Name: Product Category Name
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersPromotionTargetEntityType = z.infer<typeof mjBizAppsOrdersPromotionTargetSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Promotion Types
 */
export const mjBizAppsOrdersPromotionTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersPromotionTypeEntityType = z.infer<typeof mjBizAppsOrdersPromotionTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Promotions
 */
export const mjBizAppsOrdersPromotionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Internal handle for this offer. NOT the redeemable code - those live on PromotionCode.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    PromotionTypeID: z.string().describe(`
        * * Field Name: PromotionTypeID
        * * Display Name: Promotion Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotion Types (vwPromotionTypes.ID)`),
    CompanyID: z.string().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    Value: z.number().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: decimal(19, 4)
        * * Description: Magnitude, interpreted by the type: 0.10 for ten percent off, or a currency amount.`),
    AppliesAt: z.union([z.literal('Either'), z.literal('Line'), z.literal('Order')]).describe(`
        * * Field Name: AppliesAt
        * * Display Name: Applies At
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Either
    * * Value List Type: List
    * * Possible Values 
    *   * Either
    *   * Line
    *   * Order
        * * Description: Line | Order | Either. An order-level promotion is always allocated down to lines, because tax and GL are per line.`),
    AllowsStacking: z.boolean().describe(`
        * * Field Name: AllowsStacking
        * * Display Name: Allows Stacking
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this may combine with others. Defaults OFF - a promotion must opt in. When two non-stacking promotions collide the HIGHER VALUE wins, and the loser is recorded as offered-not-applied so 'why didn''t my code work?' has an answer.`),
    StackSequence: z.number().describe(`
        * * Field Name: StackSequence
        * * Display Name: Stack Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Order of application when several stack.`),
    MaxRedemptions: z.number().nullable().describe(`
        * * Field Name: MaxRedemptions
        * * Display Name: Max Redemptions
        * * SQL Data Type: int
        * * Description: Total redemptions across all customers. NULL is unlimited. Counted from OrderAdjustment rather than a stored counter, which would drift the first time anything was voided.`),
    MaxRedemptionsPerCustomer: z.number().nullable().describe(`
        * * Field Name: MaxRedemptionsPerCustomer
        * * Display Name: Max Redemptions Per Customer
        * * SQL Data Type: int
        * * Description: Redemptions allowed per customer. NULL is unlimited.`),
    MinimumOrderAmount: z.number().nullable().describe(`
        * * Field Name: MinimumOrderAmount
        * * Display Name: Minimum Order Amount
        * * SQL Data Type: decimal(19, 4)
        * * Description: Order must reach this value for the promotion to apply.`),
    MinimumQuantity: z.number().nullable().describe(`
        * * Field Name: MinimumQuantity
        * * Display Name: Minimum Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Line must reach this quantity for the promotion to apply.`),
    EffectiveFrom: z.date().nullable().describe(`
        * * Field Name: EffectiveFrom
        * * Display Name: Effective From
        * * SQL Data Type: datetimeoffset`),
    EffectiveTo: z.date().nullable().describe(`
        * * Field Name: EffectiveTo
        * * Display Name: Effective To
        * * SQL Data Type: datetimeoffset`),
    RecurrenceMonths: z.string().nullable().describe(`
        * * Field Name: RecurrenceMonths
        * * Display Name: Recurrence Months
        * * SQL Data Type: nvarchar(40)`),
    RecurrenceDaysOfWeek: z.string().nullable().describe(`
        * * Field Name: RecurrenceDaysOfWeek
        * * Display Name: Recurrence Days Of Week
        * * SQL Data Type: nvarchar(20)`),
    TimeOfDayStart: z.date().nullable().describe(`
        * * Field Name: TimeOfDayStart
        * * Display Name: Time Of Day Start
        * * SQL Data Type: time`),
    TimeOfDayEnd: z.date().nullable().describe(`
        * * Field Name: TimeOfDayEnd
        * * Display Name: Time Of Day End
        * * SQL Data Type: time`),
    QualifierKey: z.string().nullable().describe(`
        * * Field Name: QualifierKey
        * * Display Name: Qualifier Key
        * * SQL Data Type: nvarchar(100)
        * * Description: ClassFactory key for a BasePromotionQualifier plugin implementing arbitrary eligibility - member for two years, first-time buyer, holds an active subscription - without a schema change.`),
    Status: z.union([z.literal('Active'), z.literal('Draft'), z.literal('Expired'), z.literal('Paused')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Draft
    *   * Expired
    *   * Paused
        * * Description: Draft | Active | Paused | Expired. Only Active promotions resolve.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PromotionType: z.string().describe(`
        * * Field Name: PromotionType
        * * Display Name: Promotion Type Name
        * * SQL Data Type: nvarchar(200)`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
});

export type mjBizAppsOrdersPromotionEntityType = z.infer<typeof mjBizAppsOrdersPromotionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Revenue Recognition Types
 */
export const mjBizAppsOrdersRevenueRecognitionTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(200)`),
    IsDeferred: z.boolean().describe(`
        * * Field Name: IsDeferred
        * * Display Name: Is Deferred
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequiresServicePeriod: z.boolean().describe(`
        * * Field Name: RequiresServicePeriod
        * * Display Name: Requires Service Period
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersRevenueRecognitionTypeEntityType = z.infer<typeof mjBizAppsOrdersRevenueRecognitionTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Sales Authorities
 */
export const mjBizAppsOrdersSalesAuthoritySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SalesRepUserID: z.string().describe(`
        * * Field Name: SalesRepUserID
        * * Display Name: Sales Rep User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    MaxDiscountPct: z.number().nullable().describe(`
        * * Field Name: MaxDiscountPct
        * * Display Name: Max Discount Percentage
        * * SQL Data Type: decimal(7, 4)
        * * Description: Maximum discount fraction (0-1) this rep may grant unaided.`),
    MaxOrderValue: z.number().nullable().describe(`
        * * Field Name: MaxOrderValue
        * * Display Name: Max Order Value
        * * SQL Data Type: decimal(18, 2)
        * * Description: Maximum order value this rep may confirm unaided.`),
    AllowedPaymentTermsTypeIDs: z.string().nullable().describe(`
        * * Field Name: AllowedPaymentTermsTypeIDs
        * * Display Name: Allowed Payment Terms
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of PaymentTermsType IDs this rep may offer. NULL = all.`),
    AllowedProductCategoryIDs: z.string().nullable().describe(`
        * * Field Name: AllowedProductCategoryIDs
        * * Display Name: Allowed Product Categories
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of ProductCategory IDs this rep may sell. NULL = all.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this authority row is in force.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    SalesRepUser: z.string().describe(`
        * * Field Name: SalesRepUser
        * * Display Name: Sales Rep
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersSalesAuthorityEntityType = z.infer<typeof mjBizAppsOrdersSalesAuthoritySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Sales Rules
 */
export const mjBizAppsOrdersSalesRuleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Rule Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the rule.`),
    RuleType: z.union([z.literal('CreditLimit'), z.literal('Custom'), z.literal('DiscountLimit'), z.literal('PaymentTermsRequired'), z.literal('ProductAuthorization')]).describe(`
        * * Field Name: RuleType
        * * Display Name: Rule Type
        * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * CreditLimit
    *   * Custom
    *   * DiscountLimit
    *   * PaymentTermsRequired
    *   * ProductAuthorization
        * * Description: DiscountLimit | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom.`),
    Scope: z.union([z.literal('Global'), z.literal('PerCustomer'), z.literal('PerProduct'), z.literal('PerSalesRep')]).describe(`
        * * Field Name: Scope
        * * Display Name: Scope
        * * SQL Data Type: nvarchar(40)
        * * Default Value: Global
    * * Value List Type: List
    * * Possible Values 
    *   * Global
    *   * PerCustomer
    *   * PerProduct
    *   * PerSalesRep
        * * Description: Global | PerProduct | PerCustomer | PerSalesRep — what ScopeReferenceID points at.`),
    ScopeReferenceID: z.string().nullable().describe(`
        * * Field Name: ScopeReferenceID
        * * Display Name: Scope Reference
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the scoped Product / Customer Organization / Sales Rep User when Scope is not Global.`),
    PredicateJson: z.string().nullable().describe(`
        * * Field Name: PredicateJson
        * * Display Name: Predicate Logic
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON rule expression (admin-editable; evaluated by the F8 engine).`),
    ApprovalRequiredRoleID: z.string().nullable().describe(`
        * * Field Name: ApprovalRequiredRoleID
        * * Display Name: Approval Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Roles (vwRoles.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this rule participates in Confirm evaluation.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ApprovalRequiredRole: z.string().nullable().describe(`
        * * Field Name: ApprovalRequiredRole
        * * Display Name: Approval Required Role
        * * SQL Data Type: nvarchar(50)`),
});

export type mjBizAppsOrdersSalesRuleEntityType = z.infer<typeof mjBizAppsOrdersSalesRuleSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Stored Value Accounts
 */
export const mjBizAppsOrdersStoredValueAccountSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Gift Card Number
        * * SQL Data Type: nvarchar(60)
        * * Description: The gift-card number / instrument code. Unique.`),
    IssuingCompanyID: z.string().describe(`
        * * Field Name: IssuingCompanyID
        * * Display Name: Issuing Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    InitialAmount: z.number().describe(`
        * * Field Name: InitialAmount
        * * Display Name: Initial Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Face value at issuance.`),
    CurrentBalance: z.number().describe(`
        * * Field Name: CurrentBalance
        * * Display Name: Current Balance
        * * SQL Data Type: decimal(18, 2)
        * * Description: Current remaining balance (ledger-maintained via StoredValueTransaction).`),
    Status: z.union([z.literal('Active'), z.literal('Depleted'), z.literal('Expired'), z.literal('Suspended'), z.literal('Voided')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Depleted
    *   * Expired
    *   * Suspended
    *   * Voided
        * * Description: Active | Depleted | Expired | Suspended | Voided.`),
    IssuedFromOrderLineID: z.string().nullable().describe(`
        * * Field Name: IssuedFromOrderLineID
        * * Display Name: Issued From Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    BeneficiaryPersonID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPersonID
        * * Display Name: Beneficiary Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: FK to __mj_BizAppsCommon.Person — the card recipient.`),
    BeneficiaryOrganizationID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganizationID
        * * Display Name: Beneficiary Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the benefiting organization.`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: date
        * * Description: Expiration date where legally permitted. NULL = never.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    IssuingCompany: z.string().describe(`
        * * Field Name: IssuingCompany
        * * Display Name: Issuing Company
        * * SQL Data Type: nvarchar(50)`),
    BeneficiaryPerson: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPerson
        * * Display Name: Beneficiary Person
        * * SQL Data Type: nvarchar(100)`),
    BeneficiaryOrganization: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganization
        * * Display Name: Beneficiary Organization
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsOrdersStoredValueAccountEntityType = z.infer<typeof mjBizAppsOrdersStoredValueAccountSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Stored Value Transactions
 */
export const mjBizAppsOrdersStoredValueTransactionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    StoredValueAccountID: z.string().describe(`
        * * Field Name: StoredValueAccountID
        * * Display Name: Stored Value Account ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)`),
    TransactionType: z.union([z.literal('Adjust'), z.literal('Expire'), z.literal('Issue'), z.literal('Redeem'), z.literal('Refund')]).describe(`
        * * Field Name: TransactionType
        * * Display Name: Transaction Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Adjust
    *   * Expire
    *   * Issue
    *   * Redeem
    *   * Refund
        * * Description: Issue | Redeem | Refund | Adjust | Expire.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Signed amount (+issue/refund, -redeem/expire).`),
    BalanceAfter: z.number().describe(`
        * * Field Name: BalanceAfter
        * * Display Name: Balance After
        * * SQL Data Type: decimal(18, 2)
        * * Description: Account balance after applying this transaction.`),
    RelatedPaymentID: z.string().nullable().describe(`
        * * Field Name: RelatedPaymentID
        * * Display Name: Related Payment ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)`),
    RelatedOrderHeaderID: z.string().nullable().describe(`
        * * Field Name: RelatedOrderHeaderID
        * * Display Name: Related Order Header ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    OccurredAt: z.date().describe(`
        * * Field Name: OccurredAt
        * * Display Name: Occurred At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp of the transaction.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    StoredValueAccount: z.string().describe(`
        * * Field Name: StoredValueAccount
        * * Display Name: Stored Value Account
        * * SQL Data Type: nvarchar(60)`),
    RelatedPayment: z.string().nullable().describe(`
        * * Field Name: RelatedPayment
        * * Display Name: Related Payment
        * * SQL Data Type: nvarchar(40)`),
    RelatedOrderHeader: z.string().nullable().describe(`
        * * Field Name: RelatedOrderHeader
        * * Display Name: Related Order Header
        * * SQL Data Type: nvarchar(40)`),
});

export type mjBizAppsOrdersStoredValueTransactionEntityType = z.infer<typeof mjBizAppsOrdersStoredValueTransactionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscription Events
 */
export const mjBizAppsOrdersSubscriptionEventSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SubscriptionID: z.string().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    EventType: z.union([z.literal('Activated'), z.literal('Canceled'), z.literal('CancellationRequested'), z.literal('Created'), z.literal('Extended'), z.literal('Migrated'), z.literal('Paused'), z.literal('PaymentFailed'), z.literal('PaymentSucceeded'), z.literal('RenewalOrderSpawned'), z.literal('Resumed'), z.literal('TrialEnded'), z.literal('TrialStarted')]).describe(`
        * * Field Name: EventType
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * Activated
    *   * Canceled
    *   * CancellationRequested
    *   * Created
    *   * Extended
    *   * Migrated
    *   * Paused
    *   * PaymentFailed
    *   * PaymentSucceeded
    *   * RenewalOrderSpawned
    *   * Resumed
    *   * TrialEnded
    *   * TrialStarted
        * * Description: The lifecycle event kind (Created ... RenewalOrderSpawned).`),
    OccurredAt: z.date().describe(`
        * * Field Name: OccurredAt
        * * Display Name: Occurred At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp the event occurred.`),
    EventData: z.string().nullable().describe(`
        * * Field Name: EventData
        * * Display Name: Event Data
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON event payload (provider webhook body or internal context).`),
    ProviderEventID: z.string().nullable().describe(`
        * * Field Name: ProviderEventID
        * * Display Name: Provider Event ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider webhook event id — the idempotency key (unique when present).`),
    RelatedPaymentID: z.string().nullable().describe(`
        * * Field Name: RelatedPaymentID
        * * Display Name: Related Payment ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)`),
    RelatedOrderHeaderID: z.string().nullable().describe(`
        * * Field Name: RelatedOrderHeaderID
        * * Display Name: Related Order ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Subscription: z.string().describe(`
        * * Field Name: Subscription
        * * Display Name: Subscription Name
        * * SQL Data Type: nvarchar(40)`),
    RelatedPayment: z.string().nullable().describe(`
        * * Field Name: RelatedPayment
        * * Display Name: Related Payment
        * * SQL Data Type: nvarchar(40)`),
    RelatedOrderHeader: z.string().nullable().describe(`
        * * Field Name: RelatedOrderHeader
        * * Display Name: Related Order
        * * SQL Data Type: nvarchar(40)`),
});

export type mjBizAppsOrdersSubscriptionEventEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionEventSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscription Sequences
 */
export const mjBizAppsOrdersSubscriptionSequenceSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int
        * * Default Value: 1`),
    NextSequenceNumber: z.number().describe(`
        * * Field Name: NextSequenceNumber
        * * Display Name: Next Sequence Number
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: The next subscription sequence number to assign.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersSubscriptionSequenceEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionSequenceSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscription Terms
 */
export const mjBizAppsOrdersSubscriptionTermSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SubscriptionID: z.string().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    TermNumber: z.number().describe(`
        * * Field Name: TermNumber
        * * Display Name: Term Number
        * * SQL Data Type: int`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    IsProrated: z.boolean().describe(`
        * * Field Name: IsProrated
        * * Display Name: Is Prorated
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ProrationFactor: z.number().nullable().describe(`
        * * Field Name: ProrationFactor
        * * Display Name: Proration Factor
        * * SQL Data Type: decimal(9, 6)`),
    RevenueRecognitionTypeID: z.string().describe(`
        * * Field Name: RevenueRecognitionTypeID
        * * Display Name: Revenue Recognition Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Canceled'), z.literal('Completed'), z.literal('Lapsed'), z.literal('Scheduled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Completed
    *   * Lapsed
    *   * Scheduled`),
    CanceledAt: z.date().nullable().describe(`
        * * Field Name: CanceledAt
        * * Display Name: Canceled At
        * * SQL Data Type: datetimeoffset`),
    CancellationEffectiveDate: z.date().nullable().describe(`
        * * Field Name: CancellationEffectiveDate
        * * Display Name: Cancellation Effective Date
        * * SQL Data Type: date`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Subscription: z.string().describe(`
        * * Field Name: Subscription
        * * Display Name: Subscription Name
        * * SQL Data Type: nvarchar(40)`),
    RevenueRecognitionType: z.string().describe(`
        * * Field Name: RevenueRecognitionType
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersSubscriptionTermEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionTermSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscription Types
 */
export const mjBizAppsOrdersSubscriptionTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(40)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DriverClass: z.string().nullable().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(200)`),
    SubscriberScope: z.union([z.literal('Either'), z.literal('Organization'), z.literal('Person')]).describe(`
        * * Field Name: SubscriberScope
        * * Display Name: Subscriber Scope
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Either
    * * Value List Type: List
    * * Possible Values 
    *   * Either
    *   * Organization
    *   * Person`),
    BenefitModel: z.union([z.literal('Holder'), z.literal('Individual'), z.literal('Organization')]).describe(`
        * * Field Name: BenefitModel
        * * Display Name: Benefit Model
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Holder
    * * Value List Type: List
    * * Possible Values 
    *   * Holder
    *   * Individual
    *   * Organization`),
    StartMode: z.union([z.literal('CalendarAnchored'), z.literal('Deferred'), z.literal('Immediate')]).describe(`
        * * Field Name: StartMode
        * * Display Name: Start Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Immediate
    * * Value List Type: List
    * * Possible Values 
    *   * CalendarAnchored
    *   * Deferred
    *   * Immediate`),
    DeferredStartDays: z.number().nullable().describe(`
        * * Field Name: DeferredStartDays
        * * Display Name: Deferred Start Days
        * * SQL Data Type: int`),
    AnchorMonth: z.number().nullable().describe(`
        * * Field Name: AnchorMonth
        * * Display Name: Anchor Month
        * * SQL Data Type: tinyint`),
    AnchorDay: z.number().nullable().describe(`
        * * Field Name: AnchorDay
        * * Display Name: Anchor Day
        * * SQL Data Type: tinyint`),
    PartialPeriodMode: z.union([z.literal('ChargeFull'), z.literal('ExtendToNextAnchor'), z.literal('Prorate')]).nullable().describe(`
        * * Field Name: PartialPeriodMode
        * * Display Name: Partial Period Mode
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ChargeFull
    *   * ExtendToNextAnchor
    *   * Prorate`),
    DefaultTermMonths: z.number().nullable().describe(`
        * * Field Name: DefaultTermMonths
        * * Display Name: Default Term (Months)
        * * SQL Data Type: int`),
    BillingCadence: z.union([z.literal('Annual'), z.literal('Custom'), z.literal('Monthly'), z.literal('Quarterly')]).describe(`
        * * Field Name: BillingCadence
        * * Display Name: Billing Cadence
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Annual
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly`),
    RecognitionCadence: z.union([z.literal('Annual'), z.literal('MatchBilling'), z.literal('Monthly'), z.literal('Quarterly')]).describe(`
        * * Field Name: RecognitionCadence
        * * Display Name: Recognition Cadence
        * * SQL Data Type: nvarchar(20)
        * * Default Value: MatchBilling
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * MatchBilling
    *   * Monthly
    *   * Quarterly`),
    CustomCycleDays: z.number().nullable().describe(`
        * * Field Name: CustomCycleDays
        * * Display Name: Custom Cycle Days
        * * SQL Data Type: int`),
    TrialDays: z.number().describe(`
        * * Field Name: TrialDays
        * * Display Name: Trial Days
        * * SQL Data Type: int
        * * Default Value: 0`),
    ConcurrencyMode: z.union([z.literal('AllowMultiple'), z.literal('ExtendExisting'), z.literal('RejectDuplicate')]).describe(`
        * * Field Name: ConcurrencyMode
        * * Display Name: Concurrency Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: ExtendExisting
    * * Value List Type: List
    * * Possible Values 
    *   * AllowMultiple
    *   * ExtendExisting
    *   * RejectDuplicate`),
    ReactivationMode: z.union([z.literal('AlwaysCreateNew'), z.literal('ReactivateExisting'), z.literal('ReactivateWithinWindow')]).describe(`
        * * Field Name: ReactivationMode
        * * Display Name: Reactivation Mode
        * * SQL Data Type: nvarchar(30)
        * * Default Value: AlwaysCreateNew
    * * Value List Type: List
    * * Possible Values 
    *   * AlwaysCreateNew
    *   * ReactivateExisting
    *   * ReactivateWithinWindow`),
    ReactivationWindowDays: z.number().nullable().describe(`
        * * Field Name: ReactivationWindowDays
        * * Display Name: Reactivation Window (Days)
        * * SQL Data Type: int`),
    AutoRenewDefault: z.boolean().describe(`
        * * Field Name: AutoRenewDefault
        * * Display Name: Auto Renew Default
        * * SQL Data Type: bit
        * * Default Value: 1`),
    RenewalLeadDays: z.number().nullable().describe(`
        * * Field Name: RenewalLeadDays
        * * Display Name: Renewal Lead Days
        * * SQL Data Type: int`),
    CancellationMode: z.union([z.literal('EndOfBillingPeriod'), z.literal('EndOfTerm'), z.literal('Immediate')]).describe(`
        * * Field Name: CancellationMode
        * * Display Name: Cancellation Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: EndOfTerm
    * * Value List Type: List
    * * Possible Values 
    *   * EndOfBillingPeriod
    *   * EndOfTerm
    *   * Immediate`),
    CancellationRefundMode: z.union([z.literal('FullRefundWithinWindow'), z.literal('NoRefund'), z.literal('ProrateUnused')]).describe(`
        * * Field Name: CancellationRefundMode
        * * Display Name: Cancellation Refund Mode
        * * SQL Data Type: nvarchar(30)
        * * Default Value: NoRefund
    * * Value List Type: List
    * * Possible Values 
    *   * FullRefundWithinWindow
    *   * NoRefund
    *   * ProrateUnused`),
    CancellationWindowDays: z.number().nullable().describe(`
        * * Field Name: CancellationWindowDays
        * * Display Name: Cancellation Window (Days)
        * * SQL Data Type: int`),
    GracePeriodDays: z.number().describe(`
        * * Field Name: GracePeriodDays
        * * Display Name: Grace Period (Days)
        * * SQL Data Type: int
        * * Default Value: 0`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsOrdersSubscriptionTypeEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscriptions
 */
export const mjBizAppsOrdersSubscriptionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SubscriptionNumber: z.string().describe(`
        * * Field Name: SubscriptionNumber
        * * Display Name: Subscription Number
        * * SQL Data Type: nvarchar(40)
        * * Description: Human-readable subscription identifier. Unique.`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
        * * Description: The company whose product this subscription continues — stamped from Product.CompanyID at creation (D6). FK to __mj.Company.`),
    OrderLineID: z.string().describe(`
        * * Field Name: OrderLineID
        * * Display Name: Order Line
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    SubscriptionTypeID: z.string().describe(`
        * * Field Name: SubscriptionTypeID
        * * Display Name: Subscription Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    HolderOrganizationID: z.string().nullable().describe(`
        * * Field Name: HolderOrganizationID
        * * Display Name: Holder Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: FK to __mj_BizAppsCommon.Organization — the organization HOLDING this subscription (D65), fed from the order line's ship-to and possibly different from whoever paid.`),
    BeneficiaryPersonID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPersonID
        * * Display Name: Beneficiary Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: FK to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).`),
    Status: z.union([z.literal('Active'), z.literal('Canceled'), z.literal('Migrated'), z.literal('Paused'), z.literal('Trialing')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Migrated
    *   * Paused
    *   * Trialing
        * * Description: Active | Paused | Canceled | Migrated | Trialing.`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date
        * * Description: Date the subscription began.`),
    TrialEndDate: z.date().nullable().describe(`
        * * Field Name: TrialEndDate
        * * Display Name: Trial End Date
        * * SQL Data Type: date
        * * Description: When the trial ends (Trialing status).`),
    CanceledAt: z.date().nullable().describe(`
        * * Field Name: CanceledAt
        * * Display Name: Canceled At
        * * SQL Data Type: datetimeoffset
        * * Description: UTC timestamp the cancellation was recorded.`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date
        * * Description: Final service date after cancellation/migration.`),
    AutoRenew: z.boolean().describe(`
        * * Field Name: AutoRenew
        * * Display Name: Auto Renew
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether renewal orders spawn automatically (Jeremy: auto-renew flag).`),
    RenewalLeadDays: z.number().nullable().describe(`
        * * Field Name: RenewalLeadDays
        * * Display Name: Renewal Lead Days
        * * SQL Data Type: int
        * * Description: How many days before CurrentPeriodEnd the renewal order is raised (Jeremy: invoice about three months ahead).`),
    PaymentProviderID: z.string().nullable().describe(`
        * * Field Name: PaymentProviderID
        * * Display Name: Payment Provider
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    ProviderSubscriptionID: z.string().nullable().describe(`
        * * Field Name: ProviderSubscriptionID
        * * Display Name: Provider Subscription ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side subscription identifier (e.g. Stripe sub_...), when provider-billed.`),
    MigratesFromSubscriptionID: z.string().nullable().describe(`
        * * Field Name: MigratesFromSubscriptionID
        * * Display Name: Migrates From Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    MigratesToSubscriptionID: z.string().nullable().describe(`
        * * Field Name: MigratesToSubscriptionID
        * * Display Name: Migrates To Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Label
        * * SQL Data Type: nvarchar(50)`),
    SubscriptionType: z.string().describe(`
        * * Field Name: SubscriptionType
        * * Display Name: Subscription Type Label
        * * SQL Data Type: nvarchar(200)`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product Label
        * * SQL Data Type: nvarchar(200)`),
    HolderOrganization: z.string().nullable().describe(`
        * * Field Name: HolderOrganization
        * * Display Name: Holder Organization Label
        * * SQL Data Type: nvarchar(255)`),
    BeneficiaryPerson: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPerson
        * * Display Name: Beneficiary Person Label
        * * SQL Data Type: nvarchar(100)`),
    PaymentProvider: z.string().nullable().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider Label
        * * SQL Data Type: nvarchar(200)`),
    MigratesFromSubscription: z.string().nullable().describe(`
        * * Field Name: MigratesFromSubscription
        * * Display Name: Migrates From Subscription Label
        * * SQL Data Type: nvarchar(40)`),
    MigratesToSubscription: z.string().nullable().describe(`
        * * Field Name: MigratesToSubscription
        * * Display Name: Migrates To Subscription Label
        * * SQL Data Type: nvarchar(40)`),
    RootMigratesFromSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RootMigratesFromSubscriptionID
        * * Display Name: Root Migrates From Subscription
        * * SQL Data Type: uniqueidentifier`),
    RootMigratesToSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RootMigratesToSubscriptionID
        * * Display Name: Root Migrates To Subscription
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersSubscriptionEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionSchema>;
 
 

/**
 * MJ_BizApps_Orders: Charge Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ChargeType
 * * Base View: vwChargeTypes
 * * @description A kind of charge and how it computes. Shipping, handling, surcharges AND TAX are all charges - modelling tax this way means multi-layer tax (state, county, city) is several charges rather than a special case, so ordering, allocation, GL treatment and overrides are written once and apply to all of them.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Charge Types')
export class mjBizAppsOrdersChargeTypeEntity extends BaseEntity<mjBizAppsOrdersChargeTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Charge Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Charge Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersChargeTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Fee
    *   * Handling
    *   * Shipping
    *   * Surcharge
    *   * Tax
    * * Description: Shipping | Handling | Tax | Surcharge | Fee.
    */
    get Category(): 'Fee' | 'Handling' | 'Shipping' | 'Surcharge' | 'Tax' {
        return this.Get('Category');
    }
    set Category(value: 'Fee' | 'Handling' | 'Shipping' | 'Surcharge' | 'Tax') {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Basis
    * * Display Name: Basis
    * * SQL Data Type: nvarchar(30)
    * * Default Value: LineNet
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * LineNet
    *   * LineNetPlusCharges
    *   * OrderNet
    * * Description: What the charge computes on: LineNet (the discounted line), LineNetPlusCharges (after earlier charges in sequence), OrderNet, or Flat. This is the field that makes tax-on-shipping work, which is jurisdiction-dependent and therefore configuration rather than code.
    */
    get Basis(): 'Flat' | 'LineNet' | 'LineNetPlusCharges' | 'OrderNet' {
        return this.Get('Basis');
    }
    set Basis(value: 'Flat' | 'LineNet' | 'LineNetPlusCharges' | 'OrderNet') {
        this.Set('Basis', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Application order. Charges compute in this order and later ones may build on earlier ones via Basis.
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: AllowsOverride
    * * Display Name: Allows Override
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether a human may override a computed charge of this type.
    */
    get AllowsOverride(): boolean {
        return this.Get('AllowsOverride');
    }
    set AllowsOverride(value: boolean) {
        this.Set('AllowsOverride', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Customer Payment Methods - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: CustomerPaymentMethod
 * * Base View: vwCustomerPaymentMethods
 * * @description A stored payment method token for a customer (BO-D46). Provider token references only — never card data.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Customer Payment Methods')
export class mjBizAppsOrdersCustomerPaymentMethodEntity extends BaseEntity<mjBizAppsOrdersCustomerPaymentMethodEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Customer Payment Methods record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Customer Payment Methods record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersCustomerPaymentMethodEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Customer Payment Methods entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Every record must have an owner assigned. You must specify either an Owner Person or an Owner Organization.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAtLeastOneOwnerProvided(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Every record must have an owner assigned. You must specify either an Owner Person or an Owner Organization.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAtLeastOneOwnerProvided(result: ValidationResult) {
    	if (this.OwnerPersonID == null && this.OwnerOrganizationID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"OwnerPersonID",
    			"An owner must be specified. Please provide either an Owner Person or an Owner Organization.",
    			null,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OwnerPersonID
    * * Display Name: Owner Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get OwnerPersonID(): string | null {
        return this.Get('OwnerPersonID');
    }
    set OwnerPersonID(value: string | null) {
        this.Set('OwnerPersonID', value);
    }

    /**
    * * Field Name: OwnerOrganizationID
    * * Display Name: Owner Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the organization this saved method belongs to (D65). Nullable; CK_CustomerPaymentMethod_Owner requires a person or an organization.
    */
    get OwnerOrganizationID(): string | null {
        return this.Get('OwnerOrganizationID');
    }
    set OwnerOrganizationID(value: string | null) {
        this.Set('OwnerOrganizationID', value);
    }

    /**
    * * Field Name: PaymentDetailID
    * * Display Name: Payment Detail ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)
    */
    get PaymentDetailID(): string {
        return this.Get('PaymentDetailID');
    }
    set PaymentDetailID(value: string) {
        this.Set('PaymentDetailID', value);
    }

    /**
    * * Field Name: Nickname
    * * Display Name: Nickname
    * * SQL Data Type: nvarchar(100)
    */
    get Nickname(): string | null {
        return this.Get('Nickname');
    }
    set Nickname(value: string | null) {
        this.Set('Nickname', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this is the customer's default method for charge-on-file.
    */
    get IsDefault(): boolean {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this method is active/usable.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: OwnerPerson
    * * Display Name: Owner Person
    * * SQL Data Type: nvarchar(100)
    */
    get OwnerPerson(): string | null {
        return this.Get('OwnerPerson');
    }

    /**
    * * Field Name: OwnerOrganization
    * * Display Name: Owner Organization
    * * SQL Data Type: nvarchar(255)
    */
    get OwnerOrganization(): string | null {
        return this.Get('OwnerOrganization');
    }

    /**
    * * Field Name: PaymentDetail
    * * Display Name: Payment Detail
    * * SQL Data Type: char(4)
    */
    get PaymentDetail(): string | null {
        return this.Get('PaymentDetail');
    }
}


/**
 * MJ_BizApps_Orders: Customer Payment Terms - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: CustomerPaymentTerms
 * * Base View: vwCustomerPaymentTerms
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Customer Payment Terms')
export class mjBizAppsOrdersCustomerPaymentTermsEntity extends BaseEntity<mjBizAppsOrdersCustomerPaymentTermsEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Customer Payment Terms record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Customer Payment Terms record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersCustomerPaymentTermsEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Customer Payment Terms entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The end date must be after the start date when both dates are provided.
    * * Table-Level: Each record must be associated with either an Organization or a Person, but not both. One of these associations is required to ensure proper ownership.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndedAtAfterStartedAt(result);
        this.ValidateOrganizationOrPersonAssociation(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The end date must be after the start date when both dates are provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
    	if (this.StartedAt != null && this.EndedAt != null) {
    		const start = new Date(this.StartedAt);
    		const end = new Date(this.EndedAt);
    		if (end <= start) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EndedAt",
    				"The end date must be after the start date.",
    				this.EndedAt,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * Each record must be associated with either an Organization or a Person, but not both. One of these associations is required to ensure proper ownership.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateOrganizationOrPersonAssociation(result: ValidationResult) {
    	const hasOrganization = this.OrganizationID != null;
    	const hasPerson = this.PersonID != null;
    
    	if (hasOrganization && hasPerson) {
    		result.Errors.push(new ValidationErrorInfo(
    			"OrganizationID",
    			"Cannot associate with both an Organization and a Person. Please choose only one.",
    			this.OrganizationID,
    			ValidationErrorType.Failure
    		));
    	} else if (!hasOrganization && !hasPerson) {
    		result.Errors.push(new ValidationErrorInfo(
    			"OrganizationID",
    			"Must associate with either an Organization or a Person.",
    			null,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person
    * * SQL Data Type: uniqueidentifier
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: PaymentTermsTypeID
    * * Display Name: Payment Terms Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Terms Types (vwPaymentTermsTypes.ID)
    */
    get PaymentTermsTypeID(): string {
        return this.Get('PaymentTermsTypeID');
    }
    set PaymentTermsTypeID(value: string) {
        this.Set('PaymentTermsTypeID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    */
    get CompanyID(): string | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetimeoffset
    */
    get EndedAt(): Date | null {
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PaymentTermsType
    * * Display Name: Payment Terms Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentTermsType(): string {
        return this.Get('PaymentTermsType');
    }
}


/**
 * MJ_BizApps_Orders: Customer Tax Exemptions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: CustomerTaxExemption
 * * Base View: vwCustomerTaxExemptions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Customer Tax Exemptions')
export class mjBizAppsOrdersCustomerTaxExemptionEntity extends BaseEntity<mjBizAppsOrdersCustomerTaxExemptionEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Customer Tax Exemptions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Customer Tax Exemptions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersCustomerTaxExemptionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Customer Tax Exemptions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: If both a start date and an end date are specified, the end date must be after the start date to ensure logical chronological order.
    * * Table-Level: Either an Organization or a Person must be specified, but not both. Exactly one of these associations is required.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndedAtAfterStartedAt(result);
        this.ValidateOrganizationOrPersonRequired(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If both a start date and an end date are specified, the end date must be after the start date to ensure logical chronological order.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
    	if (this.StartedAt != null && this.EndedAt != null) {
    		if (this.EndedAt.getTime() <= this.StartedAt.getTime()) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EndedAt",
    				"The end date must be after the start date.",
    				this.EndedAt,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * Either an Organization or a Person must be specified, but not both. Exactly one of these associations is required.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateOrganizationOrPersonRequired(result: ValidationResult) {
    	const hasOrg = this.OrganizationID != null;
    	const hasPerson = this.PersonID != null;
    
    	if ((hasOrg && hasPerson) || (!hasOrg && !hasPerson)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"OrganizationID",
    			"Exactly one of Organization or Person must be specified. You cannot provide both or leave both empty.",
    			this.OrganizationID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: TaxJurisdictionID
    * * Display Name: Tax Jurisdiction ID
    * * SQL Data Type: uniqueidentifier
    */
    get TaxJurisdictionID(): string | null {
        return this.Get('TaxJurisdictionID');
    }
    set TaxJurisdictionID(value: string | null) {
        this.Set('TaxJurisdictionID', value);
    }

    /**
    * * Field Name: TaxCategory
    * * Display Name: Tax Category
    * * SQL Data Type: nvarchar(50)
    */
    get TaxCategory(): string | null {
        return this.Get('TaxCategory');
    }
    set TaxCategory(value: string | null) {
        this.Set('TaxCategory', value);
    }

    /**
    * * Field Name: ExemptionType
    * * Display Name: Exemption Type
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Other
    * * Value List Type: List
    * * Possible Values 
    *   * Educational
    *   * Government
    *   * NonProfit
    *   * Other
    *   * Resale
    */
    get ExemptionType(): 'Educational' | 'Government' | 'NonProfit' | 'Other' | 'Resale' {
        return this.Get('ExemptionType');
    }
    set ExemptionType(value: 'Educational' | 'Government' | 'NonProfit' | 'Other' | 'Resale') {
        this.Set('ExemptionType', value);
    }

    /**
    * * Field Name: CertificateRef
    * * Display Name: Certificate Reference
    * * SQL Data Type: nvarchar(200)
    */
    get CertificateRef(): string | null {
        return this.Get('CertificateRef');
    }
    set CertificateRef(value: string | null) {
        this.Set('CertificateRef', value);
    }

    /**
    * * Field Name: CertificateIssuedAt
    * * Display Name: Certificate Issued At
    * * SQL Data Type: date
    */
    get CertificateIssuedAt(): Date | null {
        return this.Get('CertificateIssuedAt');
    }
    set CertificateIssuedAt(value: Date | null) {
        this.Set('CertificateIssuedAt', value);
    }

    /**
    * * Field Name: CertificateExpiresAt
    * * Display Name: Certificate Expires At
    * * SQL Data Type: date
    */
    get CertificateExpiresAt(): Date | null {
        return this.Get('CertificateExpiresAt');
    }
    set CertificateExpiresAt(value: Date | null) {
        this.Set('CertificateExpiresAt', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetimeoffset
    */
    get EndedAt(): Date | null {
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(100)
    */
    get Person(): string | null {
        return this.Get('Person');
    }
}


/**
 * MJ_BizApps_Orders: Entitlement Grants - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: EntitlementGrant
 * * Base View: vwEntitlementGrants
 * * @description A granted entitlement instance created at Post / subscription activation (BO-D39), carrying the beneficiary (defaults to the buyer; a line may designate another). Downstream apps read grants to provision access.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Entitlement Grants')
export class mjBizAppsOrdersEntitlementGrantEntity extends BaseEntity<mjBizAppsOrdersEntitlementGrantEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Entitlement Grants record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Entitlement Grants record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersEntitlementGrantEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Entitlement Grants entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A revocation date must be provided if and only if the status is set to 'Revoked'.
    * * Table-Level: The validity end date must be on or after the validity start date if both dates are specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateStatusAndRevokedAtMatch(result);
        this.ValidateValidToAfterOrEqualValidFrom(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A revocation date must be provided if and only if the status is set to 'Revoked'.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateStatusAndRevokedAtMatch(result: ValidationResult) {
    	if (this.Status === "Revoked" && this.RevokedAt == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RevokedAt",
    			"A revocation date (RevokedAt) must be provided when the status is 'Revoked'.",
    			this.RevokedAt,
    			ValidationErrorType.Failure
    		));
    	} else if (this.Status !== "Revoked" && this.RevokedAt != null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RevokedAt",
    			"A revocation date (RevokedAt) can only be set if the status is 'Revoked'.",
    			this.RevokedAt,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The validity end date must be on or after the validity start date if both dates are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateValidToAfterOrEqualValidFrom(result: ValidationResult) {
    	if (this.ValidFrom != null && this.ValidTo != null) {
    		const fromTime = new Date(this.ValidFrom).getTime();
    		const toTime = new Date(this.ValidTo).getTime();
    		if (toTime < fromTime) {
    			result.Errors.push(new ValidationErrorInfo(
    				"ValidTo",
    				"The validity end date (ValidTo) must be on or after the validity start date (ValidFrom).",
    				this.ValidTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProductEntitlementID
    * * Display Name: Product Entitlement
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Entitlements (vwProductEntitlements.ID)
    */
    get ProductEntitlementID(): string {
        return this.Get('ProductEntitlementID');
    }
    set ProductEntitlementID(value: string) {
        this.Set('ProductEntitlementID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string | null {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string | null) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: SubscriptionID
    * * Display Name: Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get SubscriptionID(): string | null {
        return this.Get('SubscriptionID');
    }
    set SubscriptionID(value: string | null) {
        this.Set('SubscriptionID', value);
    }

    /**
    * * Field Name: BeneficiaryPersonID
    * * Display Name: Beneficiary Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: FK to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).
    */
    get BeneficiaryPersonID(): string | null {
        return this.Get('BeneficiaryPersonID');
    }
    set BeneficiaryPersonID(value: string | null) {
        this.Set('BeneficiaryPersonID', value);
    }

    /**
    * * Field Name: BeneficiaryOrganizationID
    * * Display Name: Beneficiary Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the benefiting organization.
    */
    get BeneficiaryOrganizationID(): string | null {
        return this.Get('BeneficiaryOrganizationID');
    }
    set BeneficiaryOrganizationID(value: string | null) {
        this.Set('BeneficiaryOrganizationID', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Granted quantity (defaults from the entitlement definition).
    */
    get Quantity(): number | null {
        return this.Get('Quantity');
    }
    set Quantity(value: number | null) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: ValidFrom
    * * Display Name: Valid From
    * * SQL Data Type: datetimeoffset
    * * Description: Grant validity start.
    */
    get ValidFrom(): Date | null {
        return this.Get('ValidFrom');
    }
    set ValidFrom(value: Date | null) {
        this.Set('ValidFrom', value);
    }

    /**
    * * Field Name: ValidTo
    * * Display Name: Valid To
    * * SQL Data Type: datetimeoffset
    * * Description: Grant validity end.
    */
    get ValidTo(): Date | null {
        return this.Get('ValidTo');
    }
    set ValidTo(value: Date | null) {
        this.Set('ValidTo', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
    *   * Suspended
    * * Description: Active | Suspended | Revoked | Expired.
    */
    get Status(): 'Active' | 'Expired' | 'Revoked' | 'Suspended' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Revoked' | 'Suspended') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ProvisionedAt
    * * Display Name: Provisioned At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp downstream provisioning completed (NULL until provisioned).
    */
    get ProvisionedAt(): Date | null {
        return this.Get('ProvisionedAt');
    }
    set ProvisionedAt(value: Date | null) {
        this.Set('ProvisionedAt', value);
    }

    /**
    * * Field Name: ValidityModeApplied
    * * Display Name: Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm
    */
    get ValidityModeApplied(): 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null {
        return this.Get('ValidityModeApplied');
    }
    set ValidityModeApplied(value: 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null) {
        this.Set('ValidityModeApplied', value);
    }

    /**
    * * Field Name: SubscriptionTermID
    * * Display Name: Subscription Term
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Terms (vwSubscriptionTerms.ID)
    */
    get SubscriptionTermID(): string | null {
        return this.Get('SubscriptionTermID');
    }
    set SubscriptionTermID(value: string | null) {
        this.Set('SubscriptionTermID', value);
    }

    /**
    * * Field Name: RevokedAt
    * * Display Name: Revoked At
    * * SQL Data Type: datetimeoffset
    */
    get RevokedAt(): Date | null {
        return this.Get('RevokedAt');
    }
    set RevokedAt(value: Date | null) {
        this.Set('RevokedAt', value);
    }

    /**
    * * Field Name: RevocationReason
    * * Display Name: Revocation Reason
    * * SQL Data Type: nvarchar(300)
    */
    get RevocationReason(): string | null {
        return this.Get('RevocationReason');
    }
    set RevocationReason(value: string | null) {
        this.Set('RevocationReason', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ProductEntitlement
    * * Display Name: Product Entitlement Name
    * * SQL Data Type: nvarchar(200)
    */
    get ProductEntitlement(): string | null {
        return this.Get('ProductEntitlement');
    }

    /**
    * * Field Name: Subscription
    * * Display Name: Subscription Name
    * * SQL Data Type: nvarchar(40)
    */
    get Subscription(): string | null {
        return this.Get('Subscription');
    }

    /**
    * * Field Name: BeneficiaryPerson
    * * Display Name: Beneficiary Person Name
    * * SQL Data Type: nvarchar(100)
    */
    get BeneficiaryPerson(): string | null {
        return this.Get('BeneficiaryPerson');
    }

    /**
    * * Field Name: BeneficiaryOrganization
    * * Display Name: Beneficiary Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get BeneficiaryOrganization(): string | null {
        return this.Get('BeneficiaryOrganization');
    }
}


/**
 * MJ_BizApps_Orders: Event Order Lines - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: EventOrderLine
 * * Base View: vwEventOrderLines
 * * @description IsA Disjoint child of OrderLine (same UUID): per-line attendee detail; the attendee is typically the EntitlementGrant beneficiary (BO-D39).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Event Order Lines')
export class mjBizAppsOrdersEventOrderLineEntity extends BaseEntity<mjBizAppsOrdersEventOrderLineEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Event Order Lines record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Event Order Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersEventOrderLineEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CheckInAt
    * * Display Name: Check-In At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp the attendee checked in.
    */
    get CheckInAt(): Date | null {
        return this.Get('CheckInAt');
    }
    set CheckInAt(value: Date | null) {
        this.Set('CheckInAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Attendee
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: FK to __mj_BizAppsCommon.Person — the attendee. Required for a new event line; check-in is separate and optional.
    */
    get PersonID(): string {
        return this.Get('PersonID');
    }
    set PersonID(value: string) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: DietaryPreferences
    * * Display Name: Dietary Preferences
    * * SQL Data Type: nvarchar(500)
    * * Description: Dietary preferences for the attendee (vegetarian, kosher, etc.). Shown to conference organizers.
    */
    get DietaryPreferences(): string | null {
        return this.Get('DietaryPreferences');
    }
    set DietaryPreferences(value: string | null) {
        this.Set('DietaryPreferences', value);
    }

    /**
    * * Field Name: Allergies
    * * Display Name: Allergies
    * * SQL Data Type: nvarchar(500)
    * * Description: Food or other allergies conference organizers should know about.
    */
    get Allergies(): string | null {
        return this.Get('Allergies');
    }
    set Allergies(value: string | null) {
        this.Set('Allergies', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(2000)
    * * Description: Free-form notes for conference organizers about this attendee.
    */
    get Comments(): string | null {
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order Header
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get OrderHeaderID(): string {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: LineNumber
    * * Display Name: Line Number
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get LineNumber(): number {
        return this.Get('LineNumber');
    }
    set LineNumber(value: number) {
        this.Set('LineNumber', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get Quantity(): number {
        return this.Get('Quantity');
    }
    set Quantity(value: number) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(19, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: ProductPriceID
    * * Display Name: Product Price
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ProductPriceID(): string | null {
        return this.Get('ProductPriceID');
    }
    set ProductPriceID(value: string | null) {
        this.Set('ProductPriceID', value);
    }

    /**
    * * Field Name: DiscountPct
    * * Display Name: Discount Percent
    * * SQL Data Type: decimal(7, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get DiscountPct(): number {
        return this.Get('DiscountPct');
    }
    set DiscountPct(value: number) {
        this.Set('DiscountPct', value);
    }

    /**
    * * Field Name: DiscountAmount
    * * Display Name: Discount Amount
    * * SQL Data Type: decimal(19, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get DiscountAmount(): number {
        return this.Get('DiscountAmount');
    }
    set DiscountAmount(value: number) {
        this.Set('DiscountAmount', value);
    }

    /**
    * * Field Name: LineTotalNet
    * * Display Name: Line Total Net
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get LineTotalNet(): number | null {
        return this.Get('LineTotalNet');
    }
    set LineTotalNet(value: number | null) {
        this.Set('LineTotalNet', value);
    }

    /**
    * * Field Name: ChargeAmount
    * * Display Name: Charge Amount
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ChargeAmount(): number {
        return this.Get('ChargeAmount');
    }
    set ChargeAmount(value: number) {
        this.Set('ChargeAmount', value);
    }

    /**
    * * Field Name: LineTax
    * * Display Name: Line Tax
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get LineTax(): number {
        return this.Get('LineTax');
    }
    set LineTax(value: number) {
        this.Set('LineTax', value);
    }

    /**
    * * Field Name: LineTotalGross
    * * Display Name: Line Total Gross
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get LineTotalGross(): number | null {
        return this.Get('LineTotalGross');
    }
    set LineTotalGross(value: number | null) {
        this.Set('LineTotalGross', value);
    }

    /**
    * * Field Name: ShipToAddressID
    * * Display Name: Ship To Address
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ShipToAddressID(): string | null {
        return this.Get('ShipToAddressID');
    }
    set ShipToAddressID(value: string | null) {
        this.Set('ShipToAddressID', value);
    }

    /**
    * * Field Name: ShipToOrganizationID
    * * Display Name: Ship To Organization
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ShipToOrganizationID(): string | null {
        return this.Get('ShipToOrganizationID');
    }
    set ShipToOrganizationID(value: string | null) {
        this.Set('ShipToOrganizationID', value);
    }

    /**
    * * Field Name: ShipToPersonID
    * * Display Name: Ship To Person
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ShipToPersonID(): string | null {
        return this.Get('ShipToPersonID');
    }
    set ShipToPersonID(value: string | null) {
        this.Set('ShipToPersonID', value);
    }

    /**
    * * Field Name: RenewsSubscriptionID
    * * Display Name: Renews Subscription
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get RenewsSubscriptionID(): string | null {
        return this.Get('RenewsSubscriptionID');
    }
    set RenewsSubscriptionID(value: string | null) {
        this.Set('RenewsSubscriptionID', value);
    }

    /**
    * * Field Name: ServicePeriodStart
    * * Display Name: Service Period Start
    * * SQL Data Type: date
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ServicePeriodStart(): Date | null {
        return this.Get('ServicePeriodStart');
    }
    set ServicePeriodStart(value: Date | null) {
        this.Set('ServicePeriodStart', value);
    }

    /**
    * * Field Name: ServicePeriodEnd
    * * Display Name: Service Period End
    * * SQL Data Type: date
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ServicePeriodEnd(): Date | null {
        return this.Get('ServicePeriodEnd');
    }
    set ServicePeriodEnd(value: Date | null) {
        this.Set('ServicePeriodEnd', value);
    }

    /**
    * * Field Name: FulfillmentStatus
    * * Display Name: Fulfillment Status
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get FulfillmentStatus(): string | null {
        return this.Get('FulfillmentStatus');
    }
    set FulfillmentStatus(value: string | null) {
        this.Set('FulfillmentStatus', value);
    }

    /**
    * * Field Name: ReversesOrderLineID
    * * Display Name: Reverses Order Line
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ReversesOrderLineID(): string | null {
        return this.Get('ReversesOrderLineID');
    }
    set ReversesOrderLineID(value: string | null) {
        this.Set('ReversesOrderLineID', value);
    }

    /**
    * * Field Name: SourceBundleProductID
    * * Display Name: Source Bundle Product
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get SourceBundleProductID(): string | null {
        return this.Get('SourceBundleProductID');
    }
    set SourceBundleProductID(value: string | null) {
        this.Set('SourceBundleProductID', value);
    }

    /**
    * * Field Name: ParentOrderLineID
    * * Display Name: Parent Order Line
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get ParentOrderLineID(): string | null {
        return this.Get('ParentOrderLineID');
    }
    set ParentOrderLineID(value: string | null) {
        this.Set('ParentOrderLineID', value);
    }

    /**
    * * Field Name: IsRollupParent
    * * Display Name: Is Rollup Parent
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get IsRollupParent(): boolean {
        return this.Get('IsRollupParent');
    }
    set IsRollupParent(value: boolean) {
        this.Set('IsRollupParent', value);
    }

    /**
    * * Field Name: IsQuantityOverridden
    * * Display Name: Is Quantity Overridden
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get IsQuantityOverridden(): boolean {
        return this.Get('IsQuantityOverridden');
    }
    set IsQuantityOverridden(value: boolean) {
        this.Set('IsQuantityOverridden', value);
    }

    /**
    * * Field Name: SubscriptionID
    * * Display Name: Subscription
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get SubscriptionID(): string | null {
        return this.Get('SubscriptionID');
    }
    set SubscriptionID(value: string | null) {
        this.Set('SubscriptionID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: JournalEntryID
    * * Display Name: Journal Entry
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get JournalEntryID(): string | null {
        return this.Get('JournalEntryID');
    }
    set JournalEntryID(value: string | null) {
        this.Set('JournalEntryID', value);
    }

    /**
    * * Field Name: Person
    * * Display Name: Attendee Name
    * * SQL Data Type: nvarchar(100)
    */
    get Person(): string {
        return this.Get('Person');
    }
}


/**
 * MJ_BizApps_Orders: Event Products - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: EventProduct
 * * Base View: vwEventProducts
 * * @description IsA Disjoint child of Product (same UUID): event-specific catalog fields (BO-D37). A product is at most one subtype.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Event Products')
export class mjBizAppsOrdersEventProductEntity extends BaseEntity<mjBizAppsOrdersEventProductEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Event Products record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Event Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersEventProductEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Event Products entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Capacity: If a capacity is specified, it must be a positive number greater than zero.
    * * Table-Level: The event end date and time must be on or after the event start date and time, if an end date is provided.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateCapacityGreaterThanZero(result);
        this.ValidateEventEndsAtAfterEventStartsAt(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If a capacity is specified, it must be a positive number greater than zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateCapacityGreaterThanZero(result: ValidationResult) {
    	if (this.Capacity != null && this.Capacity <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Capacity",
    			"Capacity must be greater than zero.",
    			this.Capacity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The event end date and time must be on or after the event start date and time, if an end date is provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEventEndsAtAfterEventStartsAt(result: ValidationResult) {
    	if (this.EventEndsAt != null && this.EventStartsAt != null) {
    		const start = new Date(this.EventStartsAt).getTime();
    		const end = new Date(this.EventEndsAt).getTime();
    		if (end < start) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EventEndsAt",
    				"The event end date and time must be on or after the start date and time.",
    				this.EventEndsAt,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EventStartsAt
    * * Display Name: Event Starts At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC start of the event (also the SingleDate recognition date for Deferred event products).
    */
    get EventStartsAt(): Date {
        return this.Get('EventStartsAt');
    }
    set EventStartsAt(value: Date) {
        this.Set('EventStartsAt', value);
    }

    /**
    * * Field Name: EventEndsAt
    * * Display Name: Event Ends At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC end of the event.
    */
    get EventEndsAt(): Date | null {
        return this.Get('EventEndsAt');
    }
    set EventEndsAt(value: Date | null) {
        this.Set('EventEndsAt', value);
    }

    /**
    * * Field Name: VenueName
    * * Display Name: Venue Name
    * * SQL Data Type: nvarchar(300)
    * * Description: Venue display name.
    */
    get VenueName(): string | null {
        return this.Get('VenueName');
    }
    set VenueName(value: string | null) {
        this.Set('VenueName', value);
    }

    /**
    * * Field Name: VenueAddressID
    * * Display Name: Venue Address
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
    * * Description: FK to __mj_BizAppsCommon.Address — the venue address.
    */
    get VenueAddressID(): string | null {
        return this.Get('VenueAddressID');
    }
    set VenueAddressID(value: string | null) {
        this.Set('VenueAddressID', value);
    }

    /**
    * * Field Name: Capacity
    * * Display Name: Capacity
    * * SQL Data Type: int
    * * Description: Maximum attendee count. NULL = uncapped.
    */
    get Capacity(): number | null {
        return this.Get('Capacity');
    }
    set Capacity(value: number | null) {
        this.Set('Capacity', value);
    }

    /**
    * * Field Name: RequiresAttendeeInfo
    * * Display Name: Requires Attendee Info
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether order lines for this event require attendee info (EventOrderLine).
    */
    get RequiresAttendeeInfo(): boolean {
        return this.Get('RequiresAttendeeInfo');
    }
    set RequiresAttendeeInfo(value: boolean) {
        this.Set('RequiresAttendeeInfo', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(80)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get SKU(): string | null {
        return this.Get('SKU');
    }
    set SKU(value: string | null) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: ProductTypeID
    * * Display Name: Product Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get ProductTypeID(): string {
        return this.Get('ProductTypeID');
    }
    set ProductTypeID(value: string) {
        this.Set('ProductTypeID', value);
    }

    /**
    * * Field Name: ProductCategoryID
    * * Display Name: Product Category
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get ProductCategoryID(): string {
        return this.Get('ProductCategoryID');
    }
    set ProductCategoryID(value: string) {
        this.Set('ProductCategoryID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get Status(): string {
        return this.Get('Status');
    }
    set Status(value: string) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SuccessorProductID
    * * Display Name: Successor Product
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get SuccessorProductID(): string | null {
        return this.Get('SuccessorProductID');
    }
    set SuccessorProductID(value: string | null) {
        this.Set('SuccessorProductID', value);
    }

    /**
    * * Field Name: AvailableFrom
    * * Display Name: Available From
    * * SQL Data Type: date
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get AvailableFrom(): Date | null {
        return this.Get('AvailableFrom');
    }
    set AvailableFrom(value: Date | null) {
        this.Set('AvailableFrom', value);
    }

    /**
    * * Field Name: AvailableTo
    * * Display Name: Available To
    * * SQL Data Type: date
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get AvailableTo(): Date | null {
        return this.Get('AvailableTo');
    }
    set AvailableTo(value: Date | null) {
        this.Set('AvailableTo', value);
    }

    /**
    * * Field Name: RevenueRecognitionTypeID
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get RevenueRecognitionTypeID(): string {
        return this.Get('RevenueRecognitionTypeID');
    }
    set RevenueRecognitionTypeID(value: string) {
        this.Set('RevenueRecognitionTypeID', value);
    }

    /**
    * * Field Name: StandaloneSellingPrice
    * * Display Name: Standalone Selling Price
    * * SQL Data Type: decimal(19, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get StandaloneSellingPrice(): number | null {
        return this.Get('StandaloneSellingPrice');
    }
    set StandaloneSellingPrice(value: number | null) {
        this.Set('StandaloneSellingPrice', value);
    }

    /**
    * * Field Name: SubscriptionTypeID
    * * Display Name: Subscription Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get SubscriptionTypeID(): string | null {
        return this.Get('SubscriptionTypeID');
    }
    set SubscriptionTypeID(value: string | null) {
        this.Set('SubscriptionTypeID', value);
    }

    /**
    * * Field Name: IsTaxable
    * * Display Name: Is Taxable
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get IsTaxable(): boolean | null {
        return this.Get('IsTaxable');
    }
    set IsTaxable(value: boolean | null) {
        this.Set('IsTaxable', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TaxCategory
    * * Display Name: Tax Category
    * * SQL Data Type: nvarchar(50)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get TaxCategory(): string | null {
        return this.Get('TaxCategory');
    }
    set TaxCategory(value: string | null) {
        this.Set('TaxCategory', value);
    }

    /**
    * * Field Name: EntitlementGrantTiming
    * * Display Name: Entitlement Grant Timing
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get EntitlementGrantTiming(): string | null {
        return this.Get('EntitlementGrantTiming');
    }
    set EntitlementGrantTiming(value: string | null) {
        this.Set('EntitlementGrantTiming', value);
    }

    /**
    * * Field Name: EntitlementQuantityMode
    * * Display Name: Entitlement Quantity Mode
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get EntitlementQuantityMode(): string | null {
        return this.Get('EntitlementQuantityMode');
    }
    set EntitlementQuantityMode(value: string | null) {
        this.Set('EntitlementQuantityMode', value);
    }

    /**
    * * Field Name: EntitlementValidityMode
    * * Display Name: Entitlement Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get EntitlementValidityMode(): string | null {
        return this.Get('EntitlementValidityMode');
    }
    set EntitlementValidityMode(value: string | null) {
        this.Set('EntitlementValidityMode', value);
    }

    /**
    * * Field Name: PricingDriverClass
    * * Display Name: Pricing Driver Class
    * * SQL Data Type: nvarchar(255)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get PricingDriverClass(): string | null {
        return this.Get('PricingDriverClass');
    }
    set PricingDriverClass(value: string | null) {
        this.Set('PricingDriverClass', value);
    }

    /**
    * * Field Name: VenueAddress
    * * Display Name: Venue Address
    * * SQL Data Type: nvarchar(255)
    */
    get VenueAddress(): string | null {
        return this.Get('VenueAddress');
    }

    /**
    * * Field Name: __mj_Latitude
    * * Display Name: Latitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Latitude(): number | null {
        return this.Get('__mj_Latitude');
    }

    /**
    * * Field Name: __mj_Longitude
    * * Display Name: Longitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Longitude(): number | null {
        return this.Get('__mj_Longitude');
    }

    /**
    * * Field Name: MaxQuantityPerLine
    * * Display Name: Max Quantity Per Line
    * * SQL Data Type: decimal(18, 4)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get MaxQuantityPerLine(): number | null {
        return this.Get('MaxQuantityPerLine');
    }
    set MaxQuantityPerLine(value: number | null) {
        this.Set('MaxQuantityPerLine', value);
    }
}


/**
 * MJ_BizApps_Orders: Order Adjustment Allocations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderAdjustmentAllocation
 * * Base View: vwOrderAdjustmentAllocations
 * * @description Which lines an adjustment reduces, and by how much. Mandatory rather than optional: tax and GL are per line, and on a multi-company order this split decides WHOSE revenue is reduced. A line-level adjustment gets one row; an order-level one gets several, pro-rata by line value with the largest line absorbing the rounding remainder.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Adjustment Allocations')
export class mjBizAppsOrdersOrderAdjustmentAllocationEntity extends BaseEntity<mjBizAppsOrdersOrderAdjustmentAllocationEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Adjustment Allocations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Adjustment Allocations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderAdjustmentAllocationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderAdjustmentID
    * * Display Name: Order Adjustment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Adjustments (vwOrderAdjustments.ID)
    */
    get OrderAdjustmentID(): string {
        return this.Get('OrderAdjustmentID');
    }
    set OrderAdjustmentID(value: string) {
        this.Set('OrderAdjustmentID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Order Adjustments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderAdjustment
 * * Base View: vwOrderAdjustments
 * * @description An applied reduction. Serves as BOTH the applied discount and the redemption ledger - one concept, not two. Manual discounts (no promotion) ride the same table and must carry a Reason, enforced by CHECK, so an unexplained discount is unstorable rather than merely discouraged.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Adjustments')
export class mjBizAppsOrdersOrderAdjustmentEntity extends BaseEntity<mjBizAppsOrdersOrderAdjustmentEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Adjustments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Adjustments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderAdjustmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Adjustments entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Amount: The amount must be greater than zero to ensure all entries represent a positive financial value.
    * * Table-Level: Either a promotion must be applied or a valid reason must be provided.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAmountGreaterThanZero(result);
        this.ValidatePromotionOrReasonRequired(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The amount must be greater than zero to ensure all entries represent a positive financial value.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountGreaterThanZero(result: ValidationResult) {
    	if (this.Amount != null && this.Amount <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Amount",
    			"The amount must be greater than zero.",
    			this.Amount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Either a promotion must be applied or a valid reason must be provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePromotionOrReasonRequired(result: ValidationResult) {
    	const hasPromotion = this.PromotionID != null;
    	const hasReason = this.Reason != null && this.Reason.trim().length > 0;
    
    	if (!hasPromotion && !hasReason) {
    		result.Errors.push(new ValidationErrorInfo(
    			"PromotionID",
    			"Either a Promotion must be selected or a Reason must be provided.",
    			this.PromotionID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order Header
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get OrderHeaderID(): string {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    * * Description: The line reduced. NULL means order-level, in which case OrderAdjustmentAllocation distributes it across lines.
    */
    get OrderLineID(): string | null {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string | null) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: PromotionID
    * * Display Name: Promotion
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)
    * * Description: The promotion redeemed. NULL means a manual discount, which then requires a Reason and a SalesAuthority.
    */
    get PromotionID(): string | null {
        return this.Get('PromotionID');
    }
    set PromotionID(value: string | null) {
        this.Set('PromotionID', value);
    }

    /**
    * * Field Name: PromotionCodeID
    * * Display Name: Promotion Code ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotion Codes (vwPromotionCodes.ID)
    */
    get PromotionCodeID(): string | null {
        return this.Get('PromotionCodeID');
    }
    set PromotionCodeID(value: string | null) {
        this.Set('PromotionCodeID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: Always POSITIVE - it is a reduction, and the direction is carried by what the pipeline does with it rather than by the stored sign.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Reason
    * * Display Name: Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Why this discount was given. Required when no promotion is named.
    */
    get Reason(): string | null {
        return this.Get('Reason');
    }
    set Reason(value: string | null) {
        this.Set('Reason', value);
    }

    /**
    * * Field Name: AppliedByUserID
    * * Display Name: Applied By
    * * SQL Data Type: uniqueidentifier
    */
    get AppliedByUserID(): string | null {
        return this.Get('AppliedByUserID');
    }
    set AppliedByUserID(value: string | null) {
        this.Set('AppliedByUserID', value);
    }

    /**
    * * Field Name: AppliedAt
    * * Display Name: Applied At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    */
    get AppliedAt(): Date {
        return this.Get('AppliedAt');
    }
    set AppliedAt(value: Date) {
        this.Set('AppliedAt', value);
    }

    /**
    * * Field Name: AuthorizedBySalesAuthorityID
    * * Display Name: Authorized By Sales Authority
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Sales Authorities (vwSalesAuthorities.ID)
    * * Description: Which SalesAuthority permitted a manual discount. Stamped so that lowering a rep's limit later does not retroactively make past discounts look unauthorized.
    */
    get AuthorizedBySalesAuthorityID(): string | null {
        return this.Get('AuthorizedBySalesAuthorityID');
    }
    set AuthorizedBySalesAuthorityID(value: string | null) {
        this.Set('AuthorizedBySalesAuthorityID', value);
    }

    /**
    * * Field Name: ApprovedByUserID
    * * Display Name: Approved By
    * * SQL Data Type: uniqueidentifier
    * * Description: Who approved a discount exceeding the applying user's authority. Over-limit discounts ESCALATE rather than being refused - a hard refusal is what pushes people to record the discount as something else.
    */
    get ApprovedByUserID(): string | null {
        return this.Get('ApprovedByUserID');
    }
    set ApprovedByUserID(value: string | null) {
        this.Set('ApprovedByUserID', value);
    }

    /**
    * * Field Name: ApprovedAt
    * * Display Name: Approved At
    * * SQL Data Type: datetimeoffset
    */
    get ApprovedAt(): Date | null {
        return this.Get('ApprovedAt');
    }
    set ApprovedAt(value: Date | null) {
        this.Set('ApprovedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: OrderHeader
    * * Display Name: Order Header Name
    * * SQL Data Type: nvarchar(40)
    */
    get OrderHeader(): string {
        return this.Get('OrderHeader');
    }

    /**
    * * Field Name: Promotion
    * * Display Name: Promotion Name
    * * SQL Data Type: nvarchar(200)
    */
    get Promotion(): string | null {
        return this.Get('Promotion');
    }

    /**
    * * Field Name: PromotionCode
    * * Display Name: Promotion Code
    * * SQL Data Type: nvarchar(60)
    */
    get PromotionCode(): string | null {
        return this.Get('PromotionCode');
    }
}


/**
 * MJ_BizApps_Orders: Order Charge Allocations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderChargeAllocation
 * * Base View: vwOrderChargeAllocations
 * * @description Which lines a charge belongs to. Needed for tax (per line), GL (per line's company) and returns (refunding a line refunds its share of the charge). The same shape as OrderAdjustmentAllocation, deliberately.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Charge Allocations')
export class mjBizAppsOrdersOrderChargeAllocationEntity extends BaseEntity<mjBizAppsOrdersOrderChargeAllocationEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Charge Allocations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Charge Allocations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderChargeAllocationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderChargeID
    * * Display Name: Order Charge
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Charges (vwOrderCharges.ID)
    */
    get OrderChargeID(): string {
        return this.Get('OrderChargeID');
    }
    set OrderChargeID(value: string) {
        this.Set('OrderChargeID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Order Charges - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderCharge
 * * Base View: vwOrderCharges
 * * @description An amount added to an order - shipping, handling, a tax layer. Computed, never hand-typed, but overridable ON THE RECORD: forbidding overrides outright is what gets worked around with a fake discount line, which is worse than the thing it prevents. A CHECK makes 'waived without saying why' unstorable.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Charges')
export class mjBizAppsOrdersOrderChargeEntity extends BaseEntity<mjBizAppsOrdersOrderChargeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Charges record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Charges record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderChargeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Charges entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: If a charge is marked as overridden, both a non-empty override reason and a computed amount must be provided to ensure proper documentation and tracking.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateOverrideReasonAndComputedAmountWhenOverridden(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If a charge is marked as overridden, both a non-empty override reason and a computed amount must be provided to ensure proper documentation and tracking.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateOverrideReasonAndComputedAmountWhenOverridden(result: ValidationResult) {
    	if (this.IsOverridden) {
    		const hasReason = this.OverrideReason != null && this.OverrideReason.trim().length > 0;
    		const hasComputedAmount = this.ComputedAmount != null;
    
    		if (!hasReason) {
    			result.Errors.push(new ValidationErrorInfo(
    				"OverrideReason",
    				"An override reason is required when the charge is marked as overridden.",
    				this.OverrideReason,
    				ValidationErrorType.Failure
    			));
    		}
    
    		if (!hasComputedAmount) {
    			result.Errors.push(new ValidationErrorInfo(
    				"ComputedAmount",
    				"A computed amount is required when the charge is marked as overridden.",
    				this.ComputedAmount,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order Header
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get OrderHeaderID(): string {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: ChargeTypeID
    * * Display Name: Charge Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Charge Types (vwChargeTypes.ID)
    */
    get ChargeTypeID(): string {
        return this.Get('ChargeTypeID');
    }
    set ChargeTypeID(value: string) {
        this.Set('ChargeTypeID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: BasisAmount
    * * Display Name: Basis Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: What the charge was computed on, kept so the arithmetic can be reproduced.
    */
    get BasisAmount(): number | null {
        return this.Get('BasisAmount');
    }
    set BasisAmount(value: number | null) {
        this.Set('BasisAmount', value);
    }

    /**
    * * Field Name: Rate
    * * Display Name: Rate
    * * SQL Data Type: decimal(9, 6)
    * * Description: The rate applied, for rate-driven charges such as tax.
    */
    get Rate(): number | null {
        return this.Get('Rate');
    }
    set Rate(value: number | null) {
        this.Set('Rate', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: TaxJurisdictionID
    * * Display Name: Tax Jurisdiction
    * * SQL Data Type: uniqueidentifier
    * * Description: For tax charges, the accounting TaxJurisdiction this layer came from. A soft reference across schemas.
    */
    get TaxJurisdictionID(): string | null {
        return this.Get('TaxJurisdictionID');
    }
    set TaxJurisdictionID(value: string | null) {
        this.Set('TaxJurisdictionID', value);
    }

    /**
    * * Field Name: TaxRateID
    * * Display Name: Tax Rate
    * * SQL Data Type: uniqueidentifier
    * * Description: For tax charges, the accounting TaxRate that produced the number - provenance, so it can be defended years later.
    */
    get TaxRateID(): string | null {
        return this.Get('TaxRateID');
    }
    set TaxRateID(value: string | null) {
        this.Set('TaxRateID', value);
    }

    /**
    * * Field Name: CalculationSource
    * * Display Name: Calculation Source
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Internal
    * * Description: Internal, or the name of the external provider that returned this amount.
    */
    get CalculationSource(): string {
        return this.Get('CalculationSource');
    }
    set CalculationSource(value: string) {
        this.Set('CalculationSource', value);
    }

    /**
    * * Field Name: IsOverridden
    * * Display Name: Is Overridden
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether a human replaced the computed amount. Requires a reason and preserves the computed value.
    */
    get IsOverridden(): boolean {
        return this.Get('IsOverridden');
    }
    set IsOverridden(value: boolean) {
        this.Set('IsOverridden', value);
    }

    /**
    * * Field Name: ComputedAmount
    * * Display Name: Computed Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: What the charge would have been before the override.
    */
    get ComputedAmount(): number | null {
        return this.Get('ComputedAmount');
    }
    set ComputedAmount(value: number | null) {
        this.Set('ComputedAmount', value);
    }

    /**
    * * Field Name: OverrideReason
    * * Display Name: Override Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get OverrideReason(): string | null {
        return this.Get('OverrideReason');
    }
    set OverrideReason(value: string | null) {
        this.Set('OverrideReason', value);
    }

    /**
    * * Field Name: OverriddenByUserID
    * * Display Name: Overridden By
    * * SQL Data Type: uniqueidentifier
    */
    get OverriddenByUserID(): string | null {
        return this.Get('OverriddenByUserID');
    }
    set OverriddenByUserID(value: string | null) {
        this.Set('OverriddenByUserID', value);
    }

    /**
    * * Field Name: OverriddenAt
    * * Display Name: Overridden At
    * * SQL Data Type: datetimeoffset
    */
    get OverriddenAt(): Date | null {
        return this.Get('OverriddenAt');
    }
    set OverriddenAt(value: Date | null) {
        this.Set('OverriddenAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: OrderHeader
    * * Display Name: Order
    * * SQL Data Type: nvarchar(40)
    */
    get OrderHeader(): string {
        return this.Get('OrderHeader');
    }

    /**
    * * Field Name: ChargeType
    * * Display Name: Charge Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get ChargeType(): string {
        return this.Get('ChargeType');
    }
}


/**
 * MJ_BizApps_Orders: Order Company Policies - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderCompanyPolicy
 * * Base View: vwOrderCompanyPolicies
 * * @description Per-company pricing policy. IS-A __mj.Company: ID is the Company ID, mirroring accounting's AccountingCompanyProfile. A company with no row takes the defaults, so this never needs backfilling.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Company Policies')
export class mjBizAppsOrdersOrderCompanyPolicyEntity extends BaseEntity<mjBizAppsOrdersOrderCompanyPolicyEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Company Policies record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Company Policies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderCompanyPolicyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: AllowPromotionStacking
    * * Display Name: Allow Promotion Stacking
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Company-level flip permitting promotions to combine at all. A promotion must ALSO opt in via its own AllowsStacking.
    */
    get AllowPromotionStacking(): boolean {
        return this.Get('AllowPromotionStacking');
    }
    set AllowPromotionStacking(value: boolean) {
        this.Set('AllowPromotionStacking', value);
    }

    /**
    * * Field Name: StackingMode
    * * Display Name: Stacking Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Sequential
    * * Value List Type: List
    * * Possible Values 
    *   * Additive
    *   * Sequential
    * * Description: Sequential (each promotion applies to the running total: ten percent then ten percent is nineteen) or Additive (percentages sum: twenty). Per company rather than per promotion, because the mode describes how a SET combines and two promotions disagreeing has no coherent answer. Sequential is the default because it discounts less, so a misconfiguration costs nothing.
    */
    get StackingMode(): 'Additive' | 'Sequential' {
        return this.Get('StackingMode');
    }
    set StackingMode(value: 'Additive' | 'Sequential') {
        this.Set('StackingMode', value);
    }

    /**
    * * Field Name: RefuseUnpricedLines
    * * Display Name: Refuse Unpriced Lines
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When nothing prices a line and no UnitPrice was supplied, refuse it rather than booking zero. A silently-zero price is an invoice for nothing that looks deliberate.
    */
    get RefuseUnpricedLines(): boolean {
        return this.Get('RefuseUnpricedLines');
    }
    set RefuseUnpricedLines(value: boolean) {
        this.Set('RefuseUnpricedLines', value);
    }

    /**
    * * Field Name: DefaultPriceListID
    * * Display Name: Default Price List ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)
    * * Description: Fallback list for customers with no assignment of their own.
    */
    get DefaultPriceListID(): string | null {
        return this.Get('DefaultPriceListID');
    }
    set DefaultPriceListID(value: string | null) {
        this.Set('DefaultPriceListID', value);
    }

    /**
    * * Field Name: DefaultPaymentTermsTypeID
    * * Display Name: Default Payment Terms Type ID
    * * SQL Data Type: uniqueidentifier
    */
    get DefaultPaymentTermsTypeID(): string | null {
        return this.Get('DefaultPaymentTermsTypeID');
    }
    set DefaultPaymentTermsTypeID(value: string | null) {
        this.Set('DefaultPaymentTermsTypeID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PricingDriverClass
    * * Display Name: Pricing Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of this company's house BasePriceResolver, or NULL. This is where every plugin registered before this column existed was keyed (Company:<id>), so it is the level that makes those visible to metadata.
    */
    get PricingDriverClass(): string | null {
        return this.Get('PricingDriverClass');
    }
    set PricingDriverClass(value: string | null) {
        this.Set('PricingDriverClass', value);
    }

    /**
    * * Field Name: DefaultPriceList
    * * Display Name: Default Price List
    * * SQL Data Type: nvarchar(200)
    */
    get DefaultPriceList(): string | null {
        return this.Get('DefaultPriceList');
    }
}


/**
 * MJ_BizApps_Orders: Order Headers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderHeader
 * * Base View: vwOrderHeaders
 * * @description An order header — the customer's commitment AND the receivable (D2). On the FIRST transition to Confirmed, one balanced journal entry per line is booked into BizApps Accounting (D10). CompanyID is the originating/owning company — a document/visibility anchor, never GL resolution. No currency columns (FX deferred, D24).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Headers')
export class mjBizAppsOrdersOrderHeaderEntity extends BaseEntity<mjBizAppsOrdersOrderHeaderEntityType> {

  /**
  * Related records: MJ_BizApps_Orders: Order Lines
  *
  * Loads, validates and persists as one unit with this MJ_BizApps_Orders: Order Headers record — see
  * guides/TRANSACTIONS_AND_BATCHING_GUIDE.md. Declared by the RelatedRecordCollection metadata on
  * the 'MJ_BizApps_Orders: Order Headers → MJ_BizApps_Orders: Order Lines' relationship; edit that row, not this file.
  *
  */
  public readonly Lines = this.DeclareRelatedRecords<mjBizAppsOrdersOrderLineEntity>({
      Name: 'Lines',
        RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
        RelatedEntityJoinField: 'OrderHeaderID',
        OrderBy: 'LineNumber ASC',
        Load: 'explicit',
        OnRemove: 'delete',
        Source: 'database',
        Sequence: { Field: 'LineNumber', From: 1 },
  });


  /**
  * Related records: MJ_BizApps_Orders: Order Adjustments
  *
  * Loads, validates and persists as one unit with this MJ_BizApps_Orders: Order Headers record — see
  * guides/TRANSACTIONS_AND_BATCHING_GUIDE.md. Declared by the RelatedRecordCollection metadata on
  * the 'MJ_BizApps_Orders: Order Headers → MJ_BizApps_Orders: Order Adjustments' relationship; edit that row, not this file.
  *
  */
  public readonly Adjustments = this.DeclareRelatedRecords<mjBizAppsOrdersOrderAdjustmentEntity>({
      Name: 'Adjustments',
        RelatedEntity: 'MJ_BizApps_Orders: Order Adjustments',
        RelatedEntityJoinField: 'OrderHeaderID',
        OrderBy: 'Sequence ASC',
        Load: 'explicit',
        OnRemove: 'delete',
        Source: 'database',
        Sequence: { Field: 'Sequence', From: 1 },
  });


  /**
  * Related records: MJ_BizApps_Orders: Order Charges
  *
  * Loads, validates and persists as one unit with this MJ_BizApps_Orders: Order Headers record — see
  * guides/TRANSACTIONS_AND_BATCHING_GUIDE.md. Declared by the RelatedRecordCollection metadata on
  * the 'MJ_BizApps_Orders: Order Headers → MJ_BizApps_Orders: Order Charges' relationship; edit that row, not this file.
  *
  */
  public readonly Charges = this.DeclareRelatedRecords<mjBizAppsOrdersOrderChargeEntity>({
      Name: 'Charges',
        RelatedEntity: 'MJ_BizApps_Orders: Order Charges',
        RelatedEntityJoinField: 'OrderHeaderID',
        OrderBy: 'Sequence ASC',
        Load: 'explicit',
        OnRemove: 'delete',
        Source: 'database',
        Sequence: { Field: 'Sequence', From: 1 },
  });

    /**
    * Loads the MJ_BizApps_Orders: Order Headers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Headers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderHeaderEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Headers entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * InitialPaymentAmount: The initial payment amount must be greater than or equal to zero. Negative payment amounts are not allowed.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateInitialPaymentAmountGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The initial payment amount must be greater than or equal to zero. Negative payment amounts are not allowed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateInitialPaymentAmountGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.InitialPaymentAmount != null && this.InitialPaymentAmount < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"InitialPaymentAmount",
    			"Initial payment amount must be greater than or equal to zero.",
    			this.InitialPaymentAmount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderNumber
    * * Display Name: Order Number
    * * SQL Data Type: nvarchar(40)
    * * Description: Human-readable order identifier. Unique.
    */
    get OrderNumber(): string {
        return this.Get('OrderNumber');
    }
    set OrderNumber(value: string) {
        this.Set('OrderNumber', value);
    }

    /**
    * * Field Name: OrderType
    * * Display Name: Order Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Sale
    * * Value List Type: List
    * * Possible Values 
    *   * AccountCredit
    *   * Amendment
    *   * Cancellation
    *   * Return
    *   * Sale
    * * Description: Sale | Return | Cancellation | Amendment | AccountCredit. Non-Sale types are the correction/reversal document family (BO-D9/D15). AccountCredit is a DELIBERATELY ISSUED credit document; an ordinary Sale order can also carry a credit balance simply by being over-paid, and both are spendable through the Account Credit payment type (D68).
    */
    get OrderType(): 'AccountCredit' | 'Amendment' | 'Cancellation' | 'Return' | 'Sale' {
        return this.Get('OrderType');
    }
    set OrderType(value: 'AccountCredit' | 'Amendment' | 'Cancellation' | 'Return' | 'Sale') {
        this.Set('OrderType', value);
    }

    /**
    * * Field Name: OrderDate
    * * Display Name: Order Date
    * * SQL Data Type: date
    * * Description: Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.
    */
    get OrderDate(): Date {
        return this.Get('OrderDate');
    }
    set OrderDate(value: Date) {
        this.Set('OrderDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Confirmed
    *   * Draft
    *   * Fulfilled
    *   * Posted
    *   * Quoted
    *   * Voided
    * * Description: Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.
    */
    get Status(): 'Confirmed' | 'Draft' | 'Fulfilled' | 'Posted' | 'Quoted' | 'Voided' {
        return this.Get('Status');
    }
    set Status(value: 'Confirmed' | 'Draft' | 'Fulfilled' | 'Posted' | 'Quoted' | 'Voided') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    * * Description: The ORIGINATING/owning company (D6): document, visibility, and sales-attribution anchor (pairs with SalesRepUserID). NEVER used for GL resolution — revenue company is per line via the product's company. FK to __mj.Company.
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: BillToPersonID
    * * Display Name: Bill To Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get BillToPersonID(): string | null {
        return this.Get('BillToPersonID');
    }
    set BillToPersonID(value: string | null) {
        this.Set('BillToPersonID', value);
    }

    /**
    * * Field Name: BillToOrganizationID
    * * Display Name: Bill To Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the paying organization (D65). Nullable; a personal order names only a person.
    */
    get BillToOrganizationID(): string | null {
        return this.Get('BillToOrganizationID');
    }
    set BillToOrganizationID(value: string | null) {
        this.Set('BillToOrganizationID', value);
    }

    /**
    * * Field Name: SalesRepUserID
    * * Display Name: Sales Rep
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get SalesRepUserID(): string | null {
        return this.Get('SalesRepUserID');
    }
    set SalesRepUserID(value: string | null) {
        this.Set('SalesRepUserID', value);
    }

    /**
    * * Field Name: BillToAddressID
    * * Display Name: Bill To Address
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
    * * Description: FK to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.
    */
    get BillToAddressID(): string | null {
        return this.Get('BillToAddressID');
    }
    set BillToAddressID(value: string | null) {
        this.Set('BillToAddressID', value);
    }

    /**
    * * Field Name: ShipToAddressID
    * * Display Name: Ship To Address
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
    * * Description: FK to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.
    */
    get ShipToAddressID(): string | null {
        return this.Get('ShipToAddressID');
    }
    set ShipToAddressID(value: string | null) {
        this.Set('ShipToAddressID', value);
    }

    /**
    * * Field Name: ShipToOrganizationID
    * * Display Name: Ship To Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get ShipToOrganizationID(): string | null {
        return this.Get('ShipToOrganizationID');
    }
    set ShipToOrganizationID(value: string | null) {
        this.Set('ShipToOrganizationID', value);
    }

    /**
    * * Field Name: ShipToPersonID
    * * Display Name: Ship To Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get ShipToPersonID(): string | null {
        return this.Get('ShipToPersonID');
    }
    set ShipToPersonID(value: string | null) {
        this.Set('ShipToPersonID', value);
    }

    /**
    * * Field Name: PaymentTermsTypeID
    * * Display Name: Payment Terms
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Terms Types (vwPaymentTermsTypes.ID)
    */
    get PaymentTermsTypeID(): string | null {
        return this.Get('PaymentTermsTypeID');
    }
    set PaymentTermsTypeID(value: string | null) {
        this.Set('PaymentTermsTypeID', value);
    }

    /**
    * * Field Name: TotalGross
    * * Display Name: Total Gross
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-materialized order total = SUM(OrderLine.LineTotalGross). Never user-entered; frozen after Confirm.
    */
    get TotalGross(): number | null {
        return this.Get('TotalGross');
    }
    set TotalGross(value: number | null) {
        this.Set('TotalGross', value);
    }

    /**
    * * Field Name: AmountPaid
    * * Display Name: Amount Paid
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Engine-materialized total cash applied to this order = SUM(posted PaymentLine.Amount). Never user-entered.
    */
    get AmountPaid(): number {
        return this.Get('AmountPaid');
    }
    set AmountPaid(value: number) {
        this.Set('AmountPaid', value);
    }

    /**
    * * Field Name: Balance
    * * Display Name: Balance
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-materialized open balance = TotalGross - AmountPaid. Negative means a credit memo owed to the customer.
    */
    get Balance(): number | null {
        return this.Get('Balance');
    }
    set Balance(value: number | null) {
        this.Set('Balance', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: date
    * * Description: Payment due date, derived at Confirm/Post from PaymentTermsType.NetDays (posting date + net days) when not manually supplied. Editable override.
    */
    get DueDate(): Date | null {
        return this.Get('DueDate');
    }
    set DueDate(value: Date | null) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: PaymentStatus
    * * Display Name: Payment Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Unpaid
    * * Value List Type: List
    * * Possible Values 
    *   * Overdue
    *   * Paid
    *   * PartiallyPaid
    *   * Unpaid
    *   * WrittenOff
    * * Description: Unpaid | PartiallyPaid | Paid | Overdue | WrittenOff. Engine-derived from AmountPaid vs TotalGross; Overdue is time-derived in views/UI, WrittenOff is an explicit action.
    */
    get PaymentStatus(): 'Overdue' | 'Paid' | 'PartiallyPaid' | 'Unpaid' | 'WrittenOff' {
        return this.Get('PaymentStatus');
    }
    set PaymentStatus(value: 'Overdue' | 'Paid' | 'PartiallyPaid' | 'Unpaid' | 'WrittenOff') {
        this.Set('PaymentStatus', value);
    }

    /**
    * * Field Name: ExternalDocumentNumber
    * * Display Name: External Document Number
    * * SQL Data Type: nvarchar(80)
    * * Description: External document/invoice number for downstream systems (e.g. bill.com sync, UPD-1). Free-form; may equal OrderNumber. Not unique pending the dual-numbering decision.
    */
    get ExternalDocumentNumber(): string | null {
        return this.Get('ExternalDocumentNumber');
    }
    set ExternalDocumentNumber(value: string | null) {
        this.Set('ExternalDocumentNumber', value);
    }

    /**
    * * Field Name: InitialPaymentTypeID
    * * Display Name: Initial Payment Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)
    */
    get InitialPaymentTypeID(): string | null {
        return this.Get('InitialPaymentTypeID');
    }
    set InitialPaymentTypeID(value: string | null) {
        this.Set('InitialPaymentTypeID', value);
    }

    /**
    * * Field Name: InitialPaymentAmount
    * * Display Name: Initial Payment Amount
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    */
    get InitialPaymentAmount(): number {
        return this.Get('InitialPaymentAmount');
    }
    set InitialPaymentAmount(value: number) {
        this.Set('InitialPaymentAmount', value);
    }

    /**
    * * Field Name: InitialPaymentDetailID
    * * Display Name: Initial Payment Detail
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)
    */
    get InitialPaymentDetailID(): string | null {
        return this.Get('InitialPaymentDetailID');
    }
    set InitialPaymentDetailID(value: string | null) {
        this.Set('InitialPaymentDetailID', value);
    }

    /**
    * * Field Name: PostedAt
    * * Display Name: Posted At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp of the transition to Posted — the issue/tax-point date of the invoice.
    */
    get PostedAt(): Date | null {
        return this.Get('PostedAt');
    }
    set PostedAt(value: Date | null) {
        this.Set('PostedAt', value);
    }

    /**
    * * Field Name: PostedByUserID
    * * Display Name: Posted By
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get PostedByUserID(): string | null {
        return this.Get('PostedByUserID');
    }
    set PostedByUserID(value: string | null) {
        this.Set('PostedByUserID', value);
    }

    /**
    * * Field Name: ReversesOrderHeaderID
    * * Display Name: Reverses Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get ReversesOrderHeaderID(): string | null {
        return this.Get('ReversesOrderHeaderID');
    }
    set ReversesOrderHeaderID(value: string | null) {
        this.Set('ReversesOrderHeaderID', value);
    }

    /**
    * * Field Name: ReversalReason
    * * Display Name: Reversal Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reason this order reverses another (required by validation when ReversesOrderHeaderID is set).
    */
    get ReversalReason(): string | null {
        return this.Get('ReversalReason');
    }
    set ReversalReason(value: string | null) {
        this.Set('ReversalReason', value);
    }

    /**
    * * Field Name: RequestedDeliveryDate
    * * Display Name: Requested Delivery Date
    * * SQL Data Type: date
    * * Description: Customer-requested delivery/service date. Informational.
    */
    get RequestedDeliveryDate(): Date | null {
        return this.Get('RequestedDeliveryDate');
    }
    set RequestedDeliveryDate(value: Date | null) {
        this.Set('RequestedDeliveryDate', value);
    }

    /**
    * * Field Name: ApprovalTaskID
    * * Display Name: Approval Task
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the __mj_BizAppsTasks Task raised when a sales rule blocked Confirm (BO-D17). Convenience pointer; Task Links carry the authoritative linkage.
    */
    get ApprovalTaskID(): string | null {
        return this.Get('ApprovalTaskID');
    }
    set ApprovalTaskID(value: string | null) {
        this.Set('ApprovalTaskID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional free-text description / memo for the order.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Internal notes on the order (Description is the customer-facing memo).
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: ConfirmedAt
    * * Display Name: Confirmed At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp of the first transition to Confirmed.
    */
    get ConfirmedAt(): Date | null {
        return this.Get('ConfirmedAt');
    }
    set ConfirmedAt(value: Date | null) {
        this.Set('ConfirmedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: BillToPerson
    * * Display Name: Bill To Person Name
    * * SQL Data Type: nvarchar(100)
    */
    get BillToPerson(): string | null {
        return this.Get('BillToPerson');
    }

    /**
    * * Field Name: BillToOrganization
    * * Display Name: Bill To Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get BillToOrganization(): string | null {
        return this.Get('BillToOrganization');
    }

    /**
    * * Field Name: SalesRepUser
    * * Display Name: Sales Rep Name
    * * SQL Data Type: nvarchar(100)
    */
    get SalesRepUser(): string | null {
        return this.Get('SalesRepUser');
    }

    /**
    * * Field Name: BillToAddress
    * * Display Name: Bill To Address Text
    * * SQL Data Type: nvarchar(255)
    */
    get BillToAddress(): string | null {
        return this.Get('BillToAddress');
    }

    /**
    * * Field Name: ShipToAddress
    * * Display Name: Ship To Address Text
    * * SQL Data Type: nvarchar(255)
    */
    get ShipToAddress(): string | null {
        return this.Get('ShipToAddress');
    }

    /**
    * * Field Name: ShipToOrganization
    * * Display Name: Ship To Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get ShipToOrganization(): string | null {
        return this.Get('ShipToOrganization');
    }

    /**
    * * Field Name: ShipToPerson
    * * Display Name: Ship To Person Name
    * * SQL Data Type: nvarchar(100)
    */
    get ShipToPerson(): string | null {
        return this.Get('ShipToPerson');
    }

    /**
    * * Field Name: PaymentTermsType
    * * Display Name: Payment Terms Name
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentTermsType(): string | null {
        return this.Get('PaymentTermsType');
    }

    /**
    * * Field Name: InitialPaymentType
    * * Display Name: Initial Payment Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get InitialPaymentType(): string | null {
        return this.Get('InitialPaymentType');
    }

    /**
    * * Field Name: InitialPaymentDetail
    * * Display Name: Initial Payment Detail Info
    * * SQL Data Type: char(4)
    */
    get InitialPaymentDetail(): string | null {
        return this.Get('InitialPaymentDetail');
    }

    /**
    * * Field Name: PostedByUser
    * * Display Name: Posted By User
    * * SQL Data Type: nvarchar(100)
    */
    get PostedByUser(): string | null {
        return this.Get('PostedByUser');
    }

    /**
    * * Field Name: ReversesOrderHeader
    * * Display Name: Reverses Order Header
    * * SQL Data Type: nvarchar(40)
    */
    get ReversesOrderHeader(): string | null {
        return this.Get('ReversesOrderHeader');
    }

    /**
    * * Field Name: __mj_Latitude
    * * Display Name: Latitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Latitude(): number | null {
        return this.Get('__mj_Latitude');
    }

    /**
    * * Field Name: __mj_Longitude
    * * Display Name: Longitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Longitude(): number | null {
        return this.Get('__mj_Longitude');
    }

    /**
    * * Field Name: RootReversesOrderHeaderID
    * * Display Name: Root Reverses Order
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesOrderHeaderID(): string | null {
        return this.Get('RootReversesOrderHeaderID');
    }

    /**
    * * Field Name: IsOverdue
    * * Display Name: Is Overdue
    * * SQL Data Type: int
    */
    get IsOverdue(): number {
        return this.Get('IsOverdue');
    }
}


/**
 * MJ_BizApps_Orders: Order Line Dimensions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderLineDimension
 * * Base View: vwOrderLineDimensions
 * * @description Analytical dimension tag on an order line (one value per dimension). Soft refs to __mj_BizAppsAccounting Dimension/DimensionValue; the booking draft propagates tags onto JE lines for batch-dimension detail.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Line Dimensions')
export class mjBizAppsOrdersOrderLineDimensionEntity extends BaseEntity<mjBizAppsOrdersOrderLineDimensionEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Line Dimensions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Line Dimensions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderLineDimensionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: DimensionID
    * * Display Name: Dimension
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Dimensions (vwDimensions.ID)
    * * Description: FK to __mj_BizAppsAccounting.Dimension.
    */
    get DimensionID(): string {
        return this.Get('DimensionID');
    }
    set DimensionID(value: string) {
        this.Set('DimensionID', value);
    }

    /**
    * * Field Name: DimensionValueID
    * * Display Name: Dimension Value
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Dimension Values (vwDimensionValues.ID)
    * * Description: FK to __mj_BizAppsAccounting.DimensionValue.
    */
    get DimensionValueID(): string {
        return this.Get('DimensionValueID');
    }
    set DimensionValueID(value: string) {
        this.Set('DimensionValueID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Dimension
    * * Display Name: Dimension Name
    * * SQL Data Type: nvarchar(100)
    */
    get Dimension(): string {
        return this.Get('Dimension');
    }

    /**
    * * Field Name: DimensionValue
    * * Display Name: Dimension Value Name
    * * SQL Data Type: nvarchar(200)
    */
    get DimensionValue(): string {
        return this.Get('DimensionValue');
    }
}


/**
 * MJ_BizApps_Orders: Order Line Price Components - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderLinePriceComponent
 * * Base View: vwOrderLinePriceComponents
 * * @description How a line's total was arrived at, one row per pipeline stage with a running total. Pricing disputes are inevitable and 'the system computed it' is not an answer to a customer or an auditor. Provenance uses the polymorphic origin pair so a component can point at a ProductPrice, a Promotion, an OrderCharge or a TaxRate without a column per source type.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Line Price Components')
export class mjBizAppsOrdersOrderLinePriceComponentEntity extends BaseEntity<mjBizAppsOrdersOrderLinePriceComponentEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Line Price Components record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Line Price Components record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderLinePriceComponentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Line Price Components entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Both Source Entity ID and Source Record ID must either be both provided or both left blank. You cannot provide one without the other.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateSourceEntityAndRecordCoDependency(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Both Source Entity ID and Source Record ID must either be both provided or both left blank. You cannot provide one without the other.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSourceEntityAndRecordCoDependency(result: ValidationResult) {
    	const hasSourceEntity = this.SourceEntityID != null;
    	const hasSourceRecord = this.SourceRecordID != null;
    
    	if (hasSourceEntity !== hasSourceRecord) {
    		result.Errors.push(new ValidationErrorInfo(
    			"SourceEntityID",
    			"Both Source Entity ID and Source Record ID must be provided together, or both must be left blank.",
    			this.SourceEntityID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: ComponentType
    * * Display Name: Component Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Adjustment
    *   * Base
    *   * Charge
    *   * Rule
    *   * Tax
    * * Description: Base | Rule | Adjustment | Charge | Tax - which pipeline stage produced this component.
    */
    get ComponentType(): 'Adjustment' | 'Base' | 'Charge' | 'Rule' | 'Tax' {
        return this.Get('ComponentType');
    }
    set ComponentType(value: 'Adjustment' | 'Base' | 'Charge' | 'Rule' | 'Tax') {
        this.Set('ComponentType', value);
    }

    /**
    * * Field Name: Label
    * * Display Name: Label
    * * SQL Data Type: nvarchar(200)
    */
    get Label(): string {
        return this.Get('Label');
    }
    set Label(value: string) {
        this.Set('Label', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: SIGNED: negative for a discount, positive for a charge.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: RunningTotal
    * * Display Name: Running Total
    * * SQL Data Type: decimal(19, 4)
    * * Description: The line total after this component, so the decomposition reads top to bottom.
    */
    get RunningTotal(): number {
        return this.Get('RunningTotal');
    }
    set RunningTotal(value: number) {
        this.Set('RunningTotal', value);
    }

    /**
    * * Field Name: SourceEntityID
    * * Display Name: Source Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    * * Description: The MJ Entity of whatever produced this component. Set together with SourceRecordID, or neither.
    */
    get SourceEntityID(): string | null {
        return this.Get('SourceEntityID');
    }
    set SourceEntityID(value: string | null) {
        this.Set('SourceEntityID', value);
    }

    /**
    * * Field Name: SourceRecordID
    * * Display Name: Source Record ID
    * * SQL Data Type: nvarchar(400)
    * * Description: Primary key of the producing record, as text. A soft reference by nature - it points at whichever table the stage used.
    */
    get SourceRecordID(): string | null {
        return this.Get('SourceRecordID');
    }
    set SourceRecordID(value: string | null) {
        this.Set('SourceRecordID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: SourceEntity
    * * Display Name: Source Entity
    * * SQL Data Type: nvarchar(255)
    */
    get SourceEntity(): string | null {
        return this.Get('SourceEntity');
    }
}


/**
 * MJ_BizApps_Orders: Order Lines - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderLine
 * * Base View: vwOrderLines
 * * @description A line item on an order. Line amount = Quantity * UnitPrice. Each line books its OWN journal entry at Confirm (D10) in the line's company.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Lines')
export class mjBizAppsOrdersOrderLineEntity extends BaseEntity<mjBizAppsOrdersOrderLineEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Lines record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Order Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderLineEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Lines entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * DiscountAmount: Enforces that the discount amount cannot be negative, ensuring that discounts always reduce or maintain the price rather than increasing it.
    * * DiscountPct: Discount percentage must be a value between 0 and 1 (inclusive), representing a range of 0% to 100%.
    * * Quantity: The quantity specified for the line item must not be zero.
    * * UnitPrice: The unit price for any item must be zero or greater. Negative prices are not allowed.
    * * Table-Level: An order line cannot be its own parent. If a parent order line is specified, it must refer to a different order line.
    * * Table-Level: If an order line's quantity is marked as overridden, it must be associated with a parent order line.
    * * Table-Level: Quantity can only be overridden for order lines that are associated with a parent order line.
    * * Table-Level: If an order line is a rollup parent, its discount, charge, and tax amounts must all be zero.
    * * Table-Level: If both the service period start and end dates are provided, the end date must be on or after the start date.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountAmountNotNegative(result);
        this.ValidateDiscountPctRange(result);
        this.ValidateQuantityNotZero(result);
        this.ValidateUnitPriceIsNonNegative(result);
        this.ValidateParentOrderLineIDNotEqualToID(result);
        this.ValidateParentOrderLineRequiredWhenQuantityOverridden(result);
        this.ValidateQuantityOverrideRequiresParent(result);
        this.ValidateRollupParentAmountsAreZero(result);
        this.ValidateServicePeriodEndAfterStart(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Enforces that the discount amount cannot be negative, ensuring that discounts always reduce or maintain the price rather than increasing it.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountAmountNotNegative(result: ValidationResult) {
    	if (this.DiscountAmount < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"DiscountAmount",
    			"Discount amount cannot be negative.",
    			this.DiscountAmount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Discount percentage must be a value between 0 and 1 (inclusive), representing a range of 0% to 100%.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountPctRange(result: ValidationResult) {
    	if (this.DiscountPct != null && (this.DiscountPct < 0 || this.DiscountPct > 1)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"DiscountPct",
    			"Discount percentage must be between 0 and 1 (inclusive).",
    			this.DiscountPct,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The quantity specified for the line item must not be zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityNotZero(result: ValidationResult) {
    	if (this.Quantity !== null && this.Quantity === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Quantity",
    			"Quantity cannot be zero. Please specify a positive or negative quantity.",
    			this.Quantity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The unit price for any item must be zero or greater. Negative prices are not allowed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateUnitPriceIsNonNegative(result: ValidationResult) {
    	if (this.UnitPrice != null && this.UnitPrice < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"UnitPrice",
    			"Unit price must be greater than or equal to 0.",
    			this.UnitPrice,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * An order line cannot be its own parent. If a parent order line is specified, it must refer to a different order line.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateParentOrderLineIDNotEqualToID(result: ValidationResult) {
    	if (this.ParentOrderLineID != null && this.ParentOrderLineID === this.ID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ParentOrderLineID",
    			"An order line cannot refer to itself as its parent.",
    			this.ParentOrderLineID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * If an order line's quantity is marked as overridden, it must be associated with a parent order line.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateParentOrderLineRequiredWhenQuantityOverridden(result: ValidationResult) {
    	if (this.IsQuantityOverridden && this.ParentOrderLineID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ParentOrderLineID",
    			"A Parent Order Line must be specified when the quantity is overridden.",
    			this.ParentOrderLineID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Quantity can only be overridden for order lines that are associated with a parent order line.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityOverrideRequiresParent(result: ValidationResult) {
    	// If the quantity is overridden, a parent order line must be specified
    	if (this.IsQuantityOverridden && this.ParentOrderLineID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"IsQuantityOverridden",
    			"The quantity can only be overridden for order lines that have a parent order line.",
    			this.IsQuantityOverridden,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * If an order line is a rollup parent, its discount, charge, and tax amounts must all be zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRollupParentAmountsAreZero(result: ValidationResult) {
        if (this.IsRollupParent && (this.DiscountAmount !== 0 || this.ChargeAmount !== 0 || this.LineTax !== 0)) {
            result.Errors.push(new ValidationErrorInfo(
                "IsRollupParent",
                "A rollup parent line must have zero discount, charge, and tax amounts.",
                this.IsRollupParent,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
    * If both the service period start and end dates are provided, the end date must be on or after the start date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateServicePeriodEndAfterStart(result: ValidationResult) {
    	if (this.ServicePeriodStart != null && this.ServicePeriodEnd != null) {
    		if (this.ServicePeriodEnd < this.ServicePeriodStart) {
    			result.Errors.push(new ValidationErrorInfo(
    				"ServicePeriodEnd",
    				"The service period end date must be on or after the service period start date.",
    				this.ServicePeriodEnd,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order Header
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get OrderHeaderID(): string {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    * * Description: Denormalized stamp of the product's company at line save (D6): perf/reporting + temporal integrity — records who owned the product at transaction time. Derived from Product.CompanyID, never authored. FK to __mj.Company.
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: LineNumber
    * * Display Name: Line Number
    * * SQL Data Type: int
    * * Description: Order-scoped line sequence (1..n), unique within the order.
    */
    get LineNumber(): number {
        return this.Get('LineNumber');
    }
    set LineNumber(value: number) {
        this.Set('LineNumber', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Quantity ordered (> 0).
    */
    get Quantity(): number {
        return this.Get('Quantity');
    }
    set Quantity(value: number) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(19, 4)
    * * Description: Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: ProductPriceID
    * * Display Name: Product Price Rule
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Prices (vwProductPrices.ID)
    * * Description: Which price RULE produced UnitPrice. UnitPrice still stamps; this records why, so a disputed invoice can be traced back to the rule that priced it. NULL when the caller supplied the price directly, which remains valid.
    */
    get ProductPriceID(): string | null {
        return this.Get('ProductPriceID');
    }
    set ProductPriceID(value: string | null) {
        this.Set('ProductPriceID', value);
    }

    /**
    * * Field Name: DiscountPct
    * * Display Name: Discount Percentage
    * * SQL Data Type: decimal(7, 4)
    * * Default Value: 0
    * * Description: Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).
    */
    get DiscountPct(): number {
        return this.Get('DiscountPct');
    }
    set DiscountPct(value: number) {
        this.Set('DiscountPct', value);
    }

    /**
    * * Field Name: DiscountAmount
    * * Display Name: Discount Amount
    * * SQL Data Type: decimal(19, 4)
    * * Default Value: 0
    * * Description: Absolute discount on this line, in currency. Separate from DiscountPct because a percentage cannot express an ALLOCATED share exactly - a 50.00 order-level promotion split across a 333.33 line is 0.15000015 as a fraction, and DiscountPct's 4dp scale would round it into a total that no longer sums to the promotion. Promotions and manual discounts land here; DiscountPct stays for a negotiated percentage concession, and a line may carry both.
    */
    get DiscountAmount(): number {
        return this.Get('DiscountAmount');
    }
    set DiscountAmount(value: number) {
        this.Set('DiscountAmount', value);
    }

    /**
    * * Field Name: LineTotalNet
    * * Display Name: Line Total Net
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-computed stored net line total = (Quantity * UnitPrice * (1 - DiscountPct)) - DiscountAmount, floored at zero. Frozen after Confirm.
    */
    get LineTotalNet(): number | null {
        return this.Get('LineTotalNet');
    }
    set LineTotalNet(value: number | null) {
        this.Set('LineTotalNet', value);
    }

    /**
    * * Field Name: ChargeAmount
    * * Display Name: Charge Amount
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Non-tax charges allocated to this line - shipping, handling, surcharges (D71). Tax keeps its own LineTax column because tax is reported, remitted and audited separately everywhere, even though both are charges to the engine that computes them.
    */
    get ChargeAmount(): number {
        return this.Get('ChargeAmount');
    }
    set ChargeAmount(value: number) {
        this.Set('ChargeAmount', value);
    }

    /**
    * * Field Name: LineTax
    * * Display Name: Line Tax
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Tax amount for this line. 0 until the tax subsystem lands (O4).
    */
    get LineTax(): number {
        return this.Get('LineTax');
    }
    set LineTax(value: number) {
        this.Set('LineTax', value);
    }

    /**
    * * Field Name: LineTotalGross
    * * Display Name: Line Total Gross
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-computed stored gross line total = LineTotalNet + LineTax + ChargeAmount. Frozen after Confirm.
    */
    get LineTotalGross(): number | null {
        return this.Get('LineTotalGross');
    }
    set LineTotalGross(value: number | null) {
        this.Set('LineTotalGross', value);
    }

    /**
    * * Field Name: ShipToAddressID
    * * Display Name: Ship To Address
    * * SQL Data Type: uniqueidentifier
    */
    get ShipToAddressID(): string | null {
        return this.Get('ShipToAddressID');
    }
    set ShipToAddressID(value: string | null) {
        this.Set('ShipToAddressID', value);
    }

    /**
    * * Field Name: ShipToOrganizationID
    * * Display Name: Ship To Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get ShipToOrganizationID(): string | null {
        return this.Get('ShipToOrganizationID');
    }
    set ShipToOrganizationID(value: string | null) {
        this.Set('ShipToOrganizationID', value);
    }

    /**
    * * Field Name: ShipToPersonID
    * * Display Name: Ship To Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get ShipToPersonID(): string | null {
        return this.Get('ShipToPersonID');
    }
    set ShipToPersonID(value: string | null) {
        this.Set('ShipToPersonID', value);
    }

    /**
    * * Field Name: RenewsSubscriptionID
    * * Display Name: Renews Subscription
    * * SQL Data Type: uniqueidentifier
    */
    get RenewsSubscriptionID(): string | null {
        return this.Get('RenewsSubscriptionID');
    }
    set RenewsSubscriptionID(value: string | null) {
        this.Set('RenewsSubscriptionID', value);
    }

    /**
    * * Field Name: ServicePeriodStart
    * * Display Name: Service Period Start
    * * SQL Data Type: date
    * * Description: Start of the service period for Deferred products (UPD-2 service-period recognition shape). Nullable.
    */
    get ServicePeriodStart(): Date | null {
        return this.Get('ServicePeriodStart');
    }
    set ServicePeriodStart(value: Date | null) {
        this.Set('ServicePeriodStart', value);
    }

    /**
    * * Field Name: ServicePeriodEnd
    * * Display Name: Service Period End
    * * SQL Data Type: date
    * * Description: End of the service period for Deferred products (>= ServicePeriodStart). Nullable.
    */
    get ServicePeriodEnd(): Date | null {
        return this.Get('ServicePeriodEnd');
    }
    set ServicePeriodEnd(value: Date | null) {
        this.Set('ServicePeriodEnd', value);
    }

    /**
    * * Field Name: FulfillmentStatus
    * * Display Name: Fulfillment Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Fulfilled
    *   * Pending
    *   * Returned
    * * Description: Pending | Fulfilled | Returned. NULL when the product type does not require fulfillment. The one line column a Fulfiller may change on Confirmed+ orders (trigger carve-out).
    */
    get FulfillmentStatus(): 'Fulfilled' | 'Pending' | 'Returned' | null {
        return this.Get('FulfillmentStatus');
    }
    set FulfillmentStatus(value: 'Fulfilled' | 'Pending' | 'Returned' | null) {
        this.Set('FulfillmentStatus', value);
    }

    /**
    * * Field Name: ReversesOrderLineID
    * * Display Name: Reverses Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get ReversesOrderLineID(): string | null {
        return this.Get('ReversesOrderLineID');
    }
    set ReversesOrderLineID(value: string | null) {
        this.Set('ReversesOrderLineID', value);
    }

    /**
    * * Field Name: SourceBundleProductID
    * * Display Name: Source Bundle Product
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get SourceBundleProductID(): string | null {
        return this.Get('SourceBundleProductID');
    }
    set SourceBundleProductID(value: string | null) {
        this.Set('SourceBundleProductID', value);
    }

    /**
    * * Field Name: ParentOrderLineID
    * * Display Name: Parent Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    * * Description: The bundle line this component was expanded from (D45). NULL on ordinary lines. Distinct from SourceBundleProductID, which names the bundle PRODUCT and therefore cannot tell two instances of the same bundle apart on one order. One level only: a component may not itself be a parent.
    */
    get ParentOrderLineID(): string | null {
        return this.Get('ParentOrderLineID');
    }
    set ParentOrderLineID(value: string | null) {
        this.Set('ParentOrderLineID', value);
    }

    /**
    * * Field Name: IsRollupParent
    * * Display Name: Is Rollup Parent
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: TRUE on an expanded bundle's parent line. The parent is customer-facing and contributes ZERO to every rollup - subtotal, tax base, charge base, discount base, GL - because the bundle price is allocated down to its children. Set by the expansion path, never authored.
    */
    get IsRollupParent(): boolean {
        return this.Get('IsRollupParent');
    }
    set IsRollupParent(value: boolean) {
        this.Set('IsRollupParent', value);
    }

    /**
    * * Field Name: IsQuantityOverridden
    * * Display Name: Is Quantity Overridden
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: TRUE when a child's quantity was hand-edited, detaching it from the parent quantity ripple. Without it, bumping the bundle quantity would silently overwrite a deliberate correction.
    */
    get IsQuantityOverridden(): boolean {
        return this.Get('IsQuantityOverridden');
    }
    set IsQuantityOverridden(value: boolean) {
        this.Set('IsQuantityOverridden', value);
    }

    /**
    * * Field Name: SubscriptionID
    * * Display Name: Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get SubscriptionID(): string | null {
        return this.Get('SubscriptionID');
    }
    set SubscriptionID(value: string | null) {
        this.Set('SubscriptionID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Optional free-text description for the line.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: JournalEntryID
    * * Display Name: Journal Entry
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Journal Entries (vwJournalEntries.ID)
    * * Description: FK to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order's journal entry is the aggregate of its lines' JEs.
    */
    get JournalEntryID(): string | null {
        return this.Get('JournalEntryID');
    }
    set JournalEntryID(value: string | null) {
        this.Set('JournalEntryID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: OrderHeader
    * * Display Name: Order Header Name
    * * SQL Data Type: nvarchar(40)
    */
    get OrderHeader(): string {
        return this.Get('OrderHeader');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: ShipToOrganization
    * * Display Name: Ship To Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get ShipToOrganization(): string | null {
        return this.Get('ShipToOrganization');
    }

    /**
    * * Field Name: ShipToPerson
    * * Display Name: Ship To Person Name
    * * SQL Data Type: nvarchar(100)
    */
    get ShipToPerson(): string | null {
        return this.Get('ShipToPerson');
    }

    /**
    * * Field Name: SourceBundleProduct
    * * Display Name: Source Bundle Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get SourceBundleProduct(): string | null {
        return this.Get('SourceBundleProduct');
    }

    /**
    * * Field Name: Subscription
    * * Display Name: Subscription Name
    * * SQL Data Type: nvarchar(40)
    */
    get Subscription(): string | null {
        return this.Get('Subscription');
    }

    /**
    * * Field Name: JournalEntry
    * * Display Name: Journal Entry Name
    * * SQL Data Type: nvarchar(40)
    */
    get JournalEntry(): string | null {
        return this.Get('JournalEntry');
    }

    /**
    * * Field Name: __mj_Latitude
    * * Display Name: Latitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Latitude(): number | null {
        return this.Get('__mj_Latitude');
    }

    /**
    * * Field Name: __mj_Longitude
    * * Display Name: Longitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Longitude(): number | null {
        return this.Get('__mj_Longitude');
    }

    /**
    * * Field Name: RootReversesOrderLineID
    * * Display Name: Root Reverses Order Line
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesOrderLineID(): string | null {
        return this.Get('RootReversesOrderLineID');
    }

    /**
    * * Field Name: RootParentOrderLineID
    * * Display Name: Root Parent Order Line
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentOrderLineID(): string | null {
        return this.Get('RootParentOrderLineID');
    }
}


/**
 * MJ_BizApps_Orders: Order Sequences - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderSequence
 * * Base View: vwOrderSequences
 * * @description Global singleton counter (ID=1) minting gap-conscious ORD-{seq} order numbers. Consumed only by the entity server.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Order Sequences')
export class mjBizAppsOrdersOrderSequenceEntity extends BaseEntity<mjBizAppsOrdersOrderSequenceEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Order Sequences record from the database
    * @param ID: number - primary key value to load the MJ_BizApps_Orders: Order Sequences record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderSequenceEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Order Sequences entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ID: The ID of the record must be exactly 1, ensuring that only a single system configuration record exists in this table.
    * * NextSequenceNumber: The next sequence number must be a positive integer greater than zero.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateIdEqualsOne(result);
        this.ValidateNextSequenceNumberGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The ID of the record must be exactly 1, ensuring that only a single system configuration record exists in this table.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    	public ValidateIdEqualsOne(result: ValidationResult) {
    		if (this.ID !== 1) {
    			result.Errors.push(new ValidationErrorInfo(
    				"ID",
    				"The ID for this record must be exactly 1.",
    				this.ID,
    				ValidationErrorType.Failure
    			));
    		}
    	}

    /**
    * The next sequence number must be a positive integer greater than zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNextSequenceNumberGreaterThanZero(result: ValidationResult) {
    	if (this.NextSequenceNumber !== undefined && this.NextSequenceNumber !== null && this.NextSequenceNumber <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NextSequenceNumber",
    			"The next sequence number must be greater than zero.",
    			this.NextSequenceNumber,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    * * Default Value: 1
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: NextSequenceNumber
    * * Display Name: Next Sequence Number
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: The next order sequence number to assign.
    */
    get NextSequenceNumber(): number {
        return this.Get('NextSequenceNumber');
    }
    set NextSequenceNumber(value: number) {
        this.Set('NextSequenceNumber', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Payment Details - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentDetail
 * * Base View: vwPaymentDetails
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Details')
export class mjBizAppsOrdersPaymentDetailEntity extends BaseEntity<mjBizAppsOrdersPaymentDetailEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Details record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentDetailEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Payment Details entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ExpiryMonth: The expiry month, if provided, must be a valid calendar month between 1 (January) and 12 (December).
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateExpiryMonthRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The expiry month, if provided, must be a valid calendar month between 1 (January) and 12 (December).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateExpiryMonthRange(result: ValidationResult) {
    	if (this.ExpiryMonth != null && (this.ExpiryMonth < 1 || this.ExpiryMonth > 12)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ExpiryMonth",
    			"Expiry month must be a valid month number between 1 and 12.",
    			this.ExpiryMonth,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: PaymentTypeID
    * * Display Name: Payment Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)
    */
    get PaymentTypeID(): string {
        return this.Get('PaymentTypeID');
    }
    set PaymentTypeID(value: string) {
        this.Set('PaymentTypeID', value);
    }

    /**
    * * Field Name: PaymentProviderID
    * * Display Name: Payment Provider
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)
    */
    get PaymentProviderID(): string | null {
        return this.Get('PaymentProviderID');
    }
    set PaymentProviderID(value: string | null) {
        this.Set('PaymentProviderID', value);
    }

    /**
    * * Field Name: SourceCustomerPaymentMethodID
    * * Display Name: Customer Payment Method
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Customer Payment Methods (vwCustomerPaymentMethods.ID)
    */
    get SourceCustomerPaymentMethodID(): string | null {
        return this.Get('SourceCustomerPaymentMethodID');
    }
    set SourceCustomerPaymentMethodID(value: string | null) {
        this.Set('SourceCustomerPaymentMethodID', value);
    }

    /**
    * * Field Name: ProviderCustomerRef
    * * Display Name: Provider Customer Reference
    * * SQL Data Type: nvarchar(100)
    */
    get ProviderCustomerRef(): string | null {
        return this.Get('ProviderCustomerRef');
    }
    set ProviderCustomerRef(value: string | null) {
        this.Set('ProviderCustomerRef', value);
    }

    /**
    * * Field Name: ProviderInstrumentRef
    * * Display Name: Provider Instrument Reference
    * * SQL Data Type: nvarchar(100)
    */
    get ProviderInstrumentRef(): string | null {
        return this.Get('ProviderInstrumentRef');
    }
    set ProviderInstrumentRef(value: string | null) {
        this.Set('ProviderInstrumentRef', value);
    }

    /**
    * * Field Name: Brand
    * * Display Name: Brand
    * * SQL Data Type: nvarchar(40)
    */
    get Brand(): string | null {
        return this.Get('Brand');
    }
    set Brand(value: string | null) {
        this.Set('Brand', value);
    }

    /**
    * * Field Name: Last4
    * * Display Name: Last 4 Digits
    * * SQL Data Type: char(4)
    */
    get Last4(): string | null {
        return this.Get('Last4');
    }
    set Last4(value: string | null) {
        this.Set('Last4', value);
    }

    /**
    * * Field Name: ExpiryMonth
    * * Display Name: Expiry Month
    * * SQL Data Type: int
    */
    get ExpiryMonth(): number | null {
        return this.Get('ExpiryMonth');
    }
    set ExpiryMonth(value: number | null) {
        this.Set('ExpiryMonth', value);
    }

    /**
    * * Field Name: ExpiryYear
    * * Display Name: Expiry Year
    * * SQL Data Type: int
    */
    get ExpiryYear(): number | null {
        return this.Get('ExpiryYear');
    }
    set ExpiryYear(value: number | null) {
        this.Set('ExpiryYear', value);
    }

    /**
    * * Field Name: HolderName
    * * Display Name: Cardholder Name
    * * SQL Data Type: nvarchar(200)
    */
    get HolderName(): string | null {
        return this.Get('HolderName');
    }
    set HolderName(value: string | null) {
        this.Set('HolderName', value);
    }

    /**
    * * Field Name: BankName
    * * Display Name: Bank Name
    * * SQL Data Type: nvarchar(200)
    */
    get BankName(): string | null {
        return this.Get('BankName');
    }
    set BankName(value: string | null) {
        this.Set('BankName', value);
    }

    /**
    * * Field Name: RoutingLast4
    * * Display Name: Routing Last 4
    * * SQL Data Type: char(4)
    */
    get RoutingLast4(): string | null {
        return this.Get('RoutingLast4');
    }
    set RoutingLast4(value: string | null) {
        this.Set('RoutingLast4', value);
    }

    /**
    * * Field Name: AccountLast4
    * * Display Name: Account Last 4
    * * SQL Data Type: char(4)
    */
    get AccountLast4(): string | null {
        return this.Get('AccountLast4');
    }
    set AccountLast4(value: string | null) {
        this.Set('AccountLast4', value);
    }

    /**
    * * Field Name: BankAccountType
    * * Display Name: Bank Account Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Checking
    *   * Savings
    */
    get BankAccountType(): 'Checking' | 'Savings' | null {
        return this.Get('BankAccountType');
    }
    set BankAccountType(value: 'Checking' | 'Savings' | null) {
        this.Set('BankAccountType', value);
    }

    /**
    * * Field Name: ReferenceNumber
    * * Display Name: Reference Number
    * * SQL Data Type: nvarchar(100)
    */
    get ReferenceNumber(): string | null {
        return this.Get('ReferenceNumber');
    }
    set ReferenceNumber(value: string | null) {
        this.Set('ReferenceNumber', value);
    }

    /**
    * * Field Name: InstrumentDate
    * * Display Name: Instrument Date
    * * SQL Data Type: date
    */
    get InstrumentDate(): Date | null {
        return this.Get('InstrumentDate');
    }
    set InstrumentDate(value: Date | null) {
        this.Set('InstrumentDate', value);
    }

    /**
    * * Field Name: StoredValueAccountID
    * * Display Name: Stored Value Account
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)
    */
    get StoredValueAccountID(): string | null {
        return this.Get('StoredValueAccountID');
    }
    set StoredValueAccountID(value: string | null) {
        this.Set('StoredValueAccountID', value);
    }

    /**
    * * Field Name: SourceOrderHeaderID
    * * Display Name: Source Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    * * Description: ACCOUNT CREDIT tender (D68): the order whose NEGATIVE balance this payment draws down. A customer credit is not its own instrument the way a gift card is — it already lives on the over-paid order — so this points at that order rather than duplicating the balance onto a second record. NULL for every other tender type.
    */
    get SourceOrderHeaderID(): string | null {
        return this.Get('SourceOrderHeaderID');
    }
    set SourceOrderHeaderID(value: string | null) {
        this.Set('SourceOrderHeaderID', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: PaymentType
    * * Display Name: Payment Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentType(): string {
        return this.Get('PaymentType');
    }

    /**
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider Name
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string | null {
        return this.Get('PaymentProvider');
    }

    /**
    * * Field Name: SourceCustomerPaymentMethod
    * * Display Name: Payment Method Name
    * * SQL Data Type: nvarchar(100)
    */
    get SourceCustomerPaymentMethod(): string | null {
        return this.Get('SourceCustomerPaymentMethod');
    }

    /**
    * * Field Name: StoredValueAccount
    * * Display Name: Stored Value Account Name
    * * SQL Data Type: nvarchar(60)
    */
    get StoredValueAccount(): string | null {
        return this.Get('StoredValueAccount');
    }

    /**
    * * Field Name: SourceOrderHeader
    * * Display Name: Source Order Name
    * * SQL Data Type: nvarchar(40)
    */
    get SourceOrderHeader(): string | null {
        return this.Get('SourceOrderHeader');
    }
}


/**
 * MJ_BizApps_Orders: Payment Headers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentHeader
 * * Base View: vwPaymentHeaders
 * * @description A money movement: a customer receipt or a reversal (refund/chargeback/bank return). Booked to accounting at capture; applied to orders via PaymentLine.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Headers')
export class mjBizAppsOrdersPaymentHeaderEntity extends BaseEntity<mjBizAppsOrdersPaymentHeaderEntityType> {

  /**
  * Related records: MJ_BizApps_Orders: Payment Lines
  *
  * Loads, validates and persists as one unit with this MJ_BizApps_Orders: Payment Headers record — see
  * guides/TRANSACTIONS_AND_BATCHING_GUIDE.md. Declared by the RelatedRecordCollection metadata on
  * the 'MJ_BizApps_Orders: Payment Headers → MJ_BizApps_Orders: Payment Lines' relationship; edit that row, not this file.
  *
  */
  public readonly Lines = this.DeclareRelatedRecords<mjBizAppsOrdersPaymentLineEntity>({
      Name: 'Lines',
        RelatedEntity: 'MJ_BizApps_Orders: Payment Lines',
        RelatedEntityJoinField: 'PaymentHeaderID',
        OrderBy: 'AllocatedAt ASC',
        Load: 'explicit',
        OnRemove: 'delete',
        Source: 'database',
  });

    /**
    * Loads the MJ_BizApps_Orders: Payment Headers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Headers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentHeaderEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PaymentNumber
    * * Display Name: Payment Number
    * * SQL Data Type: nvarchar(40)
    * * Description: Human-readable payment identifier (PAY-{seq}). Unique.
    */
    get PaymentNumber(): string {
        return this.Get('PaymentNumber');
    }
    set PaymentNumber(value: string) {
        this.Set('PaymentNumber', value);
    }

    /**
    * * Field Name: ReceivingCompanyID
    * * Display Name: Receiving Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get ReceivingCompanyID(): string {
        return this.Get('ReceivingCompanyID');
    }
    set ReceivingCompanyID(value: string) {
        this.Set('ReceivingCompanyID', value);
    }

    /**
    * * Field Name: BillToPersonID
    * * Display Name: Bill To Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get BillToPersonID(): string | null {
        return this.Get('BillToPersonID');
    }
    set BillToPersonID(value: string | null) {
        this.Set('BillToPersonID', value);
    }

    /**
    * * Field Name: BillToOrganizationID
    * * Display Name: Bill To Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the paying organization (D65).
    */
    get BillToOrganizationID(): string | null {
        return this.Get('BillToOrganizationID');
    }
    set BillToOrganizationID(value: string | null) {
        this.Set('BillToOrganizationID', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: date
    * * Description: Date the money moved (bank date, not entry date).
    */
    get PaymentDate(): Date {
        return this.Get('PaymentDate');
    }
    set PaymentDate(value: Date) {
        this.Set('PaymentDate', value);
    }

    /**
    * * Field Name: PaymentTypeID
    * * Display Name: Payment Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Types (vwPaymentTypes.ID)
    */
    get PaymentTypeID(): string {
        return this.Get('PaymentTypeID');
    }
    set PaymentTypeID(value: string) {
        this.Set('PaymentTypeID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Gross amount received (negative for reversal methods).
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: ProcessingFeeAmount
    * * Display Name: Processing Fee Amount
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Processor fee withheld from this payment.
    */
    get ProcessingFeeAmount(): number {
        return this.Get('ProcessingFeeAmount');
    }
    set ProcessingFeeAmount(value: number) {
        this.Set('ProcessingFeeAmount', value);
    }

    /**
    * * Field Name: NetAmount
    * * Display Name: Net Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Net cash = Amount - ProcessingFeeAmount (engine-computed, BO-D47).
    */
    get NetAmount(): number | null {
        return this.Get('NetAmount');
    }
    set NetAmount(value: number | null) {
        this.Set('NetAmount', value);
    }

    /**
    * * Field Name: PaymentProviderID
    * * Display Name: Payment Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)
    */
    get PaymentProviderID(): string | null {
        return this.Get('PaymentProviderID');
    }
    set PaymentProviderID(value: string | null) {
        this.Set('PaymentProviderID', value);
    }

    /**
    * * Field Name: PaymentIntentID
    * * Display Name: Payment Intent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Intents (vwPaymentIntents.ID)
    */
    get PaymentIntentID(): string | null {
        return this.Get('PaymentIntentID');
    }
    set PaymentIntentID(value: string | null) {
        this.Set('PaymentIntentID', value);
    }

    /**
    * * Field Name: PaymentDetailID
    * * Display Name: Payment Detail ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Details (vwPaymentDetails.ID)
    */
    get PaymentDetailID(): string | null {
        return this.Get('PaymentDetailID');
    }
    set PaymentDetailID(value: string | null) {
        this.Set('PaymentDetailID', value);
    }

    /**
    * * Field Name: ProviderChargeID
    * * Display Name: Provider Charge ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side charge identifier (e.g. Stripe ch_...).
    */
    get ProviderChargeID(): string | null {
        return this.Get('ProviderChargeID');
    }
    set ProviderChargeID(value: string | null) {
        this.Set('ProviderChargeID', value);
    }

    /**
    * * Field Name: ProviderRefundID
    * * Display Name: Provider Refund ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side refund identifier when this payment is a provider refund.
    */
    get ProviderRefundID(): string | null {
        return this.Get('ProviderRefundID');
    }
    set ProviderRefundID(value: string | null) {
        this.Set('ProviderRefundID', value);
    }

    /**
    * * Field Name: ReversesPaymentHeaderID
    * * Display Name: Reverses Payment Header ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)
    */
    get ReversesPaymentHeaderID(): string | null {
        return this.Get('ReversesPaymentHeaderID');
    }
    set ReversesPaymentHeaderID(value: string | null) {
        this.Set('ReversesPaymentHeaderID', value);
    }

    /**
    * * Field Name: ReversalReason
    * * Display Name: Reversal Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reason this payment reverses another (required by validation when ReversesPaymentHeaderID is set).
    */
    get ReversalReason(): string | null {
        return this.Get('ReversalReason');
    }
    set ReversalReason(value: string | null) {
        this.Set('ReversalReason', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Captured
    *   * Disputed
    *   * Failed
    *   * Pending
    *   * Refunded
    * * Description: Pending | Captured | Failed | Refunded | Disputed. Financial fields freeze at Captured (DB trigger); corrections via reversal payments.
    */
    get Status(): 'Captured' | 'Disputed' | 'Failed' | 'Pending' | 'Refunded' {
        return this.Get('Status');
    }
    set Status(value: 'Captured' | 'Disputed' | 'Failed' | 'Pending' | 'Refunded') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: JournalEntryID
    * * Display Name: Journal Entry ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Accounting: Journal Entries (vwJournalEntries.ID)
    * * Description: FK to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).
    */
    get JournalEntryID(): string | null {
        return this.Get('JournalEntryID');
    }
    set JournalEntryID(value: string | null) {
        this.Set('JournalEntryID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Customer-facing description / memo.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Internal notes.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: IdempotencyKey
    * * Display Name: Idempotency Key
    * * SQL Data Type: nvarchar(200)
    */
    get IdempotencyKey(): string | null {
        return this.Get('IdempotencyKey');
    }
    set IdempotencyKey(value: string | null) {
        this.Set('IdempotencyKey', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ReceivingCompany
    * * Display Name: Receiving Company
    * * SQL Data Type: nvarchar(50)
    */
    get ReceivingCompany(): string {
        return this.Get('ReceivingCompany');
    }

    /**
    * * Field Name: BillToPerson
    * * Display Name: Bill To Person
    * * SQL Data Type: nvarchar(100)
    */
    get BillToPerson(): string | null {
        return this.Get('BillToPerson');
    }

    /**
    * * Field Name: BillToOrganization
    * * Display Name: Bill To Organization
    * * SQL Data Type: nvarchar(255)
    */
    get BillToOrganization(): string | null {
        return this.Get('BillToOrganization');
    }

    /**
    * * Field Name: PaymentType
    * * Display Name: Payment Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentType(): string {
        return this.Get('PaymentType');
    }

    /**
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string | null {
        return this.Get('PaymentProvider');
    }

    /**
    * * Field Name: PaymentIntent
    * * Display Name: Payment Intent
    * * SQL Data Type: nvarchar(100)
    */
    get PaymentIntent(): string | null {
        return this.Get('PaymentIntent');
    }

    /**
    * * Field Name: PaymentDetail
    * * Display Name: Payment Detail
    * * SQL Data Type: char(4)
    */
    get PaymentDetail(): string | null {
        return this.Get('PaymentDetail');
    }

    /**
    * * Field Name: ReversesPaymentHeader
    * * Display Name: Reverses Payment Header
    * * SQL Data Type: nvarchar(40)
    */
    get ReversesPaymentHeader(): string | null {
        return this.Get('ReversesPaymentHeader');
    }

    /**
    * * Field Name: JournalEntry
    * * Display Name: Journal Entry
    * * SQL Data Type: nvarchar(40)
    */
    get JournalEntry(): string | null {
        return this.Get('JournalEntry');
    }

    /**
    * * Field Name: RootReversesPaymentHeaderID
    * * Display Name: Root Reverses Payment Header ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesPaymentHeaderID(): string | null {
        return this.Get('RootReversesPaymentHeaderID');
    }
}


/**
 * MJ_BizApps_Orders: Payment Intents - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentIntent
 * * Base View: vwPaymentIntents
 * * @description Provider-side collection state (BO-D26; Stripe-shaped). The Manual provider skips intents entirely.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Intents')
export class mjBizAppsOrdersPaymentIntentEntity extends BaseEntity<mjBizAppsOrdersPaymentIntentEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Intents record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Intents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentIntentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PaymentProviderID
    * * Display Name: Payment Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)
    */
    get PaymentProviderID(): string {
        return this.Get('PaymentProviderID');
    }
    set PaymentProviderID(value: string) {
        this.Set('PaymentProviderID', value);
    }

    /**
    * * Field Name: ProviderIntentID
    * * Display Name: Provider Intent ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side intent identifier (e.g. Stripe pi_...). Unique.
    */
    get ProviderIntentID(): string {
        return this.Get('ProviderIntentID');
    }
    set ProviderIntentID(value: string) {
        this.Set('ProviderIntentID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Failed
    *   * Processing
    *   * RequiresPayment
    *   * Succeeded
    * * Description: RequiresPayment | Processing | Succeeded | Canceled | Failed. Mirrors the provider lifecycle.
    */
    get Status(): 'Canceled' | 'Failed' | 'Processing' | 'RequiresPayment' | 'Succeeded' {
        return this.Get('Status');
    }
    set Status(value: 'Canceled' | 'Failed' | 'Processing' | 'RequiresPayment' | 'Succeeded') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Amount being collected.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get OrderHeaderID(): string | null {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string | null) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: BillToPersonID
    * * Display Name: Bill To Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get BillToPersonID(): string | null {
        return this.Get('BillToPersonID');
    }
    set BillToPersonID(value: string | null) {
        this.Set('BillToPersonID', value);
    }

    /**
    * * Field Name: BillToOrganizationID
    * * Display Name: Bill To Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the organization being collected from (D65).
    */
    get BillToOrganizationID(): string | null {
        return this.Get('BillToOrganizationID');
    }
    set BillToOrganizationID(value: string | null) {
        this.Set('BillToOrganizationID', value);
    }

    /**
    * * Field Name: ProviderEventID
    * * Display Name: Provider Event ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Last processed provider webhook event id — the idempotency key (unique when present).
    */
    get ProviderEventID(): string | null {
        return this.Get('ProviderEventID');
    }
    set ProviderEventID(value: string | null) {
        this.Set('ProviderEventID', value);
    }

    /**
    * * Field Name: LastEventAt
    * * Display Name: Last Event At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp of the last provider event applied to this intent.
    */
    get LastEventAt(): Date | null {
        return this.Get('LastEventAt');
    }
    set LastEventAt(value: Date | null) {
        this.Set('LastEventAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string {
        return this.Get('PaymentProvider');
    }

    /**
    * * Field Name: OrderHeader
    * * Display Name: Order Header
    * * SQL Data Type: nvarchar(40)
    */
    get OrderHeader(): string | null {
        return this.Get('OrderHeader');
    }

    /**
    * * Field Name: BillToPerson
    * * Display Name: Bill To Person Name
    * * SQL Data Type: nvarchar(100)
    */
    get BillToPerson(): string | null {
        return this.Get('BillToPerson');
    }

    /**
    * * Field Name: BillToOrganization
    * * Display Name: Bill To Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get BillToOrganization(): string | null {
        return this.Get('BillToOrganization');
    }
}


/**
 * MJ_BizApps_Orders: Payment Lines - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentLine
 * * Base View: vwPaymentLines
 * * @description Cash application junction (BO-D16/D45): how much of a payment settles which order (optionally which line). Negative Amount applies a credit memo.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Lines')
export class mjBizAppsOrdersPaymentLineEntity extends BaseEntity<mjBizAppsOrdersPaymentLineEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Lines record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentLineEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Payment Lines entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Amount: The allocated amount cannot be zero. Every allocation must represent a positive or negative financial value.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAmountNotZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The allocated amount cannot be zero. Every allocation must represent a positive or negative financial value.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountNotZero(result: ValidationResult) {
    	if (this.Amount === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Amount",
    			"The allocation amount cannot be zero.",
    			this.Amount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PaymentHeaderID
    * * Display Name: Payment Header
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)
    */
    get PaymentHeaderID(): string {
        return this.Get('PaymentHeaderID');
    }
    set PaymentHeaderID(value: string) {
        this.Set('PaymentHeaderID', value);
    }

    /**
    * * Field Name: OrderHeaderID
    * * Display Name: Order Header
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get OrderHeaderID(): string {
        return this.Get('OrderHeaderID');
    }
    set OrderHeaderID(value: string) {
        this.Set('OrderHeaderID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string | null {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string | null) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Amount of the payment applied to this order (<> 0; negative when applying a credit memo).
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: AllocatedAt
    * * Display Name: Allocated At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp when this application was made.
    */
    get AllocatedAt(): Date {
        return this.Get('AllocatedAt');
    }
    set AllocatedAt(value: Date) {
        this.Set('AllocatedAt', value);
    }

    /**
    * * Field Name: AllocatedByUserID
    * * Display Name: Allocated By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get AllocatedByUserID(): string | null {
        return this.Get('AllocatedByUserID');
    }
    set AllocatedByUserID(value: string | null) {
        this.Set('AllocatedByUserID', value);
    }

    /**
    * * Field Name: BookedAt
    * * Display Name: Booked At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp when this allocation's journal entries were written; NULL until booked. Not a JournalEntryID: one payment line produces one entry PER COMPANY owning a line on the order it settles, so there is no single entry to point at — the entries are found via accounting's provenance pair (LinkedEntityID = Payment Lines, LinkedRecordID = this row). Idempotency key: checked before booking so a re-save never doubles the cash leg.
    */
    get BookedAt(): Date | null {
        return this.Get('BookedAt');
    }
    set BookedAt(value: Date | null) {
        this.Set('BookedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PaymentHeader
    * * Display Name: Payment Header Name
    * * SQL Data Type: nvarchar(40)
    */
    get PaymentHeader(): string {
        return this.Get('PaymentHeader');
    }

    /**
    * * Field Name: OrderHeader
    * * Display Name: Order Header Name
    * * SQL Data Type: nvarchar(40)
    */
    get OrderHeader(): string {
        return this.Get('OrderHeader');
    }

    /**
    * * Field Name: AllocatedByUser
    * * Display Name: Allocated By User
    * * SQL Data Type: nvarchar(100)
    */
    get AllocatedByUser(): string | null {
        return this.Get('AllocatedByUser');
    }
}


/**
 * MJ_BizApps_Orders: Payment Provider Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentProviderType
 * * Base View: vwPaymentProviderTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Provider Types')
export class mjBizAppsOrdersPaymentProviderTypeEntity extends BaseEntity<mjBizAppsOrdersPaymentProviderTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Provider Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Provider Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentProviderTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(200)
    */
    get DriverClass(): string | null {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string | null) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: SupportsTokenization
    * * Display Name: Supports Tokenization
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get SupportsTokenization(): boolean {
        return this.Get('SupportsTokenization');
    }
    set SupportsTokenization(value: boolean) {
        this.Set('SupportsTokenization', value);
    }

    /**
    * * Field Name: SupportsRefund
    * * Display Name: Supports Refund
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get SupportsRefund(): boolean {
        return this.Get('SupportsRefund');
    }
    set SupportsRefund(value: boolean) {
        this.Set('SupportsRefund', value);
    }

    /**
    * * Field Name: SupportsWebhooks
    * * Display Name: Supports Webhooks
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get SupportsWebhooks(): boolean {
        return this.Get('SupportsWebhooks');
    }
    set SupportsWebhooks(value: boolean) {
        this.Set('SupportsWebhooks', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Payment Providers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentProvider
 * * Base View: vwPaymentProviders
 * * @description A configured payment-processing account (Stripe account, or the built-in Manual provider) owned by one company.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Providers')
export class mjBizAppsOrdersPaymentProviderEntity extends BaseEntity<mjBizAppsOrdersPaymentProviderEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Providers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Providers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentProviderEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PaymentProviderTypeID
    * * Display Name: Payment Provider Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Provider Types (vwPaymentProviderTypes.ID)
    */
    get PaymentProviderTypeID(): string {
        return this.Get('PaymentProviderTypeID');
    }
    set PaymentProviderTypeID(value: string) {
        this.Set('PaymentProviderTypeID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of this provider account.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CredentialsRef
    * * Display Name: Credentials Reference
    * * SQL Data Type: nvarchar(200)
    * * Description: MJ Credentials engine key referencing the provider credentials. NEVER a secret value at rest.
    */
    get CredentialsRef(): string | null {
        return this.Get('CredentialsRef');
    }
    set CredentialsRef(value: string | null) {
        this.Set('CredentialsRef', value);
    }

    /**
    * * Field Name: IsLiveMode
    * * Display Name: Is Live Mode
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this account points at the provider's live environment (vs test/sandbox).
    */
    get IsLiveMode(): boolean {
        return this.Get('IsLiveMode');
    }
    set IsLiveMode(value: boolean) {
        this.Set('IsLiveMode', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this provider account is active.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PaymentProviderType
    * * Display Name: Provider Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProviderType(): string {
        return this.Get('PaymentProviderType');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }
}


/**
 * MJ_BizApps_Orders: Payment Sequences - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentSequence
 * * Base View: vwPaymentSequences
 * * @description Global singleton counter (ID=1) minting gap-conscious PAY-{seq} payment numbers. Consumed only by the entity server.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Sequences')
export class mjBizAppsOrdersPaymentSequenceEntity extends BaseEntity<mjBizAppsOrdersPaymentSequenceEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Sequences record from the database
    * @param ID: number - primary key value to load the MJ_BizApps_Orders: Payment Sequences record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentSequenceEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Payment Sequences entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ID: The ID must be exactly 1 to ensure the table only contains a single configuration or state record.
    * * NextSequenceNumber: The next sequence number must be a positive integer greater than zero to ensure sequential ordering remains valid.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateIdIsOne(result);
        this.ValidateNextSequenceNumberGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The ID must be exactly 1 to ensure the table only contains a single configuration or state record.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateIdIsOne(result: ValidationResult) {
    	if (this.ID !== 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ID",
    			"The ID must be exactly 1 to ensure this remains a single-row configuration table.",
    			this.ID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The next sequence number must be a positive integer greater than zero to ensure sequential ordering remains valid.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNextSequenceNumberGreaterThanZero(result: ValidationResult) {
    	if (this.NextSequenceNumber != null && this.NextSequenceNumber <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NextSequenceNumber",
    			"The next sequence number must be greater than zero.",
    			this.NextSequenceNumber,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    * * Default Value: 1
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: NextSequenceNumber
    * * Display Name: Next Sequence Number
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: The next payment sequence number to assign.
    */
    get NextSequenceNumber(): number {
        return this.Get('NextSequenceNumber');
    }
    set NextSequenceNumber(value: number) {
        this.Set('NextSequenceNumber', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Payment Terms Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentTermsType
 * * Base View: vwPaymentTermsTypes
 * * @description Payment terms lookup (Net 30, Due on Receipt, ...). Owned by Orders; NetDays derives Order.DueDate from the posting date. Seed rows via metadata sync.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Terms Types')
export class mjBizAppsOrdersPaymentTermsTypeEntity extends BaseEntity<mjBizAppsOrdersPaymentTermsTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Terms Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Terms Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentTermsTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Payment Terms Types entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * NetDays: The number of net days for payment terms must be zero or a positive number.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateNetDaysGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The number of net days for payment terms must be zero or a positive number.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNetDaysGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.NetDays != null && this.NetDays < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NetDays",
    			"Net days cannot be negative. Please enter 0 or a positive number.",
    			this.NetDays,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    * * Description: Stable machine code (Net30, DueOnReceipt, Prepaid, ...). Unique.
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the payment terms.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: NetDays
    * * Display Name: Net Days
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Days from the posting date to DueDate (0 = due on receipt).
    */
    get NetDays(): number {
        return this.Get('NetDays');
    }
    set NetDays(value: number) {
        this.Set('NetDays', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional description of the terms.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether these terms are active and selectable.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Payment Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PaymentType
 * * Base View: vwPaymentTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payment Types')
export class mjBizAppsOrdersPaymentTypeEntity extends BaseEntity<mjBizAppsOrdersPaymentTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payment Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payment Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsReversal
    * * Display Name: Is Reversal
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsReversal(): boolean {
        return this.Get('IsReversal');
    }
    set IsReversal(value: boolean) {
        this.Set('IsReversal', value);
    }

    /**
    * * Field Name: RequiresProvider
    * * Display Name: Requires Provider
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresProvider(): boolean {
        return this.Get('RequiresProvider');
    }
    set RequiresProvider(value: boolean) {
        this.Set('RequiresProvider', value);
    }

    /**
    * * Field Name: RequiresInstrument
    * * Display Name: Requires Instrument
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresInstrument(): boolean {
        return this.Get('RequiresInstrument');
    }
    set RequiresInstrument(value: boolean) {
        this.Set('RequiresInstrument', value);
    }

    /**
    * * Field Name: RequiresReference
    * * Display Name: Requires Reference
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresReference(): boolean {
        return this.Get('RequiresReference');
    }
    set RequiresReference(value: boolean) {
        this.Set('RequiresReference', value);
    }

    /**
    * * Field Name: DetailExtensionEntity
    * * Display Name: Detail Extension Entity
    * * SQL Data Type: nvarchar(255)
    */
    get DetailExtensionEntity(): string | null {
        return this.Get('DetailExtensionEntity');
    }
    set DetailExtensionEntity(value: string | null) {
        this.Set('DetailExtensionEntity', value);
    }

    /**
    * * Field Name: BookProcessingFeeInline
    * * Display Name: Book Processing Fee Inline
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When 1, a capture with a processor fee books it as its own journal entry (Dr Processing Fee / Cr Cash). DEFAULT 0: a per-payment fee leg cannot reconcile to a bank statement, because the processor batches into payouts and deducts costs that never attach to any payment - a failed-debit charge, a dispute fee, a monthly platform charge - so the whole processor cost is accrued in the accounting system at month end instead (D82). The fee is still READ from the gateway and still stored on PaymentHeader.ProcessingFeeAmount and NetAmount regardless; this flag decides only whether it becomes a ledger entry. Turn it on only for a tender whose per-payment fee attribution is genuinely needed, and expect to reconcile the difference.
    */
    get BookProcessingFeeInline(): boolean {
        return this.Get('BookProcessingFeeInline');
    }
    set BookProcessingFeeInline(value: boolean) {
        this.Set('BookProcessingFeeInline', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Price List Assignments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PriceListAssignment
 * * Base View: vwPriceListAssignments
 * * @description Which price list a customer gets - the link nothing in the schema previously provided. PriceListID existed only on ProductPrice, so the schema could say what a product cost ON a list but never WHICH list applied to an order. A customer with no assignment resolves to the product base price, so no default-assignment row is needed.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Price List Assignments')
export class mjBizAppsOrdersPriceListAssignmentEntity extends BaseEntity<mjBizAppsOrdersPriceListAssignmentEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Price List Assignments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Price List Assignments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPriceListAssignmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Price List Assignments entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: If both a start date and an end date are specified, the end date must be later than the start date.
    * * Table-Level: Each record must be associated with either an Organization or a Person, but not both. Exactly one of these associations is required.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndedAtAfterStartedAt(result);
        this.ValidateExclusiveOrganizationOrPerson(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If both a start date and an end date are specified, the end date must be later than the start date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
    	if (this.StartedAt != null && this.EndedAt != null) {
    		if (this.EndedAt <= this.StartedAt) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EndedAt",
    				"The end date must be after the start date.",
    				this.EndedAt,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * Each record must be associated with either an Organization or a Person, but not both. Exactly one of these associations is required.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateExclusiveOrganizationOrPerson(result: ValidationResult) {
        const hasOrganization = this.OrganizationID != null;
        const hasPerson = this.PersonID != null;
    
        if (hasOrganization && hasPerson) {
            result.Errors.push(new ValidationErrorInfo(
                "OrganizationID",
                "Cannot associate with both an Organization and a Person. Please choose only one.",
                this.OrganizationID,
                ValidationErrorType.Failure
            ));
            result.Errors.push(new ValidationErrorInfo(
                "PersonID",
                "Cannot associate with both an Organization and a Person. Please choose only one.",
                this.PersonID,
                ValidationErrorType.Failure
            ));
        } else if (!hasOrganization && !hasPerson) {
            result.Errors.push(new ValidationErrorInfo(
                "OrganizationID",
                "You must specify either an Organization or a Person.",
                null,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PriceListID
    * * Display Name: Price List ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)
    */
    get PriceListID(): string {
        return this.Get('PriceListID');
    }
    set PriceListID(value: string) {
        this.Set('PriceListID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Breaks the tie when a person's own assignment and their organization's both apply. Higher wins.
    */
    get Priority(): number {
        return this.Get('Priority');
    }
    set Priority(value: number) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetimeoffset
    */
    get EndedAt(): Date | null {
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PriceList
    * * Display Name: Price List
    * * SQL Data Type: nvarchar(200)
    */
    get PriceList(): string {
        return this.Get('PriceList');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(100)
    */
    get Person(): string | null {
        return this.Get('Person');
    }
}


/**
 * MJ_BizApps_Orders: Price Lists - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PriceList
 * * Base View: vwPriceLists
 * * @description Pricing segmentation container (BO-D33): region/channel/customer-tier scope, effective-dated. Currency column deferred with FX (MOD-4).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Price Lists')
export class mjBizAppsOrdersPriceListEntity extends BaseEntity<mjBizAppsOrdersPriceListEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Price Lists record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Price Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPriceListEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Price Lists entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The effective end date must be on or after the effective start date when both dates are provided.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEffectiveToAfterEffectiveFrom(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The effective end date must be on or after the effective start date when both dates are provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEffectiveToAfterEffectiveFrom(result: ValidationResult) {
    	if (this.EffectiveFrom != null && this.EffectiveTo != null) {
    		if (this.EffectiveTo < this.EffectiveFrom) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EffectiveTo",
    				"The Effective To date must be on or after the Effective From date.",
    				this.EffectiveTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    * * Description: Stable machine code. Unique.
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: EffectiveFrom
    * * Display Name: Effective From
    * * SQL Data Type: date
    * * Description: List validity start.
    */
    get EffectiveFrom(): Date | null {
        return this.Get('EffectiveFrom');
    }
    set EffectiveFrom(value: Date | null) {
        this.Set('EffectiveFrom', value);
    }

    /**
    * * Field Name: EffectiveTo
    * * Display Name: Effective To
    * * SQL Data Type: date
    * * Description: List validity end.
    */
    get EffectiveTo(): Date | null {
        return this.Get('EffectiveTo');
    }
    set EffectiveTo(value: Date | null) {
        this.Set('EffectiveTo', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Active | Inactive. Deliberately NO CompanyID on this table: every price in a list points at a Product that already carries its company, so a column here would only be an administrative guardrail - and it would force a group-wide member rate to be duplicated per company.
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Price Tiers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PriceTier
 * * Base View: vwPriceTiers
 * * @description Volume/quantity break under a Tiered or Volume ProductPrice (BO-D33).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Price Tiers')
export class mjBizAppsOrdersPriceTierEntity extends BaseEntity<mjBizAppsOrdersPriceTierEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Price Tiers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Price Tiers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPriceTierEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Price Tiers entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The maximum quantity must be greater than or equal to the minimum quantity when a maximum quantity is specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The maximum quantity must be greater than or equal to the minimum quantity when a maximum quantity is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result: ValidationResult) {
    	if (this.MaxQuantity != null && this.MaxQuantity < this.MinQuantity) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxQuantity",
    			"The maximum quantity (" + this.MaxQuantity + ") cannot be less than the minimum quantity (" + this.MinQuantity + ").",
    			this.MaxQuantity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProductPriceID
    * * Display Name: Product Price
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Prices (vwProductPrices.ID)
    */
    get ProductPriceID(): string {
        return this.Get('ProductPriceID');
    }
    set ProductPriceID(value: string) {
        this.Set('ProductPriceID', value);
    }

    /**
    * * Field Name: MinQuantity
    * * Display Name: Minimum Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Tier lower bound (inclusive).
    */
    get MinQuantity(): number {
        return this.Get('MinQuantity');
    }
    set MinQuantity(value: number) {
        this.Set('MinQuantity', value);
    }

    /**
    * * Field Name: MaxQuantity
    * * Display Name: Maximum Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Tier upper bound. NULL = unbounded top tier.
    */
    get MaxQuantity(): number | null {
        return this.Get('MaxQuantity');
    }
    set MaxQuantity(value: number | null) {
        this.Set('MaxQuantity', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: Per-unit (or flat) price within this tier.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order of tiers.
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Product Bundle Items - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductBundleItem
 * * Base View: vwProductBundleItems
 * * @description Component membership of a bundle product (BO-D32/D41): one structure powering bundle-line ordering and fast-path expansion.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Bundle Items')
export class mjBizAppsOrdersProductBundleItemEntity extends BaseEntity<mjBizAppsOrdersProductBundleItemEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Bundle Items record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Bundle Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductBundleItemEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Product Bundle Items entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Quantity: The quantity of a component product in a bundle must be greater than zero to ensure valid bundle definitions.
    * * Table-Level: A bundle product cannot have itself as a component. The bundle product and the component product must be different to prevent invalid self-referencing product configurations.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateQuantityGreaterThanZero(result);
        this.ValidateBundleProductAndComponentProductAreDifferent(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The quantity of a component product in a bundle must be greater than zero to ensure valid bundle definitions.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityGreaterThanZero(result: ValidationResult) {
    	if (this.Quantity != null && this.Quantity <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Quantity",
    			"Quantity must be greater than zero.",
    			this.Quantity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * A bundle product cannot have itself as a component. The bundle product and the component product must be different to prevent invalid self-referencing product configurations.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateBundleProductAndComponentProductAreDifferent(result: ValidationResult) {
    	if (this.BundleProductID != null && this.ComponentProductID != null && this.BundleProductID === this.ComponentProductID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ComponentProductID",
    			"The component product cannot be the same as the bundle product.",
    			this.ComponentProductID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BundleProductID
    * * Display Name: Bundle Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get BundleProductID(): string {
        return this.Get('BundleProductID');
    }
    set BundleProductID(value: string) {
        this.Set('BundleProductID', value);
    }

    /**
    * * Field Name: ComponentProductID
    * * Display Name: Component Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ComponentProductID(): string {
        return this.Get('ComponentProductID');
    }
    set ComponentProductID(value: string) {
        this.Set('ComponentProductID', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Default Value: 1
    * * Description: Quantity of the component per one bundle.
    */
    get Quantity(): number {
        return this.Get('Quantity');
    }
    set Quantity(value: number) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: PricingMode
    * * Display Name: Pricing Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Bundled
    * * Value List Type: List
    * * Possible Values 
    *   * Bundled
    *   * SumOfParts
    * * Description: Bundled (fixed bundle price, SSP-allocated) | SumOfParts (components price individually).
    */
    get PricingMode(): 'Bundled' | 'SumOfParts' {
        return this.Get('PricingMode');
    }
    set PricingMode(value: 'Bundled' | 'SumOfParts') {
        this.Set('PricingMode', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order of components within the bundle.
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: BundleProduct
    * * Display Name: Bundle Product
    * * SQL Data Type: nvarchar(200)
    */
    get BundleProduct(): string {
        return this.Get('BundleProduct');
    }

    /**
    * * Field Name: ComponentProduct
    * * Display Name: Component Product
    * * SQL Data Type: nvarchar(200)
    */
    get ComponentProduct(): string {
        return this.Get('ComponentProduct');
    }
}


/**
 * MJ_BizApps_Orders: Product Categories - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductCategory
 * * Base View: vwProductCategories
 * * @description PER-COMPANY hierarchical grouping of products (D7): each company owns its own category tree; identical names across companies display-collapse in the UI. The account resolver walks the ParentProductCategoryID tree upward within the company.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Categories')
export class mjBizAppsOrdersProductCategoryEntity extends BaseEntity<mjBizAppsOrdersProductCategoryEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Categories record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Product Categories entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A product category cannot be its own parent category to prevent circular references in the category hierarchy.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateParentProductCategoryIDNotEqualToID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A product category cannot be its own parent category to prevent circular references in the category hierarchy.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateParentProductCategoryIDNotEqualToID(result: ValidationResult) {
        if (this.ParentProductCategoryID != null && this.ParentProductCategoryID === this.ID) {
            result.Errors.push(new ValidationErrorInfo(
                "ParentProductCategoryID",
                "A product category cannot be its own parent category.",
                this.ParentProductCategoryID,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    * * Description: The company that owns this category tree (D7). No shared/global categories. FK to __mj.Company.
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    * * Description: Stable machine code for the category. Unique when present.
    */
    get Code(): string | null {
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the category.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ParentProductCategoryID
    * * Display Name: Parent Category
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)
    */
    get ParentProductCategoryID(): string | null {
        return this.Get('ParentProductCategoryID');
    }
    set ParentProductCategoryID(value: string | null) {
        this.Set('ParentProductCategoryID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional description of the category.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this category is active and selectable.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: DefaultIsTaxable
    * * Display Name: Default Is Taxable
    * * SQL Data Type: bit
    * * Description: Default taxability for products in this category (D73). NULL means the walk continues to this category's PARENT, then upward to the root, and only then to the product type. Taxability resolves product -> category -> ancestors -> type, most specific wins - the same walk GL accounts use.
    */
    get DefaultIsTaxable(): boolean | null {
        return this.Get('DefaultIsTaxable');
    }
    set DefaultIsTaxable(value: boolean | null) {
        this.Set('DefaultIsTaxable', value);
    }

    /**
    * * Field Name: DefaultTaxCategory
    * * Display Name: Default Tax Category
    * * SQL Data Type: nvarchar(50)
    * * Description: Default taxability key for products in this category, matched against accounting's TaxRate.TaxCategory. NULL means the walk continues up the category tree and then to the product type.
    */
    get DefaultTaxCategory(): string | null {
        return this.Get('DefaultTaxCategory');
    }
    set DefaultTaxCategory(value: string | null) {
        this.Set('DefaultTaxCategory', value);
    }

    /**
    * * Field Name: DefaultEntitlementGrantTiming
    * * Display Name: Default Grant Timing
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull
    */
    get DefaultEntitlementGrantTiming(): 'OnActivation' | 'OnConfirm' | 'OnPaidInFull' | null {
        return this.Get('DefaultEntitlementGrantTiming');
    }
    set DefaultEntitlementGrantTiming(value: 'OnActivation' | 'OnConfirm' | 'OnPaidInFull' | null) {
        this.Set('DefaultEntitlementGrantTiming', value);
    }

    /**
    * * Field Name: DefaultEntitlementQuantityMode
    * * Display Name: Default Quantity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit
    */
    get DefaultEntitlementQuantityMode(): 'Flat' | 'PerUnit' | null {
        return this.Get('DefaultEntitlementQuantityMode');
    }
    set DefaultEntitlementQuantityMode(value: 'Flat' | 'PerUnit' | null) {
        this.Set('DefaultEntitlementQuantityMode', value);
    }

    /**
    * * Field Name: DefaultEntitlementValidityMode
    * * Display Name: Default Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm
    */
    get DefaultEntitlementValidityMode(): 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null {
        return this.Get('DefaultEntitlementValidityMode');
    }
    set DefaultEntitlementValidityMode(value: 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null) {
        this.Set('DefaultEntitlementValidityMode', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PricingDriverClass
    * * Display Name: Pricing Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of a BasePriceResolver subclass for every product in this category (and, unless overridden, its child categories), or NULL. See Product.PricingDriverClass for the resolution order.
    */
    get PricingDriverClass(): string | null {
        return this.Get('PricingDriverClass');
    }
    set PricingDriverClass(value: string | null) {
        this.Set('PricingDriverClass', value);
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: ParentProductCategory
    * * Display Name: Parent Category Name
    * * SQL Data Type: nvarchar(200)
    */
    get ParentProductCategory(): string | null {
        return this.Get('ParentProductCategory');
    }

    /**
    * * Field Name: RootParentProductCategoryID
    * * Display Name: Root Category
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentProductCategoryID(): string | null {
        return this.Get('RootParentProductCategoryID');
    }
}


/**
 * MJ_BizApps_Orders: Product Entitlements - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductEntitlement
 * * Base View: vwProductEntitlements
 * * @description The DEFINITION of what purchasing a product grants (BO-D34): feature, access level, or resource quantity. EntitlementGrant is the per-purchase instance.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Entitlements')
export class mjBizAppsOrdersProductEntitlementEntity extends BaseEntity<mjBizAppsOrdersProductEntitlementEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Entitlements record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Entitlements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductEntitlementEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Product Entitlements entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * AccessLagHours: Access lag hours, if specified, must be a non-negative number (0 or greater).
    * * AccessLeadHours: Access lead hours, if specified, must be greater than or equal to zero.
    * * Table-Level: When the validity mode is set to 'FixedDuration', the validity duration in days must be greater than 0 to ensure a valid duration is specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAccessLagHoursGreaterThanOrEqualToZero(result);
        this.ValidateAccessLeadHoursGreaterThanOrEqualToZero(result);
        this.ValidateValidityDurationDaysForFixedDurationMode(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Access lag hours, if specified, must be a non-negative number (0 or greater).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAccessLagHoursGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.AccessLagHours != null && this.AccessLagHours < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AccessLagHours",
    			"Access lag hours must be greater than or equal to 0.",
    			this.AccessLagHours,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Access lead hours, if specified, must be greater than or equal to zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAccessLeadHoursGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.AccessLeadHours != null && this.AccessLeadHours < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AccessLeadHours",
    			"Access lead hours must be greater than or equal to 0.",
    			this.AccessLeadHours,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * When the validity mode is set to 'FixedDuration', the validity duration in days must be greater than 0 to ensure a valid duration is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateValidityDurationDaysForFixedDurationMode(result: ValidationResult) {
        if (this.ValidityMode === "FixedDuration" && (this.ValidityDurationDays == null || this.ValidityDurationDays <= 0)) {
            result.Errors.push(new ValidationErrorInfo(
                "ValidityDurationDays",
                "Validity Duration Days must be greater than 0 when Validity Mode is set to 'FixedDuration'.",
                this.ValidityDurationDays,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: EntitlementType
    * * Display Name: Entitlement Type
    * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * AccessLevel
    *   * Custom
    *   * Feature
    *   * ResourceQuantity
    * * Description: Feature | AccessLevel | ResourceQuantity | Custom.
    */
    get EntitlementType(): 'AccessLevel' | 'Custom' | 'Feature' | 'ResourceQuantity' {
        return this.Get('EntitlementType');
    }
    set EntitlementType(value: 'AccessLevel' | 'Custom' | 'Feature' | 'ResourceQuantity') {
        this.Set('EntitlementType', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Entitlement Code
    * * SQL Data Type: nvarchar(80)
    * * Description: Machine key consumed by downstream apps (unique per product).
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the entitlement.
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Granted quantity for ResourceQuantity entitlements (e.g. 100 GB, 5 seats).
    */
    get Quantity(): number | null {
        return this.Get('Quantity');
    }
    set Quantity(value: number | null) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitOfMeasure
    * * Display Name: Unit of Measure
    * * SQL Data Type: nvarchar(40)
    * * Description: Unit for Quantity (GB, seats, hours, ...).
    */
    get UnitOfMeasure(): string | null {
        return this.Get('UnitOfMeasure');
    }
    set UnitOfMeasure(value: string | null) {
        this.Set('UnitOfMeasure', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this entitlement is currently granted by new purchases.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: ValidityMode
    * * Display Name: Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm
    */
    get ValidityMode(): 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null {
        return this.Get('ValidityMode');
    }
    set ValidityMode(value: 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null) {
        this.Set('ValidityMode', value);
    }

    /**
    * * Field Name: ValidityDurationDays
    * * Display Name: Validity Duration (Days)
    * * SQL Data Type: int
    */
    get ValidityDurationDays(): number | null {
        return this.Get('ValidityDurationDays');
    }
    set ValidityDurationDays(value: number | null) {
        this.Set('ValidityDurationDays', value);
    }

    /**
    * * Field Name: AccessLeadHours
    * * Display Name: Access Lead Hours
    * * SQL Data Type: int
    */
    get AccessLeadHours(): number | null {
        return this.Get('AccessLeadHours');
    }
    set AccessLeadHours(value: number | null) {
        this.Set('AccessLeadHours', value);
    }

    /**
    * * Field Name: AccessLagHours
    * * Display Name: Access Lag Hours
    * * SQL Data Type: int
    */
    get AccessLagHours(): number | null {
        return this.Get('AccessLagHours');
    }
    set AccessLagHours(value: number | null) {
        this.Set('AccessLagHours', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
    }
}


/**
 * MJ_BizApps_Orders: Product Prices - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductPrice
 * * Base View: vwProductPrices
 * * @description ONE ROW IS ONE PRICE RULE. Several rows per product and list express quantity bands, seasons, promotional windows and time-of-day rates; Priority disambiguates. The row carries both the applicability predicates and the outcome, so there is no separate rule table to keep in step. Ties on Priority are refused when WRITTEN, not resolved when read - an arbitrary winner between two applicable rules is stable in test and liable to flip in production.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Prices')
export class mjBizAppsOrdersProductPriceEntity extends BaseEntity<mjBizAppsOrdersProductPriceEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Prices record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Prices record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductPriceEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Product Prices entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The end date (Effective To) must be on or after the start date (Effective From) if an end date is specified.
    * * Table-Level: If both a minimum and maximum quantity are specified, the maximum quantity must be greater than or equal to the minimum quantity to ensure a valid range.
    * * Table-Level: If the pricing model is set to 'Package', a package quantity greater than zero must be specified.
    * * Table-Level: The maximum recurrence day of the month must be greater than or equal to the minimum recurrence day of the month when both are specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEffectiveToGreaterThanOrEqualToEffectiveFrom(result);
        this.ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result);
        this.ValidatePackageQuantityForPackagePricingModel(result);
        this.ValidateRecurrenceDayOfMonthRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The end date (Effective To) must be on or after the start date (Effective From) if an end date is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEffectiveToGreaterThanOrEqualToEffectiveFrom(result: ValidationResult) {
    	if (this.EffectiveTo != null && this.EffectiveFrom != null) {
    		if (this.EffectiveTo < this.EffectiveFrom) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EffectiveTo",
    				"The Effective To date must be on or after the Effective From date.",
    				this.EffectiveTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * If both a minimum and maximum quantity are specified, the maximum quantity must be greater than or equal to the minimum quantity to ensure a valid range.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result: ValidationResult) {
    	if (this.MinQuantity != null && this.MaxQuantity != null) {
    		if (this.MaxQuantity < this.MinQuantity) {
    			result.Errors.push(new ValidationErrorInfo(
    				"MaxQuantity",
    				"The maximum quantity must be greater than or equal to the minimum quantity.",
    				this.MaxQuantity,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * If the pricing model is set to 'Package', a package quantity greater than zero must be specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePackageQuantityForPackagePricingModel(result: ValidationResult) {
        if (this.PricingModel === "Package") {
            if (this.PackageQuantity == null || this.PackageQuantity <= 0) {
                result.Errors.push(new ValidationErrorInfo(
                    "PackageQuantity",
                    "Package Quantity must be greater than 0 when the Pricing Model is set to 'Package'.",
                    this.PackageQuantity,
                    ValidationErrorType.Failure
                ));
            }
        }
    }

    /**
    * The maximum recurrence day of the month must be greater than or equal to the minimum recurrence day of the month when both are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRecurrenceDayOfMonthRange(result: ValidationResult) {
    	if (this.RecurrenceDayOfMonthMin != null && this.RecurrenceDayOfMonthMax != null) {
    		if (this.RecurrenceDayOfMonthMax < this.RecurrenceDayOfMonthMin) {
    			result.Errors.push(new ValidationErrorInfo(
    				"RecurrenceDayOfMonthMax",
    				"The maximum recurrence day of the month (" + this.RecurrenceDayOfMonthMax + ") cannot be less than the minimum recurrence day of the month (" + this.RecurrenceDayOfMonthMin + ").",
    				this.RecurrenceDayOfMonthMax,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: PriceListID
    * * Display Name: Price List ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)
    * * Description: The list this rule belongs to. NULL means the product's BASE price, which is what a customer with no price-list assignment resolves to.
    */
    get PriceListID(): string | null {
        return this.Get('PriceListID');
    }
    set PriceListID(value: string | null) {
        this.Set('PriceListID', value);
    }

    /**
    * * Field Name: PricingModel
    * * Display Name: Pricing Model
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Flat
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * Package
    *   * PerUnit
    *   * Tiered
    *   * Usage
    *   * Volume
    * * Description: Flat | PerUnit | Tiered | Volume | Package | Usage.
    */
    get PricingModel(): 'Flat' | 'Package' | 'PerUnit' | 'Tiered' | 'Usage' | 'Volume' {
        return this.Get('PricingModel');
    }
    set PricingModel(value: 'Flat' | 'Package' | 'PerUnit' | 'Tiered' | 'Usage' | 'Volume') {
        this.Set('PricingModel', value);
    }

    /**
    * * Field Name: FeeType
    * * Display Name: Fee Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Standard
    * * Value List Type: List
    * * Possible Values 
    *   * Overage
    *   * Recurring
    *   * Setup
    *   * Standard
    * * Description: Standard | Setup | Recurring | Overage.
    */
    get FeeType(): 'Overage' | 'Recurring' | 'Setup' | 'Standard' {
        return this.Get('FeeType');
    }
    set FeeType(value: 'Overage' | 'Recurring' | 'Setup' | 'Standard') {
        this.Set('FeeType', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: Base/flat amount; tier detail lives in PriceTier.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: UnitOfMeasure
    * * Display Name: Unit Of Measure
    * * SQL Data Type: nvarchar(40)
    * * Description: Pricing unit (each, month, hour, GB, seat, ...).
    */
    get UnitOfMeasure(): string | null {
        return this.Get('UnitOfMeasure');
    }
    set UnitOfMeasure(value: string | null) {
        this.Set('UnitOfMeasure', value);
    }

    /**
    * * Field Name: PackageQuantity
    * * Display Name: Package Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Package model only: this many units for Amount (twelve for the price of ten).
    */
    get PackageQuantity(): number | null {
        return this.Get('PackageQuantity');
    }
    set PackageQuantity(value: number | null) {
        this.Set('PackageQuantity', value);
    }

    /**
    * * Field Name: MinQuantity
    * * Display Name: Minimum Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Minimum quantity this price applies to.
    */
    get MinQuantity(): number | null {
        return this.Get('MinQuantity');
    }
    set MinQuantity(value: number | null) {
        this.Set('MinQuantity', value);
    }

    /**
    * * Field Name: MaxQuantity
    * * Display Name: Maximum Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Maximum quantity this price applies to.
    */
    get MaxQuantity(): number | null {
        return this.Get('MaxQuantity');
    }
    set MaxQuantity(value: number | null) {
        this.Set('MaxQuantity', value);
    }

    /**
    * * Field Name: EffectiveFrom
    * * Display Name: Effective From
    * * SQL Data Type: date
    * * Description: Price validity start.
    */
    get EffectiveFrom(): Date {
        return this.Get('EffectiveFrom');
    }
    set EffectiveFrom(value: Date) {
        this.Set('EffectiveFrom', value);
    }

    /**
    * * Field Name: EffectiveTo
    * * Display Name: Effective To
    * * SQL Data Type: date
    * * Description: Price validity end.
    */
    get EffectiveTo(): Date | null {
        return this.Get('EffectiveTo');
    }
    set EffectiveTo(value: Date | null) {
        this.Set('EffectiveTo', value);
    }

    /**
    * * Field Name: RecurrenceMonths
    * * Display Name: Recurrence Months
    * * SQL Data Type: nvarchar(40)
    * * Description: Comma-separated month numbers this rule applies in, e.g. '11,12' for a winter rate. Evaluated in TypeScript and never filtered in SQL, which is why it is a string rather than a child table.
    */
    get RecurrenceMonths(): string | null {
        return this.Get('RecurrenceMonths');
    }
    set RecurrenceMonths(value: string | null) {
        this.Set('RecurrenceMonths', value);
    }

    /**
    * * Field Name: RecurrenceDaysOfWeek
    * * Display Name: Recurrence Days Of Week
    * * SQL Data Type: nvarchar(20)
    * * Description: Comma-separated ISO day numbers (Monday=1) this rule applies on.
    */
    get RecurrenceDaysOfWeek(): string | null {
        return this.Get('RecurrenceDaysOfWeek');
    }
    set RecurrenceDaysOfWeek(value: string | null) {
        this.Set('RecurrenceDaysOfWeek', value);
    }

    /**
    * * Field Name: RecurrenceDayOfMonthMin
    * * Display Name: Recurrence Day Of Month Min
    * * SQL Data Type: tinyint
    * * Description: Start of a day-of-month window, for rules like 'the first week of any month'.
    */
    get RecurrenceDayOfMonthMin(): number | null {
        return this.Get('RecurrenceDayOfMonthMin');
    }
    set RecurrenceDayOfMonthMin(value: number | null) {
        this.Set('RecurrenceDayOfMonthMin', value);
    }

    /**
    * * Field Name: RecurrenceDayOfMonthMax
    * * Display Name: Recurrence Day Of Month Max
    * * SQL Data Type: tinyint
    * * Description: End of the day-of-month window.
    */
    get RecurrenceDayOfMonthMax(): number | null {
        return this.Get('RecurrenceDayOfMonthMax');
    }
    set RecurrenceDayOfMonthMax(value: number | null) {
        this.Set('RecurrenceDayOfMonthMax', value);
    }

    /**
    * * Field Name: TimeOfDayStart
    * * Display Name: Time Of Day Start
    * * SQL Data Type: time
    * * Description: Start of a daily window, in the OWNING COMPANY's timezone. Left unstated, a happy-hour rate would run at the wrong hour for every entity but one.
    */
    get TimeOfDayStart(): Date | null {
        return this.Get('TimeOfDayStart');
    }
    set TimeOfDayStart(value: Date | null) {
        this.Set('TimeOfDayStart', value);
    }

    /**
    * * Field Name: TimeOfDayEnd
    * * Display Name: Time Of Day End
    * * SQL Data Type: time
    * * Description: End of the daily window, in the owning company's timezone.
    */
    get TimeOfDayEnd(): Date | null {
        return this.Get('TimeOfDayEnd');
    }
    set TimeOfDayEnd(value: Date | null) {
        this.Set('TimeOfDayEnd', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Disambiguates overlapping rules; highest wins. Two applicable rules sharing a priority are refused at write time.
    */
    get Priority(): number {
        return this.Get('Priority');
    }
    set Priority(value: number) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Active | Inactive. Only Active rules resolve.
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Why this rule exists, in words - the thing nobody can reconstruct from the predicates a year later.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
    }

    /**
    * * Field Name: PriceList
    * * Display Name: Price List
    * * SQL Data Type: nvarchar(200)
    */
    get PriceList(): string | null {
        return this.Get('PriceList');
    }
}


/**
 * MJ_BizApps_Orders: Product Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductType
 * * Base View: vwProductTypes
 * * @description Classifies products (e.g. Physical Good, Service, Subscription).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Types')
export class mjBizAppsOrdersProductTypeEntity extends BaseEntity<mjBizAppsOrdersProductTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    * * Description: Stable machine code (Event, Membership, PhysicalGood, ...). Unique when present; seeded types carry codes.
    */
    get Code(): string | null {
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the product type. Unique.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional description of the product type.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: RequiresFulfillment
    * * Display Name: Requires Fulfillment
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When 1, orders containing products of this type hold at Posted until a fulfiller marks every such line Fulfilled; when no line requires fulfillment the order auto-advances to Fulfilled.
    */
    get RequiresFulfillment(): boolean {
        return this.Get('RequiresFulfillment');
    }
    set RequiresFulfillment(value: boolean) {
        this.Set('RequiresFulfillment', value);
    }

    /**
    * * Field Name: DefaultRevenueRecognitionTypeID
    * * Display Name: Default Revenue Recognition Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)
    */
    get DefaultRevenueRecognitionTypeID(): string | null {
        return this.Get('DefaultRevenueRecognitionTypeID');
    }
    set DefaultRevenueRecognitionTypeID(value: string | null) {
        this.Set('DefaultRevenueRecognitionTypeID', value);
    }

    /**
    * * Field Name: DefaultIsTaxable
    * * Display Name: Default Is Taxable
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Default taxability stamped onto new products of this type.
    */
    get DefaultIsTaxable(): boolean {
        return this.Get('DefaultIsTaxable');
    }
    set DefaultIsTaxable(value: boolean) {
        this.Set('DefaultIsTaxable', value);
    }

    /**
    * * Field Name: DefaultTaxCategory
    * * Display Name: Default Tax Category
    * * SQL Data Type: nvarchar(50)
    * * Description: Default taxability key for products of this type - the backstop of the taxability walk, used when neither the product nor its category names one.
    */
    get DefaultTaxCategory(): string | null {
        return this.Get('DefaultTaxCategory');
    }
    set DefaultTaxCategory(value: string | null) {
        this.Set('DefaultTaxCategory', value);
    }

    /**
    * * Field Name: DefaultSubscriptionTypeID
    * * Display Name: Default Subscription Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)
    */
    get DefaultSubscriptionTypeID(): string | null {
        return this.Get('DefaultSubscriptionTypeID');
    }
    set DefaultSubscriptionTypeID(value: string | null) {
        this.Set('DefaultSubscriptionTypeID', value);
    }

    /**
    * * Field Name: ProductExtensionEntity
    * * Display Name: Product Extension Entity
    * * SQL Data Type: nvarchar(255)
    * * Description: MJ entity name of the IsA Product-level extension for this type (e.g. MJ_BizApps_Orders: Event Products). NULL = no extension (BO-D37).
    */
    get ProductExtensionEntity(): string | null {
        return this.Get('ProductExtensionEntity');
    }
    set ProductExtensionEntity(value: string | null) {
        this.Set('ProductExtensionEntity', value);
    }

    /**
    * * Field Name: OrderLineExtensionEntity
    * * Display Name: Order Line Extension Entity
    * * SQL Data Type: nvarchar(255)
    * * Description: MJ entity name of the IsA OrderLine-level extension for this type (e.g. MJ_BizApps_Orders: Event Order Lines). NULL = no extension (BO-D37).
    */
    get OrderLineExtensionEntity(): string | null {
        return this.Get('OrderLineExtensionEntity');
    }
    set OrderLineExtensionEntity(value: string | null) {
        this.Set('OrderLineExtensionEntity', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this type is active and selectable.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: DefaultEntitlementGrantTiming
    * * Display Name: Default Entitlement Grant Timing
    * * SQL Data Type: nvarchar(20)
    * * Default Value: OnConfirm
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull
    */
    get DefaultEntitlementGrantTiming(): 'OnActivation' | 'OnConfirm' | 'OnPaidInFull' {
        return this.Get('DefaultEntitlementGrantTiming');
    }
    set DefaultEntitlementGrantTiming(value: 'OnActivation' | 'OnConfirm' | 'OnPaidInFull') {
        this.Set('DefaultEntitlementGrantTiming', value);
    }

    /**
    * * Field Name: DefaultEntitlementQuantityMode
    * * Display Name: Default Entitlement Quantity Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: PerUnit
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit
    */
    get DefaultEntitlementQuantityMode(): 'Flat' | 'PerUnit' {
        return this.Get('DefaultEntitlementQuantityMode');
    }
    set DefaultEntitlementQuantityMode(value: 'Flat' | 'PerUnit') {
        this.Set('DefaultEntitlementQuantityMode', value);
    }

    /**
    * * Field Name: DefaultEntitlementValidityMode
    * * Display Name: Default Entitlement Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Perpetual
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm
    */
    get DefaultEntitlementValidityMode(): 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' {
        return this.Get('DefaultEntitlementValidityMode');
    }
    set DefaultEntitlementValidityMode(value: 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm') {
        this.Set('DefaultEntitlementValidityMode', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PricingDriverClass
    * * Display Name: Pricing Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of a BasePriceResolver subclass for every product of this type, or NULL. The natural home for behaviour-wide pricing such as usage metering.
    */
    get PricingDriverClass(): string | null {
        return this.Get('PricingDriverClass');
    }
    set PricingDriverClass(value: string | null) {
        this.Set('PricingDriverClass', value);
    }

    /**
    * * Field Name: DefaultRevenueRecognitionType
    * * Display Name: Default Revenue Recognition Type
    * * SQL Data Type: nvarchar(200)
    */
    get DefaultRevenueRecognitionType(): string | null {
        return this.Get('DefaultRevenueRecognitionType');
    }

    /**
    * * Field Name: DefaultSubscriptionType
    * * Display Name: Default Subscription Type
    * * SQL Data Type: nvarchar(200)
    */
    get DefaultSubscriptionType(): string | null {
        return this.Get('DefaultSubscriptionType');
    }
}


/**
 * MJ_BizApps_Orders: Products - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: Product
 * * Base View: vwProducts
 * * @description A catalog item that can be ordered. GL accounts are NOT stored here — accounting's GLAccountLink points at Product rows (role-mapped, date-effective).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Products')
export class mjBizAppsOrdersProductEntity extends BaseEntity<mjBizAppsOrdersProductEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Products record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Products entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The availability end date must be on or after the availability start date when both dates are provided.
    * * Table-Level: A product cannot be its own successor. If a successor product is specified, it must be a different product to prevent circular references.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAvailableToOnOrAfterAvailableFrom(result);
        this.ValidateSuccessorProductIDNotEqualToID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The availability end date must be on or after the availability start date when both dates are provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAvailableToOnOrAfterAvailableFrom(result: ValidationResult) {
    	if (this.AvailableFrom != null && this.AvailableTo != null) {
    		const fromDate = new Date(this.AvailableFrom).getTime();
    		const toDate = new Date(this.AvailableTo).getTime();
    		if (toDate < fromDate) {
    			result.Errors.push(new ValidationErrorInfo(
    				"AvailableTo",
    				"The availability end date (AvailableTo) must be on or after the availability start date (AvailableFrom).",
    				this.AvailableTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * A product cannot be its own successor. If a successor product is specified, it must be a different product to prevent circular references.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSuccessorProductIDNotEqualToID(result: ValidationResult) {
    	if (this.SuccessorProductID != null && this.SuccessorProductID === this.ID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"SuccessorProductID",
    			"A product cannot be its own successor. Please select a different successor product.",
    			this.SuccessorProductID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the product.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(80)
    * * Description: Stock-keeping unit / product code. Unique when present.
    */
    get SKU(): string | null {
        return this.Get('SKU');
    }
    set SKU(value: string | null) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: ProductTypeID
    * * Display Name: Product Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Types (vwProductTypes.ID)
    */
    get ProductTypeID(): string {
        return this.Get('ProductTypeID');
    }
    set ProductTypeID(value: string) {
        this.Set('ProductTypeID', value);
    }

    /**
    * * Field Name: ProductCategoryID
    * * Display Name: Product Category
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)
    */
    get ProductCategoryID(): string {
        return this.Get('ProductCategoryID');
    }
    set ProductCategoryID(value: string) {
        this.Set('ProductCategoryID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    * * Description: The company whose revenue this product accrues to — the SOURCE OF TRUTH for order-line ownership (D6). Stamped onto OrderLine.CompanyID at line save. GL routing is via accounting's GLAccountLink, anchored at this company (D5).
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Discontinued
    *   * Draft
    *   * EOL
    * * Description: Draft | Active | Discontinued | EOL — catalog lifecycle. Data-only until the catalog engine gates ordering on it.
    */
    get Status(): 'Active' | 'Discontinued' | 'Draft' | 'EOL' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Discontinued' | 'Draft' | 'EOL') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SuccessorProductID
    * * Display Name: Successor Product
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get SuccessorProductID(): string | null {
        return this.Get('SuccessorProductID');
    }
    set SuccessorProductID(value: string | null) {
        this.Set('SuccessorProductID', value);
    }

    /**
    * * Field Name: AvailableFrom
    * * Display Name: Available From
    * * SQL Data Type: date
    * * Description: First date the product may be sold.
    */
    get AvailableFrom(): Date | null {
        return this.Get('AvailableFrom');
    }
    set AvailableFrom(value: Date | null) {
        this.Set('AvailableFrom', value);
    }

    /**
    * * Field Name: AvailableTo
    * * Display Name: Available To
    * * SQL Data Type: date
    * * Description: Last date the product may be sold.
    */
    get AvailableTo(): Date | null {
        return this.Get('AvailableTo');
    }
    set AvailableTo(value: Date | null) {
        this.Set('AvailableTo', value);
    }

    /**
    * * Field Name: RevenueRecognitionTypeID
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)
    * * Description: HOW revenue for this product is earned (plan D43). Resolves to a pluggable driver via RevenueRecognitionType.DriverClass; the driver returns a schedule and the order entity turns it into forward-dated journal entries.
    */
    get RevenueRecognitionTypeID(): string {
        return this.Get('RevenueRecognitionTypeID');
    }
    set RevenueRecognitionTypeID(value: string) {
        this.Set('RevenueRecognitionTypeID', value);
    }

    /**
    * * Field Name: StandaloneSellingPrice
    * * Display Name: Standalone Selling Price
    * * SQL Data Type: decimal(19, 4)
    * * Description: Standalone selling price for ASC 606 bundle revenue allocation (BO-D35; fields now, allocation engine later).
    */
    get StandaloneSellingPrice(): number | null {
        return this.Get('StandaloneSellingPrice');
    }
    set StandaloneSellingPrice(value: number | null) {
        this.Set('StandaloneSellingPrice', value);
    }

    /**
    * * Field Name: SubscriptionTypeID
    * * Display Name: Subscription Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)
    */
    get SubscriptionTypeID(): string | null {
        return this.Get('SubscriptionTypeID');
    }
    set SubscriptionTypeID(value: string | null) {
        this.Set('SubscriptionTypeID', value);
    }

    /**
    * * Field Name: IsTaxable
    * * Display Name: Is Taxable
    * * SQL Data Type: bit
    * * Description: Whether this product is subject to tax (tax subsystem lands at O4).
    */
    get IsTaxable(): boolean | null {
        return this.Get('IsTaxable');
    }
    set IsTaxable(value: boolean | null) {
        this.Set('IsTaxable', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional description of the product.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TaxCategory
    * * Display Name: Tax Category
    * * SQL Data Type: nvarchar(50)
    * * Description: Taxability key, matched against accounting's TaxRate.TaxCategory. A string rather than a lookup table because accounting already keys taxability by string, and a table here would need syncing to it and could drift.
    */
    get TaxCategory(): string | null {
        return this.Get('TaxCategory');
    }
    set TaxCategory(value: string | null) {
        this.Set('TaxCategory', value);
    }

    /**
    * * Field Name: EntitlementGrantTiming
    * * Display Name: Entitlement Grant Timing
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * OnActivation
    *   * OnConfirm
    *   * OnPaidInFull
    */
    get EntitlementGrantTiming(): 'OnActivation' | 'OnConfirm' | 'OnPaidInFull' | null {
        return this.Get('EntitlementGrantTiming');
    }
    set EntitlementGrantTiming(value: 'OnActivation' | 'OnConfirm' | 'OnPaidInFull' | null) {
        this.Set('EntitlementGrantTiming', value);
    }

    /**
    * * Field Name: EntitlementQuantityMode
    * * Display Name: Entitlement Quantity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Flat
    *   * PerUnit
    */
    get EntitlementQuantityMode(): 'Flat' | 'PerUnit' | null {
        return this.Get('EntitlementQuantityMode');
    }
    set EntitlementQuantityMode(value: 'Flat' | 'PerUnit' | null) {
        this.Set('EntitlementQuantityMode', value);
    }

    /**
    * * Field Name: EntitlementValidityMode
    * * Display Name: Entitlement Validity Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * EventWindow
    *   * FixedDuration
    *   * Perpetual
    *   * SubscriptionTerm
    */
    get EntitlementValidityMode(): 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null {
        return this.Get('EntitlementValidityMode');
    }
    set EntitlementValidityMode(value: 'EventWindow' | 'FixedDuration' | 'Perpetual' | 'SubscriptionTerm' | null) {
        this.Set('EntitlementValidityMode', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PricingDriverClass
    * * Display Name: Pricing Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of a BasePriceResolver subclass that prices this, or NULL for the standard metadata-driven walk. Resolved most-specific-first: product, then up the category chain, then the type, then the company policy. A client may price LOCALLY only when every level is NULL; anything else escalates to the server, because a plugin's answer cannot be reproduced from metadata.
    */
    get PricingDriverClass(): string | null {
        return this.Get('PricingDriverClass');
    }
    set PricingDriverClass(value: string | null) {
        this.Set('PricingDriverClass', value);
    }

    /**
    * * Field Name: MaxQuantityPerLine
    * * Display Name: Max Quantity Per Line
    * * SQL Data Type: decimal(18, 4)
    * * Description: Maximum quantity allowed on a single order line. NULL = no cap. Set to 1 for products that are one person / one unit per line (e.g. conference tickets).
    */
    get MaxQuantityPerLine(): number | null {
        return this.Get('MaxQuantityPerLine');
    }
    set MaxQuantityPerLine(value: number | null) {
        this.Set('MaxQuantityPerLine', value);
    }

    /**
    * * Field Name: ProductType
    * * Display Name: Product Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get ProductType(): string {
        return this.Get('ProductType');
    }

    /**
    * * Field Name: ProductCategory
    * * Display Name: Product Category Name
    * * SQL Data Type: nvarchar(200)
    */
    get ProductCategory(): string {
        return this.Get('ProductCategory');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: SuccessorProduct
    * * Display Name: Successor Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get SuccessorProduct(): string | null {
        return this.Get('SuccessorProduct');
    }

    /**
    * * Field Name: RevenueRecognitionType
    * * Display Name: Revenue Recognition Name
    * * SQL Data Type: nvarchar(200)
    */
    get RevenueRecognitionType(): string {
        return this.Get('RevenueRecognitionType');
    }

    /**
    * * Field Name: SubscriptionType
    * * Display Name: Subscription Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get SubscriptionType(): string | null {
        return this.Get('SubscriptionType');
    }

    /**
    * * Field Name: RootSuccessorProductID
    * * Display Name: Root Successor Product
    * * SQL Data Type: uniqueidentifier
    */
    get RootSuccessorProductID(): string | null {
        return this.Get('RootSuccessorProductID');
    }
}


/**
 * MJ_BizApps_Orders: Promotion Codes - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PromotionCode
 * * Base View: vwPromotionCodes
 * * @description A redeemable string pointing at a Promotion. Deliberately carries NO redemption counter: a stored count drifts the first time anything is voided, so redemptions are counted from OrderAdjustment - the record of what actually happened.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Promotion Codes')
export class mjBizAppsOrdersPromotionCodeEntity extends BaseEntity<mjBizAppsOrdersPromotionCodeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Promotion Codes record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Promotion Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPromotionCodeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PromotionID
    * * Display Name: Promotion ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)
    */
    get PromotionID(): string {
        return this.Get('PromotionID');
    }
    set PromotionID(value: string) {
        this.Set('PromotionID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(60)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: MaxRedemptions
    * * Display Name: Max Redemptions
    * * SQL Data Type: int
    * * Description: Cap for THIS code, distinct from the promotion's overall cap.
    */
    get MaxRedemptions(): number | null {
        return this.Get('MaxRedemptions');
    }
    set MaxRedemptions(value: number | null) {
        this.Set('MaxRedemptions', value);
    }

    /**
    * * Field Name: AssignedOrganizationID
    * * Display Name: Assigned Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: Restricts the code to one organization. NULL means anyone may use it.
    */
    get AssignedOrganizationID(): string | null {
        return this.Get('AssignedOrganizationID');
    }
    set AssignedOrganizationID(value: string | null) {
        this.Set('AssignedOrganizationID', value);
    }

    /**
    * * Field Name: AssignedPersonID
    * * Display Name: Assigned Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: Restricts the code to one individual. NULL means anyone may use it.
    */
    get AssignedPersonID(): string | null {
        return this.Get('AssignedPersonID');
    }
    set AssignedPersonID(value: string | null) {
        this.Set('AssignedPersonID', value);
    }

    /**
    * * Field Name: EffectiveFrom
    * * Display Name: Effective From
    * * SQL Data Type: datetimeoffset
    */
    get EffectiveFrom(): Date | null {
        return this.Get('EffectiveFrom');
    }
    set EffectiveFrom(value: Date | null) {
        this.Set('EffectiveFrom', value);
    }

    /**
    * * Field Name: EffectiveTo
    * * Display Name: Effective To
    * * SQL Data Type: datetimeoffset
    */
    get EffectiveTo(): Date | null {
        return this.Get('EffectiveTo');
    }
    set EffectiveTo(value: Date | null) {
        this.Set('EffectiveTo', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Inactive
    */
    get Status(): 'Active' | 'Expired' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Promotion
    * * Display Name: Promotion
    * * SQL Data Type: nvarchar(200)
    */
    get Promotion(): string {
        return this.Get('Promotion');
    }

    /**
    * * Field Name: AssignedOrganization
    * * Display Name: Assigned Organization
    * * SQL Data Type: nvarchar(255)
    */
    get AssignedOrganization(): string | null {
        return this.Get('AssignedOrganization');
    }

    /**
    * * Field Name: AssignedPerson
    * * Display Name: Assigned Person
    * * SQL Data Type: nvarchar(100)
    */
    get AssignedPerson(): string | null {
        return this.Get('AssignedPerson');
    }
}


/**
 * MJ_BizApps_Orders: Promotion Targets - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PromotionTarget
 * * Base View: vwPromotionTargets
 * * @description What a promotion applies to. NO ROWS MEANS IT APPLIES TO EVERYTHING - absence as 'global' avoids a Scope enum whose values would have to stay in sync with which columns are populated, two facts that drift apart.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Promotion Targets')
export class mjBizAppsOrdersPromotionTargetEntity extends BaseEntity<mjBizAppsOrdersPromotionTargetEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Promotion Targets record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Promotion Targets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPromotionTargetEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Promotion Targets entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A promotion must target either a specific product or a product category, but not both, and cannot leave both empty.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateProductOrCategoryExclusivity(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A promotion must target either a specific product or a product category, but not both, and cannot leave both empty.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateProductOrCategoryExclusivity(result: ValidationResult) {
    	const hasProduct = this.ProductID != null;
    	const hasCategory = this.ProductCategoryID != null;
    
    	if (hasProduct === hasCategory) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ProductID",
    			"Exactly one of Product or Product Category must be specified.",
    			this.ProductID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PromotionID
    * * Display Name: Promotion
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotions (vwPromotions.ID)
    */
    get PromotionID(): string {
        return this.Get('PromotionID');
    }
    set PromotionID(value: string) {
        this.Set('PromotionID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ProductID(): string | null {
        return this.Get('ProductID');
    }
    set ProductID(value: string | null) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: ProductCategoryID
    * * Display Name: Product Category
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)
    */
    get ProductCategoryID(): string | null {
        return this.Get('ProductCategoryID');
    }
    set ProductCategoryID(value: string | null) {
        this.Set('ProductCategoryID', value);
    }

    /**
    * * Field Name: IncludeDescendants
    * * Display Name: Include Child Categories
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: For a category target, whether child categories are included.
    */
    get IncludeDescendants(): boolean {
        return this.Get('IncludeDescendants');
    }
    set IncludeDescendants(value: boolean) {
        this.Set('IncludeDescendants', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Promotion
    * * Display Name: Promotion Name
    * * SQL Data Type: nvarchar(200)
    */
    get Promotion(): string {
        return this.Get('Promotion');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string | null {
        return this.Get('Product');
    }

    /**
    * * Field Name: ProductCategory
    * * Display Name: Product Category Name
    * * SQL Data Type: nvarchar(200)
    */
    get ProductCategory(): string | null {
        return this.Get('ProductCategory');
    }
}


/**
 * MJ_BizApps_Orders: Promotion Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: PromotionType
 * * Base View: vwPromotionTypes
 * * @description The discount shape a promotion takes: percent off, amount off, override price, free shipping. A lookup rather than a CHECK so types are additive at runtime, and so Code can key a ClassFactory registration for custom behaviour.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Promotion Types')
export class mjBizAppsOrdersPromotionTypeEntity extends BaseEntity<mjBizAppsOrdersPromotionTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Promotion Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Promotion Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPromotionTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Promotions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: Promotion
 * * Base View: vwPromotions
 * * @description A promotional OFFER and its rules. Distinct from PromotionCode, which is a redeemable string pointing here - one promotion can have many codes (public, per-campaign, per-customer) without duplicating the offer. Follows Stripe's Coupon / Promotion Code split, which is the launch provider, so the mapping is one-to-one.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Promotions')
export class mjBizAppsOrdersPromotionEntity extends BaseEntity<mjBizAppsOrdersPromotionEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Promotions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Promotions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPromotionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Promotions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Value: The promotion or discount value must be greater than or equal to zero.
    * * Table-Level: The effective end date must be after the effective start date when both dates are specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateValueGreaterThanOrEqualToZero(result);
        this.ValidateEffectiveToAfterEffectiveFrom(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The promotion or discount value must be greater than or equal to zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateValueGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.Value != null && this.Value < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Value",
    			"The value must be greater than or equal to 0.",
    			this.Value,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The effective end date must be after the effective start date when both dates are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEffectiveToAfterEffectiveFrom(result: ValidationResult) {
    	if (this.EffectiveFrom != null && this.EffectiveTo != null) {
    		if (this.EffectiveTo <= this.EffectiveFrom) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EffectiveTo",
    				"The Effective To date must be after the Effective From date.",
    				this.EffectiveTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    * * Description: Internal handle for this offer. NOT the redeemable code - those live on PromotionCode.
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: PromotionTypeID
    * * Display Name: Promotion Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Promotion Types (vwPromotionTypes.ID)
    */
    get PromotionTypeID(): string {
        return this.Get('PromotionTypeID');
    }
    set PromotionTypeID(value: string) {
        this.Set('PromotionTypeID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get CompanyID(): string | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: decimal(19, 4)
    * * Description: Magnitude, interpreted by the type: 0.10 for ten percent off, or a currency amount.
    */
    get Value(): number {
        return this.Get('Value');
    }
    set Value(value: number) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: AppliesAt
    * * Display Name: Applies At
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Either
    * * Value List Type: List
    * * Possible Values 
    *   * Either
    *   * Line
    *   * Order
    * * Description: Line | Order | Either. An order-level promotion is always allocated down to lines, because tax and GL are per line.
    */
    get AppliesAt(): 'Either' | 'Line' | 'Order' {
        return this.Get('AppliesAt');
    }
    set AppliesAt(value: 'Either' | 'Line' | 'Order') {
        this.Set('AppliesAt', value);
    }

    /**
    * * Field Name: AllowsStacking
    * * Display Name: Allows Stacking
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this may combine with others. Defaults OFF - a promotion must opt in. When two non-stacking promotions collide the HIGHER VALUE wins, and the loser is recorded as offered-not-applied so 'why didn''t my code work?' has an answer.
    */
    get AllowsStacking(): boolean {
        return this.Get('AllowsStacking');
    }
    set AllowsStacking(value: boolean) {
        this.Set('AllowsStacking', value);
    }

    /**
    * * Field Name: StackSequence
    * * Display Name: Stack Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Order of application when several stack.
    */
    get StackSequence(): number {
        return this.Get('StackSequence');
    }
    set StackSequence(value: number) {
        this.Set('StackSequence', value);
    }

    /**
    * * Field Name: MaxRedemptions
    * * Display Name: Max Redemptions
    * * SQL Data Type: int
    * * Description: Total redemptions across all customers. NULL is unlimited. Counted from OrderAdjustment rather than a stored counter, which would drift the first time anything was voided.
    */
    get MaxRedemptions(): number | null {
        return this.Get('MaxRedemptions');
    }
    set MaxRedemptions(value: number | null) {
        this.Set('MaxRedemptions', value);
    }

    /**
    * * Field Name: MaxRedemptionsPerCustomer
    * * Display Name: Max Redemptions Per Customer
    * * SQL Data Type: int
    * * Description: Redemptions allowed per customer. NULL is unlimited.
    */
    get MaxRedemptionsPerCustomer(): number | null {
        return this.Get('MaxRedemptionsPerCustomer');
    }
    set MaxRedemptionsPerCustomer(value: number | null) {
        this.Set('MaxRedemptionsPerCustomer', value);
    }

    /**
    * * Field Name: MinimumOrderAmount
    * * Display Name: Minimum Order Amount
    * * SQL Data Type: decimal(19, 4)
    * * Description: Order must reach this value for the promotion to apply.
    */
    get MinimumOrderAmount(): number | null {
        return this.Get('MinimumOrderAmount');
    }
    set MinimumOrderAmount(value: number | null) {
        this.Set('MinimumOrderAmount', value);
    }

    /**
    * * Field Name: MinimumQuantity
    * * Display Name: Minimum Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Line must reach this quantity for the promotion to apply.
    */
    get MinimumQuantity(): number | null {
        return this.Get('MinimumQuantity');
    }
    set MinimumQuantity(value: number | null) {
        this.Set('MinimumQuantity', value);
    }

    /**
    * * Field Name: EffectiveFrom
    * * Display Name: Effective From
    * * SQL Data Type: datetimeoffset
    */
    get EffectiveFrom(): Date | null {
        return this.Get('EffectiveFrom');
    }
    set EffectiveFrom(value: Date | null) {
        this.Set('EffectiveFrom', value);
    }

    /**
    * * Field Name: EffectiveTo
    * * Display Name: Effective To
    * * SQL Data Type: datetimeoffset
    */
    get EffectiveTo(): Date | null {
        return this.Get('EffectiveTo');
    }
    set EffectiveTo(value: Date | null) {
        this.Set('EffectiveTo', value);
    }

    /**
    * * Field Name: RecurrenceMonths
    * * Display Name: Recurrence Months
    * * SQL Data Type: nvarchar(40)
    */
    get RecurrenceMonths(): string | null {
        return this.Get('RecurrenceMonths');
    }
    set RecurrenceMonths(value: string | null) {
        this.Set('RecurrenceMonths', value);
    }

    /**
    * * Field Name: RecurrenceDaysOfWeek
    * * Display Name: Recurrence Days Of Week
    * * SQL Data Type: nvarchar(20)
    */
    get RecurrenceDaysOfWeek(): string | null {
        return this.Get('RecurrenceDaysOfWeek');
    }
    set RecurrenceDaysOfWeek(value: string | null) {
        this.Set('RecurrenceDaysOfWeek', value);
    }

    /**
    * * Field Name: TimeOfDayStart
    * * Display Name: Time Of Day Start
    * * SQL Data Type: time
    */
    get TimeOfDayStart(): Date | null {
        return this.Get('TimeOfDayStart');
    }
    set TimeOfDayStart(value: Date | null) {
        this.Set('TimeOfDayStart', value);
    }

    /**
    * * Field Name: TimeOfDayEnd
    * * Display Name: Time Of Day End
    * * SQL Data Type: time
    */
    get TimeOfDayEnd(): Date | null {
        return this.Get('TimeOfDayEnd');
    }
    set TimeOfDayEnd(value: Date | null) {
        this.Set('TimeOfDayEnd', value);
    }

    /**
    * * Field Name: QualifierKey
    * * Display Name: Qualifier Key
    * * SQL Data Type: nvarchar(100)
    * * Description: ClassFactory key for a BasePromotionQualifier plugin implementing arbitrary eligibility - member for two years, first-time buyer, holds an active subscription - without a schema change.
    */
    get QualifierKey(): string | null {
        return this.Get('QualifierKey');
    }
    set QualifierKey(value: string | null) {
        this.Set('QualifierKey', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Draft
    *   * Expired
    *   * Paused
    * * Description: Draft | Active | Paused | Expired. Only Active promotions resolve.
    */
    get Status(): 'Active' | 'Draft' | 'Expired' | 'Paused' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Draft' | 'Expired' | 'Paused') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PromotionType
    * * Display Name: Promotion Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get PromotionType(): string {
        return this.Get('PromotionType');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string | null {
        return this.Get('Company');
    }
}


/**
 * MJ_BizApps_Orders: Revenue Recognition Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: RevenueRecognitionType
 * * Base View: vwRevenueRecognitionTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Revenue Recognition Types')
export class mjBizAppsOrdersRevenueRecognitionTypeEntity extends BaseEntity<mjBizAppsOrdersRevenueRecognitionTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Revenue Recognition Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Revenue Recognition Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersRevenueRecognitionTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(200)
    */
    get DriverClass(): string {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: IsDeferred
    * * Display Name: Is Deferred
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsDeferred(): boolean {
        return this.Get('IsDeferred');
    }
    set IsDeferred(value: boolean) {
        this.Set('IsDeferred', value);
    }

    /**
    * * Field Name: RequiresServicePeriod
    * * Display Name: Requires Service Period
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresServicePeriod(): boolean {
        return this.Get('RequiresServicePeriod');
    }
    set RequiresServicePeriod(value: boolean) {
        this.Set('RequiresServicePeriod', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Sales Authorities - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SalesAuthority
 * * Base View: vwSalesAuthorities
 * * @description Per-rep authority limits (§4.8): the caps within which a sales rep confirms without approval.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Sales Authorities')
export class mjBizAppsOrdersSalesAuthorityEntity extends BaseEntity<mjBizAppsOrdersSalesAuthorityEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Sales Authorities record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Sales Authorities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSalesAuthorityEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Sales Authorities entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * MaxDiscountPct: The maximum discount percentage, if specified, must be a value between 0 and 1 (inclusive) to represent a valid percentage range from 0% to 100%.
    * * MaxOrderValue: The maximum order value must be greater than or equal to 0, if it is specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateMaxDiscountPctRange(result);
        this.ValidateMaxOrderValueGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The maximum discount percentage, if specified, must be a value between 0 and 1 (inclusive) to represent a valid percentage range from 0% to 100%.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxDiscountPctRange(result: ValidationResult) {
    	if (this.MaxDiscountPct != null && (this.MaxDiscountPct < 0 || this.MaxDiscountPct > 1)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxDiscountPct",
    			"The maximum discount percentage must be between 0 and 1 (inclusive).",
    			this.MaxDiscountPct,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The maximum order value must be greater than or equal to 0, if it is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxOrderValueGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.MaxOrderValue != null && this.MaxOrderValue < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxOrderValue",
    			"Maximum order value must be greater than or equal to 0.",
    			this.MaxOrderValue,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SalesRepUserID
    * * Display Name: Sales Rep User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get SalesRepUserID(): string {
        return this.Get('SalesRepUserID');
    }
    set SalesRepUserID(value: string) {
        this.Set('SalesRepUserID', value);
    }

    /**
    * * Field Name: MaxDiscountPct
    * * Display Name: Max Discount Percentage
    * * SQL Data Type: decimal(7, 4)
    * * Description: Maximum discount fraction (0-1) this rep may grant unaided.
    */
    get MaxDiscountPct(): number | null {
        return this.Get('MaxDiscountPct');
    }
    set MaxDiscountPct(value: number | null) {
        this.Set('MaxDiscountPct', value);
    }

    /**
    * * Field Name: MaxOrderValue
    * * Display Name: Max Order Value
    * * SQL Data Type: decimal(18, 2)
    * * Description: Maximum order value this rep may confirm unaided.
    */
    get MaxOrderValue(): number | null {
        return this.Get('MaxOrderValue');
    }
    set MaxOrderValue(value: number | null) {
        this.Set('MaxOrderValue', value);
    }

    /**
    * * Field Name: AllowedPaymentTermsTypeIDs
    * * Display Name: Allowed Payment Terms
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of PaymentTermsType IDs this rep may offer. NULL = all.
    */
    get AllowedPaymentTermsTypeIDs(): string | null {
        return this.Get('AllowedPaymentTermsTypeIDs');
    }
    set AllowedPaymentTermsTypeIDs(value: string | null) {
        this.Set('AllowedPaymentTermsTypeIDs', value);
    }

    /**
    * * Field Name: AllowedProductCategoryIDs
    * * Display Name: Allowed Product Categories
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of ProductCategory IDs this rep may sell. NULL = all.
    */
    get AllowedProductCategoryIDs(): string | null {
        return this.Get('AllowedProductCategoryIDs');
    }
    set AllowedProductCategoryIDs(value: string | null) {
        this.Set('AllowedProductCategoryIDs', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this authority row is in force.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: SalesRepUser
    * * Display Name: Sales Rep
    * * SQL Data Type: nvarchar(100)
    */
    get SalesRepUser(): string {
        return this.Get('SalesRepUser');
    }
}


/**
 * MJ_BizApps_Orders: Sales Rules - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SalesRule
 * * Base View: vwSalesRules
 * * @description Metadata-driven sales constraint evaluated at Confirm (BO-D17/D18). Violations raise an Approval Request Task routed to ApprovalRequiredRoleID; golden path confirms instantly.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Sales Rules')
export class mjBizAppsOrdersSalesRuleEntity extends BaseEntity<mjBizAppsOrdersSalesRuleEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Sales Rules record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Sales Rules record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSalesRuleEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Rule Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the rule.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: RuleType
    * * Display Name: Rule Type
    * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * CreditLimit
    *   * Custom
    *   * DiscountLimit
    *   * PaymentTermsRequired
    *   * ProductAuthorization
    * * Description: DiscountLimit | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom.
    */
    get RuleType(): 'CreditLimit' | 'Custom' | 'DiscountLimit' | 'PaymentTermsRequired' | 'ProductAuthorization' {
        return this.Get('RuleType');
    }
    set RuleType(value: 'CreditLimit' | 'Custom' | 'DiscountLimit' | 'PaymentTermsRequired' | 'ProductAuthorization') {
        this.Set('RuleType', value);
    }

    /**
    * * Field Name: Scope
    * * Display Name: Scope
    * * SQL Data Type: nvarchar(40)
    * * Default Value: Global
    * * Value List Type: List
    * * Possible Values 
    *   * Global
    *   * PerCustomer
    *   * PerProduct
    *   * PerSalesRep
    * * Description: Global | PerProduct | PerCustomer | PerSalesRep — what ScopeReferenceID points at.
    */
    get Scope(): 'Global' | 'PerCustomer' | 'PerProduct' | 'PerSalesRep' {
        return this.Get('Scope');
    }
    set Scope(value: 'Global' | 'PerCustomer' | 'PerProduct' | 'PerSalesRep') {
        this.Set('Scope', value);
    }

    /**
    * * Field Name: ScopeReferenceID
    * * Display Name: Scope Reference
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the scoped Product / Customer Organization / Sales Rep User when Scope is not Global.
    */
    get ScopeReferenceID(): string | null {
        return this.Get('ScopeReferenceID');
    }
    set ScopeReferenceID(value: string | null) {
        this.Set('ScopeReferenceID', value);
    }

    /**
    * * Field Name: PredicateJson
    * * Display Name: Predicate Logic
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON rule expression (admin-editable; evaluated by the F8 engine).
    */
    get PredicateJson(): string | null {
        return this.Get('PredicateJson');
    }
    set PredicateJson(value: string | null) {
        this.Set('PredicateJson', value);
    }

    /**
    * * Field Name: ApprovalRequiredRoleID
    * * Display Name: Approval Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Roles (vwRoles.ID)
    */
    get ApprovalRequiredRoleID(): string | null {
        return this.Get('ApprovalRequiredRoleID');
    }
    set ApprovalRequiredRoleID(value: string | null) {
        this.Set('ApprovalRequiredRoleID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this rule participates in Confirm evaluation.
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ApprovalRequiredRole
    * * Display Name: Approval Required Role
    * * SQL Data Type: nvarchar(50)
    */
    get ApprovalRequiredRole(): string | null {
        return this.Get('ApprovalRequiredRole');
    }
}


/**
 * MJ_BizApps_Orders: Stored Value Accounts - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: StoredValueAccount
 * * Base View: vwStoredValueAccounts
 * * @description Gift-card / stored-value instrument (BO-D44). Selling one books a LIABILITY (not revenue); redemption is a Payment with Method=GiftCard relieving the liability.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Stored Value Accounts')
export class mjBizAppsOrdersStoredValueAccountEntity extends BaseEntity<mjBizAppsOrdersStoredValueAccountEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Stored Value Accounts record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Stored Value Accounts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersStoredValueAccountEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Stored Value Accounts entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * InitialAmount: The initial amount must be a positive value greater than zero.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateInitialAmountGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The initial amount must be a positive value greater than zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateInitialAmountGreaterThanZero(result: ValidationResult) {
    	if (this.InitialAmount !== undefined && this.InitialAmount !== null && this.InitialAmount <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"InitialAmount",
    			"The initial amount must be greater than zero.",
    			this.InitialAmount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Gift Card Number
    * * SQL Data Type: nvarchar(60)
    * * Description: The gift-card number / instrument code. Unique.
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: IssuingCompanyID
    * * Display Name: Issuing Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    */
    get IssuingCompanyID(): string {
        return this.Get('IssuingCompanyID');
    }
    set IssuingCompanyID(value: string) {
        this.Set('IssuingCompanyID', value);
    }

    /**
    * * Field Name: InitialAmount
    * * Display Name: Initial Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Face value at issuance.
    */
    get InitialAmount(): number {
        return this.Get('InitialAmount');
    }
    set InitialAmount(value: number) {
        this.Set('InitialAmount', value);
    }

    /**
    * * Field Name: CurrentBalance
    * * Display Name: Current Balance
    * * SQL Data Type: decimal(18, 2)
    * * Description: Current remaining balance (ledger-maintained via StoredValueTransaction).
    */
    get CurrentBalance(): number {
        return this.Get('CurrentBalance');
    }
    set CurrentBalance(value: number) {
        this.Set('CurrentBalance', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Depleted
    *   * Expired
    *   * Suspended
    *   * Voided
    * * Description: Active | Depleted | Expired | Suspended | Voided.
    */
    get Status(): 'Active' | 'Depleted' | 'Expired' | 'Suspended' | 'Voided' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Depleted' | 'Expired' | 'Suspended' | 'Voided') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: IssuedFromOrderLineID
    * * Display Name: Issued From Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get IssuedFromOrderLineID(): string | null {
        return this.Get('IssuedFromOrderLineID');
    }
    set IssuedFromOrderLineID(value: string | null) {
        this.Set('IssuedFromOrderLineID', value);
    }

    /**
    * * Field Name: BeneficiaryPersonID
    * * Display Name: Beneficiary Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: FK to __mj_BizAppsCommon.Person — the card recipient.
    */
    get BeneficiaryPersonID(): string | null {
        return this.Get('BeneficiaryPersonID');
    }
    set BeneficiaryPersonID(value: string | null) {
        this.Set('BeneficiaryPersonID', value);
    }

    /**
    * * Field Name: BeneficiaryOrganizationID
    * * Display Name: Beneficiary Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the benefiting organization.
    */
    get BeneficiaryOrganizationID(): string | null {
        return this.Get('BeneficiaryOrganizationID');
    }
    set BeneficiaryOrganizationID(value: string | null) {
        this.Set('BeneficiaryOrganizationID', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: date
    * * Description: Expiration date where legally permitted. NULL = never.
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: IssuingCompany
    * * Display Name: Issuing Company
    * * SQL Data Type: nvarchar(50)
    */
    get IssuingCompany(): string {
        return this.Get('IssuingCompany');
    }

    /**
    * * Field Name: BeneficiaryPerson
    * * Display Name: Beneficiary Person
    * * SQL Data Type: nvarchar(100)
    */
    get BeneficiaryPerson(): string | null {
        return this.Get('BeneficiaryPerson');
    }

    /**
    * * Field Name: BeneficiaryOrganization
    * * Display Name: Beneficiary Organization
    * * SQL Data Type: nvarchar(255)
    */
    get BeneficiaryOrganization(): string | null {
        return this.Get('BeneficiaryOrganization');
    }
}


/**
 * MJ_BizApps_Orders: Stored Value Transactions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: StoredValueTransaction
 * * Base View: vwStoredValueTransactions
 * * @description Stored-value balance ledger (BO-D44): every issue/redeem/refund/adjust/expire with the running balance.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Stored Value Transactions')
export class mjBizAppsOrdersStoredValueTransactionEntity extends BaseEntity<mjBizAppsOrdersStoredValueTransactionEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Stored Value Transactions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Stored Value Transactions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersStoredValueTransactionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Stored Value Transactions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Amount: The transaction amount cannot be zero. Every transaction must have a positive or negative value.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAmountNotZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The transaction amount cannot be zero. Every transaction must have a positive or negative value.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountNotZero(result: ValidationResult) {
    	if (this.Amount === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Amount",
    			"The transaction amount cannot be zero. Please specify a non-zero value.",
    			this.Amount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: StoredValueAccountID
    * * Display Name: Stored Value Account ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)
    */
    get StoredValueAccountID(): string {
        return this.Get('StoredValueAccountID');
    }
    set StoredValueAccountID(value: string) {
        this.Set('StoredValueAccountID', value);
    }

    /**
    * * Field Name: TransactionType
    * * Display Name: Transaction Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Adjust
    *   * Expire
    *   * Issue
    *   * Redeem
    *   * Refund
    * * Description: Issue | Redeem | Refund | Adjust | Expire.
    */
    get TransactionType(): 'Adjust' | 'Expire' | 'Issue' | 'Redeem' | 'Refund' {
        return this.Get('TransactionType');
    }
    set TransactionType(value: 'Adjust' | 'Expire' | 'Issue' | 'Redeem' | 'Refund') {
        this.Set('TransactionType', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Signed amount (+issue/refund, -redeem/expire).
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: BalanceAfter
    * * Display Name: Balance After
    * * SQL Data Type: decimal(18, 2)
    * * Description: Account balance after applying this transaction.
    */
    get BalanceAfter(): number {
        return this.Get('BalanceAfter');
    }
    set BalanceAfter(value: number) {
        this.Set('BalanceAfter', value);
    }

    /**
    * * Field Name: RelatedPaymentID
    * * Display Name: Related Payment ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)
    */
    get RelatedPaymentID(): string | null {
        return this.Get('RelatedPaymentID');
    }
    set RelatedPaymentID(value: string | null) {
        this.Set('RelatedPaymentID', value);
    }

    /**
    * * Field Name: RelatedOrderHeaderID
    * * Display Name: Related Order Header ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get RelatedOrderHeaderID(): string | null {
        return this.Get('RelatedOrderHeaderID');
    }
    set RelatedOrderHeaderID(value: string | null) {
        this.Set('RelatedOrderHeaderID', value);
    }

    /**
    * * Field Name: OccurredAt
    * * Display Name: Occurred At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp of the transaction.
    */
    get OccurredAt(): Date {
        return this.Get('OccurredAt');
    }
    set OccurredAt(value: Date) {
        this.Set('OccurredAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: StoredValueAccount
    * * Display Name: Stored Value Account
    * * SQL Data Type: nvarchar(60)
    */
    get StoredValueAccount(): string {
        return this.Get('StoredValueAccount');
    }

    /**
    * * Field Name: RelatedPayment
    * * Display Name: Related Payment
    * * SQL Data Type: nvarchar(40)
    */
    get RelatedPayment(): string | null {
        return this.Get('RelatedPayment');
    }

    /**
    * * Field Name: RelatedOrderHeader
    * * Display Name: Related Order Header
    * * SQL Data Type: nvarchar(40)
    */
    get RelatedOrderHeader(): string | null {
        return this.Get('RelatedOrderHeader');
    }
}


/**
 * MJ_BizApps_Orders: Subscription Events - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SubscriptionEvent
 * * Base View: vwSubscriptionEvents
 * * @description Immutable subscription lifecycle log (§4.4). One row per event; EventData carries the JSON payload.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Events')
export class mjBizAppsOrdersSubscriptionEventEntity extends BaseEntity<mjBizAppsOrdersSubscriptionEventEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscription Events record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Subscription Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionEventEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubscriptionID
    * * Display Name: Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get SubscriptionID(): string {
        return this.Get('SubscriptionID');
    }
    set SubscriptionID(value: string) {
        this.Set('SubscriptionID', value);
    }

    /**
    * * Field Name: EventType
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * Activated
    *   * Canceled
    *   * CancellationRequested
    *   * Created
    *   * Extended
    *   * Migrated
    *   * Paused
    *   * PaymentFailed
    *   * PaymentSucceeded
    *   * RenewalOrderSpawned
    *   * Resumed
    *   * TrialEnded
    *   * TrialStarted
    * * Description: The lifecycle event kind (Created ... RenewalOrderSpawned).
    */
    get EventType(): 'Activated' | 'Canceled' | 'CancellationRequested' | 'Created' | 'Extended' | 'Migrated' | 'Paused' | 'PaymentFailed' | 'PaymentSucceeded' | 'RenewalOrderSpawned' | 'Resumed' | 'TrialEnded' | 'TrialStarted' {
        return this.Get('EventType');
    }
    set EventType(value: 'Activated' | 'Canceled' | 'CancellationRequested' | 'Created' | 'Extended' | 'Migrated' | 'Paused' | 'PaymentFailed' | 'PaymentSucceeded' | 'RenewalOrderSpawned' | 'Resumed' | 'TrialEnded' | 'TrialStarted') {
        this.Set('EventType', value);
    }

    /**
    * * Field Name: OccurredAt
    * * Display Name: Occurred At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp the event occurred.
    */
    get OccurredAt(): Date {
        return this.Get('OccurredAt');
    }
    set OccurredAt(value: Date) {
        this.Set('OccurredAt', value);
    }

    /**
    * * Field Name: EventData
    * * Display Name: Event Data
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON event payload (provider webhook body or internal context).
    */
    get EventData(): string | null {
        return this.Get('EventData');
    }
    set EventData(value: string | null) {
        this.Set('EventData', value);
    }

    /**
    * * Field Name: ProviderEventID
    * * Display Name: Provider Event ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider webhook event id — the idempotency key (unique when present).
    */
    get ProviderEventID(): string | null {
        return this.Get('ProviderEventID');
    }
    set ProviderEventID(value: string | null) {
        this.Set('ProviderEventID', value);
    }

    /**
    * * Field Name: RelatedPaymentID
    * * Display Name: Related Payment ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Headers (vwPaymentHeaders.ID)
    */
    get RelatedPaymentID(): string | null {
        return this.Get('RelatedPaymentID');
    }
    set RelatedPaymentID(value: string | null) {
        this.Set('RelatedPaymentID', value);
    }

    /**
    * * Field Name: RelatedOrderHeaderID
    * * Display Name: Related Order ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Headers (vwOrderHeaders.ID)
    */
    get RelatedOrderHeaderID(): string | null {
        return this.Get('RelatedOrderHeaderID');
    }
    set RelatedOrderHeaderID(value: string | null) {
        this.Set('RelatedOrderHeaderID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Subscription
    * * Display Name: Subscription Name
    * * SQL Data Type: nvarchar(40)
    */
    get Subscription(): string {
        return this.Get('Subscription');
    }

    /**
    * * Field Name: RelatedPayment
    * * Display Name: Related Payment
    * * SQL Data Type: nvarchar(40)
    */
    get RelatedPayment(): string | null {
        return this.Get('RelatedPayment');
    }

    /**
    * * Field Name: RelatedOrderHeader
    * * Display Name: Related Order
    * * SQL Data Type: nvarchar(40)
    */
    get RelatedOrderHeader(): string | null {
        return this.Get('RelatedOrderHeader');
    }
}


/**
 * MJ_BizApps_Orders: Subscription Sequences - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SubscriptionSequence
 * * Base View: vwSubscriptionSequences
 * * @description Global singleton counter (ID=1) minting gap-conscious SUB-{seq} subscription numbers. Consumed only by the entity server.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Sequences')
export class mjBizAppsOrdersSubscriptionSequenceEntity extends BaseEntity<mjBizAppsOrdersSubscriptionSequenceEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscription Sequences record from the database
    * @param ID: number - primary key value to load the MJ_BizApps_Orders: Subscription Sequences record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionSequenceEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Subscription Sequences entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ID: The ID of the record must be exactly 1 to ensure that only a single configuration or system record exists in this table.
    * * NextSequenceNumber: The next sequence number must be a positive integer greater than zero to ensure sequence integrity.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateIdEqualsOne(result);
        this.ValidateNextSequenceNumberGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The ID of the record must be exactly 1 to ensure that only a single configuration or system record exists in this table.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateIdEqualsOne(result: ValidationResult) {
    	if (this.ID !== 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ID",
    			"The ID for this record must be exactly 1.",
    			this.ID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The next sequence number must be a positive integer greater than zero to ensure sequence integrity.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNextSequenceNumberGreaterThanZero(result: ValidationResult) {
    	if (this.NextSequenceNumber != null && this.NextSequenceNumber <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NextSequenceNumber",
    			"The next sequence number must be greater than zero.",
    			this.NextSequenceNumber,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    * * Default Value: 1
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: NextSequenceNumber
    * * Display Name: Next Sequence Number
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: The next subscription sequence number to assign.
    */
    get NextSequenceNumber(): number {
        return this.Get('NextSequenceNumber');
    }
    set NextSequenceNumber(value: number) {
        this.Set('NextSequenceNumber', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Subscription Terms - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SubscriptionTerm
 * * Base View: vwSubscriptionTerms
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Terms')
export class mjBizAppsOrdersSubscriptionTermEntity extends BaseEntity<mjBizAppsOrdersSubscriptionTermEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscription Terms record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Subscription Terms record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionTermEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Subscription Terms entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * TermNumber: The term number must be a positive integer greater than zero to ensure valid sequence tracking for subscription terms.
    * * Table-Level: The subscription term's end date must be on or after its start date to ensure a valid active period.
    * * Table-Level: If an item is marked as prorated, a proration factor must be provided to ensure accurate financial calculations.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTermNumberGreaterThanZero(result);
        this.ValidateEndDateAfterOrEqualStartDate(result);
        this.ValidateProrationFactorWhenProrated(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The term number must be a positive integer greater than zero to ensure valid sequence tracking for subscription terms.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTermNumberGreaterThanZero(result: ValidationResult) {
    	if (this.TermNumber != null && this.TermNumber <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"TermNumber",
    			"The term number must be greater than zero.",
    			this.TermNumber,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The subscription term's end date must be on or after its start date to ensure a valid active period.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateAfterOrEqualStartDate(result: ValidationResult) {
    	if (this.StartDate && this.EndDate) {
    		const start = new Date(this.StartDate);
    		const end = new Date(this.EndDate);
    		if (end < start) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EndDate",
    				"The End Date must be on or after the Start Date.",
    				this.EndDate,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * If an item is marked as prorated, a proration factor must be provided to ensure accurate financial calculations.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateProrationFactorWhenProrated(result: ValidationResult) {
    	if (this.IsProrated && this.ProrationFactor == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ProrationFactor",
    			"A proration factor must be provided when the item is marked as prorated.",
    			this.ProrationFactor,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubscriptionID
    * * Display Name: Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get SubscriptionID(): string {
        return this.Get('SubscriptionID');
    }
    set SubscriptionID(value: string) {
        this.Set('SubscriptionID', value);
    }

    /**
    * * Field Name: TermNumber
    * * Display Name: Term Number
    * * SQL Data Type: int
    */
    get TermNumber(): number {
        return this.Get('TermNumber');
    }
    set TermNumber(value: number) {
        this.Set('TermNumber', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    */
    get StartDate(): Date {
        return this.Get('StartDate');
    }
    set StartDate(value: Date) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: date
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: IsProrated
    * * Display Name: Is Prorated
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsProrated(): boolean {
        return this.Get('IsProrated');
    }
    set IsProrated(value: boolean) {
        this.Set('IsProrated', value);
    }

    /**
    * * Field Name: ProrationFactor
    * * Display Name: Proration Factor
    * * SQL Data Type: decimal(9, 6)
    */
    get ProrationFactor(): number | null {
        return this.Get('ProrationFactor');
    }
    set ProrationFactor(value: number | null) {
        this.Set('ProrationFactor', value);
    }

    /**
    * * Field Name: RevenueRecognitionTypeID
    * * Display Name: Revenue Recognition Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Types (vwRevenueRecognitionTypes.ID)
    */
    get RevenueRecognitionTypeID(): string {
        return this.Get('RevenueRecognitionTypeID');
    }
    set RevenueRecognitionTypeID(value: string) {
        this.Set('RevenueRecognitionTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Completed
    *   * Lapsed
    *   * Scheduled
    */
    get Status(): 'Active' | 'Canceled' | 'Completed' | 'Lapsed' | 'Scheduled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Canceled' | 'Completed' | 'Lapsed' | 'Scheduled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CanceledAt
    * * Display Name: Canceled At
    * * SQL Data Type: datetimeoffset
    */
    get CanceledAt(): Date | null {
        return this.Get('CanceledAt');
    }
    set CanceledAt(value: Date | null) {
        this.Set('CanceledAt', value);
    }

    /**
    * * Field Name: CancellationEffectiveDate
    * * Display Name: Cancellation Effective Date
    * * SQL Data Type: date
    */
    get CancellationEffectiveDate(): Date | null {
        return this.Get('CancellationEffectiveDate');
    }
    set CancellationEffectiveDate(value: Date | null) {
        this.Set('CancellationEffectiveDate', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Subscription
    * * Display Name: Subscription Name
    * * SQL Data Type: nvarchar(40)
    */
    get Subscription(): string {
        return this.Get('Subscription');
    }

    /**
    * * Field Name: RevenueRecognitionType
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: nvarchar(200)
    */
    get RevenueRecognitionType(): string {
        return this.Get('RevenueRecognitionType');
    }
}


/**
 * MJ_BizApps_Orders: Subscription Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SubscriptionType
 * * Base View: vwSubscriptionTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Types')
export class mjBizAppsOrdersSubscriptionTypeEntity extends BaseEntity<mjBizAppsOrdersSubscriptionTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscription Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Subscription Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Subscription Types entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * AnchorDay: The anchor day, if specified, must be a valid day of the month between 1 and 31.
    * * AnchorMonth: The anchor month, if specified, must be a valid month of the year between 1 (January) and 12 (December).
    * * GracePeriodDays: Grace period days must be a non-negative number (0 or greater).
    * * TrialDays: Trial days must be a non-negative number (0 or greater) to ensure a trial period cannot have a negative duration.
    * * Table-Level: If the start mode is set to 'CalendarAnchored', both the anchor month and anchor day must be specified to establish the calendar anchor point.
    * * Table-Level: An organization benefit model cannot be applied to an individual person subscriber scope.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAnchorDayRange(result);
        this.ValidateAnchorMonthRange(result);
        this.ValidateGracePeriodDaysNotNegative(result);
        this.ValidateTrialDaysMin(result);
        this.ValidateAnchorDateForCalendarAnchoredStartMode(result);
        this.ValidateBenefitModelAndSubscriberScope(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The anchor day, if specified, must be a valid day of the month between 1 and 31.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAnchorDayRange(result: ValidationResult) {
    	if (this.AnchorDay != null && (this.AnchorDay < 1 || this.AnchorDay > 31)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AnchorDay",
    			"Anchor Day must be a valid day of the month between 1 and 31.",
    			this.AnchorDay,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The anchor month, if specified, must be a valid month of the year between 1 (January) and 12 (December).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAnchorMonthRange(result: ValidationResult) {
    	if (this.AnchorMonth != null && (this.AnchorMonth < 1 || this.AnchorMonth > 12)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AnchorMonth",
    			"Anchor Month must be a valid month of the year between 1 and 12.",
    			this.AnchorMonth,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Grace period days must be a non-negative number (0 or greater).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    	public ValidateGracePeriodDaysNotNegative(result: ValidationResult) {
    		if (this.GracePeriodDays != null && this.GracePeriodDays < 0) {
    			result.Errors.push(new ValidationErrorInfo(
    				"GracePeriodDays",
    				"Grace period days must be 0 or greater.",
    				this.GracePeriodDays,
    				ValidationErrorType.Failure
    			));
    		}
    	}

    /**
    * Trial days must be a non-negative number (0 or greater) to ensure a trial period cannot have a negative duration.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTrialDaysMin(result: ValidationResult) {
    	if (this.TrialDays != null && this.TrialDays < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"TrialDays",
    			"Trial days must be 0 or greater.",
    			this.TrialDays,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * If the start mode is set to 'CalendarAnchored', both the anchor month and anchor day must be specified to establish the calendar anchor point.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    	public ValidateAnchorDateForCalendarAnchoredStartMode(result: ValidationResult) {
    		if (this.StartMode === "CalendarAnchored") {
    			if (this.AnchorMonth == null || this.AnchorDay == null) {
    				result.Errors.push(new ValidationErrorInfo(
    					"StartMode",
    					"When StartMode is 'CalendarAnchored', both AnchorMonth and AnchorDay must be specified.",
    					this.StartMode,
    					ValidationErrorType.Failure
    				));
    			}
    		}
    	}

    /**
    * An organization benefit model cannot be applied to an individual person subscriber scope.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateBenefitModelAndSubscriberScope(result: ValidationResult) {
    	if (this.BenefitModel === "Organization" && this.SubscriberScope === "Person") {
    		result.Errors.push(new ValidationErrorInfo(
    			"BenefitModel",
    			"An organization benefit model cannot be applied to a person subscriber scope.",
    			this.BenefitModel,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(40)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(200)
    */
    get DriverClass(): string | null {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string | null) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: SubscriberScope
    * * Display Name: Subscriber Scope
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Either
    * * Value List Type: List
    * * Possible Values 
    *   * Either
    *   * Organization
    *   * Person
    */
    get SubscriberScope(): 'Either' | 'Organization' | 'Person' {
        return this.Get('SubscriberScope');
    }
    set SubscriberScope(value: 'Either' | 'Organization' | 'Person') {
        this.Set('SubscriberScope', value);
    }

    /**
    * * Field Name: BenefitModel
    * * Display Name: Benefit Model
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Holder
    * * Value List Type: List
    * * Possible Values 
    *   * Holder
    *   * Individual
    *   * Organization
    */
    get BenefitModel(): 'Holder' | 'Individual' | 'Organization' {
        return this.Get('BenefitModel');
    }
    set BenefitModel(value: 'Holder' | 'Individual' | 'Organization') {
        this.Set('BenefitModel', value);
    }

    /**
    * * Field Name: StartMode
    * * Display Name: Start Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Immediate
    * * Value List Type: List
    * * Possible Values 
    *   * CalendarAnchored
    *   * Deferred
    *   * Immediate
    */
    get StartMode(): 'CalendarAnchored' | 'Deferred' | 'Immediate' {
        return this.Get('StartMode');
    }
    set StartMode(value: 'CalendarAnchored' | 'Deferred' | 'Immediate') {
        this.Set('StartMode', value);
    }

    /**
    * * Field Name: DeferredStartDays
    * * Display Name: Deferred Start Days
    * * SQL Data Type: int
    */
    get DeferredStartDays(): number | null {
        return this.Get('DeferredStartDays');
    }
    set DeferredStartDays(value: number | null) {
        this.Set('DeferredStartDays', value);
    }

    /**
    * * Field Name: AnchorMonth
    * * Display Name: Anchor Month
    * * SQL Data Type: tinyint
    */
    get AnchorMonth(): number | null {
        return this.Get('AnchorMonth');
    }
    set AnchorMonth(value: number | null) {
        this.Set('AnchorMonth', value);
    }

    /**
    * * Field Name: AnchorDay
    * * Display Name: Anchor Day
    * * SQL Data Type: tinyint
    */
    get AnchorDay(): number | null {
        return this.Get('AnchorDay');
    }
    set AnchorDay(value: number | null) {
        this.Set('AnchorDay', value);
    }

    /**
    * * Field Name: PartialPeriodMode
    * * Display Name: Partial Period Mode
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ChargeFull
    *   * ExtendToNextAnchor
    *   * Prorate
    */
    get PartialPeriodMode(): 'ChargeFull' | 'ExtendToNextAnchor' | 'Prorate' | null {
        return this.Get('PartialPeriodMode');
    }
    set PartialPeriodMode(value: 'ChargeFull' | 'ExtendToNextAnchor' | 'Prorate' | null) {
        this.Set('PartialPeriodMode', value);
    }

    /**
    * * Field Name: DefaultTermMonths
    * * Display Name: Default Term (Months)
    * * SQL Data Type: int
    */
    get DefaultTermMonths(): number | null {
        return this.Get('DefaultTermMonths');
    }
    set DefaultTermMonths(value: number | null) {
        this.Set('DefaultTermMonths', value);
    }

    /**
    * * Field Name: BillingCadence
    * * Display Name: Billing Cadence
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Annual
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly
    */
    get BillingCadence(): 'Annual' | 'Custom' | 'Monthly' | 'Quarterly' {
        return this.Get('BillingCadence');
    }
    set BillingCadence(value: 'Annual' | 'Custom' | 'Monthly' | 'Quarterly') {
        this.Set('BillingCadence', value);
    }

    /**
    * * Field Name: RecognitionCadence
    * * Display Name: Recognition Cadence
    * * SQL Data Type: nvarchar(20)
    * * Default Value: MatchBilling
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * MatchBilling
    *   * Monthly
    *   * Quarterly
    */
    get RecognitionCadence(): 'Annual' | 'MatchBilling' | 'Monthly' | 'Quarterly' {
        return this.Get('RecognitionCadence');
    }
    set RecognitionCadence(value: 'Annual' | 'MatchBilling' | 'Monthly' | 'Quarterly') {
        this.Set('RecognitionCadence', value);
    }

    /**
    * * Field Name: CustomCycleDays
    * * Display Name: Custom Cycle Days
    * * SQL Data Type: int
    */
    get CustomCycleDays(): number | null {
        return this.Get('CustomCycleDays');
    }
    set CustomCycleDays(value: number | null) {
        this.Set('CustomCycleDays', value);
    }

    /**
    * * Field Name: TrialDays
    * * Display Name: Trial Days
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TrialDays(): number {
        return this.Get('TrialDays');
    }
    set TrialDays(value: number) {
        this.Set('TrialDays', value);
    }

    /**
    * * Field Name: ConcurrencyMode
    * * Display Name: Concurrency Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: ExtendExisting
    * * Value List Type: List
    * * Possible Values 
    *   * AllowMultiple
    *   * ExtendExisting
    *   * RejectDuplicate
    */
    get ConcurrencyMode(): 'AllowMultiple' | 'ExtendExisting' | 'RejectDuplicate' {
        return this.Get('ConcurrencyMode');
    }
    set ConcurrencyMode(value: 'AllowMultiple' | 'ExtendExisting' | 'RejectDuplicate') {
        this.Set('ConcurrencyMode', value);
    }

    /**
    * * Field Name: ReactivationMode
    * * Display Name: Reactivation Mode
    * * SQL Data Type: nvarchar(30)
    * * Default Value: AlwaysCreateNew
    * * Value List Type: List
    * * Possible Values 
    *   * AlwaysCreateNew
    *   * ReactivateExisting
    *   * ReactivateWithinWindow
    */
    get ReactivationMode(): 'AlwaysCreateNew' | 'ReactivateExisting' | 'ReactivateWithinWindow' {
        return this.Get('ReactivationMode');
    }
    set ReactivationMode(value: 'AlwaysCreateNew' | 'ReactivateExisting' | 'ReactivateWithinWindow') {
        this.Set('ReactivationMode', value);
    }

    /**
    * * Field Name: ReactivationWindowDays
    * * Display Name: Reactivation Window (Days)
    * * SQL Data Type: int
    */
    get ReactivationWindowDays(): number | null {
        return this.Get('ReactivationWindowDays');
    }
    set ReactivationWindowDays(value: number | null) {
        this.Set('ReactivationWindowDays', value);
    }

    /**
    * * Field Name: AutoRenewDefault
    * * Display Name: Auto Renew Default
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get AutoRenewDefault(): boolean {
        return this.Get('AutoRenewDefault');
    }
    set AutoRenewDefault(value: boolean) {
        this.Set('AutoRenewDefault', value);
    }

    /**
    * * Field Name: RenewalLeadDays
    * * Display Name: Renewal Lead Days
    * * SQL Data Type: int
    */
    get RenewalLeadDays(): number | null {
        return this.Get('RenewalLeadDays');
    }
    set RenewalLeadDays(value: number | null) {
        this.Set('RenewalLeadDays', value);
    }

    /**
    * * Field Name: CancellationMode
    * * Display Name: Cancellation Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: EndOfTerm
    * * Value List Type: List
    * * Possible Values 
    *   * EndOfBillingPeriod
    *   * EndOfTerm
    *   * Immediate
    */
    get CancellationMode(): 'EndOfBillingPeriod' | 'EndOfTerm' | 'Immediate' {
        return this.Get('CancellationMode');
    }
    set CancellationMode(value: 'EndOfBillingPeriod' | 'EndOfTerm' | 'Immediate') {
        this.Set('CancellationMode', value);
    }

    /**
    * * Field Name: CancellationRefundMode
    * * Display Name: Cancellation Refund Mode
    * * SQL Data Type: nvarchar(30)
    * * Default Value: NoRefund
    * * Value List Type: List
    * * Possible Values 
    *   * FullRefundWithinWindow
    *   * NoRefund
    *   * ProrateUnused
    */
    get CancellationRefundMode(): 'FullRefundWithinWindow' | 'NoRefund' | 'ProrateUnused' {
        return this.Get('CancellationRefundMode');
    }
    set CancellationRefundMode(value: 'FullRefundWithinWindow' | 'NoRefund' | 'ProrateUnused') {
        this.Set('CancellationRefundMode', value);
    }

    /**
    * * Field Name: CancellationWindowDays
    * * Display Name: Cancellation Window (Days)
    * * SQL Data Type: int
    */
    get CancellationWindowDays(): number | null {
        return this.Get('CancellationWindowDays');
    }
    set CancellationWindowDays(value: number | null) {
        this.Set('CancellationWindowDays', value);
    }

    /**
    * * Field Name: GracePeriodDays
    * * Display Name: Grace Period (Days)
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get GracePeriodDays(): number {
        return this.Get('GracePeriodDays');
    }
    set GracePeriodDays(value: number) {
        this.Set('GracePeriodDays', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Orders: Subscriptions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: Subscription
 * * Base View: vwSubscriptions
 * * @description A recurring (Product, Customer, Beneficiary) relationship born from an order line (D20/D27). Renewal cycles spawn new Orders under it (Draft at launch, D20); schedules hang off order lines, not here.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscriptions')
export class mjBizAppsOrdersSubscriptionEntity extends BaseEntity<mjBizAppsOrdersSubscriptionEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscriptions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Subscriptions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Subscriptions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * RenewalLeadDays: Renewal lead days must be zero or a positive number. This ensures that renewal notifications or processes are scheduled for a valid timeframe in advance.
    * * Table-Level: A subscription cannot migrate from itself. The source subscription ID must be different from the current subscription's ID to prevent self-referencing migration loops.
    * * Table-Level: A subscription cannot migrate to itself. This prevents logical errors where a subscription's migration destination is set as its own record.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRenewalLeadDaysGreaterThanOrEqualToZero(result);
        this.ValidateMigratesFromSubscriptionIDNotEqualToID(result);
        this.ValidateMigratesToSubscriptionIDNotEqualToID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Renewal lead days must be zero or a positive number. This ensures that renewal notifications or processes are scheduled for a valid timeframe in advance.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRenewalLeadDaysGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.RenewalLeadDays != null && this.RenewalLeadDays < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RenewalLeadDays",
    			"Renewal lead days must be greater than or equal to zero.",
    			this.RenewalLeadDays,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * A subscription cannot migrate from itself. The source subscription ID must be different from the current subscription's ID to prevent self-referencing migration loops.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMigratesFromSubscriptionIDNotEqualToID(result: ValidationResult) {
        if (this.MigratesFromSubscriptionID != null && this.MigratesFromSubscriptionID === this.ID) {
            result.Errors.push(new ValidationErrorInfo(
                "MigratesFromSubscriptionID",
                "A subscription cannot migrate from itself. The Migrates From Subscription ID must be different from the Subscription ID.",
                this.MigratesFromSubscriptionID,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
    * A subscription cannot migrate to itself. This prevents logical errors where a subscription's migration destination is set as its own record.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMigratesToSubscriptionIDNotEqualToID(result: ValidationResult) {
    	if (this.MigratesToSubscriptionID != null && this.MigratesToSubscriptionID === this.ID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MigratesToSubscriptionID",
    			"A subscription cannot migrate to itself. Please select a different subscription for the migration destination.",
    			this.MigratesToSubscriptionID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubscriptionNumber
    * * Display Name: Subscription Number
    * * SQL Data Type: nvarchar(40)
    * * Description: Human-readable subscription identifier. Unique.
    */
    get SubscriptionNumber(): string {
        return this.Get('SubscriptionNumber');
    }
    set SubscriptionNumber(value: string) {
        this.Set('SubscriptionNumber', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)
    * * Description: The company whose product this subscription continues — stamped from Product.CompanyID at creation (D6). FK to __mj.Company.
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: OrderLineID
    * * Display Name: Order Line
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)
    */
    get OrderLineID(): string {
        return this.Get('OrderLineID');
    }
    set OrderLineID(value: string) {
        this.Set('OrderLineID', value);
    }

    /**
    * * Field Name: SubscriptionTypeID
    * * Display Name: Subscription Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Types (vwSubscriptionTypes.ID)
    */
    get SubscriptionTypeID(): string {
        return this.Get('SubscriptionTypeID');
    }
    set SubscriptionTypeID(value: string) {
        this.Set('SubscriptionTypeID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: HolderOrganizationID
    * * Display Name: Holder Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: FK to __mj_BizAppsCommon.Organization — the organization HOLDING this subscription (D65), fed from the order line's ship-to and possibly different from whoever paid.
    */
    get HolderOrganizationID(): string | null {
        return this.Get('HolderOrganizationID');
    }
    set HolderOrganizationID(value: string | null) {
        this.Set('HolderOrganizationID', value);
    }

    /**
    * * Field Name: BeneficiaryPersonID
    * * Display Name: Beneficiary Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: FK to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).
    */
    get BeneficiaryPersonID(): string | null {
        return this.Get('BeneficiaryPersonID');
    }
    set BeneficiaryPersonID(value: string | null) {
        this.Set('BeneficiaryPersonID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Canceled
    *   * Migrated
    *   * Paused
    *   * Trialing
    * * Description: Active | Paused | Canceled | Migrated | Trialing.
    */
    get Status(): 'Active' | 'Canceled' | 'Migrated' | 'Paused' | 'Trialing' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Canceled' | 'Migrated' | 'Paused' | 'Trialing') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    * * Description: Date the subscription began.
    */
    get StartDate(): Date {
        return this.Get('StartDate');
    }
    set StartDate(value: Date) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: TrialEndDate
    * * Display Name: Trial End Date
    * * SQL Data Type: date
    * * Description: When the trial ends (Trialing status).
    */
    get TrialEndDate(): Date | null {
        return this.Get('TrialEndDate');
    }
    set TrialEndDate(value: Date | null) {
        this.Set('TrialEndDate', value);
    }

    /**
    * * Field Name: CanceledAt
    * * Display Name: Canceled At
    * * SQL Data Type: datetimeoffset
    * * Description: UTC timestamp the cancellation was recorded.
    */
    get CanceledAt(): Date | null {
        return this.Get('CanceledAt');
    }
    set CanceledAt(value: Date | null) {
        this.Set('CanceledAt', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: date
    * * Description: Final service date after cancellation/migration.
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: AutoRenew
    * * Display Name: Auto Renew
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether renewal orders spawn automatically (Jeremy: auto-renew flag).
    */
    get AutoRenew(): boolean {
        return this.Get('AutoRenew');
    }
    set AutoRenew(value: boolean) {
        this.Set('AutoRenew', value);
    }

    /**
    * * Field Name: RenewalLeadDays
    * * Display Name: Renewal Lead Days
    * * SQL Data Type: int
    * * Description: How many days before CurrentPeriodEnd the renewal order is raised (Jeremy: invoice about three months ahead).
    */
    get RenewalLeadDays(): number | null {
        return this.Get('RenewalLeadDays');
    }
    set RenewalLeadDays(value: number | null) {
        this.Set('RenewalLeadDays', value);
    }

    /**
    * * Field Name: PaymentProviderID
    * * Display Name: Payment Provider
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)
    */
    get PaymentProviderID(): string | null {
        return this.Get('PaymentProviderID');
    }
    set PaymentProviderID(value: string | null) {
        this.Set('PaymentProviderID', value);
    }

    /**
    * * Field Name: ProviderSubscriptionID
    * * Display Name: Provider Subscription ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side subscription identifier (e.g. Stripe sub_...), when provider-billed.
    */
    get ProviderSubscriptionID(): string | null {
        return this.Get('ProviderSubscriptionID');
    }
    set ProviderSubscriptionID(value: string | null) {
        this.Set('ProviderSubscriptionID', value);
    }

    /**
    * * Field Name: MigratesFromSubscriptionID
    * * Display Name: Migrates From Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get MigratesFromSubscriptionID(): string | null {
        return this.Get('MigratesFromSubscriptionID');
    }
    set MigratesFromSubscriptionID(value: string | null) {
        this.Set('MigratesFromSubscriptionID', value);
    }

    /**
    * * Field Name: MigratesToSubscriptionID
    * * Display Name: Migrates To Subscription
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)
    */
    get MigratesToSubscriptionID(): string | null {
        return this.Get('MigratesToSubscriptionID');
    }
    set MigratesToSubscriptionID(value: string | null) {
        this.Set('MigratesToSubscriptionID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company Label
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: SubscriptionType
    * * Display Name: Subscription Type Label
    * * SQL Data Type: nvarchar(200)
    */
    get SubscriptionType(): string {
        return this.Get('SubscriptionType');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product Label
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
    }

    /**
    * * Field Name: HolderOrganization
    * * Display Name: Holder Organization Label
    * * SQL Data Type: nvarchar(255)
    */
    get HolderOrganization(): string | null {
        return this.Get('HolderOrganization');
    }

    /**
    * * Field Name: BeneficiaryPerson
    * * Display Name: Beneficiary Person Label
    * * SQL Data Type: nvarchar(100)
    */
    get BeneficiaryPerson(): string | null {
        return this.Get('BeneficiaryPerson');
    }

    /**
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider Label
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string | null {
        return this.Get('PaymentProvider');
    }

    /**
    * * Field Name: MigratesFromSubscription
    * * Display Name: Migrates From Subscription Label
    * * SQL Data Type: nvarchar(40)
    */
    get MigratesFromSubscription(): string | null {
        return this.Get('MigratesFromSubscription');
    }

    /**
    * * Field Name: MigratesToSubscription
    * * Display Name: Migrates To Subscription Label
    * * SQL Data Type: nvarchar(40)
    */
    get MigratesToSubscription(): string | null {
        return this.Get('MigratesToSubscription');
    }

    /**
    * * Field Name: RootMigratesFromSubscriptionID
    * * Display Name: Root Migrates From Subscription
    * * SQL Data Type: uniqueidentifier
    */
    get RootMigratesFromSubscriptionID(): string | null {
        return this.Get('RootMigratesFromSubscriptionID');
    }

    /**
    * * Field Name: RootMigratesToSubscriptionID
    * * Display Name: Root Migrates To Subscription
    * * SQL Data Type: uniqueidentifier
    */
    get RootMigratesToSubscriptionID(): string | null {
        return this.Get('RootMigratesToSubscriptionID');
    }
}

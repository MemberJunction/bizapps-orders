import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Orders: Customer Payment Methods
 */
export const mjBizAppsOrdersCustomerPaymentMethodSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CustomerOrganizationID: z.string().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer who owns this method.`),
    PaymentProviderID: z.string().describe(`
        * * Field Name: PaymentProviderID
        * * Display Name: Payment Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    ProviderCustomerID: z.string().nullable().describe(`
        * * Field Name: ProviderCustomerID
        * * Display Name: Provider Customer ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side customer identifier (e.g. Stripe cus_...).`),
    ProviderPaymentMethodID: z.string().nullable().describe(`
        * * Field Name: ProviderPaymentMethodID
        * * Display Name: Provider Payment Method ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Provider-side payment method token (e.g. Stripe pm_...).`),
    MethodType: z.string().nullable().describe(`
        * * Field Name: MethodType
        * * Display Name: Method Type
        * * SQL Data Type: nvarchar(20)
        * * Description: Kind of method (card, us_bank_account, ...). Provider vocabulary, informational.`),
    Brand: z.string().nullable().describe(`
        * * Field Name: Brand
        * * Display Name: Brand
        * * SQL Data Type: nvarchar(40)
        * * Description: Card brand for display (Visa, Mastercard, ...).`),
    Last4: z.string().nullable().describe(`
        * * Field Name: Last4
        * * Display Name: Last 4 Digits
        * * SQL Data Type: char(4)
        * * Description: Last four digits for display. Never more.`),
    ExpiryMonth: z.number().nullable().describe(`
        * * Field Name: ExpiryMonth
        * * Display Name: Expiry Month
        * * SQL Data Type: int
        * * Description: Card expiry month (1-12) for display/expiry warnings.`),
    ExpiryYear: z.number().nullable().describe(`
        * * Field Name: ExpiryYear
        * * Display Name: Expiry Year
        * * SQL Data Type: int
        * * Description: Card expiry year for display/expiry warnings.`),
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
    PaymentProvider: z.string().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersCustomerPaymentMethodEntityType = z.infer<typeof mjBizAppsOrdersCustomerPaymentMethodSchema>;

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
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).`),
    BeneficiaryOrganizationID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganizationID
        * * Display Name: Beneficiary Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Granted quantity (defaults from the entitlement definition).`),
    ValidFrom: z.date().nullable().describe(`
        * * Field Name: ValidFrom
        * * Display Name: Valid From
        * * SQL Data Type: date
        * * Description: Grant validity start.`),
    ValidTo: z.date().nullable().describe(`
        * * Field Name: ValidTo
        * * Display Name: Valid To
        * * SQL Data Type: date
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
    AttendeeName: z.string().nullable().describe(`
        * * Field Name: AttendeeName
        * * Display Name: Attendee Name
        * * SQL Data Type: nvarchar(300)
        * * Description: Attendee full name.`),
    AttendeeEmail: z.string().nullable().describe(`
        * * Field Name: AttendeeEmail
        * * Display Name: Attendee Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Attendee email.`),
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
    OrderID: z.string().describe(`
        * * Field Name: OrderID
        * * Display Name: Order
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
    DiscountPct: z.number().describe(`
        * * Field Name: DiscountPct
        * * Display Name: Discount Percentage
        * * SQL Data Type: decimal(7, 4)`),
    LineTotalNet: z.number().nullable().describe(`
        * * Field Name: LineTotalNet
        * * Display Name: Line Total Net
        * * SQL Data Type: decimal(18, 2)`),
    LineTax: z.number().describe(`
        * * Field Name: LineTax
        * * Display Name: Line Tax
        * * SQL Data Type: decimal(18, 2)`),
    LineTotalGross: z.number().nullable().describe(`
        * * Field Name: LineTotalGross
        * * Display Name: Line Total Gross
        * * SQL Data Type: decimal(18, 2)`),
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
    SubscriptionID: z.string().nullable().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier`),
    RevenueRecognitionScheduleID: z.string().nullable().describe(`
        * * Field Name: RevenueRecognitionScheduleID
        * * Display Name: Revenue Recognition Schedule
        * * SQL Data Type: uniqueidentifier`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier`),
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
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the venue address.`),
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
    RevenueRecognitionType: z.string().describe(`
        * * Field Name: RevenueRecognitionType
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: nvarchar(20)`),
    DeferredRecognitionShape: z.string().nullable().describe(`
        * * Field Name: DeferredRecognitionShape
        * * Display Name: Deferred Recognition Shape
        * * SQL Data Type: nvarchar(20)`),
    StandaloneSellingPrice: z.number().nullable().describe(`
        * * Field Name: StandaloneSellingPrice
        * * Display Name: Standalone Selling Price
        * * SQL Data Type: decimal(19, 4)`),
    SubscriptionType: z.string().describe(`
        * * Field Name: SubscriptionType
        * * Display Name: Subscription Type
        * * SQL Data Type: nvarchar(20)`),
    BehaviorClass: z.string().nullable().describe(`
        * * Field Name: BehaviorClass
        * * Display Name: Behavior Class
        * * SQL Data Type: nvarchar(100)`),
    DefaultBillingCycle: z.string().nullable().describe(`
        * * Field Name: DefaultBillingCycle
        * * Display Name: Default Billing Cycle
        * * SQL Data Type: nvarchar(20)`),
    DefaultSubscriptionTermMonths: z.number().nullable().describe(`
        * * Field Name: DefaultSubscriptionTermMonths
        * * Display Name: Default Subscription Term (Months)
        * * SQL Data Type: int`),
    IsTaxable: z.boolean().describe(`
        * * Field Name: IsTaxable
        * * Display Name: Is Taxable
        * * SQL Data Type: bit`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit`),
});

export type mjBizAppsOrdersEventProductEntityType = z.infer<typeof mjBizAppsOrdersEventProductSchema>;

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
        * * Description: Soft reference (no FK) to __mj_BizAppsAccounting.Dimension.`),
    DimensionValueID: z.string().describe(`
        * * Field Name: DimensionValueID
        * * Display Name: Dimension Value
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsAccounting.DimensionValue.`),
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

export type mjBizAppsOrdersOrderLineDimensionEntityType = z.infer<typeof mjBizAppsOrdersOrderLineDimensionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Order Lines
 */
export const mjBizAppsOrdersOrderLineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderID: z.string().describe(`
        * * Field Name: OrderID
        * * Display Name: Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
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
    DiscountPct: z.number().describe(`
        * * Field Name: DiscountPct
        * * Display Name: Discount Percentage
        * * SQL Data Type: decimal(7, 4)
        * * Default Value: 0
        * * Description: Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).`),
    LineTotalNet: z.number().nullable().describe(`
        * * Field Name: LineTotalNet
        * * Display Name: Net Total
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.`),
    LineTax: z.number().describe(`
        * * Field Name: LineTax
        * * Display Name: Tax Amount
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Tax amount for this line. 0 until the tax subsystem lands (O4).`),
    LineTotalGross: z.number().nullable().describe(`
        * * Field Name: LineTotalGross
        * * Display Name: Gross Total
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-computed stored gross line total = LineTotalNet + LineTax. Frozen after Confirm.`),
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
    SubscriptionID: z.string().nullable().describe(`
        * * Field Name: SubscriptionID
        * * Display Name: Subscription
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    RevenueRecognitionScheduleID: z.string().nullable().describe(`
        * * Field Name: RevenueRecognitionScheduleID
        * * Display Name: Revenue Recognition Schedule
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Schedules (vwRevenueRecognitionSchedules.ID)
        * * Description: The revenue recognition schedule this line carries (Deferred products). Each renewal order line carries its own schedule.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Optional free-text description for the line.`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK yet, MOD-15) to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order's journal entry is the aggregate of its lines' JEs.`),
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
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)`),
    SourceBundleProduct: z.string().nullable().describe(`
        * * Field Name: SourceBundleProduct
        * * Display Name: Source Bundle Product Name
        * * SQL Data Type: nvarchar(200)`),
    RootReversesOrderLineID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderLineID
        * * Display Name: Root Reverses Order Line
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
 * zod schema definition for the entity MJ_BizApps_Orders: Orders
 */
export const mjBizAppsOrdersOrderSchema = z.object({
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
    OrderType: z.union([z.literal('Amendment'), z.literal('Cancellation'), z.literal('CreditMemoOrder'), z.literal('Return'), z.literal('Sale')]).describe(`
        * * Field Name: OrderType
        * * Display Name: Order Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Sale
    * * Value List Type: List
    * * Possible Values 
    *   * Amendment
    *   * Cancellation
    *   * CreditMemoOrder
    *   * Return
    *   * Sale
        * * Description: Sale | Return | Cancellation | Amendment | CreditMemoOrder. Non-Sale types are the correction/reversal document family (BO-D9/D15).`),
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
    CustomerOrganizationID: z.string().nullable().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.`),
    CustomerPersonID: z.string().nullable().describe(`
        * * Field Name: CustomerPersonID
        * * Display Name: Customer Contact
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the buyer/contact person at the customer organization. Nullable.`),
    SalesRepUserID: z.string().nullable().describe(`
        * * Field Name: SalesRepUserID
        * * Display Name: Sales Representative
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    BillToAddressID: z.string().nullable().describe(`
        * * Field Name: BillToAddressID
        * * Display Name: Bill To Address
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.`),
    ShipToAddressID: z.string().nullable().describe(`
        * * Field Name: ShipToAddressID
        * * Display Name: Ship To Address
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.`),
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
    ReversesOrderID: z.string().nullable().describe(`
        * * Field Name: ReversesOrderID
        * * Display Name: Reverses Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
    ReversalReason: z.string().nullable().describe(`
        * * Field Name: ReversalReason
        * * Display Name: Reversal Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason this order reverses another (required by validation when ReversesOrderID is set).`),
    ContractID: z.string().nullable().describe(`
        * * Field Name: ContractID
        * * Display Name: Contract
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the governing contract record (contracts envelope, BO-D21; ownership pending the AIDP-contracts decision). Nullable.`),
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
        * * Display Name: Internal Notes
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
    SalesRepUser: z.string().nullable().describe(`
        * * Field Name: SalesRepUser
        * * Display Name: Sales Rep Name
        * * SQL Data Type: nvarchar(100)`),
    PaymentTermsType: z.string().nullable().describe(`
        * * Field Name: PaymentTermsType
        * * Display Name: Payment Terms Name
        * * SQL Data Type: nvarchar(200)`),
    PostedByUser: z.string().nullable().describe(`
        * * Field Name: PostedByUser
        * * Display Name: Posted By User Name
        * * SQL Data Type: nvarchar(100)`),
    ReversesOrder: z.string().nullable().describe(`
        * * Field Name: ReversesOrder
        * * Display Name: Reverses Order
        * * SQL Data Type: nvarchar(40)`),
    __mj_Latitude: z.number().nullable().describe(`
        * * Field Name: __mj_Latitude
        * * Display Name: Mj Latitude
        * * SQL Data Type: decimal(10, 6)`),
    __mj_Longitude: z.number().nullable().describe(`
        * * Field Name: __mj_Longitude
        * * Display Name: Mj Longitude
        * * SQL Data Type: decimal(10, 6)`),
    RootReversesOrderID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderID
        * * Display Name: Root Reverses Order
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersOrderEntityType = z.infer<typeof mjBizAppsOrdersOrderSchema>;

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
    OrderID: z.string().nullable().describe(`
        * * Field Name: OrderID
        * * Display Name: Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
    CustomerOrganizationID: z.string().nullable().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.`),
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
    PaymentID: z.string().describe(`
        * * Field Name: PaymentID
        * * Display Name: Payment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)`),
    OrderID: z.string().describe(`
        * * Field Name: OrderID
        * * Display Name: Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
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
    AllocatedByUser: z.string().nullable().describe(`
        * * Field Name: AllocatedByUser
        * * Display Name: Allocated By User
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsOrdersPaymentLineEntityType = z.infer<typeof mjBizAppsOrdersPaymentLineSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Payment Providers
 */
export const mjBizAppsOrdersPaymentProviderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProviderType: z.union([z.literal('Manual'), z.literal('Stripe')]).describe(`
        * * Field Name: ProviderType
        * * Display Name: Provider Type
        * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * Manual
    *   * Stripe
        * * Description: Stripe | Manual. Widens as additional processors land.`),
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
        * * Display Name: Active
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
 * zod schema definition for the entity MJ_BizApps_Orders: Payments
 */
export const mjBizAppsOrdersPaymentSchema = z.object({
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
        * * Display Name: Receiving Company
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Companies (vwCompanies.ID)`),
    CustomerOrganizationID: z.string().nullable().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the payer. NULL only for anonymous/e-commerce edge cases.`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: date
        * * Description: Date the money moved (bank date, not entry date).`),
    Method: z.union([z.literal('ACH'), z.literal('BankReturn'), z.literal('Cash'), z.literal('Chargeback'), z.literal('Check'), z.literal('CreditCard'), z.literal('GiftCard'), z.literal('InternalTransfer'), z.literal('Refund'), z.literal('Wire')]).describe(`
        * * Field Name: Method
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * BankReturn
    *   * Cash
    *   * Chargeback
    *   * Check
    *   * CreditCard
    *   * GiftCard
    *   * InternalTransfer
    *   * Refund
    *   * Wire
        * * Description: CreditCard | ACH | Wire | Check | Cash | InternalTransfer | Refund | Chargeback | BankReturn. Reversal methods carry negative Amount.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Gross amount received (negative for reversal methods).`),
    ProcessingFeeAmount: z.number().describe(`
        * * Field Name: ProcessingFeeAmount
        * * Display Name: Processing Fee
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
        * * Display Name: Payment Provider
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Providers (vwPaymentProviders.ID)`),
    PaymentIntentID: z.string().nullable().describe(`
        * * Field Name: PaymentIntentID
        * * Display Name: Payment Intent
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payment Intents (vwPaymentIntents.ID)`),
    PaymentMethodID: z.string().nullable().describe(`
        * * Field Name: PaymentMethodID
        * * Display Name: Payment Method ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Customer Payment Methods (vwCustomerPaymentMethods.ID)`),
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
    ReversesPaymentID: z.string().nullable().describe(`
        * * Field Name: ReversesPaymentID
        * * Display Name: Reverses Payment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)`),
    ReversalReason: z.string().nullable().describe(`
        * * Field Name: ReversalReason
        * * Display Name: Reversal Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason this payment reverses another (required by validation when ReversesPaymentID is set).`),
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
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).`),
    StoredValueAccountID: z.string().nullable().describe(`
        * * Field Name: StoredValueAccountID
        * * Display Name: Stored Value Account
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)
        * * Description: The stored-value account redeemed when Method = GiftCard (BO-D44).`),
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
        * * Display Name: Receiving Company Name
        * * SQL Data Type: nvarchar(50)`),
    PaymentProvider: z.string().nullable().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider Name
        * * SQL Data Type: nvarchar(200)`),
    RootReversesPaymentID: z.string().nullable().describe(`
        * * Field Name: RootReversesPaymentID
        * * Display Name: Root Reverses Payment
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersPaymentEntityType = z.infer<typeof mjBizAppsOrdersPaymentSchema>;

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
    Segment: z.string().nullable().describe(`
        * * Field Name: Segment
        * * Display Name: Segment
        * * SQL Data Type: nvarchar(40)
        * * Description: Region / channel / customer-tier scope label.`),
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
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this list participates in resolution.`),
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
        * * Display Name: Category Code
        * * SQL Data Type: nvarchar(40)
        * * Description: Stable machine code for the category. Unique when present.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Category Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the category.`),
    ParentProductCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentProductCategoryID
        * * Display Name: Parent Category ID
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
    ParentProductCategory: z.string().nullable().describe(`
        * * Field Name: ParentProductCategory
        * * Display Name: Parent Category
        * * SQL Data Type: nvarchar(200)`),
    RootParentProductCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentProductCategoryID
        * * Display Name: Root Parent Category
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
        * * Display Name: Code
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
});

export type mjBizAppsOrdersProductEntitlementEntityType = z.infer<typeof mjBizAppsOrdersProductEntitlementSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Performance Obligations
 */
export const mjBizAppsOrdersProductPerformanceObligationSchema = z.object({
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
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the obligation.`),
    RevenueRecognitionType: z.union([z.literal('Deferred'), z.literal('Immediate')]).describe(`
        * * Field Name: RevenueRecognitionType
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
        * * Description: Recognition pattern for THIS obligation (Immediate | Deferred), independent of siblings.`),
    StandaloneSellingPrice: z.number().describe(`
        * * Field Name: StandaloneSellingPrice
        * * Display Name: Standalone Selling Price
        * * SQL Data Type: decimal(19, 4)
        * * Description: Standalone selling price used for relative-SSP allocation across obligations.`),
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
});

export type mjBizAppsOrdersProductPerformanceObligationEntityType = z.infer<typeof mjBizAppsOrdersProductPerformanceObligationSchema>;

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
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Price Lists (vwPriceLists.ID)`),
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
    DefaultRevenueRecognitionType: z.union([z.literal('Deferred'), z.literal('Immediate')]).nullable().describe(`
        * * Field Name: DefaultRevenueRecognitionType
        * * Display Name: Default Revenue Recognition Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
        * * Description: Default recognition type stamped onto new products of this type (Immediate | Deferred).`),
    DefaultIsTaxable: z.boolean().describe(`
        * * Field Name: DefaultIsTaxable
        * * Display Name: Default Is Taxable
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Default taxability stamped onto new products of this type.`),
    IsBillableRecurring: z.boolean().describe(`
        * * Field Name: IsBillableRecurring
        * * Display Name: Is Billable Recurring
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether products of this type bill on a recurring cadence (memberships, subscriptions, usage).`),
    DefaultSubscriptionType: z.union([z.literal('Membership'), z.literal('None'), z.literal('Standard')]).describe(`
        * * Field Name: DefaultSubscriptionType
        * * Display Name: Default Subscription Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Membership
    *   * None
    *   * Standard
        * * Description: None | Standard | Membership — the subscription semantics stamped onto new products of this type (BO-D40).`),
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
    BehaviorClass: z.string().nullable().describe(`
        * * Field Name: BehaviorClass
        * * Display Name: Behavior Class
        * * SQL Data Type: nvarchar(100)
        * * Description: ClassFactory key of the ProductBehavior plugin for this type; Product.BehaviorClass overrides; default behavior otherwise (BO-D38).`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is active and selectable.`),
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
        * * Display Name: Product Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Types (vwProductTypes.ID)`),
    ProductCategoryID: z.string().describe(`
        * * Field Name: ProductCategoryID
        * * Display Name: Product Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
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
        * * Display Name: Successor Product ID
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
    RevenueRecognitionType: z.union([z.literal('Deferred'), z.literal('Immediate')]).describe(`
        * * Field Name: RevenueRecognitionType
        * * Display Name: Revenue Recognition Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Immediate
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
        * * Description: Immediate (Dr AR / Cr Sales) or Deferred (Dr AR / Cr Deferred Revenue). Drives the credit side of the order-booking journal entry.`),
    DeferredRecognitionShape: z.union([z.literal('ServicePeriod'), z.literal('SingleDate')]).nullable().describe(`
        * * Field Name: DeferredRecognitionShape
        * * Display Name: Deferred Recognition Shape
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ServicePeriod
    *   * SingleDate
        * * Description: For Deferred products: SingleDate (100 percent recognized on the event date) or ServicePeriod (spread over the line's service dates). Robert's two deferred shapes on their own axis (UPD-2).`),
    StandaloneSellingPrice: z.number().nullable().describe(`
        * * Field Name: StandaloneSellingPrice
        * * Display Name: Standalone Selling Price
        * * SQL Data Type: decimal(19, 4)
        * * Description: Standalone selling price for ASC 606 bundle revenue allocation (BO-D35; fields now, allocation engine later).`),
    SubscriptionType: z.union([z.literal('Membership'), z.literal('None'), z.literal('Standard')]).describe(`
        * * Field Name: SubscriptionType
        * * Display Name: Subscription Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Membership
    *   * None
    *   * Standard
        * * Description: None | Standard | Membership. Drives find-or-extend-or-create of a Subscription at order Confirm (BO-D40).`),
    BehaviorClass: z.string().nullable().describe(`
        * * Field Name: BehaviorClass
        * * Display Name: Behavior Class
        * * SQL Data Type: nvarchar(100)
        * * Description: ClassFactory key of this product's ProductBehavior plugin; falls back to ProductType.BehaviorClass then the default (BO-D38).`),
    DefaultBillingCycle: z.union([z.literal('Annual'), z.literal('Custom'), z.literal('Monthly'), z.literal('Quarterly')]).nullable().describe(`
        * * Field Name: DefaultBillingCycle
        * * Display Name: Default Billing Cycle
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly
        * * Description: Default billing cycle for subscription-creating products (Monthly | Quarterly | Annual | Custom).`),
    DefaultSubscriptionTermMonths: z.number().nullable().describe(`
        * * Field Name: DefaultSubscriptionTermMonths
        * * Display Name: Default Subscription Term (Months)
        * * SQL Data Type: int
        * * Description: Default subscription term in months.`),
    IsTaxable: z.boolean().describe(`
        * * Field Name: IsTaxable
        * * Display Name: Is Taxable
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this product is subject to tax (tax subsystem lands at O4).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional description of the product.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this product is active and orderable.`),
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
    ProductType: z.string().describe(`
        * * Field Name: ProductType
        * * Display Name: Product Type
        * * SQL Data Type: nvarchar(100)`),
    ProductCategory: z.string().describe(`
        * * Field Name: ProductCategory
        * * Display Name: Product Category
        * * SQL Data Type: nvarchar(200)`),
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(50)`),
    SuccessorProduct: z.string().nullable().describe(`
        * * Field Name: SuccessorProduct
        * * Display Name: Successor Product
        * * SQL Data Type: nvarchar(200)`),
    RootSuccessorProductID: z.string().nullable().describe(`
        * * Field Name: RootSuccessorProductID
        * * Display Name: Root Successor Product ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersProductEntityType = z.infer<typeof mjBizAppsOrdersProductSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Rev Rec Schedule Lines
 */
export const mjBizAppsOrdersRevRecScheduleLineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ScheduleID: z.string().describe(`
        * * Field Name: ScheduleID
        * * Display Name: Schedule
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Schedules (vwRevenueRecognitionSchedules.ID)`),
    PeriodStart: z.date().describe(`
        * * Field Name: PeriodStart
        * * Display Name: Period Start
        * * SQL Data Type: date
        * * Description: Start of this recognition period.`),
    PeriodEnd: z.date().describe(`
        * * Field Name: PeriodEnd
        * * Display Name: Period End
        * * SQL Data Type: date
        * * Description: End of this recognition period.`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Amount recognized in this period.`),
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the FORWARD-DATED __mj_BizAppsAccounting.JournalEntry staged for this period at booking-lock (D14): Dr Deferred Revenue / Cr Revenue, EffectiveDate = this period's recognition date, Status=Pending until swept into a batch.`),
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

export type mjBizAppsOrdersRevRecScheduleLineEntityType = z.infer<typeof mjBizAppsOrdersRevRecScheduleLineSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Revenue Recognition Schedules
 */
export const mjBizAppsOrdersRevenueRecognitionScheduleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SchedulingMethod: z.union([z.literal('Custom'), z.literal('Milestone'), z.literal('SingleDate'), z.literal('StraightLine')]).describe(`
        * * Field Name: SchedulingMethod
        * * Display Name: Scheduling Method
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Custom
    *   * Milestone
    *   * SingleDate
    *   * StraightLine
        * * Description: StraightLine (service-period spread) | SingleDate (100 percent on the event date) | Milestone | Custom.`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date
        * * Description: First recognition date.`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date
        * * Description: Last recognition date.`),
    TotalAmount: z.number().describe(`
        * * Field Name: TotalAmount
        * * Display Name: Total Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Total amount to recognize across all schedule lines.`),
    TotalRecognized: z.number().describe(`
        * * Field Name: TotalRecognized
        * * Display Name: Total Recognized
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Amount recognized so far (engine-maintained).`),
    IsComplete: z.boolean().describe(`
        * * Field Name: IsComplete
        * * Display Name: Is Complete
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether every line has been recognized.`),
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

export type mjBizAppsOrdersRevenueRecognitionScheduleEntityType = z.infer<typeof mjBizAppsOrdersRevenueRecognitionScheduleSchema>;

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
        * * Display Name: Sales Rep User
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
        * * Display Name: Name
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
        * * Display Name: Approval Required Role ID
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
        * * Display Name: Card Number
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
        * * Display Name: Beneficiary Person
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the card recipient.`),
    BeneficiaryOrganizationID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryOrganizationID
        * * Display Name: Beneficiary Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expiration Date
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
        * * Display Name: Stored Value Account
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
        * * Display Name: Related Payment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)`),
    RelatedOrderID: z.string().nullable().describe(`
        * * Field Name: RelatedOrderID
        * * Display Name: Related Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
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
    EventType: z.union([z.literal('Activated'), z.literal('Canceled'), z.literal('CancellationRequested'), z.literal('Created'), z.literal('Migrated'), z.literal('Paused'), z.literal('PaymentFailed'), z.literal('PaymentSucceeded'), z.literal('RenewalOrderSpawned'), z.literal('Resumed'), z.literal('TrialEnded'), z.literal('TrialStarted')]).describe(`
        * * Field Name: EventType
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * Activated
    *   * Canceled
    *   * CancellationRequested
    *   * Created
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
        * * Display Name: Related Payment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)`),
    RelatedOrderID: z.string().nullable().describe(`
        * * Field Name: RelatedOrderID
        * * Display Name: Related Order
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
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

export type mjBizAppsOrdersSubscriptionEventEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionEventSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Subscription Plans
 */
export const mjBizAppsOrdersSubscriptionPlanSchema = z.object({
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
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Plan Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the plan.`),
    BillingCycle: z.union([z.literal('Annual'), z.literal('Custom'), z.literal('Monthly'), z.literal('Quarterly')]).describe(`
        * * Field Name: BillingCycle
        * * Display Name: Billing Cycle
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly
        * * Description: Monthly | Quarterly | Annual | Custom (CustomCycleDays).`),
    CustomCycleDays: z.number().nullable().describe(`
        * * Field Name: CustomCycleDays
        * * Display Name: Custom Cycle Days
        * * SQL Data Type: int
        * * Description: Cycle length in days when BillingCycle = Custom.`),
    PricePerCycle: z.number().nullable().describe(`
        * * Field Name: PricePerCycle
        * * Display Name: Price Per Cycle
        * * SQL Data Type: decimal(18, 2)
        * * Description: Price per billing cycle. NULL = derive from the product/pricing engine.`),
    TrialDays: z.number().describe(`
        * * Field Name: TrialDays
        * * Display Name: Trial Days
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Free-trial length in days (0 = none).`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this plan is active and selectable.`),
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

export type mjBizAppsOrdersSubscriptionPlanEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionPlanSchema>;

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
    SubscriptionPlanID: z.string().nullable().describe(`
        * * Field Name: SubscriptionPlanID
        * * Display Name: Subscription Plan
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Plans (vwSubscriptionPlans.ID)`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    CustomerOrganizationID: z.string().nullable().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer Organization
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.`),
    BeneficiaryPersonID: z.string().nullable().describe(`
        * * Field Name: BeneficiaryPersonID
        * * Display Name: Beneficiary Person
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).`),
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
    CurrentPeriodStart: z.date().describe(`
        * * Field Name: CurrentPeriodStart
        * * Display Name: Current Period Start
        * * SQL Data Type: date
        * * Description: Start of the current paid-through period.`),
    CurrentPeriodEnd: z.date().describe(`
        * * Field Name: CurrentPeriodEnd
        * * Display Name: Current Period End
        * * SQL Data Type: date
        * * Description: End of the current paid-through period (renewal boundary).`),
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
    RenewalLeadDays: z.number().describe(`
        * * Field Name: RenewalLeadDays
        * * Display Name: Renewal Lead Days
        * * SQL Data Type: int
        * * Default Value: 90
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
        * * Display Name: Migrates From
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscriptions (vwSubscriptions.ID)`),
    MigratesToSubscriptionID: z.string().nullable().describe(`
        * * Field Name: MigratesToSubscriptionID
        * * Display Name: Migrates To
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
        * * Display Name: Company
        * * SQL Data Type: nvarchar(50)`),
    SubscriptionPlan: z.string().nullable().describe(`
        * * Field Name: SubscriptionPlan
        * * Display Name: Subscription Plan
        * * SQL Data Type: nvarchar(200)`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(200)`),
    PaymentProvider: z.string().nullable().describe(`
        * * Field Name: PaymentProvider
        * * Display Name: Payment Provider
        * * SQL Data Type: nvarchar(200)`),
    RootMigratesFromSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RootMigratesFromSubscriptionID
        * * Display Name: Root Migrates From
        * * SQL Data Type: uniqueidentifier`),
    RootMigratesToSubscriptionID: z.string().nullable().describe(`
        * * Field Name: RootMigratesToSubscriptionID
        * * Display Name: Root Migrates To
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersSubscriptionEntityType = z.infer<typeof mjBizAppsOrdersSubscriptionSchema>;
 
 

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
    * * ExpiryMonth: The expiry month must be a valid month number between 1 and 12, if it is provided.
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
    * The expiry month must be a valid month number between 1 and 12, if it is provided.
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
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer who owns this method.
    */
    get CustomerOrganizationID(): string {
        return this.Get('CustomerOrganizationID');
    }
    set CustomerOrganizationID(value: string) {
        this.Set('CustomerOrganizationID', value);
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
    * * Field Name: ProviderCustomerID
    * * Display Name: Provider Customer ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side customer identifier (e.g. Stripe cus_...).
    */
    get ProviderCustomerID(): string | null {
        return this.Get('ProviderCustomerID');
    }
    set ProviderCustomerID(value: string | null) {
        this.Set('ProviderCustomerID', value);
    }

    /**
    * * Field Name: ProviderPaymentMethodID
    * * Display Name: Provider Payment Method ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Provider-side payment method token (e.g. Stripe pm_...).
    */
    get ProviderPaymentMethodID(): string | null {
        return this.Get('ProviderPaymentMethodID');
    }
    set ProviderPaymentMethodID(value: string | null) {
        this.Set('ProviderPaymentMethodID', value);
    }

    /**
    * * Field Name: MethodType
    * * Display Name: Method Type
    * * SQL Data Type: nvarchar(20)
    * * Description: Kind of method (card, us_bank_account, ...). Provider vocabulary, informational.
    */
    get MethodType(): string | null {
        return this.Get('MethodType');
    }
    set MethodType(value: string | null) {
        this.Set('MethodType', value);
    }

    /**
    * * Field Name: Brand
    * * Display Name: Brand
    * * SQL Data Type: nvarchar(40)
    * * Description: Card brand for display (Visa, Mastercard, ...).
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
    * * Description: Last four digits for display. Never more.
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
    * * Description: Card expiry month (1-12) for display/expiry warnings.
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
    * * Description: Card expiry year for display/expiry warnings.
    */
    get ExpiryYear(): number | null {
        return this.Get('ExpiryYear');
    }
    set ExpiryYear(value: number | null) {
        this.Set('ExpiryYear', value);
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
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string {
        return this.Get('PaymentProvider');
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
    * * Table-Level: The validity end date (ValidTo) must be on or after the validity start date (ValidFrom) if both dates are specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateValidToOnOrAfterValidFrom(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The validity end date (ValidTo) must be on or after the validity start date (ValidFrom) if both dates are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateValidToOnOrAfterValidFrom(result: ValidationResult) {
    	if (this.ValidFrom != null && this.ValidTo != null) {
    		if (this.ValidTo < this.ValidFrom) {
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.
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
    * * SQL Data Type: date
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
    * * SQL Data Type: date
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
    * * Field Name: AttendeeName
    * * Display Name: Attendee Name
    * * SQL Data Type: nvarchar(300)
    * * Description: Attendee full name.
    */
    get AttendeeName(): string | null {
        return this.Get('AttendeeName');
    }
    set AttendeeName(value: string | null) {
        this.Set('AttendeeName', value);
    }

    /**
    * * Field Name: AttendeeEmail
    * * Display Name: Attendee Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Attendee email.
    */
    get AttendeeEmail(): string | null {
        return this.Get('AttendeeEmail');
    }
    set AttendeeEmail(value: string | null) {
        this.Set('AttendeeEmail', value);
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
    * * Field Name: OrderID
    * * Display Name: Order
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get OrderID(): string {
        return this.Get('OrderID');
    }
    set OrderID(value: string) {
        this.Set('OrderID', value);
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
    * * Field Name: DiscountPct
    * * Display Name: Discount Percentage
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
    * * Field Name: RevenueRecognitionScheduleID
    * * Display Name: Revenue Recognition Schedule
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Order Lines
    */
    get RevenueRecognitionScheduleID(): string | null {
        return this.Get('RevenueRecognitionScheduleID');
    }
    set RevenueRecognitionScheduleID(value: string | null) {
        this.Set('RevenueRecognitionScheduleID', value);
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
    * * Table-Level: If an event end date is specified, it must be on or after the event start date.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEventEndsAtOnOrAfterStartsAt(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If an event end date is specified, it must be on or after the event start date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEventEndsAtOnOrAfterStartsAt(result: ValidationResult) {
    	if (this.EventEndsAt != null && this.EventEndsAt < this.EventStartsAt) {
    		result.Errors.push(new ValidationErrorInfo(
    			"EventEndsAt",
    			"The event end date and time must be on or after the event start date and time.",
    			this.EventEndsAt,
    			ValidationErrorType.Failure
    		));
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the venue address.
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
    * * Field Name: RevenueRecognitionType
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get RevenueRecognitionType(): string {
        return this.Get('RevenueRecognitionType');
    }
    set RevenueRecognitionType(value: string) {
        this.Set('RevenueRecognitionType', value);
    }

    /**
    * * Field Name: DeferredRecognitionShape
    * * Display Name: Deferred Recognition Shape
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get DeferredRecognitionShape(): string | null {
        return this.Get('DeferredRecognitionShape');
    }
    set DeferredRecognitionShape(value: string | null) {
        this.Set('DeferredRecognitionShape', value);
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
    * * Field Name: SubscriptionType
    * * Display Name: Subscription Type
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get SubscriptionType(): string {
        return this.Get('SubscriptionType');
    }
    set SubscriptionType(value: string) {
        this.Set('SubscriptionType', value);
    }

    /**
    * * Field Name: BehaviorClass
    * * Display Name: Behavior Class
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get BehaviorClass(): string | null {
        return this.Get('BehaviorClass');
    }
    set BehaviorClass(value: string | null) {
        this.Set('BehaviorClass', value);
    }

    /**
    * * Field Name: DefaultBillingCycle
    * * Display Name: Default Billing Cycle
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get DefaultBillingCycle(): string | null {
        return this.Get('DefaultBillingCycle');
    }
    set DefaultBillingCycle(value: string | null) {
        this.Set('DefaultBillingCycle', value);
    }

    /**
    * * Field Name: DefaultSubscriptionTermMonths
    * * Display Name: Default Subscription Term (Months)
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get DefaultSubscriptionTermMonths(): number | null {
        return this.Get('DefaultSubscriptionTermMonths');
    }
    set DefaultSubscriptionTermMonths(value: number | null) {
        this.Set('DefaultSubscriptionTermMonths', value);
    }

    /**
    * * Field Name: IsTaxable
    * * Display Name: Is Taxable
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get IsTaxable(): boolean {
        return this.Get('IsTaxable');
    }
    set IsTaxable(value: boolean) {
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Orders: Products
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
    * * Description: Soft reference (no FK) to __mj_BizAppsAccounting.Dimension.
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
    * * Description: Soft reference (no FK) to __mj_BizAppsAccounting.DimensionValue.
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
    * * DiscountPct: The discount percentage must be a value between 0 and 1 (inclusive), representing a range from 0% to 100%.
    * * Quantity: The quantity for an order line item cannot be zero.
    * * UnitPrice: The unit price for an item must be greater than or equal to zero to prevent negative pricing on order lines.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountPctRange(result);
        this.ValidateQuantityNotZero(result);
        this.ValidateUnitPriceGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The discount percentage must be a value between 0 and 1 (inclusive), representing a range from 0% to 100%.
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
    * The quantity for an order line item cannot be zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityNotZero(result: ValidationResult) {
    	if (this.Quantity === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Quantity",
    			"Quantity cannot be zero.",
    			this.Quantity,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The unit price for an item must be greater than or equal to zero to prevent negative pricing on order lines.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateUnitPriceGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.UnitPrice != null && this.UnitPrice < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"UnitPrice",
    			"Unit price must be greater than or equal to zero.",
    			this.UnitPrice,
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
    * * Field Name: OrderID
    * * Display Name: Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get OrderID(): string {
        return this.Get('OrderID');
    }
    set OrderID(value: string) {
        this.Set('OrderID', value);
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
    * * Field Name: LineTotalNet
    * * Display Name: Net Total
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.
    */
    get LineTotalNet(): number | null {
        return this.Get('LineTotalNet');
    }
    set LineTotalNet(value: number | null) {
        this.Set('LineTotalNet', value);
    }

    /**
    * * Field Name: LineTax
    * * Display Name: Tax Amount
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
    * * Display Name: Gross Total
    * * SQL Data Type: decimal(18, 2)
    * * Description: Engine-computed stored gross line total = LineTotalNet + LineTax. Frozen after Confirm.
    */
    get LineTotalGross(): number | null {
        return this.Get('LineTotalGross');
    }
    set LineTotalGross(value: number | null) {
        this.Set('LineTotalGross', value);
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
    * * Field Name: RevenueRecognitionScheduleID
    * * Display Name: Revenue Recognition Schedule
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Schedules (vwRevenueRecognitionSchedules.ID)
    * * Description: The revenue recognition schedule this line carries (Deferred products). Each renewal order line carries its own schedule.
    */
    get RevenueRecognitionScheduleID(): string | null {
        return this.Get('RevenueRecognitionScheduleID');
    }
    set RevenueRecognitionScheduleID(value: string | null) {
        this.Set('RevenueRecognitionScheduleID', value);
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
    * * Description: Soft reference (no FK yet, MOD-15) to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order's journal entry is the aggregate of its lines' JEs.
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
    * * Field Name: SourceBundleProduct
    * * Display Name: Source Bundle Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get SourceBundleProduct(): string | null {
        return this.Get('SourceBundleProduct');
    }

    /**
    * * Field Name: RootReversesOrderLineID
    * * Display Name: Root Reverses Order Line
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesOrderLineID(): string | null {
        return this.Get('RootReversesOrderLineID');
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
    * * NextSequenceNumber: The next sequence number must be a positive integer greater than zero.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateNextSequenceNumberGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The next sequence number must be a positive integer greater than zero.
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
 * MJ_BizApps_Orders: Orders - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: Order
 * * Base View: vwOrders
 * * @description An order header — the customer's commitment AND the receivable (D2). On the FIRST transition to Confirmed, one balanced journal entry per line is booked into BizApps Accounting (D10). CompanyID is the originating/owning company — a document/visibility anchor, never GL resolution. No currency columns (FX deferred, D24).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Orders')
export class mjBizAppsOrdersOrderEntity extends BaseEntity<mjBizAppsOrdersOrderEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Orders record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Orders record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersOrderEntity
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
    *   * Amendment
    *   * Cancellation
    *   * CreditMemoOrder
    *   * Return
    *   * Sale
    * * Description: Sale | Return | Cancellation | Amendment | CreditMemoOrder. Non-Sale types are the correction/reversal document family (BO-D9/D15).
    */
    get OrderType(): 'Amendment' | 'Cancellation' | 'CreditMemoOrder' | 'Return' | 'Sale' {
        return this.Get('OrderType');
    }
    set OrderType(value: 'Amendment' | 'Cancellation' | 'CreditMemoOrder' | 'Return' | 'Sale') {
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
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer Organization
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.
    */
    get CustomerOrganizationID(): string | null {
        return this.Get('CustomerOrganizationID');
    }
    set CustomerOrganizationID(value: string | null) {
        this.Set('CustomerOrganizationID', value);
    }

    /**
    * * Field Name: CustomerPersonID
    * * Display Name: Customer Contact
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the buyer/contact person at the customer organization. Nullable.
    */
    get CustomerPersonID(): string | null {
        return this.Get('CustomerPersonID');
    }
    set CustomerPersonID(value: string | null) {
        this.Set('CustomerPersonID', value);
    }

    /**
    * * Field Name: SalesRepUserID
    * * Display Name: Sales Representative
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.
    */
    get ShipToAddressID(): string | null {
        return this.Get('ShipToAddressID');
    }
    set ShipToAddressID(value: string | null) {
        this.Set('ShipToAddressID', value);
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
    * * Field Name: ReversesOrderID
    * * Display Name: Reverses Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get ReversesOrderID(): string | null {
        return this.Get('ReversesOrderID');
    }
    set ReversesOrderID(value: string | null) {
        this.Set('ReversesOrderID', value);
    }

    /**
    * * Field Name: ReversalReason
    * * Display Name: Reversal Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reason this order reverses another (required by validation when ReversesOrderID is set).
    */
    get ReversalReason(): string | null {
        return this.Get('ReversalReason');
    }
    set ReversalReason(value: string | null) {
        this.Set('ReversalReason', value);
    }

    /**
    * * Field Name: ContractID
    * * Display Name: Contract
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the governing contract record (contracts envelope, BO-D21; ownership pending the AIDP-contracts decision). Nullable.
    */
    get ContractID(): string | null {
        return this.Get('ContractID');
    }
    set ContractID(value: string | null) {
        this.Set('ContractID', value);
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
    * * Display Name: Internal Notes
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
    * * Field Name: SalesRepUser
    * * Display Name: Sales Rep Name
    * * SQL Data Type: nvarchar(100)
    */
    get SalesRepUser(): string | null {
        return this.Get('SalesRepUser');
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
    * * Field Name: PostedByUser
    * * Display Name: Posted By User Name
    * * SQL Data Type: nvarchar(100)
    */
    get PostedByUser(): string | null {
        return this.Get('PostedByUser');
    }

    /**
    * * Field Name: ReversesOrder
    * * Display Name: Reverses Order
    * * SQL Data Type: nvarchar(40)
    */
    get ReversesOrder(): string | null {
        return this.Get('ReversesOrder');
    }

    /**
    * * Field Name: __mj_Latitude
    * * Display Name: Mj Latitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Latitude(): number | null {
        return this.Get('__mj_Latitude');
    }

    /**
    * * Field Name: __mj_Longitude
    * * Display Name: Mj Longitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Longitude(): number | null {
        return this.Get('__mj_Longitude');
    }

    /**
    * * Field Name: RootReversesOrderID
    * * Display Name: Root Reverses Order
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesOrderID(): string | null {
        return this.Get('RootReversesOrderID');
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
    * * Field Name: OrderID
    * * Display Name: Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get OrderID(): string | null {
        return this.Get('OrderID');
    }
    set OrderID(value: string | null) {
        this.Set('OrderID', value);
    }

    /**
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer Organization
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.
    */
    get CustomerOrganizationID(): string | null {
        return this.Get('CustomerOrganizationID');
    }
    set CustomerOrganizationID(value: string | null) {
        this.Set('CustomerOrganizationID', value);
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
    * * Amount: The allocation amount cannot be zero. Every allocation must have a non-zero positive or negative value to be valid.
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
    * The allocation amount cannot be zero. Every allocation must have a non-zero positive or negative value to be valid.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountNotZero(result: ValidationResult) {
    	if (this.Amount === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Amount",
    			"The allocation amount cannot be zero. Please specify a valid positive or negative amount.",
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
    * * Field Name: PaymentID
    * * Display Name: Payment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)
    */
    get PaymentID(): string {
        return this.Get('PaymentID');
    }
    set PaymentID(value: string) {
        this.Set('PaymentID', value);
    }

    /**
    * * Field Name: OrderID
    * * Display Name: Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get OrderID(): string {
        return this.Get('OrderID');
    }
    set OrderID(value: string) {
        this.Set('OrderID', value);
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
    * * Field Name: AllocatedByUser
    * * Display Name: Allocated By User
    * * SQL Data Type: nvarchar(100)
    */
    get AllocatedByUser(): string | null {
        return this.Get('AllocatedByUser');
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
    * * Field Name: ProviderType
    * * Display Name: Provider Type
    * * SQL Data Type: nvarchar(40)
    * * Value List Type: List
    * * Possible Values 
    *   * Manual
    *   * Stripe
    * * Description: Stripe | Manual. Widens as additional processors land.
    */
    get ProviderType(): 'Manual' | 'Stripe' {
        return this.Get('ProviderType');
    }
    set ProviderType(value: 'Manual' | 'Stripe') {
        this.Set('ProviderType', value);
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
    * * ID: The ID of this record must always be 1 to ensure that only a single configuration or sequence record exists in the system.
    * * NextSequenceNumber: The next sequence number must be a positive number greater than zero to ensure proper sequence generation.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateIDIsOne(result);
        this.ValidateNextSequenceNumberGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The ID of this record must always be 1 to ensure that only a single configuration or sequence record exists in the system.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateIDIsOne(result: ValidationResult) {
    	if (this.ID !== 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ID",
    			"The ID must be equal to 1.",
    			this.ID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The next sequence number must be a positive number greater than zero to ensure proper sequence generation.
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
    * * NetDays: Net days must be a non-negative number (0 or greater).
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
    * Net days must be a non-negative number (0 or greater).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNetDaysGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.NetDays < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NetDays",
    			"Net days must be 0 or greater.",
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
    * * Display Name: Active
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
 * MJ_BizApps_Orders: Payments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: Payment
 * * Base View: vwPayments
 * * @description A money movement: a customer receipt or a reversal (refund/chargeback/bank return). Booked to accounting at capture; applied to orders via PaymentLine.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Payments')
export class mjBizAppsOrdersPaymentEntity extends BaseEntity<mjBizAppsOrdersPaymentEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Payments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Payments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersPaymentEntity
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
    * * Display Name: Receiving Company
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
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer Organization
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the payer. NULL only for anonymous/e-commerce edge cases.
    */
    get CustomerOrganizationID(): string | null {
        return this.Get('CustomerOrganizationID');
    }
    set CustomerOrganizationID(value: string | null) {
        this.Set('CustomerOrganizationID', value);
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
    * * Field Name: Method
    * * Display Name: Payment Method
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * BankReturn
    *   * Cash
    *   * Chargeback
    *   * Check
    *   * CreditCard
    *   * GiftCard
    *   * InternalTransfer
    *   * Refund
    *   * Wire
    * * Description: CreditCard | ACH | Wire | Check | Cash | InternalTransfer | Refund | Chargeback | BankReturn. Reversal methods carry negative Amount.
    */
    get Method(): 'ACH' | 'BankReturn' | 'Cash' | 'Chargeback' | 'Check' | 'CreditCard' | 'GiftCard' | 'InternalTransfer' | 'Refund' | 'Wire' {
        return this.Get('Method');
    }
    set Method(value: 'ACH' | 'BankReturn' | 'Cash' | 'Chargeback' | 'Check' | 'CreditCard' | 'GiftCard' | 'InternalTransfer' | 'Refund' | 'Wire') {
        this.Set('Method', value);
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
    * * Display Name: Processing Fee
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
    * * Field Name: PaymentIntentID
    * * Display Name: Payment Intent
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
    * * Field Name: PaymentMethodID
    * * Display Name: Payment Method ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Customer Payment Methods (vwCustomerPaymentMethods.ID)
    */
    get PaymentMethodID(): string | null {
        return this.Get('PaymentMethodID');
    }
    set PaymentMethodID(value: string | null) {
        this.Set('PaymentMethodID', value);
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
    * * Field Name: ReversesPaymentID
    * * Display Name: Reverses Payment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)
    */
    get ReversesPaymentID(): string | null {
        return this.Get('ReversesPaymentID');
    }
    set ReversesPaymentID(value: string | null) {
        this.Set('ReversesPaymentID', value);
    }

    /**
    * * Field Name: ReversalReason
    * * Display Name: Reversal Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reason this payment reverses another (required by validation when ReversesPaymentID is set).
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
    * * Display Name: Journal Entry
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).
    */
    get JournalEntryID(): string | null {
        return this.Get('JournalEntryID');
    }
    set JournalEntryID(value: string | null) {
        this.Set('JournalEntryID', value);
    }

    /**
    * * Field Name: StoredValueAccountID
    * * Display Name: Stored Value Account
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Stored Value Accounts (vwStoredValueAccounts.ID)
    * * Description: The stored-value account redeemed when Method = GiftCard (BO-D44).
    */
    get StoredValueAccountID(): string | null {
        return this.Get('StoredValueAccountID');
    }
    set StoredValueAccountID(value: string | null) {
        this.Set('StoredValueAccountID', value);
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
    * * Display Name: Receiving Company Name
    * * SQL Data Type: nvarchar(50)
    */
    get ReceivingCompany(): string {
        return this.Get('ReceivingCompany');
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
    * * Field Name: RootReversesPaymentID
    * * Display Name: Root Reverses Payment
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesPaymentID(): string | null {
        return this.Get('RootReversesPaymentID');
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
    * * Field Name: Segment
    * * Display Name: Segment
    * * SQL Data Type: nvarchar(40)
    * * Description: Region / channel / customer-tier scope label.
    */
    get Segment(): string | null {
        return this.Get('Segment');
    }
    set Segment(value: string | null) {
        this.Set('Segment', value);
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this list participates in resolution.
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
    			"The maximum quantity cannot be less than the minimum quantity of " + this.MinQuantity + ".",
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
    * * Quantity: The quantity of a component product in a bundle must be greater than zero to ensure valid pricing and inventory calculations.
    * * Table-Level: A bundle product cannot contain itself as a component. The bundle product and component product must be different to prevent circular relationships.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateQuantityGreaterThanZero(result);
        this.ValidateBundleProductNotEqualToComponentProduct(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The quantity of a component product in a bundle must be greater than zero to ensure valid pricing and inventory calculations.
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
    * A bundle product cannot contain itself as a component. The bundle product and component product must be different to prevent circular relationships.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateBundleProductNotEqualToComponentProduct(result: ValidationResult) {
    	if (this.BundleProductID != null && this.ComponentProductID != null && this.BundleProductID === this.ComponentProductID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ComponentProductID",
    			"A bundle product cannot contain itself as a component. The Bundle Product and Component Product must be different.",
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
    * * Table-Level: A product category cannot be its own parent category. This prevents circular references in the category hierarchy.
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
    * A product category cannot be its own parent category. This prevents circular references in the category hierarchy.
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
    * * Display Name: Category Code
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
    * * Display Name: Category Name
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
    * * Display Name: Parent Category ID
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
    * * Field Name: ParentProductCategory
    * * Display Name: Parent Category
    * * SQL Data Type: nvarchar(200)
    */
    get ParentProductCategory(): string | null {
        return this.Get('ParentProductCategory');
    }

    /**
    * * Field Name: RootParentProductCategoryID
    * * Display Name: Root Parent Category
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
    * * Display Name: Code
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
}


/**
 * MJ_BizApps_Orders: Product Performance Obligations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductPerformanceObligation
 * * Base View: vwProductPerformanceObligations
 * * @description ASC 606 performance obligation (BO-D35): one or more per product; SSP drives bundle allocation. Fields now; the allocation engine is deferred. GL routing via GLAccountLink (MOD-2).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Product Performance Obligations')
export class mjBizAppsOrdersProductPerformanceObligationEntity extends BaseEntity<mjBizAppsOrdersProductPerformanceObligationEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Product Performance Obligations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Product Performance Obligations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersProductPerformanceObligationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Product Performance Obligations entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * StandaloneSellingPrice: The standalone selling price of a product must be greater than or equal to zero to ensure valid pricing data.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateStandaloneSellingPriceGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The standalone selling price of a product must be greater than or equal to zero to ensure valid pricing data.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateStandaloneSellingPriceGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.StandaloneSellingPrice != null && this.StandaloneSellingPrice < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"StandaloneSellingPrice",
    			"The standalone selling price cannot be negative.",
    			this.StandaloneSellingPrice,
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
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the obligation.
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: RevenueRecognitionType
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
    * * Description: Recognition pattern for THIS obligation (Immediate | Deferred), independent of siblings.
    */
    get RevenueRecognitionType(): 'Deferred' | 'Immediate' {
        return this.Get('RevenueRecognitionType');
    }
    set RevenueRecognitionType(value: 'Deferred' | 'Immediate') {
        this.Set('RevenueRecognitionType', value);
    }

    /**
    * * Field Name: StandaloneSellingPrice
    * * Display Name: Standalone Selling Price
    * * SQL Data Type: decimal(19, 4)
    * * Description: Standalone selling price used for relative-SSP allocation across obligations.
    */
    get StandaloneSellingPrice(): number {
        return this.Get('StandaloneSellingPrice');
    }
    set StandaloneSellingPrice(value: number) {
        this.Set('StandaloneSellingPrice', value);
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
}


/**
 * MJ_BizApps_Orders: Product Prices - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductPrice
 * * Base View: vwProductPrices
 * * @description An effective-dated price for a product (BO-D33). Resolution engine = feature F9; direct UnitPrice entry remains the precedence base so order entry never blocks.
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
    * * Table-Level: Ensures that the effective end date is on or after the effective start date, preventing invalid date ranges.
    * * Table-Level: The maximum quantity must be greater than or equal to the minimum quantity when both are specified.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEffectiveToAfterOrEqualToEffectiveFrom(result);
        this.ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Ensures that the effective end date is on or after the effective start date, preventing invalid date ranges.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEffectiveToAfterOrEqualToEffectiveFrom(result: ValidationResult) {
    	if (this.EffectiveTo != null && this.EffectiveFrom != null) {
    		const toDate = new Date(this.EffectiveTo);
    		const fromDate = new Date(this.EffectiveFrom);
    		if (toDate.getTime() < fromDate.getTime()) {
    			result.Errors.push(new ValidationErrorInfo(
    				"EffectiveTo",
    				"The Effective To date must be greater than or equal to the Effective From date.",
    				this.EffectiveTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * The maximum quantity must be greater than or equal to the minimum quantity when both are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxQuantityGreaterThanOrEqualToMinQuantity(result: ValidationResult) {
    	if (this.MinQuantity != null && this.MaxQuantity != null) {
    		if (this.MaxQuantity < this.MinQuantity) {
    			result.Errors.push(new ValidationErrorInfo(
    				"MaxQuantity",
    				"The maximum quantity (" + this.MaxQuantity + ") must be greater than or equal to the minimum quantity (" + this.MinQuantity + ").",
    				this.MaxQuantity,
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
    * * Field Name: DefaultRevenueRecognitionType
    * * Display Name: Default Revenue Recognition Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
    * * Description: Default recognition type stamped onto new products of this type (Immediate | Deferred).
    */
    get DefaultRevenueRecognitionType(): 'Deferred' | 'Immediate' | null {
        return this.Get('DefaultRevenueRecognitionType');
    }
    set DefaultRevenueRecognitionType(value: 'Deferred' | 'Immediate' | null) {
        this.Set('DefaultRevenueRecognitionType', value);
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
    * * Field Name: IsBillableRecurring
    * * Display Name: Is Billable Recurring
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether products of this type bill on a recurring cadence (memberships, subscriptions, usage).
    */
    get IsBillableRecurring(): boolean {
        return this.Get('IsBillableRecurring');
    }
    set IsBillableRecurring(value: boolean) {
        this.Set('IsBillableRecurring', value);
    }

    /**
    * * Field Name: DefaultSubscriptionType
    * * Display Name: Default Subscription Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Membership
    *   * None
    *   * Standard
    * * Description: None | Standard | Membership — the subscription semantics stamped onto new products of this type (BO-D40).
    */
    get DefaultSubscriptionType(): 'Membership' | 'None' | 'Standard' {
        return this.Get('DefaultSubscriptionType');
    }
    set DefaultSubscriptionType(value: 'Membership' | 'None' | 'Standard') {
        this.Set('DefaultSubscriptionType', value);
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
    * * Field Name: BehaviorClass
    * * Display Name: Behavior Class
    * * SQL Data Type: nvarchar(100)
    * * Description: ClassFactory key of the ProductBehavior plugin for this type; Product.BehaviorClass overrides; default behavior otherwise (BO-D38).
    */
    get BehaviorClass(): string | null {
        return this.Get('BehaviorClass');
    }
    set BehaviorClass(value: string | null) {
        this.Set('BehaviorClass', value);
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
    * * Table-Level: If both the available from and available to dates are specified, the available to date must be greater than or equal to the available from date to ensure a valid date range.
    * * Table-Level: A product cannot be its own successor. If a successor product is specified, it must be a different product.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAvailabilityDateRange(result);
        this.ValidateSuccessorProductIDNotEqualToID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * If both the available from and available to dates are specified, the available to date must be greater than or equal to the available from date to ensure a valid date range.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAvailabilityDateRange(result: ValidationResult) {
    	if (this.AvailableFrom != null && this.AvailableTo != null) {
    		const fromDate = new Date(this.AvailableFrom);
    		const toDate = new Date(this.AvailableTo);
    		if (toDate < fromDate) {
    			result.Errors.push(new ValidationErrorInfo(
    				"AvailableTo",
    				"The 'Available To' date must be greater than or equal to the 'Available From' date.",
    				this.AvailableTo,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * A product cannot be its own successor. If a successor product is specified, it must be a different product.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSuccessorProductIDNotEqualToID(result: ValidationResult) {
    	if (this.SuccessorProductID != null && this.SuccessorProductID === this.ID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"SuccessorProductID",
    			"A product cannot be its own successor. Please select a different product.",
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
    * * Display Name: Product Type ID
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
    * * Display Name: Product Category ID
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
    * * Display Name: Company ID
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
    * * Display Name: Successor Product ID
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
    * * Field Name: RevenueRecognitionType
    * * Display Name: Revenue Recognition Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Immediate
    * * Value List Type: List
    * * Possible Values 
    *   * Deferred
    *   * Immediate
    * * Description: Immediate (Dr AR / Cr Sales) or Deferred (Dr AR / Cr Deferred Revenue). Drives the credit side of the order-booking journal entry.
    */
    get RevenueRecognitionType(): 'Deferred' | 'Immediate' {
        return this.Get('RevenueRecognitionType');
    }
    set RevenueRecognitionType(value: 'Deferred' | 'Immediate') {
        this.Set('RevenueRecognitionType', value);
    }

    /**
    * * Field Name: DeferredRecognitionShape
    * * Display Name: Deferred Recognition Shape
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ServicePeriod
    *   * SingleDate
    * * Description: For Deferred products: SingleDate (100 percent recognized on the event date) or ServicePeriod (spread over the line's service dates). Robert's two deferred shapes on their own axis (UPD-2).
    */
    get DeferredRecognitionShape(): 'ServicePeriod' | 'SingleDate' | null {
        return this.Get('DeferredRecognitionShape');
    }
    set DeferredRecognitionShape(value: 'ServicePeriod' | 'SingleDate' | null) {
        this.Set('DeferredRecognitionShape', value);
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
    * * Field Name: SubscriptionType
    * * Display Name: Subscription Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Membership
    *   * None
    *   * Standard
    * * Description: None | Standard | Membership. Drives find-or-extend-or-create of a Subscription at order Confirm (BO-D40).
    */
    get SubscriptionType(): 'Membership' | 'None' | 'Standard' {
        return this.Get('SubscriptionType');
    }
    set SubscriptionType(value: 'Membership' | 'None' | 'Standard') {
        this.Set('SubscriptionType', value);
    }

    /**
    * * Field Name: BehaviorClass
    * * Display Name: Behavior Class
    * * SQL Data Type: nvarchar(100)
    * * Description: ClassFactory key of this product's ProductBehavior plugin; falls back to ProductType.BehaviorClass then the default (BO-D38).
    */
    get BehaviorClass(): string | null {
        return this.Get('BehaviorClass');
    }
    set BehaviorClass(value: string | null) {
        this.Set('BehaviorClass', value);
    }

    /**
    * * Field Name: DefaultBillingCycle
    * * Display Name: Default Billing Cycle
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly
    * * Description: Default billing cycle for subscription-creating products (Monthly | Quarterly | Annual | Custom).
    */
    get DefaultBillingCycle(): 'Annual' | 'Custom' | 'Monthly' | 'Quarterly' | null {
        return this.Get('DefaultBillingCycle');
    }
    set DefaultBillingCycle(value: 'Annual' | 'Custom' | 'Monthly' | 'Quarterly' | null) {
        this.Set('DefaultBillingCycle', value);
    }

    /**
    * * Field Name: DefaultSubscriptionTermMonths
    * * Display Name: Default Subscription Term (Months)
    * * SQL Data Type: int
    * * Description: Default subscription term in months.
    */
    get DefaultSubscriptionTermMonths(): number | null {
        return this.Get('DefaultSubscriptionTermMonths');
    }
    set DefaultSubscriptionTermMonths(value: number | null) {
        this.Set('DefaultSubscriptionTermMonths', value);
    }

    /**
    * * Field Name: IsTaxable
    * * Display Name: Is Taxable
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this product is subject to tax (tax subsystem lands at O4).
    */
    get IsTaxable(): boolean {
        return this.Get('IsTaxable');
    }
    set IsTaxable(value: boolean) {
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this product is active and orderable.
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
    * * Field Name: ProductType
    * * Display Name: Product Type
    * * SQL Data Type: nvarchar(100)
    */
    get ProductType(): string {
        return this.Get('ProductType');
    }

    /**
    * * Field Name: ProductCategory
    * * Display Name: Product Category
    * * SQL Data Type: nvarchar(200)
    */
    get ProductCategory(): string {
        return this.Get('ProductCategory');
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: SuccessorProduct
    * * Display Name: Successor Product
    * * SQL Data Type: nvarchar(200)
    */
    get SuccessorProduct(): string | null {
        return this.Get('SuccessorProduct');
    }

    /**
    * * Field Name: RootSuccessorProductID
    * * Display Name: Root Successor Product ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootSuccessorProductID(): string | null {
        return this.Get('RootSuccessorProductID');
    }
}


/**
 * MJ_BizApps_Orders: Rev Rec Schedule Lines - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: RevRecScheduleLine
 * * Base View: vwRevRecScheduleLines
 * * @description One recognition period of a schedule (D14). Line 1 carries the rounding remainder. A real forward-dated JournalEntry is written per period at booking-lock; the ledger is the truth — no recognition-state tracking here.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Rev Rec Schedule Lines')
export class mjBizAppsOrdersRevRecScheduleLineEntity extends BaseEntity<mjBizAppsOrdersRevRecScheduleLineEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Rev Rec Schedule Lines record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Rev Rec Schedule Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersRevRecScheduleLineEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Rev Rec Schedule Lines entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The period end date must be on or after the period start date to ensure a valid date range.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidatePeriodEndAfterOrEqualToPeriodStart(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The period end date must be on or after the period start date to ensure a valid date range.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePeriodEndAfterOrEqualToPeriodStart(result: ValidationResult) {
    	if (this.PeriodStart != null && this.PeriodEnd != null) {
    		if (this.PeriodEnd < this.PeriodStart) {
    			result.Errors.push(new ValidationErrorInfo(
    				"PeriodEnd",
    				"The Period End date must be on or after the Period Start date.",
    				this.PeriodEnd,
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
    * * Field Name: ScheduleID
    * * Display Name: Schedule
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Revenue Recognition Schedules (vwRevenueRecognitionSchedules.ID)
    */
    get ScheduleID(): string {
        return this.Get('ScheduleID');
    }
    set ScheduleID(value: string) {
        this.Set('ScheduleID', value);
    }

    /**
    * * Field Name: PeriodStart
    * * Display Name: Period Start
    * * SQL Data Type: date
    * * Description: Start of this recognition period.
    */
    get PeriodStart(): Date {
        return this.Get('PeriodStart');
    }
    set PeriodStart(value: Date) {
        this.Set('PeriodStart', value);
    }

    /**
    * * Field Name: PeriodEnd
    * * Display Name: Period End
    * * SQL Data Type: date
    * * Description: End of this recognition period.
    */
    get PeriodEnd(): Date {
        return this.Get('PeriodEnd');
    }
    set PeriodEnd(value: Date) {
        this.Set('PeriodEnd', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Amount recognized in this period.
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: JournalEntryID
    * * Display Name: Journal Entry
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the FORWARD-DATED __mj_BizAppsAccounting.JournalEntry staged for this period at booking-lock (D14): Dr Deferred Revenue / Cr Revenue, EffectiveDate = this period's recognition date, Status=Pending until swept into a batch.
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
}


/**
 * MJ_BizApps_Orders: Revenue Recognition Schedules - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: RevenueRecognitionSchedule
 * * Base View: vwRevenueRecognitionSchedules
 * * @description The COMPUTED recognition envelope (method, dates, totals) — kept for MRR/ARR display and as the computation source (D14). Owned by an order line. The ledger truth is the real forward-dated JournalEntry rows written at booking-lock; changes net via correcting orders, never edits.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Revenue Recognition Schedules')
export class mjBizAppsOrdersRevenueRecognitionScheduleEntity extends BaseEntity<mjBizAppsOrdersRevenueRecognitionScheduleEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Revenue Recognition Schedules record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Revenue Recognition Schedules record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersRevenueRecognitionScheduleEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Revenue Recognition Schedules entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: The End Date must be on or after the Start Date.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndDateGreaterThanOrEqualToStartDate(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The End Date must be on or after the Start Date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateGreaterThanOrEqualToStartDate(result: ValidationResult) {
    	if (this.StartDate != null && this.EndDate != null && this.EndDate < this.StartDate) {
    		result.Errors.push(new ValidationErrorInfo(
    			"EndDate",
    			"The End Date must be on or after the Start Date.",
    			this.EndDate,
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
    * * Field Name: SchedulingMethod
    * * Display Name: Scheduling Method
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Custom
    *   * Milestone
    *   * SingleDate
    *   * StraightLine
    * * Description: StraightLine (service-period spread) | SingleDate (100 percent on the event date) | Milestone | Custom.
    */
    get SchedulingMethod(): 'Custom' | 'Milestone' | 'SingleDate' | 'StraightLine' {
        return this.Get('SchedulingMethod');
    }
    set SchedulingMethod(value: 'Custom' | 'Milestone' | 'SingleDate' | 'StraightLine') {
        this.Set('SchedulingMethod', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    * * Description: First recognition date.
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
    * * Description: Last recognition date.
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: TotalAmount
    * * Display Name: Total Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Total amount to recognize across all schedule lines.
    */
    get TotalAmount(): number {
        return this.Get('TotalAmount');
    }
    set TotalAmount(value: number) {
        this.Set('TotalAmount', value);
    }

    /**
    * * Field Name: TotalRecognized
    * * Display Name: Total Recognized
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Amount recognized so far (engine-maintained).
    */
    get TotalRecognized(): number {
        return this.Get('TotalRecognized');
    }
    set TotalRecognized(value: number) {
        this.Set('TotalRecognized', value);
    }

    /**
    * * Field Name: IsComplete
    * * Display Name: Is Complete
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether every line has been recognized.
    */
    get IsComplete(): boolean {
        return this.Get('IsComplete');
    }
    set IsComplete(value: boolean) {
        this.Set('IsComplete', value);
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
    * * MaxDiscountPct: The maximum discount percentage must be a value between 0% (0) and 100% (1) if it is specified.
    * * MaxOrderValue: The maximum order value, if specified, must be greater than or equal to zero to prevent invalid negative limits.
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
    * The maximum discount percentage must be a value between 0% (0) and 100% (1) if it is specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxDiscountPctRange(result: ValidationResult) {
    	if (this.MaxDiscountPct != null && (this.MaxDiscountPct < 0 || this.MaxDiscountPct > 1)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxDiscountPct",
    			"The maximum discount percentage must be a value between 0 and 1 (inclusive).",
    			this.MaxDiscountPct,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * The maximum order value, if specified, must be greater than or equal to zero to prevent invalid negative limits.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMaxOrderValueGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.MaxOrderValue != null && this.MaxOrderValue < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxOrderValue",
    			"The maximum order value must be greater than or equal to zero.",
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
    * * Display Name: Sales Rep User
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
    * * Display Name: Name
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
    * * Display Name: Approval Required Role ID
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
    * * InitialAmount: The initial amount must be greater than zero to ensure that the record is created with a valid positive starting balance.
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
    * The initial amount must be greater than zero to ensure that the record is created with a valid positive starting balance.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateInitialAmountGreaterThanZero(result: ValidationResult) {
    	if (this.InitialAmount != null && this.InitialAmount <= 0) {
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
    * * Display Name: Card Number
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
    * * Display Name: Beneficiary Person
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the card recipient.
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
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.
    */
    get BeneficiaryOrganizationID(): string | null {
        return this.Get('BeneficiaryOrganizationID');
    }
    set BeneficiaryOrganizationID(value: string | null) {
        this.Set('BeneficiaryOrganizationID', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expiration Date
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
    * * Amount: The transaction amount cannot be zero. Every transaction must represent a positive or negative value.
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
    * The transaction amount cannot be zero. Every transaction must represent a positive or negative value.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountNotZero(result: ValidationResult) {
    	if (this.Amount === 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Amount",
    			"The transaction amount cannot be zero.",
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
    * * Display Name: Stored Value Account
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
    * * Display Name: Related Payment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)
    */
    get RelatedPaymentID(): string | null {
        return this.Get('RelatedPaymentID');
    }
    set RelatedPaymentID(value: string | null) {
        this.Set('RelatedPaymentID', value);
    }

    /**
    * * Field Name: RelatedOrderID
    * * Display Name: Related Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get RelatedOrderID(): string | null {
        return this.Get('RelatedOrderID');
    }
    set RelatedOrderID(value: string | null) {
        this.Set('RelatedOrderID', value);
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
    get EventType(): 'Activated' | 'Canceled' | 'CancellationRequested' | 'Created' | 'Migrated' | 'Paused' | 'PaymentFailed' | 'PaymentSucceeded' | 'RenewalOrderSpawned' | 'Resumed' | 'TrialEnded' | 'TrialStarted' {
        return this.Get('EventType');
    }
    set EventType(value: 'Activated' | 'Canceled' | 'CancellationRequested' | 'Created' | 'Migrated' | 'Paused' | 'PaymentFailed' | 'PaymentSucceeded' | 'RenewalOrderSpawned' | 'Resumed' | 'TrialEnded' | 'TrialStarted') {
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
    * * Display Name: Related Payment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Payments (vwPayments.ID)
    */
    get RelatedPaymentID(): string | null {
        return this.Get('RelatedPaymentID');
    }
    set RelatedPaymentID(value: string | null) {
        this.Set('RelatedPaymentID', value);
    }

    /**
    * * Field Name: RelatedOrderID
    * * Display Name: Related Order
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)
    */
    get RelatedOrderID(): string | null {
        return this.Get('RelatedOrderID');
    }
    set RelatedOrderID(value: string | null) {
        this.Set('RelatedOrderID', value);
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
 * MJ_BizApps_Orders: Subscription Plans - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: SubscriptionPlan
 * * Base View: vwSubscriptionPlans
 * * @description Optional elaboration of a subscription product: billing cadence, price per cycle, trial (BO-D40). Simple memberships need no plan.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscription Plans')
export class mjBizAppsOrdersSubscriptionPlanEntity extends BaseEntity<mjBizAppsOrdersSubscriptionPlanEntityType> {
    /**
    * Loads the MJ_BizApps_Orders: Subscription Plans record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Orders: Subscription Plans record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsOrdersSubscriptionPlanEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Orders: Subscription Plans entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * CustomCycleDays: Custom cycle days, if specified, must be a positive number greater than zero to ensure a valid billing period.
    * * TrialDays: Trial days must be a non-negative number (0 or greater) to ensure a valid trial period duration.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateCustomCycleDaysGreaterThanZero(result);
        this.ValidateTrialDaysGreaterThanOrEqualToZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Custom cycle days, if specified, must be a positive number greater than zero to ensure a valid billing period.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateCustomCycleDaysGreaterThanZero(result: ValidationResult) {
    	if (this.CustomCycleDays != null && this.CustomCycleDays <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"CustomCycleDays",
    			"Custom cycle days must be greater than zero.",
    			this.CustomCycleDays,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Trial days must be a non-negative number (0 or greater) to ensure a valid trial period duration.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTrialDaysGreaterThanOrEqualToZero(result: ValidationResult) {
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
    * * Field Name: Name
    * * Display Name: Plan Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the plan.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: BillingCycle
    * * Display Name: Billing Cycle
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Annual
    *   * Custom
    *   * Monthly
    *   * Quarterly
    * * Description: Monthly | Quarterly | Annual | Custom (CustomCycleDays).
    */
    get BillingCycle(): 'Annual' | 'Custom' | 'Monthly' | 'Quarterly' {
        return this.Get('BillingCycle');
    }
    set BillingCycle(value: 'Annual' | 'Custom' | 'Monthly' | 'Quarterly') {
        this.Set('BillingCycle', value);
    }

    /**
    * * Field Name: CustomCycleDays
    * * Display Name: Custom Cycle Days
    * * SQL Data Type: int
    * * Description: Cycle length in days when BillingCycle = Custom.
    */
    get CustomCycleDays(): number | null {
        return this.Get('CustomCycleDays');
    }
    set CustomCycleDays(value: number | null) {
        this.Set('CustomCycleDays', value);
    }

    /**
    * * Field Name: PricePerCycle
    * * Display Name: Price Per Cycle
    * * SQL Data Type: decimal(18, 2)
    * * Description: Price per billing cycle. NULL = derive from the product/pricing engine.
    */
    get PricePerCycle(): number | null {
        return this.Get('PricePerCycle');
    }
    set PricePerCycle(value: number | null) {
        this.Set('PricePerCycle', value);
    }

    /**
    * * Field Name: TrialDays
    * * Display Name: Trial Days
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Free-trial length in days (0 = none).
    */
    get TrialDays(): number {
        return this.Get('TrialDays');
    }
    set TrialDays(value: number) {
        this.Set('TrialDays', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this plan is active and selectable.
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
    * * Field Name: Product
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
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
    * * RenewalLeadDays: The number of renewal lead days must be greater than or equal to zero to ensure a valid advance notice period for subscriptions.
    * * Table-Level: A subscription cannot migrate from itself. If a previous subscription is specified for migration, its ID must be different from the current subscription's ID.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRenewalLeadDaysGreaterThanOrEqualToZero(result);
        this.ValidateMigratesFromSubscriptionIDNotEqualToID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The number of renewal lead days must be greater than or equal to zero to ensure a valid advance notice period for subscriptions.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRenewalLeadDaysGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.RenewalLeadDays != null && this.RenewalLeadDays < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RenewalLeadDays",
    			"Renewal lead days must be greater than or equal to 0.",
    			this.RenewalLeadDays,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * A subscription cannot migrate from itself. If a previous subscription is specified for migration, its ID must be different from the current subscription's ID.
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
    * * Field Name: SubscriptionPlanID
    * * Display Name: Subscription Plan
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Subscription Plans (vwSubscriptionPlans.ID)
    */
    get SubscriptionPlanID(): string | null {
        return this.Get('SubscriptionPlanID');
    }
    set SubscriptionPlanID(value: string | null) {
        this.Set('SubscriptionPlanID', value);
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
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer Organization
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.
    */
    get CustomerOrganizationID(): string | null {
        return this.Get('CustomerOrganizationID');
    }
    set CustomerOrganizationID(value: string | null) {
        this.Set('CustomerOrganizationID', value);
    }

    /**
    * * Field Name: BeneficiaryPersonID
    * * Display Name: Beneficiary Person
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).
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
    * * Field Name: CurrentPeriodStart
    * * Display Name: Current Period Start
    * * SQL Data Type: date
    * * Description: Start of the current paid-through period.
    */
    get CurrentPeriodStart(): Date {
        return this.Get('CurrentPeriodStart');
    }
    set CurrentPeriodStart(value: Date) {
        this.Set('CurrentPeriodStart', value);
    }

    /**
    * * Field Name: CurrentPeriodEnd
    * * Display Name: Current Period End
    * * SQL Data Type: date
    * * Description: End of the current paid-through period (renewal boundary).
    */
    get CurrentPeriodEnd(): Date {
        return this.Get('CurrentPeriodEnd');
    }
    set CurrentPeriodEnd(value: Date) {
        this.Set('CurrentPeriodEnd', value);
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
    * * Default Value: 90
    * * Description: How many days before CurrentPeriodEnd the renewal order is raised (Jeremy: invoice about three months ahead).
    */
    get RenewalLeadDays(): number {
        return this.Get('RenewalLeadDays');
    }
    set RenewalLeadDays(value: number) {
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
    * * Display Name: Migrates From
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
    * * Display Name: Migrates To
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
    * * Display Name: Company
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: SubscriptionPlan
    * * Display Name: Subscription Plan
    * * SQL Data Type: nvarchar(200)
    */
    get SubscriptionPlan(): string | null {
        return this.Get('SubscriptionPlan');
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
    * * Field Name: PaymentProvider
    * * Display Name: Payment Provider
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentProvider(): string | null {
        return this.Get('PaymentProvider');
    }

    /**
    * * Field Name: RootMigratesFromSubscriptionID
    * * Display Name: Root Migrates From
    * * SQL Data Type: uniqueidentifier
    */
    get RootMigratesFromSubscriptionID(): string | null {
        return this.Get('RootMigratesFromSubscriptionID');
    }

    /**
    * * Field Name: RootMigratesToSubscriptionID
    * * Display Name: Root Migrates To
    * * SQL Data Type: uniqueidentifier
    */
    get RootMigratesToSubscriptionID(): string | null {
        return this.Get('RootMigratesToSubscriptionID');
    }
}

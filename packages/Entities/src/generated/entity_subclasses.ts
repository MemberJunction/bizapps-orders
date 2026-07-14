import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
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
        * * Display Name: Order ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
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
        * * Display Name: Discount Pct
        * * SQL Data Type: decimal(7, 4)
        * * Default Value: 0
        * * Description: Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).`),
    LineTotalNet: z.number().nullable().describe(`
        * * Field Name: LineTotalNet
        * * Display Name: Line Total Net
        * * SQL Data Type: decimal(18, 2)
        * * Description: Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.`),
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
        * * Display Name: Reverses Order Line ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Order Lines (vwOrderLines.ID)`),
    SourceBundleProductID: z.string().nullable().describe(`
        * * Field Name: SourceBundleProductID
        * * Display Name: Source Bundle Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Products (vwProducts.ID)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Optional free-text description for the line.`),
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
    SourceBundleProduct: z.string().nullable().describe(`
        * * Field Name: SourceBundleProduct
        * * Display Name: Source Bundle Product
        * * SQL Data Type: nvarchar(200)`),
    RootReversesOrderLineID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderLineID
        * * Display Name: Root Reverses Order Line ID
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
    CustomerOrganizationID: z.string().nullable().describe(`
        * * Field Name: CustomerOrganizationID
        * * Display Name: Customer Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.`),
    CustomerPersonID: z.string().nullable().describe(`
        * * Field Name: CustomerPersonID
        * * Display Name: Customer Person ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Person — the buyer/contact person at the customer organization. Nullable.`),
    SalesRepUserID: z.string().nullable().describe(`
        * * Field Name: SalesRepUserID
        * * Display Name: Sales Rep User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    BillToAddressID: z.string().nullable().describe(`
        * * Field Name: BillToAddressID
        * * Display Name: Bill To Address ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.`),
    ShipToAddressID: z.string().nullable().describe(`
        * * Field Name: ShipToAddressID
        * * Display Name: Ship To Address ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.`),
    PaymentTermsTypeID: z.string().nullable().describe(`
        * * Field Name: PaymentTermsTypeID
        * * Display Name: Payment Terms Type ID
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
        * * Display Name: Posted By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    ReversesOrderID: z.string().nullable().describe(`
        * * Field Name: ReversesOrderID
        * * Display Name: Reverses Order ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Orders (vwOrders.ID)`),
    ReversalReason: z.string().nullable().describe(`
        * * Field Name: ReversalReason
        * * Display Name: Reversal Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason this order reverses another (required by validation when ReversesOrderID is set).`),
    ContractID: z.string().nullable().describe(`
        * * Field Name: ContractID
        * * Display Name: Contract ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the governing contract record (contracts envelope, BO-D21; ownership pending the AIDP-contracts decision). Nullable.`),
    RequestedDeliveryDate: z.date().nullable().describe(`
        * * Field Name: RequestedDeliveryDate
        * * Display Name: Requested Delivery Date
        * * SQL Data Type: date
        * * Description: Customer-requested delivery/service date. Informational.`),
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
    JournalEntryID: z.string().nullable().describe(`
        * * Field Name: JournalEntryID
        * * Display Name: Journal Entry ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked on Confirm. Non-null means the JE has already been booked (idempotency guard).`),
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
    SalesRepUser: z.string().nullable().describe(`
        * * Field Name: SalesRepUser
        * * Display Name: Sales Rep User
        * * SQL Data Type: nvarchar(100)`),
    PaymentTermsType: z.string().nullable().describe(`
        * * Field Name: PaymentTermsType
        * * Display Name: Payment Terms Type
        * * SQL Data Type: nvarchar(200)`),
    PostedByUser: z.string().nullable().describe(`
        * * Field Name: PostedByUser
        * * Display Name: Posted By User
        * * SQL Data Type: nvarchar(100)`),
    RootReversesOrderID: z.string().nullable().describe(`
        * * Field Name: RootReversesOrderID
        * * Display Name: Root Reverses Order ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersOrderEntityType = z.infer<typeof mjBizAppsOrdersOrderSchema>;

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
 * zod schema definition for the entity MJ_BizApps_Orders: Product Categories
 */
export const mjBizAppsOrdersProductCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the category.`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
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
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(200)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsOrdersProductCategoryEntityType = z.infer<typeof mjBizAppsOrdersProductCategorySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Orders: Product Types
 */
export const mjBizAppsOrdersProductTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
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
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
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
    ProductTypeID: z.string().describe(`
        * * Field Name: ProductTypeID
        * * Display Name: Product Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Types (vwProductTypes.ID)`),
    ProductCategoryID: z.string().nullable().describe(`
        * * Field Name: ProductCategoryID
        * * Display Name: Product Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)`),
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
    ProductCategory: z.string().nullable().describe(`
        * * Field Name: ProductCategory
        * * Display Name: Product Category
        * * SQL Data Type: nvarchar(200)`),
});

export type mjBizAppsOrdersProductEntityType = z.infer<typeof mjBizAppsOrdersProductSchema>;
 
 

/**
 * MJ_BizApps_Orders: Order Lines - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: OrderLine
 * * Base View: vwOrderLines
 * * @description A line item on an order. Line amount = Quantity * UnitPrice.
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
    * * Display Name: Order ID
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
    * * Display Name: Discount Pct
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
    * * Display Name: Line Total Net
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
    * * Display Name: Reverses Order Line ID
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
    * * Display Name: Source Bundle Product ID
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
    * * Field Name: SourceBundleProduct
    * * Display Name: Source Bundle Product
    * * SQL Data Type: nvarchar(200)
    */
    get SourceBundleProduct(): string | null {
        return this.Get('SourceBundleProduct');
    }

    /**
    * * Field Name: RootReversesOrderLineID
    * * Display Name: Root Reverses Order Line ID
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
 * * @description An order header. On the FIRST transition to Confirmed, a balanced journal entry is booked into BizApps Accounting. No CompanyID (multi-company via each line's resolved GLAccount.CompanyID); no currency (FX deferred v1).
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
    * * Field Name: CustomerOrganizationID
    * * Display Name: Customer Organization ID
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
    * * Display Name: Customer Person ID
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
    * * Display Name: Sales Rep User ID
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
    * * Display Name: Bill To Address ID
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
    * * Display Name: Ship To Address ID
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
    * * Display Name: Payment Terms Type ID
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
    * * Display Name: Posted By User ID
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
    * * Display Name: Reverses Order ID
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
    * * Display Name: Contract ID
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
    * * Field Name: JournalEntryID
    * * Display Name: Journal Entry ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked on Confirm. Non-null means the JE has already been booked (idempotency guard).
    */
    get JournalEntryID(): string | null {
        return this.Get('JournalEntryID');
    }
    set JournalEntryID(value: string | null) {
        this.Set('JournalEntryID', value);
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
    * * Field Name: SalesRepUser
    * * Display Name: Sales Rep User
    * * SQL Data Type: nvarchar(100)
    */
    get SalesRepUser(): string | null {
        return this.Get('SalesRepUser');
    }

    /**
    * * Field Name: PaymentTermsType
    * * Display Name: Payment Terms Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentTermsType(): string | null {
        return this.Get('PaymentTermsType');
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
    * * Field Name: RootReversesOrderID
    * * Display Name: Root Reverses Order ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootReversesOrderID(): string | null {
        return this.Get('RootReversesOrderID');
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
 * MJ_BizApps_Orders: Product Categories - strongly typed entity sub-class
 * * Schema: __mj_BizAppsOrders
 * * Base Table: ProductCategory
 * * Base View: vwProductCategories
 * * @description Hierarchical grouping of products; the account resolver walks the ParentID tree upward.
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
    * * Description: Display name of the category.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Orders: Product Categories (vwProductCategories.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
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
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(200)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
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
    * * Field Name: IsActive
    * * Display Name: Is Active
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
    get ProductCategoryID(): string | null {
        return this.Get('ProductCategoryID');
    }
    set ProductCategoryID(value: string | null) {
        this.Set('ProductCategoryID', value);
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
    get ProductCategory(): string | null {
        return this.Get('ProductCategory');
    }
}

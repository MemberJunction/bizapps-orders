-- =============================================================================================
-- PostgreSQL counterpart of V202610142258__v5.33.x__Metadata_Sync.sql -- BizApps Orders v5.33.x Metadata_Sync
-- =============================================================================================
-- Same records, same values, same order as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE
--   * `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) on the push log the T-SQL file
--     was generated from. Each record is a DO block that calls the core or app function, in
--     whichever signature the host has (jsonb or named parameters).
--   * The converter does not translate the lookups and guards the T-SQL file adds, so they are
--     written here by hand from the T-SQL ones, block for block:
--       - SELECT TOP 1 @x = [ID] ... ORDER BY ... becomes
--         p_x := COALESCE((SELECT "ID" ... ORDER BY ... LIMIT 1), p_x), which keeps the literal
--         ID when nothing matches, as the T-SQL assignment does.
--       - IF <guard> EXEC ... becomes IF <guard> THEN <call> END IF.
--   * Every string value is taken verbatim from the T-SQL file: the converter rewrites T-SQL
--     inside string literals.
--   * Core calls use ${mjSchema}; this app's schema is written as the converter emits it.
-- =============================================================================================

SET standard_conforming_strings = on;

-- Save MJ_BizApps_Orders: Payment Provider Types (core SP call only)
DO $mj$
DECLARE
  p_ID_7dd3d4435560 UUID;
  p_Code_7dd3d4435560 VARCHAR(40);
  p_Name_7dd3d4435560 VARCHAR(200);
  p_Description_7dd3d4435560 TEXT;
  p_DriverClass_7dd3d4435560 VARCHAR(200);
  p_SupportsTokenization_7dd3d4435560 BOOLEAN;
  p_SupportsRefund_7dd3d4435560 BOOLEAN;
  p_SupportsWebhooks_7dd3d4435560 BOOLEAN;
  p_Sequence_7dd3d4435560 INTEGER;
  p_IsActive_7dd3d4435560 BOOLEAN;
BEGIN
  p_ID_7dd3d4435560 := '8B4C2E10-5D93-4A6F-B7C8-1E2F3A4B5C07';
  p_Code_7dd3d4435560 := 'HubSpotPayments';
  p_Name_7dd3d4435560 := 'HubSpot Payments';
  p_Description_7dd3d4435560 := 'Payments collected through a HubSpot portal (payment links, quotes, HubSpot invoices). Read by the payment poll when they are made, ahead of the payout; payments collected through the company''s own Stripe account or recorded from elsewhere are set aside. Not a checkout rail — no intents, no capture, no refunds through this type.';
  p_DriverClass_7dd3d4435560 := 'HubSpotPaymentsProvider';
  p_SupportsTokenization_7dd3d4435560 := FALSE;
  p_SupportsRefund_7dd3d4435560 := FALSE;
  p_SupportsWebhooks_7dd3d4435560 := FALSE;
  p_Sequence_7dd3d4435560 := 60;
  p_IsActive_7dd3d4435560 := TRUE;
  IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}."PaymentProviderType" WHERE "ID" = p_ID_7dd3d4435560 OR "Name" = p_Name_7dd3d4435560) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '__mj_BizAppsOrders' AND p.proname = 'spCreatePaymentProviderType'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM __mj_BizAppsOrders."spCreatePaymentProviderType"(p_data := jsonb_build_object(
      'ID', p_ID_7dd3d4435560,
      'Code', p_Code_7dd3d4435560,
      'Name', p_Name_7dd3d4435560,
      'Description', p_Description_7dd3d4435560,
      'DriverClass', p_DriverClass_7dd3d4435560,
      'SupportsTokenization', p_SupportsTokenization_7dd3d4435560,
      'SupportsRefund', p_SupportsRefund_7dd3d4435560,
      'SupportsWebhooks', p_SupportsWebhooks_7dd3d4435560,
      'Sequence', p_Sequence_7dd3d4435560,
      'IsActive', p_IsActive_7dd3d4435560
    ));
    ELSE
      PERFORM __mj_BizAppsOrders."spCreatePaymentProviderType"(p_ID := p_ID_7dd3d4435560, p_Code := p_Code_7dd3d4435560, p_Name := p_Name_7dd3d4435560, p_Description := p_Description_7dd3d4435560, p_DriverClass := p_DriverClass_7dd3d4435560, p_SupportsTokenization := p_SupportsTokenization_7dd3d4435560, p_SupportsRefund := p_SupportsRefund_7dd3d4435560, p_SupportsWebhooks := p_SupportsWebhooks_7dd3d4435560, p_Sequence := p_Sequence_7dd3d4435560, p_IsActive := p_IsActive_7dd3d4435560);
    END IF;
  END IF;
END $mj$;

-- Save MJ_BizApps_Orders: Product Types (core SP call only)
DO $mj$
DECLARE
  p_Code_79fd1fea70e4 VARCHAR(40);
  p_Name_79fd1fea70e4 VARCHAR(100);
  p_Description_79fd1fea70e4 TEXT;
  p_RequiresFulfillment_79fd1fea70e4 BOOLEAN;
  p_DefaultRevenueRecognitionTypeID_79fd1fea70e4 UUID;
  p_DefaultIsTaxable_79fd1fea70e4 BOOLEAN;
  p_DefaultTaxCategory_79fd1fea70e4 VARCHAR(50);
  p_DefaultSubscriptionTypeID_79fd1fea70e4 UUID;
  p_ProductExtensionEntity_79fd1fea70e4 VARCHAR(255);
  p_OrderLineExtensionEntity_79fd1fea70e4 VARCHAR(255);
  p_IsActive_79fd1fea70e4 BOOLEAN;
  p_DefaultEntitlementGrantTiming_79fd1fea70e4 VARCHAR(20);
  p_DefaultEntitlementQuantityMode_79fd1fea70e4 VARCHAR(20);
  p_DefaultEntitlementValidityMode_79fd1fea70e4 VARCHAR(20);
  p_PricingDriverClass_79fd1fea70e4 VARCHAR(255);
  p_Configuration_79fd1fea70e4 TEXT;
  p_RequiresSaleApproval_79fd1fea70e4 BOOLEAN;
  p_ID_79fd1fea70e4 UUID;
BEGIN
  p_Code_79fd1fea70e4 := 'Event';
  p_Name_79fd1fea70e4 := 'Event';
  p_Description_79fd1fea70e4 := 'A dated occurrence — conference, workshop, webinar. Recognition defaults to All Back End on the event date. Carries Event Product / Event Order Line IsA extensions (venue, capacity, attendee).';
  p_RequiresFulfillment_79fd1fea70e4 := FALSE;
  p_DefaultRevenueRecognitionTypeID_79fd1fea70e4 := 'A1D4E7B0-3C62-4F85-9A17-2B3C4D5E6F03';
  p_DefaultIsTaxable_79fd1fea70e4 := TRUE;
  p_ProductExtensionEntity_79fd1fea70e4 := 'MJ_BizApps_Orders: Event Products';
  p_OrderLineExtensionEntity_79fd1fea70e4 := 'MJ_BizApps_Orders: Event Order Lines';
  p_IsActive_79fd1fea70e4 := TRUE;
  p_DefaultEntitlementGrantTiming_79fd1fea70e4 := 'OnConfirm';
  p_DefaultEntitlementQuantityMode_79fd1fea70e4 := 'PerUnit';
  p_DefaultEntitlementValidityMode_79fd1fea70e4 := 'EventWindow';
  p_Configuration_79fd1fea70e4 := '{"unitMode":"perUnit"}';
  p_ID_79fd1fea70e4 := '9EFE875F-C8BE-47A6-8E7B-633FA2587094';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__mj_BizAppsOrders' AND p.proname = 'spUpdateProductType'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM __mj_BizAppsOrders."spUpdateProductType"(p_data := jsonb_build_object(
    'Code', p_Code_79fd1fea70e4,
    'Name', p_Name_79fd1fea70e4,
    'Description', p_Description_79fd1fea70e4,
    'RequiresFulfillment', p_RequiresFulfillment_79fd1fea70e4,
    'DefaultRevenueRecognitionTypeID', p_DefaultRevenueRecognitionTypeID_79fd1fea70e4,
    'DefaultIsTaxable', p_DefaultIsTaxable_79fd1fea70e4,
    'DefaultTaxCategory', p_DefaultTaxCategory_79fd1fea70e4,
    'DefaultSubscriptionTypeID', p_DefaultSubscriptionTypeID_79fd1fea70e4,
    'ProductExtensionEntity', p_ProductExtensionEntity_79fd1fea70e4,
    'OrderLineExtensionEntity', p_OrderLineExtensionEntity_79fd1fea70e4,
    'IsActive', p_IsActive_79fd1fea70e4,
    'DefaultEntitlementGrantTiming', p_DefaultEntitlementGrantTiming_79fd1fea70e4,
    'DefaultEntitlementQuantityMode', p_DefaultEntitlementQuantityMode_79fd1fea70e4,
    'DefaultEntitlementValidityMode', p_DefaultEntitlementValidityMode_79fd1fea70e4,
    'PricingDriverClass', p_PricingDriverClass_79fd1fea70e4,
    'Configuration', p_Configuration_79fd1fea70e4,
    'RequiresSaleApproval', p_RequiresSaleApproval_79fd1fea70e4,
    'ID', p_ID_79fd1fea70e4
  ));
  ELSE
    PERFORM __mj_BizAppsOrders."spUpdateProductType"(p_Code := p_Code_79fd1fea70e4, p_Name := p_Name_79fd1fea70e4, p_Description := p_Description_79fd1fea70e4, p_RequiresFulfillment := p_RequiresFulfillment_79fd1fea70e4, p_DefaultRevenueRecognitionTypeID := p_DefaultRevenueRecognitionTypeID_79fd1fea70e4, p_DefaultIsTaxable := p_DefaultIsTaxable_79fd1fea70e4, p_DefaultTaxCategory := p_DefaultTaxCategory_79fd1fea70e4, p_DefaultTaxCategory_Clear := TRUE, p_DefaultSubscriptionTypeID := p_DefaultSubscriptionTypeID_79fd1fea70e4, p_DefaultSubscriptionTypeID_Clear := TRUE, p_ProductExtensionEntity := p_ProductExtensionEntity_79fd1fea70e4, p_OrderLineExtensionEntity := p_OrderLineExtensionEntity_79fd1fea70e4, p_IsActive := p_IsActive_79fd1fea70e4, p_DefaultEntitlementGrantTiming := p_DefaultEntitlementGrantTiming_79fd1fea70e4, p_DefaultEntitlementQuantityMode := p_DefaultEntitlementQuantityMode_79fd1fea70e4, p_DefaultEntitlementValidityMode := p_DefaultEntitlementValidityMode_79fd1fea70e4, p_PricingDriverClass := p_PricingDriverClass_79fd1fea70e4, p_PricingDriverClass_Clear := TRUE, p_Configuration := p_Configuration_79fd1fea70e4, p_RequiresSaleApproval := p_RequiresSaleApproval_79fd1fea70e4, p_RequiresSaleApproval_Clear := TRUE, p_ID := p_ID_79fd1fea70e4);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_a63e3731aa81 UUID;
  p_Name_a63e3731aa81 VARCHAR(255);
  p_OperationKey_a63e3731aa81 VARCHAR(255);
  p_CategoryID_a63e3731aa81 UUID;
  p_Description_a63e3731aa81 TEXT;
  p_InputTypeName_a63e3731aa81 VARCHAR(255);
  p_InputTypeDefinition_a63e3731aa81 TEXT;
  p_InputTypeIsArray_a63e3731aa81 BOOLEAN;
  p_OutputTypeName_a63e3731aa81 VARCHAR(255);
  p_OutputTypeDefinition_a63e3731aa81 TEXT;
  p_OutputTypeIsArray_a63e3731aa81 BOOLEAN;
  p_ExecutionMode_a63e3731aa81 VARCHAR(20);
  p_RequiredScope_a63e3731aa81 VARCHAR(255);
  p_RequiresSystemUser_a63e3731aa81 BOOLEAN;
  p_GenerationType_a63e3731aa81 VARCHAR(20);
  p_Code_a63e3731aa81 TEXT;
  p_CodeApprovalStatus_a63e3731aa81 VARCHAR(20);
  p_CodeApprovedByUserID_a63e3731aa81 UUID;
  p_CodeApprovedAt_a63e3731aa81 TIMESTAMPTZ;
  p_ContractFingerprint_a63e3731aa81 VARCHAR(100);
  p_Status_a63e3731aa81 VARCHAR(20);
  p_CacheTTLSeconds_a63e3731aa81 INTEGER;
  p_TimeoutMS_a63e3731aa81 INTEGER;
  p_MaxConcurrency_a63e3731aa81 INTEGER;
  p_CodeLocked_a63e3731aa81 BOOLEAN;
  p_CodeComments_a63e3731aa81 TEXT;
  p_Libraries_a63e3731aa81 TEXT;
BEGIN
  p_ID_a63e3731aa81 := '49BF478D-1ED6-4C69-A040-2570CD9F9810';
  p_Name_a63e3731aa81 := 'Resolve Charge Exception';
  p_OperationKey_a63e3731aa81 := 'Orders.ResolveChargeException';
  p_CategoryID_a63e3731aa81 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303';
  p_Description_a63e3731aa81 := 'Book a charge-without-payment finance exception as a paid order and clear it. Reads the payment provider and gateway charge from the exception, books the order through Orders.CreateOrderFromProviderPayment with the product and buyer the caller names, then clears the exception as Corrected with a note naming the order and payment. Requires the authorization to clear finance exceptions, checked before anything is booked. Refuses an exception that is not Open, is not a PROVIDER_CHARGE_MISMATCH of kind ChargeWithoutPayment, or names a charge Orders opened. A repeat call returns the order already booked and clears the exception if that had failed.';
  p_InputTypeName_a63e3731aa81 := 'OrdersResolveChargeExceptionInput';
  p_InputTypeDefinition_a63e3731aa81 := '/**
 * Input for `Orders.ResolveChargeException`.
 *
 * Books the gateway charge a charge-without-payment finance exception names as a paid order, then
 * clears the exception. The provider and charge come from the exception; the caller names the product
 * and the buyer.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersResolveChargeExceptionInput {
    /** The PROVIDER_CHARGE_MISMATCH finance exception to resolve. */
    FinanceExceptionID: string;
    /** The product the order''s one line carries, priced at the charge''s amount. */
    ProductID: string;
    /** The buyer. */
    BillToPersonID: string;
    /** The buyer''s organization, when the order is billed to one. */
    BillToOrganizationID?: string | null;
}
';
  p_InputTypeIsArray_a63e3731aa81 := FALSE;
  p_OutputTypeName_a63e3731aa81 := 'OrdersResolveChargeExceptionOutput';
  p_OutputTypeDefinition_a63e3731aa81 := '/**
 * Output for `Orders.ResolveChargeException`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersResolveChargeExceptionOutput {
    /** True when the order is booked and the exception cleared. */
    Success: boolean;
    Message: string;
    /**
     * Why it did not finish, when Success is false: BadInput, NotAuthorized, ExceptionNotFound, NotOpen,
     * WrongType, WrongKind, OpenedByOrders, UnreadableKey, ClearRefused, or a code from
     * Orders.CreateOrderFromProviderPayment. Only ClearRefused leaves a booked order behind.
     */
    Code?: string;
    /** True when the exception was cleared. */
    Cleared: boolean;
    /** The gateway charge the exception names. */
    ProviderChargeID?: string | null;
    /** True when an earlier call already booked the order for this charge. */
    WasExisting?: boolean;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge''s gross amount. */
    Amount?: number | null;
}
';
  p_OutputTypeIsArray_a63e3731aa81 := FALSE;
  p_ExecutionMode_a63e3731aa81 := 'Sync';
  p_RequiredScope_a63e3731aa81 := 'orders:write';
  p_RequiresSystemUser_a63e3731aa81 := FALSE;
  p_GenerationType_a63e3731aa81 := 'Manual';
  p_CodeApprovalStatus_a63e3731aa81 := 'Approved';
  p_Status_a63e3731aa81 := 'Active';
  p_CodeLocked_a63e3731aa81 := FALSE;
  p_CategoryID_a63e3731aa81 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Payments and Credits' ORDER BY CASE WHEN "ID" = p_CategoryID_a63e3731aa81 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_a63e3731aa81);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
               WHERE "ID" = p_ID_a63e3731aa81 OR "OperationKey" = p_OperationKey_a63e3731aa81) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
      'ID', p_ID_a63e3731aa81,
      'Name', p_Name_a63e3731aa81,
      'OperationKey', p_OperationKey_a63e3731aa81,
      'CategoryID', p_CategoryID_a63e3731aa81,
      'Description', p_Description_a63e3731aa81,
      'InputTypeName', p_InputTypeName_a63e3731aa81,
      'InputTypeDefinition', p_InputTypeDefinition_a63e3731aa81,
      'InputTypeIsArray', p_InputTypeIsArray_a63e3731aa81,
      'OutputTypeName', p_OutputTypeName_a63e3731aa81,
      'OutputTypeDefinition', p_OutputTypeDefinition_a63e3731aa81,
      'OutputTypeIsArray', p_OutputTypeIsArray_a63e3731aa81,
      'ExecutionMode', p_ExecutionMode_a63e3731aa81,
      'RequiredScope', p_RequiredScope_a63e3731aa81,
      'RequiresSystemUser', p_RequiresSystemUser_a63e3731aa81,
      'GenerationType', p_GenerationType_a63e3731aa81,
      'Code', p_Code_a63e3731aa81,
      'CodeApprovalStatus', p_CodeApprovalStatus_a63e3731aa81,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_a63e3731aa81,
      'CodeApprovedAt', p_CodeApprovedAt_a63e3731aa81,
      'ContractFingerprint', p_ContractFingerprint_a63e3731aa81,
      'Status', p_Status_a63e3731aa81,
      'CacheTTLSeconds', p_CacheTTLSeconds_a63e3731aa81,
      'TimeoutMS', p_TimeoutMS_a63e3731aa81,
      'MaxConcurrency', p_MaxConcurrency_a63e3731aa81,
      'CodeLocked', p_CodeLocked_a63e3731aa81,
      'CodeComments', p_CodeComments_a63e3731aa81,
      'Libraries', p_Libraries_a63e3731aa81
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_a63e3731aa81, p_Name := p_Name_a63e3731aa81, p_OperationKey := p_OperationKey_a63e3731aa81, p_CategoryID := p_CategoryID_a63e3731aa81, p_Description := p_Description_a63e3731aa81, p_InputTypeName := p_InputTypeName_a63e3731aa81, p_InputTypeDefinition := p_InputTypeDefinition_a63e3731aa81, p_InputTypeIsArray := p_InputTypeIsArray_a63e3731aa81, p_OutputTypeName := p_OutputTypeName_a63e3731aa81, p_OutputTypeDefinition := p_OutputTypeDefinition_a63e3731aa81, p_OutputTypeIsArray := p_OutputTypeIsArray_a63e3731aa81, p_ExecutionMode := p_ExecutionMode_a63e3731aa81, p_RequiredScope := p_RequiredScope_a63e3731aa81, p_RequiresSystemUser := p_RequiresSystemUser_a63e3731aa81, p_GenerationType := p_GenerationType_a63e3731aa81, p_Code := p_Code_a63e3731aa81, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_a63e3731aa81, p_CodeApprovedByUserID := p_CodeApprovedByUserID_a63e3731aa81, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_a63e3731aa81, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_a63e3731aa81, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_a63e3731aa81, p_CacheTTLSeconds := p_CacheTTLSeconds_a63e3731aa81, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_a63e3731aa81, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_a63e3731aa81, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_a63e3731aa81, p_CodeComments := p_CodeComments_a63e3731aa81, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_a63e3731aa81, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_033b894d04d7 VARCHAR(255);
  p_OperationKey_033b894d04d7 VARCHAR(255);
  p_CategoryID_033b894d04d7 UUID;
  p_Description_033b894d04d7 TEXT;
  p_InputTypeName_033b894d04d7 VARCHAR(255);
  p_InputTypeDefinition_033b894d04d7 TEXT;
  p_InputTypeIsArray_033b894d04d7 BOOLEAN;
  p_OutputTypeName_033b894d04d7 VARCHAR(255);
  p_OutputTypeDefinition_033b894d04d7 TEXT;
  p_OutputTypeIsArray_033b894d04d7 BOOLEAN;
  p_ExecutionMode_033b894d04d7 VARCHAR(20);
  p_RequiredScope_033b894d04d7 VARCHAR(255);
  p_RequiresSystemUser_033b894d04d7 BOOLEAN;
  p_GenerationType_033b894d04d7 VARCHAR(20);
  p_Code_033b894d04d7 TEXT;
  p_CodeApprovalStatus_033b894d04d7 VARCHAR(20);
  p_CodeApprovedByUserID_033b894d04d7 UUID;
  p_CodeApprovedAt_033b894d04d7 TIMESTAMPTZ;
  p_ContractFingerprint_033b894d04d7 VARCHAR(100);
  p_Status_033b894d04d7 VARCHAR(20);
  p_CacheTTLSeconds_033b894d04d7 INTEGER;
  p_TimeoutMS_033b894d04d7 INTEGER;
  p_MaxConcurrency_033b894d04d7 INTEGER;
  p_CodeLocked_033b894d04d7 BOOLEAN;
  p_CodeComments_033b894d04d7 TEXT;
  p_Libraries_033b894d04d7 TEXT;
  p_ID_033b894d04d7 UUID;
BEGIN
  p_Name_033b894d04d7 := 'Reconcile Payment Provider Charges';
  p_OperationKey_033b894d04d7 := 'Orders.ReconcilePaymentProviderCharges';
  p_CategoryID_033b894d04d7 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303';
  p_Description_033b894d04d7 := 'Match a payment gateway''s charges and refunds to Orders'' payment intents and captured payments for a window of business days (default: the seven days ending today), and report three kinds of mismatch: a charge with no captured payment, a captured payment whose charge the gateway does not have, and a refunded charge whose payment carries fewer refunds. Corrects nothing. With Preview (the default) it only reports; otherwise each mismatch is raised as a PROVIDER_CHARGE_MISMATCH finance exception, once per mismatch and amount. Only live providers are read; a provider in test mode runs the stub driver and is skipped.';
  p_InputTypeName_033b894d04d7 := 'OrdersReconcilePaymentProviderChargesInput';
  p_InputTypeDefinition_033b894d04d7 := '/**
 * Input for `Orders.ReconcilePaymentProviderCharges`.
 *
 * Matches a payment gateway''s charges and refunds to Orders'' payment intents and captured payments for
 * a window of business days, and reports what does not match. It corrects nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersReconcilePaymentProviderChargesInput {
    /** One provider to reconcile. Omit for every active, live provider whose gateway lists charges. */
    PaymentProviderID?: string;
    /** First business day of the window (YYYY-MM-DD). Omit for seven days ending on ToDate. */
    FromDate?: string;
    /** Last business day of the window (YYYY-MM-DD). Omit for today in the business time zone. */
    ToDate?: string;
    /**
     * True (the default) reports the mismatches and writes nothing. False also raises each as a
     * PROVIDER_CHARGE_MISMATCH finance exception; a mismatch already raised is not raised again.
     */
    Preview?: boolean;
}
';
  p_InputTypeIsArray_033b894d04d7 := FALSE;
  p_OutputTypeName_033b894d04d7 := 'OrdersReconcilePaymentProviderChargesOutput';
  p_OutputTypeDefinition_033b894d04d7 := '/**
 * Output for `Orders.ReconcilePaymentProviderCharges`.
 *
 * Every mismatch found, per-provider counts, and every error, so a run that raised nothing can be
 * told apart from one that found nothing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PaymentProviderChargeMismatch {
    /**
     * ChargeWithoutPayment: a charge that succeeded at the gateway with no captured Orders payment.
     * PaymentWithoutCharge: a captured payment whose charge the gateway does not have or did not
     * collect. RefundNotBooked: a charge refunded at the gateway beyond the refunds its payment carries.
     */
    Kind: ''ChargeWithoutPayment'' | ''PaymentWithoutCharge'' | ''RefundNotBooked'';
    PaymentProviderID: string;
    ProviderChargeID?: string | null;
    ProviderIntentID?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    PaymentIntentID?: string | null;
    CompanyID?: string | null;
    /** The amount in question, major units. */
    Amount: number;
    Detail: string;
}

export interface PaymentProviderReconciliationResult {
    PaymentProviderID: string;
    PaymentProviderName: string;
    /** Checked, Skipped (test mode) or Error (see Message). */
    Status: ''Checked'' | ''Skipped'' | ''Error'';
    ChargesRead: number;
    RefundsRead: number;
    Mismatches: number;
    /** Orders created from this provider''s unmatched charges. Zero in preview. */
    OrdersCreated: number;
    Message?: string;
}

/** A paid order created from a charge that matched no Orders payment (#481). */
export interface PaymentProviderUnmatchedChargeOrder {
    PaymentProviderID: string;
    ProviderChargeID: string;
    OrderHeaderID: string;
    OrderNumber?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge''s gross amount, major units. */
    Amount: number;
}

export interface PaymentProviderReconciliationError {
    PaymentProviderID?: string;
    Code: string;
    Message: string;
}

export interface OrdersReconcilePaymentProviderChargesOutput {
    /** False when any provider could not be read or any mismatch could not be raised. */
    Success: boolean;
    Message?: string;
    Preview: boolean;
    FromDate: string;
    ToDate: string;
    Providers: PaymentProviderReconciliationResult[];
    Mismatches: PaymentProviderChargeMismatch[];
    /** Finance exceptions this run created. Zero in preview. */
    Raised: number;
    /** Mismatches that already had an exception from an earlier run. */
    AlreadyRaised: number;
    /**
     * Charges without a payment that became paid orders: the provider''s price map named the product
     * and the charge''s e-mail named the buyer. They are not in Mismatches. Empty in preview.
     */
    OrdersCreated: PaymentProviderUnmatchedChargeOrder[];
    Errors: PaymentProviderReconciliationError[];
}
';
  p_OutputTypeIsArray_033b894d04d7 := FALSE;
  p_ExecutionMode_033b894d04d7 := 'LongRunning';
  p_RequiredScope_033b894d04d7 := 'orders:write';
  p_RequiresSystemUser_033b894d04d7 := FALSE;
  p_GenerationType_033b894d04d7 := 'Manual';
  p_CodeApprovalStatus_033b894d04d7 := 'Approved';
  p_Status_033b894d04d7 := 'Active';
  p_CodeLocked_033b894d04d7 := FALSE;
  p_ID_033b894d04d7 := '61AAB578-6E38-4AEC-B599-E1534AC9935D';
  p_ID_033b894d04d7 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.ReconcilePaymentProviderCharges' ORDER BY CASE WHEN "ID" = p_ID_033b894d04d7 THEN 0 ELSE 1 END LIMIT 1), p_ID_033b894d04d7);
  p_CategoryID_033b894d04d7 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Payments and Credits' ORDER BY CASE WHEN "ID" = p_CategoryID_033b894d04d7 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_033b894d04d7);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_033b894d04d7,
    'OperationKey', p_OperationKey_033b894d04d7,
    'CategoryID', p_CategoryID_033b894d04d7,
    'Description', p_Description_033b894d04d7,
    'InputTypeName', p_InputTypeName_033b894d04d7,
    'InputTypeDefinition', p_InputTypeDefinition_033b894d04d7,
    'InputTypeIsArray', p_InputTypeIsArray_033b894d04d7,
    'OutputTypeName', p_OutputTypeName_033b894d04d7,
    'OutputTypeDefinition', p_OutputTypeDefinition_033b894d04d7,
    'OutputTypeIsArray', p_OutputTypeIsArray_033b894d04d7,
    'ExecutionMode', p_ExecutionMode_033b894d04d7,
    'RequiredScope', p_RequiredScope_033b894d04d7,
    'RequiresSystemUser', p_RequiresSystemUser_033b894d04d7,
    'GenerationType', p_GenerationType_033b894d04d7,
    'Code', p_Code_033b894d04d7,
    'CodeApprovalStatus', p_CodeApprovalStatus_033b894d04d7,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_033b894d04d7,
    'CodeApprovedAt', p_CodeApprovedAt_033b894d04d7,
    'ContractFingerprint', p_ContractFingerprint_033b894d04d7,
    'Status', p_Status_033b894d04d7,
    'CacheTTLSeconds', p_CacheTTLSeconds_033b894d04d7,
    'TimeoutMS', p_TimeoutMS_033b894d04d7,
    'MaxConcurrency', p_MaxConcurrency_033b894d04d7,
    'CodeLocked', p_CodeLocked_033b894d04d7,
    'CodeComments', p_CodeComments_033b894d04d7,
    'Libraries', p_Libraries_033b894d04d7,
    'ID', p_ID_033b894d04d7
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_033b894d04d7, p_OperationKey := p_OperationKey_033b894d04d7, p_CategoryID := p_CategoryID_033b894d04d7, p_Description := p_Description_033b894d04d7, p_InputTypeName := p_InputTypeName_033b894d04d7, p_InputTypeDefinition := p_InputTypeDefinition_033b894d04d7, p_InputTypeIsArray := p_InputTypeIsArray_033b894d04d7, p_OutputTypeName := p_OutputTypeName_033b894d04d7, p_OutputTypeDefinition := p_OutputTypeDefinition_033b894d04d7, p_OutputTypeIsArray := p_OutputTypeIsArray_033b894d04d7, p_ExecutionMode := p_ExecutionMode_033b894d04d7, p_RequiredScope := p_RequiredScope_033b894d04d7, p_RequiresSystemUser := p_RequiresSystemUser_033b894d04d7, p_GenerationType := p_GenerationType_033b894d04d7, p_Code := p_Code_033b894d04d7, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_033b894d04d7, p_CodeApprovedByUserID := p_CodeApprovedByUserID_033b894d04d7, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_033b894d04d7, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_033b894d04d7, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_033b894d04d7, p_CacheTTLSeconds := p_CacheTTLSeconds_033b894d04d7, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_033b894d04d7, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_033b894d04d7, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_033b894d04d7, p_CodeComments := p_CodeComments_033b894d04d7, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_033b894d04d7, p_Libraries_Clear := TRUE, p_ID := p_ID_033b894d04d7);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_3e651fbfbfa1 UUID;
  p_Name_3e651fbfbfa1 VARCHAR(255);
  p_OperationKey_3e651fbfbfa1 VARCHAR(255);
  p_CategoryID_3e651fbfbfa1 UUID;
  p_Description_3e651fbfbfa1 TEXT;
  p_InputTypeName_3e651fbfbfa1 VARCHAR(255);
  p_InputTypeDefinition_3e651fbfbfa1 TEXT;
  p_InputTypeIsArray_3e651fbfbfa1 BOOLEAN;
  p_OutputTypeName_3e651fbfbfa1 VARCHAR(255);
  p_OutputTypeDefinition_3e651fbfbfa1 TEXT;
  p_OutputTypeIsArray_3e651fbfbfa1 BOOLEAN;
  p_ExecutionMode_3e651fbfbfa1 VARCHAR(20);
  p_RequiredScope_3e651fbfbfa1 VARCHAR(255);
  p_RequiresSystemUser_3e651fbfbfa1 BOOLEAN;
  p_GenerationType_3e651fbfbfa1 VARCHAR(20);
  p_Code_3e651fbfbfa1 TEXT;
  p_CodeApprovalStatus_3e651fbfbfa1 VARCHAR(20);
  p_CodeApprovedByUserID_3e651fbfbfa1 UUID;
  p_CodeApprovedAt_3e651fbfbfa1 TIMESTAMPTZ;
  p_ContractFingerprint_3e651fbfbfa1 VARCHAR(100);
  p_Status_3e651fbfbfa1 VARCHAR(20);
  p_CacheTTLSeconds_3e651fbfbfa1 INTEGER;
  p_TimeoutMS_3e651fbfbfa1 INTEGER;
  p_MaxConcurrency_3e651fbfbfa1 INTEGER;
  p_CodeLocked_3e651fbfbfa1 BOOLEAN;
  p_CodeComments_3e651fbfbfa1 TEXT;
  p_Libraries_3e651fbfbfa1 TEXT;
BEGIN
  p_ID_3e651fbfbfa1 := '4B20F561-CD67-471D-88FB-2772E74992FE';
  p_Name_3e651fbfbfa1 := 'Create Order From Provider Payment';
  p_OperationKey_3e651fbfbfa1 := 'Orders.CreateOrderFromProviderPayment';
  p_CategoryID_3e651fbfbfa1 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B303';
  p_Description_3e651fbfbfa1 := 'Create a paid order from a payment gateway charge that matched no order or invoice. Reads the charge from the gateway, creates and confirms an order in the payment provider''s company with one line of the named product at the charge''s gross amount, records the gateway intent, and captures the charge against the order, so the gateway''s fee is booked and the bank deposit that follows matches. Refuses a charge that has not succeeded, has any refund, has no gateway intent, is in another currency, or belongs to an intent Orders opened. One order per charge: a repeat call returns the order already created and finishes its capture if that had failed.';
  p_InputTypeName_3e651fbfbfa1 := 'OrdersCreateOrderFromProviderPaymentInput';
  p_InputTypeDefinition_3e651fbfbfa1 := '/**
 * Input for `Orders.CreateOrderFromProviderPayment`.
 *
 * Creates a paid order from a gateway charge that matched no order or invoice: the order in the
 * payment provider''s company, one line at the charge''s amount, and the charge captured against it.
 * The product and the buyer are named by the caller.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCreateOrderFromProviderPaymentInput {
    /** The payment provider the charge was taken through. Its company receives the order and the cash. */
    PaymentProviderID: string;
    /** The gateway''s charge id (Stripe: ch_...), as the reconciliation reports it. */
    ProviderChargeID: string;
    /** The product the order''s one line carries, priced at the charge''s amount. */
    ProductID: string;
    /** The buyer. */
    BillToPersonID: string;
    /** The buyer''s organization, when the order is billed to one. */
    BillToOrganizationID?: string | null;
}
';
  p_InputTypeIsArray_3e651fbfbfa1 := FALSE;
  p_OutputTypeName_3e651fbfbfa1 := 'OrdersCreateOrderFromProviderPaymentOutput';
  p_OutputTypeDefinition_3e651fbfbfa1 := '/**
 * Output for `Orders.CreateOrderFromProviderPayment`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCreateOrderFromProviderPaymentOutput {
    Success: boolean;
    Message: string;
    /**
     * Why nothing was created, when Success is false: BadInput, ProviderNotFound, ChargeNotFound,
     * ChargeNotSucceeded, ChargeRefunded, ChargeHasNoAmount, ChargeHasNoIntent, CurrencyMismatch,
     * IntentOpenedByOrders, ConfirmRefused or CaptureRefused.
     */
    Code?: string;
    /** True when an earlier call already created the order for this charge; nothing new was written. */
    WasExisting?: boolean;
    OrderHeaderID?: string | null;
    OrderNumber?: string | null;
    PaymentIntentID?: string | null;
    PaymentHeaderID?: string | null;
    PaymentNumber?: string | null;
    /** The charge''s gross amount, which the order totals and the payment records. */
    Amount?: number | null;
}
';
  p_OutputTypeIsArray_3e651fbfbfa1 := FALSE;
  p_ExecutionMode_3e651fbfbfa1 := 'Sync';
  p_RequiredScope_3e651fbfbfa1 := 'orders:write';
  p_RequiresSystemUser_3e651fbfbfa1 := FALSE;
  p_GenerationType_3e651fbfbfa1 := 'Manual';
  p_CodeApprovalStatus_3e651fbfbfa1 := 'Approved';
  p_Status_3e651fbfbfa1 := 'Active';
  p_CodeLocked_3e651fbfbfa1 := FALSE;
  p_CategoryID_3e651fbfbfa1 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Payments and Credits' ORDER BY CASE WHEN "ID" = p_CategoryID_3e651fbfbfa1 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_3e651fbfbfa1);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
               WHERE "ID" = p_ID_3e651fbfbfa1 OR "OperationKey" = p_OperationKey_3e651fbfbfa1) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
      'ID', p_ID_3e651fbfbfa1,
      'Name', p_Name_3e651fbfbfa1,
      'OperationKey', p_OperationKey_3e651fbfbfa1,
      'CategoryID', p_CategoryID_3e651fbfbfa1,
      'Description', p_Description_3e651fbfbfa1,
      'InputTypeName', p_InputTypeName_3e651fbfbfa1,
      'InputTypeDefinition', p_InputTypeDefinition_3e651fbfbfa1,
      'InputTypeIsArray', p_InputTypeIsArray_3e651fbfbfa1,
      'OutputTypeName', p_OutputTypeName_3e651fbfbfa1,
      'OutputTypeDefinition', p_OutputTypeDefinition_3e651fbfbfa1,
      'OutputTypeIsArray', p_OutputTypeIsArray_3e651fbfbfa1,
      'ExecutionMode', p_ExecutionMode_3e651fbfbfa1,
      'RequiredScope', p_RequiredScope_3e651fbfbfa1,
      'RequiresSystemUser', p_RequiresSystemUser_3e651fbfbfa1,
      'GenerationType', p_GenerationType_3e651fbfbfa1,
      'Code', p_Code_3e651fbfbfa1,
      'CodeApprovalStatus', p_CodeApprovalStatus_3e651fbfbfa1,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_3e651fbfbfa1,
      'CodeApprovedAt', p_CodeApprovedAt_3e651fbfbfa1,
      'ContractFingerprint', p_ContractFingerprint_3e651fbfbfa1,
      'Status', p_Status_3e651fbfbfa1,
      'CacheTTLSeconds', p_CacheTTLSeconds_3e651fbfbfa1,
      'TimeoutMS', p_TimeoutMS_3e651fbfbfa1,
      'MaxConcurrency', p_MaxConcurrency_3e651fbfbfa1,
      'CodeLocked', p_CodeLocked_3e651fbfbfa1,
      'CodeComments', p_CodeComments_3e651fbfbfa1,
      'Libraries', p_Libraries_3e651fbfbfa1
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_3e651fbfbfa1, p_Name := p_Name_3e651fbfbfa1, p_OperationKey := p_OperationKey_3e651fbfbfa1, p_CategoryID := p_CategoryID_3e651fbfbfa1, p_Description := p_Description_3e651fbfbfa1, p_InputTypeName := p_InputTypeName_3e651fbfbfa1, p_InputTypeDefinition := p_InputTypeDefinition_3e651fbfbfa1, p_InputTypeIsArray := p_InputTypeIsArray_3e651fbfbfa1, p_OutputTypeName := p_OutputTypeName_3e651fbfbfa1, p_OutputTypeDefinition := p_OutputTypeDefinition_3e651fbfbfa1, p_OutputTypeIsArray := p_OutputTypeIsArray_3e651fbfbfa1, p_ExecutionMode := p_ExecutionMode_3e651fbfbfa1, p_RequiredScope := p_RequiredScope_3e651fbfbfa1, p_RequiresSystemUser := p_RequiresSystemUser_3e651fbfbfa1, p_GenerationType := p_GenerationType_3e651fbfbfa1, p_Code := p_Code_3e651fbfbfa1, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_3e651fbfbfa1, p_CodeApprovedByUserID := p_CodeApprovedByUserID_3e651fbfbfa1, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_3e651fbfbfa1, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_3e651fbfbfa1, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_3e651fbfbfa1, p_CacheTTLSeconds := p_CacheTTLSeconds_3e651fbfbfa1, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_3e651fbfbfa1, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_3e651fbfbfa1, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_3e651fbfbfa1, p_CodeComments := p_CodeComments_3e651fbfbfa1, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_3e651fbfbfa1, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_ae7c80fb5431 VARCHAR(255);
  p_OperationKey_ae7c80fb5431 VARCHAR(255);
  p_CategoryID_ae7c80fb5431 UUID;
  p_Description_ae7c80fb5431 TEXT;
  p_InputTypeName_ae7c80fb5431 VARCHAR(255);
  p_InputTypeDefinition_ae7c80fb5431 TEXT;
  p_InputTypeIsArray_ae7c80fb5431 BOOLEAN;
  p_OutputTypeName_ae7c80fb5431 VARCHAR(255);
  p_OutputTypeDefinition_ae7c80fb5431 TEXT;
  p_OutputTypeIsArray_ae7c80fb5431 BOOLEAN;
  p_ExecutionMode_ae7c80fb5431 VARCHAR(20);
  p_RequiredScope_ae7c80fb5431 VARCHAR(255);
  p_RequiresSystemUser_ae7c80fb5431 BOOLEAN;
  p_GenerationType_ae7c80fb5431 VARCHAR(20);
  p_Code_ae7c80fb5431 TEXT;
  p_CodeApprovalStatus_ae7c80fb5431 VARCHAR(20);
  p_CodeApprovedByUserID_ae7c80fb5431 UUID;
  p_CodeApprovedAt_ae7c80fb5431 TIMESTAMPTZ;
  p_ContractFingerprint_ae7c80fb5431 VARCHAR(100);
  p_Status_ae7c80fb5431 VARCHAR(20);
  p_CacheTTLSeconds_ae7c80fb5431 INTEGER;
  p_TimeoutMS_ae7c80fb5431 INTEGER;
  p_MaxConcurrency_ae7c80fb5431 INTEGER;
  p_CodeLocked_ae7c80fb5431 BOOLEAN;
  p_CodeComments_ae7c80fb5431 TEXT;
  p_Libraries_ae7c80fb5431 TEXT;
  p_ID_ae7c80fb5431 UUID;
BEGIN
  p_Name_ae7c80fb5431 := 'Spawn Renewals';
  p_OperationKey_ae7c80fb5431 := 'Orders.SpawnRenewals';
  p_CategoryID_ae7c80fb5431 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304';
  p_Description_ae7c80fb5431 := 'Place renewal orders for subscriptions whose latest term expires inside their own lead window and whose holder consented via auto-renew. Two independent idempotency guards, because an unattended job that double-spawns double-bills: the selection only finds subscriptions whose LATEST term is expiring, plus an explicit check for an order already renewing that subscription. Renewals bypass the concurrency rule — a renewal is not a second subscription.';
  p_InputTypeName_ae7c80fb5431 := 'SpawnRenewalsInput';
  p_InputTypeDefinition_ae7c80fb5431 := '/**
 * Input for `Orders.SpawnRenewals`.
 *
 * A renewal is a SCHEDULED CONTINUATION and auto-renew is the consent switch. This
 * finds subscriptions whose LATEST term expires inside their own lead window and
 * places a confirmed renewal order for each that consented.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}
';
  p_InputTypeIsArray_ae7c80fb5431 := FALSE;
  p_OutputTypeName_ae7c80fb5431 := 'SpawnRenewalsOutput';
  p_OutputTypeDefinition_ae7c80fb5431 := '/**
 * Output for `Orders.SpawnRenewals`.
 *
 * Every candidate comes back whether or not an order was placed, with the reason it
 * was skipped — an unattended job that silently does nothing is indistinguishable
 * from one that is broken.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RenewalCandidate {
    SubscriptionID: string;
    SubscriptionNumber: string;
    ProductID: string;
    /** End of the term that is expiring. */
    CurrentTermEnd: string;
    /** Lead days actually applied, after the subscription''s override of the type''s default. */
    LeadDays: number;
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription''s own, or its successor. */
    RenewalProductID?: string;
    /** The renewal''s unit price before the increase. */
    BasePrice?: number;
    /** Where the base price came from: the prior term''s price, its list price, or the successor''s list. */
    BasePriceSource?: ''PriorPrice'' | ''PriorList'' | ''SuccessorList'';
    /** The increase applied, in percent: 0 when none is set or the new term crosses no anniversary. */
    IncreasePercent?: number;
    /** The level the increase was set at. */
    IncreaseSource?: ''Subscription'' | ''Product'' | ''Category'' | ''Company'' | ''None'';
    /** The renewal line''s unit price: the base plus the increase. */
    UnitPrice?: number;
    /** The renewal line''s discount, as a fraction: 0 unless the subscription carries its discount into renewals. */
    DiscountPct?: number;
    /**
     * Promotion codes that carried into the renewal and discounted it: codes recorded on the line that
     * bought the expiring term whose promotion has `AppliesToRenewals` set. Absent when none were presented.
     */
    RenewalPromotionCodes?: string[];
    /**
     * Codes presented on the renewal that gave no discount, each with the reason: the promotion paused,
     * expired or out of its dates, or its other rules not met. The renewal is placed without them.
     */
    UnusableRenewalPromotionCodes?: Array<{ Code: string; Reason: string }>;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}
';
  p_OutputTypeIsArray_ae7c80fb5431 := FALSE;
  p_ExecutionMode_ae7c80fb5431 := 'LongRunning';
  p_RequiredScope_ae7c80fb5431 := 'orders:subscriptions:write';
  p_RequiresSystemUser_ae7c80fb5431 := FALSE;
  p_GenerationType_ae7c80fb5431 := 'Manual';
  p_CodeApprovalStatus_ae7c80fb5431 := 'Approved';
  p_Status_ae7c80fb5431 := 'Active';
  p_CodeLocked_ae7c80fb5431 := FALSE;
  p_ID_ae7c80fb5431 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C409';
  p_ID_ae7c80fb5431 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.SpawnRenewals' ORDER BY CASE WHEN "ID" = p_ID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1), p_ID_ae7c80fb5431);
  p_CategoryID_ae7c80fb5431 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = p_CategoryID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_ae7c80fb5431);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_ae7c80fb5431,
    'OperationKey', p_OperationKey_ae7c80fb5431,
    'CategoryID', p_CategoryID_ae7c80fb5431,
    'Description', p_Description_ae7c80fb5431,
    'InputTypeName', p_InputTypeName_ae7c80fb5431,
    'InputTypeDefinition', p_InputTypeDefinition_ae7c80fb5431,
    'InputTypeIsArray', p_InputTypeIsArray_ae7c80fb5431,
    'OutputTypeName', p_OutputTypeName_ae7c80fb5431,
    'OutputTypeDefinition', p_OutputTypeDefinition_ae7c80fb5431,
    'OutputTypeIsArray', p_OutputTypeIsArray_ae7c80fb5431,
    'ExecutionMode', p_ExecutionMode_ae7c80fb5431,
    'RequiredScope', p_RequiredScope_ae7c80fb5431,
    'RequiresSystemUser', p_RequiresSystemUser_ae7c80fb5431,
    'GenerationType', p_GenerationType_ae7c80fb5431,
    'Code', p_Code_ae7c80fb5431,
    'CodeApprovalStatus', p_CodeApprovalStatus_ae7c80fb5431,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_ae7c80fb5431,
    'CodeApprovedAt', p_CodeApprovedAt_ae7c80fb5431,
    'ContractFingerprint', p_ContractFingerprint_ae7c80fb5431,
    'Status', p_Status_ae7c80fb5431,
    'CacheTTLSeconds', p_CacheTTLSeconds_ae7c80fb5431,
    'TimeoutMS', p_TimeoutMS_ae7c80fb5431,
    'MaxConcurrency', p_MaxConcurrency_ae7c80fb5431,
    'CodeLocked', p_CodeLocked_ae7c80fb5431,
    'CodeComments', p_CodeComments_ae7c80fb5431,
    'Libraries', p_Libraries_ae7c80fb5431,
    'ID', p_ID_ae7c80fb5431
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_ae7c80fb5431, p_OperationKey := p_OperationKey_ae7c80fb5431, p_CategoryID := p_CategoryID_ae7c80fb5431, p_Description := p_Description_ae7c80fb5431, p_InputTypeName := p_InputTypeName_ae7c80fb5431, p_InputTypeDefinition := p_InputTypeDefinition_ae7c80fb5431, p_InputTypeIsArray := p_InputTypeIsArray_ae7c80fb5431, p_OutputTypeName := p_OutputTypeName_ae7c80fb5431, p_OutputTypeDefinition := p_OutputTypeDefinition_ae7c80fb5431, p_OutputTypeIsArray := p_OutputTypeIsArray_ae7c80fb5431, p_ExecutionMode := p_ExecutionMode_ae7c80fb5431, p_RequiredScope := p_RequiredScope_ae7c80fb5431, p_RequiresSystemUser := p_RequiresSystemUser_ae7c80fb5431, p_GenerationType := p_GenerationType_ae7c80fb5431, p_Code := p_Code_ae7c80fb5431, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_ae7c80fb5431, p_CodeApprovedByUserID := p_CodeApprovedByUserID_ae7c80fb5431, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_ae7c80fb5431, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_ae7c80fb5431, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_ae7c80fb5431, p_CacheTTLSeconds := p_CacheTTLSeconds_ae7c80fb5431, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_ae7c80fb5431, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_ae7c80fb5431, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_ae7c80fb5431, p_CodeComments := p_CodeComments_ae7c80fb5431, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_ae7c80fb5431, p_Libraries_Clear := TRUE, p_ID := p_ID_ae7c80fb5431);
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_Name_98b03edd0f04 VARCHAR(255);
  p_OperationKey_98b03edd0f04 VARCHAR(255);
  p_CategoryID_98b03edd0f04 UUID;
  p_Description_98b03edd0f04 TEXT;
  p_InputTypeName_98b03edd0f04 VARCHAR(255);
  p_InputTypeDefinition_98b03edd0f04 TEXT;
  p_InputTypeIsArray_98b03edd0f04 BOOLEAN;
  p_OutputTypeName_98b03edd0f04 VARCHAR(255);
  p_OutputTypeDefinition_98b03edd0f04 TEXT;
  p_OutputTypeIsArray_98b03edd0f04 BOOLEAN;
  p_ExecutionMode_98b03edd0f04 VARCHAR(20);
  p_RequiredScope_98b03edd0f04 VARCHAR(255);
  p_RequiresSystemUser_98b03edd0f04 BOOLEAN;
  p_GenerationType_98b03edd0f04 VARCHAR(20);
  p_Code_98b03edd0f04 TEXT;
  p_CodeApprovalStatus_98b03edd0f04 VARCHAR(20);
  p_CodeApprovedByUserID_98b03edd0f04 UUID;
  p_CodeApprovedAt_98b03edd0f04 TIMESTAMPTZ;
  p_ContractFingerprint_98b03edd0f04 VARCHAR(100);
  p_Status_98b03edd0f04 VARCHAR(20);
  p_CacheTTLSeconds_98b03edd0f04 INTEGER;
  p_TimeoutMS_98b03edd0f04 INTEGER;
  p_MaxConcurrency_98b03edd0f04 INTEGER;
  p_CodeLocked_98b03edd0f04 BOOLEAN;
  p_CodeComments_98b03edd0f04 TEXT;
  p_Libraries_98b03edd0f04 TEXT;
  p_ID_98b03edd0f04 UUID;
BEGIN
  p_Name_98b03edd0f04 := 'Amend Arrangement';
  p_OperationKey_98b03edd0f04 := 'Orders.AmendArrangement';
  p_CategoryID_98b03edd0f04 := 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304';
  p_Description_98b03edd0f04 := 'Extend a booked subscription term at no charge, or move its start and end together (a shift). Preview returns what the amendment would do and writes nothing. An extension records a Duration concession, routed for approval like any other; it applies when approved: the term''s end, a prospective re-spread of recognition, access, and a task for accounting to confirm the re-cut. A shift records a Shift concession valued at zero, which goes through under the TermShiftReviewDays setting and otherwise waits for the finance acknowledgment role; it applies when approved: the term''s dates, a re-spread from the new start with one catch-up or reversal in the current open period, access, instalments not yet invoiced, and the acknowledgment task. A holder of that role can escalate a shift awaiting review to the ConcessionLimit approver. A change of amount (NewAmount, optionally AppliesToInvoiceID) is previewed the same way: the catch-up on revenue already earned, the staged entries it offsets and the new schedule, the uninvoiced instalments it reduces and any credit memo. Otherwise it records a Price concession carrying NewAmount, routed for approval; when approved, the catch-up and re-cut are posted, the term''s amount and the uninvoiced instalments are lowered, what they cannot absorb is credited on a credit memo the concession carries (crediting the named invoice, or left as the customer''s credit), and accounting is asked to confirm. RefundRequested asks for a paid invoice''s credit back; finance pays it with Orders.RefundPayment. A shortening is refused until that same credit-memo path exists.';
  p_InputTypeName_98b03edd0f04 := 'AmendArrangementInput';
  p_InputTypeDefinition_98b03edd0f04 := '/**
 * Input for `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type AmendmentReasonCategory = ''Retention'' | ''Referral'' | ''Dispute'' | ''Other'';

export interface AmendArrangementInput {
    /** The booked term to amend. Not given with `NewPaymentTermsTypeID`. */
    SubscriptionTermID?: string;
    /**
     * The term''s new end date. Alone, it must be later than the current end (an extension). With
     * `NewStartDate`, it must move by the same days as the start (a shift); leave it out and it follows the start.
     */
    NewEndDate?: string;
    /** The term''s new start date: a shift moves start and end by the same number of days. */
    NewStartDate?: string;
    /** The confirmed order whose payment terms change. Given with `NewPaymentTermsTypeID`. */
    OrderHeaderID?: string;
    /** The order''s new payment terms. */
    NewPaymentTermsTypeID?: string;
    /**
     * The term''s new amount, net of discount and before tax. Lower than the current amount and more than zero.
     * Given with `SubscriptionTermID` and without `NewEndDate`. The reduction and its tax come off the instalments not
     * yet invoiced; what they cannot absorb is credited on a credit memo the approved change carries.
     */
    NewAmount?: number;
    /**
     * With `NewAmount`: the invoiced instalment the reduction is about. That invoice is credited up to its open
     * amount, and the rest comes off the instalments not yet invoiced. Blank: it all comes off those.
     */
    AppliesToInvoiceID?: string;
    /**
     * With `AppliesToInvoiceID` naming a paid invoice: refund its credit instead of taking it off the next instalment.
     * The approval credits that invoice on the credit memo; finance pays the refund with `Orders.RefundPayment`.
     */
    RefundRequested?: boolean;
    /** A term extension earned by a referral: the program that approves it. Requires ReasonCategory ''Referral''. */
    ReferralProgramID?: string;
    /** Required for every amendment; not given with `EscalateOrderConcessionID`. */
    ReasonCategory?: AmendmentReasonCategory;
    /** Why the amendment is made, or, with `EscalateOrderConcessionID`, why the case goes to the ConcessionLimit approver. */
    Reason: string;
    /**
     * A Shift concession awaiting finance review, which a holder of the finance acknowledgment role sends to the
     * ConcessionLimit approver instead of deciding it. Given alone, with `Reason`.
     */
    EscalateOrderConcessionID?: string;
    /** Return what the amendment would do without writing anything. */
    Preview?: boolean;
}
';
  p_InputTypeIsArray_98b03edd0f04 := FALSE;
  p_OutputTypeName_98b03edd0f04 := 'AmendArrangementOutput';
  p_OutputTypeDefinition_98b03edd0f04 := '/**
 * Output of `Orders.AmendArrangement`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface AmendArrangementEntry {
    EffectiveDate: string;
    Amount: number;
    /** For an offset, the staged entry it cancels. */
    Offsets?: string;
}

/** An instalment not yet invoiced that a shift moves. */
export interface AmendArrangementMovedInstalment {
    InstallmentNumber: number;
    DueDate: string;
    NewDueDate: string;
}

/** An instalment not yet invoiced that a change of amount reduces. A `NewAmount` of zero cancels it. */
export interface AmendArrangementInstalment {
    InstalmentID: string;
    InstallmentNumber: number;
    DueDate: string;
    CurrentAmount: number;
    NewAmount: number;
}

/** Where a change of amount''s credit memo is applied: an invoiced instalment, or the order billed as a whole. */
export interface AmendArrangementCredit {
    /** Null when the order itself is credited. */
    InstalmentID: string | null;
    DocumentNumber: string | null;
    Amount: number;
}

export interface AmendArrangementOutput {
    Success: boolean;
    Message?: string;
    CurrentStartDate?: string;
    NewStartDate?: string;
    CurrentEndDate?: string;
    NewEndDate?: string;
    /** The day the amendment takes effect: staged entries from here on are replaced. */
    EffectiveDate?: string;
    /** What the added days are worth at the term''s own rate; for a change of amount, the reduction. */
    Value?: number;
    /** What the replaced entries were going to recognise, and the new schedule now does. */
    Respread?: number;
    Offsets?: AmendArrangementEntry[];
    NewSchedule?: AmendArrangementEntry[];
    /** A change of amount: the term''s amount before and after, net of discount and before tax. */
    CurrentAmount?: number;
    NewAmount?: number;
    /** The tax charged on the reduction, and the reduction with it: what the customer is billed less. */
    TaxReduction?: number;
    GrossReduction?: number;
    /** The reduction''s share that belongs to periods already earned, taken back on the effective date. */
    CatchUp?: number;
    /** Instalments not yet invoiced that the reduction comes off. */
    Instalments?: AmendArrangementInstalment[];
    /** The credit memo: the part of the reduction not taken off an uninvoiced instalment. Zero when no document is needed. */
    CreditMemo?: number;
    /** Where the credit memo is applied. */
    CreditApplied?: AmendArrangementCredit[];
    /** The credit memo''s part refunded, and the part left as the customer''s credit. */
    Refund?: number;
    OpenCredit?: number;
    /**
     * A shift: the one entry, dated the effective day, that corrects periods already behind it. A positive amount
     * catches up revenue the new dates place earlier; a negative one reverses revenue they place later.
     */
    Correction?: AmendArrangementEntry | null;
    /** A shift: the instalments not yet invoiced that move with the term. */
    MovedInstalments?: AmendArrangementMovedInstalment[];
    /** A shift: why the order''s instalments were left alone, when they were. */
    InstalmentsLeft?: string | null;
    /** A change of payment terms: the terms before and after, by name. */
    CurrentPaymentTerms?: string | null;
    NewPaymentTerms?: string;
    /** Days to payment the new terms move by: positive when the customer pays later. */
    DaysChange?: number;
    CurrentDueDate?: string | null;
    NewDueDate?: string | null;
    /** With a referral program: its name, and whether it approves the extension (false: routed for approval). */
    ReferralProgram?: string;
    ApprovedByReferralProgram?: boolean;
    /** Set when recorded: the concession, and whether it is Approved (applied) or Pending (awaiting approval). */
    OrderConcessionID?: string;
    Status?: string;
}
';
  p_OutputTypeIsArray_98b03edd0f04 := FALSE;
  p_ExecutionMode_98b03edd0f04 := 'Sync';
  p_RequiredScope_98b03edd0f04 := 'orders:subscriptions:write';
  p_RequiresSystemUser_98b03edd0f04 := FALSE;
  p_GenerationType_98b03edd0f04 := 'Manual';
  p_CodeApprovalStatus_98b03edd0f04 := 'Approved';
  p_Status_98b03edd0f04 := 'Active';
  p_CodeLocked_98b03edd0f04 := FALSE;
  p_ID_98b03edd0f04 := '6B24D4FD-3DD2-4E28-841C-3B64535DADDC';
  p_ID_98b03edd0f04 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.AmendArrangement' ORDER BY CASE WHEN "ID" = p_ID_98b03edd0f04 THEN 0 ELSE 1 END LIMIT 1), p_ID_98b03edd0f04);
  p_CategoryID_98b03edd0f04 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = p_CategoryID_98b03edd0f04 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_98b03edd0f04);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
    'Name', p_Name_98b03edd0f04,
    'OperationKey', p_OperationKey_98b03edd0f04,
    'CategoryID', p_CategoryID_98b03edd0f04,
    'Description', p_Description_98b03edd0f04,
    'InputTypeName', p_InputTypeName_98b03edd0f04,
    'InputTypeDefinition', p_InputTypeDefinition_98b03edd0f04,
    'InputTypeIsArray', p_InputTypeIsArray_98b03edd0f04,
    'OutputTypeName', p_OutputTypeName_98b03edd0f04,
    'OutputTypeDefinition', p_OutputTypeDefinition_98b03edd0f04,
    'OutputTypeIsArray', p_OutputTypeIsArray_98b03edd0f04,
    'ExecutionMode', p_ExecutionMode_98b03edd0f04,
    'RequiredScope', p_RequiredScope_98b03edd0f04,
    'RequiresSystemUser', p_RequiresSystemUser_98b03edd0f04,
    'GenerationType', p_GenerationType_98b03edd0f04,
    'Code', p_Code_98b03edd0f04,
    'CodeApprovalStatus', p_CodeApprovalStatus_98b03edd0f04,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_98b03edd0f04,
    'CodeApprovedAt', p_CodeApprovedAt_98b03edd0f04,
    'ContractFingerprint', p_ContractFingerprint_98b03edd0f04,
    'Status', p_Status_98b03edd0f04,
    'CacheTTLSeconds', p_CacheTTLSeconds_98b03edd0f04,
    'TimeoutMS', p_TimeoutMS_98b03edd0f04,
    'MaxConcurrency', p_MaxConcurrency_98b03edd0f04,
    'CodeLocked', p_CodeLocked_98b03edd0f04,
    'CodeComments', p_CodeComments_98b03edd0f04,
    'Libraries', p_Libraries_98b03edd0f04,
    'ID', p_ID_98b03edd0f04
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_Name := p_Name_98b03edd0f04, p_OperationKey := p_OperationKey_98b03edd0f04, p_CategoryID := p_CategoryID_98b03edd0f04, p_Description := p_Description_98b03edd0f04, p_InputTypeName := p_InputTypeName_98b03edd0f04, p_InputTypeDefinition := p_InputTypeDefinition_98b03edd0f04, p_InputTypeIsArray := p_InputTypeIsArray_98b03edd0f04, p_OutputTypeName := p_OutputTypeName_98b03edd0f04, p_OutputTypeDefinition := p_OutputTypeDefinition_98b03edd0f04, p_OutputTypeIsArray := p_OutputTypeIsArray_98b03edd0f04, p_ExecutionMode := p_ExecutionMode_98b03edd0f04, p_RequiredScope := p_RequiredScope_98b03edd0f04, p_RequiresSystemUser := p_RequiresSystemUser_98b03edd0f04, p_GenerationType := p_GenerationType_98b03edd0f04, p_Code := p_Code_98b03edd0f04, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_98b03edd0f04, p_CodeApprovedByUserID := p_CodeApprovedByUserID_98b03edd0f04, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_98b03edd0f04, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_98b03edd0f04, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_98b03edd0f04, p_CacheTTLSeconds := p_CacheTTLSeconds_98b03edd0f04, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_98b03edd0f04, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_98b03edd0f04, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_98b03edd0f04, p_CodeComments := p_CodeComments_98b03edd0f04, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_98b03edd0f04, p_Libraries_Clear := TRUE, p_ID := p_ID_98b03edd0f04);
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_b0d279a87495 UUID;
  p_ApplicationID_b0d279a87495 UUID;
  p_Name_b0d279a87495 VARCHAR(100);
  p_Value_b0d279a87495 TEXT;
  p_Comments_b0d279a87495 TEXT;
BEGIN
  p_ID_b0d279a87495 := '586B7952-62A9-4121-A71B-F6EBC4A967BE';
  p_ApplicationID_b0d279a87495 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_b0d279a87495 := 'TermShiftReviewDays';
  p_Value_b0d279a87495 := '';
  p_Comments_b0d279a87495 := 'Days a booked term''s start and end may move together before the change goes to the finance acknowledgment role for review (bizapps-orders#507). A shift is a term change, not a sales concession, so it is one figure for the app rather than a SalesAuthority limit. At or above the value, the shift is reviewed; under it, it goes through. Empty, or anything other than a whole number, reviews every shift.';
  p_ApplicationID_b0d279a87495 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_b0d279a87495 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_b0d279a87495);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_b0d279a87495
                  OR ("ApplicationID" = p_ApplicationID_b0d279a87495 AND "Name" = p_Name_b0d279a87495)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_b0d279a87495,
      'ApplicationID', p_ApplicationID_b0d279a87495,
      'Name', p_Name_b0d279a87495,
      'Value', p_Value_b0d279a87495,
      'Comments', p_Comments_b0d279a87495
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_b0d279a87495, p_ApplicationID := p_ApplicationID_b0d279a87495, p_Name := p_Name_b0d279a87495, p_Value := p_Value_b0d279a87495, p_Comments := p_Comments_b0d279a87495);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_2b17c3cf63ea UUID;
  p_ApplicationID_2b17c3cf63ea UUID;
  p_Name_2b17c3cf63ea VARCHAR(100);
  p_Value_2b17c3cf63ea TEXT;
  p_Comments_2b17c3cf63ea TEXT;
BEGIN
  p_ID_2b17c3cf63ea := '790CAE86-689A-4984-AF17-3200CE72D36B';
  p_ApplicationID_2b17c3cf63ea := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_2b17c3cf63ea := 'RenewalChargeRetryDays';
  p_Value_2b17c3cf63ea := '3,7,11';
  p_Comments_2b17c3cf63ea := 'Comma-separated days after a renewal order''s due day on which the daily renewal-charge job tries a declined renewal card again (#289). The due day is always the first attempt; with the default the card is tried on the due day and 3, 7 and 11 days after it. Attempts stop at the access cutoff (RenewalAccessCutoffDaysPastDue) whatever this lists. Empty means no retries. A value with any entry that is not a whole number of 1 or more falls back to 3,7,11.';
  p_ApplicationID_2b17c3cf63ea := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_2b17c3cf63ea THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_2b17c3cf63ea);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_2b17c3cf63ea
                  OR ("ApplicationID" = p_ApplicationID_2b17c3cf63ea AND "Name" = p_Name_2b17c3cf63ea)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_2b17c3cf63ea,
      'ApplicationID', p_ApplicationID_2b17c3cf63ea,
      'Name', p_Name_2b17c3cf63ea,
      'Value', p_Value_2b17c3cf63ea,
      'Comments', p_Comments_2b17c3cf63ea
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_2b17c3cf63ea, p_ApplicationID := p_ApplicationID_2b17c3cf63ea, p_Name := p_Name_2b17c3cf63ea, p_Value := p_Value_2b17c3cf63ea, p_Comments := p_Comments_2b17c3cf63ea);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_ea9bc36f29d6 UUID;
  p_ApplicationID_ea9bc36f29d6 UUID;
  p_Name_ea9bc36f29d6 VARCHAR(100);
  p_Value_ea9bc36f29d6 TEXT;
  p_Comments_ea9bc36f29d6 TEXT;
BEGIN
  p_ID_ea9bc36f29d6 := 'C3CA57CB-0C3B-450E-A294-25500B9BF3F0';
  p_ApplicationID_ea9bc36f29d6 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_ea9bc36f29d6 := 'RenewalPaymentLinkBaseUrl';
  p_Value_ea9bc36f29d6 := '';
  p_Comments_ea9bc36f29d6 := 'The public address of this host''s checkout edge, for example https://shop.example.org/checkout (the OrdersCheckoutEdge RootPath on the public host name). When a renewal card is first declined, or the bank asks the absent buyer to authenticate, the buyer is e-mailed a link built on it, <address>/renew/<token>, that pays the renewal with a new card (#289). Empty sends no link. The link-signing secret is not a setting: the server reads it from the ORDERS_RENEWAL_LINK_SECRET environment variable.';
  p_ApplicationID_ea9bc36f29d6 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_ea9bc36f29d6 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_ea9bc36f29d6);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
               WHERE "ID" = p_ID_ea9bc36f29d6
                  OR ("ApplicationID" = p_ApplicationID_ea9bc36f29d6 AND "Name" = p_Name_ea9bc36f29d6)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
      'ID', p_ID_ea9bc36f29d6,
      'ApplicationID', p_ApplicationID_ea9bc36f29d6,
      'Name', p_Name_ea9bc36f29d6,
      'Value', p_Value_ea9bc36f29d6,
      'Comments', p_Comments_ea9bc36f29d6
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_ea9bc36f29d6, p_ApplicationID := p_ApplicationID_ea9bc36f29d6, p_Name := p_Name_ea9bc36f29d6, p_Value := p_Value_ea9bc36f29d6, p_Comments := p_Comments_ea9bc36f29d6);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_c5153fb07984 UUID;
  p_ActionID_c5153fb07984 UUID;
  p_Name_c5153fb07984 VARCHAR(255);
  p_DefaultValue_c5153fb07984 TEXT;
  p_Type_c5153fb07984 CHAR(10);
  p_ValueType_c5153fb07984 VARCHAR(30);
  p_IsArray_c5153fb07984 BOOLEAN;
  p_Description_c5153fb07984 TEXT;
  p_IsRequired_c5153fb07984 BOOLEAN;
  p_MediaModality_c5153fb07984 VARCHAR(20);
  p_LogValue_c5153fb07984 BOOLEAN;
BEGIN
  p_ID_c5153fb07984 := 'EF6ECFF1-BB33-466F-8AE7-EC35936720B1';
  p_ActionID_c5153fb07984 := '896B0F83-AD89-4FC5-BDB9-330DE95AB3E4';
  p_Name_c5153fb07984 := 'OrderConcessionID';
  p_Type_c5153fb07984 := 'Input';
  p_ValueType_c5153fb07984 := 'Scalar';
  p_IsArray_c5153fb07984 := FALSE;
  p_Description_c5153fb07984 := 'An approved amount change on this order: render the credit memo it issued instead of the order. Refused when the change issued no credit memo.';
  p_IsRequired_c5153fb07984 := FALSE;
  p_LogValue_c5153fb07984 := TRUE;
  p_ActionID_c5153fb07984 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Generate Invoice' ORDER BY CASE WHEN "ID" = p_ActionID_c5153fb07984 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_c5153fb07984);
  IF p_ActionID_c5153fb07984 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_c5153fb07984
                  OR ("Name" = p_Name_c5153fb07984 AND "ActionID" = p_ActionID_c5153fb07984)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_c5153fb07984,
      'ActionID', p_ActionID_c5153fb07984,
      'Name', p_Name_c5153fb07984,
      'DefaultValue', p_DefaultValue_c5153fb07984,
      'Type', p_Type_c5153fb07984,
      'ValueType', p_ValueType_c5153fb07984,
      'IsArray', p_IsArray_c5153fb07984,
      'Description', p_Description_c5153fb07984,
      'IsRequired', p_IsRequired_c5153fb07984,
      'MediaModality', p_MediaModality_c5153fb07984,
      'LogValue', p_LogValue_c5153fb07984
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_c5153fb07984, p_ActionID := p_ActionID_c5153fb07984, p_Name := p_Name_c5153fb07984, p_DefaultValue := p_DefaultValue_c5153fb07984, p_DefaultValue_Clear := TRUE, p_Type := p_Type_c5153fb07984, p_ValueType := p_ValueType_c5153fb07984, p_IsArray := p_IsArray_c5153fb07984, p_Description := p_Description_c5153fb07984, p_IsRequired := p_IsRequired_c5153fb07984, p_MediaModality := p_MediaModality_c5153fb07984, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_c5153fb07984);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_334fea753e70 UUID;
  p_ActionID_334fea753e70 UUID;
  p_Name_334fea753e70 VARCHAR(255);
  p_DefaultValue_334fea753e70 TEXT;
  p_Type_334fea753e70 CHAR(10);
  p_ValueType_334fea753e70 VARCHAR(30);
  p_IsArray_334fea753e70 BOOLEAN;
  p_Description_334fea753e70 TEXT;
  p_IsRequired_334fea753e70 BOOLEAN;
  p_MediaModality_334fea753e70 VARCHAR(20);
  p_LogValue_334fea753e70 BOOLEAN;
BEGIN
  p_ID_334fea753e70 := '17782EF5-90EF-4FF4-BF25-77E6435278FE';
  p_ActionID_334fea753e70 := 'C41E7A55-9B2D-4E38-A6F1-2D7C4B90E118';
  p_Name_334fea753e70 := 'OrderConcessionID';
  p_Type_334fea753e70 := 'Input';
  p_ValueType_334fea753e70 := 'Scalar';
  p_IsArray_334fea753e70 := FALSE;
  p_Description_334fea753e70 := 'An approved amount change on this order: send the credit memo it issued instead of the order''s invoice. Sent by email even when the order''s company invoices through Bill.com, which carries no credit memos.';
  p_IsRequired_334fea753e70 := FALSE;
  p_LogValue_334fea753e70 := TRUE;
  p_ActionID_334fea753e70 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Send Document' ORDER BY CASE WHEN "ID" = p_ActionID_334fea753e70 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_334fea753e70);
  IF p_ActionID_334fea753e70 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_334fea753e70
                  OR ("Name" = p_Name_334fea753e70 AND "ActionID" = p_ActionID_334fea753e70)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_334fea753e70,
      'ActionID', p_ActionID_334fea753e70,
      'Name', p_Name_334fea753e70,
      'DefaultValue', p_DefaultValue_334fea753e70,
      'Type', p_Type_334fea753e70,
      'ValueType', p_ValueType_334fea753e70,
      'IsArray', p_IsArray_334fea753e70,
      'Description', p_Description_334fea753e70,
      'IsRequired', p_IsRequired_334fea753e70,
      'MediaModality', p_MediaModality_334fea753e70,
      'LogValue', p_LogValue_334fea753e70
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_334fea753e70, p_ActionID := p_ActionID_334fea753e70, p_Name := p_Name_334fea753e70, p_DefaultValue := p_DefaultValue_334fea753e70, p_DefaultValue_Clear := TRUE, p_Type := p_Type_334fea753e70, p_ValueType := p_ValueType_334fea753e70, p_IsArray := p_IsArray_334fea753e70, p_Description := p_Description_334fea753e70, p_IsRequired := p_IsRequired_334fea753e70, p_MediaModality := p_MediaModality_334fea753e70, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_334fea753e70);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Actions (core SP call only)
DO $mj$
DECLARE
  p_CategoryID_fad16274ea12 UUID;
  p_Name_fad16274ea12 VARCHAR(425);
  p_Description_fad16274ea12 TEXT;
  p_Type_fad16274ea12 VARCHAR(20);
  p_UserPrompt_fad16274ea12 TEXT;
  p_UserComments_fad16274ea12 TEXT;
  p_Code_fad16274ea12 TEXT;
  p_CodeComments_fad16274ea12 TEXT;
  p_CodeApprovalStatus_fad16274ea12 VARCHAR(20);
  p_CodeApprovalComments_fad16274ea12 TEXT;
  p_CodeApprovedByUserID_fad16274ea12 UUID;
  p_CodeApprovedAt_fad16274ea12 TIMESTAMPTZ;
  p_CodeLocked_fad16274ea12 BOOLEAN;
  p_ForceCodeGeneration_fad16274ea12 BOOLEAN;
  p_RetentionPeriod_fad16274ea12 INTEGER;
  p_Status_fad16274ea12 VARCHAR(20);
  p_DriverClass_fad16274ea12 VARCHAR(255);
  p_ParentID_fad16274ea12 UUID;
  p_IconClass_fad16274ea12 VARCHAR(100);
  p_DefaultCompactPromptID_fad16274ea12 UUID;
  p_Config_fad16274ea12 TEXT;
  p_RuntimeActionConfiguration_fad16274ea12 TEXT;
  p_MaxExecutionTimeMS_fad16274ea12 INTEGER;
  p_CreatedByAgentID_fad16274ea12 UUID;
  p_ID_fad16274ea12 UUID;
BEGIN
  p_CategoryID_fad16274ea12 := '359F5241-25D1-4949-A74F-C20CA3EECC3A';
  p_Name_fad16274ea12 := 'Reconcile Payment Provider Charges';
  p_Description_fad16274ea12 := 'Match the payment gateway''s charges and refunds to Orders'' payments for a window of business days and report the mismatches. Runs the Orders.ReconcilePaymentProviderCharges operation; this Action only reads parameters and reports the result. With Preview false, a charge without a payment whose gateway price is mapped to a product becomes a paid order, and the remaining mismatches are raised as finance exceptions. A provider that could not be read fails the run.';
  p_Type_fad16274ea12 := 'Custom';
  p_UserPrompt_fad16274ea12 := 'Compare the payment gateway''s charges and refunds with Orders'' payments and list what does not match.';
  p_CodeApprovalStatus_fad16274ea12 := 'Approved';
  p_CodeLocked_fad16274ea12 := FALSE;
  p_ForceCodeGeneration_fad16274ea12 := FALSE;
  p_Status_fad16274ea12 := 'Active';
  p_DriverClass_fad16274ea12 := 'Orders.ReconcilePaymentProviderCharges';
  p_IconClass_fad16274ea12 := 'fa-solid fa-scale-balanced';
  p_ID_fad16274ea12 := '6E75392C-9267-4C29-8CEC-11F2A1058C57';
  p_ID_fad16274ea12 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Reconcile Payment Provider Charges' ORDER BY CASE WHEN "ID" = p_ID_fad16274ea12 THEN 0 ELSE 1 END LIMIT 1), p_ID_fad16274ea12);
  p_CategoryID_fad16274ea12 := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_fad16274ea12 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_fad16274ea12);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateAction'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateAction"(p_data := jsonb_build_object(
    'CategoryID', p_CategoryID_fad16274ea12,
    'Name', p_Name_fad16274ea12,
    'Description', p_Description_fad16274ea12,
    'Type', p_Type_fad16274ea12,
    'UserPrompt', p_UserPrompt_fad16274ea12,
    'UserComments', p_UserComments_fad16274ea12,
    'Code', p_Code_fad16274ea12,
    'CodeComments', p_CodeComments_fad16274ea12,
    'CodeApprovalStatus', p_CodeApprovalStatus_fad16274ea12,
    'CodeApprovalComments', p_CodeApprovalComments_fad16274ea12,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_fad16274ea12,
    'CodeApprovedAt', p_CodeApprovedAt_fad16274ea12,
    'CodeLocked', p_CodeLocked_fad16274ea12,
    'ForceCodeGeneration', p_ForceCodeGeneration_fad16274ea12,
    'RetentionPeriod', p_RetentionPeriod_fad16274ea12,
    'Status', p_Status_fad16274ea12,
    'DriverClass', p_DriverClass_fad16274ea12,
    'ParentID', p_ParentID_fad16274ea12,
    'IconClass', p_IconClass_fad16274ea12,
    'DefaultCompactPromptID', p_DefaultCompactPromptID_fad16274ea12,
    'Config', p_Config_fad16274ea12,
    'RuntimeActionConfiguration', p_RuntimeActionConfiguration_fad16274ea12,
    'MaxExecutionTimeMS', p_MaxExecutionTimeMS_fad16274ea12,
    'CreatedByAgentID', p_CreatedByAgentID_fad16274ea12,
    'ID', p_ID_fad16274ea12
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateAction"(p_CategoryID := p_CategoryID_fad16274ea12, p_Name := p_Name_fad16274ea12, p_Description := p_Description_fad16274ea12, p_Type := p_Type_fad16274ea12, p_UserPrompt := p_UserPrompt_fad16274ea12, p_UserComments := p_UserComments_fad16274ea12, p_UserComments_Clear := TRUE, p_Code := p_Code_fad16274ea12, p_Code_Clear := TRUE, p_CodeComments := p_CodeComments_fad16274ea12, p_CodeComments_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_fad16274ea12, p_CodeApprovalComments := p_CodeApprovalComments_fad16274ea12, p_CodeApprovalComments_Clear := TRUE, p_CodeApprovedByUserID := p_CodeApprovedByUserID_fad16274ea12, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_fad16274ea12, p_CodeApprovedAt_Clear := TRUE, p_CodeLocked := p_CodeLocked_fad16274ea12, p_ForceCodeGeneration := p_ForceCodeGeneration_fad16274ea12, p_RetentionPeriod := p_RetentionPeriod_fad16274ea12, p_RetentionPeriod_Clear := TRUE, p_Status := p_Status_fad16274ea12, p_DriverClass := p_DriverClass_fad16274ea12, p_ParentID := p_ParentID_fad16274ea12, p_ParentID_Clear := TRUE, p_IconClass := p_IconClass_fad16274ea12, p_DefaultCompactPromptID := p_DefaultCompactPromptID_fad16274ea12, p_DefaultCompactPromptID_Clear := TRUE, p_Config := p_Config_fad16274ea12, p_Config_Clear := TRUE, p_RuntimeActionConfiguration := p_RuntimeActionConfiguration_fad16274ea12, p_RuntimeActionConfiguration_Clear := TRUE, p_MaxExecutionTimeMS := p_MaxExecutionTimeMS_fad16274ea12, p_MaxExecutionTimeMS_Clear := TRUE, p_CreatedByAgentID := p_CreatedByAgentID_fad16274ea12, p_CreatedByAgentID_Clear := TRUE, p_ID := p_ID_fad16274ea12);
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_8285f6c2bc83 UUID;
  p_ActionID_8285f6c2bc83 UUID;
  p_Name_8285f6c2bc83 VARCHAR(255);
  p_DefaultValue_8285f6c2bc83 TEXT;
  p_Type_8285f6c2bc83 CHAR(10);
  p_ValueType_8285f6c2bc83 VARCHAR(30);
  p_IsArray_8285f6c2bc83 BOOLEAN;
  p_Description_8285f6c2bc83 TEXT;
  p_IsRequired_8285f6c2bc83 BOOLEAN;
  p_MediaModality_8285f6c2bc83 VARCHAR(20);
  p_LogValue_8285f6c2bc83 BOOLEAN;
BEGIN
  p_ID_8285f6c2bc83 := '9D91FE88-16C6-4D17-AD98-8D303C0F7C3E';
  p_ActionID_8285f6c2bc83 := '6E75392C-9267-4C29-8CEC-11F2A1058C57';
  p_Name_8285f6c2bc83 := 'OrdersCreated';
  p_Type_8285f6c2bc83 := 'Output';
  p_ValueType_8285f6c2bc83 := 'Scalar';
  p_IsArray_8285f6c2bc83 := TRUE;
  p_Description_8285f6c2bc83 := 'Paid orders created from charges without a payment, with the charge, order and payment. Empty in preview.';
  p_IsRequired_8285f6c2bc83 := FALSE;
  p_LogValue_8285f6c2bc83 := TRUE;
  p_ActionID_8285f6c2bc83 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Reconcile Payment Provider Charges' ORDER BY CASE WHEN "ID" = p_ActionID_8285f6c2bc83 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_8285f6c2bc83);
  IF p_ActionID_8285f6c2bc83 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_8285f6c2bc83
                  OR ("Name" = p_Name_8285f6c2bc83 AND "ActionID" = p_ActionID_8285f6c2bc83)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_8285f6c2bc83,
      'ActionID', p_ActionID_8285f6c2bc83,
      'Name', p_Name_8285f6c2bc83,
      'DefaultValue', p_DefaultValue_8285f6c2bc83,
      'Type', p_Type_8285f6c2bc83,
      'ValueType', p_ValueType_8285f6c2bc83,
      'IsArray', p_IsArray_8285f6c2bc83,
      'Description', p_Description_8285f6c2bc83,
      'IsRequired', p_IsRequired_8285f6c2bc83,
      'MediaModality', p_MediaModality_8285f6c2bc83,
      'LogValue', p_LogValue_8285f6c2bc83
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_8285f6c2bc83, p_ActionID := p_ActionID_8285f6c2bc83, p_Name := p_Name_8285f6c2bc83, p_DefaultValue := p_DefaultValue_8285f6c2bc83, p_DefaultValue_Clear := TRUE, p_Type := p_Type_8285f6c2bc83, p_ValueType := p_ValueType_8285f6c2bc83, p_IsArray := p_IsArray_8285f6c2bc83, p_Description := p_Description_8285f6c2bc83, p_IsRequired := p_IsRequired_8285f6c2bc83, p_MediaModality := p_MediaModality_8285f6c2bc83, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_8285f6c2bc83);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Actions (core SP call only)
DO $mj$
DECLARE
  p_ID_d5ba65d2319c UUID;
  p_CategoryID_d5ba65d2319c UUID;
  p_Name_d5ba65d2319c VARCHAR(425);
  p_Description_d5ba65d2319c TEXT;
  p_Type_d5ba65d2319c VARCHAR(20);
  p_UserPrompt_d5ba65d2319c TEXT;
  p_UserComments_d5ba65d2319c TEXT;
  p_Code_d5ba65d2319c TEXT;
  p_CodeComments_d5ba65d2319c TEXT;
  p_CodeApprovalStatus_d5ba65d2319c VARCHAR(20);
  p_CodeApprovalComments_d5ba65d2319c TEXT;
  p_CodeApprovedByUserID_d5ba65d2319c UUID;
  p_CodeApprovedAt_d5ba65d2319c TIMESTAMPTZ;
  p_CodeLocked_d5ba65d2319c BOOLEAN;
  p_ForceCodeGeneration_d5ba65d2319c BOOLEAN;
  p_RetentionPeriod_d5ba65d2319c INTEGER;
  p_Status_d5ba65d2319c VARCHAR(20);
  p_DriverClass_d5ba65d2319c VARCHAR(255);
  p_ParentID_d5ba65d2319c UUID;
  p_IconClass_d5ba65d2319c VARCHAR(100);
  p_DefaultCompactPromptID_d5ba65d2319c UUID;
  p_Config_d5ba65d2319c TEXT;
  p_RuntimeActionConfiguration_d5ba65d2319c TEXT;
  p_MaxExecutionTimeMS_d5ba65d2319c INTEGER;
  p_CreatedByAgentID_d5ba65d2319c UUID;
BEGIN
  p_ID_d5ba65d2319c := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_CategoryID_d5ba65d2319c := '359F5241-25D1-4949-A74F-C20CA3EECC3A';
  p_Name_d5ba65d2319c := 'Charge Renewals';
  p_Description_d5ba65d2319c := 'Charge the renewal card of each renewal order due a charge today: on its due day (the new term''s first day), then on the retry days after it (the RenewalChargeRetryDays setting, default 3, 7 and 11), until it is paid or reaches the access cutoff. A success is captured against the order; a decline or an authentication demand is recorded as a failed attempt with the next attempt day. Preview reports what would be charged without charging.';
  p_Type_d5ba65d2319c := 'Custom';
  p_UserPrompt_d5ba65d2319c := 'Charge the saved cards of renewal orders due a charge today, or preview what would be charged.';
  p_CodeApprovalStatus_d5ba65d2319c := 'Approved';
  p_CodeLocked_d5ba65d2319c := FALSE;
  p_ForceCodeGeneration_d5ba65d2319c := FALSE;
  p_Status_d5ba65d2319c := 'Active';
  p_DriverClass_d5ba65d2319c := 'Orders.ChargeRenewals';
  p_IconClass_d5ba65d2319c := 'fa-solid fa-credit-card';
  p_CategoryID_d5ba65d2319c := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_d5ba65d2319c THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_d5ba65d2319c);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action"
               WHERE "ID" = p_ID_d5ba65d2319c OR "Name" = p_Name_d5ba65d2319c) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAction'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAction"(p_data := jsonb_build_object(
      'ID', p_ID_d5ba65d2319c,
      'CategoryID', p_CategoryID_d5ba65d2319c,
      'Name', p_Name_d5ba65d2319c,
      'Description', p_Description_d5ba65d2319c,
      'Type', p_Type_d5ba65d2319c,
      'UserPrompt', p_UserPrompt_d5ba65d2319c,
      'UserComments', p_UserComments_d5ba65d2319c,
      'Code', p_Code_d5ba65d2319c,
      'CodeComments', p_CodeComments_d5ba65d2319c,
      'CodeApprovalStatus', p_CodeApprovalStatus_d5ba65d2319c,
      'CodeApprovalComments', p_CodeApprovalComments_d5ba65d2319c,
      'CodeApprovedByUserID', p_CodeApprovedByUserID_d5ba65d2319c,
      'CodeApprovedAt', p_CodeApprovedAt_d5ba65d2319c,
      'CodeLocked', p_CodeLocked_d5ba65d2319c,
      'ForceCodeGeneration', p_ForceCodeGeneration_d5ba65d2319c,
      'RetentionPeriod', p_RetentionPeriod_d5ba65d2319c,
      'Status', p_Status_d5ba65d2319c,
      'DriverClass', p_DriverClass_d5ba65d2319c,
      'ParentID', p_ParentID_d5ba65d2319c,
      'IconClass', p_IconClass_d5ba65d2319c,
      'DefaultCompactPromptID', p_DefaultCompactPromptID_d5ba65d2319c,
      'Config', p_Config_d5ba65d2319c,
      'RuntimeActionConfiguration', p_RuntimeActionConfiguration_d5ba65d2319c,
      'MaxExecutionTimeMS', p_MaxExecutionTimeMS_d5ba65d2319c,
      'CreatedByAgentID', p_CreatedByAgentID_d5ba65d2319c
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAction"(p_ID := p_ID_d5ba65d2319c, p_CategoryID := p_CategoryID_d5ba65d2319c, p_Name := p_Name_d5ba65d2319c, p_Description := p_Description_d5ba65d2319c, p_Type := p_Type_d5ba65d2319c, p_UserPrompt := p_UserPrompt_d5ba65d2319c, p_UserComments := p_UserComments_d5ba65d2319c, p_UserComments_Clear := TRUE, p_Code := p_Code_d5ba65d2319c, p_Code_Clear := TRUE, p_CodeComments := p_CodeComments_d5ba65d2319c, p_CodeComments_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_d5ba65d2319c, p_CodeApprovalComments := p_CodeApprovalComments_d5ba65d2319c, p_CodeApprovalComments_Clear := TRUE, p_CodeApprovedByUserID := p_CodeApprovedByUserID_d5ba65d2319c, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_d5ba65d2319c, p_CodeApprovedAt_Clear := TRUE, p_CodeLocked := p_CodeLocked_d5ba65d2319c, p_ForceCodeGeneration := p_ForceCodeGeneration_d5ba65d2319c, p_RetentionPeriod := p_RetentionPeriod_d5ba65d2319c, p_RetentionPeriod_Clear := TRUE, p_Status := p_Status_d5ba65d2319c, p_DriverClass := p_DriverClass_d5ba65d2319c, p_ParentID := p_ParentID_d5ba65d2319c, p_ParentID_Clear := TRUE, p_IconClass := p_IconClass_d5ba65d2319c, p_DefaultCompactPromptID := p_DefaultCompactPromptID_d5ba65d2319c, p_DefaultCompactPromptID_Clear := TRUE, p_Config := p_Config_d5ba65d2319c, p_Config_Clear := TRUE, p_RuntimeActionConfiguration := p_RuntimeActionConfiguration_d5ba65d2319c, p_RuntimeActionConfiguration_Clear := TRUE, p_MaxExecutionTimeMS := p_MaxExecutionTimeMS_d5ba65d2319c, p_MaxExecutionTimeMS_Clear := TRUE, p_CreatedByAgentID := p_CreatedByAgentID_d5ba65d2319c, p_CreatedByAgentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_61a75f3c90e5 UUID;
  p_ActionID_61a75f3c90e5 UUID;
  p_Name_61a75f3c90e5 VARCHAR(255);
  p_DefaultValue_61a75f3c90e5 TEXT;
  p_Type_61a75f3c90e5 CHAR(10);
  p_ValueType_61a75f3c90e5 VARCHAR(30);
  p_IsArray_61a75f3c90e5 BOOLEAN;
  p_Description_61a75f3c90e5 TEXT;
  p_IsRequired_61a75f3c90e5 BOOLEAN;
  p_MediaModality_61a75f3c90e5 VARCHAR(20);
  p_LogValue_61a75f3c90e5 BOOLEAN;
BEGIN
  p_ID_61a75f3c90e5 := 'E36A44EF-B2B4-434F-9A76-FFC3054541A0';
  p_ActionID_61a75f3c90e5 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_61a75f3c90e5 := 'AsOfDate';
  p_Type_61a75f3c90e5 := 'Input';
  p_ValueType_61a75f3c90e5 := 'Scalar';
  p_IsArray_61a75f3c90e5 := FALSE;
  p_Description_61a75f3c90e5 := 'Treat this date as today when deciding which renewal orders are due a charge (YYYY-MM-DD). Omit for the business day, which is what the schedule uses. An unreadable value is refused rather than replaced with today.';
  p_IsRequired_61a75f3c90e5 := FALSE;
  p_LogValue_61a75f3c90e5 := TRUE;
  p_ActionID_61a75f3c90e5 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_61a75f3c90e5 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_61a75f3c90e5);
  IF p_ActionID_61a75f3c90e5 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_61a75f3c90e5
                  OR ("Name" = p_Name_61a75f3c90e5 AND "ActionID" = p_ActionID_61a75f3c90e5)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_61a75f3c90e5,
      'ActionID', p_ActionID_61a75f3c90e5,
      'Name', p_Name_61a75f3c90e5,
      'DefaultValue', p_DefaultValue_61a75f3c90e5,
      'Type', p_Type_61a75f3c90e5,
      'ValueType', p_ValueType_61a75f3c90e5,
      'IsArray', p_IsArray_61a75f3c90e5,
      'Description', p_Description_61a75f3c90e5,
      'IsRequired', p_IsRequired_61a75f3c90e5,
      'MediaModality', p_MediaModality_61a75f3c90e5,
      'LogValue', p_LogValue_61a75f3c90e5
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_61a75f3c90e5, p_ActionID := p_ActionID_61a75f3c90e5, p_Name := p_Name_61a75f3c90e5, p_DefaultValue := p_DefaultValue_61a75f3c90e5, p_DefaultValue_Clear := TRUE, p_Type := p_Type_61a75f3c90e5, p_ValueType := p_ValueType_61a75f3c90e5, p_IsArray := p_IsArray_61a75f3c90e5, p_Description := p_Description_61a75f3c90e5, p_IsRequired := p_IsRequired_61a75f3c90e5, p_MediaModality := p_MediaModality_61a75f3c90e5, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_61a75f3c90e5);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_5098d2f8a573 UUID;
  p_ActionID_5098d2f8a573 UUID;
  p_Name_5098d2f8a573 VARCHAR(255);
  p_DefaultValue_5098d2f8a573 TEXT;
  p_Type_5098d2f8a573 CHAR(10);
  p_ValueType_5098d2f8a573 VARCHAR(30);
  p_IsArray_5098d2f8a573 BOOLEAN;
  p_Description_5098d2f8a573 TEXT;
  p_IsRequired_5098d2f8a573 BOOLEAN;
  p_MediaModality_5098d2f8a573 VARCHAR(20);
  p_LogValue_5098d2f8a573 BOOLEAN;
BEGIN
  p_ID_5098d2f8a573 := '7E14737F-319A-4A6E-B6DB-A24699325F23';
  p_ActionID_5098d2f8a573 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_5098d2f8a573 := 'SubscriptionID';
  p_Type_5098d2f8a573 := 'Input';
  p_ValueType_5098d2f8a573 := 'Scalar';
  p_IsArray_5098d2f8a573 := FALSE;
  p_Description_5098d2f8a573 := 'Restrict the pass to the renewal orders of one subscription, for a targeted retry or a test. Omit for every subscription with a renewal card.';
  p_IsRequired_5098d2f8a573 := FALSE;
  p_LogValue_5098d2f8a573 := TRUE;
  p_ActionID_5098d2f8a573 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_5098d2f8a573 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_5098d2f8a573);
  IF p_ActionID_5098d2f8a573 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_5098d2f8a573
                  OR ("Name" = p_Name_5098d2f8a573 AND "ActionID" = p_ActionID_5098d2f8a573)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_5098d2f8a573,
      'ActionID', p_ActionID_5098d2f8a573,
      'Name', p_Name_5098d2f8a573,
      'DefaultValue', p_DefaultValue_5098d2f8a573,
      'Type', p_Type_5098d2f8a573,
      'ValueType', p_ValueType_5098d2f8a573,
      'IsArray', p_IsArray_5098d2f8a573,
      'Description', p_Description_5098d2f8a573,
      'IsRequired', p_IsRequired_5098d2f8a573,
      'MediaModality', p_MediaModality_5098d2f8a573,
      'LogValue', p_LogValue_5098d2f8a573
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_5098d2f8a573, p_ActionID := p_ActionID_5098d2f8a573, p_Name := p_Name_5098d2f8a573, p_DefaultValue := p_DefaultValue_5098d2f8a573, p_DefaultValue_Clear := TRUE, p_Type := p_Type_5098d2f8a573, p_ValueType := p_ValueType_5098d2f8a573, p_IsArray := p_IsArray_5098d2f8a573, p_Description := p_Description_5098d2f8a573, p_IsRequired := p_IsRequired_5098d2f8a573, p_MediaModality := p_MediaModality_5098d2f8a573, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_5098d2f8a573);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_e163d275f53d UUID;
  p_ActionID_e163d275f53d UUID;
  p_Name_e163d275f53d VARCHAR(255);
  p_DefaultValue_e163d275f53d TEXT;
  p_Type_e163d275f53d CHAR(10);
  p_ValueType_e163d275f53d VARCHAR(30);
  p_IsArray_e163d275f53d BOOLEAN;
  p_Description_e163d275f53d TEXT;
  p_IsRequired_e163d275f53d BOOLEAN;
  p_MediaModality_e163d275f53d VARCHAR(20);
  p_LogValue_e163d275f53d BOOLEAN;
BEGIN
  p_ID_e163d275f53d := '8076E4BA-0E36-4B54-B000-1DC353004A4E';
  p_ActionID_e163d275f53d := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_e163d275f53d := 'Preview';
  p_Type_e163d275f53d := 'Input';
  p_ValueType_e163d275f53d := 'Scalar';
  p_IsArray_e163d275f53d := FALSE;
  p_Description_e163d275f53d := 'True reports what WOULD be charged and charges nothing; false (the default) charges. A value that is neither is refused rather than guessed.';
  p_IsRequired_e163d275f53d := FALSE;
  p_LogValue_e163d275f53d := TRUE;
  p_ActionID_e163d275f53d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_e163d275f53d THEN 0 ELSE 1 END LIMIT 1), p_ActionID_e163d275f53d);
  IF p_ActionID_e163d275f53d IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_e163d275f53d
                  OR ("Name" = p_Name_e163d275f53d AND "ActionID" = p_ActionID_e163d275f53d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_e163d275f53d,
      'ActionID', p_ActionID_e163d275f53d,
      'Name', p_Name_e163d275f53d,
      'DefaultValue', p_DefaultValue_e163d275f53d,
      'Type', p_Type_e163d275f53d,
      'ValueType', p_ValueType_e163d275f53d,
      'IsArray', p_IsArray_e163d275f53d,
      'Description', p_Description_e163d275f53d,
      'IsRequired', p_IsRequired_e163d275f53d,
      'MediaModality', p_MediaModality_e163d275f53d,
      'LogValue', p_LogValue_e163d275f53d
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_e163d275f53d, p_ActionID := p_ActionID_e163d275f53d, p_Name := p_Name_e163d275f53d, p_DefaultValue := p_DefaultValue_e163d275f53d, p_DefaultValue_Clear := TRUE, p_Type := p_Type_e163d275f53d, p_ValueType := p_ValueType_e163d275f53d, p_IsArray := p_IsArray_e163d275f53d, p_Description := p_Description_e163d275f53d, p_IsRequired := p_IsRequired_e163d275f53d, p_MediaModality := p_MediaModality_e163d275f53d, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_e163d275f53d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_bc525644cfc3 UUID;
  p_ActionID_bc525644cfc3 UUID;
  p_Name_bc525644cfc3 VARCHAR(255);
  p_DefaultValue_bc525644cfc3 TEXT;
  p_Type_bc525644cfc3 CHAR(10);
  p_ValueType_bc525644cfc3 VARCHAR(30);
  p_IsArray_bc525644cfc3 BOOLEAN;
  p_Description_bc525644cfc3 TEXT;
  p_IsRequired_bc525644cfc3 BOOLEAN;
  p_MediaModality_bc525644cfc3 VARCHAR(20);
  p_LogValue_bc525644cfc3 BOOLEAN;
BEGIN
  p_ID_bc525644cfc3 := '7EEE5BE9-3C06-41E4-9412-7524974F9011';
  p_ActionID_bc525644cfc3 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_bc525644cfc3 := 'MaxCount';
  p_Type_bc525644cfc3 := 'Input';
  p_ValueType_bc525644cfc3 := 'Scalar';
  p_IsArray_bc525644cfc3 := FALSE;
  p_Description_bc525644cfc3 := 'Cap on orders charged in one pass. Orders left over are charged on the next pass if the day is still a charge day. A value that is not a whole number of at least 1 is refused.';
  p_IsRequired_bc525644cfc3 := FALSE;
  p_LogValue_bc525644cfc3 := TRUE;
  p_ActionID_bc525644cfc3 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_bc525644cfc3 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_bc525644cfc3);
  IF p_ActionID_bc525644cfc3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_bc525644cfc3
                  OR ("Name" = p_Name_bc525644cfc3 AND "ActionID" = p_ActionID_bc525644cfc3)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_bc525644cfc3,
      'ActionID', p_ActionID_bc525644cfc3,
      'Name', p_Name_bc525644cfc3,
      'DefaultValue', p_DefaultValue_bc525644cfc3,
      'Type', p_Type_bc525644cfc3,
      'ValueType', p_ValueType_bc525644cfc3,
      'IsArray', p_IsArray_bc525644cfc3,
      'Description', p_Description_bc525644cfc3,
      'IsRequired', p_IsRequired_bc525644cfc3,
      'MediaModality', p_MediaModality_bc525644cfc3,
      'LogValue', p_LogValue_bc525644cfc3
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_bc525644cfc3, p_ActionID := p_ActionID_bc525644cfc3, p_Name := p_Name_bc525644cfc3, p_DefaultValue := p_DefaultValue_bc525644cfc3, p_DefaultValue_Clear := TRUE, p_Type := p_Type_bc525644cfc3, p_ValueType := p_ValueType_bc525644cfc3, p_IsArray := p_IsArray_bc525644cfc3, p_Description := p_Description_bc525644cfc3, p_IsRequired := p_IsRequired_bc525644cfc3, p_MediaModality := p_MediaModality_bc525644cfc3, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_bc525644cfc3);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_6e0db9355f9a UUID;
  p_ActionID_6e0db9355f9a UUID;
  p_Name_6e0db9355f9a VARCHAR(255);
  p_DefaultValue_6e0db9355f9a TEXT;
  p_Type_6e0db9355f9a CHAR(10);
  p_ValueType_6e0db9355f9a VARCHAR(30);
  p_IsArray_6e0db9355f9a BOOLEAN;
  p_Description_6e0db9355f9a TEXT;
  p_IsRequired_6e0db9355f9a BOOLEAN;
  p_MediaModality_6e0db9355f9a VARCHAR(20);
  p_LogValue_6e0db9355f9a BOOLEAN;
BEGIN
  p_ID_6e0db9355f9a := 'F1C5CF3B-F8EE-454A-A24F-FB7656BA5ED3';
  p_ActionID_6e0db9355f9a := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_6e0db9355f9a := 'Charged';
  p_Type_6e0db9355f9a := 'Output';
  p_ValueType_6e0db9355f9a := 'Scalar';
  p_IsArray_6e0db9355f9a := FALSE;
  p_Description_6e0db9355f9a := 'How many renewal orders this pass paid from the renewal card (or would, on a preview).';
  p_IsRequired_6e0db9355f9a := FALSE;
  p_LogValue_6e0db9355f9a := TRUE;
  p_ActionID_6e0db9355f9a := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_6e0db9355f9a THEN 0 ELSE 1 END LIMIT 1), p_ActionID_6e0db9355f9a);
  IF p_ActionID_6e0db9355f9a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_6e0db9355f9a
                  OR ("Name" = p_Name_6e0db9355f9a AND "ActionID" = p_ActionID_6e0db9355f9a)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_6e0db9355f9a,
      'ActionID', p_ActionID_6e0db9355f9a,
      'Name', p_Name_6e0db9355f9a,
      'DefaultValue', p_DefaultValue_6e0db9355f9a,
      'Type', p_Type_6e0db9355f9a,
      'ValueType', p_ValueType_6e0db9355f9a,
      'IsArray', p_IsArray_6e0db9355f9a,
      'Description', p_Description_6e0db9355f9a,
      'IsRequired', p_IsRequired_6e0db9355f9a,
      'MediaModality', p_MediaModality_6e0db9355f9a,
      'LogValue', p_LogValue_6e0db9355f9a
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_6e0db9355f9a, p_ActionID := p_ActionID_6e0db9355f9a, p_Name := p_Name_6e0db9355f9a, p_DefaultValue := p_DefaultValue_6e0db9355f9a, p_DefaultValue_Clear := TRUE, p_Type := p_Type_6e0db9355f9a, p_ValueType := p_ValueType_6e0db9355f9a, p_IsArray := p_IsArray_6e0db9355f9a, p_Description := p_Description_6e0db9355f9a, p_IsRequired := p_IsRequired_6e0db9355f9a, p_MediaModality := p_MediaModality_6e0db9355f9a, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_6e0db9355f9a);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_929f2c53bd46 UUID;
  p_ActionID_929f2c53bd46 UUID;
  p_Name_929f2c53bd46 VARCHAR(255);
  p_DefaultValue_929f2c53bd46 TEXT;
  p_Type_929f2c53bd46 CHAR(10);
  p_ValueType_929f2c53bd46 VARCHAR(30);
  p_IsArray_929f2c53bd46 BOOLEAN;
  p_Description_929f2c53bd46 TEXT;
  p_IsRequired_929f2c53bd46 BOOLEAN;
  p_MediaModality_929f2c53bd46 VARCHAR(20);
  p_LogValue_929f2c53bd46 BOOLEAN;
BEGIN
  p_ID_929f2c53bd46 := 'D3BB5FBE-EBEC-467A-A2B6-E6FA70164934';
  p_ActionID_929f2c53bd46 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_929f2c53bd46 := 'Failed';
  p_Type_929f2c53bd46 := 'Output';
  p_ValueType_929f2c53bd46 := 'Scalar';
  p_IsArray_929f2c53bd46 := FALSE;
  p_Description_929f2c53bd46 := 'How many charges the gateway declined or that needed the customer to authenticate.';
  p_IsRequired_929f2c53bd46 := FALSE;
  p_LogValue_929f2c53bd46 := TRUE;
  p_ActionID_929f2c53bd46 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_929f2c53bd46 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_929f2c53bd46);
  IF p_ActionID_929f2c53bd46 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_929f2c53bd46
                  OR ("Name" = p_Name_929f2c53bd46 AND "ActionID" = p_ActionID_929f2c53bd46)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_929f2c53bd46,
      'ActionID', p_ActionID_929f2c53bd46,
      'Name', p_Name_929f2c53bd46,
      'DefaultValue', p_DefaultValue_929f2c53bd46,
      'Type', p_Type_929f2c53bd46,
      'ValueType', p_ValueType_929f2c53bd46,
      'IsArray', p_IsArray_929f2c53bd46,
      'Description', p_Description_929f2c53bd46,
      'IsRequired', p_IsRequired_929f2c53bd46,
      'MediaModality', p_MediaModality_929f2c53bd46,
      'LogValue', p_LogValue_929f2c53bd46
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_929f2c53bd46, p_ActionID := p_ActionID_929f2c53bd46, p_Name := p_Name_929f2c53bd46, p_DefaultValue := p_DefaultValue_929f2c53bd46, p_DefaultValue_Clear := TRUE, p_Type := p_Type_929f2c53bd46, p_ValueType := p_ValueType_929f2c53bd46, p_IsArray := p_IsArray_929f2c53bd46, p_Description := p_Description_929f2c53bd46, p_IsRequired := p_IsRequired_929f2c53bd46, p_MediaModality := p_MediaModality_929f2c53bd46, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_929f2c53bd46);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_dd3fac23a280 UUID;
  p_ActionID_dd3fac23a280 UUID;
  p_Name_dd3fac23a280 VARCHAR(255);
  p_DefaultValue_dd3fac23a280 TEXT;
  p_Type_dd3fac23a280 CHAR(10);
  p_ValueType_dd3fac23a280 VARCHAR(30);
  p_IsArray_dd3fac23a280 BOOLEAN;
  p_Description_dd3fac23a280 TEXT;
  p_IsRequired_dd3fac23a280 BOOLEAN;
  p_MediaModality_dd3fac23a280 VARCHAR(20);
  p_LogValue_dd3fac23a280 BOOLEAN;
BEGIN
  p_ID_dd3fac23a280 := 'B3C436C0-CCB8-41DB-A108-32F2E9281A6B';
  p_ActionID_dd3fac23a280 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_dd3fac23a280 := 'Skipped';
  p_Type_dd3fac23a280 := 'Output';
  p_ValueType_dd3fac23a280 := 'Scalar';
  p_IsArray_dd3fac23a280 := FALSE;
  p_Description_dd3fac23a280 := 'How many renewal orders were looked at and not charged today, each with its reason in Attempts.';
  p_IsRequired_dd3fac23a280 := FALSE;
  p_LogValue_dd3fac23a280 := TRUE;
  p_ActionID_dd3fac23a280 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_dd3fac23a280 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_dd3fac23a280);
  IF p_ActionID_dd3fac23a280 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_dd3fac23a280
                  OR ("Name" = p_Name_dd3fac23a280 AND "ActionID" = p_ActionID_dd3fac23a280)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_dd3fac23a280,
      'ActionID', p_ActionID_dd3fac23a280,
      'Name', p_Name_dd3fac23a280,
      'DefaultValue', p_DefaultValue_dd3fac23a280,
      'Type', p_Type_dd3fac23a280,
      'ValueType', p_ValueType_dd3fac23a280,
      'IsArray', p_IsArray_dd3fac23a280,
      'Description', p_Description_dd3fac23a280,
      'IsRequired', p_IsRequired_dd3fac23a280,
      'MediaModality', p_MediaModality_dd3fac23a280,
      'LogValue', p_LogValue_dd3fac23a280
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_dd3fac23a280, p_ActionID := p_ActionID_dd3fac23a280, p_Name := p_Name_dd3fac23a280, p_DefaultValue := p_DefaultValue_dd3fac23a280, p_DefaultValue_Clear := TRUE, p_Type := p_Type_dd3fac23a280, p_ValueType := p_ValueType_dd3fac23a280, p_IsArray := p_IsArray_dd3fac23a280, p_Description := p_Description_dd3fac23a280, p_IsRequired := p_IsRequired_dd3fac23a280, p_MediaModality := p_MediaModality_dd3fac23a280, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_dd3fac23a280);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_00be64c1d523 UUID;
  p_ActionID_00be64c1d523 UUID;
  p_Name_00be64c1d523 VARCHAR(255);
  p_DefaultValue_00be64c1d523 TEXT;
  p_Type_00be64c1d523 CHAR(10);
  p_ValueType_00be64c1d523 VARCHAR(30);
  p_IsArray_00be64c1d523 BOOLEAN;
  p_Description_00be64c1d523 TEXT;
  p_IsRequired_00be64c1d523 BOOLEAN;
  p_MediaModality_00be64c1d523 VARCHAR(20);
  p_LogValue_00be64c1d523 BOOLEAN;
BEGIN
  p_ID_00be64c1d523 := '835B2418-7D58-48D3-9B48-CAC177D63EB0';
  p_ActionID_00be64c1d523 := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_00be64c1d523 := 'Attempts';
  p_Type_00be64c1d523 := 'Output';
  p_ValueType_00be64c1d523 := 'Scalar';
  p_IsArray_00be64c1d523 := TRUE;
  p_Description_00be64c1d523 := 'Every renewal order looked at: the subscription, the amount, the due day, the attempt number, the outcome, the reason, the intent and payment, and the next attempt day after a failure.';
  p_IsRequired_00be64c1d523 := FALSE;
  p_LogValue_00be64c1d523 := TRUE;
  p_ActionID_00be64c1d523 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_00be64c1d523 THEN 0 ELSE 1 END LIMIT 1), p_ActionID_00be64c1d523);
  IF p_ActionID_00be64c1d523 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_00be64c1d523
                  OR ("Name" = p_Name_00be64c1d523 AND "ActionID" = p_ActionID_00be64c1d523)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_00be64c1d523,
      'ActionID', p_ActionID_00be64c1d523,
      'Name', p_Name_00be64c1d523,
      'DefaultValue', p_DefaultValue_00be64c1d523,
      'Type', p_Type_00be64c1d523,
      'ValueType', p_ValueType_00be64c1d523,
      'IsArray', p_IsArray_00be64c1d523,
      'Description', p_Description_00be64c1d523,
      'IsRequired', p_IsRequired_00be64c1d523,
      'MediaModality', p_MediaModality_00be64c1d523,
      'LogValue', p_LogValue_00be64c1d523
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_00be64c1d523, p_ActionID := p_ActionID_00be64c1d523, p_Name := p_Name_00be64c1d523, p_DefaultValue := p_DefaultValue_00be64c1d523, p_DefaultValue_Clear := TRUE, p_Type := p_Type_00be64c1d523, p_ValueType := p_ValueType_00be64c1d523, p_IsArray := p_IsArray_00be64c1d523, p_Description := p_Description_00be64c1d523, p_IsRequired := p_IsRequired_00be64c1d523, p_MediaModality := p_MediaModality_00be64c1d523, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_00be64c1d523);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_8c5ee38fa6ca UUID;
  p_ActionID_8c5ee38fa6ca UUID;
  p_Name_8c5ee38fa6ca VARCHAR(255);
  p_DefaultValue_8c5ee38fa6ca TEXT;
  p_Type_8c5ee38fa6ca CHAR(10);
  p_ValueType_8c5ee38fa6ca VARCHAR(30);
  p_IsArray_8c5ee38fa6ca BOOLEAN;
  p_Description_8c5ee38fa6ca TEXT;
  p_IsRequired_8c5ee38fa6ca BOOLEAN;
  p_MediaModality_8c5ee38fa6ca VARCHAR(20);
  p_LogValue_8c5ee38fa6ca BOOLEAN;
BEGIN
  p_ID_8c5ee38fa6ca := '3EDF6AE9-D3FC-4ACD-8794-C36DADA352E4';
  p_ActionID_8c5ee38fa6ca := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_8c5ee38fa6ca := 'Failures';
  p_Type_8c5ee38fa6ca := 'Output';
  p_ValueType_8c5ee38fa6ca := 'Scalar';
  p_IsArray_8c5ee38fa6ca := TRUE;
  p_Description_8c5ee38fa6ca := 'Orders whose attempt hit a fault, with the error. The rest of the pass stands.';
  p_IsRequired_8c5ee38fa6ca := FALSE;
  p_LogValue_8c5ee38fa6ca := TRUE;
  p_ActionID_8c5ee38fa6ca := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_8c5ee38fa6ca THEN 0 ELSE 1 END LIMIT 1), p_ActionID_8c5ee38fa6ca);
  IF p_ActionID_8c5ee38fa6ca IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_8c5ee38fa6ca
                  OR ("Name" = p_Name_8c5ee38fa6ca AND "ActionID" = p_ActionID_8c5ee38fa6ca)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_8c5ee38fa6ca,
      'ActionID', p_ActionID_8c5ee38fa6ca,
      'Name', p_Name_8c5ee38fa6ca,
      'DefaultValue', p_DefaultValue_8c5ee38fa6ca,
      'Type', p_Type_8c5ee38fa6ca,
      'ValueType', p_ValueType_8c5ee38fa6ca,
      'IsArray', p_IsArray_8c5ee38fa6ca,
      'Description', p_Description_8c5ee38fa6ca,
      'IsRequired', p_IsRequired_8c5ee38fa6ca,
      'MediaModality', p_MediaModality_8c5ee38fa6ca,
      'LogValue', p_LogValue_8c5ee38fa6ca
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_8c5ee38fa6ca, p_ActionID := p_ActionID_8c5ee38fa6ca, p_Name := p_Name_8c5ee38fa6ca, p_DefaultValue := p_DefaultValue_8c5ee38fa6ca, p_DefaultValue_Clear := TRUE, p_Type := p_Type_8c5ee38fa6ca, p_ValueType := p_ValueType_8c5ee38fa6ca, p_IsArray := p_IsArray_8c5ee38fa6ca, p_Description := p_Description_8c5ee38fa6ca, p_IsRequired := p_IsRequired_8c5ee38fa6ca, p_MediaModality := p_MediaModality_8c5ee38fa6ca, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_8c5ee38fa6ca);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Params (core SP call only)
DO $mj$
DECLARE
  p_ID_46774af1879b UUID;
  p_ActionID_46774af1879b UUID;
  p_Name_46774af1879b VARCHAR(255);
  p_DefaultValue_46774af1879b TEXT;
  p_Type_46774af1879b CHAR(10);
  p_ValueType_46774af1879b VARCHAR(30);
  p_IsArray_46774af1879b BOOLEAN;
  p_Description_46774af1879b TEXT;
  p_IsRequired_46774af1879b BOOLEAN;
  p_MediaModality_46774af1879b VARCHAR(20);
  p_LogValue_46774af1879b BOOLEAN;
BEGIN
  p_ID_46774af1879b := '8EEB8B32-30D7-47C7-B3C8-BBF7B85C9F47';
  p_ActionID_46774af1879b := '6FCFE3A6-7591-432F-8311-A5DF4EB12FB7';
  p_Name_46774af1879b := 'PreviewedOnly';
  p_Type_46774af1879b := 'Output';
  p_ValueType_46774af1879b := 'Scalar';
  p_IsArray_46774af1879b := FALSE;
  p_Description_46774af1879b := 'True when this pass reported its list and charged nothing. Not named Preview, so the input''s value is not overwritten.';
  p_IsRequired_46774af1879b := FALSE;
  p_LogValue_46774af1879b := TRUE;
  p_ActionID_46774af1879b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Charge Renewals' ORDER BY CASE WHEN "ID" = p_ActionID_46774af1879b THEN 0 ELSE 1 END LIMIT 1), p_ActionID_46774af1879b);
  IF p_ActionID_46774af1879b IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam"
               WHERE "ID" = p_ID_46774af1879b
                  OR ("Name" = p_Name_46774af1879b AND "ActionID" = p_ActionID_46774af1879b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionParam"(p_data := jsonb_build_object(
      'ID', p_ID_46774af1879b,
      'ActionID', p_ActionID_46774af1879b,
      'Name', p_Name_46774af1879b,
      'DefaultValue', p_DefaultValue_46774af1879b,
      'Type', p_Type_46774af1879b,
      'ValueType', p_ValueType_46774af1879b,
      'IsArray', p_IsArray_46774af1879b,
      'Description', p_Description_46774af1879b,
      'IsRequired', p_IsRequired_46774af1879b,
      'MediaModality', p_MediaModality_46774af1879b,
      'LogValue', p_LogValue_46774af1879b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionParam"(p_ID := p_ID_46774af1879b, p_ActionID := p_ActionID_46774af1879b, p_Name := p_Name_46774af1879b, p_DefaultValue := p_DefaultValue_46774af1879b, p_DefaultValue_Clear := TRUE, p_Type := p_Type_46774af1879b, p_ValueType := p_ValueType_46774af1879b, p_IsArray := p_IsArray_46774af1879b, p_Description := p_Description_46774af1879b, p_IsRequired := p_IsRequired_46774af1879b, p_MediaModality := p_MediaModality_46774af1879b, p_MediaModality_Clear := TRUE, p_LogValue := p_LogValue_46774af1879b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Scheduled Jobs (core SP call only)
DO $mj$
DECLARE
  p_ID_23145f598e3e UUID;
  p_JobTypeID_23145f598e3e UUID;
  p_Name_23145f598e3e VARCHAR(200);
  p_Description_23145f598e3e TEXT;
  p_CronExpression_23145f598e3e VARCHAR(120);
  p_Timezone_23145f598e3e VARCHAR(64);
  p_StartAt_23145f598e3e TIMESTAMPTZ;
  p_EndAt_23145f598e3e TIMESTAMPTZ;
  p_Status_23145f598e3e VARCHAR(20);
  p_Configuration_23145f598e3e TEXT;
  p_OwnerUserID_23145f598e3e UUID;
  p_LastRunAt_23145f598e3e TIMESTAMPTZ;
  p_NextRunAt_23145f598e3e TIMESTAMPTZ;
  p_RunCount_23145f598e3e INTEGER;
  p_SuccessCount_23145f598e3e INTEGER;
  p_FailureCount_23145f598e3e INTEGER;
  p_NotifyOnSuccess_23145f598e3e BOOLEAN;
  p_NotifyOnFailure_23145f598e3e BOOLEAN;
  p_NotifyUserID_23145f598e3e UUID;
  p_NotifyViaEmail_23145f598e3e BOOLEAN;
  p_NotifyViaInApp_23145f598e3e BOOLEAN;
  p_LockToken_23145f598e3e UUID;
  p_LockedAt_23145f598e3e TIMESTAMPTZ;
  p_LockedByInstance_23145f598e3e VARCHAR(255);
  p_ExpectedCompletionAt_23145f598e3e TIMESTAMPTZ;
  p_ConcurrencyMode_23145f598e3e VARCHAR(20);
  p_RunImmediatelyIfNeverRun_23145f598e3e BOOLEAN;
  p_MaxRuntimeMinutes_23145f598e3e INTEGER;
  p_MissedRunPolicy_23145f598e3e VARCHAR(20);
BEGIN
  p_ID_23145f598e3e := '277BE2CD-3B9F-44C2-8995-7F623DF421B1';
  p_JobTypeID_23145f598e3e := '3B94DD43-E961-4D85-B7F4-B6783D748766';
  p_Name_23145f598e3e := 'Orders — Charge Renewals (daily)';
  p_Description_23145f598e3e := 'Charges the renewal card of renewal orders due a charge today, with retries on the RenewalChargeRetryDays setting until the access cutoff. Ships disabled and set to Preview: enable it, confirm the Attempts list on the run, then set Preview to false.';
  p_CronExpression_23145f598e3e := '0 15 3 * * *';
  p_Timezone_23145f598e3e := 'UTC';
  p_Status_23145f598e3e := 'Disabled';
  p_Configuration_23145f598e3e := '{"ActionID":"6FCFE3A6-7591-432F-8311-A5DF4EB12FB7","Params":[{"ActionParamID":"8076E4BA-0E36-4B54-B000-1DC353004A4E","ValueType":"Static","Value":"true"}]}';
  p_RunCount_23145f598e3e := 0;
  p_SuccessCount_23145f598e3e := 0;
  p_FailureCount_23145f598e3e := 0;
  p_NotifyOnSuccess_23145f598e3e := FALSE;
  p_NotifyOnFailure_23145f598e3e := TRUE;
  p_NotifyViaEmail_23145f598e3e := FALSE;
  p_NotifyViaInApp_23145f598e3e := TRUE;
  p_ConcurrencyMode_23145f598e3e := 'Skip';
  p_RunImmediatelyIfNeverRun_23145f598e3e := FALSE;
  p_MaxRuntimeMinutes_23145f598e3e := 30;
  p_MissedRunPolicy_23145f598e3e := 'RunOnce';
  IF p_JobTypeID_23145f598e3e IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ScheduledJob"
               WHERE "ID" = p_ID_23145f598e3e OR "Name" = p_Name_23145f598e3e) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateScheduledJob'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_data := jsonb_build_object(
      'ID', p_ID_23145f598e3e,
      'JobTypeID', p_JobTypeID_23145f598e3e,
      'Name', p_Name_23145f598e3e,
      'Description', p_Description_23145f598e3e,
      'CronExpression', p_CronExpression_23145f598e3e,
      'Timezone', p_Timezone_23145f598e3e,
      'StartAt', p_StartAt_23145f598e3e,
      'EndAt', p_EndAt_23145f598e3e,
      'Status', p_Status_23145f598e3e,
      'Configuration', p_Configuration_23145f598e3e,
      'OwnerUserID', p_OwnerUserID_23145f598e3e,
      'LastRunAt', p_LastRunAt_23145f598e3e,
      'NextRunAt', p_NextRunAt_23145f598e3e,
      'RunCount', p_RunCount_23145f598e3e,
      'SuccessCount', p_SuccessCount_23145f598e3e,
      'FailureCount', p_FailureCount_23145f598e3e,
      'NotifyOnSuccess', p_NotifyOnSuccess_23145f598e3e,
      'NotifyOnFailure', p_NotifyOnFailure_23145f598e3e,
      'NotifyUserID', p_NotifyUserID_23145f598e3e,
      'NotifyViaEmail', p_NotifyViaEmail_23145f598e3e,
      'NotifyViaInApp', p_NotifyViaInApp_23145f598e3e,
      'LockToken', p_LockToken_23145f598e3e,
      'LockedAt', p_LockedAt_23145f598e3e,
      'LockedByInstance', p_LockedByInstance_23145f598e3e,
      'ExpectedCompletionAt', p_ExpectedCompletionAt_23145f598e3e,
      'ConcurrencyMode', p_ConcurrencyMode_23145f598e3e,
      'RunImmediatelyIfNeverRun', p_RunImmediatelyIfNeverRun_23145f598e3e,
      'MaxRuntimeMinutes', p_MaxRuntimeMinutes_23145f598e3e,
      'MissedRunPolicy', p_MissedRunPolicy_23145f598e3e
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateScheduledJob"(p_ID := p_ID_23145f598e3e, p_JobTypeID := p_JobTypeID_23145f598e3e, p_Name := p_Name_23145f598e3e, p_Description := p_Description_23145f598e3e, p_CronExpression := p_CronExpression_23145f598e3e, p_Timezone := p_Timezone_23145f598e3e, p_StartAt := p_StartAt_23145f598e3e, p_StartAt_Clear := TRUE, p_EndAt := p_EndAt_23145f598e3e, p_EndAt_Clear := TRUE, p_Status := p_Status_23145f598e3e, p_Configuration := p_Configuration_23145f598e3e, p_OwnerUserID := p_OwnerUserID_23145f598e3e, p_OwnerUserID_Clear := TRUE, p_LastRunAt := p_LastRunAt_23145f598e3e, p_LastRunAt_Clear := TRUE, p_NextRunAt := p_NextRunAt_23145f598e3e, p_NextRunAt_Clear := TRUE, p_RunCount := p_RunCount_23145f598e3e, p_SuccessCount := p_SuccessCount_23145f598e3e, p_FailureCount := p_FailureCount_23145f598e3e, p_NotifyOnSuccess := p_NotifyOnSuccess_23145f598e3e, p_NotifyOnFailure := p_NotifyOnFailure_23145f598e3e, p_NotifyUserID := p_NotifyUserID_23145f598e3e, p_NotifyUserID_Clear := TRUE, p_NotifyViaEmail := p_NotifyViaEmail_23145f598e3e, p_NotifyViaInApp := p_NotifyViaInApp_23145f598e3e, p_LockToken := p_LockToken_23145f598e3e, p_LockToken_Clear := TRUE, p_LockedAt := p_LockedAt_23145f598e3e, p_LockedAt_Clear := TRUE, p_LockedByInstance := p_LockedByInstance_23145f598e3e, p_LockedByInstance_Clear := TRUE, p_ExpectedCompletionAt := p_ExpectedCompletionAt_23145f598e3e, p_ExpectedCompletionAt_Clear := TRUE, p_ConcurrencyMode := p_ConcurrencyMode_23145f598e3e, p_RunImmediatelyIfNeverRun := p_RunImmediatelyIfNeverRun_23145f598e3e, p_MaxRuntimeMinutes := p_MaxRuntimeMinutes_23145f598e3e, p_MissedRunPolicy := p_MissedRunPolicy_23145f598e3e);
    END IF;
  END IF;
END $mj$;

-- Save MJ_BizApps_Tasks: Task Types (core SP call only)
DO $mj$
DECLARE
  p_Name_794ce786f46d VARCHAR(100);
  p_Description_794ce786f46d TEXT;
  p_IconClass_794ce786f46d VARCHAR(100);
  p_DefaultPriority_794ce786f46d VARCHAR(20);
  p_OnAssignActionID_794ce786f46d UUID;
  p_OnCompleteActionID_794ce786f46d UUID;
  p_OnOverdueActionID_794ce786f46d UUID;
  p_OnPercentChangeActionID_794ce786f46d UUID;
  p_IsActive_794ce786f46d BOOLEAN;
  p_OnRejectActionID_794ce786f46d UUID;
  p_OnCancelActionID_794ce786f46d UUID;
  p_Code_794ce786f46d VARCHAR(50);
  p_OnCreateActionID_794ce786f46d UUID;
  p_OnStatusChangeActionID_794ce786f46d UUID;
  p_IsApproval_794ce786f46d BOOLEAN;
  p_ID_794ce786f46d UUID;
BEGIN
  p_Name_794ce786f46d := 'Access Override Approval';
  p_Description_794ce786f46d := 'Approve or reject an exception to payment-gated access on an order. Closing the task applies the decision to the override.';
  p_IconClass_794ce786f46d := 'fa-solid fa-unlock-keyhole';
  p_DefaultPriority_794ce786f46d := 'High';
  p_OnAssignActionID_794ce786f46d := '1D6ADFBD-D936-4014-9C3E-C1BBF6ED9B96';
  p_OnCompleteActionID_794ce786f46d := '442E3FEA-1838-42F9-AE34-72BB4E79C833';
  p_IsActive_794ce786f46d := TRUE;
  p_OnRejectActionID_794ce786f46d := '442E3FEA-1838-42F9-AE34-72BB4E79C833';
  p_OnCancelActionID_794ce786f46d := '442E3FEA-1838-42F9-AE34-72BB4E79C833';
  p_Code_794ce786f46d := 'ORDERS_ACCESS_OVERRIDE';
  p_IsApproval_794ce786f46d := TRUE;
  p_ID_794ce786f46d := 'B321B638-B3B2-4072-BB2B-053407D1D4DE';
  p_ID_794ce786f46d := COALESCE((SELECT "ID" FROM __mj_BizAppsTasks."TaskType" WHERE "Name" = 'Access Override Approval' ORDER BY CASE WHEN "ID" = p_ID_794ce786f46d THEN 0 ELSE 1 END LIMIT 1), p_ID_794ce786f46d);
  p_OnAssignActionID_794ce786f46d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Post Task Assignment to Teams' ORDER BY CASE WHEN "ID" = p_OnAssignActionID_794ce786f46d THEN 0 ELSE 1 END LIMIT 1), p_OnAssignActionID_794ce786f46d);
  p_OnCompleteActionID_794ce786f46d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Apply Access Override Decision' ORDER BY CASE WHEN "ID" = p_OnCompleteActionID_794ce786f46d THEN 0 ELSE 1 END LIMIT 1), p_OnCompleteActionID_794ce786f46d);
  p_OnRejectActionID_794ce786f46d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Apply Access Override Decision' ORDER BY CASE WHEN "ID" = p_OnRejectActionID_794ce786f46d THEN 0 ELSE 1 END LIMIT 1), p_OnRejectActionID_794ce786f46d);
  p_OnCancelActionID_794ce786f46d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Apply Access Override Decision' ORDER BY CASE WHEN "ID" = p_OnCancelActionID_794ce786f46d THEN 0 ELSE 1 END LIMIT 1), p_OnCancelActionID_794ce786f46d);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__mj_BizAppsTasks' AND p.proname = 'spUpdateTaskType'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM __mj_BizAppsTasks."spUpdateTaskType"(p_data := jsonb_build_object(
    'Name', p_Name_794ce786f46d,
    'Description', p_Description_794ce786f46d,
    'IconClass', p_IconClass_794ce786f46d,
    'DefaultPriority', p_DefaultPriority_794ce786f46d,
    'OnAssignActionID', p_OnAssignActionID_794ce786f46d,
    'OnCompleteActionID', p_OnCompleteActionID_794ce786f46d,
    'OnOverdueActionID', p_OnOverdueActionID_794ce786f46d,
    'OnPercentChangeActionID', p_OnPercentChangeActionID_794ce786f46d,
    'IsActive', p_IsActive_794ce786f46d,
    'OnRejectActionID', p_OnRejectActionID_794ce786f46d,
    'OnCancelActionID', p_OnCancelActionID_794ce786f46d,
    'Code', p_Code_794ce786f46d,
    'OnCreateActionID', p_OnCreateActionID_794ce786f46d,
    'OnStatusChangeActionID', p_OnStatusChangeActionID_794ce786f46d,
    'IsApproval', p_IsApproval_794ce786f46d,
    'ID', p_ID_794ce786f46d
  ));
  ELSE
    PERFORM __mj_BizAppsTasks."spUpdateTaskType"(p_Name := p_Name_794ce786f46d, p_Description := p_Description_794ce786f46d, p_IconClass := p_IconClass_794ce786f46d, p_DefaultPriority := p_DefaultPriority_794ce786f46d, p_OnAssignActionID := p_OnAssignActionID_794ce786f46d, p_OnCompleteActionID := p_OnCompleteActionID_794ce786f46d, p_OnOverdueActionID := p_OnOverdueActionID_794ce786f46d, p_OnOverdueActionID_Clear := TRUE, p_OnPercentChangeActionID := p_OnPercentChangeActionID_794ce786f46d, p_OnPercentChangeActionID_Clear := TRUE, p_IsActive := p_IsActive_794ce786f46d, p_OnRejectActionID := p_OnRejectActionID_794ce786f46d, p_OnCancelActionID := p_OnCancelActionID_794ce786f46d, p_Code := p_Code_794ce786f46d, p_OnCreateActionID := p_OnCreateActionID_794ce786f46d, p_OnCreateActionID_Clear := TRUE, p_OnStatusChangeActionID := p_OnStatusChangeActionID_794ce786f46d, p_OnStatusChangeActionID_Clear := TRUE, p_IsApproval := p_IsApproval_794ce786f46d, p_ID := p_ID_794ce786f46d);
  END IF;
END $mj$;

-- Save MJ_BizApps_Tasks: Task Types (core SP call only)
DO $mj$
DECLARE
  p_ID_275c0a6d648b UUID;
  p_Name_275c0a6d648b VARCHAR(100);
  p_Description_275c0a6d648b TEXT;
  p_IconClass_275c0a6d648b VARCHAR(100);
  p_DefaultPriority_275c0a6d648b VARCHAR(20);
  p_OnAssignActionID_275c0a6d648b UUID;
  p_OnCompleteActionID_275c0a6d648b UUID;
  p_OnOverdueActionID_275c0a6d648b UUID;
  p_OnPercentChangeActionID_275c0a6d648b UUID;
  p_IsActive_275c0a6d648b BOOLEAN;
  p_OnRejectActionID_275c0a6d648b UUID;
  p_OnCancelActionID_275c0a6d648b UUID;
  p_Code_275c0a6d648b VARCHAR(50);
  p_OnCreateActionID_275c0a6d648b UUID;
  p_OnStatusChangeActionID_275c0a6d648b UUID;
  p_IsApproval_275c0a6d648b BOOLEAN;
BEGIN
  p_ID_275c0a6d648b := '35D3CB53-1F39-411D-8624-A144E6995EE3';
  p_Name_275c0a6d648b := 'Concession Approval';
  p_Description_275c0a6d648b := 'Approve or reject a Pending concession on an order. The order cannot be confirmed, and its documents cannot be sent, until the concession is decided.';
  p_IconClass_275c0a6d648b := 'fa-solid fa-hand-holding-dollar';
  p_DefaultPriority_275c0a6d648b := 'High';
  p_OnAssignActionID_275c0a6d648b := '1D6ADFBD-D936-4014-9C3E-C1BBF6ED9B96';
  p_IsActive_275c0a6d648b := TRUE;
  p_Code_275c0a6d648b := 'ORDERS_CONCESSION_APPROVAL';
  p_IsApproval_275c0a6d648b := TRUE;
  p_OnAssignActionID_275c0a6d648b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "Name" = 'Post Task Assignment to Teams' ORDER BY CASE WHEN "ID" = p_OnAssignActionID_275c0a6d648b THEN 0 ELSE 1 END LIMIT 1), p_OnAssignActionID_275c0a6d648b);
  IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsTasks."TaskType" WHERE "ID" = p_ID_275c0a6d648b OR "Name" = p_Name_275c0a6d648b) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '__mj_BizAppsTasks' AND p.proname = 'spCreateTaskType'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_data := jsonb_build_object(
      'ID', p_ID_275c0a6d648b,
      'Name', p_Name_275c0a6d648b,
      'Description', p_Description_275c0a6d648b,
      'IconClass', p_IconClass_275c0a6d648b,
      'DefaultPriority', p_DefaultPriority_275c0a6d648b,
      'OnAssignActionID', p_OnAssignActionID_275c0a6d648b,
      'OnCompleteActionID', p_OnCompleteActionID_275c0a6d648b,
      'OnOverdueActionID', p_OnOverdueActionID_275c0a6d648b,
      'OnPercentChangeActionID', p_OnPercentChangeActionID_275c0a6d648b,
      'IsActive', p_IsActive_275c0a6d648b,
      'OnRejectActionID', p_OnRejectActionID_275c0a6d648b,
      'OnCancelActionID', p_OnCancelActionID_275c0a6d648b,
      'Code', p_Code_275c0a6d648b,
      'OnCreateActionID', p_OnCreateActionID_275c0a6d648b,
      'OnStatusChangeActionID', p_OnStatusChangeActionID_275c0a6d648b,
      'IsApproval', p_IsApproval_275c0a6d648b
    ));
    ELSE
      PERFORM __mj_BizAppsTasks."spCreateTaskType"(p_ID := p_ID_275c0a6d648b, p_Name := p_Name_275c0a6d648b, p_Description := p_Description_275c0a6d648b, p_IconClass := p_IconClass_275c0a6d648b, p_DefaultPriority := p_DefaultPriority_275c0a6d648b, p_OnAssignActionID := p_OnAssignActionID_275c0a6d648b, p_OnCompleteActionID := p_OnCompleteActionID_275c0a6d648b, p_OnCompleteActionID_Clear := TRUE, p_OnOverdueActionID := p_OnOverdueActionID_275c0a6d648b, p_OnOverdueActionID_Clear := TRUE, p_OnPercentChangeActionID := p_OnPercentChangeActionID_275c0a6d648b, p_OnPercentChangeActionID_Clear := TRUE, p_IsActive := p_IsActive_275c0a6d648b, p_OnRejectActionID := p_OnRejectActionID_275c0a6d648b, p_OnRejectActionID_Clear := TRUE, p_OnCancelActionID := p_OnCancelActionID_275c0a6d648b, p_OnCancelActionID_Clear := TRUE, p_Code := p_Code_275c0a6d648b, p_OnCreateActionID := p_OnCreateActionID_275c0a6d648b, p_OnCreateActionID_Clear := TRUE, p_OnStatusChangeActionID := p_OnStatusChangeActionID_275c0a6d648b, p_OnStatusChangeActionID_Clear := TRUE, p_IsApproval := p_IsApproval_275c0a6d648b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Queries (core SP call only)
DO $mj$
DECLARE
  p_Name_ff2d8095a8c2 VARCHAR(255);
  p_CategoryID_ff2d8095a8c2 UUID;
  p_UserQuestion_ff2d8095a8c2 TEXT;
  p_Description_ff2d8095a8c2 TEXT;
  p_SQL_ff2d8095a8c2 TEXT;
  p_TechnicalDescription_ff2d8095a8c2 TEXT;
  p_OriginalSQL_ff2d8095a8c2 TEXT;
  p_Feedback_ff2d8095a8c2 TEXT;
  p_Status_ff2d8095a8c2 VARCHAR(15);
  p_QualityRank_ff2d8095a8c2 INTEGER;
  p_ExecutionCostRank_ff2d8095a8c2 INTEGER;
  p_UsesTemplate_ff2d8095a8c2 BOOLEAN;
  p_AuditQueryRuns_ff2d8095a8c2 BOOLEAN;
  p_CacheEnabled_ff2d8095a8c2 BOOLEAN;
  p_CacheTTLMinutes_ff2d8095a8c2 INTEGER;
  p_CacheMaxSize_ff2d8095a8c2 INTEGER;
  p_EmbeddingVector_ff2d8095a8c2 TEXT;
  p_EmbeddingModelID_ff2d8095a8c2 UUID;
  p_CacheValidationSQL_ff2d8095a8c2 TEXT;
  p_SQLDialectID_ff2d8095a8c2 UUID;
  p_Reusable_ff2d8095a8c2 BOOLEAN;
  p_ExternalDataSourceID_ff2d8095a8c2 UUID;
  p_IsMaterialized_ff2d8095a8c2 BOOLEAN;
  p_ID_ff2d8095a8c2 UUID;
BEGIN
  p_Name_ff2d8095a8c2 := 'Overlapping Subscriptions';
  p_CategoryID_ff2d8095a8c2 := 'D6586F51-1F67-4F50-BA28-7DB8A98BD4D2';
  p_UserQuestion_ff2d8095a8c2 := 'Which holders have two live subscriptions covering the same product, or a band of it, over the same dates?';
  p_Description_ff2d8095a8c2 := 'Finance exception review (golive #279, type 5): pairs of live subscriptions for one holder whose terms overlap, for the same product, for two bands of one subscription family, or for products in the same category with the same subscription type where one has no family. Pairs whose later line acknowledged the overlap are flagged. Each overlap is billed and recognized twice unless one is cancelled. A review list: an overlap can be intended. Run at month end until the nightly exception check replaces it.';
  p_SQL_ff2d8095a8c2 := '-- Overlapping subscriptions for one holder. Finance exception review, golive #279 type 5.
--
-- Two live subscriptions covering the same holder for the same thing over the same dates each carry
-- their own receivable and their own revenue recognition, so the customer is billed twice unless
-- someone cancels one by hand. Booking does not always prevent it:
--
--   - SubscriptionType.ConcurrencyMode = AllowMultiple creates a second subscription on purpose.
--   - A different band of the same product is a different ProductID. Confirm refuses it when both
--     bands share a SubscriptionFamily, unless the line acknowledges the overlap; a product with no
--     family is not checked at all (golive #276).
--   - That lookup matches organization AND person exactly, so a subscription held by an
--     organization and one held by the same organization for a named person do not match.
--
-- This is a review list, not a verdict: an overlap can be intended. It lists pairs for finance to
-- confirm or correct at month end until the nightly exception check replaces it.
--
-- WHAT COUNTS AS THE SAME THING (MatchBasis):
--   SameProduct  - the same ProductID.
--   SameFamily   - different products with the same SubscriptionFamilyID: the catalog states they
--                  are bands of one offering.
--   SameCategory - different products in the same ProductCategory with the same SubscriptionType,
--                  where at least one has no family. This guesses at bands the catalog has not
--                  grouped yet, and can pair two unrelated products that share both, which is why it
--                  is labelled. Two products in DIFFERENT families are never paired this way: the
--                  catalog has said they are different offerings.
--
-- AN ACKNOWLEDGED OVERLAP IS LISTED, AND FLAGGED. LaterOverlapAcknowledged is the later
-- subscription''s order line AcknowledgesCoverageOverlap: the person who confirmed it was told both
-- would be billed and chose to run them alongside. It is still billed twice, so the pair stays on the
-- review list; the nightly exception check leaves acknowledged SameFamily pairs out.
-- LaterOverlapReason is the reason that line gives for running alongside.
--
-- WHAT COUNTS AS THE SAME HOLDER: the same HolderOrganizationID when both have one, and then either
-- the same BeneficiaryPersonID or no named person on one side; when neither has an organization, the
-- same BeneficiaryPersonID. Two DIFFERENT named people at one organization are two holders: an
-- organization buying the same membership for several staff gets one subscription per person on
-- purpose, and pairing them would report every seat against every other. An organization-held
-- subscription next to one held by the same organization for a named person is still a pair.
--
-- COVERAGE IS SubscriptionTerm, not Subscription.StartDate/EndDate. A term counts unless it is
-- Canceled or Lapsed; Completed terms count, because a past overlap was still billed twice. A
-- subscription counts unless it is Migrated.
--
-- A CANCELED SUBSCRIPTION IS NOT LEFT OUT. Cancelling marks the whole subscription Canceled at once
-- but stamps only the term it affects: a term cut short becomes Canceled (and drops out here), a term
-- ridden to its end becomes Completed, and later terms already booked stay as they were, still billed.
-- Leaving out every Canceled subscription would hide those, so the term status alone decides.
--
-- ONE ROW PER PAIR. The pair is ordered by creation, so LaterSubscription is the one the overlap
-- created and LaterOrderNumber is the order that booked it. OverlapStart/OverlapEnd span every
-- overlapping term of the pair.
--
-- LaterOverlappingTermsAmount IS AN UPPER BOUND: the full amount of every later term that overlaps,
-- not the overlapping part. A 1,200 annual term that overlaps by one month reports 1,200 at stake,
-- of which roughly 100 was billed twice.
--
-- DATE DIMENSION: the overlap. PeriodStart/PeriodEnd keep a pair whose overlap touches the window.
WITH live AS (
    SELECT
        s.ID,
        s.SubscriptionNumber,
        s.CompanyID,
        s.Company,
        s.ProductID,
        s.Product,
        p.ProductCategoryID,
        p.SubscriptionFamilyID,
        s.SubscriptionTypeID,
        s.HolderOrganizationID,
        s.HolderOrganization,
        s.BeneficiaryPersonID,
        s.BeneficiaryPerson,
        s.OrderLineID,
        s.Status,
        s.__mj_CreatedAt
    FROM [__mj_BizAppsOrders].vwSubscriptions s
    INNER JOIN [__mj_BizAppsOrders].Product p
            ON p.ID = s.ProductID
    WHERE s.Status <> N''Migrated''
      {% if CompanyID %}
      AND s.CompanyID = {{ CompanyID | sqlString }}
      {% endif %}
),
pairs AS (
    SELECT
        a.ID AS EarlierID,
        b.ID AS LaterID,
        CASE
            WHEN a.ProductID = b.ProductID THEN N''SameProduct''
            WHEN a.SubscriptionFamilyID = b.SubscriptionFamilyID THEN N''SameFamily''
            ELSE N''SameCategory''
        END AS MatchBasis
    FROM live a
    INNER JOIN live b
            ON b.ID <> a.ID
           AND (a.__mj_CreatedAt < b.__mj_CreatedAt
                OR (a.__mj_CreatedAt = b.__mj_CreatedAt AND a.ID < b.ID))
           AND (   (a.HolderOrganizationID IS NOT NULL AND a.HolderOrganizationID = b.HolderOrganizationID
                    AND (a.BeneficiaryPersonID IS NULL OR b.BeneficiaryPersonID IS NULL
                         OR a.BeneficiaryPersonID = b.BeneficiaryPersonID))
                OR (a.HolderOrganizationID IS NULL AND b.HolderOrganizationID IS NULL
                    AND a.BeneficiaryPersonID = b.BeneficiaryPersonID))
           AND (   a.ProductID = b.ProductID
                OR a.SubscriptionFamilyID = b.SubscriptionFamilyID
                OR (a.ProductCategoryID = b.ProductCategoryID
                    AND a.SubscriptionTypeID = b.SubscriptionTypeID
                    AND (a.SubscriptionFamilyID IS NULL OR b.SubscriptionFamilyID IS NULL)))
),
overlaps AS (
    SELECT
        pr.EarlierID,
        pr.LaterID,
        pr.MatchBasis,
        MIN(CASE WHEN ta.StartDate > tb.StartDate THEN ta.StartDate ELSE tb.StartDate END) AS OverlapStart,
        MAX(CASE WHEN ta.EndDate   < tb.EndDate   THEN ta.EndDate   ELSE tb.EndDate   END) AS OverlapEnd
    FROM pairs pr
    INNER JOIN [__mj_BizAppsOrders].SubscriptionTerm ta
            ON ta.SubscriptionID = pr.EarlierID
           AND ta.Status NOT IN (N''Canceled'', N''Lapsed'')
    INNER JOIN [__mj_BizAppsOrders].SubscriptionTerm tb
            ON tb.SubscriptionID = pr.LaterID
           AND tb.Status NOT IN (N''Canceled'', N''Lapsed'')
           AND tb.StartDate <= ta.EndDate
           AND ta.StartDate <= tb.EndDate
    GROUP BY pr.EarlierID, pr.LaterID, pr.MatchBasis
)
SELECT
    e.CompanyID,
    e.Company                     AS CompanyName,
    ov.MatchBasis,
    e.HolderOrganizationID,
    e.HolderOrganization          AS HolderOrganizationName,
    e.BeneficiaryPersonID,
    e.BeneficiaryPerson           AS BeneficiaryPersonName,
    ov.OverlapStart,
    ov.OverlapEnd,
    e.ID                          AS EarlierSubscriptionID,
    e.SubscriptionNumber          AS EarlierSubscriptionNumber,
    e.Product                     AS EarlierProductName,
    e.Status                      AS EarlierStatus,
    eo.OrderNumber                AS EarlierOrderNumber,
    l.ID                          AS LaterSubscriptionID,
    l.SubscriptionNumber          AS LaterSubscriptionNumber,
    l.Product                     AS LaterProductName,
    l.Status                      AS LaterStatus,
    lo.ID                         AS LaterOrderHeaderID,
    lo.OrderNumber                AS LaterOrderNumber,
    lo.ConfirmedAt                AS LaterOrderConfirmedAt,
    CAST(COALESCE(lol.AcknowledgesCoverageOverlap, 0) AS BIT) AS LaterOverlapAcknowledged,
    lol.CoverageOverlapReason     AS LaterOverlapReason,
    amt.LaterOverlappingTermsAmount
FROM overlaps ov
INNER JOIN live e ON e.ID = ov.EarlierID
INNER JOIN live l ON l.ID = ov.LaterID
-- Summed per later TERM, not per overlapping term pair: a later term that overlaps two earlier
-- terms is counted once.
OUTER APPLY (
    SELECT SUM(tb.Amount) AS LaterOverlappingTermsAmount
    FROM [__mj_BizAppsOrders].SubscriptionTerm tb
    WHERE tb.SubscriptionID = ov.LaterID
      AND tb.Status NOT IN (N''Canceled'', N''Lapsed'')
      AND EXISTS (
          SELECT 1
          FROM [__mj_BizAppsOrders].SubscriptionTerm ta
          WHERE ta.SubscriptionID = ov.EarlierID
            AND ta.Status NOT IN (N''Canceled'', N''Lapsed'')
            AND tb.StartDate <= ta.EndDate
            AND ta.StartDate <= tb.EndDate)
) amt
LEFT JOIN [__mj_BizAppsOrders].OrderLine eol ON eol.ID = e.OrderLineID
LEFT JOIN [__mj_BizAppsOrders].OrderHeader eo ON eo.ID = eol.OrderHeaderID
LEFT JOIN [__mj_BizAppsOrders].OrderLine lol ON lol.ID = l.OrderLineID
LEFT JOIN [__mj_BizAppsOrders].OrderHeader lo ON lo.ID = lol.OrderHeaderID
WHERE 1 = 1
  {% if PeriodStart %}
  AND ov.OverlapEnd >= {{ PeriodStart | sqlString }}
  {% endif %}
  {% if PeriodEnd %}
  AND ov.OverlapStart <= {{ PeriodEnd | sqlString }}
  {% endif %}
ORDER BY
    e.Company, e.HolderOrganization, e.BeneficiaryPerson, ov.OverlapStart;
';
  p_TechnicalDescription_ff2d8095a8c2 := 'Grain: subscription pair, ordered by creation so the later one is the subscription the overlap created. Coverage is SubscriptionTerm (excluding Canceled and Lapsed terms) over subscriptions that are not Migrated. A Canceled subscription is kept: cancelling stamps only the affected term (Canceled when cut short, Completed when ridden out), so later booked terms still bill and still count. Holder is the same HolderOrganizationID with the same BeneficiaryPersonID or none on one side (different named people at one organization are separate holders), else the same BeneficiaryPersonID when neither has an organization. LaterOverlappingTermsAmount is an upper bound: the full amount of each overlapping later term, not the overlapping part. MatchBasis is SameProduct, SameFamily (same Product.SubscriptionFamilyID, different ProductID) or SameCategory (same ProductCategoryID and SubscriptionTypeID, different ProductID, at least one product with no family; products in different families are never paired). LaterOverlapAcknowledged is the later subscription''s OrderLine.AcknowledgesCoverageOverlap. LaterOverlapReason is that line''s CoverageOverlapReason. Date dimension: the overlap; optional PeriodStart/PeriodEnd keep pairs whose overlap touches the window. Optional CompanyID.';
  p_Status_ff2d8095a8c2 := 'Approved';
  p_QualityRank_ff2d8095a8c2 := 8;
  p_ExecutionCostRank_ff2d8095a8c2 := 3;
  p_UsesTemplate_ff2d8095a8c2 := TRUE;
  p_AuditQueryRuns_ff2d8095a8c2 := FALSE;
  p_CacheEnabled_ff2d8095a8c2 := FALSE;
  p_EmbeddingVector_ff2d8095a8c2 := '[0.028158584609627724,0.015946704894304276,-0.02127191238105297,-0.045956309884786606,0.008285751566290855,0.010852910578250885,0.05890471115708351,-0.018806731328368187,-0.04815613105893135,-0.017531592398881912,-0.008543558418750763,-0.04551428183913231,0.001408150652423501,0.07968965172767639,-0.07999889552593231,0.02935411036014557,-0.015568417496979237,-0.021473011001944542,0.011383268982172012,0.012411046773195267,0.022504722699522972,0.05418715626001358,-0.012129307724535465,-0.022295305505394936,0.026590367779135704,0.001217445358633995,-0.020782381296157837,0.004151626024395227,0.03914564847946167,-0.02092158794403076,0.059092383831739426,0.06526651978492737,-0.00003060216113226488,0.09015824645757675,0.000002239126615677378,-0.0015272407326847315,-0.05083499848842621,0.03905560076236725,-0.0031993803568184376,0.047532692551612854,-0.012807834893465042,0.02603565901517868,0.009427782148122787,-0.0035583588760346174,-0.02472275123000145,-0.017279233783483505,-0.05822589620947838,-0.03870941698551178,0.006464055273681879,-0.051017362624406815,0.013269716873764992,0.03463068976998329,-0.029478659853339195,0.002842244226485491,0.07992363721132278,-0.017384110018610954,0.016117781400680542,0.00065900495974347,0.022407855838537216,-0.049454204738140106,0.04678616672754288,-0.033966898918151855,-0.0024157464504241943,0.0004981517558917403,-0.03675442188978195,0.038308285176754,-0.01473371684551239,-0.03576810657978058,-0.01342154759913683,0.01509441900998354,0.02209983579814434,0.01944122277200222,0.042379602789878845,-0.006511160638183355,-0.026012014597654343,-0.014143116772174835,-0.032688722014427185,0.03957748785614967,0.009921026416122913,0.003688743570819497,-0.03280402719974518,0.04022963345050812,-0.015493352897465229,0.002714855596423149,-0.0799361914396286,0.007834965363144875,0.0072481767274439335,-0.010315484367311,0.01876409351825714,-0.007921519689261913,0.004218338057398796,-0.01327514834702015,0.0007329166983254254,-0.03497623652219772,-0.019556105136871338,-0.019496746361255646,-0.014007273130118847,-0.047388218343257904,0.01951255090534687,0.0046123540960252285,0.039165280759334564,0.008303849026560783,-0.009278010576963425,0.025540165603160858,0.03489596024155617,-0.03162355720996857,0.024666719138622284,-0.06812138110399246,-0.007499021012336016,0.06270427256822586,0.02832479029893875,0.007026348728686571,0.062186527997255325,0.04819854348897934,-0.03183341398835182,-0.031169932335615158,0.008181069977581501,-0.000317693775286898,-0.04545953869819641,0.027576033025979996,-0.004798518028110266,0.009666971862316132,-0.046053558588027954,0.0028546960093080997,0.0027119480073451996,-0.035238150507211685,-0.03177713230252266,-0.028255067765712738,0.024113573133945465,0.00382856372743845,0.01366785354912281,-0.0036340097431093454,0.041737474501132965,-0.023920074105262756,-0.02126501314342022,-0.10481274873018265,-0.01715245470404625,0.012262202799320221,0.03309138864278793,-0.026074226945638657,0.029093174263834953,0.013053412549197674,-0.04317231476306915,0.020710140466690063,0.043649036437273026,-0.03768281638622284,-0.027405837550759315,0.05212987959384918,0.017668312415480614,0.0014369566924870014,0.01186586357653141,0.025522686541080475,0.014081714674830437,0.007588363718241453,-0.033014751970767975,0.01573999412357807,0.0809829831123352,0.011527121998369694,-0.02780195139348507,-0.05255242809653282,-0.007780272047966719,0.01267088670283556,-0.007133690174669027,-0.023434340953826904,-0.01250128261744976,-0.03494187816977501,-0.0446145161986351,-0.014234321191906929,-0.08841706812381744,-0.0032184317242354155,0.006708918604999781,0.016411615535616875,-0.04389709234237671,-0.04502367973327637,0.005108869634568691,-0.044152650982141495,-0.015456297434866428,0.04096934199333191,-0.05176202580332756,-0.02457188256084919,-0.053657736629247665,-0.019093051552772522,0.006309916265308857,-0.03498823195695877,-0.008442510850727558,-0.029831690713763237,0.016494333744049072,-0.04876047745347023,-0.027882300317287445,0.03436068817973137,-0.013252082280814648,-0.02629467286169529,0.02105533704161644,0.0032284315675497055,-0.011289934627711773,-0.05685024335980415,0.018885144963860512,0.017803650349378586,0.010445020161569118,0.006327814422547817,-0.019753435626626015,-0.036553822457790375,0.0012899335706606507,0.04269098863005638,0.034766439348459244,-0.015933023765683174,-0.0740044042468071,0.004632609896361828,-0.028241608291864395,0.03915960714221001,0.01292223297059536,0.009952978231012821,-0.02620049938559532,-0.033373527228832245,-0.004853780847042799,-0.012890152633190155,0.02079317346215248,0.0817137137055397,-0.05935535952448845,0.015791751444339752,-0.02826172299683094,0.05013108253479004,0.0035118842497467995,-0.02090338245034218,-0.023643039166927338,0.03467181697487831,-0.010148470290005207,-0.028516806662082672,0.014619959518313408,-0.04269055649638176,-0.017630936577916145,-0.005481277592480183,0.041929636150598526,-0.0044112191535532475,0.01373417116701603,0.05671459063887596,0.0597376823425293,0.04566769301891327,-0.006830533966422081,-0.006184552330523729,-0.0004374168929643929,0.02404976449906826,0.0018400063272565603,0.024224748834967613,-0.04361236095428467,0.014086663722991943,-0.0413408987224102,0.0011626657797023654,0.015998180955648422,0.011974403634667397,-0.009509730152785778,0.02797662653028965,-0.01944006234407425,-0.010954052209854126,0.031063731759786606,-0.0593472383916378,-0.11320324242115021,0.005860981065779924,-0.010871762409806252,0.05368109047412872,-0.011718936264514923,-0.011408804915845394,-0.02450292371213436,-0.04428785294294357,0.009778889827430248,-0.015448379330337048,-0.023532196879386902,0.05377083644270897,0.03482774272561073,0.0244000144302845,0.03445718064904213,0.01781977154314518,-0.022826839238405228,0.029433678835630417,0.033566057682037354,0.030216876417398453,-0.12339886277914047,-0.01769106276333332,0.032972775399684906,-0.025527045130729675,0.004347859416157007,-0.03224079683423042,0.03435320779681206,-0.014549451880156994,0.008806408382952213,0.021032435819506645,0.012033358216285706,-0.05641468986868858,-0.0472123846411705,-0.12986747920513153,-0.015857264399528503,-0.040813058614730835,-0.019567761570215225,0.04444929584860802,-0.035182174295186996,-0.008628489449620247,-0.03898164629936218,0.06439704447984695,0.015486463904380798,0.04236432909965515,0.04499291256070137,-0.029148435220122337,-0.016612719744443893,0.0210550669580698,-0.005174066871404648,-0.025026969611644745,0.015640895813703537,0.03289302438497543,-0.04701749607920647,0.0134770842269063,-0.034937966614961624,0.0015640323981642723,0.01072248537093401,-0.0019652126356959343,0.010203802958130836,-0.06346213072538376,0.055430177599191666,-0.014940330758690834,-0.017576945945620537,0.11185853183269501,0.006655128672719002,0.019258592277765274,0.011241783387959003,0.040163539350032806,-0.037660956382751465,-0.019725730642676353,-0.010809697210788727,-0.01056962925940752,-0.07516118139028549,-0.06807504594326019,0.005392033141106367,-0.06226301193237305,-0.07976502925157547,-0.0214545801281929,-0.018742717802524567,0.0035333330743014812,-0.04448819160461426,0.04783444106578827,-0.029080839827656746,-0.006509510800242424,0.003966919146478176,0.012176643125712872,-0.006943264976143837,0.056291889399290085,0.03113979659974575,-0.01548235584050417,-0.025848668068647385,0.0024438397958874702,-0.08895505219697952,0.032904453575611115,-0.052912771701812744,0.02168440632522106,-0.008844541385769844,0.010313085280358791,-0.007374933920800686,-0.010230639018118382,-0.008454655297100544,0.02988472580909729,-0.030085666105151176,-0.06620967388153076,-0.07052484899759293,-0.02787907049059868,0.0669979453086853,0.06901344656944275,0.0295988991856575,0.037217311561107635,0.04355129972100258,-0.03765517845749855,-0.003588430816307664,-0.03515735641121864,-0.05561907961964607,0.006852069869637489,0.01812570169568062,0.04143049567937851,0.03769579529762268,-0.06241463124752045,0.0024255821481347084,-0.029525039717555046,0.06163820996880531,-0.0028941596392542124,0.004540605470538139,-0.02220452018082142,0.08574704080820084,0.0006374079966917634,0.006183756981045008,0.0208161398768425,-0.03938022255897522,-0.07255209982395172,-0.04528224095702171,-0.026492560282349586,0.02089579775929451,0.042493145912885666,-0.005181885324418545,0.05561147630214691,-0.0051396009512245655,0.0221073217689991,0.030011381953954697,-0.0018767411820590496,0.005882855039089918,0.018448829650878906,-0.01265415083616972,-0.0000034405670703563374,0.022957315668463707,0.023943083360791206,0.03898569568991661,-0.05181941017508507,-0.034691352397203445,-0.024426370859146118,-0.031524013727903366,0.008593859151005745,0.0065220934338867664,-0.13083183765411377,0.022985946387052536,0.004272108897566795,-0.0049294885247945786,0.004149952437728643,0.027918409556150436,-0.00922581646591425,0.037253230810165405,-0.03537197783589363,-0.0077306353487074375,-0.005332744214683771,0.027890510857105255,0.0004478728224057704,-0.04714183881878853,-0.02316662110388279,0.05848317965865135,-0.03944848105311394,0.02840219996869564,0.004389967769384384,-0.022217117249965668,-0.004649573937058449,0.04383261874318123,0.030508454889059067,-0.034607209265232086,0.03793816268444061,0.044478047639131546,0.053464606404304504,-0.10464789718389511,-0.002238872926682234,0.01889548823237419,-0.01887580379843712,0.0643930435180664,-0.02577495574951172,0.020022397860884666,0.0022436974104493856,-0.005971540231257677,0.07047076523303986,-0.03027418628334999,0.04494226723909378,-0.019831327721476555,-0.03798834607005119,0.04571205750107765,-0.07394325733184814,0.05457199364900589,-0.058267414569854736,-0.004435019567608833,-0.07099681347608566,-0.0406949445605278,0.0060592335648834705,-0.06524825096130371,0.037344299256801605,0.03196185082197189,0.0019307303009554744,0.019546939060091972,-0.08089333772659302,0.05731670558452606,0.04743587598204613,0.026625771075487137,0.010922647081315517,-0.01758756674826145,0.007805090397596359,0.008696428500115871,-0.02792328968644142,0.011867080815136433,-0.033253468573093414,-0.0032246026676148176,0.0161167923361063,0.00934829842299223,0.0017916640499606729,-0.0032295596320182085,-0.03424264118075371,0.03479738160967827,-0.006148464512079954,-0.0036954786628484726,0.037202075123786926,0.011007028631865978,0.035517651587724686,-0.024653801694512367,-0.03378462791442871,-0.0076773762702941895,-0.032792266458272934,0.003988321404904127,0.11426397413015366,0.01294517982751131,0.00046849396312609315,0.04331005737185478,-0.051258597522974014,-0.012992589734494686,0.012278375215828419,-0.018432175740599632,-0.019039908424019814,-0.0014302211347967386,0.003168402938172221,-0.010449270717799664,0.022581681609153748,0.015385099686682224,-0.007130051497370005,0.036302387714385986,-0.0124465711414814,0.011912724003195763,-0.0003574510628823191,0.010549874044954777,0.013391577638685703,0.03075554035604,-0.013985780999064445,-0.030936911702156067,0.01668127067387104,0.043260686099529266,0.008731958456337452,0.005727661307901144,0.0009832113282755017,0.06784854084253311,-0.00974221620708704,0.035483065992593765,-0.02223014459013939,0.06475353240966797,-0.009327453561127186,-0.00512436218559742,0.08681100606918335,0.08640609681606293,-0.02323295921087265,-0.01663467101752758,0.02866407111287117,0.025393305346369743,-0.039284318685531616,-0.08140436559915543,-0.01669313944876194,0.002776640234515071,-0.0037205282133072615,-0.03075532242655754,0.03308172523975372,0.07377485930919647,-0.014129949733614922,0.024859724566340446,-0.027848053723573685,0.007027477957308292,0.00488894572481513,-0.02401772141456604,0.026745976880192757,0.08759307116270065,0.03310081362724304,-0.018106594681739807,-0.015720076858997345,0.027358287945389748,-7.713466829769168e-33,-0.01697698049247265,-0.011844883672893047,-0.06107177212834358,-0.014765581116080284,-0.020877089351415634,0.019256705418229103,0.01041767094284296,-0.04079439118504524,0.013122021220624447,-0.027759985998272896,0.010349632240831852,0.01773848384618759,0.032584067434072495,-0.013494555838406086,0.04758534952998161,-0.035895805805921555,-0.0121874725446105,0.030638277530670166,0.007029029540717602,0.0367482528090477,-0.041973892599344254,0.025395745411515236,-0.049682389944791794,0.037294644862413406,-0.06600075960159302,-0.026955924928188324,0.041927140206098557,0.009337237104773521,-0.07377523183822632,0.0331270657479763,0.01357189193367958,-0.007457300089299679,0.004826121497899294,0.07774081826210022,-0.01779511198401451,-0.05070874094963074,-0.0027558128349483013,-0.030375342816114426,0.0007345874910242856,-0.04891600459814072,0.0016657976666465402,0.04373922571539879,0.02679259330034256,0.015241606160998344,0.0027752884197980165,-0.04384509101510048,0.02777288481593132,-0.021990325301885605,-0.07355204969644547,-0.01797800324857235,0.03369690477848053,0.0007340314914472401,-0.022280344739556313,0.06654281169176102,0.044801462441682816,0.026481693610548973,0.027778172865509987,0.1126692071557045,0.010028560645878315,0.014550973661243916,-0.05701979622244835,0.01392978336662054,-0.009021839126944542,-0.04135291650891304,-0.013808145187795162,0.02806168608367443,-0.14983752369880676,0.005494479555636644,0.018936678767204285,-0.03384847566485405,-0.02930428646504879,0.05459805950522423,-0.08405156433582306,0.007413372863084078,0.07582933455705643,0.05438598245382309,0.016364488750696182,0.02993161603808403,0.06283941864967346,-0.00015061897283885628,0.03209126740694046,-0.015613795258104801,0.018663160502910614,0.014475964941084385,0.01795138232409954,0.03500586375594139,-0.026064125820994377,-0.01632760651409626,0.01779506914317608,0.014059720560908318,0.021539097651839256,0.08254394680261612,-0.0573236346244812,0.008923974819481373,-0.11357860267162323,-0.04714769497513771,0.05331239476799965,-0.01604684442281723,-0.003448150120675564,0.03830734267830849,0.03117714822292328,-0.04977455735206604,0.018440265208482742,0.02912338450551033,0.0011029927991330624,-0.03188323974609375,0.08362605422735214,-0.016924191266298294,-0.0423760712146759,0.018750829622149467,0.046295009553432465,0.009364214725792408,-0.011667951941490173,0.003366392571479082,0.01950283907353878,-0.0030556581914424896,0.02567848190665245,0.018199210986495018,-0.0038836493622511625,0.0166460070759058,0.002131811110302806,0.020551247522234917,-0.038702595978975296,0.03680352494120598,-0.002316530328243971,-0.0011942788260057569,-0.03492317721247673,-0.09561466425657272,0.005124347284436226,0.011127350851893425,-0.005005574785172939,-0.020501505583524704,3.122568443814089e-7,0.03349582850933075,-0.01597694121301174,-0.028346143662929535,0.008460529148578644,0.07695844769477844,-0.0013243256835266948,-0.02696225792169571,0.04907416179776192,-0.012723784893751144,0.015501884743571281,0.010392099618911743,-0.039703164249658585,0.03217388316988945,0.023494284600019455,0.05173049122095108,0.011229105293750763,-0.039542343467473984,0.02613997459411621,-0.08346930146217346,-0.02665657550096512,0.06997551769018173,-0.04724340885877609,0.05124957859516144,0.01326538436114788,0.026617251336574554,-0.026644321158528328,0.0040567368268966675,-0.043071918189525604,-0.0279814675450325,-0.007738140877336264,-0.021014364436268806,-0.02101759798824787,0.0008076758240349591,0.01982234977185726,0.007215607445687056,0.03272396698594093,0.024186676368117332,0.008918317966163158,-0.006620813626796007,0.010038487613201141,0.06183868646621704,0.015059936791658401,-0.03252986818552017,0.00867804791778326,0.060655541718006134,-0.010321984998881817,-0.028970470651984215,-0.023746328428387642,-0.042611826211214066,-0.06502778083086014,-0.013412698172032833,0.028182310983538628,-0.01242528110742569,0.012829563580453396,0.011708380654454231,0.03705133870244026,0.03895741328597069,0.000049906011554412544,0.04779379814863205,0.021468108519911766,0.008992687799036503,-0.005202617961913347,-0.0018585941288620234,0.030047612264752388,-0.013897712342441082,-0.03580307960510254,-0.00031367040355689824,3.7413085480882223e-34,0.03463773801922798,0.06017475947737694,-0.0028683727141469717,0.007996802218258381,0.010302502661943436,0.008098983205854893,-0.008949019014835358,0.018105410039424896,-0.007336833514273167,-0.024350909516215324,-0.007467527873814106]';
  p_EmbeddingModelID_ff2d8095a8c2 := '1D45AA65-41EC-4572-9ECD-AB2826C9B059';
  p_SQLDialectID_ff2d8095a8c2 := '1F203987-A37B-4BC1-85B3-BA50DC33C3E0';
  p_Reusable_ff2d8095a8c2 := FALSE;
  p_IsMaterialized_ff2d8095a8c2 := FALSE;
  p_ID_ff2d8095a8c2 := '8DF27980-FE2C-4555-A481-27DD1C3285D3';
  p_ID_ff2d8095a8c2 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Query" WHERE "Name" = 'Overlapping Subscriptions' ORDER BY CASE WHEN "ID" = p_ID_ff2d8095a8c2 THEN 0 ELSE 1 END LIMIT 1), p_ID_ff2d8095a8c2);
  p_CategoryID_ff2d8095a8c2 := COALESCE((SELECT "ID" FROM "${mjSchema}"."QueryCategory" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_CategoryID_ff2d8095a8c2 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_ff2d8095a8c2);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateQuery'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateQuery"(p_data := jsonb_build_object(
    'Name', p_Name_ff2d8095a8c2,
    'CategoryID', p_CategoryID_ff2d8095a8c2,
    'UserQuestion', p_UserQuestion_ff2d8095a8c2,
    'Description', p_Description_ff2d8095a8c2,
    'SQL', p_SQL_ff2d8095a8c2,
    'TechnicalDescription', p_TechnicalDescription_ff2d8095a8c2,
    'OriginalSQL', p_OriginalSQL_ff2d8095a8c2,
    'Feedback', p_Feedback_ff2d8095a8c2,
    'Status', p_Status_ff2d8095a8c2,
    'QualityRank', p_QualityRank_ff2d8095a8c2,
    'ExecutionCostRank', p_ExecutionCostRank_ff2d8095a8c2,
    'UsesTemplate', p_UsesTemplate_ff2d8095a8c2,
    'AuditQueryRuns', p_AuditQueryRuns_ff2d8095a8c2,
    'CacheEnabled', p_CacheEnabled_ff2d8095a8c2,
    'CacheTTLMinutes', p_CacheTTLMinutes_ff2d8095a8c2,
    'CacheMaxSize', p_CacheMaxSize_ff2d8095a8c2,
    'EmbeddingVector', p_EmbeddingVector_ff2d8095a8c2,
    'EmbeddingModelID', p_EmbeddingModelID_ff2d8095a8c2,
    'CacheValidationSQL', p_CacheValidationSQL_ff2d8095a8c2,
    'SQLDialectID', p_SQLDialectID_ff2d8095a8c2,
    'Reusable', p_Reusable_ff2d8095a8c2,
    'ExternalDataSourceID', p_ExternalDataSourceID_ff2d8095a8c2,
    'IsMaterialized', p_IsMaterialized_ff2d8095a8c2,
    'ID', p_ID_ff2d8095a8c2
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateQuery"(p_Name := p_Name_ff2d8095a8c2, p_CategoryID := p_CategoryID_ff2d8095a8c2, p_UserQuestion := p_UserQuestion_ff2d8095a8c2, p_Description := p_Description_ff2d8095a8c2, p_SQL := p_SQL_ff2d8095a8c2, p_TechnicalDescription := p_TechnicalDescription_ff2d8095a8c2, p_OriginalSQL := p_OriginalSQL_ff2d8095a8c2, p_OriginalSQL_Clear := TRUE, p_Feedback := p_Feedback_ff2d8095a8c2, p_Feedback_Clear := TRUE, p_Status := p_Status_ff2d8095a8c2, p_QualityRank := p_QualityRank_ff2d8095a8c2, p_ExecutionCostRank := p_ExecutionCostRank_ff2d8095a8c2, p_UsesTemplate := p_UsesTemplate_ff2d8095a8c2, p_AuditQueryRuns := p_AuditQueryRuns_ff2d8095a8c2, p_CacheEnabled := p_CacheEnabled_ff2d8095a8c2, p_CacheTTLMinutes := p_CacheTTLMinutes_ff2d8095a8c2, p_CacheTTLMinutes_Clear := TRUE, p_CacheMaxSize := p_CacheMaxSize_ff2d8095a8c2, p_CacheMaxSize_Clear := TRUE, p_EmbeddingVector := p_EmbeddingVector_ff2d8095a8c2, p_EmbeddingModelID := p_EmbeddingModelID_ff2d8095a8c2, p_CacheValidationSQL := p_CacheValidationSQL_ff2d8095a8c2, p_CacheValidationSQL_Clear := TRUE, p_SQLDialectID := p_SQLDialectID_ff2d8095a8c2, p_Reusable := p_Reusable_ff2d8095a8c2, p_ExternalDataSourceID := p_ExternalDataSourceID_ff2d8095a8c2, p_ExternalDataSourceID_Clear := TRUE, p_IsMaterialized := p_IsMaterialized_ff2d8095a8c2, p_ID := p_ID_ff2d8095a8c2);
  END IF;
END $mj$;

-- Save MJ: Query Fields (core SP call only)
DO $mj$
DECLARE
  p_ID_dbcf6c530239 UUID;
  p_QueryID_dbcf6c530239 UUID;
  p_Name_dbcf6c530239 VARCHAR(255);
  p_Description_dbcf6c530239 TEXT;
  p_Sequence_dbcf6c530239 INTEGER;
  p_SQLBaseType_dbcf6c530239 VARCHAR(50);
  p_SQLFullType_dbcf6c530239 VARCHAR(100);
  p_SourceEntityID_dbcf6c530239 UUID;
  p_SourceFieldName_dbcf6c530239 VARCHAR(255);
  p_IsComputed_dbcf6c530239 BOOLEAN;
  p_ComputationDescription_dbcf6c530239 TEXT;
  p_IsSummary_dbcf6c530239 BOOLEAN;
  p_SummaryDescription_dbcf6c530239 TEXT;
  p_DetectionMethod_dbcf6c530239 VARCHAR(50);
  p_AutoDetectConfidenceScore_dbcf6c530239 NUMERIC(3,2);
BEGIN
  p_ID_dbcf6c530239 := 'f703ecb1-e2db-40a3-ab21-b9093f169ad2';
  p_QueryID_dbcf6c530239 := '8DF27980-FE2C-4555-A481-27DD1C3285D3';
  p_Name_dbcf6c530239 := 'LaterOverlapReason';
  p_Description_dbcf6c530239 := 'CoverageOverlapReason (aliased as LaterOverlapReason)';
  p_Sequence_dbcf6c530239 := 1;
  p_SQLBaseType_dbcf6c530239 := 'nvarchar';
  p_SQLFullType_dbcf6c530239 := 'nvarchar(1000)';
  p_SourceEntityID_dbcf6c530239 := '66D82C24-9C9F-4CD6-B019-53C20274AB00';
  p_SourceFieldName_dbcf6c530239 := 'CoverageOverlapReason';
  p_IsComputed_dbcf6c530239 := FALSE;
  p_IsSummary_dbcf6c530239 := FALSE;
  p_DetectionMethod_dbcf6c530239 := 'Manual';
  p_QueryID_dbcf6c530239 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Query" WHERE "Name" = 'Overlapping Subscriptions' ORDER BY CASE WHEN "ID" = p_QueryID_dbcf6c530239 THEN 0 ELSE 1 END LIMIT 1), p_QueryID_dbcf6c530239);
  p_SourceEntityID_dbcf6c530239 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Order Lines' ORDER BY CASE WHEN "ID" = p_SourceEntityID_dbcf6c530239 THEN 0 ELSE 1 END LIMIT 1), p_SourceEntityID_dbcf6c530239);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."QueryField"
               WHERE "ID" = p_ID_dbcf6c530239
                  OR ("QueryID" = p_QueryID_dbcf6c530239 AND "Name" = p_Name_dbcf6c530239)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateQueryField'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateQueryField"(p_data := jsonb_build_object(
      'ID', p_ID_dbcf6c530239,
      'QueryID', p_QueryID_dbcf6c530239,
      'Name', p_Name_dbcf6c530239,
      'Description', p_Description_dbcf6c530239,
      'Sequence', p_Sequence_dbcf6c530239,
      'SQLBaseType', p_SQLBaseType_dbcf6c530239,
      'SQLFullType', p_SQLFullType_dbcf6c530239,
      'SourceEntityID', p_SourceEntityID_dbcf6c530239,
      'SourceFieldName', p_SourceFieldName_dbcf6c530239,
      'IsComputed', p_IsComputed_dbcf6c530239,
      'ComputationDescription', p_ComputationDescription_dbcf6c530239,
      'IsSummary', p_IsSummary_dbcf6c530239,
      'SummaryDescription', p_SummaryDescription_dbcf6c530239,
      'DetectionMethod', p_DetectionMethod_dbcf6c530239,
      'AutoDetectConfidenceScore', p_AutoDetectConfidenceScore_dbcf6c530239
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateQueryField"(p_ID := p_ID_dbcf6c530239, p_QueryID := p_QueryID_dbcf6c530239, p_Name := p_Name_dbcf6c530239, p_Description := p_Description_dbcf6c530239, p_Sequence := p_Sequence_dbcf6c530239, p_SQLBaseType := p_SQLBaseType_dbcf6c530239, p_SQLFullType := p_SQLFullType_dbcf6c530239, p_SourceEntityID := p_SourceEntityID_dbcf6c530239, p_SourceFieldName := p_SourceFieldName_dbcf6c530239, p_IsComputed := p_IsComputed_dbcf6c530239, p_ComputationDescription := p_ComputationDescription_dbcf6c530239, p_ComputationDescription_Clear := TRUE, p_IsSummary := p_IsSummary_dbcf6c530239, p_SummaryDescription := p_SummaryDescription_dbcf6c530239, p_SummaryDescription_Clear := TRUE, p_DetectionMethod := p_DetectionMethod_dbcf6c530239, p_AutoDetectConfidenceScore := p_AutoDetectConfidenceScore_dbcf6c530239, p_AutoDetectConfidenceScore_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Query Fields (core SP call only)
DO $mj$
DECLARE
  p_QueryID_246757e60626 UUID;
  p_Name_246757e60626 VARCHAR(255);
  p_Description_246757e60626 TEXT;
  p_Sequence_246757e60626 INTEGER;
  p_SQLBaseType_246757e60626 VARCHAR(50);
  p_SQLFullType_246757e60626 VARCHAR(100);
  p_SourceEntityID_246757e60626 UUID;
  p_SourceFieldName_246757e60626 VARCHAR(255);
  p_IsComputed_246757e60626 BOOLEAN;
  p_ComputationDescription_246757e60626 TEXT;
  p_IsSummary_246757e60626 BOOLEAN;
  p_SummaryDescription_246757e60626 TEXT;
  p_DetectionMethod_246757e60626 VARCHAR(50);
  p_AutoDetectConfidenceScore_246757e60626 NUMERIC(3,2);
  p_ID_246757e60626 UUID;
BEGIN
  p_QueryID_246757e60626 := '8DF27980-FE2C-4555-A481-27DD1C3285D3';
  p_Name_246757e60626 := 'LaterOverlappingTermsAmount';
  p_Description_246757e60626 := 'LaterOverlappingTermsAmount';
  p_Sequence_246757e60626 := 24;
  p_SQLBaseType_246757e60626 := 'nvarchar';
  p_SQLFullType_246757e60626 := 'nvarchar(MAX)';
  p_SourceFieldName_246757e60626 := 'LaterOverlappingTermsAmount';
  p_IsComputed_246757e60626 := FALSE;
  p_IsSummary_246757e60626 := FALSE;
  p_DetectionMethod_246757e60626 := 'Manual';
  p_ID_246757e60626 := 'C4711F49-DBCF-4D87-9A5B-818AD719EFA9';
  p_QueryID_246757e60626 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Query" WHERE "Name" = 'Overlapping Subscriptions' ORDER BY CASE WHEN "ID" = p_QueryID_246757e60626 THEN 0 ELSE 1 END LIMIT 1), p_QueryID_246757e60626);
  p_ID_246757e60626 := COALESCE((SELECT "ID" FROM "${mjSchema}"."QueryField" WHERE "QueryID" = p_QueryID_246757e60626 AND "Name" = p_Name_246757e60626 ORDER BY CASE WHEN "ID" = p_ID_246757e60626 THEN 0 ELSE 1 END LIMIT 1), p_ID_246757e60626);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateQueryField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateQueryField"(p_data := jsonb_build_object(
    'QueryID', p_QueryID_246757e60626,
    'Name', p_Name_246757e60626,
    'Description', p_Description_246757e60626,
    'Sequence', p_Sequence_246757e60626,
    'SQLBaseType', p_SQLBaseType_246757e60626,
    'SQLFullType', p_SQLFullType_246757e60626,
    'SourceEntityID', p_SourceEntityID_246757e60626,
    'SourceFieldName', p_SourceFieldName_246757e60626,
    'IsComputed', p_IsComputed_246757e60626,
    'ComputationDescription', p_ComputationDescription_246757e60626,
    'IsSummary', p_IsSummary_246757e60626,
    'SummaryDescription', p_SummaryDescription_246757e60626,
    'DetectionMethod', p_DetectionMethod_246757e60626,
    'AutoDetectConfidenceScore', p_AutoDetectConfidenceScore_246757e60626,
    'ID', p_ID_246757e60626
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateQueryField"(p_QueryID := p_QueryID_246757e60626, p_Name := p_Name_246757e60626, p_Description := p_Description_246757e60626, p_Sequence := p_Sequence_246757e60626, p_SQLBaseType := p_SQLBaseType_246757e60626, p_SQLFullType := p_SQLFullType_246757e60626, p_SourceEntityID := p_SourceEntityID_246757e60626, p_SourceEntityID_Clear := TRUE, p_SourceFieldName := p_SourceFieldName_246757e60626, p_IsComputed := p_IsComputed_246757e60626, p_ComputationDescription := p_ComputationDescription_246757e60626, p_ComputationDescription_Clear := TRUE, p_IsSummary := p_IsSummary_246757e60626, p_SummaryDescription := p_SummaryDescription_246757e60626, p_SummaryDescription_Clear := TRUE, p_DetectionMethod := p_DetectionMethod_246757e60626, p_AutoDetectConfidenceScore := p_AutoDetectConfidenceScore_246757e60626, p_AutoDetectConfidenceScore_Clear := TRUE, p_ID := p_ID_246757e60626);
  END IF;
END $mj$;

-- Save MJ: Query Fields (core SP call only)
DO $mj$
DECLARE
  p_QueryID_95438076494c UUID;
  p_Name_95438076494c VARCHAR(255);
  p_Description_95438076494c TEXT;
  p_Sequence_95438076494c INTEGER;
  p_SQLBaseType_95438076494c VARCHAR(50);
  p_SQLFullType_95438076494c VARCHAR(100);
  p_SourceEntityID_95438076494c UUID;
  p_SourceFieldName_95438076494c VARCHAR(255);
  p_IsComputed_95438076494c BOOLEAN;
  p_ComputationDescription_95438076494c TEXT;
  p_IsSummary_95438076494c BOOLEAN;
  p_SummaryDescription_95438076494c TEXT;
  p_DetectionMethod_95438076494c VARCHAR(50);
  p_AutoDetectConfidenceScore_95438076494c NUMERIC(3,2);
  p_ID_95438076494c UUID;
BEGIN
  p_QueryID_95438076494c := '8DF27980-FE2C-4555-A481-27DD1C3285D3';
  p_Name_95438076494c := 'LaterOverlapAcknowledged';
  p_Description_95438076494c := 'Computed column: LaterOverlapAcknowledged';
  p_Sequence_95438076494c := 22;
  p_SQLBaseType_95438076494c := 'nvarchar';
  p_SQLFullType_95438076494c := 'nvarchar(MAX)';
  p_IsComputed_95438076494c := TRUE;
  p_IsSummary_95438076494c := FALSE;
  p_DetectionMethod_95438076494c := 'Manual';
  p_ID_95438076494c := '6C8F183A-81CD-4900-938E-83E845980897';
  p_QueryID_95438076494c := COALESCE((SELECT "ID" FROM "${mjSchema}"."Query" WHERE "Name" = 'Overlapping Subscriptions' ORDER BY CASE WHEN "ID" = p_QueryID_95438076494c THEN 0 ELSE 1 END LIMIT 1), p_QueryID_95438076494c);
  p_ID_95438076494c := COALESCE((SELECT "ID" FROM "${mjSchema}"."QueryField" WHERE "QueryID" = p_QueryID_95438076494c AND "Name" = p_Name_95438076494c ORDER BY CASE WHEN "ID" = p_ID_95438076494c THEN 0 ELSE 1 END LIMIT 1), p_ID_95438076494c);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateQueryField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateQueryField"(p_data := jsonb_build_object(
    'QueryID', p_QueryID_95438076494c,
    'Name', p_Name_95438076494c,
    'Description', p_Description_95438076494c,
    'Sequence', p_Sequence_95438076494c,
    'SQLBaseType', p_SQLBaseType_95438076494c,
    'SQLFullType', p_SQLFullType_95438076494c,
    'SourceEntityID', p_SourceEntityID_95438076494c,
    'SourceFieldName', p_SourceFieldName_95438076494c,
    'IsComputed', p_IsComputed_95438076494c,
    'ComputationDescription', p_ComputationDescription_95438076494c,
    'IsSummary', p_IsSummary_95438076494c,
    'SummaryDescription', p_SummaryDescription_95438076494c,
    'DetectionMethod', p_DetectionMethod_95438076494c,
    'AutoDetectConfidenceScore', p_AutoDetectConfidenceScore_95438076494c,
    'ID', p_ID_95438076494c
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateQueryField"(p_QueryID := p_QueryID_95438076494c, p_Name := p_Name_95438076494c, p_Description := p_Description_95438076494c, p_Sequence := p_Sequence_95438076494c, p_SQLBaseType := p_SQLBaseType_95438076494c, p_SQLFullType := p_SQLFullType_95438076494c, p_SourceEntityID := p_SourceEntityID_95438076494c, p_SourceEntityID_Clear := TRUE, p_SourceFieldName := p_SourceFieldName_95438076494c, p_SourceFieldName_Clear := TRUE, p_IsComputed := p_IsComputed_95438076494c, p_ComputationDescription := p_ComputationDescription_95438076494c, p_ComputationDescription_Clear := TRUE, p_IsSummary := p_IsSummary_95438076494c, p_SummaryDescription := p_SummaryDescription_95438076494c, p_SummaryDescription_Clear := TRUE, p_DetectionMethod := p_DetectionMethod_95438076494c, p_AutoDetectConfidenceScore := p_AutoDetectConfidenceScore_95438076494c, p_AutoDetectConfidenceScore_Clear := TRUE, p_ID := p_ID_95438076494c);
  END IF;
END $mj$;

-- Save MJ: Templates (core SP call only)
DO $mj$
DECLARE
  p_ID_205a0eb9369f UUID;
  p_Name_205a0eb9369f VARCHAR(255);
  p_Description_205a0eb9369f TEXT;
  p_CategoryID_205a0eb9369f UUID;
  p_UserPrompt_205a0eb9369f TEXT;
  p_UserID_205a0eb9369f UUID;
  p_ActiveAt_205a0eb9369f TIMESTAMPTZ;
  p_DisabledAt_205a0eb9369f TIMESTAMPTZ;
  p_IsActive_205a0eb9369f BOOLEAN;
BEGIN
  p_ID_205a0eb9369f := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_205a0eb9369f := 'Orders: Renewal Payment Link';
  p_Description_205a0eb9369f := 'The e-mail sent to a subscription''s bill-to person after the renewal card''s first failed charge, a decline or a bank''s request to authenticate (#289). It carries the signed link that pays the renewal with a new card. Edit the wording here; the link, amounts and dates come from the code.';
  p_CategoryID_205a0eb9369f := 'F5F18EFD-4FE2-40D4-AB6A-DCDC3365E661';
  p_UserPrompt_205a0eb9369f := 'Render the update-card e-mail. Variables: FirstName, OrderNumber, SubscriptionNumber, Description (what renews), Amount (formatted), PaymentUrl, ExpiresOn and NextAttemptDay (YYYY-MM-DD, NextAttemptDay empty when none is left), AuthenticationRequired (true when the bank asked the buyer to confirm).';
  p_UserID_205a0eb9369f := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_IsActive_205a0eb9369f := TRUE;
  p_CategoryID_205a0eb9369f := COALESCE((SELECT "ID" FROM "${mjSchema}"."TemplateCategory" WHERE "Name" = 'Orders: Documents' ORDER BY CASE WHEN "ID" = p_CategoryID_205a0eb9369f THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_205a0eb9369f);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Template" WHERE "ID" = p_ID_205a0eb9369f OR "Name" = p_Name_205a0eb9369f) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplate'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplate"(p_data := jsonb_build_object(
      'ID', p_ID_205a0eb9369f,
      'Name', p_Name_205a0eb9369f,
      'Description', p_Description_205a0eb9369f,
      'CategoryID', p_CategoryID_205a0eb9369f,
      'UserPrompt', p_UserPrompt_205a0eb9369f,
      'UserID', p_UserID_205a0eb9369f,
      'ActiveAt', p_ActiveAt_205a0eb9369f,
      'DisabledAt', p_DisabledAt_205a0eb9369f,
      'IsActive', p_IsActive_205a0eb9369f
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplate"(p_ID := p_ID_205a0eb9369f, p_Name := p_Name_205a0eb9369f, p_Description := p_Description_205a0eb9369f, p_CategoryID := p_CategoryID_205a0eb9369f, p_UserPrompt := p_UserPrompt_205a0eb9369f, p_UserID := p_UserID_205a0eb9369f, p_ActiveAt := p_ActiveAt_205a0eb9369f, p_ActiveAt_Clear := TRUE, p_DisabledAt := p_DisabledAt_205a0eb9369f, p_DisabledAt_Clear := TRUE, p_IsActive := p_IsActive_205a0eb9369f);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Templates (core SP call only)
DO $mj$
DECLARE
  p_ID_9caed79f9d98 UUID;
  p_Name_9caed79f9d98 VARCHAR(255);
  p_Description_9caed79f9d98 TEXT;
  p_CategoryID_9caed79f9d98 UUID;
  p_UserPrompt_9caed79f9d98 TEXT;
  p_UserID_9caed79f9d98 UUID;
  p_ActiveAt_9caed79f9d98 TIMESTAMPTZ;
  p_DisabledAt_9caed79f9d98 TIMESTAMPTZ;
  p_IsActive_9caed79f9d98 BOOLEAN;
BEGIN
  p_ID_9caed79f9d98 := 'E92FA1E3-15EA-4437-BE17-37EF564940A6';
  p_Name_9caed79f9d98 := 'Orders: Renewal Payment Link Subject';
  p_Description_9caed79f9d98 := 'The subject line of the update-card e-mail (#289). Same variables as Orders: Renewal Payment Link. Whitespace is collapsed to one line.';
  p_CategoryID_9caed79f9d98 := 'F5F18EFD-4FE2-40D4-AB6A-DCDC3365E661';
  p_UserPrompt_9caed79f9d98 := 'Render one subject line for the update-card e-mail, from the same variables as Orders: Renewal Payment Link.';
  p_UserID_9caed79f9d98 := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_IsActive_9caed79f9d98 := TRUE;
  p_CategoryID_9caed79f9d98 := COALESCE((SELECT "ID" FROM "${mjSchema}"."TemplateCategory" WHERE "Name" = 'Orders: Documents' ORDER BY CASE WHEN "ID" = p_CategoryID_9caed79f9d98 THEN 0 ELSE 1 END LIMIT 1), p_CategoryID_9caed79f9d98);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Template" WHERE "ID" = p_ID_9caed79f9d98 OR "Name" = p_Name_9caed79f9d98) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplate'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplate"(p_data := jsonb_build_object(
      'ID', p_ID_9caed79f9d98,
      'Name', p_Name_9caed79f9d98,
      'Description', p_Description_9caed79f9d98,
      'CategoryID', p_CategoryID_9caed79f9d98,
      'UserPrompt', p_UserPrompt_9caed79f9d98,
      'UserID', p_UserID_9caed79f9d98,
      'ActiveAt', p_ActiveAt_9caed79f9d98,
      'DisabledAt', p_DisabledAt_9caed79f9d98,
      'IsActive', p_IsActive_9caed79f9d98
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplate"(p_ID := p_ID_9caed79f9d98, p_Name := p_Name_9caed79f9d98, p_Description := p_Description_9caed79f9d98, p_CategoryID := p_CategoryID_9caed79f9d98, p_UserPrompt := p_UserPrompt_9caed79f9d98, p_UserID := p_UserID_9caed79f9d98, p_ActiveAt := p_ActiveAt_9caed79f9d98, p_ActiveAt_Clear := TRUE, p_DisabledAt := p_DisabledAt_9caed79f9d98, p_DisabledAt_Clear := TRUE, p_IsActive := p_IsActive_9caed79f9d98);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Contents (core SP call only)
DO $mj$
DECLARE
  p_ID_a9180d4a8e4b UUID;
  p_TemplateID_a9180d4a8e4b UUID;
  p_TypeID_a9180d4a8e4b UUID;
  p_TemplateText_a9180d4a8e4b TEXT;
  p_Priority_a9180d4a8e4b INTEGER;
  p_IsActive_a9180d4a8e4b BOOLEAN;
BEGIN
  p_ID_a9180d4a8e4b := '93B8889A-3396-4510-B311-D422C82862B6';
  p_TemplateID_a9180d4a8e4b := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_TypeID_a9180d4a8e4b := 'E8AFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_TemplateText_a9180d4a8e4b := '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Renew your subscription</title>
</head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
    <tr>
      <td style="padding:28px 28px 8px 28px;">
        <p style="margin:0 0 16px 0;font-size:16px;">{% if FirstName %}Hello {{ FirstName }},{% else %}Hello,{% endif %}</p>
        {% if AuthenticationRequired %}
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">Your bank asked for you to confirm the renewal payment for {{ Description }} ({{ SubscriptionNumber }}), so we could not charge your saved card automatically.</p>
        {% else %}
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">We could not charge your saved card for the renewal of {{ Description }} ({{ SubscriptionNumber }}).</p>
        {% endif %}
        <p style="margin:0 0 20px 0;font-size:15px;line-height:1.5;">Amount due: <strong>{{ Amount }}</strong> (renewal {{ OrderNumber }}).</p>
        <p style="margin:0 0 24px 0;">
          <a href="{{ PaymentUrl }}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">Pay and update your card</a>
        </p>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:#52606d;">The card you pay with will be used for future renewals. This link works until {{ ExpiresOn }}.</p>
        {% if NextAttemptDay %}
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:#52606d;">If you do nothing, we will try your saved card again on {{ NextAttemptDay }}.</p>
        {% endif %}
      </td>
    </tr>
  </table>
</body>
</html>
';
  p_Priority_a9180d4a8e4b := 1;
  p_IsActive_a9180d4a8e4b := TRUE;
  p_TemplateID_a9180d4a8e4b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_a9180d4a8e4b THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_a9180d4a8e4b);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateContent"
               WHERE "ID" = p_ID_a9180d4a8e4b
                  OR ("TemplateID" = p_TemplateID_a9180d4a8e4b AND "TypeID" = p_TypeID_a9180d4a8e4b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateContent'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_data := jsonb_build_object(
      'ID', p_ID_a9180d4a8e4b,
      'TemplateID', p_TemplateID_a9180d4a8e4b,
      'TypeID', p_TypeID_a9180d4a8e4b,
      'TemplateText', p_TemplateText_a9180d4a8e4b,
      'Priority', p_Priority_a9180d4a8e4b,
      'IsActive', p_IsActive_a9180d4a8e4b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_ID := p_ID_a9180d4a8e4b, p_TemplateID := p_TemplateID_a9180d4a8e4b, p_TypeID := p_TypeID_a9180d4a8e4b, p_TemplateText := p_TemplateText_a9180d4a8e4b, p_Priority := p_Priority_a9180d4a8e4b, p_IsActive := p_IsActive_a9180d4a8e4b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_64637fa957d9 UUID;
  p_TemplateID_64637fa957d9 UUID;
  p_Name_64637fa957d9 VARCHAR(255);
  p_Description_64637fa957d9 TEXT;
  p_Type_64637fa957d9 VARCHAR(20);
  p_DefaultValue_64637fa957d9 TEXT;
  p_IsRequired_64637fa957d9 BOOLEAN;
  p_LinkedParameterName_64637fa957d9 VARCHAR(255);
  p_LinkedParameterField_64637fa957d9 VARCHAR(500);
  p_ExtraFilter_64637fa957d9 TEXT;
  p_EntityID_64637fa957d9 UUID;
  p_RecordID_64637fa957d9 VARCHAR(2000);
  p_OrderBy_64637fa957d9 TEXT;
  p_TemplateContentID_64637fa957d9 UUID;
BEGIN
  p_ID_64637fa957d9 := 'f3606d46-52f6-4e42-b26c-645ac9cd4cc8';
  p_TemplateID_64637fa957d9 := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_64637fa957d9 := 'Amount';
  p_Description_64637fa957d9 := 'Template scalar parameter ''Amount''';
  p_Type_64637fa957d9 := 'Scalar';
  p_IsRequired_64637fa957d9 := TRUE;
  p_TemplateID_64637fa957d9 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_64637fa957d9 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_64637fa957d9);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_64637fa957d9
                  OR ("TemplateID" = p_TemplateID_64637fa957d9 AND "Name" = p_Name_64637fa957d9)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_64637fa957d9,
      'TemplateID', p_TemplateID_64637fa957d9,
      'Name', p_Name_64637fa957d9,
      'Description', p_Description_64637fa957d9,
      'Type', p_Type_64637fa957d9,
      'DefaultValue', p_DefaultValue_64637fa957d9,
      'IsRequired', p_IsRequired_64637fa957d9,
      'LinkedParameterName', p_LinkedParameterName_64637fa957d9,
      'LinkedParameterField', p_LinkedParameterField_64637fa957d9,
      'ExtraFilter', p_ExtraFilter_64637fa957d9,
      'EntityID', p_EntityID_64637fa957d9,
      'RecordID', p_RecordID_64637fa957d9,
      'OrderBy', p_OrderBy_64637fa957d9,
      'TemplateContentID', p_TemplateContentID_64637fa957d9
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_64637fa957d9, p_TemplateID := p_TemplateID_64637fa957d9, p_Name := p_Name_64637fa957d9, p_Description := p_Description_64637fa957d9, p_Type := p_Type_64637fa957d9, p_DefaultValue := p_DefaultValue_64637fa957d9, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_64637fa957d9, p_LinkedParameterName := p_LinkedParameterName_64637fa957d9, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_64637fa957d9, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_64637fa957d9, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_64637fa957d9, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_64637fa957d9, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_64637fa957d9, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_64637fa957d9, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_80ffc381ed76 UUID;
  p_TemplateID_80ffc381ed76 UUID;
  p_Name_80ffc381ed76 VARCHAR(255);
  p_Description_80ffc381ed76 TEXT;
  p_Type_80ffc381ed76 VARCHAR(20);
  p_DefaultValue_80ffc381ed76 TEXT;
  p_IsRequired_80ffc381ed76 BOOLEAN;
  p_LinkedParameterName_80ffc381ed76 VARCHAR(255);
  p_LinkedParameterField_80ffc381ed76 VARCHAR(500);
  p_ExtraFilter_80ffc381ed76 TEXT;
  p_EntityID_80ffc381ed76 UUID;
  p_RecordID_80ffc381ed76 VARCHAR(2000);
  p_OrderBy_80ffc381ed76 TEXT;
  p_TemplateContentID_80ffc381ed76 UUID;
BEGIN
  p_ID_80ffc381ed76 := '17ea7fb3-13ba-4220-9a3d-3957b481a498';
  p_TemplateID_80ffc381ed76 := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_80ffc381ed76 := 'AuthenticationRequired';
  p_Description_80ffc381ed76 := 'Template scalar parameter ''AuthenticationRequired''';
  p_Type_80ffc381ed76 := 'Scalar';
  p_IsRequired_80ffc381ed76 := FALSE;
  p_TemplateID_80ffc381ed76 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_80ffc381ed76 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_80ffc381ed76);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_80ffc381ed76
                  OR ("TemplateID" = p_TemplateID_80ffc381ed76 AND "Name" = p_Name_80ffc381ed76)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_80ffc381ed76,
      'TemplateID', p_TemplateID_80ffc381ed76,
      'Name', p_Name_80ffc381ed76,
      'Description', p_Description_80ffc381ed76,
      'Type', p_Type_80ffc381ed76,
      'DefaultValue', p_DefaultValue_80ffc381ed76,
      'IsRequired', p_IsRequired_80ffc381ed76,
      'LinkedParameterName', p_LinkedParameterName_80ffc381ed76,
      'LinkedParameterField', p_LinkedParameterField_80ffc381ed76,
      'ExtraFilter', p_ExtraFilter_80ffc381ed76,
      'EntityID', p_EntityID_80ffc381ed76,
      'RecordID', p_RecordID_80ffc381ed76,
      'OrderBy', p_OrderBy_80ffc381ed76,
      'TemplateContentID', p_TemplateContentID_80ffc381ed76
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_80ffc381ed76, p_TemplateID := p_TemplateID_80ffc381ed76, p_Name := p_Name_80ffc381ed76, p_Description := p_Description_80ffc381ed76, p_Type := p_Type_80ffc381ed76, p_DefaultValue := p_DefaultValue_80ffc381ed76, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_80ffc381ed76, p_LinkedParameterName := p_LinkedParameterName_80ffc381ed76, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_80ffc381ed76, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_80ffc381ed76, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_80ffc381ed76, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_80ffc381ed76, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_80ffc381ed76, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_80ffc381ed76, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_e2e0d67e9aff UUID;
  p_TemplateID_e2e0d67e9aff UUID;
  p_Name_e2e0d67e9aff VARCHAR(255);
  p_Description_e2e0d67e9aff TEXT;
  p_Type_e2e0d67e9aff VARCHAR(20);
  p_DefaultValue_e2e0d67e9aff TEXT;
  p_IsRequired_e2e0d67e9aff BOOLEAN;
  p_LinkedParameterName_e2e0d67e9aff VARCHAR(255);
  p_LinkedParameterField_e2e0d67e9aff VARCHAR(500);
  p_ExtraFilter_e2e0d67e9aff TEXT;
  p_EntityID_e2e0d67e9aff UUID;
  p_RecordID_e2e0d67e9aff VARCHAR(2000);
  p_OrderBy_e2e0d67e9aff TEXT;
  p_TemplateContentID_e2e0d67e9aff UUID;
BEGIN
  p_ID_e2e0d67e9aff := '212a8d8a-4060-42ef-bf3f-2b08b518939d';
  p_TemplateID_e2e0d67e9aff := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_e2e0d67e9aff := 'Description';
  p_Description_e2e0d67e9aff := 'Template scalar parameter ''Description''';
  p_Type_e2e0d67e9aff := 'Scalar';
  p_IsRequired_e2e0d67e9aff := TRUE;
  p_TemplateID_e2e0d67e9aff := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_e2e0d67e9aff THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_e2e0d67e9aff);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_e2e0d67e9aff
                  OR ("TemplateID" = p_TemplateID_e2e0d67e9aff AND "Name" = p_Name_e2e0d67e9aff)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_e2e0d67e9aff,
      'TemplateID', p_TemplateID_e2e0d67e9aff,
      'Name', p_Name_e2e0d67e9aff,
      'Description', p_Description_e2e0d67e9aff,
      'Type', p_Type_e2e0d67e9aff,
      'DefaultValue', p_DefaultValue_e2e0d67e9aff,
      'IsRequired', p_IsRequired_e2e0d67e9aff,
      'LinkedParameterName', p_LinkedParameterName_e2e0d67e9aff,
      'LinkedParameterField', p_LinkedParameterField_e2e0d67e9aff,
      'ExtraFilter', p_ExtraFilter_e2e0d67e9aff,
      'EntityID', p_EntityID_e2e0d67e9aff,
      'RecordID', p_RecordID_e2e0d67e9aff,
      'OrderBy', p_OrderBy_e2e0d67e9aff,
      'TemplateContentID', p_TemplateContentID_e2e0d67e9aff
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_e2e0d67e9aff, p_TemplateID := p_TemplateID_e2e0d67e9aff, p_Name := p_Name_e2e0d67e9aff, p_Description := p_Description_e2e0d67e9aff, p_Type := p_Type_e2e0d67e9aff, p_DefaultValue := p_DefaultValue_e2e0d67e9aff, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_e2e0d67e9aff, p_LinkedParameterName := p_LinkedParameterName_e2e0d67e9aff, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_e2e0d67e9aff, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_e2e0d67e9aff, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_e2e0d67e9aff, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_e2e0d67e9aff, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_e2e0d67e9aff, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_e2e0d67e9aff, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_fc70bc1c1773 UUID;
  p_TemplateID_fc70bc1c1773 UUID;
  p_Name_fc70bc1c1773 VARCHAR(255);
  p_Description_fc70bc1c1773 TEXT;
  p_Type_fc70bc1c1773 VARCHAR(20);
  p_DefaultValue_fc70bc1c1773 TEXT;
  p_IsRequired_fc70bc1c1773 BOOLEAN;
  p_LinkedParameterName_fc70bc1c1773 VARCHAR(255);
  p_LinkedParameterField_fc70bc1c1773 VARCHAR(500);
  p_ExtraFilter_fc70bc1c1773 TEXT;
  p_EntityID_fc70bc1c1773 UUID;
  p_RecordID_fc70bc1c1773 VARCHAR(2000);
  p_OrderBy_fc70bc1c1773 TEXT;
  p_TemplateContentID_fc70bc1c1773 UUID;
BEGIN
  p_ID_fc70bc1c1773 := '3080a53b-3c79-4096-9950-9761176b0020';
  p_TemplateID_fc70bc1c1773 := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_fc70bc1c1773 := 'ExpiresOn';
  p_Description_fc70bc1c1773 := 'Template scalar parameter ''ExpiresOn''';
  p_Type_fc70bc1c1773 := 'Scalar';
  p_IsRequired_fc70bc1c1773 := TRUE;
  p_TemplateID_fc70bc1c1773 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_fc70bc1c1773 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_fc70bc1c1773);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_fc70bc1c1773
                  OR ("TemplateID" = p_TemplateID_fc70bc1c1773 AND "Name" = p_Name_fc70bc1c1773)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_fc70bc1c1773,
      'TemplateID', p_TemplateID_fc70bc1c1773,
      'Name', p_Name_fc70bc1c1773,
      'Description', p_Description_fc70bc1c1773,
      'Type', p_Type_fc70bc1c1773,
      'DefaultValue', p_DefaultValue_fc70bc1c1773,
      'IsRequired', p_IsRequired_fc70bc1c1773,
      'LinkedParameterName', p_LinkedParameterName_fc70bc1c1773,
      'LinkedParameterField', p_LinkedParameterField_fc70bc1c1773,
      'ExtraFilter', p_ExtraFilter_fc70bc1c1773,
      'EntityID', p_EntityID_fc70bc1c1773,
      'RecordID', p_RecordID_fc70bc1c1773,
      'OrderBy', p_OrderBy_fc70bc1c1773,
      'TemplateContentID', p_TemplateContentID_fc70bc1c1773
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_fc70bc1c1773, p_TemplateID := p_TemplateID_fc70bc1c1773, p_Name := p_Name_fc70bc1c1773, p_Description := p_Description_fc70bc1c1773, p_Type := p_Type_fc70bc1c1773, p_DefaultValue := p_DefaultValue_fc70bc1c1773, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_fc70bc1c1773, p_LinkedParameterName := p_LinkedParameterName_fc70bc1c1773, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_fc70bc1c1773, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_fc70bc1c1773, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_fc70bc1c1773, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_fc70bc1c1773, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_fc70bc1c1773, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_fc70bc1c1773, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_510141f128ae UUID;
  p_TemplateID_510141f128ae UUID;
  p_Name_510141f128ae VARCHAR(255);
  p_Description_510141f128ae TEXT;
  p_Type_510141f128ae VARCHAR(20);
  p_DefaultValue_510141f128ae TEXT;
  p_IsRequired_510141f128ae BOOLEAN;
  p_LinkedParameterName_510141f128ae VARCHAR(255);
  p_LinkedParameterField_510141f128ae VARCHAR(500);
  p_ExtraFilter_510141f128ae TEXT;
  p_EntityID_510141f128ae UUID;
  p_RecordID_510141f128ae VARCHAR(2000);
  p_OrderBy_510141f128ae TEXT;
  p_TemplateContentID_510141f128ae UUID;
BEGIN
  p_ID_510141f128ae := '8d3e5a74-9587-4c76-b5ed-9856a3182303';
  p_TemplateID_510141f128ae := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_510141f128ae := 'FirstName';
  p_Description_510141f128ae := 'Template scalar parameter ''FirstName''';
  p_Type_510141f128ae := 'Scalar';
  p_IsRequired_510141f128ae := FALSE;
  p_TemplateID_510141f128ae := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_510141f128ae THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_510141f128ae);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_510141f128ae
                  OR ("TemplateID" = p_TemplateID_510141f128ae AND "Name" = p_Name_510141f128ae)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_510141f128ae,
      'TemplateID', p_TemplateID_510141f128ae,
      'Name', p_Name_510141f128ae,
      'Description', p_Description_510141f128ae,
      'Type', p_Type_510141f128ae,
      'DefaultValue', p_DefaultValue_510141f128ae,
      'IsRequired', p_IsRequired_510141f128ae,
      'LinkedParameterName', p_LinkedParameterName_510141f128ae,
      'LinkedParameterField', p_LinkedParameterField_510141f128ae,
      'ExtraFilter', p_ExtraFilter_510141f128ae,
      'EntityID', p_EntityID_510141f128ae,
      'RecordID', p_RecordID_510141f128ae,
      'OrderBy', p_OrderBy_510141f128ae,
      'TemplateContentID', p_TemplateContentID_510141f128ae
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_510141f128ae, p_TemplateID := p_TemplateID_510141f128ae, p_Name := p_Name_510141f128ae, p_Description := p_Description_510141f128ae, p_Type := p_Type_510141f128ae, p_DefaultValue := p_DefaultValue_510141f128ae, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_510141f128ae, p_LinkedParameterName := p_LinkedParameterName_510141f128ae, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_510141f128ae, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_510141f128ae, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_510141f128ae, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_510141f128ae, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_510141f128ae, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_510141f128ae, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_d16e9149208c UUID;
  p_TemplateID_d16e9149208c UUID;
  p_Name_d16e9149208c VARCHAR(255);
  p_Description_d16e9149208c TEXT;
  p_Type_d16e9149208c VARCHAR(20);
  p_DefaultValue_d16e9149208c TEXT;
  p_IsRequired_d16e9149208c BOOLEAN;
  p_LinkedParameterName_d16e9149208c VARCHAR(255);
  p_LinkedParameterField_d16e9149208c VARCHAR(500);
  p_ExtraFilter_d16e9149208c TEXT;
  p_EntityID_d16e9149208c UUID;
  p_RecordID_d16e9149208c VARCHAR(2000);
  p_OrderBy_d16e9149208c TEXT;
  p_TemplateContentID_d16e9149208c UUID;
BEGIN
  p_ID_d16e9149208c := '9f9df1d4-c71b-4a5a-92cd-1ff81ef14073';
  p_TemplateID_d16e9149208c := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_d16e9149208c := 'NextAttemptDay';
  p_Description_d16e9149208c := 'Template scalar parameter ''NextAttemptDay''';
  p_Type_d16e9149208c := 'Scalar';
  p_IsRequired_d16e9149208c := FALSE;
  p_TemplateID_d16e9149208c := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_d16e9149208c THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_d16e9149208c);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_d16e9149208c
                  OR ("TemplateID" = p_TemplateID_d16e9149208c AND "Name" = p_Name_d16e9149208c)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_d16e9149208c,
      'TemplateID', p_TemplateID_d16e9149208c,
      'Name', p_Name_d16e9149208c,
      'Description', p_Description_d16e9149208c,
      'Type', p_Type_d16e9149208c,
      'DefaultValue', p_DefaultValue_d16e9149208c,
      'IsRequired', p_IsRequired_d16e9149208c,
      'LinkedParameterName', p_LinkedParameterName_d16e9149208c,
      'LinkedParameterField', p_LinkedParameterField_d16e9149208c,
      'ExtraFilter', p_ExtraFilter_d16e9149208c,
      'EntityID', p_EntityID_d16e9149208c,
      'RecordID', p_RecordID_d16e9149208c,
      'OrderBy', p_OrderBy_d16e9149208c,
      'TemplateContentID', p_TemplateContentID_d16e9149208c
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_d16e9149208c, p_TemplateID := p_TemplateID_d16e9149208c, p_Name := p_Name_d16e9149208c, p_Description := p_Description_d16e9149208c, p_Type := p_Type_d16e9149208c, p_DefaultValue := p_DefaultValue_d16e9149208c, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_d16e9149208c, p_LinkedParameterName := p_LinkedParameterName_d16e9149208c, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_d16e9149208c, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_d16e9149208c, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_d16e9149208c, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_d16e9149208c, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_d16e9149208c, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_d16e9149208c, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_fd939421f0fd UUID;
  p_TemplateID_fd939421f0fd UUID;
  p_Name_fd939421f0fd VARCHAR(255);
  p_Description_fd939421f0fd TEXT;
  p_Type_fd939421f0fd VARCHAR(20);
  p_DefaultValue_fd939421f0fd TEXT;
  p_IsRequired_fd939421f0fd BOOLEAN;
  p_LinkedParameterName_fd939421f0fd VARCHAR(255);
  p_LinkedParameterField_fd939421f0fd VARCHAR(500);
  p_ExtraFilter_fd939421f0fd TEXT;
  p_EntityID_fd939421f0fd UUID;
  p_RecordID_fd939421f0fd VARCHAR(2000);
  p_OrderBy_fd939421f0fd TEXT;
  p_TemplateContentID_fd939421f0fd UUID;
BEGIN
  p_ID_fd939421f0fd := '938f50e3-4d91-40a7-b4dd-d7ac40082709';
  p_TemplateID_fd939421f0fd := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_fd939421f0fd := 'OrderNumber';
  p_Description_fd939421f0fd := 'Template scalar parameter ''OrderNumber''';
  p_Type_fd939421f0fd := 'Scalar';
  p_IsRequired_fd939421f0fd := TRUE;
  p_TemplateID_fd939421f0fd := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_fd939421f0fd THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_fd939421f0fd);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_fd939421f0fd
                  OR ("TemplateID" = p_TemplateID_fd939421f0fd AND "Name" = p_Name_fd939421f0fd)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_fd939421f0fd,
      'TemplateID', p_TemplateID_fd939421f0fd,
      'Name', p_Name_fd939421f0fd,
      'Description', p_Description_fd939421f0fd,
      'Type', p_Type_fd939421f0fd,
      'DefaultValue', p_DefaultValue_fd939421f0fd,
      'IsRequired', p_IsRequired_fd939421f0fd,
      'LinkedParameterName', p_LinkedParameterName_fd939421f0fd,
      'LinkedParameterField', p_LinkedParameterField_fd939421f0fd,
      'ExtraFilter', p_ExtraFilter_fd939421f0fd,
      'EntityID', p_EntityID_fd939421f0fd,
      'RecordID', p_RecordID_fd939421f0fd,
      'OrderBy', p_OrderBy_fd939421f0fd,
      'TemplateContentID', p_TemplateContentID_fd939421f0fd
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_fd939421f0fd, p_TemplateID := p_TemplateID_fd939421f0fd, p_Name := p_Name_fd939421f0fd, p_Description := p_Description_fd939421f0fd, p_Type := p_Type_fd939421f0fd, p_DefaultValue := p_DefaultValue_fd939421f0fd, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_fd939421f0fd, p_LinkedParameterName := p_LinkedParameterName_fd939421f0fd, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_fd939421f0fd, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_fd939421f0fd, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_fd939421f0fd, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_fd939421f0fd, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_fd939421f0fd, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_fd939421f0fd, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_e49b7f08270e UUID;
  p_TemplateID_e49b7f08270e UUID;
  p_Name_e49b7f08270e VARCHAR(255);
  p_Description_e49b7f08270e TEXT;
  p_Type_e49b7f08270e VARCHAR(20);
  p_DefaultValue_e49b7f08270e TEXT;
  p_IsRequired_e49b7f08270e BOOLEAN;
  p_LinkedParameterName_e49b7f08270e VARCHAR(255);
  p_LinkedParameterField_e49b7f08270e VARCHAR(500);
  p_ExtraFilter_e49b7f08270e TEXT;
  p_EntityID_e49b7f08270e UUID;
  p_RecordID_e49b7f08270e VARCHAR(2000);
  p_OrderBy_e49b7f08270e TEXT;
  p_TemplateContentID_e49b7f08270e UUID;
BEGIN
  p_ID_e49b7f08270e := 'dfba42c8-bf87-4b62-ba16-557110b337bf';
  p_TemplateID_e49b7f08270e := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_e49b7f08270e := 'PaymentUrl';
  p_Description_e49b7f08270e := 'Template scalar parameter ''PaymentUrl''';
  p_Type_e49b7f08270e := 'Scalar';
  p_IsRequired_e49b7f08270e := TRUE;
  p_TemplateID_e49b7f08270e := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_e49b7f08270e THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_e49b7f08270e);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_e49b7f08270e
                  OR ("TemplateID" = p_TemplateID_e49b7f08270e AND "Name" = p_Name_e49b7f08270e)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_e49b7f08270e,
      'TemplateID', p_TemplateID_e49b7f08270e,
      'Name', p_Name_e49b7f08270e,
      'Description', p_Description_e49b7f08270e,
      'Type', p_Type_e49b7f08270e,
      'DefaultValue', p_DefaultValue_e49b7f08270e,
      'IsRequired', p_IsRequired_e49b7f08270e,
      'LinkedParameterName', p_LinkedParameterName_e49b7f08270e,
      'LinkedParameterField', p_LinkedParameterField_e49b7f08270e,
      'ExtraFilter', p_ExtraFilter_e49b7f08270e,
      'EntityID', p_EntityID_e49b7f08270e,
      'RecordID', p_RecordID_e49b7f08270e,
      'OrderBy', p_OrderBy_e49b7f08270e,
      'TemplateContentID', p_TemplateContentID_e49b7f08270e
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_e49b7f08270e, p_TemplateID := p_TemplateID_e49b7f08270e, p_Name := p_Name_e49b7f08270e, p_Description := p_Description_e49b7f08270e, p_Type := p_Type_e49b7f08270e, p_DefaultValue := p_DefaultValue_e49b7f08270e, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_e49b7f08270e, p_LinkedParameterName := p_LinkedParameterName_e49b7f08270e, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_e49b7f08270e, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_e49b7f08270e, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_e49b7f08270e, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_e49b7f08270e, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_e49b7f08270e, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_e49b7f08270e, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_8c58d234ef22 UUID;
  p_TemplateID_8c58d234ef22 UUID;
  p_Name_8c58d234ef22 VARCHAR(255);
  p_Description_8c58d234ef22 TEXT;
  p_Type_8c58d234ef22 VARCHAR(20);
  p_DefaultValue_8c58d234ef22 TEXT;
  p_IsRequired_8c58d234ef22 BOOLEAN;
  p_LinkedParameterName_8c58d234ef22 VARCHAR(255);
  p_LinkedParameterField_8c58d234ef22 VARCHAR(500);
  p_ExtraFilter_8c58d234ef22 TEXT;
  p_EntityID_8c58d234ef22 UUID;
  p_RecordID_8c58d234ef22 VARCHAR(2000);
  p_OrderBy_8c58d234ef22 TEXT;
  p_TemplateContentID_8c58d234ef22 UUID;
BEGIN
  p_ID_8c58d234ef22 := '8f0e45a8-c7eb-4223-969e-ba31d5acb553';
  p_TemplateID_8c58d234ef22 := 'FF42A468-4800-488D-8D46-5DDA3A4602C3';
  p_Name_8c58d234ef22 := 'SubscriptionNumber';
  p_Description_8c58d234ef22 := 'Template scalar parameter ''SubscriptionNumber''';
  p_Type_8c58d234ef22 := 'Scalar';
  p_IsRequired_8c58d234ef22 := TRUE;
  p_TemplateID_8c58d234ef22 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link' ORDER BY CASE WHEN "ID" = p_TemplateID_8c58d234ef22 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_8c58d234ef22);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_8c58d234ef22
                  OR ("TemplateID" = p_TemplateID_8c58d234ef22 AND "Name" = p_Name_8c58d234ef22)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_8c58d234ef22,
      'TemplateID', p_TemplateID_8c58d234ef22,
      'Name', p_Name_8c58d234ef22,
      'Description', p_Description_8c58d234ef22,
      'Type', p_Type_8c58d234ef22,
      'DefaultValue', p_DefaultValue_8c58d234ef22,
      'IsRequired', p_IsRequired_8c58d234ef22,
      'LinkedParameterName', p_LinkedParameterName_8c58d234ef22,
      'LinkedParameterField', p_LinkedParameterField_8c58d234ef22,
      'ExtraFilter', p_ExtraFilter_8c58d234ef22,
      'EntityID', p_EntityID_8c58d234ef22,
      'RecordID', p_RecordID_8c58d234ef22,
      'OrderBy', p_OrderBy_8c58d234ef22,
      'TemplateContentID', p_TemplateContentID_8c58d234ef22
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_8c58d234ef22, p_TemplateID := p_TemplateID_8c58d234ef22, p_Name := p_Name_8c58d234ef22, p_Description := p_Description_8c58d234ef22, p_Type := p_Type_8c58d234ef22, p_DefaultValue := p_DefaultValue_8c58d234ef22, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_8c58d234ef22, p_LinkedParameterName := p_LinkedParameterName_8c58d234ef22, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_8c58d234ef22, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_8c58d234ef22, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_8c58d234ef22, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_8c58d234ef22, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_8c58d234ef22, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_8c58d234ef22, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Contents (core SP call only)
DO $mj$
DECLARE
  p_ID_d8206e941c2b UUID;
  p_TemplateID_d8206e941c2b UUID;
  p_TypeID_d8206e941c2b UUID;
  p_TemplateText_d8206e941c2b TEXT;
  p_Priority_d8206e941c2b INTEGER;
  p_IsActive_d8206e941c2b BOOLEAN;
BEGIN
  p_ID_d8206e941c2b := '3DB0EFD3-6548-4DEC-B0B1-D8791DE517F0';
  p_TemplateID_d8206e941c2b := 'E92FA1E3-15EA-4437-BE17-37EF564940A6';
  p_TypeID_d8206e941c2b := 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_TemplateText_d8206e941c2b := '{% if AuthenticationRequired %}Please confirm your renewal payment{% else %}Your renewal payment did not go through{% endif %} ({{ OrderNumber }})
';
  p_Priority_d8206e941c2b := 1;
  p_IsActive_d8206e941c2b := TRUE;
  p_TemplateID_d8206e941c2b := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link Subject' ORDER BY CASE WHEN "ID" = p_TemplateID_d8206e941c2b THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_d8206e941c2b);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateContent"
               WHERE "ID" = p_ID_d8206e941c2b
                  OR ("TemplateID" = p_TemplateID_d8206e941c2b AND "TypeID" = p_TypeID_d8206e941c2b)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateContent'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_data := jsonb_build_object(
      'ID', p_ID_d8206e941c2b,
      'TemplateID', p_TemplateID_d8206e941c2b,
      'TypeID', p_TypeID_d8206e941c2b,
      'TemplateText', p_TemplateText_d8206e941c2b,
      'Priority', p_Priority_d8206e941c2b,
      'IsActive', p_IsActive_d8206e941c2b
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateContent"(p_ID := p_ID_d8206e941c2b, p_TemplateID := p_TemplateID_d8206e941c2b, p_TypeID := p_TypeID_d8206e941c2b, p_TemplateText := p_TemplateText_d8206e941c2b, p_Priority := p_Priority_d8206e941c2b, p_IsActive := p_IsActive_d8206e941c2b);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_30f039753dca UUID;
  p_TemplateID_30f039753dca UUID;
  p_Name_30f039753dca VARCHAR(255);
  p_Description_30f039753dca TEXT;
  p_Type_30f039753dca VARCHAR(20);
  p_DefaultValue_30f039753dca TEXT;
  p_IsRequired_30f039753dca BOOLEAN;
  p_LinkedParameterName_30f039753dca VARCHAR(255);
  p_LinkedParameterField_30f039753dca VARCHAR(500);
  p_ExtraFilter_30f039753dca TEXT;
  p_EntityID_30f039753dca UUID;
  p_RecordID_30f039753dca VARCHAR(2000);
  p_OrderBy_30f039753dca TEXT;
  p_TemplateContentID_30f039753dca UUID;
BEGIN
  p_ID_30f039753dca := 'aa446554-df52-4c54-b565-7e76e4721205';
  p_TemplateID_30f039753dca := 'E92FA1E3-15EA-4437-BE17-37EF564940A6';
  p_Name_30f039753dca := 'AuthenticationRequired';
  p_Description_30f039753dca := 'Template scalar parameter ''AuthenticationRequired''';
  p_Type_30f039753dca := 'Scalar';
  p_IsRequired_30f039753dca := FALSE;
  p_TemplateID_30f039753dca := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link Subject' ORDER BY CASE WHEN "ID" = p_TemplateID_30f039753dca THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_30f039753dca);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_30f039753dca
                  OR ("TemplateID" = p_TemplateID_30f039753dca AND "Name" = p_Name_30f039753dca)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_30f039753dca,
      'TemplateID', p_TemplateID_30f039753dca,
      'Name', p_Name_30f039753dca,
      'Description', p_Description_30f039753dca,
      'Type', p_Type_30f039753dca,
      'DefaultValue', p_DefaultValue_30f039753dca,
      'IsRequired', p_IsRequired_30f039753dca,
      'LinkedParameterName', p_LinkedParameterName_30f039753dca,
      'LinkedParameterField', p_LinkedParameterField_30f039753dca,
      'ExtraFilter', p_ExtraFilter_30f039753dca,
      'EntityID', p_EntityID_30f039753dca,
      'RecordID', p_RecordID_30f039753dca,
      'OrderBy', p_OrderBy_30f039753dca,
      'TemplateContentID', p_TemplateContentID_30f039753dca
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_30f039753dca, p_TemplateID := p_TemplateID_30f039753dca, p_Name := p_Name_30f039753dca, p_Description := p_Description_30f039753dca, p_Type := p_Type_30f039753dca, p_DefaultValue := p_DefaultValue_30f039753dca, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_30f039753dca, p_LinkedParameterName := p_LinkedParameterName_30f039753dca, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_30f039753dca, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_30f039753dca, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_30f039753dca, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_30f039753dca, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_30f039753dca, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_30f039753dca, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Template Params (core SP call only)
DO $mj$
DECLARE
  p_ID_55220bb4c749 UUID;
  p_TemplateID_55220bb4c749 UUID;
  p_Name_55220bb4c749 VARCHAR(255);
  p_Description_55220bb4c749 TEXT;
  p_Type_55220bb4c749 VARCHAR(20);
  p_DefaultValue_55220bb4c749 TEXT;
  p_IsRequired_55220bb4c749 BOOLEAN;
  p_LinkedParameterName_55220bb4c749 VARCHAR(255);
  p_LinkedParameterField_55220bb4c749 VARCHAR(500);
  p_ExtraFilter_55220bb4c749 TEXT;
  p_EntityID_55220bb4c749 UUID;
  p_RecordID_55220bb4c749 VARCHAR(2000);
  p_OrderBy_55220bb4c749 TEXT;
  p_TemplateContentID_55220bb4c749 UUID;
BEGIN
  p_ID_55220bb4c749 := '6c123936-e106-4ca9-bd48-f57967559e0d';
  p_TemplateID_55220bb4c749 := 'E92FA1E3-15EA-4437-BE17-37EF564940A6';
  p_Name_55220bb4c749 := 'OrderNumber';
  p_Description_55220bb4c749 := 'Template scalar parameter ''OrderNumber''';
  p_Type_55220bb4c749 := 'Scalar';
  p_IsRequired_55220bb4c749 := TRUE;
  p_TemplateID_55220bb4c749 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Template" WHERE "Name" = 'Orders: Renewal Payment Link Subject' ORDER BY CASE WHEN "ID" = p_TemplateID_55220bb4c749 THEN 0 ELSE 1 END LIMIT 1), p_TemplateID_55220bb4c749);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."TemplateParam"
               WHERE "ID" = p_ID_55220bb4c749
                  OR ("TemplateID" = p_TemplateID_55220bb4c749 AND "Name" = p_Name_55220bb4c749)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateTemplateParam'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_data := jsonb_build_object(
      'ID', p_ID_55220bb4c749,
      'TemplateID', p_TemplateID_55220bb4c749,
      'Name', p_Name_55220bb4c749,
      'Description', p_Description_55220bb4c749,
      'Type', p_Type_55220bb4c749,
      'DefaultValue', p_DefaultValue_55220bb4c749,
      'IsRequired', p_IsRequired_55220bb4c749,
      'LinkedParameterName', p_LinkedParameterName_55220bb4c749,
      'LinkedParameterField', p_LinkedParameterField_55220bb4c749,
      'ExtraFilter', p_ExtraFilter_55220bb4c749,
      'EntityID', p_EntityID_55220bb4c749,
      'RecordID', p_RecordID_55220bb4c749,
      'OrderBy', p_OrderBy_55220bb4c749,
      'TemplateContentID', p_TemplateContentID_55220bb4c749
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateTemplateParam"(p_ID := p_ID_55220bb4c749, p_TemplateID := p_TemplateID_55220bb4c749, p_Name := p_Name_55220bb4c749, p_Description := p_Description_55220bb4c749, p_Type := p_Type_55220bb4c749, p_DefaultValue := p_DefaultValue_55220bb4c749, p_DefaultValue_Clear := TRUE, p_IsRequired := p_IsRequired_55220bb4c749, p_LinkedParameterName := p_LinkedParameterName_55220bb4c749, p_LinkedParameterName_Clear := TRUE, p_LinkedParameterField := p_LinkedParameterField_55220bb4c749, p_LinkedParameterField_Clear := TRUE, p_ExtraFilter := p_ExtraFilter_55220bb4c749, p_ExtraFilter_Clear := TRUE, p_EntityID := p_EntityID_55220bb4c749, p_EntityID_Clear := TRUE, p_RecordID := p_RecordID_55220bb4c749, p_RecordID_Clear := TRUE, p_OrderBy := p_OrderBy_55220bb4c749, p_OrderBy_Clear := TRUE, p_TemplateContentID := p_TemplateContentID_55220bb4c749, p_TemplateContentID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Authorizations (core SP call only)
DO $mj$
DECLARE
  p_ID_b4ee51a060fe UUID;
  p_ParentID_b4ee51a060fe UUID;
  p_Name_b4ee51a060fe VARCHAR(100);
  p_IsActive_b4ee51a060fe BOOLEAN;
  p_UseAuditLog_b4ee51a060fe BOOLEAN;
  p_Description_b4ee51a060fe TEXT;
BEGIN
  p_ID_b4ee51a060fe := '78CAE9AB-DD73-4128-AC23-6A58BE45302A';
  p_Name_b4ee51a060fe := 'MJ.BizApps.Orders.Coverage.RunAlongside';
  p_IsActive_b4ee51a060fe := TRUE;
  p_UseAuditLog_b4ee51a060fe := TRUE;
  p_Description_b4ee51a060fe := 'Confirm an order line marked to run alongside coverage the holder already has for another band of the same subscription family, so both subscriptions are booked and billed. The line must also give a reason (OrderLine.CoverageOverlapReason). Checked against the user confirming the order. Held by the Account Director role. Without this row, no line can run alongside existing coverage.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Authorization" WHERE "ID" = p_ID_b4ee51a060fe OR "Name" = p_Name_b4ee51a060fe) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorization'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorization"(p_data := jsonb_build_object(
      'ID', p_ID_b4ee51a060fe,
      'ParentID', p_ParentID_b4ee51a060fe,
      'Name', p_Name_b4ee51a060fe,
      'IsActive', p_IsActive_b4ee51a060fe,
      'UseAuditLog', p_UseAuditLog_b4ee51a060fe,
      'Description', p_Description_b4ee51a060fe
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorization"(p_ID := p_ID_b4ee51a060fe, p_ParentID := p_ParentID_b4ee51a060fe, p_ParentID_Clear := TRUE, p_Name := p_Name_b4ee51a060fe, p_IsActive := p_IsActive_b4ee51a060fe, p_UseAuditLog := p_UseAuditLog_b4ee51a060fe, p_Description := p_Description_b4ee51a060fe);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_8d05769abc6a VARCHAR(255);
  p_Description_8d05769abc6a TEXT;
  p_AutoUpdateDescription_8d05769abc6a BOOLEAN;
  p_IsPrimaryKey_8d05769abc6a BOOLEAN;
  p_IsUnique_8d05769abc6a BOOLEAN;
  p_Category_8d05769abc6a VARCHAR(255);
  p_ValueListType_8d05769abc6a VARCHAR(20);
  p_ExtendedType_8d05769abc6a VARCHAR(50);
  p_CodeType_8d05769abc6a VARCHAR(50);
  p_DefaultInView_8d05769abc6a BOOLEAN;
  p_ViewCellTemplate_8d05769abc6a TEXT;
  p_DefaultColumnWidth_8d05769abc6a INTEGER;
  p_AllowUpdateAPI_8d05769abc6a BOOLEAN;
  p_AllowUpdateInView_8d05769abc6a BOOLEAN;
  p_IncludeInUserSearchAPI_8d05769abc6a BOOLEAN;
  p_FullTextSearchEnabled_8d05769abc6a BOOLEAN;
  p_UserSearchParamFormatAPI_8d05769abc6a VARCHAR(500);
  p_IncludeInGeneratedForm_8d05769abc6a BOOLEAN;
  p_GeneratedFormSection_8d05769abc6a VARCHAR(10);
  p_IsNameField_8d05769abc6a BOOLEAN;
  p_RelatedEntityID_8d05769abc6a UUID;
  p_RelatedEntityFieldName_8d05769abc6a VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_8d05769abc6a BOOLEAN;
  p_RelatedEntityNameFieldMap_8d05769abc6a VARCHAR(255);
  p_RelatedEntityDisplayType_8d05769abc6a VARCHAR(20);
  p_EntityIDFieldName_8d05769abc6a VARCHAR(100);
  p_ScopeDefault_8d05769abc6a VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_8d05769abc6a BOOLEAN;
  p_ValuesToPackWithSchema_8d05769abc6a VARCHAR(10);
  p_Status_8d05769abc6a VARCHAR(25);
  p_AutoUpdateIsNameField_8d05769abc6a BOOLEAN;
  p_AutoUpdateDefaultInView_8d05769abc6a BOOLEAN;
  p_AutoUpdateCategory_8d05769abc6a BOOLEAN;
  p_AutoUpdateDisplayName_8d05769abc6a BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_8d05769abc6a BOOLEAN;
  p_Encrypt_8d05769abc6a BOOLEAN;
  p_EncryptionKeyID_8d05769abc6a UUID;
  p_AllowDecryptInAPI_8d05769abc6a BOOLEAN;
  p_SendEncryptedValue_8d05769abc6a BOOLEAN;
  p_IsSoftPrimaryKey_8d05769abc6a BOOLEAN;
  p_IsSoftForeignKey_8d05769abc6a BOOLEAN;
  p_RelatedEntityJoinFields_8d05769abc6a TEXT;
  p_JSONType_8d05769abc6a VARCHAR(255);
  p_JSONTypeIsArray_8d05769abc6a BOOLEAN;
  p_JSONTypeDefinition_8d05769abc6a TEXT;
  p_UserSearchPredicateAPI_8d05769abc6a VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_8d05769abc6a BOOLEAN;
  p_AutoUpdateFullTextSearch_8d05769abc6a BOOLEAN;
  p_AutoUpdateExtendedType_8d05769abc6a BOOLEAN;
  p_IsComputed_8d05769abc6a BOOLEAN;
  p_EmbeddedRecord_8d05769abc6a TEXT;
  p_Configuration_8d05769abc6a TEXT;
  p_ID_8d05769abc6a UUID;
BEGIN
  p_DisplayName_8d05769abc6a := 'First Received At';
  p_Description_8d05769abc6a := 'When Orders first received this event.';
  p_AutoUpdateDescription_8d05769abc6a := TRUE;
  p_IsPrimaryKey_8d05769abc6a := FALSE;
  p_IsUnique_8d05769abc6a := FALSE;
  p_Category_8d05769abc6a := 'Receipt History';
  p_ValueListType_8d05769abc6a := 'None';
  p_DefaultInView_8d05769abc6a := TRUE;
  p_DefaultColumnWidth_8d05769abc6a := 100;
  p_AllowUpdateAPI_8d05769abc6a := TRUE;
  p_AllowUpdateInView_8d05769abc6a := TRUE;
  p_IncludeInUserSearchAPI_8d05769abc6a := FALSE;
  p_FullTextSearchEnabled_8d05769abc6a := FALSE;
  p_IncludeInGeneratedForm_8d05769abc6a := TRUE;
  p_GeneratedFormSection_8d05769abc6a := 'Category';
  p_IsNameField_8d05769abc6a := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_8d05769abc6a := FALSE;
  p_RelatedEntityDisplayType_8d05769abc6a := 'Search';
  p_AutoUpdateRelatedEntityInfo_8d05769abc6a := TRUE;
  p_ValuesToPackWithSchema_8d05769abc6a := 'Auto';
  p_Status_8d05769abc6a := 'Active';
  p_AutoUpdateIsNameField_8d05769abc6a := TRUE;
  p_AutoUpdateDefaultInView_8d05769abc6a := TRUE;
  p_AutoUpdateCategory_8d05769abc6a := TRUE;
  p_AutoUpdateDisplayName_8d05769abc6a := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_8d05769abc6a := TRUE;
  p_Encrypt_8d05769abc6a := FALSE;
  p_AllowDecryptInAPI_8d05769abc6a := FALSE;
  p_SendEncryptedValue_8d05769abc6a := FALSE;
  p_IsSoftPrimaryKey_8d05769abc6a := FALSE;
  p_IsSoftForeignKey_8d05769abc6a := FALSE;
  p_JSONTypeIsArray_8d05769abc6a := FALSE;
  p_UserSearchPredicateAPI_8d05769abc6a := 'Contains';
  p_AutoUpdateUserSearchPredicate_8d05769abc6a := TRUE;
  p_AutoUpdateFullTextSearch_8d05769abc6a := TRUE;
  p_AutoUpdateExtendedType_8d05769abc6a := TRUE;
  p_IsComputed_8d05769abc6a := FALSE;
  p_ID_8d05769abc6a := '51E65A25-0A7C-412C-9F47-502D6359A289';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_8d05769abc6a,
    'Description', p_Description_8d05769abc6a,
    'AutoUpdateDescription', p_AutoUpdateDescription_8d05769abc6a,
    'IsPrimaryKey', p_IsPrimaryKey_8d05769abc6a,
    'IsUnique', p_IsUnique_8d05769abc6a,
    'Category', p_Category_8d05769abc6a,
    'ValueListType', p_ValueListType_8d05769abc6a,
    'ExtendedType', p_ExtendedType_8d05769abc6a,
    'CodeType', p_CodeType_8d05769abc6a,
    'DefaultInView', p_DefaultInView_8d05769abc6a,
    'ViewCellTemplate', p_ViewCellTemplate_8d05769abc6a,
    'DefaultColumnWidth', p_DefaultColumnWidth_8d05769abc6a,
    'AllowUpdateAPI', p_AllowUpdateAPI_8d05769abc6a,
    'AllowUpdateInView', p_AllowUpdateInView_8d05769abc6a,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_8d05769abc6a,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_8d05769abc6a,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_8d05769abc6a,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_8d05769abc6a,
    'GeneratedFormSection', p_GeneratedFormSection_8d05769abc6a,
    'IsNameField', p_IsNameField_8d05769abc6a,
    'RelatedEntityID', p_RelatedEntityID_8d05769abc6a,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_8d05769abc6a,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_8d05769abc6a,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_8d05769abc6a,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_8d05769abc6a,
    'EntityIDFieldName', p_EntityIDFieldName_8d05769abc6a,
    'ScopeDefault', p_ScopeDefault_8d05769abc6a,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_8d05769abc6a,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_8d05769abc6a,
    'Status', p_Status_8d05769abc6a,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_8d05769abc6a,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_8d05769abc6a,
    'AutoUpdateCategory', p_AutoUpdateCategory_8d05769abc6a,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_8d05769abc6a,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_8d05769abc6a,
    'Encrypt', p_Encrypt_8d05769abc6a,
    'EncryptionKeyID', p_EncryptionKeyID_8d05769abc6a,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_8d05769abc6a,
    'SendEncryptedValue', p_SendEncryptedValue_8d05769abc6a,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_8d05769abc6a,
    'IsSoftForeignKey', p_IsSoftForeignKey_8d05769abc6a,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_8d05769abc6a,
    'JSONType', p_JSONType_8d05769abc6a,
    'JSONTypeIsArray', p_JSONTypeIsArray_8d05769abc6a,
    'JSONTypeDefinition', p_JSONTypeDefinition_8d05769abc6a,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_8d05769abc6a,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_8d05769abc6a,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_8d05769abc6a,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_8d05769abc6a,
    'IsComputed', p_IsComputed_8d05769abc6a
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_8d05769abc6a,
    'Configuration', p_Configuration_8d05769abc6a,
    'ID', p_ID_8d05769abc6a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_8d05769abc6a, p_Description := p_Description_8d05769abc6a, p_AutoUpdateDescription := p_AutoUpdateDescription_8d05769abc6a, p_IsPrimaryKey := p_IsPrimaryKey_8d05769abc6a, p_IsUnique := p_IsUnique_8d05769abc6a, p_Category := p_Category_8d05769abc6a, p_ValueListType := p_ValueListType_8d05769abc6a, p_ExtendedType := p_ExtendedType_8d05769abc6a, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_8d05769abc6a, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_8d05769abc6a, p_ViewCellTemplate := p_ViewCellTemplate_8d05769abc6a, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_8d05769abc6a, p_AllowUpdateAPI := p_AllowUpdateAPI_8d05769abc6a, p_AllowUpdateInView := p_AllowUpdateInView_8d05769abc6a, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_8d05769abc6a, p_FullTextSearchEnabled := p_FullTextSearchEnabled_8d05769abc6a, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_8d05769abc6a, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_8d05769abc6a, p_GeneratedFormSection := p_GeneratedFormSection_8d05769abc6a, p_IsNameField := p_IsNameField_8d05769abc6a, p_RelatedEntityID := p_RelatedEntityID_8d05769abc6a, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_8d05769abc6a, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_8d05769abc6a, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_8d05769abc6a, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_8d05769abc6a, p_EntityIDFieldName := p_EntityIDFieldName_8d05769abc6a, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_8d05769abc6a, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_8d05769abc6a, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_8d05769abc6a, p_Status := p_Status_8d05769abc6a, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_8d05769abc6a, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_8d05769abc6a, p_AutoUpdateCategory := p_AutoUpdateCategory_8d05769abc6a, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_8d05769abc6a, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_8d05769abc6a, p_Encrypt := p_Encrypt_8d05769abc6a, p_EncryptionKeyID := p_EncryptionKeyID_8d05769abc6a, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_8d05769abc6a, p_SendEncryptedValue := p_SendEncryptedValue_8d05769abc6a, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_8d05769abc6a, p_IsSoftForeignKey := p_IsSoftForeignKey_8d05769abc6a, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_8d05769abc6a, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_8d05769abc6a, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_8d05769abc6a, p_JSONTypeDefinition := p_JSONTypeDefinition_8d05769abc6a, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_8d05769abc6a, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_8d05769abc6a, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_8d05769abc6a, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_8d05769abc6a, p_IsComputed := p_IsComputed_8d05769abc6a, p_EmbeddedRecord := p_EmbeddedRecord_8d05769abc6a, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_8d05769abc6a, p_Configuration_Clear := TRUE, p_ID := p_ID_8d05769abc6a);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_7fb98e4d5ba4 VARCHAR(255);
  p_Description_7fb98e4d5ba4 TEXT;
  p_AutoUpdateDescription_7fb98e4d5ba4 BOOLEAN;
  p_IsPrimaryKey_7fb98e4d5ba4 BOOLEAN;
  p_IsUnique_7fb98e4d5ba4 BOOLEAN;
  p_Category_7fb98e4d5ba4 VARCHAR(255);
  p_ValueListType_7fb98e4d5ba4 VARCHAR(20);
  p_ExtendedType_7fb98e4d5ba4 VARCHAR(50);
  p_CodeType_7fb98e4d5ba4 VARCHAR(50);
  p_DefaultInView_7fb98e4d5ba4 BOOLEAN;
  p_ViewCellTemplate_7fb98e4d5ba4 TEXT;
  p_DefaultColumnWidth_7fb98e4d5ba4 INTEGER;
  p_AllowUpdateAPI_7fb98e4d5ba4 BOOLEAN;
  p_AllowUpdateInView_7fb98e4d5ba4 BOOLEAN;
  p_IncludeInUserSearchAPI_7fb98e4d5ba4 BOOLEAN;
  p_FullTextSearchEnabled_7fb98e4d5ba4 BOOLEAN;
  p_UserSearchParamFormatAPI_7fb98e4d5ba4 VARCHAR(500);
  p_IncludeInGeneratedForm_7fb98e4d5ba4 BOOLEAN;
  p_GeneratedFormSection_7fb98e4d5ba4 VARCHAR(10);
  p_IsNameField_7fb98e4d5ba4 BOOLEAN;
  p_RelatedEntityID_7fb98e4d5ba4 UUID;
  p_RelatedEntityFieldName_7fb98e4d5ba4 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_7fb98e4d5ba4 BOOLEAN;
  p_RelatedEntityNameFieldMap_7fb98e4d5ba4 VARCHAR(255);
  p_RelatedEntityDisplayType_7fb98e4d5ba4 VARCHAR(20);
  p_EntityIDFieldName_7fb98e4d5ba4 VARCHAR(100);
  p_ScopeDefault_7fb98e4d5ba4 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_7fb98e4d5ba4 BOOLEAN;
  p_ValuesToPackWithSchema_7fb98e4d5ba4 VARCHAR(10);
  p_Status_7fb98e4d5ba4 VARCHAR(25);
  p_AutoUpdateIsNameField_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateDefaultInView_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateCategory_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateDisplayName_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_7fb98e4d5ba4 BOOLEAN;
  p_Encrypt_7fb98e4d5ba4 BOOLEAN;
  p_EncryptionKeyID_7fb98e4d5ba4 UUID;
  p_AllowDecryptInAPI_7fb98e4d5ba4 BOOLEAN;
  p_SendEncryptedValue_7fb98e4d5ba4 BOOLEAN;
  p_IsSoftPrimaryKey_7fb98e4d5ba4 BOOLEAN;
  p_IsSoftForeignKey_7fb98e4d5ba4 BOOLEAN;
  p_RelatedEntityJoinFields_7fb98e4d5ba4 TEXT;
  p_JSONType_7fb98e4d5ba4 VARCHAR(255);
  p_JSONTypeIsArray_7fb98e4d5ba4 BOOLEAN;
  p_JSONTypeDefinition_7fb98e4d5ba4 TEXT;
  p_UserSearchPredicateAPI_7fb98e4d5ba4 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateFullTextSearch_7fb98e4d5ba4 BOOLEAN;
  p_AutoUpdateExtendedType_7fb98e4d5ba4 BOOLEAN;
  p_IsComputed_7fb98e4d5ba4 BOOLEAN;
  p_EmbeddedRecord_7fb98e4d5ba4 TEXT;
  p_Configuration_7fb98e4d5ba4 TEXT;
  p_ID_7fb98e4d5ba4 UUID;
BEGIN
  p_DisplayName_7fb98e4d5ba4 := 'Last Received At';
  p_Description_7fb98e4d5ba4 := 'When Orders last received this event. Differs from FirstReceivedAt when the gateway redelivered it.';
  p_AutoUpdateDescription_7fb98e4d5ba4 := TRUE;
  p_IsPrimaryKey_7fb98e4d5ba4 := FALSE;
  p_IsUnique_7fb98e4d5ba4 := FALSE;
  p_Category_7fb98e4d5ba4 := 'Receipt History';
  p_ValueListType_7fb98e4d5ba4 := 'None';
  p_DefaultInView_7fb98e4d5ba4 := TRUE;
  p_DefaultColumnWidth_7fb98e4d5ba4 := 100;
  p_AllowUpdateAPI_7fb98e4d5ba4 := TRUE;
  p_AllowUpdateInView_7fb98e4d5ba4 := TRUE;
  p_IncludeInUserSearchAPI_7fb98e4d5ba4 := FALSE;
  p_FullTextSearchEnabled_7fb98e4d5ba4 := FALSE;
  p_IncludeInGeneratedForm_7fb98e4d5ba4 := TRUE;
  p_GeneratedFormSection_7fb98e4d5ba4 := 'Category';
  p_IsNameField_7fb98e4d5ba4 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_7fb98e4d5ba4 := FALSE;
  p_RelatedEntityDisplayType_7fb98e4d5ba4 := 'Search';
  p_AutoUpdateRelatedEntityInfo_7fb98e4d5ba4 := TRUE;
  p_ValuesToPackWithSchema_7fb98e4d5ba4 := 'Auto';
  p_Status_7fb98e4d5ba4 := 'Active';
  p_AutoUpdateIsNameField_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateDefaultInView_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateCategory_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateDisplayName_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_7fb98e4d5ba4 := TRUE;
  p_Encrypt_7fb98e4d5ba4 := FALSE;
  p_AllowDecryptInAPI_7fb98e4d5ba4 := FALSE;
  p_SendEncryptedValue_7fb98e4d5ba4 := FALSE;
  p_IsSoftPrimaryKey_7fb98e4d5ba4 := FALSE;
  p_IsSoftForeignKey_7fb98e4d5ba4 := FALSE;
  p_JSONTypeIsArray_7fb98e4d5ba4 := FALSE;
  p_UserSearchPredicateAPI_7fb98e4d5ba4 := 'Contains';
  p_AutoUpdateUserSearchPredicate_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateFullTextSearch_7fb98e4d5ba4 := TRUE;
  p_AutoUpdateExtendedType_7fb98e4d5ba4 := TRUE;
  p_IsComputed_7fb98e4d5ba4 := FALSE;
  p_ID_7fb98e4d5ba4 := 'C8418EC5-3F3C-44DD-9E53-704FC023C956';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_7fb98e4d5ba4,
    'Description', p_Description_7fb98e4d5ba4,
    'AutoUpdateDescription', p_AutoUpdateDescription_7fb98e4d5ba4,
    'IsPrimaryKey', p_IsPrimaryKey_7fb98e4d5ba4,
    'IsUnique', p_IsUnique_7fb98e4d5ba4,
    'Category', p_Category_7fb98e4d5ba4,
    'ValueListType', p_ValueListType_7fb98e4d5ba4,
    'ExtendedType', p_ExtendedType_7fb98e4d5ba4,
    'CodeType', p_CodeType_7fb98e4d5ba4,
    'DefaultInView', p_DefaultInView_7fb98e4d5ba4,
    'ViewCellTemplate', p_ViewCellTemplate_7fb98e4d5ba4,
    'DefaultColumnWidth', p_DefaultColumnWidth_7fb98e4d5ba4,
    'AllowUpdateAPI', p_AllowUpdateAPI_7fb98e4d5ba4,
    'AllowUpdateInView', p_AllowUpdateInView_7fb98e4d5ba4,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_7fb98e4d5ba4,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_7fb98e4d5ba4,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_7fb98e4d5ba4,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_7fb98e4d5ba4,
    'GeneratedFormSection', p_GeneratedFormSection_7fb98e4d5ba4,
    'IsNameField', p_IsNameField_7fb98e4d5ba4,
    'RelatedEntityID', p_RelatedEntityID_7fb98e4d5ba4,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_7fb98e4d5ba4,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_7fb98e4d5ba4,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_7fb98e4d5ba4,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_7fb98e4d5ba4,
    'EntityIDFieldName', p_EntityIDFieldName_7fb98e4d5ba4,
    'ScopeDefault', p_ScopeDefault_7fb98e4d5ba4,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_7fb98e4d5ba4,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_7fb98e4d5ba4,
    'Status', p_Status_7fb98e4d5ba4,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_7fb98e4d5ba4,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_7fb98e4d5ba4,
    'AutoUpdateCategory', p_AutoUpdateCategory_7fb98e4d5ba4,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_7fb98e4d5ba4,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_7fb98e4d5ba4,
    'Encrypt', p_Encrypt_7fb98e4d5ba4,
    'EncryptionKeyID', p_EncryptionKeyID_7fb98e4d5ba4,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_7fb98e4d5ba4,
    'SendEncryptedValue', p_SendEncryptedValue_7fb98e4d5ba4,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_7fb98e4d5ba4,
    'IsSoftForeignKey', p_IsSoftForeignKey_7fb98e4d5ba4,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_7fb98e4d5ba4,
    'JSONType', p_JSONType_7fb98e4d5ba4,
    'JSONTypeIsArray', p_JSONTypeIsArray_7fb98e4d5ba4,
    'JSONTypeDefinition', p_JSONTypeDefinition_7fb98e4d5ba4,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_7fb98e4d5ba4,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_7fb98e4d5ba4,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_7fb98e4d5ba4,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_7fb98e4d5ba4,
    'IsComputed', p_IsComputed_7fb98e4d5ba4
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_7fb98e4d5ba4,
    'Configuration', p_Configuration_7fb98e4d5ba4,
    'ID', p_ID_7fb98e4d5ba4
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_7fb98e4d5ba4, p_Description := p_Description_7fb98e4d5ba4, p_AutoUpdateDescription := p_AutoUpdateDescription_7fb98e4d5ba4, p_IsPrimaryKey := p_IsPrimaryKey_7fb98e4d5ba4, p_IsUnique := p_IsUnique_7fb98e4d5ba4, p_Category := p_Category_7fb98e4d5ba4, p_ValueListType := p_ValueListType_7fb98e4d5ba4, p_ExtendedType := p_ExtendedType_7fb98e4d5ba4, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_7fb98e4d5ba4, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_7fb98e4d5ba4, p_ViewCellTemplate := p_ViewCellTemplate_7fb98e4d5ba4, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_7fb98e4d5ba4, p_AllowUpdateAPI := p_AllowUpdateAPI_7fb98e4d5ba4, p_AllowUpdateInView := p_AllowUpdateInView_7fb98e4d5ba4, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_7fb98e4d5ba4, p_FullTextSearchEnabled := p_FullTextSearchEnabled_7fb98e4d5ba4, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_7fb98e4d5ba4, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_7fb98e4d5ba4, p_GeneratedFormSection := p_GeneratedFormSection_7fb98e4d5ba4, p_IsNameField := p_IsNameField_7fb98e4d5ba4, p_RelatedEntityID := p_RelatedEntityID_7fb98e4d5ba4, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_7fb98e4d5ba4, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_7fb98e4d5ba4, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_7fb98e4d5ba4, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_7fb98e4d5ba4, p_EntityIDFieldName := p_EntityIDFieldName_7fb98e4d5ba4, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_7fb98e4d5ba4, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_7fb98e4d5ba4, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_7fb98e4d5ba4, p_Status := p_Status_7fb98e4d5ba4, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_7fb98e4d5ba4, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_7fb98e4d5ba4, p_AutoUpdateCategory := p_AutoUpdateCategory_7fb98e4d5ba4, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_7fb98e4d5ba4, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_7fb98e4d5ba4, p_Encrypt := p_Encrypt_7fb98e4d5ba4, p_EncryptionKeyID := p_EncryptionKeyID_7fb98e4d5ba4, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_7fb98e4d5ba4, p_SendEncryptedValue := p_SendEncryptedValue_7fb98e4d5ba4, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_7fb98e4d5ba4, p_IsSoftForeignKey := p_IsSoftForeignKey_7fb98e4d5ba4, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_7fb98e4d5ba4, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_7fb98e4d5ba4, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_7fb98e4d5ba4, p_JSONTypeDefinition := p_JSONTypeDefinition_7fb98e4d5ba4, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_7fb98e4d5ba4, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_7fb98e4d5ba4, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_7fb98e4d5ba4, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_7fb98e4d5ba4, p_IsComputed := p_IsComputed_7fb98e4d5ba4, p_EmbeddedRecord := p_EmbeddedRecord_7fb98e4d5ba4, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_7fb98e4d5ba4, p_Configuration_Clear := TRUE, p_ID := p_ID_7fb98e4d5ba4);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_8ab47d2ba426 VARCHAR(255);
  p_Description_8ab47d2ba426 TEXT;
  p_AutoUpdateDescription_8ab47d2ba426 BOOLEAN;
  p_IsPrimaryKey_8ab47d2ba426 BOOLEAN;
  p_IsUnique_8ab47d2ba426 BOOLEAN;
  p_Category_8ab47d2ba426 VARCHAR(255);
  p_ValueListType_8ab47d2ba426 VARCHAR(20);
  p_ExtendedType_8ab47d2ba426 VARCHAR(50);
  p_CodeType_8ab47d2ba426 VARCHAR(50);
  p_DefaultInView_8ab47d2ba426 BOOLEAN;
  p_ViewCellTemplate_8ab47d2ba426 TEXT;
  p_DefaultColumnWidth_8ab47d2ba426 INTEGER;
  p_AllowUpdateAPI_8ab47d2ba426 BOOLEAN;
  p_AllowUpdateInView_8ab47d2ba426 BOOLEAN;
  p_IncludeInUserSearchAPI_8ab47d2ba426 BOOLEAN;
  p_FullTextSearchEnabled_8ab47d2ba426 BOOLEAN;
  p_UserSearchParamFormatAPI_8ab47d2ba426 VARCHAR(500);
  p_IncludeInGeneratedForm_8ab47d2ba426 BOOLEAN;
  p_GeneratedFormSection_8ab47d2ba426 VARCHAR(10);
  p_IsNameField_8ab47d2ba426 BOOLEAN;
  p_RelatedEntityID_8ab47d2ba426 UUID;
  p_RelatedEntityFieldName_8ab47d2ba426 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_8ab47d2ba426 BOOLEAN;
  p_RelatedEntityNameFieldMap_8ab47d2ba426 VARCHAR(255);
  p_RelatedEntityDisplayType_8ab47d2ba426 VARCHAR(20);
  p_EntityIDFieldName_8ab47d2ba426 VARCHAR(100);
  p_ScopeDefault_8ab47d2ba426 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_8ab47d2ba426 BOOLEAN;
  p_ValuesToPackWithSchema_8ab47d2ba426 VARCHAR(10);
  p_Status_8ab47d2ba426 VARCHAR(25);
  p_AutoUpdateIsNameField_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateDefaultInView_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateCategory_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateDisplayName_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_8ab47d2ba426 BOOLEAN;
  p_Encrypt_8ab47d2ba426 BOOLEAN;
  p_EncryptionKeyID_8ab47d2ba426 UUID;
  p_AllowDecryptInAPI_8ab47d2ba426 BOOLEAN;
  p_SendEncryptedValue_8ab47d2ba426 BOOLEAN;
  p_IsSoftPrimaryKey_8ab47d2ba426 BOOLEAN;
  p_IsSoftForeignKey_8ab47d2ba426 BOOLEAN;
  p_RelatedEntityJoinFields_8ab47d2ba426 TEXT;
  p_JSONType_8ab47d2ba426 VARCHAR(255);
  p_JSONTypeIsArray_8ab47d2ba426 BOOLEAN;
  p_JSONTypeDefinition_8ab47d2ba426 TEXT;
  p_UserSearchPredicateAPI_8ab47d2ba426 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateFullTextSearch_8ab47d2ba426 BOOLEAN;
  p_AutoUpdateExtendedType_8ab47d2ba426 BOOLEAN;
  p_IsComputed_8ab47d2ba426 BOOLEAN;
  p_EmbeddedRecord_8ab47d2ba426 TEXT;
  p_Configuration_8ab47d2ba426 TEXT;
  p_ID_8ab47d2ba426 UUID;
BEGIN
  p_DisplayName_8ab47d2ba426 := 'Outcome';
  p_Description_8ab47d2ba426 := 'What Orders did with the latest delivery of this event. Applied: recorded against the intent. AlreadyApplied: a repeat or out-of-order event, answered without changing anything. Ignored: an event kind Orders does not act on, or an intent it did not open. Rejected: verified but unreadable or without an id. Failed: Orders could not record a valid event and asked the gateway to retry.';
  p_AutoUpdateDescription_8ab47d2ba426 := TRUE;
  p_IsPrimaryKey_8ab47d2ba426 := FALSE;
  p_IsUnique_8ab47d2ba426 := FALSE;
  p_Category_8ab47d2ba426 := 'Outcome';
  p_ValueListType_8ab47d2ba426 := 'List';
  p_DefaultInView_8ab47d2ba426 := TRUE;
  p_DefaultColumnWidth_8ab47d2ba426 := 150;
  p_AllowUpdateAPI_8ab47d2ba426 := TRUE;
  p_AllowUpdateInView_8ab47d2ba426 := TRUE;
  p_IncludeInUserSearchAPI_8ab47d2ba426 := FALSE;
  p_FullTextSearchEnabled_8ab47d2ba426 := FALSE;
  p_IncludeInGeneratedForm_8ab47d2ba426 := TRUE;
  p_GeneratedFormSection_8ab47d2ba426 := 'Category';
  p_IsNameField_8ab47d2ba426 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_8ab47d2ba426 := FALSE;
  p_RelatedEntityDisplayType_8ab47d2ba426 := 'Search';
  p_AutoUpdateRelatedEntityInfo_8ab47d2ba426 := TRUE;
  p_ValuesToPackWithSchema_8ab47d2ba426 := 'Auto';
  p_Status_8ab47d2ba426 := 'Active';
  p_AutoUpdateIsNameField_8ab47d2ba426 := TRUE;
  p_AutoUpdateDefaultInView_8ab47d2ba426 := TRUE;
  p_AutoUpdateCategory_8ab47d2ba426 := TRUE;
  p_AutoUpdateDisplayName_8ab47d2ba426 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_8ab47d2ba426 := TRUE;
  p_Encrypt_8ab47d2ba426 := FALSE;
  p_AllowDecryptInAPI_8ab47d2ba426 := FALSE;
  p_SendEncryptedValue_8ab47d2ba426 := FALSE;
  p_IsSoftPrimaryKey_8ab47d2ba426 := FALSE;
  p_IsSoftForeignKey_8ab47d2ba426 := FALSE;
  p_JSONTypeIsArray_8ab47d2ba426 := FALSE;
  p_UserSearchPredicateAPI_8ab47d2ba426 := 'Contains';
  p_AutoUpdateUserSearchPredicate_8ab47d2ba426 := TRUE;
  p_AutoUpdateFullTextSearch_8ab47d2ba426 := TRUE;
  p_AutoUpdateExtendedType_8ab47d2ba426 := TRUE;
  p_IsComputed_8ab47d2ba426 := FALSE;
  p_ID_8ab47d2ba426 := '64AF75F2-8846-4F4B-91E6-06A1CDFC53DA';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_8ab47d2ba426,
    'Description', p_Description_8ab47d2ba426,
    'AutoUpdateDescription', p_AutoUpdateDescription_8ab47d2ba426,
    'IsPrimaryKey', p_IsPrimaryKey_8ab47d2ba426,
    'IsUnique', p_IsUnique_8ab47d2ba426,
    'Category', p_Category_8ab47d2ba426,
    'ValueListType', p_ValueListType_8ab47d2ba426,
    'ExtendedType', p_ExtendedType_8ab47d2ba426,
    'CodeType', p_CodeType_8ab47d2ba426,
    'DefaultInView', p_DefaultInView_8ab47d2ba426,
    'ViewCellTemplate', p_ViewCellTemplate_8ab47d2ba426,
    'DefaultColumnWidth', p_DefaultColumnWidth_8ab47d2ba426,
    'AllowUpdateAPI', p_AllowUpdateAPI_8ab47d2ba426,
    'AllowUpdateInView', p_AllowUpdateInView_8ab47d2ba426,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_8ab47d2ba426,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_8ab47d2ba426,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_8ab47d2ba426,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_8ab47d2ba426,
    'GeneratedFormSection', p_GeneratedFormSection_8ab47d2ba426,
    'IsNameField', p_IsNameField_8ab47d2ba426,
    'RelatedEntityID', p_RelatedEntityID_8ab47d2ba426,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_8ab47d2ba426,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_8ab47d2ba426,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_8ab47d2ba426,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_8ab47d2ba426,
    'EntityIDFieldName', p_EntityIDFieldName_8ab47d2ba426,
    'ScopeDefault', p_ScopeDefault_8ab47d2ba426,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_8ab47d2ba426,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_8ab47d2ba426,
    'Status', p_Status_8ab47d2ba426,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_8ab47d2ba426,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_8ab47d2ba426,
    'AutoUpdateCategory', p_AutoUpdateCategory_8ab47d2ba426,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_8ab47d2ba426,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_8ab47d2ba426,
    'Encrypt', p_Encrypt_8ab47d2ba426,
    'EncryptionKeyID', p_EncryptionKeyID_8ab47d2ba426,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_8ab47d2ba426,
    'SendEncryptedValue', p_SendEncryptedValue_8ab47d2ba426,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_8ab47d2ba426,
    'IsSoftForeignKey', p_IsSoftForeignKey_8ab47d2ba426,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_8ab47d2ba426,
    'JSONType', p_JSONType_8ab47d2ba426,
    'JSONTypeIsArray', p_JSONTypeIsArray_8ab47d2ba426,
    'JSONTypeDefinition', p_JSONTypeDefinition_8ab47d2ba426,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_8ab47d2ba426,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_8ab47d2ba426,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_8ab47d2ba426,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_8ab47d2ba426,
    'IsComputed', p_IsComputed_8ab47d2ba426
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_8ab47d2ba426,
    'Configuration', p_Configuration_8ab47d2ba426,
    'ID', p_ID_8ab47d2ba426
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_8ab47d2ba426, p_Description := p_Description_8ab47d2ba426, p_AutoUpdateDescription := p_AutoUpdateDescription_8ab47d2ba426, p_IsPrimaryKey := p_IsPrimaryKey_8ab47d2ba426, p_IsUnique := p_IsUnique_8ab47d2ba426, p_Category := p_Category_8ab47d2ba426, p_ValueListType := p_ValueListType_8ab47d2ba426, p_ExtendedType := p_ExtendedType_8ab47d2ba426, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_8ab47d2ba426, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_8ab47d2ba426, p_ViewCellTemplate := p_ViewCellTemplate_8ab47d2ba426, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_8ab47d2ba426, p_AllowUpdateAPI := p_AllowUpdateAPI_8ab47d2ba426, p_AllowUpdateInView := p_AllowUpdateInView_8ab47d2ba426, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_8ab47d2ba426, p_FullTextSearchEnabled := p_FullTextSearchEnabled_8ab47d2ba426, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_8ab47d2ba426, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_8ab47d2ba426, p_GeneratedFormSection := p_GeneratedFormSection_8ab47d2ba426, p_IsNameField := p_IsNameField_8ab47d2ba426, p_RelatedEntityID := p_RelatedEntityID_8ab47d2ba426, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_8ab47d2ba426, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_8ab47d2ba426, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_8ab47d2ba426, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_8ab47d2ba426, p_EntityIDFieldName := p_EntityIDFieldName_8ab47d2ba426, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_8ab47d2ba426, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_8ab47d2ba426, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_8ab47d2ba426, p_Status := p_Status_8ab47d2ba426, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_8ab47d2ba426, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_8ab47d2ba426, p_AutoUpdateCategory := p_AutoUpdateCategory_8ab47d2ba426, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_8ab47d2ba426, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_8ab47d2ba426, p_Encrypt := p_Encrypt_8ab47d2ba426, p_EncryptionKeyID := p_EncryptionKeyID_8ab47d2ba426, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_8ab47d2ba426, p_SendEncryptedValue := p_SendEncryptedValue_8ab47d2ba426, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_8ab47d2ba426, p_IsSoftForeignKey := p_IsSoftForeignKey_8ab47d2ba426, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_8ab47d2ba426, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_8ab47d2ba426, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_8ab47d2ba426, p_JSONTypeDefinition := p_JSONTypeDefinition_8ab47d2ba426, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_8ab47d2ba426, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_8ab47d2ba426, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_8ab47d2ba426, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_8ab47d2ba426, p_IsComputed := p_IsComputed_8ab47d2ba426, p_EmbeddedRecord := p_EmbeddedRecord_8ab47d2ba426, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_8ab47d2ba426, p_Configuration_Clear := TRUE, p_ID := p_ID_8ab47d2ba426);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_55b59c2bb2cd VARCHAR(255);
  p_Description_55b59c2bb2cd TEXT;
  p_AutoUpdateDescription_55b59c2bb2cd BOOLEAN;
  p_IsPrimaryKey_55b59c2bb2cd BOOLEAN;
  p_IsUnique_55b59c2bb2cd BOOLEAN;
  p_Category_55b59c2bb2cd VARCHAR(255);
  p_ValueListType_55b59c2bb2cd VARCHAR(20);
  p_ExtendedType_55b59c2bb2cd VARCHAR(50);
  p_CodeType_55b59c2bb2cd VARCHAR(50);
  p_DefaultInView_55b59c2bb2cd BOOLEAN;
  p_ViewCellTemplate_55b59c2bb2cd TEXT;
  p_DefaultColumnWidth_55b59c2bb2cd INTEGER;
  p_AllowUpdateAPI_55b59c2bb2cd BOOLEAN;
  p_AllowUpdateInView_55b59c2bb2cd BOOLEAN;
  p_IncludeInUserSearchAPI_55b59c2bb2cd BOOLEAN;
  p_FullTextSearchEnabled_55b59c2bb2cd BOOLEAN;
  p_UserSearchParamFormatAPI_55b59c2bb2cd VARCHAR(500);
  p_IncludeInGeneratedForm_55b59c2bb2cd BOOLEAN;
  p_GeneratedFormSection_55b59c2bb2cd VARCHAR(10);
  p_IsNameField_55b59c2bb2cd BOOLEAN;
  p_RelatedEntityID_55b59c2bb2cd UUID;
  p_RelatedEntityFieldName_55b59c2bb2cd VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_55b59c2bb2cd BOOLEAN;
  p_RelatedEntityNameFieldMap_55b59c2bb2cd VARCHAR(255);
  p_RelatedEntityDisplayType_55b59c2bb2cd VARCHAR(20);
  p_EntityIDFieldName_55b59c2bb2cd VARCHAR(100);
  p_ScopeDefault_55b59c2bb2cd VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_55b59c2bb2cd BOOLEAN;
  p_ValuesToPackWithSchema_55b59c2bb2cd VARCHAR(10);
  p_Status_55b59c2bb2cd VARCHAR(25);
  p_AutoUpdateIsNameField_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateDefaultInView_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateCategory_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateDisplayName_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_55b59c2bb2cd BOOLEAN;
  p_Encrypt_55b59c2bb2cd BOOLEAN;
  p_EncryptionKeyID_55b59c2bb2cd UUID;
  p_AllowDecryptInAPI_55b59c2bb2cd BOOLEAN;
  p_SendEncryptedValue_55b59c2bb2cd BOOLEAN;
  p_IsSoftPrimaryKey_55b59c2bb2cd BOOLEAN;
  p_IsSoftForeignKey_55b59c2bb2cd BOOLEAN;
  p_RelatedEntityJoinFields_55b59c2bb2cd TEXT;
  p_JSONType_55b59c2bb2cd VARCHAR(255);
  p_JSONTypeIsArray_55b59c2bb2cd BOOLEAN;
  p_JSONTypeDefinition_55b59c2bb2cd TEXT;
  p_UserSearchPredicateAPI_55b59c2bb2cd VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateFullTextSearch_55b59c2bb2cd BOOLEAN;
  p_AutoUpdateExtendedType_55b59c2bb2cd BOOLEAN;
  p_IsComputed_55b59c2bb2cd BOOLEAN;
  p_EmbeddedRecord_55b59c2bb2cd TEXT;
  p_Configuration_55b59c2bb2cd TEXT;
  p_ID_55b59c2bb2cd UUID;
BEGIN
  p_DisplayName_55b59c2bb2cd := 'Reason Code';
  p_Description_55b59c2bb2cd := 'Short machine-readable reason for the outcome, for filtering: kind_not_handled, unknown_intent, no_event_id, unreadable, duplicate, out_of_order, apply_failed. Null when the event was applied.';
  p_AutoUpdateDescription_55b59c2bb2cd := TRUE;
  p_IsPrimaryKey_55b59c2bb2cd := FALSE;
  p_IsUnique_55b59c2bb2cd := FALSE;
  p_Category_55b59c2bb2cd := 'Outcome';
  p_ValueListType_55b59c2bb2cd := 'None';
  p_DefaultInView_55b59c2bb2cd := TRUE;
  p_DefaultColumnWidth_55b59c2bb2cd := 150;
  p_AllowUpdateAPI_55b59c2bb2cd := TRUE;
  p_AllowUpdateInView_55b59c2bb2cd := TRUE;
  p_IncludeInUserSearchAPI_55b59c2bb2cd := FALSE;
  p_FullTextSearchEnabled_55b59c2bb2cd := FALSE;
  p_IncludeInGeneratedForm_55b59c2bb2cd := TRUE;
  p_GeneratedFormSection_55b59c2bb2cd := 'Category';
  p_IsNameField_55b59c2bb2cd := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_55b59c2bb2cd := FALSE;
  p_RelatedEntityDisplayType_55b59c2bb2cd := 'Search';
  p_AutoUpdateRelatedEntityInfo_55b59c2bb2cd := TRUE;
  p_ValuesToPackWithSchema_55b59c2bb2cd := 'Auto';
  p_Status_55b59c2bb2cd := 'Active';
  p_AutoUpdateIsNameField_55b59c2bb2cd := TRUE;
  p_AutoUpdateDefaultInView_55b59c2bb2cd := TRUE;
  p_AutoUpdateCategory_55b59c2bb2cd := TRUE;
  p_AutoUpdateDisplayName_55b59c2bb2cd := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_55b59c2bb2cd := TRUE;
  p_Encrypt_55b59c2bb2cd := FALSE;
  p_AllowDecryptInAPI_55b59c2bb2cd := FALSE;
  p_SendEncryptedValue_55b59c2bb2cd := FALSE;
  p_IsSoftPrimaryKey_55b59c2bb2cd := FALSE;
  p_IsSoftForeignKey_55b59c2bb2cd := FALSE;
  p_JSONTypeIsArray_55b59c2bb2cd := FALSE;
  p_UserSearchPredicateAPI_55b59c2bb2cd := 'Contains';
  p_AutoUpdateUserSearchPredicate_55b59c2bb2cd := TRUE;
  p_AutoUpdateFullTextSearch_55b59c2bb2cd := TRUE;
  p_AutoUpdateExtendedType_55b59c2bb2cd := TRUE;
  p_IsComputed_55b59c2bb2cd := FALSE;
  p_ID_55b59c2bb2cd := 'CFA0BE17-7C09-497B-BBA0-C7C86293D7FC';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_55b59c2bb2cd,
    'Description', p_Description_55b59c2bb2cd,
    'AutoUpdateDescription', p_AutoUpdateDescription_55b59c2bb2cd,
    'IsPrimaryKey', p_IsPrimaryKey_55b59c2bb2cd,
    'IsUnique', p_IsUnique_55b59c2bb2cd,
    'Category', p_Category_55b59c2bb2cd,
    'ValueListType', p_ValueListType_55b59c2bb2cd,
    'ExtendedType', p_ExtendedType_55b59c2bb2cd,
    'CodeType', p_CodeType_55b59c2bb2cd,
    'DefaultInView', p_DefaultInView_55b59c2bb2cd,
    'ViewCellTemplate', p_ViewCellTemplate_55b59c2bb2cd,
    'DefaultColumnWidth', p_DefaultColumnWidth_55b59c2bb2cd,
    'AllowUpdateAPI', p_AllowUpdateAPI_55b59c2bb2cd,
    'AllowUpdateInView', p_AllowUpdateInView_55b59c2bb2cd,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_55b59c2bb2cd,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_55b59c2bb2cd,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_55b59c2bb2cd,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_55b59c2bb2cd,
    'GeneratedFormSection', p_GeneratedFormSection_55b59c2bb2cd,
    'IsNameField', p_IsNameField_55b59c2bb2cd,
    'RelatedEntityID', p_RelatedEntityID_55b59c2bb2cd,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_55b59c2bb2cd,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_55b59c2bb2cd,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_55b59c2bb2cd,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_55b59c2bb2cd,
    'EntityIDFieldName', p_EntityIDFieldName_55b59c2bb2cd,
    'ScopeDefault', p_ScopeDefault_55b59c2bb2cd,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_55b59c2bb2cd,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_55b59c2bb2cd,
    'Status', p_Status_55b59c2bb2cd,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_55b59c2bb2cd,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_55b59c2bb2cd,
    'AutoUpdateCategory', p_AutoUpdateCategory_55b59c2bb2cd,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_55b59c2bb2cd,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_55b59c2bb2cd,
    'Encrypt', p_Encrypt_55b59c2bb2cd,
    'EncryptionKeyID', p_EncryptionKeyID_55b59c2bb2cd,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_55b59c2bb2cd,
    'SendEncryptedValue', p_SendEncryptedValue_55b59c2bb2cd,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_55b59c2bb2cd,
    'IsSoftForeignKey', p_IsSoftForeignKey_55b59c2bb2cd,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_55b59c2bb2cd,
    'JSONType', p_JSONType_55b59c2bb2cd,
    'JSONTypeIsArray', p_JSONTypeIsArray_55b59c2bb2cd,
    'JSONTypeDefinition', p_JSONTypeDefinition_55b59c2bb2cd,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_55b59c2bb2cd,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_55b59c2bb2cd,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_55b59c2bb2cd,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_55b59c2bb2cd,
    'IsComputed', p_IsComputed_55b59c2bb2cd
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_55b59c2bb2cd,
    'Configuration', p_Configuration_55b59c2bb2cd,
    'ID', p_ID_55b59c2bb2cd
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_55b59c2bb2cd, p_Description := p_Description_55b59c2bb2cd, p_AutoUpdateDescription := p_AutoUpdateDescription_55b59c2bb2cd, p_IsPrimaryKey := p_IsPrimaryKey_55b59c2bb2cd, p_IsUnique := p_IsUnique_55b59c2bb2cd, p_Category := p_Category_55b59c2bb2cd, p_ValueListType := p_ValueListType_55b59c2bb2cd, p_ExtendedType := p_ExtendedType_55b59c2bb2cd, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_55b59c2bb2cd, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_55b59c2bb2cd, p_ViewCellTemplate := p_ViewCellTemplate_55b59c2bb2cd, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_55b59c2bb2cd, p_AllowUpdateAPI := p_AllowUpdateAPI_55b59c2bb2cd, p_AllowUpdateInView := p_AllowUpdateInView_55b59c2bb2cd, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_55b59c2bb2cd, p_FullTextSearchEnabled := p_FullTextSearchEnabled_55b59c2bb2cd, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_55b59c2bb2cd, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_55b59c2bb2cd, p_GeneratedFormSection := p_GeneratedFormSection_55b59c2bb2cd, p_IsNameField := p_IsNameField_55b59c2bb2cd, p_RelatedEntityID := p_RelatedEntityID_55b59c2bb2cd, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_55b59c2bb2cd, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_55b59c2bb2cd, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_55b59c2bb2cd, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_55b59c2bb2cd, p_EntityIDFieldName := p_EntityIDFieldName_55b59c2bb2cd, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_55b59c2bb2cd, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_55b59c2bb2cd, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_55b59c2bb2cd, p_Status := p_Status_55b59c2bb2cd, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_55b59c2bb2cd, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_55b59c2bb2cd, p_AutoUpdateCategory := p_AutoUpdateCategory_55b59c2bb2cd, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_55b59c2bb2cd, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_55b59c2bb2cd, p_Encrypt := p_Encrypt_55b59c2bb2cd, p_EncryptionKeyID := p_EncryptionKeyID_55b59c2bb2cd, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_55b59c2bb2cd, p_SendEncryptedValue := p_SendEncryptedValue_55b59c2bb2cd, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_55b59c2bb2cd, p_IsSoftForeignKey := p_IsSoftForeignKey_55b59c2bb2cd, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_55b59c2bb2cd, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_55b59c2bb2cd, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_55b59c2bb2cd, p_JSONTypeDefinition := p_JSONTypeDefinition_55b59c2bb2cd, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_55b59c2bb2cd, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_55b59c2bb2cd, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_55b59c2bb2cd, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_55b59c2bb2cd, p_IsComputed := p_IsComputed_55b59c2bb2cd, p_EmbeddedRecord := p_EmbeddedRecord_55b59c2bb2cd, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_55b59c2bb2cd, p_Configuration_Clear := TRUE, p_ID := p_ID_55b59c2bb2cd);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_a05d0e01870a VARCHAR(255);
  p_Description_a05d0e01870a TEXT;
  p_AutoUpdateDescription_a05d0e01870a BOOLEAN;
  p_IsPrimaryKey_a05d0e01870a BOOLEAN;
  p_IsUnique_a05d0e01870a BOOLEAN;
  p_Category_a05d0e01870a VARCHAR(255);
  p_ValueListType_a05d0e01870a VARCHAR(20);
  p_ExtendedType_a05d0e01870a VARCHAR(50);
  p_CodeType_a05d0e01870a VARCHAR(50);
  p_DefaultInView_a05d0e01870a BOOLEAN;
  p_ViewCellTemplate_a05d0e01870a TEXT;
  p_DefaultColumnWidth_a05d0e01870a INTEGER;
  p_AllowUpdateAPI_a05d0e01870a BOOLEAN;
  p_AllowUpdateInView_a05d0e01870a BOOLEAN;
  p_IncludeInUserSearchAPI_a05d0e01870a BOOLEAN;
  p_FullTextSearchEnabled_a05d0e01870a BOOLEAN;
  p_UserSearchParamFormatAPI_a05d0e01870a VARCHAR(500);
  p_IncludeInGeneratedForm_a05d0e01870a BOOLEAN;
  p_GeneratedFormSection_a05d0e01870a VARCHAR(10);
  p_IsNameField_a05d0e01870a BOOLEAN;
  p_RelatedEntityID_a05d0e01870a UUID;
  p_RelatedEntityFieldName_a05d0e01870a VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_a05d0e01870a BOOLEAN;
  p_RelatedEntityNameFieldMap_a05d0e01870a VARCHAR(255);
  p_RelatedEntityDisplayType_a05d0e01870a VARCHAR(20);
  p_EntityIDFieldName_a05d0e01870a VARCHAR(100);
  p_ScopeDefault_a05d0e01870a VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_a05d0e01870a BOOLEAN;
  p_ValuesToPackWithSchema_a05d0e01870a VARCHAR(10);
  p_Status_a05d0e01870a VARCHAR(25);
  p_AutoUpdateIsNameField_a05d0e01870a BOOLEAN;
  p_AutoUpdateDefaultInView_a05d0e01870a BOOLEAN;
  p_AutoUpdateCategory_a05d0e01870a BOOLEAN;
  p_AutoUpdateDisplayName_a05d0e01870a BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_a05d0e01870a BOOLEAN;
  p_Encrypt_a05d0e01870a BOOLEAN;
  p_EncryptionKeyID_a05d0e01870a UUID;
  p_AllowDecryptInAPI_a05d0e01870a BOOLEAN;
  p_SendEncryptedValue_a05d0e01870a BOOLEAN;
  p_IsSoftPrimaryKey_a05d0e01870a BOOLEAN;
  p_IsSoftForeignKey_a05d0e01870a BOOLEAN;
  p_RelatedEntityJoinFields_a05d0e01870a TEXT;
  p_JSONType_a05d0e01870a VARCHAR(255);
  p_JSONTypeIsArray_a05d0e01870a BOOLEAN;
  p_JSONTypeDefinition_a05d0e01870a TEXT;
  p_UserSearchPredicateAPI_a05d0e01870a VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_a05d0e01870a BOOLEAN;
  p_AutoUpdateFullTextSearch_a05d0e01870a BOOLEAN;
  p_AutoUpdateExtendedType_a05d0e01870a BOOLEAN;
  p_IsComputed_a05d0e01870a BOOLEAN;
  p_EmbeddedRecord_a05d0e01870a TEXT;
  p_Configuration_a05d0e01870a TEXT;
  p_ID_a05d0e01870a UUID;
BEGIN
  p_DisplayName_a05d0e01870a := 'Provider Intent ID';
  p_Description_a05d0e01870a := 'The gateway''s intent id as the event reported it (for Stripe, pi_...), kept even when Orders has no intent with that id.';
  p_AutoUpdateDescription_a05d0e01870a := TRUE;
  p_IsPrimaryKey_a05d0e01870a := FALSE;
  p_IsUnique_a05d0e01870a := FALSE;
  p_Category_a05d0e01870a := 'Payment References';
  p_ValueListType_a05d0e01870a := 'None';
  p_DefaultInView_a05d0e01870a := TRUE;
  p_DefaultColumnWidth_a05d0e01870a := 150;
  p_AllowUpdateAPI_a05d0e01870a := TRUE;
  p_AllowUpdateInView_a05d0e01870a := TRUE;
  p_IncludeInUserSearchAPI_a05d0e01870a := FALSE;
  p_FullTextSearchEnabled_a05d0e01870a := FALSE;
  p_IncludeInGeneratedForm_a05d0e01870a := TRUE;
  p_GeneratedFormSection_a05d0e01870a := 'Category';
  p_IsNameField_a05d0e01870a := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_a05d0e01870a := FALSE;
  p_RelatedEntityDisplayType_a05d0e01870a := 'Search';
  p_AutoUpdateRelatedEntityInfo_a05d0e01870a := TRUE;
  p_ValuesToPackWithSchema_a05d0e01870a := 'Auto';
  p_Status_a05d0e01870a := 'Active';
  p_AutoUpdateIsNameField_a05d0e01870a := TRUE;
  p_AutoUpdateDefaultInView_a05d0e01870a := TRUE;
  p_AutoUpdateCategory_a05d0e01870a := TRUE;
  p_AutoUpdateDisplayName_a05d0e01870a := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_a05d0e01870a := TRUE;
  p_Encrypt_a05d0e01870a := FALSE;
  p_AllowDecryptInAPI_a05d0e01870a := FALSE;
  p_SendEncryptedValue_a05d0e01870a := FALSE;
  p_IsSoftPrimaryKey_a05d0e01870a := FALSE;
  p_IsSoftForeignKey_a05d0e01870a := FALSE;
  p_JSONTypeIsArray_a05d0e01870a := FALSE;
  p_UserSearchPredicateAPI_a05d0e01870a := 'Contains';
  p_AutoUpdateUserSearchPredicate_a05d0e01870a := TRUE;
  p_AutoUpdateFullTextSearch_a05d0e01870a := TRUE;
  p_AutoUpdateExtendedType_a05d0e01870a := TRUE;
  p_IsComputed_a05d0e01870a := FALSE;
  p_ID_a05d0e01870a := '26BFEADE-1D14-4411-82E9-04C262636DEE';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_a05d0e01870a,
    'Description', p_Description_a05d0e01870a,
    'AutoUpdateDescription', p_AutoUpdateDescription_a05d0e01870a,
    'IsPrimaryKey', p_IsPrimaryKey_a05d0e01870a,
    'IsUnique', p_IsUnique_a05d0e01870a,
    'Category', p_Category_a05d0e01870a,
    'ValueListType', p_ValueListType_a05d0e01870a,
    'ExtendedType', p_ExtendedType_a05d0e01870a,
    'CodeType', p_CodeType_a05d0e01870a,
    'DefaultInView', p_DefaultInView_a05d0e01870a,
    'ViewCellTemplate', p_ViewCellTemplate_a05d0e01870a,
    'DefaultColumnWidth', p_DefaultColumnWidth_a05d0e01870a,
    'AllowUpdateAPI', p_AllowUpdateAPI_a05d0e01870a,
    'AllowUpdateInView', p_AllowUpdateInView_a05d0e01870a,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_a05d0e01870a,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_a05d0e01870a,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_a05d0e01870a,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_a05d0e01870a,
    'GeneratedFormSection', p_GeneratedFormSection_a05d0e01870a,
    'IsNameField', p_IsNameField_a05d0e01870a,
    'RelatedEntityID', p_RelatedEntityID_a05d0e01870a,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_a05d0e01870a,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_a05d0e01870a,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_a05d0e01870a,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_a05d0e01870a,
    'EntityIDFieldName', p_EntityIDFieldName_a05d0e01870a,
    'ScopeDefault', p_ScopeDefault_a05d0e01870a,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_a05d0e01870a,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_a05d0e01870a,
    'Status', p_Status_a05d0e01870a,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_a05d0e01870a,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_a05d0e01870a,
    'AutoUpdateCategory', p_AutoUpdateCategory_a05d0e01870a,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_a05d0e01870a,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_a05d0e01870a,
    'Encrypt', p_Encrypt_a05d0e01870a,
    'EncryptionKeyID', p_EncryptionKeyID_a05d0e01870a,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_a05d0e01870a,
    'SendEncryptedValue', p_SendEncryptedValue_a05d0e01870a,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_a05d0e01870a,
    'IsSoftForeignKey', p_IsSoftForeignKey_a05d0e01870a,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_a05d0e01870a,
    'JSONType', p_JSONType_a05d0e01870a,
    'JSONTypeIsArray', p_JSONTypeIsArray_a05d0e01870a,
    'JSONTypeDefinition', p_JSONTypeDefinition_a05d0e01870a,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_a05d0e01870a,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_a05d0e01870a,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_a05d0e01870a,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_a05d0e01870a,
    'IsComputed', p_IsComputed_a05d0e01870a
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_a05d0e01870a,
    'Configuration', p_Configuration_a05d0e01870a,
    'ID', p_ID_a05d0e01870a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_a05d0e01870a, p_Description := p_Description_a05d0e01870a, p_AutoUpdateDescription := p_AutoUpdateDescription_a05d0e01870a, p_IsPrimaryKey := p_IsPrimaryKey_a05d0e01870a, p_IsUnique := p_IsUnique_a05d0e01870a, p_Category := p_Category_a05d0e01870a, p_ValueListType := p_ValueListType_a05d0e01870a, p_ExtendedType := p_ExtendedType_a05d0e01870a, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_a05d0e01870a, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_a05d0e01870a, p_ViewCellTemplate := p_ViewCellTemplate_a05d0e01870a, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_a05d0e01870a, p_AllowUpdateAPI := p_AllowUpdateAPI_a05d0e01870a, p_AllowUpdateInView := p_AllowUpdateInView_a05d0e01870a, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_a05d0e01870a, p_FullTextSearchEnabled := p_FullTextSearchEnabled_a05d0e01870a, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_a05d0e01870a, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_a05d0e01870a, p_GeneratedFormSection := p_GeneratedFormSection_a05d0e01870a, p_IsNameField := p_IsNameField_a05d0e01870a, p_RelatedEntityID := p_RelatedEntityID_a05d0e01870a, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_a05d0e01870a, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_a05d0e01870a, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_a05d0e01870a, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_a05d0e01870a, p_EntityIDFieldName := p_EntityIDFieldName_a05d0e01870a, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_a05d0e01870a, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_a05d0e01870a, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_a05d0e01870a, p_Status := p_Status_a05d0e01870a, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_a05d0e01870a, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_a05d0e01870a, p_AutoUpdateCategory := p_AutoUpdateCategory_a05d0e01870a, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_a05d0e01870a, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_a05d0e01870a, p_Encrypt := p_Encrypt_a05d0e01870a, p_EncryptionKeyID := p_EncryptionKeyID_a05d0e01870a, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_a05d0e01870a, p_SendEncryptedValue := p_SendEncryptedValue_a05d0e01870a, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_a05d0e01870a, p_IsSoftForeignKey := p_IsSoftForeignKey_a05d0e01870a, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_a05d0e01870a, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_a05d0e01870a, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_a05d0e01870a, p_JSONTypeDefinition := p_JSONTypeDefinition_a05d0e01870a, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_a05d0e01870a, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_a05d0e01870a, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_a05d0e01870a, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_a05d0e01870a, p_IsComputed := p_IsComputed_a05d0e01870a, p_EmbeddedRecord := p_EmbeddedRecord_a05d0e01870a, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_a05d0e01870a, p_Configuration_Clear := TRUE, p_ID := p_ID_a05d0e01870a);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_1e0a83dbe4de VARCHAR(255);
  p_Description_1e0a83dbe4de TEXT;
  p_AutoUpdateDescription_1e0a83dbe4de BOOLEAN;
  p_IsPrimaryKey_1e0a83dbe4de BOOLEAN;
  p_IsUnique_1e0a83dbe4de BOOLEAN;
  p_Category_1e0a83dbe4de VARCHAR(255);
  p_ValueListType_1e0a83dbe4de VARCHAR(20);
  p_ExtendedType_1e0a83dbe4de VARCHAR(50);
  p_CodeType_1e0a83dbe4de VARCHAR(50);
  p_DefaultInView_1e0a83dbe4de BOOLEAN;
  p_ViewCellTemplate_1e0a83dbe4de TEXT;
  p_DefaultColumnWidth_1e0a83dbe4de INTEGER;
  p_AllowUpdateAPI_1e0a83dbe4de BOOLEAN;
  p_AllowUpdateInView_1e0a83dbe4de BOOLEAN;
  p_IncludeInUserSearchAPI_1e0a83dbe4de BOOLEAN;
  p_FullTextSearchEnabled_1e0a83dbe4de BOOLEAN;
  p_UserSearchParamFormatAPI_1e0a83dbe4de VARCHAR(500);
  p_IncludeInGeneratedForm_1e0a83dbe4de BOOLEAN;
  p_GeneratedFormSection_1e0a83dbe4de VARCHAR(10);
  p_IsNameField_1e0a83dbe4de BOOLEAN;
  p_RelatedEntityID_1e0a83dbe4de UUID;
  p_RelatedEntityFieldName_1e0a83dbe4de VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_1e0a83dbe4de BOOLEAN;
  p_RelatedEntityNameFieldMap_1e0a83dbe4de VARCHAR(255);
  p_RelatedEntityDisplayType_1e0a83dbe4de VARCHAR(20);
  p_EntityIDFieldName_1e0a83dbe4de VARCHAR(100);
  p_ScopeDefault_1e0a83dbe4de VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_1e0a83dbe4de BOOLEAN;
  p_ValuesToPackWithSchema_1e0a83dbe4de VARCHAR(10);
  p_Status_1e0a83dbe4de VARCHAR(25);
  p_AutoUpdateIsNameField_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateDefaultInView_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateCategory_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateDisplayName_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_1e0a83dbe4de BOOLEAN;
  p_Encrypt_1e0a83dbe4de BOOLEAN;
  p_EncryptionKeyID_1e0a83dbe4de UUID;
  p_AllowDecryptInAPI_1e0a83dbe4de BOOLEAN;
  p_SendEncryptedValue_1e0a83dbe4de BOOLEAN;
  p_IsSoftPrimaryKey_1e0a83dbe4de BOOLEAN;
  p_IsSoftForeignKey_1e0a83dbe4de BOOLEAN;
  p_RelatedEntityJoinFields_1e0a83dbe4de TEXT;
  p_JSONType_1e0a83dbe4de VARCHAR(255);
  p_JSONTypeIsArray_1e0a83dbe4de BOOLEAN;
  p_JSONTypeDefinition_1e0a83dbe4de TEXT;
  p_UserSearchPredicateAPI_1e0a83dbe4de VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateFullTextSearch_1e0a83dbe4de BOOLEAN;
  p_AutoUpdateExtendedType_1e0a83dbe4de BOOLEAN;
  p_IsComputed_1e0a83dbe4de BOOLEAN;
  p_EmbeddedRecord_1e0a83dbe4de TEXT;
  p_Configuration_1e0a83dbe4de TEXT;
  p_ID_1e0a83dbe4de UUID;
BEGIN
  p_DisplayName_1e0a83dbe4de := 'Provider Charge ID';
  p_Description_1e0a83dbe4de := 'The gateway''s charge id as the event reported it (for Stripe, ch_... or py_...), when it named one.';
  p_AutoUpdateDescription_1e0a83dbe4de := TRUE;
  p_IsPrimaryKey_1e0a83dbe4de := FALSE;
  p_IsUnique_1e0a83dbe4de := FALSE;
  p_Category_1e0a83dbe4de := 'Payment References';
  p_ValueListType_1e0a83dbe4de := 'None';
  p_DefaultInView_1e0a83dbe4de := TRUE;
  p_DefaultColumnWidth_1e0a83dbe4de := 150;
  p_AllowUpdateAPI_1e0a83dbe4de := TRUE;
  p_AllowUpdateInView_1e0a83dbe4de := TRUE;
  p_IncludeInUserSearchAPI_1e0a83dbe4de := FALSE;
  p_FullTextSearchEnabled_1e0a83dbe4de := FALSE;
  p_IncludeInGeneratedForm_1e0a83dbe4de := TRUE;
  p_GeneratedFormSection_1e0a83dbe4de := 'Category';
  p_IsNameField_1e0a83dbe4de := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_1e0a83dbe4de := FALSE;
  p_RelatedEntityDisplayType_1e0a83dbe4de := 'Search';
  p_AutoUpdateRelatedEntityInfo_1e0a83dbe4de := TRUE;
  p_ValuesToPackWithSchema_1e0a83dbe4de := 'Auto';
  p_Status_1e0a83dbe4de := 'Active';
  p_AutoUpdateIsNameField_1e0a83dbe4de := TRUE;
  p_AutoUpdateDefaultInView_1e0a83dbe4de := TRUE;
  p_AutoUpdateCategory_1e0a83dbe4de := TRUE;
  p_AutoUpdateDisplayName_1e0a83dbe4de := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_1e0a83dbe4de := TRUE;
  p_Encrypt_1e0a83dbe4de := FALSE;
  p_AllowDecryptInAPI_1e0a83dbe4de := FALSE;
  p_SendEncryptedValue_1e0a83dbe4de := FALSE;
  p_IsSoftPrimaryKey_1e0a83dbe4de := FALSE;
  p_IsSoftForeignKey_1e0a83dbe4de := FALSE;
  p_JSONTypeIsArray_1e0a83dbe4de := FALSE;
  p_UserSearchPredicateAPI_1e0a83dbe4de := 'Contains';
  p_AutoUpdateUserSearchPredicate_1e0a83dbe4de := TRUE;
  p_AutoUpdateFullTextSearch_1e0a83dbe4de := TRUE;
  p_AutoUpdateExtendedType_1e0a83dbe4de := TRUE;
  p_IsComputed_1e0a83dbe4de := FALSE;
  p_ID_1e0a83dbe4de := '015B302F-0DDC-48BE-B3D6-B9485C0C20D5';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_1e0a83dbe4de,
    'Description', p_Description_1e0a83dbe4de,
    'AutoUpdateDescription', p_AutoUpdateDescription_1e0a83dbe4de,
    'IsPrimaryKey', p_IsPrimaryKey_1e0a83dbe4de,
    'IsUnique', p_IsUnique_1e0a83dbe4de,
    'Category', p_Category_1e0a83dbe4de,
    'ValueListType', p_ValueListType_1e0a83dbe4de,
    'ExtendedType', p_ExtendedType_1e0a83dbe4de,
    'CodeType', p_CodeType_1e0a83dbe4de,
    'DefaultInView', p_DefaultInView_1e0a83dbe4de,
    'ViewCellTemplate', p_ViewCellTemplate_1e0a83dbe4de,
    'DefaultColumnWidth', p_DefaultColumnWidth_1e0a83dbe4de,
    'AllowUpdateAPI', p_AllowUpdateAPI_1e0a83dbe4de,
    'AllowUpdateInView', p_AllowUpdateInView_1e0a83dbe4de,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_1e0a83dbe4de,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_1e0a83dbe4de,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_1e0a83dbe4de,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_1e0a83dbe4de,
    'GeneratedFormSection', p_GeneratedFormSection_1e0a83dbe4de,
    'IsNameField', p_IsNameField_1e0a83dbe4de,
    'RelatedEntityID', p_RelatedEntityID_1e0a83dbe4de,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_1e0a83dbe4de,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_1e0a83dbe4de,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_1e0a83dbe4de,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_1e0a83dbe4de,
    'EntityIDFieldName', p_EntityIDFieldName_1e0a83dbe4de,
    'ScopeDefault', p_ScopeDefault_1e0a83dbe4de,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_1e0a83dbe4de,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_1e0a83dbe4de,
    'Status', p_Status_1e0a83dbe4de,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_1e0a83dbe4de,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_1e0a83dbe4de,
    'AutoUpdateCategory', p_AutoUpdateCategory_1e0a83dbe4de,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_1e0a83dbe4de,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_1e0a83dbe4de,
    'Encrypt', p_Encrypt_1e0a83dbe4de,
    'EncryptionKeyID', p_EncryptionKeyID_1e0a83dbe4de,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_1e0a83dbe4de,
    'SendEncryptedValue', p_SendEncryptedValue_1e0a83dbe4de,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_1e0a83dbe4de,
    'IsSoftForeignKey', p_IsSoftForeignKey_1e0a83dbe4de,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_1e0a83dbe4de,
    'JSONType', p_JSONType_1e0a83dbe4de,
    'JSONTypeIsArray', p_JSONTypeIsArray_1e0a83dbe4de,
    'JSONTypeDefinition', p_JSONTypeDefinition_1e0a83dbe4de,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_1e0a83dbe4de,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_1e0a83dbe4de,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_1e0a83dbe4de,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_1e0a83dbe4de,
    'IsComputed', p_IsComputed_1e0a83dbe4de
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_1e0a83dbe4de,
    'Configuration', p_Configuration_1e0a83dbe4de,
    'ID', p_ID_1e0a83dbe4de
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_1e0a83dbe4de, p_Description := p_Description_1e0a83dbe4de, p_AutoUpdateDescription := p_AutoUpdateDescription_1e0a83dbe4de, p_IsPrimaryKey := p_IsPrimaryKey_1e0a83dbe4de, p_IsUnique := p_IsUnique_1e0a83dbe4de, p_Category := p_Category_1e0a83dbe4de, p_ValueListType := p_ValueListType_1e0a83dbe4de, p_ExtendedType := p_ExtendedType_1e0a83dbe4de, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_1e0a83dbe4de, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_1e0a83dbe4de, p_ViewCellTemplate := p_ViewCellTemplate_1e0a83dbe4de, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_1e0a83dbe4de, p_AllowUpdateAPI := p_AllowUpdateAPI_1e0a83dbe4de, p_AllowUpdateInView := p_AllowUpdateInView_1e0a83dbe4de, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_1e0a83dbe4de, p_FullTextSearchEnabled := p_FullTextSearchEnabled_1e0a83dbe4de, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_1e0a83dbe4de, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_1e0a83dbe4de, p_GeneratedFormSection := p_GeneratedFormSection_1e0a83dbe4de, p_IsNameField := p_IsNameField_1e0a83dbe4de, p_RelatedEntityID := p_RelatedEntityID_1e0a83dbe4de, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_1e0a83dbe4de, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_1e0a83dbe4de, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_1e0a83dbe4de, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_1e0a83dbe4de, p_EntityIDFieldName := p_EntityIDFieldName_1e0a83dbe4de, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_1e0a83dbe4de, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_1e0a83dbe4de, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_1e0a83dbe4de, p_Status := p_Status_1e0a83dbe4de, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_1e0a83dbe4de, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_1e0a83dbe4de, p_AutoUpdateCategory := p_AutoUpdateCategory_1e0a83dbe4de, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_1e0a83dbe4de, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_1e0a83dbe4de, p_Encrypt := p_Encrypt_1e0a83dbe4de, p_EncryptionKeyID := p_EncryptionKeyID_1e0a83dbe4de, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_1e0a83dbe4de, p_SendEncryptedValue := p_SendEncryptedValue_1e0a83dbe4de, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_1e0a83dbe4de, p_IsSoftForeignKey := p_IsSoftForeignKey_1e0a83dbe4de, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_1e0a83dbe4de, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_1e0a83dbe4de, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_1e0a83dbe4de, p_JSONTypeDefinition := p_JSONTypeDefinition_1e0a83dbe4de, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_1e0a83dbe4de, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_1e0a83dbe4de, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_1e0a83dbe4de, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_1e0a83dbe4de, p_IsComputed := p_IsComputed_1e0a83dbe4de, p_EmbeddedRecord := p_EmbeddedRecord_1e0a83dbe4de, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_1e0a83dbe4de, p_Configuration_Clear := TRUE, p_ID := p_ID_1e0a83dbe4de);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_0989c79dc714 VARCHAR(255);
  p_Description_0989c79dc714 TEXT;
  p_AutoUpdateDescription_0989c79dc714 BOOLEAN;
  p_IsPrimaryKey_0989c79dc714 BOOLEAN;
  p_IsUnique_0989c79dc714 BOOLEAN;
  p_Category_0989c79dc714 VARCHAR(255);
  p_ValueListType_0989c79dc714 VARCHAR(20);
  p_ExtendedType_0989c79dc714 VARCHAR(50);
  p_CodeType_0989c79dc714 VARCHAR(50);
  p_DefaultInView_0989c79dc714 BOOLEAN;
  p_ViewCellTemplate_0989c79dc714 TEXT;
  p_DefaultColumnWidth_0989c79dc714 INTEGER;
  p_AllowUpdateAPI_0989c79dc714 BOOLEAN;
  p_AllowUpdateInView_0989c79dc714 BOOLEAN;
  p_IncludeInUserSearchAPI_0989c79dc714 BOOLEAN;
  p_FullTextSearchEnabled_0989c79dc714 BOOLEAN;
  p_UserSearchParamFormatAPI_0989c79dc714 VARCHAR(500);
  p_IncludeInGeneratedForm_0989c79dc714 BOOLEAN;
  p_GeneratedFormSection_0989c79dc714 VARCHAR(10);
  p_IsNameField_0989c79dc714 BOOLEAN;
  p_RelatedEntityID_0989c79dc714 UUID;
  p_RelatedEntityFieldName_0989c79dc714 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_0989c79dc714 BOOLEAN;
  p_RelatedEntityNameFieldMap_0989c79dc714 VARCHAR(255);
  p_RelatedEntityDisplayType_0989c79dc714 VARCHAR(20);
  p_EntityIDFieldName_0989c79dc714 VARCHAR(100);
  p_ScopeDefault_0989c79dc714 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_0989c79dc714 BOOLEAN;
  p_ValuesToPackWithSchema_0989c79dc714 VARCHAR(10);
  p_Status_0989c79dc714 VARCHAR(25);
  p_AutoUpdateIsNameField_0989c79dc714 BOOLEAN;
  p_AutoUpdateDefaultInView_0989c79dc714 BOOLEAN;
  p_AutoUpdateCategory_0989c79dc714 BOOLEAN;
  p_AutoUpdateDisplayName_0989c79dc714 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_0989c79dc714 BOOLEAN;
  p_Encrypt_0989c79dc714 BOOLEAN;
  p_EncryptionKeyID_0989c79dc714 UUID;
  p_AllowDecryptInAPI_0989c79dc714 BOOLEAN;
  p_SendEncryptedValue_0989c79dc714 BOOLEAN;
  p_IsSoftPrimaryKey_0989c79dc714 BOOLEAN;
  p_IsSoftForeignKey_0989c79dc714 BOOLEAN;
  p_RelatedEntityJoinFields_0989c79dc714 TEXT;
  p_JSONType_0989c79dc714 VARCHAR(255);
  p_JSONTypeIsArray_0989c79dc714 BOOLEAN;
  p_JSONTypeDefinition_0989c79dc714 TEXT;
  p_UserSearchPredicateAPI_0989c79dc714 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_0989c79dc714 BOOLEAN;
  p_AutoUpdateFullTextSearch_0989c79dc714 BOOLEAN;
  p_AutoUpdateExtendedType_0989c79dc714 BOOLEAN;
  p_IsComputed_0989c79dc714 BOOLEAN;
  p_EmbeddedRecord_0989c79dc714 TEXT;
  p_Configuration_0989c79dc714 TEXT;
  p_ID_0989c79dc714 UUID;
BEGIN
  p_DisplayName_0989c79dc714 := 'Coverage Overlap Reason';
  p_AutoUpdateDescription_0989c79dc714 := TRUE;
  p_IsPrimaryKey_0989c79dc714 := FALSE;
  p_IsUnique_0989c79dc714 := FALSE;
  p_Category_0989c79dc714 := 'Order Lines';
  p_ValueListType_0989c79dc714 := 'None';
  p_DefaultInView_0989c79dc714 := FALSE;
  p_DefaultColumnWidth_0989c79dc714 := 150;
  p_AllowUpdateAPI_0989c79dc714 := TRUE;
  p_AllowUpdateInView_0989c79dc714 := TRUE;
  p_IncludeInUserSearchAPI_0989c79dc714 := FALSE;
  p_FullTextSearchEnabled_0989c79dc714 := FALSE;
  p_IncludeInGeneratedForm_0989c79dc714 := TRUE;
  p_GeneratedFormSection_0989c79dc714 := 'Category';
  p_IsNameField_0989c79dc714 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_0989c79dc714 := TRUE;
  p_RelatedEntityDisplayType_0989c79dc714 := 'Search';
  p_AutoUpdateRelatedEntityInfo_0989c79dc714 := TRUE;
  p_ValuesToPackWithSchema_0989c79dc714 := 'Auto';
  p_Status_0989c79dc714 := 'Active';
  p_AutoUpdateIsNameField_0989c79dc714 := TRUE;
  p_AutoUpdateDefaultInView_0989c79dc714 := TRUE;
  p_AutoUpdateCategory_0989c79dc714 := TRUE;
  p_AutoUpdateDisplayName_0989c79dc714 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_0989c79dc714 := TRUE;
  p_Encrypt_0989c79dc714 := FALSE;
  p_AllowDecryptInAPI_0989c79dc714 := FALSE;
  p_SendEncryptedValue_0989c79dc714 := FALSE;
  p_IsSoftPrimaryKey_0989c79dc714 := FALSE;
  p_IsSoftForeignKey_0989c79dc714 := FALSE;
  p_JSONTypeIsArray_0989c79dc714 := FALSE;
  p_UserSearchPredicateAPI_0989c79dc714 := 'Contains';
  p_AutoUpdateUserSearchPredicate_0989c79dc714 := TRUE;
  p_AutoUpdateFullTextSearch_0989c79dc714 := TRUE;
  p_AutoUpdateExtendedType_0989c79dc714 := TRUE;
  p_IsComputed_0989c79dc714 := FALSE;
  p_ID_0989c79dc714 := '5917F1C9-292E-4718-8E8F-DDBABD89BDB9';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_0989c79dc714,
    'Description', p_Description_0989c79dc714,
    'AutoUpdateDescription', p_AutoUpdateDescription_0989c79dc714,
    'IsPrimaryKey', p_IsPrimaryKey_0989c79dc714,
    'IsUnique', p_IsUnique_0989c79dc714,
    'Category', p_Category_0989c79dc714,
    'ValueListType', p_ValueListType_0989c79dc714,
    'ExtendedType', p_ExtendedType_0989c79dc714,
    'CodeType', p_CodeType_0989c79dc714,
    'DefaultInView', p_DefaultInView_0989c79dc714,
    'ViewCellTemplate', p_ViewCellTemplate_0989c79dc714,
    'DefaultColumnWidth', p_DefaultColumnWidth_0989c79dc714,
    'AllowUpdateAPI', p_AllowUpdateAPI_0989c79dc714,
    'AllowUpdateInView', p_AllowUpdateInView_0989c79dc714,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_0989c79dc714,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_0989c79dc714,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_0989c79dc714,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_0989c79dc714,
    'GeneratedFormSection', p_GeneratedFormSection_0989c79dc714,
    'IsNameField', p_IsNameField_0989c79dc714,
    'RelatedEntityID', p_RelatedEntityID_0989c79dc714,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_0989c79dc714,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_0989c79dc714,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_0989c79dc714,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_0989c79dc714,
    'EntityIDFieldName', p_EntityIDFieldName_0989c79dc714,
    'ScopeDefault', p_ScopeDefault_0989c79dc714,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_0989c79dc714,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_0989c79dc714,
    'Status', p_Status_0989c79dc714,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_0989c79dc714,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_0989c79dc714,
    'AutoUpdateCategory', p_AutoUpdateCategory_0989c79dc714,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_0989c79dc714,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_0989c79dc714,
    'Encrypt', p_Encrypt_0989c79dc714,
    'EncryptionKeyID', p_EncryptionKeyID_0989c79dc714,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_0989c79dc714,
    'SendEncryptedValue', p_SendEncryptedValue_0989c79dc714,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_0989c79dc714,
    'IsSoftForeignKey', p_IsSoftForeignKey_0989c79dc714,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_0989c79dc714,
    'JSONType', p_JSONType_0989c79dc714,
    'JSONTypeIsArray', p_JSONTypeIsArray_0989c79dc714,
    'JSONTypeDefinition', p_JSONTypeDefinition_0989c79dc714,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_0989c79dc714,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_0989c79dc714,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_0989c79dc714,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_0989c79dc714,
    'IsComputed', p_IsComputed_0989c79dc714
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_0989c79dc714,
    'Configuration', p_Configuration_0989c79dc714,
    'ID', p_ID_0989c79dc714
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_0989c79dc714, p_Description := p_Description_0989c79dc714, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_0989c79dc714, p_IsPrimaryKey := p_IsPrimaryKey_0989c79dc714, p_IsUnique := p_IsUnique_0989c79dc714, p_Category := p_Category_0989c79dc714, p_ValueListType := p_ValueListType_0989c79dc714, p_ExtendedType := p_ExtendedType_0989c79dc714, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_0989c79dc714, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_0989c79dc714, p_ViewCellTemplate := p_ViewCellTemplate_0989c79dc714, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_0989c79dc714, p_AllowUpdateAPI := p_AllowUpdateAPI_0989c79dc714, p_AllowUpdateInView := p_AllowUpdateInView_0989c79dc714, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_0989c79dc714, p_FullTextSearchEnabled := p_FullTextSearchEnabled_0989c79dc714, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_0989c79dc714, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_0989c79dc714, p_GeneratedFormSection := p_GeneratedFormSection_0989c79dc714, p_IsNameField := p_IsNameField_0989c79dc714, p_RelatedEntityID := p_RelatedEntityID_0989c79dc714, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_0989c79dc714, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_0989c79dc714, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_0989c79dc714, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_0989c79dc714, p_EntityIDFieldName := p_EntityIDFieldName_0989c79dc714, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_0989c79dc714, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_0989c79dc714, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_0989c79dc714, p_Status := p_Status_0989c79dc714, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_0989c79dc714, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_0989c79dc714, p_AutoUpdateCategory := p_AutoUpdateCategory_0989c79dc714, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_0989c79dc714, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_0989c79dc714, p_Encrypt := p_Encrypt_0989c79dc714, p_EncryptionKeyID := p_EncryptionKeyID_0989c79dc714, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_0989c79dc714, p_SendEncryptedValue := p_SendEncryptedValue_0989c79dc714, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_0989c79dc714, p_IsSoftForeignKey := p_IsSoftForeignKey_0989c79dc714, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_0989c79dc714, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_0989c79dc714, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_0989c79dc714, p_JSONTypeDefinition := p_JSONTypeDefinition_0989c79dc714, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_0989c79dc714, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_0989c79dc714, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_0989c79dc714, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_0989c79dc714, p_IsComputed := p_IsComputed_0989c79dc714, p_EmbeddedRecord := p_EmbeddedRecord_0989c79dc714, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_0989c79dc714, p_Configuration_Clear := TRUE, p_ID := p_ID_0989c79dc714);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_43f0c41aa706 VARCHAR(255);
  p_Description_43f0c41aa706 TEXT;
  p_AutoUpdateDescription_43f0c41aa706 BOOLEAN;
  p_IsPrimaryKey_43f0c41aa706 BOOLEAN;
  p_IsUnique_43f0c41aa706 BOOLEAN;
  p_Category_43f0c41aa706 VARCHAR(255);
  p_ValueListType_43f0c41aa706 VARCHAR(20);
  p_ExtendedType_43f0c41aa706 VARCHAR(50);
  p_CodeType_43f0c41aa706 VARCHAR(50);
  p_DefaultInView_43f0c41aa706 BOOLEAN;
  p_ViewCellTemplate_43f0c41aa706 TEXT;
  p_DefaultColumnWidth_43f0c41aa706 INTEGER;
  p_AllowUpdateAPI_43f0c41aa706 BOOLEAN;
  p_AllowUpdateInView_43f0c41aa706 BOOLEAN;
  p_IncludeInUserSearchAPI_43f0c41aa706 BOOLEAN;
  p_FullTextSearchEnabled_43f0c41aa706 BOOLEAN;
  p_UserSearchParamFormatAPI_43f0c41aa706 VARCHAR(500);
  p_IncludeInGeneratedForm_43f0c41aa706 BOOLEAN;
  p_GeneratedFormSection_43f0c41aa706 VARCHAR(10);
  p_IsNameField_43f0c41aa706 BOOLEAN;
  p_RelatedEntityID_43f0c41aa706 UUID;
  p_RelatedEntityFieldName_43f0c41aa706 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_43f0c41aa706 BOOLEAN;
  p_RelatedEntityNameFieldMap_43f0c41aa706 VARCHAR(255);
  p_RelatedEntityDisplayType_43f0c41aa706 VARCHAR(20);
  p_EntityIDFieldName_43f0c41aa706 VARCHAR(100);
  p_ScopeDefault_43f0c41aa706 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_43f0c41aa706 BOOLEAN;
  p_ValuesToPackWithSchema_43f0c41aa706 VARCHAR(10);
  p_Status_43f0c41aa706 VARCHAR(25);
  p_AutoUpdateIsNameField_43f0c41aa706 BOOLEAN;
  p_AutoUpdateDefaultInView_43f0c41aa706 BOOLEAN;
  p_AutoUpdateCategory_43f0c41aa706 BOOLEAN;
  p_AutoUpdateDisplayName_43f0c41aa706 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_43f0c41aa706 BOOLEAN;
  p_Encrypt_43f0c41aa706 BOOLEAN;
  p_EncryptionKeyID_43f0c41aa706 UUID;
  p_AllowDecryptInAPI_43f0c41aa706 BOOLEAN;
  p_SendEncryptedValue_43f0c41aa706 BOOLEAN;
  p_IsSoftPrimaryKey_43f0c41aa706 BOOLEAN;
  p_IsSoftForeignKey_43f0c41aa706 BOOLEAN;
  p_RelatedEntityJoinFields_43f0c41aa706 TEXT;
  p_JSONType_43f0c41aa706 VARCHAR(255);
  p_JSONTypeIsArray_43f0c41aa706 BOOLEAN;
  p_JSONTypeDefinition_43f0c41aa706 TEXT;
  p_UserSearchPredicateAPI_43f0c41aa706 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_43f0c41aa706 BOOLEAN;
  p_AutoUpdateFullTextSearch_43f0c41aa706 BOOLEAN;
  p_AutoUpdateExtendedType_43f0c41aa706 BOOLEAN;
  p_IsComputed_43f0c41aa706 BOOLEAN;
  p_EmbeddedRecord_43f0c41aa706 TEXT;
  p_Configuration_43f0c41aa706 TEXT;
  p_ID_43f0c41aa706 UUID;
BEGIN
  p_DisplayName_43f0c41aa706 := 'Refund Requested';
  p_Description_43f0c41aa706 := 'For an amount change about a paid invoice: the customer asked for the credit back rather than off the next instalment. The approval records the credit; finance refunds it from the order''s payments.';
  p_AutoUpdateDescription_43f0c41aa706 := TRUE;
  p_IsPrimaryKey_43f0c41aa706 := FALSE;
  p_IsUnique_43f0c41aa706 := FALSE;
  p_Category_43f0c41aa706 := 'Concession Details';
  p_ValueListType_43f0c41aa706 := 'None';
  p_DefaultInView_43f0c41aa706 := FALSE;
  p_DefaultColumnWidth_43f0c41aa706 := 150;
  p_AllowUpdateAPI_43f0c41aa706 := TRUE;
  p_AllowUpdateInView_43f0c41aa706 := TRUE;
  p_IncludeInUserSearchAPI_43f0c41aa706 := FALSE;
  p_FullTextSearchEnabled_43f0c41aa706 := FALSE;
  p_IncludeInGeneratedForm_43f0c41aa706 := TRUE;
  p_GeneratedFormSection_43f0c41aa706 := 'Category';
  p_IsNameField_43f0c41aa706 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_43f0c41aa706 := FALSE;
  p_RelatedEntityDisplayType_43f0c41aa706 := 'Search';
  p_AutoUpdateRelatedEntityInfo_43f0c41aa706 := TRUE;
  p_ValuesToPackWithSchema_43f0c41aa706 := 'Auto';
  p_Status_43f0c41aa706 := 'Active';
  p_AutoUpdateIsNameField_43f0c41aa706 := TRUE;
  p_AutoUpdateDefaultInView_43f0c41aa706 := TRUE;
  p_AutoUpdateCategory_43f0c41aa706 := TRUE;
  p_AutoUpdateDisplayName_43f0c41aa706 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_43f0c41aa706 := TRUE;
  p_Encrypt_43f0c41aa706 := FALSE;
  p_AllowDecryptInAPI_43f0c41aa706 := FALSE;
  p_SendEncryptedValue_43f0c41aa706 := FALSE;
  p_IsSoftPrimaryKey_43f0c41aa706 := FALSE;
  p_IsSoftForeignKey_43f0c41aa706 := FALSE;
  p_JSONTypeIsArray_43f0c41aa706 := FALSE;
  p_UserSearchPredicateAPI_43f0c41aa706 := 'Contains';
  p_AutoUpdateUserSearchPredicate_43f0c41aa706 := TRUE;
  p_AutoUpdateFullTextSearch_43f0c41aa706 := TRUE;
  p_AutoUpdateExtendedType_43f0c41aa706 := TRUE;
  p_IsComputed_43f0c41aa706 := FALSE;
  p_ID_43f0c41aa706 := 'DBD0B20A-D4F5-4C41-A101-37AB111ED6F4';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_43f0c41aa706,
    'Description', p_Description_43f0c41aa706,
    'AutoUpdateDescription', p_AutoUpdateDescription_43f0c41aa706,
    'IsPrimaryKey', p_IsPrimaryKey_43f0c41aa706,
    'IsUnique', p_IsUnique_43f0c41aa706,
    'Category', p_Category_43f0c41aa706,
    'ValueListType', p_ValueListType_43f0c41aa706,
    'ExtendedType', p_ExtendedType_43f0c41aa706,
    'CodeType', p_CodeType_43f0c41aa706,
    'DefaultInView', p_DefaultInView_43f0c41aa706,
    'ViewCellTemplate', p_ViewCellTemplate_43f0c41aa706,
    'DefaultColumnWidth', p_DefaultColumnWidth_43f0c41aa706,
    'AllowUpdateAPI', p_AllowUpdateAPI_43f0c41aa706,
    'AllowUpdateInView', p_AllowUpdateInView_43f0c41aa706,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_43f0c41aa706,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_43f0c41aa706,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_43f0c41aa706,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_43f0c41aa706,
    'GeneratedFormSection', p_GeneratedFormSection_43f0c41aa706,
    'IsNameField', p_IsNameField_43f0c41aa706,
    'RelatedEntityID', p_RelatedEntityID_43f0c41aa706,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_43f0c41aa706,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_43f0c41aa706,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_43f0c41aa706,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_43f0c41aa706,
    'EntityIDFieldName', p_EntityIDFieldName_43f0c41aa706,
    'ScopeDefault', p_ScopeDefault_43f0c41aa706,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_43f0c41aa706,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_43f0c41aa706,
    'Status', p_Status_43f0c41aa706,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_43f0c41aa706,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_43f0c41aa706,
    'AutoUpdateCategory', p_AutoUpdateCategory_43f0c41aa706,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_43f0c41aa706,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_43f0c41aa706,
    'Encrypt', p_Encrypt_43f0c41aa706,
    'EncryptionKeyID', p_EncryptionKeyID_43f0c41aa706,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_43f0c41aa706,
    'SendEncryptedValue', p_SendEncryptedValue_43f0c41aa706,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_43f0c41aa706,
    'IsSoftForeignKey', p_IsSoftForeignKey_43f0c41aa706,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_43f0c41aa706,
    'JSONType', p_JSONType_43f0c41aa706,
    'JSONTypeIsArray', p_JSONTypeIsArray_43f0c41aa706,
    'JSONTypeDefinition', p_JSONTypeDefinition_43f0c41aa706,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_43f0c41aa706,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_43f0c41aa706,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_43f0c41aa706,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_43f0c41aa706,
    'IsComputed', p_IsComputed_43f0c41aa706
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_43f0c41aa706,
    'Configuration', p_Configuration_43f0c41aa706,
    'ID', p_ID_43f0c41aa706
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_43f0c41aa706, p_Description := p_Description_43f0c41aa706, p_AutoUpdateDescription := p_AutoUpdateDescription_43f0c41aa706, p_IsPrimaryKey := p_IsPrimaryKey_43f0c41aa706, p_IsUnique := p_IsUnique_43f0c41aa706, p_Category := p_Category_43f0c41aa706, p_ValueListType := p_ValueListType_43f0c41aa706, p_ExtendedType := p_ExtendedType_43f0c41aa706, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_43f0c41aa706, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_43f0c41aa706, p_ViewCellTemplate := p_ViewCellTemplate_43f0c41aa706, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_43f0c41aa706, p_AllowUpdateAPI := p_AllowUpdateAPI_43f0c41aa706, p_AllowUpdateInView := p_AllowUpdateInView_43f0c41aa706, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_43f0c41aa706, p_FullTextSearchEnabled := p_FullTextSearchEnabled_43f0c41aa706, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_43f0c41aa706, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_43f0c41aa706, p_GeneratedFormSection := p_GeneratedFormSection_43f0c41aa706, p_IsNameField := p_IsNameField_43f0c41aa706, p_RelatedEntityID := p_RelatedEntityID_43f0c41aa706, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_43f0c41aa706, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_43f0c41aa706, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_43f0c41aa706, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_43f0c41aa706, p_EntityIDFieldName := p_EntityIDFieldName_43f0c41aa706, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_43f0c41aa706, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_43f0c41aa706, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_43f0c41aa706, p_Status := p_Status_43f0c41aa706, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_43f0c41aa706, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_43f0c41aa706, p_AutoUpdateCategory := p_AutoUpdateCategory_43f0c41aa706, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_43f0c41aa706, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_43f0c41aa706, p_Encrypt := p_Encrypt_43f0c41aa706, p_EncryptionKeyID := p_EncryptionKeyID_43f0c41aa706, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_43f0c41aa706, p_SendEncryptedValue := p_SendEncryptedValue_43f0c41aa706, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_43f0c41aa706, p_IsSoftForeignKey := p_IsSoftForeignKey_43f0c41aa706, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_43f0c41aa706, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_43f0c41aa706, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_43f0c41aa706, p_JSONTypeDefinition := p_JSONTypeDefinition_43f0c41aa706, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_43f0c41aa706, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_43f0c41aa706, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_43f0c41aa706, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_43f0c41aa706, p_IsComputed := p_IsComputed_43f0c41aa706, p_EmbeddedRecord := p_EmbeddedRecord_43f0c41aa706, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_43f0c41aa706, p_Configuration_Clear := TRUE, p_ID := p_ID_43f0c41aa706);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_f460328f1bde VARCHAR(255);
  p_Description_f460328f1bde TEXT;
  p_AutoUpdateDescription_f460328f1bde BOOLEAN;
  p_IsPrimaryKey_f460328f1bde BOOLEAN;
  p_IsUnique_f460328f1bde BOOLEAN;
  p_Category_f460328f1bde VARCHAR(255);
  p_ValueListType_f460328f1bde VARCHAR(20);
  p_ExtendedType_f460328f1bde VARCHAR(50);
  p_CodeType_f460328f1bde VARCHAR(50);
  p_DefaultInView_f460328f1bde BOOLEAN;
  p_ViewCellTemplate_f460328f1bde TEXT;
  p_DefaultColumnWidth_f460328f1bde INTEGER;
  p_AllowUpdateAPI_f460328f1bde BOOLEAN;
  p_AllowUpdateInView_f460328f1bde BOOLEAN;
  p_IncludeInUserSearchAPI_f460328f1bde BOOLEAN;
  p_FullTextSearchEnabled_f460328f1bde BOOLEAN;
  p_UserSearchParamFormatAPI_f460328f1bde VARCHAR(500);
  p_IncludeInGeneratedForm_f460328f1bde BOOLEAN;
  p_GeneratedFormSection_f460328f1bde VARCHAR(10);
  p_IsNameField_f460328f1bde BOOLEAN;
  p_RelatedEntityID_f460328f1bde UUID;
  p_RelatedEntityFieldName_f460328f1bde VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_f460328f1bde BOOLEAN;
  p_RelatedEntityNameFieldMap_f460328f1bde VARCHAR(255);
  p_RelatedEntityDisplayType_f460328f1bde VARCHAR(20);
  p_EntityIDFieldName_f460328f1bde VARCHAR(100);
  p_ScopeDefault_f460328f1bde VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_f460328f1bde BOOLEAN;
  p_ValuesToPackWithSchema_f460328f1bde VARCHAR(10);
  p_Status_f460328f1bde VARCHAR(25);
  p_AutoUpdateIsNameField_f460328f1bde BOOLEAN;
  p_AutoUpdateDefaultInView_f460328f1bde BOOLEAN;
  p_AutoUpdateCategory_f460328f1bde BOOLEAN;
  p_AutoUpdateDisplayName_f460328f1bde BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_f460328f1bde BOOLEAN;
  p_Encrypt_f460328f1bde BOOLEAN;
  p_EncryptionKeyID_f460328f1bde UUID;
  p_AllowDecryptInAPI_f460328f1bde BOOLEAN;
  p_SendEncryptedValue_f460328f1bde BOOLEAN;
  p_IsSoftPrimaryKey_f460328f1bde BOOLEAN;
  p_IsSoftForeignKey_f460328f1bde BOOLEAN;
  p_RelatedEntityJoinFields_f460328f1bde TEXT;
  p_JSONType_f460328f1bde VARCHAR(255);
  p_JSONTypeIsArray_f460328f1bde BOOLEAN;
  p_JSONTypeDefinition_f460328f1bde TEXT;
  p_UserSearchPredicateAPI_f460328f1bde VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_f460328f1bde BOOLEAN;
  p_AutoUpdateFullTextSearch_f460328f1bde BOOLEAN;
  p_AutoUpdateExtendedType_f460328f1bde BOOLEAN;
  p_IsComputed_f460328f1bde BOOLEAN;
  p_EmbeddedRecord_f460328f1bde TEXT;
  p_Configuration_f460328f1bde TEXT;
  p_ID_f460328f1bde UUID;
BEGIN
  p_DisplayName_f460328f1bde := 'Credit Memo Amount';
  p_Description_f460328f1bde := 'For an approved amount change, the reduction and its tax credited on a credit memo: the part the instalments not yet invoiced could not absorb. The order''s balance subtracts it. Set by the server when the change is approved.';
  p_AutoUpdateDescription_f460328f1bde := TRUE;
  p_IsPrimaryKey_f460328f1bde := FALSE;
  p_IsUnique_f460328f1bde := FALSE;
  p_Category_f460328f1bde := 'Value and Limits';
  p_ValueListType_f460328f1bde := 'None';
  p_DefaultInView_f460328f1bde := FALSE;
  p_DefaultColumnWidth_f460328f1bde := 150;
  p_AllowUpdateAPI_f460328f1bde := TRUE;
  p_AllowUpdateInView_f460328f1bde := TRUE;
  p_IncludeInUserSearchAPI_f460328f1bde := FALSE;
  p_FullTextSearchEnabled_f460328f1bde := FALSE;
  p_IncludeInGeneratedForm_f460328f1bde := TRUE;
  p_GeneratedFormSection_f460328f1bde := 'Category';
  p_IsNameField_f460328f1bde := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_f460328f1bde := FALSE;
  p_RelatedEntityDisplayType_f460328f1bde := 'Search';
  p_AutoUpdateRelatedEntityInfo_f460328f1bde := TRUE;
  p_ValuesToPackWithSchema_f460328f1bde := 'Auto';
  p_Status_f460328f1bde := 'Active';
  p_AutoUpdateIsNameField_f460328f1bde := TRUE;
  p_AutoUpdateDefaultInView_f460328f1bde := TRUE;
  p_AutoUpdateCategory_f460328f1bde := TRUE;
  p_AutoUpdateDisplayName_f460328f1bde := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_f460328f1bde := TRUE;
  p_Encrypt_f460328f1bde := FALSE;
  p_AllowDecryptInAPI_f460328f1bde := FALSE;
  p_SendEncryptedValue_f460328f1bde := FALSE;
  p_IsSoftPrimaryKey_f460328f1bde := FALSE;
  p_IsSoftForeignKey_f460328f1bde := FALSE;
  p_JSONTypeIsArray_f460328f1bde := FALSE;
  p_UserSearchPredicateAPI_f460328f1bde := 'Contains';
  p_AutoUpdateUserSearchPredicate_f460328f1bde := TRUE;
  p_AutoUpdateFullTextSearch_f460328f1bde := TRUE;
  p_AutoUpdateExtendedType_f460328f1bde := TRUE;
  p_IsComputed_f460328f1bde := FALSE;
  p_ID_f460328f1bde := 'C12F6199-8011-4816-9E6E-FB851CF83B7A';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_f460328f1bde,
    'Description', p_Description_f460328f1bde,
    'AutoUpdateDescription', p_AutoUpdateDescription_f460328f1bde,
    'IsPrimaryKey', p_IsPrimaryKey_f460328f1bde,
    'IsUnique', p_IsUnique_f460328f1bde,
    'Category', p_Category_f460328f1bde,
    'ValueListType', p_ValueListType_f460328f1bde,
    'ExtendedType', p_ExtendedType_f460328f1bde,
    'CodeType', p_CodeType_f460328f1bde,
    'DefaultInView', p_DefaultInView_f460328f1bde,
    'ViewCellTemplate', p_ViewCellTemplate_f460328f1bde,
    'DefaultColumnWidth', p_DefaultColumnWidth_f460328f1bde,
    'AllowUpdateAPI', p_AllowUpdateAPI_f460328f1bde,
    'AllowUpdateInView', p_AllowUpdateInView_f460328f1bde,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_f460328f1bde,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_f460328f1bde,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_f460328f1bde,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_f460328f1bde,
    'GeneratedFormSection', p_GeneratedFormSection_f460328f1bde,
    'IsNameField', p_IsNameField_f460328f1bde,
    'RelatedEntityID', p_RelatedEntityID_f460328f1bde,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_f460328f1bde,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_f460328f1bde,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_f460328f1bde,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_f460328f1bde,
    'EntityIDFieldName', p_EntityIDFieldName_f460328f1bde,
    'ScopeDefault', p_ScopeDefault_f460328f1bde,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_f460328f1bde,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_f460328f1bde,
    'Status', p_Status_f460328f1bde,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_f460328f1bde,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_f460328f1bde,
    'AutoUpdateCategory', p_AutoUpdateCategory_f460328f1bde,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_f460328f1bde,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_f460328f1bde,
    'Encrypt', p_Encrypt_f460328f1bde,
    'EncryptionKeyID', p_EncryptionKeyID_f460328f1bde,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_f460328f1bde,
    'SendEncryptedValue', p_SendEncryptedValue_f460328f1bde,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_f460328f1bde,
    'IsSoftForeignKey', p_IsSoftForeignKey_f460328f1bde,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_f460328f1bde,
    'JSONType', p_JSONType_f460328f1bde,
    'JSONTypeIsArray', p_JSONTypeIsArray_f460328f1bde,
    'JSONTypeDefinition', p_JSONTypeDefinition_f460328f1bde,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_f460328f1bde,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_f460328f1bde,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_f460328f1bde,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_f460328f1bde,
    'IsComputed', p_IsComputed_f460328f1bde
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_f460328f1bde,
    'Configuration', p_Configuration_f460328f1bde,
    'ID', p_ID_f460328f1bde
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_f460328f1bde, p_Description := p_Description_f460328f1bde, p_AutoUpdateDescription := p_AutoUpdateDescription_f460328f1bde, p_IsPrimaryKey := p_IsPrimaryKey_f460328f1bde, p_IsUnique := p_IsUnique_f460328f1bde, p_Category := p_Category_f460328f1bde, p_ValueListType := p_ValueListType_f460328f1bde, p_ExtendedType := p_ExtendedType_f460328f1bde, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_f460328f1bde, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_f460328f1bde, p_ViewCellTemplate := p_ViewCellTemplate_f460328f1bde, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_f460328f1bde, p_AllowUpdateAPI := p_AllowUpdateAPI_f460328f1bde, p_AllowUpdateInView := p_AllowUpdateInView_f460328f1bde, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_f460328f1bde, p_FullTextSearchEnabled := p_FullTextSearchEnabled_f460328f1bde, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_f460328f1bde, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_f460328f1bde, p_GeneratedFormSection := p_GeneratedFormSection_f460328f1bde, p_IsNameField := p_IsNameField_f460328f1bde, p_RelatedEntityID := p_RelatedEntityID_f460328f1bde, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_f460328f1bde, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_f460328f1bde, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_f460328f1bde, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_f460328f1bde, p_EntityIDFieldName := p_EntityIDFieldName_f460328f1bde, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_f460328f1bde, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_f460328f1bde, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_f460328f1bde, p_Status := p_Status_f460328f1bde, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_f460328f1bde, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_f460328f1bde, p_AutoUpdateCategory := p_AutoUpdateCategory_f460328f1bde, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_f460328f1bde, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_f460328f1bde, p_Encrypt := p_Encrypt_f460328f1bde, p_EncryptionKeyID := p_EncryptionKeyID_f460328f1bde, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_f460328f1bde, p_SendEncryptedValue := p_SendEncryptedValue_f460328f1bde, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_f460328f1bde, p_IsSoftForeignKey := p_IsSoftForeignKey_f460328f1bde, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_f460328f1bde, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_f460328f1bde, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_f460328f1bde, p_JSONTypeDefinition := p_JSONTypeDefinition_f460328f1bde, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_f460328f1bde, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_f460328f1bde, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_f460328f1bde, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_f460328f1bde, p_IsComputed := p_IsComputed_f460328f1bde, p_EmbeddedRecord := p_EmbeddedRecord_f460328f1bde, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_f460328f1bde, p_Configuration_Clear := TRUE, p_ID := p_ID_f460328f1bde);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_addaa7834944 VARCHAR(255);
  p_Description_addaa7834944 TEXT;
  p_AutoUpdateDescription_addaa7834944 BOOLEAN;
  p_IsPrimaryKey_addaa7834944 BOOLEAN;
  p_IsUnique_addaa7834944 BOOLEAN;
  p_Category_addaa7834944 VARCHAR(255);
  p_ValueListType_addaa7834944 VARCHAR(20);
  p_ExtendedType_addaa7834944 VARCHAR(50);
  p_CodeType_addaa7834944 VARCHAR(50);
  p_DefaultInView_addaa7834944 BOOLEAN;
  p_ViewCellTemplate_addaa7834944 TEXT;
  p_DefaultColumnWidth_addaa7834944 INTEGER;
  p_AllowUpdateAPI_addaa7834944 BOOLEAN;
  p_AllowUpdateInView_addaa7834944 BOOLEAN;
  p_IncludeInUserSearchAPI_addaa7834944 BOOLEAN;
  p_FullTextSearchEnabled_addaa7834944 BOOLEAN;
  p_UserSearchParamFormatAPI_addaa7834944 VARCHAR(500);
  p_IncludeInGeneratedForm_addaa7834944 BOOLEAN;
  p_GeneratedFormSection_addaa7834944 VARCHAR(10);
  p_IsNameField_addaa7834944 BOOLEAN;
  p_RelatedEntityID_addaa7834944 UUID;
  p_RelatedEntityFieldName_addaa7834944 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_addaa7834944 BOOLEAN;
  p_RelatedEntityNameFieldMap_addaa7834944 VARCHAR(255);
  p_RelatedEntityDisplayType_addaa7834944 VARCHAR(20);
  p_EntityIDFieldName_addaa7834944 VARCHAR(100);
  p_ScopeDefault_addaa7834944 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_addaa7834944 BOOLEAN;
  p_ValuesToPackWithSchema_addaa7834944 VARCHAR(10);
  p_Status_addaa7834944 VARCHAR(25);
  p_AutoUpdateIsNameField_addaa7834944 BOOLEAN;
  p_AutoUpdateDefaultInView_addaa7834944 BOOLEAN;
  p_AutoUpdateCategory_addaa7834944 BOOLEAN;
  p_AutoUpdateDisplayName_addaa7834944 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_addaa7834944 BOOLEAN;
  p_Encrypt_addaa7834944 BOOLEAN;
  p_EncryptionKeyID_addaa7834944 UUID;
  p_AllowDecryptInAPI_addaa7834944 BOOLEAN;
  p_SendEncryptedValue_addaa7834944 BOOLEAN;
  p_IsSoftPrimaryKey_addaa7834944 BOOLEAN;
  p_IsSoftForeignKey_addaa7834944 BOOLEAN;
  p_RelatedEntityJoinFields_addaa7834944 TEXT;
  p_JSONType_addaa7834944 VARCHAR(255);
  p_JSONTypeIsArray_addaa7834944 BOOLEAN;
  p_JSONTypeDefinition_addaa7834944 TEXT;
  p_UserSearchPredicateAPI_addaa7834944 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_addaa7834944 BOOLEAN;
  p_AutoUpdateFullTextSearch_addaa7834944 BOOLEAN;
  p_AutoUpdateExtendedType_addaa7834944 BOOLEAN;
  p_IsComputed_addaa7834944 BOOLEAN;
  p_EmbeddedRecord_addaa7834944 TEXT;
  p_Configuration_addaa7834944 TEXT;
  p_ID_addaa7834944 UUID;
BEGIN
  p_DisplayName_addaa7834944 := 'Credit Memo Number';
  p_Description_addaa7834944 := 'The credit memo''s document number: the order number, then CM and the memo''s sequence on that order. Set with CreditMemoAmount and never reused.';
  p_AutoUpdateDescription_addaa7834944 := TRUE;
  p_IsPrimaryKey_addaa7834944 := FALSE;
  p_IsUnique_addaa7834944 := TRUE;
  p_Category_addaa7834944 := 'Value and Limits';
  p_ValueListType_addaa7834944 := 'None';
  p_DefaultInView_addaa7834944 := FALSE;
  p_DefaultColumnWidth_addaa7834944 := 150;
  p_AllowUpdateAPI_addaa7834944 := TRUE;
  p_AllowUpdateInView_addaa7834944 := TRUE;
  p_IncludeInUserSearchAPI_addaa7834944 := FALSE;
  p_FullTextSearchEnabled_addaa7834944 := FALSE;
  p_IncludeInGeneratedForm_addaa7834944 := TRUE;
  p_GeneratedFormSection_addaa7834944 := 'Category';
  p_IsNameField_addaa7834944 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_addaa7834944 := FALSE;
  p_RelatedEntityDisplayType_addaa7834944 := 'Search';
  p_AutoUpdateRelatedEntityInfo_addaa7834944 := TRUE;
  p_ValuesToPackWithSchema_addaa7834944 := 'Auto';
  p_Status_addaa7834944 := 'Active';
  p_AutoUpdateIsNameField_addaa7834944 := TRUE;
  p_AutoUpdateDefaultInView_addaa7834944 := TRUE;
  p_AutoUpdateCategory_addaa7834944 := TRUE;
  p_AutoUpdateDisplayName_addaa7834944 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_addaa7834944 := TRUE;
  p_Encrypt_addaa7834944 := FALSE;
  p_AllowDecryptInAPI_addaa7834944 := FALSE;
  p_SendEncryptedValue_addaa7834944 := FALSE;
  p_IsSoftPrimaryKey_addaa7834944 := FALSE;
  p_IsSoftForeignKey_addaa7834944 := FALSE;
  p_JSONTypeIsArray_addaa7834944 := FALSE;
  p_UserSearchPredicateAPI_addaa7834944 := 'Contains';
  p_AutoUpdateUserSearchPredicate_addaa7834944 := TRUE;
  p_AutoUpdateFullTextSearch_addaa7834944 := TRUE;
  p_AutoUpdateExtendedType_addaa7834944 := TRUE;
  p_IsComputed_addaa7834944 := FALSE;
  p_ID_addaa7834944 := '54840CFB-D02E-4015-974E-BB757ED561D7';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_addaa7834944,
    'Description', p_Description_addaa7834944,
    'AutoUpdateDescription', p_AutoUpdateDescription_addaa7834944,
    'IsPrimaryKey', p_IsPrimaryKey_addaa7834944,
    'IsUnique', p_IsUnique_addaa7834944,
    'Category', p_Category_addaa7834944,
    'ValueListType', p_ValueListType_addaa7834944,
    'ExtendedType', p_ExtendedType_addaa7834944,
    'CodeType', p_CodeType_addaa7834944,
    'DefaultInView', p_DefaultInView_addaa7834944,
    'ViewCellTemplate', p_ViewCellTemplate_addaa7834944,
    'DefaultColumnWidth', p_DefaultColumnWidth_addaa7834944,
    'AllowUpdateAPI', p_AllowUpdateAPI_addaa7834944,
    'AllowUpdateInView', p_AllowUpdateInView_addaa7834944,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_addaa7834944,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_addaa7834944,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_addaa7834944,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_addaa7834944,
    'GeneratedFormSection', p_GeneratedFormSection_addaa7834944,
    'IsNameField', p_IsNameField_addaa7834944,
    'RelatedEntityID', p_RelatedEntityID_addaa7834944,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_addaa7834944,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_addaa7834944,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_addaa7834944,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_addaa7834944,
    'EntityIDFieldName', p_EntityIDFieldName_addaa7834944,
    'ScopeDefault', p_ScopeDefault_addaa7834944,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_addaa7834944,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_addaa7834944,
    'Status', p_Status_addaa7834944,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_addaa7834944,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_addaa7834944,
    'AutoUpdateCategory', p_AutoUpdateCategory_addaa7834944,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_addaa7834944,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_addaa7834944,
    'Encrypt', p_Encrypt_addaa7834944,
    'EncryptionKeyID', p_EncryptionKeyID_addaa7834944,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_addaa7834944,
    'SendEncryptedValue', p_SendEncryptedValue_addaa7834944,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_addaa7834944,
    'IsSoftForeignKey', p_IsSoftForeignKey_addaa7834944,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_addaa7834944,
    'JSONType', p_JSONType_addaa7834944,
    'JSONTypeIsArray', p_JSONTypeIsArray_addaa7834944,
    'JSONTypeDefinition', p_JSONTypeDefinition_addaa7834944,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_addaa7834944,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_addaa7834944,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_addaa7834944,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_addaa7834944,
    'IsComputed', p_IsComputed_addaa7834944
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_addaa7834944,
    'Configuration', p_Configuration_addaa7834944,
    'ID', p_ID_addaa7834944
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_addaa7834944, p_Description := p_Description_addaa7834944, p_AutoUpdateDescription := p_AutoUpdateDescription_addaa7834944, p_IsPrimaryKey := p_IsPrimaryKey_addaa7834944, p_IsUnique := p_IsUnique_addaa7834944, p_Category := p_Category_addaa7834944, p_ValueListType := p_ValueListType_addaa7834944, p_ExtendedType := p_ExtendedType_addaa7834944, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_addaa7834944, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_addaa7834944, p_ViewCellTemplate := p_ViewCellTemplate_addaa7834944, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_addaa7834944, p_AllowUpdateAPI := p_AllowUpdateAPI_addaa7834944, p_AllowUpdateInView := p_AllowUpdateInView_addaa7834944, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_addaa7834944, p_FullTextSearchEnabled := p_FullTextSearchEnabled_addaa7834944, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_addaa7834944, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_addaa7834944, p_GeneratedFormSection := p_GeneratedFormSection_addaa7834944, p_IsNameField := p_IsNameField_addaa7834944, p_RelatedEntityID := p_RelatedEntityID_addaa7834944, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_addaa7834944, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_addaa7834944, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_addaa7834944, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_addaa7834944, p_EntityIDFieldName := p_EntityIDFieldName_addaa7834944, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_addaa7834944, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_addaa7834944, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_addaa7834944, p_Status := p_Status_addaa7834944, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_addaa7834944, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_addaa7834944, p_AutoUpdateCategory := p_AutoUpdateCategory_addaa7834944, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_addaa7834944, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_addaa7834944, p_Encrypt := p_Encrypt_addaa7834944, p_EncryptionKeyID := p_EncryptionKeyID_addaa7834944, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_addaa7834944, p_SendEncryptedValue := p_SendEncryptedValue_addaa7834944, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_addaa7834944, p_IsSoftForeignKey := p_IsSoftForeignKey_addaa7834944, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_addaa7834944, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_addaa7834944, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_addaa7834944, p_JSONTypeDefinition := p_JSONTypeDefinition_addaa7834944, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_addaa7834944, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_addaa7834944, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_addaa7834944, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_addaa7834944, p_IsComputed := p_IsComputed_addaa7834944, p_EmbeddedRecord := p_EmbeddedRecord_addaa7834944, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_addaa7834944, p_Configuration_Clear := TRUE, p_ID := p_ID_addaa7834944);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_143027d97253 VARCHAR(255);
  p_Description_143027d97253 TEXT;
  p_AutoUpdateDescription_143027d97253 BOOLEAN;
  p_IsPrimaryKey_143027d97253 BOOLEAN;
  p_IsUnique_143027d97253 BOOLEAN;
  p_Category_143027d97253 VARCHAR(255);
  p_ValueListType_143027d97253 VARCHAR(20);
  p_ExtendedType_143027d97253 VARCHAR(50);
  p_CodeType_143027d97253 VARCHAR(50);
  p_DefaultInView_143027d97253 BOOLEAN;
  p_ViewCellTemplate_143027d97253 TEXT;
  p_DefaultColumnWidth_143027d97253 INTEGER;
  p_AllowUpdateAPI_143027d97253 BOOLEAN;
  p_AllowUpdateInView_143027d97253 BOOLEAN;
  p_IncludeInUserSearchAPI_143027d97253 BOOLEAN;
  p_FullTextSearchEnabled_143027d97253 BOOLEAN;
  p_UserSearchParamFormatAPI_143027d97253 VARCHAR(500);
  p_IncludeInGeneratedForm_143027d97253 BOOLEAN;
  p_GeneratedFormSection_143027d97253 VARCHAR(10);
  p_IsNameField_143027d97253 BOOLEAN;
  p_RelatedEntityID_143027d97253 UUID;
  p_RelatedEntityFieldName_143027d97253 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_143027d97253 BOOLEAN;
  p_RelatedEntityNameFieldMap_143027d97253 VARCHAR(255);
  p_RelatedEntityDisplayType_143027d97253 VARCHAR(20);
  p_EntityIDFieldName_143027d97253 VARCHAR(100);
  p_ScopeDefault_143027d97253 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_143027d97253 BOOLEAN;
  p_ValuesToPackWithSchema_143027d97253 VARCHAR(10);
  p_Status_143027d97253 VARCHAR(25);
  p_AutoUpdateIsNameField_143027d97253 BOOLEAN;
  p_AutoUpdateDefaultInView_143027d97253 BOOLEAN;
  p_AutoUpdateCategory_143027d97253 BOOLEAN;
  p_AutoUpdateDisplayName_143027d97253 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_143027d97253 BOOLEAN;
  p_Encrypt_143027d97253 BOOLEAN;
  p_EncryptionKeyID_143027d97253 UUID;
  p_AllowDecryptInAPI_143027d97253 BOOLEAN;
  p_SendEncryptedValue_143027d97253 BOOLEAN;
  p_IsSoftPrimaryKey_143027d97253 BOOLEAN;
  p_IsSoftForeignKey_143027d97253 BOOLEAN;
  p_RelatedEntityJoinFields_143027d97253 TEXT;
  p_JSONType_143027d97253 VARCHAR(255);
  p_JSONTypeIsArray_143027d97253 BOOLEAN;
  p_JSONTypeDefinition_143027d97253 TEXT;
  p_UserSearchPredicateAPI_143027d97253 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_143027d97253 BOOLEAN;
  p_AutoUpdateFullTextSearch_143027d97253 BOOLEAN;
  p_AutoUpdateExtendedType_143027d97253 BOOLEAN;
  p_IsComputed_143027d97253 BOOLEAN;
  p_EmbeddedRecord_143027d97253 TEXT;
  p_Configuration_143027d97253 TEXT;
  p_ID_143027d97253 UUID;
BEGIN
  p_DisplayName_143027d97253 := 'Amount Credited';
  p_Description_143027d97253 := 'What credit memos have credited on this instalment''s invoice. Balance is Amount less AmountCredited less AmountPaid.';
  p_AutoUpdateDescription_143027d97253 := TRUE;
  p_IsPrimaryKey_143027d97253 := FALSE;
  p_IsUnique_143027d97253 := FALSE;
  p_Category_143027d97253 := 'Payment Status';
  p_ValueListType_143027d97253 := 'None';
  p_DefaultInView_143027d97253 := FALSE;
  p_DefaultColumnWidth_143027d97253 := 150;
  p_AllowUpdateAPI_143027d97253 := TRUE;
  p_AllowUpdateInView_143027d97253 := TRUE;
  p_IncludeInUserSearchAPI_143027d97253 := FALSE;
  p_FullTextSearchEnabled_143027d97253 := FALSE;
  p_IncludeInGeneratedForm_143027d97253 := TRUE;
  p_GeneratedFormSection_143027d97253 := 'Category';
  p_IsNameField_143027d97253 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_143027d97253 := FALSE;
  p_RelatedEntityDisplayType_143027d97253 := 'Search';
  p_AutoUpdateRelatedEntityInfo_143027d97253 := TRUE;
  p_ValuesToPackWithSchema_143027d97253 := 'Auto';
  p_Status_143027d97253 := 'Active';
  p_AutoUpdateIsNameField_143027d97253 := TRUE;
  p_AutoUpdateDefaultInView_143027d97253 := TRUE;
  p_AutoUpdateCategory_143027d97253 := TRUE;
  p_AutoUpdateDisplayName_143027d97253 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_143027d97253 := TRUE;
  p_Encrypt_143027d97253 := FALSE;
  p_AllowDecryptInAPI_143027d97253 := FALSE;
  p_SendEncryptedValue_143027d97253 := FALSE;
  p_IsSoftPrimaryKey_143027d97253 := FALSE;
  p_IsSoftForeignKey_143027d97253 := FALSE;
  p_JSONTypeIsArray_143027d97253 := FALSE;
  p_UserSearchPredicateAPI_143027d97253 := 'Contains';
  p_AutoUpdateUserSearchPredicate_143027d97253 := TRUE;
  p_AutoUpdateFullTextSearch_143027d97253 := TRUE;
  p_AutoUpdateExtendedType_143027d97253 := TRUE;
  p_IsComputed_143027d97253 := FALSE;
  p_ID_143027d97253 := 'A1561299-24BE-4AC5-8E9F-7D96B3D94B56';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_143027d97253,
    'Description', p_Description_143027d97253,
    'AutoUpdateDescription', p_AutoUpdateDescription_143027d97253,
    'IsPrimaryKey', p_IsPrimaryKey_143027d97253,
    'IsUnique', p_IsUnique_143027d97253,
    'Category', p_Category_143027d97253,
    'ValueListType', p_ValueListType_143027d97253,
    'ExtendedType', p_ExtendedType_143027d97253,
    'CodeType', p_CodeType_143027d97253,
    'DefaultInView', p_DefaultInView_143027d97253,
    'ViewCellTemplate', p_ViewCellTemplate_143027d97253,
    'DefaultColumnWidth', p_DefaultColumnWidth_143027d97253,
    'AllowUpdateAPI', p_AllowUpdateAPI_143027d97253,
    'AllowUpdateInView', p_AllowUpdateInView_143027d97253,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_143027d97253,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_143027d97253,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_143027d97253,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_143027d97253,
    'GeneratedFormSection', p_GeneratedFormSection_143027d97253,
    'IsNameField', p_IsNameField_143027d97253,
    'RelatedEntityID', p_RelatedEntityID_143027d97253,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_143027d97253,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_143027d97253,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_143027d97253,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_143027d97253,
    'EntityIDFieldName', p_EntityIDFieldName_143027d97253,
    'ScopeDefault', p_ScopeDefault_143027d97253,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_143027d97253,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_143027d97253,
    'Status', p_Status_143027d97253,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_143027d97253,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_143027d97253,
    'AutoUpdateCategory', p_AutoUpdateCategory_143027d97253,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_143027d97253,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_143027d97253,
    'Encrypt', p_Encrypt_143027d97253,
    'EncryptionKeyID', p_EncryptionKeyID_143027d97253,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_143027d97253,
    'SendEncryptedValue', p_SendEncryptedValue_143027d97253,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_143027d97253,
    'IsSoftForeignKey', p_IsSoftForeignKey_143027d97253,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_143027d97253,
    'JSONType', p_JSONType_143027d97253,
    'JSONTypeIsArray', p_JSONTypeIsArray_143027d97253,
    'JSONTypeDefinition', p_JSONTypeDefinition_143027d97253,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_143027d97253,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_143027d97253,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_143027d97253,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_143027d97253,
    'IsComputed', p_IsComputed_143027d97253
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_143027d97253,
    'Configuration', p_Configuration_143027d97253,
    'ID', p_ID_143027d97253
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_143027d97253, p_Description := p_Description_143027d97253, p_AutoUpdateDescription := p_AutoUpdateDescription_143027d97253, p_IsPrimaryKey := p_IsPrimaryKey_143027d97253, p_IsUnique := p_IsUnique_143027d97253, p_Category := p_Category_143027d97253, p_ValueListType := p_ValueListType_143027d97253, p_ExtendedType := p_ExtendedType_143027d97253, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_143027d97253, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_143027d97253, p_ViewCellTemplate := p_ViewCellTemplate_143027d97253, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_143027d97253, p_AllowUpdateAPI := p_AllowUpdateAPI_143027d97253, p_AllowUpdateInView := p_AllowUpdateInView_143027d97253, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_143027d97253, p_FullTextSearchEnabled := p_FullTextSearchEnabled_143027d97253, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_143027d97253, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_143027d97253, p_GeneratedFormSection := p_GeneratedFormSection_143027d97253, p_IsNameField := p_IsNameField_143027d97253, p_RelatedEntityID := p_RelatedEntityID_143027d97253, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_143027d97253, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_143027d97253, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_143027d97253, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_143027d97253, p_EntityIDFieldName := p_EntityIDFieldName_143027d97253, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_143027d97253, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_143027d97253, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_143027d97253, p_Status := p_Status_143027d97253, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_143027d97253, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_143027d97253, p_AutoUpdateCategory := p_AutoUpdateCategory_143027d97253, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_143027d97253, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_143027d97253, p_Encrypt := p_Encrypt_143027d97253, p_EncryptionKeyID := p_EncryptionKeyID_143027d97253, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_143027d97253, p_SendEncryptedValue := p_SendEncryptedValue_143027d97253, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_143027d97253, p_IsSoftForeignKey := p_IsSoftForeignKey_143027d97253, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_143027d97253, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_143027d97253, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_143027d97253, p_JSONTypeDefinition := p_JSONTypeDefinition_143027d97253, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_143027d97253, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_143027d97253, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_143027d97253, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_143027d97253, p_IsComputed := p_IsComputed_143027d97253, p_EmbeddedRecord := p_EmbeddedRecord_143027d97253, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_143027d97253, p_Configuration_Clear := TRUE, p_ID := p_ID_143027d97253);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_cda30e4ad3d0 VARCHAR(255);
  p_Description_cda30e4ad3d0 TEXT;
  p_AutoUpdateDescription_cda30e4ad3d0 BOOLEAN;
  p_IsPrimaryKey_cda30e4ad3d0 BOOLEAN;
  p_IsUnique_cda30e4ad3d0 BOOLEAN;
  p_Category_cda30e4ad3d0 VARCHAR(255);
  p_ValueListType_cda30e4ad3d0 VARCHAR(20);
  p_ExtendedType_cda30e4ad3d0 VARCHAR(50);
  p_CodeType_cda30e4ad3d0 VARCHAR(50);
  p_DefaultInView_cda30e4ad3d0 BOOLEAN;
  p_ViewCellTemplate_cda30e4ad3d0 TEXT;
  p_DefaultColumnWidth_cda30e4ad3d0 INTEGER;
  p_AllowUpdateAPI_cda30e4ad3d0 BOOLEAN;
  p_AllowUpdateInView_cda30e4ad3d0 BOOLEAN;
  p_IncludeInUserSearchAPI_cda30e4ad3d0 BOOLEAN;
  p_FullTextSearchEnabled_cda30e4ad3d0 BOOLEAN;
  p_UserSearchParamFormatAPI_cda30e4ad3d0 VARCHAR(500);
  p_IncludeInGeneratedForm_cda30e4ad3d0 BOOLEAN;
  p_GeneratedFormSection_cda30e4ad3d0 VARCHAR(10);
  p_IsNameField_cda30e4ad3d0 BOOLEAN;
  p_RelatedEntityID_cda30e4ad3d0 UUID;
  p_RelatedEntityFieldName_cda30e4ad3d0 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_cda30e4ad3d0 BOOLEAN;
  p_RelatedEntityNameFieldMap_cda30e4ad3d0 VARCHAR(255);
  p_RelatedEntityDisplayType_cda30e4ad3d0 VARCHAR(20);
  p_EntityIDFieldName_cda30e4ad3d0 VARCHAR(100);
  p_ScopeDefault_cda30e4ad3d0 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_cda30e4ad3d0 BOOLEAN;
  p_ValuesToPackWithSchema_cda30e4ad3d0 VARCHAR(10);
  p_Status_cda30e4ad3d0 VARCHAR(25);
  p_AutoUpdateIsNameField_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateDefaultInView_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateCategory_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateDisplayName_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_cda30e4ad3d0 BOOLEAN;
  p_Encrypt_cda30e4ad3d0 BOOLEAN;
  p_EncryptionKeyID_cda30e4ad3d0 UUID;
  p_AllowDecryptInAPI_cda30e4ad3d0 BOOLEAN;
  p_SendEncryptedValue_cda30e4ad3d0 BOOLEAN;
  p_IsSoftPrimaryKey_cda30e4ad3d0 BOOLEAN;
  p_IsSoftForeignKey_cda30e4ad3d0 BOOLEAN;
  p_RelatedEntityJoinFields_cda30e4ad3d0 TEXT;
  p_JSONType_cda30e4ad3d0 VARCHAR(255);
  p_JSONTypeIsArray_cda30e4ad3d0 BOOLEAN;
  p_JSONTypeDefinition_cda30e4ad3d0 TEXT;
  p_UserSearchPredicateAPI_cda30e4ad3d0 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateFullTextSearch_cda30e4ad3d0 BOOLEAN;
  p_AutoUpdateExtendedType_cda30e4ad3d0 BOOLEAN;
  p_IsComputed_cda30e4ad3d0 BOOLEAN;
  p_EmbeddedRecord_cda30e4ad3d0 TEXT;
  p_Configuration_cda30e4ad3d0 TEXT;
  p_ID_cda30e4ad3d0 UUID;
BEGIN
  p_DisplayName_cda30e4ad3d0 := 'Requires Sale Approval';
  p_Description_cda30e4ad3d0 := 'When true, every line for this product holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. Overrides the product''s category and type. NULL means inherit from the next level: the product category and its ancestors, then the product type.';
  p_AutoUpdateDescription_cda30e4ad3d0 := TRUE;
  p_IsPrimaryKey_cda30e4ad3d0 := FALSE;
  p_IsUnique_cda30e4ad3d0 := FALSE;
  p_Category_cda30e4ad3d0 := 'Pricing and Ordering';
  p_ValueListType_cda30e4ad3d0 := 'None';
  p_DefaultInView_cda30e4ad3d0 := FALSE;
  p_DefaultColumnWidth_cda30e4ad3d0 := 150;
  p_AllowUpdateAPI_cda30e4ad3d0 := TRUE;
  p_AllowUpdateInView_cda30e4ad3d0 := TRUE;
  p_IncludeInUserSearchAPI_cda30e4ad3d0 := FALSE;
  p_FullTextSearchEnabled_cda30e4ad3d0 := FALSE;
  p_IncludeInGeneratedForm_cda30e4ad3d0 := TRUE;
  p_GeneratedFormSection_cda30e4ad3d0 := 'Category';
  p_IsNameField_cda30e4ad3d0 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_cda30e4ad3d0 := FALSE;
  p_RelatedEntityDisplayType_cda30e4ad3d0 := 'Search';
  p_AutoUpdateRelatedEntityInfo_cda30e4ad3d0 := TRUE;
  p_ValuesToPackWithSchema_cda30e4ad3d0 := 'Auto';
  p_Status_cda30e4ad3d0 := 'Active';
  p_AutoUpdateIsNameField_cda30e4ad3d0 := TRUE;
  p_AutoUpdateDefaultInView_cda30e4ad3d0 := TRUE;
  p_AutoUpdateCategory_cda30e4ad3d0 := TRUE;
  p_AutoUpdateDisplayName_cda30e4ad3d0 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_cda30e4ad3d0 := TRUE;
  p_Encrypt_cda30e4ad3d0 := FALSE;
  p_AllowDecryptInAPI_cda30e4ad3d0 := FALSE;
  p_SendEncryptedValue_cda30e4ad3d0 := FALSE;
  p_IsSoftPrimaryKey_cda30e4ad3d0 := FALSE;
  p_IsSoftForeignKey_cda30e4ad3d0 := FALSE;
  p_JSONTypeIsArray_cda30e4ad3d0 := FALSE;
  p_UserSearchPredicateAPI_cda30e4ad3d0 := 'Contains';
  p_AutoUpdateUserSearchPredicate_cda30e4ad3d0 := TRUE;
  p_AutoUpdateFullTextSearch_cda30e4ad3d0 := TRUE;
  p_AutoUpdateExtendedType_cda30e4ad3d0 := TRUE;
  p_IsComputed_cda30e4ad3d0 := FALSE;
  p_ID_cda30e4ad3d0 := 'F3A965CA-55EC-4DC7-92DC-5E73DA0F5C16';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_cda30e4ad3d0,
    'Description', p_Description_cda30e4ad3d0,
    'AutoUpdateDescription', p_AutoUpdateDescription_cda30e4ad3d0,
    'IsPrimaryKey', p_IsPrimaryKey_cda30e4ad3d0,
    'IsUnique', p_IsUnique_cda30e4ad3d0,
    'Category', p_Category_cda30e4ad3d0,
    'ValueListType', p_ValueListType_cda30e4ad3d0,
    'ExtendedType', p_ExtendedType_cda30e4ad3d0,
    'CodeType', p_CodeType_cda30e4ad3d0,
    'DefaultInView', p_DefaultInView_cda30e4ad3d0,
    'ViewCellTemplate', p_ViewCellTemplate_cda30e4ad3d0,
    'DefaultColumnWidth', p_DefaultColumnWidth_cda30e4ad3d0,
    'AllowUpdateAPI', p_AllowUpdateAPI_cda30e4ad3d0,
    'AllowUpdateInView', p_AllowUpdateInView_cda30e4ad3d0,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_cda30e4ad3d0,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_cda30e4ad3d0,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_cda30e4ad3d0,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_cda30e4ad3d0,
    'GeneratedFormSection', p_GeneratedFormSection_cda30e4ad3d0,
    'IsNameField', p_IsNameField_cda30e4ad3d0,
    'RelatedEntityID', p_RelatedEntityID_cda30e4ad3d0,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_cda30e4ad3d0,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_cda30e4ad3d0,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_cda30e4ad3d0,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_cda30e4ad3d0,
    'EntityIDFieldName', p_EntityIDFieldName_cda30e4ad3d0,
    'ScopeDefault', p_ScopeDefault_cda30e4ad3d0,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_cda30e4ad3d0,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_cda30e4ad3d0,
    'Status', p_Status_cda30e4ad3d0,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_cda30e4ad3d0,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_cda30e4ad3d0,
    'AutoUpdateCategory', p_AutoUpdateCategory_cda30e4ad3d0,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_cda30e4ad3d0,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_cda30e4ad3d0,
    'Encrypt', p_Encrypt_cda30e4ad3d0,
    'EncryptionKeyID', p_EncryptionKeyID_cda30e4ad3d0,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_cda30e4ad3d0,
    'SendEncryptedValue', p_SendEncryptedValue_cda30e4ad3d0,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_cda30e4ad3d0,
    'IsSoftForeignKey', p_IsSoftForeignKey_cda30e4ad3d0,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_cda30e4ad3d0,
    'JSONType', p_JSONType_cda30e4ad3d0,
    'JSONTypeIsArray', p_JSONTypeIsArray_cda30e4ad3d0,
    'JSONTypeDefinition', p_JSONTypeDefinition_cda30e4ad3d0,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_cda30e4ad3d0,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_cda30e4ad3d0,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_cda30e4ad3d0,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_cda30e4ad3d0,
    'IsComputed', p_IsComputed_cda30e4ad3d0
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_cda30e4ad3d0,
    'Configuration', p_Configuration_cda30e4ad3d0,
    'ID', p_ID_cda30e4ad3d0
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_cda30e4ad3d0, p_Description := p_Description_cda30e4ad3d0, p_AutoUpdateDescription := p_AutoUpdateDescription_cda30e4ad3d0, p_IsPrimaryKey := p_IsPrimaryKey_cda30e4ad3d0, p_IsUnique := p_IsUnique_cda30e4ad3d0, p_Category := p_Category_cda30e4ad3d0, p_ValueListType := p_ValueListType_cda30e4ad3d0, p_ExtendedType := p_ExtendedType_cda30e4ad3d0, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_cda30e4ad3d0, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_cda30e4ad3d0, p_ViewCellTemplate := p_ViewCellTemplate_cda30e4ad3d0, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_cda30e4ad3d0, p_AllowUpdateAPI := p_AllowUpdateAPI_cda30e4ad3d0, p_AllowUpdateInView := p_AllowUpdateInView_cda30e4ad3d0, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_cda30e4ad3d0, p_FullTextSearchEnabled := p_FullTextSearchEnabled_cda30e4ad3d0, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_cda30e4ad3d0, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_cda30e4ad3d0, p_GeneratedFormSection := p_GeneratedFormSection_cda30e4ad3d0, p_IsNameField := p_IsNameField_cda30e4ad3d0, p_RelatedEntityID := p_RelatedEntityID_cda30e4ad3d0, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_cda30e4ad3d0, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_cda30e4ad3d0, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_cda30e4ad3d0, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_cda30e4ad3d0, p_EntityIDFieldName := p_EntityIDFieldName_cda30e4ad3d0, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_cda30e4ad3d0, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_cda30e4ad3d0, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_cda30e4ad3d0, p_Status := p_Status_cda30e4ad3d0, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_cda30e4ad3d0, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_cda30e4ad3d0, p_AutoUpdateCategory := p_AutoUpdateCategory_cda30e4ad3d0, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_cda30e4ad3d0, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_cda30e4ad3d0, p_Encrypt := p_Encrypt_cda30e4ad3d0, p_EncryptionKeyID := p_EncryptionKeyID_cda30e4ad3d0, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_cda30e4ad3d0, p_SendEncryptedValue := p_SendEncryptedValue_cda30e4ad3d0, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_cda30e4ad3d0, p_IsSoftForeignKey := p_IsSoftForeignKey_cda30e4ad3d0, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_cda30e4ad3d0, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_cda30e4ad3d0, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_cda30e4ad3d0, p_JSONTypeDefinition := p_JSONTypeDefinition_cda30e4ad3d0, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_cda30e4ad3d0, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_cda30e4ad3d0, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_cda30e4ad3d0, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_cda30e4ad3d0, p_IsComputed := p_IsComputed_cda30e4ad3d0, p_EmbeddedRecord := p_EmbeddedRecord_cda30e4ad3d0, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_cda30e4ad3d0, p_Configuration_Clear := TRUE, p_ID := p_ID_cda30e4ad3d0);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_3d6011a9e5a8 VARCHAR(255);
  p_Description_3d6011a9e5a8 TEXT;
  p_AutoUpdateDescription_3d6011a9e5a8 BOOLEAN;
  p_IsPrimaryKey_3d6011a9e5a8 BOOLEAN;
  p_IsUnique_3d6011a9e5a8 BOOLEAN;
  p_Category_3d6011a9e5a8 VARCHAR(255);
  p_ValueListType_3d6011a9e5a8 VARCHAR(20);
  p_ExtendedType_3d6011a9e5a8 VARCHAR(50);
  p_CodeType_3d6011a9e5a8 VARCHAR(50);
  p_DefaultInView_3d6011a9e5a8 BOOLEAN;
  p_ViewCellTemplate_3d6011a9e5a8 TEXT;
  p_DefaultColumnWidth_3d6011a9e5a8 INTEGER;
  p_AllowUpdateAPI_3d6011a9e5a8 BOOLEAN;
  p_AllowUpdateInView_3d6011a9e5a8 BOOLEAN;
  p_IncludeInUserSearchAPI_3d6011a9e5a8 BOOLEAN;
  p_FullTextSearchEnabled_3d6011a9e5a8 BOOLEAN;
  p_UserSearchParamFormatAPI_3d6011a9e5a8 VARCHAR(500);
  p_IncludeInGeneratedForm_3d6011a9e5a8 BOOLEAN;
  p_GeneratedFormSection_3d6011a9e5a8 VARCHAR(10);
  p_IsNameField_3d6011a9e5a8 BOOLEAN;
  p_RelatedEntityID_3d6011a9e5a8 UUID;
  p_RelatedEntityFieldName_3d6011a9e5a8 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_3d6011a9e5a8 BOOLEAN;
  p_RelatedEntityNameFieldMap_3d6011a9e5a8 VARCHAR(255);
  p_RelatedEntityDisplayType_3d6011a9e5a8 VARCHAR(20);
  p_EntityIDFieldName_3d6011a9e5a8 VARCHAR(100);
  p_ScopeDefault_3d6011a9e5a8 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_3d6011a9e5a8 BOOLEAN;
  p_ValuesToPackWithSchema_3d6011a9e5a8 VARCHAR(10);
  p_Status_3d6011a9e5a8 VARCHAR(25);
  p_AutoUpdateIsNameField_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateDefaultInView_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateCategory_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateDisplayName_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_3d6011a9e5a8 BOOLEAN;
  p_Encrypt_3d6011a9e5a8 BOOLEAN;
  p_EncryptionKeyID_3d6011a9e5a8 UUID;
  p_AllowDecryptInAPI_3d6011a9e5a8 BOOLEAN;
  p_SendEncryptedValue_3d6011a9e5a8 BOOLEAN;
  p_IsSoftPrimaryKey_3d6011a9e5a8 BOOLEAN;
  p_IsSoftForeignKey_3d6011a9e5a8 BOOLEAN;
  p_RelatedEntityJoinFields_3d6011a9e5a8 TEXT;
  p_JSONType_3d6011a9e5a8 VARCHAR(255);
  p_JSONTypeIsArray_3d6011a9e5a8 BOOLEAN;
  p_JSONTypeDefinition_3d6011a9e5a8 TEXT;
  p_UserSearchPredicateAPI_3d6011a9e5a8 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateFullTextSearch_3d6011a9e5a8 BOOLEAN;
  p_AutoUpdateExtendedType_3d6011a9e5a8 BOOLEAN;
  p_IsComputed_3d6011a9e5a8 BOOLEAN;
  p_EmbeddedRecord_3d6011a9e5a8 TEXT;
  p_Configuration_3d6011a9e5a8 TEXT;
  p_ID_3d6011a9e5a8 UUID;
BEGIN
  p_DisplayName_3d6011a9e5a8 := 'Requires Sale Approval';
  p_AutoUpdateDescription_3d6011a9e5a8 := TRUE;
  p_IsPrimaryKey_3d6011a9e5a8 := FALSE;
  p_IsUnique_3d6011a9e5a8 := FALSE;
  p_Category_3d6011a9e5a8 := 'Product Details';
  p_ValueListType_3d6011a9e5a8 := 'None';
  p_DefaultInView_3d6011a9e5a8 := FALSE;
  p_DefaultColumnWidth_3d6011a9e5a8 := 150;
  p_AllowUpdateAPI_3d6011a9e5a8 := TRUE;
  p_AllowUpdateInView_3d6011a9e5a8 := TRUE;
  p_IncludeInUserSearchAPI_3d6011a9e5a8 := FALSE;
  p_FullTextSearchEnabled_3d6011a9e5a8 := FALSE;
  p_IncludeInGeneratedForm_3d6011a9e5a8 := TRUE;
  p_GeneratedFormSection_3d6011a9e5a8 := 'Category';
  p_IsNameField_3d6011a9e5a8 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_3d6011a9e5a8 := TRUE;
  p_RelatedEntityDisplayType_3d6011a9e5a8 := 'Search';
  p_AutoUpdateRelatedEntityInfo_3d6011a9e5a8 := TRUE;
  p_ValuesToPackWithSchema_3d6011a9e5a8 := 'Auto';
  p_Status_3d6011a9e5a8 := 'Active';
  p_AutoUpdateIsNameField_3d6011a9e5a8 := TRUE;
  p_AutoUpdateDefaultInView_3d6011a9e5a8 := TRUE;
  p_AutoUpdateCategory_3d6011a9e5a8 := TRUE;
  p_AutoUpdateDisplayName_3d6011a9e5a8 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_3d6011a9e5a8 := TRUE;
  p_Encrypt_3d6011a9e5a8 := FALSE;
  p_AllowDecryptInAPI_3d6011a9e5a8 := FALSE;
  p_SendEncryptedValue_3d6011a9e5a8 := FALSE;
  p_IsSoftPrimaryKey_3d6011a9e5a8 := FALSE;
  p_IsSoftForeignKey_3d6011a9e5a8 := FALSE;
  p_JSONTypeIsArray_3d6011a9e5a8 := FALSE;
  p_UserSearchPredicateAPI_3d6011a9e5a8 := 'Contains';
  p_AutoUpdateUserSearchPredicate_3d6011a9e5a8 := TRUE;
  p_AutoUpdateFullTextSearch_3d6011a9e5a8 := TRUE;
  p_AutoUpdateExtendedType_3d6011a9e5a8 := TRUE;
  p_IsComputed_3d6011a9e5a8 := FALSE;
  p_ID_3d6011a9e5a8 := 'D15A1170-8887-47B3-93F2-47C7F544BB84';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_3d6011a9e5a8,
    'Description', p_Description_3d6011a9e5a8,
    'AutoUpdateDescription', p_AutoUpdateDescription_3d6011a9e5a8,
    'IsPrimaryKey', p_IsPrimaryKey_3d6011a9e5a8,
    'IsUnique', p_IsUnique_3d6011a9e5a8,
    'Category', p_Category_3d6011a9e5a8,
    'ValueListType', p_ValueListType_3d6011a9e5a8,
    'ExtendedType', p_ExtendedType_3d6011a9e5a8,
    'CodeType', p_CodeType_3d6011a9e5a8,
    'DefaultInView', p_DefaultInView_3d6011a9e5a8,
    'ViewCellTemplate', p_ViewCellTemplate_3d6011a9e5a8,
    'DefaultColumnWidth', p_DefaultColumnWidth_3d6011a9e5a8,
    'AllowUpdateAPI', p_AllowUpdateAPI_3d6011a9e5a8,
    'AllowUpdateInView', p_AllowUpdateInView_3d6011a9e5a8,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_3d6011a9e5a8,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_3d6011a9e5a8,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_3d6011a9e5a8,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_3d6011a9e5a8,
    'GeneratedFormSection', p_GeneratedFormSection_3d6011a9e5a8,
    'IsNameField', p_IsNameField_3d6011a9e5a8,
    'RelatedEntityID', p_RelatedEntityID_3d6011a9e5a8,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_3d6011a9e5a8,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_3d6011a9e5a8,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_3d6011a9e5a8,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_3d6011a9e5a8,
    'EntityIDFieldName', p_EntityIDFieldName_3d6011a9e5a8,
    'ScopeDefault', p_ScopeDefault_3d6011a9e5a8,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_3d6011a9e5a8,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_3d6011a9e5a8,
    'Status', p_Status_3d6011a9e5a8,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_3d6011a9e5a8,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_3d6011a9e5a8,
    'AutoUpdateCategory', p_AutoUpdateCategory_3d6011a9e5a8,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_3d6011a9e5a8,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_3d6011a9e5a8,
    'Encrypt', p_Encrypt_3d6011a9e5a8,
    'EncryptionKeyID', p_EncryptionKeyID_3d6011a9e5a8,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_3d6011a9e5a8,
    'SendEncryptedValue', p_SendEncryptedValue_3d6011a9e5a8,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_3d6011a9e5a8,
    'IsSoftForeignKey', p_IsSoftForeignKey_3d6011a9e5a8,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_3d6011a9e5a8,
    'JSONType', p_JSONType_3d6011a9e5a8,
    'JSONTypeIsArray', p_JSONTypeIsArray_3d6011a9e5a8,
    'JSONTypeDefinition', p_JSONTypeDefinition_3d6011a9e5a8,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_3d6011a9e5a8,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_3d6011a9e5a8,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_3d6011a9e5a8,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_3d6011a9e5a8,
    'IsComputed', p_IsComputed_3d6011a9e5a8
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_3d6011a9e5a8,
    'Configuration', p_Configuration_3d6011a9e5a8,
    'ID', p_ID_3d6011a9e5a8
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_3d6011a9e5a8, p_Description := p_Description_3d6011a9e5a8, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_3d6011a9e5a8, p_IsPrimaryKey := p_IsPrimaryKey_3d6011a9e5a8, p_IsUnique := p_IsUnique_3d6011a9e5a8, p_Category := p_Category_3d6011a9e5a8, p_ValueListType := p_ValueListType_3d6011a9e5a8, p_ExtendedType := p_ExtendedType_3d6011a9e5a8, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_3d6011a9e5a8, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_3d6011a9e5a8, p_ViewCellTemplate := p_ViewCellTemplate_3d6011a9e5a8, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_3d6011a9e5a8, p_AllowUpdateAPI := p_AllowUpdateAPI_3d6011a9e5a8, p_AllowUpdateInView := p_AllowUpdateInView_3d6011a9e5a8, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_3d6011a9e5a8, p_FullTextSearchEnabled := p_FullTextSearchEnabled_3d6011a9e5a8, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_3d6011a9e5a8, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_3d6011a9e5a8, p_GeneratedFormSection := p_GeneratedFormSection_3d6011a9e5a8, p_IsNameField := p_IsNameField_3d6011a9e5a8, p_RelatedEntityID := p_RelatedEntityID_3d6011a9e5a8, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_3d6011a9e5a8, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_3d6011a9e5a8, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_3d6011a9e5a8, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_3d6011a9e5a8, p_EntityIDFieldName := p_EntityIDFieldName_3d6011a9e5a8, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_3d6011a9e5a8, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_3d6011a9e5a8, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_3d6011a9e5a8, p_Status := p_Status_3d6011a9e5a8, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_3d6011a9e5a8, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_3d6011a9e5a8, p_AutoUpdateCategory := p_AutoUpdateCategory_3d6011a9e5a8, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_3d6011a9e5a8, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_3d6011a9e5a8, p_Encrypt := p_Encrypt_3d6011a9e5a8, p_EncryptionKeyID := p_EncryptionKeyID_3d6011a9e5a8, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_3d6011a9e5a8, p_SendEncryptedValue := p_SendEncryptedValue_3d6011a9e5a8, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_3d6011a9e5a8, p_IsSoftForeignKey := p_IsSoftForeignKey_3d6011a9e5a8, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_3d6011a9e5a8, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_3d6011a9e5a8, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_3d6011a9e5a8, p_JSONTypeDefinition := p_JSONTypeDefinition_3d6011a9e5a8, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_3d6011a9e5a8, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_3d6011a9e5a8, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_3d6011a9e5a8, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_3d6011a9e5a8, p_IsComputed := p_IsComputed_3d6011a9e5a8, p_EmbeddedRecord := p_EmbeddedRecord_3d6011a9e5a8, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_3d6011a9e5a8, p_Configuration_Clear := TRUE, p_ID := p_ID_3d6011a9e5a8);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_66cad606dd26 VARCHAR(255);
  p_Description_66cad606dd26 TEXT;
  p_AutoUpdateDescription_66cad606dd26 BOOLEAN;
  p_IsPrimaryKey_66cad606dd26 BOOLEAN;
  p_IsUnique_66cad606dd26 BOOLEAN;
  p_Category_66cad606dd26 VARCHAR(255);
  p_ValueListType_66cad606dd26 VARCHAR(20);
  p_ExtendedType_66cad606dd26 VARCHAR(50);
  p_CodeType_66cad606dd26 VARCHAR(50);
  p_DefaultInView_66cad606dd26 BOOLEAN;
  p_ViewCellTemplate_66cad606dd26 TEXT;
  p_DefaultColumnWidth_66cad606dd26 INTEGER;
  p_AllowUpdateAPI_66cad606dd26 BOOLEAN;
  p_AllowUpdateInView_66cad606dd26 BOOLEAN;
  p_IncludeInUserSearchAPI_66cad606dd26 BOOLEAN;
  p_FullTextSearchEnabled_66cad606dd26 BOOLEAN;
  p_UserSearchParamFormatAPI_66cad606dd26 VARCHAR(500);
  p_IncludeInGeneratedForm_66cad606dd26 BOOLEAN;
  p_GeneratedFormSection_66cad606dd26 VARCHAR(10);
  p_IsNameField_66cad606dd26 BOOLEAN;
  p_RelatedEntityID_66cad606dd26 UUID;
  p_RelatedEntityFieldName_66cad606dd26 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_66cad606dd26 BOOLEAN;
  p_RelatedEntityNameFieldMap_66cad606dd26 VARCHAR(255);
  p_RelatedEntityDisplayType_66cad606dd26 VARCHAR(20);
  p_EntityIDFieldName_66cad606dd26 VARCHAR(100);
  p_ScopeDefault_66cad606dd26 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_66cad606dd26 BOOLEAN;
  p_ValuesToPackWithSchema_66cad606dd26 VARCHAR(10);
  p_Status_66cad606dd26 VARCHAR(25);
  p_AutoUpdateIsNameField_66cad606dd26 BOOLEAN;
  p_AutoUpdateDefaultInView_66cad606dd26 BOOLEAN;
  p_AutoUpdateCategory_66cad606dd26 BOOLEAN;
  p_AutoUpdateDisplayName_66cad606dd26 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_66cad606dd26 BOOLEAN;
  p_Encrypt_66cad606dd26 BOOLEAN;
  p_EncryptionKeyID_66cad606dd26 UUID;
  p_AllowDecryptInAPI_66cad606dd26 BOOLEAN;
  p_SendEncryptedValue_66cad606dd26 BOOLEAN;
  p_IsSoftPrimaryKey_66cad606dd26 BOOLEAN;
  p_IsSoftForeignKey_66cad606dd26 BOOLEAN;
  p_RelatedEntityJoinFields_66cad606dd26 TEXT;
  p_JSONType_66cad606dd26 VARCHAR(255);
  p_JSONTypeIsArray_66cad606dd26 BOOLEAN;
  p_JSONTypeDefinition_66cad606dd26 TEXT;
  p_UserSearchPredicateAPI_66cad606dd26 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_66cad606dd26 BOOLEAN;
  p_AutoUpdateFullTextSearch_66cad606dd26 BOOLEAN;
  p_AutoUpdateExtendedType_66cad606dd26 BOOLEAN;
  p_IsComputed_66cad606dd26 BOOLEAN;
  p_EmbeddedRecord_66cad606dd26 TEXT;
  p_Configuration_66cad606dd26 TEXT;
  p_ID_66cad606dd26 UUID;
BEGIN
  p_DisplayName_66cad606dd26 := 'Requires Sale Approval';
  p_Description_66cad606dd26 := 'When true, every line for a product in this category holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it. NULL means inherit from the next level: the parent category, then the product type. A product''s own value overrides this.';
  p_AutoUpdateDescription_66cad606dd26 := TRUE;
  p_IsPrimaryKey_66cad606dd26 := FALSE;
  p_IsUnique_66cad606dd26 := FALSE;
  p_Category_66cad606dd26 := 'Default Settings';
  p_ValueListType_66cad606dd26 := 'None';
  p_DefaultInView_66cad606dd26 := FALSE;
  p_DefaultColumnWidth_66cad606dd26 := 150;
  p_AllowUpdateAPI_66cad606dd26 := TRUE;
  p_AllowUpdateInView_66cad606dd26 := TRUE;
  p_IncludeInUserSearchAPI_66cad606dd26 := FALSE;
  p_FullTextSearchEnabled_66cad606dd26 := FALSE;
  p_IncludeInGeneratedForm_66cad606dd26 := TRUE;
  p_GeneratedFormSection_66cad606dd26 := 'Category';
  p_IsNameField_66cad606dd26 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_66cad606dd26 := FALSE;
  p_RelatedEntityDisplayType_66cad606dd26 := 'Search';
  p_AutoUpdateRelatedEntityInfo_66cad606dd26 := TRUE;
  p_ValuesToPackWithSchema_66cad606dd26 := 'Auto';
  p_Status_66cad606dd26 := 'Active';
  p_AutoUpdateIsNameField_66cad606dd26 := TRUE;
  p_AutoUpdateDefaultInView_66cad606dd26 := TRUE;
  p_AutoUpdateCategory_66cad606dd26 := TRUE;
  p_AutoUpdateDisplayName_66cad606dd26 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_66cad606dd26 := TRUE;
  p_Encrypt_66cad606dd26 := FALSE;
  p_AllowDecryptInAPI_66cad606dd26 := FALSE;
  p_SendEncryptedValue_66cad606dd26 := FALSE;
  p_IsSoftPrimaryKey_66cad606dd26 := FALSE;
  p_IsSoftForeignKey_66cad606dd26 := FALSE;
  p_JSONTypeIsArray_66cad606dd26 := FALSE;
  p_UserSearchPredicateAPI_66cad606dd26 := 'Contains';
  p_AutoUpdateUserSearchPredicate_66cad606dd26 := TRUE;
  p_AutoUpdateFullTextSearch_66cad606dd26 := TRUE;
  p_AutoUpdateExtendedType_66cad606dd26 := TRUE;
  p_IsComputed_66cad606dd26 := FALSE;
  p_ID_66cad606dd26 := 'FBB44B84-FFA7-4188-B90B-28187472E614';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_66cad606dd26,
    'Description', p_Description_66cad606dd26,
    'AutoUpdateDescription', p_AutoUpdateDescription_66cad606dd26,
    'IsPrimaryKey', p_IsPrimaryKey_66cad606dd26,
    'IsUnique', p_IsUnique_66cad606dd26,
    'Category', p_Category_66cad606dd26,
    'ValueListType', p_ValueListType_66cad606dd26,
    'ExtendedType', p_ExtendedType_66cad606dd26,
    'CodeType', p_CodeType_66cad606dd26,
    'DefaultInView', p_DefaultInView_66cad606dd26,
    'ViewCellTemplate', p_ViewCellTemplate_66cad606dd26,
    'DefaultColumnWidth', p_DefaultColumnWidth_66cad606dd26,
    'AllowUpdateAPI', p_AllowUpdateAPI_66cad606dd26,
    'AllowUpdateInView', p_AllowUpdateInView_66cad606dd26,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_66cad606dd26,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_66cad606dd26,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_66cad606dd26,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_66cad606dd26,
    'GeneratedFormSection', p_GeneratedFormSection_66cad606dd26,
    'IsNameField', p_IsNameField_66cad606dd26,
    'RelatedEntityID', p_RelatedEntityID_66cad606dd26,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_66cad606dd26,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_66cad606dd26,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_66cad606dd26,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_66cad606dd26,
    'EntityIDFieldName', p_EntityIDFieldName_66cad606dd26,
    'ScopeDefault', p_ScopeDefault_66cad606dd26,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_66cad606dd26,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_66cad606dd26,
    'Status', p_Status_66cad606dd26,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_66cad606dd26,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_66cad606dd26,
    'AutoUpdateCategory', p_AutoUpdateCategory_66cad606dd26,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_66cad606dd26,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_66cad606dd26,
    'Encrypt', p_Encrypt_66cad606dd26,
    'EncryptionKeyID', p_EncryptionKeyID_66cad606dd26,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_66cad606dd26,
    'SendEncryptedValue', p_SendEncryptedValue_66cad606dd26,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_66cad606dd26,
    'IsSoftForeignKey', p_IsSoftForeignKey_66cad606dd26,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_66cad606dd26,
    'JSONType', p_JSONType_66cad606dd26,
    'JSONTypeIsArray', p_JSONTypeIsArray_66cad606dd26,
    'JSONTypeDefinition', p_JSONTypeDefinition_66cad606dd26,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_66cad606dd26,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_66cad606dd26,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_66cad606dd26,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_66cad606dd26,
    'IsComputed', p_IsComputed_66cad606dd26
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_66cad606dd26,
    'Configuration', p_Configuration_66cad606dd26,
    'ID', p_ID_66cad606dd26
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_66cad606dd26, p_Description := p_Description_66cad606dd26, p_AutoUpdateDescription := p_AutoUpdateDescription_66cad606dd26, p_IsPrimaryKey := p_IsPrimaryKey_66cad606dd26, p_IsUnique := p_IsUnique_66cad606dd26, p_Category := p_Category_66cad606dd26, p_ValueListType := p_ValueListType_66cad606dd26, p_ExtendedType := p_ExtendedType_66cad606dd26, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_66cad606dd26, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_66cad606dd26, p_ViewCellTemplate := p_ViewCellTemplate_66cad606dd26, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_66cad606dd26, p_AllowUpdateAPI := p_AllowUpdateAPI_66cad606dd26, p_AllowUpdateInView := p_AllowUpdateInView_66cad606dd26, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_66cad606dd26, p_FullTextSearchEnabled := p_FullTextSearchEnabled_66cad606dd26, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_66cad606dd26, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_66cad606dd26, p_GeneratedFormSection := p_GeneratedFormSection_66cad606dd26, p_IsNameField := p_IsNameField_66cad606dd26, p_RelatedEntityID := p_RelatedEntityID_66cad606dd26, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_66cad606dd26, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_66cad606dd26, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_66cad606dd26, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_66cad606dd26, p_EntityIDFieldName := p_EntityIDFieldName_66cad606dd26, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_66cad606dd26, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_66cad606dd26, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_66cad606dd26, p_Status := p_Status_66cad606dd26, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_66cad606dd26, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_66cad606dd26, p_AutoUpdateCategory := p_AutoUpdateCategory_66cad606dd26, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_66cad606dd26, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_66cad606dd26, p_Encrypt := p_Encrypt_66cad606dd26, p_EncryptionKeyID := p_EncryptionKeyID_66cad606dd26, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_66cad606dd26, p_SendEncryptedValue := p_SendEncryptedValue_66cad606dd26, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_66cad606dd26, p_IsSoftForeignKey := p_IsSoftForeignKey_66cad606dd26, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_66cad606dd26, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_66cad606dd26, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_66cad606dd26, p_JSONTypeDefinition := p_JSONTypeDefinition_66cad606dd26, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_66cad606dd26, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_66cad606dd26, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_66cad606dd26, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_66cad606dd26, p_IsComputed := p_IsComputed_66cad606dd26, p_EmbeddedRecord := p_EmbeddedRecord_66cad606dd26, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_66cad606dd26, p_Configuration_Clear := TRUE, p_ID := p_ID_66cad606dd26);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_3b3322840c7c VARCHAR(255);
  p_Description_3b3322840c7c TEXT;
  p_AutoUpdateDescription_3b3322840c7c BOOLEAN;
  p_IsPrimaryKey_3b3322840c7c BOOLEAN;
  p_IsUnique_3b3322840c7c BOOLEAN;
  p_Category_3b3322840c7c VARCHAR(255);
  p_ValueListType_3b3322840c7c VARCHAR(20);
  p_ExtendedType_3b3322840c7c VARCHAR(50);
  p_CodeType_3b3322840c7c VARCHAR(50);
  p_DefaultInView_3b3322840c7c BOOLEAN;
  p_ViewCellTemplate_3b3322840c7c TEXT;
  p_DefaultColumnWidth_3b3322840c7c INTEGER;
  p_AllowUpdateAPI_3b3322840c7c BOOLEAN;
  p_AllowUpdateInView_3b3322840c7c BOOLEAN;
  p_IncludeInUserSearchAPI_3b3322840c7c BOOLEAN;
  p_FullTextSearchEnabled_3b3322840c7c BOOLEAN;
  p_UserSearchParamFormatAPI_3b3322840c7c VARCHAR(500);
  p_IncludeInGeneratedForm_3b3322840c7c BOOLEAN;
  p_GeneratedFormSection_3b3322840c7c VARCHAR(10);
  p_IsNameField_3b3322840c7c BOOLEAN;
  p_RelatedEntityID_3b3322840c7c UUID;
  p_RelatedEntityFieldName_3b3322840c7c VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_3b3322840c7c BOOLEAN;
  p_RelatedEntityNameFieldMap_3b3322840c7c VARCHAR(255);
  p_RelatedEntityDisplayType_3b3322840c7c VARCHAR(20);
  p_EntityIDFieldName_3b3322840c7c VARCHAR(100);
  p_ScopeDefault_3b3322840c7c VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_3b3322840c7c BOOLEAN;
  p_ValuesToPackWithSchema_3b3322840c7c VARCHAR(10);
  p_Status_3b3322840c7c VARCHAR(25);
  p_AutoUpdateIsNameField_3b3322840c7c BOOLEAN;
  p_AutoUpdateDefaultInView_3b3322840c7c BOOLEAN;
  p_AutoUpdateCategory_3b3322840c7c BOOLEAN;
  p_AutoUpdateDisplayName_3b3322840c7c BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_3b3322840c7c BOOLEAN;
  p_Encrypt_3b3322840c7c BOOLEAN;
  p_EncryptionKeyID_3b3322840c7c UUID;
  p_AllowDecryptInAPI_3b3322840c7c BOOLEAN;
  p_SendEncryptedValue_3b3322840c7c BOOLEAN;
  p_IsSoftPrimaryKey_3b3322840c7c BOOLEAN;
  p_IsSoftForeignKey_3b3322840c7c BOOLEAN;
  p_RelatedEntityJoinFields_3b3322840c7c TEXT;
  p_JSONType_3b3322840c7c VARCHAR(255);
  p_JSONTypeIsArray_3b3322840c7c BOOLEAN;
  p_JSONTypeDefinition_3b3322840c7c TEXT;
  p_UserSearchPredicateAPI_3b3322840c7c VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_3b3322840c7c BOOLEAN;
  p_AutoUpdateFullTextSearch_3b3322840c7c BOOLEAN;
  p_AutoUpdateExtendedType_3b3322840c7c BOOLEAN;
  p_IsComputed_3b3322840c7c BOOLEAN;
  p_EmbeddedRecord_3b3322840c7c TEXT;
  p_Configuration_3b3322840c7c TEXT;
  p_ID_3b3322840c7c UUID;
BEGIN
  p_DisplayName_3b3322840c7c := 'Requires Sale Approval';
  p_Description_3b3322840c7c := 'When true, every line for a product of this type holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. For products priced per engagement, such as professional services or custom scope. NULL means not required. A product category or the product itself overrides this.';
  p_AutoUpdateDescription_3b3322840c7c := TRUE;
  p_IsPrimaryKey_3b3322840c7c := FALSE;
  p_IsUnique_3b3322840c7c := FALSE;
  p_Category_3b3322840c7c := 'Configuration and Extensions';
  p_ValueListType_3b3322840c7c := 'None';
  p_DefaultInView_3b3322840c7c := FALSE;
  p_DefaultColumnWidth_3b3322840c7c := 150;
  p_AllowUpdateAPI_3b3322840c7c := TRUE;
  p_AllowUpdateInView_3b3322840c7c := TRUE;
  p_IncludeInUserSearchAPI_3b3322840c7c := FALSE;
  p_FullTextSearchEnabled_3b3322840c7c := FALSE;
  p_IncludeInGeneratedForm_3b3322840c7c := TRUE;
  p_GeneratedFormSection_3b3322840c7c := 'Category';
  p_IsNameField_3b3322840c7c := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_3b3322840c7c := FALSE;
  p_RelatedEntityDisplayType_3b3322840c7c := 'Search';
  p_AutoUpdateRelatedEntityInfo_3b3322840c7c := TRUE;
  p_ValuesToPackWithSchema_3b3322840c7c := 'Auto';
  p_Status_3b3322840c7c := 'Active';
  p_AutoUpdateIsNameField_3b3322840c7c := TRUE;
  p_AutoUpdateDefaultInView_3b3322840c7c := TRUE;
  p_AutoUpdateCategory_3b3322840c7c := TRUE;
  p_AutoUpdateDisplayName_3b3322840c7c := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_3b3322840c7c := TRUE;
  p_Encrypt_3b3322840c7c := FALSE;
  p_AllowDecryptInAPI_3b3322840c7c := FALSE;
  p_SendEncryptedValue_3b3322840c7c := FALSE;
  p_IsSoftPrimaryKey_3b3322840c7c := FALSE;
  p_IsSoftForeignKey_3b3322840c7c := FALSE;
  p_JSONTypeIsArray_3b3322840c7c := FALSE;
  p_UserSearchPredicateAPI_3b3322840c7c := 'Contains';
  p_AutoUpdateUserSearchPredicate_3b3322840c7c := TRUE;
  p_AutoUpdateFullTextSearch_3b3322840c7c := TRUE;
  p_AutoUpdateExtendedType_3b3322840c7c := TRUE;
  p_IsComputed_3b3322840c7c := FALSE;
  p_ID_3b3322840c7c := 'C7CDCFCE-BDE2-4668-A25F-D4A1149F91B4';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_3b3322840c7c,
    'Description', p_Description_3b3322840c7c,
    'AutoUpdateDescription', p_AutoUpdateDescription_3b3322840c7c,
    'IsPrimaryKey', p_IsPrimaryKey_3b3322840c7c,
    'IsUnique', p_IsUnique_3b3322840c7c,
    'Category', p_Category_3b3322840c7c,
    'ValueListType', p_ValueListType_3b3322840c7c,
    'ExtendedType', p_ExtendedType_3b3322840c7c,
    'CodeType', p_CodeType_3b3322840c7c,
    'DefaultInView', p_DefaultInView_3b3322840c7c,
    'ViewCellTemplate', p_ViewCellTemplate_3b3322840c7c,
    'DefaultColumnWidth', p_DefaultColumnWidth_3b3322840c7c,
    'AllowUpdateAPI', p_AllowUpdateAPI_3b3322840c7c,
    'AllowUpdateInView', p_AllowUpdateInView_3b3322840c7c,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_3b3322840c7c,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_3b3322840c7c,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_3b3322840c7c,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_3b3322840c7c,
    'GeneratedFormSection', p_GeneratedFormSection_3b3322840c7c,
    'IsNameField', p_IsNameField_3b3322840c7c,
    'RelatedEntityID', p_RelatedEntityID_3b3322840c7c,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_3b3322840c7c,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_3b3322840c7c,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_3b3322840c7c,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_3b3322840c7c,
    'EntityIDFieldName', p_EntityIDFieldName_3b3322840c7c,
    'ScopeDefault', p_ScopeDefault_3b3322840c7c,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_3b3322840c7c,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_3b3322840c7c,
    'Status', p_Status_3b3322840c7c,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_3b3322840c7c,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_3b3322840c7c,
    'AutoUpdateCategory', p_AutoUpdateCategory_3b3322840c7c,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_3b3322840c7c,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_3b3322840c7c,
    'Encrypt', p_Encrypt_3b3322840c7c,
    'EncryptionKeyID', p_EncryptionKeyID_3b3322840c7c,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_3b3322840c7c,
    'SendEncryptedValue', p_SendEncryptedValue_3b3322840c7c,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_3b3322840c7c,
    'IsSoftForeignKey', p_IsSoftForeignKey_3b3322840c7c,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_3b3322840c7c,
    'JSONType', p_JSONType_3b3322840c7c,
    'JSONTypeIsArray', p_JSONTypeIsArray_3b3322840c7c,
    'JSONTypeDefinition', p_JSONTypeDefinition_3b3322840c7c,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_3b3322840c7c,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_3b3322840c7c,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_3b3322840c7c,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_3b3322840c7c,
    'IsComputed', p_IsComputed_3b3322840c7c
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_3b3322840c7c,
    'Configuration', p_Configuration_3b3322840c7c,
    'ID', p_ID_3b3322840c7c
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_3b3322840c7c, p_Description := p_Description_3b3322840c7c, p_AutoUpdateDescription := p_AutoUpdateDescription_3b3322840c7c, p_IsPrimaryKey := p_IsPrimaryKey_3b3322840c7c, p_IsUnique := p_IsUnique_3b3322840c7c, p_Category := p_Category_3b3322840c7c, p_ValueListType := p_ValueListType_3b3322840c7c, p_ExtendedType := p_ExtendedType_3b3322840c7c, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_3b3322840c7c, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_3b3322840c7c, p_ViewCellTemplate := p_ViewCellTemplate_3b3322840c7c, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_3b3322840c7c, p_AllowUpdateAPI := p_AllowUpdateAPI_3b3322840c7c, p_AllowUpdateInView := p_AllowUpdateInView_3b3322840c7c, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_3b3322840c7c, p_FullTextSearchEnabled := p_FullTextSearchEnabled_3b3322840c7c, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_3b3322840c7c, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_3b3322840c7c, p_GeneratedFormSection := p_GeneratedFormSection_3b3322840c7c, p_IsNameField := p_IsNameField_3b3322840c7c, p_RelatedEntityID := p_RelatedEntityID_3b3322840c7c, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_3b3322840c7c, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_3b3322840c7c, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_3b3322840c7c, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_3b3322840c7c, p_EntityIDFieldName := p_EntityIDFieldName_3b3322840c7c, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_3b3322840c7c, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_3b3322840c7c, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_3b3322840c7c, p_Status := p_Status_3b3322840c7c, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_3b3322840c7c, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_3b3322840c7c, p_AutoUpdateCategory := p_AutoUpdateCategory_3b3322840c7c, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_3b3322840c7c, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_3b3322840c7c, p_Encrypt := p_Encrypt_3b3322840c7c, p_EncryptionKeyID := p_EncryptionKeyID_3b3322840c7c, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_3b3322840c7c, p_SendEncryptedValue := p_SendEncryptedValue_3b3322840c7c, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_3b3322840c7c, p_IsSoftForeignKey := p_IsSoftForeignKey_3b3322840c7c, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_3b3322840c7c, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_3b3322840c7c, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_3b3322840c7c, p_JSONTypeDefinition := p_JSONTypeDefinition_3b3322840c7c, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_3b3322840c7c, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_3b3322840c7c, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_3b3322840c7c, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_3b3322840c7c, p_IsComputed := p_IsComputed_3b3322840c7c, p_EmbeddedRecord := p_EmbeddedRecord_3b3322840c7c, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_3b3322840c7c, p_Configuration_Clear := TRUE, p_ID := p_ID_3b3322840c7c);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_4677ea97d436 VARCHAR(255);
  p_Description_4677ea97d436 TEXT;
  p_AutoUpdateDescription_4677ea97d436 BOOLEAN;
  p_IsPrimaryKey_4677ea97d436 BOOLEAN;
  p_IsUnique_4677ea97d436 BOOLEAN;
  p_Category_4677ea97d436 VARCHAR(255);
  p_ValueListType_4677ea97d436 VARCHAR(20);
  p_ExtendedType_4677ea97d436 VARCHAR(50);
  p_CodeType_4677ea97d436 VARCHAR(50);
  p_DefaultInView_4677ea97d436 BOOLEAN;
  p_ViewCellTemplate_4677ea97d436 TEXT;
  p_DefaultColumnWidth_4677ea97d436 INTEGER;
  p_AllowUpdateAPI_4677ea97d436 BOOLEAN;
  p_AllowUpdateInView_4677ea97d436 BOOLEAN;
  p_IncludeInUserSearchAPI_4677ea97d436 BOOLEAN;
  p_FullTextSearchEnabled_4677ea97d436 BOOLEAN;
  p_UserSearchParamFormatAPI_4677ea97d436 VARCHAR(500);
  p_IncludeInGeneratedForm_4677ea97d436 BOOLEAN;
  p_GeneratedFormSection_4677ea97d436 VARCHAR(10);
  p_IsNameField_4677ea97d436 BOOLEAN;
  p_RelatedEntityID_4677ea97d436 UUID;
  p_RelatedEntityFieldName_4677ea97d436 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_4677ea97d436 BOOLEAN;
  p_RelatedEntityNameFieldMap_4677ea97d436 VARCHAR(255);
  p_RelatedEntityDisplayType_4677ea97d436 VARCHAR(20);
  p_EntityIDFieldName_4677ea97d436 VARCHAR(100);
  p_ScopeDefault_4677ea97d436 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_4677ea97d436 BOOLEAN;
  p_ValuesToPackWithSchema_4677ea97d436 VARCHAR(10);
  p_Status_4677ea97d436 VARCHAR(25);
  p_AutoUpdateIsNameField_4677ea97d436 BOOLEAN;
  p_AutoUpdateDefaultInView_4677ea97d436 BOOLEAN;
  p_AutoUpdateCategory_4677ea97d436 BOOLEAN;
  p_AutoUpdateDisplayName_4677ea97d436 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_4677ea97d436 BOOLEAN;
  p_Encrypt_4677ea97d436 BOOLEAN;
  p_EncryptionKeyID_4677ea97d436 UUID;
  p_AllowDecryptInAPI_4677ea97d436 BOOLEAN;
  p_SendEncryptedValue_4677ea97d436 BOOLEAN;
  p_IsSoftPrimaryKey_4677ea97d436 BOOLEAN;
  p_IsSoftForeignKey_4677ea97d436 BOOLEAN;
  p_RelatedEntityJoinFields_4677ea97d436 TEXT;
  p_JSONType_4677ea97d436 VARCHAR(255);
  p_JSONTypeIsArray_4677ea97d436 BOOLEAN;
  p_JSONTypeDefinition_4677ea97d436 TEXT;
  p_UserSearchPredicateAPI_4677ea97d436 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_4677ea97d436 BOOLEAN;
  p_AutoUpdateFullTextSearch_4677ea97d436 BOOLEAN;
  p_AutoUpdateExtendedType_4677ea97d436 BOOLEAN;
  p_IsComputed_4677ea97d436 BOOLEAN;
  p_EmbeddedRecord_4677ea97d436 TEXT;
  p_Configuration_4677ea97d436 TEXT;
  p_ID_4677ea97d436 UUID;
BEGIN
  p_DisplayName_4677ea97d436 := 'Signed Amendment Reference';
  p_Description_4677ea97d436 := 'Where the signed contract amendment for this concession is kept: a document number or a link. Set once the customer has signed; may be set or corrected after the concession is decided. NULL while no signed amendment is on file.';
  p_AutoUpdateDescription_4677ea97d436 := TRUE;
  p_IsPrimaryKey_4677ea97d436 := FALSE;
  p_IsUnique_4677ea97d436 := FALSE;
  p_Category_4677ea97d436 := 'Approval';
  p_ValueListType_4677ea97d436 := 'None';
  p_DefaultInView_4677ea97d436 := FALSE;
  p_DefaultColumnWidth_4677ea97d436 := 150;
  p_AllowUpdateAPI_4677ea97d436 := TRUE;
  p_AllowUpdateInView_4677ea97d436 := TRUE;
  p_IncludeInUserSearchAPI_4677ea97d436 := FALSE;
  p_FullTextSearchEnabled_4677ea97d436 := FALSE;
  p_IncludeInGeneratedForm_4677ea97d436 := TRUE;
  p_GeneratedFormSection_4677ea97d436 := 'Category';
  p_IsNameField_4677ea97d436 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_4677ea97d436 := FALSE;
  p_RelatedEntityDisplayType_4677ea97d436 := 'Search';
  p_AutoUpdateRelatedEntityInfo_4677ea97d436 := TRUE;
  p_ValuesToPackWithSchema_4677ea97d436 := 'Auto';
  p_Status_4677ea97d436 := 'Active';
  p_AutoUpdateIsNameField_4677ea97d436 := TRUE;
  p_AutoUpdateDefaultInView_4677ea97d436 := TRUE;
  p_AutoUpdateCategory_4677ea97d436 := TRUE;
  p_AutoUpdateDisplayName_4677ea97d436 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_4677ea97d436 := TRUE;
  p_Encrypt_4677ea97d436 := FALSE;
  p_AllowDecryptInAPI_4677ea97d436 := FALSE;
  p_SendEncryptedValue_4677ea97d436 := FALSE;
  p_IsSoftPrimaryKey_4677ea97d436 := FALSE;
  p_IsSoftForeignKey_4677ea97d436 := FALSE;
  p_JSONTypeIsArray_4677ea97d436 := FALSE;
  p_UserSearchPredicateAPI_4677ea97d436 := 'Contains';
  p_AutoUpdateUserSearchPredicate_4677ea97d436 := TRUE;
  p_AutoUpdateFullTextSearch_4677ea97d436 := TRUE;
  p_AutoUpdateExtendedType_4677ea97d436 := TRUE;
  p_IsComputed_4677ea97d436 := FALSE;
  p_ID_4677ea97d436 := '6091315E-4FB8-4FAF-8EC3-EB4E2CDBC873';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_4677ea97d436,
    'Description', p_Description_4677ea97d436,
    'AutoUpdateDescription', p_AutoUpdateDescription_4677ea97d436,
    'IsPrimaryKey', p_IsPrimaryKey_4677ea97d436,
    'IsUnique', p_IsUnique_4677ea97d436,
    'Category', p_Category_4677ea97d436,
    'ValueListType', p_ValueListType_4677ea97d436,
    'ExtendedType', p_ExtendedType_4677ea97d436,
    'CodeType', p_CodeType_4677ea97d436,
    'DefaultInView', p_DefaultInView_4677ea97d436,
    'ViewCellTemplate', p_ViewCellTemplate_4677ea97d436,
    'DefaultColumnWidth', p_DefaultColumnWidth_4677ea97d436,
    'AllowUpdateAPI', p_AllowUpdateAPI_4677ea97d436,
    'AllowUpdateInView', p_AllowUpdateInView_4677ea97d436,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_4677ea97d436,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_4677ea97d436,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_4677ea97d436,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_4677ea97d436,
    'GeneratedFormSection', p_GeneratedFormSection_4677ea97d436,
    'IsNameField', p_IsNameField_4677ea97d436,
    'RelatedEntityID', p_RelatedEntityID_4677ea97d436,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_4677ea97d436,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_4677ea97d436,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_4677ea97d436,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_4677ea97d436,
    'EntityIDFieldName', p_EntityIDFieldName_4677ea97d436,
    'ScopeDefault', p_ScopeDefault_4677ea97d436,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_4677ea97d436,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_4677ea97d436,
    'Status', p_Status_4677ea97d436,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_4677ea97d436,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_4677ea97d436,
    'AutoUpdateCategory', p_AutoUpdateCategory_4677ea97d436,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_4677ea97d436,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_4677ea97d436,
    'Encrypt', p_Encrypt_4677ea97d436,
    'EncryptionKeyID', p_EncryptionKeyID_4677ea97d436,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_4677ea97d436,
    'SendEncryptedValue', p_SendEncryptedValue_4677ea97d436,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_4677ea97d436,
    'IsSoftForeignKey', p_IsSoftForeignKey_4677ea97d436,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_4677ea97d436,
    'JSONType', p_JSONType_4677ea97d436,
    'JSONTypeIsArray', p_JSONTypeIsArray_4677ea97d436,
    'JSONTypeDefinition', p_JSONTypeDefinition_4677ea97d436,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_4677ea97d436,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_4677ea97d436,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_4677ea97d436,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_4677ea97d436,
    'IsComputed', p_IsComputed_4677ea97d436
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_4677ea97d436,
    'Configuration', p_Configuration_4677ea97d436,
    'ID', p_ID_4677ea97d436
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_4677ea97d436, p_Description := p_Description_4677ea97d436, p_AutoUpdateDescription := p_AutoUpdateDescription_4677ea97d436, p_IsPrimaryKey := p_IsPrimaryKey_4677ea97d436, p_IsUnique := p_IsUnique_4677ea97d436, p_Category := p_Category_4677ea97d436, p_ValueListType := p_ValueListType_4677ea97d436, p_ExtendedType := p_ExtendedType_4677ea97d436, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_4677ea97d436, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_4677ea97d436, p_ViewCellTemplate := p_ViewCellTemplate_4677ea97d436, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_4677ea97d436, p_AllowUpdateAPI := p_AllowUpdateAPI_4677ea97d436, p_AllowUpdateInView := p_AllowUpdateInView_4677ea97d436, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_4677ea97d436, p_FullTextSearchEnabled := p_FullTextSearchEnabled_4677ea97d436, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_4677ea97d436, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_4677ea97d436, p_GeneratedFormSection := p_GeneratedFormSection_4677ea97d436, p_IsNameField := p_IsNameField_4677ea97d436, p_RelatedEntityID := p_RelatedEntityID_4677ea97d436, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_4677ea97d436, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_4677ea97d436, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_4677ea97d436, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_4677ea97d436, p_EntityIDFieldName := p_EntityIDFieldName_4677ea97d436, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_4677ea97d436, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_4677ea97d436, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_4677ea97d436, p_Status := p_Status_4677ea97d436, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_4677ea97d436, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_4677ea97d436, p_AutoUpdateCategory := p_AutoUpdateCategory_4677ea97d436, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_4677ea97d436, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_4677ea97d436, p_Encrypt := p_Encrypt_4677ea97d436, p_EncryptionKeyID := p_EncryptionKeyID_4677ea97d436, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_4677ea97d436, p_SendEncryptedValue := p_SendEncryptedValue_4677ea97d436, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_4677ea97d436, p_IsSoftForeignKey := p_IsSoftForeignKey_4677ea97d436, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_4677ea97d436, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_4677ea97d436, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_4677ea97d436, p_JSONTypeDefinition := p_JSONTypeDefinition_4677ea97d436, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_4677ea97d436, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_4677ea97d436, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_4677ea97d436, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_4677ea97d436, p_IsComputed := p_IsComputed_4677ea97d436, p_EmbeddedRecord := p_EmbeddedRecord_4677ea97d436, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_4677ea97d436, p_Configuration_Clear := TRUE, p_ID := p_ID_4677ea97d436);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_c8cf1bf00aab VARCHAR(255);
  p_Description_c8cf1bf00aab TEXT;
  p_AutoUpdateDescription_c8cf1bf00aab BOOLEAN;
  p_IsPrimaryKey_c8cf1bf00aab BOOLEAN;
  p_IsUnique_c8cf1bf00aab BOOLEAN;
  p_Category_c8cf1bf00aab VARCHAR(255);
  p_ValueListType_c8cf1bf00aab VARCHAR(20);
  p_ExtendedType_c8cf1bf00aab VARCHAR(50);
  p_CodeType_c8cf1bf00aab VARCHAR(50);
  p_DefaultInView_c8cf1bf00aab BOOLEAN;
  p_ViewCellTemplate_c8cf1bf00aab TEXT;
  p_DefaultColumnWidth_c8cf1bf00aab INTEGER;
  p_AllowUpdateAPI_c8cf1bf00aab BOOLEAN;
  p_AllowUpdateInView_c8cf1bf00aab BOOLEAN;
  p_IncludeInUserSearchAPI_c8cf1bf00aab BOOLEAN;
  p_FullTextSearchEnabled_c8cf1bf00aab BOOLEAN;
  p_UserSearchParamFormatAPI_c8cf1bf00aab VARCHAR(500);
  p_IncludeInGeneratedForm_c8cf1bf00aab BOOLEAN;
  p_GeneratedFormSection_c8cf1bf00aab VARCHAR(10);
  p_IsNameField_c8cf1bf00aab BOOLEAN;
  p_RelatedEntityID_c8cf1bf00aab UUID;
  p_RelatedEntityFieldName_c8cf1bf00aab VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_c8cf1bf00aab BOOLEAN;
  p_RelatedEntityNameFieldMap_c8cf1bf00aab VARCHAR(255);
  p_RelatedEntityDisplayType_c8cf1bf00aab VARCHAR(20);
  p_EntityIDFieldName_c8cf1bf00aab VARCHAR(100);
  p_ScopeDefault_c8cf1bf00aab VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_c8cf1bf00aab BOOLEAN;
  p_ValuesToPackWithSchema_c8cf1bf00aab VARCHAR(10);
  p_Status_c8cf1bf00aab VARCHAR(25);
  p_AutoUpdateIsNameField_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateDefaultInView_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateCategory_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateDisplayName_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_c8cf1bf00aab BOOLEAN;
  p_Encrypt_c8cf1bf00aab BOOLEAN;
  p_EncryptionKeyID_c8cf1bf00aab UUID;
  p_AllowDecryptInAPI_c8cf1bf00aab BOOLEAN;
  p_SendEncryptedValue_c8cf1bf00aab BOOLEAN;
  p_IsSoftPrimaryKey_c8cf1bf00aab BOOLEAN;
  p_IsSoftForeignKey_c8cf1bf00aab BOOLEAN;
  p_RelatedEntityJoinFields_c8cf1bf00aab TEXT;
  p_JSONType_c8cf1bf00aab VARCHAR(255);
  p_JSONTypeIsArray_c8cf1bf00aab BOOLEAN;
  p_JSONTypeDefinition_c8cf1bf00aab TEXT;
  p_UserSearchPredicateAPI_c8cf1bf00aab VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateFullTextSearch_c8cf1bf00aab BOOLEAN;
  p_AutoUpdateExtendedType_c8cf1bf00aab BOOLEAN;
  p_IsComputed_c8cf1bf00aab BOOLEAN;
  p_EmbeddedRecord_c8cf1bf00aab TEXT;
  p_Configuration_c8cf1bf00aab TEXT;
  p_ID_c8cf1bf00aab UUID;
BEGIN
  p_DisplayName_c8cf1bf00aab := 'Referral Program ID';
  p_Description_c8cf1bf00aab := 'For a Duration concession granted under a referral program, the program. Set by the requester when recording it; the program approves the concession when it is in program (see ReferralProgram.DaysPerReferral).';
  p_AutoUpdateDescription_c8cf1bf00aab := TRUE;
  p_IsPrimaryKey_c8cf1bf00aab := FALSE;
  p_IsUnique_c8cf1bf00aab := FALSE;
  p_Category_c8cf1bf00aab := 'Concession Details';
  p_ValueListType_c8cf1bf00aab := 'None';
  p_DefaultInView_c8cf1bf00aab := FALSE;
  p_DefaultColumnWidth_c8cf1bf00aab := 150;
  p_AllowUpdateAPI_c8cf1bf00aab := TRUE;
  p_AllowUpdateInView_c8cf1bf00aab := TRUE;
  p_IncludeInUserSearchAPI_c8cf1bf00aab := FALSE;
  p_FullTextSearchEnabled_c8cf1bf00aab := FALSE;
  p_IncludeInGeneratedForm_c8cf1bf00aab := TRUE;
  p_GeneratedFormSection_c8cf1bf00aab := 'Category';
  p_IsNameField_c8cf1bf00aab := FALSE;
  p_RelatedEntityID_c8cf1bf00aab := 'D5638CEC-F932-4D1F-9DCB-EE747FA0AF4E';
  p_RelatedEntityFieldName_c8cf1bf00aab := 'ID';
  p_IncludeRelatedEntityNameFieldInBaseView_c8cf1bf00aab := TRUE;
  p_RelatedEntityNameFieldMap_c8cf1bf00aab := 'ReferralProgram';
  p_RelatedEntityDisplayType_c8cf1bf00aab := 'Search';
  p_AutoUpdateRelatedEntityInfo_c8cf1bf00aab := TRUE;
  p_ValuesToPackWithSchema_c8cf1bf00aab := 'Auto';
  p_Status_c8cf1bf00aab := 'Active';
  p_AutoUpdateIsNameField_c8cf1bf00aab := TRUE;
  p_AutoUpdateDefaultInView_c8cf1bf00aab := TRUE;
  p_AutoUpdateCategory_c8cf1bf00aab := TRUE;
  p_AutoUpdateDisplayName_c8cf1bf00aab := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_c8cf1bf00aab := TRUE;
  p_Encrypt_c8cf1bf00aab := FALSE;
  p_AllowDecryptInAPI_c8cf1bf00aab := FALSE;
  p_SendEncryptedValue_c8cf1bf00aab := FALSE;
  p_IsSoftPrimaryKey_c8cf1bf00aab := FALSE;
  p_IsSoftForeignKey_c8cf1bf00aab := FALSE;
  p_JSONTypeIsArray_c8cf1bf00aab := FALSE;
  p_UserSearchPredicateAPI_c8cf1bf00aab := 'Contains';
  p_AutoUpdateUserSearchPredicate_c8cf1bf00aab := TRUE;
  p_AutoUpdateFullTextSearch_c8cf1bf00aab := TRUE;
  p_AutoUpdateExtendedType_c8cf1bf00aab := TRUE;
  p_IsComputed_c8cf1bf00aab := FALSE;
  p_ID_c8cf1bf00aab := '880AE7A8-79CA-4E39-B8B1-D1F1BB7738AD';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_c8cf1bf00aab,
    'Description', p_Description_c8cf1bf00aab,
    'AutoUpdateDescription', p_AutoUpdateDescription_c8cf1bf00aab,
    'IsPrimaryKey', p_IsPrimaryKey_c8cf1bf00aab,
    'IsUnique', p_IsUnique_c8cf1bf00aab,
    'Category', p_Category_c8cf1bf00aab,
    'ValueListType', p_ValueListType_c8cf1bf00aab,
    'ExtendedType', p_ExtendedType_c8cf1bf00aab,
    'CodeType', p_CodeType_c8cf1bf00aab,
    'DefaultInView', p_DefaultInView_c8cf1bf00aab,
    'ViewCellTemplate', p_ViewCellTemplate_c8cf1bf00aab,
    'DefaultColumnWidth', p_DefaultColumnWidth_c8cf1bf00aab,
    'AllowUpdateAPI', p_AllowUpdateAPI_c8cf1bf00aab,
    'AllowUpdateInView', p_AllowUpdateInView_c8cf1bf00aab,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_c8cf1bf00aab,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_c8cf1bf00aab,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_c8cf1bf00aab,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_c8cf1bf00aab,
    'GeneratedFormSection', p_GeneratedFormSection_c8cf1bf00aab,
    'IsNameField', p_IsNameField_c8cf1bf00aab,
    'RelatedEntityID', p_RelatedEntityID_c8cf1bf00aab,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_c8cf1bf00aab,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_c8cf1bf00aab,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_c8cf1bf00aab,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_c8cf1bf00aab,
    'EntityIDFieldName', p_EntityIDFieldName_c8cf1bf00aab,
    'ScopeDefault', p_ScopeDefault_c8cf1bf00aab,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_c8cf1bf00aab,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_c8cf1bf00aab,
    'Status', p_Status_c8cf1bf00aab,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_c8cf1bf00aab,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_c8cf1bf00aab,
    'AutoUpdateCategory', p_AutoUpdateCategory_c8cf1bf00aab,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_c8cf1bf00aab,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_c8cf1bf00aab,
    'Encrypt', p_Encrypt_c8cf1bf00aab,
    'EncryptionKeyID', p_EncryptionKeyID_c8cf1bf00aab,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_c8cf1bf00aab,
    'SendEncryptedValue', p_SendEncryptedValue_c8cf1bf00aab,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_c8cf1bf00aab,
    'IsSoftForeignKey', p_IsSoftForeignKey_c8cf1bf00aab,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_c8cf1bf00aab,
    'JSONType', p_JSONType_c8cf1bf00aab,
    'JSONTypeIsArray', p_JSONTypeIsArray_c8cf1bf00aab,
    'JSONTypeDefinition', p_JSONTypeDefinition_c8cf1bf00aab,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_c8cf1bf00aab,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_c8cf1bf00aab,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_c8cf1bf00aab,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_c8cf1bf00aab,
    'IsComputed', p_IsComputed_c8cf1bf00aab
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_c8cf1bf00aab,
    'Configuration', p_Configuration_c8cf1bf00aab,
    'ID', p_ID_c8cf1bf00aab
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_c8cf1bf00aab, p_Description := p_Description_c8cf1bf00aab, p_AutoUpdateDescription := p_AutoUpdateDescription_c8cf1bf00aab, p_IsPrimaryKey := p_IsPrimaryKey_c8cf1bf00aab, p_IsUnique := p_IsUnique_c8cf1bf00aab, p_Category := p_Category_c8cf1bf00aab, p_ValueListType := p_ValueListType_c8cf1bf00aab, p_ExtendedType := p_ExtendedType_c8cf1bf00aab, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_c8cf1bf00aab, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_c8cf1bf00aab, p_ViewCellTemplate := p_ViewCellTemplate_c8cf1bf00aab, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_c8cf1bf00aab, p_AllowUpdateAPI := p_AllowUpdateAPI_c8cf1bf00aab, p_AllowUpdateInView := p_AllowUpdateInView_c8cf1bf00aab, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_c8cf1bf00aab, p_FullTextSearchEnabled := p_FullTextSearchEnabled_c8cf1bf00aab, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_c8cf1bf00aab, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_c8cf1bf00aab, p_GeneratedFormSection := p_GeneratedFormSection_c8cf1bf00aab, p_IsNameField := p_IsNameField_c8cf1bf00aab, p_RelatedEntityID := p_RelatedEntityID_c8cf1bf00aab, p_RelatedEntityFieldName := p_RelatedEntityFieldName_c8cf1bf00aab, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_c8cf1bf00aab, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_c8cf1bf00aab, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_c8cf1bf00aab, p_EntityIDFieldName := p_EntityIDFieldName_c8cf1bf00aab, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_c8cf1bf00aab, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_c8cf1bf00aab, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_c8cf1bf00aab, p_Status := p_Status_c8cf1bf00aab, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_c8cf1bf00aab, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_c8cf1bf00aab, p_AutoUpdateCategory := p_AutoUpdateCategory_c8cf1bf00aab, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_c8cf1bf00aab, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_c8cf1bf00aab, p_Encrypt := p_Encrypt_c8cf1bf00aab, p_EncryptionKeyID := p_EncryptionKeyID_c8cf1bf00aab, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_c8cf1bf00aab, p_SendEncryptedValue := p_SendEncryptedValue_c8cf1bf00aab, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_c8cf1bf00aab, p_IsSoftForeignKey := p_IsSoftForeignKey_c8cf1bf00aab, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_c8cf1bf00aab, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_c8cf1bf00aab, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_c8cf1bf00aab, p_JSONTypeDefinition := p_JSONTypeDefinition_c8cf1bf00aab, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_c8cf1bf00aab, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_c8cf1bf00aab, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_c8cf1bf00aab, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_c8cf1bf00aab, p_IsComputed := p_IsComputed_c8cf1bf00aab, p_EmbeddedRecord := p_EmbeddedRecord_c8cf1bf00aab, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_c8cf1bf00aab, p_Configuration_Clear := TRUE, p_ID := p_ID_c8cf1bf00aab);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_8ab491945631 VARCHAR(255);
  p_Description_8ab491945631 TEXT;
  p_AutoUpdateDescription_8ab491945631 BOOLEAN;
  p_IsPrimaryKey_8ab491945631 BOOLEAN;
  p_IsUnique_8ab491945631 BOOLEAN;
  p_Category_8ab491945631 VARCHAR(255);
  p_ValueListType_8ab491945631 VARCHAR(20);
  p_ExtendedType_8ab491945631 VARCHAR(50);
  p_CodeType_8ab491945631 VARCHAR(50);
  p_DefaultInView_8ab491945631 BOOLEAN;
  p_ViewCellTemplate_8ab491945631 TEXT;
  p_DefaultColumnWidth_8ab491945631 INTEGER;
  p_AllowUpdateAPI_8ab491945631 BOOLEAN;
  p_AllowUpdateInView_8ab491945631 BOOLEAN;
  p_IncludeInUserSearchAPI_8ab491945631 BOOLEAN;
  p_FullTextSearchEnabled_8ab491945631 BOOLEAN;
  p_UserSearchParamFormatAPI_8ab491945631 VARCHAR(500);
  p_IncludeInGeneratedForm_8ab491945631 BOOLEAN;
  p_GeneratedFormSection_8ab491945631 VARCHAR(10);
  p_IsNameField_8ab491945631 BOOLEAN;
  p_RelatedEntityID_8ab491945631 UUID;
  p_RelatedEntityFieldName_8ab491945631 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_8ab491945631 BOOLEAN;
  p_RelatedEntityNameFieldMap_8ab491945631 VARCHAR(255);
  p_RelatedEntityDisplayType_8ab491945631 VARCHAR(20);
  p_EntityIDFieldName_8ab491945631 VARCHAR(100);
  p_ScopeDefault_8ab491945631 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_8ab491945631 BOOLEAN;
  p_ValuesToPackWithSchema_8ab491945631 VARCHAR(10);
  p_Status_8ab491945631 VARCHAR(25);
  p_AutoUpdateIsNameField_8ab491945631 BOOLEAN;
  p_AutoUpdateDefaultInView_8ab491945631 BOOLEAN;
  p_AutoUpdateCategory_8ab491945631 BOOLEAN;
  p_AutoUpdateDisplayName_8ab491945631 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_8ab491945631 BOOLEAN;
  p_Encrypt_8ab491945631 BOOLEAN;
  p_EncryptionKeyID_8ab491945631 UUID;
  p_AllowDecryptInAPI_8ab491945631 BOOLEAN;
  p_SendEncryptedValue_8ab491945631 BOOLEAN;
  p_IsSoftPrimaryKey_8ab491945631 BOOLEAN;
  p_IsSoftForeignKey_8ab491945631 BOOLEAN;
  p_RelatedEntityJoinFields_8ab491945631 TEXT;
  p_JSONType_8ab491945631 VARCHAR(255);
  p_JSONTypeIsArray_8ab491945631 BOOLEAN;
  p_JSONTypeDefinition_8ab491945631 TEXT;
  p_UserSearchPredicateAPI_8ab491945631 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_8ab491945631 BOOLEAN;
  p_AutoUpdateFullTextSearch_8ab491945631 BOOLEAN;
  p_AutoUpdateExtendedType_8ab491945631 BOOLEAN;
  p_IsComputed_8ab491945631 BOOLEAN;
  p_EmbeddedRecord_8ab491945631 TEXT;
  p_Configuration_8ab491945631 TEXT;
  p_ID_8ab491945631 UUID;
BEGIN
  p_DisplayName_8ab491945631 := 'Company ID';
  p_Description_8ab491945631 := 'The company that runs the program. A concession may name the program only on that company''s orders.';
  p_AutoUpdateDescription_8ab491945631 := TRUE;
  p_IsPrimaryKey_8ab491945631 := FALSE;
  p_IsUnique_8ab491945631 := TRUE;
  p_Category_8ab491945631 := 'Program Details';
  p_ValueListType_8ab491945631 := 'None';
  p_DefaultInView_8ab491945631 := FALSE;
  p_DefaultColumnWidth_8ab491945631 := 150;
  p_AllowUpdateAPI_8ab491945631 := TRUE;
  p_AllowUpdateInView_8ab491945631 := TRUE;
  p_IncludeInUserSearchAPI_8ab491945631 := FALSE;
  p_FullTextSearchEnabled_8ab491945631 := FALSE;
  p_IncludeInGeneratedForm_8ab491945631 := TRUE;
  p_GeneratedFormSection_8ab491945631 := 'Category';
  p_IsNameField_8ab491945631 := FALSE;
  p_RelatedEntityID_8ab491945631 := 'D4238F34-2837-EF11-86D4-6045BDEE16E6';
  p_RelatedEntityFieldName_8ab491945631 := 'ID';
  p_IncludeRelatedEntityNameFieldInBaseView_8ab491945631 := TRUE;
  p_RelatedEntityNameFieldMap_8ab491945631 := 'Company';
  p_RelatedEntityDisplayType_8ab491945631 := 'Search';
  p_AutoUpdateRelatedEntityInfo_8ab491945631 := TRUE;
  p_ValuesToPackWithSchema_8ab491945631 := 'Auto';
  p_Status_8ab491945631 := 'Active';
  p_AutoUpdateIsNameField_8ab491945631 := TRUE;
  p_AutoUpdateDefaultInView_8ab491945631 := TRUE;
  p_AutoUpdateCategory_8ab491945631 := TRUE;
  p_AutoUpdateDisplayName_8ab491945631 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_8ab491945631 := TRUE;
  p_Encrypt_8ab491945631 := FALSE;
  p_AllowDecryptInAPI_8ab491945631 := FALSE;
  p_SendEncryptedValue_8ab491945631 := FALSE;
  p_IsSoftPrimaryKey_8ab491945631 := FALSE;
  p_IsSoftForeignKey_8ab491945631 := FALSE;
  p_JSONTypeIsArray_8ab491945631 := FALSE;
  p_UserSearchPredicateAPI_8ab491945631 := 'Contains';
  p_AutoUpdateUserSearchPredicate_8ab491945631 := TRUE;
  p_AutoUpdateFullTextSearch_8ab491945631 := TRUE;
  p_AutoUpdateExtendedType_8ab491945631 := TRUE;
  p_IsComputed_8ab491945631 := FALSE;
  p_ID_8ab491945631 := '682ECD68-9A60-4EDB-81A0-3305FC723FDA';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_8ab491945631,
    'Description', p_Description_8ab491945631,
    'AutoUpdateDescription', p_AutoUpdateDescription_8ab491945631,
    'IsPrimaryKey', p_IsPrimaryKey_8ab491945631,
    'IsUnique', p_IsUnique_8ab491945631,
    'Category', p_Category_8ab491945631,
    'ValueListType', p_ValueListType_8ab491945631,
    'ExtendedType', p_ExtendedType_8ab491945631,
    'CodeType', p_CodeType_8ab491945631,
    'DefaultInView', p_DefaultInView_8ab491945631,
    'ViewCellTemplate', p_ViewCellTemplate_8ab491945631,
    'DefaultColumnWidth', p_DefaultColumnWidth_8ab491945631,
    'AllowUpdateAPI', p_AllowUpdateAPI_8ab491945631,
    'AllowUpdateInView', p_AllowUpdateInView_8ab491945631,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_8ab491945631,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_8ab491945631,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_8ab491945631,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_8ab491945631,
    'GeneratedFormSection', p_GeneratedFormSection_8ab491945631,
    'IsNameField', p_IsNameField_8ab491945631,
    'RelatedEntityID', p_RelatedEntityID_8ab491945631,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_8ab491945631,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_8ab491945631,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_8ab491945631,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_8ab491945631,
    'EntityIDFieldName', p_EntityIDFieldName_8ab491945631,
    'ScopeDefault', p_ScopeDefault_8ab491945631,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_8ab491945631,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_8ab491945631,
    'Status', p_Status_8ab491945631,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_8ab491945631,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_8ab491945631,
    'AutoUpdateCategory', p_AutoUpdateCategory_8ab491945631,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_8ab491945631,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_8ab491945631,
    'Encrypt', p_Encrypt_8ab491945631,
    'EncryptionKeyID', p_EncryptionKeyID_8ab491945631,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_8ab491945631,
    'SendEncryptedValue', p_SendEncryptedValue_8ab491945631,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_8ab491945631,
    'IsSoftForeignKey', p_IsSoftForeignKey_8ab491945631,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_8ab491945631,
    'JSONType', p_JSONType_8ab491945631,
    'JSONTypeIsArray', p_JSONTypeIsArray_8ab491945631,
    'JSONTypeDefinition', p_JSONTypeDefinition_8ab491945631,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_8ab491945631,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_8ab491945631,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_8ab491945631,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_8ab491945631,
    'IsComputed', p_IsComputed_8ab491945631
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_8ab491945631,
    'Configuration', p_Configuration_8ab491945631,
    'ID', p_ID_8ab491945631
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_8ab491945631, p_Description := p_Description_8ab491945631, p_AutoUpdateDescription := p_AutoUpdateDescription_8ab491945631, p_IsPrimaryKey := p_IsPrimaryKey_8ab491945631, p_IsUnique := p_IsUnique_8ab491945631, p_Category := p_Category_8ab491945631, p_ValueListType := p_ValueListType_8ab491945631, p_ExtendedType := p_ExtendedType_8ab491945631, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_8ab491945631, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_8ab491945631, p_ViewCellTemplate := p_ViewCellTemplate_8ab491945631, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_8ab491945631, p_AllowUpdateAPI := p_AllowUpdateAPI_8ab491945631, p_AllowUpdateInView := p_AllowUpdateInView_8ab491945631, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_8ab491945631, p_FullTextSearchEnabled := p_FullTextSearchEnabled_8ab491945631, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_8ab491945631, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_8ab491945631, p_GeneratedFormSection := p_GeneratedFormSection_8ab491945631, p_IsNameField := p_IsNameField_8ab491945631, p_RelatedEntityID := p_RelatedEntityID_8ab491945631, p_RelatedEntityFieldName := p_RelatedEntityFieldName_8ab491945631, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_8ab491945631, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_8ab491945631, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_8ab491945631, p_EntityIDFieldName := p_EntityIDFieldName_8ab491945631, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_8ab491945631, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_8ab491945631, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_8ab491945631, p_Status := p_Status_8ab491945631, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_8ab491945631, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_8ab491945631, p_AutoUpdateCategory := p_AutoUpdateCategory_8ab491945631, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_8ab491945631, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_8ab491945631, p_Encrypt := p_Encrypt_8ab491945631, p_EncryptionKeyID := p_EncryptionKeyID_8ab491945631, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_8ab491945631, p_SendEncryptedValue := p_SendEncryptedValue_8ab491945631, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_8ab491945631, p_IsSoftForeignKey := p_IsSoftForeignKey_8ab491945631, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_8ab491945631, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_8ab491945631, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_8ab491945631, p_JSONTypeDefinition := p_JSONTypeDefinition_8ab491945631, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_8ab491945631, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_8ab491945631, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_8ab491945631, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_8ab491945631, p_IsComputed := p_IsComputed_8ab491945631, p_EmbeddedRecord := p_EmbeddedRecord_8ab491945631, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_8ab491945631, p_Configuration_Clear := TRUE, p_ID := p_ID_8ab491945631);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_791e3876e79b VARCHAR(255);
  p_Description_791e3876e79b TEXT;
  p_AutoUpdateDescription_791e3876e79b BOOLEAN;
  p_IsPrimaryKey_791e3876e79b BOOLEAN;
  p_IsUnique_791e3876e79b BOOLEAN;
  p_Category_791e3876e79b VARCHAR(255);
  p_ValueListType_791e3876e79b VARCHAR(20);
  p_ExtendedType_791e3876e79b VARCHAR(50);
  p_CodeType_791e3876e79b VARCHAR(50);
  p_DefaultInView_791e3876e79b BOOLEAN;
  p_ViewCellTemplate_791e3876e79b TEXT;
  p_DefaultColumnWidth_791e3876e79b INTEGER;
  p_AllowUpdateAPI_791e3876e79b BOOLEAN;
  p_AllowUpdateInView_791e3876e79b BOOLEAN;
  p_IncludeInUserSearchAPI_791e3876e79b BOOLEAN;
  p_FullTextSearchEnabled_791e3876e79b BOOLEAN;
  p_UserSearchParamFormatAPI_791e3876e79b VARCHAR(500);
  p_IncludeInGeneratedForm_791e3876e79b BOOLEAN;
  p_GeneratedFormSection_791e3876e79b VARCHAR(10);
  p_IsNameField_791e3876e79b BOOLEAN;
  p_RelatedEntityID_791e3876e79b UUID;
  p_RelatedEntityFieldName_791e3876e79b VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_791e3876e79b BOOLEAN;
  p_RelatedEntityNameFieldMap_791e3876e79b VARCHAR(255);
  p_RelatedEntityDisplayType_791e3876e79b VARCHAR(20);
  p_EntityIDFieldName_791e3876e79b VARCHAR(100);
  p_ScopeDefault_791e3876e79b VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_791e3876e79b BOOLEAN;
  p_ValuesToPackWithSchema_791e3876e79b VARCHAR(10);
  p_Status_791e3876e79b VARCHAR(25);
  p_AutoUpdateIsNameField_791e3876e79b BOOLEAN;
  p_AutoUpdateDefaultInView_791e3876e79b BOOLEAN;
  p_AutoUpdateCategory_791e3876e79b BOOLEAN;
  p_AutoUpdateDisplayName_791e3876e79b BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_791e3876e79b BOOLEAN;
  p_Encrypt_791e3876e79b BOOLEAN;
  p_EncryptionKeyID_791e3876e79b UUID;
  p_AllowDecryptInAPI_791e3876e79b BOOLEAN;
  p_SendEncryptedValue_791e3876e79b BOOLEAN;
  p_IsSoftPrimaryKey_791e3876e79b BOOLEAN;
  p_IsSoftForeignKey_791e3876e79b BOOLEAN;
  p_RelatedEntityJoinFields_791e3876e79b TEXT;
  p_JSONType_791e3876e79b VARCHAR(255);
  p_JSONTypeIsArray_791e3876e79b BOOLEAN;
  p_JSONTypeDefinition_791e3876e79b TEXT;
  p_UserSearchPredicateAPI_791e3876e79b VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_791e3876e79b BOOLEAN;
  p_AutoUpdateFullTextSearch_791e3876e79b BOOLEAN;
  p_AutoUpdateExtendedType_791e3876e79b BOOLEAN;
  p_IsComputed_791e3876e79b BOOLEAN;
  p_EmbeddedRecord_791e3876e79b TEXT;
  p_Configuration_791e3876e79b TEXT;
  p_ID_791e3876e79b UUID;
BEGIN
  p_DisplayName_791e3876e79b := 'Name';
  p_Description_791e3876e79b := 'The program''s name, unique within its company.';
  p_AutoUpdateDescription_791e3876e79b := TRUE;
  p_IsPrimaryKey_791e3876e79b := FALSE;
  p_IsUnique_791e3876e79b := TRUE;
  p_Category_791e3876e79b := 'Program Details';
  p_ValueListType_791e3876e79b := 'None';
  p_DefaultInView_791e3876e79b := TRUE;
  p_DefaultColumnWidth_791e3876e79b := 150;
  p_AllowUpdateAPI_791e3876e79b := TRUE;
  p_AllowUpdateInView_791e3876e79b := TRUE;
  p_IncludeInUserSearchAPI_791e3876e79b := TRUE;
  p_FullTextSearchEnabled_791e3876e79b := FALSE;
  p_IncludeInGeneratedForm_791e3876e79b := TRUE;
  p_GeneratedFormSection_791e3876e79b := 'Category';
  p_IsNameField_791e3876e79b := TRUE;
  p_IncludeRelatedEntityNameFieldInBaseView_791e3876e79b := FALSE;
  p_RelatedEntityDisplayType_791e3876e79b := 'Search';
  p_AutoUpdateRelatedEntityInfo_791e3876e79b := TRUE;
  p_ValuesToPackWithSchema_791e3876e79b := 'Auto';
  p_Status_791e3876e79b := 'Active';
  p_AutoUpdateIsNameField_791e3876e79b := TRUE;
  p_AutoUpdateDefaultInView_791e3876e79b := TRUE;
  p_AutoUpdateCategory_791e3876e79b := TRUE;
  p_AutoUpdateDisplayName_791e3876e79b := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_791e3876e79b := TRUE;
  p_Encrypt_791e3876e79b := FALSE;
  p_AllowDecryptInAPI_791e3876e79b := FALSE;
  p_SendEncryptedValue_791e3876e79b := FALSE;
  p_IsSoftPrimaryKey_791e3876e79b := FALSE;
  p_IsSoftForeignKey_791e3876e79b := FALSE;
  p_JSONTypeIsArray_791e3876e79b := FALSE;
  p_UserSearchPredicateAPI_791e3876e79b := 'Contains';
  p_AutoUpdateUserSearchPredicate_791e3876e79b := TRUE;
  p_AutoUpdateFullTextSearch_791e3876e79b := TRUE;
  p_AutoUpdateExtendedType_791e3876e79b := TRUE;
  p_IsComputed_791e3876e79b := FALSE;
  p_ID_791e3876e79b := '12CA09F6-7C3F-4999-9A8A-05C4BBC0C351';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_791e3876e79b,
    'Description', p_Description_791e3876e79b,
    'AutoUpdateDescription', p_AutoUpdateDescription_791e3876e79b,
    'IsPrimaryKey', p_IsPrimaryKey_791e3876e79b,
    'IsUnique', p_IsUnique_791e3876e79b,
    'Category', p_Category_791e3876e79b,
    'ValueListType', p_ValueListType_791e3876e79b,
    'ExtendedType', p_ExtendedType_791e3876e79b,
    'CodeType', p_CodeType_791e3876e79b,
    'DefaultInView', p_DefaultInView_791e3876e79b,
    'ViewCellTemplate', p_ViewCellTemplate_791e3876e79b,
    'DefaultColumnWidth', p_DefaultColumnWidth_791e3876e79b,
    'AllowUpdateAPI', p_AllowUpdateAPI_791e3876e79b,
    'AllowUpdateInView', p_AllowUpdateInView_791e3876e79b,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_791e3876e79b,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_791e3876e79b,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_791e3876e79b,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_791e3876e79b,
    'GeneratedFormSection', p_GeneratedFormSection_791e3876e79b,
    'IsNameField', p_IsNameField_791e3876e79b,
    'RelatedEntityID', p_RelatedEntityID_791e3876e79b,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_791e3876e79b,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_791e3876e79b,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_791e3876e79b,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_791e3876e79b,
    'EntityIDFieldName', p_EntityIDFieldName_791e3876e79b,
    'ScopeDefault', p_ScopeDefault_791e3876e79b,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_791e3876e79b,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_791e3876e79b,
    'Status', p_Status_791e3876e79b,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_791e3876e79b,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_791e3876e79b,
    'AutoUpdateCategory', p_AutoUpdateCategory_791e3876e79b,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_791e3876e79b,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_791e3876e79b,
    'Encrypt', p_Encrypt_791e3876e79b,
    'EncryptionKeyID', p_EncryptionKeyID_791e3876e79b,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_791e3876e79b,
    'SendEncryptedValue', p_SendEncryptedValue_791e3876e79b,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_791e3876e79b,
    'IsSoftForeignKey', p_IsSoftForeignKey_791e3876e79b,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_791e3876e79b,
    'JSONType', p_JSONType_791e3876e79b,
    'JSONTypeIsArray', p_JSONTypeIsArray_791e3876e79b,
    'JSONTypeDefinition', p_JSONTypeDefinition_791e3876e79b,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_791e3876e79b,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_791e3876e79b,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_791e3876e79b,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_791e3876e79b,
    'IsComputed', p_IsComputed_791e3876e79b
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_791e3876e79b,
    'Configuration', p_Configuration_791e3876e79b,
    'ID', p_ID_791e3876e79b
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_791e3876e79b, p_Description := p_Description_791e3876e79b, p_AutoUpdateDescription := p_AutoUpdateDescription_791e3876e79b, p_IsPrimaryKey := p_IsPrimaryKey_791e3876e79b, p_IsUnique := p_IsUnique_791e3876e79b, p_Category := p_Category_791e3876e79b, p_ValueListType := p_ValueListType_791e3876e79b, p_ExtendedType := p_ExtendedType_791e3876e79b, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_791e3876e79b, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_791e3876e79b, p_ViewCellTemplate := p_ViewCellTemplate_791e3876e79b, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_791e3876e79b, p_AllowUpdateAPI := p_AllowUpdateAPI_791e3876e79b, p_AllowUpdateInView := p_AllowUpdateInView_791e3876e79b, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_791e3876e79b, p_FullTextSearchEnabled := p_FullTextSearchEnabled_791e3876e79b, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_791e3876e79b, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_791e3876e79b, p_GeneratedFormSection := p_GeneratedFormSection_791e3876e79b, p_IsNameField := p_IsNameField_791e3876e79b, p_RelatedEntityID := p_RelatedEntityID_791e3876e79b, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_791e3876e79b, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_791e3876e79b, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_791e3876e79b, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_791e3876e79b, p_EntityIDFieldName := p_EntityIDFieldName_791e3876e79b, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_791e3876e79b, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_791e3876e79b, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_791e3876e79b, p_Status := p_Status_791e3876e79b, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_791e3876e79b, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_791e3876e79b, p_AutoUpdateCategory := p_AutoUpdateCategory_791e3876e79b, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_791e3876e79b, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_791e3876e79b, p_Encrypt := p_Encrypt_791e3876e79b, p_EncryptionKeyID := p_EncryptionKeyID_791e3876e79b, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_791e3876e79b, p_SendEncryptedValue := p_SendEncryptedValue_791e3876e79b, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_791e3876e79b, p_IsSoftForeignKey := p_IsSoftForeignKey_791e3876e79b, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_791e3876e79b, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_791e3876e79b, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_791e3876e79b, p_JSONTypeDefinition := p_JSONTypeDefinition_791e3876e79b, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_791e3876e79b, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_791e3876e79b, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_791e3876e79b, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_791e3876e79b, p_IsComputed := p_IsComputed_791e3876e79b, p_EmbeddedRecord := p_EmbeddedRecord_791e3876e79b, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_791e3876e79b, p_Configuration_Clear := TRUE, p_ID := p_ID_791e3876e79b);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_693cbf5ee0c8 VARCHAR(255);
  p_Description_693cbf5ee0c8 TEXT;
  p_AutoUpdateDescription_693cbf5ee0c8 BOOLEAN;
  p_IsPrimaryKey_693cbf5ee0c8 BOOLEAN;
  p_IsUnique_693cbf5ee0c8 BOOLEAN;
  p_Category_693cbf5ee0c8 VARCHAR(255);
  p_ValueListType_693cbf5ee0c8 VARCHAR(20);
  p_ExtendedType_693cbf5ee0c8 VARCHAR(50);
  p_CodeType_693cbf5ee0c8 VARCHAR(50);
  p_DefaultInView_693cbf5ee0c8 BOOLEAN;
  p_ViewCellTemplate_693cbf5ee0c8 TEXT;
  p_DefaultColumnWidth_693cbf5ee0c8 INTEGER;
  p_AllowUpdateAPI_693cbf5ee0c8 BOOLEAN;
  p_AllowUpdateInView_693cbf5ee0c8 BOOLEAN;
  p_IncludeInUserSearchAPI_693cbf5ee0c8 BOOLEAN;
  p_FullTextSearchEnabled_693cbf5ee0c8 BOOLEAN;
  p_UserSearchParamFormatAPI_693cbf5ee0c8 VARCHAR(500);
  p_IncludeInGeneratedForm_693cbf5ee0c8 BOOLEAN;
  p_GeneratedFormSection_693cbf5ee0c8 VARCHAR(10);
  p_IsNameField_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityID_693cbf5ee0c8 UUID;
  p_RelatedEntityFieldName_693cbf5ee0c8 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityNameFieldMap_693cbf5ee0c8 VARCHAR(255);
  p_RelatedEntityDisplayType_693cbf5ee0c8 VARCHAR(20);
  p_EntityIDFieldName_693cbf5ee0c8 VARCHAR(100);
  p_ScopeDefault_693cbf5ee0c8 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8 BOOLEAN;
  p_ValuesToPackWithSchema_693cbf5ee0c8 VARCHAR(10);
  p_Status_693cbf5ee0c8 VARCHAR(25);
  p_AutoUpdateIsNameField_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateDefaultInView_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateCategory_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateDisplayName_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8 BOOLEAN;
  p_Encrypt_693cbf5ee0c8 BOOLEAN;
  p_EncryptionKeyID_693cbf5ee0c8 UUID;
  p_AllowDecryptInAPI_693cbf5ee0c8 BOOLEAN;
  p_SendEncryptedValue_693cbf5ee0c8 BOOLEAN;
  p_IsSoftPrimaryKey_693cbf5ee0c8 BOOLEAN;
  p_IsSoftForeignKey_693cbf5ee0c8 BOOLEAN;
  p_RelatedEntityJoinFields_693cbf5ee0c8 TEXT;
  p_JSONType_693cbf5ee0c8 VARCHAR(255);
  p_JSONTypeIsArray_693cbf5ee0c8 BOOLEAN;
  p_JSONTypeDefinition_693cbf5ee0c8 TEXT;
  p_UserSearchPredicateAPI_693cbf5ee0c8 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateFullTextSearch_693cbf5ee0c8 BOOLEAN;
  p_AutoUpdateExtendedType_693cbf5ee0c8 BOOLEAN;
  p_IsComputed_693cbf5ee0c8 BOOLEAN;
  p_EmbeddedRecord_693cbf5ee0c8 TEXT;
  p_Configuration_693cbf5ee0c8 TEXT;
  p_ID_693cbf5ee0c8 UUID;
BEGIN
  p_DisplayName_693cbf5ee0c8 := 'Description';
  p_Description_693cbf5ee0c8 := 'The program''s terms as the customer was told them.';
  p_AutoUpdateDescription_693cbf5ee0c8 := TRUE;
  p_IsPrimaryKey_693cbf5ee0c8 := FALSE;
  p_IsUnique_693cbf5ee0c8 := FALSE;
  p_Category_693cbf5ee0c8 := 'Program Details';
  p_ValueListType_693cbf5ee0c8 := 'None';
  p_DefaultInView_693cbf5ee0c8 := TRUE;
  p_DefaultColumnWidth_693cbf5ee0c8 := 150;
  p_AllowUpdateAPI_693cbf5ee0c8 := TRUE;
  p_AllowUpdateInView_693cbf5ee0c8 := TRUE;
  p_IncludeInUserSearchAPI_693cbf5ee0c8 := FALSE;
  p_FullTextSearchEnabled_693cbf5ee0c8 := FALSE;
  p_IncludeInGeneratedForm_693cbf5ee0c8 := TRUE;
  p_GeneratedFormSection_693cbf5ee0c8 := 'Category';
  p_IsNameField_693cbf5ee0c8 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8 := FALSE;
  p_RelatedEntityDisplayType_693cbf5ee0c8 := 'Search';
  p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8 := TRUE;
  p_ValuesToPackWithSchema_693cbf5ee0c8 := 'Auto';
  p_Status_693cbf5ee0c8 := 'Active';
  p_AutoUpdateIsNameField_693cbf5ee0c8 := TRUE;
  p_AutoUpdateDefaultInView_693cbf5ee0c8 := TRUE;
  p_AutoUpdateCategory_693cbf5ee0c8 := TRUE;
  p_AutoUpdateDisplayName_693cbf5ee0c8 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8 := TRUE;
  p_Encrypt_693cbf5ee0c8 := FALSE;
  p_AllowDecryptInAPI_693cbf5ee0c8 := FALSE;
  p_SendEncryptedValue_693cbf5ee0c8 := FALSE;
  p_IsSoftPrimaryKey_693cbf5ee0c8 := FALSE;
  p_IsSoftForeignKey_693cbf5ee0c8 := FALSE;
  p_JSONTypeIsArray_693cbf5ee0c8 := FALSE;
  p_UserSearchPredicateAPI_693cbf5ee0c8 := 'Contains';
  p_AutoUpdateUserSearchPredicate_693cbf5ee0c8 := TRUE;
  p_AutoUpdateFullTextSearch_693cbf5ee0c8 := TRUE;
  p_AutoUpdateExtendedType_693cbf5ee0c8 := TRUE;
  p_IsComputed_693cbf5ee0c8 := FALSE;
  p_ID_693cbf5ee0c8 := '3D0C49F4-DCB0-490E-B2A5-C326DC49BD56';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_693cbf5ee0c8,
    'Description', p_Description_693cbf5ee0c8,
    'AutoUpdateDescription', p_AutoUpdateDescription_693cbf5ee0c8,
    'IsPrimaryKey', p_IsPrimaryKey_693cbf5ee0c8,
    'IsUnique', p_IsUnique_693cbf5ee0c8,
    'Category', p_Category_693cbf5ee0c8,
    'ValueListType', p_ValueListType_693cbf5ee0c8,
    'ExtendedType', p_ExtendedType_693cbf5ee0c8,
    'CodeType', p_CodeType_693cbf5ee0c8,
    'DefaultInView', p_DefaultInView_693cbf5ee0c8,
    'ViewCellTemplate', p_ViewCellTemplate_693cbf5ee0c8,
    'DefaultColumnWidth', p_DefaultColumnWidth_693cbf5ee0c8,
    'AllowUpdateAPI', p_AllowUpdateAPI_693cbf5ee0c8,
    'AllowUpdateInView', p_AllowUpdateInView_693cbf5ee0c8,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_693cbf5ee0c8,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_693cbf5ee0c8,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_693cbf5ee0c8,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_693cbf5ee0c8,
    'GeneratedFormSection', p_GeneratedFormSection_693cbf5ee0c8,
    'IsNameField', p_IsNameField_693cbf5ee0c8,
    'RelatedEntityID', p_RelatedEntityID_693cbf5ee0c8,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_693cbf5ee0c8,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_693cbf5ee0c8,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_693cbf5ee0c8,
    'EntityIDFieldName', p_EntityIDFieldName_693cbf5ee0c8,
    'ScopeDefault', p_ScopeDefault_693cbf5ee0c8,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_693cbf5ee0c8,
    'Status', p_Status_693cbf5ee0c8,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_693cbf5ee0c8,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_693cbf5ee0c8,
    'AutoUpdateCategory', p_AutoUpdateCategory_693cbf5ee0c8,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_693cbf5ee0c8,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8,
    'Encrypt', p_Encrypt_693cbf5ee0c8,
    'EncryptionKeyID', p_EncryptionKeyID_693cbf5ee0c8,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_693cbf5ee0c8,
    'SendEncryptedValue', p_SendEncryptedValue_693cbf5ee0c8,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_693cbf5ee0c8,
    'IsSoftForeignKey', p_IsSoftForeignKey_693cbf5ee0c8,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_693cbf5ee0c8,
    'JSONType', p_JSONType_693cbf5ee0c8,
    'JSONTypeIsArray', p_JSONTypeIsArray_693cbf5ee0c8,
    'JSONTypeDefinition', p_JSONTypeDefinition_693cbf5ee0c8,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_693cbf5ee0c8,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_693cbf5ee0c8,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_693cbf5ee0c8,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_693cbf5ee0c8,
    'IsComputed', p_IsComputed_693cbf5ee0c8
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_693cbf5ee0c8,
    'Configuration', p_Configuration_693cbf5ee0c8,
    'ID', p_ID_693cbf5ee0c8
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_693cbf5ee0c8, p_Description := p_Description_693cbf5ee0c8, p_AutoUpdateDescription := p_AutoUpdateDescription_693cbf5ee0c8, p_IsPrimaryKey := p_IsPrimaryKey_693cbf5ee0c8, p_IsUnique := p_IsUnique_693cbf5ee0c8, p_Category := p_Category_693cbf5ee0c8, p_ValueListType := p_ValueListType_693cbf5ee0c8, p_ExtendedType := p_ExtendedType_693cbf5ee0c8, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_693cbf5ee0c8, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_693cbf5ee0c8, p_ViewCellTemplate := p_ViewCellTemplate_693cbf5ee0c8, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_693cbf5ee0c8, p_AllowUpdateAPI := p_AllowUpdateAPI_693cbf5ee0c8, p_AllowUpdateInView := p_AllowUpdateInView_693cbf5ee0c8, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_693cbf5ee0c8, p_FullTextSearchEnabled := p_FullTextSearchEnabled_693cbf5ee0c8, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_693cbf5ee0c8, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_693cbf5ee0c8, p_GeneratedFormSection := p_GeneratedFormSection_693cbf5ee0c8, p_IsNameField := p_IsNameField_693cbf5ee0c8, p_RelatedEntityID := p_RelatedEntityID_693cbf5ee0c8, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_693cbf5ee0c8, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_693cbf5ee0c8, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_693cbf5ee0c8, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_693cbf5ee0c8, p_EntityIDFieldName := p_EntityIDFieldName_693cbf5ee0c8, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_693cbf5ee0c8, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_693cbf5ee0c8, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_693cbf5ee0c8, p_Status := p_Status_693cbf5ee0c8, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_693cbf5ee0c8, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_693cbf5ee0c8, p_AutoUpdateCategory := p_AutoUpdateCategory_693cbf5ee0c8, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_693cbf5ee0c8, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_693cbf5ee0c8, p_Encrypt := p_Encrypt_693cbf5ee0c8, p_EncryptionKeyID := p_EncryptionKeyID_693cbf5ee0c8, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_693cbf5ee0c8, p_SendEncryptedValue := p_SendEncryptedValue_693cbf5ee0c8, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_693cbf5ee0c8, p_IsSoftForeignKey := p_IsSoftForeignKey_693cbf5ee0c8, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_693cbf5ee0c8, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_693cbf5ee0c8, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_693cbf5ee0c8, p_JSONTypeDefinition := p_JSONTypeDefinition_693cbf5ee0c8, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_693cbf5ee0c8, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_693cbf5ee0c8, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_693cbf5ee0c8, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_693cbf5ee0c8, p_IsComputed := p_IsComputed_693cbf5ee0c8, p_EmbeddedRecord := p_EmbeddedRecord_693cbf5ee0c8, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_693cbf5ee0c8, p_Configuration_Clear := TRUE, p_ID := p_ID_693cbf5ee0c8);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_33fe68e3340b VARCHAR(255);
  p_Description_33fe68e3340b TEXT;
  p_AutoUpdateDescription_33fe68e3340b BOOLEAN;
  p_IsPrimaryKey_33fe68e3340b BOOLEAN;
  p_IsUnique_33fe68e3340b BOOLEAN;
  p_Category_33fe68e3340b VARCHAR(255);
  p_ValueListType_33fe68e3340b VARCHAR(20);
  p_ExtendedType_33fe68e3340b VARCHAR(50);
  p_CodeType_33fe68e3340b VARCHAR(50);
  p_DefaultInView_33fe68e3340b BOOLEAN;
  p_ViewCellTemplate_33fe68e3340b TEXT;
  p_DefaultColumnWidth_33fe68e3340b INTEGER;
  p_AllowUpdateAPI_33fe68e3340b BOOLEAN;
  p_AllowUpdateInView_33fe68e3340b BOOLEAN;
  p_IncludeInUserSearchAPI_33fe68e3340b BOOLEAN;
  p_FullTextSearchEnabled_33fe68e3340b BOOLEAN;
  p_UserSearchParamFormatAPI_33fe68e3340b VARCHAR(500);
  p_IncludeInGeneratedForm_33fe68e3340b BOOLEAN;
  p_GeneratedFormSection_33fe68e3340b VARCHAR(10);
  p_IsNameField_33fe68e3340b BOOLEAN;
  p_RelatedEntityID_33fe68e3340b UUID;
  p_RelatedEntityFieldName_33fe68e3340b VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_33fe68e3340b BOOLEAN;
  p_RelatedEntityNameFieldMap_33fe68e3340b VARCHAR(255);
  p_RelatedEntityDisplayType_33fe68e3340b VARCHAR(20);
  p_EntityIDFieldName_33fe68e3340b VARCHAR(100);
  p_ScopeDefault_33fe68e3340b VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_33fe68e3340b BOOLEAN;
  p_ValuesToPackWithSchema_33fe68e3340b VARCHAR(10);
  p_Status_33fe68e3340b VARCHAR(25);
  p_AutoUpdateIsNameField_33fe68e3340b BOOLEAN;
  p_AutoUpdateDefaultInView_33fe68e3340b BOOLEAN;
  p_AutoUpdateCategory_33fe68e3340b BOOLEAN;
  p_AutoUpdateDisplayName_33fe68e3340b BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_33fe68e3340b BOOLEAN;
  p_Encrypt_33fe68e3340b BOOLEAN;
  p_EncryptionKeyID_33fe68e3340b UUID;
  p_AllowDecryptInAPI_33fe68e3340b BOOLEAN;
  p_SendEncryptedValue_33fe68e3340b BOOLEAN;
  p_IsSoftPrimaryKey_33fe68e3340b BOOLEAN;
  p_IsSoftForeignKey_33fe68e3340b BOOLEAN;
  p_RelatedEntityJoinFields_33fe68e3340b TEXT;
  p_JSONType_33fe68e3340b VARCHAR(255);
  p_JSONTypeIsArray_33fe68e3340b BOOLEAN;
  p_JSONTypeDefinition_33fe68e3340b TEXT;
  p_UserSearchPredicateAPI_33fe68e3340b VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_33fe68e3340b BOOLEAN;
  p_AutoUpdateFullTextSearch_33fe68e3340b BOOLEAN;
  p_AutoUpdateExtendedType_33fe68e3340b BOOLEAN;
  p_IsComputed_33fe68e3340b BOOLEAN;
  p_EmbeddedRecord_33fe68e3340b TEXT;
  p_Configuration_33fe68e3340b TEXT;
  p_ID_33fe68e3340b UUID;
BEGIN
  p_DisplayName_33fe68e3340b := 'Days Per Referral';
  p_Description_33fe68e3340b := 'Days one referral earns. A Duration concession naming this program is approved by the program when it adds no more than this to a term bought by a renewal line; a larger one is routed for approval like any other concession. Must be a whole number above zero.';
  p_AutoUpdateDescription_33fe68e3340b := TRUE;
  p_IsPrimaryKey_33fe68e3340b := FALSE;
  p_IsUnique_33fe68e3340b := FALSE;
  p_Category_33fe68e3340b := 'Program Details';
  p_ValueListType_33fe68e3340b := 'None';
  p_DefaultInView_33fe68e3340b := TRUE;
  p_DefaultColumnWidth_33fe68e3340b := 50;
  p_AllowUpdateAPI_33fe68e3340b := TRUE;
  p_AllowUpdateInView_33fe68e3340b := TRUE;
  p_IncludeInUserSearchAPI_33fe68e3340b := FALSE;
  p_FullTextSearchEnabled_33fe68e3340b := FALSE;
  p_IncludeInGeneratedForm_33fe68e3340b := TRUE;
  p_GeneratedFormSection_33fe68e3340b := 'Category';
  p_IsNameField_33fe68e3340b := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_33fe68e3340b := FALSE;
  p_RelatedEntityDisplayType_33fe68e3340b := 'Search';
  p_AutoUpdateRelatedEntityInfo_33fe68e3340b := TRUE;
  p_ValuesToPackWithSchema_33fe68e3340b := 'Auto';
  p_Status_33fe68e3340b := 'Active';
  p_AutoUpdateIsNameField_33fe68e3340b := TRUE;
  p_AutoUpdateDefaultInView_33fe68e3340b := TRUE;
  p_AutoUpdateCategory_33fe68e3340b := TRUE;
  p_AutoUpdateDisplayName_33fe68e3340b := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_33fe68e3340b := TRUE;
  p_Encrypt_33fe68e3340b := FALSE;
  p_AllowDecryptInAPI_33fe68e3340b := FALSE;
  p_SendEncryptedValue_33fe68e3340b := FALSE;
  p_IsSoftPrimaryKey_33fe68e3340b := FALSE;
  p_IsSoftForeignKey_33fe68e3340b := FALSE;
  p_JSONTypeIsArray_33fe68e3340b := FALSE;
  p_UserSearchPredicateAPI_33fe68e3340b := 'Contains';
  p_AutoUpdateUserSearchPredicate_33fe68e3340b := TRUE;
  p_AutoUpdateFullTextSearch_33fe68e3340b := TRUE;
  p_AutoUpdateExtendedType_33fe68e3340b := TRUE;
  p_IsComputed_33fe68e3340b := FALSE;
  p_ID_33fe68e3340b := '91095F10-0D83-4181-B999-8BB91F0ACF97';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_33fe68e3340b,
    'Description', p_Description_33fe68e3340b,
    'AutoUpdateDescription', p_AutoUpdateDescription_33fe68e3340b,
    'IsPrimaryKey', p_IsPrimaryKey_33fe68e3340b,
    'IsUnique', p_IsUnique_33fe68e3340b,
    'Category', p_Category_33fe68e3340b,
    'ValueListType', p_ValueListType_33fe68e3340b,
    'ExtendedType', p_ExtendedType_33fe68e3340b,
    'CodeType', p_CodeType_33fe68e3340b,
    'DefaultInView', p_DefaultInView_33fe68e3340b,
    'ViewCellTemplate', p_ViewCellTemplate_33fe68e3340b,
    'DefaultColumnWidth', p_DefaultColumnWidth_33fe68e3340b,
    'AllowUpdateAPI', p_AllowUpdateAPI_33fe68e3340b,
    'AllowUpdateInView', p_AllowUpdateInView_33fe68e3340b,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_33fe68e3340b,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_33fe68e3340b,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_33fe68e3340b,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_33fe68e3340b,
    'GeneratedFormSection', p_GeneratedFormSection_33fe68e3340b,
    'IsNameField', p_IsNameField_33fe68e3340b,
    'RelatedEntityID', p_RelatedEntityID_33fe68e3340b,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_33fe68e3340b,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_33fe68e3340b,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_33fe68e3340b,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_33fe68e3340b,
    'EntityIDFieldName', p_EntityIDFieldName_33fe68e3340b,
    'ScopeDefault', p_ScopeDefault_33fe68e3340b,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_33fe68e3340b,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_33fe68e3340b,
    'Status', p_Status_33fe68e3340b,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_33fe68e3340b,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_33fe68e3340b,
    'AutoUpdateCategory', p_AutoUpdateCategory_33fe68e3340b,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_33fe68e3340b,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_33fe68e3340b,
    'Encrypt', p_Encrypt_33fe68e3340b,
    'EncryptionKeyID', p_EncryptionKeyID_33fe68e3340b,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_33fe68e3340b,
    'SendEncryptedValue', p_SendEncryptedValue_33fe68e3340b,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_33fe68e3340b,
    'IsSoftForeignKey', p_IsSoftForeignKey_33fe68e3340b,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_33fe68e3340b,
    'JSONType', p_JSONType_33fe68e3340b,
    'JSONTypeIsArray', p_JSONTypeIsArray_33fe68e3340b,
    'JSONTypeDefinition', p_JSONTypeDefinition_33fe68e3340b,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_33fe68e3340b,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_33fe68e3340b,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_33fe68e3340b,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_33fe68e3340b,
    'IsComputed', p_IsComputed_33fe68e3340b
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_33fe68e3340b,
    'Configuration', p_Configuration_33fe68e3340b,
    'ID', p_ID_33fe68e3340b
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_33fe68e3340b, p_Description := p_Description_33fe68e3340b, p_AutoUpdateDescription := p_AutoUpdateDescription_33fe68e3340b, p_IsPrimaryKey := p_IsPrimaryKey_33fe68e3340b, p_IsUnique := p_IsUnique_33fe68e3340b, p_Category := p_Category_33fe68e3340b, p_ValueListType := p_ValueListType_33fe68e3340b, p_ExtendedType := p_ExtendedType_33fe68e3340b, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_33fe68e3340b, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_33fe68e3340b, p_ViewCellTemplate := p_ViewCellTemplate_33fe68e3340b, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_33fe68e3340b, p_AllowUpdateAPI := p_AllowUpdateAPI_33fe68e3340b, p_AllowUpdateInView := p_AllowUpdateInView_33fe68e3340b, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_33fe68e3340b, p_FullTextSearchEnabled := p_FullTextSearchEnabled_33fe68e3340b, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_33fe68e3340b, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_33fe68e3340b, p_GeneratedFormSection := p_GeneratedFormSection_33fe68e3340b, p_IsNameField := p_IsNameField_33fe68e3340b, p_RelatedEntityID := p_RelatedEntityID_33fe68e3340b, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_33fe68e3340b, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_33fe68e3340b, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_33fe68e3340b, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_33fe68e3340b, p_EntityIDFieldName := p_EntityIDFieldName_33fe68e3340b, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_33fe68e3340b, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_33fe68e3340b, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_33fe68e3340b, p_Status := p_Status_33fe68e3340b, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_33fe68e3340b, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_33fe68e3340b, p_AutoUpdateCategory := p_AutoUpdateCategory_33fe68e3340b, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_33fe68e3340b, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_33fe68e3340b, p_Encrypt := p_Encrypt_33fe68e3340b, p_EncryptionKeyID := p_EncryptionKeyID_33fe68e3340b, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_33fe68e3340b, p_SendEncryptedValue := p_SendEncryptedValue_33fe68e3340b, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_33fe68e3340b, p_IsSoftForeignKey := p_IsSoftForeignKey_33fe68e3340b, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_33fe68e3340b, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_33fe68e3340b, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_33fe68e3340b, p_JSONTypeDefinition := p_JSONTypeDefinition_33fe68e3340b, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_33fe68e3340b, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_33fe68e3340b, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_33fe68e3340b, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_33fe68e3340b, p_IsComputed := p_IsComputed_33fe68e3340b, p_EmbeddedRecord := p_EmbeddedRecord_33fe68e3340b, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_33fe68e3340b, p_Configuration_Clear := TRUE, p_ID := p_ID_33fe68e3340b);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_d6b796a7c835 VARCHAR(255);
  p_Description_d6b796a7c835 TEXT;
  p_AutoUpdateDescription_d6b796a7c835 BOOLEAN;
  p_IsPrimaryKey_d6b796a7c835 BOOLEAN;
  p_IsUnique_d6b796a7c835 BOOLEAN;
  p_Category_d6b796a7c835 VARCHAR(255);
  p_ValueListType_d6b796a7c835 VARCHAR(20);
  p_ExtendedType_d6b796a7c835 VARCHAR(50);
  p_CodeType_d6b796a7c835 VARCHAR(50);
  p_DefaultInView_d6b796a7c835 BOOLEAN;
  p_ViewCellTemplate_d6b796a7c835 TEXT;
  p_DefaultColumnWidth_d6b796a7c835 INTEGER;
  p_AllowUpdateAPI_d6b796a7c835 BOOLEAN;
  p_AllowUpdateInView_d6b796a7c835 BOOLEAN;
  p_IncludeInUserSearchAPI_d6b796a7c835 BOOLEAN;
  p_FullTextSearchEnabled_d6b796a7c835 BOOLEAN;
  p_UserSearchParamFormatAPI_d6b796a7c835 VARCHAR(500);
  p_IncludeInGeneratedForm_d6b796a7c835 BOOLEAN;
  p_GeneratedFormSection_d6b796a7c835 VARCHAR(10);
  p_IsNameField_d6b796a7c835 BOOLEAN;
  p_RelatedEntityID_d6b796a7c835 UUID;
  p_RelatedEntityFieldName_d6b796a7c835 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835 BOOLEAN;
  p_RelatedEntityNameFieldMap_d6b796a7c835 VARCHAR(255);
  p_RelatedEntityDisplayType_d6b796a7c835 VARCHAR(20);
  p_EntityIDFieldName_d6b796a7c835 VARCHAR(100);
  p_ScopeDefault_d6b796a7c835 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_d6b796a7c835 BOOLEAN;
  p_ValuesToPackWithSchema_d6b796a7c835 VARCHAR(10);
  p_Status_d6b796a7c835 VARCHAR(25);
  p_AutoUpdateIsNameField_d6b796a7c835 BOOLEAN;
  p_AutoUpdateDefaultInView_d6b796a7c835 BOOLEAN;
  p_AutoUpdateCategory_d6b796a7c835 BOOLEAN;
  p_AutoUpdateDisplayName_d6b796a7c835 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835 BOOLEAN;
  p_Encrypt_d6b796a7c835 BOOLEAN;
  p_EncryptionKeyID_d6b796a7c835 UUID;
  p_AllowDecryptInAPI_d6b796a7c835 BOOLEAN;
  p_SendEncryptedValue_d6b796a7c835 BOOLEAN;
  p_IsSoftPrimaryKey_d6b796a7c835 BOOLEAN;
  p_IsSoftForeignKey_d6b796a7c835 BOOLEAN;
  p_RelatedEntityJoinFields_d6b796a7c835 TEXT;
  p_JSONType_d6b796a7c835 VARCHAR(255);
  p_JSONTypeIsArray_d6b796a7c835 BOOLEAN;
  p_JSONTypeDefinition_d6b796a7c835 TEXT;
  p_UserSearchPredicateAPI_d6b796a7c835 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_d6b796a7c835 BOOLEAN;
  p_AutoUpdateFullTextSearch_d6b796a7c835 BOOLEAN;
  p_AutoUpdateExtendedType_d6b796a7c835 BOOLEAN;
  p_IsComputed_d6b796a7c835 BOOLEAN;
  p_EmbeddedRecord_d6b796a7c835 TEXT;
  p_Configuration_d6b796a7c835 TEXT;
  p_ID_d6b796a7c835 UUID;
BEGIN
  p_DisplayName_d6b796a7c835 := 'Is Active';
  p_Description_d6b796a7c835 := 'Only an active program approves a concession. Deactivate a program rather than deleting it: approved concessions keep naming it.';
  p_AutoUpdateDescription_d6b796a7c835 := TRUE;
  p_IsPrimaryKey_d6b796a7c835 := FALSE;
  p_IsUnique_d6b796a7c835 := FALSE;
  p_Category_d6b796a7c835 := 'Program Details';
  p_ValueListType_d6b796a7c835 := 'None';
  p_DefaultInView_d6b796a7c835 := FALSE;
  p_DefaultColumnWidth_d6b796a7c835 := 150;
  p_AllowUpdateAPI_d6b796a7c835 := TRUE;
  p_AllowUpdateInView_d6b796a7c835 := TRUE;
  p_IncludeInUserSearchAPI_d6b796a7c835 := FALSE;
  p_FullTextSearchEnabled_d6b796a7c835 := FALSE;
  p_IncludeInGeneratedForm_d6b796a7c835 := TRUE;
  p_GeneratedFormSection_d6b796a7c835 := 'Category';
  p_IsNameField_d6b796a7c835 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835 := FALSE;
  p_RelatedEntityDisplayType_d6b796a7c835 := 'Search';
  p_AutoUpdateRelatedEntityInfo_d6b796a7c835 := TRUE;
  p_ValuesToPackWithSchema_d6b796a7c835 := 'Auto';
  p_Status_d6b796a7c835 := 'Active';
  p_AutoUpdateIsNameField_d6b796a7c835 := TRUE;
  p_AutoUpdateDefaultInView_d6b796a7c835 := TRUE;
  p_AutoUpdateCategory_d6b796a7c835 := TRUE;
  p_AutoUpdateDisplayName_d6b796a7c835 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835 := TRUE;
  p_Encrypt_d6b796a7c835 := FALSE;
  p_AllowDecryptInAPI_d6b796a7c835 := FALSE;
  p_SendEncryptedValue_d6b796a7c835 := FALSE;
  p_IsSoftPrimaryKey_d6b796a7c835 := FALSE;
  p_IsSoftForeignKey_d6b796a7c835 := FALSE;
  p_JSONTypeIsArray_d6b796a7c835 := FALSE;
  p_UserSearchPredicateAPI_d6b796a7c835 := 'Contains';
  p_AutoUpdateUserSearchPredicate_d6b796a7c835 := TRUE;
  p_AutoUpdateFullTextSearch_d6b796a7c835 := TRUE;
  p_AutoUpdateExtendedType_d6b796a7c835 := TRUE;
  p_IsComputed_d6b796a7c835 := FALSE;
  p_ID_d6b796a7c835 := 'E6646651-5BDA-4CC6-B646-370FAA915786';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_d6b796a7c835,
    'Description', p_Description_d6b796a7c835,
    'AutoUpdateDescription', p_AutoUpdateDescription_d6b796a7c835,
    'IsPrimaryKey', p_IsPrimaryKey_d6b796a7c835,
    'IsUnique', p_IsUnique_d6b796a7c835,
    'Category', p_Category_d6b796a7c835,
    'ValueListType', p_ValueListType_d6b796a7c835,
    'ExtendedType', p_ExtendedType_d6b796a7c835,
    'CodeType', p_CodeType_d6b796a7c835,
    'DefaultInView', p_DefaultInView_d6b796a7c835,
    'ViewCellTemplate', p_ViewCellTemplate_d6b796a7c835,
    'DefaultColumnWidth', p_DefaultColumnWidth_d6b796a7c835,
    'AllowUpdateAPI', p_AllowUpdateAPI_d6b796a7c835,
    'AllowUpdateInView', p_AllowUpdateInView_d6b796a7c835,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_d6b796a7c835,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_d6b796a7c835,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_d6b796a7c835,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_d6b796a7c835,
    'GeneratedFormSection', p_GeneratedFormSection_d6b796a7c835,
    'IsNameField', p_IsNameField_d6b796a7c835,
    'RelatedEntityID', p_RelatedEntityID_d6b796a7c835,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_d6b796a7c835,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_d6b796a7c835,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_d6b796a7c835,
    'EntityIDFieldName', p_EntityIDFieldName_d6b796a7c835,
    'ScopeDefault', p_ScopeDefault_d6b796a7c835,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_d6b796a7c835,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_d6b796a7c835,
    'Status', p_Status_d6b796a7c835,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_d6b796a7c835,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_d6b796a7c835,
    'AutoUpdateCategory', p_AutoUpdateCategory_d6b796a7c835,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_d6b796a7c835,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835,
    'Encrypt', p_Encrypt_d6b796a7c835,
    'EncryptionKeyID', p_EncryptionKeyID_d6b796a7c835,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_d6b796a7c835,
    'SendEncryptedValue', p_SendEncryptedValue_d6b796a7c835,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_d6b796a7c835,
    'IsSoftForeignKey', p_IsSoftForeignKey_d6b796a7c835,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_d6b796a7c835,
    'JSONType', p_JSONType_d6b796a7c835,
    'JSONTypeIsArray', p_JSONTypeIsArray_d6b796a7c835,
    'JSONTypeDefinition', p_JSONTypeDefinition_d6b796a7c835,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_d6b796a7c835,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_d6b796a7c835,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_d6b796a7c835,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_d6b796a7c835,
    'IsComputed', p_IsComputed_d6b796a7c835
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_d6b796a7c835,
    'Configuration', p_Configuration_d6b796a7c835,
    'ID', p_ID_d6b796a7c835
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_d6b796a7c835, p_Description := p_Description_d6b796a7c835, p_AutoUpdateDescription := p_AutoUpdateDescription_d6b796a7c835, p_IsPrimaryKey := p_IsPrimaryKey_d6b796a7c835, p_IsUnique := p_IsUnique_d6b796a7c835, p_Category := p_Category_d6b796a7c835, p_ValueListType := p_ValueListType_d6b796a7c835, p_ExtendedType := p_ExtendedType_d6b796a7c835, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_d6b796a7c835, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_d6b796a7c835, p_ViewCellTemplate := p_ViewCellTemplate_d6b796a7c835, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_d6b796a7c835, p_AllowUpdateAPI := p_AllowUpdateAPI_d6b796a7c835, p_AllowUpdateInView := p_AllowUpdateInView_d6b796a7c835, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_d6b796a7c835, p_FullTextSearchEnabled := p_FullTextSearchEnabled_d6b796a7c835, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_d6b796a7c835, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_d6b796a7c835, p_GeneratedFormSection := p_GeneratedFormSection_d6b796a7c835, p_IsNameField := p_IsNameField_d6b796a7c835, p_RelatedEntityID := p_RelatedEntityID_d6b796a7c835, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_d6b796a7c835, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_d6b796a7c835, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_d6b796a7c835, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_d6b796a7c835, p_EntityIDFieldName := p_EntityIDFieldName_d6b796a7c835, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_d6b796a7c835, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_d6b796a7c835, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_d6b796a7c835, p_Status := p_Status_d6b796a7c835, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_d6b796a7c835, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_d6b796a7c835, p_AutoUpdateCategory := p_AutoUpdateCategory_d6b796a7c835, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_d6b796a7c835, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_d6b796a7c835, p_Encrypt := p_Encrypt_d6b796a7c835, p_EncryptionKeyID := p_EncryptionKeyID_d6b796a7c835, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_d6b796a7c835, p_SendEncryptedValue := p_SendEncryptedValue_d6b796a7c835, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_d6b796a7c835, p_IsSoftForeignKey := p_IsSoftForeignKey_d6b796a7c835, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_d6b796a7c835, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_d6b796a7c835, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_d6b796a7c835, p_JSONTypeDefinition := p_JSONTypeDefinition_d6b796a7c835, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_d6b796a7c835, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_d6b796a7c835, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_d6b796a7c835, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_d6b796a7c835, p_IsComputed := p_IsComputed_d6b796a7c835, p_EmbeddedRecord := p_EmbeddedRecord_d6b796a7c835, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_d6b796a7c835, p_Configuration_Clear := TRUE, p_ID := p_ID_d6b796a7c835);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_4f2e7fe009af VARCHAR(255);
  p_Description_4f2e7fe009af TEXT;
  p_AutoUpdateDescription_4f2e7fe009af BOOLEAN;
  p_IsPrimaryKey_4f2e7fe009af BOOLEAN;
  p_IsUnique_4f2e7fe009af BOOLEAN;
  p_Category_4f2e7fe009af VARCHAR(255);
  p_ValueListType_4f2e7fe009af VARCHAR(20);
  p_ExtendedType_4f2e7fe009af VARCHAR(50);
  p_CodeType_4f2e7fe009af VARCHAR(50);
  p_DefaultInView_4f2e7fe009af BOOLEAN;
  p_ViewCellTemplate_4f2e7fe009af TEXT;
  p_DefaultColumnWidth_4f2e7fe009af INTEGER;
  p_AllowUpdateAPI_4f2e7fe009af BOOLEAN;
  p_AllowUpdateInView_4f2e7fe009af BOOLEAN;
  p_IncludeInUserSearchAPI_4f2e7fe009af BOOLEAN;
  p_FullTextSearchEnabled_4f2e7fe009af BOOLEAN;
  p_UserSearchParamFormatAPI_4f2e7fe009af VARCHAR(500);
  p_IncludeInGeneratedForm_4f2e7fe009af BOOLEAN;
  p_GeneratedFormSection_4f2e7fe009af VARCHAR(10);
  p_IsNameField_4f2e7fe009af BOOLEAN;
  p_RelatedEntityID_4f2e7fe009af UUID;
  p_RelatedEntityFieldName_4f2e7fe009af VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_4f2e7fe009af BOOLEAN;
  p_RelatedEntityNameFieldMap_4f2e7fe009af VARCHAR(255);
  p_RelatedEntityDisplayType_4f2e7fe009af VARCHAR(20);
  p_EntityIDFieldName_4f2e7fe009af VARCHAR(100);
  p_ScopeDefault_4f2e7fe009af VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_4f2e7fe009af BOOLEAN;
  p_ValuesToPackWithSchema_4f2e7fe009af VARCHAR(10);
  p_Status_4f2e7fe009af VARCHAR(25);
  p_AutoUpdateIsNameField_4f2e7fe009af BOOLEAN;
  p_AutoUpdateDefaultInView_4f2e7fe009af BOOLEAN;
  p_AutoUpdateCategory_4f2e7fe009af BOOLEAN;
  p_AutoUpdateDisplayName_4f2e7fe009af BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_4f2e7fe009af BOOLEAN;
  p_Encrypt_4f2e7fe009af BOOLEAN;
  p_EncryptionKeyID_4f2e7fe009af UUID;
  p_AllowDecryptInAPI_4f2e7fe009af BOOLEAN;
  p_SendEncryptedValue_4f2e7fe009af BOOLEAN;
  p_IsSoftPrimaryKey_4f2e7fe009af BOOLEAN;
  p_IsSoftForeignKey_4f2e7fe009af BOOLEAN;
  p_RelatedEntityJoinFields_4f2e7fe009af TEXT;
  p_JSONType_4f2e7fe009af VARCHAR(255);
  p_JSONTypeIsArray_4f2e7fe009af BOOLEAN;
  p_JSONTypeDefinition_4f2e7fe009af TEXT;
  p_UserSearchPredicateAPI_4f2e7fe009af VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_4f2e7fe009af BOOLEAN;
  p_AutoUpdateFullTextSearch_4f2e7fe009af BOOLEAN;
  p_AutoUpdateExtendedType_4f2e7fe009af BOOLEAN;
  p_IsComputed_4f2e7fe009af BOOLEAN;
  p_EmbeddedRecord_4f2e7fe009af TEXT;
  p_Configuration_4f2e7fe009af TEXT;
  p_ID_4f2e7fe009af UUID;
BEGIN
  p_DisplayName_4f2e7fe009af := 'Created At';
  p_AutoUpdateDescription_4f2e7fe009af := TRUE;
  p_IsPrimaryKey_4f2e7fe009af := FALSE;
  p_IsUnique_4f2e7fe009af := FALSE;
  p_Category_4f2e7fe009af := 'System Metadata';
  p_ValueListType_4f2e7fe009af := 'None';
  p_DefaultInView_4f2e7fe009af := FALSE;
  p_DefaultColumnWidth_4f2e7fe009af := 100;
  p_AllowUpdateAPI_4f2e7fe009af := FALSE;
  p_AllowUpdateInView_4f2e7fe009af := TRUE;
  p_IncludeInUserSearchAPI_4f2e7fe009af := FALSE;
  p_FullTextSearchEnabled_4f2e7fe009af := FALSE;
  p_IncludeInGeneratedForm_4f2e7fe009af := TRUE;
  p_GeneratedFormSection_4f2e7fe009af := 'Category';
  p_IsNameField_4f2e7fe009af := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_4f2e7fe009af := FALSE;
  p_RelatedEntityDisplayType_4f2e7fe009af := 'Search';
  p_AutoUpdateRelatedEntityInfo_4f2e7fe009af := TRUE;
  p_ValuesToPackWithSchema_4f2e7fe009af := 'Auto';
  p_Status_4f2e7fe009af := 'Active';
  p_AutoUpdateIsNameField_4f2e7fe009af := TRUE;
  p_AutoUpdateDefaultInView_4f2e7fe009af := TRUE;
  p_AutoUpdateCategory_4f2e7fe009af := TRUE;
  p_AutoUpdateDisplayName_4f2e7fe009af := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_4f2e7fe009af := TRUE;
  p_Encrypt_4f2e7fe009af := FALSE;
  p_AllowDecryptInAPI_4f2e7fe009af := FALSE;
  p_SendEncryptedValue_4f2e7fe009af := FALSE;
  p_IsSoftPrimaryKey_4f2e7fe009af := FALSE;
  p_IsSoftForeignKey_4f2e7fe009af := FALSE;
  p_JSONTypeIsArray_4f2e7fe009af := FALSE;
  p_UserSearchPredicateAPI_4f2e7fe009af := 'Contains';
  p_AutoUpdateUserSearchPredicate_4f2e7fe009af := TRUE;
  p_AutoUpdateFullTextSearch_4f2e7fe009af := TRUE;
  p_AutoUpdateExtendedType_4f2e7fe009af := TRUE;
  p_IsComputed_4f2e7fe009af := FALSE;
  p_ID_4f2e7fe009af := '79F9A88B-86B6-49D6-A3B0-AF387B3CF52B';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_4f2e7fe009af,
    'Description', p_Description_4f2e7fe009af,
    'AutoUpdateDescription', p_AutoUpdateDescription_4f2e7fe009af,
    'IsPrimaryKey', p_IsPrimaryKey_4f2e7fe009af,
    'IsUnique', p_IsUnique_4f2e7fe009af,
    'Category', p_Category_4f2e7fe009af,
    'ValueListType', p_ValueListType_4f2e7fe009af,
    'ExtendedType', p_ExtendedType_4f2e7fe009af,
    'CodeType', p_CodeType_4f2e7fe009af,
    'DefaultInView', p_DefaultInView_4f2e7fe009af,
    'ViewCellTemplate', p_ViewCellTemplate_4f2e7fe009af,
    'DefaultColumnWidth', p_DefaultColumnWidth_4f2e7fe009af,
    'AllowUpdateAPI', p_AllowUpdateAPI_4f2e7fe009af,
    'AllowUpdateInView', p_AllowUpdateInView_4f2e7fe009af,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_4f2e7fe009af,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_4f2e7fe009af,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_4f2e7fe009af,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_4f2e7fe009af,
    'GeneratedFormSection', p_GeneratedFormSection_4f2e7fe009af,
    'IsNameField', p_IsNameField_4f2e7fe009af,
    'RelatedEntityID', p_RelatedEntityID_4f2e7fe009af,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_4f2e7fe009af,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_4f2e7fe009af,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_4f2e7fe009af,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_4f2e7fe009af,
    'EntityIDFieldName', p_EntityIDFieldName_4f2e7fe009af,
    'ScopeDefault', p_ScopeDefault_4f2e7fe009af,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_4f2e7fe009af,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_4f2e7fe009af,
    'Status', p_Status_4f2e7fe009af,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_4f2e7fe009af,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_4f2e7fe009af,
    'AutoUpdateCategory', p_AutoUpdateCategory_4f2e7fe009af,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_4f2e7fe009af,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_4f2e7fe009af,
    'Encrypt', p_Encrypt_4f2e7fe009af,
    'EncryptionKeyID', p_EncryptionKeyID_4f2e7fe009af,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_4f2e7fe009af,
    'SendEncryptedValue', p_SendEncryptedValue_4f2e7fe009af,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_4f2e7fe009af,
    'IsSoftForeignKey', p_IsSoftForeignKey_4f2e7fe009af,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_4f2e7fe009af,
    'JSONType', p_JSONType_4f2e7fe009af,
    'JSONTypeIsArray', p_JSONTypeIsArray_4f2e7fe009af,
    'JSONTypeDefinition', p_JSONTypeDefinition_4f2e7fe009af,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_4f2e7fe009af,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_4f2e7fe009af,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_4f2e7fe009af,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_4f2e7fe009af,
    'IsComputed', p_IsComputed_4f2e7fe009af
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_4f2e7fe009af,
    'Configuration', p_Configuration_4f2e7fe009af,
    'ID', p_ID_4f2e7fe009af
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_4f2e7fe009af, p_Description := p_Description_4f2e7fe009af, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_4f2e7fe009af, p_IsPrimaryKey := p_IsPrimaryKey_4f2e7fe009af, p_IsUnique := p_IsUnique_4f2e7fe009af, p_Category := p_Category_4f2e7fe009af, p_ValueListType := p_ValueListType_4f2e7fe009af, p_ExtendedType := p_ExtendedType_4f2e7fe009af, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_4f2e7fe009af, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_4f2e7fe009af, p_ViewCellTemplate := p_ViewCellTemplate_4f2e7fe009af, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_4f2e7fe009af, p_AllowUpdateAPI := p_AllowUpdateAPI_4f2e7fe009af, p_AllowUpdateInView := p_AllowUpdateInView_4f2e7fe009af, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_4f2e7fe009af, p_FullTextSearchEnabled := p_FullTextSearchEnabled_4f2e7fe009af, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_4f2e7fe009af, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_4f2e7fe009af, p_GeneratedFormSection := p_GeneratedFormSection_4f2e7fe009af, p_IsNameField := p_IsNameField_4f2e7fe009af, p_RelatedEntityID := p_RelatedEntityID_4f2e7fe009af, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_4f2e7fe009af, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_4f2e7fe009af, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_4f2e7fe009af, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_4f2e7fe009af, p_EntityIDFieldName := p_EntityIDFieldName_4f2e7fe009af, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_4f2e7fe009af, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_4f2e7fe009af, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_4f2e7fe009af, p_Status := p_Status_4f2e7fe009af, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_4f2e7fe009af, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_4f2e7fe009af, p_AutoUpdateCategory := p_AutoUpdateCategory_4f2e7fe009af, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_4f2e7fe009af, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_4f2e7fe009af, p_Encrypt := p_Encrypt_4f2e7fe009af, p_EncryptionKeyID := p_EncryptionKeyID_4f2e7fe009af, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_4f2e7fe009af, p_SendEncryptedValue := p_SendEncryptedValue_4f2e7fe009af, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_4f2e7fe009af, p_IsSoftForeignKey := p_IsSoftForeignKey_4f2e7fe009af, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_4f2e7fe009af, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_4f2e7fe009af, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_4f2e7fe009af, p_JSONTypeDefinition := p_JSONTypeDefinition_4f2e7fe009af, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_4f2e7fe009af, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_4f2e7fe009af, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_4f2e7fe009af, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_4f2e7fe009af, p_IsComputed := p_IsComputed_4f2e7fe009af, p_EmbeddedRecord := p_EmbeddedRecord_4f2e7fe009af, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_4f2e7fe009af, p_Configuration_Clear := TRUE, p_ID := p_ID_4f2e7fe009af);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_0a8ab6c8d2d4 VARCHAR(255);
  p_Description_0a8ab6c8d2d4 TEXT;
  p_AutoUpdateDescription_0a8ab6c8d2d4 BOOLEAN;
  p_IsPrimaryKey_0a8ab6c8d2d4 BOOLEAN;
  p_IsUnique_0a8ab6c8d2d4 BOOLEAN;
  p_Category_0a8ab6c8d2d4 VARCHAR(255);
  p_ValueListType_0a8ab6c8d2d4 VARCHAR(20);
  p_ExtendedType_0a8ab6c8d2d4 VARCHAR(50);
  p_CodeType_0a8ab6c8d2d4 VARCHAR(50);
  p_DefaultInView_0a8ab6c8d2d4 BOOLEAN;
  p_ViewCellTemplate_0a8ab6c8d2d4 TEXT;
  p_DefaultColumnWidth_0a8ab6c8d2d4 INTEGER;
  p_AllowUpdateAPI_0a8ab6c8d2d4 BOOLEAN;
  p_AllowUpdateInView_0a8ab6c8d2d4 BOOLEAN;
  p_IncludeInUserSearchAPI_0a8ab6c8d2d4 BOOLEAN;
  p_FullTextSearchEnabled_0a8ab6c8d2d4 BOOLEAN;
  p_UserSearchParamFormatAPI_0a8ab6c8d2d4 VARCHAR(500);
  p_IncludeInGeneratedForm_0a8ab6c8d2d4 BOOLEAN;
  p_GeneratedFormSection_0a8ab6c8d2d4 VARCHAR(10);
  p_IsNameField_0a8ab6c8d2d4 BOOLEAN;
  p_RelatedEntityID_0a8ab6c8d2d4 UUID;
  p_RelatedEntityFieldName_0a8ab6c8d2d4 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_0a8ab6c8d2d4 BOOLEAN;
  p_RelatedEntityNameFieldMap_0a8ab6c8d2d4 VARCHAR(255);
  p_RelatedEntityDisplayType_0a8ab6c8d2d4 VARCHAR(20);
  p_EntityIDFieldName_0a8ab6c8d2d4 VARCHAR(100);
  p_ScopeDefault_0a8ab6c8d2d4 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_0a8ab6c8d2d4 BOOLEAN;
  p_ValuesToPackWithSchema_0a8ab6c8d2d4 VARCHAR(10);
  p_Status_0a8ab6c8d2d4 VARCHAR(25);
  p_AutoUpdateIsNameField_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateDefaultInView_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateCategory_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateDisplayName_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_0a8ab6c8d2d4 BOOLEAN;
  p_Encrypt_0a8ab6c8d2d4 BOOLEAN;
  p_EncryptionKeyID_0a8ab6c8d2d4 UUID;
  p_AllowDecryptInAPI_0a8ab6c8d2d4 BOOLEAN;
  p_SendEncryptedValue_0a8ab6c8d2d4 BOOLEAN;
  p_IsSoftPrimaryKey_0a8ab6c8d2d4 BOOLEAN;
  p_IsSoftForeignKey_0a8ab6c8d2d4 BOOLEAN;
  p_RelatedEntityJoinFields_0a8ab6c8d2d4 TEXT;
  p_JSONType_0a8ab6c8d2d4 VARCHAR(255);
  p_JSONTypeIsArray_0a8ab6c8d2d4 BOOLEAN;
  p_JSONTypeDefinition_0a8ab6c8d2d4 TEXT;
  p_UserSearchPredicateAPI_0a8ab6c8d2d4 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateFullTextSearch_0a8ab6c8d2d4 BOOLEAN;
  p_AutoUpdateExtendedType_0a8ab6c8d2d4 BOOLEAN;
  p_IsComputed_0a8ab6c8d2d4 BOOLEAN;
  p_EmbeddedRecord_0a8ab6c8d2d4 TEXT;
  p_Configuration_0a8ab6c8d2d4 TEXT;
  p_ID_0a8ab6c8d2d4 UUID;
BEGIN
  p_DisplayName_0a8ab6c8d2d4 := 'Updated At';
  p_AutoUpdateDescription_0a8ab6c8d2d4 := TRUE;
  p_IsPrimaryKey_0a8ab6c8d2d4 := FALSE;
  p_IsUnique_0a8ab6c8d2d4 := FALSE;
  p_Category_0a8ab6c8d2d4 := 'System Metadata';
  p_ValueListType_0a8ab6c8d2d4 := 'None';
  p_DefaultInView_0a8ab6c8d2d4 := FALSE;
  p_DefaultColumnWidth_0a8ab6c8d2d4 := 100;
  p_AllowUpdateAPI_0a8ab6c8d2d4 := FALSE;
  p_AllowUpdateInView_0a8ab6c8d2d4 := TRUE;
  p_IncludeInUserSearchAPI_0a8ab6c8d2d4 := FALSE;
  p_FullTextSearchEnabled_0a8ab6c8d2d4 := FALSE;
  p_IncludeInGeneratedForm_0a8ab6c8d2d4 := TRUE;
  p_GeneratedFormSection_0a8ab6c8d2d4 := 'Category';
  p_IsNameField_0a8ab6c8d2d4 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_0a8ab6c8d2d4 := FALSE;
  p_RelatedEntityDisplayType_0a8ab6c8d2d4 := 'Search';
  p_AutoUpdateRelatedEntityInfo_0a8ab6c8d2d4 := TRUE;
  p_ValuesToPackWithSchema_0a8ab6c8d2d4 := 'Auto';
  p_Status_0a8ab6c8d2d4 := 'Active';
  p_AutoUpdateIsNameField_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateDefaultInView_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateCategory_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateDisplayName_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_0a8ab6c8d2d4 := TRUE;
  p_Encrypt_0a8ab6c8d2d4 := FALSE;
  p_AllowDecryptInAPI_0a8ab6c8d2d4 := FALSE;
  p_SendEncryptedValue_0a8ab6c8d2d4 := FALSE;
  p_IsSoftPrimaryKey_0a8ab6c8d2d4 := FALSE;
  p_IsSoftForeignKey_0a8ab6c8d2d4 := FALSE;
  p_JSONTypeIsArray_0a8ab6c8d2d4 := FALSE;
  p_UserSearchPredicateAPI_0a8ab6c8d2d4 := 'Contains';
  p_AutoUpdateUserSearchPredicate_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateFullTextSearch_0a8ab6c8d2d4 := TRUE;
  p_AutoUpdateExtendedType_0a8ab6c8d2d4 := TRUE;
  p_IsComputed_0a8ab6c8d2d4 := FALSE;
  p_ID_0a8ab6c8d2d4 := '6DF1A3E7-64A4-47EE-8A4E-C4491A2BA013';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_0a8ab6c8d2d4,
    'Description', p_Description_0a8ab6c8d2d4,
    'AutoUpdateDescription', p_AutoUpdateDescription_0a8ab6c8d2d4,
    'IsPrimaryKey', p_IsPrimaryKey_0a8ab6c8d2d4,
    'IsUnique', p_IsUnique_0a8ab6c8d2d4,
    'Category', p_Category_0a8ab6c8d2d4,
    'ValueListType', p_ValueListType_0a8ab6c8d2d4,
    'ExtendedType', p_ExtendedType_0a8ab6c8d2d4,
    'CodeType', p_CodeType_0a8ab6c8d2d4,
    'DefaultInView', p_DefaultInView_0a8ab6c8d2d4,
    'ViewCellTemplate', p_ViewCellTemplate_0a8ab6c8d2d4,
    'DefaultColumnWidth', p_DefaultColumnWidth_0a8ab6c8d2d4,
    'AllowUpdateAPI', p_AllowUpdateAPI_0a8ab6c8d2d4,
    'AllowUpdateInView', p_AllowUpdateInView_0a8ab6c8d2d4,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_0a8ab6c8d2d4,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_0a8ab6c8d2d4,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_0a8ab6c8d2d4,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_0a8ab6c8d2d4,
    'GeneratedFormSection', p_GeneratedFormSection_0a8ab6c8d2d4,
    'IsNameField', p_IsNameField_0a8ab6c8d2d4,
    'RelatedEntityID', p_RelatedEntityID_0a8ab6c8d2d4,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_0a8ab6c8d2d4,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_0a8ab6c8d2d4,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_0a8ab6c8d2d4,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_0a8ab6c8d2d4,
    'EntityIDFieldName', p_EntityIDFieldName_0a8ab6c8d2d4,
    'ScopeDefault', p_ScopeDefault_0a8ab6c8d2d4,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_0a8ab6c8d2d4,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_0a8ab6c8d2d4,
    'Status', p_Status_0a8ab6c8d2d4,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_0a8ab6c8d2d4,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_0a8ab6c8d2d4,
    'AutoUpdateCategory', p_AutoUpdateCategory_0a8ab6c8d2d4,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_0a8ab6c8d2d4,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_0a8ab6c8d2d4,
    'Encrypt', p_Encrypt_0a8ab6c8d2d4,
    'EncryptionKeyID', p_EncryptionKeyID_0a8ab6c8d2d4,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_0a8ab6c8d2d4,
    'SendEncryptedValue', p_SendEncryptedValue_0a8ab6c8d2d4,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_0a8ab6c8d2d4,
    'IsSoftForeignKey', p_IsSoftForeignKey_0a8ab6c8d2d4,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_0a8ab6c8d2d4,
    'JSONType', p_JSONType_0a8ab6c8d2d4,
    'JSONTypeIsArray', p_JSONTypeIsArray_0a8ab6c8d2d4,
    'JSONTypeDefinition', p_JSONTypeDefinition_0a8ab6c8d2d4,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_0a8ab6c8d2d4,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_0a8ab6c8d2d4,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_0a8ab6c8d2d4,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_0a8ab6c8d2d4,
    'IsComputed', p_IsComputed_0a8ab6c8d2d4
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_0a8ab6c8d2d4,
    'Configuration', p_Configuration_0a8ab6c8d2d4,
    'ID', p_ID_0a8ab6c8d2d4
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_0a8ab6c8d2d4, p_Description := p_Description_0a8ab6c8d2d4, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_0a8ab6c8d2d4, p_IsPrimaryKey := p_IsPrimaryKey_0a8ab6c8d2d4, p_IsUnique := p_IsUnique_0a8ab6c8d2d4, p_Category := p_Category_0a8ab6c8d2d4, p_ValueListType := p_ValueListType_0a8ab6c8d2d4, p_ExtendedType := p_ExtendedType_0a8ab6c8d2d4, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_0a8ab6c8d2d4, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_0a8ab6c8d2d4, p_ViewCellTemplate := p_ViewCellTemplate_0a8ab6c8d2d4, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_0a8ab6c8d2d4, p_AllowUpdateAPI := p_AllowUpdateAPI_0a8ab6c8d2d4, p_AllowUpdateInView := p_AllowUpdateInView_0a8ab6c8d2d4, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_0a8ab6c8d2d4, p_FullTextSearchEnabled := p_FullTextSearchEnabled_0a8ab6c8d2d4, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_0a8ab6c8d2d4, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_0a8ab6c8d2d4, p_GeneratedFormSection := p_GeneratedFormSection_0a8ab6c8d2d4, p_IsNameField := p_IsNameField_0a8ab6c8d2d4, p_RelatedEntityID := p_RelatedEntityID_0a8ab6c8d2d4, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_0a8ab6c8d2d4, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_0a8ab6c8d2d4, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_0a8ab6c8d2d4, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_0a8ab6c8d2d4, p_EntityIDFieldName := p_EntityIDFieldName_0a8ab6c8d2d4, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_0a8ab6c8d2d4, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_0a8ab6c8d2d4, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_0a8ab6c8d2d4, p_Status := p_Status_0a8ab6c8d2d4, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_0a8ab6c8d2d4, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_0a8ab6c8d2d4, p_AutoUpdateCategory := p_AutoUpdateCategory_0a8ab6c8d2d4, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_0a8ab6c8d2d4, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_0a8ab6c8d2d4, p_Encrypt := p_Encrypt_0a8ab6c8d2d4, p_EncryptionKeyID := p_EncryptionKeyID_0a8ab6c8d2d4, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_0a8ab6c8d2d4, p_SendEncryptedValue := p_SendEncryptedValue_0a8ab6c8d2d4, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_0a8ab6c8d2d4, p_IsSoftForeignKey := p_IsSoftForeignKey_0a8ab6c8d2d4, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_0a8ab6c8d2d4, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_0a8ab6c8d2d4, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_0a8ab6c8d2d4, p_JSONTypeDefinition := p_JSONTypeDefinition_0a8ab6c8d2d4, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_0a8ab6c8d2d4, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_0a8ab6c8d2d4, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_0a8ab6c8d2d4, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_0a8ab6c8d2d4, p_IsComputed := p_IsComputed_0a8ab6c8d2d4, p_EmbeddedRecord := p_EmbeddedRecord_0a8ab6c8d2d4, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_0a8ab6c8d2d4, p_Configuration_Clear := TRUE, p_ID := p_ID_0a8ab6c8d2d4);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_ccf5569a16ab VARCHAR(255);
  p_Description_ccf5569a16ab TEXT;
  p_AutoUpdateDescription_ccf5569a16ab BOOLEAN;
  p_IsPrimaryKey_ccf5569a16ab BOOLEAN;
  p_IsUnique_ccf5569a16ab BOOLEAN;
  p_Category_ccf5569a16ab VARCHAR(255);
  p_ValueListType_ccf5569a16ab VARCHAR(20);
  p_ExtendedType_ccf5569a16ab VARCHAR(50);
  p_CodeType_ccf5569a16ab VARCHAR(50);
  p_DefaultInView_ccf5569a16ab BOOLEAN;
  p_ViewCellTemplate_ccf5569a16ab TEXT;
  p_DefaultColumnWidth_ccf5569a16ab INTEGER;
  p_AllowUpdateAPI_ccf5569a16ab BOOLEAN;
  p_AllowUpdateInView_ccf5569a16ab BOOLEAN;
  p_IncludeInUserSearchAPI_ccf5569a16ab BOOLEAN;
  p_FullTextSearchEnabled_ccf5569a16ab BOOLEAN;
  p_UserSearchParamFormatAPI_ccf5569a16ab VARCHAR(500);
  p_IncludeInGeneratedForm_ccf5569a16ab BOOLEAN;
  p_GeneratedFormSection_ccf5569a16ab VARCHAR(10);
  p_IsNameField_ccf5569a16ab BOOLEAN;
  p_RelatedEntityID_ccf5569a16ab UUID;
  p_RelatedEntityFieldName_ccf5569a16ab VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_ccf5569a16ab BOOLEAN;
  p_RelatedEntityNameFieldMap_ccf5569a16ab VARCHAR(255);
  p_RelatedEntityDisplayType_ccf5569a16ab VARCHAR(20);
  p_EntityIDFieldName_ccf5569a16ab VARCHAR(100);
  p_ScopeDefault_ccf5569a16ab VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_ccf5569a16ab BOOLEAN;
  p_ValuesToPackWithSchema_ccf5569a16ab VARCHAR(10);
  p_Status_ccf5569a16ab VARCHAR(25);
  p_AutoUpdateIsNameField_ccf5569a16ab BOOLEAN;
  p_AutoUpdateDefaultInView_ccf5569a16ab BOOLEAN;
  p_AutoUpdateCategory_ccf5569a16ab BOOLEAN;
  p_AutoUpdateDisplayName_ccf5569a16ab BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_ccf5569a16ab BOOLEAN;
  p_Encrypt_ccf5569a16ab BOOLEAN;
  p_EncryptionKeyID_ccf5569a16ab UUID;
  p_AllowDecryptInAPI_ccf5569a16ab BOOLEAN;
  p_SendEncryptedValue_ccf5569a16ab BOOLEAN;
  p_IsSoftPrimaryKey_ccf5569a16ab BOOLEAN;
  p_IsSoftForeignKey_ccf5569a16ab BOOLEAN;
  p_RelatedEntityJoinFields_ccf5569a16ab TEXT;
  p_JSONType_ccf5569a16ab VARCHAR(255);
  p_JSONTypeIsArray_ccf5569a16ab BOOLEAN;
  p_JSONTypeDefinition_ccf5569a16ab TEXT;
  p_UserSearchPredicateAPI_ccf5569a16ab VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_ccf5569a16ab BOOLEAN;
  p_AutoUpdateFullTextSearch_ccf5569a16ab BOOLEAN;
  p_AutoUpdateExtendedType_ccf5569a16ab BOOLEAN;
  p_IsComputed_ccf5569a16ab BOOLEAN;
  p_EmbeddedRecord_ccf5569a16ab TEXT;
  p_Configuration_ccf5569a16ab TEXT;
  p_ID_ccf5569a16ab UUID;
BEGIN
  p_DisplayName_ccf5569a16ab := 'IP Country';
  p_Description_ccf5569a16ab := 'ISO 3166-1 alpha-2 country of the buyer''s IP address at self-serve checkout, read from the country header the proxy or CDN in front of the server sets. VAT location evidence alongside the billing address. The IP address itself is never stored. NULL when the order did not come through self-serve checkout, when no country header is configured, or when the country could not be resolved.';
  p_AutoUpdateDescription_ccf5569a16ab := TRUE;
  p_IsPrimaryKey_ccf5569a16ab := FALSE;
  p_IsUnique_ccf5569a16ab := FALSE;
  p_Category_ccf5569a16ab := 'Billing and Shipping';
  p_ValueListType_ccf5569a16ab := 'None';
  p_ExtendedType_ccf5569a16ab := 'GeoCountry';
  p_DefaultInView_ccf5569a16ab := FALSE;
  p_DefaultColumnWidth_ccf5569a16ab := 150;
  p_AllowUpdateAPI_ccf5569a16ab := TRUE;
  p_AllowUpdateInView_ccf5569a16ab := TRUE;
  p_IncludeInUserSearchAPI_ccf5569a16ab := FALSE;
  p_FullTextSearchEnabled_ccf5569a16ab := FALSE;
  p_IncludeInGeneratedForm_ccf5569a16ab := TRUE;
  p_GeneratedFormSection_ccf5569a16ab := 'Category';
  p_IsNameField_ccf5569a16ab := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_ccf5569a16ab := FALSE;
  p_RelatedEntityDisplayType_ccf5569a16ab := 'Search';
  p_AutoUpdateRelatedEntityInfo_ccf5569a16ab := TRUE;
  p_ValuesToPackWithSchema_ccf5569a16ab := 'Auto';
  p_Status_ccf5569a16ab := 'Active';
  p_AutoUpdateIsNameField_ccf5569a16ab := TRUE;
  p_AutoUpdateDefaultInView_ccf5569a16ab := TRUE;
  p_AutoUpdateCategory_ccf5569a16ab := TRUE;
  p_AutoUpdateDisplayName_ccf5569a16ab := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_ccf5569a16ab := TRUE;
  p_Encrypt_ccf5569a16ab := FALSE;
  p_AllowDecryptInAPI_ccf5569a16ab := FALSE;
  p_SendEncryptedValue_ccf5569a16ab := FALSE;
  p_IsSoftPrimaryKey_ccf5569a16ab := FALSE;
  p_IsSoftForeignKey_ccf5569a16ab := FALSE;
  p_JSONTypeIsArray_ccf5569a16ab := FALSE;
  p_UserSearchPredicateAPI_ccf5569a16ab := 'Contains';
  p_AutoUpdateUserSearchPredicate_ccf5569a16ab := TRUE;
  p_AutoUpdateFullTextSearch_ccf5569a16ab := TRUE;
  p_AutoUpdateExtendedType_ccf5569a16ab := TRUE;
  p_IsComputed_ccf5569a16ab := FALSE;
  p_ID_ccf5569a16ab := 'B943953A-7718-40D4-BFBB-FD00F0F220F8';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_ccf5569a16ab,
    'Description', p_Description_ccf5569a16ab,
    'AutoUpdateDescription', p_AutoUpdateDescription_ccf5569a16ab,
    'IsPrimaryKey', p_IsPrimaryKey_ccf5569a16ab,
    'IsUnique', p_IsUnique_ccf5569a16ab,
    'Category', p_Category_ccf5569a16ab,
    'ValueListType', p_ValueListType_ccf5569a16ab,
    'ExtendedType', p_ExtendedType_ccf5569a16ab,
    'CodeType', p_CodeType_ccf5569a16ab,
    'DefaultInView', p_DefaultInView_ccf5569a16ab,
    'ViewCellTemplate', p_ViewCellTemplate_ccf5569a16ab,
    'DefaultColumnWidth', p_DefaultColumnWidth_ccf5569a16ab,
    'AllowUpdateAPI', p_AllowUpdateAPI_ccf5569a16ab,
    'AllowUpdateInView', p_AllowUpdateInView_ccf5569a16ab,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_ccf5569a16ab,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_ccf5569a16ab,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_ccf5569a16ab,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_ccf5569a16ab,
    'GeneratedFormSection', p_GeneratedFormSection_ccf5569a16ab,
    'IsNameField', p_IsNameField_ccf5569a16ab,
    'RelatedEntityID', p_RelatedEntityID_ccf5569a16ab,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_ccf5569a16ab,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_ccf5569a16ab,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_ccf5569a16ab,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_ccf5569a16ab,
    'EntityIDFieldName', p_EntityIDFieldName_ccf5569a16ab,
    'ScopeDefault', p_ScopeDefault_ccf5569a16ab,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_ccf5569a16ab,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_ccf5569a16ab,
    'Status', p_Status_ccf5569a16ab,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_ccf5569a16ab,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_ccf5569a16ab,
    'AutoUpdateCategory', p_AutoUpdateCategory_ccf5569a16ab,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_ccf5569a16ab,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_ccf5569a16ab,
    'Encrypt', p_Encrypt_ccf5569a16ab,
    'EncryptionKeyID', p_EncryptionKeyID_ccf5569a16ab,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_ccf5569a16ab,
    'SendEncryptedValue', p_SendEncryptedValue_ccf5569a16ab,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_ccf5569a16ab,
    'IsSoftForeignKey', p_IsSoftForeignKey_ccf5569a16ab,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_ccf5569a16ab,
    'JSONType', p_JSONType_ccf5569a16ab,
    'JSONTypeIsArray', p_JSONTypeIsArray_ccf5569a16ab,
    'JSONTypeDefinition', p_JSONTypeDefinition_ccf5569a16ab,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_ccf5569a16ab,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_ccf5569a16ab,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_ccf5569a16ab,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_ccf5569a16ab,
    'IsComputed', p_IsComputed_ccf5569a16ab
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_ccf5569a16ab,
    'Configuration', p_Configuration_ccf5569a16ab,
    'ID', p_ID_ccf5569a16ab
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_ccf5569a16ab, p_Description := p_Description_ccf5569a16ab, p_AutoUpdateDescription := p_AutoUpdateDescription_ccf5569a16ab, p_IsPrimaryKey := p_IsPrimaryKey_ccf5569a16ab, p_IsUnique := p_IsUnique_ccf5569a16ab, p_Category := p_Category_ccf5569a16ab, p_ValueListType := p_ValueListType_ccf5569a16ab, p_ExtendedType := p_ExtendedType_ccf5569a16ab, p_CodeType := p_CodeType_ccf5569a16ab, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_ccf5569a16ab, p_ViewCellTemplate := p_ViewCellTemplate_ccf5569a16ab, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_ccf5569a16ab, p_AllowUpdateAPI := p_AllowUpdateAPI_ccf5569a16ab, p_AllowUpdateInView := p_AllowUpdateInView_ccf5569a16ab, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_ccf5569a16ab, p_FullTextSearchEnabled := p_FullTextSearchEnabled_ccf5569a16ab, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_ccf5569a16ab, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_ccf5569a16ab, p_GeneratedFormSection := p_GeneratedFormSection_ccf5569a16ab, p_IsNameField := p_IsNameField_ccf5569a16ab, p_RelatedEntityID := p_RelatedEntityID_ccf5569a16ab, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_ccf5569a16ab, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_ccf5569a16ab, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_ccf5569a16ab, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_ccf5569a16ab, p_EntityIDFieldName := p_EntityIDFieldName_ccf5569a16ab, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_ccf5569a16ab, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_ccf5569a16ab, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_ccf5569a16ab, p_Status := p_Status_ccf5569a16ab, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_ccf5569a16ab, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_ccf5569a16ab, p_AutoUpdateCategory := p_AutoUpdateCategory_ccf5569a16ab, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_ccf5569a16ab, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_ccf5569a16ab, p_Encrypt := p_Encrypt_ccf5569a16ab, p_EncryptionKeyID := p_EncryptionKeyID_ccf5569a16ab, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_ccf5569a16ab, p_SendEncryptedValue := p_SendEncryptedValue_ccf5569a16ab, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_ccf5569a16ab, p_IsSoftForeignKey := p_IsSoftForeignKey_ccf5569a16ab, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_ccf5569a16ab, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_ccf5569a16ab, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_ccf5569a16ab, p_JSONTypeDefinition := p_JSONTypeDefinition_ccf5569a16ab, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_ccf5569a16ab, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_ccf5569a16ab, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_ccf5569a16ab, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_ccf5569a16ab, p_IsComputed := p_IsComputed_ccf5569a16ab, p_EmbeddedRecord := p_EmbeddedRecord_ccf5569a16ab, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_ccf5569a16ab, p_Configuration_Clear := TRUE, p_ID := p_ID_ccf5569a16ab);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_4680601ea65e VARCHAR(255);
  p_Description_4680601ea65e TEXT;
  p_AutoUpdateDescription_4680601ea65e BOOLEAN;
  p_IsPrimaryKey_4680601ea65e BOOLEAN;
  p_IsUnique_4680601ea65e BOOLEAN;
  p_Category_4680601ea65e VARCHAR(255);
  p_ValueListType_4680601ea65e VARCHAR(20);
  p_ExtendedType_4680601ea65e VARCHAR(50);
  p_CodeType_4680601ea65e VARCHAR(50);
  p_DefaultInView_4680601ea65e BOOLEAN;
  p_ViewCellTemplate_4680601ea65e TEXT;
  p_DefaultColumnWidth_4680601ea65e INTEGER;
  p_AllowUpdateAPI_4680601ea65e BOOLEAN;
  p_AllowUpdateInView_4680601ea65e BOOLEAN;
  p_IncludeInUserSearchAPI_4680601ea65e BOOLEAN;
  p_FullTextSearchEnabled_4680601ea65e BOOLEAN;
  p_UserSearchParamFormatAPI_4680601ea65e VARCHAR(500);
  p_IncludeInGeneratedForm_4680601ea65e BOOLEAN;
  p_GeneratedFormSection_4680601ea65e VARCHAR(10);
  p_IsNameField_4680601ea65e BOOLEAN;
  p_RelatedEntityID_4680601ea65e UUID;
  p_RelatedEntityFieldName_4680601ea65e VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_4680601ea65e BOOLEAN;
  p_RelatedEntityNameFieldMap_4680601ea65e VARCHAR(255);
  p_RelatedEntityDisplayType_4680601ea65e VARCHAR(20);
  p_EntityIDFieldName_4680601ea65e VARCHAR(100);
  p_ScopeDefault_4680601ea65e VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_4680601ea65e BOOLEAN;
  p_ValuesToPackWithSchema_4680601ea65e VARCHAR(10);
  p_Status_4680601ea65e VARCHAR(25);
  p_AutoUpdateIsNameField_4680601ea65e BOOLEAN;
  p_AutoUpdateDefaultInView_4680601ea65e BOOLEAN;
  p_AutoUpdateCategory_4680601ea65e BOOLEAN;
  p_AutoUpdateDisplayName_4680601ea65e BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_4680601ea65e BOOLEAN;
  p_Encrypt_4680601ea65e BOOLEAN;
  p_EncryptionKeyID_4680601ea65e UUID;
  p_AllowDecryptInAPI_4680601ea65e BOOLEAN;
  p_SendEncryptedValue_4680601ea65e BOOLEAN;
  p_IsSoftPrimaryKey_4680601ea65e BOOLEAN;
  p_IsSoftForeignKey_4680601ea65e BOOLEAN;
  p_RelatedEntityJoinFields_4680601ea65e TEXT;
  p_JSONType_4680601ea65e VARCHAR(255);
  p_JSONTypeIsArray_4680601ea65e BOOLEAN;
  p_JSONTypeDefinition_4680601ea65e TEXT;
  p_UserSearchPredicateAPI_4680601ea65e VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_4680601ea65e BOOLEAN;
  p_AutoUpdateFullTextSearch_4680601ea65e BOOLEAN;
  p_AutoUpdateExtendedType_4680601ea65e BOOLEAN;
  p_IsComputed_4680601ea65e BOOLEAN;
  p_EmbeddedRecord_4680601ea65e TEXT;
  p_Configuration_4680601ea65e TEXT;
  p_ID_4680601ea65e UUID;
BEGIN
  p_DisplayName_4680601ea65e := 'Card Issuing Country';
  p_Description_4680601ea65e := 'ISO 3166-1 alpha-2 country of the issuer of the card that paid at self-serve checkout, as the payment gateway reports it. VAT location evidence alongside the billing address. NULL when the order was not paid by card through self-serve checkout, or when the gateway did not report a country.';
  p_AutoUpdateDescription_4680601ea65e := TRUE;
  p_IsPrimaryKey_4680601ea65e := FALSE;
  p_IsUnique_4680601ea65e := FALSE;
  p_Category_4680601ea65e := 'Billing and Shipping';
  p_ValueListType_4680601ea65e := 'None';
  p_ExtendedType_4680601ea65e := 'GeoCountry';
  p_DefaultInView_4680601ea65e := FALSE;
  p_DefaultColumnWidth_4680601ea65e := 150;
  p_AllowUpdateAPI_4680601ea65e := TRUE;
  p_AllowUpdateInView_4680601ea65e := TRUE;
  p_IncludeInUserSearchAPI_4680601ea65e := FALSE;
  p_FullTextSearchEnabled_4680601ea65e := FALSE;
  p_IncludeInGeneratedForm_4680601ea65e := TRUE;
  p_GeneratedFormSection_4680601ea65e := 'Category';
  p_IsNameField_4680601ea65e := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_4680601ea65e := FALSE;
  p_RelatedEntityDisplayType_4680601ea65e := 'Search';
  p_AutoUpdateRelatedEntityInfo_4680601ea65e := TRUE;
  p_ValuesToPackWithSchema_4680601ea65e := 'Auto';
  p_Status_4680601ea65e := 'Active';
  p_AutoUpdateIsNameField_4680601ea65e := TRUE;
  p_AutoUpdateDefaultInView_4680601ea65e := TRUE;
  p_AutoUpdateCategory_4680601ea65e := TRUE;
  p_AutoUpdateDisplayName_4680601ea65e := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_4680601ea65e := TRUE;
  p_Encrypt_4680601ea65e := FALSE;
  p_AllowDecryptInAPI_4680601ea65e := FALSE;
  p_SendEncryptedValue_4680601ea65e := FALSE;
  p_IsSoftPrimaryKey_4680601ea65e := FALSE;
  p_IsSoftForeignKey_4680601ea65e := FALSE;
  p_JSONTypeIsArray_4680601ea65e := FALSE;
  p_UserSearchPredicateAPI_4680601ea65e := 'Contains';
  p_AutoUpdateUserSearchPredicate_4680601ea65e := TRUE;
  p_AutoUpdateFullTextSearch_4680601ea65e := TRUE;
  p_AutoUpdateExtendedType_4680601ea65e := TRUE;
  p_IsComputed_4680601ea65e := FALSE;
  p_ID_4680601ea65e := '1F88B4F6-AA95-414E-BD1C-11E87BE33284';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_4680601ea65e,
    'Description', p_Description_4680601ea65e,
    'AutoUpdateDescription', p_AutoUpdateDescription_4680601ea65e,
    'IsPrimaryKey', p_IsPrimaryKey_4680601ea65e,
    'IsUnique', p_IsUnique_4680601ea65e,
    'Category', p_Category_4680601ea65e,
    'ValueListType', p_ValueListType_4680601ea65e,
    'ExtendedType', p_ExtendedType_4680601ea65e,
    'CodeType', p_CodeType_4680601ea65e,
    'DefaultInView', p_DefaultInView_4680601ea65e,
    'ViewCellTemplate', p_ViewCellTemplate_4680601ea65e,
    'DefaultColumnWidth', p_DefaultColumnWidth_4680601ea65e,
    'AllowUpdateAPI', p_AllowUpdateAPI_4680601ea65e,
    'AllowUpdateInView', p_AllowUpdateInView_4680601ea65e,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_4680601ea65e,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_4680601ea65e,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_4680601ea65e,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_4680601ea65e,
    'GeneratedFormSection', p_GeneratedFormSection_4680601ea65e,
    'IsNameField', p_IsNameField_4680601ea65e,
    'RelatedEntityID', p_RelatedEntityID_4680601ea65e,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_4680601ea65e,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_4680601ea65e,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_4680601ea65e,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_4680601ea65e,
    'EntityIDFieldName', p_EntityIDFieldName_4680601ea65e,
    'ScopeDefault', p_ScopeDefault_4680601ea65e,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_4680601ea65e,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_4680601ea65e,
    'Status', p_Status_4680601ea65e,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_4680601ea65e,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_4680601ea65e,
    'AutoUpdateCategory', p_AutoUpdateCategory_4680601ea65e,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_4680601ea65e,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_4680601ea65e,
    'Encrypt', p_Encrypt_4680601ea65e,
    'EncryptionKeyID', p_EncryptionKeyID_4680601ea65e,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_4680601ea65e,
    'SendEncryptedValue', p_SendEncryptedValue_4680601ea65e,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_4680601ea65e,
    'IsSoftForeignKey', p_IsSoftForeignKey_4680601ea65e,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_4680601ea65e,
    'JSONType', p_JSONType_4680601ea65e,
    'JSONTypeIsArray', p_JSONTypeIsArray_4680601ea65e,
    'JSONTypeDefinition', p_JSONTypeDefinition_4680601ea65e,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_4680601ea65e,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_4680601ea65e,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_4680601ea65e,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_4680601ea65e,
    'IsComputed', p_IsComputed_4680601ea65e
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_4680601ea65e,
    'Configuration', p_Configuration_4680601ea65e,
    'ID', p_ID_4680601ea65e
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_4680601ea65e, p_Description := p_Description_4680601ea65e, p_AutoUpdateDescription := p_AutoUpdateDescription_4680601ea65e, p_IsPrimaryKey := p_IsPrimaryKey_4680601ea65e, p_IsUnique := p_IsUnique_4680601ea65e, p_Category := p_Category_4680601ea65e, p_ValueListType := p_ValueListType_4680601ea65e, p_ExtendedType := p_ExtendedType_4680601ea65e, p_CodeType := p_CodeType_4680601ea65e, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_4680601ea65e, p_ViewCellTemplate := p_ViewCellTemplate_4680601ea65e, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_4680601ea65e, p_AllowUpdateAPI := p_AllowUpdateAPI_4680601ea65e, p_AllowUpdateInView := p_AllowUpdateInView_4680601ea65e, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_4680601ea65e, p_FullTextSearchEnabled := p_FullTextSearchEnabled_4680601ea65e, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_4680601ea65e, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_4680601ea65e, p_GeneratedFormSection := p_GeneratedFormSection_4680601ea65e, p_IsNameField := p_IsNameField_4680601ea65e, p_RelatedEntityID := p_RelatedEntityID_4680601ea65e, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_4680601ea65e, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_4680601ea65e, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_4680601ea65e, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_4680601ea65e, p_EntityIDFieldName := p_EntityIDFieldName_4680601ea65e, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_4680601ea65e, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_4680601ea65e, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_4680601ea65e, p_Status := p_Status_4680601ea65e, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_4680601ea65e, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_4680601ea65e, p_AutoUpdateCategory := p_AutoUpdateCategory_4680601ea65e, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_4680601ea65e, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_4680601ea65e, p_Encrypt := p_Encrypt_4680601ea65e, p_EncryptionKeyID := p_EncryptionKeyID_4680601ea65e, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_4680601ea65e, p_SendEncryptedValue := p_SendEncryptedValue_4680601ea65e, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_4680601ea65e, p_IsSoftForeignKey := p_IsSoftForeignKey_4680601ea65e, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_4680601ea65e, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_4680601ea65e, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_4680601ea65e, p_JSONTypeDefinition := p_JSONTypeDefinition_4680601ea65e, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_4680601ea65e, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_4680601ea65e, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_4680601ea65e, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_4680601ea65e, p_IsComputed := p_IsComputed_4680601ea65e, p_EmbeddedRecord := p_EmbeddedRecord_4680601ea65e, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_4680601ea65e, p_Configuration_Clear := TRUE, p_ID := p_ID_4680601ea65e);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_f4cc4fb856d8 VARCHAR(255);
  p_Description_f4cc4fb856d8 TEXT;
  p_AutoUpdateDescription_f4cc4fb856d8 BOOLEAN;
  p_IsPrimaryKey_f4cc4fb856d8 BOOLEAN;
  p_IsUnique_f4cc4fb856d8 BOOLEAN;
  p_Category_f4cc4fb856d8 VARCHAR(255);
  p_ValueListType_f4cc4fb856d8 VARCHAR(20);
  p_ExtendedType_f4cc4fb856d8 VARCHAR(50);
  p_CodeType_f4cc4fb856d8 VARCHAR(50);
  p_DefaultInView_f4cc4fb856d8 BOOLEAN;
  p_ViewCellTemplate_f4cc4fb856d8 TEXT;
  p_DefaultColumnWidth_f4cc4fb856d8 INTEGER;
  p_AllowUpdateAPI_f4cc4fb856d8 BOOLEAN;
  p_AllowUpdateInView_f4cc4fb856d8 BOOLEAN;
  p_IncludeInUserSearchAPI_f4cc4fb856d8 BOOLEAN;
  p_FullTextSearchEnabled_f4cc4fb856d8 BOOLEAN;
  p_UserSearchParamFormatAPI_f4cc4fb856d8 VARCHAR(500);
  p_IncludeInGeneratedForm_f4cc4fb856d8 BOOLEAN;
  p_GeneratedFormSection_f4cc4fb856d8 VARCHAR(10);
  p_IsNameField_f4cc4fb856d8 BOOLEAN;
  p_RelatedEntityID_f4cc4fb856d8 UUID;
  p_RelatedEntityFieldName_f4cc4fb856d8 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_f4cc4fb856d8 BOOLEAN;
  p_RelatedEntityNameFieldMap_f4cc4fb856d8 VARCHAR(255);
  p_RelatedEntityDisplayType_f4cc4fb856d8 VARCHAR(20);
  p_EntityIDFieldName_f4cc4fb856d8 VARCHAR(100);
  p_ScopeDefault_f4cc4fb856d8 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_f4cc4fb856d8 BOOLEAN;
  p_ValuesToPackWithSchema_f4cc4fb856d8 VARCHAR(10);
  p_Status_f4cc4fb856d8 VARCHAR(25);
  p_AutoUpdateIsNameField_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateDefaultInView_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateCategory_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateDisplayName_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_f4cc4fb856d8 BOOLEAN;
  p_Encrypt_f4cc4fb856d8 BOOLEAN;
  p_EncryptionKeyID_f4cc4fb856d8 UUID;
  p_AllowDecryptInAPI_f4cc4fb856d8 BOOLEAN;
  p_SendEncryptedValue_f4cc4fb856d8 BOOLEAN;
  p_IsSoftPrimaryKey_f4cc4fb856d8 BOOLEAN;
  p_IsSoftForeignKey_f4cc4fb856d8 BOOLEAN;
  p_RelatedEntityJoinFields_f4cc4fb856d8 TEXT;
  p_JSONType_f4cc4fb856d8 VARCHAR(255);
  p_JSONTypeIsArray_f4cc4fb856d8 BOOLEAN;
  p_JSONTypeDefinition_f4cc4fb856d8 TEXT;
  p_UserSearchPredicateAPI_f4cc4fb856d8 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateFullTextSearch_f4cc4fb856d8 BOOLEAN;
  p_AutoUpdateExtendedType_f4cc4fb856d8 BOOLEAN;
  p_IsComputed_f4cc4fb856d8 BOOLEAN;
  p_EmbeddedRecord_f4cc4fb856d8 TEXT;
  p_Configuration_f4cc4fb856d8 TEXT;
  p_ID_f4cc4fb856d8 UUID;
BEGIN
  p_DisplayName_f4cc4fb856d8 := 'Source Checkout Widget';
  p_AutoUpdateDescription_f4cc4fb856d8 := TRUE;
  p_IsPrimaryKey_f4cc4fb856d8 := FALSE;
  p_IsUnique_f4cc4fb856d8 := FALSE;
  p_Category_f4cc4fb856d8 := 'Order Identification';
  p_ValueListType_f4cc4fb856d8 := 'None';
  p_DefaultInView_f4cc4fb856d8 := FALSE;
  p_DefaultColumnWidth_f4cc4fb856d8 := 150;
  p_AllowUpdateAPI_f4cc4fb856d8 := FALSE;
  p_AllowUpdateInView_f4cc4fb856d8 := TRUE;
  p_IncludeInUserSearchAPI_f4cc4fb856d8 := FALSE;
  p_FullTextSearchEnabled_f4cc4fb856d8 := FALSE;
  p_IncludeInGeneratedForm_f4cc4fb856d8 := TRUE;
  p_GeneratedFormSection_f4cc4fb856d8 := 'Category';
  p_IsNameField_f4cc4fb856d8 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_f4cc4fb856d8 := FALSE;
  p_RelatedEntityDisplayType_f4cc4fb856d8 := 'Search';
  p_AutoUpdateRelatedEntityInfo_f4cc4fb856d8 := TRUE;
  p_ValuesToPackWithSchema_f4cc4fb856d8 := 'Auto';
  p_Status_f4cc4fb856d8 := 'Active';
  p_AutoUpdateIsNameField_f4cc4fb856d8 := TRUE;
  p_AutoUpdateDefaultInView_f4cc4fb856d8 := TRUE;
  p_AutoUpdateCategory_f4cc4fb856d8 := TRUE;
  p_AutoUpdateDisplayName_f4cc4fb856d8 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_f4cc4fb856d8 := TRUE;
  p_Encrypt_f4cc4fb856d8 := FALSE;
  p_AllowDecryptInAPI_f4cc4fb856d8 := FALSE;
  p_SendEncryptedValue_f4cc4fb856d8 := FALSE;
  p_IsSoftPrimaryKey_f4cc4fb856d8 := FALSE;
  p_IsSoftForeignKey_f4cc4fb856d8 := FALSE;
  p_JSONTypeIsArray_f4cc4fb856d8 := FALSE;
  p_UserSearchPredicateAPI_f4cc4fb856d8 := 'Contains';
  p_AutoUpdateUserSearchPredicate_f4cc4fb856d8 := TRUE;
  p_AutoUpdateFullTextSearch_f4cc4fb856d8 := TRUE;
  p_AutoUpdateExtendedType_f4cc4fb856d8 := TRUE;
  p_IsComputed_f4cc4fb856d8 := FALSE;
  p_ID_f4cc4fb856d8 := '3F7DECD0-409D-4ED0-BB55-8947FE8568B2';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_f4cc4fb856d8,
    'Description', p_Description_f4cc4fb856d8,
    'AutoUpdateDescription', p_AutoUpdateDescription_f4cc4fb856d8,
    'IsPrimaryKey', p_IsPrimaryKey_f4cc4fb856d8,
    'IsUnique', p_IsUnique_f4cc4fb856d8,
    'Category', p_Category_f4cc4fb856d8,
    'ValueListType', p_ValueListType_f4cc4fb856d8,
    'ExtendedType', p_ExtendedType_f4cc4fb856d8,
    'CodeType', p_CodeType_f4cc4fb856d8,
    'DefaultInView', p_DefaultInView_f4cc4fb856d8,
    'ViewCellTemplate', p_ViewCellTemplate_f4cc4fb856d8,
    'DefaultColumnWidth', p_DefaultColumnWidth_f4cc4fb856d8,
    'AllowUpdateAPI', p_AllowUpdateAPI_f4cc4fb856d8,
    'AllowUpdateInView', p_AllowUpdateInView_f4cc4fb856d8,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_f4cc4fb856d8,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_f4cc4fb856d8,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_f4cc4fb856d8,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_f4cc4fb856d8,
    'GeneratedFormSection', p_GeneratedFormSection_f4cc4fb856d8,
    'IsNameField', p_IsNameField_f4cc4fb856d8,
    'RelatedEntityID', p_RelatedEntityID_f4cc4fb856d8,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_f4cc4fb856d8,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_f4cc4fb856d8,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_f4cc4fb856d8,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_f4cc4fb856d8,
    'EntityIDFieldName', p_EntityIDFieldName_f4cc4fb856d8,
    'ScopeDefault', p_ScopeDefault_f4cc4fb856d8,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_f4cc4fb856d8,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_f4cc4fb856d8,
    'Status', p_Status_f4cc4fb856d8,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_f4cc4fb856d8,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_f4cc4fb856d8,
    'AutoUpdateCategory', p_AutoUpdateCategory_f4cc4fb856d8,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_f4cc4fb856d8,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_f4cc4fb856d8,
    'Encrypt', p_Encrypt_f4cc4fb856d8,
    'EncryptionKeyID', p_EncryptionKeyID_f4cc4fb856d8,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_f4cc4fb856d8,
    'SendEncryptedValue', p_SendEncryptedValue_f4cc4fb856d8,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_f4cc4fb856d8,
    'IsSoftForeignKey', p_IsSoftForeignKey_f4cc4fb856d8,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_f4cc4fb856d8,
    'JSONType', p_JSONType_f4cc4fb856d8,
    'JSONTypeIsArray', p_JSONTypeIsArray_f4cc4fb856d8,
    'JSONTypeDefinition', p_JSONTypeDefinition_f4cc4fb856d8,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_f4cc4fb856d8,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_f4cc4fb856d8,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_f4cc4fb856d8,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_f4cc4fb856d8,
    'IsComputed', p_IsComputed_f4cc4fb856d8
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_f4cc4fb856d8,
    'Configuration', p_Configuration_f4cc4fb856d8,
    'ID', p_ID_f4cc4fb856d8
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_f4cc4fb856d8, p_Description := p_Description_f4cc4fb856d8, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_f4cc4fb856d8, p_IsPrimaryKey := p_IsPrimaryKey_f4cc4fb856d8, p_IsUnique := p_IsUnique_f4cc4fb856d8, p_Category := p_Category_f4cc4fb856d8, p_ValueListType := p_ValueListType_f4cc4fb856d8, p_ExtendedType := p_ExtendedType_f4cc4fb856d8, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_f4cc4fb856d8, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_f4cc4fb856d8, p_ViewCellTemplate := p_ViewCellTemplate_f4cc4fb856d8, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_f4cc4fb856d8, p_AllowUpdateAPI := p_AllowUpdateAPI_f4cc4fb856d8, p_AllowUpdateInView := p_AllowUpdateInView_f4cc4fb856d8, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_f4cc4fb856d8, p_FullTextSearchEnabled := p_FullTextSearchEnabled_f4cc4fb856d8, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_f4cc4fb856d8, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_f4cc4fb856d8, p_GeneratedFormSection := p_GeneratedFormSection_f4cc4fb856d8, p_IsNameField := p_IsNameField_f4cc4fb856d8, p_RelatedEntityID := p_RelatedEntityID_f4cc4fb856d8, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_f4cc4fb856d8, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_f4cc4fb856d8, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_f4cc4fb856d8, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_f4cc4fb856d8, p_EntityIDFieldName := p_EntityIDFieldName_f4cc4fb856d8, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_f4cc4fb856d8, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_f4cc4fb856d8, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_f4cc4fb856d8, p_Status := p_Status_f4cc4fb856d8, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_f4cc4fb856d8, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_f4cc4fb856d8, p_AutoUpdateCategory := p_AutoUpdateCategory_f4cc4fb856d8, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_f4cc4fb856d8, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_f4cc4fb856d8, p_Encrypt := p_Encrypt_f4cc4fb856d8, p_EncryptionKeyID := p_EncryptionKeyID_f4cc4fb856d8, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_f4cc4fb856d8, p_SendEncryptedValue := p_SendEncryptedValue_f4cc4fb856d8, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_f4cc4fb856d8, p_IsSoftForeignKey := p_IsSoftForeignKey_f4cc4fb856d8, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_f4cc4fb856d8, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_f4cc4fb856d8, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_f4cc4fb856d8, p_JSONTypeDefinition := p_JSONTypeDefinition_f4cc4fb856d8, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_f4cc4fb856d8, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_f4cc4fb856d8, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_f4cc4fb856d8, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_f4cc4fb856d8, p_IsComputed := p_IsComputed_f4cc4fb856d8, p_EmbeddedRecord := p_EmbeddedRecord_f4cc4fb856d8, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_f4cc4fb856d8, p_Configuration_Clear := TRUE, p_ID := p_ID_f4cc4fb856d8);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_6b5f919b1f4a VARCHAR(255);
  p_Description_6b5f919b1f4a TEXT;
  p_AutoUpdateDescription_6b5f919b1f4a BOOLEAN;
  p_IsPrimaryKey_6b5f919b1f4a BOOLEAN;
  p_IsUnique_6b5f919b1f4a BOOLEAN;
  p_Category_6b5f919b1f4a VARCHAR(255);
  p_ValueListType_6b5f919b1f4a VARCHAR(20);
  p_ExtendedType_6b5f919b1f4a VARCHAR(50);
  p_CodeType_6b5f919b1f4a VARCHAR(50);
  p_DefaultInView_6b5f919b1f4a BOOLEAN;
  p_ViewCellTemplate_6b5f919b1f4a TEXT;
  p_DefaultColumnWidth_6b5f919b1f4a INTEGER;
  p_AllowUpdateAPI_6b5f919b1f4a BOOLEAN;
  p_AllowUpdateInView_6b5f919b1f4a BOOLEAN;
  p_IncludeInUserSearchAPI_6b5f919b1f4a BOOLEAN;
  p_FullTextSearchEnabled_6b5f919b1f4a BOOLEAN;
  p_UserSearchParamFormatAPI_6b5f919b1f4a VARCHAR(500);
  p_IncludeInGeneratedForm_6b5f919b1f4a BOOLEAN;
  p_GeneratedFormSection_6b5f919b1f4a VARCHAR(10);
  p_IsNameField_6b5f919b1f4a BOOLEAN;
  p_RelatedEntityID_6b5f919b1f4a UUID;
  p_RelatedEntityFieldName_6b5f919b1f4a VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_6b5f919b1f4a BOOLEAN;
  p_RelatedEntityNameFieldMap_6b5f919b1f4a VARCHAR(255);
  p_RelatedEntityDisplayType_6b5f919b1f4a VARCHAR(20);
  p_EntityIDFieldName_6b5f919b1f4a VARCHAR(100);
  p_ScopeDefault_6b5f919b1f4a VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_6b5f919b1f4a BOOLEAN;
  p_ValuesToPackWithSchema_6b5f919b1f4a VARCHAR(10);
  p_Status_6b5f919b1f4a VARCHAR(25);
  p_AutoUpdateIsNameField_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateDefaultInView_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateCategory_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateDisplayName_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_6b5f919b1f4a BOOLEAN;
  p_Encrypt_6b5f919b1f4a BOOLEAN;
  p_EncryptionKeyID_6b5f919b1f4a UUID;
  p_AllowDecryptInAPI_6b5f919b1f4a BOOLEAN;
  p_SendEncryptedValue_6b5f919b1f4a BOOLEAN;
  p_IsSoftPrimaryKey_6b5f919b1f4a BOOLEAN;
  p_IsSoftForeignKey_6b5f919b1f4a BOOLEAN;
  p_RelatedEntityJoinFields_6b5f919b1f4a TEXT;
  p_JSONType_6b5f919b1f4a VARCHAR(255);
  p_JSONTypeIsArray_6b5f919b1f4a BOOLEAN;
  p_JSONTypeDefinition_6b5f919b1f4a TEXT;
  p_UserSearchPredicateAPI_6b5f919b1f4a VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateFullTextSearch_6b5f919b1f4a BOOLEAN;
  p_AutoUpdateExtendedType_6b5f919b1f4a BOOLEAN;
  p_IsComputed_6b5f919b1f4a BOOLEAN;
  p_EmbeddedRecord_6b5f919b1f4a TEXT;
  p_Configuration_6b5f919b1f4a TEXT;
  p_ID_6b5f919b1f4a UUID;
BEGIN
  p_DisplayName_6b5f919b1f4a := 'Confirmed By User';
  p_AutoUpdateDescription_6b5f919b1f4a := TRUE;
  p_IsPrimaryKey_6b5f919b1f4a := FALSE;
  p_IsUnique_6b5f919b1f4a := FALSE;
  p_Category_6b5f919b1f4a := 'Accounting and Audit';
  p_ValueListType_6b5f919b1f4a := 'None';
  p_DefaultInView_6b5f919b1f4a := FALSE;
  p_DefaultColumnWidth_6b5f919b1f4a := 150;
  p_AllowUpdateAPI_6b5f919b1f4a := FALSE;
  p_AllowUpdateInView_6b5f919b1f4a := TRUE;
  p_IncludeInUserSearchAPI_6b5f919b1f4a := FALSE;
  p_FullTextSearchEnabled_6b5f919b1f4a := FALSE;
  p_IncludeInGeneratedForm_6b5f919b1f4a := TRUE;
  p_GeneratedFormSection_6b5f919b1f4a := 'Category';
  p_IsNameField_6b5f919b1f4a := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_6b5f919b1f4a := FALSE;
  p_RelatedEntityDisplayType_6b5f919b1f4a := 'Search';
  p_AutoUpdateRelatedEntityInfo_6b5f919b1f4a := TRUE;
  p_ValuesToPackWithSchema_6b5f919b1f4a := 'Auto';
  p_Status_6b5f919b1f4a := 'Active';
  p_AutoUpdateIsNameField_6b5f919b1f4a := TRUE;
  p_AutoUpdateDefaultInView_6b5f919b1f4a := TRUE;
  p_AutoUpdateCategory_6b5f919b1f4a := TRUE;
  p_AutoUpdateDisplayName_6b5f919b1f4a := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_6b5f919b1f4a := TRUE;
  p_Encrypt_6b5f919b1f4a := FALSE;
  p_AllowDecryptInAPI_6b5f919b1f4a := FALSE;
  p_SendEncryptedValue_6b5f919b1f4a := FALSE;
  p_IsSoftPrimaryKey_6b5f919b1f4a := FALSE;
  p_IsSoftForeignKey_6b5f919b1f4a := FALSE;
  p_JSONTypeIsArray_6b5f919b1f4a := FALSE;
  p_UserSearchPredicateAPI_6b5f919b1f4a := 'Contains';
  p_AutoUpdateUserSearchPredicate_6b5f919b1f4a := TRUE;
  p_AutoUpdateFullTextSearch_6b5f919b1f4a := TRUE;
  p_AutoUpdateExtendedType_6b5f919b1f4a := TRUE;
  p_IsComputed_6b5f919b1f4a := FALSE;
  p_ID_6b5f919b1f4a := 'B1EE4505-C354-49F8-BDA0-B0CE73F483E4';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_6b5f919b1f4a,
    'Description', p_Description_6b5f919b1f4a,
    'AutoUpdateDescription', p_AutoUpdateDescription_6b5f919b1f4a,
    'IsPrimaryKey', p_IsPrimaryKey_6b5f919b1f4a,
    'IsUnique', p_IsUnique_6b5f919b1f4a,
    'Category', p_Category_6b5f919b1f4a,
    'ValueListType', p_ValueListType_6b5f919b1f4a,
    'ExtendedType', p_ExtendedType_6b5f919b1f4a,
    'CodeType', p_CodeType_6b5f919b1f4a,
    'DefaultInView', p_DefaultInView_6b5f919b1f4a,
    'ViewCellTemplate', p_ViewCellTemplate_6b5f919b1f4a,
    'DefaultColumnWidth', p_DefaultColumnWidth_6b5f919b1f4a,
    'AllowUpdateAPI', p_AllowUpdateAPI_6b5f919b1f4a,
    'AllowUpdateInView', p_AllowUpdateInView_6b5f919b1f4a,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_6b5f919b1f4a,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_6b5f919b1f4a,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_6b5f919b1f4a,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_6b5f919b1f4a,
    'GeneratedFormSection', p_GeneratedFormSection_6b5f919b1f4a,
    'IsNameField', p_IsNameField_6b5f919b1f4a,
    'RelatedEntityID', p_RelatedEntityID_6b5f919b1f4a,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_6b5f919b1f4a,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_6b5f919b1f4a,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_6b5f919b1f4a,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_6b5f919b1f4a,
    'EntityIDFieldName', p_EntityIDFieldName_6b5f919b1f4a,
    'ScopeDefault', p_ScopeDefault_6b5f919b1f4a,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_6b5f919b1f4a,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_6b5f919b1f4a,
    'Status', p_Status_6b5f919b1f4a,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_6b5f919b1f4a,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_6b5f919b1f4a,
    'AutoUpdateCategory', p_AutoUpdateCategory_6b5f919b1f4a,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_6b5f919b1f4a,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_6b5f919b1f4a,
    'Encrypt', p_Encrypt_6b5f919b1f4a,
    'EncryptionKeyID', p_EncryptionKeyID_6b5f919b1f4a,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_6b5f919b1f4a,
    'SendEncryptedValue', p_SendEncryptedValue_6b5f919b1f4a,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_6b5f919b1f4a,
    'IsSoftForeignKey', p_IsSoftForeignKey_6b5f919b1f4a,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_6b5f919b1f4a,
    'JSONType', p_JSONType_6b5f919b1f4a,
    'JSONTypeIsArray', p_JSONTypeIsArray_6b5f919b1f4a,
    'JSONTypeDefinition', p_JSONTypeDefinition_6b5f919b1f4a,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_6b5f919b1f4a,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_6b5f919b1f4a,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_6b5f919b1f4a,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_6b5f919b1f4a,
    'IsComputed', p_IsComputed_6b5f919b1f4a
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_6b5f919b1f4a,
    'Configuration', p_Configuration_6b5f919b1f4a,
    'ID', p_ID_6b5f919b1f4a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_6b5f919b1f4a, p_Description := p_Description_6b5f919b1f4a, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_6b5f919b1f4a, p_IsPrimaryKey := p_IsPrimaryKey_6b5f919b1f4a, p_IsUnique := p_IsUnique_6b5f919b1f4a, p_Category := p_Category_6b5f919b1f4a, p_ValueListType := p_ValueListType_6b5f919b1f4a, p_ExtendedType := p_ExtendedType_6b5f919b1f4a, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_6b5f919b1f4a, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_6b5f919b1f4a, p_ViewCellTemplate := p_ViewCellTemplate_6b5f919b1f4a, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_6b5f919b1f4a, p_AllowUpdateAPI := p_AllowUpdateAPI_6b5f919b1f4a, p_AllowUpdateInView := p_AllowUpdateInView_6b5f919b1f4a, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_6b5f919b1f4a, p_FullTextSearchEnabled := p_FullTextSearchEnabled_6b5f919b1f4a, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_6b5f919b1f4a, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_6b5f919b1f4a, p_GeneratedFormSection := p_GeneratedFormSection_6b5f919b1f4a, p_IsNameField := p_IsNameField_6b5f919b1f4a, p_RelatedEntityID := p_RelatedEntityID_6b5f919b1f4a, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_6b5f919b1f4a, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_6b5f919b1f4a, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_6b5f919b1f4a, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_6b5f919b1f4a, p_EntityIDFieldName := p_EntityIDFieldName_6b5f919b1f4a, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_6b5f919b1f4a, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_6b5f919b1f4a, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_6b5f919b1f4a, p_Status := p_Status_6b5f919b1f4a, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_6b5f919b1f4a, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_6b5f919b1f4a, p_AutoUpdateCategory := p_AutoUpdateCategory_6b5f919b1f4a, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_6b5f919b1f4a, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_6b5f919b1f4a, p_Encrypt := p_Encrypt_6b5f919b1f4a, p_EncryptionKeyID := p_EncryptionKeyID_6b5f919b1f4a, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_6b5f919b1f4a, p_SendEncryptedValue := p_SendEncryptedValue_6b5f919b1f4a, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_6b5f919b1f4a, p_IsSoftForeignKey := p_IsSoftForeignKey_6b5f919b1f4a, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_6b5f919b1f4a, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_6b5f919b1f4a, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_6b5f919b1f4a, p_JSONTypeDefinition := p_JSONTypeDefinition_6b5f919b1f4a, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_6b5f919b1f4a, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_6b5f919b1f4a, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_6b5f919b1f4a, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_6b5f919b1f4a, p_IsComputed := p_IsComputed_6b5f919b1f4a, p_EmbeddedRecord := p_EmbeddedRecord_6b5f919b1f4a, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_6b5f919b1f4a, p_Configuration_Clear := TRUE, p_ID := p_ID_6b5f919b1f4a);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_8c241af71b45 VARCHAR(255);
  p_Description_8c241af71b45 TEXT;
  p_AutoUpdateDescription_8c241af71b45 BOOLEAN;
  p_IsPrimaryKey_8c241af71b45 BOOLEAN;
  p_IsUnique_8c241af71b45 BOOLEAN;
  p_Category_8c241af71b45 VARCHAR(255);
  p_ValueListType_8c241af71b45 VARCHAR(20);
  p_ExtendedType_8c241af71b45 VARCHAR(50);
  p_CodeType_8c241af71b45 VARCHAR(50);
  p_DefaultInView_8c241af71b45 BOOLEAN;
  p_ViewCellTemplate_8c241af71b45 TEXT;
  p_DefaultColumnWidth_8c241af71b45 INTEGER;
  p_AllowUpdateAPI_8c241af71b45 BOOLEAN;
  p_AllowUpdateInView_8c241af71b45 BOOLEAN;
  p_IncludeInUserSearchAPI_8c241af71b45 BOOLEAN;
  p_FullTextSearchEnabled_8c241af71b45 BOOLEAN;
  p_UserSearchParamFormatAPI_8c241af71b45 VARCHAR(500);
  p_IncludeInGeneratedForm_8c241af71b45 BOOLEAN;
  p_GeneratedFormSection_8c241af71b45 VARCHAR(10);
  p_IsNameField_8c241af71b45 BOOLEAN;
  p_RelatedEntityID_8c241af71b45 UUID;
  p_RelatedEntityFieldName_8c241af71b45 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_8c241af71b45 BOOLEAN;
  p_RelatedEntityNameFieldMap_8c241af71b45 VARCHAR(255);
  p_RelatedEntityDisplayType_8c241af71b45 VARCHAR(20);
  p_EntityIDFieldName_8c241af71b45 VARCHAR(100);
  p_ScopeDefault_8c241af71b45 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_8c241af71b45 BOOLEAN;
  p_ValuesToPackWithSchema_8c241af71b45 VARCHAR(10);
  p_Status_8c241af71b45 VARCHAR(25);
  p_AutoUpdateIsNameField_8c241af71b45 BOOLEAN;
  p_AutoUpdateDefaultInView_8c241af71b45 BOOLEAN;
  p_AutoUpdateCategory_8c241af71b45 BOOLEAN;
  p_AutoUpdateDisplayName_8c241af71b45 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_8c241af71b45 BOOLEAN;
  p_Encrypt_8c241af71b45 BOOLEAN;
  p_EncryptionKeyID_8c241af71b45 UUID;
  p_AllowDecryptInAPI_8c241af71b45 BOOLEAN;
  p_SendEncryptedValue_8c241af71b45 BOOLEAN;
  p_IsSoftPrimaryKey_8c241af71b45 BOOLEAN;
  p_IsSoftForeignKey_8c241af71b45 BOOLEAN;
  p_RelatedEntityJoinFields_8c241af71b45 TEXT;
  p_JSONType_8c241af71b45 VARCHAR(255);
  p_JSONTypeIsArray_8c241af71b45 BOOLEAN;
  p_JSONTypeDefinition_8c241af71b45 TEXT;
  p_UserSearchPredicateAPI_8c241af71b45 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_8c241af71b45 BOOLEAN;
  p_AutoUpdateFullTextSearch_8c241af71b45 BOOLEAN;
  p_AutoUpdateExtendedType_8c241af71b45 BOOLEAN;
  p_IsComputed_8c241af71b45 BOOLEAN;
  p_EmbeddedRecord_8c241af71b45 TEXT;
  p_Configuration_8c241af71b45 TEXT;
  p_ID_8c241af71b45 UUID;
BEGIN
  p_DisplayName_8c241af71b45 := 'Extended Amount';
  p_AutoUpdateDescription_8c241af71b45 := TRUE;
  p_IsPrimaryKey_8c241af71b45 := FALSE;
  p_IsUnique_8c241af71b45 := FALSE;
  p_Category_8c241af71b45 := 'Order Lines';
  p_ValueListType_8c241af71b45 := 'None';
  p_DefaultInView_8c241af71b45 := FALSE;
  p_DefaultColumnWidth_8c241af71b45 := 150;
  p_AllowUpdateAPI_8c241af71b45 := TRUE;
  p_AllowUpdateInView_8c241af71b45 := TRUE;
  p_IncludeInUserSearchAPI_8c241af71b45 := FALSE;
  p_FullTextSearchEnabled_8c241af71b45 := FALSE;
  p_IncludeInGeneratedForm_8c241af71b45 := TRUE;
  p_GeneratedFormSection_8c241af71b45 := 'Category';
  p_IsNameField_8c241af71b45 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_8c241af71b45 := TRUE;
  p_RelatedEntityDisplayType_8c241af71b45 := 'Search';
  p_AutoUpdateRelatedEntityInfo_8c241af71b45 := TRUE;
  p_ValuesToPackWithSchema_8c241af71b45 := 'Auto';
  p_Status_8c241af71b45 := 'Active';
  p_AutoUpdateIsNameField_8c241af71b45 := TRUE;
  p_AutoUpdateDefaultInView_8c241af71b45 := TRUE;
  p_AutoUpdateCategory_8c241af71b45 := TRUE;
  p_AutoUpdateDisplayName_8c241af71b45 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_8c241af71b45 := TRUE;
  p_Encrypt_8c241af71b45 := FALSE;
  p_AllowDecryptInAPI_8c241af71b45 := FALSE;
  p_SendEncryptedValue_8c241af71b45 := FALSE;
  p_IsSoftPrimaryKey_8c241af71b45 := FALSE;
  p_IsSoftForeignKey_8c241af71b45 := FALSE;
  p_JSONTypeIsArray_8c241af71b45 := FALSE;
  p_UserSearchPredicateAPI_8c241af71b45 := 'Contains';
  p_AutoUpdateUserSearchPredicate_8c241af71b45 := TRUE;
  p_AutoUpdateFullTextSearch_8c241af71b45 := TRUE;
  p_AutoUpdateExtendedType_8c241af71b45 := TRUE;
  p_IsComputed_8c241af71b45 := FALSE;
  p_ID_8c241af71b45 := 'E16DEEFE-61E5-49E9-8137-6C908986258F';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_8c241af71b45,
    'Description', p_Description_8c241af71b45,
    'AutoUpdateDescription', p_AutoUpdateDescription_8c241af71b45,
    'IsPrimaryKey', p_IsPrimaryKey_8c241af71b45,
    'IsUnique', p_IsUnique_8c241af71b45,
    'Category', p_Category_8c241af71b45,
    'ValueListType', p_ValueListType_8c241af71b45,
    'ExtendedType', p_ExtendedType_8c241af71b45,
    'CodeType', p_CodeType_8c241af71b45,
    'DefaultInView', p_DefaultInView_8c241af71b45,
    'ViewCellTemplate', p_ViewCellTemplate_8c241af71b45,
    'DefaultColumnWidth', p_DefaultColumnWidth_8c241af71b45,
    'AllowUpdateAPI', p_AllowUpdateAPI_8c241af71b45,
    'AllowUpdateInView', p_AllowUpdateInView_8c241af71b45,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_8c241af71b45,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_8c241af71b45,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_8c241af71b45,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_8c241af71b45,
    'GeneratedFormSection', p_GeneratedFormSection_8c241af71b45,
    'IsNameField', p_IsNameField_8c241af71b45,
    'RelatedEntityID', p_RelatedEntityID_8c241af71b45,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_8c241af71b45,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_8c241af71b45,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_8c241af71b45,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_8c241af71b45,
    'EntityIDFieldName', p_EntityIDFieldName_8c241af71b45,
    'ScopeDefault', p_ScopeDefault_8c241af71b45,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_8c241af71b45,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_8c241af71b45,
    'Status', p_Status_8c241af71b45,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_8c241af71b45,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_8c241af71b45,
    'AutoUpdateCategory', p_AutoUpdateCategory_8c241af71b45,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_8c241af71b45,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_8c241af71b45,
    'Encrypt', p_Encrypt_8c241af71b45,
    'EncryptionKeyID', p_EncryptionKeyID_8c241af71b45,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_8c241af71b45,
    'SendEncryptedValue', p_SendEncryptedValue_8c241af71b45,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_8c241af71b45,
    'IsSoftForeignKey', p_IsSoftForeignKey_8c241af71b45,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_8c241af71b45,
    'JSONType', p_JSONType_8c241af71b45,
    'JSONTypeIsArray', p_JSONTypeIsArray_8c241af71b45,
    'JSONTypeDefinition', p_JSONTypeDefinition_8c241af71b45,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_8c241af71b45,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_8c241af71b45,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_8c241af71b45,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_8c241af71b45,
    'IsComputed', p_IsComputed_8c241af71b45
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_8c241af71b45,
    'Configuration', p_Configuration_8c241af71b45,
    'ID', p_ID_8c241af71b45
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_8c241af71b45, p_Description := p_Description_8c241af71b45, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_8c241af71b45, p_IsPrimaryKey := p_IsPrimaryKey_8c241af71b45, p_IsUnique := p_IsUnique_8c241af71b45, p_Category := p_Category_8c241af71b45, p_ValueListType := p_ValueListType_8c241af71b45, p_ExtendedType := p_ExtendedType_8c241af71b45, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_8c241af71b45, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_8c241af71b45, p_ViewCellTemplate := p_ViewCellTemplate_8c241af71b45, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_8c241af71b45, p_AllowUpdateAPI := p_AllowUpdateAPI_8c241af71b45, p_AllowUpdateInView := p_AllowUpdateInView_8c241af71b45, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_8c241af71b45, p_FullTextSearchEnabled := p_FullTextSearchEnabled_8c241af71b45, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_8c241af71b45, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_8c241af71b45, p_GeneratedFormSection := p_GeneratedFormSection_8c241af71b45, p_IsNameField := p_IsNameField_8c241af71b45, p_RelatedEntityID := p_RelatedEntityID_8c241af71b45, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_8c241af71b45, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_8c241af71b45, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_8c241af71b45, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_8c241af71b45, p_EntityIDFieldName := p_EntityIDFieldName_8c241af71b45, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_8c241af71b45, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_8c241af71b45, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_8c241af71b45, p_Status := p_Status_8c241af71b45, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_8c241af71b45, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_8c241af71b45, p_AutoUpdateCategory := p_AutoUpdateCategory_8c241af71b45, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_8c241af71b45, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_8c241af71b45, p_Encrypt := p_Encrypt_8c241af71b45, p_EncryptionKeyID := p_EncryptionKeyID_8c241af71b45, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_8c241af71b45, p_SendEncryptedValue := p_SendEncryptedValue_8c241af71b45, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_8c241af71b45, p_IsSoftForeignKey := p_IsSoftForeignKey_8c241af71b45, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_8c241af71b45, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_8c241af71b45, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_8c241af71b45, p_JSONTypeDefinition := p_JSONTypeDefinition_8c241af71b45, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_8c241af71b45, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_8c241af71b45, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_8c241af71b45, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_8c241af71b45, p_IsComputed := p_IsComputed_8c241af71b45, p_EmbeddedRecord := p_EmbeddedRecord_8c241af71b45, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_8c241af71b45, p_Configuration_Clear := TRUE, p_ID := p_ID_8c241af71b45);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_580f4ca8b814 VARCHAR(255);
  p_Description_580f4ca8b814 TEXT;
  p_AutoUpdateDescription_580f4ca8b814 BOOLEAN;
  p_IsPrimaryKey_580f4ca8b814 BOOLEAN;
  p_IsUnique_580f4ca8b814 BOOLEAN;
  p_Category_580f4ca8b814 VARCHAR(255);
  p_ValueListType_580f4ca8b814 VARCHAR(20);
  p_ExtendedType_580f4ca8b814 VARCHAR(50);
  p_CodeType_580f4ca8b814 VARCHAR(50);
  p_DefaultInView_580f4ca8b814 BOOLEAN;
  p_ViewCellTemplate_580f4ca8b814 TEXT;
  p_DefaultColumnWidth_580f4ca8b814 INTEGER;
  p_AllowUpdateAPI_580f4ca8b814 BOOLEAN;
  p_AllowUpdateInView_580f4ca8b814 BOOLEAN;
  p_IncludeInUserSearchAPI_580f4ca8b814 BOOLEAN;
  p_FullTextSearchEnabled_580f4ca8b814 BOOLEAN;
  p_UserSearchParamFormatAPI_580f4ca8b814 VARCHAR(500);
  p_IncludeInGeneratedForm_580f4ca8b814 BOOLEAN;
  p_GeneratedFormSection_580f4ca8b814 VARCHAR(10);
  p_IsNameField_580f4ca8b814 BOOLEAN;
  p_RelatedEntityID_580f4ca8b814 UUID;
  p_RelatedEntityFieldName_580f4ca8b814 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_580f4ca8b814 BOOLEAN;
  p_RelatedEntityNameFieldMap_580f4ca8b814 VARCHAR(255);
  p_RelatedEntityDisplayType_580f4ca8b814 VARCHAR(20);
  p_EntityIDFieldName_580f4ca8b814 VARCHAR(100);
  p_ScopeDefault_580f4ca8b814 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_580f4ca8b814 BOOLEAN;
  p_ValuesToPackWithSchema_580f4ca8b814 VARCHAR(10);
  p_Status_580f4ca8b814 VARCHAR(25);
  p_AutoUpdateIsNameField_580f4ca8b814 BOOLEAN;
  p_AutoUpdateDefaultInView_580f4ca8b814 BOOLEAN;
  p_AutoUpdateCategory_580f4ca8b814 BOOLEAN;
  p_AutoUpdateDisplayName_580f4ca8b814 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_580f4ca8b814 BOOLEAN;
  p_Encrypt_580f4ca8b814 BOOLEAN;
  p_EncryptionKeyID_580f4ca8b814 UUID;
  p_AllowDecryptInAPI_580f4ca8b814 BOOLEAN;
  p_SendEncryptedValue_580f4ca8b814 BOOLEAN;
  p_IsSoftPrimaryKey_580f4ca8b814 BOOLEAN;
  p_IsSoftForeignKey_580f4ca8b814 BOOLEAN;
  p_RelatedEntityJoinFields_580f4ca8b814 TEXT;
  p_JSONType_580f4ca8b814 VARCHAR(255);
  p_JSONTypeIsArray_580f4ca8b814 BOOLEAN;
  p_JSONTypeDefinition_580f4ca8b814 TEXT;
  p_UserSearchPredicateAPI_580f4ca8b814 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_580f4ca8b814 BOOLEAN;
  p_AutoUpdateFullTextSearch_580f4ca8b814 BOOLEAN;
  p_AutoUpdateExtendedType_580f4ca8b814 BOOLEAN;
  p_IsComputed_580f4ca8b814 BOOLEAN;
  p_EmbeddedRecord_580f4ca8b814 TEXT;
  p_Configuration_580f4ca8b814 TEXT;
  p_ID_580f4ca8b814 UUID;
BEGIN
  p_DisplayName_580f4ca8b814 := 'Schedule Reduction';
  p_Description_580f4ca8b814 := 'On a returning line whose origin is billed by instalment: the returned units'' share of what the origin line''s instalments had not yet invoiced, tax included. It is taken off those instalments, and the origin''s balance and schedule check subtract it from the origin''s lines. Set by the server when the return is confirmed. NULL on every other line.';
  p_AutoUpdateDescription_580f4ca8b814 := TRUE;
  p_IsPrimaryKey_580f4ca8b814 := FALSE;
  p_IsUnique_580f4ca8b814 := FALSE;
  p_Category_580f4ca8b814 := 'Pricing and Financials';
  p_ValueListType_580f4ca8b814 := 'None';
  p_DefaultInView_580f4ca8b814 := FALSE;
  p_DefaultColumnWidth_580f4ca8b814 := 150;
  p_AllowUpdateAPI_580f4ca8b814 := TRUE;
  p_AllowUpdateInView_580f4ca8b814 := TRUE;
  p_IncludeInUserSearchAPI_580f4ca8b814 := FALSE;
  p_FullTextSearchEnabled_580f4ca8b814 := FALSE;
  p_IncludeInGeneratedForm_580f4ca8b814 := TRUE;
  p_GeneratedFormSection_580f4ca8b814 := 'Category';
  p_IsNameField_580f4ca8b814 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_580f4ca8b814 := FALSE;
  p_RelatedEntityDisplayType_580f4ca8b814 := 'Search';
  p_AutoUpdateRelatedEntityInfo_580f4ca8b814 := TRUE;
  p_ValuesToPackWithSchema_580f4ca8b814 := 'Auto';
  p_Status_580f4ca8b814 := 'Active';
  p_AutoUpdateIsNameField_580f4ca8b814 := TRUE;
  p_AutoUpdateDefaultInView_580f4ca8b814 := TRUE;
  p_AutoUpdateCategory_580f4ca8b814 := TRUE;
  p_AutoUpdateDisplayName_580f4ca8b814 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_580f4ca8b814 := TRUE;
  p_Encrypt_580f4ca8b814 := FALSE;
  p_AllowDecryptInAPI_580f4ca8b814 := FALSE;
  p_SendEncryptedValue_580f4ca8b814 := FALSE;
  p_IsSoftPrimaryKey_580f4ca8b814 := FALSE;
  p_IsSoftForeignKey_580f4ca8b814 := FALSE;
  p_JSONTypeIsArray_580f4ca8b814 := FALSE;
  p_UserSearchPredicateAPI_580f4ca8b814 := 'Contains';
  p_AutoUpdateUserSearchPredicate_580f4ca8b814 := TRUE;
  p_AutoUpdateFullTextSearch_580f4ca8b814 := TRUE;
  p_AutoUpdateExtendedType_580f4ca8b814 := TRUE;
  p_IsComputed_580f4ca8b814 := FALSE;
  p_ID_580f4ca8b814 := '6F429DF9-D734-4488-83A8-9E7323FAB524';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_580f4ca8b814,
    'Description', p_Description_580f4ca8b814,
    'AutoUpdateDescription', p_AutoUpdateDescription_580f4ca8b814,
    'IsPrimaryKey', p_IsPrimaryKey_580f4ca8b814,
    'IsUnique', p_IsUnique_580f4ca8b814,
    'Category', p_Category_580f4ca8b814,
    'ValueListType', p_ValueListType_580f4ca8b814,
    'ExtendedType', p_ExtendedType_580f4ca8b814,
    'CodeType', p_CodeType_580f4ca8b814,
    'DefaultInView', p_DefaultInView_580f4ca8b814,
    'ViewCellTemplate', p_ViewCellTemplate_580f4ca8b814,
    'DefaultColumnWidth', p_DefaultColumnWidth_580f4ca8b814,
    'AllowUpdateAPI', p_AllowUpdateAPI_580f4ca8b814,
    'AllowUpdateInView', p_AllowUpdateInView_580f4ca8b814,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_580f4ca8b814,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_580f4ca8b814,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_580f4ca8b814,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_580f4ca8b814,
    'GeneratedFormSection', p_GeneratedFormSection_580f4ca8b814,
    'IsNameField', p_IsNameField_580f4ca8b814,
    'RelatedEntityID', p_RelatedEntityID_580f4ca8b814,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_580f4ca8b814,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_580f4ca8b814,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_580f4ca8b814,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_580f4ca8b814,
    'EntityIDFieldName', p_EntityIDFieldName_580f4ca8b814,
    'ScopeDefault', p_ScopeDefault_580f4ca8b814,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_580f4ca8b814,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_580f4ca8b814,
    'Status', p_Status_580f4ca8b814,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_580f4ca8b814,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_580f4ca8b814,
    'AutoUpdateCategory', p_AutoUpdateCategory_580f4ca8b814,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_580f4ca8b814,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_580f4ca8b814,
    'Encrypt', p_Encrypt_580f4ca8b814,
    'EncryptionKeyID', p_EncryptionKeyID_580f4ca8b814,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_580f4ca8b814,
    'SendEncryptedValue', p_SendEncryptedValue_580f4ca8b814,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_580f4ca8b814,
    'IsSoftForeignKey', p_IsSoftForeignKey_580f4ca8b814,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_580f4ca8b814,
    'JSONType', p_JSONType_580f4ca8b814,
    'JSONTypeIsArray', p_JSONTypeIsArray_580f4ca8b814,
    'JSONTypeDefinition', p_JSONTypeDefinition_580f4ca8b814,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_580f4ca8b814,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_580f4ca8b814,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_580f4ca8b814,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_580f4ca8b814,
    'IsComputed', p_IsComputed_580f4ca8b814
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_580f4ca8b814,
    'Configuration', p_Configuration_580f4ca8b814,
    'ID', p_ID_580f4ca8b814
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_580f4ca8b814, p_Description := p_Description_580f4ca8b814, p_AutoUpdateDescription := p_AutoUpdateDescription_580f4ca8b814, p_IsPrimaryKey := p_IsPrimaryKey_580f4ca8b814, p_IsUnique := p_IsUnique_580f4ca8b814, p_Category := p_Category_580f4ca8b814, p_ValueListType := p_ValueListType_580f4ca8b814, p_ExtendedType := p_ExtendedType_580f4ca8b814, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_580f4ca8b814, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_580f4ca8b814, p_ViewCellTemplate := p_ViewCellTemplate_580f4ca8b814, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_580f4ca8b814, p_AllowUpdateAPI := p_AllowUpdateAPI_580f4ca8b814, p_AllowUpdateInView := p_AllowUpdateInView_580f4ca8b814, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_580f4ca8b814, p_FullTextSearchEnabled := p_FullTextSearchEnabled_580f4ca8b814, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_580f4ca8b814, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_580f4ca8b814, p_GeneratedFormSection := p_GeneratedFormSection_580f4ca8b814, p_IsNameField := p_IsNameField_580f4ca8b814, p_RelatedEntityID := p_RelatedEntityID_580f4ca8b814, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_580f4ca8b814, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_580f4ca8b814, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_580f4ca8b814, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_580f4ca8b814, p_EntityIDFieldName := p_EntityIDFieldName_580f4ca8b814, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_580f4ca8b814, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_580f4ca8b814, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_580f4ca8b814, p_Status := p_Status_580f4ca8b814, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_580f4ca8b814, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_580f4ca8b814, p_AutoUpdateCategory := p_AutoUpdateCategory_580f4ca8b814, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_580f4ca8b814, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_580f4ca8b814, p_Encrypt := p_Encrypt_580f4ca8b814, p_EncryptionKeyID := p_EncryptionKeyID_580f4ca8b814, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_580f4ca8b814, p_SendEncryptedValue := p_SendEncryptedValue_580f4ca8b814, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_580f4ca8b814, p_IsSoftForeignKey := p_IsSoftForeignKey_580f4ca8b814, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_580f4ca8b814, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_580f4ca8b814, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_580f4ca8b814, p_JSONTypeDefinition := p_JSONTypeDefinition_580f4ca8b814, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_580f4ca8b814, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_580f4ca8b814, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_580f4ca8b814, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_580f4ca8b814, p_IsComputed := p_IsComputed_580f4ca8b814, p_EmbeddedRecord := p_EmbeddedRecord_580f4ca8b814, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_580f4ca8b814, p_Configuration_Clear := TRUE, p_ID := p_ID_580f4ca8b814);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_e07aab080c33 VARCHAR(255);
  p_Description_e07aab080c33 TEXT;
  p_AutoUpdateDescription_e07aab080c33 BOOLEAN;
  p_IsPrimaryKey_e07aab080c33 BOOLEAN;
  p_IsUnique_e07aab080c33 BOOLEAN;
  p_Category_e07aab080c33 VARCHAR(255);
  p_ValueListType_e07aab080c33 VARCHAR(20);
  p_ExtendedType_e07aab080c33 VARCHAR(50);
  p_CodeType_e07aab080c33 VARCHAR(50);
  p_DefaultInView_e07aab080c33 BOOLEAN;
  p_ViewCellTemplate_e07aab080c33 TEXT;
  p_DefaultColumnWidth_e07aab080c33 INTEGER;
  p_AllowUpdateAPI_e07aab080c33 BOOLEAN;
  p_AllowUpdateInView_e07aab080c33 BOOLEAN;
  p_IncludeInUserSearchAPI_e07aab080c33 BOOLEAN;
  p_FullTextSearchEnabled_e07aab080c33 BOOLEAN;
  p_UserSearchParamFormatAPI_e07aab080c33 VARCHAR(500);
  p_IncludeInGeneratedForm_e07aab080c33 BOOLEAN;
  p_GeneratedFormSection_e07aab080c33 VARCHAR(10);
  p_IsNameField_e07aab080c33 BOOLEAN;
  p_RelatedEntityID_e07aab080c33 UUID;
  p_RelatedEntityFieldName_e07aab080c33 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_e07aab080c33 BOOLEAN;
  p_RelatedEntityNameFieldMap_e07aab080c33 VARCHAR(255);
  p_RelatedEntityDisplayType_e07aab080c33 VARCHAR(20);
  p_EntityIDFieldName_e07aab080c33 VARCHAR(100);
  p_ScopeDefault_e07aab080c33 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_e07aab080c33 BOOLEAN;
  p_ValuesToPackWithSchema_e07aab080c33 VARCHAR(10);
  p_Status_e07aab080c33 VARCHAR(25);
  p_AutoUpdateIsNameField_e07aab080c33 BOOLEAN;
  p_AutoUpdateDefaultInView_e07aab080c33 BOOLEAN;
  p_AutoUpdateCategory_e07aab080c33 BOOLEAN;
  p_AutoUpdateDisplayName_e07aab080c33 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_e07aab080c33 BOOLEAN;
  p_Encrypt_e07aab080c33 BOOLEAN;
  p_EncryptionKeyID_e07aab080c33 UUID;
  p_AllowDecryptInAPI_e07aab080c33 BOOLEAN;
  p_SendEncryptedValue_e07aab080c33 BOOLEAN;
  p_IsSoftPrimaryKey_e07aab080c33 BOOLEAN;
  p_IsSoftForeignKey_e07aab080c33 BOOLEAN;
  p_RelatedEntityJoinFields_e07aab080c33 TEXT;
  p_JSONType_e07aab080c33 VARCHAR(255);
  p_JSONTypeIsArray_e07aab080c33 BOOLEAN;
  p_JSONTypeDefinition_e07aab080c33 TEXT;
  p_UserSearchPredicateAPI_e07aab080c33 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_e07aab080c33 BOOLEAN;
  p_AutoUpdateFullTextSearch_e07aab080c33 BOOLEAN;
  p_AutoUpdateExtendedType_e07aab080c33 BOOLEAN;
  p_IsComputed_e07aab080c33 BOOLEAN;
  p_EmbeddedRecord_e07aab080c33 TEXT;
  p_Configuration_e07aab080c33 TEXT;
  p_ID_e07aab080c33 UUID;
BEGIN
  p_DisplayName_e07aab080c33 := 'Credit Memo Amount';
  p_Description_e07aab080c33 := 'On a returning line whose origin is billed by instalment: the credit memo the return booked, the returned units'' share of what was invoiced and not yet earned. Zero when nothing was credited. The return order''s balance is this, not the value of its lines. Set by the server when the return is confirmed. NULL on every other line.';
  p_AutoUpdateDescription_e07aab080c33 := TRUE;
  p_IsPrimaryKey_e07aab080c33 := FALSE;
  p_IsUnique_e07aab080c33 := FALSE;
  p_Category_e07aab080c33 := 'Pricing and Financials';
  p_ValueListType_e07aab080c33 := 'None';
  p_DefaultInView_e07aab080c33 := FALSE;
  p_DefaultColumnWidth_e07aab080c33 := 150;
  p_AllowUpdateAPI_e07aab080c33 := TRUE;
  p_AllowUpdateInView_e07aab080c33 := TRUE;
  p_IncludeInUserSearchAPI_e07aab080c33 := FALSE;
  p_FullTextSearchEnabled_e07aab080c33 := FALSE;
  p_IncludeInGeneratedForm_e07aab080c33 := TRUE;
  p_GeneratedFormSection_e07aab080c33 := 'Category';
  p_IsNameField_e07aab080c33 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_e07aab080c33 := FALSE;
  p_RelatedEntityDisplayType_e07aab080c33 := 'Search';
  p_AutoUpdateRelatedEntityInfo_e07aab080c33 := TRUE;
  p_ValuesToPackWithSchema_e07aab080c33 := 'Auto';
  p_Status_e07aab080c33 := 'Active';
  p_AutoUpdateIsNameField_e07aab080c33 := TRUE;
  p_AutoUpdateDefaultInView_e07aab080c33 := TRUE;
  p_AutoUpdateCategory_e07aab080c33 := TRUE;
  p_AutoUpdateDisplayName_e07aab080c33 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_e07aab080c33 := TRUE;
  p_Encrypt_e07aab080c33 := FALSE;
  p_AllowDecryptInAPI_e07aab080c33 := FALSE;
  p_SendEncryptedValue_e07aab080c33 := FALSE;
  p_IsSoftPrimaryKey_e07aab080c33 := FALSE;
  p_IsSoftForeignKey_e07aab080c33 := FALSE;
  p_JSONTypeIsArray_e07aab080c33 := FALSE;
  p_UserSearchPredicateAPI_e07aab080c33 := 'Contains';
  p_AutoUpdateUserSearchPredicate_e07aab080c33 := TRUE;
  p_AutoUpdateFullTextSearch_e07aab080c33 := TRUE;
  p_AutoUpdateExtendedType_e07aab080c33 := TRUE;
  p_IsComputed_e07aab080c33 := FALSE;
  p_ID_e07aab080c33 := 'F23D9C05-C40B-483F-B8D6-1D8124BC3C6D';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_e07aab080c33,
    'Description', p_Description_e07aab080c33,
    'AutoUpdateDescription', p_AutoUpdateDescription_e07aab080c33,
    'IsPrimaryKey', p_IsPrimaryKey_e07aab080c33,
    'IsUnique', p_IsUnique_e07aab080c33,
    'Category', p_Category_e07aab080c33,
    'ValueListType', p_ValueListType_e07aab080c33,
    'ExtendedType', p_ExtendedType_e07aab080c33,
    'CodeType', p_CodeType_e07aab080c33,
    'DefaultInView', p_DefaultInView_e07aab080c33,
    'ViewCellTemplate', p_ViewCellTemplate_e07aab080c33,
    'DefaultColumnWidth', p_DefaultColumnWidth_e07aab080c33,
    'AllowUpdateAPI', p_AllowUpdateAPI_e07aab080c33,
    'AllowUpdateInView', p_AllowUpdateInView_e07aab080c33,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_e07aab080c33,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_e07aab080c33,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_e07aab080c33,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_e07aab080c33,
    'GeneratedFormSection', p_GeneratedFormSection_e07aab080c33,
    'IsNameField', p_IsNameField_e07aab080c33,
    'RelatedEntityID', p_RelatedEntityID_e07aab080c33,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_e07aab080c33,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_e07aab080c33,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_e07aab080c33,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_e07aab080c33,
    'EntityIDFieldName', p_EntityIDFieldName_e07aab080c33,
    'ScopeDefault', p_ScopeDefault_e07aab080c33,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_e07aab080c33,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_e07aab080c33,
    'Status', p_Status_e07aab080c33,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_e07aab080c33,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_e07aab080c33,
    'AutoUpdateCategory', p_AutoUpdateCategory_e07aab080c33,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_e07aab080c33,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_e07aab080c33,
    'Encrypt', p_Encrypt_e07aab080c33,
    'EncryptionKeyID', p_EncryptionKeyID_e07aab080c33,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_e07aab080c33,
    'SendEncryptedValue', p_SendEncryptedValue_e07aab080c33,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_e07aab080c33,
    'IsSoftForeignKey', p_IsSoftForeignKey_e07aab080c33,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_e07aab080c33,
    'JSONType', p_JSONType_e07aab080c33,
    'JSONTypeIsArray', p_JSONTypeIsArray_e07aab080c33,
    'JSONTypeDefinition', p_JSONTypeDefinition_e07aab080c33,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_e07aab080c33,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_e07aab080c33,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_e07aab080c33,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_e07aab080c33,
    'IsComputed', p_IsComputed_e07aab080c33
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_e07aab080c33,
    'Configuration', p_Configuration_e07aab080c33,
    'ID', p_ID_e07aab080c33
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_e07aab080c33, p_Description := p_Description_e07aab080c33, p_AutoUpdateDescription := p_AutoUpdateDescription_e07aab080c33, p_IsPrimaryKey := p_IsPrimaryKey_e07aab080c33, p_IsUnique := p_IsUnique_e07aab080c33, p_Category := p_Category_e07aab080c33, p_ValueListType := p_ValueListType_e07aab080c33, p_ExtendedType := p_ExtendedType_e07aab080c33, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_e07aab080c33, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_e07aab080c33, p_ViewCellTemplate := p_ViewCellTemplate_e07aab080c33, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_e07aab080c33, p_AllowUpdateAPI := p_AllowUpdateAPI_e07aab080c33, p_AllowUpdateInView := p_AllowUpdateInView_e07aab080c33, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_e07aab080c33, p_FullTextSearchEnabled := p_FullTextSearchEnabled_e07aab080c33, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_e07aab080c33, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_e07aab080c33, p_GeneratedFormSection := p_GeneratedFormSection_e07aab080c33, p_IsNameField := p_IsNameField_e07aab080c33, p_RelatedEntityID := p_RelatedEntityID_e07aab080c33, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_e07aab080c33, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_e07aab080c33, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_e07aab080c33, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_e07aab080c33, p_EntityIDFieldName := p_EntityIDFieldName_e07aab080c33, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_e07aab080c33, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_e07aab080c33, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_e07aab080c33, p_Status := p_Status_e07aab080c33, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_e07aab080c33, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_e07aab080c33, p_AutoUpdateCategory := p_AutoUpdateCategory_e07aab080c33, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_e07aab080c33, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_e07aab080c33, p_Encrypt := p_Encrypt_e07aab080c33, p_EncryptionKeyID := p_EncryptionKeyID_e07aab080c33, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_e07aab080c33, p_SendEncryptedValue := p_SendEncryptedValue_e07aab080c33, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_e07aab080c33, p_IsSoftForeignKey := p_IsSoftForeignKey_e07aab080c33, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_e07aab080c33, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_e07aab080c33, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_e07aab080c33, p_JSONTypeDefinition := p_JSONTypeDefinition_e07aab080c33, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_e07aab080c33, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_e07aab080c33, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_e07aab080c33, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_e07aab080c33, p_IsComputed := p_IsComputed_e07aab080c33, p_EmbeddedRecord := p_EmbeddedRecord_e07aab080c33, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_e07aab080c33, p_Configuration_Clear := TRUE, p_ID := p_ID_e07aab080c33);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_a6e9aaf45576 VARCHAR(255);
  p_Description_a6e9aaf45576 TEXT;
  p_AutoUpdateDescription_a6e9aaf45576 BOOLEAN;
  p_IsPrimaryKey_a6e9aaf45576 BOOLEAN;
  p_IsUnique_a6e9aaf45576 BOOLEAN;
  p_Category_a6e9aaf45576 VARCHAR(255);
  p_ValueListType_a6e9aaf45576 VARCHAR(20);
  p_ExtendedType_a6e9aaf45576 VARCHAR(50);
  p_CodeType_a6e9aaf45576 VARCHAR(50);
  p_DefaultInView_a6e9aaf45576 BOOLEAN;
  p_ViewCellTemplate_a6e9aaf45576 TEXT;
  p_DefaultColumnWidth_a6e9aaf45576 INTEGER;
  p_AllowUpdateAPI_a6e9aaf45576 BOOLEAN;
  p_AllowUpdateInView_a6e9aaf45576 BOOLEAN;
  p_IncludeInUserSearchAPI_a6e9aaf45576 BOOLEAN;
  p_FullTextSearchEnabled_a6e9aaf45576 BOOLEAN;
  p_UserSearchParamFormatAPI_a6e9aaf45576 VARCHAR(500);
  p_IncludeInGeneratedForm_a6e9aaf45576 BOOLEAN;
  p_GeneratedFormSection_a6e9aaf45576 VARCHAR(10);
  p_IsNameField_a6e9aaf45576 BOOLEAN;
  p_RelatedEntityID_a6e9aaf45576 UUID;
  p_RelatedEntityFieldName_a6e9aaf45576 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_a6e9aaf45576 BOOLEAN;
  p_RelatedEntityNameFieldMap_a6e9aaf45576 VARCHAR(255);
  p_RelatedEntityDisplayType_a6e9aaf45576 VARCHAR(20);
  p_EntityIDFieldName_a6e9aaf45576 VARCHAR(100);
  p_ScopeDefault_a6e9aaf45576 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_a6e9aaf45576 BOOLEAN;
  p_ValuesToPackWithSchema_a6e9aaf45576 VARCHAR(10);
  p_Status_a6e9aaf45576 VARCHAR(25);
  p_AutoUpdateIsNameField_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateDefaultInView_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateCategory_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateDisplayName_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_a6e9aaf45576 BOOLEAN;
  p_Encrypt_a6e9aaf45576 BOOLEAN;
  p_EncryptionKeyID_a6e9aaf45576 UUID;
  p_AllowDecryptInAPI_a6e9aaf45576 BOOLEAN;
  p_SendEncryptedValue_a6e9aaf45576 BOOLEAN;
  p_IsSoftPrimaryKey_a6e9aaf45576 BOOLEAN;
  p_IsSoftForeignKey_a6e9aaf45576 BOOLEAN;
  p_RelatedEntityJoinFields_a6e9aaf45576 TEXT;
  p_JSONType_a6e9aaf45576 VARCHAR(255);
  p_JSONTypeIsArray_a6e9aaf45576 BOOLEAN;
  p_JSONTypeDefinition_a6e9aaf45576 TEXT;
  p_UserSearchPredicateAPI_a6e9aaf45576 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateFullTextSearch_a6e9aaf45576 BOOLEAN;
  p_AutoUpdateExtendedType_a6e9aaf45576 BOOLEAN;
  p_IsComputed_a6e9aaf45576 BOOLEAN;
  p_EmbeddedRecord_a6e9aaf45576 TEXT;
  p_Configuration_a6e9aaf45576 TEXT;
  p_ID_a6e9aaf45576 UUID;
BEGIN
  p_DisplayName_a6e9aaf45576 := 'Schedule Reduction';
  p_AutoUpdateDescription_a6e9aaf45576 := TRUE;
  p_IsPrimaryKey_a6e9aaf45576 := FALSE;
  p_IsUnique_a6e9aaf45576 := FALSE;
  p_Category_a6e9aaf45576 := 'Order Lines';
  p_ValueListType_a6e9aaf45576 := 'None';
  p_DefaultInView_a6e9aaf45576 := FALSE;
  p_DefaultColumnWidth_a6e9aaf45576 := 150;
  p_AllowUpdateAPI_a6e9aaf45576 := TRUE;
  p_AllowUpdateInView_a6e9aaf45576 := TRUE;
  p_IncludeInUserSearchAPI_a6e9aaf45576 := FALSE;
  p_FullTextSearchEnabled_a6e9aaf45576 := FALSE;
  p_IncludeInGeneratedForm_a6e9aaf45576 := TRUE;
  p_GeneratedFormSection_a6e9aaf45576 := 'Category';
  p_IsNameField_a6e9aaf45576 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_a6e9aaf45576 := FALSE;
  p_RelatedEntityDisplayType_a6e9aaf45576 := 'Search';
  p_AutoUpdateRelatedEntityInfo_a6e9aaf45576 := TRUE;
  p_ValuesToPackWithSchema_a6e9aaf45576 := 'Auto';
  p_Status_a6e9aaf45576 := 'Active';
  p_AutoUpdateIsNameField_a6e9aaf45576 := TRUE;
  p_AutoUpdateDefaultInView_a6e9aaf45576 := TRUE;
  p_AutoUpdateCategory_a6e9aaf45576 := TRUE;
  p_AutoUpdateDisplayName_a6e9aaf45576 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_a6e9aaf45576 := TRUE;
  p_Encrypt_a6e9aaf45576 := FALSE;
  p_AllowDecryptInAPI_a6e9aaf45576 := FALSE;
  p_SendEncryptedValue_a6e9aaf45576 := FALSE;
  p_IsSoftPrimaryKey_a6e9aaf45576 := FALSE;
  p_IsSoftForeignKey_a6e9aaf45576 := FALSE;
  p_JSONTypeIsArray_a6e9aaf45576 := FALSE;
  p_UserSearchPredicateAPI_a6e9aaf45576 := 'Contains';
  p_AutoUpdateUserSearchPredicate_a6e9aaf45576 := TRUE;
  p_AutoUpdateFullTextSearch_a6e9aaf45576 := TRUE;
  p_AutoUpdateExtendedType_a6e9aaf45576 := TRUE;
  p_IsComputed_a6e9aaf45576 := FALSE;
  p_ID_a6e9aaf45576 := '7BAAB6D0-D09B-427F-8038-66D66FA251B8';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_a6e9aaf45576,
    'Description', p_Description_a6e9aaf45576,
    'AutoUpdateDescription', p_AutoUpdateDescription_a6e9aaf45576,
    'IsPrimaryKey', p_IsPrimaryKey_a6e9aaf45576,
    'IsUnique', p_IsUnique_a6e9aaf45576,
    'Category', p_Category_a6e9aaf45576,
    'ValueListType', p_ValueListType_a6e9aaf45576,
    'ExtendedType', p_ExtendedType_a6e9aaf45576,
    'CodeType', p_CodeType_a6e9aaf45576,
    'DefaultInView', p_DefaultInView_a6e9aaf45576,
    'ViewCellTemplate', p_ViewCellTemplate_a6e9aaf45576,
    'DefaultColumnWidth', p_DefaultColumnWidth_a6e9aaf45576,
    'AllowUpdateAPI', p_AllowUpdateAPI_a6e9aaf45576,
    'AllowUpdateInView', p_AllowUpdateInView_a6e9aaf45576,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_a6e9aaf45576,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_a6e9aaf45576,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_a6e9aaf45576,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_a6e9aaf45576,
    'GeneratedFormSection', p_GeneratedFormSection_a6e9aaf45576,
    'IsNameField', p_IsNameField_a6e9aaf45576,
    'RelatedEntityID', p_RelatedEntityID_a6e9aaf45576,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_a6e9aaf45576,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_a6e9aaf45576,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_a6e9aaf45576,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_a6e9aaf45576,
    'EntityIDFieldName', p_EntityIDFieldName_a6e9aaf45576,
    'ScopeDefault', p_ScopeDefault_a6e9aaf45576,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_a6e9aaf45576,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_a6e9aaf45576,
    'Status', p_Status_a6e9aaf45576,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_a6e9aaf45576,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_a6e9aaf45576,
    'AutoUpdateCategory', p_AutoUpdateCategory_a6e9aaf45576,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_a6e9aaf45576,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_a6e9aaf45576,
    'Encrypt', p_Encrypt_a6e9aaf45576,
    'EncryptionKeyID', p_EncryptionKeyID_a6e9aaf45576,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_a6e9aaf45576,
    'SendEncryptedValue', p_SendEncryptedValue_a6e9aaf45576,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_a6e9aaf45576,
    'IsSoftForeignKey', p_IsSoftForeignKey_a6e9aaf45576,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_a6e9aaf45576,
    'JSONType', p_JSONType_a6e9aaf45576,
    'JSONTypeIsArray', p_JSONTypeIsArray_a6e9aaf45576,
    'JSONTypeDefinition', p_JSONTypeDefinition_a6e9aaf45576,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_a6e9aaf45576,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_a6e9aaf45576,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_a6e9aaf45576,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_a6e9aaf45576,
    'IsComputed', p_IsComputed_a6e9aaf45576
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_a6e9aaf45576,
    'Configuration', p_Configuration_a6e9aaf45576,
    'ID', p_ID_a6e9aaf45576
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_a6e9aaf45576, p_Description := p_Description_a6e9aaf45576, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_a6e9aaf45576, p_IsPrimaryKey := p_IsPrimaryKey_a6e9aaf45576, p_IsUnique := p_IsUnique_a6e9aaf45576, p_Category := p_Category_a6e9aaf45576, p_ValueListType := p_ValueListType_a6e9aaf45576, p_ExtendedType := p_ExtendedType_a6e9aaf45576, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_a6e9aaf45576, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_a6e9aaf45576, p_ViewCellTemplate := p_ViewCellTemplate_a6e9aaf45576, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_a6e9aaf45576, p_AllowUpdateAPI := p_AllowUpdateAPI_a6e9aaf45576, p_AllowUpdateInView := p_AllowUpdateInView_a6e9aaf45576, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_a6e9aaf45576, p_FullTextSearchEnabled := p_FullTextSearchEnabled_a6e9aaf45576, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_a6e9aaf45576, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_a6e9aaf45576, p_GeneratedFormSection := p_GeneratedFormSection_a6e9aaf45576, p_IsNameField := p_IsNameField_a6e9aaf45576, p_RelatedEntityID := p_RelatedEntityID_a6e9aaf45576, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_a6e9aaf45576, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_a6e9aaf45576, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_a6e9aaf45576, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_a6e9aaf45576, p_EntityIDFieldName := p_EntityIDFieldName_a6e9aaf45576, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_a6e9aaf45576, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_a6e9aaf45576, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_a6e9aaf45576, p_Status := p_Status_a6e9aaf45576, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_a6e9aaf45576, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_a6e9aaf45576, p_AutoUpdateCategory := p_AutoUpdateCategory_a6e9aaf45576, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_a6e9aaf45576, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_a6e9aaf45576, p_Encrypt := p_Encrypt_a6e9aaf45576, p_EncryptionKeyID := p_EncryptionKeyID_a6e9aaf45576, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_a6e9aaf45576, p_SendEncryptedValue := p_SendEncryptedValue_a6e9aaf45576, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_a6e9aaf45576, p_IsSoftForeignKey := p_IsSoftForeignKey_a6e9aaf45576, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_a6e9aaf45576, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_a6e9aaf45576, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_a6e9aaf45576, p_JSONTypeDefinition := p_JSONTypeDefinition_a6e9aaf45576, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_a6e9aaf45576, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_a6e9aaf45576, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_a6e9aaf45576, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_a6e9aaf45576, p_IsComputed := p_IsComputed_a6e9aaf45576, p_EmbeddedRecord := p_EmbeddedRecord_a6e9aaf45576, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_a6e9aaf45576, p_Configuration_Clear := TRUE, p_ID := p_ID_a6e9aaf45576);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_675957323110 VARCHAR(255);
  p_Description_675957323110 TEXT;
  p_AutoUpdateDescription_675957323110 BOOLEAN;
  p_IsPrimaryKey_675957323110 BOOLEAN;
  p_IsUnique_675957323110 BOOLEAN;
  p_Category_675957323110 VARCHAR(255);
  p_ValueListType_675957323110 VARCHAR(20);
  p_ExtendedType_675957323110 VARCHAR(50);
  p_CodeType_675957323110 VARCHAR(50);
  p_DefaultInView_675957323110 BOOLEAN;
  p_ViewCellTemplate_675957323110 TEXT;
  p_DefaultColumnWidth_675957323110 INTEGER;
  p_AllowUpdateAPI_675957323110 BOOLEAN;
  p_AllowUpdateInView_675957323110 BOOLEAN;
  p_IncludeInUserSearchAPI_675957323110 BOOLEAN;
  p_FullTextSearchEnabled_675957323110 BOOLEAN;
  p_UserSearchParamFormatAPI_675957323110 VARCHAR(500);
  p_IncludeInGeneratedForm_675957323110 BOOLEAN;
  p_GeneratedFormSection_675957323110 VARCHAR(10);
  p_IsNameField_675957323110 BOOLEAN;
  p_RelatedEntityID_675957323110 UUID;
  p_RelatedEntityFieldName_675957323110 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_675957323110 BOOLEAN;
  p_RelatedEntityNameFieldMap_675957323110 VARCHAR(255);
  p_RelatedEntityDisplayType_675957323110 VARCHAR(20);
  p_EntityIDFieldName_675957323110 VARCHAR(100);
  p_ScopeDefault_675957323110 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_675957323110 BOOLEAN;
  p_ValuesToPackWithSchema_675957323110 VARCHAR(10);
  p_Status_675957323110 VARCHAR(25);
  p_AutoUpdateIsNameField_675957323110 BOOLEAN;
  p_AutoUpdateDefaultInView_675957323110 BOOLEAN;
  p_AutoUpdateCategory_675957323110 BOOLEAN;
  p_AutoUpdateDisplayName_675957323110 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_675957323110 BOOLEAN;
  p_Encrypt_675957323110 BOOLEAN;
  p_EncryptionKeyID_675957323110 UUID;
  p_AllowDecryptInAPI_675957323110 BOOLEAN;
  p_SendEncryptedValue_675957323110 BOOLEAN;
  p_IsSoftPrimaryKey_675957323110 BOOLEAN;
  p_IsSoftForeignKey_675957323110 BOOLEAN;
  p_RelatedEntityJoinFields_675957323110 TEXT;
  p_JSONType_675957323110 VARCHAR(255);
  p_JSONTypeIsArray_675957323110 BOOLEAN;
  p_JSONTypeDefinition_675957323110 TEXT;
  p_UserSearchPredicateAPI_675957323110 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_675957323110 BOOLEAN;
  p_AutoUpdateFullTextSearch_675957323110 BOOLEAN;
  p_AutoUpdateExtendedType_675957323110 BOOLEAN;
  p_IsComputed_675957323110 BOOLEAN;
  p_EmbeddedRecord_675957323110 TEXT;
  p_Configuration_675957323110 TEXT;
  p_ID_675957323110 UUID;
BEGIN
  p_DisplayName_675957323110 := 'Credit Memo Amount';
  p_AutoUpdateDescription_675957323110 := TRUE;
  p_IsPrimaryKey_675957323110 := FALSE;
  p_IsUnique_675957323110 := FALSE;
  p_Category_675957323110 := 'Order Lines';
  p_ValueListType_675957323110 := 'None';
  p_DefaultInView_675957323110 := FALSE;
  p_DefaultColumnWidth_675957323110 := 150;
  p_AllowUpdateAPI_675957323110 := TRUE;
  p_AllowUpdateInView_675957323110 := TRUE;
  p_IncludeInUserSearchAPI_675957323110 := FALSE;
  p_FullTextSearchEnabled_675957323110 := FALSE;
  p_IncludeInGeneratedForm_675957323110 := TRUE;
  p_GeneratedFormSection_675957323110 := 'Category';
  p_IsNameField_675957323110 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_675957323110 := FALSE;
  p_RelatedEntityDisplayType_675957323110 := 'Search';
  p_AutoUpdateRelatedEntityInfo_675957323110 := TRUE;
  p_ValuesToPackWithSchema_675957323110 := 'Auto';
  p_Status_675957323110 := 'Active';
  p_AutoUpdateIsNameField_675957323110 := TRUE;
  p_AutoUpdateDefaultInView_675957323110 := TRUE;
  p_AutoUpdateCategory_675957323110 := TRUE;
  p_AutoUpdateDisplayName_675957323110 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_675957323110 := TRUE;
  p_Encrypt_675957323110 := FALSE;
  p_AllowDecryptInAPI_675957323110 := FALSE;
  p_SendEncryptedValue_675957323110 := FALSE;
  p_IsSoftPrimaryKey_675957323110 := FALSE;
  p_IsSoftForeignKey_675957323110 := FALSE;
  p_JSONTypeIsArray_675957323110 := FALSE;
  p_UserSearchPredicateAPI_675957323110 := 'Contains';
  p_AutoUpdateUserSearchPredicate_675957323110 := TRUE;
  p_AutoUpdateFullTextSearch_675957323110 := TRUE;
  p_AutoUpdateExtendedType_675957323110 := TRUE;
  p_IsComputed_675957323110 := FALSE;
  p_ID_675957323110 := '70F42909-7DE7-44CC-BA82-FDB03E13D161';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_675957323110,
    'Description', p_Description_675957323110,
    'AutoUpdateDescription', p_AutoUpdateDescription_675957323110,
    'IsPrimaryKey', p_IsPrimaryKey_675957323110,
    'IsUnique', p_IsUnique_675957323110,
    'Category', p_Category_675957323110,
    'ValueListType', p_ValueListType_675957323110,
    'ExtendedType', p_ExtendedType_675957323110,
    'CodeType', p_CodeType_675957323110,
    'DefaultInView', p_DefaultInView_675957323110,
    'ViewCellTemplate', p_ViewCellTemplate_675957323110,
    'DefaultColumnWidth', p_DefaultColumnWidth_675957323110,
    'AllowUpdateAPI', p_AllowUpdateAPI_675957323110,
    'AllowUpdateInView', p_AllowUpdateInView_675957323110,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_675957323110,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_675957323110,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_675957323110,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_675957323110,
    'GeneratedFormSection', p_GeneratedFormSection_675957323110,
    'IsNameField', p_IsNameField_675957323110,
    'RelatedEntityID', p_RelatedEntityID_675957323110,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_675957323110,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_675957323110,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_675957323110,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_675957323110,
    'EntityIDFieldName', p_EntityIDFieldName_675957323110,
    'ScopeDefault', p_ScopeDefault_675957323110,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_675957323110,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_675957323110,
    'Status', p_Status_675957323110,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_675957323110,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_675957323110,
    'AutoUpdateCategory', p_AutoUpdateCategory_675957323110,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_675957323110,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_675957323110,
    'Encrypt', p_Encrypt_675957323110,
    'EncryptionKeyID', p_EncryptionKeyID_675957323110,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_675957323110,
    'SendEncryptedValue', p_SendEncryptedValue_675957323110,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_675957323110,
    'IsSoftForeignKey', p_IsSoftForeignKey_675957323110,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_675957323110,
    'JSONType', p_JSONType_675957323110,
    'JSONTypeIsArray', p_JSONTypeIsArray_675957323110,
    'JSONTypeDefinition', p_JSONTypeDefinition_675957323110,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_675957323110,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_675957323110,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_675957323110,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_675957323110,
    'IsComputed', p_IsComputed_675957323110
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_675957323110,
    'Configuration', p_Configuration_675957323110,
    'ID', p_ID_675957323110
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_675957323110, p_Description := p_Description_675957323110, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_675957323110, p_IsPrimaryKey := p_IsPrimaryKey_675957323110, p_IsUnique := p_IsUnique_675957323110, p_Category := p_Category_675957323110, p_ValueListType := p_ValueListType_675957323110, p_ExtendedType := p_ExtendedType_675957323110, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_675957323110, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_675957323110, p_ViewCellTemplate := p_ViewCellTemplate_675957323110, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_675957323110, p_AllowUpdateAPI := p_AllowUpdateAPI_675957323110, p_AllowUpdateInView := p_AllowUpdateInView_675957323110, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_675957323110, p_FullTextSearchEnabled := p_FullTextSearchEnabled_675957323110, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_675957323110, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_675957323110, p_GeneratedFormSection := p_GeneratedFormSection_675957323110, p_IsNameField := p_IsNameField_675957323110, p_RelatedEntityID := p_RelatedEntityID_675957323110, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_675957323110, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_675957323110, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_675957323110, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_675957323110, p_EntityIDFieldName := p_EntityIDFieldName_675957323110, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_675957323110, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_675957323110, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_675957323110, p_Status := p_Status_675957323110, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_675957323110, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_675957323110, p_AutoUpdateCategory := p_AutoUpdateCategory_675957323110, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_675957323110, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_675957323110, p_Encrypt := p_Encrypt_675957323110, p_EncryptionKeyID := p_EncryptionKeyID_675957323110, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_675957323110, p_SendEncryptedValue := p_SendEncryptedValue_675957323110, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_675957323110, p_IsSoftForeignKey := p_IsSoftForeignKey_675957323110, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_675957323110, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_675957323110, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_675957323110, p_JSONTypeDefinition := p_JSONTypeDefinition_675957323110, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_675957323110, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_675957323110, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_675957323110, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_675957323110, p_IsComputed := p_IsComputed_675957323110, p_EmbeddedRecord := p_EmbeddedRecord_675957323110, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_675957323110, p_Configuration_Clear := TRUE, p_ID := p_ID_675957323110);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_f7c189cfb0a7 VARCHAR(255);
  p_Description_f7c189cfb0a7 TEXT;
  p_AutoUpdateDescription_f7c189cfb0a7 BOOLEAN;
  p_IsPrimaryKey_f7c189cfb0a7 BOOLEAN;
  p_IsUnique_f7c189cfb0a7 BOOLEAN;
  p_Category_f7c189cfb0a7 VARCHAR(255);
  p_ValueListType_f7c189cfb0a7 VARCHAR(20);
  p_ExtendedType_f7c189cfb0a7 VARCHAR(50);
  p_CodeType_f7c189cfb0a7 VARCHAR(50);
  p_DefaultInView_f7c189cfb0a7 BOOLEAN;
  p_ViewCellTemplate_f7c189cfb0a7 TEXT;
  p_DefaultColumnWidth_f7c189cfb0a7 INTEGER;
  p_AllowUpdateAPI_f7c189cfb0a7 BOOLEAN;
  p_AllowUpdateInView_f7c189cfb0a7 BOOLEAN;
  p_IncludeInUserSearchAPI_f7c189cfb0a7 BOOLEAN;
  p_FullTextSearchEnabled_f7c189cfb0a7 BOOLEAN;
  p_UserSearchParamFormatAPI_f7c189cfb0a7 VARCHAR(500);
  p_IncludeInGeneratedForm_f7c189cfb0a7 BOOLEAN;
  p_GeneratedFormSection_f7c189cfb0a7 VARCHAR(10);
  p_IsNameField_f7c189cfb0a7 BOOLEAN;
  p_RelatedEntityID_f7c189cfb0a7 UUID;
  p_RelatedEntityFieldName_f7c189cfb0a7 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_f7c189cfb0a7 BOOLEAN;
  p_RelatedEntityNameFieldMap_f7c189cfb0a7 VARCHAR(255);
  p_RelatedEntityDisplayType_f7c189cfb0a7 VARCHAR(20);
  p_EntityIDFieldName_f7c189cfb0a7 VARCHAR(100);
  p_ScopeDefault_f7c189cfb0a7 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_f7c189cfb0a7 BOOLEAN;
  p_ValuesToPackWithSchema_f7c189cfb0a7 VARCHAR(10);
  p_Status_f7c189cfb0a7 VARCHAR(25);
  p_AutoUpdateIsNameField_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateDefaultInView_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateCategory_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateDisplayName_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_f7c189cfb0a7 BOOLEAN;
  p_Encrypt_f7c189cfb0a7 BOOLEAN;
  p_EncryptionKeyID_f7c189cfb0a7 UUID;
  p_AllowDecryptInAPI_f7c189cfb0a7 BOOLEAN;
  p_SendEncryptedValue_f7c189cfb0a7 BOOLEAN;
  p_IsSoftPrimaryKey_f7c189cfb0a7 BOOLEAN;
  p_IsSoftForeignKey_f7c189cfb0a7 BOOLEAN;
  p_RelatedEntityJoinFields_f7c189cfb0a7 TEXT;
  p_JSONType_f7c189cfb0a7 VARCHAR(255);
  p_JSONTypeIsArray_f7c189cfb0a7 BOOLEAN;
  p_JSONTypeDefinition_f7c189cfb0a7 TEXT;
  p_UserSearchPredicateAPI_f7c189cfb0a7 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateFullTextSearch_f7c189cfb0a7 BOOLEAN;
  p_AutoUpdateExtendedType_f7c189cfb0a7 BOOLEAN;
  p_IsComputed_f7c189cfb0a7 BOOLEAN;
  p_EmbeddedRecord_f7c189cfb0a7 TEXT;
  p_Configuration_f7c189cfb0a7 TEXT;
  p_ID_f7c189cfb0a7 UUID;
BEGIN
  p_DisplayName_f7c189cfb0a7 := 'Order Header Payment Schedule ID';
  p_Description_f7c189cfb0a7 := 'The invoiced instalment.';
  p_AutoUpdateDescription_f7c189cfb0a7 := TRUE;
  p_IsPrimaryKey_f7c189cfb0a7 := FALSE;
  p_IsUnique_f7c189cfb0a7 := TRUE;
  p_Category_f7c189cfb0a7 := 'Instalment';
  p_ValueListType_f7c189cfb0a7 := 'None';
  p_DefaultInView_f7c189cfb0a7 := FALSE;
  p_DefaultColumnWidth_f7c189cfb0a7 := 150;
  p_AllowUpdateAPI_f7c189cfb0a7 := TRUE;
  p_AllowUpdateInView_f7c189cfb0a7 := TRUE;
  p_IncludeInUserSearchAPI_f7c189cfb0a7 := FALSE;
  p_FullTextSearchEnabled_f7c189cfb0a7 := FALSE;
  p_IncludeInGeneratedForm_f7c189cfb0a7 := TRUE;
  p_GeneratedFormSection_f7c189cfb0a7 := 'Category';
  p_IsNameField_f7c189cfb0a7 := FALSE;
  p_RelatedEntityID_f7c189cfb0a7 := 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560';
  p_RelatedEntityFieldName_f7c189cfb0a7 := 'ID';
  p_IncludeRelatedEntityNameFieldInBaseView_f7c189cfb0a7 := TRUE;
  p_RelatedEntityDisplayType_f7c189cfb0a7 := 'Search';
  p_AutoUpdateRelatedEntityInfo_f7c189cfb0a7 := TRUE;
  p_ValuesToPackWithSchema_f7c189cfb0a7 := 'Auto';
  p_Status_f7c189cfb0a7 := 'Active';
  p_AutoUpdateIsNameField_f7c189cfb0a7 := TRUE;
  p_AutoUpdateDefaultInView_f7c189cfb0a7 := TRUE;
  p_AutoUpdateCategory_f7c189cfb0a7 := TRUE;
  p_AutoUpdateDisplayName_f7c189cfb0a7 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_f7c189cfb0a7 := TRUE;
  p_Encrypt_f7c189cfb0a7 := FALSE;
  p_AllowDecryptInAPI_f7c189cfb0a7 := FALSE;
  p_SendEncryptedValue_f7c189cfb0a7 := FALSE;
  p_IsSoftPrimaryKey_f7c189cfb0a7 := FALSE;
  p_IsSoftForeignKey_f7c189cfb0a7 := FALSE;
  p_JSONTypeIsArray_f7c189cfb0a7 := FALSE;
  p_UserSearchPredicateAPI_f7c189cfb0a7 := 'Contains';
  p_AutoUpdateUserSearchPredicate_f7c189cfb0a7 := TRUE;
  p_AutoUpdateFullTextSearch_f7c189cfb0a7 := TRUE;
  p_AutoUpdateExtendedType_f7c189cfb0a7 := TRUE;
  p_IsComputed_f7c189cfb0a7 := FALSE;
  p_ID_f7c189cfb0a7 := 'C214DDC8-090D-4EFB-80EF-C34CD2D91F2D';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_f7c189cfb0a7,
    'Description', p_Description_f7c189cfb0a7,
    'AutoUpdateDescription', p_AutoUpdateDescription_f7c189cfb0a7,
    'IsPrimaryKey', p_IsPrimaryKey_f7c189cfb0a7,
    'IsUnique', p_IsUnique_f7c189cfb0a7,
    'Category', p_Category_f7c189cfb0a7,
    'ValueListType', p_ValueListType_f7c189cfb0a7,
    'ExtendedType', p_ExtendedType_f7c189cfb0a7,
    'CodeType', p_CodeType_f7c189cfb0a7,
    'DefaultInView', p_DefaultInView_f7c189cfb0a7,
    'ViewCellTemplate', p_ViewCellTemplate_f7c189cfb0a7,
    'DefaultColumnWidth', p_DefaultColumnWidth_f7c189cfb0a7,
    'AllowUpdateAPI', p_AllowUpdateAPI_f7c189cfb0a7,
    'AllowUpdateInView', p_AllowUpdateInView_f7c189cfb0a7,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_f7c189cfb0a7,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_f7c189cfb0a7,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_f7c189cfb0a7,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_f7c189cfb0a7,
    'GeneratedFormSection', p_GeneratedFormSection_f7c189cfb0a7,
    'IsNameField', p_IsNameField_f7c189cfb0a7,
    'RelatedEntityID', p_RelatedEntityID_f7c189cfb0a7,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_f7c189cfb0a7,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_f7c189cfb0a7,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_f7c189cfb0a7,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_f7c189cfb0a7,
    'EntityIDFieldName', p_EntityIDFieldName_f7c189cfb0a7,
    'ScopeDefault', p_ScopeDefault_f7c189cfb0a7,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_f7c189cfb0a7,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_f7c189cfb0a7,
    'Status', p_Status_f7c189cfb0a7,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_f7c189cfb0a7,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_f7c189cfb0a7,
    'AutoUpdateCategory', p_AutoUpdateCategory_f7c189cfb0a7,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_f7c189cfb0a7,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_f7c189cfb0a7,
    'Encrypt', p_Encrypt_f7c189cfb0a7,
    'EncryptionKeyID', p_EncryptionKeyID_f7c189cfb0a7,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_f7c189cfb0a7,
    'SendEncryptedValue', p_SendEncryptedValue_f7c189cfb0a7,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_f7c189cfb0a7,
    'IsSoftForeignKey', p_IsSoftForeignKey_f7c189cfb0a7,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_f7c189cfb0a7,
    'JSONType', p_JSONType_f7c189cfb0a7,
    'JSONTypeIsArray', p_JSONTypeIsArray_f7c189cfb0a7,
    'JSONTypeDefinition', p_JSONTypeDefinition_f7c189cfb0a7,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_f7c189cfb0a7,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_f7c189cfb0a7,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_f7c189cfb0a7,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_f7c189cfb0a7,
    'IsComputed', p_IsComputed_f7c189cfb0a7
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_f7c189cfb0a7,
    'Configuration', p_Configuration_f7c189cfb0a7,
    'ID', p_ID_f7c189cfb0a7
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_f7c189cfb0a7, p_Description := p_Description_f7c189cfb0a7, p_AutoUpdateDescription := p_AutoUpdateDescription_f7c189cfb0a7, p_IsPrimaryKey := p_IsPrimaryKey_f7c189cfb0a7, p_IsUnique := p_IsUnique_f7c189cfb0a7, p_Category := p_Category_f7c189cfb0a7, p_ValueListType := p_ValueListType_f7c189cfb0a7, p_ExtendedType := p_ExtendedType_f7c189cfb0a7, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_f7c189cfb0a7, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_f7c189cfb0a7, p_ViewCellTemplate := p_ViewCellTemplate_f7c189cfb0a7, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_f7c189cfb0a7, p_AllowUpdateAPI := p_AllowUpdateAPI_f7c189cfb0a7, p_AllowUpdateInView := p_AllowUpdateInView_f7c189cfb0a7, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_f7c189cfb0a7, p_FullTextSearchEnabled := p_FullTextSearchEnabled_f7c189cfb0a7, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_f7c189cfb0a7, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_f7c189cfb0a7, p_GeneratedFormSection := p_GeneratedFormSection_f7c189cfb0a7, p_IsNameField := p_IsNameField_f7c189cfb0a7, p_RelatedEntityID := p_RelatedEntityID_f7c189cfb0a7, p_RelatedEntityFieldName := p_RelatedEntityFieldName_f7c189cfb0a7, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_f7c189cfb0a7, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_f7c189cfb0a7, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_f7c189cfb0a7, p_EntityIDFieldName := p_EntityIDFieldName_f7c189cfb0a7, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_f7c189cfb0a7, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_f7c189cfb0a7, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_f7c189cfb0a7, p_Status := p_Status_f7c189cfb0a7, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_f7c189cfb0a7, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_f7c189cfb0a7, p_AutoUpdateCategory := p_AutoUpdateCategory_f7c189cfb0a7, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_f7c189cfb0a7, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_f7c189cfb0a7, p_Encrypt := p_Encrypt_f7c189cfb0a7, p_EncryptionKeyID := p_EncryptionKeyID_f7c189cfb0a7, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_f7c189cfb0a7, p_SendEncryptedValue := p_SendEncryptedValue_f7c189cfb0a7, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_f7c189cfb0a7, p_IsSoftForeignKey := p_IsSoftForeignKey_f7c189cfb0a7, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_f7c189cfb0a7, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_f7c189cfb0a7, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_f7c189cfb0a7, p_JSONTypeDefinition := p_JSONTypeDefinition_f7c189cfb0a7, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_f7c189cfb0a7, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_f7c189cfb0a7, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_f7c189cfb0a7, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_f7c189cfb0a7, p_IsComputed := p_IsComputed_f7c189cfb0a7, p_EmbeddedRecord := p_EmbeddedRecord_f7c189cfb0a7, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_f7c189cfb0a7, p_Configuration_Clear := TRUE, p_ID := p_ID_f7c189cfb0a7);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_3d4d7d575adc VARCHAR(255);
  p_Description_3d4d7d575adc TEXT;
  p_AutoUpdateDescription_3d4d7d575adc BOOLEAN;
  p_IsPrimaryKey_3d4d7d575adc BOOLEAN;
  p_IsUnique_3d4d7d575adc BOOLEAN;
  p_Category_3d4d7d575adc VARCHAR(255);
  p_ValueListType_3d4d7d575adc VARCHAR(20);
  p_ExtendedType_3d4d7d575adc VARCHAR(50);
  p_CodeType_3d4d7d575adc VARCHAR(50);
  p_DefaultInView_3d4d7d575adc BOOLEAN;
  p_ViewCellTemplate_3d4d7d575adc TEXT;
  p_DefaultColumnWidth_3d4d7d575adc INTEGER;
  p_AllowUpdateAPI_3d4d7d575adc BOOLEAN;
  p_AllowUpdateInView_3d4d7d575adc BOOLEAN;
  p_IncludeInUserSearchAPI_3d4d7d575adc BOOLEAN;
  p_FullTextSearchEnabled_3d4d7d575adc BOOLEAN;
  p_UserSearchParamFormatAPI_3d4d7d575adc VARCHAR(500);
  p_IncludeInGeneratedForm_3d4d7d575adc BOOLEAN;
  p_GeneratedFormSection_3d4d7d575adc VARCHAR(10);
  p_IsNameField_3d4d7d575adc BOOLEAN;
  p_RelatedEntityID_3d4d7d575adc UUID;
  p_RelatedEntityFieldName_3d4d7d575adc VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_3d4d7d575adc BOOLEAN;
  p_RelatedEntityNameFieldMap_3d4d7d575adc VARCHAR(255);
  p_RelatedEntityDisplayType_3d4d7d575adc VARCHAR(20);
  p_EntityIDFieldName_3d4d7d575adc VARCHAR(100);
  p_ScopeDefault_3d4d7d575adc VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_3d4d7d575adc BOOLEAN;
  p_ValuesToPackWithSchema_3d4d7d575adc VARCHAR(10);
  p_Status_3d4d7d575adc VARCHAR(25);
  p_AutoUpdateIsNameField_3d4d7d575adc BOOLEAN;
  p_AutoUpdateDefaultInView_3d4d7d575adc BOOLEAN;
  p_AutoUpdateCategory_3d4d7d575adc BOOLEAN;
  p_AutoUpdateDisplayName_3d4d7d575adc BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_3d4d7d575adc BOOLEAN;
  p_Encrypt_3d4d7d575adc BOOLEAN;
  p_EncryptionKeyID_3d4d7d575adc UUID;
  p_AllowDecryptInAPI_3d4d7d575adc BOOLEAN;
  p_SendEncryptedValue_3d4d7d575adc BOOLEAN;
  p_IsSoftPrimaryKey_3d4d7d575adc BOOLEAN;
  p_IsSoftForeignKey_3d4d7d575adc BOOLEAN;
  p_RelatedEntityJoinFields_3d4d7d575adc TEXT;
  p_JSONType_3d4d7d575adc VARCHAR(255);
  p_JSONTypeIsArray_3d4d7d575adc BOOLEAN;
  p_JSONTypeDefinition_3d4d7d575adc TEXT;
  p_UserSearchPredicateAPI_3d4d7d575adc VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_3d4d7d575adc BOOLEAN;
  p_AutoUpdateFullTextSearch_3d4d7d575adc BOOLEAN;
  p_AutoUpdateExtendedType_3d4d7d575adc BOOLEAN;
  p_IsComputed_3d4d7d575adc BOOLEAN;
  p_EmbeddedRecord_3d4d7d575adc TEXT;
  p_Configuration_3d4d7d575adc TEXT;
  p_ID_3d4d7d575adc UUID;
BEGIN
  p_DisplayName_3d4d7d575adc := 'Order Line ID';
  p_Description_3d4d7d575adc := 'The line the instalment billed.';
  p_AutoUpdateDescription_3d4d7d575adc := TRUE;
  p_IsPrimaryKey_3d4d7d575adc := FALSE;
  p_IsUnique_3d4d7d575adc := TRUE;
  p_Category_3d4d7d575adc := 'Instalment';
  p_ValueListType_3d4d7d575adc := 'None';
  p_DefaultInView_3d4d7d575adc := FALSE;
  p_DefaultColumnWidth_3d4d7d575adc := 150;
  p_AllowUpdateAPI_3d4d7d575adc := TRUE;
  p_AllowUpdateInView_3d4d7d575adc := TRUE;
  p_IncludeInUserSearchAPI_3d4d7d575adc := FALSE;
  p_FullTextSearchEnabled_3d4d7d575adc := FALSE;
  p_IncludeInGeneratedForm_3d4d7d575adc := TRUE;
  p_GeneratedFormSection_3d4d7d575adc := 'Category';
  p_IsNameField_3d4d7d575adc := FALSE;
  p_RelatedEntityID_3d4d7d575adc := '66D82C24-9C9F-4CD6-B019-53C20274AB00';
  p_RelatedEntityFieldName_3d4d7d575adc := 'ID';
  p_IncludeRelatedEntityNameFieldInBaseView_3d4d7d575adc := TRUE;
  p_RelatedEntityDisplayType_3d4d7d575adc := 'Search';
  p_AutoUpdateRelatedEntityInfo_3d4d7d575adc := TRUE;
  p_ValuesToPackWithSchema_3d4d7d575adc := 'Auto';
  p_Status_3d4d7d575adc := 'Active';
  p_AutoUpdateIsNameField_3d4d7d575adc := TRUE;
  p_AutoUpdateDefaultInView_3d4d7d575adc := TRUE;
  p_AutoUpdateCategory_3d4d7d575adc := TRUE;
  p_AutoUpdateDisplayName_3d4d7d575adc := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_3d4d7d575adc := TRUE;
  p_Encrypt_3d4d7d575adc := FALSE;
  p_AllowDecryptInAPI_3d4d7d575adc := FALSE;
  p_SendEncryptedValue_3d4d7d575adc := FALSE;
  p_IsSoftPrimaryKey_3d4d7d575adc := FALSE;
  p_IsSoftForeignKey_3d4d7d575adc := FALSE;
  p_JSONTypeIsArray_3d4d7d575adc := FALSE;
  p_UserSearchPredicateAPI_3d4d7d575adc := 'Contains';
  p_AutoUpdateUserSearchPredicate_3d4d7d575adc := TRUE;
  p_AutoUpdateFullTextSearch_3d4d7d575adc := TRUE;
  p_AutoUpdateExtendedType_3d4d7d575adc := TRUE;
  p_IsComputed_3d4d7d575adc := FALSE;
  p_ID_3d4d7d575adc := '6E442307-859A-4F0A-A8B6-23B9C94FA69D';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_3d4d7d575adc,
    'Description', p_Description_3d4d7d575adc,
    'AutoUpdateDescription', p_AutoUpdateDescription_3d4d7d575adc,
    'IsPrimaryKey', p_IsPrimaryKey_3d4d7d575adc,
    'IsUnique', p_IsUnique_3d4d7d575adc,
    'Category', p_Category_3d4d7d575adc,
    'ValueListType', p_ValueListType_3d4d7d575adc,
    'ExtendedType', p_ExtendedType_3d4d7d575adc,
    'CodeType', p_CodeType_3d4d7d575adc,
    'DefaultInView', p_DefaultInView_3d4d7d575adc,
    'ViewCellTemplate', p_ViewCellTemplate_3d4d7d575adc,
    'DefaultColumnWidth', p_DefaultColumnWidth_3d4d7d575adc,
    'AllowUpdateAPI', p_AllowUpdateAPI_3d4d7d575adc,
    'AllowUpdateInView', p_AllowUpdateInView_3d4d7d575adc,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_3d4d7d575adc,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_3d4d7d575adc,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_3d4d7d575adc,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_3d4d7d575adc,
    'GeneratedFormSection', p_GeneratedFormSection_3d4d7d575adc,
    'IsNameField', p_IsNameField_3d4d7d575adc,
    'RelatedEntityID', p_RelatedEntityID_3d4d7d575adc,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_3d4d7d575adc,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_3d4d7d575adc,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_3d4d7d575adc,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_3d4d7d575adc,
    'EntityIDFieldName', p_EntityIDFieldName_3d4d7d575adc,
    'ScopeDefault', p_ScopeDefault_3d4d7d575adc,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_3d4d7d575adc,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_3d4d7d575adc,
    'Status', p_Status_3d4d7d575adc,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_3d4d7d575adc,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_3d4d7d575adc,
    'AutoUpdateCategory', p_AutoUpdateCategory_3d4d7d575adc,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_3d4d7d575adc,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_3d4d7d575adc,
    'Encrypt', p_Encrypt_3d4d7d575adc,
    'EncryptionKeyID', p_EncryptionKeyID_3d4d7d575adc,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_3d4d7d575adc,
    'SendEncryptedValue', p_SendEncryptedValue_3d4d7d575adc,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_3d4d7d575adc,
    'IsSoftForeignKey', p_IsSoftForeignKey_3d4d7d575adc,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_3d4d7d575adc,
    'JSONType', p_JSONType_3d4d7d575adc,
    'JSONTypeIsArray', p_JSONTypeIsArray_3d4d7d575adc,
    'JSONTypeDefinition', p_JSONTypeDefinition_3d4d7d575adc,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_3d4d7d575adc,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_3d4d7d575adc,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_3d4d7d575adc,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_3d4d7d575adc,
    'IsComputed', p_IsComputed_3d4d7d575adc
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_3d4d7d575adc,
    'Configuration', p_Configuration_3d4d7d575adc,
    'ID', p_ID_3d4d7d575adc
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_3d4d7d575adc, p_Description := p_Description_3d4d7d575adc, p_AutoUpdateDescription := p_AutoUpdateDescription_3d4d7d575adc, p_IsPrimaryKey := p_IsPrimaryKey_3d4d7d575adc, p_IsUnique := p_IsUnique_3d4d7d575adc, p_Category := p_Category_3d4d7d575adc, p_ValueListType := p_ValueListType_3d4d7d575adc, p_ExtendedType := p_ExtendedType_3d4d7d575adc, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_3d4d7d575adc, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_3d4d7d575adc, p_ViewCellTemplate := p_ViewCellTemplate_3d4d7d575adc, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_3d4d7d575adc, p_AllowUpdateAPI := p_AllowUpdateAPI_3d4d7d575adc, p_AllowUpdateInView := p_AllowUpdateInView_3d4d7d575adc, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_3d4d7d575adc, p_FullTextSearchEnabled := p_FullTextSearchEnabled_3d4d7d575adc, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_3d4d7d575adc, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_3d4d7d575adc, p_GeneratedFormSection := p_GeneratedFormSection_3d4d7d575adc, p_IsNameField := p_IsNameField_3d4d7d575adc, p_RelatedEntityID := p_RelatedEntityID_3d4d7d575adc, p_RelatedEntityFieldName := p_RelatedEntityFieldName_3d4d7d575adc, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_3d4d7d575adc, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_3d4d7d575adc, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_3d4d7d575adc, p_EntityIDFieldName := p_EntityIDFieldName_3d4d7d575adc, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_3d4d7d575adc, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_3d4d7d575adc, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_3d4d7d575adc, p_Status := p_Status_3d4d7d575adc, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_3d4d7d575adc, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_3d4d7d575adc, p_AutoUpdateCategory := p_AutoUpdateCategory_3d4d7d575adc, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_3d4d7d575adc, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_3d4d7d575adc, p_Encrypt := p_Encrypt_3d4d7d575adc, p_EncryptionKeyID := p_EncryptionKeyID_3d4d7d575adc, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_3d4d7d575adc, p_SendEncryptedValue := p_SendEncryptedValue_3d4d7d575adc, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_3d4d7d575adc, p_IsSoftForeignKey := p_IsSoftForeignKey_3d4d7d575adc, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_3d4d7d575adc, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_3d4d7d575adc, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_3d4d7d575adc, p_JSONTypeDefinition := p_JSONTypeDefinition_3d4d7d575adc, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_3d4d7d575adc, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_3d4d7d575adc, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_3d4d7d575adc, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_3d4d7d575adc, p_IsComputed := p_IsComputed_3d4d7d575adc, p_EmbeddedRecord := p_EmbeddedRecord_3d4d7d575adc, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_3d4d7d575adc, p_Configuration_Clear := TRUE, p_ID := p_ID_3d4d7d575adc);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_58c8f904a940 VARCHAR(255);
  p_Description_58c8f904a940 TEXT;
  p_AutoUpdateDescription_58c8f904a940 BOOLEAN;
  p_IsPrimaryKey_58c8f904a940 BOOLEAN;
  p_IsUnique_58c8f904a940 BOOLEAN;
  p_Category_58c8f904a940 VARCHAR(255);
  p_ValueListType_58c8f904a940 VARCHAR(20);
  p_ExtendedType_58c8f904a940 VARCHAR(50);
  p_CodeType_58c8f904a940 VARCHAR(50);
  p_DefaultInView_58c8f904a940 BOOLEAN;
  p_ViewCellTemplate_58c8f904a940 TEXT;
  p_DefaultColumnWidth_58c8f904a940 INTEGER;
  p_AllowUpdateAPI_58c8f904a940 BOOLEAN;
  p_AllowUpdateInView_58c8f904a940 BOOLEAN;
  p_IncludeInUserSearchAPI_58c8f904a940 BOOLEAN;
  p_FullTextSearchEnabled_58c8f904a940 BOOLEAN;
  p_UserSearchParamFormatAPI_58c8f904a940 VARCHAR(500);
  p_IncludeInGeneratedForm_58c8f904a940 BOOLEAN;
  p_GeneratedFormSection_58c8f904a940 VARCHAR(10);
  p_IsNameField_58c8f904a940 BOOLEAN;
  p_RelatedEntityID_58c8f904a940 UUID;
  p_RelatedEntityFieldName_58c8f904a940 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_58c8f904a940 BOOLEAN;
  p_RelatedEntityNameFieldMap_58c8f904a940 VARCHAR(255);
  p_RelatedEntityDisplayType_58c8f904a940 VARCHAR(20);
  p_EntityIDFieldName_58c8f904a940 VARCHAR(100);
  p_ScopeDefault_58c8f904a940 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_58c8f904a940 BOOLEAN;
  p_ValuesToPackWithSchema_58c8f904a940 VARCHAR(10);
  p_Status_58c8f904a940 VARCHAR(25);
  p_AutoUpdateIsNameField_58c8f904a940 BOOLEAN;
  p_AutoUpdateDefaultInView_58c8f904a940 BOOLEAN;
  p_AutoUpdateCategory_58c8f904a940 BOOLEAN;
  p_AutoUpdateDisplayName_58c8f904a940 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_58c8f904a940 BOOLEAN;
  p_Encrypt_58c8f904a940 BOOLEAN;
  p_EncryptionKeyID_58c8f904a940 UUID;
  p_AllowDecryptInAPI_58c8f904a940 BOOLEAN;
  p_SendEncryptedValue_58c8f904a940 BOOLEAN;
  p_IsSoftPrimaryKey_58c8f904a940 BOOLEAN;
  p_IsSoftForeignKey_58c8f904a940 BOOLEAN;
  p_RelatedEntityJoinFields_58c8f904a940 TEXT;
  p_JSONType_58c8f904a940 VARCHAR(255);
  p_JSONTypeIsArray_58c8f904a940 BOOLEAN;
  p_JSONTypeDefinition_58c8f904a940 TEXT;
  p_UserSearchPredicateAPI_58c8f904a940 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_58c8f904a940 BOOLEAN;
  p_AutoUpdateFullTextSearch_58c8f904a940 BOOLEAN;
  p_AutoUpdateExtendedType_58c8f904a940 BOOLEAN;
  p_IsComputed_58c8f904a940 BOOLEAN;
  p_EmbeddedRecord_58c8f904a940 TEXT;
  p_Configuration_58c8f904a940 TEXT;
  p_ID_58c8f904a940 UUID;
BEGIN
  p_DisplayName_58c8f904a940 := 'Part';
  p_Description_58c8f904a940 := 'Which amount of the line: Net (before tax and charges), Unallocated (tax and charges no charge allocation covers) or Charge (one allocated charge type, named by ChargeTypeID). An instalment has at most one row per line and part.';
  p_AutoUpdateDescription_58c8f904a940 := TRUE;
  p_IsPrimaryKey_58c8f904a940 := FALSE;
  p_IsUnique_58c8f904a940 := TRUE;
  p_Category_58c8f904a940 := 'Billed Amount';
  p_ValueListType_58c8f904a940 := 'List';
  p_DefaultInView_58c8f904a940 := TRUE;
  p_DefaultColumnWidth_58c8f904a940 := 150;
  p_AllowUpdateAPI_58c8f904a940 := TRUE;
  p_AllowUpdateInView_58c8f904a940 := TRUE;
  p_IncludeInUserSearchAPI_58c8f904a940 := FALSE;
  p_FullTextSearchEnabled_58c8f904a940 := FALSE;
  p_IncludeInGeneratedForm_58c8f904a940 := TRUE;
  p_GeneratedFormSection_58c8f904a940 := 'Category';
  p_IsNameField_58c8f904a940 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_58c8f904a940 := FALSE;
  p_RelatedEntityDisplayType_58c8f904a940 := 'Search';
  p_AutoUpdateRelatedEntityInfo_58c8f904a940 := TRUE;
  p_ValuesToPackWithSchema_58c8f904a940 := 'Auto';
  p_Status_58c8f904a940 := 'Active';
  p_AutoUpdateIsNameField_58c8f904a940 := TRUE;
  p_AutoUpdateDefaultInView_58c8f904a940 := TRUE;
  p_AutoUpdateCategory_58c8f904a940 := TRUE;
  p_AutoUpdateDisplayName_58c8f904a940 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_58c8f904a940 := TRUE;
  p_Encrypt_58c8f904a940 := FALSE;
  p_AllowDecryptInAPI_58c8f904a940 := FALSE;
  p_SendEncryptedValue_58c8f904a940 := FALSE;
  p_IsSoftPrimaryKey_58c8f904a940 := FALSE;
  p_IsSoftForeignKey_58c8f904a940 := FALSE;
  p_JSONTypeIsArray_58c8f904a940 := FALSE;
  p_UserSearchPredicateAPI_58c8f904a940 := 'Contains';
  p_AutoUpdateUserSearchPredicate_58c8f904a940 := TRUE;
  p_AutoUpdateFullTextSearch_58c8f904a940 := TRUE;
  p_AutoUpdateExtendedType_58c8f904a940 := TRUE;
  p_IsComputed_58c8f904a940 := FALSE;
  p_ID_58c8f904a940 := 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_58c8f904a940,
    'Description', p_Description_58c8f904a940,
    'AutoUpdateDescription', p_AutoUpdateDescription_58c8f904a940,
    'IsPrimaryKey', p_IsPrimaryKey_58c8f904a940,
    'IsUnique', p_IsUnique_58c8f904a940,
    'Category', p_Category_58c8f904a940,
    'ValueListType', p_ValueListType_58c8f904a940,
    'ExtendedType', p_ExtendedType_58c8f904a940,
    'CodeType', p_CodeType_58c8f904a940,
    'DefaultInView', p_DefaultInView_58c8f904a940,
    'ViewCellTemplate', p_ViewCellTemplate_58c8f904a940,
    'DefaultColumnWidth', p_DefaultColumnWidth_58c8f904a940,
    'AllowUpdateAPI', p_AllowUpdateAPI_58c8f904a940,
    'AllowUpdateInView', p_AllowUpdateInView_58c8f904a940,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_58c8f904a940,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_58c8f904a940,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_58c8f904a940,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_58c8f904a940,
    'GeneratedFormSection', p_GeneratedFormSection_58c8f904a940,
    'IsNameField', p_IsNameField_58c8f904a940,
    'RelatedEntityID', p_RelatedEntityID_58c8f904a940,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_58c8f904a940,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_58c8f904a940,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_58c8f904a940,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_58c8f904a940,
    'EntityIDFieldName', p_EntityIDFieldName_58c8f904a940,
    'ScopeDefault', p_ScopeDefault_58c8f904a940,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_58c8f904a940,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_58c8f904a940,
    'Status', p_Status_58c8f904a940,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_58c8f904a940,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_58c8f904a940,
    'AutoUpdateCategory', p_AutoUpdateCategory_58c8f904a940,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_58c8f904a940,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_58c8f904a940,
    'Encrypt', p_Encrypt_58c8f904a940,
    'EncryptionKeyID', p_EncryptionKeyID_58c8f904a940,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_58c8f904a940,
    'SendEncryptedValue', p_SendEncryptedValue_58c8f904a940,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_58c8f904a940,
    'IsSoftForeignKey', p_IsSoftForeignKey_58c8f904a940,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_58c8f904a940,
    'JSONType', p_JSONType_58c8f904a940,
    'JSONTypeIsArray', p_JSONTypeIsArray_58c8f904a940,
    'JSONTypeDefinition', p_JSONTypeDefinition_58c8f904a940,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_58c8f904a940,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_58c8f904a940,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_58c8f904a940,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_58c8f904a940,
    'IsComputed', p_IsComputed_58c8f904a940
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_58c8f904a940,
    'Configuration', p_Configuration_58c8f904a940,
    'ID', p_ID_58c8f904a940
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_58c8f904a940, p_Description := p_Description_58c8f904a940, p_AutoUpdateDescription := p_AutoUpdateDescription_58c8f904a940, p_IsPrimaryKey := p_IsPrimaryKey_58c8f904a940, p_IsUnique := p_IsUnique_58c8f904a940, p_Category := p_Category_58c8f904a940, p_ValueListType := p_ValueListType_58c8f904a940, p_ExtendedType := p_ExtendedType_58c8f904a940, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_58c8f904a940, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_58c8f904a940, p_ViewCellTemplate := p_ViewCellTemplate_58c8f904a940, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_58c8f904a940, p_AllowUpdateAPI := p_AllowUpdateAPI_58c8f904a940, p_AllowUpdateInView := p_AllowUpdateInView_58c8f904a940, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_58c8f904a940, p_FullTextSearchEnabled := p_FullTextSearchEnabled_58c8f904a940, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_58c8f904a940, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_58c8f904a940, p_GeneratedFormSection := p_GeneratedFormSection_58c8f904a940, p_IsNameField := p_IsNameField_58c8f904a940, p_RelatedEntityID := p_RelatedEntityID_58c8f904a940, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_58c8f904a940, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_58c8f904a940, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_58c8f904a940, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_58c8f904a940, p_EntityIDFieldName := p_EntityIDFieldName_58c8f904a940, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_58c8f904a940, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_58c8f904a940, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_58c8f904a940, p_Status := p_Status_58c8f904a940, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_58c8f904a940, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_58c8f904a940, p_AutoUpdateCategory := p_AutoUpdateCategory_58c8f904a940, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_58c8f904a940, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_58c8f904a940, p_Encrypt := p_Encrypt_58c8f904a940, p_EncryptionKeyID := p_EncryptionKeyID_58c8f904a940, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_58c8f904a940, p_SendEncryptedValue := p_SendEncryptedValue_58c8f904a940, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_58c8f904a940, p_IsSoftForeignKey := p_IsSoftForeignKey_58c8f904a940, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_58c8f904a940, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_58c8f904a940, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_58c8f904a940, p_JSONTypeDefinition := p_JSONTypeDefinition_58c8f904a940, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_58c8f904a940, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_58c8f904a940, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_58c8f904a940, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_58c8f904a940, p_IsComputed := p_IsComputed_58c8f904a940, p_EmbeddedRecord := p_EmbeddedRecord_58c8f904a940, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_58c8f904a940, p_Configuration_Clear := TRUE, p_ID := p_ID_58c8f904a940);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_77fa78451cd5 VARCHAR(255);
  p_Description_77fa78451cd5 TEXT;
  p_AutoUpdateDescription_77fa78451cd5 BOOLEAN;
  p_IsPrimaryKey_77fa78451cd5 BOOLEAN;
  p_IsUnique_77fa78451cd5 BOOLEAN;
  p_Category_77fa78451cd5 VARCHAR(255);
  p_ValueListType_77fa78451cd5 VARCHAR(20);
  p_ExtendedType_77fa78451cd5 VARCHAR(50);
  p_CodeType_77fa78451cd5 VARCHAR(50);
  p_DefaultInView_77fa78451cd5 BOOLEAN;
  p_ViewCellTemplate_77fa78451cd5 TEXT;
  p_DefaultColumnWidth_77fa78451cd5 INTEGER;
  p_AllowUpdateAPI_77fa78451cd5 BOOLEAN;
  p_AllowUpdateInView_77fa78451cd5 BOOLEAN;
  p_IncludeInUserSearchAPI_77fa78451cd5 BOOLEAN;
  p_FullTextSearchEnabled_77fa78451cd5 BOOLEAN;
  p_UserSearchParamFormatAPI_77fa78451cd5 VARCHAR(500);
  p_IncludeInGeneratedForm_77fa78451cd5 BOOLEAN;
  p_GeneratedFormSection_77fa78451cd5 VARCHAR(10);
  p_IsNameField_77fa78451cd5 BOOLEAN;
  p_RelatedEntityID_77fa78451cd5 UUID;
  p_RelatedEntityFieldName_77fa78451cd5 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_77fa78451cd5 BOOLEAN;
  p_RelatedEntityNameFieldMap_77fa78451cd5 VARCHAR(255);
  p_RelatedEntityDisplayType_77fa78451cd5 VARCHAR(20);
  p_EntityIDFieldName_77fa78451cd5 VARCHAR(100);
  p_ScopeDefault_77fa78451cd5 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_77fa78451cd5 BOOLEAN;
  p_ValuesToPackWithSchema_77fa78451cd5 VARCHAR(10);
  p_Status_77fa78451cd5 VARCHAR(25);
  p_AutoUpdateIsNameField_77fa78451cd5 BOOLEAN;
  p_AutoUpdateDefaultInView_77fa78451cd5 BOOLEAN;
  p_AutoUpdateCategory_77fa78451cd5 BOOLEAN;
  p_AutoUpdateDisplayName_77fa78451cd5 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_77fa78451cd5 BOOLEAN;
  p_Encrypt_77fa78451cd5 BOOLEAN;
  p_EncryptionKeyID_77fa78451cd5 UUID;
  p_AllowDecryptInAPI_77fa78451cd5 BOOLEAN;
  p_SendEncryptedValue_77fa78451cd5 BOOLEAN;
  p_IsSoftPrimaryKey_77fa78451cd5 BOOLEAN;
  p_IsSoftForeignKey_77fa78451cd5 BOOLEAN;
  p_RelatedEntityJoinFields_77fa78451cd5 TEXT;
  p_JSONType_77fa78451cd5 VARCHAR(255);
  p_JSONTypeIsArray_77fa78451cd5 BOOLEAN;
  p_JSONTypeDefinition_77fa78451cd5 TEXT;
  p_UserSearchPredicateAPI_77fa78451cd5 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_77fa78451cd5 BOOLEAN;
  p_AutoUpdateFullTextSearch_77fa78451cd5 BOOLEAN;
  p_AutoUpdateExtendedType_77fa78451cd5 BOOLEAN;
  p_IsComputed_77fa78451cd5 BOOLEAN;
  p_EmbeddedRecord_77fa78451cd5 TEXT;
  p_Configuration_77fa78451cd5 TEXT;
  p_ID_77fa78451cd5 UUID;
BEGIN
  p_DisplayName_77fa78451cd5 := 'Charge Type ID';
  p_Description_77fa78451cd5 := 'For a Charge part, the charge type billed. NULL for Net and Unallocated.';
  p_AutoUpdateDescription_77fa78451cd5 := TRUE;
  p_IsPrimaryKey_77fa78451cd5 := FALSE;
  p_IsUnique_77fa78451cd5 := TRUE;
  p_Category_77fa78451cd5 := 'Billed Amount';
  p_ValueListType_77fa78451cd5 := 'None';
  p_DefaultInView_77fa78451cd5 := FALSE;
  p_DefaultColumnWidth_77fa78451cd5 := 150;
  p_AllowUpdateAPI_77fa78451cd5 := TRUE;
  p_AllowUpdateInView_77fa78451cd5 := TRUE;
  p_IncludeInUserSearchAPI_77fa78451cd5 := FALSE;
  p_FullTextSearchEnabled_77fa78451cd5 := FALSE;
  p_IncludeInGeneratedForm_77fa78451cd5 := TRUE;
  p_GeneratedFormSection_77fa78451cd5 := 'Category';
  p_IsNameField_77fa78451cd5 := FALSE;
  p_RelatedEntityID_77fa78451cd5 := '0D654D66-FC8D-4690-BF29-B497EFC6CBEC';
  p_RelatedEntityFieldName_77fa78451cd5 := 'ID';
  p_IncludeRelatedEntityNameFieldInBaseView_77fa78451cd5 := TRUE;
  p_RelatedEntityNameFieldMap_77fa78451cd5 := 'ChargeType';
  p_RelatedEntityDisplayType_77fa78451cd5 := 'Search';
  p_AutoUpdateRelatedEntityInfo_77fa78451cd5 := TRUE;
  p_ValuesToPackWithSchema_77fa78451cd5 := 'Auto';
  p_Status_77fa78451cd5 := 'Active';
  p_AutoUpdateIsNameField_77fa78451cd5 := TRUE;
  p_AutoUpdateDefaultInView_77fa78451cd5 := TRUE;
  p_AutoUpdateCategory_77fa78451cd5 := TRUE;
  p_AutoUpdateDisplayName_77fa78451cd5 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_77fa78451cd5 := TRUE;
  p_Encrypt_77fa78451cd5 := FALSE;
  p_AllowDecryptInAPI_77fa78451cd5 := FALSE;
  p_SendEncryptedValue_77fa78451cd5 := FALSE;
  p_IsSoftPrimaryKey_77fa78451cd5 := FALSE;
  p_IsSoftForeignKey_77fa78451cd5 := FALSE;
  p_JSONTypeIsArray_77fa78451cd5 := FALSE;
  p_UserSearchPredicateAPI_77fa78451cd5 := 'Contains';
  p_AutoUpdateUserSearchPredicate_77fa78451cd5 := TRUE;
  p_AutoUpdateFullTextSearch_77fa78451cd5 := TRUE;
  p_AutoUpdateExtendedType_77fa78451cd5 := TRUE;
  p_IsComputed_77fa78451cd5 := FALSE;
  p_ID_77fa78451cd5 := 'B1B6FEEE-16B1-4B9D-A348-6BBEF0D2C93C';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_77fa78451cd5,
    'Description', p_Description_77fa78451cd5,
    'AutoUpdateDescription', p_AutoUpdateDescription_77fa78451cd5,
    'IsPrimaryKey', p_IsPrimaryKey_77fa78451cd5,
    'IsUnique', p_IsUnique_77fa78451cd5,
    'Category', p_Category_77fa78451cd5,
    'ValueListType', p_ValueListType_77fa78451cd5,
    'ExtendedType', p_ExtendedType_77fa78451cd5,
    'CodeType', p_CodeType_77fa78451cd5,
    'DefaultInView', p_DefaultInView_77fa78451cd5,
    'ViewCellTemplate', p_ViewCellTemplate_77fa78451cd5,
    'DefaultColumnWidth', p_DefaultColumnWidth_77fa78451cd5,
    'AllowUpdateAPI', p_AllowUpdateAPI_77fa78451cd5,
    'AllowUpdateInView', p_AllowUpdateInView_77fa78451cd5,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_77fa78451cd5,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_77fa78451cd5,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_77fa78451cd5,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_77fa78451cd5,
    'GeneratedFormSection', p_GeneratedFormSection_77fa78451cd5,
    'IsNameField', p_IsNameField_77fa78451cd5,
    'RelatedEntityID', p_RelatedEntityID_77fa78451cd5,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_77fa78451cd5,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_77fa78451cd5,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_77fa78451cd5,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_77fa78451cd5,
    'EntityIDFieldName', p_EntityIDFieldName_77fa78451cd5,
    'ScopeDefault', p_ScopeDefault_77fa78451cd5,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_77fa78451cd5,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_77fa78451cd5,
    'Status', p_Status_77fa78451cd5,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_77fa78451cd5,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_77fa78451cd5,
    'AutoUpdateCategory', p_AutoUpdateCategory_77fa78451cd5,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_77fa78451cd5,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_77fa78451cd5,
    'Encrypt', p_Encrypt_77fa78451cd5,
    'EncryptionKeyID', p_EncryptionKeyID_77fa78451cd5,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_77fa78451cd5,
    'SendEncryptedValue', p_SendEncryptedValue_77fa78451cd5,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_77fa78451cd5,
    'IsSoftForeignKey', p_IsSoftForeignKey_77fa78451cd5,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_77fa78451cd5,
    'JSONType', p_JSONType_77fa78451cd5,
    'JSONTypeIsArray', p_JSONTypeIsArray_77fa78451cd5,
    'JSONTypeDefinition', p_JSONTypeDefinition_77fa78451cd5,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_77fa78451cd5,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_77fa78451cd5,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_77fa78451cd5,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_77fa78451cd5,
    'IsComputed', p_IsComputed_77fa78451cd5
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_77fa78451cd5,
    'Configuration', p_Configuration_77fa78451cd5,
    'ID', p_ID_77fa78451cd5
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_77fa78451cd5, p_Description := p_Description_77fa78451cd5, p_AutoUpdateDescription := p_AutoUpdateDescription_77fa78451cd5, p_IsPrimaryKey := p_IsPrimaryKey_77fa78451cd5, p_IsUnique := p_IsUnique_77fa78451cd5, p_Category := p_Category_77fa78451cd5, p_ValueListType := p_ValueListType_77fa78451cd5, p_ExtendedType := p_ExtendedType_77fa78451cd5, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_77fa78451cd5, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_77fa78451cd5, p_ViewCellTemplate := p_ViewCellTemplate_77fa78451cd5, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_77fa78451cd5, p_AllowUpdateAPI := p_AllowUpdateAPI_77fa78451cd5, p_AllowUpdateInView := p_AllowUpdateInView_77fa78451cd5, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_77fa78451cd5, p_FullTextSearchEnabled := p_FullTextSearchEnabled_77fa78451cd5, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_77fa78451cd5, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_77fa78451cd5, p_GeneratedFormSection := p_GeneratedFormSection_77fa78451cd5, p_IsNameField := p_IsNameField_77fa78451cd5, p_RelatedEntityID := p_RelatedEntityID_77fa78451cd5, p_RelatedEntityFieldName := p_RelatedEntityFieldName_77fa78451cd5, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_77fa78451cd5, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_77fa78451cd5, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_77fa78451cd5, p_EntityIDFieldName := p_EntityIDFieldName_77fa78451cd5, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_77fa78451cd5, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_77fa78451cd5, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_77fa78451cd5, p_Status := p_Status_77fa78451cd5, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_77fa78451cd5, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_77fa78451cd5, p_AutoUpdateCategory := p_AutoUpdateCategory_77fa78451cd5, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_77fa78451cd5, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_77fa78451cd5, p_Encrypt := p_Encrypt_77fa78451cd5, p_EncryptionKeyID := p_EncryptionKeyID_77fa78451cd5, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_77fa78451cd5, p_SendEncryptedValue := p_SendEncryptedValue_77fa78451cd5, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_77fa78451cd5, p_IsSoftForeignKey := p_IsSoftForeignKey_77fa78451cd5, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_77fa78451cd5, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_77fa78451cd5, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_77fa78451cd5, p_JSONTypeDefinition := p_JSONTypeDefinition_77fa78451cd5, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_77fa78451cd5, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_77fa78451cd5, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_77fa78451cd5, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_77fa78451cd5, p_IsComputed := p_IsComputed_77fa78451cd5, p_EmbeddedRecord := p_EmbeddedRecord_77fa78451cd5, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_77fa78451cd5, p_Configuration_Clear := TRUE, p_ID := p_ID_77fa78451cd5);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_b2627136ccc4 VARCHAR(255);
  p_Description_b2627136ccc4 TEXT;
  p_AutoUpdateDescription_b2627136ccc4 BOOLEAN;
  p_IsPrimaryKey_b2627136ccc4 BOOLEAN;
  p_IsUnique_b2627136ccc4 BOOLEAN;
  p_Category_b2627136ccc4 VARCHAR(255);
  p_ValueListType_b2627136ccc4 VARCHAR(20);
  p_ExtendedType_b2627136ccc4 VARCHAR(50);
  p_CodeType_b2627136ccc4 VARCHAR(50);
  p_DefaultInView_b2627136ccc4 BOOLEAN;
  p_ViewCellTemplate_b2627136ccc4 TEXT;
  p_DefaultColumnWidth_b2627136ccc4 INTEGER;
  p_AllowUpdateAPI_b2627136ccc4 BOOLEAN;
  p_AllowUpdateInView_b2627136ccc4 BOOLEAN;
  p_IncludeInUserSearchAPI_b2627136ccc4 BOOLEAN;
  p_FullTextSearchEnabled_b2627136ccc4 BOOLEAN;
  p_UserSearchParamFormatAPI_b2627136ccc4 VARCHAR(500);
  p_IncludeInGeneratedForm_b2627136ccc4 BOOLEAN;
  p_GeneratedFormSection_b2627136ccc4 VARCHAR(10);
  p_IsNameField_b2627136ccc4 BOOLEAN;
  p_RelatedEntityID_b2627136ccc4 UUID;
  p_RelatedEntityFieldName_b2627136ccc4 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_b2627136ccc4 BOOLEAN;
  p_RelatedEntityNameFieldMap_b2627136ccc4 VARCHAR(255);
  p_RelatedEntityDisplayType_b2627136ccc4 VARCHAR(20);
  p_EntityIDFieldName_b2627136ccc4 VARCHAR(100);
  p_ScopeDefault_b2627136ccc4 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_b2627136ccc4 BOOLEAN;
  p_ValuesToPackWithSchema_b2627136ccc4 VARCHAR(10);
  p_Status_b2627136ccc4 VARCHAR(25);
  p_AutoUpdateIsNameField_b2627136ccc4 BOOLEAN;
  p_AutoUpdateDefaultInView_b2627136ccc4 BOOLEAN;
  p_AutoUpdateCategory_b2627136ccc4 BOOLEAN;
  p_AutoUpdateDisplayName_b2627136ccc4 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_b2627136ccc4 BOOLEAN;
  p_Encrypt_b2627136ccc4 BOOLEAN;
  p_EncryptionKeyID_b2627136ccc4 UUID;
  p_AllowDecryptInAPI_b2627136ccc4 BOOLEAN;
  p_SendEncryptedValue_b2627136ccc4 BOOLEAN;
  p_IsSoftPrimaryKey_b2627136ccc4 BOOLEAN;
  p_IsSoftForeignKey_b2627136ccc4 BOOLEAN;
  p_RelatedEntityJoinFields_b2627136ccc4 TEXT;
  p_JSONType_b2627136ccc4 VARCHAR(255);
  p_JSONTypeIsArray_b2627136ccc4 BOOLEAN;
  p_JSONTypeDefinition_b2627136ccc4 TEXT;
  p_UserSearchPredicateAPI_b2627136ccc4 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_b2627136ccc4 BOOLEAN;
  p_AutoUpdateFullTextSearch_b2627136ccc4 BOOLEAN;
  p_AutoUpdateExtendedType_b2627136ccc4 BOOLEAN;
  p_IsComputed_b2627136ccc4 BOOLEAN;
  p_EmbeddedRecord_b2627136ccc4 TEXT;
  p_Configuration_b2627136ccc4 TEXT;
  p_ID_b2627136ccc4 UUID;
BEGIN
  p_DisplayName_b2627136ccc4 := 'Amount';
  p_Description_b2627136ccc4 := 'What the instalment billed for this part, signed as the line is: negative on a line that reverses another.';
  p_AutoUpdateDescription_b2627136ccc4 := TRUE;
  p_IsPrimaryKey_b2627136ccc4 := FALSE;
  p_IsUnique_b2627136ccc4 := FALSE;
  p_Category_b2627136ccc4 := 'Billed Amount';
  p_ValueListType_b2627136ccc4 := 'None';
  p_DefaultInView_b2627136ccc4 := FALSE;
  p_DefaultColumnWidth_b2627136ccc4 := 150;
  p_AllowUpdateAPI_b2627136ccc4 := TRUE;
  p_AllowUpdateInView_b2627136ccc4 := TRUE;
  p_IncludeInUserSearchAPI_b2627136ccc4 := FALSE;
  p_FullTextSearchEnabled_b2627136ccc4 := FALSE;
  p_IncludeInGeneratedForm_b2627136ccc4 := TRUE;
  p_GeneratedFormSection_b2627136ccc4 := 'Category';
  p_IsNameField_b2627136ccc4 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_b2627136ccc4 := FALSE;
  p_RelatedEntityDisplayType_b2627136ccc4 := 'Search';
  p_AutoUpdateRelatedEntityInfo_b2627136ccc4 := TRUE;
  p_ValuesToPackWithSchema_b2627136ccc4 := 'Auto';
  p_Status_b2627136ccc4 := 'Active';
  p_AutoUpdateIsNameField_b2627136ccc4 := TRUE;
  p_AutoUpdateDefaultInView_b2627136ccc4 := TRUE;
  p_AutoUpdateCategory_b2627136ccc4 := TRUE;
  p_AutoUpdateDisplayName_b2627136ccc4 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_b2627136ccc4 := TRUE;
  p_Encrypt_b2627136ccc4 := FALSE;
  p_AllowDecryptInAPI_b2627136ccc4 := FALSE;
  p_SendEncryptedValue_b2627136ccc4 := FALSE;
  p_IsSoftPrimaryKey_b2627136ccc4 := FALSE;
  p_IsSoftForeignKey_b2627136ccc4 := FALSE;
  p_JSONTypeIsArray_b2627136ccc4 := FALSE;
  p_UserSearchPredicateAPI_b2627136ccc4 := 'Contains';
  p_AutoUpdateUserSearchPredicate_b2627136ccc4 := TRUE;
  p_AutoUpdateFullTextSearch_b2627136ccc4 := TRUE;
  p_AutoUpdateExtendedType_b2627136ccc4 := TRUE;
  p_IsComputed_b2627136ccc4 := FALSE;
  p_ID_b2627136ccc4 := 'AF8FA0BB-B61B-49AF-80C0-554CBB0445A6';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_b2627136ccc4,
    'Description', p_Description_b2627136ccc4,
    'AutoUpdateDescription', p_AutoUpdateDescription_b2627136ccc4,
    'IsPrimaryKey', p_IsPrimaryKey_b2627136ccc4,
    'IsUnique', p_IsUnique_b2627136ccc4,
    'Category', p_Category_b2627136ccc4,
    'ValueListType', p_ValueListType_b2627136ccc4,
    'ExtendedType', p_ExtendedType_b2627136ccc4,
    'CodeType', p_CodeType_b2627136ccc4,
    'DefaultInView', p_DefaultInView_b2627136ccc4,
    'ViewCellTemplate', p_ViewCellTemplate_b2627136ccc4,
    'DefaultColumnWidth', p_DefaultColumnWidth_b2627136ccc4,
    'AllowUpdateAPI', p_AllowUpdateAPI_b2627136ccc4,
    'AllowUpdateInView', p_AllowUpdateInView_b2627136ccc4,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_b2627136ccc4,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_b2627136ccc4,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_b2627136ccc4,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_b2627136ccc4,
    'GeneratedFormSection', p_GeneratedFormSection_b2627136ccc4,
    'IsNameField', p_IsNameField_b2627136ccc4,
    'RelatedEntityID', p_RelatedEntityID_b2627136ccc4,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_b2627136ccc4,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_b2627136ccc4,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_b2627136ccc4,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_b2627136ccc4,
    'EntityIDFieldName', p_EntityIDFieldName_b2627136ccc4,
    'ScopeDefault', p_ScopeDefault_b2627136ccc4,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_b2627136ccc4,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_b2627136ccc4,
    'Status', p_Status_b2627136ccc4,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_b2627136ccc4,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_b2627136ccc4,
    'AutoUpdateCategory', p_AutoUpdateCategory_b2627136ccc4,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_b2627136ccc4,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_b2627136ccc4,
    'Encrypt', p_Encrypt_b2627136ccc4,
    'EncryptionKeyID', p_EncryptionKeyID_b2627136ccc4,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_b2627136ccc4,
    'SendEncryptedValue', p_SendEncryptedValue_b2627136ccc4,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_b2627136ccc4,
    'IsSoftForeignKey', p_IsSoftForeignKey_b2627136ccc4,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_b2627136ccc4,
    'JSONType', p_JSONType_b2627136ccc4,
    'JSONTypeIsArray', p_JSONTypeIsArray_b2627136ccc4,
    'JSONTypeDefinition', p_JSONTypeDefinition_b2627136ccc4,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_b2627136ccc4,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_b2627136ccc4,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_b2627136ccc4,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_b2627136ccc4,
    'IsComputed', p_IsComputed_b2627136ccc4
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_b2627136ccc4,
    'Configuration', p_Configuration_b2627136ccc4,
    'ID', p_ID_b2627136ccc4
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_b2627136ccc4, p_Description := p_Description_b2627136ccc4, p_AutoUpdateDescription := p_AutoUpdateDescription_b2627136ccc4, p_IsPrimaryKey := p_IsPrimaryKey_b2627136ccc4, p_IsUnique := p_IsUnique_b2627136ccc4, p_Category := p_Category_b2627136ccc4, p_ValueListType := p_ValueListType_b2627136ccc4, p_ExtendedType := p_ExtendedType_b2627136ccc4, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_b2627136ccc4, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_b2627136ccc4, p_ViewCellTemplate := p_ViewCellTemplate_b2627136ccc4, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_b2627136ccc4, p_AllowUpdateAPI := p_AllowUpdateAPI_b2627136ccc4, p_AllowUpdateInView := p_AllowUpdateInView_b2627136ccc4, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_b2627136ccc4, p_FullTextSearchEnabled := p_FullTextSearchEnabled_b2627136ccc4, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_b2627136ccc4, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_b2627136ccc4, p_GeneratedFormSection := p_GeneratedFormSection_b2627136ccc4, p_IsNameField := p_IsNameField_b2627136ccc4, p_RelatedEntityID := p_RelatedEntityID_b2627136ccc4, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_b2627136ccc4, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_b2627136ccc4, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_b2627136ccc4, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_b2627136ccc4, p_EntityIDFieldName := p_EntityIDFieldName_b2627136ccc4, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_b2627136ccc4, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_b2627136ccc4, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_b2627136ccc4, p_Status := p_Status_b2627136ccc4, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_b2627136ccc4, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_b2627136ccc4, p_AutoUpdateCategory := p_AutoUpdateCategory_b2627136ccc4, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_b2627136ccc4, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_b2627136ccc4, p_Encrypt := p_Encrypt_b2627136ccc4, p_EncryptionKeyID := p_EncryptionKeyID_b2627136ccc4, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_b2627136ccc4, p_SendEncryptedValue := p_SendEncryptedValue_b2627136ccc4, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_b2627136ccc4, p_IsSoftForeignKey := p_IsSoftForeignKey_b2627136ccc4, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_b2627136ccc4, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_b2627136ccc4, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_b2627136ccc4, p_JSONTypeDefinition := p_JSONTypeDefinition_b2627136ccc4, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_b2627136ccc4, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_b2627136ccc4, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_b2627136ccc4, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_b2627136ccc4, p_IsComputed := p_IsComputed_b2627136ccc4, p_EmbeddedRecord := p_EmbeddedRecord_b2627136ccc4, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_b2627136ccc4, p_Configuration_Clear := TRUE, p_ID := p_ID_b2627136ccc4);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_0c09839427c2 VARCHAR(255);
  p_Description_0c09839427c2 TEXT;
  p_AutoUpdateDescription_0c09839427c2 BOOLEAN;
  p_IsPrimaryKey_0c09839427c2 BOOLEAN;
  p_IsUnique_0c09839427c2 BOOLEAN;
  p_Category_0c09839427c2 VARCHAR(255);
  p_ValueListType_0c09839427c2 VARCHAR(20);
  p_ExtendedType_0c09839427c2 VARCHAR(50);
  p_CodeType_0c09839427c2 VARCHAR(50);
  p_DefaultInView_0c09839427c2 BOOLEAN;
  p_ViewCellTemplate_0c09839427c2 TEXT;
  p_DefaultColumnWidth_0c09839427c2 INTEGER;
  p_AllowUpdateAPI_0c09839427c2 BOOLEAN;
  p_AllowUpdateInView_0c09839427c2 BOOLEAN;
  p_IncludeInUserSearchAPI_0c09839427c2 BOOLEAN;
  p_FullTextSearchEnabled_0c09839427c2 BOOLEAN;
  p_UserSearchParamFormatAPI_0c09839427c2 VARCHAR(500);
  p_IncludeInGeneratedForm_0c09839427c2 BOOLEAN;
  p_GeneratedFormSection_0c09839427c2 VARCHAR(10);
  p_IsNameField_0c09839427c2 BOOLEAN;
  p_RelatedEntityID_0c09839427c2 UUID;
  p_RelatedEntityFieldName_0c09839427c2 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_0c09839427c2 BOOLEAN;
  p_RelatedEntityNameFieldMap_0c09839427c2 VARCHAR(255);
  p_RelatedEntityDisplayType_0c09839427c2 VARCHAR(20);
  p_EntityIDFieldName_0c09839427c2 VARCHAR(100);
  p_ScopeDefault_0c09839427c2 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_0c09839427c2 BOOLEAN;
  p_ValuesToPackWithSchema_0c09839427c2 VARCHAR(10);
  p_Status_0c09839427c2 VARCHAR(25);
  p_AutoUpdateIsNameField_0c09839427c2 BOOLEAN;
  p_AutoUpdateDefaultInView_0c09839427c2 BOOLEAN;
  p_AutoUpdateCategory_0c09839427c2 BOOLEAN;
  p_AutoUpdateDisplayName_0c09839427c2 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_0c09839427c2 BOOLEAN;
  p_Encrypt_0c09839427c2 BOOLEAN;
  p_EncryptionKeyID_0c09839427c2 UUID;
  p_AllowDecryptInAPI_0c09839427c2 BOOLEAN;
  p_SendEncryptedValue_0c09839427c2 BOOLEAN;
  p_IsSoftPrimaryKey_0c09839427c2 BOOLEAN;
  p_IsSoftForeignKey_0c09839427c2 BOOLEAN;
  p_RelatedEntityJoinFields_0c09839427c2 TEXT;
  p_JSONType_0c09839427c2 VARCHAR(255);
  p_JSONTypeIsArray_0c09839427c2 BOOLEAN;
  p_JSONTypeDefinition_0c09839427c2 TEXT;
  p_UserSearchPredicateAPI_0c09839427c2 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_0c09839427c2 BOOLEAN;
  p_AutoUpdateFullTextSearch_0c09839427c2 BOOLEAN;
  p_AutoUpdateExtendedType_0c09839427c2 BOOLEAN;
  p_IsComputed_0c09839427c2 BOOLEAN;
  p_EmbeddedRecord_0c09839427c2 TEXT;
  p_Configuration_0c09839427c2 TEXT;
  p_ID_0c09839427c2 UUID;
BEGIN
  p_DisplayName_0c09839427c2 := 'Created At';
  p_AutoUpdateDescription_0c09839427c2 := TRUE;
  p_IsPrimaryKey_0c09839427c2 := FALSE;
  p_IsUnique_0c09839427c2 := FALSE;
  p_Category_0c09839427c2 := 'System Metadata';
  p_ValueListType_0c09839427c2 := 'None';
  p_DefaultInView_0c09839427c2 := FALSE;
  p_DefaultColumnWidth_0c09839427c2 := 100;
  p_AllowUpdateAPI_0c09839427c2 := FALSE;
  p_AllowUpdateInView_0c09839427c2 := TRUE;
  p_IncludeInUserSearchAPI_0c09839427c2 := FALSE;
  p_FullTextSearchEnabled_0c09839427c2 := FALSE;
  p_IncludeInGeneratedForm_0c09839427c2 := TRUE;
  p_GeneratedFormSection_0c09839427c2 := 'Category';
  p_IsNameField_0c09839427c2 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_0c09839427c2 := FALSE;
  p_RelatedEntityDisplayType_0c09839427c2 := 'Search';
  p_AutoUpdateRelatedEntityInfo_0c09839427c2 := TRUE;
  p_ValuesToPackWithSchema_0c09839427c2 := 'Auto';
  p_Status_0c09839427c2 := 'Active';
  p_AutoUpdateIsNameField_0c09839427c2 := TRUE;
  p_AutoUpdateDefaultInView_0c09839427c2 := TRUE;
  p_AutoUpdateCategory_0c09839427c2 := TRUE;
  p_AutoUpdateDisplayName_0c09839427c2 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_0c09839427c2 := TRUE;
  p_Encrypt_0c09839427c2 := FALSE;
  p_AllowDecryptInAPI_0c09839427c2 := FALSE;
  p_SendEncryptedValue_0c09839427c2 := FALSE;
  p_IsSoftPrimaryKey_0c09839427c2 := FALSE;
  p_IsSoftForeignKey_0c09839427c2 := FALSE;
  p_JSONTypeIsArray_0c09839427c2 := FALSE;
  p_UserSearchPredicateAPI_0c09839427c2 := 'Contains';
  p_AutoUpdateUserSearchPredicate_0c09839427c2 := TRUE;
  p_AutoUpdateFullTextSearch_0c09839427c2 := TRUE;
  p_AutoUpdateExtendedType_0c09839427c2 := TRUE;
  p_IsComputed_0c09839427c2 := FALSE;
  p_ID_0c09839427c2 := '5457E141-49CE-4EE9-9EB0-9976C838EE4B';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_0c09839427c2,
    'Description', p_Description_0c09839427c2,
    'AutoUpdateDescription', p_AutoUpdateDescription_0c09839427c2,
    'IsPrimaryKey', p_IsPrimaryKey_0c09839427c2,
    'IsUnique', p_IsUnique_0c09839427c2,
    'Category', p_Category_0c09839427c2,
    'ValueListType', p_ValueListType_0c09839427c2,
    'ExtendedType', p_ExtendedType_0c09839427c2,
    'CodeType', p_CodeType_0c09839427c2,
    'DefaultInView', p_DefaultInView_0c09839427c2,
    'ViewCellTemplate', p_ViewCellTemplate_0c09839427c2,
    'DefaultColumnWidth', p_DefaultColumnWidth_0c09839427c2,
    'AllowUpdateAPI', p_AllowUpdateAPI_0c09839427c2,
    'AllowUpdateInView', p_AllowUpdateInView_0c09839427c2,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_0c09839427c2,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_0c09839427c2,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_0c09839427c2,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_0c09839427c2,
    'GeneratedFormSection', p_GeneratedFormSection_0c09839427c2,
    'IsNameField', p_IsNameField_0c09839427c2,
    'RelatedEntityID', p_RelatedEntityID_0c09839427c2,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_0c09839427c2,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_0c09839427c2,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_0c09839427c2,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_0c09839427c2,
    'EntityIDFieldName', p_EntityIDFieldName_0c09839427c2,
    'ScopeDefault', p_ScopeDefault_0c09839427c2,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_0c09839427c2,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_0c09839427c2,
    'Status', p_Status_0c09839427c2,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_0c09839427c2,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_0c09839427c2,
    'AutoUpdateCategory', p_AutoUpdateCategory_0c09839427c2,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_0c09839427c2,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_0c09839427c2,
    'Encrypt', p_Encrypt_0c09839427c2,
    'EncryptionKeyID', p_EncryptionKeyID_0c09839427c2,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_0c09839427c2,
    'SendEncryptedValue', p_SendEncryptedValue_0c09839427c2,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_0c09839427c2,
    'IsSoftForeignKey', p_IsSoftForeignKey_0c09839427c2,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_0c09839427c2,
    'JSONType', p_JSONType_0c09839427c2,
    'JSONTypeIsArray', p_JSONTypeIsArray_0c09839427c2,
    'JSONTypeDefinition', p_JSONTypeDefinition_0c09839427c2,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_0c09839427c2,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_0c09839427c2,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_0c09839427c2,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_0c09839427c2,
    'IsComputed', p_IsComputed_0c09839427c2
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_0c09839427c2,
    'Configuration', p_Configuration_0c09839427c2,
    'ID', p_ID_0c09839427c2
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_0c09839427c2, p_Description := p_Description_0c09839427c2, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_0c09839427c2, p_IsPrimaryKey := p_IsPrimaryKey_0c09839427c2, p_IsUnique := p_IsUnique_0c09839427c2, p_Category := p_Category_0c09839427c2, p_ValueListType := p_ValueListType_0c09839427c2, p_ExtendedType := p_ExtendedType_0c09839427c2, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_0c09839427c2, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_0c09839427c2, p_ViewCellTemplate := p_ViewCellTemplate_0c09839427c2, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_0c09839427c2, p_AllowUpdateAPI := p_AllowUpdateAPI_0c09839427c2, p_AllowUpdateInView := p_AllowUpdateInView_0c09839427c2, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_0c09839427c2, p_FullTextSearchEnabled := p_FullTextSearchEnabled_0c09839427c2, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_0c09839427c2, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_0c09839427c2, p_GeneratedFormSection := p_GeneratedFormSection_0c09839427c2, p_IsNameField := p_IsNameField_0c09839427c2, p_RelatedEntityID := p_RelatedEntityID_0c09839427c2, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_0c09839427c2, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_0c09839427c2, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_0c09839427c2, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_0c09839427c2, p_EntityIDFieldName := p_EntityIDFieldName_0c09839427c2, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_0c09839427c2, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_0c09839427c2, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_0c09839427c2, p_Status := p_Status_0c09839427c2, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_0c09839427c2, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_0c09839427c2, p_AutoUpdateCategory := p_AutoUpdateCategory_0c09839427c2, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_0c09839427c2, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_0c09839427c2, p_Encrypt := p_Encrypt_0c09839427c2, p_EncryptionKeyID := p_EncryptionKeyID_0c09839427c2, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_0c09839427c2, p_SendEncryptedValue := p_SendEncryptedValue_0c09839427c2, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_0c09839427c2, p_IsSoftForeignKey := p_IsSoftForeignKey_0c09839427c2, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_0c09839427c2, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_0c09839427c2, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_0c09839427c2, p_JSONTypeDefinition := p_JSONTypeDefinition_0c09839427c2, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_0c09839427c2, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_0c09839427c2, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_0c09839427c2, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_0c09839427c2, p_IsComputed := p_IsComputed_0c09839427c2, p_EmbeddedRecord := p_EmbeddedRecord_0c09839427c2, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_0c09839427c2, p_Configuration_Clear := TRUE, p_ID := p_ID_0c09839427c2);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_8f1c114e4b8e VARCHAR(255);
  p_Description_8f1c114e4b8e TEXT;
  p_AutoUpdateDescription_8f1c114e4b8e BOOLEAN;
  p_IsPrimaryKey_8f1c114e4b8e BOOLEAN;
  p_IsUnique_8f1c114e4b8e BOOLEAN;
  p_Category_8f1c114e4b8e VARCHAR(255);
  p_ValueListType_8f1c114e4b8e VARCHAR(20);
  p_ExtendedType_8f1c114e4b8e VARCHAR(50);
  p_CodeType_8f1c114e4b8e VARCHAR(50);
  p_DefaultInView_8f1c114e4b8e BOOLEAN;
  p_ViewCellTemplate_8f1c114e4b8e TEXT;
  p_DefaultColumnWidth_8f1c114e4b8e INTEGER;
  p_AllowUpdateAPI_8f1c114e4b8e BOOLEAN;
  p_AllowUpdateInView_8f1c114e4b8e BOOLEAN;
  p_IncludeInUserSearchAPI_8f1c114e4b8e BOOLEAN;
  p_FullTextSearchEnabled_8f1c114e4b8e BOOLEAN;
  p_UserSearchParamFormatAPI_8f1c114e4b8e VARCHAR(500);
  p_IncludeInGeneratedForm_8f1c114e4b8e BOOLEAN;
  p_GeneratedFormSection_8f1c114e4b8e VARCHAR(10);
  p_IsNameField_8f1c114e4b8e BOOLEAN;
  p_RelatedEntityID_8f1c114e4b8e UUID;
  p_RelatedEntityFieldName_8f1c114e4b8e VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_8f1c114e4b8e BOOLEAN;
  p_RelatedEntityNameFieldMap_8f1c114e4b8e VARCHAR(255);
  p_RelatedEntityDisplayType_8f1c114e4b8e VARCHAR(20);
  p_EntityIDFieldName_8f1c114e4b8e VARCHAR(100);
  p_ScopeDefault_8f1c114e4b8e VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_8f1c114e4b8e BOOLEAN;
  p_ValuesToPackWithSchema_8f1c114e4b8e VARCHAR(10);
  p_Status_8f1c114e4b8e VARCHAR(25);
  p_AutoUpdateIsNameField_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateDefaultInView_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateCategory_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateDisplayName_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_8f1c114e4b8e BOOLEAN;
  p_Encrypt_8f1c114e4b8e BOOLEAN;
  p_EncryptionKeyID_8f1c114e4b8e UUID;
  p_AllowDecryptInAPI_8f1c114e4b8e BOOLEAN;
  p_SendEncryptedValue_8f1c114e4b8e BOOLEAN;
  p_IsSoftPrimaryKey_8f1c114e4b8e BOOLEAN;
  p_IsSoftForeignKey_8f1c114e4b8e BOOLEAN;
  p_RelatedEntityJoinFields_8f1c114e4b8e TEXT;
  p_JSONType_8f1c114e4b8e VARCHAR(255);
  p_JSONTypeIsArray_8f1c114e4b8e BOOLEAN;
  p_JSONTypeDefinition_8f1c114e4b8e TEXT;
  p_UserSearchPredicateAPI_8f1c114e4b8e VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateFullTextSearch_8f1c114e4b8e BOOLEAN;
  p_AutoUpdateExtendedType_8f1c114e4b8e BOOLEAN;
  p_IsComputed_8f1c114e4b8e BOOLEAN;
  p_EmbeddedRecord_8f1c114e4b8e TEXT;
  p_Configuration_8f1c114e4b8e TEXT;
  p_ID_8f1c114e4b8e UUID;
BEGIN
  p_DisplayName_8f1c114e4b8e := 'Updated At';
  p_AutoUpdateDescription_8f1c114e4b8e := TRUE;
  p_IsPrimaryKey_8f1c114e4b8e := FALSE;
  p_IsUnique_8f1c114e4b8e := FALSE;
  p_Category_8f1c114e4b8e := 'System Metadata';
  p_ValueListType_8f1c114e4b8e := 'None';
  p_DefaultInView_8f1c114e4b8e := FALSE;
  p_DefaultColumnWidth_8f1c114e4b8e := 100;
  p_AllowUpdateAPI_8f1c114e4b8e := FALSE;
  p_AllowUpdateInView_8f1c114e4b8e := TRUE;
  p_IncludeInUserSearchAPI_8f1c114e4b8e := FALSE;
  p_FullTextSearchEnabled_8f1c114e4b8e := FALSE;
  p_IncludeInGeneratedForm_8f1c114e4b8e := TRUE;
  p_GeneratedFormSection_8f1c114e4b8e := 'Category';
  p_IsNameField_8f1c114e4b8e := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_8f1c114e4b8e := FALSE;
  p_RelatedEntityDisplayType_8f1c114e4b8e := 'Search';
  p_AutoUpdateRelatedEntityInfo_8f1c114e4b8e := TRUE;
  p_ValuesToPackWithSchema_8f1c114e4b8e := 'Auto';
  p_Status_8f1c114e4b8e := 'Active';
  p_AutoUpdateIsNameField_8f1c114e4b8e := TRUE;
  p_AutoUpdateDefaultInView_8f1c114e4b8e := TRUE;
  p_AutoUpdateCategory_8f1c114e4b8e := TRUE;
  p_AutoUpdateDisplayName_8f1c114e4b8e := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_8f1c114e4b8e := TRUE;
  p_Encrypt_8f1c114e4b8e := FALSE;
  p_AllowDecryptInAPI_8f1c114e4b8e := FALSE;
  p_SendEncryptedValue_8f1c114e4b8e := FALSE;
  p_IsSoftPrimaryKey_8f1c114e4b8e := FALSE;
  p_IsSoftForeignKey_8f1c114e4b8e := FALSE;
  p_JSONTypeIsArray_8f1c114e4b8e := FALSE;
  p_UserSearchPredicateAPI_8f1c114e4b8e := 'Contains';
  p_AutoUpdateUserSearchPredicate_8f1c114e4b8e := TRUE;
  p_AutoUpdateFullTextSearch_8f1c114e4b8e := TRUE;
  p_AutoUpdateExtendedType_8f1c114e4b8e := TRUE;
  p_IsComputed_8f1c114e4b8e := FALSE;
  p_ID_8f1c114e4b8e := '142E2FC3-F343-480E-9773-40D7F2ED6D30';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_8f1c114e4b8e,
    'Description', p_Description_8f1c114e4b8e,
    'AutoUpdateDescription', p_AutoUpdateDescription_8f1c114e4b8e,
    'IsPrimaryKey', p_IsPrimaryKey_8f1c114e4b8e,
    'IsUnique', p_IsUnique_8f1c114e4b8e,
    'Category', p_Category_8f1c114e4b8e,
    'ValueListType', p_ValueListType_8f1c114e4b8e,
    'ExtendedType', p_ExtendedType_8f1c114e4b8e,
    'CodeType', p_CodeType_8f1c114e4b8e,
    'DefaultInView', p_DefaultInView_8f1c114e4b8e,
    'ViewCellTemplate', p_ViewCellTemplate_8f1c114e4b8e,
    'DefaultColumnWidth', p_DefaultColumnWidth_8f1c114e4b8e,
    'AllowUpdateAPI', p_AllowUpdateAPI_8f1c114e4b8e,
    'AllowUpdateInView', p_AllowUpdateInView_8f1c114e4b8e,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_8f1c114e4b8e,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_8f1c114e4b8e,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_8f1c114e4b8e,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_8f1c114e4b8e,
    'GeneratedFormSection', p_GeneratedFormSection_8f1c114e4b8e,
    'IsNameField', p_IsNameField_8f1c114e4b8e,
    'RelatedEntityID', p_RelatedEntityID_8f1c114e4b8e,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_8f1c114e4b8e,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_8f1c114e4b8e,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_8f1c114e4b8e,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_8f1c114e4b8e,
    'EntityIDFieldName', p_EntityIDFieldName_8f1c114e4b8e,
    'ScopeDefault', p_ScopeDefault_8f1c114e4b8e,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_8f1c114e4b8e,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_8f1c114e4b8e,
    'Status', p_Status_8f1c114e4b8e,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_8f1c114e4b8e,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_8f1c114e4b8e,
    'AutoUpdateCategory', p_AutoUpdateCategory_8f1c114e4b8e,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_8f1c114e4b8e,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_8f1c114e4b8e,
    'Encrypt', p_Encrypt_8f1c114e4b8e,
    'EncryptionKeyID', p_EncryptionKeyID_8f1c114e4b8e,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_8f1c114e4b8e,
    'SendEncryptedValue', p_SendEncryptedValue_8f1c114e4b8e,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_8f1c114e4b8e,
    'IsSoftForeignKey', p_IsSoftForeignKey_8f1c114e4b8e,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_8f1c114e4b8e,
    'JSONType', p_JSONType_8f1c114e4b8e,
    'JSONTypeIsArray', p_JSONTypeIsArray_8f1c114e4b8e,
    'JSONTypeDefinition', p_JSONTypeDefinition_8f1c114e4b8e,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_8f1c114e4b8e,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_8f1c114e4b8e,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_8f1c114e4b8e,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_8f1c114e4b8e,
    'IsComputed', p_IsComputed_8f1c114e4b8e
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_8f1c114e4b8e,
    'Configuration', p_Configuration_8f1c114e4b8e,
    'ID', p_ID_8f1c114e4b8e
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_8f1c114e4b8e, p_Description := p_Description_8f1c114e4b8e, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_8f1c114e4b8e, p_IsPrimaryKey := p_IsPrimaryKey_8f1c114e4b8e, p_IsUnique := p_IsUnique_8f1c114e4b8e, p_Category := p_Category_8f1c114e4b8e, p_ValueListType := p_ValueListType_8f1c114e4b8e, p_ExtendedType := p_ExtendedType_8f1c114e4b8e, p_ExtendedType_Clear := TRUE, p_CodeType := p_CodeType_8f1c114e4b8e, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_8f1c114e4b8e, p_ViewCellTemplate := p_ViewCellTemplate_8f1c114e4b8e, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_8f1c114e4b8e, p_AllowUpdateAPI := p_AllowUpdateAPI_8f1c114e4b8e, p_AllowUpdateInView := p_AllowUpdateInView_8f1c114e4b8e, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_8f1c114e4b8e, p_FullTextSearchEnabled := p_FullTextSearchEnabled_8f1c114e4b8e, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_8f1c114e4b8e, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_8f1c114e4b8e, p_GeneratedFormSection := p_GeneratedFormSection_8f1c114e4b8e, p_IsNameField := p_IsNameField_8f1c114e4b8e, p_RelatedEntityID := p_RelatedEntityID_8f1c114e4b8e, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_8f1c114e4b8e, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_8f1c114e4b8e, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_8f1c114e4b8e, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_8f1c114e4b8e, p_EntityIDFieldName := p_EntityIDFieldName_8f1c114e4b8e, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_8f1c114e4b8e, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_8f1c114e4b8e, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_8f1c114e4b8e, p_Status := p_Status_8f1c114e4b8e, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_8f1c114e4b8e, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_8f1c114e4b8e, p_AutoUpdateCategory := p_AutoUpdateCategory_8f1c114e4b8e, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_8f1c114e4b8e, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_8f1c114e4b8e, p_Encrypt := p_Encrypt_8f1c114e4b8e, p_EncryptionKeyID := p_EncryptionKeyID_8f1c114e4b8e, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_8f1c114e4b8e, p_SendEncryptedValue := p_SendEncryptedValue_8f1c114e4b8e, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_8f1c114e4b8e, p_IsSoftForeignKey := p_IsSoftForeignKey_8f1c114e4b8e, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_8f1c114e4b8e, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_8f1c114e4b8e, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_8f1c114e4b8e, p_JSONTypeDefinition := p_JSONTypeDefinition_8f1c114e4b8e, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_8f1c114e4b8e, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_8f1c114e4b8e, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_8f1c114e4b8e, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_8f1c114e4b8e, p_IsComputed := p_IsComputed_8f1c114e4b8e, p_EmbeddedRecord := p_EmbeddedRecord_8f1c114e4b8e, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_8f1c114e4b8e, p_Configuration_Clear := TRUE, p_ID := p_ID_8f1c114e4b8e);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_25386ce929fb VARCHAR(255);
  p_Description_25386ce929fb TEXT;
  p_AutoUpdateDescription_25386ce929fb BOOLEAN;
  p_IsPrimaryKey_25386ce929fb BOOLEAN;
  p_IsUnique_25386ce929fb BOOLEAN;
  p_Category_25386ce929fb VARCHAR(255);
  p_ValueListType_25386ce929fb VARCHAR(20);
  p_ExtendedType_25386ce929fb VARCHAR(50);
  p_CodeType_25386ce929fb VARCHAR(50);
  p_DefaultInView_25386ce929fb BOOLEAN;
  p_ViewCellTemplate_25386ce929fb TEXT;
  p_DefaultColumnWidth_25386ce929fb INTEGER;
  p_AllowUpdateAPI_25386ce929fb BOOLEAN;
  p_AllowUpdateInView_25386ce929fb BOOLEAN;
  p_IncludeInUserSearchAPI_25386ce929fb BOOLEAN;
  p_FullTextSearchEnabled_25386ce929fb BOOLEAN;
  p_UserSearchParamFormatAPI_25386ce929fb VARCHAR(500);
  p_IncludeInGeneratedForm_25386ce929fb BOOLEAN;
  p_GeneratedFormSection_25386ce929fb VARCHAR(10);
  p_IsNameField_25386ce929fb BOOLEAN;
  p_RelatedEntityID_25386ce929fb UUID;
  p_RelatedEntityFieldName_25386ce929fb VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_25386ce929fb BOOLEAN;
  p_RelatedEntityNameFieldMap_25386ce929fb VARCHAR(255);
  p_RelatedEntityDisplayType_25386ce929fb VARCHAR(20);
  p_EntityIDFieldName_25386ce929fb VARCHAR(100);
  p_ScopeDefault_25386ce929fb VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_25386ce929fb BOOLEAN;
  p_ValuesToPackWithSchema_25386ce929fb VARCHAR(10);
  p_Status_25386ce929fb VARCHAR(25);
  p_AutoUpdateIsNameField_25386ce929fb BOOLEAN;
  p_AutoUpdateDefaultInView_25386ce929fb BOOLEAN;
  p_AutoUpdateCategory_25386ce929fb BOOLEAN;
  p_AutoUpdateDisplayName_25386ce929fb BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_25386ce929fb BOOLEAN;
  p_Encrypt_25386ce929fb BOOLEAN;
  p_EncryptionKeyID_25386ce929fb UUID;
  p_AllowDecryptInAPI_25386ce929fb BOOLEAN;
  p_SendEncryptedValue_25386ce929fb BOOLEAN;
  p_IsSoftPrimaryKey_25386ce929fb BOOLEAN;
  p_IsSoftForeignKey_25386ce929fb BOOLEAN;
  p_RelatedEntityJoinFields_25386ce929fb TEXT;
  p_JSONType_25386ce929fb VARCHAR(255);
  p_JSONTypeIsArray_25386ce929fb BOOLEAN;
  p_JSONTypeDefinition_25386ce929fb TEXT;
  p_UserSearchPredicateAPI_25386ce929fb VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_25386ce929fb BOOLEAN;
  p_AutoUpdateFullTextSearch_25386ce929fb BOOLEAN;
  p_AutoUpdateExtendedType_25386ce929fb BOOLEAN;
  p_IsComputed_25386ce929fb BOOLEAN;
  p_EmbeddedRecord_25386ce929fb TEXT;
  p_Configuration_25386ce929fb TEXT;
  p_ID_25386ce929fb UUID;
BEGIN
  p_DisplayName_25386ce929fb := 'Billing Address Latitude';
  p_AutoUpdateDescription_25386ce929fb := TRUE;
  p_IsPrimaryKey_25386ce929fb := FALSE;
  p_IsUnique_25386ce929fb := FALSE;
  p_Category_25386ce929fb := 'System Metadata';
  p_ValueListType_25386ce929fb := 'None';
  p_ExtendedType_25386ce929fb := 'GeoLatitude';
  p_DefaultInView_25386ce929fb := FALSE;
  p_DefaultColumnWidth_25386ce929fb := 150;
  p_AllowUpdateAPI_25386ce929fb := FALSE;
  p_AllowUpdateInView_25386ce929fb := TRUE;
  p_IncludeInUserSearchAPI_25386ce929fb := FALSE;
  p_FullTextSearchEnabled_25386ce929fb := FALSE;
  p_IncludeInGeneratedForm_25386ce929fb := TRUE;
  p_GeneratedFormSection_25386ce929fb := 'Category';
  p_IsNameField_25386ce929fb := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_25386ce929fb := FALSE;
  p_RelatedEntityDisplayType_25386ce929fb := 'Search';
  p_AutoUpdateRelatedEntityInfo_25386ce929fb := TRUE;
  p_ValuesToPackWithSchema_25386ce929fb := 'Auto';
  p_Status_25386ce929fb := 'Active';
  p_AutoUpdateIsNameField_25386ce929fb := TRUE;
  p_AutoUpdateDefaultInView_25386ce929fb := TRUE;
  p_AutoUpdateCategory_25386ce929fb := TRUE;
  p_AutoUpdateDisplayName_25386ce929fb := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_25386ce929fb := TRUE;
  p_Encrypt_25386ce929fb := FALSE;
  p_AllowDecryptInAPI_25386ce929fb := FALSE;
  p_SendEncryptedValue_25386ce929fb := FALSE;
  p_IsSoftPrimaryKey_25386ce929fb := FALSE;
  p_IsSoftForeignKey_25386ce929fb := FALSE;
  p_JSONTypeIsArray_25386ce929fb := FALSE;
  p_UserSearchPredicateAPI_25386ce929fb := 'Contains';
  p_AutoUpdateUserSearchPredicate_25386ce929fb := TRUE;
  p_AutoUpdateFullTextSearch_25386ce929fb := TRUE;
  p_AutoUpdateExtendedType_25386ce929fb := TRUE;
  p_IsComputed_25386ce929fb := FALSE;
  p_ID_25386ce929fb := '09EBBE39-5E50-4390-9F85-D391A8180564';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_25386ce929fb,
    'Description', p_Description_25386ce929fb,
    'AutoUpdateDescription', p_AutoUpdateDescription_25386ce929fb,
    'IsPrimaryKey', p_IsPrimaryKey_25386ce929fb,
    'IsUnique', p_IsUnique_25386ce929fb,
    'Category', p_Category_25386ce929fb,
    'ValueListType', p_ValueListType_25386ce929fb,
    'ExtendedType', p_ExtendedType_25386ce929fb,
    'CodeType', p_CodeType_25386ce929fb,
    'DefaultInView', p_DefaultInView_25386ce929fb,
    'ViewCellTemplate', p_ViewCellTemplate_25386ce929fb,
    'DefaultColumnWidth', p_DefaultColumnWidth_25386ce929fb,
    'AllowUpdateAPI', p_AllowUpdateAPI_25386ce929fb,
    'AllowUpdateInView', p_AllowUpdateInView_25386ce929fb,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_25386ce929fb,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_25386ce929fb,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_25386ce929fb,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_25386ce929fb,
    'GeneratedFormSection', p_GeneratedFormSection_25386ce929fb,
    'IsNameField', p_IsNameField_25386ce929fb,
    'RelatedEntityID', p_RelatedEntityID_25386ce929fb,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_25386ce929fb,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_25386ce929fb,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_25386ce929fb,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_25386ce929fb,
    'EntityIDFieldName', p_EntityIDFieldName_25386ce929fb,
    'ScopeDefault', p_ScopeDefault_25386ce929fb,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_25386ce929fb,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_25386ce929fb,
    'Status', p_Status_25386ce929fb,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_25386ce929fb,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_25386ce929fb,
    'AutoUpdateCategory', p_AutoUpdateCategory_25386ce929fb,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_25386ce929fb,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_25386ce929fb,
    'Encrypt', p_Encrypt_25386ce929fb,
    'EncryptionKeyID', p_EncryptionKeyID_25386ce929fb,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_25386ce929fb,
    'SendEncryptedValue', p_SendEncryptedValue_25386ce929fb,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_25386ce929fb,
    'IsSoftForeignKey', p_IsSoftForeignKey_25386ce929fb,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_25386ce929fb,
    'JSONType', p_JSONType_25386ce929fb,
    'JSONTypeIsArray', p_JSONTypeIsArray_25386ce929fb,
    'JSONTypeDefinition', p_JSONTypeDefinition_25386ce929fb,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_25386ce929fb,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_25386ce929fb,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_25386ce929fb,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_25386ce929fb,
    'IsComputed', p_IsComputed_25386ce929fb
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_25386ce929fb,
    'Configuration', p_Configuration_25386ce929fb,
    'ID', p_ID_25386ce929fb
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_25386ce929fb, p_Description := p_Description_25386ce929fb, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_25386ce929fb, p_IsPrimaryKey := p_IsPrimaryKey_25386ce929fb, p_IsUnique := p_IsUnique_25386ce929fb, p_Category := p_Category_25386ce929fb, p_ValueListType := p_ValueListType_25386ce929fb, p_ExtendedType := p_ExtendedType_25386ce929fb, p_CodeType := p_CodeType_25386ce929fb, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_25386ce929fb, p_ViewCellTemplate := p_ViewCellTemplate_25386ce929fb, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_25386ce929fb, p_AllowUpdateAPI := p_AllowUpdateAPI_25386ce929fb, p_AllowUpdateInView := p_AllowUpdateInView_25386ce929fb, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_25386ce929fb, p_FullTextSearchEnabled := p_FullTextSearchEnabled_25386ce929fb, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_25386ce929fb, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_25386ce929fb, p_GeneratedFormSection := p_GeneratedFormSection_25386ce929fb, p_IsNameField := p_IsNameField_25386ce929fb, p_RelatedEntityID := p_RelatedEntityID_25386ce929fb, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_25386ce929fb, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_25386ce929fb, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_25386ce929fb, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_25386ce929fb, p_EntityIDFieldName := p_EntityIDFieldName_25386ce929fb, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_25386ce929fb, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_25386ce929fb, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_25386ce929fb, p_Status := p_Status_25386ce929fb, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_25386ce929fb, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_25386ce929fb, p_AutoUpdateCategory := p_AutoUpdateCategory_25386ce929fb, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_25386ce929fb, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_25386ce929fb, p_Encrypt := p_Encrypt_25386ce929fb, p_EncryptionKeyID := p_EncryptionKeyID_25386ce929fb, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_25386ce929fb, p_SendEncryptedValue := p_SendEncryptedValue_25386ce929fb, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_25386ce929fb, p_IsSoftForeignKey := p_IsSoftForeignKey_25386ce929fb, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_25386ce929fb, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_25386ce929fb, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_25386ce929fb, p_JSONTypeDefinition := p_JSONTypeDefinition_25386ce929fb, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_25386ce929fb, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_25386ce929fb, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_25386ce929fb, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_25386ce929fb, p_IsComputed := p_IsComputed_25386ce929fb, p_EmbeddedRecord := p_EmbeddedRecord_25386ce929fb, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_25386ce929fb, p_Configuration_Clear := TRUE, p_ID := p_ID_25386ce929fb);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_fcee4be76d23 VARCHAR(255);
  p_Description_fcee4be76d23 TEXT;
  p_AutoUpdateDescription_fcee4be76d23 BOOLEAN;
  p_IsPrimaryKey_fcee4be76d23 BOOLEAN;
  p_IsUnique_fcee4be76d23 BOOLEAN;
  p_Category_fcee4be76d23 VARCHAR(255);
  p_ValueListType_fcee4be76d23 VARCHAR(20);
  p_ExtendedType_fcee4be76d23 VARCHAR(50);
  p_CodeType_fcee4be76d23 VARCHAR(50);
  p_DefaultInView_fcee4be76d23 BOOLEAN;
  p_ViewCellTemplate_fcee4be76d23 TEXT;
  p_DefaultColumnWidth_fcee4be76d23 INTEGER;
  p_AllowUpdateAPI_fcee4be76d23 BOOLEAN;
  p_AllowUpdateInView_fcee4be76d23 BOOLEAN;
  p_IncludeInUserSearchAPI_fcee4be76d23 BOOLEAN;
  p_FullTextSearchEnabled_fcee4be76d23 BOOLEAN;
  p_UserSearchParamFormatAPI_fcee4be76d23 VARCHAR(500);
  p_IncludeInGeneratedForm_fcee4be76d23 BOOLEAN;
  p_GeneratedFormSection_fcee4be76d23 VARCHAR(10);
  p_IsNameField_fcee4be76d23 BOOLEAN;
  p_RelatedEntityID_fcee4be76d23 UUID;
  p_RelatedEntityFieldName_fcee4be76d23 VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_fcee4be76d23 BOOLEAN;
  p_RelatedEntityNameFieldMap_fcee4be76d23 VARCHAR(255);
  p_RelatedEntityDisplayType_fcee4be76d23 VARCHAR(20);
  p_EntityIDFieldName_fcee4be76d23 VARCHAR(100);
  p_ScopeDefault_fcee4be76d23 VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_fcee4be76d23 BOOLEAN;
  p_ValuesToPackWithSchema_fcee4be76d23 VARCHAR(10);
  p_Status_fcee4be76d23 VARCHAR(25);
  p_AutoUpdateIsNameField_fcee4be76d23 BOOLEAN;
  p_AutoUpdateDefaultInView_fcee4be76d23 BOOLEAN;
  p_AutoUpdateCategory_fcee4be76d23 BOOLEAN;
  p_AutoUpdateDisplayName_fcee4be76d23 BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_fcee4be76d23 BOOLEAN;
  p_Encrypt_fcee4be76d23 BOOLEAN;
  p_EncryptionKeyID_fcee4be76d23 UUID;
  p_AllowDecryptInAPI_fcee4be76d23 BOOLEAN;
  p_SendEncryptedValue_fcee4be76d23 BOOLEAN;
  p_IsSoftPrimaryKey_fcee4be76d23 BOOLEAN;
  p_IsSoftForeignKey_fcee4be76d23 BOOLEAN;
  p_RelatedEntityJoinFields_fcee4be76d23 TEXT;
  p_JSONType_fcee4be76d23 VARCHAR(255);
  p_JSONTypeIsArray_fcee4be76d23 BOOLEAN;
  p_JSONTypeDefinition_fcee4be76d23 TEXT;
  p_UserSearchPredicateAPI_fcee4be76d23 VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_fcee4be76d23 BOOLEAN;
  p_AutoUpdateFullTextSearch_fcee4be76d23 BOOLEAN;
  p_AutoUpdateExtendedType_fcee4be76d23 BOOLEAN;
  p_IsComputed_fcee4be76d23 BOOLEAN;
  p_EmbeddedRecord_fcee4be76d23 TEXT;
  p_Configuration_fcee4be76d23 TEXT;
  p_ID_fcee4be76d23 UUID;
BEGIN
  p_DisplayName_fcee4be76d23 := 'Billing Address Longitude';
  p_AutoUpdateDescription_fcee4be76d23 := TRUE;
  p_IsPrimaryKey_fcee4be76d23 := FALSE;
  p_IsUnique_fcee4be76d23 := FALSE;
  p_Category_fcee4be76d23 := 'System Metadata';
  p_ValueListType_fcee4be76d23 := 'None';
  p_ExtendedType_fcee4be76d23 := 'GeoLongitude';
  p_DefaultInView_fcee4be76d23 := FALSE;
  p_DefaultColumnWidth_fcee4be76d23 := 150;
  p_AllowUpdateAPI_fcee4be76d23 := FALSE;
  p_AllowUpdateInView_fcee4be76d23 := TRUE;
  p_IncludeInUserSearchAPI_fcee4be76d23 := FALSE;
  p_FullTextSearchEnabled_fcee4be76d23 := FALSE;
  p_IncludeInGeneratedForm_fcee4be76d23 := TRUE;
  p_GeneratedFormSection_fcee4be76d23 := 'Category';
  p_IsNameField_fcee4be76d23 := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_fcee4be76d23 := FALSE;
  p_RelatedEntityDisplayType_fcee4be76d23 := 'Search';
  p_AutoUpdateRelatedEntityInfo_fcee4be76d23 := TRUE;
  p_ValuesToPackWithSchema_fcee4be76d23 := 'Auto';
  p_Status_fcee4be76d23 := 'Active';
  p_AutoUpdateIsNameField_fcee4be76d23 := TRUE;
  p_AutoUpdateDefaultInView_fcee4be76d23 := TRUE;
  p_AutoUpdateCategory_fcee4be76d23 := TRUE;
  p_AutoUpdateDisplayName_fcee4be76d23 := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_fcee4be76d23 := TRUE;
  p_Encrypt_fcee4be76d23 := FALSE;
  p_AllowDecryptInAPI_fcee4be76d23 := FALSE;
  p_SendEncryptedValue_fcee4be76d23 := FALSE;
  p_IsSoftPrimaryKey_fcee4be76d23 := FALSE;
  p_IsSoftForeignKey_fcee4be76d23 := FALSE;
  p_JSONTypeIsArray_fcee4be76d23 := FALSE;
  p_UserSearchPredicateAPI_fcee4be76d23 := 'Contains';
  p_AutoUpdateUserSearchPredicate_fcee4be76d23 := TRUE;
  p_AutoUpdateFullTextSearch_fcee4be76d23 := TRUE;
  p_AutoUpdateExtendedType_fcee4be76d23 := TRUE;
  p_IsComputed_fcee4be76d23 := FALSE;
  p_ID_fcee4be76d23 := '93D40C53-AABA-4AD1-B4A3-D1FA4C5DBA32';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_fcee4be76d23,
    'Description', p_Description_fcee4be76d23,
    'AutoUpdateDescription', p_AutoUpdateDescription_fcee4be76d23,
    'IsPrimaryKey', p_IsPrimaryKey_fcee4be76d23,
    'IsUnique', p_IsUnique_fcee4be76d23,
    'Category', p_Category_fcee4be76d23,
    'ValueListType', p_ValueListType_fcee4be76d23,
    'ExtendedType', p_ExtendedType_fcee4be76d23,
    'CodeType', p_CodeType_fcee4be76d23,
    'DefaultInView', p_DefaultInView_fcee4be76d23,
    'ViewCellTemplate', p_ViewCellTemplate_fcee4be76d23,
    'DefaultColumnWidth', p_DefaultColumnWidth_fcee4be76d23,
    'AllowUpdateAPI', p_AllowUpdateAPI_fcee4be76d23,
    'AllowUpdateInView', p_AllowUpdateInView_fcee4be76d23,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_fcee4be76d23,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_fcee4be76d23,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_fcee4be76d23,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_fcee4be76d23,
    'GeneratedFormSection', p_GeneratedFormSection_fcee4be76d23,
    'IsNameField', p_IsNameField_fcee4be76d23,
    'RelatedEntityID', p_RelatedEntityID_fcee4be76d23,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_fcee4be76d23,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_fcee4be76d23,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_fcee4be76d23,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_fcee4be76d23,
    'EntityIDFieldName', p_EntityIDFieldName_fcee4be76d23,
    'ScopeDefault', p_ScopeDefault_fcee4be76d23,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_fcee4be76d23,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_fcee4be76d23,
    'Status', p_Status_fcee4be76d23,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_fcee4be76d23,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_fcee4be76d23,
    'AutoUpdateCategory', p_AutoUpdateCategory_fcee4be76d23,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_fcee4be76d23,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_fcee4be76d23,
    'Encrypt', p_Encrypt_fcee4be76d23,
    'EncryptionKeyID', p_EncryptionKeyID_fcee4be76d23,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_fcee4be76d23,
    'SendEncryptedValue', p_SendEncryptedValue_fcee4be76d23,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_fcee4be76d23,
    'IsSoftForeignKey', p_IsSoftForeignKey_fcee4be76d23,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_fcee4be76d23,
    'JSONType', p_JSONType_fcee4be76d23,
    'JSONTypeIsArray', p_JSONTypeIsArray_fcee4be76d23,
    'JSONTypeDefinition', p_JSONTypeDefinition_fcee4be76d23,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_fcee4be76d23,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_fcee4be76d23,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_fcee4be76d23,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_fcee4be76d23,
    'IsComputed', p_IsComputed_fcee4be76d23
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_fcee4be76d23,
    'Configuration', p_Configuration_fcee4be76d23,
    'ID', p_ID_fcee4be76d23
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_fcee4be76d23, p_Description := p_Description_fcee4be76d23, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_fcee4be76d23, p_IsPrimaryKey := p_IsPrimaryKey_fcee4be76d23, p_IsUnique := p_IsUnique_fcee4be76d23, p_Category := p_Category_fcee4be76d23, p_ValueListType := p_ValueListType_fcee4be76d23, p_ExtendedType := p_ExtendedType_fcee4be76d23, p_CodeType := p_CodeType_fcee4be76d23, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_fcee4be76d23, p_ViewCellTemplate := p_ViewCellTemplate_fcee4be76d23, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_fcee4be76d23, p_AllowUpdateAPI := p_AllowUpdateAPI_fcee4be76d23, p_AllowUpdateInView := p_AllowUpdateInView_fcee4be76d23, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_fcee4be76d23, p_FullTextSearchEnabled := p_FullTextSearchEnabled_fcee4be76d23, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_fcee4be76d23, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_fcee4be76d23, p_GeneratedFormSection := p_GeneratedFormSection_fcee4be76d23, p_IsNameField := p_IsNameField_fcee4be76d23, p_RelatedEntityID := p_RelatedEntityID_fcee4be76d23, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_fcee4be76d23, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_fcee4be76d23, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_fcee4be76d23, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_fcee4be76d23, p_EntityIDFieldName := p_EntityIDFieldName_fcee4be76d23, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_fcee4be76d23, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_fcee4be76d23, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_fcee4be76d23, p_Status := p_Status_fcee4be76d23, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_fcee4be76d23, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_fcee4be76d23, p_AutoUpdateCategory := p_AutoUpdateCategory_fcee4be76d23, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_fcee4be76d23, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_fcee4be76d23, p_Encrypt := p_Encrypt_fcee4be76d23, p_EncryptionKeyID := p_EncryptionKeyID_fcee4be76d23, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_fcee4be76d23, p_SendEncryptedValue := p_SendEncryptedValue_fcee4be76d23, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_fcee4be76d23, p_IsSoftForeignKey := p_IsSoftForeignKey_fcee4be76d23, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_fcee4be76d23, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_fcee4be76d23, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_fcee4be76d23, p_JSONTypeDefinition := p_JSONTypeDefinition_fcee4be76d23, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_fcee4be76d23, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_fcee4be76d23, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_fcee4be76d23, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_fcee4be76d23, p_IsComputed := p_IsComputed_fcee4be76d23, p_EmbeddedRecord := p_EmbeddedRecord_fcee4be76d23, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_fcee4be76d23, p_Configuration_Clear := TRUE, p_ID := p_ID_fcee4be76d23);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_d3f0d55a882f VARCHAR(255);
  p_Description_d3f0d55a882f TEXT;
  p_AutoUpdateDescription_d3f0d55a882f BOOLEAN;
  p_IsPrimaryKey_d3f0d55a882f BOOLEAN;
  p_IsUnique_d3f0d55a882f BOOLEAN;
  p_Category_d3f0d55a882f VARCHAR(255);
  p_ValueListType_d3f0d55a882f VARCHAR(20);
  p_ExtendedType_d3f0d55a882f VARCHAR(50);
  p_CodeType_d3f0d55a882f VARCHAR(50);
  p_DefaultInView_d3f0d55a882f BOOLEAN;
  p_ViewCellTemplate_d3f0d55a882f TEXT;
  p_DefaultColumnWidth_d3f0d55a882f INTEGER;
  p_AllowUpdateAPI_d3f0d55a882f BOOLEAN;
  p_AllowUpdateInView_d3f0d55a882f BOOLEAN;
  p_IncludeInUserSearchAPI_d3f0d55a882f BOOLEAN;
  p_FullTextSearchEnabled_d3f0d55a882f BOOLEAN;
  p_UserSearchParamFormatAPI_d3f0d55a882f VARCHAR(500);
  p_IncludeInGeneratedForm_d3f0d55a882f BOOLEAN;
  p_GeneratedFormSection_d3f0d55a882f VARCHAR(10);
  p_IsNameField_d3f0d55a882f BOOLEAN;
  p_RelatedEntityID_d3f0d55a882f UUID;
  p_RelatedEntityFieldName_d3f0d55a882f VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_d3f0d55a882f BOOLEAN;
  p_RelatedEntityNameFieldMap_d3f0d55a882f VARCHAR(255);
  p_RelatedEntityDisplayType_d3f0d55a882f VARCHAR(20);
  p_EntityIDFieldName_d3f0d55a882f VARCHAR(100);
  p_ScopeDefault_d3f0d55a882f VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_d3f0d55a882f BOOLEAN;
  p_ValuesToPackWithSchema_d3f0d55a882f VARCHAR(10);
  p_Status_d3f0d55a882f VARCHAR(25);
  p_AutoUpdateIsNameField_d3f0d55a882f BOOLEAN;
  p_AutoUpdateDefaultInView_d3f0d55a882f BOOLEAN;
  p_AutoUpdateCategory_d3f0d55a882f BOOLEAN;
  p_AutoUpdateDisplayName_d3f0d55a882f BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_d3f0d55a882f BOOLEAN;
  p_Encrypt_d3f0d55a882f BOOLEAN;
  p_EncryptionKeyID_d3f0d55a882f UUID;
  p_AllowDecryptInAPI_d3f0d55a882f BOOLEAN;
  p_SendEncryptedValue_d3f0d55a882f BOOLEAN;
  p_IsSoftPrimaryKey_d3f0d55a882f BOOLEAN;
  p_IsSoftForeignKey_d3f0d55a882f BOOLEAN;
  p_RelatedEntityJoinFields_d3f0d55a882f TEXT;
  p_JSONType_d3f0d55a882f VARCHAR(255);
  p_JSONTypeIsArray_d3f0d55a882f BOOLEAN;
  p_JSONTypeDefinition_d3f0d55a882f TEXT;
  p_UserSearchPredicateAPI_d3f0d55a882f VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_d3f0d55a882f BOOLEAN;
  p_AutoUpdateFullTextSearch_d3f0d55a882f BOOLEAN;
  p_AutoUpdateExtendedType_d3f0d55a882f BOOLEAN;
  p_IsComputed_d3f0d55a882f BOOLEAN;
  p_EmbeddedRecord_d3f0d55a882f TEXT;
  p_Configuration_d3f0d55a882f TEXT;
  p_ID_d3f0d55a882f UUID;
BEGIN
  p_DisplayName_d3f0d55a882f := 'Shipping Address Latitude';
  p_AutoUpdateDescription_d3f0d55a882f := TRUE;
  p_IsPrimaryKey_d3f0d55a882f := FALSE;
  p_IsUnique_d3f0d55a882f := FALSE;
  p_Category_d3f0d55a882f := 'System Metadata';
  p_ValueListType_d3f0d55a882f := 'None';
  p_ExtendedType_d3f0d55a882f := 'GeoLatitude';
  p_DefaultInView_d3f0d55a882f := FALSE;
  p_DefaultColumnWidth_d3f0d55a882f := 150;
  p_AllowUpdateAPI_d3f0d55a882f := FALSE;
  p_AllowUpdateInView_d3f0d55a882f := TRUE;
  p_IncludeInUserSearchAPI_d3f0d55a882f := FALSE;
  p_FullTextSearchEnabled_d3f0d55a882f := FALSE;
  p_IncludeInGeneratedForm_d3f0d55a882f := TRUE;
  p_GeneratedFormSection_d3f0d55a882f := 'Category';
  p_IsNameField_d3f0d55a882f := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_d3f0d55a882f := FALSE;
  p_RelatedEntityDisplayType_d3f0d55a882f := 'Search';
  p_AutoUpdateRelatedEntityInfo_d3f0d55a882f := TRUE;
  p_ValuesToPackWithSchema_d3f0d55a882f := 'Auto';
  p_Status_d3f0d55a882f := 'Active';
  p_AutoUpdateIsNameField_d3f0d55a882f := TRUE;
  p_AutoUpdateDefaultInView_d3f0d55a882f := TRUE;
  p_AutoUpdateCategory_d3f0d55a882f := TRUE;
  p_AutoUpdateDisplayName_d3f0d55a882f := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_d3f0d55a882f := TRUE;
  p_Encrypt_d3f0d55a882f := FALSE;
  p_AllowDecryptInAPI_d3f0d55a882f := FALSE;
  p_SendEncryptedValue_d3f0d55a882f := FALSE;
  p_IsSoftPrimaryKey_d3f0d55a882f := FALSE;
  p_IsSoftForeignKey_d3f0d55a882f := FALSE;
  p_JSONTypeIsArray_d3f0d55a882f := FALSE;
  p_UserSearchPredicateAPI_d3f0d55a882f := 'Contains';
  p_AutoUpdateUserSearchPredicate_d3f0d55a882f := TRUE;
  p_AutoUpdateFullTextSearch_d3f0d55a882f := TRUE;
  p_AutoUpdateExtendedType_d3f0d55a882f := TRUE;
  p_IsComputed_d3f0d55a882f := FALSE;
  p_ID_d3f0d55a882f := '1A494C12-70F6-4C02-B1FE-15461D79BAC8';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_d3f0d55a882f,
    'Description', p_Description_d3f0d55a882f,
    'AutoUpdateDescription', p_AutoUpdateDescription_d3f0d55a882f,
    'IsPrimaryKey', p_IsPrimaryKey_d3f0d55a882f,
    'IsUnique', p_IsUnique_d3f0d55a882f,
    'Category', p_Category_d3f0d55a882f,
    'ValueListType', p_ValueListType_d3f0d55a882f,
    'ExtendedType', p_ExtendedType_d3f0d55a882f,
    'CodeType', p_CodeType_d3f0d55a882f,
    'DefaultInView', p_DefaultInView_d3f0d55a882f,
    'ViewCellTemplate', p_ViewCellTemplate_d3f0d55a882f,
    'DefaultColumnWidth', p_DefaultColumnWidth_d3f0d55a882f,
    'AllowUpdateAPI', p_AllowUpdateAPI_d3f0d55a882f,
    'AllowUpdateInView', p_AllowUpdateInView_d3f0d55a882f,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_d3f0d55a882f,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_d3f0d55a882f,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_d3f0d55a882f,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_d3f0d55a882f,
    'GeneratedFormSection', p_GeneratedFormSection_d3f0d55a882f,
    'IsNameField', p_IsNameField_d3f0d55a882f,
    'RelatedEntityID', p_RelatedEntityID_d3f0d55a882f,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_d3f0d55a882f,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_d3f0d55a882f,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_d3f0d55a882f,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_d3f0d55a882f,
    'EntityIDFieldName', p_EntityIDFieldName_d3f0d55a882f,
    'ScopeDefault', p_ScopeDefault_d3f0d55a882f,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_d3f0d55a882f,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_d3f0d55a882f,
    'Status', p_Status_d3f0d55a882f,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_d3f0d55a882f,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_d3f0d55a882f,
    'AutoUpdateCategory', p_AutoUpdateCategory_d3f0d55a882f,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_d3f0d55a882f,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_d3f0d55a882f,
    'Encrypt', p_Encrypt_d3f0d55a882f,
    'EncryptionKeyID', p_EncryptionKeyID_d3f0d55a882f,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_d3f0d55a882f,
    'SendEncryptedValue', p_SendEncryptedValue_d3f0d55a882f,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_d3f0d55a882f,
    'IsSoftForeignKey', p_IsSoftForeignKey_d3f0d55a882f,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_d3f0d55a882f,
    'JSONType', p_JSONType_d3f0d55a882f,
    'JSONTypeIsArray', p_JSONTypeIsArray_d3f0d55a882f,
    'JSONTypeDefinition', p_JSONTypeDefinition_d3f0d55a882f,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_d3f0d55a882f,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_d3f0d55a882f,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_d3f0d55a882f,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_d3f0d55a882f,
    'IsComputed', p_IsComputed_d3f0d55a882f
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_d3f0d55a882f,
    'Configuration', p_Configuration_d3f0d55a882f,
    'ID', p_ID_d3f0d55a882f
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_d3f0d55a882f, p_Description := p_Description_d3f0d55a882f, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_d3f0d55a882f, p_IsPrimaryKey := p_IsPrimaryKey_d3f0d55a882f, p_IsUnique := p_IsUnique_d3f0d55a882f, p_Category := p_Category_d3f0d55a882f, p_ValueListType := p_ValueListType_d3f0d55a882f, p_ExtendedType := p_ExtendedType_d3f0d55a882f, p_CodeType := p_CodeType_d3f0d55a882f, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_d3f0d55a882f, p_ViewCellTemplate := p_ViewCellTemplate_d3f0d55a882f, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_d3f0d55a882f, p_AllowUpdateAPI := p_AllowUpdateAPI_d3f0d55a882f, p_AllowUpdateInView := p_AllowUpdateInView_d3f0d55a882f, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_d3f0d55a882f, p_FullTextSearchEnabled := p_FullTextSearchEnabled_d3f0d55a882f, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_d3f0d55a882f, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_d3f0d55a882f, p_GeneratedFormSection := p_GeneratedFormSection_d3f0d55a882f, p_IsNameField := p_IsNameField_d3f0d55a882f, p_RelatedEntityID := p_RelatedEntityID_d3f0d55a882f, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_d3f0d55a882f, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_d3f0d55a882f, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_d3f0d55a882f, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_d3f0d55a882f, p_EntityIDFieldName := p_EntityIDFieldName_d3f0d55a882f, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_d3f0d55a882f, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_d3f0d55a882f, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_d3f0d55a882f, p_Status := p_Status_d3f0d55a882f, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_d3f0d55a882f, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_d3f0d55a882f, p_AutoUpdateCategory := p_AutoUpdateCategory_d3f0d55a882f, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_d3f0d55a882f, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_d3f0d55a882f, p_Encrypt := p_Encrypt_d3f0d55a882f, p_EncryptionKeyID := p_EncryptionKeyID_d3f0d55a882f, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_d3f0d55a882f, p_SendEncryptedValue := p_SendEncryptedValue_d3f0d55a882f, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_d3f0d55a882f, p_IsSoftForeignKey := p_IsSoftForeignKey_d3f0d55a882f, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_d3f0d55a882f, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_d3f0d55a882f, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_d3f0d55a882f, p_JSONTypeDefinition := p_JSONTypeDefinition_d3f0d55a882f, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_d3f0d55a882f, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_d3f0d55a882f, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_d3f0d55a882f, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_d3f0d55a882f, p_IsComputed := p_IsComputed_d3f0d55a882f, p_EmbeddedRecord := p_EmbeddedRecord_d3f0d55a882f, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_d3f0d55a882f, p_Configuration_Clear := TRUE, p_ID := p_ID_d3f0d55a882f);
  END IF;
END $mj$;

-- Save MJ: Entity Fields (core SP call only)
DO $mj$
DECLARE
  p_DisplayName_f735b039934a VARCHAR(255);
  p_Description_f735b039934a TEXT;
  p_AutoUpdateDescription_f735b039934a BOOLEAN;
  p_IsPrimaryKey_f735b039934a BOOLEAN;
  p_IsUnique_f735b039934a BOOLEAN;
  p_Category_f735b039934a VARCHAR(255);
  p_ValueListType_f735b039934a VARCHAR(20);
  p_ExtendedType_f735b039934a VARCHAR(50);
  p_CodeType_f735b039934a VARCHAR(50);
  p_DefaultInView_f735b039934a BOOLEAN;
  p_ViewCellTemplate_f735b039934a TEXT;
  p_DefaultColumnWidth_f735b039934a INTEGER;
  p_AllowUpdateAPI_f735b039934a BOOLEAN;
  p_AllowUpdateInView_f735b039934a BOOLEAN;
  p_IncludeInUserSearchAPI_f735b039934a BOOLEAN;
  p_FullTextSearchEnabled_f735b039934a BOOLEAN;
  p_UserSearchParamFormatAPI_f735b039934a VARCHAR(500);
  p_IncludeInGeneratedForm_f735b039934a BOOLEAN;
  p_GeneratedFormSection_f735b039934a VARCHAR(10);
  p_IsNameField_f735b039934a BOOLEAN;
  p_RelatedEntityID_f735b039934a UUID;
  p_RelatedEntityFieldName_f735b039934a VARCHAR(255);
  p_IncludeRelatedEntityNameFieldInBaseView_f735b039934a BOOLEAN;
  p_RelatedEntityNameFieldMap_f735b039934a VARCHAR(255);
  p_RelatedEntityDisplayType_f735b039934a VARCHAR(20);
  p_EntityIDFieldName_f735b039934a VARCHAR(100);
  p_ScopeDefault_f735b039934a VARCHAR(100);
  p_AutoUpdateRelatedEntityInfo_f735b039934a BOOLEAN;
  p_ValuesToPackWithSchema_f735b039934a VARCHAR(10);
  p_Status_f735b039934a VARCHAR(25);
  p_AutoUpdateIsNameField_f735b039934a BOOLEAN;
  p_AutoUpdateDefaultInView_f735b039934a BOOLEAN;
  p_AutoUpdateCategory_f735b039934a BOOLEAN;
  p_AutoUpdateDisplayName_f735b039934a BOOLEAN;
  p_AutoUpdateIncludeInUserSearchAPI_f735b039934a BOOLEAN;
  p_Encrypt_f735b039934a BOOLEAN;
  p_EncryptionKeyID_f735b039934a UUID;
  p_AllowDecryptInAPI_f735b039934a BOOLEAN;
  p_SendEncryptedValue_f735b039934a BOOLEAN;
  p_IsSoftPrimaryKey_f735b039934a BOOLEAN;
  p_IsSoftForeignKey_f735b039934a BOOLEAN;
  p_RelatedEntityJoinFields_f735b039934a TEXT;
  p_JSONType_f735b039934a VARCHAR(255);
  p_JSONTypeIsArray_f735b039934a BOOLEAN;
  p_JSONTypeDefinition_f735b039934a TEXT;
  p_UserSearchPredicateAPI_f735b039934a VARCHAR(20);
  p_AutoUpdateUserSearchPredicate_f735b039934a BOOLEAN;
  p_AutoUpdateFullTextSearch_f735b039934a BOOLEAN;
  p_AutoUpdateExtendedType_f735b039934a BOOLEAN;
  p_IsComputed_f735b039934a BOOLEAN;
  p_EmbeddedRecord_f735b039934a TEXT;
  p_Configuration_f735b039934a TEXT;
  p_ID_f735b039934a UUID;
BEGIN
  p_DisplayName_f735b039934a := 'Shipping Address Longitude';
  p_AutoUpdateDescription_f735b039934a := TRUE;
  p_IsPrimaryKey_f735b039934a := FALSE;
  p_IsUnique_f735b039934a := FALSE;
  p_Category_f735b039934a := 'System Metadata';
  p_ValueListType_f735b039934a := 'None';
  p_ExtendedType_f735b039934a := 'GeoLongitude';
  p_DefaultInView_f735b039934a := FALSE;
  p_DefaultColumnWidth_f735b039934a := 150;
  p_AllowUpdateAPI_f735b039934a := FALSE;
  p_AllowUpdateInView_f735b039934a := TRUE;
  p_IncludeInUserSearchAPI_f735b039934a := FALSE;
  p_FullTextSearchEnabled_f735b039934a := FALSE;
  p_IncludeInGeneratedForm_f735b039934a := TRUE;
  p_GeneratedFormSection_f735b039934a := 'Category';
  p_IsNameField_f735b039934a := FALSE;
  p_IncludeRelatedEntityNameFieldInBaseView_f735b039934a := FALSE;
  p_RelatedEntityDisplayType_f735b039934a := 'Search';
  p_AutoUpdateRelatedEntityInfo_f735b039934a := TRUE;
  p_ValuesToPackWithSchema_f735b039934a := 'Auto';
  p_Status_f735b039934a := 'Active';
  p_AutoUpdateIsNameField_f735b039934a := TRUE;
  p_AutoUpdateDefaultInView_f735b039934a := TRUE;
  p_AutoUpdateCategory_f735b039934a := TRUE;
  p_AutoUpdateDisplayName_f735b039934a := TRUE;
  p_AutoUpdateIncludeInUserSearchAPI_f735b039934a := TRUE;
  p_Encrypt_f735b039934a := FALSE;
  p_AllowDecryptInAPI_f735b039934a := FALSE;
  p_SendEncryptedValue_f735b039934a := FALSE;
  p_IsSoftPrimaryKey_f735b039934a := FALSE;
  p_IsSoftForeignKey_f735b039934a := FALSE;
  p_JSONTypeIsArray_f735b039934a := FALSE;
  p_UserSearchPredicateAPI_f735b039934a := 'Contains';
  p_AutoUpdateUserSearchPredicate_f735b039934a := TRUE;
  p_AutoUpdateFullTextSearch_f735b039934a := TRUE;
  p_AutoUpdateExtendedType_f735b039934a := TRUE;
  p_IsComputed_f735b039934a := FALSE;
  p_ID_f735b039934a := '27E4DAFA-8E8D-420C-A298-7A4865061403';
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateEntityField'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_data := jsonb_build_object(
    'DisplayName', p_DisplayName_f735b039934a,
    'Description', p_Description_f735b039934a,
    'AutoUpdateDescription', p_AutoUpdateDescription_f735b039934a,
    'IsPrimaryKey', p_IsPrimaryKey_f735b039934a,
    'IsUnique', p_IsUnique_f735b039934a,
    'Category', p_Category_f735b039934a,
    'ValueListType', p_ValueListType_f735b039934a,
    'ExtendedType', p_ExtendedType_f735b039934a,
    'CodeType', p_CodeType_f735b039934a,
    'DefaultInView', p_DefaultInView_f735b039934a,
    'ViewCellTemplate', p_ViewCellTemplate_f735b039934a,
    'DefaultColumnWidth', p_DefaultColumnWidth_f735b039934a,
    'AllowUpdateAPI', p_AllowUpdateAPI_f735b039934a,
    'AllowUpdateInView', p_AllowUpdateInView_f735b039934a,
    'IncludeInUserSearchAPI', p_IncludeInUserSearchAPI_f735b039934a,
    'FullTextSearchEnabled', p_FullTextSearchEnabled_f735b039934a,
    'UserSearchParamFormatAPI', p_UserSearchParamFormatAPI_f735b039934a,
    'IncludeInGeneratedForm', p_IncludeInGeneratedForm_f735b039934a,
    'GeneratedFormSection', p_GeneratedFormSection_f735b039934a,
    'IsNameField', p_IsNameField_f735b039934a,
    'RelatedEntityID', p_RelatedEntityID_f735b039934a,
    'RelatedEntityFieldName', p_RelatedEntityFieldName_f735b039934a,
    'IncludeRelatedEntityNameFieldInBaseView', p_IncludeRelatedEntityNameFieldInBaseView_f735b039934a,
    'RelatedEntityNameFieldMap', p_RelatedEntityNameFieldMap_f735b039934a,
    'RelatedEntityDisplayType', p_RelatedEntityDisplayType_f735b039934a,
    'EntityIDFieldName', p_EntityIDFieldName_f735b039934a,
    'ScopeDefault', p_ScopeDefault_f735b039934a,
    'AutoUpdateRelatedEntityInfo', p_AutoUpdateRelatedEntityInfo_f735b039934a,
    'ValuesToPackWithSchema', p_ValuesToPackWithSchema_f735b039934a,
    'Status', p_Status_f735b039934a,
    'AutoUpdateIsNameField', p_AutoUpdateIsNameField_f735b039934a,
    'AutoUpdateDefaultInView', p_AutoUpdateDefaultInView_f735b039934a,
    'AutoUpdateCategory', p_AutoUpdateCategory_f735b039934a,
    'AutoUpdateDisplayName', p_AutoUpdateDisplayName_f735b039934a,
    'AutoUpdateIncludeInUserSearchAPI', p_AutoUpdateIncludeInUserSearchAPI_f735b039934a,
    'Encrypt', p_Encrypt_f735b039934a,
    'EncryptionKeyID', p_EncryptionKeyID_f735b039934a,
    'AllowDecryptInAPI', p_AllowDecryptInAPI_f735b039934a,
    'SendEncryptedValue', p_SendEncryptedValue_f735b039934a,
    'IsSoftPrimaryKey', p_IsSoftPrimaryKey_f735b039934a,
    'IsSoftForeignKey', p_IsSoftForeignKey_f735b039934a,
    'RelatedEntityJoinFields', p_RelatedEntityJoinFields_f735b039934a,
    'JSONType', p_JSONType_f735b039934a,
    'JSONTypeIsArray', p_JSONTypeIsArray_f735b039934a,
    'JSONTypeDefinition', p_JSONTypeDefinition_f735b039934a,
    'UserSearchPredicateAPI', p_UserSearchPredicateAPI_f735b039934a,
    'AutoUpdateUserSearchPredicate', p_AutoUpdateUserSearchPredicate_f735b039934a,
    'AutoUpdateFullTextSearch', p_AutoUpdateFullTextSearch_f735b039934a,
    'AutoUpdateExtendedType', p_AutoUpdateExtendedType_f735b039934a,
    'IsComputed', p_IsComputed_f735b039934a
  ) ||
  jsonb_build_object(
    'EmbeddedRecord', p_EmbeddedRecord_f735b039934a,
    'Configuration', p_Configuration_f735b039934a,
    'ID', p_ID_f735b039934a
  ));
  ELSE
    PERFORM "${mjSchema}"."spUpdateEntityField"(p_DisplayName := p_DisplayName_f735b039934a, p_Description := p_Description_f735b039934a, p_Description_Clear := TRUE, p_AutoUpdateDescription := p_AutoUpdateDescription_f735b039934a, p_IsPrimaryKey := p_IsPrimaryKey_f735b039934a, p_IsUnique := p_IsUnique_f735b039934a, p_Category := p_Category_f735b039934a, p_ValueListType := p_ValueListType_f735b039934a, p_ExtendedType := p_ExtendedType_f735b039934a, p_CodeType := p_CodeType_f735b039934a, p_CodeType_Clear := TRUE, p_DefaultInView := p_DefaultInView_f735b039934a, p_ViewCellTemplate := p_ViewCellTemplate_f735b039934a, p_ViewCellTemplate_Clear := TRUE, p_DefaultColumnWidth := p_DefaultColumnWidth_f735b039934a, p_AllowUpdateAPI := p_AllowUpdateAPI_f735b039934a, p_AllowUpdateInView := p_AllowUpdateInView_f735b039934a, p_IncludeInUserSearchAPI := p_IncludeInUserSearchAPI_f735b039934a, p_FullTextSearchEnabled := p_FullTextSearchEnabled_f735b039934a, p_UserSearchParamFormatAPI := p_UserSearchParamFormatAPI_f735b039934a, p_UserSearchParamFormatAPI_Clear := TRUE, p_IncludeInGeneratedForm := p_IncludeInGeneratedForm_f735b039934a, p_GeneratedFormSection := p_GeneratedFormSection_f735b039934a, p_IsNameField := p_IsNameField_f735b039934a, p_RelatedEntityID := p_RelatedEntityID_f735b039934a, p_RelatedEntityID_Clear := TRUE, p_RelatedEntityFieldName := p_RelatedEntityFieldName_f735b039934a, p_RelatedEntityFieldName_Clear := TRUE, p_IncludeRelatedEntityNameFieldInBaseView := p_IncludeRelatedEntityNameFieldInBaseView_f735b039934a, p_RelatedEntityNameFieldMap := p_RelatedEntityNameFieldMap_f735b039934a, p_RelatedEntityNameFieldMap_Clear := TRUE, p_RelatedEntityDisplayType := p_RelatedEntityDisplayType_f735b039934a, p_EntityIDFieldName := p_EntityIDFieldName_f735b039934a, p_EntityIDFieldName_Clear := TRUE, p_ScopeDefault := p_ScopeDefault_f735b039934a, p_ScopeDefault_Clear := TRUE, p_AutoUpdateRelatedEntityInfo := p_AutoUpdateRelatedEntityInfo_f735b039934a, p_ValuesToPackWithSchema := p_ValuesToPackWithSchema_f735b039934a, p_Status := p_Status_f735b039934a, p_AutoUpdateIsNameField := p_AutoUpdateIsNameField_f735b039934a, p_AutoUpdateDefaultInView := p_AutoUpdateDefaultInView_f735b039934a, p_AutoUpdateCategory := p_AutoUpdateCategory_f735b039934a, p_AutoUpdateDisplayName := p_AutoUpdateDisplayName_f735b039934a, p_AutoUpdateIncludeInUserSearchAPI := p_AutoUpdateIncludeInUserSearchAPI_f735b039934a, p_Encrypt := p_Encrypt_f735b039934a, p_EncryptionKeyID := p_EncryptionKeyID_f735b039934a, p_EncryptionKeyID_Clear := TRUE, p_AllowDecryptInAPI := p_AllowDecryptInAPI_f735b039934a, p_SendEncryptedValue := p_SendEncryptedValue_f735b039934a, p_IsSoftPrimaryKey := p_IsSoftPrimaryKey_f735b039934a, p_IsSoftForeignKey := p_IsSoftForeignKey_f735b039934a, p_RelatedEntityJoinFields := p_RelatedEntityJoinFields_f735b039934a, p_RelatedEntityJoinFields_Clear := TRUE, p_JSONType := p_JSONType_f735b039934a, p_JSONType_Clear := TRUE, p_JSONTypeIsArray := p_JSONTypeIsArray_f735b039934a, p_JSONTypeDefinition := p_JSONTypeDefinition_f735b039934a, p_JSONTypeDefinition_Clear := TRUE, p_UserSearchPredicateAPI := p_UserSearchPredicateAPI_f735b039934a, p_AutoUpdateUserSearchPredicate := p_AutoUpdateUserSearchPredicate_f735b039934a, p_AutoUpdateFullTextSearch := p_AutoUpdateFullTextSearch_f735b039934a, p_AutoUpdateExtendedType := p_AutoUpdateExtendedType_f735b039934a, p_IsComputed := p_IsComputed_f735b039934a, p_EmbeddedRecord := p_EmbeddedRecord_f735b039934a, p_EmbeddedRecord_Clear := TRUE, p_Configuration := p_Configuration_f735b039934a, p_Configuration_Clear := TRUE, p_ID := p_ID_f735b039934a);
  END IF;
END $mj$;

-- Save MJ: Authorization Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_86b3803ea243 UUID;
  p_AuthorizationID_86b3803ea243 UUID;
  p_RoleID_86b3803ea243 UUID;
  p_Type_86b3803ea243 CHAR(10);
BEGIN
  p_ID_86b3803ea243 := '95C1EB47-69B0-49AB-A007-FC035EB5CB86';
  p_AuthorizationID_86b3803ea243 := '78CAE9AB-DD73-4128-AC23-6A58BE45302A';
  p_RoleID_86b3803ea243 := '1318256E-6FE4-4349-82D6-FED8724E7103';
  p_Type_86b3803ea243 := 'Allow';
  p_AuthorizationID_86b3803ea243 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Authorization" WHERE "Name" = 'MJ.BizApps.Orders.Coverage.RunAlongside' ORDER BY CASE WHEN "ID" = p_AuthorizationID_86b3803ea243 THEN 0 ELSE 1 END LIMIT 1), p_AuthorizationID_86b3803ea243);
  p_RoleID_86b3803ea243 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Account Director' ORDER BY CASE WHEN "ID" = p_RoleID_86b3803ea243 THEN 0 ELSE 1 END LIMIT 1), p_RoleID_86b3803ea243);
  IF p_AuthorizationID_86b3803ea243 IS NOT NULL AND p_RoleID_86b3803ea243 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."AuthorizationRole"
               WHERE "ID" = p_ID_86b3803ea243
                  OR ("AuthorizationID" = p_AuthorizationID_86b3803ea243 AND "RoleID" = p_RoleID_86b3803ea243)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorizationRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_data := jsonb_build_object(
      'ID', p_ID_86b3803ea243,
      'AuthorizationID', p_AuthorizationID_86b3803ea243,
      'RoleID', p_RoleID_86b3803ea243,
      'Type', p_Type_86b3803ea243
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_ID := p_ID_86b3803ea243, p_AuthorizationID := p_AuthorizationID_86b3803ea243, p_RoleID := p_RoleID_86b3803ea243, p_Type := p_Type_86b3803ea243);
    END IF;
  END IF;
END $mj$;

-- Save MJ: User Views (core SP call only)
DO $mj$
DECLARE
  p_ID_67f12f72c686 UUID;
  p_UserID_67f12f72c686 UUID;
  p_EntityID_67f12f72c686 UUID;
  p_Name_67f12f72c686 VARCHAR(100);
  p_Description_67f12f72c686 TEXT;
  p_CategoryID_67f12f72c686 UUID;
  p_IsShared_67f12f72c686 BOOLEAN;
  p_IsDefault_67f12f72c686 BOOLEAN;
  p_GridState_67f12f72c686 TEXT;
  p_FilterState_67f12f72c686 TEXT;
  p_CustomFilterState_67f12f72c686 BOOLEAN;
  p_SmartFilterEnabled_67f12f72c686 BOOLEAN;
  p_SmartFilterPrompt_67f12f72c686 TEXT;
  p_SmartFilterWhereClause_67f12f72c686 TEXT;
  p_SmartFilterExplanation_67f12f72c686 TEXT;
  p_WhereClause_67f12f72c686 TEXT;
  p_CustomWhereClause_67f12f72c686 BOOLEAN;
  p_SortState_67f12f72c686 TEXT;
  p_Thumbnail_67f12f72c686 TEXT;
  p_CardState_67f12f72c686 TEXT;
  p_DisplayState_67f12f72c686 TEXT;
  p_ViewTypeID_67f12f72c686 UUID;
BEGIN
  p_ID_67f12f72c686 := 'C9D3144D-0394-4BF2-AE31-74D8858C3B13';
  p_UserID_67f12f72c686 := 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
  p_EntityID_67f12f72c686 := '0E13E45B-0FF1-4B09-8919-CE576829E178';
  p_Name_67f12f72c686 := 'Concessions: Approved, No Signed Amendment';
  p_Description_67f12f72c686 := 'Approved concessions whose signed contract amendment is not yet on file, oldest approval first.';
  p_IsShared_67f12f72c686 := TRUE;
  p_IsDefault_67f12f72c686 := FALSE;
  p_GridState_67f12f72c686 := '{"sortSettings":[{"field":"DecidedAt","dir":"asc"}],"columnSettings":[{"Name":"OrderHeader","DisplayName":"Order","orderIndex":0,"width":140,"pinned":"left"},{"Name":"DeliveryForm","DisplayName":"Form","orderIndex":1,"width":100},{"Name":"ReasonCategory","DisplayName":"Reason","orderIndex":2,"width":110},{"Name":"ComputedValue","DisplayName":"Value","orderIndex":3,"width":120,"format":{"type":"currency","currencyCode":"USD","decimals":2,"align":"right"}},{"Name":"RequestedByUser","DisplayName":"Requested by","orderIndex":4,"width":180},{"Name":"DecidedByUser","DisplayName":"Approved by","orderIndex":5,"width":180},{"Name":"DecidedAt","DisplayName":"Approved","orderIndex":6,"width":140,"format":{"type":"date","dateFormat":"medium"}},{"Name":"Reason","DisplayName":"Details","orderIndex":7,"width":320}]}';
  p_FilterState_67f12f72c686 := '{"logic":"and","filters":[]}';
  p_CustomFilterState_67f12f72c686 := FALSE;
  p_SmartFilterEnabled_67f12f72c686 := FALSE;
  p_WhereClause_67f12f72c686 := '[Status] = ''Approved'' AND [SignedAmendmentReference] IS NULL';
  p_CustomWhereClause_67f12f72c686 := TRUE;
  p_EntityID_67f12f72c686 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Order Concessions' ORDER BY CASE WHEN "ID" = p_EntityID_67f12f72c686 THEN 0 ELSE 1 END LIMIT 1), p_EntityID_67f12f72c686);
  IF p_EntityID_67f12f72c686 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."UserView" WHERE "ID" = p_ID_67f12f72c686) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateUserView'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateUserView"(p_data := jsonb_build_object(
      'ID', p_ID_67f12f72c686,
      'UserID', p_UserID_67f12f72c686,
      'EntityID', p_EntityID_67f12f72c686,
      'Name', p_Name_67f12f72c686,
      'Description', p_Description_67f12f72c686,
      'CategoryID', p_CategoryID_67f12f72c686,
      'IsShared', p_IsShared_67f12f72c686,
      'IsDefault', p_IsDefault_67f12f72c686,
      'GridState', p_GridState_67f12f72c686,
      'FilterState', p_FilterState_67f12f72c686,
      'CustomFilterState', p_CustomFilterState_67f12f72c686,
      'SmartFilterEnabled', p_SmartFilterEnabled_67f12f72c686,
      'SmartFilterPrompt', p_SmartFilterPrompt_67f12f72c686,
      'SmartFilterWhereClause', p_SmartFilterWhereClause_67f12f72c686,
      'SmartFilterExplanation', p_SmartFilterExplanation_67f12f72c686,
      'WhereClause', p_WhereClause_67f12f72c686,
      'CustomWhereClause', p_CustomWhereClause_67f12f72c686,
      'SortState', p_SortState_67f12f72c686,
      'Thumbnail', p_Thumbnail_67f12f72c686,
      'CardState', p_CardState_67f12f72c686,
      'DisplayState', p_DisplayState_67f12f72c686,
      'ViewTypeID', p_ViewTypeID_67f12f72c686
    ));
    ELSE
      PERFORM "${mjSchema}"."spCreateUserView"(p_ID := p_ID_67f12f72c686, p_UserID := p_UserID_67f12f72c686, p_EntityID := p_EntityID_67f12f72c686, p_Name := p_Name_67f12f72c686, p_Description := p_Description_67f12f72c686, p_CategoryID := p_CategoryID_67f12f72c686, p_CategoryID_Clear := TRUE, p_IsShared := p_IsShared_67f12f72c686, p_IsDefault := p_IsDefault_67f12f72c686, p_GridState := p_GridState_67f12f72c686, p_FilterState := p_FilterState_67f12f72c686, p_CustomFilterState := p_CustomFilterState_67f12f72c686, p_SmartFilterEnabled := p_SmartFilterEnabled_67f12f72c686, p_SmartFilterPrompt := p_SmartFilterPrompt_67f12f72c686, p_SmartFilterPrompt_Clear := TRUE, p_SmartFilterWhereClause := p_SmartFilterWhereClause_67f12f72c686, p_SmartFilterWhereClause_Clear := TRUE, p_SmartFilterExplanation := p_SmartFilterExplanation_67f12f72c686, p_SmartFilterExplanation_Clear := TRUE, p_WhereClause := p_WhereClause_67f12f72c686, p_CustomWhereClause := p_CustomWhereClause_67f12f72c686, p_SortState := p_SortState_67f12f72c686, p_SortState_Clear := TRUE, p_Thumbnail := p_Thumbnail_67f12f72c686, p_Thumbnail_Clear := TRUE, p_CardState := p_CardState_67f12f72c686, p_CardState_Clear := TRUE, p_DisplayState := p_DisplayState_67f12f72c686, p_DisplayState_Clear := TRUE, p_ViewTypeID := p_ViewTypeID_67f12f72c686, p_ViewTypeID_Clear := TRUE);
    END IF;
  END IF;
END $mj$;


-- ===================== Other =====================

-- End of SQL Logging Session
-- Session ID: c07c7832-682b-4c35-b3c1-b3ad1c2f4412
-- Completed: 2026-10-14T22:56:54.458Z
-- Duration: 9070ms
-- Total Statements: 94

-- =============================================================================================
-- PostgreSQL counterpart of V202611120328__v5.49.x__Metadata_Sync.sql
-- =============================================================================================
-- Same records, same values as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE: `mj sql-convert --from tsql --to postgres` (MJ CLI 6.2.1) on each block of the
-- push log, one block per run. The three creates are guarded on ID or OperationKey with their update
-- branches removed, and their category resolves by its ID first, then by name. The two updates
-- resolve their row by OperationKey or name, the shipped ID first, and run only when it exists.
-- Core references use ${mjSchema}; string values are the T-SQL file's, verbatim.
-- =============================================================================================

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_6ff3586b5d09 UUID;
  p_Name_6ff3586b5d09 VARCHAR(255);
  p_OperationKey_6ff3586b5d09 VARCHAR(255);
  p_CategoryID_6ff3586b5d09 UUID;
  p_Description_6ff3586b5d09 TEXT;
  p_InputTypeName_6ff3586b5d09 VARCHAR(255);
  p_InputTypeDefinition_6ff3586b5d09 TEXT;
  p_InputTypeIsArray_6ff3586b5d09 BOOLEAN;
  p_OutputTypeName_6ff3586b5d09 VARCHAR(255);
  p_OutputTypeDefinition_6ff3586b5d09 TEXT;
  p_OutputTypeIsArray_6ff3586b5d09 BOOLEAN;
  p_ExecutionMode_6ff3586b5d09 VARCHAR(20);
  p_RequiredScope_6ff3586b5d09 VARCHAR(255);
  p_RequiresSystemUser_6ff3586b5d09 BOOLEAN;
  p_GenerationType_6ff3586b5d09 VARCHAR(20);
  p_Code_6ff3586b5d09 TEXT;
  p_CodeApprovalStatus_6ff3586b5d09 VARCHAR(20);
  p_CodeApprovedByUserID_6ff3586b5d09 UUID;
  p_CodeApprovedAt_6ff3586b5d09 TIMESTAMPTZ;
  p_ContractFingerprint_6ff3586b5d09 VARCHAR(100);
  p_Status_6ff3586b5d09 VARCHAR(20);
  p_CacheTTLSeconds_6ff3586b5d09 INTEGER;
  p_TimeoutMS_6ff3586b5d09 INTEGER;
  p_MaxConcurrency_6ff3586b5d09 INTEGER;
  p_CodeLocked_6ff3586b5d09 BOOLEAN;
  p_CodeComments_6ff3586b5d09 TEXT;
  p_Libraries_6ff3586b5d09 TEXT;
BEGIN
  p_ID_6ff3586b5d09 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C442';
  p_Name_6ff3586b5d09 := 'Change Subscription Product';
  p_OperationKey_6ff3586b5d09 := 'Orders.ChangeSubscriptionProduct';
  -- The Subscriptions category this app ships, its ID first, then by name.
  p_CategoryID_6ff3586b5d09 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304' THEN 0 ELSE 1 END LIMIT 1), 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304');
  p_Description_6ff3586b5d09 := 'Correct the product on one or more subscriptions: what they are subscriptions to, and so what their next renewal is placed on. Writes the subscription rows and nothing else: the order that sold the current term, its journal and its deal keep the product they were booked with, and the next renewal carries the new product at the current term''s price plus the increase. The product must be Active and a subscription product; a subscription on a different subscription type is refused unless AdoptProductType moves it; a product sold by another company is allowed and reported as a warning; a gateway-billed subscription refuses the change. One line back per subscription.';
  p_InputTypeName_6ff3586b5d09 := 'OrdersChangeSubscriptionProductInput';
  p_InputTypeDefinition_6ff3586b5d09 := '/**
 * Input for `Orders.ChangeSubscriptionProduct`.
 *
 * Corrects the product on one or more subscriptions: what they are subscriptions TO, and so what
 * their next renewal is placed on. Writes the subscription rows and nothing else. The order that
 * sold the current term, its journal and its deal keep the product they were booked with; the next
 * renewal carries the new product at the current term''s price plus the increase.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersChangeSubscriptionProductInput {
    /** The subscriptions to correct. Every ID must be a subscription''s row ID. */
    SubscriptionIDs: string[];
    /** The product they should be on: Active, and a subscription product (one with a subscription type). */
    ProductID: string;
    /**
     * When the product''s subscription type differs from a subscription''s, move the subscription to
     * the product''s type as well (term length, cadence and lead time follow the type). Left out or
     * false, such a subscription is refused and reported, so a term length never changes unnoticed.
     */
    AdoptProductType?: boolean;
}
';
  p_InputTypeIsArray_6ff3586b5d09 := FALSE;
  p_OutputTypeName_6ff3586b5d09 := 'OrdersChangeSubscriptionProductOutput';
  p_OutputTypeDefinition_6ff3586b5d09 := '/**
 * Output for `Orders.ChangeSubscriptionProduct`.
 *
 * One entry per subscription asked for, whether or not it changed.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SubscriptionProductChange {
    SubscriptionID: string;
    SubscriptionNumber: string | null;
    PreviousProductID: string | null;
    PreviousProductName: string | null;
    CurrentProductID: string | null;
    CurrentProductName: string | null;
    /** True when the subscription was also moved to the product''s subscription type. */
    TypeMoved: boolean;
    /** Something a person should know about a row that was written: the product is sold by another company, for one. */
    Warning?: string;
    /** True when the row was written. False when it was already on the product, or when it failed. */
    Changed: boolean;
    /** Set when this subscription could not be changed: not found, a type that differs, or a refused save. */
    Error?: string;
}

export interface OrdersChangeSubscriptionProductOutput {
    Success: boolean;
    Message?: string;
    Updated: number;
    Unchanged: number;
    Failed: number;
    Changes: SubscriptionProductChange[];
}
';
  p_OutputTypeIsArray_6ff3586b5d09 := FALSE;
  p_ExecutionMode_6ff3586b5d09 := 'Sync';
  p_RequiredScope_6ff3586b5d09 := 'orders:subscriptions:write';
  p_RequiresSystemUser_6ff3586b5d09 := FALSE;
  p_GenerationType_6ff3586b5d09 := 'Manual';
  p_CodeApprovalStatus_6ff3586b5d09 := 'Approved';
  p_Status_6ff3586b5d09 := 'Active';
  p_CodeLocked_6ff3586b5d09 := FALSE;
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
                 WHERE "ID" = p_ID_6ff3586b5d09
                    OR "OperationKey" = p_OperationKey_6ff3586b5d09) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
    'ID', p_ID_6ff3586b5d09,
    'Name', p_Name_6ff3586b5d09,
    'OperationKey', p_OperationKey_6ff3586b5d09,
    'CategoryID', p_CategoryID_6ff3586b5d09,
    'Description', p_Description_6ff3586b5d09,
    'InputTypeName', p_InputTypeName_6ff3586b5d09,
    'InputTypeDefinition', p_InputTypeDefinition_6ff3586b5d09,
    'InputTypeIsArray', p_InputTypeIsArray_6ff3586b5d09,
    'OutputTypeName', p_OutputTypeName_6ff3586b5d09,
    'OutputTypeDefinition', p_OutputTypeDefinition_6ff3586b5d09,
    'OutputTypeIsArray', p_OutputTypeIsArray_6ff3586b5d09,
    'ExecutionMode', p_ExecutionMode_6ff3586b5d09,
    'RequiredScope', p_RequiredScope_6ff3586b5d09,
    'RequiresSystemUser', p_RequiresSystemUser_6ff3586b5d09,
    'GenerationType', p_GenerationType_6ff3586b5d09,
    'Code', p_Code_6ff3586b5d09,
    'CodeApprovalStatus', p_CodeApprovalStatus_6ff3586b5d09,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_6ff3586b5d09,
    'CodeApprovedAt', p_CodeApprovedAt_6ff3586b5d09,
    'ContractFingerprint', p_ContractFingerprint_6ff3586b5d09,
    'Status', p_Status_6ff3586b5d09,
    'CacheTTLSeconds', p_CacheTTLSeconds_6ff3586b5d09,
    'TimeoutMS', p_TimeoutMS_6ff3586b5d09,
    'MaxConcurrency', p_MaxConcurrency_6ff3586b5d09,
    'CodeLocked', p_CodeLocked_6ff3586b5d09,
    'CodeComments', p_CodeComments_6ff3586b5d09,
    'Libraries', p_Libraries_6ff3586b5d09
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_6ff3586b5d09, p_Name := p_Name_6ff3586b5d09, p_OperationKey := p_OperationKey_6ff3586b5d09, p_CategoryID := p_CategoryID_6ff3586b5d09, p_Description := p_Description_6ff3586b5d09, p_InputTypeName := p_InputTypeName_6ff3586b5d09, p_InputTypeDefinition := p_InputTypeDefinition_6ff3586b5d09, p_InputTypeIsArray := p_InputTypeIsArray_6ff3586b5d09, p_OutputTypeName := p_OutputTypeName_6ff3586b5d09, p_OutputTypeDefinition := p_OutputTypeDefinition_6ff3586b5d09, p_OutputTypeIsArray := p_OutputTypeIsArray_6ff3586b5d09, p_ExecutionMode := p_ExecutionMode_6ff3586b5d09, p_RequiredScope := p_RequiredScope_6ff3586b5d09, p_RequiresSystemUser := p_RequiresSystemUser_6ff3586b5d09, p_GenerationType := p_GenerationType_6ff3586b5d09, p_Code := p_Code_6ff3586b5d09, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_6ff3586b5d09, p_CodeApprovedByUserID := p_CodeApprovedByUserID_6ff3586b5d09, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_6ff3586b5d09, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_6ff3586b5d09, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_6ff3586b5d09, p_CacheTTLSeconds := p_CacheTTLSeconds_6ff3586b5d09, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_6ff3586b5d09, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_6ff3586b5d09, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_6ff3586b5d09, p_CodeComments := p_CodeComments_6ff3586b5d09, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_6ff3586b5d09, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_ea65731eb444 UUID;
  p_Name_ea65731eb444 VARCHAR(255);
  p_OperationKey_ea65731eb444 VARCHAR(255);
  p_CategoryID_ea65731eb444 UUID;
  p_Description_ea65731eb444 TEXT;
  p_InputTypeName_ea65731eb444 VARCHAR(255);
  p_InputTypeDefinition_ea65731eb444 TEXT;
  p_InputTypeIsArray_ea65731eb444 BOOLEAN;
  p_OutputTypeName_ea65731eb444 VARCHAR(255);
  p_OutputTypeDefinition_ea65731eb444 TEXT;
  p_OutputTypeIsArray_ea65731eb444 BOOLEAN;
  p_ExecutionMode_ea65731eb444 VARCHAR(20);
  p_RequiredScope_ea65731eb444 VARCHAR(255);
  p_RequiresSystemUser_ea65731eb444 BOOLEAN;
  p_GenerationType_ea65731eb444 VARCHAR(20);
  p_Code_ea65731eb444 TEXT;
  p_CodeApprovalStatus_ea65731eb444 VARCHAR(20);
  p_CodeApprovedByUserID_ea65731eb444 UUID;
  p_CodeApprovedAt_ea65731eb444 TIMESTAMPTZ;
  p_ContractFingerprint_ea65731eb444 VARCHAR(100);
  p_Status_ea65731eb444 VARCHAR(20);
  p_CacheTTLSeconds_ea65731eb444 INTEGER;
  p_TimeoutMS_ea65731eb444 INTEGER;
  p_MaxConcurrency_ea65731eb444 INTEGER;
  p_CodeLocked_ea65731eb444 BOOLEAN;
  p_CodeComments_ea65731eb444 TEXT;
  p_Libraries_ea65731eb444 TEXT;
BEGIN
  p_ID_ea65731eb444 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C441';
  p_Name_ea65731eb444 := 'Set Renewal Settings';
  p_OperationKey_ea65731eb444 := 'Orders.SetRenewalSettings';
  -- The Subscriptions category this app ships, its ID first, then by name.
  p_CategoryID_ea65731eb444 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304' THEN 0 ELSE 1 END LIMIT 1), 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304');
  p_Description_ea65731eb444 := 'Set the renewal switches on one or more subscriptions: AutoRenew (whether the scheduled pass renews it) and RenewalIncreasePercent (the rate the renewal pricer reads before the product''s, its category''s and the company''s; null clears so it inherits, 0 is a deliberate no-increase). A field left out is left alone. Writes the subscription rows through the entity and nothing else: no order is touched, and the next renewal each subscription places follows the new settings. A gateway-billed subscription refuses an auto-renew change and is reported, not failed. One line back per subscription.';
  p_InputTypeName_ea65731eb444 := 'OrdersSetRenewalSettingsInput';
  p_InputTypeDefinition_ea65731eb444 := '/**
 * Input for `Orders.SetRenewalSettings`.
 *
 * Sets the renewal switches on one or more subscriptions: the auto-renew flag and the annual
 * increase the renewal pricer reads first (`Subscription.RenewalIncreasePercent`). Writes the
 * subscription rows and nothing else: no order is touched, no renewal is placed or repriced. The
 * next renewal each subscription places, by the scheduled pass or from the Renewals page, follows
 * the new settings.
 *
 * A field left out is left alone; at least one must be given.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersSetRenewalSettingsInput {
    /** The subscriptions to set. Every ID must be a subscription''s row ID. */
    SubscriptionIDs: string[];
    /**
     * Whether the scheduled pass renews the subscription. `true` places a confirmed renewal at lead
     * time; `false` lets the term end unless somebody renews it by hand. A subscription a payment
     * gateway bills refuses this change (the gateway owns the switch), and is reported, not failed.
     * Left out: unchanged.
     */
    AutoRenew?: boolean;
    /**
     * The rate in percent, so 5 means five percent: 0 to 100, at most four decimals. `null` clears
     * the subscription''s own rate, so it inherits the product''s, then its category''s, then the
     * company''s. `0` is a deliberate "no increase" that overrides all of those. Left out: unchanged.
     */
    IncreasePercent?: number | null;
}
';
  p_InputTypeIsArray_ea65731eb444 := FALSE;
  p_OutputTypeName_ea65731eb444 := 'OrdersSetRenewalSettingsOutput';
  p_OutputTypeDefinition_ea65731eb444 := '/**
 * Output for `Orders.SetRenewalSettings`.
 *
 * One entry per subscription asked for, whether or not it changed, so a bulk update from a page
 * can say exactly what it did and what it could not.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RenewalSettingsState {
    AutoRenew: boolean | null;
    /** The subscription''s own rate. `null` means it inherits. */
    IncreasePercent: number | null;
}

export interface RenewalSettingsChange {
    SubscriptionID: string;
    SubscriptionNumber: string | null;
    /** The settings before this call. */
    Previous: RenewalSettingsState;
    /** The settings after this call. Equals `Previous` when nothing changed. */
    Current: RenewalSettingsState;
    /** True when the row was written. False when it already held the settings, or when it failed. */
    Changed: boolean;
    /** Set when this subscription could not be updated: not found, or the save was refused. */
    Error?: string;
}

export interface OrdersSetRenewalSettingsOutput {
    Success: boolean;
    Message?: string;
    /** Rows written. */
    Updated: number;
    /** Rows that already held the settings. */
    Unchanged: number;
    /** Rows that could not be written; each carries its reason. */
    Failed: number;
    Changes: RenewalSettingsChange[];
}
';
  p_OutputTypeIsArray_ea65731eb444 := FALSE;
  p_ExecutionMode_ea65731eb444 := 'Sync';
  p_RequiredScope_ea65731eb444 := 'orders:subscriptions:write';
  p_RequiresSystemUser_ea65731eb444 := FALSE;
  p_GenerationType_ea65731eb444 := 'Manual';
  p_CodeApprovalStatus_ea65731eb444 := 'Approved';
  p_Status_ea65731eb444 := 'Active';
  p_CodeLocked_ea65731eb444 := FALSE;
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
                 WHERE "ID" = p_ID_ea65731eb444
                    OR "OperationKey" = p_OperationKey_ea65731eb444) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
    'ID', p_ID_ea65731eb444,
    'Name', p_Name_ea65731eb444,
    'OperationKey', p_OperationKey_ea65731eb444,
    'CategoryID', p_CategoryID_ea65731eb444,
    'Description', p_Description_ea65731eb444,
    'InputTypeName', p_InputTypeName_ea65731eb444,
    'InputTypeDefinition', p_InputTypeDefinition_ea65731eb444,
    'InputTypeIsArray', p_InputTypeIsArray_ea65731eb444,
    'OutputTypeName', p_OutputTypeName_ea65731eb444,
    'OutputTypeDefinition', p_OutputTypeDefinition_ea65731eb444,
    'OutputTypeIsArray', p_OutputTypeIsArray_ea65731eb444,
    'ExecutionMode', p_ExecutionMode_ea65731eb444,
    'RequiredScope', p_RequiredScope_ea65731eb444,
    'RequiresSystemUser', p_RequiresSystemUser_ea65731eb444,
    'GenerationType', p_GenerationType_ea65731eb444,
    'Code', p_Code_ea65731eb444,
    'CodeApprovalStatus', p_CodeApprovalStatus_ea65731eb444,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_ea65731eb444,
    'CodeApprovedAt', p_CodeApprovedAt_ea65731eb444,
    'ContractFingerprint', p_ContractFingerprint_ea65731eb444,
    'Status', p_Status_ea65731eb444,
    'CacheTTLSeconds', p_CacheTTLSeconds_ea65731eb444,
    'TimeoutMS', p_TimeoutMS_ea65731eb444,
    'MaxConcurrency', p_MaxConcurrency_ea65731eb444,
    'CodeLocked', p_CodeLocked_ea65731eb444,
    'CodeComments', p_CodeComments_ea65731eb444,
    'Libraries', p_Libraries_ea65731eb444
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_ea65731eb444, p_Name := p_Name_ea65731eb444, p_OperationKey := p_OperationKey_ea65731eb444, p_CategoryID := p_CategoryID_ea65731eb444, p_Description := p_Description_ea65731eb444, p_InputTypeName := p_InputTypeName_ea65731eb444, p_InputTypeDefinition := p_InputTypeDefinition_ea65731eb444, p_InputTypeIsArray := p_InputTypeIsArray_ea65731eb444, p_OutputTypeName := p_OutputTypeName_ea65731eb444, p_OutputTypeDefinition := p_OutputTypeDefinition_ea65731eb444, p_OutputTypeIsArray := p_OutputTypeIsArray_ea65731eb444, p_ExecutionMode := p_ExecutionMode_ea65731eb444, p_RequiredScope := p_RequiredScope_ea65731eb444, p_RequiresSystemUser := p_RequiresSystemUser_ea65731eb444, p_GenerationType := p_GenerationType_ea65731eb444, p_Code := p_Code_ea65731eb444, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_ea65731eb444, p_CodeApprovedByUserID := p_CodeApprovedByUserID_ea65731eb444, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_ea65731eb444, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_ea65731eb444, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_ea65731eb444, p_CacheTTLSeconds := p_CacheTTLSeconds_ea65731eb444, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_ea65731eb444, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_ea65731eb444, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_ea65731eb444, p_CodeComments := p_CodeComments_ea65731eb444, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_ea65731eb444, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_InputTypeDefinition_ae7c80fb5431 TEXT;
  p_OutputTypeDefinition_ae7c80fb5431 TEXT;
  p_ID_ae7c80fb5431 UUID;
BEGIN
  p_InputTypeDefinition_ae7c80fb5431 := '/**
 * Input for `Orders.SpawnRenewals`.
 *
 * A renewal is a SCHEDULED CONTINUATION and auto-renew is the consent switch. This
 * finds subscriptions whose LATEST term expires inside their own lead window and
 * places a confirmed renewal order for each that consented. Given `SubscriptionIDs`
 * it instead places renewals for the subscriptions a person chose, as drafts where
 * the customer has not consented to recurring billing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /**
     * Place renewals for exactly these subscriptions, chosen by a person (the Renewals page). The lead
     * window and the auto-renew switch do not select here; eligibility still does (Active or Trialing,
     * latest term Scheduled or Active, not billed by a gateway, no renewal already pending), and each
     * ineligible id is reported as a skipped candidate rather than silently dropped.
     */
    SubscriptionIDs?: string[];
    /**
     * How to leave each order: `Confirmed` books and invoices it; `Draft` saves it for a person to
     * confirm. Defaults to `Confirmed` for the scheduled selection, and for `SubscriptionIDs` to
     * `Confirmed` where the subscription has auto-renew on and `Draft` where it does not.
     */
    PlaceAs?: ''Confirmed'' | ''Draft'';
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}
';
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
    /** `Subscription.AutoRenew`. */
    AutoRenew?: boolean;
    /** How the order was, or would be, left. */
    OrderStatus?: ''Confirmed'' | ''Draft'';
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /**
     * Which renewal order of this pass the subscription renews on, 1-based. Members with the same number
     * share one order: same selling company, customer, term end, placement and renewal card.
     */
    OrderGroup?: number;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription''s own, or its successor. */
    RenewalProductID?: string;
    /**
     * The renewal''s unit price before the increase. When the line that bought the expiring term bought
     * several terms (a 24-month line on a 12-month type), one term''s share of that line''s price.
     */
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
    /** Seats the renewal buys. */
    Quantity?: number;
    /** First day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermStart?: string;
    /** Last day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermEnd?: string;
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
    /** Renewal ORDERS placed; a candidate with an `OrderID` is a subscription renewed on one of them. */
    Placed: number;
    Skipped: number;
}
';
  p_ID_ae7c80fb5431 := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C409';
  -- Spawn Renewals resolves by its OperationKey, the shipped ID first.
  p_ID_ae7c80fb5431 := (SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.SpawnRenewals' ORDER BY CASE WHEN "ID" = p_ID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1);
  IF p_ID_ae7c80fb5431 IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
      'InputTypeDefinition', p_InputTypeDefinition_ae7c80fb5431,
      'OutputTypeDefinition', p_OutputTypeDefinition_ae7c80fb5431,
      'ID', p_ID_ae7c80fb5431
    ));
    ELSE
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_InputTypeDefinition := p_InputTypeDefinition_ae7c80fb5431, p_OutputTypeDefinition := p_OutputTypeDefinition_ae7c80fb5431, p_ID := p_ID_ae7c80fb5431);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_ID_a428c03696ff UUID;
  p_Name_a428c03696ff VARCHAR(255);
  p_OperationKey_a428c03696ff VARCHAR(255);
  p_CategoryID_a428c03696ff UUID;
  p_Description_a428c03696ff TEXT;
  p_InputTypeName_a428c03696ff VARCHAR(255);
  p_InputTypeDefinition_a428c03696ff TEXT;
  p_InputTypeIsArray_a428c03696ff BOOLEAN;
  p_OutputTypeName_a428c03696ff VARCHAR(255);
  p_OutputTypeDefinition_a428c03696ff TEXT;
  p_OutputTypeIsArray_a428c03696ff BOOLEAN;
  p_ExecutionMode_a428c03696ff VARCHAR(20);
  p_RequiredScope_a428c03696ff VARCHAR(255);
  p_RequiresSystemUser_a428c03696ff BOOLEAN;
  p_GenerationType_a428c03696ff VARCHAR(20);
  p_Code_a428c03696ff TEXT;
  p_CodeApprovalStatus_a428c03696ff VARCHAR(20);
  p_CodeApprovedByUserID_a428c03696ff UUID;
  p_CodeApprovedAt_a428c03696ff TIMESTAMPTZ;
  p_ContractFingerprint_a428c03696ff VARCHAR(100);
  p_Status_a428c03696ff VARCHAR(20);
  p_CacheTTLSeconds_a428c03696ff INTEGER;
  p_TimeoutMS_a428c03696ff INTEGER;
  p_MaxConcurrency_a428c03696ff INTEGER;
  p_CodeLocked_a428c03696ff BOOLEAN;
  p_CodeComments_a428c03696ff TEXT;
  p_Libraries_a428c03696ff TEXT;
BEGIN
  p_ID_a428c03696ff := 'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C440';
  p_Name_a428c03696ff := 'Get Renewal Worklist';
  p_OperationKey_a428c03696ff := 'Orders.GetRenewalWorklist';
  -- The Subscriptions category this app ships, its ID first, then by name.
  p_CategoryID_a428c03696ff := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperationCategory" WHERE "Name" = 'Subscriptions' ORDER BY CASE WHEN "ID" = 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304' THEN 0 ELSE 1 END LIMIT 1), 'B1C4E2A0-6F3D-4A18-9E52-7C0D5A81B304');
  p_Description_a428c03696ff := 'The Renewals page: every subscription whose coverage ends inside a window (soonest first), with the order that bought the expiring term, the renewal order where one exists, and otherwise the price a renewal would be placed at and the day the scheduled pass would place it. Read-only; computed per request because the window moves with the calendar and the price with the catalog. The projection runs the same pricer Orders.SpawnRenewals places with.';
  p_InputTypeName_a428c03696ff := 'OrdersGetRenewalWorklistInput';
  p_InputTypeDefinition_a428c03696ff := '/**
 * Input for `Orders.GetRenewalWorklist`.
 *
 * The Renewals page: every subscription whose coverage ends inside a window, with the order that
 * bought the expiring term, the renewal order if one exists, and otherwise what the renewal would
 * be placed at and when the scheduled pass would place it. Computed at read time, because "ending
 * inside the window" moves with the calendar and the price moves with the catalog.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetRenewalWorklistInput {
    /** Treat this as "today", `YYYY-MM-DD`. Defaults to the business day. */
    AsOfDate?: string;
    /** How far ahead to look, in days. Defaults to 90. */
    WindowDays?: number;
    /**
     * How far back to look, in days, for terms that ended and were not renewed. Defaults to 30. Zero
     * means "ending today or later" only.
     */
    LookbackDays?: number;
    /** Restrict to subscriptions sold by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
    /**
     * Price the renewal for each row that has none yet (the `Projected*` fields). Defaults to true.
     * Off, the list reads faster and says nothing about price.
     */
    Project?: boolean;
}
';
  p_InputTypeIsArray_a428c03696ff := FALSE;
  p_OutputTypeName_a428c03696ff := 'OrdersGetRenewalWorklistOutput';
  p_OutputTypeDefinition_a428c03696ff := '/**
 * Output for `Orders.GetRenewalWorklist`.
 *
 * One row per subscription whose expiring term ends inside the window, soonest first. Every date is
 * `YYYY-MM-DD`. Money is before tax; a line total is the unit price times the seats, less the line''s
 * discount, and says nothing about promotions or charges.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type RenewalWorklistState =
    | ''Renewed''
    | ''RenewalPending''
    | ''DueNow''
    | ''Scheduled''
    | ''Lapsed''
    | ''WillEnd''
    | ''Ended''
    | ''ProviderBilled''
    | ''Inactive'';

export interface RenewalWorklistRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    /** `Subscription.Status`. */
    Status: string;
    AutoRenew: boolean;
    /** A payment gateway bills this subscription; Orders places no renewal order for it. */
    ProviderBilled: boolean;
    /** The beneficiary: the person the service is for. */
    ContactID?: string | null;
    ContactName?: string | null;
    /** The holder: the organization that pays. */
    AccountID?: string | null;
    AccountName?: string | null;
    /** The selling company. */
    CompanyID: string;
    CompanyName: string;
    ProductID: string;
    ProductName: string;
    SubscriptionTypeName: string;
    /** `Subscription.StartDate`: when the relationship began. */
    StartDate: string;
    /** The expiring term. */
    TermNumber: number;
    TermStartDate: string;
    TermEndDate: string;
    /** Days from the as-of day to the term end; negative once it has ended. */
    DaysUntilEnd: number;
    /** Lead days in force: the subscription''s own, else its type''s, else 0. */
    LeadDays: number;
    /** Where the renewal stands; see the state list. */
    State: RenewalWorklistState;
    /** The day the scheduled pass would place the renewal, while it still will (`DueNow`, `Scheduled`). */
    AutoRenewOn?: string | null;

    /** The order whose line bought the expiring term. */
    CurrentOrderID?: string | null;
    CurrentOrderNumber?: string | null;
    CurrentOrderDate?: string | null;
    CurrentOrderStatus?: string | null;
    CurrentUnitPrice?: number | null;
    CurrentQuantity?: number | null;
    CurrentLineTotal?: number | null;
    /** What is still owed on the current order. */
    CurrentOrderBalance?: number | null;

    /**
     * The renewal order, when one exists: the order whose line bought the following term
     * (`RenewalBooked`), or a live renewal order that has not produced a term yet (a draft).
     */
    RenewalOrderID?: string | null;
    RenewalOrderNumber?: string | null;
    RenewalOrderDate?: string | null;
    RenewalOrderStatus?: string | null;
    RenewalUnitPrice?: number | null;
    RenewalQuantity?: number | null;
    RenewalLineTotal?: number | null;
    RenewalTermStart?: string | null;
    RenewalTermEnd?: string | null;
    /** True when the following term exists: the renewal has booked. */
    RenewalBooked: boolean;

    /** `Subscription.RenewalIncreasePercent`, the rate set on the subscription itself; null means it inherits. */
    SubscriptionIncreasePercent?: number | null;

    /** What a renewal placed now would be written with, for a row that has none. Absent when not projected. */
    ProjectedUnitPrice?: number | null;
    ProjectedQuantity?: number | null;
    ProjectedLineTotal?: number | null;
    ProjectedBasePrice?: number | null;
    ProjectedBasePriceSource?: ''PriorPrice'' | ''PriorList'' | ''SuccessorList'' | null;
    ProjectedIncreasePercent?: number | null;
    ProjectedIncreaseSource?: ''Subscription'' | ''Product'' | ''Category'' | ''Company'' | ''None'' | null;
    /**
     * The increase that IS set for this subscription (its own, or inherited), whether or not this
     * renewal applied it, and whether it did. A renewal applies the increase only when the new term
     * crosses an anniversary of the subscription''s start; a monthly term crosses one once a year.
     */
    ProjectedIncreaseSetPercent?: number | null;
    ProjectedIncreaseSetSource?: ''Subscription'' | ''Product'' | ''Category'' | ''Company'' | ''None'' | null;
    ProjectedIncreaseApplied?: boolean | null;
    /** The product the renewal would be placed on: the subscription''s own, or its successor. */
    ProjectedProductID?: string | null;
    ProjectedProductName?: string | null;
    ProjectedTermStart?: string | null;
    ProjectedTermEnd?: string | null;
    /** Why the renewal could not be priced, in words a person can act on. */
    ProjectionProblem?: string | null;
}

export interface OrdersGetRenewalWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: RenewalWorklistRow[];
    RowCount: number;
    /** True when `MaxCount` clipped the result. */
    Truncated: boolean;
    /** The window the rows were selected in, echoed so the UI can say what it is showing. */
    AsOfDate: string;
    WindowStart: string;
    WindowEnd: string;
    /**
     * How the scheduled renewal pass is set up on this host, so the page can say whether "due for
     * renewal" rows will actually be placed: `Live` places orders; `Preview` runs nightly but only
     * reports (the shipped default until a person turns it live); `Off` is disabled or missing;
     * `Unknown` when the job could not be read.
     */
    PassMode: ''Live'' | ''Preview'' | ''Off'' | ''Unknown'';
    /** The pass''s next scheduled run, as the scheduler reports it, when known. */
    PassNextRunAt?: string | null;
}
';
  p_OutputTypeIsArray_a428c03696ff := FALSE;
  p_ExecutionMode_a428c03696ff := 'Sync';
  p_RequiredScope_a428c03696ff := 'orders:read';
  p_RequiresSystemUser_a428c03696ff := FALSE;
  p_GenerationType_a428c03696ff := 'Manual';
  p_CodeApprovalStatus_a428c03696ff := 'Approved';
  p_Status_a428c03696ff := 'Active';
  p_CodeLocked_a428c03696ff := FALSE;
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation"
                 WHERE "ID" = p_ID_a428c03696ff
                    OR "OperationKey" = p_OperationKey_a428c03696ff) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_data := jsonb_build_object(
    'ID', p_ID_a428c03696ff,
    'Name', p_Name_a428c03696ff,
    'OperationKey', p_OperationKey_a428c03696ff,
    'CategoryID', p_CategoryID_a428c03696ff,
    'Description', p_Description_a428c03696ff,
    'InputTypeName', p_InputTypeName_a428c03696ff,
    'InputTypeDefinition', p_InputTypeDefinition_a428c03696ff,
    'InputTypeIsArray', p_InputTypeIsArray_a428c03696ff,
    'OutputTypeName', p_OutputTypeName_a428c03696ff,
    'OutputTypeDefinition', p_OutputTypeDefinition_a428c03696ff,
    'OutputTypeIsArray', p_OutputTypeIsArray_a428c03696ff,
    'ExecutionMode', p_ExecutionMode_a428c03696ff,
    'RequiredScope', p_RequiredScope_a428c03696ff,
    'RequiresSystemUser', p_RequiresSystemUser_a428c03696ff,
    'GenerationType', p_GenerationType_a428c03696ff,
    'Code', p_Code_a428c03696ff,
    'CodeApprovalStatus', p_CodeApprovalStatus_a428c03696ff,
    'CodeApprovedByUserID', p_CodeApprovedByUserID_a428c03696ff,
    'CodeApprovedAt', p_CodeApprovedAt_a428c03696ff,
    'ContractFingerprint', p_ContractFingerprint_a428c03696ff,
    'Status', p_Status_a428c03696ff,
    'CacheTTLSeconds', p_CacheTTLSeconds_a428c03696ff,
    'TimeoutMS', p_TimeoutMS_a428c03696ff,
    'MaxConcurrency', p_MaxConcurrency_a428c03696ff,
    'CodeLocked', p_CodeLocked_a428c03696ff,
    'CodeComments', p_CodeComments_a428c03696ff,
    'Libraries', p_Libraries_a428c03696ff
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRemoteOperation"(p_ID := p_ID_a428c03696ff, p_Name := p_Name_a428c03696ff, p_OperationKey := p_OperationKey_a428c03696ff, p_CategoryID := p_CategoryID_a428c03696ff, p_Description := p_Description_a428c03696ff, p_InputTypeName := p_InputTypeName_a428c03696ff, p_InputTypeDefinition := p_InputTypeDefinition_a428c03696ff, p_InputTypeIsArray := p_InputTypeIsArray_a428c03696ff, p_OutputTypeName := p_OutputTypeName_a428c03696ff, p_OutputTypeDefinition := p_OutputTypeDefinition_a428c03696ff, p_OutputTypeIsArray := p_OutputTypeIsArray_a428c03696ff, p_ExecutionMode := p_ExecutionMode_a428c03696ff, p_RequiredScope := p_RequiredScope_a428c03696ff, p_RequiresSystemUser := p_RequiresSystemUser_a428c03696ff, p_GenerationType := p_GenerationType_a428c03696ff, p_Code := p_Code_a428c03696ff, p_Code_Clear := TRUE, p_CodeApprovalStatus := p_CodeApprovalStatus_a428c03696ff, p_CodeApprovedByUserID := p_CodeApprovedByUserID_a428c03696ff, p_CodeApprovedByUserID_Clear := TRUE, p_CodeApprovedAt := p_CodeApprovedAt_a428c03696ff, p_CodeApprovedAt_Clear := TRUE, p_ContractFingerprint := p_ContractFingerprint_a428c03696ff, p_ContractFingerprint_Clear := TRUE, p_Status := p_Status_a428c03696ff, p_CacheTTLSeconds := p_CacheTTLSeconds_a428c03696ff, p_CacheTTLSeconds_Clear := TRUE, p_TimeoutMS := p_TimeoutMS_a428c03696ff, p_TimeoutMS_Clear := TRUE, p_MaxConcurrency := p_MaxConcurrency_a428c03696ff, p_MaxConcurrency_Clear := TRUE, p_CodeLocked := p_CodeLocked_a428c03696ff, p_CodeComments := p_CodeComments_a428c03696ff, p_CodeComments_Clear := TRUE, p_Libraries := p_Libraries_a428c03696ff, p_Libraries_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Applications (core SP call only)
DO $mj$
DECLARE
  p_Description_22c4a1da5ce5 TEXT;
  p_DefaultNavItems_22c4a1da5ce5 TEXT;
  p_ID_22c4a1da5ce5 UUID;
BEGIN
  p_Description_22c4a1da5ce5 := 'Order entry, payments, receivables, subscriptions and the product catalog. The confirmed order is the receivable — there is no separate invoice — so billing, collections and revenue recognition all read the same record the order taker created.';
  p_DefaultNavItems_22c4a1da5ce5 := '[
  {
    "Label": "Orders",
    "Icon": "fa-solid fa-file-invoice-dollar",
    "ResourceType": "Custom",
    "DriverClass": "OrdersSectionResource",
    "isDefault": true
  },
  {
    "Label": "Payments",
    "Icon": "fa-solid fa-money-check-dollar",
    "ResourceType": "Custom",
    "DriverClass": "PaymentsSectionResource",
    "isDefault": false
  },
  {
    "Label": "Receivables",
    "Icon": "fa-solid fa-chart-column",
    "ResourceType": "Custom",
    "DriverClass": "ReceivablesSectionResource",
    "isDefault": false
  },
  {
    "Label": "Subscriptions",
    "Icon": "fa-solid fa-rotate",
    "ResourceType": "Custom",
    "DriverClass": "SubscriptionsSectionResource",
    "isDefault": false
  },
  {
    "Label": "Catalog",
    "Icon": "fa-solid fa-box-open",
    "ResourceType": "Custom",
    "DriverClass": "CatalogSectionResource",
    "isDefault": false
  }
]';
  p_ID_22c4a1da5ce5 := 'D3E6A4C2-8F5B-4C31-9A74-2E3F7C03D501';
  -- The Orders application resolves by name, the shipped ID first.
  p_ID_22c4a1da5ce5 := (SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = 'Orders' ORDER BY CASE WHEN "ID" = p_ID_22c4a1da5ce5 THEN 0 ELSE 1 END LIMIT 1);
  IF p_ID_22c4a1da5ce5 IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateApplication'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spUpdateApplication"(p_data := jsonb_build_object(
      'Description', p_Description_22c4a1da5ce5,
      'DefaultNavItems', p_DefaultNavItems_22c4a1da5ce5,
      'ID', p_ID_22c4a1da5ce5
    ));
    ELSE
      PERFORM "${mjSchema}"."spUpdateApplication"(p_Description := p_Description_22c4a1da5ce5, p_DefaultNavItems := p_DefaultNavItems_22c4a1da5ce5, p_ID := p_ID_22c4a1da5ce5);
    END IF;
  END IF;
END $mj$;

-- =============================================================================================
-- PostgreSQL counterpart of V202611190410__v5.51.x__Metadata_Sync.sql
-- =============================================================================================
-- Same records, same values as the T-SQL file; see its header for what ships and why.
--
-- HOW IT WAS MADE: `mj sql-convert --from tsql --to postgres` (MJ CLI 6.2.1) on each block of the
-- push log, one block per run. Each create's guard is widened to match the T-SQL file (ID, or the
-- natural key) and its update branch removed, so every record is create-only; lookups resolve by
-- Name, the pinned ID first. The two remote-operation updates resolve by OperationKey and run only
-- when a definition differs. Core references use ${mjSchema}; string values are the T-SQL file's,
-- verbatim.
-- =============================================================================================

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_OutputTypeDefinition_ae7c80fb5431 TEXT;
  p_ID_ae7c80fb5431 UUID;
BEGIN
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
     * The renewal''s unit price before the increase. When the line that bought the expiring term was
     * longer than the renewal term (a 24-month line renewing for 12), the term''s share of that line''s
     * price: renewal months over line months (golive #338, golive #468).
     */
    BasePrice?: number;
    /**
     * The prior line''s price, before it was cut to the renewal term''s share. Set only when the line
     * that bought the expiring term was longer than the renewal term (golive #468).
     */
    PriorUnitPrice?: number;
    /** The months the prior line covered. Set when it differs from the renewal term''s length (golive #468). */
    PriorLineMonths?: number;
    /** The months the renewal term covers. Set alongside `PriorLineMonths`. */
    RenewalTermMonths?: number;
    /**
     * Why a person should check this renewal''s price before it bills (golive #468). Set when the prior
     * line was shorter than the renewal term: it renews at the short line''s price, unscaled, since
     * that price may be a part-year price or a full-year price sold over a short first period.
     */
    PriceReview?: string;
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
  -- Orders.SpawnRenewals resolves by its OperationKey, the shipped ID first, and is written only when a
  -- definition differs, so a rerun writes nothing.
  p_ID_ae7c80fb5431 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.SpawnRenewals' ORDER BY CASE WHEN "ID" = p_ID_ae7c80fb5431 THEN 0 ELSE 1 END LIMIT 1), p_ID_ae7c80fb5431);
  IF EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation" WHERE "ID" = p_ID_ae7c80fb5431
               AND ("OutputTypeDefinition" IS DISTINCT FROM p_OutputTypeDefinition_ae7c80fb5431)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
      'OutputTypeDefinition', p_OutputTypeDefinition_ae7c80fb5431,
      'ID', p_ID_ae7c80fb5431
    ));
    ELSE
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_OutputTypeDefinition := p_OutputTypeDefinition_ae7c80fb5431, p_ID := p_ID_ae7c80fb5431);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Remote Operations (core SP call only)
DO $mj$
DECLARE
  p_InputTypeDefinition_10ea5def3d49 TEXT;
  p_OutputTypeDefinition_10ea5def3d49 TEXT;
  p_ID_10ea5def3d49 UUID;
BEGIN
  p_InputTypeDefinition_10ea5def3d49 := '/**
 * Input for `Orders.PriceOrder`.
 *
 * Answers "what does THIS ORDER come to" — the whole order, priced through the real pipeline, with
 * nothing persisted. The wide sibling of `Orders.PreviewPrice`, which answers for one product.
 *
 * WHY IT TAKES AN ORDER RATHER THAN A LIST OF LINES. A per-line answer cannot be right: promotions
 * stack against ORDER totals and can be limited per order, charges apportion ACROSS lines, and tax
 * computes on the DISCOUNTED amount rather than on list price. `PreviewPrice` says so itself — its
 * result is explicitly advisory. This one is not.
 *
 * WHY THE SHAPE MIRRORS THE ENTITY AND IS NOT A DTO. This is deliberately the same information
 * `BaseEntity.SerializeCompanions()` produces for `MJ.SaveEntityGraph`: the header fields that steer
 * pricing, plus the lines. The client builds an `OrderEntity`, prices it, edits it, prices it again,
 * and finally saves THE SAME OBJECT — no translation layer in between.
 *
 * This repository previously had that translation layer (`OrderDraft` plus a hydrator) and it was a
 * parallel universe: a hand-maintained mirror of the entity that drifted from it silently, in both
 * directions. Reintroducing a bespoke pricing DTO would rebuild it under a new name.
 *
 * NOTHING HERE NEEDS TO EXIST YET. `OrderHeaderID` is optional and the lines carry no keys, because
 * the common case is an order being composed on screen that has never been saved.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PriceOrderInput {
    /** The order being priced, when it is already saved. Omit while composing a new one. */
    OrderHeaderID?: string | null;

    /** The selling company. Owns the price lists, the promotion policy and the stacking mode. */
    CompanyID: string;

    /** Who is buying — either may be omitted; both omitted prices at base rates. */
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;

    /** The date prices and tax rates are read AS OF. Defaults to today. */
    OrderDate?: string | null;

    /** Decides tax jurisdiction. Without it the order is priced untaxed. */
    ShipToAddressID?: string | null;

    /** The lines to price, in order. */
    Lines: Array<{
        ProductID: string;
        Quantity: number;
        /** Omit to have the engine resolve it. Supplying it PINS the price, exactly as on a real line. */
        UnitPrice?: number | null;
        /**
         * The named price the line is on, carried with a pinned `UnitPrice` so the answer names the
         * rule it was picked from (a revenue band the rep chose, a named list price). Ignored when
         * `UnitPrice` is omitted: the engine then decides the rule (golive #470).
         */
        ProductPriceID?: string | null;
        DiscountPct?: number | null;
        ServicePeriodStart?: string | null;
        ServicePeriodEnd?: string | null;
    }>;

    /** Promotion codes the customer presented. */
    PromotionCodes?: string[];

    /** Ad-hoc discounts with a stated reason, each gated by the applying user''s SalesAuthority. */
    ManualDiscounts?: Array<{
        LineIndex: number;
        Amount?: number | null;
        Percent?: number | null;
        Reason: string;
    }>;

    /** Charges to apply — shipping, handling. Tax layers are resolved, not requested. */
    Charges?: Array<{
        Code: string;
        Amount?: number | null;
        Rate?: number | null;
        TargetLineIndex?: number | null;
    }>;
}
';
  p_OutputTypeDefinition_10ea5def3d49 := '/**
 * Output for `Orders.PriceOrder`.
 *
 * What the order comes to, per line and in total, plus WHY — the same decisions the booking path
 * makes, produced by the same code, with nothing written.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface PriceOrderOutput {
    /** False when pricing could not complete; `Message` says what stopped it. */
    Success: boolean;
    Message?: string | null;

    /** Priced lines, positionally matching the input''s `Lines`. */
    Lines: Array<{
        ProductID: string;
        Quantity: number;
        /** Resolved unless the caller pinned it. */
        UnitPrice: number;
        /** From promotions and manual discounts, apportioned across the order. */
        DiscountAmount: number;
        /** Non-tax charges apportioned onto this line. */
        ChargeAmount: number;
        LineTax: number;
        LineTotalNet: number;
        LineTotalGross: number;
        /**
         * How the unit price was arrived at — which list, which rule, which volume band. The same
         * decomposition `Orders.PreviewPrice` returns, so the price badge can explain itself.
         */
        Components?: Array<{ Kind: string; Label: string; Amount: number }>;
        /** Present when the line owes no tax, saying why (exempt, non-taxable, no nexus). */
        TaxExemptReason?: string | null;
        /**
         * The rule that produced `UnitPrice`: the engine''s choice, or for a pinned price the
         * `ProductPriceID` the caller sent with it. Null when neither names one. This is what
         * `OrderLine.ProductPriceID` would be stamped with.
         */
        ProductPriceID?: string | null;
        /**
         * Why this line has no price while the rest of the order does: a revenue band the rep still
         * has to pick, because the buyer has no revenue on record (golive #470). Absent otherwise.
         */
        Error?: string | null;
        /**
         * What the rules say for this line REGARDLESS of any pinned price — the engine''s default.
         *
         * A pinned line is priced at what the caller stated, so `UnitPrice` above cannot say what
         * the line would have cost on its own. The editor needs that answer while a line is
         * overridden: it is how the Default row of the picker knows what it restores, how the
         * "overridden" badge knows whether the stated price is actually a deviation, and how a
         * named rule that merely restates the default is told apart from one that changes it.
         * Null when no rule prices the product. Absent when the operation was not asked for it.
         */
        Default?: { UnitPrice: number; ProductPriceID: string | null; PriceName: string | null } | null;
    }>;

    Totals: {
        Net: number;
        Discount: number;
        Charges: number;
        Tax: number;
        Gross: number;
    };

    /**
     * Codes that resolved to nothing usable, and why — ''no such code'', ''not currently running'',
     * ''this customer does not qualify''.
     *
     * Silence is the wrong answer here: a customer who typed a code needs to be told it did nothing,
     * and told what would make it work. The order path already carries these; exposing them means the
     * screen can too, before the order is saved.
     */
    UnusableCodes: Array<{ Code: string; Reason: string }>;
}
';
  p_ID_10ea5def3d49 := '0D548A40-71A1-408E-9364-C3A0D6F1479F';
  -- Orders.PriceOrder resolves by its OperationKey, the shipped ID first, and is written only when a
  -- definition differs, so a rerun writes nothing.
  p_ID_10ea5def3d49 := COALESCE((SELECT "ID" FROM "${mjSchema}"."RemoteOperation" WHERE "OperationKey" = 'Orders.PriceOrder' ORDER BY CASE WHEN "ID" = p_ID_10ea5def3d49 THEN 0 ELSE 1 END LIMIT 1), p_ID_10ea5def3d49);
  IF EXISTS (SELECT 1 FROM "${mjSchema}"."RemoteOperation" WHERE "ID" = p_ID_10ea5def3d49
               AND ("InputTypeDefinition" IS DISTINCT FROM p_InputTypeDefinition_10ea5def3d49
                  OR "OutputTypeDefinition" IS DISTINCT FROM p_OutputTypeDefinition_10ea5def3d49)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spUpdateRemoteOperation'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_data := jsonb_build_object(
      'InputTypeDefinition', p_InputTypeDefinition_10ea5def3d49,
      'OutputTypeDefinition', p_OutputTypeDefinition_10ea5def3d49,
      'ID', p_ID_10ea5def3d49
    ));
    ELSE
      PERFORM "${mjSchema}"."spUpdateRemoteOperation"(p_InputTypeDefinition := p_InputTypeDefinition_10ea5def3d49, p_OutputTypeDefinition := p_OutputTypeDefinition_10ea5def3d49, p_ID := p_ID_10ea5def3d49);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_38af025054ab UUID;
  p_ApplicationID_38af025054ab UUID;
  p_Name_38af025054ab VARCHAR(100);
  p_Value_38af025054ab TEXT;
  p_Comments_38af025054ab TEXT;
BEGIN
  p_ID_38af025054ab := 'B4A10E72-5C8D-43F9-91E2-87D6C4305FA1';
  p_ApplicationID_38af025054ab := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_38af025054ab := 'BillComCreateCustomerOnSend';
  p_Value_38af025054ab := 'true';
  p_Comments_38af025054ab := 'Whether Orders may create a new customer in Bill.com when sending an invoice for a bill-to party that has no ExternalCustomer mapping row and no matching accountNumber in Bill.com. True by default; set to false when existing Bill.com customers must be matched or mapped before an invoice is sent.';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_ApplicationID_38af025054ab := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_38af025054ab THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_38af025054ab);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
                 WHERE "ID" = p_ID_38af025054ab
                    OR ("ApplicationID" = p_ApplicationID_38af025054ab AND "Name" = p_Name_38af025054ab)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
    'ID', p_ID_38af025054ab,
    'ApplicationID', p_ApplicationID_38af025054ab,
    'Name', p_Name_38af025054ab,
    'Value', p_Value_38af025054ab,
    'Comments', p_Comments_38af025054ab
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_38af025054ab, p_ApplicationID := p_ApplicationID_38af025054ab, p_Name := p_Name_38af025054ab, p_Value := p_Value_38af025054ab, p_Comments := p_Comments_38af025054ab);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_cb6d0c23d8f8 UUID;
  p_ApplicationID_cb6d0c23d8f8 UUID;
  p_Name_cb6d0c23d8f8 VARCHAR(100);
  p_Value_cb6d0c23d8f8 TEXT;
  p_Comments_cb6d0c23d8f8 TEXT;
BEGIN
  p_ID_cb6d0c23d8f8 := 'C8F23B19-7E4A-49D1-A53B-19E82D706CB2';
  p_ApplicationID_cb6d0c23d8f8 := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_cb6d0c23d8f8 := 'BillComInvoiceReadyNotifyRole';
  p_Value_cb6d0c23d8f8 := '';
  p_Comments_cb6d0c23d8f8 := 'The NAME of the MJ role whose active holders receive an ACTION_ITEM task when an external invoice is created in Bill.com (ready to review/send in Bill.com), linked to both the OrderHeader and the ExternalInvoice. Empty raises no task.';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_ApplicationID_cb6d0c23d8f8 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_cb6d0c23d8f8 THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_cb6d0c23d8f8);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
                 WHERE "ID" = p_ID_cb6d0c23d8f8
                    OR ("ApplicationID" = p_ApplicationID_cb6d0c23d8f8 AND "Name" = p_Name_cb6d0c23d8f8)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
    'ID', p_ID_cb6d0c23d8f8,
    'ApplicationID', p_ApplicationID_cb6d0c23d8f8,
    'Name', p_Name_cb6d0c23d8f8,
    'Value', p_Value_cb6d0c23d8f8,
    'Comments', p_Comments_cb6d0c23d8f8
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_cb6d0c23d8f8, p_ApplicationID := p_ApplicationID_cb6d0c23d8f8, p_Name := p_Name_cb6d0c23d8f8, p_Value := p_Value_cb6d0c23d8f8, p_Comments := p_Comments_cb6d0c23d8f8);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Application Settings (core SP call only)
DO $mj$
DECLARE
  p_ID_baca17066e7a UUID;
  p_ApplicationID_baca17066e7a UUID;
  p_Name_baca17066e7a VARCHAR(100);
  p_Value_baca17066e7a TEXT;
  p_Comments_baca17066e7a TEXT;
BEGIN
  p_ID_baca17066e7a := 'D1E74A60-8B9C-4E12-B64C-2AF93E817DC3';
  p_ApplicationID_baca17066e7a := 'FB80FEB4-5505-49D1-93CE-2E7BD030B478';
  p_Name_baca17066e7a := 'BillComInvoiceReadyWebhookURL';
  p_Value_baca17066e7a := '';
  p_Comments_baca17066e7a := 'Optional HTTPS/HTTP webhook URL (such as an incoming Teams or Slack webhook) that receives a JSON POST notification whenever an external invoice is created in Bill.com. Empty sends no webhook.';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_ApplicationID_baca17066e7a := COALESCE((SELECT "ID" FROM "${mjSchema}"."Application" WHERE "Name" = '__mj_BizAppsOrders' ORDER BY CASE WHEN "ID" = p_ApplicationID_baca17066e7a THEN 0 ELSE 1 END LIMIT 1), p_ApplicationID_baca17066e7a);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ApplicationSetting"
                 WHERE "ID" = p_ID_baca17066e7a
                    OR ("ApplicationID" = p_ApplicationID_baca17066e7a AND "Name" = p_Name_baca17066e7a)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateApplicationSetting'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_data := jsonb_build_object(
    'ID', p_ID_baca17066e7a,
    'ApplicationID', p_ApplicationID_baca17066e7a,
    'Name', p_Name_baca17066e7a,
    'Value', p_Value_baca17066e7a,
    'Comments', p_Comments_baca17066e7a
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateApplicationSetting"(p_ID := p_ID_baca17066e7a, p_ApplicationID := p_ApplicationID_baca17066e7a, p_Name := p_Name_baca17066e7a, p_Value := p_Value_baca17066e7a, p_Comments := p_Comments_baca17066e7a);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Action Filters (core SP call only)
DO $mj$
DECLARE
  p_ID_00cb04786387 UUID;
  p_UserDescription_00cb04786387 TEXT;
  p_UserComments_00cb04786387 TEXT;
  p_Code_00cb04786387 TEXT;
  p_CodeExplanation_00cb04786387 TEXT;
BEGIN
  p_ID_00cb04786387 := '4A91F2E3-8C47-4D62-9B15-7E2A3C4D5F60';
  p_UserDescription_00cb04786387 := 'MJ_BizApps_Orders: Order Status Changed To Confirmed. True when the save transitions OrderHeader.Status to Confirmed.';
  p_Code_00cb04786387 := 'return ActionFilterContext.DidFieldChangeToValue(''Status'', ''Confirmed'');';
  p_CodeExplanation_00cb04786387 := 'Evaluates to true only on the save where OrderHeader.Status changes to ''Confirmed'', preventing subsequent saves on an already-confirmed order from re-triggering the bound Entity Action.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionFilter"
                 WHERE "ID" = p_ID_00cb04786387
                    OR ("UserDescription" = p_UserDescription_00cb04786387)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateActionFilter'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateActionFilter"(p_data := jsonb_build_object(
    'ID', p_ID_00cb04786387,
    'UserDescription', p_UserDescription_00cb04786387,
    'UserComments', p_UserComments_00cb04786387,
    'Code', p_Code_00cb04786387,
    'CodeExplanation', p_CodeExplanation_00cb04786387
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateActionFilter"(p_ID := p_ID_00cb04786387, p_UserDescription := p_UserDescription_00cb04786387, p_UserComments := p_UserComments_00cb04786387, p_UserComments_Clear := TRUE, p_Code := p_Code_00cb04786387, p_CodeExplanation := p_CodeExplanation_00cb04786387);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Action Filters (core SP call only)
DO $mj$
DECLARE
  p_ID_e3a519eb36d8 UUID;
  p_EntityActionID_e3a519eb36d8 UUID;
  p_ActionFilterID_e3a519eb36d8 UUID;
  p_Sequence_e3a519eb36d8 INTEGER;
  p_Status_e3a519eb36d8 VARCHAR(20);
BEGIN
  p_ID_e3a519eb36d8 := '7B4E2D18-5F39-4A81-8C62-9D1E4F7A2B30';
  p_EntityActionID_e3a519eb36d8 := '90365AD6-79C4-44EB-A474-AF2C96AC2D9F';
  p_ActionFilterID_e3a519eb36d8 := '4A91F2E3-8C47-4D62-9B15-7E2A3C4D5F60';
  p_Sequence_e3a519eb36d8 := 1;
  p_Status_e3a519eb36d8 := 'Active';
  -- The Order Confirmed -> Send Document binding (shipped in an earlier seed), its ID first, then by
  -- entity and action; the filter, its ID first, then by its description.
  p_EntityActionID_e3a519eb36d8 := COALESCE((SELECT ea."ID" FROM "${mjSchema}"."EntityAction" ea
      JOIN "${mjSchema}"."Entity" e ON e."ID" = ea."EntityID" JOIN "${mjSchema}"."Action" a ON a."ID" = ea."ActionID"
      WHERE ea."ID" = p_EntityActionID_e3a519eb36d8 OR (e."Name" = 'MJ_BizApps_Orders: Order Headers' AND a."Name" = 'Send Document')
      ORDER BY CASE WHEN ea."ID" = p_EntityActionID_e3a519eb36d8 THEN 0 ELSE 1 END LIMIT 1), p_EntityActionID_e3a519eb36d8);
  p_ActionFilterID_e3a519eb36d8 := COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionFilter"
      WHERE "ID" = p_ActionFilterID_e3a519eb36d8 OR "UserDescription" = 'MJ_BizApps_Orders: Order Status Changed To Confirmed. True when the save transitions OrderHeader.Status to Confirmed.'
      ORDER BY CASE WHEN "ID" = p_ActionFilterID_e3a519eb36d8 THEN 0 ELSE 1 END LIMIT 1), p_ActionFilterID_e3a519eb36d8);
  IF EXISTS (SELECT 1 FROM "${mjSchema}"."EntityAction" WHERE "ID" = p_EntityActionID_e3a519eb36d8)
     AND EXISTS (SELECT 1 FROM "${mjSchema}"."ActionFilter" WHERE "ID" = p_ActionFilterID_e3a519eb36d8)
     AND NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityActionFilter"
                 WHERE "ID" = p_ID_e3a519eb36d8
                    OR ("EntityActionID" = p_EntityActionID_e3a519eb36d8 AND "ActionFilterID" = p_ActionFilterID_e3a519eb36d8)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityActionFilter'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityActionFilter"(p_data := jsonb_build_object(
    'ID', p_ID_e3a519eb36d8,
    'EntityActionID', p_EntityActionID_e3a519eb36d8,
    'ActionFilterID', p_ActionFilterID_e3a519eb36d8,
    'Sequence', p_Sequence_e3a519eb36d8,
    'Status', p_Status_e3a519eb36d8
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityActionFilter"(p_ID := p_ID_e3a519eb36d8, p_EntityActionID := p_EntityActionID_e3a519eb36d8, p_ActionFilterID := p_ActionFilterID_e3a519eb36d8, p_Sequence := p_Sequence_e3a519eb36d8, p_Status := p_Status_e3a519eb36d8);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_8720a51372df UUID;
  p_Name_8720a51372df VARCHAR(50);
  p_Description_8720a51372df TEXT;
  p_DirectoryID_8720a51372df VARCHAR(250);
  p_SQLName_8720a51372df VARCHAR(250);
BEGIN
  p_ID_8720a51372df := '8A71E3E2-41B9-4D7E-9A55-71B983B8E011';
  p_Name_8720a51372df := 'Senior Finance (AR)';
  p_Description_8720a51372df := 'Accounts receivable lead who may request and review payment-gated access overrides in BizApps Orders.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Role"
                 WHERE "ID" = p_ID_8720a51372df
                    OR ("Name" = p_Name_8720a51372df)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRole"(p_data := jsonb_build_object(
    'ID', p_ID_8720a51372df,
    'Name', p_Name_8720a51372df,
    'Description', p_Description_8720a51372df,
    'DirectoryID', p_DirectoryID_8720a51372df,
    'SQLName', p_SQLName_8720a51372df
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRole"(p_ID := p_ID_8720a51372df, p_Name := p_Name_8720a51372df, p_Description := p_Description_8720a51372df, p_DirectoryID := p_DirectoryID_8720a51372df, p_DirectoryID_Clear := TRUE, p_SQLName := p_SQLName_8720a51372df, p_SQLName_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_75bfd69b3319 UUID;
  p_Name_75bfd69b3319 VARCHAR(50);
  p_Description_75bfd69b3319 TEXT;
  p_DirectoryID_75bfd69b3319 VARCHAR(250);
  p_SQLName_75bfd69b3319 VARCHAR(250);
BEGIN
  p_ID_75bfd69b3319 := '8A71E3E2-41B9-4D7E-9A55-71B983B8E012';
  p_Name_75bfd69b3319 := 'CFO';
  p_Description_75bfd69b3319 := 'Company financial approver who decides payment-gated access overrides and self-approval escalations in BizApps Orders.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Role"
                 WHERE "ID" = p_ID_75bfd69b3319
                    OR ("Name" = p_Name_75bfd69b3319)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRole"(p_data := jsonb_build_object(
    'ID', p_ID_75bfd69b3319,
    'Name', p_Name_75bfd69b3319,
    'Description', p_Description_75bfd69b3319,
    'DirectoryID', p_DirectoryID_75bfd69b3319,
    'SQLName', p_SQLName_75bfd69b3319
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRole"(p_ID := p_ID_75bfd69b3319, p_Name := p_Name_75bfd69b3319, p_Description := p_Description_75bfd69b3319, p_DirectoryID := p_DirectoryID_75bfd69b3319, p_DirectoryID_Clear := TRUE, p_SQLName := p_SQLName_75bfd69b3319, p_SQLName_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_adbdd062f38a UUID;
  p_Name_adbdd062f38a VARCHAR(50);
  p_Description_adbdd062f38a TEXT;
  p_DirectoryID_adbdd062f38a VARCHAR(250);
  p_SQLName_adbdd062f38a VARCHAR(250);
BEGIN
  p_ID_adbdd062f38a := '8A71E3E2-41B9-4D7E-9A55-71B983B8E013';
  p_Name_adbdd062f38a := 'CEO Approver';
  p_Description_adbdd062f38a := 'Executive approver for fallback payment-gated access override decisions and top-tier concession escalations in BizApps Orders.';
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Role"
                 WHERE "ID" = p_ID_adbdd062f38a
                    OR ("Name" = p_Name_adbdd062f38a)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateRole"(p_data := jsonb_build_object(
    'ID', p_ID_adbdd062f38a,
    'Name', p_Name_adbdd062f38a,
    'Description', p_Description_adbdd062f38a,
    'DirectoryID', p_DirectoryID_adbdd062f38a,
    'SQLName', p_SQLName_adbdd062f38a
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateRole"(p_ID := p_ID_adbdd062f38a, p_Name := p_Name_adbdd062f38a, p_Description := p_Description_adbdd062f38a, p_DirectoryID := p_DirectoryID_adbdd062f38a, p_DirectoryID_Clear := TRUE, p_SQLName := p_SQLName_adbdd062f38a, p_SQLName_Clear := TRUE);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Permissions (core SP call only)
DO $mj$
DECLARE
  p_ID_123093031d62 UUID;
  p_EntityID_123093031d62 UUID;
  p_RoleID_123093031d62 UUID;
  p_CanCreate_123093031d62 BOOLEAN;
  p_CanRead_123093031d62 BOOLEAN;
  p_CanUpdate_123093031d62 BOOLEAN;
  p_CanDelete_123093031d62 BOOLEAN;
  p_ReadRLSFilterID_123093031d62 UUID;
  p_CreateRLSFilterID_123093031d62 UUID;
  p_UpdateRLSFilterID_123093031d62 UUID;
  p_DeleteRLSFilterID_123093031d62 UUID;
  p_Type_123093031d62 VARCHAR(10);
BEGIN
  p_ID_123093031d62 := 'A4098F01-3B5C-489E-9A41-19A0880E0001';
  p_EntityID_123093031d62 := 'FCD8DC48-D198-430C-A684-67F3A36A96A7';
  p_RoleID_123093031d62 := '1318256E-6FE4-4349-82D6-FED8724E7103';
  p_CanCreate_123093031d62 := TRUE;
  p_CanRead_123093031d62 := TRUE;
  p_CanUpdate_123093031d62 := TRUE;
  p_CanDelete_123093031d62 := FALSE;
  p_Type_123093031d62 := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_EntityID_123093031d62 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Entitlement Access Overrides' ORDER BY CASE WHEN "ID" = p_EntityID_123093031d62 THEN 0 ELSE 1 END LIMIT 1), p_EntityID_123093031d62);
  p_RoleID_123093031d62 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Account Director' ORDER BY CASE WHEN "ID" = p_RoleID_123093031d62 THEN 0 ELSE 1 END LIMIT 1), p_RoleID_123093031d62);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityPermission"
                 WHERE "ID" = p_ID_123093031d62
                    OR ("EntityID" = p_EntityID_123093031d62 AND "RoleID" = p_RoleID_123093031d62)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityPermission'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_data := jsonb_build_object(
    'ID', p_ID_123093031d62,
    'EntityID', p_EntityID_123093031d62,
    'RoleID', p_RoleID_123093031d62,
    'CanCreate', p_CanCreate_123093031d62,
    'CanRead', p_CanRead_123093031d62,
    'CanUpdate', p_CanUpdate_123093031d62,
    'CanDelete', p_CanDelete_123093031d62,
    'ReadRLSFilterID', p_ReadRLSFilterID_123093031d62,
    'CreateRLSFilterID', p_CreateRLSFilterID_123093031d62,
    'UpdateRLSFilterID', p_UpdateRLSFilterID_123093031d62,
    'DeleteRLSFilterID', p_DeleteRLSFilterID_123093031d62,
    'Type', p_Type_123093031d62
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_ID := p_ID_123093031d62, p_EntityID := p_EntityID_123093031d62, p_RoleID := p_RoleID_123093031d62, p_CanCreate := p_CanCreate_123093031d62, p_CanRead := p_CanRead_123093031d62, p_CanUpdate := p_CanUpdate_123093031d62, p_CanDelete := p_CanDelete_123093031d62, p_ReadRLSFilterID := p_ReadRLSFilterID_123093031d62, p_ReadRLSFilterID_Clear := TRUE, p_CreateRLSFilterID := p_CreateRLSFilterID_123093031d62, p_CreateRLSFilterID_Clear := TRUE, p_UpdateRLSFilterID := p_UpdateRLSFilterID_123093031d62, p_UpdateRLSFilterID_Clear := TRUE, p_DeleteRLSFilterID := p_DeleteRLSFilterID_123093031d62, p_DeleteRLSFilterID_Clear := TRUE, p_Type := p_Type_123093031d62);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Permissions (core SP call only)
DO $mj$
DECLARE
  p_ID_caed26f657da UUID;
  p_EntityID_caed26f657da UUID;
  p_RoleID_caed26f657da UUID;
  p_CanCreate_caed26f657da BOOLEAN;
  p_CanRead_caed26f657da BOOLEAN;
  p_CanUpdate_caed26f657da BOOLEAN;
  p_CanDelete_caed26f657da BOOLEAN;
  p_ReadRLSFilterID_caed26f657da UUID;
  p_CreateRLSFilterID_caed26f657da UUID;
  p_UpdateRLSFilterID_caed26f657da UUID;
  p_DeleteRLSFilterID_caed26f657da UUID;
  p_Type_caed26f657da VARCHAR(10);
BEGIN
  p_ID_caed26f657da := 'A4098F01-3B5C-489E-9A41-19A0880E0002';
  p_EntityID_caed26f657da := 'FCD8DC48-D198-430C-A684-67F3A36A96A7';
  p_RoleID_caed26f657da := '76ABD76E-3FCE-474B-84B8-18F5188E2AB9';
  p_CanCreate_caed26f657da := TRUE;
  p_CanRead_caed26f657da := TRUE;
  p_CanUpdate_caed26f657da := TRUE;
  p_CanDelete_caed26f657da := FALSE;
  p_Type_caed26f657da := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_EntityID_caed26f657da := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Entitlement Access Overrides' ORDER BY CASE WHEN "ID" = p_EntityID_caed26f657da THEN 0 ELSE 1 END LIMIT 1), p_EntityID_caed26f657da);
  p_RoleID_caed26f657da := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Finance' ORDER BY CASE WHEN "ID" = p_RoleID_caed26f657da THEN 0 ELSE 1 END LIMIT 1), p_RoleID_caed26f657da);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityPermission"
                 WHERE "ID" = p_ID_caed26f657da
                    OR ("EntityID" = p_EntityID_caed26f657da AND "RoleID" = p_RoleID_caed26f657da)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityPermission'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_data := jsonb_build_object(
    'ID', p_ID_caed26f657da,
    'EntityID', p_EntityID_caed26f657da,
    'RoleID', p_RoleID_caed26f657da,
    'CanCreate', p_CanCreate_caed26f657da,
    'CanRead', p_CanRead_caed26f657da,
    'CanUpdate', p_CanUpdate_caed26f657da,
    'CanDelete', p_CanDelete_caed26f657da,
    'ReadRLSFilterID', p_ReadRLSFilterID_caed26f657da,
    'CreateRLSFilterID', p_CreateRLSFilterID_caed26f657da,
    'UpdateRLSFilterID', p_UpdateRLSFilterID_caed26f657da,
    'DeleteRLSFilterID', p_DeleteRLSFilterID_caed26f657da,
    'Type', p_Type_caed26f657da
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_ID := p_ID_caed26f657da, p_EntityID := p_EntityID_caed26f657da, p_RoleID := p_RoleID_caed26f657da, p_CanCreate := p_CanCreate_caed26f657da, p_CanRead := p_CanRead_caed26f657da, p_CanUpdate := p_CanUpdate_caed26f657da, p_CanDelete := p_CanDelete_caed26f657da, p_ReadRLSFilterID := p_ReadRLSFilterID_caed26f657da, p_ReadRLSFilterID_Clear := TRUE, p_CreateRLSFilterID := p_CreateRLSFilterID_caed26f657da, p_CreateRLSFilterID_Clear := TRUE, p_UpdateRLSFilterID := p_UpdateRLSFilterID_caed26f657da, p_UpdateRLSFilterID_Clear := TRUE, p_DeleteRLSFilterID := p_DeleteRLSFilterID_caed26f657da, p_DeleteRLSFilterID_Clear := TRUE, p_Type := p_Type_caed26f657da);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Permissions (core SP call only)
DO $mj$
DECLARE
  p_ID_4355ca8fa14d UUID;
  p_EntityID_4355ca8fa14d UUID;
  p_RoleID_4355ca8fa14d UUID;
  p_CanCreate_4355ca8fa14d BOOLEAN;
  p_CanRead_4355ca8fa14d BOOLEAN;
  p_CanUpdate_4355ca8fa14d BOOLEAN;
  p_CanDelete_4355ca8fa14d BOOLEAN;
  p_ReadRLSFilterID_4355ca8fa14d UUID;
  p_CreateRLSFilterID_4355ca8fa14d UUID;
  p_UpdateRLSFilterID_4355ca8fa14d UUID;
  p_DeleteRLSFilterID_4355ca8fa14d UUID;
  p_Type_4355ca8fa14d VARCHAR(10);
BEGIN
  p_ID_4355ca8fa14d := 'A4098F01-3B5C-489E-9A41-19A0880E0003';
  p_EntityID_4355ca8fa14d := 'FCD8DC48-D198-430C-A684-67F3A36A96A7';
  p_RoleID_4355ca8fa14d := '8A71E3E2-41B9-4D7E-9A55-71B983B8E011';
  p_CanCreate_4355ca8fa14d := TRUE;
  p_CanRead_4355ca8fa14d := TRUE;
  p_CanUpdate_4355ca8fa14d := TRUE;
  p_CanDelete_4355ca8fa14d := FALSE;
  p_Type_4355ca8fa14d := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_EntityID_4355ca8fa14d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Entitlement Access Overrides' ORDER BY CASE WHEN "ID" = p_EntityID_4355ca8fa14d THEN 0 ELSE 1 END LIMIT 1), p_EntityID_4355ca8fa14d);
  p_RoleID_4355ca8fa14d := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Senior Finance (AR)' ORDER BY CASE WHEN "ID" = p_RoleID_4355ca8fa14d THEN 0 ELSE 1 END LIMIT 1), p_RoleID_4355ca8fa14d);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityPermission"
                 WHERE "ID" = p_ID_4355ca8fa14d
                    OR ("EntityID" = p_EntityID_4355ca8fa14d AND "RoleID" = p_RoleID_4355ca8fa14d)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityPermission'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_data := jsonb_build_object(
    'ID', p_ID_4355ca8fa14d,
    'EntityID', p_EntityID_4355ca8fa14d,
    'RoleID', p_RoleID_4355ca8fa14d,
    'CanCreate', p_CanCreate_4355ca8fa14d,
    'CanRead', p_CanRead_4355ca8fa14d,
    'CanUpdate', p_CanUpdate_4355ca8fa14d,
    'CanDelete', p_CanDelete_4355ca8fa14d,
    'ReadRLSFilterID', p_ReadRLSFilterID_4355ca8fa14d,
    'CreateRLSFilterID', p_CreateRLSFilterID_4355ca8fa14d,
    'UpdateRLSFilterID', p_UpdateRLSFilterID_4355ca8fa14d,
    'DeleteRLSFilterID', p_DeleteRLSFilterID_4355ca8fa14d,
    'Type', p_Type_4355ca8fa14d
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_ID := p_ID_4355ca8fa14d, p_EntityID := p_EntityID_4355ca8fa14d, p_RoleID := p_RoleID_4355ca8fa14d, p_CanCreate := p_CanCreate_4355ca8fa14d, p_CanRead := p_CanRead_4355ca8fa14d, p_CanUpdate := p_CanUpdate_4355ca8fa14d, p_CanDelete := p_CanDelete_4355ca8fa14d, p_ReadRLSFilterID := p_ReadRLSFilterID_4355ca8fa14d, p_ReadRLSFilterID_Clear := TRUE, p_CreateRLSFilterID := p_CreateRLSFilterID_4355ca8fa14d, p_CreateRLSFilterID_Clear := TRUE, p_UpdateRLSFilterID := p_UpdateRLSFilterID_4355ca8fa14d, p_UpdateRLSFilterID_Clear := TRUE, p_DeleteRLSFilterID := p_DeleteRLSFilterID_4355ca8fa14d, p_DeleteRLSFilterID_Clear := TRUE, p_Type := p_Type_4355ca8fa14d);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Permissions (core SP call only)
DO $mj$
DECLARE
  p_ID_2abde766f707 UUID;
  p_EntityID_2abde766f707 UUID;
  p_RoleID_2abde766f707 UUID;
  p_CanCreate_2abde766f707 BOOLEAN;
  p_CanRead_2abde766f707 BOOLEAN;
  p_CanUpdate_2abde766f707 BOOLEAN;
  p_CanDelete_2abde766f707 BOOLEAN;
  p_ReadRLSFilterID_2abde766f707 UUID;
  p_CreateRLSFilterID_2abde766f707 UUID;
  p_UpdateRLSFilterID_2abde766f707 UUID;
  p_DeleteRLSFilterID_2abde766f707 UUID;
  p_Type_2abde766f707 VARCHAR(10);
BEGIN
  p_ID_2abde766f707 := 'A4098F01-3B5C-489E-9A41-19A0880E0004';
  p_EntityID_2abde766f707 := 'FCD8DC48-D198-430C-A684-67F3A36A96A7';
  p_RoleID_2abde766f707 := '8A71E3E2-41B9-4D7E-9A55-71B983B8E012';
  p_CanCreate_2abde766f707 := TRUE;
  p_CanRead_2abde766f707 := TRUE;
  p_CanUpdate_2abde766f707 := TRUE;
  p_CanDelete_2abde766f707 := FALSE;
  p_Type_2abde766f707 := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_EntityID_2abde766f707 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Entitlement Access Overrides' ORDER BY CASE WHEN "ID" = p_EntityID_2abde766f707 THEN 0 ELSE 1 END LIMIT 1), p_EntityID_2abde766f707);
  p_RoleID_2abde766f707 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'CFO' ORDER BY CASE WHEN "ID" = p_RoleID_2abde766f707 THEN 0 ELSE 1 END LIMIT 1), p_RoleID_2abde766f707);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityPermission"
                 WHERE "ID" = p_ID_2abde766f707
                    OR ("EntityID" = p_EntityID_2abde766f707 AND "RoleID" = p_RoleID_2abde766f707)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityPermission'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_data := jsonb_build_object(
    'ID', p_ID_2abde766f707,
    'EntityID', p_EntityID_2abde766f707,
    'RoleID', p_RoleID_2abde766f707,
    'CanCreate', p_CanCreate_2abde766f707,
    'CanRead', p_CanRead_2abde766f707,
    'CanUpdate', p_CanUpdate_2abde766f707,
    'CanDelete', p_CanDelete_2abde766f707,
    'ReadRLSFilterID', p_ReadRLSFilterID_2abde766f707,
    'CreateRLSFilterID', p_CreateRLSFilterID_2abde766f707,
    'UpdateRLSFilterID', p_UpdateRLSFilterID_2abde766f707,
    'DeleteRLSFilterID', p_DeleteRLSFilterID_2abde766f707,
    'Type', p_Type_2abde766f707
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_ID := p_ID_2abde766f707, p_EntityID := p_EntityID_2abde766f707, p_RoleID := p_RoleID_2abde766f707, p_CanCreate := p_CanCreate_2abde766f707, p_CanRead := p_CanRead_2abde766f707, p_CanUpdate := p_CanUpdate_2abde766f707, p_CanDelete := p_CanDelete_2abde766f707, p_ReadRLSFilterID := p_ReadRLSFilterID_2abde766f707, p_ReadRLSFilterID_Clear := TRUE, p_CreateRLSFilterID := p_CreateRLSFilterID_2abde766f707, p_CreateRLSFilterID_Clear := TRUE, p_UpdateRLSFilterID := p_UpdateRLSFilterID_2abde766f707, p_UpdateRLSFilterID_Clear := TRUE, p_DeleteRLSFilterID := p_DeleteRLSFilterID_2abde766f707, p_DeleteRLSFilterID_Clear := TRUE, p_Type := p_Type_2abde766f707);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Entity Permissions (core SP call only)
DO $mj$
DECLARE
  p_ID_a816dec4ebcd UUID;
  p_EntityID_a816dec4ebcd UUID;
  p_RoleID_a816dec4ebcd UUID;
  p_CanCreate_a816dec4ebcd BOOLEAN;
  p_CanRead_a816dec4ebcd BOOLEAN;
  p_CanUpdate_a816dec4ebcd BOOLEAN;
  p_CanDelete_a816dec4ebcd BOOLEAN;
  p_ReadRLSFilterID_a816dec4ebcd UUID;
  p_CreateRLSFilterID_a816dec4ebcd UUID;
  p_UpdateRLSFilterID_a816dec4ebcd UUID;
  p_DeleteRLSFilterID_a816dec4ebcd UUID;
  p_Type_a816dec4ebcd VARCHAR(10);
BEGIN
  p_ID_a816dec4ebcd := 'A4098F01-3B5C-489E-9A41-19A0880E0005';
  p_EntityID_a816dec4ebcd := 'FCD8DC48-D198-430C-A684-67F3A36A96A7';
  p_RoleID_a816dec4ebcd := '8A71E3E2-41B9-4D7E-9A55-71B983B8E013';
  p_CanCreate_a816dec4ebcd := TRUE;
  p_CanRead_a816dec4ebcd := TRUE;
  p_CanUpdate_a816dec4ebcd := TRUE;
  p_CanDelete_a816dec4ebcd := FALSE;
  p_Type_a816dec4ebcd := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_EntityID_a816dec4ebcd := COALESCE((SELECT "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = 'MJ_BizApps_Orders: Entitlement Access Overrides' ORDER BY CASE WHEN "ID" = p_EntityID_a816dec4ebcd THEN 0 ELSE 1 END LIMIT 1), p_EntityID_a816dec4ebcd);
  p_RoleID_a816dec4ebcd := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'CEO Approver' ORDER BY CASE WHEN "ID" = p_RoleID_a816dec4ebcd THEN 0 ELSE 1 END LIMIT 1), p_RoleID_a816dec4ebcd);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityPermission"
                 WHERE "ID" = p_ID_a816dec4ebcd
                    OR ("EntityID" = p_EntityID_a816dec4ebcd AND "RoleID" = p_RoleID_a816dec4ebcd)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateEntityPermission'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_data := jsonb_build_object(
    'ID', p_ID_a816dec4ebcd,
    'EntityID', p_EntityID_a816dec4ebcd,
    'RoleID', p_RoleID_a816dec4ebcd,
    'CanCreate', p_CanCreate_a816dec4ebcd,
    'CanRead', p_CanRead_a816dec4ebcd,
    'CanUpdate', p_CanUpdate_a816dec4ebcd,
    'CanDelete', p_CanDelete_a816dec4ebcd,
    'ReadRLSFilterID', p_ReadRLSFilterID_a816dec4ebcd,
    'CreateRLSFilterID', p_CreateRLSFilterID_a816dec4ebcd,
    'UpdateRLSFilterID', p_UpdateRLSFilterID_a816dec4ebcd,
    'DeleteRLSFilterID', p_DeleteRLSFilterID_a816dec4ebcd,
    'Type', p_Type_a816dec4ebcd
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateEntityPermission"(p_ID := p_ID_a816dec4ebcd, p_EntityID := p_EntityID_a816dec4ebcd, p_RoleID := p_RoleID_a816dec4ebcd, p_CanCreate := p_CanCreate_a816dec4ebcd, p_CanRead := p_CanRead_a816dec4ebcd, p_CanUpdate := p_CanUpdate_a816dec4ebcd, p_CanDelete := p_CanDelete_a816dec4ebcd, p_ReadRLSFilterID := p_ReadRLSFilterID_a816dec4ebcd, p_ReadRLSFilterID_Clear := TRUE, p_CreateRLSFilterID := p_CreateRLSFilterID_a816dec4ebcd, p_CreateRLSFilterID_Clear := TRUE, p_UpdateRLSFilterID := p_UpdateRLSFilterID_a816dec4ebcd, p_UpdateRLSFilterID_Clear := TRUE, p_DeleteRLSFilterID := p_DeleteRLSFilterID_a816dec4ebcd, p_DeleteRLSFilterID_Clear := TRUE, p_Type := p_Type_a816dec4ebcd);
    END IF;
  END IF;
END $mj$;

-- Save MJ: Authorization Roles (core SP call only)
DO $mj$
DECLARE
  p_ID_737404ab1186 UUID;
  p_AuthorizationID_737404ab1186 UUID;
  p_RoleID_737404ab1186 UUID;
  p_Type_737404ab1186 CHAR(10);
BEGIN
  p_ID_737404ab1186 := '1119F4B9-4989-4D22-947C-27C90E4293BE';
  p_AuthorizationID_737404ab1186 := 'AB81C474-1942-40C9-A05F-90E441C7A7F7';
  p_RoleID_737404ab1186 := '8A71E3E2-41B9-4D7E-9A55-71B983B8E011';
  p_Type_737404ab1186 := 'Allow';
  -- Lookups resolve on this database by Name, the pinned ID first.
  p_AuthorizationID_737404ab1186 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Authorization" WHERE "Name" = 'MJ.BizApps.Orders.Access.Override' ORDER BY CASE WHEN "ID" = p_AuthorizationID_737404ab1186 THEN 0 ELSE 1 END LIMIT 1), p_AuthorizationID_737404ab1186);
  p_RoleID_737404ab1186 := COALESCE((SELECT "ID" FROM "${mjSchema}"."Role" WHERE "Name" = 'Senior Finance (AR)' ORDER BY CASE WHEN "ID" = p_RoleID_737404ab1186 THEN 0 ELSE 1 END LIMIT 1), p_RoleID_737404ab1186);
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."AuthorizationRole"
                 WHERE "ID" = p_ID_737404ab1186
                    OR ("AuthorizationID" = p_AuthorizationID_737404ab1186 AND "RoleID" = p_RoleID_737404ab1186)) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = '${mjSchema}' AND p.proname = 'spCreateAuthorizationRole'
         AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
    ) THEN
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_data := jsonb_build_object(
    'ID', p_ID_737404ab1186,
    'AuthorizationID', p_AuthorizationID_737404ab1186,
    'RoleID', p_RoleID_737404ab1186,
    'Type', p_Type_737404ab1186
  ));
    ELSE
      PERFORM "${mjSchema}"."spCreateAuthorizationRole"(p_ID := p_ID_737404ab1186, p_AuthorizationID := p_AuthorizationID_737404ab1186, p_RoleID := p_RoleID_737404ab1186, p_Type := p_Type_737404ab1186);
    END IF;
  END IF;
END $mj$;
